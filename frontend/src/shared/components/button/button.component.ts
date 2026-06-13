import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'default' | 'lg' | 'icon';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'default';
  @Input() disabled: boolean = false;
  @Input() loading: boolean = false;
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() fullWidth: boolean = false;

  @Output() clicked = new EventEmitter<MouseEvent>();

  private variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-orange-700 text-white hover:bg-orange-800 active:bg-orange-900',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400',
    outline: 'border-2 border-orange-700 text-orange-700 hover:bg-orange-50 active:bg-orange-100',
    destructive: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
    ghost: 'hover:bg-gray-100 active:bg-gray-200 text-gray-900',
    link: 'text-orange-700 hover:underline active:text-orange-800',
  };

  private sizeClasses: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-8 py-4 text-base',
    default: 'px-8 py-4 text-base',
    lg: 'px-10 py-5 text-lg',
    icon: 'h-10 w-10 p-0',
  };

  get buttonClasses(): string {
    const baseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-500 shrink-0';
    const variantClass = this.variantClasses[this.variant] || this.variantClasses.primary;
    const sizeClass = this.sizeClasses[this.size] || this.sizeClasses.default;
    const disabledClass = this.disabled || this.loading ? 'opacity-60 cursor-not-allowed' : '';
    const fullWidthClass = this.fullWidth ? 'w-full' : '';

    return `${baseClasses} ${variantClass} ${sizeClass} ${disabledClass} ${fullWidthClass}`.trim();
  }

  onClick(event: MouseEvent): void {
    if (this.disabled || this.loading) {
      event.preventDefault();
      return;
    }
    this.clicked.emit(event);
  }
}
