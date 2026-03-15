import { Inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
  private readonly auth: Auth | null;
  private resolveReady!: () => void;
  private readonly readyPromise: Promise<void>;

  user = signal<User | null>(null);
  loading = signal(true);

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    if (!isPlatformBrowser(platformId)) {
      this.auth = null;
      this.loading.set(false);
      this.resolveReady();
      return;
    }

    this.auth = getAuth(getFirebaseApp());
    onAuthStateChanged(
      this.auth,
      (user) => {
        this.user.set(user);
        this.loading.set(false);
        this.resolveReady();
      },
      () => {
        this.user.set(null);
        this.loading.set(false);
        this.resolveReady();
      },
    );
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
    if (!this.auth) {
      return;
    }
    await signOut(this.auth);
  }
}