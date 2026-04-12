import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface USPItem {
  icon: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-usp-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './usp-grid.html',
  styleUrls: ['./usp-grid.scss'],
})
export class USPGridComponent {
  uspItems: USPItem[] = [
    {
      icon: '🍃',
      title: 'Premium Sourcing',
      description: 'Hand-picked from the finest estates worldwide',
    },
    {
      icon: '✨',
      title: 'Pure Leaves Only',
      description: 'No dust, no powder, only whole tea leaves',
    },
    {
      icon: '🌱',
      title: 'Ethically Grown',
      description: 'Supporting sustainable farming practices',
    },
    {
      icon: '🏅',
      title: 'Award Winning',
      description: 'Recognized for quality and taste excellence',
    },
  ];

  imageSrc = '/uploads/usp-tea.jpg';
  imageAlt = 'Premium whole tea leaves in a ceramic bowl';
}
