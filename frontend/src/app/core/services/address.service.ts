import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface Address {
  _id?: string;
  label: string;
  address: string;
  landmark?: string;
  city: string;
  state: string;
  pinCode: string;
  isDefault?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AddressService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  getAddresses() {
    return this.http.get<ApiResponse<Address[]>>(`${this.apiUrl}/addresses`);
  }

  addAddress(address: Address) {
    return this.http.post<ApiResponse<Address[]>>(`${this.apiUrl}/addresses`, address);
  }

  updateAddress(addressId: string, address: Address) {
    return this.http.put<ApiResponse<Address[]>>(
      `${this.apiUrl}/addresses/${addressId}`,
      address
    );
  }

  deleteAddress(addressId: string) {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/addresses/${addressId}`);
  }

  setDefaultAddress(addressId: string) {
    return this.http.patch<ApiResponse<Address[]>>(
      `${this.apiUrl}/addresses/${addressId}/default`,
      {}
    );
  }
}
