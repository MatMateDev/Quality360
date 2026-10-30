/**
 * Utilidades de las pruebas de integración de Integraciones (E5). Corren contra el Postgres local real con el rol
 * `svc_integraciones`. Las tres fronteras externas son implementaciones falsas EN PROCESO o locales:
 *  - Organización: un servidor HTTP (acceso, perfil, destino, upsert, ámbito) con estado en memoria.
 *  - Jira: un `FuenteJira` programable (los modos de falla del Jira simulado de q360-qa).
 *  - Mapeo y lector de archivos: versiones mínimas de las que construye q360-integraciones.
 * Los tokens son HS256 equivalentes a los de Supabase local.
 */
import './entorno.js';

import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';

import { PrismaClient } from '#prisma';
import { SignJWT } from 'jose';

import type { LectorArchivo, MapeadorIssues, ResultadoLectura } from '../src/aplicacion/puertos.js';
import type { FuenteJira, IssueJira, PaginaJira, ResultadoJira, CodigoErrorJira, EventoEspera } from '../src/dominio/puertos/fuente-jira.js';
import type { FilaMapeada } from '../src/dominio/mapeo/tipos.js';
import { AUDIENCIA, EMISOR, SECRETO } from './ayudas-app.js';

export const PERSONAS = {
  adm1: { id: '0e500000-0000-4000-8000-000000000001', nombre: 'Patricia Admin', rol: 'ADMINISTRADOR' },
  qe1: { id: '0e500000-0000-4000-8000-000000000002', nombre: 'Carla QE', rol: 'QE' },
  qe2: { id: '0e500000-0000-4000-8000-000000000003', nombre: 'Marcos QE', rol: 'QE' },
  ana1: { id: '0e500000-0000-4000-8000-000000000004', nombre: 'Ana Analista', rol: 'ANALISTA_QA' },
  lid1: { id: '0e500000-0000-4000-8000-000000000005', nombre: 'Lidia Líder', rol: 'LIDER_QA' },
  aud1: { id: '0e500000-0000-4000-8000-000000000006', nombre: 'Aurelio Auditor', rol: 'AUDITOR' },
  inact1: { id: '0e500000-0000-4000-8000-000000000007', nombre: 'Ines Inactiva', rol: 'QE' },
} as const;
export type ClavePersona = keyof typeof PERSONAS;
const CLAVE_POR_ID = new Map<string, ClavePersona>((Object.keys(PERSONAS) as ClavePersona[]).map((c) => [PERSONAS[c].id, c]));

export const CELULA_C = { id: '0ce00000-0000-4000-8000-00000000000c', nombre: 'CEL-C' };
export const CELULA_A = { id: '0ce00000-0000-4000-8000-00000000000a', nombre: 'CEL-A' };
export const SPRINT_1 = { id: '05e00000-0000-4000-8000-000000000001', nombre: 'E5 Sprint 1', celulaId: CELULA_C.id };
export const SPRINT_2 = { id: '05e00000-0000-4000-8000-000000000002', nombre: 'E5 Sprint 2', celulaId: CELULA_C.id };
export const SPRINT_DE_A = { id: '05e00000-0000-4000-8000-0000000000aa', nombre: 'Sprint CEL-A', celulaId: CELULA_A.id };

export const TOKEN_JIRA = 'q360-token-valido-AB12';
export const TOKEN_JIRA_NUEVO = 'q360-token-nuevo-CD34';

