import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { AuthNestModule, ResolutorDeAccesoRemoto } from '@quality360/auth-nest';

import { BandejaController, ChecklistController, VerificacionController } from './api/controladores/checklist.controller.js';
import { AuditorController, InternoController } from './api/controladores/auditoria-global.controller.js';
import { SaludController } from './api/controladores/salud.controller.js';
import { AuditorAplicacion, SeguimientoAplicacion } from './aplicacion/auditoria-global.servicio.js';
import { ChecklistAplicacion } from './aplicacion/checklist.servicio.js';
import { CONFIGURACION, type ConfiguracionCertificaciones } from './configuracion.js';
import { ALMACEN_ARCHIVOS, AlmacenSupabase } from './infraestructura/almacen.js';
import { GeneradorCertificadoPdf } from './infraestructura/certificado-pdf.js';
import { ChecklistRepositorio } from './infraestructura/checklist.repositorio.js';
import { OpcionesResolutorRemotoModule } from './infraestructura/opciones-resolutor-remoto.module.js';
import { OrganizacionCliente } from './infraestructura/organizacion.cliente.js';
import { PrismaService } from './infraestructura/prisma/prisma.service.js';

export interface OpcionesAppModule {
  /** Reemplaza el almacén de archivos (las pruebas usan uno en memoria). */
  almacen?: Provider;
}

@Module({})
export class AppModule {
  static forRoot(configuracion: ConfiguracionCertificaciones, opciones: OpcionesAppModule = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AuthNestModule.forRoot({
          verificador: configuracion.verificador,
          resolutor: { useClass: ResolutorDeAccesoRemoto },
          imports: [OpcionesResolutorRemotoModule.forRoot({ organizacionUrl: configuracion.organizacionUrl })],
          guardiaIdentidadGlobal: true,
          guardiaAccesoGlobal: true,
          filtroErroresGlobal: true,
        }),
      ],
      controllers: [SaludController, ChecklistController, BandejaController, VerificacionController, InternoController, AuditorController],
      providers: [
        { provide: CONFIGURACION, useValue: configuracion },
        PrismaService,
        OrganizacionCliente,
        ChecklistRepositorio,
        GeneradorCertificadoPdf,
        opciones.almacen ?? { provide: ALMACEN_ARCHIVOS, useClass: AlmacenSupabase },
        ChecklistAplicacion,
        SeguimientoAplicacion,
        AuditorAplicacion,
      ],
    };
  }
}
