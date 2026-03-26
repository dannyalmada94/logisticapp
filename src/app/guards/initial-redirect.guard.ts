import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const initialRedirectGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await Promise.race([
    authService.waitForAuthReady(),
    new Promise<void>((resolve) => setTimeout(resolve, 1500)),
  ]);

  return authService.isAuthenticated()
    ? router.createUrlTree(['/home'])
    : router.createUrlTree(['/landing']);
};