import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface ContactSubmission {
  _id: string;
  referenceId: string;
  fullName: string;
  mobileNumber: string;
  emailAddress: string;
  address?: string;
  reasonToContact: 'help' | 'bulk' | 'gifting';
  status: 'new' | 'contacted' | 'resolved';
  createdAt: string;
  message?: string;
  companyName?: string;
}

@Component({
  selector: 'app-contact-submissions',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="submissions-container">
      <div class="submissions-header">
        <h1>Contact Form Submissions</h1>
        <div class="filters">
          <select (change)="filterByStatus($event)" class="filter-select">
            <option value="">All Status</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="resolved">Resolved</option>
          </select>
          <select (change)="filterByReason($event)" class="filter-select">
            <option value="">All Reasons</option>
            <option value="help">Help & Support</option>
            <option value="bulk">Buy in Bulk</option>
            <option value="gifting">Corporate Gifting</option>
          </select>
        </div>
      </div>

      @if (loading()) {
        <div class="loading">Loading submissions...</div>
      } @else if (submissions().length === 0) {
        <div class="empty">No submissions found</div>
      } @else {
        <table class="submissions-table">
          <thead>
            <tr>
              <th>Reference ID</th>
              <th>Name</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            @for (submission of submissions(); track submission._id) {
              <tr>
                <td>{{ submission.referenceId }}</td>
                <td>{{ submission.fullName }}</td>
                <td>{{ submission.mobileNumber }}</td>
                <td>{{ submission.emailAddress }}</td>
                <td>
                  <span [class]="'badge badge-' + submission.reasonToContact">
                    {{ getReason(submission.reasonToContact) }}
                  </span>
                </td>
                <td>
                  <span [class]="'badge badge-status-' + submission.status">
                    {{ submission.status }}
                  </span>
                </td>
                <td>{{ formatDate(submission.createdAt) }}</td>
                <td>
                  <button (click)="selectedSubmission.set(submission)" class="btn-view">View</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (selectedSubmission()) {
        <div class="modal-overlay" (click)="selectedSubmission.set(null)">
          <div class="modal-content" (click)="$event.stopPropagation()">
            <button class="modal-close" (click)="selectedSubmission.set(null)">×</button>
            <h2>Submission Details</h2>
            <div class="details-grid">
              <div class="detail-item">
                <label>Reference ID</label>
                <p>{{ selectedSubmission()!.referenceId }}</p>
              </div>
              <div class="detail-item">
                <label>Status</label>
                <p>{{ selectedSubmission()!.status }}</p>
              </div>
              <div class="detail-item">
                <label>Full Name</label>
                <p>{{ selectedSubmission()!.fullName }}</p>
              </div>
              <div class="detail-item">
                <label>Mobile Number</label>
                <p>{{ selectedSubmission()!.mobileNumber }}</p>
              </div>
              <div class="detail-item">
                <label>Email Address</label>
                <p>{{ selectedSubmission()!.emailAddress }}</p>
              </div>
              <div class="detail-item">
                <label>Reason to Contact</label>
                <p>{{ getReason(selectedSubmission()!.reasonToContact) }}</p>
              </div>
              @if (selectedSubmission()!.address) {
                <div class="detail-item full-width">
                  <label>Address</label>
                  <p>{{ selectedSubmission()!.address }}</p>
                </div>
              }
              @if (selectedSubmission()!.message) {
                <div class="detail-item full-width">
                  <label>Message</label>
                  <p>{{ selectedSubmission()!.message }}</p>
                </div>
              }
              @if (selectedSubmission()!.companyName) {
                <div class="detail-item">
                  <label>Company Name</label>
                  <p>{{ selectedSubmission()!.companyName }}</p>
                </div>
              }
              <div class="detail-item">
                <label>Submitted Date</label>
                <p>{{ formatDateTime(selectedSubmission()!.createdAt) }}</p>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .submissions-container {
      padding: 20px;
    }

    .submissions-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .filters {
      display: flex;
      gap: 10px;
    }

    .filter-select {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }

    .submissions-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 4px;
      overflow: hidden;
    }

    thead {
      background: #f5f5f5;
    }

    th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #ddd;
      font-size: 12px;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid #eee;
      font-size: 13px;
    }

    tr:hover {
      background: #fafafa;
    }

    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }

    .badge-help {
      background: #e3f2fd;
      color: #1976d2;
    }

    .badge-bulk {
      background: #f3e5f5;
      color: #7b1fa2;
    }

    .badge-gifting {
      background: #fce4ec;
      color: #c2185b;
    }

    .badge-status-new {
      background: #fff3e0;
      color: #f57c00;
    }

    .badge-status-contacted {
      background: #e8f5e9;
      color: #388e3c;
    }

    .badge-status-resolved {
      background: #f1f8e9;
      color: #558b2f;
    }

    .btn-view {
      padding: 6px 12px;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .btn-view:hover {
      background: #1565c0;
    }

    .loading,
    .empty {
      text-align: center;
      padding: 40px;
      color: #999;
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 8px;
      padding: 30px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    }

    .modal-close {
      position: absolute;
      top: 15px;
      right: 15px;
      background: none;
      border: none;
      font-size: 28px;
      cursor: pointer;
      color: #999;
    }

    .modal-close:hover {
      color: #333;
    }

    .modal-content h2 {
      margin: 0 0 20px 0;
      font-size: 20px;
    }

    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .detail-item {
      display: flex;
      flex-direction: column;
    }

    .detail-item.full-width {
      grid-column: 1 / -1;
    }

    .detail-item label {
      font-weight: 600;
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .detail-item p {
      margin: 0;
      color: #333;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `]
})
export class ContactSubmissionsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  submissions = signal<ContactSubmission[]>([]);
  selectedSubmission = signal<ContactSubmission | null>(null);
  loading = signal(false);
  private allSubmissions: ContactSubmission[] = [];
  private selectedStatus = '';
  private selectedReason = '';

  ngOnInit() {
    this.loadSubmissions();
  }

  private loadSubmissions() {
    this.loading.set(true);
    this.http.get<{ success: boolean; data: ContactSubmission[] }>(
      `${environment.apiUrl}/contact/submissions`
    ).subscribe({
      next: (response) => {
        this.allSubmissions = response.data;
        this.submissions.set(response.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  filterByStatus(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedStatus = select.value;
    this.applyFilters();
  }

  filterByReason(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedReason = select.value;
    this.applyFilters();
  }

  private applyFilters() {
    let filtered = this.allSubmissions;

    if (this.selectedStatus) {
      filtered = filtered.filter(s => s.status === this.selectedStatus);
    }

    if (this.selectedReason) {
      filtered = filtered.filter(s => s.reasonToContact === this.selectedReason);
    }

    this.submissions.set(filtered);
  }

  getReason(reason: string): string {
    const reasons: Record<string, string> = {
      'help': 'Help & Support',
      'bulk': 'Buy in Bulk',
      'gifting': 'Corporate Gifting'
    };
    return reasons[reason] || reason;
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  formatDateTime(date: string): string {
    return new Date(date).toLocaleString();
  }
}
