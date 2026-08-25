import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { CartStore } from '../../../core/services/cart.store';

interface Step {
  title: string;
  subtitle: string;
  options: Option[];
}

interface Option {
  icon: string;
  title: string;
  description: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number;
  image: string;
  slug: string;
}

@Component({
  selector: 'app-tea-finder',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './tea-finder.html',
  styleUrls: ['./tea-finder.scss'],
})
export class TeaFinderComponent implements OnInit {
  private readonly cartStore = inject(CartStore);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  ngOnInit(): void {
    this.titleService.setTitle('Tea Finder — Discover Your Perfect Chai | Rajhans Tea');
    this.meta.updateTag({
      name: 'description',
      content:
        "Answer a few quick questions and we'll match you to the right Rajhans loose-leaf CTC chai — by strength, aroma and how you brew. Find your tea in under a minute.",
    });
  }

  readonly currentStep = signal<number>(0);
  readonly selectedOptions = signal<{ [key: number]: string }>({});
  readonly showResults = signal<boolean>(false);
  readonly aiRecommendationText = signal<string>('');
  readonly recommendedProduct = signal<Product>({
    id: '6a32967ee308674317afd5be',
    name: 'Rajhans Roykan CTC',
    description: 'The Classic Assamese Brew - 250g. Experience the authentic, robust, and full-bodied taste of premium CTC tea leaf directly sourced from the best estates of Assam.',
    price: 149,
    originalPrice: 180,
    image: '/uploads/32f3fc2a-c3f0-4e1a-8991-5cbcbca3b713.png',
    slug: 'rajhans-roykan-ctc',
  });

  private readonly catalogProducts: Product[] = [
    {
      id: '6a32967ee308674317afd5be',
      name: 'Rajhans Roykan CTC',
      description: 'The Classic Assamese Brew - 250g. Experience the authentic, robust, and full-bodied taste of premium CTC tea leaf directly sourced from the best estates of Assam.',
      price: 149,
      originalPrice: 180,
      image: '/uploads/32f3fc2a-c3f0-4e1a-8991-5cbcbca3b713.png',
      slug: 'rajhans-roykan-ctc'
    },
    {
      id: '6a32967ee308674317afd5c1',
      name: 'Rajhans Premium Gold',
      description: 'Medium Bodied, in Your Brew - 250g. A premium selection of fine CTC leaves blended to perfection to deliver a smooth, balanced taste and a rich golden liquor.',
      price: 299,
      originalPrice: 349,
      image: '/uploads/32f3fc2a-c3f0-4e1a-8991-5cbcbca3b713.png',
      slug: 'rajhans-premium-gold'
    },
    {
      id: '6a32967ee308674317afd5c4',
      name: 'Rajhans Masala Chai',
      description: 'Spice Up Your Mornings - 250g. Authentic CTC Assam tea infused with premium ground spices including ginger, cardamom, cinnamon, cloves, and black pepper.',
      price: 189,
      originalPrice: 189,
      image: '/uploads/32f3fc2a-c3f0-4e1a-8991-5cbcbca3b713.png',
      slug: 'rajhans-masala-chai'
    },
    {
      id: '6a32967ee308674317afd5c7',
      name: 'Rajhans Traditional Blend',
      description: 'Rich Aroma, Perfect Balance - 250g. Our heritage blend passed down through generations. Crafted with care to provide the perfect balanced cup of daily kadak tea.',
      price: 199,
      originalPrice: 199,
      image: '/uploads/32f3fc2a-c3f0-4e1a-8991-5cbcbca3b713.png',
      slug: 'rajhans-traditional-blend'
    },
    {
      id: '6a32967ee308674317afd5ca',
      name: 'Rajhans Darjeeling First Flush',
      description: 'Himalayan Elegance - 100g. Hand-plucked during the spring harvest. Exquisite light gold liquor with delicate floral notes and a signature muscatel finish.',
      price: 499,
      originalPrice: 599,
      image: '/uploads/32f3fc2a-c3f0-4e1a-8991-5cbcbca3b713.png',
      slug: 'rajhans-darjeeling-first-flush'
    },
    {
      id: '6a32967ee308674317afd5cd',
      name: 'Rajhans Nilgiri Special',
      description: 'Blue Mountain Brew - 250g. Crisp, bright, and highly aromatic black tea grown at high altitudes in the Nilgiri hills. Makes excellent iced tea too.',
      price: 249,
      originalPrice: 249,
      image: '/uploads/32f3fc2a-c3f0-4e1a-8991-5cbcbca3b713.png',
      slug: 'rajhans-nilgiri-special'
    }
  ];

