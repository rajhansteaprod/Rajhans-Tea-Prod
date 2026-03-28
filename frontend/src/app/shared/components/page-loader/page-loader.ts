import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-page-loader',
  standalone: true,
  templateUrl: './page-loader.html',
  styleUrls: ['./page-loader.scss'],
})
export class PageLoaderComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private sub!: Subscription;

  readonly visible = signal(false);
  readonly leaving = signal(false);

  ngOnInit(): void {
    this.sub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.leaving.set(false);
        this.visible.set(true);
      }
      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        // Start exit animation, then hide
        this.leaving.set(true);
        setTimeout(() => {
          this.visible.set(false);
          this.leaving.set(false);
        }, 500);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