export async function firmarToken(sub: string): Promise<string> {
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

export const tokenDe = (persona: ClavePersona): Promise<string> => firmarToken(PERSONAS[persona].id);
export const bearer = async (persona: ClavePersona): Promise<string> => `Bearer ${await tokenDe(persona)}`;

// ------------------------------------------------------------------ base de datos
/** Superusuario del Supabase local (solo para limpiar entre pruebas, como el arnés de E4 y E5): `svc_integraciones` no puede borrar ni vaciar. */
const duenio = new PrismaClient({ datasourceUrl: 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres?schema=integraciones' });
/** Con el rol del servicio, para comprobar privilegios y restricciones (E5-B01-T12, E5-B04-T10). */
export const prismaServicio = new PrismaClient();

export async function limpiarIntegraciones(): Promise<void> {
  await duenio.$executeRawUnsafe('TRUNCATE TABLE integraciones.detalle_ejecucion, integraciones.ejecucion_integracion, integraciones.evento_configuracion, integraciones.configuracion_jira');
}

export async function consultaDuenio<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  return (await duenio.$queryRawUnsafe(sql)) as T[];
}

export async function ejecutarDuenio(sql: string): Promise<void> {
  await duenio.$executeRawUnsafe(sql);
}

export async function cerrarBases(): Promise<void> {
  await duenio.$disconnect();
  await prismaServicio.$disconnect();
}

// ------------------------------------------------------------------ Organización falsa
export interface HduFalsa {
  id: string;
  codigo: string;
  titulo: string;
  descripcion: string | null;
  prioridad: string;
  estado: 'PENDIENTE' | 'CERRADA';
  origen: 'MANUAL' | 'JIRA' | 'CSV' | 'JSON';
  qeId: string;
  celulaId: string;
  sprintId: string;
}

export interface OrganizacionFalsa {
  readonly url: string;
  readonly hdus: Map<string, HduFalsa>;
  /** Llamadas recibidas, `METODO ruta`. */
  readonly llamadas: string[];
  /** Cuerpos de los upsert recibidos. */
  readonly upserts: Array<Record<string, unknown>>;
  /** Todo lo que no sea el acceso responde 500 (Organización «detenida» durante la ejecución). */
  caida: boolean;
  /** El acceso también falla: Organización caída antes de empezar. */
  accesoCaido: boolean;
  /** Los upsert desde el N-ésimo (1 = el primero) responden 500. */
  fallarUpsertDesde: number | null;
  /** Personas desactivadas. */
  readonly inactivas: Set<ClavePersona>;
  agregarHdu(parcial: Partial<HduFalsa> & { codigo: string }): HduFalsa;
  cerrar(): Promise<void>;
}

const norm = (codigo: string): string => codigo.trim().toLowerCase();

async function cuerpoDe(peticion: IncomingMessage): Promise<Record<string, unknown>> {
  const partes: Buffer[] = [];
  for await (const parte of peticion) partes.push(parte as Buffer);
  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}') as Record<string, unknown>;
}

function sujetoDe(authorization: string | undefined): string | null {
  const payload = authorization?.replace(/^Bearer\s+/i, '').split('.')[1];
  if (payload === undefined) return null;
  return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string }).sub ?? null;
}

