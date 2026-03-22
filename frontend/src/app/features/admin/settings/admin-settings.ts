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
  readonly saving = signal(false);
  readonly saved = signal(false);

  ngOnInit(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/settings`).subscribe({
      next: (res) => this.settings.set(res.data),
    });
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.http.put(`${this.api}/admin/settings`, this.settings()).subscribe({
      next: () => { this.saving.set(false); this.saved.set(true); setTimeout(() => this.saved.set(false), 3000); },
      error: () => this.saving.set(false),
    });
  }
}