  readonly steps: Step[] = [
    {
      title: 'What type of tea do you like?',
      subtitle: 'Tell us about the strength and body you prefer in your cup.',
      options: [
        {
          icon: 'flame',
          title: 'Kadak / Strong',
          description: 'Bold, full-bodied chai that hits hard — deep colour and intense taste.',
        },
        {
          icon: 'coffee',
          title: 'Medium Strength',
          description: 'A balanced cup — not too light, not too strong.',
        },
        {
          icon: 'sparkles',
          title: 'Light & Mild',
          description: 'Subtle, gentle brew — easy on the palate, low bitterness.',
        },
      ],
    },
    {
      title: 'When do you typically enjoy your tea?',
      subtitle: 'Your chai moment tells us a lot about what you need.',
      options: [
        {
          icon: 'sunrise',
          title: 'Morning — First Cup',
          description: 'Need a strong, energising cup to start the day right.',
        },
        {
          icon: 'coffee',
          title: 'Afternoon Break',
          description: 'A refreshing mid-day cup to keep going.',
        },
        {
          icon: 'sunset',
          title: 'Evening Wind-down',
          description: 'Something warm and comforting to relax with.',
        },
        {
          icon: 'sparkles',
          title: 'Anytime — Multiple Cups',
          description: 'Chai is a constant companion throughout the day.',
        },
      ],
    },
    {
      title: 'How do you prefer your milk and water combination?',
      subtitle: 'The ratio of milk to water changes the richness and body of your chai.',
      options: [
        {
          icon: 'flame',
          title: 'All Milk — No Water',
          description: 'Pure milk chai — very rich, creamy, and full-bodied.',
        },
        {
          icon: 'coffee',
          title: 'More Milk, Less Water',
          description: 'Mostly milk with a little water — creamy with some lightness.',
        },
        {
          icon: 'sparkles',
          title: 'Equal Milk & Water',
          description: 'Balanced combination — the most common Indian household style.',
        },
        {
          icon: 'sunrise',
          title: 'More Water, Less Milk',
          description: 'Lighter on milk — a thinner, less heavy cup.',
        },
      ],
    },
    {
      title: 'What\'s your budget per pack?',
      subtitle: 'We have options across all price points — all quality Rajhans blends.',
      options: [
        {
          icon: 'coffee',
          title: 'Under ₹300',
          description: 'Everyday value — strong, fresh, honest chai at an accessible price.',
        },
        {
          icon: 'sparkles',
          title: '₹300 - ₹500',
          description: 'A step up in quality — better sourcing, richer taste.',
        },
        {
          icon: 'flame',
          title: 'Above ₹500',
          description: 'Premium selection — finest blends for the serious chai lover.',
        },
      ],
    },
  ];

  selectOption(option: string): void {
    const selected = this.selectedOptions();
    selected[this.currentStep()] = option;
    this.selectedOptions.set({ ...selected });

    // Auto-continue to the next step or final recommendation with a 250ms feedback delay
    setTimeout(() => {
      if (this.currentStep() < this.steps.length - 1) {
        this.goNext();
      } else {
        this.getRecommendation();
      }
    }, 250);
  }

  isSelected(option: string): boolean {
    return this.selectedOptions()[this.currentStep()] === option;
  }

  canGoNext(): boolean {
    return !!this.selectedOptions()[this.currentStep()];
  }

  goNext(): void {
    if (this.currentStep() < this.steps.length - 1) {
      this.currentStep.set(this.currentStep() + 1);
    }
  }

  goBack(): void {
    if (this.currentStep() > 0) {
      this.currentStep.set(this.currentStep() - 1);
    }
  }

  getProgressPercentage(): number {
    return ((this.currentStep() + 1) / this.steps.length) * 100;
  }

