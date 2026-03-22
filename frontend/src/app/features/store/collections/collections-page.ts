import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CatalogService, Collection } from '../../../core/services/catalog.service';

@Component({
  selector: 'app-collections-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './collections-page.html',
  styleUrls: ['./collections-page.scss'],
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
