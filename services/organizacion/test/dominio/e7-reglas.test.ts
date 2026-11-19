/** Reglas puras de E7: ámbito del Auditor, solo lectura, cambio de rol, bandejas, auditoría y CSV (el Líder QA se retiró, D208). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rangoValido, sanitizarCambios } from '../../src/dominio/reglas/auditoria-usuarios.js';
import { calcularAmbito, evaluarAccesoHdu, filtroAmbitoHdu } from '../../src/dominio/reglas/ambito.js';
import {
  accionesPendientesQe,
  actualizadoEn,
  filtrarFilasOrganizacion,
  ordenarAcciones,
  ordenarFilasHdu,
  ordenDependeDeCertificaciones,
  parsearOrden,
  serializarOrden,
  tamanoEfectivo,
  type FilaHdu,
  type SeguimientoHdu,
} from '../../src/dominio/reglas/bandejas.js';
import { puedeAsignarAnalistaHdu, puedeCambiarEstadoHdu, puedeReasignarQeResponsable } from '../../src/dominio/reglas/permisos-hdu.js';
import { decidirCambioRol, relacionesVacias, type RelacionesUsuario } from '../../src/dominio/reglas/cambio-rol.js';
import { ROLES, esRolSoloLectura } from '../../src/dominio/tipos.js';
import { celdaCsv, generarCsv } from '../../src/infraestructura/csv/generador-csv.js';

const HDU = { qeResponsableId: 'qe-1', analistaId: 'ana-1', celulaId: 'cel-a', estado: 'EN_EJECUCION' as const };
const SIN_AMBITO = { qeSupervisorId: null, analistasSupervisadosIds: [] };

describe('Roles y solo lectura [E7-B02]', () => {
  it('hay 4 roles y solo AUDITOR es de solo lectura (D28, D32, D208)', () => {
    assert.deepEqual([...ROLES], ['ADMINISTRADOR', 'QE', 'ANALISTA_QA', 'AUDITOR']);
    assert.deepEqual(ROLES.filter(esRolSoloLectura), ['AUDITOR']);
  });

  it('el ámbito del Auditor no trae analistas ni supervisor; ya no hay ámbito por células (D208)', () => {
    assert.deepEqual(calcularAmbito('AUDITOR', ['x'], 'y'), { qeSupervisorId: null, analistasSupervisadosIds: [] });
    assert.deepEqual(calcularAmbito('QE', ['a'], null), { qeSupervisorId: null, analistasSupervisadosIds: ['a'] });
  });

  it('el Auditor lee todas (LECTOR_AUDITORIA) y el filtro de ámbito es el que corresponde a cada rol', () => {
    assert.deepEqual(evaluarAccesoHdu('AUDITOR', 'aud', SIN_AMBITO, HDU), { permitido: true, relacion: 'LECTOR_AUDITORIA' });
    assert.deepEqual(filtroAmbitoHdu('AUDITOR', 'aud', SIN_AMBITO), { tipo: 'TODAS' });
  });

  it('el Auditor nunca cambia estado ni asigna; solo el Administrador reasigna el QE (D32, D54)', () => {
    assert.equal(puedeCambiarEstadoHdu('AUDITOR', 'x', SIN_AMBITO, HDU), false);
    assert.equal(puedeAsignarAnalistaHdu('AUDITOR', 'x', HDU), false);
    assert.equal(puedeReasignarQeResponsable('AUDITOR'), false);
    assert.equal(puedeReasignarQeResponsable('ADMINISTRADOR'), true);
    assert.equal(puedeReasignarQeResponsable('QE'), false);
  });
});

describe('Cambio de rol [E7-B01]', () => {
  const con = (cambios: Partial<RelacionesUsuario>): RelacionesUsuario => ({ ...relacionesVacias(), ...cambios });
  const base = { rolActual: 'QE' as const, rolNuevo: 'AUDITOR' as const, administradoresActivos: 2, relaciones: relacionesVacias() };
  const persona = { id: 'a', nombre: 'Ana', correo: 'a@q.local' };

  it('el mismo rol no cambia nada', () => {
    assert.equal(decidirCambioRol({ ...base, rolNuevo: 'QE' }).tipo, 'SIN_CAMBIO');
  });

  it('el último administrador se valida antes que las relaciones (D43)', () => {
    const decision = decidirCambioRol({ ...base, rolActual: 'ADMINISTRADOR', administradoresActivos: 1, relaciones: con({ analistasVigentes: [persona] }) });
    assert.equal(decision.tipo, 'ULTIMO_ADMINISTRADOR');
  });

  it('cualquiera de las 3 relaciones abiertas rechaza el cambio y se devuelven todas (D31, D40)', () => {
    const hdu = { id: 'h', codigo: 'H1', titulo: 't', estado: 'PENDIENTE' as const };
    const casos: Partial<RelacionesUsuario>[] = [
      { analistasVigentes: [persona] },
      { supervisorVigente: persona },
      { hduAbiertas: { total: 1, items: [hdu] } },
    ];
    for (const caso of casos) assert.equal(decidirCambioRol({ ...base, relaciones: con(caso) }).tipo, 'RELACIONES_INCOMPATIBLES');
    const todas = decidirCambioRol({ ...base, relaciones: con({ analistasVigentes: [persona], hduAbiertas: { total: 1, items: [hdu] } }) });
    assert.ok(todas.tipo === 'RELACIONES_INCOMPATIBLES' && todas.relaciones.analistasVigentes.length === 1 && todas.relaciones.hduAbiertas.total === 1);
    assert.equal(decidirCambioRol(base).tipo, 'CAMBIAR');
  });
});

function fila(cambios: Partial<FilaHdu> & { codigo: string }): FilaHdu {
  return {
    id: cambios.codigo,
    titulo: `Historia ${cambios.codigo}`,
    estado: 'EN_EJECUCION',
    prioridad: 'MEDIA',
    celulaId: 'cel-a',
    celulaNombre: 'CEL-A',
    sprintId: 's1',
    sprintNombre: 'Sprint 1',
    sprintInicio: new Date('2026-10-01'),
    qeResponsableId: 'qe-1',
    analistaId: 'ana-1',
    estadoActualizadoEn: new Date('2026-10-10T00:00:00Z'),
    creadoEn: new Date('2026-10-01T00:00:00Z'),
    ultimoCambioAsignacion: null,
    ...cambios,
  };
}

function seguimiento(hduId: string, cambios: Partial<SeguimientoHdu> = {}): SeguimientoHdu {
  return {
    hduId,
    aprobados: 0,
    porcentaje: 0,
    porAprobar: 0,
    observaciones: 0,
    siguienteEntregable: null,
    certificado: null,
    listaParaCertificar: false,
    listaParaCerrar: false,
    porAprobarDesde: null,
    listaDesde: null,
    ultimaActividad: null,
    ...cambios,
  };
}

describe('Bandejas [E7-B03]', () => {
  it('el tamaño de página se recorta a 100 sin error y vale 25 por defecto (D49, E7-B03-T08)', () => {
    assert.equal(tamanoEfectivo(1000), 100);
    assert.equal(tamanoEfectivo(undefined), 25);
    assert.equal(tamanoEfectivo(7), 7);
  });

  it('el orden pedido se valida: columna:asc|desc con una columna conocida', () => {
    assert.deepEqual(parsearOrden('avance:desc'), [{ columna: 'avance', direccion: 'desc' }]);
    assert.equal(parsearOrden('inventada:asc'), null);
    assert.equal(parsearOrden('codigo'), null);
    assert.equal(parsearOrden('codigo:arriba'), null);
    assert.equal(serializarOrden([{ columna: 'celula', direccion: 'asc' }, { columna: 'codigo', direccion: 'asc' }]), 'celula:asc,codigo:asc');
  });

  it('solo el avance y las observaciones dependen de Certificaciones (D46)', () => {
    assert.equal(ordenDependeDeCertificaciones([{ columna: 'avance', direccion: 'desc' }]), true);
    assert.equal(ordenDependeDeCertificaciones([{ columna: 'prioridad', direccion: 'desc' }]), false);
  });

  it('ordena por prioridad (crítica primero) con desempate por código, y por avance con datos de Certificaciones', () => {
    const filas = [fila({ codigo: 'B', prioridad: 'BAJA' }), fila({ codigo: 'A', prioridad: 'CRITICA' }), fila({ codigo: 'C', prioridad: 'CRITICA' })];
    assert.deepEqual(ordenarFilasHdu(filas, [{ columna: 'prioridad', direccion: 'desc' }], new Map()).map((f) => f.codigo), ['A', 'C', 'B']);
    const mapa = new Map([['A', seguimiento('A', { aprobados: 2 })], ['B', seguimiento('B', { aprobados: 9 })]]);
    assert.deepEqual(ordenarFilasHdu(filas, [{ columna: 'avance', direccion: 'desc' }], mapa).map((f) => f.codigo), ['B', 'A', 'C']);
  });

  it('las observadas van primero en la bandeja del analista (observaciones desc)', () => {
    const filas = [fila({ codigo: 'H8' }), fila({ codigo: 'H2' })];
    const mapa = new Map([['H2', seguimiento('H2', { observaciones: 1 })], ['H8', seguimiento('H8', { aprobados: 10 })]]);
    assert.deepEqual(ordenarFilasHdu(filas, [{ columna: 'observaciones', direccion: 'desc' }], mapa).map((f) => f.codigo), ['H2', 'H8']);
  });

  it('filtra por estado, célula, QE, sin analista y búsqueda en código o título, sin distinguir mayúsculas', () => {
    const filas = [fila({ codigo: 'H1' }), fila({ codigo: 'H5', analistaId: null, estado: 'PENDIENTE' }), fila({ codigo: 'H3', celulaId: 'cel-b' })];
    assert.deepEqual(filtrarFilasOrganizacion(filas, { sinAnalista: true }).map((f) => f.codigo), ['H5']);
    assert.deepEqual(filtrarFilasOrganizacion(filas, { celulaId: 'cel-b' }).map((f) => f.codigo), ['H3']);
    assert.deepEqual(filtrarFilasOrganizacion(filas, { estado: 'PENDIENTE' }).map((f) => f.codigo), ['H5']);
    assert.deepEqual(filtrarFilasOrganizacion(filas, { q: 'historia h3' }).map((f) => f.codigo), ['H3']);
    assert.equal(filtrarFilasOrganizacion(filas, { qeId: 'otro' }).length, 0);
  });

  it('la fecha de actualización es la mayor entre el estado, la última asignación y la actividad del checklist', () => {
    const h = fila({ codigo: 'H1', ultimoCambioAsignacion: new Date('2026-10-12T00:00:00Z') });
    assert.equal(actualizadoEn(h, undefined).toISOString(), '2026-10-12T00:00:00.000Z');
    assert.equal(actualizadoEn(h, seguimiento('H1', { ultimaActividad: '2026-10-15T00:00:00Z' })).toISOString(), '2026-10-15T00:00:00.000Z');
  });

  const ahora = new Date('2026-10-20T00:00:00Z');

  it('acciones del QE: aprobar, asignar, certificar y cerrar, con su antigüedad; la HDU cerrada no tiene', () => {
    const aprobar = accionesPendientesQe(fila({ codigo: 'H1' }), seguimiento('H1', { porAprobar: 2, porAprobarDesde: '2026-10-18T00:00:00Z' }), ahora);
    assert.deepEqual(aprobar.map((a) => [a.tipo, a.entregablesPorAprobar, a.antiguedadDias]), [['APROBAR', 2, 2]]);
    assert.deepEqual(accionesPendientesQe(fila({ codigo: 'H5', analistaId: null }), seguimiento('H5'), ahora).map((a) => a.tipo), ['ASIGNAR']);
    assert.deepEqual(accionesPendientesQe(fila({ codigo: 'H6' }), seguimiento('H6', { listaParaCertificar: true, listaDesde: '2026-10-17T00:00:00Z' }), ahora).map((a) => a.tipo), ['CERTIFICAR']);
    assert.deepEqual(accionesPendientesQe(fila({ codigo: 'H8', estado: 'PENDIENTE_CIERRE' }), seguimiento('H8', { listaParaCerrar: true, listaDesde: '2026-10-16T00:00:00Z' }), ahora).map((a) => a.tipo), ['CERRAR']);
    assert.deepEqual(accionesPendientesQe(fila({ codigo: 'H7', estado: 'CERRADA', analistaId: null }), seguimiento('H7', { listaParaCerrar: true }), ahora), []);
  });

  it('una HDU con dos pendientes aparece dos veces; sin seguimiento solo se calcula ASIGNAR (D46)', () => {
    const doble = accionesPendientesQe(fila({ codigo: 'H9', analistaId: null }), seguimiento('H9', { porAprobar: 1 }), ahora);
    assert.deepEqual(doble.map((a) => a.tipo), ['APROBAR', 'ASIGNAR']);
    assert.deepEqual(accionesPendientesQe(fila({ codigo: 'H9', analistaId: null }), undefined, ahora).map((a) => a.tipo), ['ASIGNAR']);
    assert.deepEqual(accionesPendientesQe(fila({ codigo: 'H1' }), undefined, ahora), []);
  });

  it('la más antigua primero, con desempate por código', () => {
    const lista = [
      ...accionesPendientesQe(fila({ codigo: 'B', analistaId: null, creadoEn: new Date('2026-10-10T00:00:00Z') }), undefined, ahora),
      ...accionesPendientesQe(fila({ codigo: 'A', analistaId: null, creadoEn: new Date('2026-10-10T00:00:00Z') }), undefined, ahora),
      ...accionesPendientesQe(fila({ codigo: 'C', analistaId: null, creadoEn: new Date('2026-10-01T00:00:00Z') }), undefined, ahora),
    ];
    assert.deepEqual(ordenarAcciones(lista).map((a) => a.fila.codigo), ['C', 'A', 'B']);
  });
});

describe('Auditoría de usuarios [E7-B04]', () => {
  it('muestra solo la lista blanca y descarta a cualquier profundidad lo que contenga password, token o secret (E7-B04-T06)', () => {
    const limpio = sanitizarCambios({
      rol: 'QE',
      password: 'x',
      nombre: 'Ana',
      interno: 'no',
      celulas: [{ id: '1', nombre: 'CEL-A', refresh_token: 'x' }],
      filtros: { celulaId: 'c', apiSecret: 'x', anidado: { Token: 'x', ok: 1 } },
    });
    assert.deepEqual(limpio, { rol: 'QE', nombre: 'Ana', celulas: [{ id: '1', nombre: 'CEL-A' }], filtros: { celulaId: 'c', anidado: { ok: 1 } } });
    assert.equal(sanitizarCambios(null), null);
  });

  it('un rango con hasta anterior a desde no es válido', () => {
    assert.equal(rangoValido(new Date('2026-10-02'), new Date('2026-10-01')), false);
    assert.equal(rangoValido(undefined, new Date('2026-10-01')), true);
  });
});

describe('CSV de exportación [E7-B04#3, D48]', () => {
  it('lleva BOM UTF-8, separador ;, encabezado, filas con \\r\\n y fechas ISO 8601 en UTC', () => {
    const texto = generarCsv(['Código', 'Fecha'], [['H1', new Date('2026-10-20T15:30:00.000Z')], ['H2', null]]);
    assert.ok(texto.startsWith('﻿Código;Fecha\r\n'));
    assert.equal(texto, '﻿Código;Fecha\r\nH1;2026-10-20T15:30:00.000Z\r\nH2;\r\n');
  });

  it('sin filas solo trae el encabezado', () => {
    assert.equal(generarCsv(['A', 'B'], []), '﻿A;B\r\n');
  });

  it('entrecomilla separadores, comillas y saltos de línea, y neutraliza fórmulas', () => {
    assert.equal(celdaCsv('a;b'), '"a;b"');
    assert.equal(celdaCsv('dice "hola"'), '"dice ""hola"""');
    assert.equal(celdaCsv('línea1\nlínea2'), '"línea1\nlínea2"');
    assert.equal(celdaCsv('=SUMA(A1)'), "'=SUMA(A1)");
    assert.equal(celdaCsv('@usuario'), "'@usuario");
    assert.equal(celdaCsv(7), '7');
    assert.equal(celdaCsv(undefined), '');
  });
});
