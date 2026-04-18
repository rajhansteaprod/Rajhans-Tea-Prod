import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CheckoutService, CheckoutAddress } from '../../../../core/services/checkout.service';

@Component({
  selector: 'app-saved-addresses',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './saved-addresses.component.html',
  styleUrls: ['./saved-addresses.component.scss'],
})
export class SavedAddressesComponent {
  private readonly checkoutService = inject(CheckoutService);

  readonly savedAddresses = signal<CheckoutAddress[]>([]);
  readonly expandedIndex = signal<number | null>(null);
  readonly selectedAddressIndex = signal<number | null>(null);
  readonly showForm = signal(false);

  readonly selectAddress = output<CheckoutAddress>();
  readonly addNewAddress = output<void>();

  ngOnInit() {
    this.loadAddresses();
  }

  loadAddresses() {
    const address = this.checkoutService.getAddress();
    if (address.name) {
      this.savedAddresses.set([address]);
    }
  }

  toggleExpand(index: number) {
    this.expandedIndex.set(this.expandedIndex() === index ? null : index);
    this.selectedAddressIndex.set(index);
  }

  selectCurrentAddress(address: CheckoutAddress) {
    this.selectAddress.emit(address);
  }

  markAsDefault(address: CheckoutAddress) {
    this.checkoutService.saveAddress(address);
    alert('Address marked as default');
  }

  openAddNewAddressForm() {
    this.showForm.set(true);
    this.expandedIndex.set(null);
  }

  closeAddNewAddressForm() {
    this.showForm.set(false);
  }

  onFormSubmit() {
    this.closeAddNewAddressForm();
    this.loadAddresses();
  }
}
