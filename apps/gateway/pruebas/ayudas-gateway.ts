/**
 * Utilidades de prueba del gateway: servicios falsos, aplicación en memoria y
 * tokens firmados localmente. No requieren Supabase ni Docker.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolverOpcionesVerificador } from '@quality360/auth-nest';
import { SignJWT } from 'jose';

import type { ConfiguracionGateway, FuentesComposicion, LimiteTasa } from '../src/configuracion.js';
import { crearApp } from '../src/crear-app.js';

export const EMISOR = 'http://127.0.0.1:54321/auth/v1';
export const AUDIENCIA = 'authenticated';
export const SECRETO = 'secreto-local-de-pruebas-0123456789-abcdef';
export const SUB = '5b0c2f0e-8f1e-4c47-9a57-3a0f5d1e2b11';
export const HDU_ID = '9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10';

export interface SolicitudRegistrada {
  metodo: string;
  url: string;
  cabeceras: Record<string, string | string[] | undefined>;
  cuerpo: string;
}

export interface RespuestaFalsa {
  estado: number;
  cuerpo?: unknown;
  /** Cuerpo crudo, para simular respuestas que no son JSON. */
  texto?: string;
  tipoContenido?: string;
  retrasoMs?: number;
  cabeceras?: Record<string, string>;
}

export interface ServidorFalso {
  url: string;
  solicitudes: SolicitudRegistrada[];
  /** Define la respuesta de `"<METODO> <ruta>"`. */
  responder(clave: string, respuesta: RespuestaFalsa): void;
  cerrar(): Promise<void>;
}

async function leerCuerpo(peticion: IncomingMessage): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const trozo of peticion) trozos.push(trozo as Buffer);
  return Buffer.concat(trozos).toString('utf8');
}

/** Servicio interno falso (Organización o Certificaciones). */
export async function iniciarServidorFalso(): Promise<ServidorFalso> {
  const respuestas = new Map<string, RespuestaFalsa>();
  const solicitudes: SolicitudRegistrada[] = [];

  const servidor: Server = createServer((peticion: IncomingMessage, respuesta: ServerResponse) => {
    void (async () => {
      const url = peticion.url ?? '/';
      const ruta = url.split('?')[0] ?? '/';
      const cuerpo = await leerCuerpo(peticion);
      solicitudes.push({ metodo: peticion.method ?? 'GET', url, cabeceras: peticion.headers, cuerpo });

      const definida = respuestas.get(`${peticion.method ?? 'GET'} ${ruta}`);
      const salida: RespuestaFalsa = definida ?? {
        estado: 404,
        cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'El recurso solicitado no existe.', traceId: 'falso', detalles: [] },
      };

      if (salida.retrasoMs !== undefined) {
        await new Promise((resolver) => setTimeout(resolver, salida.retrasoMs));
      }

      const cabeceras: Record<string, string> = {
        'content-type': salida.tipoContenido ?? 'application/json',
        ...salida.cabeceras,
      };
      respuesta.writeHead(salida.estado, cabeceras);
      respuesta.end(salida.texto ?? (salida.cuerpo === undefined ? '' : JSON.stringify(salida.cuerpo)));
    })();
  });

  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const direccion = servidor.address();
  if (direccion === null || typeof direccion === 'string') throw new Error('no se pudo abrir el servicio falso');

  return {
    url: `http://127.0.0.1:${direccion.port}`,
    solicitudes,
    responder: (clave, salida) => respuestas.set(clave, salida),
    cerrar: () =>
      new Promise<void>((resolver, rechazar) =>
        servidor.close((error) => (error ? rechazar(error) : resolver())),
      ),
  };
}

/** URL de un puerto sin nadie escuchando: simula una fuente caída. */
export async function urlCaida(): Promise<string> {
  const servidor = await iniciarServidorFalso();
  const url = servidor.url;
  await servidor.cerrar();
  return url;
}

export interface OpcionesAppPrueba {
  organizacionUrl: string;
  certificacionesUrl?: string;
  fuentes?: Partial<FuentesComposicion>;
  tiempoLimiteFuenteMs?: number;
  tiempoLimiteServicioMs?: number;
  limiteTasa?: Partial<LimiteTasa>;
  origenesPortal?: string[];
}

export function configuracionPrueba(opciones: OpcionesAppPrueba): ConfiguracionGateway {
  const organizacionUrl = opciones.organizacionUrl;
  const certificacionesUrl = opciones.certificacionesUrl ?? organizacionUrl;
  return {
    puerto: 0,
    origenesPortal: opciones.origenesPortal ?? ['http://localhost:5173'],
    confiarProxy: 0,
    organizacionUrl,
    certificacionesUrl,
    fuentes: {
      usuarios: organizacionUrl,
      supervision: organizacionUrl,
      equipo: organizacionUrl,
      supervisor: organizacionUrl,
      hdu: organizacionUrl,
      checklist: certificacionesUrl,
      ...opciones.fuentes,
    },
    tiempoLimiteFuenteMs: opciones.tiempoLimiteFuenteMs ?? 2000,
    tiempoLimiteServicioMs: opciones.tiempoLimiteServicioMs ?? 5000,
    limiteTasa: {
      ventanaMs: 60_000,
      maximo: 1000,
      maximoEscritura: 1000,
      ...opciones.limiteTasa,
    },
    verificador: resolverOpcionesVerificador({
      emisor: EMISOR,
      audiencia: AUDIENCIA,
      secretoHs256: SECRETO,
    }),
  };
}

export async function crearAppPrueba(opciones: OpcionesAppPrueba): Promise<NestExpressApplication> {
  return crearApp(configuracionPrueba(opciones), { registro: false });
}

export interface OpcionesToken {
  sub?: string;
  correo?: string;
  vigenciaSegundos?: number;
  audiencia?: string;
}

/** Token HS256 equivalente al de Supabase local con llaves legacy. */
export async function firmarToken(opciones: OpcionesToken = {}): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: opciones.correo ?? 'ana.perez@quality360.local',
    role: 'authenticated',
    session_id: 'ses-1',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opciones.sub ?? SUB)
    .setIssuer(EMISOR)
    .setAudience(opciones.audiencia ?? AUDIENCIA)
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + (opciones.vigenciaSegundos ?? 300))
    .sign(new TextEncoder().encode(SECRETO));
}

export async function autorizacion(opciones: OpcionesToken = {}): Promise<string> {
  return `Bearer ${await firmarToken(opciones)}`;
}
