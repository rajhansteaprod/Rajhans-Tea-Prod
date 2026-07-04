import { Component, OnInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  CatalogService, Product, Category, Collection,
  CreateProductPayload, UpdateProductPayload,
  InlineVariant, VariantOption,
} from '../../../../core/services/catalog.service';
import { ReviewStore } from '../../../../core/services/review.store';

interface AttributeEntry { key: string; value: string; }

// One editable variant row inside the product form. Per variant the admin gives
// only the dictionary value + base price + discounted price + stock. `_id` is
// present for variants that already exist (so the backend reconciles on save).
interface VariantRow {
  _id?: string;
  optionValue: string;
  price: number | '';
  discountedPrice: number | '';
  stock: number;
}

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
  hasVariants: boolean;   // true → price/discount/stock are set per-variant, not here
  optionKey: string;      // which dictionary key this product's variants vary by
  variants: VariantRow[]; // inline variant rows (only when hasVariants)
  showBadge: boolean;
  badgeText: string;
  ratingOneLiner: string; // Admin-editable: "Cleanser Effectiveness, Face Wash Effectiveness, ..."
}

const emptyForm = (): ProductForm => ({
  name: '', description: '', shortDescription: '',
  categoryId: '', collectionIds: [], basePrice: '', discountedPrice: '',
  images: [], primaryImage: '', imageAltText: '', reflectedImage: '', attributes: [], tags: '',
  region: undefined, bestTakenFor: undefined,
  status: 'draft', isFeatured: false,
  showBadge: false, badgeText: '',
  stock: 0, trackInventory: false, hasVariants: false, optionKey: '', variants: [],
  ratingOneLiner: '',
});

