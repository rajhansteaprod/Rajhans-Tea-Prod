import { Component, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-comparison-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comparison-section.html',
  styleUrls: ['./comparison-section.scss'],
})
export class ComparisonSectionComponent {
  @ViewChild('slider') sliderElement!: ElementRef;

  sliderPosition = 50; // 0-100 percentage
  isDragging = false;

  leftImage = '/sde.png';
  rightImage = '/image.png';

  heading = 'See the Difference';
  description =
    'Experience the transformation. Drag the slider to compare our premium quality with standard options. Notice the rich color, texture, and authenticity of our whole leaf tea.';

  @HostListener('mouseup')
  @HostListener('touchend')
  stopDragging() {
    this.isDragging = false;
  }

  @HostListener('mousemove', ['$event'])
  @HostListener('touchmove', ['$event'])
  onMove(event: MouseEvent | TouchEvent) {
    if (!this.isDragging) return;

    const slider = this.sliderElement?.nativeElement;
    if (!slider) return;

    const rect = slider.getBoundingClientRect();
    const x = event instanceof TouchEvent ? event.touches[0].clientX : event.clientX;

    const percent = ((x - rect.left) / rect.width) * 100;
    this.sliderPosition = Math.max(0, Math.min(100, percent));
  }

  startDragging() {
    this.isDragging = true;
  }

  onSliderClick(event: MouseEvent) {
    const slider = this.sliderElement?.nativeElement;
    if (!slider) return;

    const rect = slider.getBoundingClientRect();
    const x = event.clientX;
    const percent = ((x - rect.left) / rect.width) * 100;
    this.sliderPosition = Math.max(0, Math.min(100, percent));
  }
}
