/**
 * El «mundo» de las pruebas de Indicadores: el fixture de la sección 8 del backlog E6 (usuarios, células, sprints, H1–H8,
 * impedimentos y riesgo) servido por tres fuentes simuladas con servidores HTTP reales (Organización, Certificaciones e
 * Impedimentos) y las sesiones firmadas con HS256 como las de Supabase local. Cada fuente se puede «detener» (corta la
 * conexión, como un servicio caído). Las fuentes reales se verifican en la regresión de `q360-qa`; aquí el cálculo, el
 * ámbito, los errores y la persistencia de Indicadores corren contra el Postgres local real.
 *
 * Organización calcula el ámbito con las mismas reglas de D153/D176 que el servicio real (que tiene sus propias pruebas).
 */
import './entorno.js';

import { createServer, type IncomingMessage, type Server } from 'node:http';

import { SignJWT } from 'jose';

import type { EstadoHdu, NivelRiesgo } from '../src/dominio/tipos.js';
import { AUDIENCIA, EMISOR, SECRETO } from './ayudas-app.js';

export const TOKEN_INDICADORES = 'token-indicadores-de-pruebas-0123456789';
export const CRON_SECRET = 'cron-secret-de-pruebas-0123456789-abcdefghij';
export const TOKEN_SEMILLA = 'token-servicio-local-de-pruebas-0123456789';

