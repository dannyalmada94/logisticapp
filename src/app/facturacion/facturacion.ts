import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeDatabaseService } from '../services/realtime-db.service';

@Component({
  selector: 'app-facturacion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './facturacion.html',
  styleUrl: './facturacion.css',
})
export class Facturacion implements OnInit, OnDestroy {
  pedidos = signal<Array<{ id: string; data: any }>>([]);
  clientes = signal<Array<{ id: string; data: any }>>([]);
  transportistas = signal<Array<{ id: string; data: any }>>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);

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

  trackByFactura(_: number, factura: any): string {
    return `${factura.pedidoId}-${factura.transportistaId}`;
  }
}