export async function iniciarOrganizacionFalsa(): Promise<OrganizacionFalsa> {
  const hdus = new Map<string, HduFalsa>();
  const llamadas: string[] = [];
  const upserts: Array<Record<string, unknown>> = [];
  const inactivas = new Set<ClavePersona>(['inact1']);
  let upsertsRecibidos = 0;
  const estado = { caida: false, accesoCaido: false, fallarUpsertDesde: null as number | null };

  const servidor: Server = createServer((peticion, res) => {
    void (async () => {
      const enviar = (codigo: number, cuerpo: unknown): void => {
        res.writeHead(codigo, { 'content-type': 'application/json' });
        res.end(JSON.stringify(cuerpo));
      };
      const url = new URL(peticion.url ?? '/', 'http://localhost');
      llamadas.push(`${peticion.method} ${url.pathname}`);
      const sub = sujetoDe(peticion.headers.authorization);
      const clave = sub === null ? undefined : CLAVE_POR_ID.get(sub);
      if (url.pathname === '/v1/interno/acceso') {
        if (estado.accesoCaido) return enviar(500, { codigo: 'ERROR_INTERNO' });
        if (clave === undefined) return enviar(403, { codigo: 'ACCESO_DENEGADO' });
        const p = PERSONAS[clave];
        return enviar(200, { usuarioId: p.id, rol: p.rol, activo: !inactivas.has(clave), ambito: { qeSupervisorId: null, analistasSupervisadosIds: [], celulasIds: [] } });
      }
      if (estado.caida) return enviar(500, { codigo: 'ERROR_INTERNO' });
      if (clave === undefined) return enviar(403, { codigo: 'ACCESO_DENEGADO' });
      const persona = PERSONAS[clave];

      if (url.pathname === '/v1/me') return enviar(200, { id: persona.id, nombre: persona.nombre, correo: `${clave}@quality360.local`, rol: persona.rol });

      if (url.pathname === '/v1/interno/hdu/ambito') {
        const todas = persona.rol === 'ADMINISTRADOR' || persona.rol === 'AUDITOR';
        const ids = [...hdus.values()].filter((h) => h.qeId === persona.id).map((h) => h.id);
        return enviar(200, { usuarioId: persona.id, rol: persona.rol, todas, hduIds: todas ? [] : ids });
      }

      if (url.pathname === '/v1/interno/integraciones/destino' && peticion.method === 'POST') {
        if (persona.rol !== 'ADMINISTRADOR') return enviar(403, { codigo: 'ACCESO_DENEGADO' });
        const d = await cuerpoDe(peticion);
        return enviar(200, resolverDestino(d, inactivas));
      }

      if (url.pathname === '/v1/interno/integraciones/hdu/upsert' && peticion.method === 'POST') {
        if (persona.rol !== 'ADMINISTRADOR') return enviar(403, { codigo: 'ACCESO_DENEGADO' });
        upsertsRecibidos += 1;
        if (estado.fallarUpsertDesde !== null && upsertsRecibidos >= estado.fallarUpsertDesde) return enviar(500, { codigo: 'ERROR_INTERNO' });
        const solicitud = await cuerpoDe(peticion);
        upserts.push(solicitud);
        return enviar(200, aplicarUpsert(solicitud, hdus, inactivas));
      }
      return enviar(404, { codigo: 'NO_ENCONTRADO' });
    })();
  });

  const url = await new Promise<string>((resolver) =>
    servidor.listen(0, '127.0.0.1', () => {
      const direccion = servidor.address();
      resolver(`http://127.0.0.1:${typeof direccion === 'object' && direccion !== null ? direccion.port : 0}`);
    }),
  );

  return {
    url,
    hdus,
    llamadas,
    upserts,
    inactivas,
    get caida() {
      return estado.caida;
    },
    set caida(valor: boolean) {
      estado.caida = valor;
    },
    get accesoCaido() {
      return estado.accesoCaido;
    },
    set accesoCaido(valor: boolean) {
      estado.accesoCaido = valor;
    },
    get fallarUpsertDesde() {
      return estado.fallarUpsertDesde;
    },
    set fallarUpsertDesde(valor: number | null) {
      estado.fallarUpsertDesde = valor;
      upsertsRecibidos = 0;
    },
    agregarHdu(parcial) {
      const hdu: HduFalsa = {
        id: randomUUID(),
        titulo: `Título de ${parcial.codigo}`,
        descripcion: null,
        prioridad: 'MEDIA',
        estado: 'PENDIENTE',
        origen: 'MANUAL',
        qeId: PERSONAS.qe2.id,
        celulaId: CELULA_C.id,
        sprintId: SPRINT_1.id,
        ...parcial,
      };
      hdus.set(norm(hdu.codigo), hdu);
      return hdu;
    },
    cerrar: () => new Promise((resolver) => servidor.close(() => resolver())),
  };
}

const CELULAS = [CELULA_C, CELULA_A];
const SPRINTS = [SPRINT_1, SPRINT_2, SPRINT_DE_A];