type Rol = 'ADMINISTRADOR' | 'QE' | 'ANALISTA_QA' | 'LIDER_QA' | 'AUDITOR';
const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export interface Persona {
  id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export const PERSONAS = {
  adm1: { id: id(1), nombre: 'ADM1', rol: 'ADMINISTRADOR', activo: true },
  qe1: { id: id(2), nombre: 'QE1', rol: 'QE', activo: true },
  qe2: { id: id(3), nombre: 'QE2', rol: 'QE', activo: true },
  qe3: { id: id(4), nombre: 'QE3', rol: 'QE', activo: true },
  ana1: { id: id(5), nombre: 'ANA1', rol: 'ANALISTA_QA', activo: true },
  ana2: { id: id(6), nombre: 'ANA2', rol: 'ANALISTA_QA', activo: true },
  ana3: { id: id(7), nombre: 'ANA3', rol: 'ANALISTA_QA', activo: true },
  ana4: { id: id(8), nombre: 'ANA4', rol: 'ANALISTA_QA', activo: true },
  lid1: { id: id(9), nombre: 'LID1', rol: 'LIDER_QA', activo: true },
  lid2: { id: id(10), nombre: 'LID2', rol: 'LIDER_QA', activo: true },
  aud1: { id: id(11), nombre: 'AUD1', rol: 'AUDITOR', activo: true },
} satisfies Record<string, Persona>;
export type ClavePersona = keyof typeof PERSONAS;

export const CELULAS = {
  A: { id: id(0xa1), nombre: 'CEL-A' },
  B: { id: id(0xa2), nombre: 'CEL-B' },
  C: { id: id(0xa3), nombre: 'CEL-C' },
  D: { id: id(0xa4), nombre: 'CEL-D' },
};
export const SPRINTS = {
  VENC: { id: id(0xb1), nombre: 'SP-VENC', inicio: '2026-10-01', fin: '2026-10-14' },
  PROX: { id: id(0xb2), nombre: 'SP-PROX', inicio: '2026-10-28', fin: '2026-11-10' },
  MED: { id: id(0xb3), nombre: 'SP-MED', inicio: '2026-11-02', fin: '2026-11-20' },
  LEJ: { id: id(0xb4), nombre: 'SP-LEJ', inicio: '2026-11-16', fin: '2026-12-15' },
};

export interface HduMundo {
  id: string;
  codigo: string;
  titulo: string;
  estado: EstadoHdu;
  cierreParcial: boolean;
  celula: keyof typeof CELULAS;
  sprint: keyof typeof SPRINTS;
  qe: ClavePersona;
  analista: ClavePersona | null;
  aprobados: number;
  certificado: boolean;
  /** Riesgo vigente y su origen según Impedimentos con el avance conocido. */
  riesgo: NivelRiesgo | null;
  riesgoSinAvance: { nivel: NivelRiesgo | null; estado: 'ok' | 'indisponible' };
  impedimentos: Array<{ id: string; estado: 'ABIERTO' | 'ESCALADO'; titulo: string; tipo: string; dias: number }>;
}

const hdu = (n: number, extra: Omit<HduMundo, 'id' | 'codigo' | 'titulo' | 'cierreParcial' | 'certificado' | 'impedimentos' | 'riesgoSinAvance'> & Partial<HduMundo>): HduMundo => ({
  id: id(0xc0 + n),
  codigo: `H${n}`,
  titulo: `Historia H${n}`,
  cierreParcial: false,
  certificado: false,
  impedimentos: [],
  riesgoSinAvance: { nivel: null, estado: 'indisponible' },
  ...extra,
});

export function crearHdus(): HduMundo[] {
  return [
    hdu(1, { estado: 'EN_EJECUCION', celula: 'A', sprint: 'PROX', qe: 'qe1', analista: 'ana1', aprobados: 3, riesgo: 'ALTO', riesgoSinAvance: { nivel: 'ALTO', estado: 'ok' }, impedimentos: [{ id: id(0xd2), estado: 'ABIERTO', titulo: 'I2 Ambiente caído', tipo: 'AMBIENTE', dias: 6 }] }),
    hdu(2, { estado: 'EN_EJECUCION', celula: 'A', sprint: 'VENC', qe: 'qe1', analista: 'ana2', aprobados: 1, riesgo: 'MEDIO' }),
    hdu(3, { estado: 'PENDIENTE', celula: 'B', sprint: 'MED', qe: 'qe2', analista: 'ana3', aprobados: 0, riesgo: 'MEDIO', impedimentos: [{ id: id(0xd1), estado: 'ABIERTO', titulo: 'I1 Datos de prueba', tipo: 'DATOS', dias: 2 }] }),
    hdu(4, { estado: 'DISENO_PRUEBAS', celula: 'C', sprint: 'LEJ', qe: 'qe2', analista: 'ana3', aprobados: 0, riesgo: 'BAJO' }),
    hdu(5, { estado: 'PENDIENTE', celula: 'A', sprint: 'MED', qe: 'qe1', analista: null, aprobados: 0, riesgo: 'ALTO' }),
    hdu(6, { estado: 'EN_EJECUCION', celula: 'B', sprint: 'PROX', qe: 'qe1', analista: 'ana1', aprobados: 8, riesgo: 'MEDIO', riesgoSinAvance: { nivel: 'MEDIO', estado: 'ok' }, impedimentos: [{ id: id(0xd3), estado: 'ESCALADO', titulo: 'I3 Dependencia externa', tipo: 'DEPENDENCIA', dias: 3 }] }),
    hdu(7, { estado: 'CERRADA', celula: 'A', sprint: 'VENC', qe: 'qe2', analista: 'ana3', aprobados: 10, certificado: true, riesgo: null }),
    hdu(8, { estado: 'PENDIENTE_CIERRE', celula: 'C', sprint: 'LEJ', qe: 'qe1', analista: 'ana2', aprobados: 10, certificado: true, riesgo: 'BAJO' }),
  ];
}

/** Supervisión vigente (analista → QE). ANA4 no tiene QE (estado base). */
export const SUPERVISION_BASE: Record<string, ClavePersona> = { ana1: 'qe1', ana2: 'qe1', ana3: 'qe2' };

// ------------------------------------------------------------------ sesiones
export async function tokenDe(persona: ClavePersona | string): Promise<string> {
  const sub = typeof persona === 'string' && persona in PERSONAS ? PERSONAS[persona as ClavePersona].id : persona;
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: 'prueba@quality360.local', role: 'authenticated', session_id: 'ses-1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(EMISOR)
    .setAudience(AUDIENCIA)
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + 600)
    .sign(new TextEncoder().encode(SECRETO));
}
export const bearer = async (persona: ClavePersona | string): Promise<string> => `Bearer ${await tokenDe(persona)}`;

