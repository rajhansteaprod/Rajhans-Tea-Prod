import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Meta, Title } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

interface Blog {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  content?: string;
  coverImage: string;
  author: { firstName: string; lastName: string };
  tags: string[];
  publishedAt: string;
  createdAt: string;
}

interface BlogResponse {
  data: Blog[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Component({
  selector: 'app-blog-list-page',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './blog-list-page.html',
  styleUrls: ['./blog-list-page.scss'],
})
export class BlogListPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  blogs = signal<Blog[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  currentPage = signal(1);
  totalPages = signal(1);
  limit = signal(10);

  searchQuery = signal('');
  selectedTag = signal<string | null>(null);

  readonly categories = [
    { name: 'Brewing Guide', tag: 'brewing' },
    { name: 'Our Story', tag: 'story' },
    { name: 'Tea Culture', tag: 'recipes' },
    { name: 'Wellness', tag: 'health' }
  ];

  ngOnInit() {
    this.titleService.setTitle('Blog — Rajhans Tea');
    this.meta.updateTag({
      name: 'description',
      content: 'Read articles about tea, brewing tips, and company updates from Rajhans Tea.',
    });

    this.route.queryParams.subscribe((params) => {
      this.currentPage.set(params['page'] ? parseInt(params['page'], 10) : 1);
      this.selectedTag.set(params['tag'] || null);
      this.loadBlogs();
    });
  }

  loadBlogs() {
    this.loading.set(true);
    this.error.set(null);

    let url = `${environment.apiUrl}/blog?page=${this.currentPage()}&limit=${this.limit()}`;

    if (this.selectedTag()) {
      url += `&tag=${this.selectedTag()}`;
    }

    this.http.get<BlogResponse>(url).subscribe({
      next: (res) => {
        this.blogs.set(res.data);
        this.totalPages.set(res.meta.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load blogs. Please try again.');
        this.loading.set(false);
      },
    });
  }

  filterByTag(tag: string) {
    this.selectedTag.set(this.selectedTag() === tag ? null : tag);
    this.currentPage.set(1);
    this.loadBlogs();
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadBlogs();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getDisplayCategory(tags: string[]): string {
    if (!tags || tags.length === 0) return 'TEA CULTURE';
    const tag = tags[0].toLowerCase();
    if (tag.includes('brew') || tag.includes('guide')) return 'BREWING GUIDE';
    if (tag.includes('story') || tag.includes('process') || tag.includes('garden')) return 'OUR STORY';
    if (tag.includes('health') || tag.includes('benefit') || tag.includes('well') || tag.includes('science')) return 'WELLNESS';
    return 'TEA CULTURE';
  }

  getReadTime(content?: string): string {
    const words = content ? content.split(/\s+/).length : 100;
    const mins = Math.max(3, Math.ceil(words / 150));
    return `${mins} min read`;
  }

  getImageUrl(imagePath: string): string {
    if (!imagePath) return 'https://images.unsplash.com/photo-1563789031959-4c02bcb41319?w=800&h=600&fit=crop';
    if (imagePath.startsWith('http')) return imagePath;
    const base = environment.apiUrl.replace('/api', '');
    return `${base}${imagePath}`;
  }
}

