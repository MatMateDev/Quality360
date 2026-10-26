/** Fixture de la sección 7 del backlog E4: H1–H8, I1–I5 y el riesgo fijado de H6, con ids nuevos en cada llamada. */
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  CELULA_A,
  CELULA_B,
  CELULA_C,
  PERSONAS,
  TOKEN_SERVICIO,
  haceDias,
  hoyMas,
  tokenDe,
  type ClavePersona,
  type Falsos,
  type HduFalsa,
} from './ayudas.js';

export interface FixtureE4 {
  h: Record<'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8', HduFalsa>;
  i: Record<'I1' | 'I2' | 'I3' | 'I4' | 'I5', string>;
}

const rol = (clave: ClavePersona) => ({ id: PERSONAS[clave].id, nombre: PERSONAS[clave].nombre, rol: PERSONAS[clave].rol });
const resp = (clave: ClavePersona) => ({ id: PERSONAS[clave].id, nombre: PERSONAS[clave].nombre });

export async function cargar(app: NestExpressApplication, ruta: string, cuerpo: object): Promise<string> {
  const respuesta = await request(app.getHttpServer()).post(`/v1/interno/carga/${ruta}`).set('x-q360-servicio-token', TOKEN_SERVICIO).send(cuerpo);
  if (respuesta.status !== 201 && respuesta.status !== 200) throw new Error(`carga ${ruta}: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  return (respuesta.body as { id: string }).id;
}

export async function crearFixture(app: NestExpressApplication, falsos: Falsos): Promise<FixtureE4> {
  const sp = (nombre: string) => ({ id: randomUUID(), nombre });
  const h = {
    H1: falsos.nuevaHdu({ qeResponsable: 'qe1', analista: 'ana1', celula: CELULA_A, sprint: sp('SP-PROX'), sprintFin: hoyMas(2), avance: 30, certificacionId: randomUUID() }),
    H2: falsos.nuevaHdu({ qeResponsable: 'qe1', analista: 'ana2', celula: CELULA_A, sprint: sp('SP-MED'), sprintFin: hoyMas(6), avance: 10 }),
    H3: falsos.nuevaHdu({ qeResponsable: 'qe2', analista: 'ana3', celula: CELULA_B, sprint: sp('SP-LEJ'), sprintFin: hoyMas(20), avance: 0 }),
    H4: falsos.nuevaHdu({ qeResponsable: 'qe2', analista: 'ana3', celula: CELULA_C, sprint: sp('SP-LEJ'), sprintFin: hoyMas(20), avance: 0 }),
    H5: falsos.nuevaHdu({ qeResponsable: 'qe1', analista: null, estado: 'PENDIENTE', celula: CELULA_A, sprint: sp('SP-VENC'), sprintFin: hoyMas(-3), avance: 0 }),
    H6: falsos.nuevaHdu({ qeResponsable: 'qe1', analista: 'ana1', celula: CELULA_B, sprint: sp('SP-PROX'), sprintFin: hoyMas(2), avance: 80 }),
    H7: falsos.nuevaHdu({ qeResponsable: 'qe2', analista: 'ana3', estado: 'CERRADA', celula: CELULA_A, sprint: sp('SP-LEJ'), sprintFin: hoyMas(20), avance: 100 }),
    H8: falsos.nuevaHdu({ qeResponsable: 'qe1', analista: 'ana1', estado: 'PENDIENTE_CIERRE', celula: CELULA_C, sprint: sp('SP-LEJ'), sprintFin: hoyMas(20), avance: 100 }),
  };
  const base = (hdu: HduFalsa, tipo: string, titulo: string, creador: ClavePersona, inicial: ClavePersona) => ({
    hduId: hdu.id,
    tipo,
    titulo,
    descripcion: 'Descripción de prueba del impedimento del fixture.',
    responsableInicial: resp(inicial),
    creadoPor: rol(creador),
  });
  const accion = (tipo: string, anterior: string | null, estado: string, actor: ClavePersona, fecha: Date, comentario: string, extra: object = {}) => ({
    tipo,
    ...(anterior === null ? {} : { estadoAnterior: anterior }),
    estado,
    actor: rol(actor),
    fecha: fecha.toISOString(),
    comentario,
    ...extra,
  });
  const R = 'Registro del impedimento';
  const i = {
    I1: await cargar(app, 'impedimentos', { ...base(h.H3, 'AMBIENTE', 'Ambiente QA no responde', 'ana3', 'qe2'), acciones: [accion('REGISTRAR', null, 'ABIERTO', 'ana3', haceDias(0, 2), R)] }),
    I2: await cargar(app, 'impedimentos', {
      ...base(h.H1, 'DATOS_PRUEBA', 'Faltan cuentas de prueba con saldo', 'ana1', 'qe1'),
      certificacionId: h.H1.certificacionId,
      acciones: [accion('REGISTRAR', null, 'ABIERTO', 'ana1', haceDias(6), R)],
    }),
    I3: await cargar(app, 'impedimentos', {
      ...base(h.H6, 'DEPENDENCIA', 'API de Pagos sin sandbox', 'ana1', 'qe1'),
      acciones: [
        accion('REGISTRAR', null, 'ABIERTO', 'ana1', haceDias(3), R),
        accion('ESCALAR', 'ABIERTO', 'ESCALADO', 'qe1', haceDias(1), 'Se escala al Líder', { responsableNuevo: resp('lid1') }),
      ],
    }),
    I4: await cargar(app, 'impedimentos', {
      ...base(h.H2, 'REQUISITOS', 'Criterio de aceptación ambiguo', 'ana2', 'qe1'),
      acciones: [accion('REGISTRAR', null, 'ABIERTO', 'ana2', haceDias(5), R), accion('RESOLVER', 'ABIERTO', 'RESUELTO', 'qe1', haceDias(2), 'Se aclaró el criterio con el PO')],
    }),
    I5: await cargar(app, 'impedimentos', {
      ...base(h.H7, 'ACCESO', 'Permisos de la herramienta de pruebas', 'ana3', 'qe2'),
      acciones: [accion('REGISTRAR', null, 'ABIERTO', 'ana3', haceDias(20), R), accion('RESOLVER', 'ABIERTO', 'RESUELTO', 'qe2', haceDias(15), 'Permisos otorgados')],
    }),
  };
  await cargar(app, 'riesgo', {
    hduId: h.H6.id,
    nivel: 'MEDIO',
    sugeridoAlFijar: 'MEDIO',
    justificacion: 'Dependencia en gestión con el equipo de Pagos',
    actor: rol('qe1'),
    fecha: haceDias(2).toISOString(),
  });
  return { h, i };
}

/** Llamada autenticada como una persona. */
export async function como(app: NestExpressApplication, persona: ClavePersona | null, metodo: 'get' | 'post' | 'put', ruta: string, cuerpo?: object) {
  let peticion = request(app.getHttpServer())[metodo](ruta);
  if (persona !== null) peticion = peticion.set('authorization', `Bearer ${await tokenDe(persona)}`);
  return cuerpo === undefined ? peticion : peticion.send(cuerpo);
}
