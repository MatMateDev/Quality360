/**
 * Módulo raíz. `ResolutorDeAccesoRemoto` consulta el rol, el estado activo y el ámbito a Organización en cada solicitud
 * (D4, D126); este servicio nunca lee el esquema `organizacion`. Las clases abstractas de `aplicacion/puertos` se
 * enlazan aquí con su implementación de `infraestructura`; la frontera con Jira y archivos entra por
 * `composicion-externa.ts` (o por `ExtensionesApp`, que usan las pruebas).
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { AuthNestModule, ResolutorDeAccesoRemoto } from '@quality360/auth-nest';

import { ArchivosController } from './api/controladores/archivos.controller.js';
import { ConexionController } from './api/controladores/conexion.controller.js';
import { HistorialController } from './api/controladores/historial.controller.js';
import { SaludController } from './api/controladores/salud.controller.js';
import { SincronizacionController } from './api/controladores/sincronizacion.controller.js';
import { ArchivosAplicacion } from './aplicacion/archivos.servicio.js';
import { ConfiguracionAplicacion } from './aplicacion/configuracion.servicio.js';
import { HistorialAplicacion } from './aplicacion/historial.servicio.js';
import {
  CifradorToken,
  ConfiguracionRepositorio,
  EjecucionRepositorio,
  FUENTE_JIRA,
  LectorArchivo,
  MapeadorIssues,
  ProveedorOrganizacion,
  Reloj,
  type FuenteJira,
} from './aplicacion/puertos.js';
import { SincronizacionAplicacion } from './aplicacion/sincronizacion.servicio.js';
import { crearFuenteJira, crearLector, crearMapeador } from './composicion-externa.js';
import { CONFIGURACION, type ConfiguracionIntegraciones } from './configuracion.js';
import { CifradorTokenAesGcm } from './infraestructura/cifrado/cifrador-aes-gcm.js';
import { OpcionesResolutorRemotoModule } from './infraestructura/opciones-resolutor-remoto.module.js';
import { OrganizacionCliente } from './infraestructura/organizacion/organizacion.cliente.js';
import { ConfiguracionPrismaRepositorio } from './infraestructura/prisma/configuracion.prisma.repositorio.js';
import { EjecucionPrismaRepositorio } from './infraestructura/prisma/ejecucion.prisma.repositorio.js';
import { PrismaService } from './infraestructura/prisma/prisma.service.js';

/** Lo que las pruebas (o la integración con q360-integraciones) pueden reemplazar. */
export interface ExtensionesApp {
  fuenteJira?: FuenteJira;
  mapeador?: MapeadorIssues;
  lector?: LectorArchivo;
  reloj?: Reloj;
}

@Module({})
export class AppModule {
  static forRoot(configuracion: ConfiguracionIntegraciones, extensiones: ExtensionesApp = {}): DynamicModule {
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
              tiempoLimiteMs: configuracion.tiempoLimiteOrganizacionMs,
            }),
          ],
          guardiaIdentidadGlobal: true,
          guardiaAccesoGlobal: true,
          filtroErroresGlobal: true,
        }),
      ],
      controllers: [SaludController, ConexionController, SincronizacionController, ArchivosController, HistorialController],
      providers: [
        { provide: CONFIGURACION, useValue: configuracion },
        PrismaService,
        { provide: ConfiguracionRepositorio, useClass: ConfiguracionPrismaRepositorio },
        { provide: EjecucionRepositorio, useClass: EjecucionPrismaRepositorio },
        { provide: ProveedorOrganizacion, useClass: OrganizacionCliente },
        { provide: CifradorToken, useClass: CifradorTokenAesGcm },
        { provide: FUENTE_JIRA, useValue: extensiones.fuenteJira ?? crearFuenteJira(configuracion) },
        { provide: MapeadorIssues, useValue: extensiones.mapeador ?? crearMapeador() },
        { provide: LectorArchivo, useValue: extensiones.lector ?? crearLector() },
        { provide: Reloj, useValue: extensiones.reloj ?? { ahora: () => new Date() } },
        ConfiguracionAplicacion,
        SincronizacionAplicacion,
        ArchivosAplicacion,
        HistorialAplicacion,
      ],
    };
  }
}
