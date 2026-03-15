import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  DataSnapshot,
  Database,
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from 'firebase/database';
import { getFirebaseApp } from '../firebase';

@Injectable({
  providedIn: 'root',
})
export class RealtimeDatabaseService {
  private readonly db: Database | null;

  constructor(@Inject(PLATFORM_ID) private readonly platformId: Object) {
    // Firebase Realtime Database requires browser globals (XMLHttpRequest).
    // Avoid initializing it on the server during SSR.
    this.db = isPlatformBrowser(this.platformId)
      ? getDatabase(getFirebaseApp())
      : null;
  }

  private ensureDb(): Database {
    if (!this.db) {
      throw new Error(
        'Realtime Database is only available in the browser (client-side).',
      );
    }
    return this.db;
  }

  set(path: string, value: any): Promise<void> {
    return set(ref(this.ensureDb(), path), value);
  }

  update(path: string, value: any): Promise<void> {
    return update(ref(this.ensureDb(), path), value);
  }

  remove(path: string): Promise<void> {
    return remove(ref(this.ensureDb(), path));
  }

  push(path: string, value: any) {
    return push(ref(this.ensureDb(), path), value);
  }

  onValue(
    path: string,
    callback: (snapshot: DataSnapshot) => void,
    onError?: (error: unknown) => void,
  ): () => void {
    // Firebase onValue supports an optional error callback, which helps
    // diagnose permission/connection issues.
    return onValue(ref(this.ensureDb(), path), callback, onError);
  }
}