function resolverDestino(d: Record<string, unknown>, inactivas: Set<ClavePersona>) {
  const celula = CELULAS.find((c) => c.id === d.celulaId) ?? null;
  const sprint = SPRINTS.find((s) => s.id === d.sprintRespaldoId) ?? null;
  const claveQe = [...CLAVE_POR_ID.entries()].find(([id]) => id === d.qeResponsableId)?.[1];
  const errores: Array<{ campo: string; codigo: string; mensaje: string }> = [];
  if (celula === null) errores.push({ campo: 'celulaId', codigo: 'NO_EXISTE', mensaje: 'La célula no existe.' });
  if (sprint === null) errores.push({ campo: 'sprintRespaldoId', codigo: 'NO_EXISTE', mensaje: 'El sprint de respaldo no existe.' });
  else if (celula !== null && sprint.celulaId !== celula.id) errores.push({ campo: 'sprintRespaldoId', codigo: 'NO_PERMITIDO', mensaje: 'El sprint de respaldo debe pertenecer a la célula elegida.' });
  if (claveQe === undefined) errores.push({ campo: 'qeResponsableId', codigo: 'NO_EXISTE', mensaje: 'El QE responsable no existe.' });
  else if (PERSONAS[claveQe].rol !== 'QE' || inactivas.has(claveQe)) errores.push({ campo: 'qeResponsableId', codigo: 'NO_PERMITIDO', mensaje: 'El QE responsable debe tener rol QE y estar activo.' });
  return {
    celula: celula === null ? null : { id: celula.id, nombre: celula.nombre },
    qeResponsable: claveQe === undefined ? null : { id: PERSONAS[claveQe].id, nombre: PERSONAS[claveQe].nombre },
    sprintRespaldo: sprint === null ? null : { id: sprint.id, nombre: sprint.nombre },
    errores,
  };
}

interface FilaEntrada {
  fila: number;
  codigo: string;
  titulo: string | null;
  descripcion?: string | null;
  prioridad?: string | null;
  celula?: string | null;
  sprint?: string | null;
  qeCorreo?: string | null;
}

