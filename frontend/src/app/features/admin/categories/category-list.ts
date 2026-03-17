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
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Categories</h1>
          <p class="page-subtitle">Organise your product taxonomy</p>
        </div>
        <button class="btn-primary-create" (click)="openCreate()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Add Category
        </button>
      </div>

      <!-- Table -->
      <div class="table-card">
        @if (loading()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <span>Loading categories…</span>
          </div>
        } @else if (categories().length === 0) {
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <p>No categories yet. Create your first one.</p>
          </div>
        } @else {
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Parent</th>
                <th>Order</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (cat of categories(); track cat._id) {
                <tr [class.editing]="editingId() === cat._id">
                  <td>
                    <div class="cell-primary">{{ cat.name }}</div>
                  </td>
                  <td><span class="slug-badge">{{ cat.slug }}</span></td>
                  <td>{{ cat.parent?.name ?? '—' }}</td>
                  <td>{{ cat.sortOrder }}</td>
                  <td>
                    <span class="status-badge" [class.active]="cat.isActive" [class.inactive]="!cat.isActive">
                      {{ cat.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td>
                    <div class="action-btns">
                      <button class="icon-btn edit" (click)="openEdit(cat)" title="Edit">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                      </button>
                      <button class="icon-btn delete" (click)="deleteCategory(cat._id)" title="Delete">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                          <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>

                <!-- Inline edit panel -->
                @if (editingId() === cat._id) {
                  <tr class="edit-row">
                    <td colspan="6">
                      <div class="edit-panel">
                        <ng-container *ngTemplateOutlet="formFields; context: { form: editForm() }"></ng-container>
                        @if (formError()) {
                          <div class="form-error">{{ formError() }}</div>
                        }
                        <div class="edit-actions">
                          <button class="btn-cancel" (click)="cancelEdit()">Cancel</button>
                          <button class="btn-save" (click)="saveEdit()" [disabled]="saving()">
                            {{ saving() ? 'Saving…' : 'Save Changes' }}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        }
      </div>
    </div>

    <!-- Create modal -->
    @if (showCreate()) {
      <div class="modal-overlay" (click)="showCreate.set(false)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">Add Category</h2>
            <button class="modal-close" (click)="showCreate.set(false)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <ng-container *ngTemplateOutlet="formFields; context: { form: createForm() }"></ng-container>
          </div>
          @if (formError()) {
            <div class="modal-error">{{ formError() }}</div>
          }
          <div class="modal-footer">
            <button class="btn-cancel" (click)="showCreate.set(false)">Cancel</button>
            <button class="btn-save" (click)="saveCreate()" [disabled]="saving() || !createForm().name">
              {{ saving() ? 'Creating…' : 'Create Category' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Reusable form fields template -->
    <ng-template #formFields let-form="form">
      <div class="form-grid">
        <div class="form-field">
          <label class="form-label">Name *</label>
          <input class="form-input" type="text" [ngModel]="form.name"
            (ngModelChange)="updateForm(form, 'name', $event)" placeholder="e.g. Men's Clothing" />
        </div>
        <div class="form-field">
          <label class="form-label">Parent Category</label>
          <select class="form-select" [ngModel]="form.parentId"
            (ngModelChange)="updateForm(form, 'parentId', $event)">
            <option value="">No parent (root)</option>
            @for (cat of categories(); track cat._id) {
              <option [value]="cat._id">{{ cat.name }}</option>
            }
          </select>
        </div>
        <div class="form-field full-width">
          <label class="form-label">Description</label>
          <textarea class="form-input" rows="2" [ngModel]="form.description"
            (ngModelChange)="updateForm(form, 'description', $event)"
            placeholder="Optional description"></textarea>
        </div>
        <div class="form-field">
          <label class="form-label">Image URL</label>
          <input class="form-input" type="text" [ngModel]="form.image"
            (ngModelChange)="updateForm(form, 'image', $event)" placeholder="/uploads/image.jpg" />
        </div>
        <div class="form-field">
          <label class="form-label">Sort Order</label>
          <input class="form-input" type="number" [ngModel]="form.sortOrder"
            (ngModelChange)="updateForm(form, 'sortOrder', +$event)" min="0" />
        </div>
        <div class="form-field">
          <label class="form-label toggle-label">
            <input type="checkbox" [ngModel]="form.isActive"
              (ngModelChange)="updateForm(form, 'isActive', $event)" />
            Active
          </label>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    @use '../../../core/design-tokens/mixins' as *;

    .page { padding: $space-xl 0; }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: $space-xl;
      gap: $space-md;
      flex-wrap: wrap;
    }

    .page-title {
      font-size: $font-size-xxl;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      letter-spacing: $letter-spacing-tight;
      margin: 0 0 4px;
    }

    .page-subtitle {
      font-size: $font-size-sm;
      color: $color-text-tertiary;
      margin: 0;
    }

    .btn-primary-create {
      display: flex;
      align-items: center;
      gap: $space-xs;
      background: $color-primary;
      color: white;
      border: none;
      padding: $space-sm $space-md;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      cursor: pointer;
      transition: background $transition-fast;
      white-space: nowrap;
      &:hover { background: $color-primary-hover; }
    }

    .table-card {
      background: $color-bg-tertiary;
      border-radius: $radius-xl;
      border: 1px solid $color-border-light;
      overflow: hidden;
    }

    .loading-state, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: $space-md;
      padding: $space-xxxl;
      color: $color-text-tertiary;
      font-size: $font-size-sm;
    }

    .spinner {
      width: 24px; height: 24px;
      border: 2px solid $color-border;
      border-top-color: $color-primary;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: $font-size-sm;
    }

    th {
      text-align: left;
      padding: $space-sm $space-md;
      font-size: 11px;
      font-weight: $font-weight-semibold;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
      color: $color-text-tertiary;
      border-bottom: 1px solid $color-border-light;
      background: $color-bg-secondary;
    }

    td {
      padding: $space-sm $space-md;
      color: $color-text-secondary;
      border-bottom: 1px solid $color-border-light;
      vertical-align: middle;
    }

    tr:last-child td { border-bottom: none; }
    tr:hover td { background: $color-bg-secondary; }
    tr.editing td { background: rgba(204, 88, 3, 0.03); }

    .cell-primary {
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    .slug-badge {
      font-size: 11px;
      font-family: monospace;
      background: $color-bg-secondary;
      padding: 2px 6px;
      border-radius: $radius-sm;
      color: $color-text-tertiary;
    }

    .status-badge {
      font-size: 11px;
      font-weight: $font-weight-semibold;
      padding: 2px 8px;
      border-radius: $radius-full;
      &.active   { background: rgba(87,136,108,0.12); color: $color-secondary; }
      &.inactive { background: rgba(176,0,32,0.08);   color: $color-error; }
    }

    .action-btns {
      display: flex;
      gap: $space-xs;
    }

    .icon-btn {
      width: 30px; height: 30px;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid $color-border-light;
      border-radius: $radius-md;
      background: transparent;
      cursor: pointer;
      transition: all $transition-fast;
      color: $color-text-tertiary;

      &.edit:hover  { border-color: $color-primary; color: $color-primary; background: $color-primary-light; }
      &.delete:hover { border-color: $color-error;  color: $color-error;   background: rgba(192,57,43,0.06); }
    }

    .edit-row td { padding: 0; background: rgba(204, 88, 3, 0.02); }

    .edit-panel {
      padding: $space-lg;
      border-top: 2px solid $color-primary;
    }

    .edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: $space-sm;
      margin-top: $space-md;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: $space-md;
    }

    .full-width { grid-column: 1 / -1; }

    .form-field { display: flex; flex-direction: column; gap: 4px; }

    .form-label {
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
      color: $color-text-secondary;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
    }

    .toggle-label {
      display: flex;
      align-items: center;
      gap: $space-xs;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
    }

    .form-input, .form-select {
      padding: $space-sm $space-md;
      border: 1px solid $color-border;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      color: $color-text-primary;
      background: $color-bg-tertiary;
      transition: border-color $transition-fast;
      outline: none;
      width: 100%;
      box-sizing: border-box;
      &:focus { border-color: $color-border-focus; box-shadow: $shadow-glow; }
    }

    textarea.form-input { resize: vertical; font-family: inherit; }

    .btn-cancel {
      padding: $space-sm $space-md;
      border: 1px solid $color-border;
      border-radius: $radius-md;
      background: transparent;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      cursor: pointer;
      transition: all $transition-fast;
      &:hover { background: $color-bg-secondary; }
    }

    .btn-save {
      padding: $space-sm $space-lg;
      background: $color-primary;
      color: white;
      border: none;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      cursor: pointer;
      transition: background $transition-fast;
      &:hover:not(:disabled) { background: $color-primary-hover; }
      &:disabled { opacity: 0.5; cursor: default; }
    }

    .form-error, .modal-error {
      margin: $space-sm 0;
      padding: $space-xs $space-sm;
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 6px;
      color: #ef4444;
      font-size: 13px;
    }

    .modal-error { margin: 0 $space-lg $space-sm; }

    // Modal
    .modal-overlay {
      position: fixed; inset: 0;
      background: rgba(58,45,50,0.5);
      backdrop-filter: blur(4px);
      z-index: $z-modal-backdrop;
      display: flex; align-items: center; justify-content: center;
      padding: $space-lg;
    }
    .modal-box {
      background: $color-bg-tertiary;
      border-radius: $radius-xl;
      width: 100%; max-width: 560px;
      box-shadow: $shadow-xl;
      overflow: hidden;
    }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: $space-lg;
      border-bottom: 1px solid $color-border-light;
    }
    .modal-title {
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      margin: 0;
    }
    .modal-close {
      width: 32px; height: 32px;
      border: none; background: transparent;
      border-radius: $radius-md;
      cursor: pointer;
      color: $color-text-tertiary;
      display: flex; align-items: center; justify-content: center;
      transition: all $transition-fast;
      &:hover { background: $color-bg-secondary; color: $color-text-primary; }
    }
    .modal-body { padding: $space-lg; }
    .modal-footer {
      display: flex; justify-content: flex-end;
      gap: $space-sm;
      padding: $space-md $space-lg;
      border-top: 1px solid $color-border-light;
    }
  `],
})
export class CategoryListComponent implements OnInit {
  categories  = signal<Category[]>([]);
  loading     = signal(false);
  saving      = signal(false);
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
    };
    this.catalog.createCategory(payload).subscribe({
      next: (res) => {
        this.categories.update((list) => [...list, res.data]);
        this.saving.set(false);
        this.showCreate.set(false);
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
      sortOrder:   cat.sortOrder,
      isActive:    cat.isActive,
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
      next: (res) => {
        this.categories.update((list) => list.map((c) => c._id === id ? res.data : c));
        this.saving.set(false);
        this.editingId.set(null);
      },
      error: (err) => {
        this.formError.set(err?.error?.message ?? 'Failed to update category');
        this.saving.set(false);
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
}
