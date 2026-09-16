/**
 * Verificación del access token de Supabase Auth.
 *
 * - Camino principal: JWKS de `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`
 *   (firma asimétrica: ES256, RS256 o EdDSA). La llave se elige por `kid`.
 * - Respaldo local: HS256 con `SUPABASE_JWT_SECRET`, y solo si esa variable
 *   existe. Es el formato de las llaves legacy de Supabase local.
 *
 * El algoritmo se decide con el encabezado del token, pero solo para escoger
 * entre dos verificadores cuyos algoritmos están fijados por configuración:
 * lo que diga el cliente jamás amplía lo permitido. Un token HS256 nunca se
 * valida contra una llave pública (confusión de algoritmo) ni al revés, y
 * `alg: none` se rechaza siempre.
 *
 * Se verifican firma, `exp`, `iss` y `aud`. El rol NO se lee del token (D4).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
  type JWTVerifyOptions,
} from 'jose';

import { errorInterno, noAutenticado, sesionExpirada, servicioNoDisponible, ExcepcionQ360 } from './errores.js';
import type { Identidad } from './tipos.js';

/** Algoritmos asimétricos que emite Supabase. */
export const ALGORITMOS_ASIMETRICOS: readonly string[] = ['ES256', 'RS256', 'EdDSA'];

/** Único algoritmo simétrico admitido, y solo con secreto configurado. */
export const ALGORITMO_SIMETRICO = 'HS256';

export const OPCIONES_VERIFICADOR = Symbol.for('quality360.OpcionesVerificador');

export interface OpcionesVerificador {
  /** `iss` esperado, normalmente `<SUPABASE_URL>/auth/v1`. */
  emisor: string;
  /** `aud` esperado; en Supabase es `authenticated`. */
  audiencia: string;
  /** URL del JWKS. Sin ella solo funciona el respaldo HS256. */
  jwksUrl: string | null;
  /** Secreto HS256 de respaldo local. `null` desactiva ese camino. */
  secretoHs256: string | null;
  algoritmosAsimetricos: readonly string[];
  toleranciaRelojSegundos: number;
  tiempoLimiteJwksMs: number;
}