/** Una versión mínima del algoritmo del upsert real (D97–D100, D125): lo bastante fiel para probar las ejecuciones. */
function aplicarUpsert(solicitud: Record<string, unknown>, hdus: Map<string, HduFalsa>, inactivas: Set<ClavePersona>) {
  const filas = solicitud.filas as FilaEntrada[];
  const destino = solicitud.destino as { celulaId: string; qeResponsableId: string; sprintRespaldoId: string };
  const soloSimular = solicitud.soloSimular === true;
  const estricto = solicitud.estricto === true;
  const vincular = solicitud.vincularExistentes === true;
  const origen = solicitud.origen as HduFalsa['origen'];
  const escribe = !soloSimular && !estricto;
  const pendientes: Array<() => void> = [];

  const resultados = filas.map((f) => {
    const base = { fila: f.fila, codigo: f.codigo.trim(), idHistoria: null as string | null, advertencias: [] as string[], cambios: null as unknown };
    const titulo = (f.titulo ?? '').trim();
    if (titulo.length === 0) return { ...base, resultado: 'ERROR', motivo: 'TITULO_VACIO' };
    const existente = hdus.get(norm(f.codigo));
    if (existente !== undefined) {
      if (existente.estado === 'CERRADA') return { ...base, resultado: 'OMITIDA', motivo: 'HDU_CERRADA', idHistoria: existente.id };
      if (existente.origen === 'MANUAL' && !vincular) return { ...base, resultado: 'OMITIDA', motivo: 'HDU_MANUAL_EXISTENTE', idHistoria: existente.id };
      const cambios: Record<string, { antes: string | null; despues: string | null }> = {};
      if (titulo !== existente.titulo) cambios.titulo = { antes: existente.titulo, despues: titulo };
      const descripcion = (f.descripcion ?? '').trim();
      if (descripcion.length > 0 && descripcion !== (existente.descripcion ?? '')) cambios.descripcion = { antes: existente.descripcion, despues: descripcion };
      if (f.prioridad && f.prioridad !== existente.prioridad) cambios.prioridad = { antes: existente.prioridad, despues: f.prioridad };
      if (Object.keys(cambios).length === 0 && existente.origen !== 'MANUAL') return { ...base, resultado: 'OMITIDA', motivo: 'SIN_CAMBIOS', idHistoria: existente.id };
      pendientes.push(() => {
        existente.titulo = titulo;
        if (cambios.descripcion) existente.descripcion = cambios.descripcion.despues;
        if (f.prioridad) existente.prioridad = f.prioridad;
        if (existente.origen === 'MANUAL') existente.origen = origen;
      });
      return { ...base, resultado: 'ACTUALIZADA', motivo: null, idHistoria: existente.id, cambios };
    }
    const celula = f.celula ? CELULAS.find((c) => c.nombre.toLowerCase() === f.celula?.toLowerCase()) : CELULAS.find((c) => c.id === destino.celulaId);
    if (celula === undefined) return { ...base, resultado: 'ERROR', motivo: 'CELULA_NO_ENCONTRADA' };
    let sprintId = SPRINTS.find((s) => s.id === destino.sprintRespaldoId && s.celulaId === celula.id)?.id;
    const advertencias: string[] = [];
    if (f.sprint) {
      const encontrado = SPRINTS.find((s) => s.celulaId === celula.id && s.nombre.toLowerCase() === f.sprint?.toLowerCase());
      if (encontrado) sprintId = encontrado.id;
      else if (solicitud.sprintNoEncontrado === 'ERROR') return { ...base, resultado: 'ERROR', motivo: 'SPRINT_NO_ENCONTRADO' };
      else if (sprintId !== undefined) advertencias.push('SPRINT_NO_ENCONTRADO');
    }
    if (sprintId === undefined) return { ...base, resultado: 'ERROR', motivo: 'SPRINT_REQUERIDO' };
    const claveQe = [...CLAVE_POR_ID.entries()].find(([id]) => id === destino.qeResponsableId)?.[1];
    const qeCorreo = f.qeCorreo ? ([...CLAVE_POR_ID.values()].find((c) => `${c}@quality360.local` === f.qeCorreo?.toLowerCase())) : undefined;
    const claveFinal = f.qeCorreo ? qeCorreo : claveQe;
    if (claveFinal === undefined || PERSONAS[claveFinal].rol !== 'QE' || inactivas.has(claveFinal)) return { ...base, resultado: 'ERROR', motivo: 'QE_INVALIDO' };
    const id = randomUUID();
    pendientes.push(() => {
      hdus.set(norm(f.codigo), { id, codigo: f.codigo.trim(), titulo, descripcion: f.descripcion ?? null, prioridad: f.prioridad ?? 'MEDIA', estado: 'PENDIENTE', origen, qeId: PERSONAS[claveFinal].id, celulaId: celula.id, sprintId });
    });
    return { ...base, resultado: 'CREADA', motivo: null, idHistoria: id, advertencias };
  });

  if (soloSimular) {
    return { simulado: true, filas: resultados.map((r) => (r.resultado === 'CREADA' ? { ...r, idHistoria: null } : r)) };
  }
  if (estricto && resultados.some((r) => r.resultado === 'ERROR')) {
    return { simulado: true, filas: resultados.map((r) => (r.resultado === 'CREADA' ? { ...r, idHistoria: null } : r)) };
  }
  // Modo normal o estricto sin errores: las filas válidas se aplican en el mismo orden.
  void escribe;
  for (const aplicar of pendientes) aplicar();
  return { simulado: false, filas: resultados };
}

// ------------------------------------------------------------------ Jira falso (FuenteJira)
export type ModoJira = 'NORMAL' | 'LIMITE' | 'LIMITE_PAGINA_2' | 'LENTO' | 'RETARDO' | 'CAIDO' | 'TOKEN_REVOCADO' | 'SIN_PERMISO' | 'RESPUESTA_INVALIDA' | 'SITIO_INEXISTENTE';

const CODIGO_DE_MODO: Partial<Record<ModoJira, CodigoErrorJira>> = {
  LENTO: 'JIRA_TIEMPO_AGOTADO',
  CAIDO: 'JIRA_NO_DISPONIBLE',
  TOKEN_REVOCADO: 'JIRA_CREDENCIAL_INVALIDA',
  SIN_PERMISO: 'JIRA_SIN_PERMISO',
  RESPUESTA_INVALIDA: 'JIRA_RESPUESTA_INVALIDA',
  SITIO_INEXISTENTE: 'JIRA_SITIO_NO_ENCONTRADO',
};

