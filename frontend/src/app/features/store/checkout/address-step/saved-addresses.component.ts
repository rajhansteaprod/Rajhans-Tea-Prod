import { Component, inject, signal, output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { CheckoutService, CheckoutAddress } from '../../../../core/services/checkout.service';
import { environment } from '../../../../../environments/environment';

interface SavedAddress {
  _id: string;
  label: string;
  address: string;
  landmark: string;
  city: string;
  state: string;
  pinCode: string;
  isDefault: boolean;
}

@Component({
  selector: 'app-saved-addresses',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './saved-addresses.component.html',
  styleUrls: ['./saved-addresses.component.scss'],
})
export class SavedAddressesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly checkoutService = inject(CheckoutService);
  private readonly apiUrl = `${environment.apiUrl}/auth/addresses`;

  readonly savedAddresses = signal<SavedAddress[]>([]);
  readonly selectedAddressIndex = signal<number | null>(null);

  readonly selectAddress = output<CheckoutAddress>();

  ngOnInit() {
    this.loadAddresses();
  }

  private loadAddresses() {
    this.http
      .get<{ success: boolean; data: SavedAddress[] }>(this.apiUrl)
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.savedAddresses.set(res.data);
          }
        },
        error: (err) => {
          console.error('Failed to load addresses:', err);
        },
      });
  }

  selectCurrentAddress(address: SavedAddress) {
    const checkoutAddress: CheckoutAddress = {
      name: address.label,
      phone: '', // Phone not in saved address, user will fill in form
      pinCode: address.pinCode,
      address: address.address,
      city: address.city,
      state: address.state,
      landmark: address.landmark,
    };
    this.selectAddress.emit(checkoutAddress);
  }
}
