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
            // Auto-select and populate default address
            const defaultIndex = res.data.findIndex(addr => addr.isDefault);
            if (defaultIndex !== -1) {
              this.selectCurrentAddress(res.data[defaultIndex], defaultIndex);
            }
          }
        },
        error: (err) => {
          console.error('Failed to load addresses:', err);
        },
      });
  }

  selectCurrentAddress(address: SavedAddress, index: number) {
    this.selectedAddressIndex.set(index);
    const checkoutAddress: CheckoutAddress = {
      name: '', // User will fill name in form
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
