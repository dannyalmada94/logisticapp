import { Component } from '@angular/core';
import { RouterLink } from "@angular/router";
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-header',
  imports: [RouterLink, NgIf],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  constructor(public authService: AuthService, private readonly router: Router) {}

  closeOffcanvas() {
    const el = document.getElementById('offcanvasWithBothOptions');
    if (el) {
      const bootstrap = (window as any)['bootstrap'];
      bootstrap?.Offcanvas?.getInstance(el)?.hide();
    }
  }

  async logout() {
    await this.authService.logout();
    await this.router.navigate(['/landing']);
  }
}
