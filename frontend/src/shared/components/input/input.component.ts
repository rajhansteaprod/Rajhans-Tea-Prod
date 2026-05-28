import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url';
export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'default' | 'subtle';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './input.component.html',
  styleUrls: ['./input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true,
    },
  ],
})
export class InputComponent implements ControlValueAccessor {
  @Input() type: InputType = 'text';
  @Input() size: InputSize = 'md';
  @Input() variant: InputVariant = 'default';
  @Input() placeholder: string = '';
  @Input() label: string = '';
  @Input() disabled: boolean = false;
  @Input() error: string = '';
  @Input() helperText: string = '';
  @Input() required: boolean = false;

  @Output() changed = new EventEmitter<string>();
  @Output() blurred = new EventEmitter<void>();

  value: string = '';
  isFocused: boolean = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: any): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  get inputClasses(): string {
    const classes = [
      'input',
      `input--${this.variant}`,
      `input--${this.size}`,
    ];

    if (this.disabled) {
      classes.push('input--disabled');
    }

    if (this.error) {
      classes.push('input--error');
    }

    if (this.isFocused) {
      classes.push('input--focused');
    }

    return classes.join(' ');
  }

  get wrapperClasses(): string {
    const classes = ['input-wrapper'];

    if (this.error) {
      classes.push('input-wrapper--error');
    }

    return classes.join(' ');
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value = value;
    this.onChange(value);
    this.changed.emit(value);
  }

  onFocus(): void {
    this.isFocused = true;
  }

  onBlur(): void {
    this.isFocused = false;
    this.onTouched();
    this.blurred.emit();
  }
}
