import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProductCardComponent } from '../product-card/product-card';
import { Product } from '../../../core/services/catalog.service';

@Component({
  selector: 'app-product-rail',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent],
  templateUrl: './product-rail.html',
  styleUrls: ['./product-rail.scss'],
})
export class ProductRailComponent {
  @Input() title = '';
  @Input() products: Product[] = [];
  @Input() viewAllLink?: string;
}
