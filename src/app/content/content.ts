import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-content',
  imports: [RouterOutlet],
  templateUrl: './content.html',
  styleUrl: './content.css',
})
export class Content {
  constructor(private readonly router: Router) {}

  isFullBleedRoute(): boolean {
    return this.router.url === '/landing' || this.router.url === '/login' || this.router.url === '/';
  }

}
