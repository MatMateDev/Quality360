/**
 * Módulo raíz (esqueleto E1/E2). `ResolutorDeAccesoRemoto` consulta el rol,
 * el estado activo y el ámbito a Organización en cada solicitud (D4); este
 * servicio nunca lee el esquema `organizacion`.
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { AuthNestModule, ResolutorDeAccesoRemoto } from '@quality360/auth-nest';

import { SaludController } from './api/controladores/salud.controller.js';
import type { ConfiguracionImpedimentos } from './configuracion.js';
import { PrismaService } from './infraestructura/prisma/prisma.service.js';
import { OpcionesResolutorRemotoModule } from './infraestructura/opciones-resolutor-remoto.module.js';

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
      controllers: [SaludController],
      providers: [PrismaService],
    };
  }
}
