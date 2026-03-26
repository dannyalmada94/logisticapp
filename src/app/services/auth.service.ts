import { Inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import {
  Auth,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { getFirebaseApp } from '../firebase';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private static readonly INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;

  private readonly auth: Auth | null;
  private readonly isBrowser: boolean;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
  private resolveReady!: () => void;
  private readonly readyPromise: Promise<void>;

  user = signal<User | null>(null);
  loading = signal(true);

  constructor(
    @Inject(PLATFORM_ID) platformId: Object,
    private readonly router: Router,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    if (!this.isBrowser) {
      this.auth = null;
      this.loading.set(false);
      this.resolveReady();
      return;
    }

    this.registerActivityListeners();

    this.auth = getAuth(getFirebaseApp());
    onAuthStateChanged(
      this.auth,
      (user) => {
        this.user.set(user);
        this.loading.set(false);
        if (user) {
          this.resetInactivityTimer();
        } else {
          this.clearInactivityTimer();
        }
        this.resolveReady();
      },
      () => {
        this.user.set(null);
        this.loading.set(false);
        this.clearInactivityTimer();
        this.resolveReady();
      },
    );
  }

  private registerActivityListeners(): void {
    if (!this.isBrowser) {
      return;
    }

    for (const eventName of this.activityEvents) {
      window.addEventListener(eventName, this.onUserActivity, { passive: true });
    }
  }

  private onUserActivity = (): void => {
    if (!this.isAuthenticated()) {
      return;
    }
    this.resetInactivityTimer();
  };

  private clearInactivityTimer(): void {
    if (!this.inactivityTimer) {
      return;
    }
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = null;
  }

  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      void this.handleInactivityLogout();
    }, AuthService.INACTIVITY_TIMEOUT_MS);
  }

  private async handleInactivityLogout(): Promise<void> {
    if (!this.isAuthenticated()) {
      return;
    }

    await this.logout();
    await this.router.navigate(['/login']);
  }

  waitForAuthReady(): Promise<void> {
    return this.readyPromise;
  }

  isAuthenticated(): boolean {
    return !!this.user();
  }

  async login(email: string, password: string): Promise<void> {
    if (!this.auth) {
      throw new Error('Auth solo disponible en el navegador.');
    }
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async register(email: string, password: string): Promise<void> {
    if (!this.auth) {
      throw new Error('Auth solo disponible en el navegador.');
    }
    await createUserWithEmailAndPassword(this.auth, email, password);
  }

  async logout(): Promise<void> {
    this.clearInactivityTimer();

    if (!this.auth) {
      return;
    }
    await signOut(this.auth);
  }
}