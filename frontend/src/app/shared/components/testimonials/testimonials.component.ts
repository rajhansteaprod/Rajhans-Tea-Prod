import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Review {
  customerName: string;
  date: string;
  rating: number;
  isVerifiedBuyer: boolean;
  reviewTitle: string;
  reviewText: string;
  productName: string;
  productImage: string;
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

  reviews: Review[] = [
    {
      customerName: 'Ashwin Maheshwari',
      date: 'May 25, 2026',
      rating: 5,
      isVerifiedBuyer: true,
      reviewTitle: 'Strong and kadak taste',
      reviewText: "We've been buying Rajhans Tea for over 3 years now. The consistency is remarkable. It has a beautiful strong and kadak taste that is perfect for milk tea.",
      productName: 'Rajhans Royal Tea',
      productImage: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=120&h=120&fit=crop'
    },
    {
      customerName: 'Priya Sharma',
      date: 'June 02, 2026',
      rating: 5,
      isVerifiedBuyer: true,
      reviewTitle: 'Perfect colour in every cup',
      reviewText: 'The liquor quality is outstanding! It gives a perfect deep golden colour to the tea in every single brew. Entire family is absolutely in love with it.',
      productName: 'Rajhans Premium Tea',
      productImage: 'https://images.unsplash.com/photo-1563822249548-9a72b6353cd1?w=120&h=120&fit=crop'
    },
    {
      customerName: 'Rajesh Kumar',
      date: 'May 18, 2026',
      rating: 5,
      isVerifiedBuyer: true,
      reviewTitle: 'Fresh aroma, loved by family',
      reviewText: 'As soon as you open the pack, a beautiful fresh aroma of tea gardens fills the kitchen. The quality is unmatched and loved by all.',
      productName: 'Rajhans Rajdoot Tea',
      productImage: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=120&h=120&fit=crop'
    },
    {
      customerName: 'Meera Patel',
      date: 'June 01, 2026',
      rating: 5,
      isVerifiedBuyer: true,
      reviewTitle: 'Requires less tea per cup',
      reviewText: 'This blend is highly concentrated in flavor. It requires less tea per cup compared to our regular chai brand, making it very economical.',
      productName: 'Rajhans Royal Tea',
      productImage: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=120&h=120&fit=crop'
    },
    {
      customerName: 'Vikram Singh',
      date: 'May 29, 2026',
      rating: 5,
      isVerifiedBuyer: true,
      reviewTitle: 'Better than our regular chai brand',
      reviewText: 'We switched from our regular well-known national chai brand last month and the difference is day and night. Rajhans is superior.',
      productName: 'Rajhans Premium Tea',
      productImage: 'https://images.unsplash.com/photo-1563822249548-9a72b6353cd1?w=120&h=120&fit=crop'
    }
  ];

  scrollLeft(): void {
    if (this.scrollRow) {
      const element = this.scrollRow.nativeElement;
      const firstCard = element.querySelector('.review-card');
      if (firstCard) {
        const gap = element.clientWidth > 767 ? 24 : 16;
        const scrollAmount = firstCard.clientWidth + gap;
        element.scrollBy({
          left: -scrollAmount,
          behavior: 'smooth',
        });
      }
    }
  }

  scrollRight(): void {
    if (this.scrollRow) {
      const element = this.scrollRow.nativeElement;
      const firstCard = element.querySelector('.review-card');
      if (firstCard) {
        const gap = element.clientWidth > 767 ? 24 : 16;
        const scrollAmount = firstCard.clientWidth + gap;
        element.scrollBy({
          left: scrollAmount,
          behavior: 'smooth',
        });
      }
    }
  }
}