export function issue(numero: number, clave: string, parcial: Partial<IssueJira> = {}): IssueJira {
  return {
    clave: `${clave}-${numero}`,
    tipo: 'Story',
    titulo: `Historia ${clave}-${numero}`,
    descripcionAdf: `Descripción ${clave}-${numero}`,
    prioridad: 'High',
    estado: 'In Progress',
    responsable: 'Dev Uno',
    sprints: [{ nombre: 'E5 Sprint 2', estado: 'active', fin: null }],
    ...parcial,
  };
}

export class JiraFalso implements FuenteJira {
  modo: ModoJira = 'NORMAL';
  retardoMs = 0;
  readonly llamadas: string[] = [];
  readonly consultas: Array<{ proyecto: string; tipos: string[]; despuesDe?: string; nextPageToken?: string }> = [];
  readonly proyectos = new Map<string, IssueJira[]>();
  readonly tokensValidos = new Set<string>([TOKEN_JIRA, TOKEN_JIRA_NUEVO]);
  /** Esperas por 429 que cada llamada a `buscarPagina` informa mientras `modo` es LIMITE. */
  private limitesRestantes = 2;

  constructor() {
    this.reiniciar();
  }

  reiniciar(): void {
    this.modo = 'NORMAL';
    this.retardoMs = 0;
    this.llamadas.length = 0;
    this.consultas.length = 0;
    this.limitesRestantes = 2;
    this.proyectos.clear();
    this.proyectos.set(
      'QTY',
      [
        ...Array.from({ length: 12 }, (_, i) => issue(i + 1, 'QTY', i + 1 === 7 ? { tipo: 'Bug' } : i + 1 === 11 ? { titulo: '' } : {})),
      ],
    );
    this.proyectos.set('BIG', Array.from({ length: 230 }, (_, i) => issue(i + 1, 'BIG')));
    this.proyectos.set('EXACTO', Array.from({ length: 100 }, (_, i) => issue(i + 1, 'EXACTO')));
    this.proyectos.set('VACIO', []);
  }

  private fallo<T>(codigo: CodigoErrorJira, eventos: EventoEspera[] = []): ResultadoJira<T> {
    return { ok: false, codigo, eventos };
  }

  private async esperar(): Promise<void> {
    if (this.retardoMs > 0) await new Promise((resolver) => setTimeout(resolver, this.retardoMs));
  }

  private errorDeCredencial<T>(token: string): ResultadoJira<T> | null {
    const porModo = CODIGO_DE_MODO[this.modo];
    if (porModo !== undefined) return this.fallo(porModo);
    if (!this.tokensValidos.has(token)) return this.fallo('JIRA_CREDENCIAL_INVALIDA');
    return null;
  }

  async probar(c: { sitio: string; correo: string; token: string }, proyecto: string): ReturnType<FuenteJira['probar']> {
    this.llamadas.push('probar');
    const error = this.errorDeCredencial<{ usuarioJira: string; proyecto: { clave: string; nombre: string } }>(c.token);
    if (error !== null) return error;
    if (this.modo === 'LIMITE_PAGINA_2' || this.modo === 'LIMITE') {
      if (this.modo === 'LIMITE_PAGINA_2') return this.fallo('JIRA_LIMITE_DE_TASA');
    }
    if (!this.proyectos.has(proyecto)) return this.fallo('JIRA_PROYECTO_NO_ENCONTRADO');
    return { ok: true, valor: { usuarioJira: 'Admin Jira Falso', proyecto: { clave: proyecto, nombre: `Proyecto ${proyecto}` } }, eventos: [] };
  }

  async detectarCampoSprint(): ReturnType<FuenteJira['detectarCampoSprint']> {
    this.llamadas.push('detectarCampoSprint');
    return { ok: true, valor: 'customfield_10020', eventos: [] };
  }

