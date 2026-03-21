import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-static-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (page()) {
      <div class="static-page">
        <h1 class="page-title">{{ page().title }}</h1>
        <div class="page-content" [innerHTML]="page().content"></div>
      </div>
    } @else if (notFound()) {
      <div class="not-found">
        <h2>Page not found</h2>
        <p>The page you're looking for doesn't exist.</p>
        <a routerLink="/" class="back-link">Go Home</a>
      </div>
    } @else {
      <div class="loading"><div class="spinner"></div></div>
    }
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .static-page { max-width:800px; margin:0 auto; padding: $space-xxl $space-lg; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xl; text-align:center; }
    .page-content { font-size: $font-size-md; color: $color-text-primary; line-height: $line-height-relaxed; }
    .not-found { text-align:center; padding: $space-xxxl;
      h2 { font-size: $font-size-xxl; color: $color-text-primary; margin:0 0 $space-sm; }
      p { color: $color-text-tertiary; margin:0 0 $space-lg; }
    }
    .back-link { color: $color-primary; text-decoration:none; font-weight: $font-weight-semibold; }
    .loading { display:flex; justify-content:center; padding: $space-xxxl; }
    .spinner { width:32px; height:32px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class StaticPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  readonly page = signal<any>(null);
  readonly notFound = signal(false);

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      this.http.get<{ data: any }>(`${environment.apiUrl}/pages/${params['slug']}`).subscribe({
        next: (res) => {
          this.page.set(res.data);
          this.titleService.setTitle(`${res.data.metaTitle || res.data.title} — Rajhans`);
          if (res.data.metaDescription) this.meta.updateTag({ name: 'description', content: res.data.metaDescription });
        },
        error: () => this.notFound.set(true),
      });
    });
  }
}
