/**
 * Expone `CONFIGURACION` en todo el árbol de módulos (incluido el subárbol
 * que arma `AuthNestModule.forRoot`, que necesita `ProveedorIdentidadSupabase`
 * a través de `InfraestructuraModule`). `forRoot` recibe la configuración ya
 * cargada, para que las pruebas puedan pasar la suya sin leer el entorno.
 */
import { Global, Module, type DynamicModule } from '@nestjs/common';

import { CONFIGURACION, type ConfiguracionOrganizacion } from './configuracion.js';

@Global()
@Module({})
export class ConfiguracionModule {
  static forRoot(configuracion: ConfiguracionOrganizacion): DynamicModule {
    return {
      module: ConfiguracionModule,
      providers: [{ provide: CONFIGURACION, useValue: configuracion }],
      exports: [CONFIGURACION],
    };
  }
}
