/** E4-B03 · Riesgo sugerido y nivel fijado. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '#prisma';

import { PERSONAS, haceDias, hoyMas, iniciarFalsos, type Falsos } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';
import { cargar, como, crearFixture, type FixtureE4 } from '../fixture-e4.js';

let falsos: Falsos;
let app: NestExpressApplication;
let f: FixtureE4;
const prisma = new PrismaClient();

before(async () => {
  falsos = await iniciarFalsos();
  app = await crearAppDePrueba(falsos.organizacionUrl, { certificacionesUrl: falsos.certificacionesUrl });
  f = await crearFixture(app, falsos);
});

after(async () => {
  await app.close();
  await falsos.cerrar();
  await prisma.$disconnect();
});

const riesgo = (persona: Parameters<typeof como>[1], hduId: string) => como(app, persona, 'get', `/v1/hdu/${hduId}/riesgo`);
const codigos = (cuerpo: { factores: Array<{ codigo: string }> }) => cuerpo.factores.map((x) => x.codigo).sort();

describe('E4-B03 · riesgo', () => {
  it('[E4-B03#1] T01: H3 sugiere MEDIO por el impedimento abierto', async () => {
    const r = await riesgo('qe2', f.h.H3.id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.nivelSugerido, codigos(r.body), r.body.nivelVigente, r.body.origen, r.body.estado], ['MEDIO', ['IMPEDIMENTO_ABIERTO'], 'MEDIO', 'SUGERIDO', 'ok']);
  });

  it('[E4-B03#1] T02: H1 sugiere ALTO con el impedimento antiguo y el atraso del sprint', async () => {
    const r = await riesgo('qe1', f.h.H1.id);
    assert.equal(r.body.nivelSugerido, 'ALTO');
    assert.deepEqual(codigos(r.body), ['ATRASO_SPRINT_ALTO', 'IMPEDIMENTO_ABIERTO', 'IMPEDIMENTO_ANTIGUO']);
    const antiguo = r.body.factores.find((x: { codigo: string }) => x.codigo === 'IMPEDIMENTO_ANTIGUO');
    assert.deepEqual([antiguo.detalle.diasAbierto, antiguo.detalle.umbralDias, antiguo.detalle.impedimentoId], [6, 5, f.i.I2]);
    const atraso = r.body.factores.find((x: { codigo: string }) => x.codigo === 'ATRASO_SPRINT_ALTO');
    assert.deepEqual([atraso.detalle.diasRestantes, atraso.detalle.avance, atraso.detalle.umbralAvance], [2, 30, 70]);
    assert.equal(atraso.detalle.sprint.nombre, 'SP-PROX');
    assert.equal(r.body.factores[0].nivel, 'ALTO', 'del nivel más alto al más bajo');
  });

  it('[E4-B03#2] T03: H2 MEDIO por atraso, H5 ALTO por sprint vencido y H6 fijado en MEDIO con sugerido ALTO', async () => {
    const h2 = await riesgo('qe1', f.h.H2.id);
    assert.deepEqual([h2.body.nivelSugerido, codigos(h2.body)], ['MEDIO', ['ATRASO_SPRINT_MEDIO']]);
    assert.deepEqual([h2.body.factores[0].detalle.diasRestantes, h2.body.factores[0].detalle.avance], [6, 10]);
    const h5 = await riesgo('qe1', f.h.H5.id);
    assert.deepEqual([h5.body.nivelSugerido, codigos(h5.body), h5.body.factores[0].detalle.diasRestantes], ['ALTO', ['SPRINT_VENCIDO'], -3]);
    const h6 = await riesgo('qe1', f.h.H6.id);
    assert.deepEqual([h6.body.nivelSugerido, h6.body.nivelVigente, h6.body.origen, h6.body.sugerenciaDistinta], ['ALTO', 'MEDIO', 'MANUAL', true]);
    assert.ok(codigos(h6.body).includes('IMPEDIMENTO_ESCALADO'));
    assert.equal(h6.body.fijado.actor.id, PERSONAS.qe1.id);
  });

  it('[E4-B03#2] T04: H8 y H4 son BAJO sin factores y H7 cerrada no tiene sugerencia', async () => {
    for (const [persona, h] of [['qe1', f.h.H8], ['qe2', f.h.H4]] as const) {
      const r = await riesgo(persona, h.id);
      assert.deepEqual([r.body.nivelSugerido, r.body.factores], ['BAJO', []]);
    }
    const h7 = await riesgo('qe2', f.h.H7.id);
    assert.deepEqual([h7.body.nivelSugerido, h7.body.motivoSinSugerencia, h7.body.nivelVigente, h7.body.hduCerrada, h7.body.permisos.puedeFijarRiesgo], [null, 'HDU_CERRADA', null, true, false]);
  });

  it('[E4-B03#1] T05: un impedimento nuevo en H8 sugiere MEDIO exacto', async () => {
    const i = await como(app, 'qe1', 'post', `/v1/hdu/${f.h.H8.id}/impedimentos`, { tipo: 'RECURSOS', titulo: 'Nuevo en H8', descripcion: 'Descripción suficiente.', responsableId: PERSONAS.qe1.id });
    assert.equal(i.status, 201);
    const r = await riesgo('qe1', f.h.H8.id);
    assert.deepEqual([r.body.nivelSugerido, codigos(r.body)], ['MEDIO', ['IMPEDIMENTO_ABIERTO']]);
    await como(app, 'qe1', 'post', `/v1/impedimentos/${i.body.id}/resolver`, { comentario: 'Limpieza del caso' });
  });

  it('[E4-B03#1] T06: al resolver I2 y I1 baja el riesgo', async () => {
    assert.equal((await como(app, 'qe1', 'post', `/v1/impedimentos/${f.i.I2}/resolver`, { comentario: 'Cuentas listas' })).status, 200);
    const h1 = await riesgo('qe1', f.h.H1.id);
    assert.deepEqual([h1.body.nivelSugerido, codigos(h1.body)], ['ALTO', ['ATRASO_SPRINT_ALTO']]);
    assert.equal((await como(app, 'qe2', 'post', `/v1/impedimentos/${f.i.I1}/resolver`, { comentario: 'Ambiente arriba' })).status, 200);
    const h3 = await riesgo('qe2', f.h.H3.id);
    assert.deepEqual([h3.body.nivelSugerido, h3.body.factores], ['BAJO', []]);
  });

  it('[E4-B03#3] T07: fijar BAJO prevalece sobre el sugerido y guarda la sugerencia del momento', async () => {
    const put = await como(app, 'qe1', 'put', `/v1/hdu/${f.h.H1.id}/riesgo`, { nivel: 'BAJO', justificacion: 'Se acordó con el PO ampliar el sprint' });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal(put.body.cambio, true);
    const r = await riesgo('qe1', f.h.H1.id);
    assert.deepEqual([r.body.nivelVigente, r.body.origen, r.body.nivelSugerido, r.body.fijado.sugeridoAlFijar, r.body.fijado.nivelAnterior], ['BAJO', 'MANUAL', 'ALTO', 'ALTO', null]);
    assert.equal(r.body.fijado.justificacion, 'Se acordó con el PO ampliar el sprint');
    assert.equal(r.body.fijado.actor.nombre, PERSONAS.qe1.nombre);
    // Repetir el mismo nivel con la misma justificación no agrega filas.
    const igual = await como(app, 'qe1', 'put', `/v1/hdu/${f.h.H1.id}/riesgo`, { nivel: 'BAJO', justificacion: 'Se acordó con el PO ampliar el sprint' });
    assert.equal(igual.body.cambio, false);
    assert.equal(await prisma.riesgoHdu.count({ where: { historiaId: f.h.H1.id } }), 1);
  });

  it('[E4-B03#3] T08: nivel, justificación ausente o larga dan 400; en blanco, 422; sin filas nuevas', async () => {
    const antes = await prisma.riesgoHdu.count({ where: { historiaId: f.h.H2.id } });
    for (const cuerpo of [{ nivel: 'CRITICO', justificacion: 'Texto válido' }, { nivel: 'ALTO' }, { nivel: 'ALTO', justificacion: 'x'.repeat(501) }]) {
      const r = await como(app, 'qe1', 'put', `/v1/hdu/${f.h.H2.id}/riesgo`, cuerpo);
      assert.equal(r.status, 400, JSON.stringify(cuerpo));
    }
    const enBlanco = await como(app, 'qe1', 'put', `/v1/hdu/${f.h.H2.id}/riesgo`, { nivel: 'ALTO', justificacion: '   ' });
    assert.equal(enBlanco.status, 422);
    assert.equal(enBlanco.body.codigo, 'JUSTIFICACION_REQUERIDA');
    assert.equal(await prisma.riesgoHdu.count({ where: { historiaId: f.h.H2.id } }), antes);
  });

  it('[E4-B03#3] T09: PUT 403 para todos menos el QE responsable; GET 403 al QE ajeno y al analista; 200 al resto', async () => {
    const cuerpo = { nivel: 'ALTO', justificacion: 'Intento no autorizado' };
    for (const persona of ['qe2', 'ana1', 'lid1', 'aud1', 'adm1'] as const) {
      assert.equal((await como(app, persona, 'put', `/v1/hdu/${f.h.H6.id}/riesgo`, cuerpo)).status, 403, persona);
    }
    assert.equal((await riesgo('qe2', f.h.H6.id)).status, 403);
    assert.equal((await riesgo('ana1', f.h.H6.id)).status, 403);
    for (const persona of ['lid1', 'aud1', 'adm1'] as const) {
      const r = await riesgo(persona, f.h.H6.id);
      assert.equal(r.status, 200, persona);
      assert.equal(r.body.permisos.puedeFijarRiesgo, false);
    }
    assert.equal((await riesgo(null, f.h.H6.id)).status, 401);
    assert.equal((await como(app, null, 'put', `/v1/hdu/${f.h.H6.id}/riesgo`, cuerpo)).status, 401);
  });

  it('[E4-B03#3] T10: fijar el riesgo de una HDU cerrada da 409 HDU_CERRADA', async () => {
    const r = await como(app, 'qe2', 'put', `/v1/hdu/${f.h.H7.id}/riesgo`, { nivel: 'ALTO', justificacion: 'Sobre una HDU cerrada' });
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'HDU_CERRADA');
  });

  it('[E4-B03#2] T11: con Q360_FECHA_REFERENCIA el cálculo usa esa fecha', async () => {
    for (const [desplazamiento, esperado] of [[3, ['ALTO', 3, 'ATRASO_SPRINT_ALTO']], [-1, ['MEDIO', 7, 'ATRASO_SPRINT_MEDIO']], [-2, ['BAJO', 8, null]]] as const) {
      const fecha = hoyMas(desplazamiento);
      const otra = await crearAppDePrueba(falsos.organizacionUrl, { certificacionesUrl: falsos.certificacionesUrl, fechaReferencia: fecha });
      try {
        const r = await como(otra, 'qe1', 'get', `/v1/hdu/${f.h.H2.id}/riesgo`);
        const factor = r.body.factores[0] as { codigo: string; detalle: { diasRestantes: number } } | undefined;
        assert.deepEqual([r.body.nivelSugerido, factor?.detalle.diasRestantes ?? 8, factor?.codigo ?? null], esperado);
        assert.equal(r.body.fechaReferencia, fecha);
        if (desplazamiento === 3) {
          const h6 = await como(otra, 'qe1', 'get', `/v1/hdu/${f.h.H6.id}/riesgo`);
          assert.ok(codigos(h6.body).includes('SPRINT_VENCIDO'));
        }
      } finally {
        await otra.close();
      }
    }
  });

  it('[E4-B03#2] T12: con Certificaciones caída nunca se informa BAJO', async () => {
    falsos.certificacionesCaida = true;
    try {
      const h5 = await riesgo('qe1', f.h.H5.id);
      assert.equal(h5.body.nivelSugerido, 'ALTO', 'SPRINT_VENCIDO no necesita el avance (D90)');
      const h8 = await riesgo('qe1', f.h.H8.id);
      assert.equal(h8.status, 200);
      assert.deepEqual([h8.body.nivelSugerido, h8.body.estado, h8.body.motivoSinSugerencia, h8.body.factoresNoEvaluados], [null, 'indisponible', 'FUENTE_NO_DISPONIBLE', ['ATRASO_SPRINT_ALTO', 'ATRASO_SPRINT_MEDIO']]);
      const h6 = await riesgo('qe1', f.h.H6.id);
      assert.deepEqual([h6.body.nivelVigente, h6.body.origen], ['MEDIO', 'MANUAL']);
      // ALTO parcial: un impedimento antiguo ya alcanza ALTO sin el avance.
      const h = falsos.nuevaHdu({ qeResponsable: 'qe1', analista: 'ana1', sprintFin: hoyMas(2) });
      await cargar(app, 'impedimentos', {
        hduId: h.id,
        tipo: 'AMBIENTE',
        titulo: 'Impedimento antiguo',
        descripcion: 'Impedimento antiguo de la prueba.',
        responsableInicial: { id: PERSONAS.qe1.id, nombre: PERSONAS.qe1.nombre },
        creadoPor: { id: PERSONAS.ana1.id, nombre: PERSONAS.ana1.nombre, rol: 'ANALISTA_QA' },
        acciones: [{ tipo: 'REGISTRAR', estado: 'ABIERTO', actor: { id: PERSONAS.ana1.id, nombre: PERSONAS.ana1.nombre, rol: 'ANALISTA_QA' }, fecha: haceDias(6).toISOString(), comentario: 'Registro del impedimento' }],
      });
      const parcial = await riesgo('qe1', h.id);
      assert.deepEqual([parcial.body.nivelSugerido, parcial.body.calculoParcial, parcial.body.estado], ['ALTO', true, 'ok']);
    } finally {
      falsos.certificacionesCaida = false;
    }
  });
});
