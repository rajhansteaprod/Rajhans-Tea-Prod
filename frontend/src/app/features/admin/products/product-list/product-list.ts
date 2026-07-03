import { Component, OnInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  CatalogService, Product, Category, Collection,
  CreateProductPayload, UpdateProductPayload, ProductVariant,
  CreateVariantPayload,
} from '../../../../core/services/catalog.service';
import { ReviewStore } from '../../../../core/services/review.store';

interface AttributeEntry { key: string; value: string; }

interface ProductForm {
  name: string;
  description: string;
  shortDescription: string;
  categoryId: string;
  collectionIds: string[];
  basePrice: number | '';
  discountedPrice: number | '';
  images: string[];
  primaryImage?: string;
  imageAltText?: string;
  reflectedImage: string;
  attributes: AttributeEntry[];
  tags: string;
  region?: 'Assam' | 'Darjeeling' | 'Nilgiri' | 'Dooars';
  bestTakenFor?: 'Morning' | 'Noon' | 'Evening';
  status: 'draft' | 'active' | 'archived';
  isFeatured: boolean;
  stock: number;
  trackInventory: boolean;
  showBadge: boolean;
  badgeText: string;
  ratingOneLiner: string; // Admin-editable: "Cleanser Effectiveness, Face Wash Effectiveness, ..."
}

interface VariantForm {
  name: string;
  sku: string;
  price: number | '';
  discountedPrice: number | '';
  stock: number;
  trackInventory: boolean;
  isActive: boolean;
}

const emptyForm = (): ProductForm => ({
  name: '', description: '', shortDescription: '',
  categoryId: '', collectionIds: [], basePrice: '', discountedPrice: '',
  images: [], primaryImage: '', imageAltText: '', reflectedImage: '', attributes: [], tags: '',
  region: undefined, bestTakenFor: undefined,
  status: 'draft', isFeatured: false,
  showBadge: false, badgeText: '',
  stock: 0, trackInventory: false, ratingOneLiner: '',
});

