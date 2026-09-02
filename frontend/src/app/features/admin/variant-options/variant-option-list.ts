import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CatalogService,
  VariantOption,
  CreateVariantOptionPayload,
} from '../../../core/services/catalog.service';

interface OptionForm {
  key: string;
  values: string[];
  newValue: string; // buffer for the "add value" input
  isActive: boolean;
  sortOrder: number;
}

const emptyForm = (): OptionForm => ({
  key: '', values: [], newValue: '', isActive: true, sortOrder: 0,
});

@Component({
  selector: 'app-variant-option-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './variant-option-list.html',
  styleUrls: ['./variant-option-list.scss'],
})
export class VariantOptionListComponent implements OnInit {
  private readonly catalog = inject(CatalogService);

  options    = signal<VariantOption[]>([]);
  loading    = signal(false);
  saving     = signal(false);
  formError  = signal<string | null>(null);
  showForm   = signal(false);
  editingId  = signal<string | null>(null);
  form       = signal<OptionForm>(emptyForm());

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.catalog.getVariantOptions().subscribe({
      next: (res) => { this.options.set(res.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.form.set(emptyForm());
    this.formError.set(null);
    this.showForm.set(true);
  }

  openEdit(option: VariantOption) {
    this.editingId.set(option._id);
    this.form.set({
      key: option.key,
      values: [...option.values],
      newValue: '',
      isActive: option.isActive,
      sortOrder: option.sortOrder ?? 0,
    });
    this.formError.set(null);
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.editingId.set(null);
    this.formError.set(null);
  }

  addValue() {
    const v = this.form().newValue.trim();
    if (!v) return;
    // Case-insensitive dedupe
    if (this.form().values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      this.form.update((f) => ({ ...f, newValue: '' }));
      return;
    }
    this.form.update((f) => ({ ...f, values: [...f.values, v], newValue: '' }));
  }

  removeValue(i: number) {
    this.form.update((f) => ({ ...f, values: f.values.filter((_, idx) => idx !== i) }));
  }

  save() {
    const f = this.form();
    if (!f.key.trim()) { this.formError.set('Option key is required (e.g. Weight)'); return; }
    if (f.values.length === 0) { this.formError.set('Add at least one value (e.g. 250g)'); return; }

    this.formError.set(null);
    this.saving.set(true);

    const payload: CreateVariantOptionPayload = {
      key: f.key.trim(),
      values: f.values,
      isActive: f.isActive,
      sortOrder: Number(f.sortOrder) || 0,
    };

    const id = this.editingId();
    const request = id
      ? this.catalog.updateVariantOption(id, payload)
      : this.catalog.createVariantOption(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeForm();
        this.load();
      },
      error: (err) => {
        this.formError.set(err?.error?.message ?? 'Failed to save option');
        this.saving.set(false);
      },
    });
  }

  toggleActive(option: VariantOption) {
    this.catalog.updateVariantOption(option._id, { isActive: !option.isActive }).subscribe({
      next: () => this.load(),
      error: (err) => alert(err?.error?.message ?? 'Failed to update status'),
    });
  }

  deleteOption(option: VariantOption) {
    if (!confirm(`Delete option "${option.key}"? This cannot be undone.`)) return;
    this.catalog.deleteVariantOption(option._id).subscribe({
      next: () => this.options.update((list) => list.filter((o) => o._id !== option._id)),
      error: (err) => alert(err?.error?.message ?? 'Failed to delete option'),
    });
  }
}
