import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CatalogService, Collection } from '../../../core/services/catalog.service';

@Component({
  selector: 'app-collections-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <h1 class="page-title">Collections</h1>
      <p class="page-sub">Explore our curated collections</p>

      <div class="collections-grid">
        @for (c of collections(); track c._id) {
          <a [routerLink]="'/collections/' + c.slug" class="collection-card">
            <div class="card-image">
              @if (c.image) { <img [src]="c.image" [alt]="c.name" loading="lazy" /> }
              @else { <div class="img-ph"><span>{{ c.name[0] }}</span></div> }
            </div>
            <div class="card-body">
              <h3 class="card-name">{{ c.name }}</h3>
              @if (c.description) { <p class="card-desc">{{ c.description }}</p> }
            </div>
          </a>
        }
      </div>
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { max-width:1100px; margin:0 auto; padding: $space-xxl $space-lg; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; text-align:center; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; text-align:center; margin:0 0 $space-xxl; }
    .collections-grid { display:grid; grid-template-columns: repeat(3,1fr); gap: $space-lg; }
    @media(max-width:768px) { .collections-grid { grid-template-columns: repeat(2,1fr); } }
    .collection-card { background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xxl; overflow:hidden; text-decoration:none; transition: all $transition-normal;
      &:hover { border-color: $color-border; box-shadow: $shadow-lg; transform:translateY(-3px); }
    }
    .card-image { aspect-ratio:16/9; background: $color-bg-secondary; overflow:hidden;
      img { width:100%; height:100%; object-fit:cover; }
    }
    .img-ph { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background: linear-gradient(135deg, $color-primary-light, $color-bg-secondary);
      span { font-size: $font-size-xxxl; font-weight: $font-weight-bold; color: $color-primary; }
    }
    .card-body { padding: $space-lg; }
    .card-name { font-size: $font-size-lg; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .card-desc { font-size: $font-size-sm; color: $color-text-tertiary; margin:0; }
  `],
})
export class CollectionsPageComponent implements OnInit {
  private readonly catalogService = inject(CatalogService);
  readonly collections = signal<Collection[]>([]);

  ngOnInit(): void {
    this.catalogService.getCollectionsPublic().subscribe({
      next: (res) => this.collections.set(res.data),
    });
  }
}
