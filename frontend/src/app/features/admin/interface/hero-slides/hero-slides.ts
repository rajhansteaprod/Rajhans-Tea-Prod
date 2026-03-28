import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CmsService, HeroSlide } from '../../../../core/services/cms.service';

interface SlideForm {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  textAlign: 'left' | 'center' | 'right';
  isActive: boolean;
}

const emptyForm = (): SlideForm => ({
  title: '', subtitle: '', ctaText: 'Explore', ctaLink: '/products', textAlign: 'center', isActive: true,
});

@Component({
  selector: 'app-hero-slides',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hero-slides.html',
  styleUrls: ['./hero-slides.scss'],
})
export class HeroSlidesComponent implements OnInit {
  slides = signal<HeroSlide[]>([]);
  loading = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  showCreate = signal(false);
  editingId = signal<string | null>(null);
  createForm = signal<SlideForm>(emptyForm());
  editForm = signal<SlideForm>(emptyForm());

  // File handles for upload
  createDesktopFile: File | null = null;
  createMobileFile: File | null = null;
  editDesktopFile: File | null = null;
  editMobileFile: File | null = null;

  // Local preview URLs
  createDesktopPreview = signal<string | null>(null);
  createMobilePreview = signal<string | null>(null);
  editDesktopPreview = signal<string | null>(null);
  editMobilePreview = signal<string | null>(null);

  // Existing image URLs (for edit mode)
  editDesktopUrl = signal<string | null>(null);
  editMobileUrl = signal<string | null>(null);

  // Drag state
  dragIndex = signal<number | null>(null);

  constructor(private cms: CmsService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.cms.getHeroSlides().subscribe({
      next: (res) => { this.slides.set(res.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  updateForm(key: keyof SlideForm, value: unknown) {
    if (this.editingId()) {
      this.editForm.update((f) => ({ ...f, [key]: value }));
    } else {
      this.createForm.update((f) => ({ ...f, [key]: value }));
    }
  }

  // ── Create ──

  openCreate() {
    this.createForm.set(emptyForm());
    this.createDesktopFile = null;
    this.createMobileFile = null;
    this.createDesktopPreview.set(null);
    this.createMobilePreview.set(null);
    this.formError.set(null);
    this.editingId.set(null);
    this.showCreate.set(true);
  }

  onCreateFileSelect(event: Event, type: 'desktop' | 'mobile') {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === 'desktop') {
      this.createDesktopFile = file;
      this.createDesktopPreview.set(url);
    } else {
      this.createMobileFile = file;
      this.createMobilePreview.set(url);
    }
  }

  saveCreate() {
    const f = this.createForm();
    if (!f.title.trim()) { this.formError.set('Title is required'); return; }
    if (!this.createDesktopFile) { this.formError.set('Desktop image is required'); return; }
    if (!this.createMobileFile) { this.formError.set('Mobile image is required'); return; }

    this.formError.set(null);
    this.saving.set(true);

    const fd = new FormData();
    fd.append('title', f.title);
    fd.append('subtitle', f.subtitle);
    fd.append('ctaText', f.ctaText);
    fd.append('ctaLink', f.ctaLink);
    fd.append('textAlign', f.textAlign);
    fd.append('isActive', String(f.isActive));
    fd.append('desktopImage', this.createDesktopFile);
    fd.append('mobileImage', this.createMobileFile);

    this.cms.createHeroSlide(fd).subscribe({
      next: () => { this.saving.set(false); this.showCreate.set(false); this.load(); },
      error: (err) => {
        this.formError.set(err?.error?.message ?? 'Failed to create slide');
        this.saving.set(false);
      },
    });
  }

  // ── Edit ──

  openEdit(slide: HeroSlide) {
    this.editingId.set(slide._id);
    this.editForm.set({
      title: slide.title,
      subtitle: slide.subtitle,
      ctaText: slide.ctaText,
      ctaLink: slide.ctaLink,
      textAlign: slide.textAlign || 'center',
      isActive: slide.isActive,
    });
    this.editDesktopFile = null;
    this.editMobileFile = null;
    this.editDesktopPreview.set(null);
    this.editMobilePreview.set(null);
    this.editDesktopUrl.set(slide.desktopImage);
    this.editMobileUrl.set(slide.mobileImage);
    this.formError.set(null);
    this.showCreate.set(false);
  }

  onEditFileSelect(event: Event, type: 'desktop' | 'mobile') {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === 'desktop') {
      this.editDesktopFile = file;
      this.editDesktopPreview.set(url);
    } else {
      this.editMobileFile = file;
      this.editMobilePreview.set(url);
    }
  }

  cancelEdit() { this.editingId.set(null); this.formError.set(null); }

  saveEdit() {
    const id = this.editingId();
    if (!id) return;
    const f = this.editForm();
    this.formError.set(null);
    this.saving.set(true);

    const fd = new FormData();
    fd.append('title', f.title);
    fd.append('subtitle', f.subtitle);
    fd.append('ctaText', f.ctaText);
    fd.append('ctaLink', f.ctaLink);
    fd.append('textAlign', f.textAlign);
    fd.append('isActive', String(f.isActive));
    if (this.editDesktopFile) fd.append('desktopImage', this.editDesktopFile);
    if (this.editMobileFile) fd.append('mobileImage', this.editMobileFile);

    this.cms.updateHeroSlide(id, fd).subscribe({
      next: () => { this.saving.set(false); this.editingId.set(null); this.load(); },
      error: (err) => {
        this.formError.set(err?.error?.message ?? 'Failed to update slide');
        this.saving.set(false);
      },
    });
  }

  // ── Toggle & Delete ──

  toggleActive(slide: HeroSlide) {
    this.saving.set(true);
    const fd = new FormData();
    fd.append('isActive', String(!slide.isActive));
    this.cms.updateHeroSlide(slide._id, fd).subscribe({
      next: () => { this.saving.set(false); this.load(); },
      error: () => this.saving.set(false),
    });
  }

  deleteSlide(id: string) {
    if (!confirm('Delete this hero slide?')) return;
    this.cms.deleteHeroSlide(id).subscribe({
      next: () => this.slides.update((list) => list.filter((s) => s._id !== id)),
      error: (err) => alert(err?.error?.message ?? 'Failed to delete slide'),
    });
  }

  // ── Drag & Drop Reorder ──

  onDragStart(index: number) {
    this.dragIndex.set(index);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onDrop(targetIndex: number) {
    const fromIndex = this.dragIndex();
    if (fromIndex === null || fromIndex === targetIndex) { this.dragIndex.set(null); return; }

    const reordered = [...this.slides()];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    this.slides.set(reordered);
    this.dragIndex.set(null);

    const orderedIds = reordered.map((s) => s._id);
    this.cms.reorderHeroSlides(orderedIds).subscribe({
      error: () => this.load(), // revert on failure
    });
  }
}
