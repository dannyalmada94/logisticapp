import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeDatabaseService } from '../services/realtime-db.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
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
    return this.transportistas().filter(t =>
      t.data?.nombreTransporte?.toLowerCase().includes(term) ||
      t.data?.nombreChofer?.toLowerCase().includes(term) ||
      t.data?.patenteChasis?.toLowerCase().includes(term) ||
      t.data?.patenteAcoplado?.toLowerCase().includes(term)
    );
  }

  private unsubscribeClientes?: () => void;
  private unsubscribeTransportistas?: () => void;
  private unsubscribePedidos?: () => void;

  constructor(private readonly db: RealtimeDatabaseService, private fb: FormBuilder) {
    this.pedidoForm = this.fb.group({
      clienteId: ['', Validators.required],
      origen: ['', Validators.required],
      destino: ['', Validators.required],
      tarifa: [0, [Validators.required, Validators.min(0)]],
    });
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

  generarPDF(clienteId: string, transportistaIds: any[], origen: string, destino: string, tarifa: number) {
    const cliente = this.clientes().find(c => c.id === clienteId);
    const ids = transportistaIds.map(t => typeof t === 'string' ? t : t.id);
    const transportistasSeleccionados = this.transportistas().filter(t => ids.includes(t.id));
    const fecha = new Date().toLocaleDateString();

    const doc = new jsPDF('landscape');
    
    // Encabezado
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(`Cliente: ${cliente?.data?.nombre || 'N/A'}`, 20, 30);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${fecha}`, 20, 45);
    doc.text(`Tarifa General: ${tarifa}`, 20, 55);
    doc.text(`Origen: ${origen}`, 20, 65);
    doc.text(`Destino: ${destino}`, 20, 75);
    
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
      startY: 90,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    });

    doc.save('pedido.pdf');
  }

  async generarPedido() {
    if (this.pedidoForm.invalid || this.selectedTransportistas().length === 0) {
      this.errorMessage.set('Selecciona un cliente y al menos 1 transportista.');
      return;
    }

    const formValue = this.pedidoForm.value;
    try {
      await this.db.push('pedidos', {
        numeroPedido: this.pedidosCount() + 1,
        clienteId: formValue.clienteId,
        transportistaIds: this.selectedTransportistas().map(id => ({ id })),
        origen: formValue.origen,
        destino: formValue.destino,
        tarifa: formValue.tarifa,
        createdAt: Date.now(),
      });
      this.errorMessage.set(null);
      alert('Pedido generado exitosamente.');
      
      // Generar PDF
      this.generarPDF(formValue.clienteId, this.selectedTransportistas().map(id => ({ id })), formValue.origen, formValue.destino, formValue.tarifa);
      
      this.pedidoForm.reset();
      this.selectedTransportistas.set([]);
    } catch (err) {
      console.error('Error generando pedido:', err);
      this.errorMessage.set('No se pudo generar el pedido.');
    }
  }
}
