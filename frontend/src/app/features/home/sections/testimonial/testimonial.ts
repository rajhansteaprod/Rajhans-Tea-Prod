import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Testimonial {
  id: number;
  name: string;
  credentials: string;
  quote: string;
  image: string;
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
      name: 'Dr. Vibhuti',
      credentials: 'MBBS, PGDCC, DAM',
      quote: 'We need to know about ceramides. The unsung heroes of the skincare industry-they protect the skin\'s barrier, minimize the appearance of wrinkles & fine lines. By improving overall skin texture, they truly are an indispensable part of the skincare routine.',
      image: 'assets/images/testimonial-1.jpg',
    },
  ];
}
