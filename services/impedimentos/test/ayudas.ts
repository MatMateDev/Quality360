/**
 * Utilidades de prueba. Dos servidores HTTP locales simulan a Organización (acceso, ámbito,
 * consulta y exportaciones) y a Certificaciones (avance y ciclo activo), así las pruebas de
 * integración corren contra el Postgres local sin depender de que los otros servicios estén
 * levantados. Los tokens son HS256 equivalentes a los de Supabase local.
 */
import './entorno.js';

import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { SignJWT } from 'jose';

import { fechaSantiago } from '../src/dominio/dias.js';

export const EMISOR = 'http://127.0.0.1:54321/auth/v1';
export const AUDIENCIA = 'authenticated';
export const SECRETO = 'secreto-hs256-solo-para-pruebas-locales-0000';
export const TOKEN_SERVICIO = 'token-servicio-local-de-pruebas-0123456789';


/** Personas del fixture del backlog E4 (sección 7), con el rol vigente en Organización. */
export const PERSONAS = {
  adm1: { id: '0e400000-0000-4000-8000-000000000001', nombre: 'Patricia Admin', rol: 'ADMINISTRADOR' },
  qe1: { id: '0e400000-0000-4000-8000-000000000002', nombre: 'Carla QE', rol: 'QE' },
  qe2: { id: '0e400000-0000-4000-8000-000000000003', nombre: 'Marcos QE', rol: 'QE' },
  ana1: { id: '0e400000-0000-4000-8000-000000000004', nombre: 'Ana Analista', rol: 'ANALISTA_QA' },
  ana2: { id: '0e400000-0000-4000-8000-000000000005', nombre: 'Beatriz Analista', rol: 'ANALISTA_QA' },
  ana3: { id: '0e400000-0000-4000-8000-000000000006', nombre: 'Camilo Analista', rol: 'ANALISTA_QA' },
  ana4: { id: '0e400000-0000-4000-8000-000000000007', nombre: 'Daniela Analista', rol: 'ANALISTA_QA' },
  lid1: { id: '0e400000-0000-4000-8000-000000000008', nombre: 'Lidia Líder', rol: 'LIDER_QA' },
  lid2: { id: '0e400000-0000-4000-8000-000000000009', nombre: 'Laura Líder sin células', rol: 'LIDER_QA' },
  aud1: { id: '0e400000-0000-4000-8000-00000000000a', nombre: 'Aurelio Auditor', rol: 'AUDITOR' },
} as const;

export type ClavePersona = keyof typeof PERSONAS;
type Persona = (typeof PERSONAS)[ClavePersona];

/** Supervisor vigente de cada analista (E2-B03). */
const SUPERVISOR_DE: Partial<Record<ClavePersona, ClavePersona>> = { ana1: 'qe1', ana2: 'qe1', ana3: 'qe2', ana4: 'qe2' };
const CLAVE_POR_ID = new Map<string, ClavePersona>((Object.keys(PERSONAS) as ClavePersona[]).map((clave) => [PERSONAS[clave].id, clave]));

export const CELULA_A = { id: '0ce00000-0000-4000-8000-00000000000a', nombre: 'CEL-A' };
export const CELULA_B = { id: '0ce00000-0000-4000-8000-00000000000b', nombre: 'CEL-B' };
export const CELULA_C = { id: '0ce00000-0000-4000-8000-00000000000c', nombre: 'CEL-C' };
/** Células vigentes del Líder `lid1`. */
export const CELULAS_DE_LID1 = [CELULA_A.id, CELULA_B.id];

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

// ------------------------------------------------------------------ fechas
const DIA_MS = 24 * 60 * 60 * 1000;

/** «Hoy» en America/Santiago más `dias` (AAAA-MM-DD). */
export function hoyMas(dias: number): string {
  const [anio, mes, dia] = fechaSantiago(new Date()).split('-').map(Number);
  return new Date(Date.UTC(anio ?? 0, (mes ?? 1) - 1, (dia ?? 1) + dias)).toISOString().slice(0, 10);
}