  async buscarPagina(
    c: { sitio: string; correo: string; token: string },
    q: { proyecto: string; tipos: string[]; despuesDe?: string; nextPageToken?: string; campoSprint: string | null },
  ): Promise<ResultadoJira<PaginaJira>> {
    this.llamadas.push('buscarPagina');
    this.consultas.push({ proyecto: q.proyecto, tipos: q.tipos, despuesDe: q.despuesDe, nextPageToken: q.nextPageToken });
    await this.esperar();
    const error = this.errorDeCredencial<PaginaJira>(c.token);
    if (error !== null) return error;
    const pagina2 = q.nextPageToken !== undefined;
    const espera = (n: number): EventoEspera[] => Array.from({ length: n }, () => ({ tipo: 'JIRA_LIMITE_DE_TASA', esperaMs: 1000, fecha: new Date() }));
    if (this.modo === 'LIMITE_PAGINA_2' && pagina2) return this.fallo('JIRA_LIMITE_DE_TASA', espera(2));
    let eventos: EventoEspera[] = [];
    if (this.modo === 'LIMITE' && this.limitesRestantes > 0) {
      eventos = espera(this.limitesRestantes);
      this.limitesRestantes = 0;
    }
    const numero = (clave: string): number => Number(clave.split('-')[1]);
    const todas = (this.proyectos.get(q.proyecto) ?? [])
      .filter((i) => q.tipos.includes(i.tipo))
      .filter((i) => q.despuesDe === undefined || numero(i.clave) > numero(q.despuesDe))
      .sort((a, b) => numero(a.clave) - numero(b.clave));
    const desde = q.nextPageToken === undefined ? 0 : Number(q.nextPageToken);
    const issues = todas.slice(desde, desde + 50);
    const siguiente = desde + 50;
    const esUltima = siguiente >= todas.length;
    return { ok: true, valor: { issues, nextPageToken: esUltima ? null : String(siguiente), esUltima }, eventos };
  }
}

// ------------------------------------------------------------------ mapeo y lector falsos
const PRIORIDADES: Record<string, string> = {
  highest: 'CRITICA', blocker: 'CRITICA', critical: 'CRITICA', high: 'ALTA', medium: 'MEDIA', low: 'BAJA', lowest: 'BAJA', baja: 'BAJA', media: 'MEDIA', alta: 'ALTA', critica: 'CRITICA',
};

export class MapeadorFalso implements MapeadorIssues {
  mapear(i: IssueJira, contexto: { fila: number; sitio: string }): FilaMapeada {
    const titulo = (i.titulo ?? '').trim();
    return {
      fila: contexto.fila,
      codigo: i.clave,
      titulo: titulo.length === 0 ? null : titulo.slice(0, 200),
      descripcion: typeof i.descripcionAdf === 'string' ? i.descripcionAdf : null,
      prioridad: (i.prioridad === null ? 'MEDIA' : (PRIORIDADES[i.prioridad.toLowerCase()] ?? 'MEDIA')) as FilaMapeada['prioridad'],
      sprint: i.sprints[0]?.nombre ?? null,
      claveExterna: i.clave,
      urlExterna: `${contexto.sitio}/browse/${i.clave}`,
      advertencias: [],
      referencia: { estado: i.estado, responsable: i.responsable },
      error: titulo.length === 0 ? 'TITULO_VACIO' : null,
    };
  }
}

