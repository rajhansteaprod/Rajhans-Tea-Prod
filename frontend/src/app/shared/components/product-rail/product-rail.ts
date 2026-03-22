import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProductCardComponent } from '../product-card/product-card';

@Component({
  selector: 'app-product-rail',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent],
  templateUrl: './product-rail.html',
  styleUrls: ['./product-rail.scss'],
})
export class ProductRailComponent {
  @Input() title = '';
  @Input() products: any[] = [];
  @Input() viewAllLink?: string;
}
