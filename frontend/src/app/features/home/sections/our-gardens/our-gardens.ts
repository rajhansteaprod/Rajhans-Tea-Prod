import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Garden {
  id: string;
  title: string;
  description: string;
  characteristics: string;
  image: string;
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
      id: 'assam',
      title: 'Assam',
      description: 'Bold, malty, unapologetic. The Brahmaputra valley\'s gift to your morning cup.',
      characteristics: 'Bold, malty, unapologetic. The Brahmaputra valley\'s gift to your morning cup.',
      image: '/sde.png',
    },
    {
      id: 'darjeeling',
      title: 'Darjeeling',
      description: 'Delicate, floral, prestigious. Himalayan slopes produce India\'s champagne of teas.',
      characteristics: 'Delicate, floral, prestigious. Himalayan slopes produce India\'s champagne of teas.',
      image: '/sde.png',
    },
    {
      id: 'nilgiri',
      title: 'Nilgiri',
      description: 'Bright, fragrant, versatile. South India\'s blue mountains craft tea with character.',
      characteristics: 'Bright, fragrant, versatile. South India\'s blue mountains craft tea with character.',
      image: '/sde.png',
    },
    {
      id: 'dooars',
      title: 'Dooars',
      description: 'Full-bodied, smooth, balanced. The foothills\' secret for an all-day brew.',
      characteristics: 'Full-bodied, smooth, balanced. The foothills\' secret for an all-day brew.',
      image: '/sde.png',
    },
  ];
}
