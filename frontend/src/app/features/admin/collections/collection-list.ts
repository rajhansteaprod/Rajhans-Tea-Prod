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
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Collections</h1>
          <p class="page-subtitle">Curate product groups for your storefront</p>
        </div>
        <button class="btn-primary-create" (click)="openCreate()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Add Collection
        </button>
      </div>

      <!-- Grid of collection cards -->
      @if (loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Loading collections…</span>
        </div>
      } @else if (collections().length === 0) {
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <p>No collections yet. Create your first one.</p>
        </div>
      } @else {
        <div class="collection-grid">
          @for (col of collections(); track col._id) {
            <div class="collection-card" [class.editing]="editingId() === col._id">
              <div class="card-image">
                @if (col.image) {
                  <img [src]="col.image" [alt]="col.name" />
                } @else {
                  <div class="image-placeholder">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
                      <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                      <polyline points="21 15 16 10 5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                  </div>
                }
                <div class="card-badges">
                  @if (col.isFeatured) {
                    <span class="badge featured">Featured</span>
                  }
                  <span class="badge status" [class.active]="col.isActive" [class.inactive]="!col.isActive">
                    {{ col.isActive ? 'Active' : 'Inactive' }}
                  </span>
                </div>
              </div>
              <div class="card-body">
                <h3 class="card-name">{{ col.name }}</h3>
                <p class="card-meta">
                  <span class="slug-badge">{{ col.slug }}</span>
                  <span class="product-count">{{ col.productCount ?? 0 }} products</span>
                </p>
                @if (col.description) {
                  <p class="card-desc">{{ col.description }}</p>
                }
              </div>
              <div class="card-actions">
                <button class="icon-btn edit" (click)="openEdit(col)" title="Edit">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  Edit
                </button>
                <button class="icon-btn delete" (click)="deleteCollection(col._id)" title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  Delete
                </button>
              </div>

              <!-- Inline edit panel -->
              @if (editingId() === col._id) {
                <div class="edit-panel">
                  <div class="form-grid">
                    <div class="form-field">
                      <label class="form-label">Name *</label>
                      <input class="form-input" type="text" [ngModel]="editForm().name"
                        (ngModelChange)="editForm.update(f=>({...f,name:$event}))" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Image URL</label>
                      <input class="form-input" type="text" [ngModel]="editForm().image"
                        (ngModelChange)="editForm.update(f=>({...f,image:$event}))" placeholder="/uploads/image.jpg" />
                    </div>
                    <div class="form-field full-width">
                      <label class="form-label">Description</label>
                      <textarea class="form-input" rows="2" [ngModel]="editForm().description"
                        (ngModelChange)="editForm.update(f=>({...f,description:$event}))"></textarea>
                    </div>
                    <div class="form-field">
                      <label class="form-label">Sort Order</label>
                      <input class="form-input" type="number" [ngModel]="editForm().sortOrder"
                        (ngModelChange)="editForm.update(f=>({...f,sortOrder:+$event}))" min="0" />
                    </div>
                    <div class="form-field toggles">
                      <label class="toggle-label">
                        <input type="checkbox" [ngModel]="editForm().isFeatured"
                          (ngModelChange)="editForm.update(f=>({...f,isFeatured:$event}))" />
                        Featured
                      </label>
                      <label class="toggle-label">
                        <input type="checkbox" [ngModel]="editForm().isActive"
                          (ngModelChange)="editForm.update(f=>({...f,isActive:$event}))" />
                        Active
                      </label>
                    </div>
                  </div>
                  @if (formError()) {
                    <div class="form-error">{{ formError() }}</div>
                  }
                  <div class="edit-actions">
                    <button class="btn-cancel" (click)="cancelEdit()">Cancel</button>
                    <button class="btn-save" (click)="saveEdit()" [disabled]="saving()">
                      {{ saving() ? 'Saving…' : 'Save' }}
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Create modal -->
    @if (showCreate()) {
      <div class="modal-overlay" (click)="showCreate.set(false)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">Add Collection</h2>
            <button class="modal-close" (click)="showCreate.set(false)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-field">
                <label class="form-label">Name *</label>
                <input class="form-input" type="text" [ngModel]="createForm().name"
                  (ngModelChange)="createForm.update(f=>({...f,name:$event}))" placeholder="e.g. New Arrivals" />
              </div>
              <div class="form-field">
                <label class="form-label">Image URL</label>
                <input class="form-input" type="text" [ngModel]="createForm().image"
                  (ngModelChange)="createForm.update(f=>({...f,image:$event}))" placeholder="/uploads/image.jpg" />
              </div>
              <div class="form-field full-width">
                <label class="form-label">Description</label>
                <textarea class="form-input" rows="2" [ngModel]="createForm().description"
                  (ngModelChange)="createForm.update(f=>({...f,description:$event}))"
                  placeholder="Optional description"></textarea>
              </div>
              <div class="form-field">
                <label class="form-label">Sort Order</label>
                <input class="form-input" type="number" [ngModel]="createForm().sortOrder"
                  (ngModelChange)="createForm.update(f=>({...f,sortOrder:+$event}))" min="0" />
              </div>
              <div class="form-field toggles">
                <label class="toggle-label">
                  <input type="checkbox" [ngModel]="createForm().isFeatured"
                    (ngModelChange)="createForm.update(f=>({...f,isFeatured:$event}))" />
                  Featured
                </label>
              </div>
            </div>
          </div>
          @if (formError()) {
            <div class="modal-error">{{ formError() }}</div>
          }
          <div class="modal-footer">
            <button class="btn-cancel" (click)="showCreate.set(false)">Cancel</button>
            <button class="btn-save" (click)="saveCreate()" [disabled]="saving() || !createForm().name">
              {{ saving() ? 'Creating…' : 'Create Collection' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .page { padding: $space-xl 0; }

    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: $space-xl; gap: $space-md; flex-wrap: wrap;
    }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; letter-spacing: $letter-spacing-tight; margin: 0 0 4px; }
    .page-subtitle { font-size: $font-size-sm; color: $color-text-tertiary; margin: 0; }

    .btn-primary-create {
      display: flex; align-items: center; gap: $space-xs;
      background: $color-primary; color: white; border: none;
      padding: $space-sm $space-md; border-radius: $radius-md;
      font-size: $font-size-sm; font-weight: $font-weight-semibold;
      cursor: pointer; transition: background $transition-fast; white-space: nowrap;
      &:hover { background: $color-primary-hover; }
    }

    .loading-state, .empty-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: $space-md; padding: $space-xxxl;
      color: $color-text-tertiary; font-size: $font-size-sm;
    }
    .spinner {
      width: 24px; height: 24px; border: 2px solid $color-border;
      border-top-color: $color-primary; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .collection-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: $space-lg;
    }

    .collection-card {
      background: $color-bg-tertiary; border-radius: $radius-xl;
      border: 1px solid $color-border-light; overflow: hidden;
      transition: box-shadow $transition-fast;
      &:hover { box-shadow: $shadow-md; }
      &.editing { border-color: $color-primary; box-shadow: $shadow-glow; }
    }

    .card-image {
      position: relative; height: 160px; overflow: hidden;
      background: $color-bg-secondary;
      img { width: 100%; height: 100%; object-fit: cover; }
    }

    .image-placeholder {
      width: 100%; height: 100%; display: flex; align-items: center;
      justify-content: center; color: $color-text-disabled;
    }

    .card-badges {
      position: absolute; top: $space-sm; right: $space-sm;
      display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end;
    }

    .badge {
      font-size: 10px; font-weight: $font-weight-semibold;
      padding: 2px 6px; border-radius: $radius-full;
      &.featured { background: rgba(204,88,3,0.9); color: white; }
      &.status.active   { background: rgba(87,136,108,0.9);  color: white; }
      &.status.inactive { background: rgba(58,45,50,0.7);    color: white; }
    }

    .card-body { padding: $space-md; }
    .card-name { font-size: $font-size-md; font-weight: $font-weight-semibold; color: $color-text-primary; margin: 0 0 $space-xs; }
    .card-meta { display: flex; align-items: center; gap: $space-sm; margin: 0 0 $space-xs; }
    .slug-badge { font-size: 11px; font-family: monospace; background: $color-bg-secondary; padding: 2px 6px; border-radius: $radius-sm; color: $color-text-tertiary; }
    .product-count { font-size: $font-size-xs; color: $color-text-tertiary; }
    .card-desc { font-size: $font-size-xs; color: $color-text-secondary; margin: 0; line-height: $line-height-relaxed; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    .card-actions {
      display: flex; border-top: 1px solid $color-border-light;
      button { flex: 1; }
    }

    .icon-btn {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: $space-sm; border: none; background: transparent;
      font-size: $font-size-xs; font-weight: $font-weight-medium;
      cursor: pointer; transition: all $transition-fast;
      color: $color-text-tertiary;
      &.edit:hover  { background: $color-primary-light;  color: $color-primary; }
      &.delete:hover { background: rgba(192,57,43,0.06); color: $color-error; }
    }

    .edit-panel { padding: $space-md; border-top: 2px solid $color-primary; background: rgba(204,88,3,0.02); }
    .edit-actions { display: flex; justify-content: flex-end; gap: $space-sm; margin-top: $space-md; }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: $space-sm; }
    .full-width { grid-column: 1 / -1; }
    .form-field { display: flex; flex-direction: column; gap: 4px; }
    .form-label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-secondary; text-transform: uppercase; letter-spacing: $letter-spacing-wide; }
    .toggles { flex-direction: row; align-items: center; gap: $space-md; padding-top: 18px; }
    .toggle-label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-secondary; text-transform: uppercase; letter-spacing: $letter-spacing-wide; }

    .form-input, .form-select {
      padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md;
      font-size: $font-size-sm; color: $color-text-primary; background: $color-bg-tertiary;
      transition: border-color $transition-fast; outline: none; width: 100%; box-sizing: border-box;
      &:focus { border-color: $color-border-focus; box-shadow: $shadow-glow; }
    }
    textarea.form-input { resize: vertical; font-family: inherit; }

    .btn-cancel {
      padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md;
      background: transparent; font-size: $font-size-sm; color: $color-text-secondary;
      cursor: pointer; transition: all $transition-fast;
      &:hover { background: $color-bg-secondary; }
    }
    .btn-save {
      padding: $space-sm $space-lg; background: $color-primary; color: white; border: none;
      border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold;
      cursor: pointer; transition: background $transition-fast;
      &:hover:not(:disabled) { background: $color-primary-hover; }
      &:disabled { opacity: 0.5; cursor: default; }
    }
    .form-error { margin: $space-sm 0; padding: $space-xs $space-sm; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; color: #ef4444; font-size: 13px; }
    .modal-error { margin: 0 $space-lg $space-sm; padding: $space-xs $space-sm; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; color: #ef4444; font-size: 13px; }

    .modal-overlay {
      position: fixed; inset: 0; background: rgba(58,45,50,0.5);
      backdrop-filter: blur(4px); z-index: 1040;
      display: flex; align-items: center; justify-content: center; padding: $space-lg;
    }
    .modal-box { background: $color-bg-tertiary; border-radius: $radius-xl; width: 100%; max-width: 560px; box-shadow: 0 16px 48px rgba(58,45,50,0.2); overflow: hidden; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: $space-lg; border-bottom: 1px solid $color-border-light; }
    .modal-title { font-size: $font-size-lg; font-weight: $font-weight-bold; color: $color-text-primary; margin: 0; }
    .modal-close { width: 32px; height: 32px; border: none; background: transparent; border-radius: $radius-md; cursor: pointer; color: $color-text-tertiary; display: flex; align-items: center; justify-content: center; transition: all $transition-fast; &:hover { background: $color-bg-secondary; } }
    .modal-body { padding: $space-lg; }
    .modal-footer { display: flex; justify-content: flex-end; gap: $space-sm; padding: $space-md $space-lg; border-top: 1px solid $color-border-light; }
  `],
})
export class CollectionListComponent implements OnInit {
  collections = signal<Collection[]>([]);
  loading     = signal(false);
  saving      = signal(false);
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
      isFeatured:  col.isFeatured,
      sortOrder:   col.sortOrder,
      isActive:    col.isActive,
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

  deleteCollection(id: string) {
    if (!confirm('Delete this collection?')) return;
    this.catalog.deleteCollection(id).subscribe({
      next: () => this.collections.update((list) => list.filter((c) => c._id !== id)),
      error: (err) => alert(err?.error?.message ?? 'Failed to delete collection'),
    });
  }
}
