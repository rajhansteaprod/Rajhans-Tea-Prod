import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CatalogService, Collection, CreateCollectionPayload } from '../../../core/services/catalog.service';

interface CollectionForm {
  name: string;
  description: string;
  image: string;
  isFeatured: boolean;
  sortOrder: number;
  isActive: boolean;
}

const emptyForm = (): CollectionForm => ({
  name: '', description: '', image: '', isFeatured: false, sortOrder: 0, isActive: true,
});

@Component({
  selector: 'app-collection-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './collection-list.html',
  styleUrls: ['./collection-list.scss'],
})
export class CollectionListComponent implements OnInit {
  collections    = signal<Collection[]>([]);
  loading        = signal(false);
  saving         = signal(false);
  uploadingImage = signal(false);
  formError   = signal<string | null>(null);
  showCreate  = signal(false);
  editingId   = signal<string | null>(null);
  editForm    = signal<CollectionForm>(emptyForm());
  createForm  = signal<CollectionForm>(emptyForm());

  constructor(private catalog: CatalogService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.catalog.getCollections({ limit: 100 }).subscribe({
      next: (res) => { this.collections.set(res.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
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
    const payload: CreateCollectionPayload = {
      name:        f.name,
      description: f.description || undefined,
      image:       f.image || undefined,
      isFeatured:  f.isFeatured,
      sortOrder:   f.sortOrder,
      isActive:    f.isActive,
    };
    this.catalog.createCollection(payload).subscribe({
      next: (res) => {
        this.collections.update((list) => [...list, res.data]);
        this.saving.set(false);
        this.showCreate.set(false);
      },
      error: (err) => {
        this.formError.set(err?.error?.message ?? 'Failed to create collection');
        this.saving.set(false);
      },
    });
  }

  openEdit(col: Collection) {
    this.editingId.set(col._id);
    this.editForm.set({
      name:        col.name,
      description: col.description ?? '',
      image:       col.image ?? '',
      isFeatured:  col.isFeatured ?? false,
      sortOrder:   col.sortOrder ?? 0,
      isActive:    col.isActive ?? true,
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
    this.catalog.updateCollection(id, {
      name:        f.name || undefined,
      description: f.description || undefined,
      image:       f.image || undefined,
      isFeatured:  f.isFeatured,
      sortOrder:   f.sortOrder,
      isActive:    f.isActive,
    }).subscribe({
      next: (res) => {
        this.collections.update((list) => list.map((c) => c._id === id ? res.data : c));
        this.saving.set(false);
        this.editingId.set(null);
      },
      error: (err) => {
        this.formError.set(err?.error?.message ?? 'Failed to update collection');
        this.saving.set(false);
      },
    });
  }

  onImageSelect(event: Event, target: 'create' | 'edit') {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingImage.set(true);
    this.catalog.uploadImage(file).subscribe({
      next: (res) => {
        const url = res.data.url;
        if (target === 'edit') {
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

  deleteCollection(id: string) {
    if (!confirm('Delete this collection?')) return;
    this.catalog.deleteCollection(id).subscribe({
      next: () => this.collections.update((list) => list.filter((c) => c._id !== id)),
      error: (err) => alert(err?.error?.message ?? 'Failed to delete collection'),
    });
  }
}
