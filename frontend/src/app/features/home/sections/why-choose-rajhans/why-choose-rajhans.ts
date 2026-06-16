import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-why-choose-rajhans',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './why-choose-rajhans.html',
  styleUrls: ['./why-choose-rajhans.scss'],
})
export class WhyChooseRajhansComponent {
  features: Feature[] = [
    {
      icon: 'leaf',
      title: 'Fresh Sourced',
      description: 'Freshly sourced tea delivered straight to your doorstep, unlike other teas.',
    },
    {
      icon: 'shield',
      title: 'No Additives',
      description: 'no added artificial flavors or preservatives.',
    },
    {
      icon: 'spice',
      title: 'Kadak & Aromatic',
      description: 'An uncompromised blend delivering strong, bold body and rich natural aroma.',
    },
    {
      icon: 'cups',
      title: 'Lower tea consumption',
      description: 'Requires less quantity per cup while still delivering strong taste, rich color, and aroma.',
    },
  ];
}
