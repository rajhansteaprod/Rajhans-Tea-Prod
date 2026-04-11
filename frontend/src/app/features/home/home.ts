import { Component } from '@angular/core';
import { HeroComponent } from './sections/hero/hero';
import { BundleBuilderComponent } from './sections/bundle-builder/bundle-builder';
import { BigStatementComponent } from './sections/big-statement/big-statement';
import { FeaturedProductsComponent } from './sections/featured-products/featured-products';
import { Usp2Component } from './sections/usp2/usp2';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HeroComponent, BundleBuilderComponent, BigStatementComponent, FeaturedProductsComponent, Usp2Component],
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class HomeComponent {}
