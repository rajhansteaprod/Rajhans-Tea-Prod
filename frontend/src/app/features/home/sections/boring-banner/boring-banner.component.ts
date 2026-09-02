import { Component, Input, signal, effect, inject } from '@angular/core';
import { PlatformService } from '../../../../core/services/platform.service';

@Component({
  selector: 'app-boring-banner',
  standalone: true,
  templateUrl: './boring-banner.component.html',
  styleUrls: ['./boring-banner.component.scss'],
})
export class BoringBannerComponent {
  @Input() desktopImage = '/static/Carousel Images/Boring Tea.png';
  @Input() mobileImage: string | null = null;

  private readonly platform = inject(PlatformService);

  isMobile = signal(false);

  constructor() {
    if (!this.platform.isBrowser) return;

    effect(() => {
      const checkIsMobile = () => {
        this.isMobile.set(window.innerWidth < 768);
      };

      checkIsMobile();
      window.addEventListener('resize', checkIsMobile);

      return () => window.removeEventListener('resize', checkIsMobile);
    });
  }

  get imageSrc(): string {
    return this.isMobile() && this.mobileImage ? this.mobileImage : this.desktopImage;
  }
}
