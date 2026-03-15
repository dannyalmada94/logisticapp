import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Transportistas } from './transportistas/transportistas';
import { Alta } from './transportistas/alta/alta';
import { Modificar } from './transportistas/modificar/modificar';
import { Clientes } from './clientes/clientes';
import { Pedidos } from './pedidos/pedidos';
import { Viajes } from './viajes/viajes';
import { Facturacion } from './facturacion/facturacion';
import { Cobrados } from './cobrados/cobrados';
import { Login } from './login/login';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
    {path:'login', component: Login},
    {path:'home', component: Home, canActivate: [authGuard]},
    {path:'transportistas', component: Transportistas, canActivate: [authGuard],
        children: [ {
            path:'alta', component: Alta
        },
        {
            path:'modificar', component: Modificar
        }
    ]
    },
    {path:'clientes', component: Clientes, canActivate: [authGuard]},
    {path:'pedidos', component: Pedidos, canActivate: [authGuard]},
    {path:'viajes', component: Viajes, canActivate: [authGuard]},
    {path:'facturacion', component: Facturacion, canActivate: [authGuard]},
    {path:'cobrados', component: Cobrados, canActivate: [authGuard]},
    {path: '', redirectTo: 'login', pathMatch: 'full' },
    {path: '**', redirectTo: 'login' }
];
