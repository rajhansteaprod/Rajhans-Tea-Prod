import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Garden {
  title: string;
  description: string;
  image: string;
  buttonText: string;
}

@Component({
  selector: 'app-our-gardens',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './our-gardens.html',
  styleUrls: ['./our-gardens.scss'],
})
export class OurGardensComponent {
  gardens: Garden[] = [
    {
      title: 'Assam',
      description: "Bold, malty, unapologetic. The Brahmaputra valley's gift to your morning cup.",
      image: 'https://images.unsplash.com/photo-1602020277972-99978250c8bd?w=600&h=800&fit=crop',
      buttonText: 'Explore Assam →',
    },
    {
      title: 'Darjeeling',
      description: "Delicate, floral, prestigious. Himalayan slopes produce India's champagne of teas.",
      image: '/static/darjeeling-gardens.png',
      buttonText: 'Explore Darjeeling →',
    },
    {
      title: 'Nilgiri',
      description: "Bright, fragrant, versatile. South India's blue mountains craft tea with character.",
      image: 'https://images.unsplash.com/photo-1615472910606-9d4f7291944f?w=600&h=800&fit=crop',
      buttonText: 'Explore Nilgiri →',
    },
    {
      title: 'Dooars',
      description: "Full-bodied, smooth, balanced. The foothills' secret for an all-day brew.",
      image: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=600&h=800&fit=crop',
      buttonText: 'Explore Dooars →',
    },
  ];
}
