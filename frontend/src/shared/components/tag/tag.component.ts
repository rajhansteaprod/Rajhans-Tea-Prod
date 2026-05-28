import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type TagVariant = 'primary' | 'secondary' | 'outline';
export type TagSize = 'sm' | 'md';

@Component({
  selector: 'app-tag',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tag.component.html',
  styleUrls: ['./tag.component.scss'],
})
export class TagComponent {
  @Input() variant: TagVariant = 'primary';
  @Input() size: TagSize = 'md';
  @Input() removable: boolean = false;

  get tagClasses(): string {
    const classes = [
      'tag',
      `tag--${this.variant}`,
      `tag--${this.size}`,
    ];

    return classes.join(' ');
  }

  onRemove(event: MouseEvent): void {
    event.stopPropagation();
  }
}
