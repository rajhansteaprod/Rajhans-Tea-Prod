import { Component, OnInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  CatalogService, Product, Category, Collection,
  CreateProductPayload, UpdateProductPayload, ProductVariant,
  CreateVariantPayload,
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
  reflectedImage: string;
  attributes: AttributeEntry[];
  tags: string;
  status: 'draft' | 'active' | 'archived';
  isFeatured: boolean;
  stock: number;
  trackInventory: boolean;
}

interface VariantForm {
  name: string;
  sku: string;
  price: number | '';
  stock: number;
  trackInventory: boolean;
  isActive: boolean;
}

const emptyForm = (): ProductForm => ({
  name: '', description: '', shortDescription: '',
  categoryId: '', collectionIds: [], basePrice: '',
  images: [], reflectedImage: '', attributes: [], tags: '',
  status: 'draft', isFeatured: false,
  stock: 0, trackInventory: false,
});

const emptyVariantForm = (): VariantForm => ({
  name: '', sku: '', price: '',
  stock: 0, trackInventory: false, isActive: true,
});

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-list.html',
  styleUrls: ['./product-list.scss'],
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

  // ── Variant Management ──
  variantProduct      = signal<Product | null>(null);
  variants            = signal<ProductVariant[]>([]);
  variantLoading      = signal(false);
  variantSaving       = signal(false);
  variantError        = signal('');
  showVariantForm     = signal(false);
  editingVariantId    = signal<string | null>(null);
  variantForm         = signal<VariantForm>(emptyVariantForm());

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
      reflectedImage:   product.reflectedImage ?? '',
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

  onReflectedImageSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingImage.set(true);
    this.catalog.uploadImage(file).subscribe({
      next: (res) => {
        this.form.update((f) => ({ ...f, reflectedImage: res.data.url }));
        this.uploadingImage.set(false);
        (event.target as HTMLInputElement).value = '';
      },
      error: (err) => {
        alert(err?.error?.message ?? 'Image upload failed');
        this.uploadingImage.set(false);
      },
    });
  }

  removeReflectedImage() {
    this.form.update((f) => ({ ...f, reflectedImage: '' }));
  }

  saveForm() {
    const f = this.form();
    const id = this.editingId();

    if (!f.name.trim()) { this.formError.set('Product name is required'); return; }
    if (!f.categoryId)  { this.formError.set('Category is required'); return; }
    if (f.basePrice === '' || f.basePrice < 0) { this.formError.set('Valid price is required'); return; }
    if (!f.reflectedImage.trim()) { this.formError.set('Reflected image is required'); return; }

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
      reflectedImage:   f.reflectedImage,
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

  // ── Variant Management ──

  openVariants(product: Product) {
    this.variantProduct.set(product);
    this.variantError.set('');
    this.variants.set([]);
    this.variantForm.set(emptyVariantForm());
    this.editingVariantId.set(null);
    this.showVariantForm.set(false);
    this.loadVariants(product._id);
  }

  closeVariants() {
    this.variantProduct.set(null);
    this.variants.set([]);
    this.variantLoading.set(false);
    this.variantSaving.set(false);
    this.variantError.set('');
    this.showVariantForm.set(false);
    this.editingVariantId.set(null);
    this.variantForm.set(emptyVariantForm());
  }

  loadVariants(productId: string) {
    this.variantLoading.set(true);
    this.catalog.getVariants(productId).subscribe({
      next: (res) => {
        this.variants.set(res.data || []);
        this.variantLoading.set(false);
      },
      error: (err) => {
        this.variantError.set(err?.error?.message ?? 'Failed to load variants');
        this.variantLoading.set(false);
      },
    });
  }

  openVariantForm(variant?: ProductVariant) {
    if (variant) {
      this.editingVariantId.set(variant._id);
      this.variantForm.set({
        name: variant.name,
        sku: variant.sku ?? '',
        price: variant.price,
        stock: variant.stock,
        trackInventory: variant.trackInventory,
        isActive: variant.isActive,
      });
    } else {
      this.editingVariantId.set(null);
      this.variantForm.set(emptyVariantForm());
    }
    this.variantError.set('');
    this.showVariantForm.set(true);
  }

  closeVariantForm() {
    this.showVariantForm.set(false);
    this.editingVariantId.set(null);
    this.variantForm.set(emptyVariantForm());
    this.variantError.set('');
  }

  saveVariant() {
    const f = this.variantForm();
    const product = this.variantProduct();

    if (!product) return;
    if (!f.name.trim()) { this.variantError.set('Variant name is required'); return; }
    if (f.price === '' || f.price < 0) { this.variantError.set('Valid price is required'); return; }

    this.variantError.set('');
    this.variantSaving.set(true);

    const payload: CreateVariantPayload = {
      name: f.name.trim(),
      sku: f.sku.trim() || undefined,
      price: Number(f.price),
      stock: Number(f.stock) || 0,
      trackInventory: f.trackInventory,
      isActive: f.isActive,
    };

    const variantId = this.editingVariantId();
    const request = variantId
      ? this.catalog.updateVariant(product._id, variantId, payload)
      : this.catalog.createVariant(product._id, payload);

    request.subscribe({
      next: (res) => {
        if (variantId) {
          this.variants.update((list) => list.map((v) => v._id === variantId ? res.data : v));
        } else {
          this.variants.update((list) => [...list, res.data]);
        }
        this.variantSaving.set(false);
        this.closeVariantForm();
      },
      error: (err) => {
        this.variantError.set(err?.error?.message ?? 'Failed to save variant');
        this.variantSaving.set(false);
      },
    });
  }

  deleteVariant(variantId: string) {
    const product = this.variantProduct();
    if (!product) return;
    if (!confirm('Delete this variant? This cannot be undone.')) return;

    this.catalog.deleteVariant(product._id, variantId).subscribe({
      next: () => {
        this.variants.update((list) => list.filter((v) => v._id !== variantId));
      },
      error: (err) => {
        this.variantError.set(err?.error?.message ?? 'Failed to delete variant');
      },
    });
  }
}
