import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeDatabaseService } from '../services/realtime-db.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

type Rubro = 'agricola' | 'productos' | 'aridos';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './clientes.html',
  styleUrl: './clientes.css',
})
export class Clientes implements OnInit, OnDestroy {
  clientes = signal<Array<{ id: string; data: any }>>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);
  searchTerm = signal('');
  currentPage = signal(1);
  itemsPerPage = 10;
  showAddForm = signal(false);
  showEditForm = signal(false);
  editingItem = signal<{ id: string; data: any } | null>(null);

  readonly rubroOptions: Rubro[] = ['agricola', 'productos', 'aridos'];

  readonly subcategoriasPorRubro = signal<Record<Rubro, string[]>>({
    agricola: ['soja', 'maiz', 'trigo', 'girasol'],
    productos: ['fertilizante', 'ig bag', 'pellet'],
    aridos: ['piedra', 'arena', 'tierra', 'material 020', 'escombros'],
  });

  selectedAddRubros = signal<Rubro[]>([]);
  selectedAddSubcategorias = signal<string[]>([]);
  addSubcategoriasByRubro = signal<Record<Rubro, string[]>>({
    agricola: [],
    productos: [],
    aridos: [],
  });
  selectedEditRubros = signal<Rubro[]>([]);
  selectedEditSubcategorias = signal<string[]>([]);
  editSubcategoriasByRubro = signal<Record<Rubro, string[]>>({
    agricola: [],
    productos: [],
    aridos: [],
  });
  newSubcategoriaAdd = signal('');
  newSubcategoriaEdit = signal('');

  addForm: FormGroup;
  editForm: FormGroup;

  private unsubscribe?: () => void;

  constructor(private readonly db: RealtimeDatabaseService, private fb: FormBuilder) {
    this.addForm = this.fb.group({
      nombre: ['', Validators.required],
      cuit: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      telefono: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      email: ['', [Validators.required, Validators.email]],
      rubros: [[], Validators.required],
      subcategorias: [[]],
    });

    this.editForm = this.fb.group({
      nombre: ['', Validators.required],
      cuit: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      telefono: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      email: ['', [Validators.required, Validators.email]],
      rubros: [[], Validators.required],
      subcategorias: [[]],
    });
  }

  get filteredClientes() {
    const term = this.searchTerm().toLowerCase();
    return this.clientes().filter(c =>
      c.data?.nombre?.toLowerCase().includes(term) ||
      c.data?.email?.toLowerCase().includes(term)
    );
  }

  get paginatedClientes() {
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return this.filteredClientes.slice(start, start + this.itemsPerPage);
  }

  get totalPages() {
    return Math.ceil(this.filteredClientes.length / this.itemsPerPage);
  }

  get pageNumbers() {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  ngOnInit() {
    this.unsubscribe = this.db.onValue(
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
        console.error('Realtime DB onValue error:', err);
        this.errorMessage.set('Error leyendo datos de Realtime Database. Revisa la consola.');
        this.loading.set(false);
      },
    );
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  toggleAddForm() {
    this.showAddForm.set(!this.showAddForm());
    if (this.showAddForm()) {
      this.addForm.reset();
      this.addForm.patchValue({ rubros: [], subcategorias: [] });
      this.selectedAddRubros.set([]);
      this.selectedAddSubcategorias.set([]);
      this.addSubcategoriasByRubro.set({ agricola: [], productos: [], aridos: [] });
      this.newSubcategoriaAdd.set('');
    }
  }

  toggleAddRubro(event: Event, rubro: Rubro) {
    const target = event.target as HTMLInputElement;
    const current = this.selectedAddRubros();
    const next = target.checked
      ? [...current, rubro]
      : current.filter(r => r !== rubro);

    this.selectedAddRubros.set(next);
    this.addForm.patchValue({ rubros: next });

    if (!target.checked) {
      this.addSubcategoriasByRubro.set({
        ...this.addSubcategoriasByRubro(),
        [rubro]: [],
      });
      this.syncAddSubcategoriasFromRubros();
    }
  }

  isAddRubroChecked(rubro: Rubro) {
    return this.selectedAddRubros().includes(rubro);
  }

  getSubcategoriasForRubro(rubro: string) {
    if (!rubro || !this.isRubro(rubro)) {
      return [];
    }
    return this.subcategoriasPorRubro()[rubro];
  }

  onAddRubroChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const rubro = target.value;
    if (!this.isRubro(rubro)) {
      return;
    }
    const fakeEvent = {
      target: { checked: !this.selectedAddRubros().includes(rubro) },
    } as unknown as Event;
    this.toggleAddRubro(fakeEvent, rubro);
  }

  toggleEditRubro(event: Event, rubro: Rubro) {
    const target = event.target as HTMLInputElement;
    const current = this.selectedEditRubros();
    const next = target.checked
      ? [...current, rubro]
      : current.filter(r => r !== rubro);

    this.selectedEditRubros.set(next);
    this.editForm.patchValue({ rubros: next });

    if (!target.checked) {
      this.editSubcategoriasByRubro.set({
        ...this.editSubcategoriasByRubro(),
        [rubro]: [],
      });
      this.syncEditSubcategoriasFromRubros();
    }
  }

  isEditRubroChecked(rubro: Rubro) {
    return this.selectedEditRubros().includes(rubro);
  }

  toggleAddSubcategoria(event: Event, subcategoria: string) {
    const target = event.target as HTMLInputElement;
    const current = this.selectedAddSubcategorias();
    const next = target.checked
      ? [...current, subcategoria]
      : current.filter(s => s !== subcategoria);

    this.selectedAddSubcategorias.set(next);
    this.addForm.patchValue({ subcategorias: next });
  }

  toggleAddSubcategoriaForRubro(event: Event, rubro: Rubro, subcategoria: string) {
    const target = event.target as HTMLInputElement;
    const currentByRubro = this.addSubcategoriasByRubro();
    const current = currentByRubro[rubro];
    const nextForRubro = target.checked
      ? [...current, subcategoria]
      : current.filter(s => s !== subcategoria);

    this.addSubcategoriasByRubro.set({
      ...currentByRubro,
      [rubro]: nextForRubro,
    });

    this.syncAddSubcategoriasFromRubros();
  }

  isAddSubcategoriaCheckedForRubro(rubro: Rubro, subcategoria: string) {
    return this.addSubcategoriasByRubro()[rubro].includes(subcategoria);
  }

  toggleEditSubcategoriaForRubro(event: Event, rubro: Rubro, subcategoria: string) {
    const target = event.target as HTMLInputElement;
    const currentByRubro = this.editSubcategoriasByRubro();
    const current = currentByRubro[rubro];
    const nextForRubro = target.checked
      ? [...current, subcategoria]
      : current.filter(s => s !== subcategoria);

    this.editSubcategoriasByRubro.set({
      ...currentByRubro,
      [rubro]: nextForRubro,
    });

    this.syncEditSubcategoriasFromRubros();
  }

  isEditSubcategoriaCheckedForRubro(rubro: Rubro, subcategoria: string) {
    return this.editSubcategoriasByRubro()[rubro].includes(subcategoria);
  }

  onNewSubcategoriaAddInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.newSubcategoriaAdd.set(target.value);
  }

  onNewSubcategoriaEditInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.newSubcategoriaEdit.set(target.value);
  }

  addCustomSubcategoria(mode: 'add' | 'edit') {
    const form = mode === 'add' ? this.addForm : this.editForm;
    const rubro = form.get('rubro')?.value as string;
    if (!this.isRubro(rubro)) {
      return;
    }

    const value = mode === 'add' ? this.newSubcategoriaAdd() : this.newSubcategoriaEdit();
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return;
    }

    const currentMap = this.subcategoriasPorRubro();
    const currentList = currentMap[rubro];
    if (!currentList.includes(trimmed)) {
      this.subcategoriasPorRubro.set({
        ...currentMap,
        [rubro]: [...currentList, trimmed],
      });
    }

    if (mode === 'add') {
      const next = [...this.selectedAddSubcategorias(), trimmed];
      this.selectedAddSubcategorias.set(Array.from(new Set(next)));
      this.addForm.patchValue({ subcategorias: this.selectedAddSubcategorias() });
      this.newSubcategoriaAdd.set('');
    } else {
      const next = [...this.selectedEditSubcategorias(), trimmed];
      this.selectedEditSubcategorias.set(Array.from(new Set(next)));
      this.editForm.patchValue({ subcategorias: this.selectedEditSubcategorias() });
      this.newSubcategoriaEdit.set('');
    }
  }

  addCustomSubcategoriaForAdd(rubro: Rubro) {
    const trimmed = this.newSubcategoriaAdd().trim().toLowerCase();
    if (!trimmed) {
      return;
    }

    const currentMap = this.subcategoriasPorRubro();
    const currentList = currentMap[rubro];
    if (!currentList.includes(trimmed)) {
      this.subcategoriasPorRubro.set({
        ...currentMap,
        [rubro]: [...currentList, trimmed],
      });
    }

    const currentByRubro = this.addSubcategoriasByRubro();
    this.addSubcategoriasByRubro.set({
      ...currentByRubro,
      [rubro]: Array.from(new Set([...currentByRubro[rubro], trimmed])),
    });

    this.syncAddSubcategoriasFromRubros();
    this.newSubcategoriaAdd.set('');
  }

  addCustomSubcategoriaForEdit(rubro: Rubro) {
    const trimmed = this.newSubcategoriaEdit().trim().toLowerCase();
    if (!trimmed) {
      return;
    }

    const currentMap = this.subcategoriasPorRubro();
    const currentList = currentMap[rubro];
    if (!currentList.includes(trimmed)) {
      this.subcategoriasPorRubro.set({
        ...currentMap,
        [rubro]: [...currentList, trimmed],
      });
    }

    const currentByRubro = this.editSubcategoriasByRubro();
    this.editSubcategoriasByRubro.set({
      ...currentByRubro,
      [rubro]: Array.from(new Set([...currentByRubro[rubro], trimmed])),
    });

    this.syncEditSubcategoriasFromRubros();
    this.newSubcategoriaEdit.set('');
  }

  isSubcategoriaChecked(mode: 'add' | 'edit', subcategoria: string) {
    return mode === 'add'
      ? this.selectedAddSubcategorias().includes(subcategoria)
      : this.selectedEditSubcategorias().includes(subcategoria);
  }

  formatSubcategorias(value: unknown) {
    if (Array.isArray(value) && value.length) {
      return value.join(', ');
    }
    return 'N/A';
  }

  formatRubros(value: unknown, legacy?: unknown) {
    if (Array.isArray(value) && value.length) {
      return value.join(', ');
    }
    if (typeof legacy === 'string' && legacy) {
      return legacy;
    }
    return 'N/A';
  }

  private syncAddSubcategoriasFromRubros() {
    const activeRubros = this.selectedAddRubros();
    const byRubro = this.addSubcategoriasByRubro();
    const flattened = Array.from(new Set(activeRubros.flatMap(r => byRubro[r])));
    this.selectedAddSubcategorias.set(flattened);
    this.addForm.patchValue({ subcategorias: flattened });
  }

  private syncEditSubcategoriasFromRubros() {
    const activeRubros = this.selectedEditRubros();
    const byRubro = this.editSubcategoriasByRubro();
    const flattened = Array.from(new Set(activeRubros.flatMap(r => byRubro[r])));
    this.selectedEditSubcategorias.set(flattened);
    this.editForm.patchValue({ subcategorias: flattened });
  }

  private isRubro(value: string): value is Rubro {
    return value === 'agricola' || value === 'productos' || value === 'aridos';
  }

  async addNew() {
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }

    const formValue = this.addForm.value;
    try {
      const ref = await this.db.push('clientes', {
        ...formValue,
        cuit: Number(formValue.cuit),
        telefono: Number(formValue.telefono),
        rubros: this.selectedAddRubros(),
        rubro: this.selectedAddRubros()[0] ?? null,
        subcategoriasByRubro: this.addSubcategoriasByRubro(),
        subcategorias: this.selectedAddSubcategorias(),
        createdAt: Date.now(),
      });
      console.log('Nuevo cliente agregado:', ref.key);
      this.errorMessage.set(null);
      this.showAddForm.set(false);
      this.addForm.reset();
      this.addForm.patchValue({ rubros: [], subcategorias: [] });
      this.selectedAddRubros.set([]);
      this.selectedAddSubcategorias.set([]);
      this.addSubcategoriasByRubro.set({ agricola: [], productos: [], aridos: [] });
      this.newSubcategoriaAdd.set('');
    } catch (err) {
      console.error('Error agregando cliente:', err);
      this.errorMessage.set('No se pudo guardar el cliente. Revisa la consola.');
    }
  }

  startEdit(item: { id: string; data: any }) {
    const rubrosRaw = Array.isArray(item.data?.rubros)
      ? item.data.rubros
      : (typeof item.data?.rubro === 'string' ? [item.data.rubro] : []);
    const validRubros = rubrosRaw.filter((r: string) => this.isRubro(r)) as Rubro[];

    const emptyMap: Record<Rubro, string[]> = { agricola: [], productos: [], aridos: [] };
    const storedMap = item.data?.subcategoriasByRubro;
    const nextMap: Record<Rubro, string[]> = { ...emptyMap };

    if (storedMap && typeof storedMap === 'object') {
      for (const rubro of this.rubroOptions) {
        const vals = (storedMap as Record<string, unknown>)[rubro];
        nextMap[rubro] = Array.isArray(vals) ? vals.map(v => String(v)) : [];
      }
    } else if (validRubros.length === 1 && Array.isArray(item.data?.subcategorias)) {
      nextMap[validRubros[0]] = item.data.subcategorias.map((v: unknown) => String(v));
    }

    this.editingItem.set(item);
    this.editForm.patchValue({
      nombre: item.data?.nombre ?? '',
      cuit: item.data?.cuit ?? '',
      telefono: item.data?.telefono ?? '',
      email: item.data?.email ?? '',
      rubros: validRubros,
      subcategorias: Array.isArray(item.data?.subcategorias) ? item.data.subcategorias : [],
    });
    this.selectedEditRubros.set(validRubros);
    this.editSubcategoriasByRubro.set(nextMap);
    this.syncEditSubcategoriasFromRubros();
    this.newSubcategoriaEdit.set('');
    this.showEditForm.set(true);
  }

  async saveEdit() {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const formValue = this.editForm.value;
    const item = this.editingItem();
    if (!item) return;

    try {
      await this.db.update(`clientes/${item.id}`, {
        ...formValue,
        cuit: Number(formValue.cuit),
        telefono: Number(formValue.telefono),
        rubros: this.selectedEditRubros(),
        rubro: this.selectedEditRubros()[0] ?? null,
        subcategoriasByRubro: this.editSubcategoriasByRubro(),
        subcategorias: this.selectedEditSubcategorias(),
        updatedAt: Date.now(),
      });
      this.errorMessage.set(null);
      this.showEditForm.set(false);
      this.editingItem.set(null);
      this.selectedEditRubros.set([]);
      this.selectedEditSubcategorias.set([]);
      this.editSubcategoriasByRubro.set({ agricola: [], productos: [], aridos: [] });
      this.newSubcategoriaEdit.set('');
    } catch (err) {
      console.error('Error editando cliente:', err);
      this.errorMessage.set('No se pudo editar el cliente. Revisa la consola.');
    }
  }

  cancelEdit() {
    this.showEditForm.set(false);
    this.editingItem.set(null);
    this.selectedEditRubros.set([]);
    this.selectedEditSubcategorias.set([]);
    this.editSubcategoriasByRubro.set({ agricola: [], productos: [], aridos: [] });
    this.newSubcategoriaEdit.set('');
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

  async remove(item: { id: string; data: any }) {
    const ok = confirm(
      `¿Eliminar cliente "${item.data?.nombre ?? item.id}"?`,
    );
    if (!ok) {
      return;
    }

    try {
      await this.db.remove(`clientes/${item.id}`);
      this.errorMessage.set(null);
    } catch (err) {
      console.error('Error eliminando cliente:', err);
      this.errorMessage.set('No se pudo eliminar el cliente. Revisa la consola.');
    }
  }
}