// -------------------------------------------------------------------- mundo
export interface Llamada {
  fuente: 'ORG' | 'CERT' | 'IMP';
  metodo: string;
  ruta: string;
  autorizacion: string | undefined;
  credencial: string | undefined;
  cuerpo: unknown;
}

function leerCuerpo(peticion: IncomingMessage): Promise<unknown> {
  return new Promise((resolver) => {
    const partes: Buffer[] = [];
    peticion.on('data', (parte: Buffer) => partes.push(parte));
    peticion.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8');
      resolver(texto.length === 0 ? undefined : JSON.parse(texto));
    });
  });
}

const sujeto = (autorizacion: string | undefined): string | null => {
  const carga = autorizacion?.replace(/^Bearer\s+/i, '').split('.')[1];
  return carga === undefined ? null : ((JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as { sub?: string }).sub ?? null);
};

export class Mundo {
  personas: Record<string, Persona> = Object.fromEntries(Object.entries(PERSONAS).map(([clave, p]) => [clave, { ...p }]));
  hdus: HduMundo[] = crearHdus();
  supervision: Record<string, ClavePersona> = { ...SUPERVISION_BASE };
  /** Células asignadas a cada Líder (D30). */
  lideres: Record<string, Array<keyof typeof CELULAS>> = { lid1: ['A', 'B'], lid2: ['D'] };
  caida = { org: false, cert: false, imp: false };
  /** Fuerza el error de la auditoría de exportaciones (503 sin archivo). */
  falloAuditoria = false;
  /** Las credenciales de servicio que cada fuente acepta (`undefined` = no la acepta). */
  credencialCert: string | undefined = TOKEN_INDICADORES;
  credencialImp: string | undefined = TOKEN_INDICADORES;
  credencialOrg: string | undefined = TOKEN_INDICADORES;
  /** Retraso artificial de Organización para la prueba de concurrencia (ms). */
  retrasoSnapshotMs = 0;
  llamadas: Llamada[] = [];
  exportaciones: unknown[] = [];
  private servidores: Server[] = [];
  urlOrg = '';
  urlCert = '';
  urlImp = '';

  persona(clave: ClavePersona): Persona {
    return this.personas[clave] as Persona;
  }

  nombreDe(clave: ClavePersona): string {
    return this.persona(clave).nombre;
  }

  private clavePorId(idPersona: string | null): ClavePersona | null {
    return (Object.keys(this.personas) as ClavePersona[]).find((clave) => this.persona(clave).id === idPersona) ?? null;
  }

  private supervisorDe(analista: ClavePersona): ClavePersona | null {
    return this.supervision[analista] ?? null;
  }

  /** Ámbito D153: QE = responsable o analista que supervisa; Líder = sus células; Auditor = todas. */
  hduDelAmbito(clave: ClavePersona): HduMundo[] {
    const persona = this.persona(clave);
    if (persona.rol === 'AUDITOR') return this.hdus;
    if (persona.rol === 'LIDER_QA') {
      const celulas = (this.lideres[clave] ?? []).map((c) => CELULAS[c].id);
      return this.hdus.filter((h) => celulas.includes(CELULAS[h.celula].id));
    }
    if (persona.rol === 'QE') return this.hdus.filter((h) => h.qe === clave || (h.analista !== null && this.supervisorDe(h.analista) === clave));
    return [];
  }

