/**
 * Utilidades de prueba: un servidor HTTP local simula las rutas internas de
 * Organización (sin depender de que esté levantada), un token HS256 equivalente
 * al de Supabase local y un almacén de archivos en memoria.
 */
import './entorno.js';

import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { SignJWT } from 'jose';

import type { AlmacenArchivos, MetadatosArchivo, SubidaFirmada } from '../src/infraestructura/almacen.js';

export const EMISOR = 'http://127.0.0.1:54321/auth/v1';
export const AUDIENCIA = 'authenticated';
export const SECRETO = 'secreto-hs256-solo-para-pruebas-locales-0000';
export const SUB = '5b0c2f0e-8f1e-4c47-9a57-3a0f5d1e2b11';

/** Personas de prueba con su rol vigente en Organización. */
export const PERSONAS = {
  admin: { id: '0a000000-0000-4000-8000-000000000001', nombre: 'Patricia Admin', rol: 'ADMINISTRADOR' },
  qe: { id: '0a000000-0000-4000-8000-000000000002', nombre: 'Carla QE', rol: 'QE' },
  otroQe: { id: '0a000000-0000-4000-8000-000000000003', nombre: 'Marcos QE', rol: 'QE' },
  analista: { id: '0a000000-0000-4000-8000-000000000004', nombre: 'Ana Analista', rol: 'ANALISTA_QA' },
  otroAnalista: { id: '0a000000-0000-4000-8000-000000000005', nombre: 'Beatriz Analista', rol: 'ANALISTA_QA' },
  lider: { id: '0a000000-0000-4000-8000-000000000006', nombre: 'Lidia Líder', rol: 'LIDER_QA' },
  auditor: { id: '0a000000-0000-4000-8000-000000000007', nombre: 'Aurelio Auditor', rol: 'AUDITOR' },
} as const;

export type ClavePersona = keyof typeof PERSONAS;
type Persona = (typeof PERSONAS)[ClavePersona];

export async function firmarToken(sub: string = SUB): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: 'prueba@quality360.local', role: 'authenticated', session_id: 'ses-1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(EMISOR)
    .setAudience(AUDIENCIA)
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + 300)
    .sign(new TextEncoder().encode(SECRETO));
}

export async function tokenDe(persona: ClavePersona): Promise<string> {
  return firmarToken(PERSONAS[persona].id);
}

export interface HduFalsa {
  id: string;
  codigo: string;
  titulo: string;
  estado: 'PENDIENTE' | 'DISENO_PRUEBAS' | 'EN_EJECUCION' | 'PENDIENTE_CIERRE' | 'CERRADA';
  qeResponsableId: string;
  analistaId: string | null;
  /** La HDU pertenece a una célula del Líder QA de prueba (relación LECTOR_CELULA). */
  deLider?: boolean;
}

export interface ExportacionRegistrada {
  recurso: string;
  filtros: Record<string, unknown>;
  filas: number;
  sub: string | null;
}

export interface OrganizacionFalsa {
  /** Exportaciones que Certificaciones registró en la auditoría. */
  readonly exportaciones: ExportacionRegistrada[];
  /** Con `true`, el registro de exportaciones responde 500 (Organización falla). */
  fallarRegistro: boolean;
  /** Con `true`, `POST /v1/interno/hdu/consulta` responde 500 (Organización falla solo ahí). */
  fallarConsulta: boolean;
  url: string;
  /** Fuerza la respuesta de `/v1/interno/acceso`; `null` vuelve al comportamiento por persona. */
  responder(cuerpo: unknown, estado?: number): void;
  /** Registra una HDU nueva: QE responsable `qe`, analista `analista`, EN_EJECUCION. */
  nuevaHdu(cambios?: Partial<HduFalsa>): HduFalsa;
  cerrar(): Promise<void>;
}

function sujetoDe(authorization: string | undefined): string | null {
  const token = authorization?.replace(/^Bearer\s+/i, '');
  const payload = token?.split('.')[1];
  if (payload === undefined) return null;
  return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string }).sub ?? null;
}

