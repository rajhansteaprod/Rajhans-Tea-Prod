import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { PaymentStore } from '../../../core/services/payment.store';
import { OrderStore, OrderView } from '../../../core/services/order.store';

@Component({
  selector: 'app-order-confirmation-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order-confirmation-page.html',
  styleUrls: ['./order-confirmation-page.scss'],
})
export class OrderConfirmationPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly paymentStore = inject(PaymentStore);
  private readonly orderStore = inject(OrderStore);

  readonly paymentId = signal<string | null>(null);
  readonly order = signal<OrderView | null>(null);
  readonly orderLoading = signal(true);
  readonly orderNotYetCreated = signal(false);

  ngOnInit(): void {
    // Read paymentId from query param first, fall back to in-memory signal.
    // The query-param path covers: (a) page refresh, (b) sharing the URL.
    // The signal path covers: (a) normal navigation within the SPA.
    this.route.queryParamMap.subscribe((params) => {
      const id = params.get('paymentId') ?? this.paymentStore.lastPaymentId();
      this.paymentId.set(id);

      if (id) {
        // BullMQ order creation is async — give it 2.5 seconds then poll once.
        setTimeout(() => this.pollForOrder(), 2500);
      } else {
        // No paymentId available — skip polling, just show success UI.
        this.orderLoading.set(false);
      }
    });
  }

  private pollForOrder(): void {
    // Load first page of orders and pick the most recent one.
    // The order list is sorted by createdAt desc on the backend, so index 0
    // is the most recent. We do NOT need a new endpoint.
    this.orderStore.loadOrders(1);

    // Wait a tick for the signal to update, then read it.
    // Using a short timeout because loadOrders() is synchronous-dispatch but
    // the HTTP response is async. We subscribe to the signal indirectly via
    // a one-time check after the store finishes loading.
    const checkInterval = setInterval(() => {
      if (!this.orderStore.loading()) {
        clearInterval(checkInterval);
        const orders = this.orderStore.orders();
        if (orders.length > 0) {
          this.order.set(orders[0]);
        } else {
          // Order not ready yet — BullMQ may be slower.
          this.orderNotYetCreated.set(true);
        }
        this.orderLoading.set(false);
      }
    }, 200);

    // Safety: stop polling after 8 seconds regardless.
    setTimeout(() => {
      clearInterval(checkInterval);
      if (this.orderLoading()) {
        this.orderNotYetCreated.set(true);
        this.orderLoading.set(false);
      }
    }, 8000);
  }
}
