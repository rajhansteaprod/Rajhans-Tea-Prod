import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CatalogService, Category, CreateCategoryPayload } from '../../../core/services/catalog.service';

interface CategoryForm {
  name: string;
  description: string;
  image: string;
  parentId: string;
  sortOrder: number;
  isActive: boolean;
}

const emptyForm = (): CategoryForm => ({
  name: '', description: '', image: '', parentId: '', sortOrder: 0, isActive: true,
});

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './category-list.html',
  styleUrls: ['./category-list.scss'],
})
export class CategoryListComponent implements OnInit {
  categories     = signal<Category[]>([]);
  loading        = signal(false);
  saving         = signal(false);
  uploadingImage = signal(false);
  formError   = signal<string | null>(null);
  showCreate  = signal(false);
  editingId   = signal<string | null>(null);
  editForm    = signal<CategoryForm>(emptyForm());
  createForm  = signal<CategoryForm>(emptyForm());

  constructor(private catalog: CatalogService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.catalog.getCategories({ limit: 100 }).subscribe({
      next: (res) => { this.categories.set(res.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  updateForm(form: CategoryForm, key: keyof CategoryForm, value: unknown) {
    if (this.editingId()) {
      this.editForm.update((f) => ({ ...f, [key]: value }));
    } else {
      this.createForm.update((f) => ({ ...f, [key]: value }));
    }
  }

  openCreate() {
    this.createForm.set(emptyForm());
    this.formError.set(null);
    this.editingId.set(null);
    this.showCreate.set(true);
  }

  saveCreate() {
    const f = this.createForm();
    if (!f.name.trim()) { this.formError.set('Name is required'); return; }
    this.formError.set(null);
    this.saving.set(true);
    const payload: CreateCategoryPayload = {
      name:        f.name,
      description: f.description || undefined,
      image:       f.image || undefined,
      parentId:    f.parentId || undefined,
      sortOrder:   f.sortOrder,
      isActive:    f.isActive,
    };
    this.catalog.createCategory(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.showCreate.set(false);
        this.load();
      },
      error: (err) => {
        this.formError.set(err?.error?.message ?? 'Failed to create category');
        this.saving.set(false);
      },
    });
  }

  openEdit(cat: Category) {
    this.editingId.set(cat._id);
    this.editForm.set({
      name:        cat.name,
      description: cat.description ?? '',
      image:       cat.image ?? '',
      parentId:    cat.parent?._id ?? '',
      sortOrder:   cat.sortOrder ?? 0,
      isActive:    cat.isActive ?? true,
    });
    this.formError.set(null);
    this.showCreate.set(false);
  }

  cancelEdit() { this.editingId.set(null); this.formError.set(null); }

  saveEdit() {
    const id = this.editingId();
    if (!id) return;
    const f = this.editForm();
    this.formError.set(null);
    this.saving.set(true);
    this.catalog.updateCategory(id, {
      name:        f.name || undefined,
      description: f.description || undefined,
      image:       f.image || undefined,
      parentId:    f.parentId || null,
      sortOrder:   f.sortOrder,
      isActive:    f.isActive,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.editingId.set(null);
        this.load();
      },
      error: (err) => {
        this.formError.set(err?.error?.message ?? 'Failed to update category');
        this.saving.set(false);
      },
    });
  }

  toggleActive(cat: Category) {
    this.saving.set(true);
    this.catalog.updateCategory(cat._id, { isActive: !cat.isActive }).subscribe({
      next: () => { this.saving.set(false); this.load(); },
      error: (err) => { this.saving.set(false); alert(err?.error?.message ?? 'Failed to update status'); },
    });
  }

  onImageSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingImage.set(true);
    this.catalog.uploadImage(file).subscribe({
      next: (res) => {
        const url = res.data.url;
        if (this.editingId()) {
          this.editForm.update((f) => ({ ...f, image: url }));
        } else {
          this.createForm.update((f) => ({ ...f, image: url }));
        }
        this.uploadingImage.set(false);
      },
      error: () => {
        this.uploadingImage.set(false);
        alert('Failed to upload image');
      },
    });
  }

  deleteCategory(id: string) {
    if (!confirm('Delete this category? This cannot be undone.')) return;
    this.catalog.deleteCategory(id).subscribe({
      next: () => this.categories.update((list) => list.filter((c) => c._id !== id)),
      error: (err) => alert(err?.error?.message ?? 'Failed to delete category'),
    });
  }

  deleteAll() {
    if (!confirm('Delete ALL categories? This cannot be undone.')) return;
    this.saving.set(true);
    this.catalog.deleteAllCategories().subscribe({
      next: () => { this.saving.set(false); this.categories.set([]); },
      error: (err) => {
        this.saving.set(false);
        alert(err?.error?.message ?? 'Failed to delete categories');
      },
    });
  }
}
