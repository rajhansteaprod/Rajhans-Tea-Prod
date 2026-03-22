import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-section-header',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './section-header.html',
  styleUrls: ['./section-header.scss'],
})
export class SectionHeaderComponent {
  @Input({ required: true }) headline = '';
  @Input() eyebrow = '';
  @Input() subtitle = '';
  @Input() ctaText = '';
  @Input() ctaLink = '';
  @Input() align: 'left' | 'center' | 'right' = 'left';
}
