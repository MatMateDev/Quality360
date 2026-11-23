/** Ayudas de las pruebas de OAuth: conectar por el flujo real (iniciar y retorno), leer la fila y armar cuerpos. */
import { createHash } from 'node:crypto';

import type { Response } from 'supertest';

import { DATO_ASOCIADO_ACCESO, DATO_ASOCIADO_RENOVACION } from '../src/dominio/oauth/conexion.js';
import { CifradorAesGcm } from '../src/infraestructura/cifrado/cifrador-aes-gcm.js';
import type { AtlassianDoble } from './atlassian-doble.js';
import { CELULA_C, PERSONAS, SPRINT_1, consultaDuenio, type ClavePersona } from './ayudas.js';
import { LLAVE_PRUEBA } from './ayudas-app.js';
import type { Montaje } from './montaje.js';

export const RUTA = '/v1/integraciones/jira/oauth';
export const sha256 = (texto: string): string => createHash('sha256').update(texto, 'utf8').digest('hex');
export const cifradorPrueba = new CifradorAesGcm(LLAVE_PRUEBA);

export interface FilaConexion {
  estado: string;
  cloud_id: string | null;
  sitio_url: string | null;
  sitio_nombre: string | null;
  cuenta_id: string | null;
  cuenta_nombre: string | null;
  sitios_candidatos: unknown;
  scopes_concedidos: string;
  acceso_cifrado: Buffer | null;
  acceso_iv: Buffer | null;
  acceso_tag: Buffer | null;
  renovacion_cifrada: Buffer | null;
  renovacion_iv: Buffer | null;
  renovacion_tag: Buffer | null;
  acceso_expira_en: Date | null;
  renovado_en: Date | null;
  conectado_por_nombre: string;
}

export async function filaConexion(): Promise<FilaConexion | null> {
  const filas = await consultaDuenio<FilaConexion>('SELECT * FROM integraciones.conexion_oauth_jira');
  return filas[0] ?? null;
}

/** El token de acceso y el de renovación en claro, descifrados con la llave de prueba. */
export function tokensGuardados(f: FilaConexion): { acceso: string; renovacion: string } {
  return {
    acceso: cifradorPrueba.descifrarSecreto({ cifrado: Buffer.from(f.acceso_cifrado as Buffer), iv: Buffer.from(f.acceso_iv as Buffer), tag: Buffer.from(f.acceso_tag as Buffer), llaveVersion: 1 }, DATO_ASOCIADO_ACCESO),
    renovacion: cifradorPrueba.descifrarSecreto({ cifrado: Buffer.from(f.renovacion_cifrada as Buffer), iv: Buffer.from(f.renovacion_iv as Buffer), tag: Buffer.from(f.renovacion_tag as Buffer), llaveVersion: 1 }, DATO_ASOCIADO_RENOVACION),
  };
}

export async function eventosOauth(): Promise<Array<{ tipo: string; actor_nombre: string; sitio_nombre: string | null; cuenta_nombre: string | null; codigo: string | null }>> {
  return consultaDuenio('SELECT tipo, actor_nombre, sitio_nombre, cuenta_nombre, codigo FROM integraciones.evento_oauth_jira ORDER BY fecha, id_evento');
}

/** `iniciar` y devuelve el `state` que viaja en la dirección. */
export async function iniciar(m: Montaje, persona: ClavePersona = 'adm1'): Promise<{ respuesta: Response; state: string }> {
  const respuesta = await m.pedir('post', `${RUTA}/iniciar`, persona);
  const url = respuesta.body?.urlAutorizacion as string | undefined;
  return { respuesta, state: url === undefined ? '' : (new URL(url).searchParams.get('state') ?? '') };
}

/** El flujo completo: `iniciar` y `retorno` con un `code` válido del doble. */
export async function conectar(m: Montaje, doble: AtlassianDoble, persona: ClavePersona = 'adm1'): Promise<{ respuesta: Response; state: string; code: string }> {
  const { state } = await iniciar(m, persona);
  const code = doble.emitirCodigo();
  const respuesta = await m.pedir('post', `${RUTA}/retorno`, persona, { state, code });
  return { respuesta, state, code };
}

/** Cuerpo de `PUT configuracion` con `metodo: OAUTH` (destino de CEL-C). */
export function configuracionOauth(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    metodo: 'OAUTH',
    proyecto: 'QTY',
    tiposIssue: ['Story', 'Historia'],
    celulaId: CELULA_C.id,
    qeResponsableId: PERSONAS.qe2.id,
    sprintRespaldoId: SPRINT_1.id,
    ...cambios,
  };
}

/** Todas las tablas de la base como texto, para buscar secretos que no deben estar en ninguna parte. */
export async function volcadoDeTablas(): Promise<string> {
  const partes: string[] = [];
  for (const tabla of ['conexion_oauth_jira', 'oauth_estado_jira', 'evento_oauth_jira', 'configuracion_jira', 'evento_configuracion', 'ejecucion_integracion', 'detalle_ejecucion']) {
    const filas = await consultaDuenio<Record<string, unknown>>(`SELECT * FROM integraciones.${tabla}`);
    partes.push(JSON.stringify(filas, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
    // Los bytea salen como Buffer; se agregan también en latin1 y hex para encontrar subcadenas en claro.
    for (const fila of filas) for (const v of Object.values(fila)) if (v instanceof Uint8Array) partes.push(Buffer.from(v).toString("latin1"), Buffer.from(v).toString("hex"), Buffer.from(v).toString("base64"));
  }
  return partes.join('\n');
}
