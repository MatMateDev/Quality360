/**
 * Módulo raíz. `ResolutorDeAccesoRemoto` consulta el rol, el estado activo y el ámbito a
 * Organización en cada solicitud (D4); este servicio nunca lee el esquema `organizacion`.
 * Las clases abstractas de `dominio` y `aplicacion/puertos` se enlazan aquí con su
 * implementación de `infraestructura`.
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { AuthNestModule, ResolutorDeAccesoRemoto } from '@quality360/auth-nest';

import { CargaSemillaController } from './api/controladores/carga-semilla.controller.js';
import { GestionController } from './api/controladores/gestion.controller.js';
import { ImpedimentosController } from './api/controladores/impedimentos.controller.js';
import { InternoController } from './api/controladores/interno.controller.js';
import { RiesgoController } from './api/controladores/riesgo.controller.js';
import { SaludController } from './api/controladores/salud.controller.js';
import { CargaSemillaGuard } from './api/guardias/carga-semilla.guard.js';
import { Autorizador } from './aplicacion/autorizador.js';
import { CargaSemillaAplicacion } from './aplicacion/carga-semilla.servicio.js';
import { EvaluadorRiesgo } from './aplicacion/evaluador-riesgo.js';
import { GestionAplicacion } from './aplicacion/gestion.servicio.js';
import { ImpedimentosAplicacion } from './aplicacion/impedimentos.servicio.js';
import { InternoAplicacion } from './aplicacion/interno.servicio.js';
import { ListadosAplicacion } from './aplicacion/listados.servicio.js';
import { ProveedorAcceso, ProveedorSeguimiento } from './aplicacion/puertos.js';
import { RiesgoAplicacion } from './aplicacion/riesgo.servicio.js';
import { CONFIGURACION, type ConfiguracionImpedimentos } from './configuracion.js';
import { CargaRepositorio, GestionRepositorio, ImpedimentoRepositorio, RiesgoRepositorio } from './dominio/repositorios.js';
import { CertificacionesCliente } from './infraestructura/certificaciones/certificaciones.cliente.js';
import { OpcionesResolutorRemotoModule } from './infraestructura/opciones-resolutor-remoto.module.js';
import { OrganizacionCliente } from './infraestructura/organizacion/organizacion.cliente.js';
import { CargaPrismaRepositorio } from './infraestructura/prisma/carga.prisma.repositorio.js';
import { GestionPrismaRepositorio } from './infraestructura/prisma/gestion.prisma.repositorio.js';
import { ImpedimentoPrismaRepositorio } from './infraestructura/prisma/impedimento.prisma.repositorio.js';
import { PrismaService } from './infraestructura/prisma/prisma.service.js';
import { RiesgoPrismaRepositorio } from './infraestructura/prisma/riesgo.prisma.repositorio.js';

@Module({})
export class AppModule {
  static forRoot(configuracion: ConfiguracionImpedimentos): DynamicModule {
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
      controllers: [SaludController, ImpedimentosController, RiesgoController, GestionController, InternoController, CargaSemillaController],
      providers: [
        { provide: CONFIGURACION, useValue: configuracion },
        PrismaService,
        CargaSemillaGuard,
        { provide: ProveedorAcceso, useClass: OrganizacionCliente },
        { provide: ProveedorSeguimiento, useClass: CertificacionesCliente },
        { provide: ImpedimentoRepositorio, useClass: ImpedimentoPrismaRepositorio },
        { provide: RiesgoRepositorio, useClass: RiesgoPrismaRepositorio },
        { provide: GestionRepositorio, useClass: GestionPrismaRepositorio },
        { provide: CargaRepositorio, useClass: CargaPrismaRepositorio },
        Autorizador,
        EvaluadorRiesgo,
        ImpedimentosAplicacion,
        ListadosAplicacion,
        RiesgoAplicacion,
        GestionAplicacion,
        InternoAplicacion,
        CargaSemillaAplicacion,
      ],
    };
  }
}
