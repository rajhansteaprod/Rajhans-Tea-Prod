import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type CardVariant = 'elevated' | 'subtle' | 'dark';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.scss'],
})
export class CardComponent {
  @Input() variant: CardVariant = 'elevated';
  @Input() hoverable: boolean = false;
  @Input() clickable: boolean = false;
  @Input() padding: 'sm' | 'md' | 'lg' = 'md';

  get cardClasses(): string {
    const classes = [
      'card',
      `card--${this.variant}`,
      `card--p-${this.padding}`,
    ];

    if (this.hoverable) {
      classes.push('card--hoverable');
    }

    if (this.clickable) {
      classes.push('card--clickable');
    }

    return classes.join(' ');
  }
}
