import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { RealtimeDatabaseService } from '../services/realtime-db.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-transportistas',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet, ReactiveFormsModule],
  templateUrl: './transportistas.html',
  styleUrl: './transportistas.css',
})
export class Transportistas implements OnInit, OnDestroy {
  transportistas = signal<Array<{ id: string; data: any }>>([]);
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
      nombreTransporte: ['', Validators.required],
      cuitTransporte: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      nombreChofer: ['', Validators.required],
      cuitChofer: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      patenteChasis: ['', [Validators.required, this.patenteValidator]],
      patenteAcoplado: ['', [Validators.required, this.patenteValidator]],
      tipoCamion: ['', Validators.required],
      comision: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    });

    this.editForm = this.fb.group({
      nombreTransporte: ['', Validators.required],
      cuitTransporte: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      nombreChofer: ['', Validators.required],
      cuitChofer: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      patenteChasis: ['', [Validators.required, this.patenteValidator]],
      patenteAcoplado: ['', [Validators.required, this.patenteValidator]],
      tipoCamion: ['', Validators.required],
      comision: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    });
  }

  patenteValidator(control: any) {
    const value = control.value;
    if (!value) return null;
    // Formatos válidos: LLNNNLL o LLLNNN (letras mayúsculas o minúsculas)
    const regex = /^[A-Za-z]{2}\d{3}[A-Za-z]{2}$|^[A-Za-z]{3}\d{3}$/;
    return regex.test(value) ? null : { invalidPatente: true };
  }

  get filteredTransportistas() {
    const term = this.searchTerm().toLowerCase();
    return this.transportistas().filter(t =>
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

  ngOnInit() {
    this.unsubscribe = this.db.onValue(
      'transportistas',
      (snapshot: any) => {
        const value = snapshot.val();
        if (!value) {
          this.transportistas.set([]);
          this.loading.set(false);
          return;
        }

        const items = Object.entries(value).map(([id, data]) => ({
          id,
          data,
        }));
        this.transportistas.set(items);
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
      const ref = await this.db.push('transportistas', {
        ...formValue,
        cuitTransporte: Number(formValue.cuitTransporte),
        cuitChofer: Number(formValue.cuitChofer),
        comision: Number(formValue.comision),
        createdAt: Date.now(),
      });
      console.log('Nuevo transportista agregado:', ref.key);
      this.errorMessage.set(null);
      this.showAddForm.set(false);
      this.addForm.reset();
    } catch (err) {
      console.error('Error agregando transportista:', err);
      this.errorMessage.set('No se pudo guardar el transportista. Revisa la consola.');
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
      await this.db.update(`transportistas/${item.id}`, {
        ...formValue,
        cuitTransporte: Number(formValue.cuitTransporte),
        cuitChofer: Number(formValue.cuitChofer),
        comision: Number(formValue.comision),
        updatedAt: Date.now(),
      });
      this.errorMessage.set(null);
      this.showEditForm.set(false);
      this.editingItem.set(null);
    } catch (err) {
      console.error('Error editando transportista:', err);
      this.errorMessage.set('No se pudo editar el transportista. Revisa la consola.');
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
      `¿Eliminar transportista "${item.data?.nombreTransporte ?? item.id}"?`,
    );
    if (!ok) {
      return;
    }

    try {
      await this.db.remove(`transportistas/${item.id}`);
      this.errorMessage.set(null);
    } catch (err) {
      console.error('Error eliminando transportista:', err);
      this.errorMessage.set('No se pudo eliminar el transportista. Revisa la consola.');
    }
  }
}
