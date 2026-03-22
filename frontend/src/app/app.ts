import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container';
import { LoadingBarComponent } from './shared/components/loading-bar/loading-bar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, LoadingBarComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App {}
