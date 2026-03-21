import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

type Tab = 'pages' | 'blog';

@Component({
  selector: 'app-cms-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header"><h1 class="page-title">CMS</h1><p class="page-sub">Pages and blog management</p></div>

      <div class="tabs">
        <button class="tab" [class.active]="activeTab() === 'pages'" (click)="activeTab.set('pages'); loadPages()">Pages</button>
        <button class="tab" [class.active]="activeTab() === 'blog'" (click)="activeTab.set('blog'); loadBlogs()">Blog</button>
      </div>

      <!-- Pages -->
      @if (activeTab() === 'pages') {
        <div class="toolbar"><button class="btn-add" (click)="openPageModal()">+ Create Page</button></div>
        @for (p of pages(); track p._id) {
          <div class="card"><div><strong>{{ p.title }}</strong><span class="slug">/page/{{ p.slug }}</span><span class="badge" [class.pub]="p.status==='published'">{{ p.status }}</span></div>
            <div class="card-actions"><button class="btn-sm" (click)="openPageModal(p)">Edit</button><button class="btn-sm danger" (click)="deletePage(p._id)">Delete</button></div></div>
        }
      }

      <!-- Blog -->
      @if (activeTab() === 'blog') {
        <div class="toolbar"><button class="btn-add" (click)="openBlogModal()">+ Create Post</button></div>
        @for (b of blogs(); track b._id) {
          <div class="card"><div><strong>{{ b.title }}</strong><span class="slug">/blog/{{ b.slug }}</span><span class="badge" [class.pub]="b.status==='published'">{{ b.status }}</span></div>
            <div class="card-actions"><button class="btn-sm" (click)="openBlogModal(b)">Edit</button><button class="btn-sm danger" (click)="deleteBlog(b._id)">Delete</button></div></div>
        }
      }

      <!-- Page Modal -->
      @if (showPageModal()) {
        <div class="backdrop" (click)="showPageModal.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>{{ pageEditId ? 'Edit' : 'Create' }} Page</h2><button (click)="showPageModal.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Title</label><input [(ngModel)]="pageForm.title" /></div>
            <div class="form-field"><label>Slug</label><input [(ngModel)]="pageForm.slug" placeholder="about-us" /></div>
            <div class="form-field"><label>Content (HTML)</label><textarea [(ngModel)]="pageForm.content" rows="8"></textarea></div>
            <div class="form-row">
              <div class="form-field"><label>Meta Title (SEO)</label><input [(ngModel)]="pageForm.metaTitle" /></div>
              <div class="form-field"><label>Status</label><select [(ngModel)]="pageForm.status"><option value="draft">Draft</option><option value="published">Published</option></select></div>
            </div>
            <div class="form-field"><label>Meta Description (SEO)</label><textarea [(ngModel)]="pageForm.metaDescription" rows="2"></textarea></div>
            <div class="modal-actions"><button (click)="showPageModal.set(false)">Cancel</button><button class="btn-save" (click)="savePage()">Save</button></div>
          </div>
        </div>
      }

      <!-- Blog Modal -->
      @if (showBlogModal()) {
        <div class="backdrop" (click)="showBlogModal.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>{{ blogEditId ? 'Edit' : 'Create' }} Blog Post</h2><button (click)="showBlogModal.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Title</label><input [(ngModel)]="blogForm.title" /></div>
            <div class="form-field"><label>Excerpt</label><textarea [(ngModel)]="blogForm.excerpt" rows="2"></textarea></div>
            <div class="form-field"><label>Content (HTML)</label><textarea [(ngModel)]="blogForm.content" rows="8"></textarea></div>
            <div class="form-row">
              <div class="form-field"><label>Cover Image URL</label><input [(ngModel)]="blogForm.coverImage" /></div>
              <div class="form-field"><label>Status</label><select [(ngModel)]="blogForm.status"><option value="draft">Draft</option><option value="published">Published</option></select></div>
            </div>
            <div class="form-field"><label>Tags (comma separated)</label><input [(ngModel)]="blogForm.tagsStr" /></div>
            <div class="modal-actions"><button (click)="showBlogModal.set(false)">Cancel</button><button class="btn-save" (click)="saveBlog()">Save</button></div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }
    .tabs { display:flex; gap: $space-xs; margin-bottom: $space-lg; border-bottom:2px solid $color-border-light; padding-bottom: $space-xs; }
    .tab { padding: $space-sm $space-lg; border:none; background:transparent; font-size: $font-size-sm; color: $color-text-tertiary; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-3px; &.active { color: $color-primary; border-bottom-color: $color-primary; } }
    .toolbar { margin-bottom: $space-lg; }
    .btn-add { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; }
    .card { display:flex; align-items:center; justify-content:space-between; padding: $space-md $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-lg; margin-bottom: $space-sm; }
    .slug { font-size: $font-size-xs; color: $color-text-tertiary; font-family:monospace; margin-left: $space-sm; }
    .badge { margin-left: $space-sm; padding:1px $space-xs; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase; background:rgba(204,88,3,.1); color: $color-primary;
      &.pub { background:rgba(87,136,108,.12); color: $color-success; }
    }
    .card-actions { display:flex; gap: $space-xs; }
    .btn-sm { padding: $space-xxs $space-sm; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer; &:hover { border-color: $color-primary; color: $color-primary; } &.danger:hover { border-color: $color-error; color: $color-error; } }
    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:650px; max-width:90vw; max-height:85vh; overflow-y:auto; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light; h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; } button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; } }
    .modal-body { padding: $space-xl; }
    .form-row { display:flex; gap: $space-md; }
    .form-field { flex:1; display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md; min-width:0;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; }
      input, textarea, select { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; resize:vertical; &:focus { border-color: $color-primary; } }
    }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; margin-top: $space-lg; button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; } }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; }
  `],
})
export class CmsManagementComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly activeTab = signal<Tab>('pages');
  readonly pages = signal<any[]>([]);
  readonly blogs = signal<any[]>([]);
  readonly showPageModal = signal(false);
  readonly showBlogModal = signal(false);

  pageEditId: string | null = null;
  blogEditId: string | null = null;
  pageForm: any = { title: '', slug: '', content: '', metaTitle: '', metaDescription: '', status: 'published' };
  blogForm: any = { title: '', excerpt: '', content: '', coverImage: '', status: 'draft', tagsStr: '' };

  ngOnInit(): void { this.loadPages(); }

  loadPages(): void { this.http.get<{ data: any[] }>(`${this.api}/admin/cms/pages`).subscribe({ next: (r) => this.pages.set(r.data) }); }
  loadBlogs(): void { this.http.get<{ data: any[] }>(`${this.api}/admin/cms/blog?limit=50`).subscribe({ next: (r) => this.blogs.set(r.data) }); }

  openPageModal(p?: any): void {
    this.pageEditId = p?._id || null;
    this.pageForm = p ? { title: p.title, slug: p.slug, content: p.content, metaTitle: p.metaTitle, metaDescription: p.metaDescription, status: p.status } : { title: '', slug: '', content: '', metaTitle: '', metaDescription: '', status: 'published' };
    this.showPageModal.set(true);
  }

  savePage(): void {
    const req = this.pageEditId ? this.http.put(`${this.api}/admin/cms/pages/${this.pageEditId}`, this.pageForm) : this.http.post(`${this.api}/admin/cms/pages`, this.pageForm);
    req.subscribe({ next: () => { this.showPageModal.set(false); this.loadPages(); } });
  }

  deletePage(id: string): void { if (confirm('Delete?')) this.http.delete(`${this.api}/admin/cms/pages/${id}`).subscribe({ next: () => this.loadPages() }); }

  openBlogModal(b?: any): void {
    this.blogEditId = b?._id || null;
    this.blogForm = b ? { title: b.title, excerpt: b.excerpt, content: b.content, coverImage: b.coverImage, status: b.status, tagsStr: (b.tags || []).join(', ') } : { title: '', excerpt: '', content: '', coverImage: '', status: 'draft', tagsStr: '' };
    this.showBlogModal.set(true);
  }

  saveBlog(): void {
    const body = { ...this.blogForm, tags: this.blogForm.tagsStr ? this.blogForm.tagsStr.split(',').map((t: string) => t.trim()) : [] };
    delete body.tagsStr;
    const req = this.blogEditId ? this.http.put(`${this.api}/admin/cms/blog/${this.blogEditId}`, body) : this.http.post(`${this.api}/admin/cms/blog`, body);
    req.subscribe({ next: () => { this.showBlogModal.set(false); this.loadBlogs(); } });
  }

  deleteBlog(id: string): void { if (confirm('Delete?')) this.http.delete(`${this.api}/admin/cms/blog/${id}`).subscribe({ next: () => this.loadBlogs() }); }
}
