import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-track-order',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './track-order.html',
  styleUrls: ['./track-order.scss'],
})
export class TrackOrderComponent {
  trackingNumber = signal('');
  isSearching = signal(false);
  orderFound = signal<any>(null);
  errorMessage = signal('');

  searchOrder() {
    if (!this.trackingNumber().trim()) {
      this.errorMessage.set('Please enter a tracking number');
      return;
    }

    this.isSearching.set(true);
    this.errorMessage.set('');
    this.orderFound.set(null);

    // TODO: Replace with actual backend API call
    setTimeout(() => {
      // Dummy response - remove when integrating with backend
      this.orderFound.set({
        trackingNumber: this.trackingNumber(),
        status: 'In Transit',
        estimatedDelivery: 'June 25, 2026',
        lastUpdate: 'June 20, 2026 - Package dispatched from warehouse',
      });
      this.isSearching.set(false);
    }, 500);
  }

  reset() {
    this.trackingNumber.set('');
    this.orderFound.set(null);
    this.errorMessage.set('');
  }
}
