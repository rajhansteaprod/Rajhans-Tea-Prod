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
  templateUrl: './cms-management.html',
  styleUrls: ['./cms-management.scss'],
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