  private aHdu(h: HduMundo) {
    const sprint = SPRINTS[h.sprint];
    const analista = h.analista === null ? null : { id: this.persona(h.analista).id, nombre: this.nombreDe(h.analista), activo: this.persona(h.analista).activo };
    return {
      id: h.id,
      codigo: h.codigo,
      titulo: h.titulo,
      estado: h.estado,
      cierreParcial: h.cierreParcial,
      celula: CELULAS[h.celula],
      sprint: { id: sprint.id, nombre: sprint.nombre, inicio: sprint.inicio, fin: sprint.fin },
      qeResponsable: { id: this.persona(h.qe).id, nombre: this.nombreDe(h.qe) },
      analista,
    };
  }

  ambito(clave: ClavePersona) {
    const persona = this.persona(clave);
    const hdu = this.hduDelAmbito(clave);
    const idsAnalistas = new Set<string>();
    for (const h of hdu) if (h.analista !== null && (this.persona(h.analista).activo || h.estado !== 'CERRADA')) idsAnalistas.add(h.analista);
    const claves = new Set<ClavePersona>([...idsAnalistas] as ClavePersona[]);
    if (persona.rol === 'QE') for (const [analista, qe] of Object.entries(this.supervision)) if (qe === clave && this.persona(analista as ClavePersona).activo) claves.add(analista as ClavePersona);
    if (persona.rol === 'AUDITOR') for (const p of Object.keys(this.personas) as ClavePersona[]) if (this.persona(p).rol === 'ANALISTA_QA' && this.persona(p).activo) claves.add(p);
    const celulas =
      persona.rol === 'LIDER_QA' ? (this.lideres[clave] ?? []).map((c) => CELULAS[c]) : [...new Map(hdu.map((h) => [CELULAS[h.celula].id, CELULAS[h.celula]])).values()];
    return {
      usuario: { id: persona.id, nombre: persona.nombre, rol: persona.rol },
      todas: persona.rol === 'AUDITOR',
      celulas: celulas.sort((a, b) => a.nombre.localeCompare(b.nombre)),
      hdu: hdu.map((h) => this.aHdu(h)),
      analistas: [...claves]
        .map((a) => {
          const sup = this.supervisorDe(a);
          return { id: this.persona(a).id, nombre: this.nombreDe(a), activo: this.persona(a).activo, supervisor: sup === null ? null : { id: this.persona(sup).id, nombre: this.nombreDe(sup) } };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      qes: (persona.rol === 'AUDITOR' ? (Object.keys(this.personas) as ClavePersona[]).filter((p) => this.persona(p).rol === 'QE' && this.persona(p).activo) : persona.rol === 'QE' ? [clave] : [])
        .map((q) => ({ id: this.persona(q).id, nombre: this.nombreDe(q) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  }

  snapshot(limite: number) {
    const todas = this.hdus;
    const ambitosQe = (Object.keys(this.personas) as ClavePersona[])
      .filter((c) => this.persona(c).rol === 'QE' && this.persona(c).activo)
      .map((c) => ({ qe: { id: this.persona(c).id, nombre: this.nombreDe(c) }, hduIds: this.hduDelAmbito(c).map((h) => h.id) }))
      .filter((a) => a.hduIds.length > 0);
    return { total: todas.length, hdu: todas.slice(0, limite).map((h) => this.aHdu(h)), ambitosQe };
  }

  // ---------------------------------------------------------------- servidores
  private servidor(fuente: 'ORG' | 'CERT' | 'IMP', manejar: (peticion: IncomingMessage, cuerpo: unknown) => Promise<{ estado: number; cuerpo: unknown }>): Promise<{ servidor: Server; url: string }> {
    const servidor = createServer(async (peticion, respuesta) => {
      const clave = fuente === 'ORG' ? 'org' : fuente === 'CERT' ? 'cert' : 'imp';
      if (this.caida[clave]) {
        peticion.socket.destroy();
        return;
      }
      const cuerpo = await leerCuerpo(peticion);
      const credencial = peticion.headers['x-q360-servicio-token'];
      this.llamadas.push({
        fuente,
        metodo: peticion.method ?? '',
        ruta: peticion.url ?? '',
        autorizacion: peticion.headers.authorization,
        credencial: Array.isArray(credencial) ? credencial[0] : credencial,
        cuerpo,
      });
      const resultado = await manejar(peticion, cuerpo);
      respuesta.writeHead(resultado.estado, { 'content-type': 'application/json' });
      respuesta.end(JSON.stringify(resultado.cuerpo));
    });
    return new Promise((resolver) => {
      servidor.listen(0, '127.0.0.1', () => {
        const direccion = servidor.address();
        if (direccion === null || typeof direccion === 'string') throw new Error('sin puerto');
        this.servidores.push(servidor);
        resolver({ servidor, url: `http://127.0.0.1:${direccion.port}` });
      });
    });
  }

  private sesion(peticion: IncomingMessage): ClavePersona | null {
    return this.clavePorId(sujeto(peticion.headers.authorization));
  }

  async iniciar(): Promise<void> {
    const rechazo = { estado: 401, cuerpo: { codigo: 'NO_AUTENTICADO', mensaje: 'x', traceId: 'x', detalles: [] } };
    const prohibido = { estado: 403, cuerpo: { codigo: 'ACCESO_DENEGADO', mensaje: 'x', traceId: 'x', detalles: [] } };

    this.urlOrg = (
      await this.servidor('ORG', async (peticion, cuerpo) => {
        const ruta = (peticion.url ?? '').split('?')[0];
        if (ruta === '/v1/interno/indicadores/snapshot') {
          const cred = peticion.headers['x-q360-servicio-token'];
          if (this.credencialOrg === undefined || cred !== this.credencialOrg) return rechazo;
          if (this.retrasoSnapshotMs > 0) await new Promise((r) => setTimeout(r, this.retrasoSnapshotMs));
          const limite = Number(new URL(peticion.url ?? '', 'http://x').searchParams.get('limite') ?? 1001);
          return { estado: 200, cuerpo: this.snapshot(limite) };
        }
        const clave = this.sesion(peticion);
        if (clave === null) return rechazo;
        const persona = this.persona(clave);
        if (ruta === '/v1/interno/acceso') {
          if (!persona.activo) return prohibido;
          const celulasIds = persona.rol === 'LIDER_QA' ? (this.lideres[clave] ?? []).map((c) => CELULAS[c].id) : [];
          const supervisados = persona.rol === 'QE' ? Object.entries(this.supervision).filter(([, qe]) => qe === clave).map(([a]) => this.persona(a as ClavePersona).id) : [];
          const sup = persona.rol === 'ANALISTA_QA' ? this.supervisorDe(clave) : null;
          return { estado: 200, cuerpo: { usuarioId: persona.id, rol: persona.rol, activo: persona.activo, ambito: { qeSupervisorId: sup === null ? null : this.persona(sup).id, analistasSupervisadosIds: supervisados, celulasIds } } };
        }
        if (ruta === '/v1/interno/indicadores/ambito') {
          if (!persona.activo || !['QE', 'LIDER_QA', 'AUDITOR'].includes(persona.rol)) return prohibido;
          return { estado: 200, cuerpo: this.ambito(clave) };
        }
        if (ruta === '/v1/me') return { estado: 200, cuerpo: { id: persona.id, nombre: persona.nombre, correo: persona.nombre.toLowerCase() + '@quality360.local', rol: persona.rol } };
        if (ruta === '/v1/catalogos/celulas') return { estado: 200, cuerpo: { items: Object.values(CELULAS) } };
        if (ruta === '/v1/interno/auditoria/exportaciones') {
          if (this.falloAuditoria) return { estado: 500, cuerpo: { codigo: 'ERROR_INTERNO', mensaje: 'x', traceId: 'x', detalles: [] } };
          this.exportaciones.push({ actor: persona.id, rol: persona.rol, ...(cuerpo as object) });
          return { estado: 201, cuerpo: { id: id(0xe0 + this.exportaciones.length) } };
        }
        return { estado: 404, cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'x', traceId: 'x', detalles: [] } };
      })
    ).url;

    this.urlCert = (
      await this.servidor('CERT', async (peticion, cuerpo) => {
        if (peticion.url !== '/v1/interno/checklist/estados') return { estado: 404, cuerpo: {} };
        const cred = peticion.headers['x-q360-servicio-token'];
        if (cred !== undefined) {
          if (this.credencialCert === undefined || cred !== this.credencialCert) return rechazo;
        } else if (this.sesion(peticion) === null) return rechazo;
        const { hduIds } = cuerpo as { hduIds: string[] };
        return {
          estado: 200,
          cuerpo: {
            items: hduIds.map((hduId) => {
              const h = this.hdus.find((x) => x.id === hduId);
              return { hduId, certificacionId: null, aprobados: h?.aprobados ?? 0, porcentaje: (h?.aprobados ?? 0) * 10, certificado: h?.certificado === true ? { folio: 'F' } : null };
            }),
          },
        };
      })
    ).url;

    this.urlImp = (
      await this.servidor('IMP', async (peticion, cuerpo) => {
        if (peticion.url !== '/v1/interno/impedimentos/evaluacion') return { estado: 404, cuerpo: {} };
        const cred = peticion.headers['x-q360-servicio-token'];
        if (cred !== undefined) {
          if (this.credencialImp === undefined || cred !== this.credencialImp) return rechazo;
        } else if (this.sesion(peticion) === null) return rechazo;
        const { hdu, incluirImpedimentos } = cuerpo as { hdu: Array<{ hduId: string; avance: number | null }>; incluirImpedimentos?: boolean };
        const items = hdu.map((entrada) => {
          const h = this.hdus.find((x) => x.id === entrada.hduId);
          const conAvance = entrada.avance !== null;
          const impedimentos = h?.impedimentos ?? [];
          const nivel = h === undefined ? null : conAvance ? h.riesgo : h.riesgoSinAvance.nivel;
          const estado = h === undefined || conAvance ? 'ok' : h.riesgoSinAvance.estado;
          return {
            hduId: entrada.hduId,
            bloqueada: impedimentos.length > 0,
            abiertos: impedimentos.length,
            escalados: impedimentos.filter((i) => i.estado === 'ESCALADO').length,
            nuevos: 0,
            riesgo: { nivelVigente: nivel, origen: nivel === null ? null : 'SUGERIDO', estado, calculoParcial: !conAvance && estado === 'ok' },
            nivelFijado: null,
            nivelSugerido: nivel,
          };
        });
        const ids = new Set(hdu.map((x) => x.hduId));
        const lista = incluirImpedimentos === true
          ? this.hdus.filter((h) => ids.has(h.id)).flatMap((h) => h.impedimentos.map((i) => ({ id: i.id, hduId: h.id, tipo: i.tipo, titulo: i.titulo, estado: i.estado, diasAbierto: i.dias })))
          : [];
        return { estado: 200, cuerpo: { fechaReferencia: '2026-11-04', items, impedimentos: lista } };
      })
    ).url;
  }

  async cerrar(): Promise<void> {
    await Promise.all(
      this.servidores.map(
        (servidor) =>
          new Promise<void>((resolver) => {
            servidor.closeAllConnections();
            servidor.close(() => resolver());
          }),
      ),
    );
  }

  /** Cuántas veces se llamó a una fuente (por ruta que contiene `fragmento`). */
  contar(fuente: Llamada['fuente'], fragmento = ''): number {
    return this.llamadas.filter((l) => l.fuente === fuente && l.ruta.includes(fragmento)).length;
  }
}
