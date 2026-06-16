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
      id: 'sourcing',
      question: 'Where does Rajhans Tea source its tea from?',
      answer: 'We source directly from small-scale tea gardens in Assam, Darjeeling, Nilgiri, and Dooars. Every pack comes with full traceability so you know exactly which garden your tea came from.',
      isOpen: true,
    },
    {
      id: 'difference',
      question: 'What makes Rajhans Tea different from other brands?',
      answer: 'We focus on quality over quantity. Our teas are sourced directly from gardens, hand-picked and processed with care. We maintain strict quality standards and offer complete traceability for every pack.',
      isOpen: false,
    },
    {
      id: 'freshness',
      question: 'How do I know my tea is fresh?',
      answer: 'Each pack has a date of packing printed on it. We recommend consuming within 6-12 months for optimal flavor. Store in an airtight container away from sunlight for best results.',
      isOpen: false,
    },
    {
      id: 'varieties',
      question: 'What\'s the difference between Royal, Premium, and Rajdoot?',
      answer: 'Royal is our premium offering with the finest leaves. Premium is our standard quality with excellent flavor. Rajdoot is our value offering with bold, consistent taste. All maintain our quality standards.',
      isOpen: false,
    },
    {
      id: 'shipping',
      question: 'Do you ship across India?',
      answer: 'Yes, we ship across all of India. Standard delivery takes 5-7 business days. We offer free shipping on orders above ₹500. Track your order using the tracking number sent to your email.',
      isOpen: false,
    },
    {
      id: 'bulk',
      question: 'Can I order in bulk for my business?',
      answer: 'Absolutely! We offer bulk orders and special pricing for businesses. Contact our B2B team at business@rajhanstea.com or call us for a custom quote based on your requirements.',
      isOpen: false,
    },
  ];

  toggleFAQ(faq: FAQItem): void {
    faq.isOpen = !faq.isOpen;
  }
}
