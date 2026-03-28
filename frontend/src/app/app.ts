import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container';
import { LoadingBarComponent } from './shared/components/loading-bar/loading-bar';
import { PageLoaderComponent } from './shared/components/page-loader/page-loader';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, LoadingBarComponent, PageLoaderComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App {}
