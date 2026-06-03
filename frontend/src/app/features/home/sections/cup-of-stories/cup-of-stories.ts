import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ButtonComponent } from '../../../../../shared/components/button/button.component';
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
  imports: [CommonModule, RouterLink, ButtonComponent],
  templateUrl: './cup-of-stories.html',
  styleUrls: ['./cup-of-stories.scss'],
})
export class CupOfStoriesComponent implements OnInit {
  private readonly http = inject(HttpClient);

  blogs = signal<Blog[]>([]);
  loading = signal(true);
  currentIndex = signal(0);
  cardsPerView = 2;

  visibleCards = computed(() => {
    const blogs = this.blogs();
    const idx = this.currentIndex();
    return blogs.slice(idx, idx + this.cardsPerView);
  });

  canGoNext = computed(() => {
    return this.currentIndex() + this.cardsPerView < this.blogs().length;
  });

  canGoPrev = computed(() => {
    return this.currentIndex() > 0;
  });

  ngOnInit() {
    this.loadBlogs();
  }

  loadBlogs() {
    this.http.get<{ data: Blog[] }>(`${environment.apiUrl}/blog?limit=6`).subscribe({
      next: (res) => {
        this.blogs.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  prev() {
    if (this.canGoPrev()) {
      this.currentIndex.set(this.currentIndex() - 1);
    }
  }

  next() {
    if (this.canGoNext()) {
      this.currentIndex.set(this.currentIndex() + 1);
    }
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
