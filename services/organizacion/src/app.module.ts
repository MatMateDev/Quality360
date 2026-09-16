/**
 * Módulo raíz. `AuthNestModule` registra `IdentidadGuard` y `AccesoGuard`
 * como guards globales (D4: cada servicio valida rol, activo y ámbito, no
 * confía en el gateway). Las rutas con `credencialServicio` se marcan
 * `@Publico()` y usan `SesionOServicioGuard` en su lugar (ver
 * api/guardias).
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { AuthNestModule } from '@quality360/auth-nest';

import { AplicacionModule } from './aplicacion/aplicacion.module.js';
import { AccesoInternoController } from './api/controladores/acceso-interno.controller.js';
import { AuditoriaController } from './api/controladores/auditoria.controller.js';
import { CargaSemillaController } from './api/controladores/carga-semilla.controller.js';
import { CatalogosController } from './api/controladores/catalogos.controller.js';
import { EquipoController } from './api/controladores/equipo.controller.js';
import { HduController } from './api/controladores/hdu.controller.js';
import { ResumenesController } from './api/controladores/resumenes.controller.js';
import { SaludController } from './api/controladores/salud.controller.js';
import { SesionController } from './api/controladores/sesion.controller.js';
import { SupervisionController } from './api/controladores/supervision.controller.js';
import { UsuariosController } from './api/controladores/usuarios.controller.js';
import { CargaSemillaGuard } from './api/guardias/carga-semilla.guard.js';
import { SesionOServicioGuard } from './api/guardias/sesion-o-servicio.guard.js';
import { ConfiguracionModule } from './configuracion.module.js';
import type { ConfiguracionOrganizacion } from './configuracion.js';
import { InfraestructuraModule } from './infraestructura/infraestructura.module.js';
import { ResolutorAccesoOrganizacion } from './infraestructura/seguridad/resolutor-acceso.servicio.js';

@Module({})
export class AppModule {
  static forRoot(configuracion: ConfiguracionOrganizacion): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfiguracionModule.forRoot(configuracion),
        InfraestructuraModule,
        AplicacionModule,
        AuthNestModule.forRoot({
          verificador: configuracion.verificador,
          resolutor: { useExisting: ResolutorAccesoOrganizacion },
          imports: [InfraestructuraModule],
          guardiaIdentidadGlobal: true,
          guardiaAccesoGlobal: true,
          filtroErroresGlobal: true,
        }),
      ],
      controllers: [
        SaludController,
        SesionController,
        AccesoInternoController,
        ResumenesController,
        EquipoController,
        UsuariosController,
        SupervisionController,
        AuditoriaController,
        CatalogosController,
        HduController,
        CargaSemillaController,
      ],
      providers: [SesionOServicioGuard, CargaSemillaGuard],
    };
  }
}
