import { Component } from '@angular/core';
import { HeroComponent } from './sections/hero/hero';
import { FeaturedProductsComponent } from './sections/featured-products/featured-products';
import { BigStatementComponent } from './sections/big-statement/big-statement';
import { SplitVisualComponent } from './sections/split-visual/split-visual';
import { ExploreCtaComponent } from './sections/explore-cta/explore-cta';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HeroComponent, FeaturedProductsComponent, BigStatementComponent, SplitVisualComponent, ExploreCtaComponent],
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class HomeComponent {}