function relacionCon(persona: Persona, hdu: HduFalsa): string | null {
  if (persona.rol === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (persona.rol === 'AUDITOR') return 'LECTOR_AUDITORIA';
  if (persona.rol === 'LIDER_QA') return hdu.deLider === true ? 'LECTOR_CELULA' : null;
  if (hdu.qeResponsableId === persona.id) return 'QE_RESPONSABLE';
  if (hdu.analistaId === persona.id) return 'ANALISTA_ASIGNADO';
  return null;
}

/** Simula `/v1/interno/acceso`, `/v1/interno/hdu/{id}/acceso` y `/v1/interno/hdu/responsable`. */
export async function iniciarOrganizacionFalsa(): Promise<OrganizacionFalsa> {
  let forzada: { cuerpo: unknown; estado: number } | null = null;
  const hdus = new Map<string, HduFalsa>();
  const porId = new Map<string, Persona>(Object.values(PERSONAS).map((persona) => [persona.id, persona]));

  const vista = (hdu: HduFalsa) => ({
    id: hdu.id,
    codigo: hdu.codigo,
    titulo: hdu.titulo,
    estado: hdu.estado,
    celula: 'Pagos',
    sprint: 'Sprint 34',
    qeResponsable: { id: hdu.qeResponsableId, nombre: porId.get(hdu.qeResponsableId)?.nombre ?? 'QE' },
    analista: hdu.analistaId === null ? null : { id: hdu.analistaId, nombre: porId.get(hdu.analistaId)?.nombre ?? 'Analista' },
  });

  const exportaciones: ExportacionRegistrada[] = [];
  const estado = { fallarRegistro: false, fallarConsulta: false };

  const servidor: Server = createServer((peticion, res) => {
    const enviar = (estado: number, cuerpo: unknown): void => {
      res.writeHead(estado, { 'content-type': 'application/json' });
      res.end(JSON.stringify(cuerpo));
    };
    const conCuerpo = (accion: (cuerpo: Record<string, unknown>) => void): void => {
      const partes: Buffer[] = [];
      peticion.on('data', (parte: Buffer) => partes.push(parte));
      peticion.on('end', () => accion(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}') as Record<string, unknown>));
    };
    const sub = sujetoDe(peticion.headers.authorization);
    const persona = sub === null ? undefined : porId.get(sub);
    const ruta = peticion.url ?? '';

    if (ruta === '/v1/interno/acceso') {
      if (forzada !== null) return enviar(forzada.estado, forzada.cuerpo);
      const ambito = { qeSupervisorId: null, analistasSupervisadosIds: [] };
      if (persona === undefined) return enviar(200, { usuarioId: sub ?? SUB, rol: 'QE', activo: true, ambito });
      return enviar(200, { usuarioId: persona.id, rol: persona.rol, activo: true, ambito });
    }
    if (persona === undefined) return enviar(403, { codigo: 'ACCESO_DENEGADO' });

    if (ruta === '/v1/interno/hdu/ambito') {
      const visibles = persona.rol === 'ADMINISTRADOR' || persona.rol === 'AUDITOR' ? null : [...hdus.values()].filter((hdu) => relacionCon(persona, hdu) !== null);
      return enviar(200, { usuarioId: persona.id, rol: persona.rol, todas: visibles === null, hduIds: (visibles ?? []).map((hdu) => hdu.id) });
    }
    if (ruta === '/v1/interno/hdu/consulta' && peticion.method === 'POST') {
      return conCuerpo((cuerpo) => {
        if (estado.fallarConsulta) return enviar(500, { codigo: 'ERROR_INTERNO' });
        const pedidas = (cuerpo.hduIds as string[]).map((id) => hdus.get(id));
        if (pedidas.some((hdu) => hdu === undefined || relacionCon(persona, hdu) === null)) return enviar(403, { codigo: 'ACCESO_DENEGADO' });
        enviar(200, { items: pedidas.map((hdu) => vista(hdu as HduFalsa)) });
      });
    }
    if (ruta === '/v1/interno/auditoria/exportaciones' && peticion.method === 'POST') {
      return conCuerpo((cuerpo) => {
        if (persona.rol !== 'AUDITOR') return enviar(403, { codigo: 'ACCESO_DENEGADO' });
        if (estado.fallarRegistro) return enviar(500, { codigo: 'ERROR_INTERNO' });
        exportaciones.push({ recurso: cuerpo.recurso as string, filtros: cuerpo.filtros as Record<string, unknown>, filas: cuerpo.filas as number, sub });
        enviar(201, { id: randomUUID() });
      });
    }
    if (ruta === '/v1/interno/hdu/responsable') {
      return enviar(200, { items: [...hdus.values()].filter((hdu) => hdu.qeResponsableId === persona.id).map(vista) });
    }
    const acceso = ruta.match(/^\/v1\/interno\/hdu\/([^/]+)\/acceso$/);
    if (acceso !== null) {
      const hdu = hdus.get(acceso[1] ?? '');
      const relacion = hdu === undefined ? null : relacionCon(persona, hdu);
      if (hdu === undefined || relacion === null) return enviar(200, { hduId: acceso[1], permitido: false, relacion: null });
      return enviar(200, {
        hduId: hdu.id,
        permitido: true,
        relacion,
        actor: { id: persona.id, nombre: persona.nombre, rol: persona.rol },
        hdu: vista(hdu),
      });
    }
    return enviar(404, { codigo: 'NO_ENCONTRADO' });
  });

  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const direccion = servidor.address();
  if (direccion === null || typeof direccion === 'string') throw new Error('no se pudo abrir el servidor falso');

  let contador = 0;
  return {
    exportaciones,
    get fallarRegistro() {
      return estado.fallarRegistro;
    },
    set fallarRegistro(valor: boolean) {
      estado.fallarRegistro = valor;
    },
    get fallarConsulta() {
      return estado.fallarConsulta;
    },
    set fallarConsulta(valor: boolean) {
      estado.fallarConsulta = valor;
    },
    url: `http://127.0.0.1:${direccion.port}`,
    responder: (cuerpo, estado = 200) => {
      forzada = cuerpo === null ? null : { cuerpo, estado };
    },
    nuevaHdu: (cambios = {}) => {
      contador += 1;
      const hdu: HduFalsa = {
        id: randomUUID(),
        codigo: `HDU-PRU-${String(contador).padStart(3, '0')}`,
        titulo: 'Pago con tarjeta guardada',
        estado: 'EN_EJECUCION',
        qeResponsableId: PERSONAS.qe.id,
        analistaId: PERSONAS.analista.id,
        ...cambios,
      };
      hdus.set(hdu.id, hdu);
      return hdu;
    },
    cerrar: () => new Promise<void>((resolver, rechazar) => servidor.close((error) => (error ? rechazar(error) : resolver()))),
  };
}

/** Almacén en memoria con la misma interfaz que Supabase Storage. */
export class AlmacenEnMemoria implements AlmacenArchivos {
  readonly archivos = new Map<string, { contenido: Uint8Array; tipoContenido: string }>();

  async firmarSubida(bucket: string, ruta: string): Promise<SubidaFirmada> {
    return { ruta, urlSubida: `http://almacen.local/${bucket}/${ruta}?token=t`, token: 't' };
  }

  /** Simula que el portal subió el archivo con la URL firmada. */
  simularSubida(bucket: string, ruta: string, tamanoBytes: number, tipoContenido: string): void {
    this.archivos.set(`${bucket}/${ruta}`, { contenido: new Uint8Array(tamanoBytes), tipoContenido });
  }

  async metadatos(bucket: string, ruta: string): Promise<MetadatosArchivo | null> {
    const archivo = this.archivos.get(`${bucket}/${ruta}`);
    return archivo === undefined ? null : { tamanoBytes: archivo.contenido.length, tipoContenido: archivo.tipoContenido };
  }

  async subir(bucket: string, ruta: string, contenido: Uint8Array, tipoContenido: string): Promise<void> {
    this.archivos.set(`${bucket}/${ruta}`, { contenido, tipoContenido });
  }

  async eliminar(bucket: string, ruta: string): Promise<void> {
    this.archivos.delete(`${bucket}/${ruta}`);
  }

  async firmarDescarga(bucket: string, ruta: string): Promise<string> {
    return `http://almacen.local/${bucket}/${ruta}?firmada=1`;
  }
}