const emptyVariantRow = (): VariantRow => ({
  optionValue: '', price: '', discountedPrice: '', stock: 0,
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

  // ── Dictionary-driven variant options (inline in the product form) ──
  variantOptions      = signal<VariantOption[]>([]);
  variantsLoading     = signal(false); // fetching existing variants when opening edit

  // Values available for the option key currently chosen on the form
  readonly selectedKeyValues = computed(() => {
    const key = this.form().optionKey;
    if (!key) return [];
    return this.variantOptions().find((o) => o.key === key)?.values ?? [];
  });
  // Whether the dictionary has any options to pick from
  readonly hasVariantOptions = computed(() => this.variantOptions().length > 0);

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
    this.loadVariantOptions();
  }

  private loadVariantOptions() {
    this.catalog.getVariantOptions().subscribe({
      next: (res) => this.variantOptions.set((res.data || []).filter((o) => o.isActive)),
      error: () => { /* dictionary is optional; falls back to free-text */ },
    });
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
      hasVariants:      product.hasVariants ?? false,
      optionKey:        '',
      variants:         [],
      ratingOneLiner:   '',
    });
    this.formError.set(null);
    this.ratingSummaryError.set('');
    this.showForm.set(true);

    // Load existing variants into the form so they're editable inline.
    if (product.hasVariants) {
      this.variantsLoading.set(true);
      this.catalog.getVariants(product._id).subscribe({
        next: (res) => {
          const variants = res.data || [];
          const optionKey = variants.find((v) => v.optionKey)?.optionKey ?? '';
          this.form.update((f) => ({
            ...f,
            optionKey,
            variants: variants.map((v) => ({
              _id: v._id,
              optionValue: v.optionValue ?? v.name,
              price: v.price,
              discountedPrice: v.discountedPrice ?? '',
              stock: v.stock,
            })),
          }));
          this.variantsLoading.set(false);
        },
        error: () => this.variantsLoading.set(false),
      });
    }

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

  // ── Inline variant rows ──
  setOptionKey(key: string) {
    // Changing the option key clears rows whose value no longer belongs to it.
    this.form.update((f) => {
      const values = this.variantOptions().find((o) => o.key === key)?.values ?? [];
      return {
        ...f,
        optionKey: key,
        variants: f.variants.filter((v) => values.includes(v.optionValue)),
      };
    });
  }

  addVariantRow() {
    this.form.update((f) => ({ ...f, variants: [...f.variants, emptyVariantRow()] }));
  }

  removeVariantRow(i: number) {
    this.form.update((f) => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }));
  }

  updateVariantRow(i: number, patch: Partial<VariantRow>) {
    this.form.update((f) => {
      const variants = [...f.variants];
      variants[i] = { ...variants[i], ...patch };
      return { ...f, variants };
    });
  }

  // Values already picked by other rows, so a value can't be selected twice.
  usedVariantValues(exceptIndex: number): Set<string> {
    return new Set(
      this.form().variants
        .filter((_, idx) => idx !== exceptIndex)
        .map((v) => v.optionValue)
        .filter(Boolean),
    );
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
    // Product-level price only applies to products WITHOUT variants. For variant
    // products, price/discount/stock are set per-variant and derived by backend.
    let inlineVariants: InlineVariant[] = [];
    if (!f.hasVariants) {
      if (f.basePrice === '' || f.basePrice < 0) { this.formError.set('Valid price is required'); return; }
      if (f.discountedPrice !== '' && (f.discountedPrice < 0 || f.discountedPrice >= f.basePrice)) {
        this.formError.set('Discounted price must be less than base price');
        return;
      }
    } else {
      if (!this.hasVariantOptions()) {
        this.formError.set('Create a Variant Option first (admin → Variant Options)');
        return;
      }
      if (!f.optionKey) { this.formError.set('Choose an option type (e.g. Weight)'); return; }
      if (f.variants.length === 0) { this.formError.set('Add at least one variant'); return; }

      for (const [idx, v] of f.variants.entries()) {
        const n = idx + 1;
        if (!v.optionValue) { this.formError.set(`Variant ${n}: choose a value`); return; }
        if (v.price === '' || Number(v.price) <= 0) { this.formError.set(`Variant ${n}: base price must be greater than 0`); return; }
        if (v.discountedPrice !== '' && (Number(v.discountedPrice) < 0 || Number(v.discountedPrice) >= Number(v.price))) {
          this.formError.set(`Variant ${n}: discounted price must be less than base price`);
          return;
        }
      }
      // No duplicate values
      const values = f.variants.map((v) => v.optionValue);
      if (new Set(values).size !== values.length) {
        this.formError.set('Each variant value can be used only once');
        return;
      }

      inlineVariants = f.variants.map((v) => ({
        _id: v._id,
        optionKey: f.optionKey,
        optionValue: v.optionValue,
        price: Number(v.price),
        discountedPrice: v.discountedPrice !== '' ? Number(v.discountedPrice) : null,
        stock: Number(v.stock) || 0,
      }));
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

    // Variant products derive price/discount/stock from their variants, so we
    // send neutral placeholders (backend overwrites basePrice from the cheapest
    // variant). Non-variant products send the admin-entered values.
    const pricing = f.hasVariants
      ? { basePrice: Number(f.basePrice) || 0, discountedPrice: null, stock: 0, trackInventory: false }
      : {
          basePrice: Number(f.basePrice),
          // null (not undefined) so clearing the field actually removes the discount
          discountedPrice: f.discountedPrice !== '' ? Number(f.discountedPrice) : null,
          stock: Number(f.stock) || 0,
          trackInventory: f.trackInventory,
        };

    const payload = {
      name:             f.name,
      description:      f.description || undefined,
      shortDescription: f.shortDescription || undefined,
      categoryId:       f.categoryId,
      collectionIds:    f.collectionIds,
      ...pricing,
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
      hasVariants:      f.hasVariants,
      variants:         f.hasVariants ? inlineVariants : [],
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

        const done = () => {
          this.saving.set(false);
          this.closeForm();
        };

        // Save rating summary (one-liner) if it's an existing product
        const productId = res.data._id;
        const ratingOneLiner = f.ratingOneLiner.trim();
        if (productId && ratingOneLiner) {
          this.catalog.updateRatingOneLiner(productId, ratingOneLiner).subscribe({
            next: () => done(),
            error: (err) => {
              // Rating summary is optional, just warn and close
              console.warn('Failed to update rating summary:', err);
              done();
            },
          });
        } else {
          done();
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
}
