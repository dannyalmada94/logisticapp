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
  clientes = signal<Array<{ id: string; data: any }>>([]);
  transportistas = signal<Array<{ id: string; data: any }>>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);
  pedidosCount = signal(0);

  pedidoForm: FormGroup;
  selectedTransportistas = signal<string[]>([]);
  searchTerm = signal('');

  get filteredTransportistas() {
    const term = this.searchTerm().toLowerCase();
    return this.transportistas()
      .filter(t =>
        t.data?.nombreTransporte?.toLowerCase().includes(term) ||
        t.data?.nombreChofer?.toLowerCase().includes(term) ||
        t.data?.patenteChasis?.toLowerCase().includes(term) ||
        t.data?.patenteAcoplado?.toLowerCase().includes(term)
      )
      .slice(0, 6);
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
  }

  onClienteChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.pedidoForm.patchValue({
      clienteId: target.value,
      rubro: '',
      producto: '',
    });
  }

  onRubroChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.pedidoForm.patchValue({
      rubro: target.value,
      producto: '',
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

  generarPDF(clienteId: string, transportistaIds: string[], rubro: string, producto: string, origen: string, destino: string, tarifa: number) {
    const cliente = this.clientes().find(c => c.id === clienteId);
    const transportistasSeleccionados = this.transportistas().filter(t => transportistaIds.includes(t.id));
    const fecha = new Date().toLocaleDateString();

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;

    // Logo centrado en el encabezado (más grande)
    const logoWidth = 72;
    const logoHeight = 72;
    const logoX = (pageWidth - logoWidth) / 2;
    const logoY = 8;

    try {
      doc.addImage('/LogoGrandeEHP.png', 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch (e) {
      console.warn('No se pudo cargar el logo');
    }

    // Cliente + datos en un renglón de columnas (sin grilla)
    const columns = [
      { label: 'Cliente', value: cliente?.data?.nombre || 'N/A' },
      { label: 'Fecha', value: fecha },
      { label: 'Tarifa', value: `$${tarifa}` },
      { label: 'Rubro', value: rubro || 'N/A' },
      { label: 'Producto', value: producto || 'N/A' },
      { label: 'Origen', value: origen || 'N/A' },
      { label: 'Destino', value: destino || 'N/A' },
    ];

    const columnsStartY = 88;
    const labelsY = columnsStartY;
    const valuesY = columnsStartY + 7;
    const usableWidth = pageWidth - marginX * 2;
    const columnWidth = usableWidth / columns.length;

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
      startY: 102,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    });

    // Footer
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Muchas gracias por confíar en nosotros', pageWidth / 2, pageHeight - 8, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Gestión comercial: Enzo Pucheta. Tel: 3512341394', pageWidth - 14, pageHeight - 18, { align: 'right' });
    doc.text('Logistica: Constanza Cristante. Tel: 3575417516', pageWidth - 14, pageHeight - 13, { align: 'right' });

    doc.save('pedido.pdf');
  }

  async generarPedido() {
    if (this.pedidoForm.invalid || this.selectedTransportistas().length === 0) {
      this.errorMessage.set('Selecciona un cliente y al menos 1 transportista.');
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
      );
      
      this.pedidoForm.reset();
      this.selectedTransportistas.set([]);
    } catch (err) {
      console.error('Error generando pedido:', err);
      this.errorMessage.set('No se pudo generar el pedido.');
    }
  }
}
