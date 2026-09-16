/**
 * Provee `OPCIONES_RESOLUTOR_REMOTO` (packages/auth-nest) para que
 * `ResolutorDeAccesoRemoto` resuelva rol/ámbito consultando a Organización
 * (`GET /v1/interno/acceso`). Global: `AuthNestModule.forRoot` lo importa
 * para instanciar el resolutor con esta dependencia disponible.
 */
import { Global, Module, type DynamicModule } from '@nestjs/common';
import { OPCIONES_RESOLUTOR_REMOTO, type OpcionesResolutorRemoto } from '@quality360/auth-nest';

@Global()
@Module({})
export class OpcionesResolutorRemotoModule {
  static forRoot(opciones: OpcionesResolutorRemoto): DynamicModule {
    return {
      module: OpcionesResolutorRemotoModule,
      providers: [{ provide: OPCIONES_RESOLUTOR_REMOTO, useValue: opciones }],
      exports: [OPCIONES_RESOLUTOR_REMOTO],
    };
  }
}
