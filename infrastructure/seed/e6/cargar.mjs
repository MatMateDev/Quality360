#!/usr/bin/env node
// Fixture E6 estatico (seccion 8 de docs/backlog/e6-indicadores-dashboards.md), encima de E7 y E4.
// Agrega QE3 (QE sin analistas ni HDU), confirma ANA4 (sin QE ni HDU) y crea CEL-D asignada a LID2.
// Despues comprueba, sin corregir nada, que el avance de H1..H8 coincide con el backlog (en particular
// el supuesto «H4 tiene 0 %»). Los escenarios que cambian el estado estan en escenarios.mjs.
//
// Uso:  npm run seed:e7 && npm run seed:e4 && npm run seed:e6      (--sin-verificar omite la verificacion)
// Requiere Organizacion (PERMITIR_CARGA_SEMILLA=true) y Certificaciones, y las variables de
// infrastructure/seed/mvp/.env.carga. Solo local. Solo usa APIs; nada de SQL.
//
// Idempotente: usuarios por correo, celula por nombre, y CEL-D se agrega a las celulas de LID2 solo si
// no la tiene. Repetir no crea nada.

import { CERT, ORG, aprobados, cargarUsuario, celulaId, como, datos, esperar, exigir, exigirEntorno, hduPorCodigo, http, usuarioPorCorreo } from './lib.mjs';

exigirEntorno();
const VERIFICAR = !process.argv.includes('--sin-verificar');
const resumen = [];

async function main() {
  await esperar(ORG, 'Organización');
  if (VERIFICAR) await esperar(CERT, 'Certificaciones');

  // Precondicion: fixture E7 cargado (la sesion de ADM1 existe y H1 esta).
  await como('adm1');
  if (!(await hduPorCodigo('E7-H1'))) throw new Error('Falta el fixture E7 (E7-H1): corre npm run seed:e7 primero.');

  for (const u of datos.usuarios) {
    const j = await cargarUsuario(u);
    resumen.push(`${u.clave} ${j.creado ? 'creado' : 'ya existía'}`);
  }

  const cel = datos.celulaNueva;
  const id = await celulaId(cel.nombre);
  const lider = await usuarioPorCorreo(cel.lider);
  if (!lider) throw new Error(`Falta ${cel.lider}: corre npm run seed:e7 primero.`);
  const adm = await como('adm1');
  const vigentes = exigir(await http(ORG, 'GET', `/v1/usuarios/${lider.id}/celulas-lider`, { cabeceras: adm }), 'células de LID2').vigentes.map((v) => v.celula.id);
  if (vigentes.includes(id)) {
    resumen.push(`${cel.nombre} ya asignada a ${cel.lider}`);
  } else {
    exigir(await http(ORG, 'PUT', `/v1/usuarios/${lider.id}/celulas-lider`, { cuerpo: { celulaIds: [...vigentes, id] }, cabeceras: adm }), 'asignar CEL-D');
    resumen.push(`${cel.nombre} asignada a ${cel.lider}`);
  }

  console.log(`Semilla E6 cargada: ${resumen.join('; ')}.`);
  if (VERIFICAR) await verificar();
}

/** Compara el avance de H1..H8 (aprobados x 10, por Certificaciones) con la seccion 8 del backlog. */
async function verificar() {
  const diferencias = [];
  for (const [h, esperado] of Object.entries(datos.esperadoBase.avance)) {
    const hdu = await hduPorCodigo(`E7-${h}`);
    if (!hdu) { diferencias.push(`${h}: no existe`); continue; }
    const real = (await aprobados(hdu.id)) * 10;
    // El supuesto de H4 se reporta siempre; los demas solo si difieren.
    if (h === 'H4') console.log(`Supuesto «H4 tiene 0 % de avance»: ${real === 0 ? 'CONFIRMADO' : 'NO se cumple'} (${real} %).`);
    if (real !== esperado) diferencias.push(`${h}: esperado ${esperado} %, real ${real} %`);
  }
  if (diferencias.length) {
    console.error(`Avance distinto del backlog (no se ajusta nada): ${diferencias.join('; ')}.`);
    console.error('Si el estado ya se modificó (cierres, escenarios), reinicia la base y vuelve a cargar E7, E4 y E6.');
    process.exit(1);
  }
  console.log('Avance de H1-H8 coincide con la sección 8 del backlog.');
}

try {
  await main();
} catch (e) {
  console.error(`Semilla E6 incompleta: ${e.message}`);
  process.exit(1);
}
