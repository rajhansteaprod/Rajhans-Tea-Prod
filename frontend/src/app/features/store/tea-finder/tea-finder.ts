import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

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
export class TeaFinderComponent {
  readonly currentStep = signal<number>(0);
  readonly selectedOptions = signal<{ [key: number]: string }>({});
  readonly showResults = signal<boolean>(false);
  readonly recommendedProduct = signal<Product>({
    id: '1',
    name: 'Rajhans Premium Gold',
    description: 'A premium selection of fine CTC leaves blended to perfection.',
    price: 299,
    originalPrice: 349,
    image: 'https://images.unsplash.com/photo-1619581073186-5b4ae1b0caad?w=600&h=600&fit=crop',
    slug: 'rajhans-premium-gold',
  });

  readonly steps: Step[] = [
    {
      title: 'When do you typically enjoy your tea?',
      subtitle: 'Occasion dictates the strength & leaf selection.',
      options: [
        {
          icon: 'sunrise',
          title: 'Morning Kickstart',
          description: 'Need a strong, rich cup to wake up my senses.',
        },
        {
          icon: 'sunset',
          title: 'Afternoon/Evening Relax',
          description: 'Something lighter, fragrant, and soothing.',
        },
        {
          icon: 'sparkles',
          title: 'Anytime Hydration',
          description: 'A versatile, balanced daily blend.',
        },
      ],
    },
    {
      title: 'How do you prefer to brew your cup?',
      subtitle: 'The brewing method defines the flavor experience.',
      options: [
        {
          icon: 'coffee',
          title: 'Milk & Sugar',
          description: 'Rich and creamy with a touch of sweetness.',
        },
        {
          icon: 'sparkles',
          title: 'Plain Black',
          description: 'Pure and unadulterated, letting the tea shine.',
        },
        {
          icon: 'flame',
          title: 'Infused with Spices',
          description: 'Masala blended for warmth and complexity.',
        },
      ],
    },
    {
      title: 'What flavor profile speaks to you?',
      subtitle: 'The secondary notes that define your perfect cup.',
      options: [
        {
          icon: 'flame',
          title: 'Malty & Robust',
          description: 'Deep, earthy, full-bodied Assamese character.',
        },
        {
          icon: 'sparkles',
          title: 'Floral & Delicate',
          description: 'Himalayan Darjeeling with muscatel elegance.',
        },
        {
          icon: 'sunrise',
          title: 'Crisp & Fruity',
          description: 'Nilgiri bright and refreshing high-altitude notes.',
        },
      ],
    },
  ];

  selectOption(option: string): void {
    const selected = this.selectedOptions();
    selected[this.currentStep()] = option;
    this.selectedOptions.set({ ...selected });
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
    this.showResults.set(true);
  }

  retakeQuiz(): void {
    this.showResults.set(false);
    this.currentStep.set(0);
    this.selectedOptions.set({});
  }
}