export type OpcionesVerificadorParciales = Partial<OpcionesVerificador> & {
  /** Base para deducir `emisor` y `jwksUrl`. */
  supabaseUrl?: string | null;
};

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function sinBarraFinal(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Completa las opciones a partir de `supabaseUrl` y valida lo mínimo. */
export function resolverOpcionesVerificador(parciales: OpcionesVerificadorParciales = {}): OpcionesVerificador {
  const supabaseUrl = parciales.supabaseUrl ? sinBarraFinal(parciales.supabaseUrl) : null;
  const emisor = parciales.emisor ?? (supabaseUrl ? `${supabaseUrl}/auth/v1` : '');
  const jwksUrl =
    parciales.jwksUrl ?? (supabaseUrl ? `${supabaseUrl}/auth/v1/.well-known/jwks.json` : null);
  const secretoHs256 = parciales.secretoHs256 && parciales.secretoHs256.length > 0 ? parciales.secretoHs256 : null;

  if (emisor.length === 0) {
    throw errorInterno('Configura SUPABASE_URL o SUPABASE_JWT_ISSUER para verificar la sesión.');
  }
  if (jwksUrl === null && secretoHs256 === null) {
    throw errorInterno('Sin JWKS ni SUPABASE_JWT_SECRET no hay forma de verificar la sesión.');
  }
  if (jwksUrl !== null) {
    try {
      const url = new URL(jwksUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocolo');
    } catch {
      throw errorInterno(`La URL del JWKS no es válida: ${jwksUrl}`);
    }
  }

  return {
    emisor,
    audiencia: parciales.audiencia ?? 'authenticated',
    jwksUrl,
    secretoHs256,
    algoritmosAsimetricos: parciales.algoritmosAsimetricos ?? ALGORITMOS_ASIMETRICOS,
    toleranciaRelojSegundos: parciales.toleranciaRelojSegundos ?? 5,
    tiempoLimiteJwksMs: parciales.tiempoLimiteJwksMs ?? 5000,
  };
}

/** Opciones desde el entorno, sin valores por defecto para los secretos. */
export function opcionesDesdeEntorno(entorno: NodeJS.ProcessEnv = process.env): OpcionesVerificador {
  const tolerancia = Number(entorno.SUPABASE_JWT_TOLERANCIA_S ?? '');
  return resolverOpcionesVerificador({
    supabaseUrl: entorno.SUPABASE_URL ?? null,
    emisor: entorno.SUPABASE_JWT_ISSUER,
    audiencia: entorno.SUPABASE_JWT_AUDIENCE,
    jwksUrl: entorno.SUPABASE_JWKS_URL,
    secretoHs256: entorno.SUPABASE_JWT_SECRET ?? null,
    toleranciaRelojSegundos: Number.isFinite(tolerancia) && tolerancia >= 0 ? tolerancia : undefined,
  });
}

interface ErrorConCodigo {
  code?: unknown;
}

function codigoDeError(error: unknown): string | null {
  const codigo = (error as ErrorConCodigo | null)?.code;
  return typeof codigo === 'string' ? codigo : null;
}

@Injectable()
export class VerificadorTokenSupabase {
  private readonly registro = new Logger(VerificadorTokenSupabase.name);
  private readonly claveHs256: Uint8Array | null;
  private jwks: JWTVerifyGetKey | null = null;

  constructor(@Inject(OPCIONES_VERIFICADOR) private readonly opciones: OpcionesVerificador) {
    this.claveHs256 = opciones.secretoHs256 ? new TextEncoder().encode(opciones.secretoHs256) : null;
  }

  /**
   * Verifica el token y devuelve la identidad.
   *
   * @throws ExcepcionQ360 401 `SESION_EXPIRADA` si venció,
   *   401 `NO_AUTENTICADO` si es inválido,
   *   503 `SERVICIO_NO_DISPONIBLE` si el JWKS no se puede consultar.
   */
  async verificar(token: string): Promise<Identidad> {
    const algoritmo = this.leerAlgoritmo(token);
    const opcionesVerificacion: JWTVerifyOptions = {
      issuer: this.opciones.emisor,
      audience: this.opciones.audiencia,
      clockTolerance: this.opciones.toleranciaRelojSegundos,
    };

    let carga: JWTPayload;
    try {
      if (algoritmo === ALGORITMO_SIMETRICO) {
        if (this.claveHs256 === null) {
          throw noAutenticado('token HS256 y SUPABASE_JWT_SECRET no está configurado');
        }
        const resultado = await jwtVerify(token, this.claveHs256, {
          ...opcionesVerificacion,
          algorithms: [ALGORITMO_SIMETRICO],
        });
        carga = resultado.payload;
      } else {
        const jwks = this.obtenerJwks();
        const resultado = await jwtVerify(token, jwks, {
          ...opcionesVerificacion,
          algorithms: [...this.opciones.algoritmosAsimetricos],
        });
        carga = resultado.payload;
      }
    } catch (error) {
      throw this.traducirError(error);
    }

    return this.construirIdentidad(carga, token);
  }

  private leerAlgoritmo(token: string): string {
    if (typeof token !== 'string' || token.length === 0) throw noAutenticado('token vacío');
    let algoritmo: unknown;
    try {
      algoritmo = decodeProtectedHeader(token).alg;
    } catch {
      throw noAutenticado('encabezado del token ilegible');
    }
    if (typeof algoritmo !== 'string' || algoritmo.length === 0) {
      throw noAutenticado('encabezado sin alg');
    }
    if (algoritmo !== ALGORITMO_SIMETRICO && !this.opciones.algoritmosAsimetricos.includes(algoritmo)) {
      throw noAutenticado(`alg no permitido: ${algoritmo}`);
    }
    return algoritmo;
  }

  private obtenerJwks(): JWTVerifyGetKey {
    if (this.jwks !== null) return this.jwks;
    if (this.opciones.jwksUrl === null) {
      throw noAutenticado('token asimétrico y no hay JWKS configurado');
    }
    this.jwks = createRemoteJWKSet(new URL(this.opciones.jwksUrl), {
      timeoutDuration: this.opciones.tiempoLimiteJwksMs,
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });
    return this.jwks;
  }

  private traducirError(error: unknown): ExcepcionQ360 {
    if (error instanceof ExcepcionQ360) return error;
    const codigo = codigoDeError(error);

    if (codigo === 'ERR_JWT_EXPIRED') {
      return sesionExpirada('el token venció');
    }
    // Fallo al consultar el JWKS: no se puede decidir, así que se falla cerrado
    // con 503 en vez de dar por inválida una sesión que quizá es legítima.
    if (
      codigo !== null &&
      codigo.startsWith('ERR_JWKS_') &&
      codigo !== 'ERR_JWKS_NO_MATCHING_KEY' &&
      codigo !== 'ERR_JWKS_MULTIPLE_MATCHING_KEYS'
    ) {
      this.registro.error(`No se pudo consultar el JWKS (${codigo}).`);
      return servicioNoDisponible('JWKS no disponible');
    }
    if (codigo === null) {
      const detalle = error instanceof Error ? error.message : 'desconocido';
      this.registro.error(`Fallo no clasificado al verificar la sesión: ${detalle}`);
      return servicioNoDisponible('fallo al verificar la sesión');
    }
    return noAutenticado(`token inválido (${codigo})`);
  }

  private construirIdentidad(carga: JWTPayload, token: string): Identidad {
    const sub = carga.sub;
    if (typeof sub !== 'string' || !UUID.test(sub)) {
      throw noAutenticado('sub ausente o no es un UUID');
    }
    if (typeof carga.exp !== 'number') {
      throw noAutenticado('token sin exp');
    }
    // Token de llave de API (anon / service_role), no de sesión de usuario.
    if (typeof carga.role === 'string' && carga.role !== 'authenticated') {
      throw noAutenticado(`role del token no es de sesión: ${carga.role}`);
    }
    if (carga.is_anonymous === true) {
      throw noAutenticado('sesión anónima de Supabase');
    }

    const correo = typeof carga.email === 'string' && carga.email.length > 0 ? carga.email.toLowerCase() : null;
    const sesionId = typeof carga.session_id === 'string' ? carga.session_id : null;

    // Nunca se leen `user_metadata` ni `app_metadata`: el rol vive en
    // Organización y lo entrega el ResolutorDeAcceso (D4).
    return {
      id: sub,
      correo,
      token,
      expiraEn: carga.exp,
      emisor: typeof carga.iss === 'string' ? carga.iss : this.opciones.emisor,
      sesionId,
    };
  }
}
