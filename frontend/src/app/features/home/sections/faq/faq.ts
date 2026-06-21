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
      answer: 'We source directly from small-scale tea gardens in Assam, Darjeeling, Nilgiri, and Dooars. Every pack comes with full traceability so you know exactly which garden your tea came from.',
      isOpen: false,
    },
    {
      id: '1',
      question: 'What makes Rajhans Tea different from other brands?',
      answer: 'We cut out middlemen and auction houses, working directly with farmers. This means fresher tea, fair prices for farmers, and complete transparency for you. We also never use artificial flavours, colours, or blending tricks.',
      isOpen: false,
    },
    {
      id: '2',
      question: 'How do I know my tea is fresh?',
      answer: 'All our tea is nitrogen-flushed and foil-sealed within 48 hours of processing at the garden. Each pack shows the packing date and batch number for full traceability.',
      isOpen: false,
    },
    {
      id: '3',
      question: "What's the difference between Royal, Premium, and Rajdoot?",
      answer: 'Royal is our single-estate, hand-picked grade for special occasions. Premium is our carefully blended estate tea for daily use. Rajdoot is our bold CTC blend perfect for kadak chai. All three are honest grades with no marketing fluff.',
      isOpen: false,
    },
    {
      id: '4',
      question: 'Do you ship across India?',
      answer: 'Yes! We deliver to 500+ cities across India. Orders are typically delivered within 3-5 business days. Free shipping on orders above ₹500.',
      isOpen: false,
    },
    {
      id: '5',
      question: 'Can I order in bulk for my business?',
      answer: 'Absolutely! We offer special bulk pricing for hotels, restaurants, cafes, and corporate gifting. Visit our Buy in Bulk page or contact us at giftings@rajhanstea.com for a custom quote.',
      isOpen: false,
    },
  ];

  toggle(faq: FAQItem): void {
    faq.isOpen = !faq.isOpen;
  }
}