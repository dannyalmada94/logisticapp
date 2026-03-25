import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  submitTrabajo(event: Event): void {
    event.preventDefault();

    const form = event.target as HTMLFormElement;
    const data = new FormData(form);

    const nombreApellido = (data.get('Nombre y Apellido') as string) || '';
    const nombreTransporte = (data.get('Nombre del transporte') as string) || '';
    const rubro = (data.get('Rubro') as string) || '';
    const telefono = (data.get('Numero de telefono') as string) || '';
    const mail = (data.get('Mail') as string) || '';

    const subject = 'Solicitud de trabajo EHP';
    const body = [
      `Nombre y Apellido: ${nombreApellido}`,
      `Nombre del transporte: ${nombreTransporte}`,
      `Rubro: ${rubro}`,
      `Numero de telefono: ${telefono}`,
      `Mail: ${mail}`,
    ].join('\n');

    const mailtoUrl = `mailto:dannyalmada.94@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  }

}