export class LectorFalso implements LectorArchivo {
  leer(formato: 'CSV' | 'JSON', contenido: string): ResultadoLectura {
    const texto = contenido.replace(/^﻿/, '');
    if (texto.trim().length === 0) return { ok: false, codigo: 'ARCHIVO_VACIO', columnasFaltantes: [] };
    let registros: Array<Record<string, string>>;
    let columnas: string[];
    if (formato === 'JSON') {
      let datos: unknown;
      try {
        datos = JSON.parse(texto);
      } catch {
        return { ok: false, codigo: 'ARCHIVO_ILEGIBLE', columnasFaltantes: [] };
      }
      const lista = Array.isArray(datos) ? datos : (datos as { historias?: unknown } | null)?.historias;
      if (!Array.isArray(lista) || lista.some((x) => typeof x !== 'object' || x === null)) return { ok: false, codigo: 'ARCHIVO_ILEGIBLE', columnasFaltantes: [] };
      registros = lista.map((x) => Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k.toLowerCase().replace('qecorreo', 'qe_correo'), v === null || v === undefined ? '' : String(v)])));
      columnas = [...new Set(registros.flatMap((r) => Object.keys(r)))];
    } else {
      if ((texto.match(/"/g) ?? []).length % 2 !== 0) return { ok: false, codigo: 'ARCHIVO_ILEGIBLE', columnasFaltantes: [] };
      const lineas = texto.split(/\r?\n/).filter((l) => l.length > 0);
      const encabezado = (lineas[0] ?? '').split(',').map((c) => c.trim().toLowerCase().replace('código', 'codigo'));
      columnas = encabezado;
      registros = lineas.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [encabezado[i] ?? `col${i}`, v.trim()])));
    }
    const faltantes = (['codigo', 'titulo'] as const).filter((c) => !columnas.includes(c));
    if (faltantes.length > 0) return { ok: false, codigo: 'COLUMNAS_FALTANTES', columnasFaltantes: [...faltantes] };
    if (registros.length === 0) return { ok: false, codigo: 'ARCHIVO_VACIO', columnasFaltantes: [] };
    if (registros.length > 500) return { ok: false, codigo: 'DEMASIADAS_FILAS', columnasFaltantes: [] };

    const conocidas = ['codigo', 'titulo', 'descripcion', 'prioridad', 'celula', 'sprint', 'qe_correo'];
    const vistos = new Set<string>();
    const filas: FilaMapeada[] = registros.map((r, indice) => {
      const codigo = (r.codigo ?? '').trim();
      const titulo = (r.titulo ?? '').trim();
      const prioridad = (r.prioridad ?? '').trim();
      let error: FilaMapeada['error'] = null;
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(codigo)) error = 'CODIGO_INVALIDO';
      else if (titulo.length === 0) error = 'TITULO_VACIO';
      else if (titulo.length > 200) error = 'TITULO_LARGO';
      else if (prioridad.length > 0 && PRIORIDADES[prioridad.toLowerCase()] === undefined) error = 'PRIORIDAD_INVALIDA';
      else if (vistos.has(codigo.toLowerCase())) error = 'CODIGO_DUPLICADO_EN_ARCHIVO';
      vistos.add(codigo.toLowerCase());
      return {
        fila: indice + 1,
        codigo,
        titulo: titulo.length === 0 ? null : titulo,
        descripcion: (r.descripcion ?? '').trim() || null,
        prioridad: prioridad.length === 0 ? null : (PRIORIDADES[prioridad.toLowerCase()] as FilaMapeada['prioridad']) ?? null,
        celula: (r.celula ?? '').trim() || null,
        sprint: (r.sprint ?? '').trim() || null,
        qeCorreo: (r.qe_correo ?? '').trim() || null,
        advertencias: [],
        referencia: null,
        error,
      };
    });
    return { ok: true, filas, columnasIgnoradas: columnas.filter((c) => !conocidas.includes(c)) };
  }
}

/** Texto de la salida estándar y del registro del servicio durante una prueba (para buscar secretos). */
export class RegistroCapturado {
  readonly lineas: string[] = [];
  log = (mensaje: unknown): void => void this.lineas.push(String(mensaje));
  error = (mensaje: unknown): void => void this.lineas.push(String(mensaje));
  warn = (mensaje: unknown): void => void this.lineas.push(String(mensaje));
  debug = (mensaje: unknown): void => void this.lineas.push(String(mensaje));
  verbose = (mensaje: unknown): void => void this.lineas.push(String(mensaje));
  fatal = (mensaje: unknown): void => void this.lineas.push(String(mensaje));
}
