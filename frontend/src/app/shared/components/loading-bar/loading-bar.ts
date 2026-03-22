import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../../core/services/loading.service';

@Component({
  selector: 'app-loading-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-bar.html',
  styleUrls: ['./loading-bar.scss'],
})
export class LoadingBarComponent {
  readonly loadingService = inject(LoadingService);
}