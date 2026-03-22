import { Component, OnInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  CatalogService, Product, Category, Collection,
  CreateProductPayload, UpdateProductPayload,
} from '../../../../core/services/catalog.service';

interface AttributeEntry { key: string; value: string; }

interface ProductForm {
  name: string;
  description: string;
  shortDescription: string;
  categoryId: string;
  collectionIds: string[];
  basePrice: number | '';
  images: string[];
  attributes: AttributeEntry[];
  tags: string;
  status: 'draft' | 'active' | 'archived';
  isFeatured: boolean;
  stock: number;
  trackInventory: boolean;
}

const emptyForm = (): ProductForm => ({
  name: '', description: '', shortDescription: '',
  categoryId: '', collectionIds: [], basePrice: '',
  images: [], attributes: [], tags: '',
  status: 'draft', isFeatured: false,
  stock: 0, trackInventory: false,
});

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Products</h1>
          <p class="page-subtitle">
            @if (meta()) { {{ meta()!.total }} products in your catalog }
          </p>
        </div>
        <button class="btn-primary-create" (click)="openCreate()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Add Product
        </button>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <div class="search-box">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input type="text" class="search-input" placeholder="Search products…"
            [ngModel]="search()" (ngModelChange)="onSearch($event)" />
        </div>
        <select class="filter-select" [ngModel]="statusFilter()"
          (ngModelChange)="statusFilter.set($event); currentPage.set(1)">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <select class="filter-select" [ngModel]="categoryFilter()"
          (ngModelChange)="categoryFilter.set($event); currentPage.set(1)">
          <option value="">All categories</option>
          @for (cat of categories(); track cat._id) {
            <option [value]="cat._id">{{ cat.name }}</option>
          }
        </select>
      </div>

      <!-- Table -->
      <div class="table-card">
        @if (loading()) {
          <div class="loading-state"><div class="spinner"></div><span>Loading…</span></div>
        } @else if (products().length === 0) {
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            <p>No products found.</p>
          </div>
        } @else {
          <table class="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Featured</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (product of products(); track product._id) {
                <tr>
                  <td>
                    <div class="product-cell">
                      <div class="product-thumb">
                        @if (product.images[0]) {
                          <img [src]="product.images[0]" [alt]="product.name" />
                        } @else {
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
                            <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                            <polyline points="21 15 16 10 5 21" stroke="currentColor" stroke-width="1.5"/>
                          </svg>
                        }
                      </div>
                      <div>
                        <div class="product-name">{{ product.name }}</div>
                        <div class="product-slug">{{ product.slug }}</div>
                      </div>
                    </div>
                  </td>
                  <td>{{ product.category.name }}</td>
                  <td class="price-cell">₹{{ product.basePrice | number }}</td>
                  <td>
                    @if (product.trackInventory) {
                      <span class="stock-val" [class.low]="(product.stock ?? 0) <= 5" [class.out]="(product.stock ?? 0) === 0">{{ product.stock ?? 0 }}</span>
                    } @else {
                      <span class="stock-off">—</span>
                    }
                  </td>
                  <td>
                    <span class="status-badge" [class]="product.status">{{ product.status }}</span>
                  </td>
                  <td>
                    @if (product.isFeatured) {
                      <span class="featured-dot" title="Featured">★</span>
                    }
                  </td>
                  <td>
                    <div class="action-btns">
                      <button class="icon-btn preview" (click)="previewProduct(product._id)" title="Preview">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/>
                          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
                        </svg>
                      </button>
                      <button class="icon-btn edit" (click)="openEdit(product)" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                      </button>
                      <button class="icon-btn delete" (click)="deleteProduct(product._id)" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <!-- Pagination -->
          @if (meta() && meta()!.totalPages > 1) {
            <div class="pagination">
              <button class="page-btn" (click)="currentPage.update(p => p - 1)"
                [disabled]="currentPage() === 1">‹ Prev</button>
              <span class="page-info">{{ currentPage() }} / {{ meta()!.totalPages }}</span>
              <button class="page-btn" (click)="currentPage.update(p => p + 1)"
                [disabled]="currentPage() === meta()!.totalPages">Next ›</button>
            </div>
          }
        }
      </div>
    </div>

    <!-- Product Form Modal (Create / Edit) -->
    @if (showForm()) {
      <div class="modal-overlay" (click)="closeForm()">
        <div class="modal-box large" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">{{ editingId() ? 'Edit Product' : 'Add Product' }}</h2>
            <button class="modal-close" (click)="closeForm()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="modal-body scrollable">
            <div class="form-section">
              <h3 class="section-title">Basic Info</h3>
              <div class="form-grid-3">
                <div class="form-field span-2">
                  <label class="form-label">Name *</label>
                  <input class="form-input" type="text" [ngModel]="form().name"
                    (ngModelChange)="form.update(f=>({...f,name:$event}))" placeholder="Product name" />
                </div>
                <div class="form-field">
                  <label class="form-label">Status</label>
                  <select class="form-select" [ngModel]="form().status"
                    (ngModelChange)="form.update(f=>({...f,status:$event}))">
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div class="form-field span-3">
                  <label class="form-label">Short Description</label>
                  <input class="form-input" type="text" [ngModel]="form().shortDescription"
                    (ngModelChange)="form.update(f=>({...f,shortDescription:$event}))"
                    placeholder="One-line summary (max 300 chars)" maxlength="300" />
                </div>
                <div class="form-field">
                  <label class="form-label">Base Price (₹) *</label>
                  <input class="form-input" type="number" min="0" [ngModel]="form().basePrice"
                    (ngModelChange)="form.update(f=>({...f,basePrice:$event}))" placeholder="0" />
                </div>
                <div class="form-field">
                  <label class="form-label">Stock Quantity</label>
                  <input class="form-input" type="number" min="0" [ngModel]="form().stock"
                    (ngModelChange)="form.update(f=>({...f,stock:$event}))" placeholder="0" />
                </div>
                <div class="form-field">
                  <label class="form-label">Inventory Tracking</label>
                  <label class="toggle-label">
                    <input type="checkbox" [ngModel]="form().trackInventory"
                      (ngModelChange)="form.update(f=>({...f,trackInventory:$event}))" />
                    Enable
                  </label>
                </div>
                <div class="form-field span-3">
                  <label class="form-label">Description</label>
                  <textarea class="form-input" rows="4" [ngModel]="form().description"
                    (ngModelChange)="form.update(f=>({...f,description:$event}))"
                    placeholder="Full product description…"></textarea>
                </div>
              </div>
            </div>

            <div class="form-section">
              <h3 class="section-title">Classification</h3>
              <div class="form-grid-2">
                <div class="form-field">
                  <label class="form-label">Category *</label>
                  <select class="form-select" [ngModel]="form().categoryId"
                    (ngModelChange)="form.update(f=>({...f,categoryId:$event}))">
                    <option value="">Select category…</option>
                    @for (cat of categories(); track cat._id) {
                      <option [value]="cat._id">{{ cat.name }}</option>
                    }
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-label">Tags <span class="hint">(comma separated)</span></label>
                  <input class="form-input" type="text" [ngModel]="form().tags"
                    (ngModelChange)="form.update(f=>({...f,tags:$event}))"
                    placeholder="cotton, organic, summer" />
                </div>
                <div class="form-field span-2">
                  <label class="form-label">Collections</label>
                  <div class="collection-picker">
                    @for (col of collections(); track col._id) {
                      <label class="collection-chip-label" [class.selected]="form().collectionIds.includes(col._id)">
                        <input type="checkbox" [checked]="form().collectionIds.includes(col._id)"
                          (change)="toggleCollection(col._id)" style="display:none" />
                        {{ col.name }}
                      </label>
                    }
                  </div>
                </div>
                <div class="form-field">
                  <label class="toggle-label">
                    <input type="checkbox" [ngModel]="form().isFeatured"
                      (ngModelChange)="form.update(f=>({...f,isFeatured:$event}))" />
                    Featured product
                  </label>
                </div>
              </div>
            </div>

            <div class="form-section">
              <h3 class="section-title">Images</h3>
              <div class="image-upload-area">
                <div class="upload-btn-wrap">
                  <label class="upload-btn" [class.loading]="uploadingImage()">
                    @if (uploadingImage()) {
                      <div class="spinner-sm"></div> Uploading…
                    } @else {
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        <polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                      Upload Image
                    }
                    <input type="file" accept="image/jpeg,image/png,image/webp" style="display:none"
                      (change)="onFileSelect($event)" [disabled]="uploadingImage()" />
                  </label>
                  <span class="upload-hint">JPEG, PNG, WebP · Max 5 MB</span>
                </div>
                @if (form().images.length > 0) {
                  <div class="image-grid">
                    @for (img of form().images; track img; let i = $index) {
                      <div class="image-item">
                        <img [src]="img" alt="Product image" />
                        <button class="remove-img" (click)="removeImage(i)" title="Remove">×</button>
                        @if (i === 0) { <span class="primary-badge">Main</span> }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>

            <div class="form-section">
              <div class="section-header">
                <h3 class="section-title">Attributes</h3>
                <button class="btn-add-attr" (click)="addAttribute()">+ Add</button>
              </div>
              @if (form().attributes.length > 0) {
                <div class="attr-list">
                  @for (attr of form().attributes; track $index; let i = $index) {
                    <div class="attr-row">
                      <input class="form-input attr-key" type="text" [ngModel]="attr.key"
                        (ngModelChange)="updateAttrKey(i, $event)" placeholder="Key (e.g. Material)" />
                      <input class="form-input attr-val" type="text" [ngModel]="attr.value"
                        (ngModelChange)="updateAttrVal(i, $event)" placeholder="Value (e.g. Cotton)" />
                      <button class="remove-attr" (click)="removeAttribute(i)">×</button>
                    </div>
                  }
                </div>
              } @else {
                <p class="empty-attrs">No attributes yet. Click "+ Add" to add specifications.</p>
              }
            </div>
          </div>

          @if (formError()) {
            <div class="modal-error">{{ formError() }}</div>
          }
          <div class="modal-footer">
            <button class="btn-cancel" (click)="closeForm()">Cancel</button>
            <button class="btn-save" (click)="saveForm()"
              [disabled]="saving() || !form().name || !form().categoryId || form().basePrice === ''">
              {{ saving() ? (editingId() ? 'Saving…' : 'Creating…') : (editingId() ? 'Save Changes' : 'Create Product') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @use '../../../../core/design-tokens/tokens' as *;

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

    .filters-bar {
      display: flex; gap: $space-sm; margin-bottom: $space-lg; flex-wrap: wrap;
    }
    .search-box {
      position: relative; flex: 1; min-width: 200px;
    }
    .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: $color-text-tertiary; pointer-events: none; }
    .search-input {
      width: 100%; padding: $space-sm $space-md $space-sm 38px;
      border: 1px solid $color-border; border-radius: $radius-md;
      font-size: $font-size-sm; color: $color-text-primary;
      background: $color-bg-tertiary; outline: none; box-sizing: border-box;
      transition: border-color $transition-fast;
      &:focus { border-color: $color-border-focus; }
    }
    .filter-select {
      padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md;
      font-size: $font-size-sm; color: $color-text-primary; background: $color-bg-tertiary;
      outline: none; cursor: pointer;
      &:focus { border-color: $color-border-focus; }
    }

    .table-card { background: $color-bg-tertiary; border-radius: $radius-xl; border: 1px solid $color-border-light; overflow: hidden; }

    .loading-state, .empty-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: $space-md; padding: $space-xxxl;
      color: $color-text-tertiary; font-size: $font-size-sm;
    }
    .spinner { width: 24px; height: 24px; border: 2px solid $color-border; border-top-color: $color-primary; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .data-table { width: 100%; border-collapse: collapse; font-size: $font-size-sm; }
    th { text-align: left; padding: $space-sm $space-md; font-size: 11px; font-weight: $font-weight-semibold; text-transform: uppercase; letter-spacing: $letter-spacing-wide; color: $color-text-tertiary; border-bottom: 1px solid $color-border-light; background: $color-bg-secondary; }
    td { padding: $space-sm $space-md; color: $color-text-secondary; border-bottom: 1px solid $color-border-light; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(252,255,247,0.8); }

    .product-cell { display: flex; align-items: center; gap: $space-sm; }
    .product-thumb {
      width: 40px; height: 40px; border-radius: $radius-md; overflow: hidden;
      background: $color-bg-secondary; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0; color: $color-text-disabled;
      img { width: 100%; height: 100%; object-fit: cover; }
    }
    .product-name { font-weight: $font-weight-medium; color: $color-text-primary; }
    .product-slug { font-size: 11px; font-family: monospace; color: $color-text-tertiary; margin-top: 2px; }
    .price-cell { font-weight: $font-weight-semibold; color: $color-text-primary; }

    .status-badge {
      font-size: 11px; font-weight: $font-weight-semibold; padding: 2px 8px; border-radius: $radius-full;
      &.draft    { background: rgba(162,126,142,0.12); color: $color-accent; }
      &.active   { background: rgba(87,136,108,0.12);  color: $color-secondary; }
      &.archived { background: rgba(58,45,50,0.08);    color: $color-text-tertiary; }
    }

    .featured-dot { color: $color-primary; font-size: $font-size-md; }
    .stock-val { font-weight: $font-weight-bold; color: $color-success; &.low { color: $color-warning; } &.out { color: $color-error; } }
    .stock-off { color: $color-text-disabled; }
    .toggle-label { display: flex; align-items: center; gap: $space-xs; font-size: $font-size-sm; color: $color-text-secondary; cursor: pointer; input { cursor: pointer; } }

    .action-btns { display: flex; gap: $space-xs; }
    .icon-btn {
      width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
      border: 1px solid $color-border-light; border-radius: $radius-md;
      background: transparent; cursor: pointer; transition: all $transition-fast;
      color: $color-text-tertiary;
      &.preview:hover { border-color: $color-secondary; color: $color-secondary; background: rgba(87,136,108,0.08); }
      &.edit:hover    { border-color: $color-primary;   color: $color-primary;   background: $color-primary-light; }
      &.delete:hover  { border-color: $color-error;     color: $color-error;     background: rgba(192,57,43,0.06); }
    }

    .pagination { display: flex; align-items: center; justify-content: center; gap: $space-md; padding: $space-md; border-top: 1px solid $color-border-light; }
    .page-btn { padding: $space-xs $space-md; border: 1px solid $color-border; border-radius: $radius-md; background: transparent; cursor: pointer; font-size: $font-size-sm; color: $color-text-secondary; transition: all $transition-fast; &:hover:not(:disabled) { background: $color-bg-secondary; } &:disabled { opacity: 0.4; cursor: default; } }
    .page-info { font-size: $font-size-sm; color: $color-text-tertiary; }

    // Modal
    .modal-overlay { position: fixed; inset: 0; background: rgba(58,45,50,0.5); backdrop-filter: blur(4px); z-index: 1040; display: flex; align-items: center; justify-content: center; padding: $space-lg; }
    .modal-box { background: $color-bg-tertiary; border-radius: $radius-xl; width: 100%; max-width: 680px; box-shadow: 0 24px 64px rgba(58,45,50,0.2); overflow: hidden; display: flex; flex-direction: column; max-height: 92vh; &.large { max-width: 800px; } }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: $space-lg; border-bottom: 1px solid $color-border-light; flex-shrink: 0; }
    .modal-title { font-size: $font-size-lg; font-weight: $font-weight-bold; color: $color-text-primary; margin: 0; }
    .modal-close { width: 32px; height: 32px; border: none; background: transparent; border-radius: $radius-md; cursor: pointer; color: $color-text-tertiary; display: flex; align-items: center; justify-content: center; transition: all $transition-fast; &:hover { background: $color-bg-secondary; } }
    .modal-body { padding: $space-lg; overflow-y: auto; flex: 1; &.scrollable { overflow-y: auto; } }
    .modal-footer { display: flex; justify-content: flex-end; gap: $space-sm; padding: $space-md $space-lg; border-top: 1px solid $color-border-light; flex-shrink: 0; }
    .modal-error { margin: 0 $space-lg $space-sm; padding: $space-xs $space-sm; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; color: #ef4444; font-size: 13px; }

    // Form sections
    .form-section { margin-bottom: $space-xl; &:last-child { margin-bottom: 0; } }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: $space-md; }
    .section-title { font-size: $font-size-sm; font-weight: $font-weight-bold; color: $color-text-primary; text-transform: uppercase; letter-spacing: $letter-spacing-wide; margin: 0 0 $space-md; }
    .form-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: $space-md; }
    .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: $space-md; }
    .span-2 { grid-column: span 2; }
    .span-3 { grid-column: span 3; }
    .form-field { display: flex; flex-direction: column; gap: 4px; }
    .form-label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-secondary; text-transform: uppercase; letter-spacing: $letter-spacing-wide; }
    .hint { font-weight: $font-weight-regular; text-transform: none; letter-spacing: 0; color: $color-text-disabled; }
    .form-input, .form-select {
      padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md;
      font-size: $font-size-sm; color: $color-text-primary; background: $color-bg-tertiary;
      transition: border-color $transition-fast; outline: none; width: 100%; box-sizing: border-box;
      &:focus { border-color: $color-border-focus; box-shadow: $shadow-glow; }
    }
    textarea.form-input { resize: vertical; font-family: inherit; }
    .toggle-label { display: flex; align-items: center; gap: $space-xs; cursor: pointer; font-size: $font-size-sm; color: $color-text-secondary; padding-top: 18px; }

    // Collection picker
    .collection-picker { display: flex; flex-wrap: wrap; gap: $space-xs; margin-top: 4px; }
    .collection-chip-label {
      padding: 4px 12px; border-radius: $radius-full; font-size: $font-size-xs;
      border: 1px solid $color-border; cursor: pointer; transition: all $transition-fast;
      color: $color-text-secondary; font-weight: $font-weight-medium;
      &:hover { border-color: $color-primary; color: $color-primary; }
      &.selected { background: $color-primary; color: white; border-color: $color-primary; }
    }

    // Image upload
    .image-upload-area { display: flex; flex-direction: column; gap: $space-md; }
    .upload-btn-wrap { display: flex; align-items: center; gap: $space-md; }
    .upload-btn {
      display: flex; align-items: center; gap: $space-xs;
      padding: $space-sm $space-md; border: 1px dashed $color-border;
      border-radius: $radius-md; cursor: pointer; font-size: $font-size-sm;
      color: $color-text-secondary; transition: all $transition-fast;
      &:hover:not(.loading) { border-color: $color-primary; color: $color-primary; background: $color-primary-light; }
      &.loading { opacity: 0.7; cursor: default; }
    }
    .upload-hint { font-size: $font-size-xs; color: $color-text-tertiary; }
    .spinner-sm { width: 14px; height: 14px; border: 2px solid rgba(204,88,3,0.3); border-top-color: $color-primary; border-radius: 50%; animation: spin 0.8s linear infinite; }
    .image-grid { display: flex; flex-wrap: wrap; gap: $space-sm; }
    .image-item { position: relative; width: 80px; height: 80px; border-radius: $radius-md; overflow: hidden; border: 1px solid $color-border-light; img { width: 100%; height: 100%; object-fit: cover; } }
    .remove-img { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; background: rgba(58,45,50,0.7); color: white; border: none; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 18px; display: flex; align-items: center; justify-content: center; &:hover { background: $color-error; } }
    .primary-badge { position: absolute; bottom: 2px; left: 2px; font-size: 9px; background: $color-primary; color: white; padding: 1px 4px; border-radius: 3px; }

    // Attributes
    .btn-add-attr { padding: 4px $space-sm; border: 1px solid $color-border; border-radius: $radius-md; background: transparent; font-size: $font-size-xs; color: $color-text-secondary; cursor: pointer; &:hover { background: $color-bg-secondary; } }
    .attr-list { display: flex; flex-direction: column; gap: $space-xs; }
    .attr-row { display: flex; gap: $space-sm; align-items: center; }
    .attr-key { flex: 0 0 180px; }
    .attr-val { flex: 1; }
    .remove-attr { width: 28px; height: 28px; border: none; background: transparent; color: $color-text-tertiary; cursor: pointer; font-size: 18px; border-radius: $radius-md; display: flex; align-items: center; justify-content: center; flex-shrink: 0; &:hover { background: rgba(192,57,43,0.08); color: $color-error; } }
    .empty-attrs { font-size: $font-size-sm; color: $color-text-tertiary; margin: 0; padding: $space-md 0; }

    .btn-cancel { padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md; background: transparent; font-size: $font-size-sm; color: $color-text-secondary; cursor: pointer; &:hover { background: $color-bg-secondary; } }
    .btn-save { padding: $space-sm $space-xl; background: $color-primary; color: white; border: none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor: pointer; transition: background $transition-fast; &:hover:not(:disabled) { background: $color-primary-hover; } &:disabled { opacity: 0.5; cursor: default; } }
  `],
})
export class ProductListComponent implements OnInit, OnDestroy {
  products       = signal<Product[]>([]);
  categories     = signal<Category[]>([]);
  collections    = signal<Collection[]>([]);
  meta           = signal<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
  loading        = signal(false);
  saving         = signal(false);
  uploadingImage = signal(false);
  formError      = signal<string | null>(null);
  showForm       = signal(false);
  editingId      = signal<string | null>(null);
  search         = signal('');
  statusFilter   = signal('all');
  categoryFilter = signal('');
  currentPage    = signal(1);
  form           = signal<ProductForm>(emptyForm());

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private loadEffect = effect(() => {
    const page     = this.currentPage();
    const search   = this.search();
    const status   = this.statusFilter();
    const category = this.categoryFilter();
    this.loadProducts(page, search, status, category);
  });

  constructor(private catalog: CatalogService, private router: Router) {}

  ngOnInit() {
    this.loadMeta();
  }

  ngOnDestroy() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
  }

  loadMeta() {
    this.catalog.getCategoriesPublic().subscribe({ next: (r) => this.categories.set(r.data) });
    this.catalog.getCollectionsPublic().subscribe({ next: (r) => this.collections.set(r.data) });
  }

  loadProducts(page: number, search: string, status: string, categoryId: string) {
    this.loading.set(true);
    const params: Record<string, string | number> = { page, limit: 10 };
    if (search) params['search'] = search;
    if (status && status !== 'all') params['status'] = status;
    if (categoryId) params['categoryId'] = categoryId;
    this.catalog.getProducts(params as never).subscribe({
      next: (res) => {
        this.products.set(res.data);
        this.meta.set(res.meta);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSearch(val: string) {
    this.search.set(val);
    this.currentPage.set(1);
  }

  // --- Form ---

  openCreate() {
    this.editingId.set(null);
    this.form.set(emptyForm());
    this.formError.set(null);
    this.showForm.set(true);
  }

  openEdit(product: Product) {
    this.editingId.set(product._id);
    this.form.set({
      name:             product.name,
      description:      product.description ?? '',
      shortDescription: product.shortDescription ?? '',
      categoryId:       product.category._id,
      collectionIds:    product.collections.map((c) => c._id),
      basePrice:        product.basePrice,
      images:           [...product.images],
      attributes:       Object.entries(product.attributes).map(([key, value]) => ({ key, value })),
      tags:             product.tags.join(', '),
      status:           product.status ?? 'draft',
      isFeatured:       product.isFeatured ?? false,
      stock:            product.stock ?? 0,
      trackInventory:   product.trackInventory ?? false,
    });
    this.formError.set(null);
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.editingId.set(null);
    this.formError.set(null);
  }

  toggleCollection(id: string) {
    this.form.update((f) => {
      const ids = f.collectionIds.includes(id)
        ? f.collectionIds.filter((c) => c !== id)
        : [...f.collectionIds, id];
      return { ...f, collectionIds: ids };
    });
  }

  addAttribute() {
    this.form.update((f) => ({ ...f, attributes: [...f.attributes, { key: '', value: '' }] }));
  }

  removeAttribute(i: number) {
    this.form.update((f) => ({ ...f, attributes: f.attributes.filter((_, idx) => idx !== i) }));
  }

  updateAttrKey(i: number, key: string) {
    this.form.update((f) => {
      const attrs = [...f.attributes];
      attrs[i] = { ...attrs[i], key };
      return { ...f, attributes: attrs };
    });
  }

  updateAttrVal(i: number, value: string) {
    this.form.update((f) => {
      const attrs = [...f.attributes];
      attrs[i] = { ...attrs[i], value };
      return { ...f, attributes: attrs };
    });
  }

  onFileSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingImage.set(true);
    this.catalog.uploadImage(file).subscribe({
      next: (res) => {
        this.form.update((f) => ({ ...f, images: [...f.images, res.data.url] }));
        this.uploadingImage.set(false);
        (event.target as HTMLInputElement).value = '';
      },
      error: (err) => {
        alert(err?.error?.message ?? 'Image upload failed');
        this.uploadingImage.set(false);
      },
    });
  }

  removeImage(i: number) {
    this.form.update((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }));
  }

  saveForm() {
    const f = this.form();
    const id = this.editingId();

    if (!f.name.trim()) { this.formError.set('Product name is required'); return; }
    if (!f.categoryId)  { this.formError.set('Category is required'); return; }
    if (f.basePrice === '' || f.basePrice < 0) { this.formError.set('Valid price is required'); return; }

    const attrsRecord: Record<string, string> = {};
    for (const { key, value } of f.attributes) {
      if (key.trim()) attrsRecord[key.trim()] = value;
    }

    const tags = f.tags.split(',').map((t) => t.trim()).filter(Boolean);

    const payload = {
      name:             f.name,
      description:      f.description || undefined,
      shortDescription: f.shortDescription || undefined,
      categoryId:       f.categoryId,
      collectionIds:    f.collectionIds,
      basePrice:        Number(f.basePrice),
      images:           f.images,
      attributes:       attrsRecord,
      tags,
      status:           f.status,
      isFeatured:       f.isFeatured,
      stock:            Number(f.stock) || 0,
      trackInventory:   f.trackInventory,
    };

    this.formError.set(null);
    this.saving.set(true);

    const request = id
      ? this.catalog.updateProduct(id, payload as UpdateProductPayload)
      : this.catalog.createProduct(payload as CreateProductPayload);

    request.subscribe({
      next: (res) => {
        if (id) {
          this.products.update((list) => list.map((p) => p._id === id ? res.data : p));
        } else {
          this.products.update((list) => [res.data, ...list]);
          this.meta.update((m) => m ? { ...m, total: m.total + 1 } : m);
        }
        this.saving.set(false);
        this.closeForm();
      },
      error: (err) => {
        this.formError.set(err?.error?.message ?? 'Failed to save product');
        this.saving.set(false);
      },
    });
  }

  deleteProduct(id: string) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    this.catalog.deleteProduct(id).subscribe({
      next: () => {
        this.products.update((list) => list.filter((p) => p._id !== id));
        this.meta.update((m) => m ? { ...m, total: m.total - 1 } : m);
      },
      error: (err) => alert(err?.error?.message ?? 'Failed to delete product'),
    });
  }

  previewProduct(id: string) {
    window.open(`/admin/products/preview/${id}`, '_blank');
  }
}
