import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container';
import { LoadingBarComponent } from './shared/components/loading-bar/loading-bar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, LoadingBarComponent],
  template: `
    <a class="skip-to-content" href="#main-content">Skip to content</a>
    <app-loading-bar />
    <div id="main-content">
      <router-outlet />
    </div>
    <app-toast-container />
  `,
})
export class App {}
