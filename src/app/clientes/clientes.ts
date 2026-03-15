import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { RealtimeDatabaseService } from '../services/realtime-db.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet, ReactiveFormsModule],
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

  addForm: FormGroup;
  editForm: FormGroup;

  private unsubscribe?: () => void;

  constructor(private readonly db: RealtimeDatabaseService, private fb: FormBuilder) {
    this.addForm = this.fb.group({
      nombre: ['', Validators.required],
      cuit: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      telefono: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      email: ['', [Validators.required, Validators.email]],
    });

    this.editForm = this.fb.group({
      nombre: ['', Validators.required],
      cuit: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      telefono: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      email: ['', [Validators.required, Validators.email]],
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
    }
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
        createdAt: Date.now(),
      });
      console.log('Nuevo cliente agregado:', ref.key);
      this.errorMessage.set(null);
      this.showAddForm.set(false);
      this.addForm.reset();
    } catch (err) {
      console.error('Error agregando cliente:', err);
      this.errorMessage.set('No se pudo guardar el cliente. Revisa la consola.');
    }
  }

  startEdit(item: { id: string; data: any }) {
    this.editingItem.set(item);
    this.editForm.patchValue(item.data);
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
        updatedAt: Date.now(),
      });
      this.errorMessage.set(null);
      this.showEditForm.set(false);
      this.editingItem.set(null);
    } catch (err) {
      console.error('Error editando cliente:', err);
      this.errorMessage.set('No se pudo editar el cliente. Revisa la consola.');
    }
  }

  cancelEdit() {
    this.showEditForm.set(false);
    this.editingItem.set(null);
  }

  onSearchChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchTerm.set(target.value);
    this.currentPage.set(1);
  }

  changePage(page: number) {
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
