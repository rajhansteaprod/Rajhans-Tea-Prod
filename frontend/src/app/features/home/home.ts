import { Component } from '@angular/core';
import { HeroComponent } from './sections/hero/hero';
import { BigStatementComponent } from './sections/big-statement/big-statement';
import { FeaturedProductsComponent } from './sections/featured-products/featured-products';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HeroComponent, BigStatementComponent, FeaturedProductsComponent],
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class HomeComponent {}
