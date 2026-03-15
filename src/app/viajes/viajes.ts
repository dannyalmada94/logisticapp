import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeDatabaseService } from '../services/realtime-db.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-viajes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './viajes.html',
  styleUrl: './viajes.css',
})
export class Viajes implements OnInit, OnDestroy {
  pedidos = signal<Array<{ id: string; data: any }>>([]);
  clientes = signal<Array<{ id: string; data: any }>>([]);
  transportistas = signal<Array<{ id: string; data: any }>>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);
  showEditForm = signal(false);
  editingPedido = signal<{ id: string; data: any } | null>(null);
  selectedTransportistasEdit = signal<Array<{id: string, ctg?: number, toneladasDescargadas?: number, tarifa?: number}>>([]);

  editForm: FormGroup;

  private unsubscribePedidos?: () => void;
  private unsubscribeClientes?: () => void;
  private unsubscribeTransportistas?: () => void;

  ngOnInit() {
    this.unsubscribePedidos = this.db.onValue(
      'pedidos',
      (snapshot: any) => {
        const value = snapshot.val();
        if (!value) {
          this.pedidos.set([]);
          this.loading.set(false);
          return;
        }
        const items = Object.entries(value).map(([id, data]) => ({
          id,
          data,
        }));
        this.pedidos.set(items);
        this.loading.set(false);
      },
      (err: any) => {
        console.error('Error cargando pedidos:', err);
        this.errorMessage.set('Error cargando pedidos.');
        this.loading.set(false);
      },
    );

    this.unsubscribeClientes = this.db.onValue(
      'clientes',
      (snapshot: any) => {
        const value = snapshot.val();
        if (!value) {
          this.clientes.set([]);
          return;
        }
        const items = Object.entries(value).map(([id, data]) => ({
          id,
          data,
        }));
        this.clientes.set(items);
      },
      (err: any) => {
        console.error('Error cargando clientes:', err);
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

  getTransportistasNombres(transportistaIds: any[]): string {
    const ids = transportistaIds.map((t: any) => typeof t === 'string' ? t : t.id);
    const nombres = ids.map(id => {
      const t = this.transportistas().find(tr => tr.id === id);
      return t?.data?.nombreTransporte || 'N/A';
    });
    return nombres.join(', ');
  }

  getPedidosActivos() {
    return this.pedidos().filter(p => !p.data?.finalizado);
  }

  getFinalizadoValue(pedido: { id: string; data: any }): 'NO' | 'SI' {
    return pedido.data?.finalizado ? 'SI' : 'NO';
  }

  private tieneDatosCompletosParaFinalizar(transportista: any): boolean {
    if (typeof transportista !== 'object' || transportista === null) {
      return false;
    }

    const hasCtg = transportista.ctg !== null && transportista.ctg !== undefined && transportista.ctg !== '';
    const hasToneladas =
      transportista.toneladasDescargadas !== null &&
      transportista.toneladasDescargadas !== undefined &&
      transportista.toneladasDescargadas !== '';
    const hasTarifa = transportista.tarifa !== null && transportista.tarifa !== undefined && transportista.tarifa !== '';

    return hasCtg && hasToneladas && hasTarifa;
  }

  async onFinalizadoChange(pedido: { id: string; data: any }, event: Event) {
    const target = event.target as HTMLSelectElement;
    const value = target.value as 'NO' | 'SI';

    if (value === 'NO') {
      target.value = this.getFinalizadoValue(pedido);
      return;
    }

    const transportistas = pedido.data?.transportistaIds || [];
    const datosCompletos =
      transportistas.length > 0 && transportistas.every((t: any) => this.tieneDatosCompletosParaFinalizar(t));

    if (!datosCompletos) {
      this.errorMessage.set('Para finalizar, CTG, Toneladas descargadas y Tarifa no pueden ser nulos.');
      target.value = 'NO';
      return;
    }

    const ok = confirm('¿Confirmas marcar este pedido como Finalizado?');
    if (!ok) {
      target.value = 'NO';
      return;
    }

    try {
      await this.db.update(`pedidos/${pedido.id}`, {
        finalizado: true,
        finalizadoAt: Date.now(),
        updatedAt: Date.now(),
      });
      this.errorMessage.set(null);
    } catch (err) {
      console.error('Error finalizando pedido:', err);
      this.errorMessage.set('No se pudo finalizar el pedido.');
      target.value = 'NO';
    }
  }

  // No longer used: tarifa is shown directly from pedido.data.tarifa in the template.
  getTarifas(_: any[]): string {
    return 'N/A';
  }

  constructor(private readonly db: RealtimeDatabaseService, private fb: FormBuilder) {
    this.editForm = this.fb.group({
      clienteId: ['', Validators.required],
      origen: ['', Validators.required],
      destino: ['', Validators.required],
    });
  }

  formatDate(timestamp: number): string {
    return timestamp ? new Date(timestamp).toLocaleDateString() : 'N/A';
  }

  startEdit(pedido: { id: string; data: any }) {
    this.editingPedido.set(pedido);
    this.editForm.patchValue({
      clienteId: pedido.data.clienteId,
      origen: pedido.data.origen,
      destino: pedido.data.destino,
    });
    // Handle both old format (array of strings) and new format (array of objects)
    const transportistas = pedido.data.transportistaIds || [];
    const defaultTarifa = pedido.data?.tarifa;
    const selected = transportistas.map((t: any) => 
      typeof t === 'string' ? { id: t, tarifa: defaultTarifa } : { ...t, tarifa: t.tarifa ?? defaultTarifa }
    );
    this.selectedTransportistasEdit.set(selected);
    this.showEditForm.set(true);
  }

  toggleTransportistaEdit(id: string) {
    const current = this.selectedTransportistasEdit();
    const existing = current.find(t => t.id === id);
    if (existing) {
      this.selectedTransportistasEdit.set(current.filter(t => t.id !== id));
    } else {
      this.selectedTransportistasEdit.set([...current, { id }]);
    }
  }

  isSelectedEdit(id: string): boolean {
    return this.selectedTransportistasEdit().some(t => t.id === id);
  }

  getCtgForTransportista(id: string): number | undefined {
    return this.selectedTransportistasEdit().find(t => t.id === id)?.ctg;
  }

  setCtgForTransportista(id: string, event: Event) {
    const target = event.target as HTMLInputElement;
    const ctg = target.value ? parseFloat(target.value) : undefined;
    const current = this.selectedTransportistasEdit();
    const updated = current.map(t => t.id === id ? { ...t, ctg } : t);
    this.selectedTransportistasEdit.set(updated);
  }

  getToneladasForTransportista(id: string): number | undefined {
    return this.selectedTransportistasEdit().find(t => t.id === id)?.toneladasDescargadas;
  }

  setToneladasForTransportista(id: string, event: Event) {
    const target = event.target as HTMLInputElement;
    const toneladasDescargadas = target.value ? parseFloat(target.value) : undefined;
    const current = this.selectedTransportistasEdit();
    const updated = current.map(t => t.id === id ? { ...t, toneladasDescargadas } : t);
    this.selectedTransportistasEdit.set(updated);
  }

  getTarifaForTransportista(id: string): number | undefined {
    return this.selectedTransportistasEdit().find(t => t.id === id)?.tarifa;
  }

  setTarifaForTransportista(id: string, event: Event) {
    const target = event.target as HTMLInputElement;
    const tarifa = target.value ? parseFloat(target.value) : undefined;
    const current = this.selectedTransportistasEdit();
    const updated = current.map(t => t.id === id ? { ...t, tarifa } : t);
    this.selectedTransportistasEdit.set(updated);
  }

  async saveEdit() {
    if (this.editForm.invalid || this.selectedTransportistasEdit().length === 0) {
      this.errorMessage.set('Selecciona al menos 1 transportista.');
      return;
    }

    const pedido = this.editingPedido();
    if (!pedido) return;

    const formValue = this.editForm.value;
    try {
      await this.db.update(`pedidos/${pedido.id}`, {
        clienteId: formValue.clienteId,
        origen: formValue.origen,
        destino: formValue.destino,
        transportistaIds: this.selectedTransportistasEdit(),
        updatedAt: Date.now(),
      });
      this.errorMessage.set(null);
      this.showEditForm.set(false);
      this.editingPedido.set(null);
      this.selectedTransportistasEdit.set([]);
    } catch (err) {
      console.error('Error editando pedido:', err);
      this.errorMessage.set('No se pudo editar el pedido.');
    }
  }

  cancelEdit() {
    this.showEditForm.set(false);
    this.editingPedido.set(null);
    this.selectedTransportistasEdit.set([]);
  }

  async remove(pedido: { id: string; data: any }) {
    const ok = confirm(`¿Eliminar pedido de ${this.getClienteNombre(pedido.data.clienteId)}?`);
    if (!ok) return;

    try {
      await this.db.remove(`pedidos/${pedido.id}`);
      this.errorMessage.set(null);
    } catch (err) {
      console.error('Error eliminando pedido:', err);
      this.errorMessage.set('No se pudo eliminar el pedido.');
    }
  }
}
