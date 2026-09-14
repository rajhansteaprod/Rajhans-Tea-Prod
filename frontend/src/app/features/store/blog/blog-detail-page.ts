import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Meta, Title } from '@angular/platform-browser';
import { injectJsonLd } from '../../../core/seo/seo-content';

interface Blog {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: { firstName: string; lastName: string };
  tags: string[];
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  metaTitle?: string;
  metaDescription?: string;
}

@Component({
  selector: 'app-blog-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './blog-detail-page.html',
  styleUrls: ['./blog-detail-page.scss'],
})
export class BlogDetailPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  blog = signal<Blog | null>(null);
  loading = signal(false);
  notFound = signal(false);

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.loadBlog(params['slug']);
    });
  }

  loadBlog(slug: string) {
    this.loading.set(true);
    this.notFound.set(false);

    this.http.get<{ data: Blog }>(`${environment.apiUrl}/blog/${slug}`).subscribe({
      next: (res) => {
        this.blog.set(res.data);
        this.titleService.setTitle(res.data.metaTitle || `${res.data.title} — Rajhans Tea Blog`);
        this.meta.updateTag({
          name: 'description',
          content: res.data.excerpt,
        });

        // Self-referencing canonical, derived from the resolved blog's own slug
        // (never the raw route param, and never left at whatever default —
        // e.g. the homepage — a shared route-level service may have set before
        // this data arrived). Matches the site's trailing-slash convention used
        // by the sitemap and product-detail.ts's identical pattern.
        const pageUrl = `https://rajhanstea.com/blog/${res.data.slug}/`;
        let canonical = this.document.querySelector('link[rel="canonical"]');
        if (!canonical) {
          canonical = this.document.createElement('link');
          canonical.setAttribute('rel', 'canonical');
          this.document.head.appendChild(canonical);
        }
        canonical.setAttribute('href', pageUrl);

        // BlogPosting structured data — built only from fields the Blog model
        // actually and reliably has (see backend/src/modules/cms/models/blog.model.ts).
        // Author/image are omitted when genuinely absent rather than
        // substituted with any placeholder (getImageUrl()'s stock-photo
        // fallback is deliberately NOT used here — it isn't real article
        // data). mainEntityOfPage always mirrors the canonical set above.
        const schema: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: res.data.title,
          mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
          publisher: { '@type': 'Organization', name: 'Rajhans Tea', url: 'https://rajhanstea.com' },
        };
        if (res.data.publishedAt) schema['datePublished'] = res.data.publishedAt;
        if (res.data.updatedAt) schema['dateModified'] = res.data.updatedAt;
        if (res.data.author?.firstName) {
          schema['author'] = { '@type': 'Person', name: `${res.data.author.firstName} ${res.data.author.lastName || ''}`.trim() };
        }
        if (res.data.coverImage) {
          const absoluteImage = res.data.coverImage.startsWith('http')
            ? res.data.coverImage
            : `${environment.apiUrl.replace('/api', '')}${res.data.coverImage}`;
          schema['image'] = absoluteImage;
        }
        injectJsonLd(this.document, 'blogposting-jsonld', schema);

        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getImageUrl(imagePath: string): string {
    if (!imagePath) return 'https://images.unsplash.com/photo-1563789031959-4c02bcb41319?w=800&h=600&fit=crop';
    if (imagePath.startsWith('http')) return imagePath;
    const base = environment.apiUrl.replace('/api', '');
    return `${base}${imagePath}`;
  }
}
