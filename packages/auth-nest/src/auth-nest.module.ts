/**
 * Módulo compartido: verificador de token, guards, filtro de errores y, si el
 * servicio lo entrega, su `ResolutorDeAcceso`.
 *
 * Uso mínimo en un servicio:
 *
 * ```ts
 * AuthNestModule.forRoot({
 *   verificador: opcionesDesdeEntorno(),
 *   resolutor: { useClass: ResolutorDeAccesoPrisma },
 *   guardiaAccesoGlobal: true,
 * })
 * ```
 */
import {
  Global,
  Module,
  type DynamicModule,
  type ExistingProvider,
  type FactoryProvider,
  type InjectionToken,
  type ModuleMetadata,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { AccesoGuard } from './acceso.guard.js';
import { FiltroErroresQ360 } from './filtro-errores.js';
import { IdentidadGuard } from './identidad.guard.js';
import { RESOLUTOR_DE_ACCESO, type ResolutorDeAcceso } from './tipos.js';
import {
  OPCIONES_VERIFICADOR,
  VerificadorTokenSupabase,
  resolverOpcionesVerificador,
  type OpcionesVerificador,
  type OpcionesVerificadorParciales,
} from './verificador-token.js';

/** Formas admitidas para registrar el `ResolutorDeAcceso` del servicio. */
export type ProveedorResolutor =
  | { useClass: Type<ResolutorDeAcceso> }
  | { useExisting: Type<ResolutorDeAcceso> | InjectionToken }
  | { useValue: ResolutorDeAcceso }
  | {
      useFactory: (...argumentos: never[]) => ResolutorDeAcceso | Promise<ResolutorDeAcceso>;
      inject?: FactoryProvider['inject'];
    };

export interface OpcionesAuthNest {
  /** Opciones del verificador; por defecto se deducen del entorno. */
  verificador?: OpcionesVerificadorParciales;
  /** Resolutor del servicio. Sin él, `AccesoGuard` lo busca por token en el contenedor. */
  resolutor?: ProveedorResolutor;
  /** Módulos que necesita el resolutor. */
  imports?: ModuleMetadata['imports'];
  /** `IdentidadGuard` como guard global. Por defecto sí: se falla cerrado. */
  guardiaIdentidadGlobal?: boolean;
  /** `AccesoGuard` como guard global. Por defecto no: el gateway solo autentica. */
  guardiaAccesoGlobal?: boolean;
  /** Filtro de errores global con el formato común. Por defecto sí. */
  filtroErroresGlobal?: boolean;
}

export interface OpcionesAuthNestAsync extends Omit<OpcionesAuthNest, 'verificador'> {
  inject?: FactoryProvider['inject'];
  useFactory: (...argumentos: never[]) => OpcionesVerificadorParciales | Promise<OpcionesVerificadorParciales>;
}

function proveedorResolutor(resolutor: ProveedorResolutor): Provider {
  if ('useClass' in resolutor) return { provide: RESOLUTOR_DE_ACCESO, useClass: resolutor.useClass };
  if ('useExisting' in resolutor) {
    return { provide: RESOLUTOR_DE_ACCESO, useExisting: resolutor.useExisting } as ExistingProvider;
  }
  if ('useValue' in resolutor) return { provide: RESOLUTOR_DE_ACCESO, useValue: resolutor.useValue };
  return {
    provide: RESOLUTOR_DE_ACCESO,
    useFactory: resolutor.useFactory,
    inject: resolutor.inject ?? [],
  } as FactoryProvider;
}

function proveedoresComunes(opciones: OpcionesAuthNest): Provider[] {
  const proveedores: Provider[] = [VerificadorTokenSupabase, IdentidadGuard, AccesoGuard, FiltroErroresQ360];
  if (opciones.resolutor !== undefined) proveedores.push(proveedorResolutor(opciones.resolutor));
  if (opciones.guardiaIdentidadGlobal ?? true) {
    proveedores.push({ provide: APP_GUARD, useExisting: IdentidadGuard });
  }
  if (opciones.guardiaAccesoGlobal ?? false) {
    proveedores.push({ provide: APP_GUARD, useExisting: AccesoGuard });
  }
  if (opciones.filtroErroresGlobal ?? true) {
    proveedores.push({ provide: APP_FILTER, useExisting: FiltroErroresQ360 });
  }
  return proveedores;
}

const EXPORTA = [VerificadorTokenSupabase, IdentidadGuard, AccesoGuard, FiltroErroresQ360, OPCIONES_VERIFICADOR];

@Global()
@Module({})
export class AuthNestModule {
  static forRoot(opciones: OpcionesAuthNest = {}): DynamicModule {
    const verificador: OpcionesVerificador = resolverOpcionesVerificador(opciones.verificador ?? {});
    return {
      module: AuthNestModule,
      imports: opciones.imports ?? [],
      providers: [{ provide: OPCIONES_VERIFICADOR, useValue: verificador }, ...proveedoresComunes(opciones)],
      exports: EXPORTA,
    };
  }

  static forRootAsync(opciones: OpcionesAuthNestAsync): DynamicModule {
    const fabrica: Provider = {
      provide: OPCIONES_VERIFICADOR,
      useFactory: async (...argumentos: never[]) =>
        resolverOpcionesVerificador(await opciones.useFactory(...argumentos)),
      inject: opciones.inject ?? [],
    };
    return {
      module: AuthNestModule,
      imports: opciones.imports ?? [],
      providers: [fabrica, ...proveedoresComunes(opciones)],
      exports: EXPORTA,
    };
  }
}
