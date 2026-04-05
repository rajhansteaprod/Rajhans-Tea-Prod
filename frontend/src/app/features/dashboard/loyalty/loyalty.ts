import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface LoyaltyData {
  points: number;
  totalEarned: number;
  totalRedeemed: number;
  pointsPerHundred: number;
  transactions: LoyaltyTransaction[];
}

interface LoyaltyTransaction {
  _id: string;
  type: 'earn' | 'redeem';
  points: number;
  description: string;
  createdAt: string;
}

@Component({
  selector: 'app-loyalty',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loyalty.html',
  styleUrls: ['./loyalty.scss'],
})
export class LoyaltyComponent implements OnInit {
  data = signal<LoyaltyData | null>(null);

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http
      .get<{ success: boolean; data: LoyaltyData }>(
        `${environment.apiUrl}/promotions/loyalty`,
      )
      .subscribe((res) => {
        if (res.success) this.data.set(res.data);
      });
  }
}
