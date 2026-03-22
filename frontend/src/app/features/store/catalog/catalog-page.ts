import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { SearchStore } from '../../../core/services/search.store';
import { CartStore } from '../../../core/services/cart.store';

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './catalog-page.html',
  styleUrls: ['./catalog-page.scss'],
})
export class CatalogPageComponent implements OnInit {
  readonly store = inject(SearchStore);
  private readonly route = inject(ActivatedRoute);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  categoryName = '';

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const slug = params['slug'];
      this.categoryName = slug?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || '';
      this.titleService.setTitle(`${this.categoryName || 'Catalog'} — Rajhans Tea`);
      this.store.search('', { categorySlug: slug });
    });
  }
}
