import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-blog-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <h1 class="page-title">Blog</h1>
      <p class="page-sub">Stories, tips, and updates from RnD</p>

      @if (blogs().length === 0) {
        <div class="empty">No blog posts yet. Check back soon!</div>
      } @else {
        <div class="blog-grid">
          @for (b of blogs(); track b._id) {
            <a [routerLink]="'/blog/' + b.slug" class="blog-card">
              @if (b.coverImage) {
                <div class="card-cover"><img [src]="b.coverImage" [alt]="b.title" loading="lazy" /></div>
              }
              <div class="card-body">
                <p class="card-date">{{ b.publishedAt | date:'dd MMM yyyy' }}</p>
                <h3 class="card-title">{{ b.title }}</h3>
                <p class="card-excerpt">{{ b.excerpt }}</p>
                <span class="card-read">Read more →</span>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { max-width:900px; margin:0 auto; padding: $space-xxl $space-lg; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; text-align:center; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; text-align:center; margin:0 0 $space-xxl; }
    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxxl; }
    .blog-grid { display:flex; flex-direction:column; gap: $space-xl; }
    .blog-card { display:grid; grid-template-columns: 280px 1fr; gap: $space-xl; text-decoration:none; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xxl; overflow:hidden; transition: all $transition-normal;
      &:hover { border-color: $color-border; box-shadow: $shadow-lg; }
    }
    @media(max-width:768px) { .blog-card { grid-template-columns:1fr; } }
    .card-cover { aspect-ratio:16/10; overflow:hidden; img { width:100%; height:100%; object-fit:cover; } }
    .card-body { padding: $space-xl; display:flex; flex-direction:column; justify-content:center; }
    .card-date { font-size: $font-size-xs; color: $color-text-tertiary; margin:0 0 $space-sm; }
    .card-title { font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-sm; line-height: $line-height-tight; }
    .card-excerpt { font-size: $font-size-sm; color: $color-text-secondary; margin:0 0 $space-md; line-height: $line-height-relaxed; }
    .card-read { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-primary; }
  `],
})
export class BlogListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly blogs = signal<any[]>([]);

  ngOnInit(): void {
    this.http.get<{ data: any[] }>(`${environment.apiUrl}/blog?limit=20`).subscribe({
      next: (res) => this.blogs.set(res.data),
    });
  }
}
