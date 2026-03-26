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
  toneladasTotalesFacturadas = signal(0);
  montoTotalFacturado = signal(0);
  montoTotalCobrado = signal(0);
  resumenFacturado = signal(0);
  resumenCobrado = signal(0);
  resumenTasaCobro = signal(0);
  facturacionAnioFiltro = signal('all');
  facturacionMesFiltro = signal('all');
  facturacionAnioOptions = signal<number[]>([]);
  readonly facturacionMesOptionsBase = [
    { value: '01', label: 'Enero' },
    { value: '02', label: 'Febrero' },
    { value: '03', label: 'Marzo' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Mayo' },
    { value: '06', label: 'Junio' },
    { value: '07', label: 'Julio' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' },
  ];
  facturacionMesOptions = signal<Array<{ value: string; label: string }>>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);
  fechaDesde = signal('');
  fechaHasta = signal('');
  filterError = signal<string | null>(null);
  filtroRapido = signal<'custom' | 'ultimoMes'>('custom');
  evolucionPeriodo = signal<'ultimoMes' | 'ultimos3Meses' | 'ultimos6Meses' | 'ultimoAnio'>('ultimoMes');
  clienteFiltroRubroChart = signal('all');
  rubroFiltroRubroChart = signal('all');
  clientesFiltroOptions = signal<Array<{ id: string; nombre: string }>>([]);
  rubrosFiltroOptions = signal<string[]>([]);

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
  @ViewChild('rubrosChart') rubrosChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('subcategoriasChart') subcategoriasChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('subcategoriasDetalleChart') subcategoriasDetalleChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('facturacionChart') facturacionChartRef?: ElementRef<HTMLCanvasElement>;

  private readonly isBrowser: boolean;
  private chartFactory?: any;
  private evolucionChart?: Chart;
  private rubrosChart?: Chart;
  private subcategoriasChart?: Chart;
  private subcategoriasDetalleChart?: Chart;
  private facturacionChart?: Chart;

  private chartLabels: string[] = [];
  private chartMonthKeys: string[] = [];
  private evolucionLabels: string[] = [];
  private pedidosEvolucion: number[] = [];
  private finalizadosEvolucion: number[] = [];
  private pedidosPorMes: number[] = [];
  private finalizadosPorMes: number[] = [];
  private facturadoPorMes: number[] = [];
  private cobradoPorMes: number[] = [];
  private tasaCobroPorMes: number[] = [];
  private clienteViajesMap: Record<string, number> = {};
  private rubroViajesFiltradoMap: Record<string, number> = {};
  private subcategoriaViajesFiltradoMap: Record<string, number> = {};
  private subcategoriaToneladasFiltradoMap: Record<string, number> = {};

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

        const clientes = value
          ? Object.entries(value as Record<string, any>).map(([id, data]) => ({
              id,
              nombre: String((data as any)?.nombre ?? 'Sin nombre'),
            }))
          : [];
        this.clientesFiltroOptions.set(clientes.sort((a, b) => a.nombre.localeCompare(b.nombre)));

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

  formatMoneyCompact(value: number): string {
    return Number(value || 0).toLocaleString('es-AR', {
      style: 'currency',
      currency: 'ARS',
      notation: 'compact',
      maximumFractionDigits: 1,
    });
  }

  formatToneladas(value: number): string {
    return Number(value || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 0,
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

  onClienteFiltroRubroChartChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.clienteFiltroRubroChart.set(target.value || 'all');
    this.rubroFiltroRubroChart.set('all');
    this.refreshDerivedMetrics();
  }

  onRubroFiltroRubroChartChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.rubroFiltroRubroChart.set(target.value || 'all');
    this.refreshDerivedMetrics();
  }

  onFacturacionAnioFiltroChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.facturacionAnioFiltro.set(target.value || 'all');
    void this.renderCharts();
  }

  onFacturacionMesFiltroChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.facturacionMesFiltro.set(target.value || 'all');
    void this.renderCharts();
  }

  onEvolucionPeriodoChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const value = target.value as 'ultimoMes' | 'ultimos3Meses' | 'ultimos6Meses' | 'ultimoAnio';
    this.evolucionPeriodo.set(value);
    this.refreshDerivedMetrics();
  }

  private normalizeTextLabel(value: unknown, fallback: string): string {
    const text = String(value ?? '').trim();
    if (!text) {
      return fallback;
    }
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  private normalizeRubroLabel(value: unknown): string {
    const raw = String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    if (!raw) {
      return 'Sin rubro';
    }

    if (raw === 'agricola' || raw === 'agro' || raw === 'agropecuario') {
      return 'Agro';
    }

    if (raw === 'aridos' || raw === 'arido') {
      return 'Aridos';
    }

    if (raw === 'producto' || raw === 'productos') {
      return 'Productos';
    }

    return this.normalizeTextLabel(raw, 'Sin rubro');
  }

  private getClienteNombreById(clienteId: string): string {
    const cliente = this.clientesFiltroOptions().find(c => c.id === clienteId);
    return cliente?.nombre || 'Sin cliente';
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
    const [, month, day] = key.split('-');
    return `${day}/${month}`;
  }

  private buildEvolucionWindow() {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const period = this.evolucionPeriodo();

    if (period === 'ultimoMes') {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      return { from, to: now, daily: true, monthsBack: 1 };
    }

    const monthsBack = period === 'ultimos3Meses'
      ? 3
      : period === 'ultimos6Meses'
        ? 6
        : 12;

    const from = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1, 0, 0, 0, 0);
    return { from, to: now, daily: false, monthsBack };
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
    const viajesFinalizados = finalizados.reduce((acc: number, pedido: any) => {
      const transportistas = Array.isArray(pedido?.transportistaIds) ? pedido.transportistaIds : [];
      return acc + transportistas.length;
    }, 0);
    this.viajesFinalizadosCount.set(viajesFinalizados);

    let facturado = 0;
    let cobrado = 0;
    let toneladasFacturadas = 0;

    finalizados.forEach((pedido: any) => {
      const transportistas = Array.isArray(pedido?.transportistaIds) ? pedido.transportistaIds : [];

      transportistas.forEach((t: any) => {
        if (typeof t === 'object' && t !== null) {
          toneladasFacturadas += Math.max(Number(t?.toneladasDescargadas ?? 0), 0);
        }

        const pendienteCobrar = this.getPendienteCobrar(pedido, t);
        facturado += pendienteCobrar;

        if (t?.cobrado) {
          cobrado += Number(t?.cobradoValor ?? pendienteCobrar);
        }
      });
    });

    this.montoTotalFacturado.set(facturado);
    this.montoTotalCobrado.set(cobrado);
    this.toneladasTotalesFacturadas.set(Number(toneladasFacturadas.toFixed(2)));
  }

  private computeChartData(pedidos: any[]) {
    const pedidosMap: Record<string, number> = {};
    const finalizadosMap: Record<string, number> = {};
    const facturadoMap: Record<string, number> = {};
    const cobradoMap: Record<string, number> = {};
    const pedidosDiaMap: Record<string, number> = {};
    const finalizadosDiaMap: Record<string, number> = {};
    const clienteViajesMap: Record<string, number> = {};
    const rubroViajesFiltradoMap: Record<string, number> = {};
    const subcategoriaViajesFiltradoMap: Record<string, number> = {};
    const subcategoriaToneladasFiltradoMap: Record<string, number> = {};
    const rubroOptionsSet = new Set<string>();

    const clienteFilter = this.clienteFiltroRubroChart();
    const rubroFilter = this.rubroFiltroRubroChart();

    let transportesCobrados = 0;

    pedidos.forEach((pedido: any) => {
      const transportistas = Array.isArray(pedido?.transportistaIds) ? pedido.transportistaIds : [];
      const viajesPedido = transportistas.length;
      const createdKey = this.monthKey(pedido?.createdAt);
      const finalizadoKey = this.monthKey(pedido?.finalizadoAt) ?? createdKey;
      const createdDayKey = this.dayKey(pedido?.createdAt);
      const finalizadoDayKey = this.dayKey(pedido?.finalizadoAt) ?? createdDayKey;

      if (createdKey) {
        pedidosMap[createdKey] = (pedidosMap[createdKey] ?? 0) + viajesPedido;
      }

      if (createdDayKey) {
        pedidosDiaMap[createdDayKey] = (pedidosDiaMap[createdDayKey] ?? 0) + viajesPedido;
      }

      const isFinalizado = Boolean(pedido?.finalizado);
      if (isFinalizado && finalizadoKey) {
        finalizadosMap[finalizadoKey] = (finalizadosMap[finalizadoKey] ?? 0) + viajesPedido;
      }

      if (finalizadoDayKey) {
        finalizadosDiaMap[finalizadoDayKey] = (finalizadosDiaMap[finalizadoDayKey] ?? 0) + viajesPedido;
      }

      transportistas.forEach((t: any) => {
        const toneladas = Number(typeof t === 'object' ? (t?.toneladasDescargadas ?? 0) : 0);

        if (isFinalizado) {
          const clienteLabel = this.getClienteNombreById(String(pedido?.clienteId ?? ''));
          const rubroLabel = this.normalizeRubroLabel(pedido?.rubro);
          const subcategoriaLabel = this.normalizeTextLabel(pedido?.producto, 'Sin subcategoria');
          clienteViajesMap[clienteLabel] = (clienteViajesMap[clienteLabel] ?? 0) + 1;

          const clienteOk = clienteFilter === 'all' || pedido?.clienteId === clienteFilter;
          if (clienteOk) {
            rubroOptionsSet.add(rubroLabel);
            rubroViajesFiltradoMap[rubroLabel] = (rubroViajesFiltradoMap[rubroLabel] ?? 0) + 1;

            const rubroOk = rubroFilter === 'all' || rubroLabel === rubroFilter;
            if (rubroOk) {
              subcategoriaViajesFiltradoMap[subcategoriaLabel] =
                (subcategoriaViajesFiltradoMap[subcategoriaLabel] ?? 0) + 1;
              subcategoriaToneladasFiltradoMap[subcategoriaLabel] =
                (subcategoriaToneladasFiltradoMap[subcategoriaLabel] ?? 0) + Math.max(toneladas, 0);
            }
          }
        }

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
    this.chartMonthKeys = keys;
    this.chartLabels = keys.map(key => this.monthLabelFromKey(key));
    this.pedidosPorMes = keys.map(key => pedidosMap[key] ?? 0);
    this.finalizadosPorMes = keys.map(key => finalizadosMap[key] ?? 0);
    this.facturadoPorMes = keys.map(key => Number((facturadoMap[key] ?? 0).toFixed(2)));
    this.cobradoPorMes = keys.map(key => Number((cobradoMap[key] ?? 0).toFixed(2)));
    this.tasaCobroPorMes = keys.map((key, index) => {
      const facturado = this.facturadoPorMes[index] ?? 0;
      const cobrado = this.cobradoPorMes[index] ?? 0;
      if (facturado <= 0) {
        return 0;
      }
      return Number(((cobrado / facturado) * 100).toFixed(1));
    });

    const totalFacturado = this.facturadoPorMes.reduce((acc, value) => acc + value, 0);
    const totalCobrado = this.cobradoPorMes.reduce((acc, value) => acc + value, 0);
    const tasaTotal = totalFacturado > 0 ? (totalCobrado / totalFacturado) * 100 : 0;
    this.resumenFacturado.set(Number(totalFacturado.toFixed(2)));
    this.resumenCobrado.set(Number(totalCobrado.toFixed(2)));
    this.resumenTasaCobro.set(Number(tasaTotal.toFixed(1)));

    const availableYears = [...new Set(keys.map(key => Number(key.split('-')[0])))]
      .filter(year => !Number.isNaN(year))
      .sort((a, b) => b - a);
    this.facturacionAnioOptions.set(availableYears);
    if (this.facturacionAnioFiltro() !== 'all') {
      const selected = Number(this.facturacionAnioFiltro());
      if (!availableYears.includes(selected)) {
        this.facturacionAnioFiltro.set('all');
      }
    }

    const selectedYear = this.facturacionAnioFiltro();
    const monthSet = new Set(
      keys
        .filter(key => {
          const [year] = key.split('-');
          return selectedYear === 'all' || year === selectedYear;
        })
        .map(key => key.split('-')[1]),
    );
    const availableMonths = this.facturacionMesOptionsBase.filter(month => monthSet.has(month.value));
    this.facturacionMesOptions.set(availableMonths);

    if (this.facturacionMesFiltro() !== 'all') {
      const selectedMonth = this.facturacionMesFiltro();
      const monthExists = availableMonths.some(month => month.value === selectedMonth);
      if (!monthExists) {
        this.facturacionMesFiltro.set('all');
      }
    }

    const evolucionWindow = this.buildEvolucionWindow();
    if (evolucionWindow.daily) {
      const dayKeys: string[] = [];
      const cursor = new Date(evolucionWindow.from);
      const end = new Date(evolucionWindow.to);
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
      const monthKeys: string[] = [];
      const cursor = new Date(evolucionWindow.from.getFullYear(), evolucionWindow.from.getMonth(), 1);
      const end = new Date(evolucionWindow.to.getFullYear(), evolucionWindow.to.getMonth(), 1);

      while (cursor.getTime() <= end.getTime()) {
        const key = this.monthKey(cursor.getTime());
        if (key) {
          monthKeys.push(key);
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }

      this.evolucionLabels = monthKeys.map(key => this.monthLabelFromKey(key));
      this.pedidosEvolucion = monthKeys.map(key => pedidosMap[key] ?? 0);
      this.finalizadosEvolucion = monthKeys.map(key => finalizadosMap[key] ?? 0);
    }

    this.clienteViajesMap = clienteViajesMap;
    this.rubroViajesFiltradoMap = rubroViajesFiltradoMap;
    this.subcategoriaViajesFiltradoMap = subcategoriaViajesFiltradoMap;
    this.subcategoriaToneladasFiltradoMap = subcategoriaToneladasFiltradoMap;

    const rubroOptions = [...rubroOptionsSet].sort((a, b) => a.localeCompare(b));
    this.rubrosFiltroOptions.set(rubroOptions);
    if (rubroFilter !== 'all' && !rubroOptions.includes(rubroFilter)) {
      this.rubroFiltroRubroChart.set('all');
      this.refreshDerivedMetrics();
      return;
    }
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
      !this.rubrosChartRef?.nativeElement ||
      !this.subcategoriasChartRef?.nativeElement ||
      !this.subcategoriasDetalleChartRef?.nativeElement ||
      !this.facturacionChartRef?.nativeElement
    ) {
      return;
    }

    this.evolucionChart?.destroy();
    this.rubrosChart?.destroy();
    this.subcategoriasChart?.destroy();
    this.subcategoriasDetalleChart?.destroy();
    this.facturacionChart?.destroy();

    const labels = this.chartLabels.length ? this.chartLabels : ['Sin datos'];
    const evolucionLabels = this.evolucionLabels.length ? this.evolucionLabels : labels;

    this.evolucionChart = new this.chartFactory(this.evolucionChartRef.nativeElement, {
      type: 'line',
      data: {
        labels: evolucionLabels,
        datasets: [
          {
            label: 'Viajes generados',
            data: this.pedidosEvolucion.length ? this.pedidosEvolucion : [0],
            borderColor: '#0f4c81',
            backgroundColor: 'rgba(15, 76, 129, 0.18)',
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

    const clienteEntries = Object.entries(this.clienteViajesMap).sort((a, b) => b[1] - a[1]);
    const totalViajesClientes = clienteEntries.reduce((acc, [, value]) => acc + value, 0);
    const clienteLabels = clienteEntries.length
      ? clienteEntries.map(([label, value]) => {
          const porcentaje = totalViajesClientes > 0 ? (value / totalViajesClientes) * 100 : 0;
          return `${label} - ${value} viajes (${porcentaje.toFixed(1)}%)`;
        })
      : ['Sin datos'];
    const clienteData = clienteEntries.length ? clienteEntries.map(([, value]) => value) : [1];

    const rubroEntries = Object.entries(this.rubroViajesFiltradoMap).sort((a, b) => b[1] - a[1]);
    const totalViajesRubros = rubroEntries.reduce((acc, [, value]) => acc + value, 0);
    const rubroLabels = rubroEntries.length
      ? rubroEntries.map(([label, value]) => {
          const porcentaje = totalViajesRubros > 0 ? (value / totalViajesRubros) * 100 : 0;
          return `${label} - ${value} viajes (${porcentaje.toFixed(1)}%)`;
        })
      : ['Sin datos'];
    const rubroData = rubroEntries.length ? rubroEntries.map(([, value]) => value) : [1];

    const subcategoriaEntries = Object.entries(this.subcategoriaViajesFiltradoMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const subcategoriaLabels = subcategoriaEntries.length
      ? subcategoriaEntries.map(([label, viajes]) => {
          const toneladas = Number((this.subcategoriaToneladasFiltradoMap[label] ?? 0).toFixed(2));
          return `${label} - ${viajes} viajes - ${this.formatToneladas(toneladas)} tn`;
        })
      : ['Sin datos'];
    const subcategoriaViajesData = subcategoriaEntries.length
      ? subcategoriaEntries.map(([, value]) => value)
      : [0];

    this.rubrosChart = new this.chartFactory(this.rubrosChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: clienteLabels,
        datasets: [
          {
            data: clienteData,
            backgroundColor: ['#0f4c81', '#f59e0b', '#16a34a', '#ef4444', '#7c3aed', '#0ea5e9'],
            borderColor: '#ffffff',
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

    this.subcategoriasChart = new this.chartFactory(this.subcategoriasChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: rubroLabels,
        datasets: [
          {
            data: rubroData,
            backgroundColor: ['#0f4c81', '#f59e0b', '#16a34a', '#ef4444', '#7c3aed', '#0ea5e9', '#f43f5e', '#14b8a6'],
            borderColor: '#ffffff',
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

    this.subcategoriasDetalleChart = new this.chartFactory(this.subcategoriasDetalleChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: subcategoriaLabels,
        datasets: [
          {
            data: subcategoriaViajesData,
            backgroundColor: ['#0f4c81', '#f59e0b', '#16a34a', '#ef4444', '#7c3aed', '#0ea5e9', '#f43f5e', '#14b8a6'],
            borderColor: '#ffffff',
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

    const anioFiltro = this.facturacionAnioFiltro();
    const mesFiltro = this.facturacionMesFiltro();

    const filteredIndexes = this.chartMonthKeys
      .map((key, index) => ({ key, index }))
      .filter(({ key }) => {
        const [year, month] = key.split('-');
        const matchesYear = anioFiltro === 'all' || year === anioFiltro;
        const matchesMonth = mesFiltro === 'all' || month === mesFiltro;
        return matchesYear && matchesMonth;
      })
      .map(item => item.index);

    const filteredLabels = filteredIndexes.length
      ? filteredIndexes.map(index => this.chartLabels[index])
      : ['Sin datos'];
    const filteredFacturado = filteredIndexes.length
      ? filteredIndexes.map(index => this.facturadoPorMes[index] ?? 0)
      : [0];
    const filteredCobrado = filteredIndexes.length
      ? filteredIndexes.map(index => this.cobradoPorMes[index] ?? 0)
      : [0];
    const filteredTasa = filteredIndexes.length
      ? filteredIndexes.map(index => this.tasaCobroPorMes[index] ?? 0)
      : [0];

    const totalFacturadoFiltrado = filteredFacturado.reduce((acc, value) => acc + value, 0);
    const totalCobradoFiltrado = filteredCobrado.reduce((acc, value) => acc + value, 0);
    const tasaFiltrada = totalFacturadoFiltrado > 0
      ? (totalCobradoFiltrado / totalFacturadoFiltrado) * 100
      : 0;
    this.resumenFacturado.set(Number(totalFacturadoFiltrado.toFixed(2)));
    this.resumenCobrado.set(Number(totalCobradoFiltrado.toFixed(2)));
    this.resumenTasaCobro.set(Number(tasaFiltrada.toFixed(1)));

    this.facturacionChart = new this.chartFactory(this.facturacionChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: filteredLabels,
        datasets: [
          {
            label: 'Facturado (ARS)',
            data: filteredFacturado,
            backgroundColor: 'rgba(15, 76, 129, 0.55)',
            borderRadius: 8,
            maxBarThickness: 30,
          },
          {
            label: 'Cobrado (ARS)',
            data: filteredCobrado,
            backgroundColor: 'rgba(22, 163, 74, 0.82)',
            borderRadius: 8,
            maxBarThickness: 30,
          },
          {
            type: 'line',
            label: 'Tasa de cobro (%)',
            data: filteredTasa,
            yAxisID: 'y1',
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const label = context.dataset.label || '';
                const value = Number(context.raw ?? 0);

                if (label.includes('Tasa')) {
                  return `${label}: ${value.toFixed(1)}%`;
                }

                return `${label}: ${this.formatMoney(value)}`;
              },
              afterBody: (items: any[]) => {
                const idx = items?.[0]?.dataIndex;
                if (idx === undefined || idx === null) {
                  return '';
                }

                const facturado = filteredFacturado[idx] ?? 0;
                const cobrado = filteredCobrado[idx] ?? 0;
                const diferencia = Math.max(facturado - cobrado, 0);
                return `Diferencia: ${this.formatMoney(diferencia)}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: any) => this.formatMoneyCompact(Number(value ?? 0)),
            },
            grid: {
              color: 'rgba(15, 23, 42, 0.08)',
            },
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            suggestedMax: 100,
            ticks: {
              callback: (value: any) => `${value}%`,
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    });
  }

  ngOnDestroy() {
    this.unsubscribeClientes?.();
    this.unsubscribeTransportistas?.();
    this.unsubscribePedidos?.();
    this.evolucionChart?.destroy();
    this.rubrosChart?.destroy();
    this.subcategoriasChart?.destroy();
    this.subcategoriasDetalleChart?.destroy();
    this.facturacionChart?.destroy();
  }
}
