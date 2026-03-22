import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface Warehouse {
  _id: string;
  name: string;
  address: { street: string; city: string; state: string; pincode: string; phone: string; email: string };
  isDefault: boolean;
  isActive: boolean;
  shiprocketPickupLocationId: string | null;
}

@Component({
  selector: 'app-warehouse-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './warehouse-list.html',
  styleUrls: ['./warehouse-list.scss'],
})
export class WarehouseListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly warehouses = signal<Warehouse[]>([]);
  readonly showModal = signal(false);
  editId: string | null = null;
  form = { name: '', street: '', city: '', state: '', pincode: '', phone: '', email: '', isDefault: false };

  ngOnInit(): void { this.load(); }

  load(): void {
    this.http.get<{ data: Warehouse[] }>(`${this.api}/admin/warehouses`).subscribe({
      next: (res) => this.warehouses.set(res.data),
    });
  }

  openCreate(): void {
    this.editId = null;
    this.form = { name: '', street: '', city: '', state: '', pincode: '', phone: '', email: '', isDefault: false };
    this.showModal.set(true);
  }

  openEdit(w: Warehouse): void {
    this.editId = w._id;
    this.form = { name: w.name, ...w.address, isDefault: w.isDefault };
    this.showModal.set(true);
  }

  save(): void {
    const body = {
      name: this.form.name,
      address: { street: this.form.street, city: this.form.city, state: this.form.state, pincode: this.form.pincode, phone: this.form.phone, email: this.form.email },
      isDefault: this.form.isDefault,
    };
    const req = this.editId
      ? this.http.put(`${this.api}/admin/warehouses/${this.editId}`, body)
      : this.http.post(`${this.api}/admin/warehouses`, body);
    req.subscribe({ next: () => { this.showModal.set(false); this.load(); } });
  }

  deleteWarehouse(id: string): void {
    if (!confirm('Delete this warehouse?')) return;
    this.http.delete(`${this.api}/admin/warehouses/${id}`).subscribe({ next: () => this.load() });
  }
}
