/** Traduce filas de Prisma a los tipos del dominio. Vive solo en infraestructura. */
import type { ConfiguracionJira, DetalleEjecucion, EjecucionIntegracion, EventoConfiguracion as EventoPrisma } from '#prisma';

import { esAdvertenciaFila, esCodigoErrorIntegracion, esMotivoFila } from '../../dominio/catalogos.js';
import type {
  Actor,
  CambiosHdu,
  CampoConfiguracion,
  ConfiguracionGuardada,
  Ejecucion,
  EstadoConexion,
  EventoConfiguracion,
  EventoEjecucion,
  FilaDetalle,
  OrigenEjecucion,
  ReferenciaJira,
  ResultadoEjecucion,
  ResultadoFila,
  Rol,
} from '../../dominio/tipos.js';

export const CAMPOS_CONFIGURACION: readonly CampoConfiguracion[] = ['sitio', 'correo', 'token', 'proyecto', 'tiposIssue', 'celulaId', 'qeResponsableId', 'sprintRespaldoId'];

export function aConfiguracionGuardada(fila: ConfiguracionJira): ConfiguracionGuardada {
  return {
    sitio: fila.sitioUrl,
    correo: fila.correo,
    proyecto: fila.proyectoClave,
    tiposIssue: fila.tiposIssue.split(',').map((tipo) => tipo.trim()).filter((tipo) => tipo.length > 0),
    campoSprint: fila.campoSprint,
    celulaId: fila.celulaId,
    qeResponsableId: fila.qeResponsableId,
    sprintRespaldoId: fila.sprintRespaldoId,
    token: {
      cifrado: Buffer.from(fila.tokenCifrado),
      iv: Buffer.from(fila.tokenIv),
      tag: Buffer.from(fila.tokenTag),
      ultimos4: fila.tokenUltimos4,
      llaveVersion: fila.llaveVersion,
    },
    estadoConexion: fila.estadoConexion as EstadoConexion,
    ultimaPruebaEn: fila.ultimaPruebaEn,
    ultimaPruebaCodigo: esCodigoErrorIntegracion(fila.ultimaPruebaCodigo) ? fila.ultimaPruebaCodigo : null,
    actualizadoPor: { id: fila.actualizadoPorId, nombre: fila.actualizadoPorNombre },
    actualizadoEn: fila.actualizadoEn,
  };
}

export function aEventoConfiguracion(fila: EventoPrisma): EventoConfiguracion {
  const campos = Array.isArray(fila.camposCambiados) ? fila.camposCambiados : [];
  return {
    id: fila.id,
    fecha: fila.fecha,
    actor: { id: fila.actorId, nombre: fila.actorNombre },
    camposCambiados: campos.filter((campo): campo is CampoConfiguracion => (CAMPOS_CONFIGURACION as readonly unknown[]).includes(campo)),
    tokenCambiado: fila.tokenCambiado,
    resultadoPrueba: fila.resultadoPrueba,
  };
}

function eventosDeEjecucion(valor: unknown): EventoEjecucion[] {
  if (!Array.isArray(valor)) return [];
  const eventos: EventoEjecucion[] = [];
  for (const crudo of valor) {
    const e = crudo as { tipo?: unknown; espera_ms?: unknown; fecha?: unknown };
    if (e.tipo === 'JIRA_LIMITE_DE_TASA' && typeof e.espera_ms === 'number' && typeof e.fecha === 'string') {
      eventos.push({ tipo: 'JIRA_LIMITE_DE_TASA', esperaMs: e.espera_ms, fecha: new Date(e.fecha) });
    }
  }
  return eventos;
}

export function aEjecucion(fila: EjecucionIntegracion): Ejecucion {
  const actor: Actor = { id: fila.actorId, nombre: fila.actorNombre, rol: fila.actorRol as Rol };
  const archivo =
    fila.archivoNombre !== null && fila.archivoTamano !== null && fila.archivoHuella !== null
      ? { nombre: fila.archivoNombre, tamano: fila.archivoTamano, huella: fila.archivoHuella }
      : null;
  return {
    id: fila.id,
    origen: fila.origen as OrigenEjecucion,
    resultado: fila.resultado as ResultadoEjecucion,
    actor,
    iniciadaEn: fila.iniciadaEn,
    terminadaEn: fila.terminadaEn,
    duracionMs: fila.duracionMs,
    estricto: fila.estricto,
    vincularExistentes: fila.vincularExistentes,
    leidas: fila.leidas,
    creadas: fila.creadas,
    actualizadas: fila.actualizadas,
    omitidas: fila.omitidas,
    conError: fila.conError,
    conAdvertencias: fila.conAdvertencias,
    reintentos429: fila.reintentos429,
    eventos: eventosDeEjecucion(fila.eventos),
    codigoError: esCodigoErrorIntegracion(fila.codigoError) ? fila.codigoError : null,
    mensajeError: fila.mensajeError,
    proyecto: fila.proyectoClave,
    sitioHost: fila.sitioHost,
    archivo,
    hayMas: fila.hayMas,
    continuarDesde: fila.continuarDesde,
  };
}

export function aFilaDetalle(fila: DetalleEjecucion): FilaDetalle {
  const referencia = fila.referencia as { estado?: unknown; responsable?: unknown } | null;
  return {
    fila: fila.fila,
    codigo: fila.codigo,
    titulo: fila.titulo,
    idHistoria: fila.historiaId,
    resultado: fila.resultado as ResultadoFila,
    motivo: esMotivoFila(fila.motivo) ? fila.motivo : null,
    mensaje: fila.mensaje,
    advertencias: Array.isArray(fila.advertencias) ? fila.advertencias.filter(esAdvertenciaFila) : [],
    cambios: (fila.cambios as CambiosHdu | null) ?? null,
    referencia:
      referencia === null
        ? null
        : ({
            estado: typeof referencia.estado === 'string' ? referencia.estado : null,
            responsable: typeof referencia.responsable === 'string' ? referencia.responsable : null,
          } satisfies ReferenciaJira),
  };
}
