import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeDatabaseService } from '../services/realtime-db.service';
import { RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-facturacion',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './facturacion.html',
  styleUrl: './facturacion.css',
})
export class Facturacion implements OnInit, OnDestroy {
  pedidos = signal<Array<{ id: string; data: any }>>([]);
  clientes = signal<Array<{ id: string; data: any }>>([]);
  transportistas = signal<Array<{ id: string; data: any }>>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);
  currentPage = signal(1);
  itemsPerPage = 10;
  pedidosPagoSeleccionados = signal<Set<string>>(new Set());
  modalPedidoPagoOpen = signal(false);
  pedidoPagoModalItems = signal<Array<any>>([]);
  facturaPorItem = signal<Record<string, string>>({});
  modalErrorPedidoPago = signal<string | null>(null);
  generandoPedidoPagoPdf = signal(false);
  private logoDataUrlCache: string | null | undefined = undefined;
  private footerDataUrlCache: string | null | undefined = undefined;

  private unsubscribePedidos?: () => void;
  private unsubscribeClientes?: () => void;
  private unsubscribeTransportistas?: () => void;

  constructor(private readonly db: RealtimeDatabaseService) {}

  ngOnInit() {
    this.unsubscribePedidos = this.db.onValue(
      'pedidos',
      (snapshot: any) => {
        const value = snapshot.val();
        const items = value ? Object.entries(value).map(([id, data]) => ({ id, data })) : [];
        this.pedidos.set(items);
        this.loading.set(false);
      },
      (err: any) => {
        console.error('Error cargando pedidos:', err);
        this.errorMessage.set('Error cargando datos para facturación.');
        this.loading.set(false);
      },
    );

    this.unsubscribeClientes = this.db.onValue(
      'clientes',
      (snapshot: any) => {
        const value = snapshot.val();
        const items = value ? Object.entries(value).map(([id, data]) => ({ id, data })) : [];
        this.clientes.set(items);
      },
      (err: any) => {
        console.error('Error cargando clientes:', err);
        this.errorMessage.set('Error cargando clientes.');
      },
    );

    this.unsubscribeTransportistas = this.db.onValue(
      'transportistas',
      (snapshot: any) => {
        const value = snapshot.val();
        const items = value ? Object.entries(value).map(([id, data]) => ({ id, data })) : [];
        this.transportistas.set(items);
      },
      (err: any) => {
        console.error('Error cargando transportistas:', err);
        this.errorMessage.set('Error cargando transportistas.');
      },
    );
  }

  ngOnDestroy() {
    this.unsubscribePedidos?.();
    this.unsubscribeClientes?.();
    this.unsubscribeTransportistas?.();
  }

  getClienteNombre(clienteId: string): string {
    const cliente = this.clientes().find(c => c.id === clienteId);
    return cliente?.data?.nombre || 'N/A';
  }

  getTransportistaData(id: string) {
    return this.transportistas().find(t => t.id === id)?.data || {};
  }

  private formatFechaCobroInput(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) {
      return digits;
    }
    if (digits.length <= 4) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  onFechaCobroKeydown(event: KeyboardEvent) {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
    ];
    if (allowedKeys.includes(event.key)) {
      return;
    }

    if (!/[0-9/]/.test(event.key)) {
      event.preventDefault();
    }
  }

  onFechaCobroInput(event: Event) {
    const input = event.target as HTMLInputElement;
    input.value = this.formatFechaCobroInput(input.value);
  }

  private isValidFechaCobro(fecha: string): boolean {
    const match = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      return false;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);

    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  async updateFechaCobro(pedidoId: string, transportistaId: string, rawValue: string) {
    const fecha = rawValue.trim();

    if (fecha && !this.isValidFechaCobro(fecha)) {
      this.errorMessage.set('Formato invalido. Usa dd/mm/aaaa.');
      return;
    }

    const pedido = this.pedidos().find(p => p.id === pedidoId);
    if (!pedido) {
      this.errorMessage.set('No se encontro el pedido para actualizar fecha de cobro.');
      return;
    }

    const transportistas = pedido.data?.transportistaIds || [];
    const updatedTransportistas = transportistas.map((t: any) => {
      const currentId = typeof t === 'string' ? t : t.id;
      if (currentId !== transportistaId) {
        return t;
      }

      const base = typeof t === 'string' ? { id: t } : { ...t };
      if (!fecha) {
        delete base.fechaCobro;
        return base;
      }

      return { ...base, fechaCobro: fecha };
    });

    try {
      await this.db.update(`pedidos/${pedidoId}`, {
        transportistaIds: updatedTransportistas,
        updatedAt: Date.now(),
      });
      this.errorMessage.set(null);
    } catch (err) {
      console.error('Error actualizando fecha de cobro:', err);
      this.errorMessage.set('No se pudo guardar la fecha de cobro.');
    }
  }

  async updateEstadoCobroPago(
    pedidoId: string,
    transportistaId: string,
    field: 'cobro' | 'pago',
    value: 'NO' | 'SI',
    pendienteCobrar: number,
  ) {
    const pedido = this.pedidos().find(p => p.id === pedidoId);
    if (!pedido) {
      this.errorMessage.set('No se encontro el pedido para actualizar estado.');
      return;
    }

    const transportistas = pedido.data?.transportistaIds || [];
    const updatedTransportistas = transportistas.map((t: any) => {
      const currentId = typeof t === 'string' ? t : t.id;
      if (currentId !== transportistaId) {
        return t;
      }

      const base = typeof t === 'string' ? { id: t } : { ...t };
      const updated = { ...base, [field]: value } as any;
      const cobro = (updated.cobro ?? 'NO') as 'NO' | 'SI';
      const pago = (updated.pago ?? 'NO') as 'NO' | 'SI';

      if (cobro === 'SI' && pago === 'SI') {
        const ok = confirm('Cobro y Pago estan en SI. Confirmas mover este elemento a Cobrados?');
        if (ok) {
          updated.cobrado = true;
          updated.cobradoValor = Number(pendienteCobrar || 0);
          updated.fechaAprobacion = Date.now();
        } else {
          updated[field] = 'NO';
        }
      }

      if (updated.cobro !== 'SI' || updated.pago !== 'SI') {
        updated.cobrado = false;
        delete updated.cobradoValor;
        delete updated.fechaAprobacion;
      }

      return updated;
    });

    try {
      await this.db.update(`pedidos/${pedidoId}`, {
        transportistaIds: updatedTransportistas,
        updatedAt: Date.now(),
      });

      if (field === 'cobro' && value !== 'SI') {
        this.removePedidoPagoSeleccion(pedidoId, transportistaId);
      }

      this.errorMessage.set(null);
    } catch (err) {
      console.error('Error actualizando cobro/pago:', err);
      this.errorMessage.set('No se pudo guardar el estado de cobro/pago.');
    }
  }

  async revertirAViajes(pedidoId: string, transportistaId: string) {
    const pedido = this.pedidos().find(p => p.id === pedidoId);
    if (!pedido) {
      this.errorMessage.set('No se encontro el pedido para revertir.');
      return;
    }

    const ok = confirm('Confirmas revertir este elemento a Viajes?');
    if (!ok) {
      return;
    }

    const transportistas = pedido.data?.transportistaIds || [];
    const updatedTransportistas = transportistas.map((t: any) => {
      const currentId = typeof t === 'string' ? t : t.id;
      if (currentId !== transportistaId) {
        return t;
      }

      const base = typeof t === 'string' ? { id: t } : { ...t };
      base.cobro = 'NO';
      base.pago = 'NO';
      base.cobrado = false;
      delete base.cobradoValor;
      delete base.fechaAprobacion;
      return base;
    });

    try {
      await this.db.update(`pedidos/${pedidoId}`, {
        finalizado: false,
        finalizadoAt: null,
        transportistaIds: updatedTransportistas,
        updatedAt: Date.now(),
      });
      this.removePedidoPagoSeleccion(pedidoId, transportistaId);
      this.errorMessage.set(null);
    } catch (err) {
      console.error('Error revirtiendo a viajes:', err);
      this.errorMessage.set('No se pudo revertir el elemento a Viajes.');
    }
  }

  getFacturas() {
    const pedidos = this.pedidos();
    const facturas: Array<any> = [];

    pedidos.forEach(pedido => {
      if (!pedido.data?.finalizado) {
        return;
      }

      const clienteNombre = this.getClienteNombre(pedido.data?.clienteId);
      const numeroPedido = pedido.data?.numeroPedido ?? 'N/A';
      const transportistas = pedido.data?.transportistaIds || [];

      transportistas.forEach((t: any) => {
        const transportistaId = typeof t === 'string' ? t : t.id;
        const cobrado = typeof t === 'object' ? Boolean(t.cobrado) : false;
        if (cobrado) {
          return;
        }

        const transportistaData = this.getTransportistaData(transportistaId);
        const ctg = typeof t === 'object' ? t.ctg : undefined;
        const toneladas = typeof t === 'object' ? t.toneladasDescargadas : undefined;
        const tarifa = Number(typeof t === 'object' ? (t.tarifa ?? pedido.data?.tarifa ?? 0) : (pedido.data?.tarifa ?? 0));
        const comision = Number(transportistaData?.comision ?? 0);
        const toneladasNum = Number(toneladas ?? 0);
        const valorViaje = tarifa && toneladasNum ? tarifa * toneladasNum : 0;
        const pendiente = valorViaje && comision ? valorViaje * (comision / 100) : 0;

        facturas.push({
          pedidoId: pedido.id,
          transportistaId,
          numeroPedido,
          clienteNombre,
          rubro: pedido.data?.rubro ?? 'N/A',
          producto: pedido.data?.producto ?? 'N/A',
          transporteNombre: transportistaData?.nombreTransporte || 'N/A',
          ctg: ctg ?? 'N/A',
          toneladas: toneladas ?? 'N/A',
          tarifa: tarifa || 0,
          valorViaje,
          comision: comision ?? 0,
          pendienteCobrar: pendiente,
          fechaCobro: typeof t === 'object' ? (t.fechaCobro ?? '') : '',
          cobro: typeof t === 'object' ? (t.cobro ?? 'NO') : 'NO',
          pago: typeof t === 'object' ? (t.pago ?? 'NO') : 'NO',
        });
      });
    });

    return facturas;
  }

  get paginatedFacturas() {
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return this.getFacturas().slice(start, start + this.itemsPerPage);
  }

  get totalPages() {
    return Math.ceil(this.getFacturas().length / this.itemsPerPage);
  }

  get pageNumbers() {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  changePage(page: number) {
    if (page < 1 || page > this.totalPages) {
      return;
    }
    this.currentPage.set(page);
  }

  trackByFactura(_: number, factura: any): string {
    return `${factura.pedidoId}-${factura.transportistaId}`;
  }

  trackByFacturaPedidoPago(_: number, item: any): string {
    return `${item.pedidoId}__${item.transportistaId}`;
  }

  private keyPedidoPago(pedidoId: string, transportistaId: string): string {
    return `${pedidoId}__${transportistaId}`;
  }

  private normalizeFacturaInput(value: string): string {
    return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 24);
  }

  private removePedidoPagoSeleccion(pedidoId: string, transportistaId: string) {
    const key = this.keyPedidoPago(pedidoId, transportistaId);
    const current = new Set(this.pedidosPagoSeleccionados());
    if (!current.has(key)) {
      return;
    }
    current.delete(key);
    this.pedidosPagoSeleccionados.set(current);

    const facturaMap = { ...this.facturaPorItem() };
    if (key in facturaMap) {
      delete facturaMap[key];
      this.facturaPorItem.set(facturaMap);
    }
  }

  isPedidoPagoSeleccionado(pedidoId: string, transportistaId: string): boolean {
    return this.pedidosPagoSeleccionados().has(this.keyPedidoPago(pedidoId, transportistaId));
  }

  togglePedidoPago(pedidoId: string, transportistaId: string) {
    const key = this.keyPedidoPago(pedidoId, transportistaId);
    const current = new Set(this.pedidosPagoSeleccionados());

    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }

    this.pedidosPagoSeleccionados.set(current);
  }

  get haySeleccionados(): boolean {
    return this.pedidosPagoSeleccionados().size > 0;
  }

  get facturasSeleccionadasPedidoPago(): Array<any> {
    const selected = this.pedidosPagoSeleccionados();
    return this.getFacturas().filter(f => selected.has(this.keyPedidoPago(f.pedidoId, f.transportistaId)));
  }

  get totalPendienteModalPedidoPago(): number {
    return this.pedidoPagoModalItems().reduce(
      (acc, item) => acc + Number(item.pendienteCobrar || 0),
      0,
    );
  }

  get totalPendienteSeleccionado(): number {
    return this.facturasSeleccionadasPedidoPago.reduce(
      (acc, item) => acc + Number(item.pendienteCobrar || 0),
      0,
    );
  }

  cerrarModalPedidoPago() {
    this.modalPedidoPagoOpen.set(false);
    this.modalErrorPedidoPago.set(null);
  }

  onFacturaPedidoPagoInput(pedidoId: string, transportistaId: string, rawValue: string) {
    const key = this.keyPedidoPago(pedidoId, transportistaId);
    const factura = this.normalizeFacturaInput(rawValue);
    const current = { ...this.facturaPorItem() };
    if (!factura) {
      delete current[key];
    } else {
      current[key] = factura;
    }
    this.facturaPorItem.set(current);
    if (this.modalErrorPedidoPago()) {
      this.modalErrorPedidoPago.set(null);
    }
  }

  getFacturaPedidoPago(pedidoId: string, transportistaId: string): string {
    return this.facturaPorItem()[this.keyPedidoPago(pedidoId, transportistaId)] ?? '';
  }

  generarPedidoPagoPDF() {
    if (!this.haySeleccionados) {
      return;
    }

    const snapshot = this.facturasSeleccionadasPedidoPago.map(item => ({ ...item }));
    if (!snapshot.length) {
      this.modalErrorPedidoPago.set('No se encontraron items seleccionados.');
      return;
    }

    this.pedidoPagoModalItems.set(snapshot);
    this.modalErrorPedidoPago.set(null);
    this.modalPedidoPagoOpen.set(true);
  }

  private async getOptimizedLogoDataUrl(): Promise<string | null> {
    if (this.logoDataUrlCache !== undefined) {
      return this.logoDataUrlCache;
    }

    if (typeof window === 'undefined') {
      this.logoDataUrlCache = null;
      return null;
    }

    const dataUrl = await new Promise<string | null>((resolve) => {
      const image = new Image();
      image.onload = () => {
        try {
          const maxWidth = 420;
          const scale = Math.min(1, maxWidth / image.naturalWidth);
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext('2d');
          if (!context) {
            resolve(null);
            return;
          }

          context.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };

      image.onerror = () => resolve(null);
      image.src = '/MiniLogoEHP.png';
    });

    this.logoDataUrlCache = dataUrl;
    return dataUrl;
  }

  private async getOptimizedFooterDataUrl(): Promise<string | null> {
    if (this.footerDataUrlCache !== undefined) {
      return this.footerDataUrlCache;
    }

    if (typeof window === 'undefined') {
      this.footerDataUrlCache = null;
      return null;
    }

    const dataUrl = await new Promise<string | null>((resolve) => {
      const image = new Image();
      image.onload = () => {
        try {
          const maxWidth = 1200;
          const scale = Math.min(1, maxWidth / image.naturalWidth);
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext('2d');
          if (!context) {
            resolve(null);
            return;
          }

          context.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          resolve(null);
        }
      };

      image.onerror = () => resolve(null);
      image.src = '/FooterpagoEHP.jpg';
    });

    this.footerDataUrlCache = dataUrl;
    return dataUrl;
  }

  async continuarPedidoPagoPDF() {
    const modalItems = this.pedidoPagoModalItems();
    if (!modalItems.length) {
      this.modalErrorPedidoPago.set('No hay datos en el modal para generar el PDF.');
      return;
    }

    const detalles = modalItems.map(item => ({
      ...item,
      facturaNumero: this.getFacturaPedidoPago(item.pedidoId, item.transportistaId),
    }));

    const faltantes = detalles.some(item => !String(item.facturaNumero || '').trim());
    if (faltantes) {
      this.modalErrorPedidoPago.set('Completa la columna FACTURA para todos los items.');
      return;
    }

    const grouped = new Map<string, number>();
    detalles.forEach(item => {
      const factura = String(item.facturaNumero).trim();
      const importe = Number(item.pendienteCobrar || 0);
      grouped.set(factura, (grouped.get(factura) ?? 0) + importe);
    });

    const bodyRows = Array.from(grouped.entries()).map(([factura, importe]) => [
      factura,
      `$${importe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ]);

    const totalPagar = detalles.reduce((acc, item) => acc + Number(item.pendienteCobrar || 0), 0);
    const transportes = Array.from(new Set(detalles.map(item => item.transporteNombre || 'N/A')));
    const transportistaLabel = transportes.join(' | ');

    this.generandoPedidoPagoPdf.set(true);
    this.modalErrorPedidoPago.set(null);

    try {
      const logoDataUrl = await this.getOptimizedLogoDataUrl();
      const footerDataUrl = await this.getOptimizedFooterDataUrl();

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
        putOnlyUsedFonts: true,
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 14;
      const footerHeight = 100;
      const footerY = pageHeight - footerHeight - 6;

      if (logoDataUrl) {
        const logoWidth = 60;
        const logoHeight = 60;
        const logoX = (pageWidth - logoWidth) / 2;
        doc.addImage(logoDataUrl, 'PNG', logoX, 16, logoWidth, logoHeight, 'logo-ehp-facturacion', 'FAST');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('PEDIDO DE PAGO', pageWidth / 2, 84, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Transportista:', marginX, 94);
      doc.setFont('helvetica', 'normal');
      doc.text(transportistaLabel || 'N/A', marginX + 28, 94);

      autoTable(doc, {
        head: [['FACTURAS', 'IMPORTE']],
        body: bodyRows,
        startY: 102,
        margin: { left: marginX, right: marginX, bottom: footerHeight + 16 },
        styles: { fontSize: 10 },
        headStyles: { fillColor: [33, 37, 41], textColor: 255 },
        columnStyles: {
          0: { halign: 'left' },
          1: { halign: 'right' },
        },
      });

      const finalY = (doc as any).lastAutoTable?.finalY ?? 102;
      const totalY = Math.min(footerY - 4, finalY + 10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(
        `TOTAL A PAGAR: $${totalPagar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        pageWidth - marginX,
        totalY,
        { align: 'right' },
      );

      if (footerDataUrl) {
        doc.addImage(
          footerDataUrl,
          'JPEG',
          marginX,
          footerY,
          pageWidth - marginX * 2,
          footerHeight,
          'footer-pago-ehp',
          'FAST',
        );
      }

      const today = new Date();
      const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      doc.save(`pedido-pago-${stamp}.pdf`);
    } catch (err) {
      console.error('Error generando PDF de pedido de pago:', err);
      this.modalErrorPedidoPago.set('No se pudo generar el PDF. Intenta nuevamente.');
      return;
    } finally {
      this.generandoPedidoPagoPdf.set(false);
    }

    this.modalPedidoPagoOpen.set(false);
    this.pedidoPagoModalItems.set([]);
    this.pedidosPagoSeleccionados.set(new Set());
    this.facturaPorItem.set({});
  }
}

