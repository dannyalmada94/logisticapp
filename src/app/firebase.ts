import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { environment } from '../environments/environment';

export function getFirebaseApp(): FirebaseApp {
  // Avoid initializing multiple Firebase apps in dev/hot-reload scenarios.
  return getApps().length ? getApp() : initializeApp(environment.firebase);
}
