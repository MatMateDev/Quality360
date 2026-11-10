/**
 * Módulo raíz. `ResolutorDeAccesoRemoto` consulta el rol, el estado activo y el ámbito a Organización en cada solicitud
 * (D4); este servicio nunca lee el esquema `organizacion`. El rol sale de Organización, nunca del token. Las clases
 * abstractas de `aplicacion/puertos` y `dominio/repositorios` se enlazan aquí con su implementación de `infraestructura`.
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { AuthNestModule, ResolutorDeAccesoRemoto } from '@quality360/auth-nest';

import { SaludController } from './api/controladores/salud.controller.js';
import { ExportacionController } from './api/controladores/exportacion.controller.js';
import { SnapshotsController } from './api/controladores/snapshots.controller.js';
import { UmbralController } from './api/controladores/umbral.controller.js';
import { VistasController } from './api/controladores/vistas.controller.js';
import { CargaSemillaGuard, CronGuard } from './api/guardias/guardias-servicio.js';
import { ExportacionAplicacion } from './aplicacion/exportacion.servicio.js';
import { SnapshotAplicacion } from './aplicacion/snapshot.servicio.js';
import { TendenciaAplicacion } from './aplicacion/tendencia.servicio.js';
import { FuenteCertificaciones, FuenteImpedimentos, FuenteOrganizacion, Reloj } from './aplicacion/puertos.js';
import { UmbralAplicacion } from './aplicacion/umbral.servicio.js';
import { VistasAplicacion } from './aplicacion/vistas.servicio.js';
import { CONFIGURACION, type ConfiguracionIndicadores } from './configuracion.js';
import { EjecucionRepositorio, SnapshotRepositorio, UmbralRepositorio } from './dominio/repositorios.js';
import { CertificacionesCliente, ImpedimentosCliente } from './infraestructura/fuentes/certificaciones-impedimentos.clientes.js';
import { OrganizacionCliente } from './infraestructura/fuentes/organizacion.cliente.js';
import { OpcionesResolutorRemotoModule } from './infraestructura/opciones-resolutor-remoto.module.js';
import { PrismaService } from './infraestructura/prisma/prisma.service.js';
import { EjecucionPrismaRepositorio, SnapshotPrismaRepositorio, UmbralPrismaRepositorio } from './infraestructura/prisma/repositorios.prisma.js';

/** Lo que las pruebas pueden reemplazar. */
export interface ExtensionesApp {
  reloj?: Reloj;
}

@Module({})
export class AppModule {
  static forRoot(configuracion: ConfiguracionIndicadores, extensiones: ExtensionesApp = {}): DynamicModule {
    const reloj: Reloj = extensiones.reloj ?? { ahora: () => configuracion.fechaReferencia ?? new Date() };
    return {
      module: AppModule,
      imports: [
        AuthNestModule.forRoot({
          verificador: configuracion.verificador,
          resolutor: { useClass: ResolutorDeAccesoRemoto },
          imports: [
            OpcionesResolutorRemotoModule.forRoot({
              // Con `organizacionUrl` nulo (producción sin variable) el middleware ya respondió 503.
              organizacionUrl: configuracion.organizacionUrl ?? 'http://organizacion.invalid',
              tiempoLimiteMs: configuracion.fuenteTimeoutMs,
            }),
          ],
          guardiaIdentidadGlobal: true,
          guardiaAccesoGlobal: true,
          filtroErroresGlobal: true,
        }),
      ],
      controllers: [SaludController, VistasController, UmbralController, SnapshotsController, ExportacionController],
      providers: [
        { provide: CONFIGURACION, useValue: configuracion },
        PrismaService,
        { provide: Reloj, useValue: reloj },
        { provide: FuenteOrganizacion, useClass: OrganizacionCliente },
        { provide: FuenteCertificaciones, useClass: CertificacionesCliente },
        { provide: FuenteImpedimentos, useClass: ImpedimentosCliente },
        { provide: SnapshotRepositorio, useClass: SnapshotPrismaRepositorio },
        { provide: EjecucionRepositorio, useClass: EjecucionPrismaRepositorio },
        { provide: UmbralRepositorio, useClass: UmbralPrismaRepositorio },
        VistasAplicacion,
        UmbralAplicacion,
        SnapshotAplicacion,
        TendenciaAplicacion,
        ExportacionAplicacion,
        CronGuard,
        CargaSemillaGuard,
      ],
    };
  }
}
