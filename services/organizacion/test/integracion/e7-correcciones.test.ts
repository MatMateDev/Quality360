/**
 * Correcciones de la certificación E7 (DEF-01, DEF-02), contra Postgres y Supabase Auth locales
 * reales. Cada prueba reproduce el defecto observado por QA. DEF-09 (Líder desactivado) se retiró
 * con el rol Líder QA (D208).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { autorizacion, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';
import { crearFixtureE7, type FixtureE7 } from '../fixture-e7.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cuerpo = any;

let app: NestExpressApplication;
let f: FixtureE7;

const http = (): ReturnType<typeof request> => request(app.getHttpServer());
const como = (usuario: UsuarioDePrueba) => ({ authorization: autorizacion(usuario.token) });
const INEXISTENTE = '00000000-0000-4000-8000-0000000000aa';

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  f = await crearFixtureE7();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

/** Todos los valores de las claves `sprint` anidadas en una respuesta. */
function sprintsDe(valor: unknown, acumulado: unknown[] = []): unknown[] {
  if (Array.isArray(valor)) valor.forEach((elemento) => sprintsDe(elemento, acumulado));
  else if (valor !== null && typeof valor === 'object') {
    for (const [clave, hijo] of Object.entries(valor)) {
      if (clave === 'sprint') acumulado.push(hijo);
      else sprintsDe(hijo, acumulado);
    }
  }
  return acumulado;
}

function exigirSprintDeContrato(cuerpo: unknown): void {
  const sprints = sprintsDe(cuerpo);
  assert.ok(sprints.length > 0, 'la respuesta debe traer al menos un sprint');
  for (const sprint of sprints) {
    assert.deepEqual(Object.keys(sprint as object).sort(), ['id', 'nombre'], 'sprint es CatalogoRef: sin inicio ni fin (comun.v1.yaml)');
  }
}

describe('DEF-01 · el sprint de las respuestas de HDU es un CatalogoRef', () => {
  it('GET /v1/hdu, las bandejas y PUT /v1/hdu/{id}/qe-responsable no devuelven inicio ni fin', async () => {
    exigirSprintDeContrato((await http().get('/v1/hdu').set(como(f.qe1)).expect(200)).body);
    exigirSprintDeContrato((await http().get('/v1/bandeja/qe').set(como(f.qe1)).expect(200)).body);
    exigirSprintDeContrato((await http().get('/v1/bandeja/analista').set(como(f.ana1)).expect(200)).body);
    exigirSprintDeContrato((await http().get('/v1/bandeja/auditor').set(como(f.aud1)).expect(200)).body);
    const reasignada = await http().put(`/v1/hdu/${f.h.H5.id}/qe-responsable`).set(como(f.adm1)).send({ qeResponsableId: f.qe2.id, motivo: 'Balanceo de carga' }).expect(200);
    exigirSprintDeContrato(reasignada.body);
  });
});

describe('DEF-02 · consulta de HDU en lote para el Auditor', () => {
  it('el Auditor (ámbito todas) recibe las HDU que existen y se omiten las que Organización no conoce', async () => {
    const respuesta = await http().post('/v1/interno/hdu/consulta').set(como(f.aud1)).send({ hduIds: [f.h.H4.id, INEXISTENTE, f.h.H8.id] }).expect(200);
    assert.deepEqual(respuesta.body.items.map((hdu: Cuerpo) => hdu.id), [f.h.H4.id, f.h.H8.id]);
  });

  it('el Administrador también (ámbito todas); una lista solo de ids desconocidos da items vacío', async () => {
    const respuesta = await http().post('/v1/interno/hdu/consulta').set(como(f.adm1)).send({ hduIds: [INEXISTENTE] }).expect(200);
    assert.deepEqual(respuesta.body.items, []);
  });

  it('ámbito restringido: un id inexistente o ajeno sigue dando 403 completo, sin datos parciales', async () => {
    for (const usuario of [f.qe1, f.ana1]) {
      const respuesta = await http().post('/v1/interno/hdu/consulta').set(como(usuario)).send({ hduIds: [f.h.H1.id, INEXISTENTE] });
      assert.equal(respuesta.status, 403, usuario.nombre);
      assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
      assert.equal('items' in respuesta.body, false);
    }
  });
});
