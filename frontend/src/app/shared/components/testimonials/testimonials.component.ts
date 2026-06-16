import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Testimonial {
  stars: number;
  productName: string;
  quote: string;
  image?: string;
  userName: string;
  userInitials: string;
  userInitialsBg: string;
  date: string;
}

@Component({
  selector: 'app-testimonials',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './testimonials.html',
  styleUrls: ['./testimonials.scss'],
})
export class TestimonialsComponent {
  testimonials: Testimonial[] = [
    {
      stars: 5,
      productName: 'Premium Assam CTC',
      quote: "Best taste & Supreme Quality. We've been buying Rajhans Tea for over 3 years now and the consistency is remarkable. Every cup is perfect.",
      image: '/sde.png',
      userName: 'Ashwin Maheshwari',
      userInitials: 'AM',
      userInitialsBg: '#fef3e8',
      date: 'May 25, 2026',
    },
    {
      stars: 5,
      productName: 'Royal Classic Leaf',
      quote: 'The traceability feature gives me confidence about what I\'m drinking. Love the transparency!',
      userName: 'Priya Sharma',
      image: '/sde.png',
      userInitials: 'PS',
      userInitialsBg: '#fef3e8',
      date: 'June 2, 2026',
    },
    {
      stars: 5,
      productName: 'Rajdoot Kadak Tea',
      quote: 'Authentic Assam taste delivered right to my door. The quality is unmatched.',
      image: '/sde.png',
      userName: 'Rajesh Kumar',
      userInitials: 'RK',
      userInitialsBg: '#fef3e8',
      date: 'May 18, 2026',
    },
    {
      stars: 5,
      productName: 'Darjeeling First Flush',
      quote: 'Exceptional flavor profile and freshness. This is what real tea tastes like!',
      userName: 'Meera Patel',
      userInitials: 'MP',
      image: '/sde.png',
      userInitialsBg: '#fef3e8',
      date: 'May 10, 2026',
    },
  ];

  currentIndex = 0;
  cardsPerView = 3;

  constructor() {
    this.updateCardsPerView();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateCardsPerView();
  }

  private updateCardsPerView(): void {
    const width = window.innerWidth;
    if (width < 768) {
      this.cardsPerView = 1;
    } else if (width < 1024) {
      this.cardsPerView = 2;
    } else {
      this.cardsPerView = 3;
    }
  }

  get visibleTestimonials(): Testimonial[] {
    return this.testimonials.slice(this.currentIndex, this.currentIndex + this.cardsPerView);
  }

  get canScrollLeft(): boolean {
    return this.currentIndex > 0;
  }

  get canScrollRight(): boolean {
    return this.currentIndex + this.cardsPerView < this.testimonials.length;
  }

  scrollLeft(): void {
    if (this.canScrollLeft) {
      this.currentIndex -= this.cardsPerView;
    }
  }

  scrollRight(): void {
    if (this.canScrollRight) {
      this.currentIndex += this.cardsPerView;
    }
  }
}