  getRecommendation(): void {
    const selections = this.selectedOptions();
    const strength = selections[0];
    const time = selections[1];
    const milk = selections[2];
    const budget = selections[3];

    let matchedProduct: Product = this.catalogProducts[0]; // default: Rajhans Roykan CTC

    if (strength === 'Light & Mild' || milk === 'More Water, Less Milk') {
      if (budget === 'Above ₹500' || budget === '₹300 - ₹500') {
        matchedProduct = this.catalogProducts.find(p => p.slug === 'rajhans-darjeeling-first-flush') || this.catalogProducts[4];
      } else {
        matchedProduct = this.catalogProducts.find(p => p.slug === 'rajhans-nilgiri-special') || this.catalogProducts[5];
      }
    } else if (strength === 'Kadak / Strong') {
      if (budget === 'Above ₹500' || budget === '₹300 - ₹500') {
        matchedProduct = this.catalogProducts.find(p => p.slug === 'rajhans-premium-gold') || this.catalogProducts[1];
      } else {
        matchedProduct = this.catalogProducts.find(p => p.slug === 'rajhans-roykan-ctc') || this.catalogProducts[0];
      }
    } else {
      // Medium Strength
      if (milk === 'All Milk — No Water' || milk === 'More Milk, Less Water') {
        matchedProduct = this.catalogProducts.find(p => p.slug === 'rajhans-masala-chai') || this.catalogProducts[2];
      } else if (budget === 'Above ₹500' || budget === '₹300 - ₹500') {
        matchedProduct = this.catalogProducts.find(p => p.slug === 'rajhans-premium-gold') || this.catalogProducts[1];
      } else {
        matchedProduct = this.catalogProducts.find(p => p.slug === 'rajhans-traditional-blend') || this.catalogProducts[3];
      }
    }

    this.recommendedProduct.set(matchedProduct);

    // Build personalized AI recommendation text
    let strengthPhrase = '';
    if (strength === 'Kadak / Strong') strengthPhrase = 'a strong, kadak cup';
    else if (strength === 'Medium Strength') strengthPhrase = 'a balanced, medium-strength cup';
    else strengthPhrase = 'a light, mild, and delicate cup';

    let timePhrase = '';
    if (time === 'Morning — First Cup') timePhrase = 'for a morning pick-me-up';
    else if (time === 'Afternoon Break') timePhrase = 'for an afternoon pick-me-up';
    else if (time === 'Evening Wind-down') timePhrase = 'to unwind in the evening';
    else timePhrase = 'for a constant companion throughout the day';

    let milkPhrase = '';
    if (milk === 'All Milk — No Water') milkPhrase = 'prepared with a pure, ultra-rich milk-only brew';
    else if (milk === 'More Milk, Less Water') milkPhrase = 'prepared with a creamy milk-forward brew';
    else if (milk === 'Equal Milk & Water') milkPhrase = 'prepared with an equal balance of milk and water';
    else milkPhrase = 'prepared with a lighter, water-forward ratio';

    let budgetPhrase = '';
    if (budget === 'Under ₹300') budgetPhrase = 'a budget under ₹300';
    else if (budget === '₹300 - ₹500') budgetPhrase = 'a budget of ₹300 - ₹500';
    else budgetPhrase = 'a budget of above ₹500';

    let reason = '';
    if (matchedProduct.slug === 'rajhans-roykan-ctc') {
      reason = 'Rajhans Roykan CTC — it is specifically blended to give you the bold colour and strong kadak taste that fits your budget and delivers the freshness and quality that Rajhans is known for.';
    } else if (matchedProduct.slug === 'rajhans-premium-gold') {
      reason = 'Rajhans Premium Gold — its select premium leaves offer the perfect golden color and balanced, rich body that makes every cup feel like a luxury.';
    } else if (matchedProduct.slug === 'rajhans-masala-chai') {
      reason = 'Rajhans Masala Chai — its infusion of hand-ground traditional spices adds warmth, complexity, and that comforting aroma to make your breaks extra special.';
    } else if (matchedProduct.slug === 'rajhans-traditional-blend') {
      reason = 'Rajhans Traditional Blend — its time-tested heritage recipe brings out the honest, nostalgic flavor of daily Indian home-brewed chai.';
    } else if (matchedProduct.slug === 'rajhans-darjeeling-first-flush') {
      reason = 'Rajhans Darjeeling First Flush — its delicate, floral notes and classic spring muscatel character are ideal for a refined, black-tea experience.';
    } else if (matchedProduct.slug === 'rajhans-nilgiri-special') {
      reason = 'Rajhans Nilgiri Special — its crisp, bright highland character is highly aromatic and refreshing, perfect for a lighter, fragrant cup.';
    }

    const fullText = `Based on your answers, you want ${strengthPhrase} ${timePhrase}, ${milkPhrase}, and ${budgetPhrase}. We recommend ${reason}`;
    this.aiRecommendationText.set(fullText);

    this.showResults.set(true);
  }

  addToCart(): void {
    const product = this.recommendedProduct();
    if (product && product.id) {
      this.cartStore.addItem(product.id, 1, undefined, true, product.slug);
    }
  }

  retakeQuiz(): void {
    this.showResults.set(false);
    this.currentStep.set(0);
    this.selectedOptions.set({});
  }
}
