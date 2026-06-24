import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-settings.html',
  styleUrls: ['./admin-settings.scss'],
})
export class AdminSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly settings = signal<any>(null);
  readonly loyaltySettings = signal<any>(null);
  readonly referralSettings = signal<any>(null);
  readonly allProducts = signal<any[]>([]);
  readonly saving = signal(false);
  readonly saved = signal(false);

  ngOnInit(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/settings`).subscribe({
      next: (res) => {
        const data = res.data;
        if (!data.homepageProductSections || data.homepageProductSections.length === 0) {
          data.homepageProductSections = [
            { title: 'Highest Demand Products', productIds: [] },
            { title: 'Best Sellers', productIds: [] }
          ];
        } else if (data.homepageProductSections.length === 1) {
          data.homepageProductSections.push({ title: 'Best Sellers', productIds: [] });
        }
        data.homepageProductSections.forEach((sec: any) => {
          sec.productIds = (sec.productIds || []).map((p: any) => typeof p === 'object' ? p._id : p);
        });
        this.settings.set(data);
      },
    });
    this.http.get<{ data: any[] }>(`${this.api}/admin/products?limit=200`).subscribe({
      next: (res) => this.allProducts.set(res.data),
    });
    this.http.get<{ data: any }>(`${this.api}/admin/promotions/loyalty/settings`).subscribe({
      next: (res) => this.loyaltySettings.set(res.data),
    });
    this.http.get<{ data: any }>(`${this.api}/admin/promotions/referral/settings`).subscribe({
      next: (res) => this.referralSettings.set(res.data),
    });
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);

    // Sync feature toggles with promotion settings
    const ls = this.loyaltySettings();
    const rs = this.referralSettings();
    const s = this.settings();

    if (ls) ls.isActive = s.features.loyaltyEnabled;
    if (rs) rs.isActive = s.features.referralEnabled;

    // Save all three in parallel
    let pending = 3;
    const done = () => { pending--; if (pending === 0) { this.saving.set(false); this.saved.set(true); setTimeout(() => this.saved.set(false), 3000); } };
    const fail = () => { this.saving.set(false); };

    this.http.put(`${this.api}/admin/settings`, s).subscribe({ next: done, error: fail });
    this.http.put(`${this.api}/admin/promotions/loyalty/settings`, ls).subscribe({ next: done, error: fail });
    this.http.put(`${this.api}/admin/promotions/referral/settings`, rs).subscribe({ next: done, error: fail });
  }

  getProductById(id: string): any {
    return this.allProducts().find((p) => p._id === id);
  }

  addProductToSection(section: any, prodId: string): void {
    if (!prodId) return;
    if (!section.productIds) section.productIds = [];
    if (section.productIds.includes(prodId)) {
      alert('Product is already in this section.');
      return;
    }
    if (section.productIds.length >= 6) {
      alert('Maximum of 6 products allowed per section.');
      return;
    }
    section.productIds.push(prodId);
  }

  removeProductFromSection(section: any, index: number): void {
    section.productIds.splice(index, 1);
  }

  moveProduct(section: any, index: number, dir: number): void {
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= section.productIds.length) return;
    const temp = section.productIds[index];
    section.productIds[index] = section.productIds[targetIdx];
    section.productIds[targetIdx] = temp;
  }
}