const emptyVariantForm = (): VariantForm => ({
  name: '', sku: '', price: '', discountedPrice: '',
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
  ratingSummarySaving = signal(false);
  ratingSummaryError = signal('');

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

  constructor(private catalog: CatalogService, private router: Router, private reviews: ReviewStore) {}

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
    this.loadMeta(); // Reload categories, collections
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
      discountedPrice:  product.discountedPrice ?? '',
      images:           [...product.images],
      primaryImage:     (product as any).primaryImage ?? '',
      imageAltText:     (product as any).imageAltText ?? '',
      reflectedImage:   product.reflectedImage ?? '',
      attributes:       Object.entries(product.attributes).map(([key, value]) => ({ key, value })),
      tags:             product.tags.join(', '),
      region:           (product as any).region ?? undefined,
      bestTakenFor:     (product as any).bestTakenFor ?? undefined,
      status:           product.status ?? 'draft',
      isFeatured:       product.isFeatured ?? false,
      showBadge:        product.showBadge ?? false,
      badgeText:        product.badgeText ?? '',
      stock:            product.stock ?? 0,
      trackInventory:   product.trackInventory ?? false,
      ratingOneLiner:   '',
    });
    this.formError.set(null);
    this.ratingSummaryError.set('');
    this.showForm.set(true);

    // Fetch rating summary to populate ratingOneLiner
    this.reviews.getRatingSummary(product._id).subscribe({
      next: (res) => {
        this.form.update((f) => ({ ...f, ratingOneLiner: res.data.ratingOneLiner || '' }));
      },
      error: () => {
        // Silently fail - rating summary is optional
      },
    });
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

  // Drag and Drop state
  private dragStartIndex: number | null = null;

  onDragStart(event: DragEvent, index: number) {
    this.dragStartIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  onDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    if (this.dragStartIndex === null) return;
    const sourceIndex = this.dragStartIndex;
    this.dragStartIndex = null;
    if (sourceIndex === targetIndex) return;

    this.form.update((f) => {
      const images = [...f.images];
      const [moved] = images.splice(sourceIndex, 1);
      images.splice(targetIndex, 0, moved);
      return { ...f, images };
    });
  }

  moveImage(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= this.form().images.length) return;
    this.form.update((f) => {
      const images = [...f.images];
      const [moved] = images.splice(fromIndex, 1);
      images.splice(toIndex, 0, moved);
      return { ...f, images };
    });
  }

  setPrimaryImage(url: string) {
    this.form.update((f) => ({ ...f, primaryImage: url }));
  }

  setHoverImage(url: string) {
    this.form.update((f) => ({ ...f, reflectedImage: url }));
  }

  updateAltText(val: string) {
    this.form.update((f) => ({ ...f, imageAltText: val }));
  }

  onFileSelect(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (this.form().images.length + files.length > 20) {
      alert('Maximum of 20 images allowed per product.');
      (event.target as HTMLInputElement).value = '';
      return;
    }

    const invalidFiles: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!ALLOWED_TYPES.includes(file.type)) {
        invalidFiles.push(`${file.name} (invalid format)`);
      } else if (file.size > MAX_FILE_SIZE) {
        invalidFiles.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB exceeds 5MB limit)`);
      }
    }

    if (invalidFiles.length > 0) {
      alert(`Invalid files:\n\n${invalidFiles.join('\n')}\n\nOnly JPEG, PNG, and WebP images under 5MB are allowed.`);
      (event.target as HTMLInputElement).value = '';
      return;
    }

    this.uploadingImage.set(true);
    let uploadedCount = 0;
    const totalToUpload = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      this.catalog.uploadImage(file).subscribe({
        next: (res) => {
          this.form.update((f) => {
            const images = [...f.images, res.data.url];
            const primaryImage = f.primaryImage || res.data.url;
            return { ...f, images, primaryImage };
          });
          uploadedCount++;
          if (uploadedCount === totalToUpload) {
            this.uploadingImage.set(false);
            (event.target as HTMLInputElement).value = '';
          }
        },
        error: (err) => {
          alert(err?.error?.message ?? `Upload failed for ${file.name}`);
          uploadedCount++;
          if (uploadedCount === totalToUpload) {
            this.uploadingImage.set(false);
            (event.target as HTMLInputElement).value = '';
          }
        },
      });
    }
  }

  removeImage(i: number) {
    this.form.update((f) => {
      const removedImage = f.images[i];
      const images = f.images.filter((_, idx) => idx !== i);
      let primaryImage = f.primaryImage;
      if (primaryImage === removedImage) {
        primaryImage = images[0] || '';
      }
      let reflectedImage = f.reflectedImage;
      if (reflectedImage === removedImage) {
        reflectedImage = '';
      }
      return { ...f, images, primaryImage, reflectedImage };
    });
  }

  saveForm() {
    const f = this.form();
    const id = this.editingId();

    if (!f.name.trim()) { this.formError.set('Product name is required'); return; }
    if (!f.categoryId)  { this.formError.set('Category is required'); return; }
    if (f.basePrice === '' || f.basePrice < 0) { this.formError.set('Valid price is required'); return; }
    if (f.discountedPrice !== '' && (f.discountedPrice < 0 || f.discountedPrice >= f.basePrice)) {
      this.formError.set('Discounted price must be less than base price');
      return;
    }
    if (f.images.length === 0) {
      this.formError.set('At least 1 product image is required');
      return;
    }
    if (f.images.length > 20) {
      this.formError.set('Maximum of 20 images allowed per product');
      return;
    }

    const attrsRecord: Record<string, string> = {};
    for (const { key, value } of f.attributes) {
      if (key.trim()) attrsRecord[key.trim()] = value;
    }

    const tags = f.tags.split(',').map((t) => t.trim()).filter(Boolean);

    // Resolve primary image fallback
    let primaryImage = f.primaryImage;
    if (!primaryImage || !f.images.includes(primaryImage)) {
      primaryImage = f.images[0] || '';
    }

    // Default reflectedImage to primaryImage for old DB schema compatibility or keep it if uploaded
    const reflectedImage = f.reflectedImage || primaryImage;

    const payload = {
      name:             f.name,
      description:      f.description || undefined,
      shortDescription: f.shortDescription || undefined,
      categoryId:       f.categoryId,
      collectionIds:    f.collectionIds,
      basePrice:        Number(f.basePrice),
      // null (not undefined) so clearing the field actually removes the discount
      discountedPrice:  f.discountedPrice !== '' ? Number(f.discountedPrice) : null,
      images:           f.images,
      primaryImage,
      imageAltText:     f.imageAltText || f.name,
      reflectedImage:   reflectedImage,
      attributes:       attrsRecord,
      tags,
      // null (not undefined) so clearing the dropdown actually clears the field
      region:           f.region || null,
      bestTakenFor:     f.bestTakenFor || null,
      status:           f.status,
      isFeatured:       f.isFeatured,
      showBadge:        f.showBadge,
      badgeText:        f.badgeText,
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

        // Save rating summary (one-liner) if it's an existing product
        const productId = res.data._id;
        const ratingOneLiner = f.ratingOneLiner.trim();
        if (productId && ratingOneLiner) {
          this.catalog.updateRatingOneLiner(productId, ratingOneLiner).subscribe({
            next: () => {
              this.saving.set(false);
              this.closeForm();
            },
            error: (err) => {
              // Rating summary is optional, just warn and close
              console.warn('Failed to update rating summary:', err);
              this.saving.set(false);
              this.closeForm();
            },
          });
        } else {
          this.saving.set(false);
          this.closeForm();
        }
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
        discountedPrice: variant.discountedPrice ?? '',
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
    if (f.discountedPrice !== '' && (f.discountedPrice < 0 || f.discountedPrice >= f.price)) {
      this.variantError.set('Discounted price must be less than price');
      return;
    }

    this.variantError.set('');
    this.variantSaving.set(true);

    const payload: CreateVariantPayload = {
      name: f.name.trim(),
      sku: f.sku.trim() || undefined,
      price: Number(f.price),
      // null (not undefined) so clearing the field actually removes the discount
      discountedPrice: f.discountedPrice !== '' ? Number(f.discountedPrice) : null,
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
