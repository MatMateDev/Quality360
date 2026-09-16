/**
 * Módulo raíz del gateway.
 *
 * `AuthNestModule` registra `IdentidadGuard` como guard global: toda ruta
 * exige sesión salvo las marcadas con `@Publico()`. El gateway **no**
 * autoriza: el rol, el estado activo y el ámbito los valida el servicio dueño
 * (D4), así que `AccesoGuard` queda apagado aquí.
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { AuthNestModule } from '@quality360/auth-nest';

import { HduController } from './api/hdu.controller.js';
import { InicioController } from './api/inicio.controller.js';
import { NoImplementadoController } from './api/no-implementado.controller.js';
import {
  AuditoriaController,
  CatalogosController,
  EquipoController,
  SesionController,
  SupervisionController,
  UsuariosController,
} from './api/proxy.controller.js';
import { SaludController } from './api/salud.controller.js';
import { Compositor } from './aplicacion/compositor.js';
import { Reenviador } from './aplicacion/reenviador.js';
import { CONFIGURACION, type ConfiguracionGateway } from './configuracion.js';

@Module({})
export class AppModule {
  static forRoot(configuracion: ConfiguracionGateway): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AuthNestModule.forRoot({
          verificador: configuracion.verificador,
          guardiaIdentidadGlobal: true,
          guardiaAccesoGlobal: false,
          filtroErroresGlobal: true,
        }),
      ],
      controllers: [
        SaludController,
        SesionController,
        InicioController,
        EquipoController,
        UsuariosController,
        SupervisionController,
        AuditoriaController,
        CatalogosController,
        HduController,
        NoImplementadoController,
      ],
      providers: [{ provide: CONFIGURACION, useValue: configuracion }, Reenviador, Compositor],
    };
  }
}