/** Instante de hace `dias` días y `horas` horas. */
export const haceDias = (dias: number, horas = 0): Date => new Date(Date.now() - dias * DIA_MS - horas * 60 * 60 * 1000);

// ------------------------------------------------------------------ Organización falsa
export type EstadoHduFalso = 'PENDIENTE' | 'DISENO_PRUEBAS' | 'EN_EJECUCION' | 'PENDIENTE_CIERRE' | 'CERRADA';

export interface HduFalsa {
  id: string;
  codigo: string;
  titulo: string;
  estado: EstadoHduFalso;
  qeResponsable: ClavePersona;
  analista: ClavePersona | null;
  celula: { id: string; nombre: string };
  sprint: { id: string; nombre: string };
  /** Fin del sprint (AAAA-MM-DD). */
  sprintFin: string | null;
  /** Avance que responde la Certificaciones falsa (porcentaje). */
  avance: number;
  /** Ciclo activo que responde la Certificaciones falsa. */
  certificacionId: string | null;
}

export interface ExportacionRegistrada {
  recurso: string;
  filtros: Record<string, unknown>;
  filas: number;
  sub: string | null;
}

export interface Falsos {
  readonly organizacionUrl: string;
  readonly certificacionesUrl: string;
  readonly exportaciones: ExportacionRegistrada[];
  /** Llamadas recibidas por Certificaciones. */
  readonly llamadasCertificaciones: string[];
  fallarRegistroExportacion: boolean;
  certificacionesCaida: boolean;
  organizacionCaida: boolean;
  nuevaHdu(cambios?: Partial<HduFalsa>): HduFalsa;
  hdu(id: string): HduFalsa | undefined;
  cerrar(): Promise<void>;
}

function sujetoDe(authorization: string | undefined): string | null {
  const payload = authorization?.replace(/^Bearer\s+/i, '').split('.')[1];
  if (payload === undefined) return null;
  return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string }).sub ?? null;
}

function relacionCon(clave: ClavePersona, hdu: HduFalsa): string | null {
  const persona: Persona = PERSONAS[clave];
  if (persona.rol === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (persona.rol === 'AUDITOR') return 'LECTOR_AUDITORIA';
  if (persona.rol === 'LIDER_QA') return clave === 'lid1' && CELULAS_DE_LID1.includes(hdu.celula.id) ? 'LECTOR_CELULA' : null;
  if (hdu.qeResponsable === clave) return 'QE_RESPONSABLE';
  if (hdu.analista === clave) return 'ANALISTA_ASIGNADO';
  if (hdu.analista !== null && SUPERVISOR_DE[hdu.analista] === clave) return 'QE_SUPERVISOR_DEL_ANALISTA';
  return null;
}

const personaRol = (clave: ClavePersona) => ({ id: PERSONAS[clave].id, nombre: PERSONAS[clave].nombre, rol: PERSONAS[clave].rol });

async function leerCuerpo(peticion: IncomingMessage): Promise<Record<string, unknown>> {
  const partes: Buffer[] = [];
  for await (const parte of peticion) partes.push(parte as Buffer);
  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}') as Record<string, unknown>;
}

function escuchar(servidor: Server): Promise<string> {
  return new Promise((resolver) =>
    servidor.listen(0, '127.0.0.1', () => {
      const direccion = servidor.address();
      resolver(`http://127.0.0.1:${typeof direccion === 'object' && direccion !== null ? direccion.port : 0}`);
    }),
  );
}

