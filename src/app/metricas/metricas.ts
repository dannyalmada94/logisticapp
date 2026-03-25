import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RealtimeDatabaseService } from '../services/realtime-db.service';
import type { Chart } from 'chart.js';

@Component({
  selector: 'app-metricas',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './metricas.html',
  styleUrl: './metricas.css',
})
export class Metricas implements OnInit, OnDestroy {
  clientesCount = signal(0);
  transportistasCount = signal(0);
  pedidosCount = signal(0);
  viajesFinalizadosCount = signal(0);
  montoTotalFacturado = signal(0);
  montoTotalCobrado = signal(0);
  loading = signal(true);
  errorMessage = signal<string | null>(null);
  fechaDesde = signal('');
  fechaHasta = signal('');
  filterError = signal<string | null>(null);
  filtroRapido = signal<'custom' | 'ultimoMes'>('custom');

  private unsubscribeClientes?: () => void;
  private unsubscribeTransportistas?: () => void;
  private unsubscribePedidos?: () => void;

  private clientesLoaded = false;
  private transportistasLoaded = false;
  private pedidosLoaded = false;
  private transportistasById: Record<string, any> = {};
  private latestPedidos: any[] = [];
  private appliedDesdeTs: number | null = null;
  private appliedHastaTs: number | null = null;

  @ViewChild('evolucionChart') evolucionChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('distribucionChart') distribucionChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('facturacionChart') facturacionChartRef?: ElementRef<HTMLCanvasElement>;

  private readonly isBrowser: boolean;
  private chartFactory?: any;
  private evolucionChart?: Chart;
  private distribucionChart?: Chart;
  private facturacionChart?: Chart;

  private chartLabels: string[] = [];
  private evolucionLabels: string[] = [];
  private pedidosEvolucion: number[] = [];
  private finalizadosEvolucion: number[] = [];
  private pedidosPorMes: number[] = [];
  private finalizadosPorMes: number[] = [];
  private facturadoPorMes: number[] = [];
  private cobradoPorMes: number[] = [];
  private distribucionActual: number[] = [0, 0, 0];

