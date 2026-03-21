import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" role="alert" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [attr.data-type]="toast.type" (click)="toastService.dismiss(toast.id)">
          <span class="toast-icon">
            @switch (toast.type) {
              @case ('success') { ✓ }
              @case ('error') { ✕ }
              @case ('warning') { ⚠ }
              @case ('info') { ℹ }
            }
          </span>
          <span class="toast-message">{{ toast.message }}</span>
          <button class="toast-close" (click)="toastService.dismiss(toast.id)" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 400px;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 12px;
      box-shadow: var(--shadow-lg);
      cursor: pointer;
      animation: slideIn 0.3s ease;
      font-size: 14px;
      font-weight: 500;

      &[data-type="success"] { background: #57886C; color: white; }
      &[data-type="error"] { background: #C0392B; color: white; }
      &[data-type="warning"] { background: #CC5803; color: white; }
      &[data-type="info"] { background: #3A2D32; color: #FCFFF7; }
    }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .toast-icon { font-size: 16px; flex-shrink: 0; }
    .toast-message { flex: 1; }
    .toast-close {
      background: none; border: none; color: inherit; cursor: pointer;
      opacity: 0.7; font-size: 14px; padding: 0; line-height: 1;
      &:hover { opacity: 1; }
    }
  `],
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);
}
