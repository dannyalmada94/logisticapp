import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Transportistas } from './transportistas/transportistas';
import { Clientes } from './clientes/clientes';
import { Pedidos } from './pedidos/pedidos';
import { Viajes } from './viajes/viajes';
import { Facturacion } from './facturacion/facturacion';
import { Cobrados } from './cobrados/cobrados';
import { Metricas } from './metricas/metricas';
import { Login } from './login/login';
import { Landing } from './landing/landing';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';

export const routes: Routes = [
    {path:'landing', component: Landing, canActivate: [guestGuard]},
    {path:'login', component: Login, canActivate: [guestGuard]},
    {path:'home', component: Home, canActivate: [authGuard]},
    {path:'transportistas', component: Transportistas, canActivate: [authGuard]},
    {path:'clientes', component: Clientes, canActivate: [authGuard]},
    {path:'pedidos', component: Pedidos, canActivate: [authGuard]},
    {path:'viajes', component: Viajes, canActivate: [authGuard]},
    {path:'facturacion', component: Facturacion, canActivate: [authGuard]},
    {path:'cobrados', component: Cobrados, canActivate: [authGuard]},
    {path:'metricas', component: Metricas, canActivate: [authGuard]},
    {path: '', redirectTo: 'landing', pathMatch: 'full' },
    {path: '**', redirectTo: 'landing' }
];
