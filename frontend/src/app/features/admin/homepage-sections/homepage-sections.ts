import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CatalogService, HomepageSection, Product } from '../../../core/services/catalog.service';

@Component({
  selector: 'app-homepage-sections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './homepage-sections.html',
  styleUrls: ['./homepage-sections.scss'],
})
export class HomepageSectionsComponent implements OnInit {
  private readonly catalog = inject(CatalogService);

  readonly sections = signal<HomepageSection[]>([]);
  readonly allProducts = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showCreate = signal(false);
  readonly newSectionTitle = signal('');

  ngOnInit(): void {
    this.loadSections();
    this.loadProducts();
  }

  loadSections(): void {
    this.loading.set(true);
    this.catalog.getHomepageSectionsAdmin().subscribe({
      next: (res) => {
        this.sections.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadProducts(): void {
    this.catalog.getProducts({ page: 1, limit: 100 }).subscribe({
      next: (res) => {
        console.log('Admin products loaded:', res.data);
        this.allProducts.set(res.data || []);
      },
      error: (err) => {
        console.error('Failed to load admin products:', err);
      }
    });
  }

  createSection(): void {
    const title = this.newSectionTitle().trim();
    if (!title) return;

    this.saving.set(true);
    const nextOrder = this.sections().length;
    this.catalog.createHomepageSection({ title, sortOrder: nextOrder, isActive: true, productIds: [] }).subscribe({
      next: (res) => {
        this.sections.update((list) => [...list, res.data]);
        this.newSectionTitle.set('');
        this.showCreate.set(false);
        this.saving.set(false);
      },
      error: (err) => {
        alert(err?.error?.message || 'Failed to create section');
        this.saving.set(false);
      },
    });
  }

  updateSectionTitle(section: HomepageSection, newTitle: string): void {
    const title = newTitle.trim();
    if (!title || title === section.title) return;

    this.catalog.updateHomepageSection(section._id, { title }).subscribe({
      next: (res) => {
        this.sections.update((list) =>
          list.map((s) => (s._id === section._id ? { ...s, title: res.data.title } : s))
        );
      },
      error: (err) => alert(err?.error?.message || 'Failed to update section title'),
    });
  }

  toggleSectionActive(section: HomepageSection): void {
    const nextActive = !section.isActive;
    this.catalog.updateHomepageSection(section._id, { isActive: nextActive }).subscribe({
      next: (res) => {
        this.sections.update((list) =>
          list.map((s) => (s._id === section._id ? { ...s, isActive: res.data.isActive } : s))
        );
      },
      error: (err) => alert(err?.error?.message || 'Failed to update section status'),
    });
  }

  deleteSection(section: HomepageSection): void {
    if (!confirm(`Are you sure you want to delete "${section.title}"?`)) return;

    this.catalog.deleteHomepageSection(section._id).subscribe({
      next: () => {
        this.sections.update((list) => list.filter((s) => s._id !== section._id));
      },
      error: (err) => alert(err?.error?.message || 'Failed to delete section'),
    });
  }

  addProduct(section: HomepageSection, prodId: string): void {
    if (!prodId) return;

    const currentIds = (section.productIds || []).map((p: any) => (typeof p === 'object' ? p._id : p));
    if (currentIds.includes(prodId)) {
      alert('Product is already in this section.');
      return;
    }

    const updatedIds = [...currentIds, prodId];
    this.saveSectionProducts(section._id, updatedIds);
  }

  removeProduct(section: HomepageSection, index: number): void {
    const currentIds = (section.productIds || []).map((p: any) => (typeof p === 'object' ? p._id : p));
    const updatedIds = [...currentIds];
    updatedIds.splice(index, 1);
    this.saveSectionProducts(section._id, updatedIds);
  }

  moveProduct(section: HomepageSection, index: number, direction: number): void {
    const currentIds = (section.productIds || []).map((p: any) => (typeof p === 'object' ? p._id : p));
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= currentIds.length) return;

    const updatedIds = [...currentIds];
    const temp = updatedIds[index];
    updatedIds[index] = updatedIds[targetIndex];
    updatedIds[targetIndex] = temp;

    this.saveSectionProducts(section._id, updatedIds);
  }

  private saveSectionProducts(sectionId: string, productIds: string[]): void {
    this.catalog.updateHomepageSection(sectionId, { productIds }).subscribe({
      next: (res) => {
        // Reload sections to get populated product data correctly
        this.loadSections();
      },
      error: (err) => alert(err?.error?.message || 'Failed to update section products'),
    });
  }

  moveSection(index: number, direction: number): void {
    const list = [...this.sections()];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    // Instantly update local list for visual responsiveness
    this.sections.set(list);

    const ids = list.map((s) => s._id);
    this.catalog.reorderHomepageSections(ids).subscribe({
      error: (err) => {
        alert(err?.error?.message || 'Failed to save sections order');
        this.loadSections(); // Rollback to actual db state on error
      },
    });
  }

  getProductById(id: string): Product | undefined {
    return this.allProducts().find((p) => p._id === id);
  }

  getProductRef(p: any): Product | undefined {
    if (typeof p === 'object') return p as Product;
    return this.getProductById(p);
  }
}
