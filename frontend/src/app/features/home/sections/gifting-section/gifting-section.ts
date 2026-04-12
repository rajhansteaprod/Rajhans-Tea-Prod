import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-gifting-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gifting-section.html',
  styleUrls: ['./gifting-section.scss'],
})
export class GiftingSectionComponent {
  heading = 'Corporate Tea Gifting';
  description =
    'Elevate your corporate gifting with premium whole leaf teas. Impress clients, reward employees, and strengthen business relationships with thoughtfully curated tea experiences from Rajhans Tea.';

  giftingOptions = [
    {
      title: 'Ready to Ship',
      description: 'Grab our curated corporate tea collections that are ready to ship. Perfect for employee onboarding, client appreciation, or seasonal gifting. Premium whole leaf teas in elegant packaging.',
      image: '/sde.png',
      icon: '🚚',
    },
    {
      title: 'Branded Solutions',
      description: 'Add your company logo and branding to our tea packaging. Create a lasting impression with personalized tea gifts that reflect your brand identity and values.',
      image: '/sde.png',
      icon: '🏢',
    },
     
  ];
}
