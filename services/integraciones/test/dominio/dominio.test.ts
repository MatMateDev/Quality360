/**
 * Unitarias del dominio y del cifrado de Integraciones (E5). Sin base de datos ni red.
 * E5-B01-T01 (cifrado) y T04 (llave distinta), D94/D128, D96/D114 (presupuesto), D103 (resultado), D117 (sugerencias).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DATO_ASOCIADO_TOKEN, CifradorAesGcm } from '../../src/infraestructura/cifrado/cifrador-aes-gcm.js';
import { errorIntegracion, mensajeDeError, mensajeDeFila, sugerenciasDe } from '../../src/dominio/catalogos.js';
import { MARGEN_MINIMO_MS, Presupuesto, contadoresDeDetalle, estaAbandonada, resultadoFinal, sumarFila, unirAdvertencias } from '../../src/dominio/ejecucion.js';
import { diaSiguiente, inicioDeDiaSantiago } from '../../src/dominio/fechas.js';
import { LlaveCifradoNoDisponible, TokenNoDescifrable } from '../../src/dominio/errores.js';
import { contadoresVacios } from '../../src/dominio/tipos.js';

const LLAVE_A = Buffer.alloc(32, 1);
const LLAVE_B = Buffer.alloc(32, 2);
const TOKEN = 'q360-token-valido-AB12';

describe('E5-B01 · cifrado AES-256-GCM del token (D94)', () => {
  it('cifra con IV de 12 bytes, etiqueta de 16, y no contiene el token ni su Base64', () => {
    const cifrador = new CifradorAesGcm(LLAVE_A);
    const t = cifrador.cifrar(TOKEN);
    assert.equal(t.iv.length, 12);
    assert.equal(t.tag.length, 16);
    assert.equal(t.llaveVersion, 1);
    assert.equal(t.ultimos4, 'AB12');
    assert.equal(t.cifrado.includes(Buffer.from(TOKEN)), false);
    assert.equal(t.cifrado.toString('base64').includes(Buffer.from(TOKEN).toString('base64')), false);
  });

  it('descifra con la misma llave', () => {
    const cifrador = new CifradorAesGcm(LLAVE_A);
    assert.equal(cifrador.descifrar(cifrador.cifrar(TOKEN)), TOKEN);
  });

  it('un IV nuevo en cada cifrado: dos cifrados del mismo token son distintos', () => {
    const cifrador = new CifradorAesGcm(LLAVE_A);
    const uno = cifrador.cifrar(TOKEN);
    const dos = cifrador.cifrar(TOKEN);
    assert.notDeepEqual(uno.iv, dos.iv);
    assert.notDeepEqual(uno.cifrado, dos.cifrado);
  });

  it('con otra llave lanza TOKEN_NO_DESCIFRABLE, y con una etiqueta alterada también', () => {
    const t = new CifradorAesGcm(LLAVE_A).cifrar(TOKEN);
    assert.throws(() => new CifradorAesGcm(LLAVE_B).descifrar(t), TokenNoDescifrable);
    const alterada = { ...t, tag: Buffer.alloc(16, 9) };
    assert.throws(() => new CifradorAesGcm(LLAVE_A).descifrar(alterada), TokenNoDescifrable);
  });

  it('el dato asociado es parte de la autenticación: sin él no descifra', async () => {
    const { createDecipheriv } = await import('node:crypto');
    const t = new CifradorAesGcm(LLAVE_A).cifrar(TOKEN);
    const descifrador = createDecipheriv('aes-256-gcm', LLAVE_A, t.iv, { authTagLength: 16 });
    descifrador.setAuthTag(t.tag);
    descifrador.update(t.cifrado);
    assert.throws(() => descifrador.final());
    assert.equal(DATO_ASOCIADO_TOKEN, 'q360:jira:token:v1');
  });

  it('sin llave (o con una de otro tamaño) cifrar y descifrar lanzan LLAVE_CIFRADO_NO_DISPONIBLE, y disponible es false (D128)', () => {
    for (const cifrador of [new CifradorAesGcm(null), new CifradorAesGcm(Buffer.alloc(16))]) {
      assert.equal(cifrador.disponible, false);
      assert.throws(() => cifrador.cifrar(TOKEN), LlaveCifradoNoDisponible);
      assert.throws(() => cifrador.descifrar({ cifrado: Buffer.alloc(1), iv: Buffer.alloc(12), tag: Buffer.alloc(16), ultimos4: 'AB12', llaveVersion: 1 }), LlaveCifradoNoDisponible);
    }
    assert.equal(new CifradorAesGcm(LLAVE_A).disponible, true);
  });

  it('los errores no contienen el token ni la llave y la entidad cifrada serializada no encuentra el token', () => {
    const t = new CifradorAesGcm(LLAVE_A).cifrar(TOKEN);
    const serializado = JSON.stringify({ cifrado: t.cifrado, iv: t.iv, tag: t.tag, ultimos4: t.ultimos4 });
    assert.equal(serializado.includes(TOKEN), false);
    assert.equal(serializado.includes(Buffer.from(TOKEN).toString('base64')), false);
    try {
      new CifradorAesGcm(LLAVE_B).descifrar(t);
    } catch (error) {
      const texto = `${(error as Error).message} ${(error as Error).stack}`;
      assert.equal(texto.includes(TOKEN), false);
      assert.equal(texto.includes(LLAVE_B.toString('base64')), false);
    }
  });
});

describe('E5 · catálogos fijos (D105, D117)', () => {
  it('cada error trae su mensaje fijo y la acción principal primero', () => {
    assert.equal(mensajeDeError('JIRA_CREDENCIAL_INVALIDA'), 'Jira rechazó el correo o el API token. Revisa la conexión.');
    assert.deepEqual(sugerenciasDe('JIRA_CREDENCIAL_INVALIDA', 'JIRA', false), ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO']);
    assert.deepEqual(sugerenciasDe('JIRA_SIN_PERMISO', 'JIRA', false), ['REVISAR_PERMISOS', 'IMPORTAR_ARCHIVO']);
    assert.deepEqual(sugerenciasDe('JIRA_SITIO_NO_ENCONTRADO', 'JIRA', false), ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO']);
    assert.deepEqual(sugerenciasDe('JIRA_TIEMPO_AGOTADO', 'JIRA', false), ['REINTENTAR', 'IMPORTAR_ARCHIVO']);
    assert.deepEqual(sugerenciasDe('JIRA_NO_DISPONIBLE', 'JIRA', false), ['REINTENTAR', 'IMPORTAR_ARCHIVO']);
    assert.deepEqual(sugerenciasDe('MODO_ESTRICTO', 'CSV', false), ['CORREGIR_ARCHIVO']);
  });

  it('el límite de tasa sugiere CONTINUAR solo si hay desde dónde continuar, si no REINTENTAR', () => {
    assert.deepEqual(sugerenciasDe('JIRA_LIMITE_DE_TASA', 'JIRA', true), ['CONTINUAR', 'IMPORTAR_ARCHIVO']);
    assert.deepEqual(sugerenciasDe('JIRA_LIMITE_DE_TASA', 'JIRA', false), ['REINTENTAR', 'IMPORTAR_ARCHIVO']);
  });

  it('ORGANIZACION_NO_DISPONIBLE nunca sugiere importar un archivo (D117)', () => {
    assert.deepEqual(sugerenciasDe('ORGANIZACION_NO_DISPONIBLE', 'JIRA', false), ['REINTENTAR']);
    assert.deepEqual(sugerenciasDe('ORGANIZACION_NO_DISPONIBLE', 'CSV', false), ['IMPORTAR_MISMO_ARCHIVO']);
    assert.deepEqual(sugerenciasDe('PRESUPUESTO_DE_TIEMPO', 'JIRA', true), ['CONTINUAR']);
    assert.deepEqual(sugerenciasDe('PRESUPUESTO_DE_TIEMPO', 'JSON', false), ['IMPORTAR_MISMO_ARCHIVO']);
    for (const origen of ['JIRA', 'CSV', 'JSON'] as const) assert.equal(sugerenciasDe('ORGANIZACION_NO_DISPONIBLE', origen, true).includes('IMPORTAR_ARCHIVO'), false);
  });

  it('errorIntegracion arma código, mensaje y sugerencias; los mensajes de fila son los de la sección 4.2', () => {
    assert.deepEqual(errorIntegracion('JIRA_NO_DISPONIBLE', 'JIRA'), { codigo: 'JIRA_NO_DISPONIBLE', mensaje: 'Jira no está disponible por ahora.', sugerencias: ['REINTENTAR', 'IMPORTAR_ARCHIVO'] });
    assert.equal(mensajeDeFila('SIN_CAMBIOS'), 'Sin cambios');
    assert.equal(mensajeDeFila('HDU_MANUAL_EXISTENTE'), 'Ya existe una HDU creada a mano con este código');
    assert.equal(mensajeDeFila('SPRINT_REQUERIDO'), 'Indica un sprint de esa célula');
  });
});

describe('E5 · presupuesto de tiempo (D114)', () => {
  it('descuenta el tiempo transcurrido y acota cada llamada por lo que queda', () => {
    let ahora = 1_000;
    const presupuesto = new Presupuesto(8000, () => ahora);
    assert.equal(presupuesto.restanteMs(), 8000);
    assert.equal(presupuesto.limiteDe(3000), 3000);
    ahora += 6_000;
    assert.equal(presupuesto.restanteMs(), 2000);
    assert.equal(presupuesto.limiteDe(3000), 2000);
    assert.equal(presupuesto.alcanza(), true);
  });

  it('con menos de 1 s no se inicia otra llamada', () => {
    let ahora = 0;
    const presupuesto = new Presupuesto(8000, () => ahora);
    ahora = 8000 - MARGEN_MINIMO_MS + 1;
    assert.equal(presupuesto.alcanza(), false);
    ahora = 9_000;
    assert.equal(presupuesto.restanteMs(), 0);
    assert.equal(presupuesto.limiteDe(3000), 1);
  });
});

describe('E5 · resultado y contadores (D103, D121)', () => {
  it('EXITOSA, CON_ERRORES, INCOMPLETA y FALLIDA', () => {
    assert.equal(resultadoFinal({ leidas: 10, conError: 0, interrupcion: null, hayMas: false }), 'EXITOSA');
    assert.equal(resultadoFinal({ leidas: 0, conError: 0, interrupcion: null, hayMas: false }), 'EXITOSA');
    assert.equal(resultadoFinal({ leidas: 11, conError: 1, interrupcion: null, hayMas: false }), 'CON_ERRORES');
    assert.equal(resultadoFinal({ leidas: 100, conError: 0, interrupcion: null, hayMas: true }), 'INCOMPLETA');
    assert.equal(resultadoFinal({ leidas: 50, conError: 0, interrupcion: 'JIRA_LIMITE_DE_TASA', hayMas: true }), 'INCOMPLETA');
    assert.equal(resultadoFinal({ leidas: 0, conError: 0, interrupcion: 'JIRA_TIEMPO_AGOTADO', hayMas: false }), 'FALLIDA');
  });

  it('los contadores salen del detalle y su suma es igual a las leídas', () => {
    const detalle = [
      { resultado: 'CREADA' as const, advertencias: ['PRIORIDAD_AUSENTE' as const] },
      { resultado: 'CREADA' as const, advertencias: [] },
      { resultado: 'ACTUALIZADA' as const, advertencias: [] },
      { resultado: 'OMITIDA' as const, advertencias: [] },
      { resultado: 'ERROR' as const, advertencias: ['TITULO_TRUNCADO' as const, 'PRIORIDAD_DESCONOCIDA' as const] },
    ];
    const c = contadoresDeDetalle(detalle);
    assert.deepEqual(c, { leidas: 5, creadas: 2, actualizadas: 1, omitidas: 1, conError: 1, conAdvertencias: 2 });
    assert.equal(c.creadas + c.actualizadas + c.omitidas + c.conError, c.leidas);
    const acumulado = contadoresVacios();
    for (const fila of detalle) sumarFila(acumulado, fila);
    assert.deepEqual(acumulado, c);
  });

  it('una ejecución EN_CURSO de más de 5 minutos está abandonada (D104)', () => {
    const ahora = new Date('2026-10-30T12:00:00Z');
    assert.equal(estaAbandonada(new Date('2026-10-30T11:54:00Z'), ahora, 300_000), true);
    assert.equal(estaAbandonada(new Date('2026-10-30T11:56:00Z'), ahora, 300_000), false);
  });

  it('unirAdvertencias conserva el orden y no repite', () => {
    assert.deepEqual(unirAdvertencias(['PRIORIDAD_AUSENTE', 'TITULO_TRUNCADO'], ['TITULO_TRUNCADO', 'SPRINT_NO_ENCONTRADO']), ['PRIORIDAD_AUSENTE', 'TITULO_TRUNCADO', 'SPRINT_NO_ENCONTRADO']);
  });
});

describe('E5 · fechas de Chile para los filtros del historial (inclusivos)', () => {
  it('el día empieza a las 00:00 de Santiago (UTC-3 en verano, UTC-4 en invierno)', () => {
    assert.equal(inicioDeDiaSantiago('2026-01-15').toISOString(), '2026-01-15T03:00:00.000Z');
    assert.equal(inicioDeDiaSantiago('2026-07-15').toISOString(), '2026-07-15T04:00:00.000Z');
  });

  it('el día siguiente cruza el fin de mes y de año', () => {
    assert.equal(diaSiguiente('2026-10-31'), '2026-11-01');
    assert.equal(diaSiguiente('2026-12-31'), '2027-01-01');
  });
});
