import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Testimonial {
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
  @ViewChild('scrollRow') scrollRow!: ElementRef<HTMLDivElement>;

  testimonials: Testimonial[] = [
    {
      productName: 'Premium Assam CTC',
      quote: "Best taste & Supreme Quality. We've been buying Rajhans Tea for over 3 years now and the consistency is remarkable. Every cup is perfect.",
      
      userName: 'Ashwin Maheshwari',
      userInitials: 'AM',
      userInitialsBg: '#fef3e8',
      date: 'May 25, 2026',
    },
    {
      productName: 'Royal Classic Leaf',
      quote: 'The traceability feature gives me confidence about what I\'m drinking. Love the transparency!',
      userName: 'Priya Sharma',
      userInitials: 'PS',
      userInitialsBg: '#fef3e8',
      date: 'June 2, 2026',
    },
    {
      productName: 'Rajdoot Kadak Tea',
      quote: 'Authentic Assam taste delivered right to my door. The quality is unmatched.',
      image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=300&h=200&fit=crop',
      userName: 'Rajesh Kumar',
      userInitials: 'RK',
      userInitialsBg: '#fef3e8',
      date: 'May 18, 2026',
    },
    {
      productName: 'Premium Assam CTC',
      quote: 'Our hotel uses Rajhans for all our tea service. Guests love it and so do we!',
      userName: 'Meera Patel',
      userInitials: 'MP',
      userInitialsBg: '#fef3e8',
      date: 'June 1, 2026',
    },
  ];

  scrollLeft(): void {
    if (this.scrollRow) {
      this.scrollRow.nativeElement.scrollBy({
        left: -320,
        behavior: 'smooth',
      });
    }
  }

  scrollRight(): void {
    if (this.scrollRow) {
      this.scrollRow.nativeElement.scrollBy({
        left: 320,
        behavior: 'smooth',
      });
    }
  }
}