export async function iniciarFalsos(): Promise<Falsos> {
  const hdus = new Map<string, HduFalsa>();
  const exportaciones: ExportacionRegistrada[] = [];
  const llamadasCertificaciones: string[] = [];
  const estado = { fallarRegistroExportacion: false, certificacionesCaida: false, organizacionCaida: false };
  let contador = 0;

  const vista = (hdu: HduFalsa) => ({
    id: hdu.id,
    codigo: hdu.codigo,
    titulo: hdu.titulo,
    estado: hdu.estado,
    celula: hdu.celula.nombre,
    celulaId: hdu.celula.id,
    sprint: hdu.sprint.nombre,
    sprintId: hdu.sprint.id,
    sprintFin: hdu.sprintFin,
    qeResponsable: { id: PERSONAS[hdu.qeResponsable].id, nombre: PERSONAS[hdu.qeResponsable].nombre },
    analista: hdu.analista === null ? null : { id: PERSONAS[hdu.analista].id, nombre: PERSONAS[hdu.analista].nombre },
  });

  const organizacion = createServer((peticion, res) => {
    void (async () => {
      const enviar = (codigo: number, cuerpo: unknown): void => {
        res.writeHead(codigo, { 'content-type': 'application/json' });
        res.end(JSON.stringify(cuerpo));
      };
      const sub = sujetoDe(peticion.headers.authorization);
      const clave = sub === null ? undefined : CLAVE_POR_ID.get(sub);
      const url = new URL(peticion.url ?? '/', 'http://localhost');
      const ruta = url.pathname;

      if (estado.organizacionCaida && ruta !== '/v1/interno/acceso') return enviar(500, { codigo: 'ERROR_INTERNO' });
      if (clave === undefined) return enviar(403, { codigo: 'ACCESO_DENEGADO' });
      const persona: Persona = PERSONAS[clave];
      const esTotal = persona.rol === 'ADMINISTRADOR' || persona.rol === 'AUDITOR';
      const visibles = [...hdus.values()].filter((hdu) => esTotal || relacionCon(clave, hdu) !== null);

      if (ruta === '/v1/interno/acceso') {
        const supervisados = persona.rol === 'QE' ? (Object.keys(SUPERVISOR_DE) as ClavePersona[]).filter((a) => SUPERVISOR_DE[a] === clave).map((a) => PERSONAS[a].id) : [];
        return enviar(200, {
          usuarioId: persona.id,
          rol: persona.rol,
          activo: true,
          ambito: {
            qeSupervisorId: persona.rol === 'ANALISTA_QA' && SUPERVISOR_DE[clave] !== undefined ? PERSONAS[SUPERVISOR_DE[clave] as ClavePersona].id : null,
            analistasSupervisadosIds: supervisados,
            celulasIds: clave === 'lid1' ? CELULAS_DE_LID1 : [],
          },
        });
      }
      if (ruta === '/v1/interno/hdu/ambito') {
        return enviar(200, { usuarioId: persona.id, rol: persona.rol, todas: esTotal, hduIds: esTotal ? [] : visibles.map((hdu) => hdu.id) });
      }
      if (ruta === '/v1/interno/hdu/ambito/detalle') {
        const incluirCerradas = url.searchParams.get('incluirCerradas') === 'true';
        const items = visibles.filter((hdu) => incluirCerradas || hdu.estado !== 'CERRADA').sort((a, b) => a.codigo.localeCompare(b.codigo));
        return enviar(200, { items: items.map(vista) });
      }
      if (ruta === '/v1/interno/hdu/consulta' && peticion.method === 'POST') {
        const cuerpo = await leerCuerpo(peticion);
        let pedidas = (cuerpo.hduIds as string[]).map((id) => hdus.get(id));
        // Como Organización (D55): con ámbito total se omiten las desconocidas; si no, 403 completo.
        if (esTotal) pedidas = pedidas.filter((hdu) => hdu !== undefined);
        if (pedidas.some((hdu) => hdu === undefined || relacionCon(clave, hdu) === null)) return enviar(403, { codigo: 'ACCESO_DENEGADO' });
        return enviar(200, { items: pedidas.map((hdu) => vista(hdu as HduFalsa)) });
      }
      if (ruta === '/v1/interno/auditoria/exportaciones' && peticion.method === 'POST') {
        const cuerpo = await leerCuerpo(peticion);
        if (persona.rol !== 'AUDITOR') return enviar(403, { codigo: 'ACCESO_DENEGADO' });
        if (estado.fallarRegistroExportacion) return enviar(500, { codigo: 'ERROR_INTERNO' });
        exportaciones.push({ recurso: cuerpo.recurso as string, filtros: cuerpo.filtros as Record<string, unknown>, filas: cuerpo.filas as number, sub });
        return enviar(201, { id: randomUUID() });
      }
      const acceso = ruta.match(/^\/v1\/interno\/hdu\/([^/]+)\/acceso$/);
      if (acceso !== null) {
        const hdu = hdus.get(acceso[1] ?? '');
        const relacion = hdu === undefined ? null : relacionCon(clave, hdu);
        if (hdu === undefined || relacion === null) return enviar(200, { hduId: acceso[1], permitido: false, relacion: null });
        const cuerpo: Record<string, unknown> = { hduId: hdu.id, permitido: true, relacion, actor: personaRol(clave), hdu: vista(hdu) };
        if (url.searchParams.get('incluirCandidatos') === 'true') {
          const registro = [hdu.qeResponsable, ...(hdu.analista !== null && SUPERVISOR_DE[hdu.analista] !== undefined ? [SUPERVISOR_DE[hdu.analista] as ClavePersona] : [])];
          const escalamiento: ClavePersona[] = [...(CELULAS_DE_LID1.includes(hdu.celula.id) ? (['lid1'] as ClavePersona[]) : []), 'adm1'];
          cuerpo.candidatosResponsable = {
            registro: [...new Set(registro)].map(personaRol),
            escalamiento: escalamiento.map(personaRol),
          };
        }
        return enviar(200, cuerpo);
      }
      return enviar(404, { codigo: 'NO_ENCONTRADO' });
    })();
  });

  const certificaciones = createServer((peticion, res) => {
    void (async () => {
      const enviar = (codigo: number, cuerpo: unknown): void => {
        res.writeHead(codigo, { 'content-type': 'application/json' });
        res.end(JSON.stringify(cuerpo));
      };
      if (estado.certificacionesCaida) return enviar(500, { codigo: 'ERROR_INTERNO' });
      if (peticion.url === '/v1/interno/checklist/estados' && peticion.method === 'POST') {
        const cuerpo = await leerCuerpo(peticion);
        const ids = cuerpo.hduIds as string[];
        llamadasCertificaciones.push(...ids);
        return enviar(200, {
          items: ids.map((id) => ({ hduId: id, certificacionId: hdus.get(id)?.certificacionId ?? null, porcentaje: hdus.get(id)?.avance ?? 0 })),
        });
      }
      return enviar(404, { codigo: 'NO_ENCONTRADO' });
    })();
  });

  const [organizacionUrl, certificacionesUrl] = await Promise.all([escuchar(organizacion), escuchar(certificaciones)]);

  return {
    organizacionUrl,
    certificacionesUrl,
    exportaciones,
    llamadasCertificaciones,
    get fallarRegistroExportacion() {
      return estado.fallarRegistroExportacion;
    },
    set fallarRegistroExportacion(valor: boolean) {
      estado.fallarRegistroExportacion = valor;
    },
    get certificacionesCaida() {
      return estado.certificacionesCaida;
    },
    set certificacionesCaida(valor: boolean) {
      estado.certificacionesCaida = valor;
    },
    get organizacionCaida() {
      return estado.organizacionCaida;
    },
    set organizacionCaida(valor: boolean) {
      estado.organizacionCaida = valor;
    },
    hdu: (id) => hdus.get(id),
    nuevaHdu: (cambios = {}) => {
      contador += 1;
      const hdu: HduFalsa = {
        id: randomUUID(),
        codigo: `HDU-E4-${randomUUID().slice(0, 6).toUpperCase()}-${String(contador).padStart(3, '0')}`,
        titulo: 'Pago con tarjeta guardada',
        estado: 'EN_EJECUCION',
        qeResponsable: 'qe1',
        analista: 'ana1',
        celula: CELULA_A,
        sprint: { id: randomUUID(), nombre: 'Sprint de prueba' },
        sprintFin: hoyMas(20),
        avance: 0,
        certificacionId: null,
        ...cambios,
      };
      hdus.set(hdu.id, hdu);
      return hdu;
    },
    cerrar: async () => {
      await Promise.all([
        new Promise<void>((resolver) => organizacion.close(() => resolver())),
        new Promise<void>((resolver) => certificaciones.close(() => resolver())),
      ]);
    },
  };
}
