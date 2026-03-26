import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeDatabaseService } from '../services/realtime-db.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './pedidos.html',
  styleUrl: './pedidos.css',
})
export class Pedidos implements OnInit, OnDestroy {
  private readonly ubicacionesPorRubro: Record<string, { origen: string[]; destino: string[] }> = {
    agro: {
      origen: ['campo', 'planta', 'acondicionadora'],
      destino: ['planta', 'consumo', 'feedlot', 'forrajera', 'puerto'],
    },
    productos: {
      origen: ['puerto', 'planta', 'campo', 'fabrica'],
      destino: ['campo', 'planta', 'puerto', 'fabrica', 'feedlot', 'forrajera'],
    },
    aridos: {
      origen: ['cantera', 'corralon', 'planta', 'fabrica'],
      destino: ['planta', 'obra', 'puerto', 'corralon'],
    },
  };

  clientes = signal<Array<{ id: string; data: any }>>([]);
  transportistas = signal<Array<{ id: string; data: any }>>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);
  pedidosCount = signal(0);

  pedidoForm: FormGroup;
  selectedTransportistas = signal<string[]>([]);
  searchTerm = signal('');
  currentPage = signal(1);
  itemsPerPage = 6;
  showConfirmModal = signal(false);
  descripcionPedido = signal('');
  descripcionError = signal<string | null>(null);

  get filteredTransportistas() {
    const term = this.searchTerm().toLowerCase();
    return this.transportistas()
      .filter(t =>
        t.data?.nombreTransporte?.toLowerCase().includes(term) ||
        t.data?.nombreChofer?.toLowerCase().includes(term) ||
        t.data?.patenteChasis?.toLowerCase().includes(term) ||
        t.data?.patenteAcoplado?.toLowerCase().includes(term)
      );
  }

  get paginatedTransportistas() {
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return this.filteredTransportistas.slice(start, start + this.itemsPerPage);
  }

  get totalPages() {
    return Math.ceil(this.filteredTransportistas.length / this.itemsPerPage);
  }

  get pageNumbers() {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  private unsubscribeClientes?: () => void;
  private unsubscribeTransportistas?: () => void;
  private unsubscribePedidos?: () => void;

  constructor(private readonly db: RealtimeDatabaseService, private fb: FormBuilder) {
    this.pedidoForm = this.fb.group({
      clienteId: ['', Validators.required],
      rubro: ['', Validators.required],
      producto: ['', Validators.required],
      origen: ['', Validators.required],
      destino: ['', Validators.required],
      tarifa: [0, [Validators.required, Validators.min(0)]],
    });
  }

  get clienteSeleccionado() {
    const clienteId = this.pedidoForm.get('clienteId')?.value;
    return this.clientes().find(c => c.id === clienteId) ?? null;
  }

  get rubrosDelClienteSeleccionado() {
    const cliente = this.clienteSeleccionado;
    if (!cliente) {
      return [] as string[];
    }

    const rubros = Array.isArray(cliente.data?.rubros)
      ? cliente.data.rubros
      : (typeof cliente.data?.rubro === 'string' ? [cliente.data.rubro] : []);

    return rubros.map((r: unknown) => String(r));
  }

  get productosDelRubroSeleccionado() {
    const cliente = this.clienteSeleccionado;
    const rubro = this.pedidoForm.get('rubro')?.value as string;

    if (!cliente || !rubro) {
      return [] as string[];
    }

    const byRubro = cliente.data?.subcategoriasByRubro;
    if (byRubro && typeof byRubro === 'object' && Array.isArray(byRubro[rubro])) {
      return byRubro[rubro].map((s: unknown) => String(s));
    }

    if (Array.isArray(cliente.data?.subcategorias)) {
      const rubros = this.rubrosDelClienteSeleccionado;
      if (rubros.length === 1 && rubros[0] === rubro) {
        return cliente.data.subcategorias.map((s: unknown) => String(s));
      }
    }

    return [] as string[];
  }

  private normalizeRubroKey(rubro: string): string {
    const normalized = rubro
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    if (normalized === 'agricola' || normalized === 'agro' || normalized === 'agropecuario') {
      return 'agro';
    }

    if (normalized === 'aridos' || normalized === 'arido') {
      return 'aridos';
    }

    if (normalized === 'producto' || normalized === 'productos') {
      return 'productos';
    }

    return normalized;
  }

  get origenesDelRubroSeleccionado() {
    const rubro = this.pedidoForm.get('rubro')?.value as string;
    if (!rubro) {
      return [] as string[];
    }
    const key = this.normalizeRubroKey(rubro);
    return this.ubicacionesPorRubro[key]?.origen ?? [];
  }

  get destinosDelRubroSeleccionado() {
    const rubro = this.pedidoForm.get('rubro')?.value as string;
    if (!rubro) {
      return [] as string[];
    }
    const key = this.normalizeRubroKey(rubro);
    return this.ubicacionesPorRubro[key]?.destino ?? [];
  }

  ngOnInit() {
    this.unsubscribeClientes = this.db.onValue(
      'clientes',
      (snapshot: any) => {
        const value = snapshot.val();
        if (!value) {
          this.clientes.set([]);
          this.loading.set(false);
          return;
        }
        const items = Object.entries(value).map(([id, data]) => ({
          id,
          data,
        }));
        this.clientes.set(items);
        this.loading.set(false);
      },
      (err: any) => {
        console.error('Error cargando clientes:', err);
        this.errorMessage.set('Error cargando clientes.');
        this.loading.set(false);
      },
    );

    this.unsubscribeTransportistas = this.db.onValue(
      'transportistas',
      (snapshot: any) => {
        const value = snapshot.val();
        if (!value) {
          this.transportistas.set([]);
          return;
        }
        const items = Object.entries(value).map(([id, data]) => ({
          id,
          data,
        }));
        this.transportistas.set(items);
      },
      (err: any) => {
        console.error('Error cargando transportistas:', err);
        this.errorMessage.set('Error cargando transportistas.');
      },
    );

    this.unsubscribePedidos = this.db.onValue(
      'pedidos',
      (snapshot: any) => {
        const value = snapshot.val();
        const count = value ? Object.keys(value).length : 0;
        this.pedidosCount.set(count);
      },
      (err: any) => {
        console.error('Error cargando pedidos:', err);
      },
    );
  }

  ngOnDestroy() {
    this.unsubscribeClientes?.();
    this.unsubscribeTransportistas?.();
    this.unsubscribePedidos?.();
  }

  onSearchChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchTerm.set(target.value);
    this.currentPage.set(1);
  }

  changePage(page: number) {
    if (page < 1 || page > this.totalPages) {
      return;
    }
    this.currentPage.set(page);
  }

  onClienteChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.pedidoForm.patchValue({
      clienteId: target.value,
      rubro: '',
      producto: '',
      origen: '',
      destino: '',
    });
  }

  onRubroChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.pedidoForm.patchValue({
      rubro: target.value,
      producto: '',
      origen: '',
      destino: '',
    });
  }

  toggleTransportista(id: string) {
    const current = this.selectedTransportistas();
    if (current.includes(id)) {
      this.selectedTransportistas.set(current.filter(t => t !== id));
    } else {
      this.selectedTransportistas.set([...current, id]);
    }
  }

  isSelected(id: string): boolean {
    return this.selectedTransportistas().includes(id);
  }

  onDescripcionChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.descripcionPedido.set(target.value);
    this.descripcionError.set(null);
  }

  abrirModalConfirmacion() {
    if (this.pedidoForm.invalid || this.selectedTransportistas().length === 0) {
      this.errorMessage.set('Selecciona un cliente y al menos 1 transportista.');
      this.pedidoForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.descripcionError.set(null);
    this.showConfirmModal.set(true);
  }

  cerrarModalConfirmacion() {
    this.showConfirmModal.set(false);
    this.descripcionError.set(null);
  }

  generarPDF(clienteId: string, transportistaIds: string[], rubro: string, producto: string, origen: string, destino: string, tarifa: number, descripcion: string) {
    const cliente = this.clientes().find(c => c.id === clienteId);
    const transportistasSeleccionados = this.transportistas().filter(t => transportistaIds.includes(t.id));
    const fecha = new Date().toLocaleDateString();

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;

    const logoWidth = 55;
    const logoHeight = 55;
    const logoX = (pageWidth - logoWidth) / 2;
    const logoY = 5;
    const footerReserve = 30;
    const descripcionY = 69;
    const descripcionTexto = `${(descripcion || 'N/A').toUpperCase()}`;
    const descripcionLineas = doc.splitTextToSize(descripcionTexto, pageWidth - marginX * 2);
    const columnsStartY = descripcionY + descripcionLineas.length * 5 + 5;
    const labelsY = columnsStartY;
    const valuesY = labelsY + 7;
    const tableStartY = valuesY + 8;

    const columns = [
      { label: 'Cliente', value: cliente?.data?.nombre || 'N/A' },
      { label: 'Fecha', value: fecha },
      { label: 'Tarifa', value: `$${tarifa}` },
      { label: 'Rubro', value: rubro || 'N/A' },
      { label: 'Producto', value: producto || 'N/A' },
      { label: 'Origen', value: origen || 'N/A' },
      { label: 'Destino', value: destino || 'N/A' },
    ];

    // Dibuja encabezado (logo + datos del pedido) y footer en la página actual
    const drawPageContent = () => {
      try {
        doc.addImage('/LogoCortoEHP.png', 'PNG', logoX, logoY, logoWidth, logoHeight);
      } catch (e) {
        console.warn('No se pudo cargar el logo');
      }

      const usableWidth = pageWidth - marginX * 2;
      const columnWidth = usableWidth / columns.length;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(descripcionLineas, pageWidth / 2, descripcionY, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      columns.forEach((col, index) => {
        const x = marginX + index * columnWidth + columnWidth / 2;
        doc.text(col.label, x, labelsY, { align: 'center' });
      });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      columns.forEach((col, index) => {
        const x = marginX + index * columnWidth + columnWidth / 2;
        doc.text(String(col.value), x, valuesY, { align: 'center' });
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Muchas gracias por confíar en nosotros', pageWidth / 2, pageHeight - 8, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Gestión comercial: Enzo Pucheta. Tel: 3512341394', pageWidth - 14, pageHeight - 18, { align: 'right' });
      doc.text('Logistica: Constanza Cristante. Tel: 3575417516', pageWidth - 14, pageHeight - 13, { align: 'right' });
    };

    // Tabla de transportistas
    const tableData = transportistasSeleccionados.map(t => [
      t.data?.nombreTransporte || 'N/A',
      t.data?.cuitTransporte || 'N/A',
      t.data?.nombreChofer || 'N/A',
      t.data?.cuitChofer || 'N/A',
      t.data?.patenteChasis || 'N/A',
      t.data?.patenteAcoplado || 'N/A',
      t.data?.tipoCamion || 'N/A',
    ]);

    autoTable(doc, {
      head: [['Nombre Transporte', 'CUIT Transporte', 'Nombre Chofer', 'CUIT Chofer', 'Patente Chasis', 'Patente Acoplado', 'Tipo Camión']],
      body: tableData,
      startY: tableStartY,
      margin: { top: tableStartY, bottom: footerReserve },
      styles: { fontSize: 10 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      didDrawPage: () => {
        drawPageContent();
      },
    });

    doc.save('pedido.pdf');
  }

  async generarPedido() {
    const descripcion = this.descripcionPedido().trim();
    if (!descripcion) {
      this.descripcionError.set('La descripción es obligatoria.');
      return;
    }

    if (descripcion.length > 120) {
      this.descripcionError.set('La descripción admite hasta 120 caracteres.');
      return;
    }

    const formValue = this.pedidoForm.value;
    const selectedTransportistaIds = this.selectedTransportistas();
    const transportistaPayload = selectedTransportistaIds.map(id => ({ id }));

    try {
      await this.db.push('pedidos', {
        numeroPedido: this.pedidosCount() + 1,
        clienteId: formValue.clienteId,
        rubro: formValue.rubro,
        producto: formValue.producto,
        transportistaIds: transportistaPayload,
        origen: formValue.origen,
        destino: formValue.destino,
        tarifa: formValue.tarifa,
        createdAt: Date.now(),
      });
      this.errorMessage.set(null);
      alert('Pedido generado exitosamente.');
      
      // Generar PDF
      this.generarPDF(
        formValue.clienteId,
        selectedTransportistaIds,
        formValue.rubro,
        formValue.producto,
        formValue.origen,
        formValue.destino,
        formValue.tarifa,
        descripcion,
      );
      
      this.pedidoForm.reset();
      this.selectedTransportistas.set([]);
      this.descripcionPedido.set('');
      this.cerrarModalConfirmacion();
    } catch (err) {
      console.error('Error generando pedido:', err);
      this.errorMessage.set('No se pudo generar el pedido.');
    }
  }
}
