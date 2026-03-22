import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-blog-post',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (blog()) {
      <article class="post">
        <nav class="breadcrumbs"><a routerLink="/">Home</a> / <a routerLink="/blog">Blog</a> / <span>{{ blog().title }}</span></nav>
        @if (blog().coverImage) {
          <div class="cover"><img [src]="blog().coverImage" [alt]="blog().title" /></div>
        }
        <h1 class="post-title">{{ blog().title }}</h1>
        <div class="post-meta">
          <span>{{ blog().author?.firstName || 'Admin' }}</span> · <span>{{ blog().publishedAt | date:'dd MMM yyyy' }}</span>
        </div>
        @if (blog().tags?.length > 0) {
          <div class="post-tags">
            @for (t of blog().tags; track t) { <span class="tag">{{ t }}</span> }
          </div>
        }
        <div class="post-content" [innerHTML]="blog().content"></div>
        <a routerLink="/blog" class="back-link">← Back to Blog</a>
      </article>
    } @else {
      <div class="loading"><div class="spinner"></div></div>
    }
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .post { max-width:720px; margin:0 auto; padding: $space-xxl $space-lg; }
    .breadcrumbs { font-size: $font-size-xs; color: $color-text-tertiary; margin-bottom: $space-lg; a { color: $color-text-tertiary; text-decoration:none; &:hover { color: $color-primary; } } }
    .cover { border-radius: $radius-xxl; overflow:hidden; margin-bottom: $space-xl; img { width:100%; } }
    .post-title { font-size: $font-size-xxxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-md; line-height: $line-height-tight; }
    .post-meta { font-size: $font-size-sm; color: $color-text-tertiary; margin-bottom: $space-md; }
    .post-tags { display:flex; gap: $space-xs; margin-bottom: $space-xl; }
    .tag { padding:2px $space-sm; border:1px solid $color-border; border-radius: $radius-full; font-size: $font-size-xs; color: $color-text-tertiary; }
    .post-content { font-size: $font-size-md; color: $color-text-primary; line-height: $line-height-relaxed; margin-bottom: $space-xxl; }
    .back-link { font-size: $font-size-sm; color: $color-primary; text-decoration:none; font-weight: $font-weight-semibold; &:hover { text-decoration:underline; } }
    .loading { display:flex; justify-content:center; padding: $space-xxxl; }
    .spinner { width:32px; height:32px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class BlogPostComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  readonly blog = signal<any>(null);

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      this.http.get<{ data: any }>(`${environment.apiUrl}/blog/${params['slug']}`).subscribe({
        next: (res) => {
          this.blog.set(res.data);
          this.titleService.setTitle(`${res.data.title} — Rajhans Tea Blog`);
          this.meta.updateTag({ name: 'description', content: res.data.excerpt || res.data.title });
        },
      });
    });
  }
}
