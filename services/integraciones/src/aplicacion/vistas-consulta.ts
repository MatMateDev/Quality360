/**
 * Vistas de respuesta de la consulta (comun.v1.yaml: `Consulta`, `ConsultaActual`, `ItemConsulta`). Convierten lo guardado
 * en lo que el contrato publica. Los textos de Jira se devuelven tal cual: el portal los muestra como texto.
 */
import { esMarcable, estaCompleta, faltantes } from '../dominio/consulta/asignacion.js';
import type { Consulta, ConteosFilas, ItemConsulta } from '../dominio/consulta/tipos.js';

export function vistaConsulta(c: Consulta, conteos: ConteosFilas) {
  return {
    id: c.id,
    estado: c.estado,
    version: c.version,
    creadaPor: c.creadaPor,
    creadaEn: c.creadaEn,
    venceEn: c.venceEn,
    cerradaEn: c.cerradaEn,
    cerradaPor: c.cerradaPor,
    proyecto: c.proyecto,
    sitioHost: c.sitioHost,
    hayMas: c.hayMas,
    continuarDesde: c.continuarDesde,
    leidas: c.leidas,
    nuevas: c.nuevas,
    cambiaron: c.cambiaron,
    sinCambios: c.sinCambios,
    conError: c.conError,
    conAdvertencias: c.conAdvertencias,
    asignadas: conteos.asignadas,
    completas: conteos.completas,
    marcadasNuevas: conteos.marcadasNuevas,
    marcadasCambio: conteos.marcadasCambio,
    aplicadas: conteos.aplicadas,
    pendientes: conteos.pendientes,
    descartadas: c.descartadas,
    creadas: c.creadas,
    yaAsignadas: conteos.yaAsignadas,
    sugerencia: { celula: c.sugerencia.celula, qeResponsable: c.sugerencia.qe, sprintRespaldo: c.sugerencia.sprintRespaldo },
  };
}

export type VistaConsulta = ReturnType<typeof vistaConsulta>;

/** Los sitios de prueba (`127.0.0.1`, `localhost`) son http; los reales siempre https (D95). */
export function urlDeIssue(sitioHost: string, codigo: string): string {
  const local = sitioHost.startsWith('127.0.0.1') || sitioHost.startsWith('localhost');
  return `${local ? 'http' : 'https'}://${sitioHost}/browse/${codigo}`;
}

export function vistaItem(i: ItemConsulta, sitioHost: string) {
  const esNueva = i.grupo === 'NUEVA';
  const a = i.asignacion;
  return {
    id: i.id,
    posicion: i.posicion,
    grupo: i.grupo,
    revision: i.revision,
    codigo: i.codigo,
    titulo: i.titulo,
    descripcion: i.descripcion,
    prioridad: i.prioridad,
    sprintJira: i.sprintJira,
    urlExterna: i.codigo === null || i.codigo === '' ? null : urlDeIssue(sitioHost, i.codigo),
    referencia: i.referencia,
    advertencias: i.advertencias,
    motivo: i.motivo,
    idHistoria: i.idHistoria,
    origenHdu: i.origenHdu,
    hdu: i.idHistoria === null || i.estadoHdu === null ? null : { estado: i.estadoHdu, qeResponsable: i.qeHduNombre },
    cambios: i.cambios,
    asignacion: esNueva ? { celula: a.celula, qeResponsable: a.qe, analista: a.analista, sprint: a.sprint, sprintOrigen: a.sprintOrigen } : null,
    analistaAuto: esNueva && i.analistaAuto,
    completa: esNueva && estaCompleta(a),
    faltantes: esNueva ? faltantes(a) : [],
    marcada: i.marcada,
    marcable: esMarcable(i),
    aplicada: i.aplicada,
    aplicando: i.aplicando,
    aplicacion: i.aplicacion === null ? null : { alcance: i.aplicacion.alcance, por: i.aplicacion.por, en: i.aplicacion.en },
    yaAsignada: i.yaAsignada,
    avisoSinLider: i.avisoSinLider,
    asignadoPor: i.asignadoPor,
    asignadoEn: i.asignadoEn,
  };
}

export type VistaItem = ReturnType<typeof vistaItem>;
