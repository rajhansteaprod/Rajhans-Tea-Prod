import { Component, inject, signal, output, OnInit, input } from '@angular/core';
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
  readonly selectedId = input<string | null>(null);

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
            
            // Check if there is already a selected address in checkout state, or default to the default address
            const currentCheckoutAddress = this.checkoutService.getAddress();
            const matchingAddress = res.data.find(addr => 
              addr.pinCode === currentCheckoutAddress.pinCode && 
              addr.address === currentCheckoutAddress.address
            );

            if (matchingAddress) {
              this.selectCurrentAddress(matchingAddress);
            } else {
              const defaultAddress = res.data.find(addr => addr.isDefault);
              if (defaultAddress) {
                this.selectCurrentAddress(defaultAddress);
              }
            }
          }
        },
        error: (err) => {
          console.error('Failed to load addresses:', err);
        },
      });
  }

  selectCurrentAddress(address: SavedAddress) {
    const checkoutAddress: CheckoutAddress = {
      _id: address._id,
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
