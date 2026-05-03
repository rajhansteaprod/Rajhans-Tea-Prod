import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Meta, Title } from '@angular/platform-browser';

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
        this.titleService.setTitle(`${res.data.title} — Rajhans Tea Blog`);
        this.meta.updateTag({
          name: 'description',
          content: res.data.excerpt,
        });
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
}
