import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-gifting-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gifting-section.html',
  styleUrls: ['./gifting-section.scss'],
})
export class GiftingSectionComponent {
  isHovered = false;

  constructor(private router: Router) {}

  onExplore() {
    this.router.navigate(['/products']);
  }
}
