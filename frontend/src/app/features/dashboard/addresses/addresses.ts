import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface Address {
  _id: string;
  label: string;
  address: string;
  landmark: string;
  city: string;
  state: string;
  pinCode: string;
  isDefault: boolean;
}

interface AddressForm {
  label: string;
  address: string;
  landmark: string;
  city: string;
  state: string;
  pinCode: string;
}

@Component({
  selector: 'app-addresses',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './addresses.html',
  styleUrls: ['./addresses.scss'],
})
export class AddressesComponent implements OnInit {
  private readonly apiUrl = `${environment.apiUrl}/auth/addresses`;

  addresses = signal<Address[]>([]);
  showForm = signal(false);
  editingId = signal<string | null>(null);
  form: AddressForm = this.emptyForm();
  saving = signal(false);
  labelOptions = ['Home', 'Office', 'Others'];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.http
      .get<{ success: boolean; data: Address[] }>(this.apiUrl)
      .subscribe((res) => {
        if (res.success) this.addresses.set(res.data);
      });
  }

  private emptyForm(): AddressForm {
    return { label: 'Home', address: '', landmark: '', city: '', state: '', pinCode: '' };
  }

  openAdd(): void {
    this.form = this.emptyForm();
    this.editingId.set(null);
    this.showForm.set(true);
  }

  openEdit(addr: Address): void {
    this.form = {
      label: addr.label,
      address: addr.address,
      landmark: addr.landmark,
      city: addr.city,
      state: addr.state,
      pinCode: addr.pinCode,
    };
    this.editingId.set(addr._id);
    this.showForm.set(true);
  }

  cancel(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    this.saving.set(true);
    const id = this.editingId();

    const req = id
      ? this.http.put<{ success: boolean }>(`${this.apiUrl}/${id}`, this.form)
      : this.http.post<{ success: boolean }>(this.apiUrl, this.form);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.editingId.set(null);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  remove(id: string): void {
    this.http.delete<{ success: boolean }>(`${this.apiUrl}/${id}`).subscribe(() => this.load());
  }

  setDefault(id: string): void {
    this.http
      .patch<{ success: boolean }>(`${this.apiUrl}/${id}/default`, {})
      .subscribe(() => this.load());
  }
}
