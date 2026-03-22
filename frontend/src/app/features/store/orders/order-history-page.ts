import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OrderStore } from '../../../core/services/order.store';

@Component({
  selector: 'app-order-history-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order-history-page.html',
  styleUrls: ['./order-history-page.scss'],
})
export class OrderHistoryPageComponent implements OnInit {
  readonly store = inject(OrderStore);

  ngOnInit(): void {
    this.store.loadOrders();
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
