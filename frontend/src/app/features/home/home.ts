import { Component } from '@angular/core';
import { HeroComponent } from './sections/hero/hero';
import { BigStatementComponent } from './sections/big-statement/big-statement';
import { UspGridComponent } from './sections/usp-grid/usp-grid';
import { FeaturedProductsComponent } from './sections/featured-products/featured-products';
import { BundleBuilderComponent } from './sections/bundle-builder/bundle-builder';
import { StorytellingComponent } from './sections/storytelling/storytelling';
import { TestimonialComponent } from './sections/testimonial/testimonial';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    HeroComponent,
    BigStatementComponent,
    UspGridComponent,
    FeaturedProductsComponent,
    BundleBuilderComponent,
    StorytellingComponent,
    TestimonialComponent,
  ],
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class HomeComponent {}
