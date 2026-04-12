import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Testimonial {
  id: number;
  name: string;
  credentials: string;
  quote: string;
  image: string;
  rating: number;
}

@Component({
  selector: 'app-testimonial',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './testimonial.html',
  styleUrls: ['./testimonial.scss'],
})
export class TestimonialComponent {
  testimonials: Testimonial[] = [
    {
      id: 1,
      name: 'Priya Sharma',
      credentials: 'Tea Enthusiast',
      quote: 'Absolutely love the quality and freshness of these teas. The whole leaf tea unfurls beautifully and the flavor is incredibly rich. Worth every penny!',
      image: '/sde.png',
      rating: 5,
    },
    {
      id: 2,
      name: 'Rahul Kumar',
      credentials: 'Coffee to Tea Convert',
      quote: 'Been drinking regular tea for years, but this changed everything. The difference in taste is remarkable. Highly recommend to everyone.',
      image: '/sde.png',
      rating: 5,
    },
    {
      id: 3,
      name: 'Anjali Patel',
      credentials: 'Regular Customer',
      quote: 'Great taste, excellent packaging, and fast delivery. The customer service is outstanding. This is now my go-to tea brand.',
      image: '/sde.png',
      rating: 4,
    },
     
  ];

  getRatingArray(rating: number): boolean[] {
    return Array.from({ length: 5 }, (_, i) => i < rating);
  }
}
