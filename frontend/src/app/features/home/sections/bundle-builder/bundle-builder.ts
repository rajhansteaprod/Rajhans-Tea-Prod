import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CmsService } from '../../../../core/services/cms.service';

@Component({
  selector: 'app-bundle-builder',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './bundle-builder.html',
  styleUrls: ['./bundle-builder.scss'],
})
export class BundleBuilderComponent implements OnInit {
  private readonly cms = inject(CmsService);

  readonly backgroundImage = signal<string>('');

  ngOnInit(): void {
    this.cms.getActiveHeroSlides().subscribe({
      next: (res) => {
        if (res.data.length > 0) {
          this.backgroundImage.set(res.data[0].desktopImage);
        }
      },
    });
  }
}
