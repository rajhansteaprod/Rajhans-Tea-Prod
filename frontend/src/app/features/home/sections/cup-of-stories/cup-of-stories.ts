import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

interface Blog {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  publishedAt: string;
}

@Component({
  selector: 'app-cup-of-stories',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cup-of-stories.html',
  styleUrls: ['./cup-of-stories.scss'],
})
export class CupOfStoriesComponent implements OnInit {
  private readonly http = inject(HttpClient);

  blogs = signal<Blog[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.loadBlogs();
  }

  loadBlogs() {
    this.http.get<{ data: Blog[] }>(`${environment.apiUrl}/blog?limit=3`).subscribe({
      next: (res) => {
        this.blogs.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
