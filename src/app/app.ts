import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './header/header';
import { Content } from './content/content';
import { Footer } from './footer/footer';
import { getAnalytics } from 'firebase/analytics';
import { getFirebaseApp } from './firebase';

const app = getFirebaseApp();

// Analytics is browser-only. Skip it on the server (SSR) to avoid runtime errors.
if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
  getAnalytics(app);
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Content, Footer],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('logisticapp');
}