  constructor(
    private readonly db: RealtimeDatabaseService,
    @Inject(PLATFORM_ID) platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  async ngAfterViewInit() {
    await this.renderCharts();
  }

  ngOnInit() {
    this.unsubscribeClientes = this.db.onValue(
      'clientes',
      (snapshot: any) => {
        const value = snapshot.val();
        const count = value ? Object.keys(value).length : 0;
        this.clientesCount.set(count);
        this.clientesLoaded = true;
        this.finishLoadingIfReady();
      },
      (err: unknown) => {
        console.error('Error cargando métricas de clientes:', err);
        this.errorMessage.set('No se pudieron cargar las métricas de clientes.');
        this.clientesLoaded = true;
        this.finishLoadingIfReady();
      },
    );

    this.unsubscribeTransportistas = this.db.onValue(
      'transportistas',
      (snapshot: any) => {
        const value = snapshot.val();
        const count = value ? Object.keys(value).length : 0;
        this.transportistasCount.set(count);
        this.transportistasById = (value as Record<string, any>) ?? {};

        if (this.latestPedidos.length) {
          this.refreshDerivedMetrics();
        }

        this.transportistasLoaded = true;
        this.finishLoadingIfReady();
      },
      (err: unknown) => {
        console.error('Error cargando métricas de transportistas:', err);
        this.errorMessage.set('No se pudieron cargar las métricas de transportistas.');
        this.transportistasLoaded = true;
        this.finishLoadingIfReady();
      },
    );

    this.unsubscribePedidos = this.db.onValue(
      'pedidos',
      (snapshot: any) => {
        const value = snapshot.val();
        const pedidos = value ? Object.values(value as Record<string, any>) : [];
        this.latestPedidos = pedidos;
        this.refreshDerivedMetrics();
        this.pedidosLoaded = true;
        this.finishLoadingIfReady();
      },
      (err: unknown) => {
        console.error('Error cargando métricas de pedidos:', err);
        this.errorMessage.set('No se pudieron cargar las métricas de pedidos.');
        this.pedidosLoaded = true;
        this.finishLoadingIfReady();
      },
    );
  }

  private finishLoadingIfReady() {
    if (this.clientesLoaded && this.transportistasLoaded && this.pedidosLoaded) {
      this.loading.set(false);
    }
  }

  formatMoney(value: number): string {
    return value.toLocaleString('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  onFechaFilterKeydown(event: KeyboardEvent) {
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

  onFechaFilterInput(type: 'desde' | 'hasta', event: Event) {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 8);

    let formatted = digits;
    if (digits.length > 2 && digits.length <= 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    }

    input.value = formatted;
    if (type === 'desde') {
      this.fechaDesde.set(formatted);
    } else {
      this.fechaHasta.set(formatted);
    }
  }

  aplicarFiltroFechas() {
    this.filtroRapido.set('custom');
    const desdeTs = this.parseInputDate(this.fechaDesde(), false);
    const hastaTs = this.parseInputDate(this.fechaHasta(), true);

    if (this.fechaDesde() && desdeTs === null) {
      this.filterError.set('Fecha Desde inválida. Usa dd/mm/aaaa.');
      return;
    }

    if (this.fechaHasta() && hastaTs === null) {
      this.filterError.set('Fecha Hasta inválida. Usa dd/mm/aaaa.');
      return;
    }

    if (desdeTs !== null && hastaTs !== null && desdeTs > hastaTs) {
      this.filterError.set('La fecha Desde no puede ser mayor que Hasta.');
      return;
    }

    this.appliedDesdeTs = desdeTs;
    this.appliedHastaTs = hastaTs;
    this.filterError.set(null);
    this.refreshDerivedMetrics();
  }

  limpiarFiltroFechas() {
    this.filtroRapido.set('custom');
    this.fechaDesde.set('');
    this.fechaHasta.set('');
    this.appliedDesdeTs = null;
    this.appliedHastaTs = null;
    this.filterError.set(null);
    this.refreshDerivedMetrics();
  }

  setFiltroRapido(mode: 'custom' | 'ultimoMes') {
    this.filtroRapido.set(mode);
    this.filterError.set(null);

    if (mode === 'ultimoMes') {
      const now = new Date();
      const desde = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      this.appliedDesdeTs = desde.getTime();
      this.appliedHastaTs = hasta.getTime();
      this.fechaDesde.set(this.formatDateForInput(desde));
      this.fechaHasta.set(this.formatDateForInput(hasta));
      this.refreshDerivedMetrics();
    }
  }

  private formatDateForInput(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private parseInputDate(value: string, endOfDay: boolean): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);

    const date = endOfDay
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date.getTime();
  }

  private getFilteredPedidos(source: any[]): any[] {
    if (this.appliedDesdeTs === null && this.appliedHastaTs === null) {
      return source;
    }

    return source.filter((pedido: any) => {
      const createdAt = Number(pedido?.createdAt ?? 0);
      if (!createdAt) {
        return false;
      }

      if (this.appliedDesdeTs !== null && createdAt < this.appliedDesdeTs) {
        return false;
      }

      if (this.appliedHastaTs !== null && createdAt > this.appliedHastaTs) {
        return false;
      }

      return true;
    });
  }

  private refreshDerivedMetrics() {
    const filteredPedidos = this.getFilteredPedidos(this.latestPedidos);
    this.recalculateMetricsFromPedidos(filteredPedidos);
    this.computeChartData(filteredPedidos);
    void this.renderCharts();
  }

  private monthKey(timestamp?: number): string | null {
    if (!timestamp || Number.isNaN(Number(timestamp))) {
      return null;
    }
    const date = new Date(Number(timestamp));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private monthLabelFromKey(key: string): string {
    const [year, month] = key.split('-');
    return `${month}/${year.slice(-2)}`;
  }

  private dayKey(timestamp?: number): string | null {
    if (!timestamp || Number.isNaN(Number(timestamp))) {
      return null;
    }
    const date = new Date(Number(timestamp));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private dayLabelFromKey(key: string): string {
    const [, , day] = key.split('-');
    return day;
  }

  private getPendienteCobrar(pedido: any, transportistaPedido: any): number {
    if (typeof transportistaPedido !== 'object' || transportistaPedido === null) {
      return 0;
    }

    const transportistaId = String(transportistaPedido?.id ?? '');
    const transportistaData = this.transportistasById[transportistaId] ?? {};

    const tarifa = Number(transportistaPedido?.tarifa ?? pedido?.tarifa ?? 0);
    const toneladas = Number(transportistaPedido?.toneladasDescargadas ?? 0);
    const comision = Number(transportistaData?.comision ?? 0);
    const valorViaje = tarifa * toneladas;

    if (!valorViaje || !comision) {
      return 0;
    }

    return valorViaje * (comision / 100);
  }

  private recalculateMetricsFromPedidos(pedidos: any[]) {
    this.pedidosCount.set(pedidos.length);

    const finalizados = pedidos.filter((p: any) => Boolean(p?.finalizado));
    this.viajesFinalizadosCount.set(finalizados.length);

    let facturado = 0;
    let cobrado = 0;

    finalizados.forEach((pedido: any) => {
      const transportistas = Array.isArray(pedido?.transportistaIds) ? pedido.transportistaIds : [];

      transportistas.forEach((t: any) => {
        const pendienteCobrar = this.getPendienteCobrar(pedido, t);
        facturado += pendienteCobrar;

        if (t?.cobrado) {
          cobrado += Number(t?.cobradoValor ?? pendienteCobrar);
        }
      });
    });

    this.montoTotalFacturado.set(facturado);
    this.montoTotalCobrado.set(cobrado);
  }

  private computeChartData(pedidos: any[]) {
    const useDailyEvolution = this.filtroRapido() === 'ultimoMes';

    const pedidosMap: Record<string, number> = {};
    const finalizadosMap: Record<string, number> = {};
    const facturadoMap: Record<string, number> = {};
    const cobradoMap: Record<string, number> = {};
    const pedidosDiaMap: Record<string, number> = {};
    const finalizadosDiaMap: Record<string, number> = {};

    let transportesCobrados = 0;

    pedidos.forEach((pedido: any) => {
      const createdKey = this.monthKey(pedido?.createdAt);
      const finalizadoKey = this.monthKey(pedido?.finalizadoAt) ?? createdKey;
      const createdDayKey = this.dayKey(pedido?.createdAt);
      const finalizadoDayKey = this.dayKey(pedido?.finalizadoAt) ?? createdDayKey;

      if (createdKey) {
        pedidosMap[createdKey] = (pedidosMap[createdKey] ?? 0) + 1;
      }

      if (useDailyEvolution && createdDayKey) {
        pedidosDiaMap[createdDayKey] = (pedidosDiaMap[createdDayKey] ?? 0) + 1;
      }

      const isFinalizado = Boolean(pedido?.finalizado);
      if (isFinalizado && finalizadoKey) {
        finalizadosMap[finalizadoKey] = (finalizadosMap[finalizadoKey] ?? 0) + 1;
      }

      if (useDailyEvolution && isFinalizado && finalizadoDayKey) {
        finalizadosDiaMap[finalizadoDayKey] = (finalizadosDiaMap[finalizadoDayKey] ?? 0) + 1;
      }

      const transportistas = Array.isArray(pedido?.transportistaIds) ? pedido.transportistaIds : [];

      transportistas.forEach((t: any) => {
        if (typeof t !== 'object' || t === null) {
          return;
        }

        const pendienteCobrar = this.getPendienteCobrar(pedido, t);
        const moneyKey = finalizadoKey ?? createdKey;

        if (moneyKey && isFinalizado) {
          facturadoMap[moneyKey] = (facturadoMap[moneyKey] ?? 0) + pendienteCobrar;
        }

        if (t?.cobrado) {
          transportesCobrados += 1;
          if (moneyKey && isFinalizado) {
            cobradoMap[moneyKey] =
              (cobradoMap[moneyKey] ?? 0) + Number(t?.cobradoValor ?? pendienteCobrar);
          }
        }
      });
    });

    const keySet = new Set<string>([
      ...Object.keys(pedidosMap),
      ...Object.keys(finalizadosMap),
      ...Object.keys(facturadoMap),
      ...Object.keys(cobradoMap),
    ]);

    if (keySet.size === 0) {
      const now = new Date();
      keySet.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }

    const keys = [...keySet].sort();
    this.chartLabels = keys.map(key => this.monthLabelFromKey(key));
    this.pedidosPorMes = keys.map(key => pedidosMap[key] ?? 0);
    this.finalizadosPorMes = keys.map(key => finalizadosMap[key] ?? 0);
    this.facturadoPorMes = keys.map(key => Number((facturadoMap[key] ?? 0).toFixed(2)));
    this.cobradoPorMes = keys.map(key => Number((cobradoMap[key] ?? 0).toFixed(2)));

    if (useDailyEvolution && this.appliedDesdeTs !== null && this.appliedHastaTs !== null) {
      const dayKeys: string[] = [];
      const cursor = new Date(this.appliedDesdeTs);
      const end = new Date(this.appliedHastaTs);
      cursor.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      while (cursor.getTime() <= end.getTime()) {
        const key = this.dayKey(cursor.getTime());
        if (key) {
          dayKeys.push(key);
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      this.evolucionLabels = dayKeys.map(key => this.dayLabelFromKey(key));
      this.pedidosEvolucion = dayKeys.map(key => pedidosDiaMap[key] ?? 0);
      this.finalizadosEvolucion = dayKeys.map(key => finalizadosDiaMap[key] ?? 0);
    } else {
      this.evolucionLabels = this.chartLabels;
      this.pedidosEvolucion = this.pedidosPorMes;
      this.finalizadosEvolucion = this.finalizadosPorMes;
    }

    this.distribucionActual = [
      Math.max(this.pedidosCount() - this.viajesFinalizadosCount(), 0),
      this.viajesFinalizadosCount(),
      transportesCobrados,
    ];
  }

  private async ensureChartJsLoaded() {
    if (!this.isBrowser || this.chartFactory) {
      return;
    }
    const chartModule = await import('chart.js/auto');
    this.chartFactory = chartModule.default;
  }

  private async renderCharts() {
    if (!this.isBrowser) {
      return;
    }

    await this.ensureChartJsLoaded();

    if (
      !this.evolucionChartRef?.nativeElement ||
      !this.distribucionChartRef?.nativeElement ||
      !this.facturacionChartRef?.nativeElement
    ) {
      return;
    }

    this.evolucionChart?.destroy();
    this.distribucionChart?.destroy();
    this.facturacionChart?.destroy();

    const labels = this.chartLabels.length ? this.chartLabels : ['Sin datos'];
    const evolucionLabels = this.evolucionLabels.length ? this.evolucionLabels : labels;

    this.evolucionChart = new this.chartFactory(this.evolucionChartRef.nativeElement, {
      type: 'line',
      data: {
        labels: evolucionLabels,
        datasets: [
          {
            label: 'Pedidos',
            data: this.pedidosEvolucion.length ? this.pedidosEvolucion : [0],
            borderColor: '#0f4c81',
            backgroundColor: 'rgba(15, 76, 129, 0.18)',
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Viajes finalizados',
            data: this.finalizadosEvolucion.length ? this.finalizadosEvolucion : [0],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
        },
      },
    });

    this.distribucionChart = new this.chartFactory(this.distribucionChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Activos', 'Finalizados', 'Transportes cobrados'],
        datasets: [
          {
            data: this.distribucionActual,
            backgroundColor: ['#0f4c81', '#f59e0b', '#16a34a'],
            borderColor: ['#ffffff', '#ffffff', '#ffffff'],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
        },
      },
    });

    this.facturacionChart = new this.chartFactory(this.facturacionChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Facturado (ARS)',
            data: this.facturadoPorMes.length ? this.facturadoPorMes : [0],
            backgroundColor: 'rgba(15, 76, 129, 0.75)',
          },
          {
            label: 'Cobrado (ARS)',
            data: this.cobradoPorMes.length ? this.cobradoPorMes : [0],
            backgroundColor: 'rgba(22, 163, 74, 0.75)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
        },
      },
    });
  }

  ngOnDestroy() {
    this.unsubscribeClientes?.();
    this.unsubscribeTransportistas?.();
    this.unsubscribePedidos?.();
    this.evolucionChart?.destroy();
    this.distribucionChart?.destroy();
    this.facturacionChart?.destroy();
  }
}
