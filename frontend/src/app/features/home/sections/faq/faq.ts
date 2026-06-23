import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  isOpen: boolean;
}

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './faq.html',
  styleUrls: ['./faq.scss'],
})
export class FAQComponent {
  faqs: FAQItem[] = [
    {
      id: '0',
      question: 'Where does Rajhans Tea source its tea from?',
      answer: 'Rajhans Tea sources its tea from trusted tea-growing regions across India, including Assam, Darjeeling, Nilgiri, Dooars, and other selected gardens. Each blend is carefully chosen to deliver strong colour, rich taste, and a satisfying everyday chai experience.',
      isOpen: false,
    },
    {
      id: '1',
      question: 'What makes Rajhans Tea different from other brands?',
      answer: 'Rajhans Tea is made for people who want real kadak chai without unnecessary artificial flavours. Our blends are selected for strong colour, bold taste, rich aroma, and better consistency in every cup. Since the tea is strong and well-blended, you may need less tea per serving compared to regular loose tea.',
      isOpen: false,
    },
    {
      id: '2',
      question: 'How do I know my tea is fresh?',
      answer: 'Fresh tea gives a stronger aroma, better colour, and fuller taste when brewed. Rajhans Tea is packed carefully to help preserve its natural strength and freshness, so your chai tastes rich and satisfying every time.',
      isOpen: false,
    },
    {
      id: '3',
      question: "What's the difference between Royal, Premium, and Rajdoot?",
      answer: 'Rajhans Royal is our strong, kadak blend made for rich colour and full-bodied chai. Rajhans Premium is a balanced everyday tea with smooth taste and good strength. Rajhans Rajdoot is made for regular chai drinkers who prefer a dependable, strong, value-friendly blend.',
      isOpen: false,
    },
    {
      id: '4',
      question: 'Do you ship across India?',
      answer: 'Yes, Rajhans Tea ships across India. Delivery timelines may vary depending on your location and courier availability.',
      isOpen: false,
    },
    {
      id: '5',
      question: 'Can I order in bulk for my business?',
      answer: 'Yes. We supply tea for hotels, restaurants, cafés, offices, canteens, food chains, and distributors. For bulk orders, you can contact us directly for pricing, sample packs, and blend recommendations based on your requirement.',
      isOpen: false,
    },
    {
      id: '6',
      question: 'Does Rajhans Tea contain artificial flavours or preservatives?',
      answer: 'No. Rajhans Tea focuses on natural tea taste. Our blends are made without artificial flavours or preservatives, so you get a clean, strong, and honest chai experience.',
      isOpen: false,
    },
    {
      id: '7',
      question: 'How much Rajhans Tea should I use for one cup?',
      answer: 'For one cup of chai, start with around 1 teaspoon of Rajhans Tea. If you prefer extra kadak chai, you can add a little more. Since Rajhans Tea is strong, many customers find that they need less tea than usual.',
      isOpen: false,
    },
    {
      id: '8',
      question: 'Can I use Rajhans Tea for black tea?',
      answer: 'Yes, you can use Rajhans Tea for black tea as well. However, our blends are especially made for strong Indian milk chai.',
      isOpen: false,
    },
    {
      id: '9',
      question: 'Do you provide samples for business buyers?',
      answer: 'Yes. For restaurants, cafés, hotels, offices, and distributors, sample packs can be arranged before bulk ordering. This helps you test the colour, taste, strength, and quantity required per cup.',
      isOpen: false,
    },
    {
      id: '10',
      question: 'What should I do if I receive a damaged or incorrect product?',
      answer: 'If your order arrives damaged or incorrect, contact Rajhans Tea support with your order details and photos of the package. Our team will review it and help you with the next steps.',
      isOpen: false,
    },
  ];

  toggle(faq: FAQItem): void {
    faq.isOpen = !faq.isOpen;
  }
}