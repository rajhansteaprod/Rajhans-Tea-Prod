import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-product-rail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (products.length > 0) {
      <div class="rail-section">
        <div class="rail-header">
          <h2 class="rail-title">{{ title }}</h2>
          @if (viewAllLink) {
            <a [routerLink]="viewAllLink" class="view-all">View All →</a>
          }
        </div>
        <div class="rail-scroll" #scrollContainer>
          @for (p of products; track p._id) {
            <div class="rail-card">
              <div class="card-img">
                @if (p.images?.[0]) {
                  <img [src]="p.images[0]" [alt]="p.name" loading="lazy" />
                } @else {
                  <div class="img-ph"></div>
                }
              </div>
              <div class="card-body">
                <p class="card-cat">{{ p.category?.name || '' }}</p>
                <p class="card-name">{{ p.name }}</p>
                <p class="card-price">₹{{ p.basePrice }}</p>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .rail-section { margin-bottom: $space-xxl; }
    .rail-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: $space-lg; }
    .rail-title { font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0; }
    .view-all { font-size: $font-size-sm; color: $color-primary; text-decoration:none; font-weight: $font-weight-medium; &:hover { text-decoration:underline; } }

    .rail-scroll {
      display:flex; gap: $space-md; overflow-x:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch;
      padding-bottom: $space-sm;
      &::-webkit-scrollbar { height:4px; }
      &::-webkit-scrollbar-thumb { background: $color-border; border-radius:2px; }
    }

    .rail-card {
      flex:0 0 200px; scroll-snap-align:start;
      background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl;
      overflow:hidden; transition: all $transition-normal;
      &:hover { border-color: $color-border; box-shadow: $shadow-md; transform:translateY(-2px); }
    }
    .card-img { aspect-ratio:1; background: $color-bg-secondary; overflow:hidden;
      img { width:100%; height:100%; object-fit:cover; }
    }
    .img-ph { width:100%; height:100%; background: $color-bg-secondary; }
    .card-body { padding: $space-sm $space-md $space-md; }
    .card-cat { font-size:10px; color: $color-text-tertiary; text-transform:uppercase; margin:0 0 2px; }
    .card-name { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-xxs; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .card-price { font-size: $font-size-sm; font-weight: $font-weight-bold; color: $color-primary; margin:0; }
  `],
})
export class ProductRailComponent {
  @Input() title = '';
  @Input() products: any[] = [];
  @Input() viewAllLink?: string;
}
