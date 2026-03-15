import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeDatabaseService } from '../services/realtime-db.service';

@Component({
  selector: 'app-cobrados',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cobrados.html',
  styleUrl: './cobrados.css',
})
export class Cobrados implements OnInit, OnDestroy {
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
        this.errorMessage.set('Error cargando cobrados.');
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

  getTransportistaNombre(id: string): string {
    const transportista = this.transportistas().find(t => t.id === id);
    return transportista?.data?.nombreTransporte || 'N/A';
  }

  formatFechaAprobacion(timestamp?: number): string {
    if (!timestamp) {
      return 'N/A';
    }
    return new Date(timestamp).toLocaleString();
  }

  async revertirAFacturacion(pedidoId: string, transportistaId: string) {
    const pedido = this.pedidos().find(p => p.id === pedidoId);
    if (!pedido) {
      this.errorMessage.set('No se encontro el pedido para revertir.');
      return;
    }

    const ok = confirm('Confirmas revertir este elemento a Facturacion?');
    if (!ok) {
      return;
    }

    const transportistas = pedido.data?.transportistaIds || [];
    const updatedTransportistas = transportistas.map((t: any) => {
      const id = typeof t === 'string' ? t : t.id;
      if (id !== transportistaId) {
        return t;
      }

      const base = typeof t === 'string' ? { id: t } : { ...t };
      base.cobrado = false;
      base.cobro = 'NO';
      base.pago = 'NO';
      delete base.cobradoValor;
      delete base.fechaAprobacion;
      return base;
    });

    try {
      await this.db.update(`pedidos/${pedidoId}`, {
        transportistaIds: updatedTransportistas,
        updatedAt: Date.now(),
      });
      this.errorMessage.set(null);
    } catch (err) {
      console.error('Error revirtiendo a facturacion:', err);
      this.errorMessage.set('No se pudo revertir el elemento.');
    }
  }

  getCobrados() {
    const rows: Array<any> = [];

    this.pedidos().forEach(pedido => {
      const numeroPedido = pedido.data?.numeroPedido ?? 'N/A';
      const clienteNombre = this.getClienteNombre(pedido.data?.clienteId);
      const transportistas = pedido.data?.transportistaIds || [];
      const pedidoTarifa = Number(pedido.data?.tarifa ?? 0);

      transportistas.forEach((t: any) => {
        if (typeof t !== 'object' || !t.cobrado) {
          return;
        }

        const transportistaId = t.id;
        const tarifa = Number(t.tarifa ?? pedidoTarifa);
        const toneladas = Number(t.toneladasDescargadas ?? 0);
        const valorViaje = tarifa * toneladas;
        const cobrado = Number(t.cobradoValor ?? valorViaje);

        rows.push({
          pedidoId: pedido.id,
          transportistaId,
          numeroPedido,
          clienteNombre,
          transporteNombre: this.getTransportistaNombre(transportistaId),
          ctg: t.ctg ?? 'N/A',
          cobrado,
          fechaAprobacion: t.fechaAprobacion,
        });
      });
    });

    return rows;
  }
}
