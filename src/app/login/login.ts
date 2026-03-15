import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  authForm!: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    this.authForm = this.createForm();
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/home']);
    }
  }

  private createForm() {
    return this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  async submit() {
    if (this.authForm.invalid) {
      this.authForm.markAllAsTouched();
      return;
    }

    const email = this.authForm.value.email || '';
    const password = this.authForm.value.password || '';

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.login(email, password);
      await this.router.navigate(['/home']);
    } catch (err: any) {
      this.errorMessage.set(this.mapFirebaseError(err?.code));
    } finally {
      this.loading.set(false);
    }
  }

  private mapFirebaseError(code?: string): string {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Credenciales invalidas.';
      case 'auth/email-already-in-use':
        return 'Este email ya esta registrado.';
      case 'auth/invalid-email':
        return 'Email invalido.';
      case 'auth/weak-password':
        return 'La contrasena debe tener al menos 6 caracteres.';
      default:
        return 'No se pudo completar la autenticacion.';
    }
  }
}