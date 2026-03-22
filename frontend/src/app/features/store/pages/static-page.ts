import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-static-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './static-page.html',
  styleUrls: ['./static-page.scss'],
})
export class StaticPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  readonly page = signal<any>(null);
  readonly notFound = signal(false);

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      this.http.get<{ data: any }>(`${environment.apiUrl}/pages/${params['slug']}`).subscribe({
        next: (res) => {
          this.page.set(res.data);
          this.titleService.setTitle(`${res.data.metaTitle || res.data.title} — Rajhans Tea`);
          if (res.data.metaDescription) this.meta.updateTag({ name: 'description', content: res.data.metaDescription });
        },
        error: () => this.notFound.set(true),
      });
    });
  }
}
