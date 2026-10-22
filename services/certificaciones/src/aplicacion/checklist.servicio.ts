/**
 * Casos de uso del checklist y del certificado (E3). Cada operación sobre una
 * HDU consulta primero el acceso en Organización (D18) y luego aplica las
 * reglas puras de `dominio/entregables.ts`.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { noEncontrado } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionCertificaciones } from '../configuracion.js';
import {
  CLAVES_ENTREGABLE,
  NOMBRES_ENTREGABLE,
  TAMANO_MAXIMO_EVIDENCIA,
  calcularResumen,
  errorEvidenciaInvalida,
  errorMotivoRequerido,
  esTipoContenidoEvidencia,
  evaluarCertificacion,
  exigirRelacion,
  generarFolio,
  ordenDe,
  prefijoEvidencia,
  sanearNombreArchivo,
  validarCertificable,
  validarDesmarcable,
  validarMarcable,
  validarPorAprobar,
  type ClaveEntregable,
  type EstadoEntregable,
  type EstadosPorClave,
  type ResumenChecklist,
} from '../dominio/entregables.js';
import { certificadoEsValido } from '../dominio/seguimiento.js';
import { ALMACEN_ARCHIVOS, BUCKET_CERTIFICADOS, BUCKET_EVIDENCIAS, type AlmacenArchivos } from '../infraestructura/almacen.js';
import { GeneradorCertificadoPdf } from '../infraestructura/certificado-pdf.js';
import {
  ChecklistRepositorio,
  type ActorEvento,
  type RegistroCertificado,
  type RegistroEntregable,
} from '../infraestructura/checklist.repositorio.js';
import {
  OrganizacionCliente,
  type AccesoHdu,
  type ContextoSolicitud,
  type HduParaCertificacion,
} from '../infraestructura/organizacion.cliente.js';

const SEGUNDOS_DESCARGA = 300;
const SEGUNDOS_SUBIDA = 2 * 60 * 60;

// ------------------------------------------------------------------ vistas

export interface PersonaFecha {
  id: string;
  nombre: string;
  fecha: string;
}

export type EvidenciaVista =
  | { tipo: 'ENLACE'; url: string }
  | { tipo: 'ARCHIVO'; nombre: string; tipoContenido: string; tamanoBytes: number }
  | { tipo: 'CERTIFICADO'; folio: string };

export interface EntregableVista {
  clave: ClaveEntregable;
  orden: number;
  nombre: string;
  estado: EstadoEntregable;
  evidencia: EvidenciaVista | null;
  completado: PersonaFecha | null;
  aprobado: PersonaFecha | null;
  observacion: { comentario: string; autor: PersonaFecha } | null;
}

export interface CertificadoResumenVista {
  folio: string;
  emitido: PersonaFecha;
  huellaSha256: string;
}

function personaFecha(id: string | null, nombre: string | null, fecha: Date | null): PersonaFecha | null {
  if (id === null || nombre === null || fecha === null) return null;
  return { id, nombre, fecha: fecha.toISOString() };
}

function evidenciaVista(registro: RegistroEntregable): EvidenciaVista | null {
  switch (registro.evidenciaTipo) {
    case 'ENLACE':
      return { tipo: 'ENLACE', url: registro.evidenciaUrl ?? '' };
    case 'ARCHIVO':
      return {
        tipo: 'ARCHIVO',
        nombre: registro.evidenciaNombre ?? 'evidencia',
        tipoContenido: registro.evidenciaTipoContenido ?? 'application/octet-stream',
        tamanoBytes: registro.evidenciaTamanoBytes ?? 0,
      };
    case 'CERTIFICADO':
      return { tipo: 'CERTIFICADO', folio: registro.evidenciaFolio ?? '' };
    default:
      return null;
  }
}

export function vistaEntregable(clave: ClaveEntregable, registro: RegistroEntregable | undefined): EntregableVista {
  const base = { clave, orden: ordenDe(clave), nombre: NOMBRES_ENTREGABLE[clave] };
  if (registro === undefined) {
    return { ...base, estado: 'PENDIENTE', evidencia: null, completado: null, aprobado: null, observacion: null };
  }
  const autorObservacion = personaFecha(registro.observadoPorId, registro.observadoPorNombre, registro.observadoEn);
  return {
    ...base,
    estado: registro.estado,
    evidencia: evidenciaVista(registro),
    completado: personaFecha(registro.completadoPorId, registro.completadoPorNombre, registro.completadoEn),
    aprobado: personaFecha(registro.aprobadoPorId, registro.aprobadoPorNombre, registro.aprobadoEn),
    observacion:
      registro.observacion !== null && autorObservacion !== null ? { comentario: registro.observacion, autor: autorObservacion } : null,
  };
}

function vistaCertificado(certificado: RegistroCertificado): CertificadoResumenVista {
  return {
    folio: certificado.folio,
    emitido: { id: certificado.emitidoPorId, nombre: certificado.emitidoPorNombre, fecha: certificado.emitidoEn.toISOString() },
    huellaSha256: certificado.huellaSha256,
  };
}

function estadosDe(registros: readonly RegistroEntregable[]): EstadosPorClave {
  return new Map(registros.map((registro) => [registro.clave, registro.estado]));
}

function actorEvento(acceso: AccesoHdu): ActorEvento {
  return { id: acceso.actor.id, nombre: acceso.actor.nombre, rol: acceso.actor.rol };
}

function textoObligatorio(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio.length === 0 ? null : limpio;
}

// ------------------------------------------------------------------ servicio

export type EntradaEvidencia = { tipo: 'ENLACE'; url: string } | { tipo: 'ARCHIVO'; ruta: string };

@Injectable()
export class ChecklistAplicacion {
  private readonly registro = new Logger(ChecklistAplicacion.name);

  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionCertificaciones,
    private readonly organizacion: OrganizacionCliente,
    private readonly repositorio: ChecklistRepositorio,
    @Inject(ALMACEN_ARCHIVOS) private readonly almacen: AlmacenArchivos,
    private readonly pdf: GeneradorCertificadoPdf,
  ) {}

  /** Resumen para el detalle de HDU y el cierre (D11, E3-B02#3). */
  async resumen(hduId: string, contexto: ContextoSolicitud): Promise<ResumenChecklist & { hduId: string }> {
    await this.organizacion.accesoHdu(hduId, contexto);
    return { hduId, ...calcularResumen(estadosDe(await this.repositorio.listar(hduId))) };
  }

  /** Checklist completo con permisos y estado de la certificación (E3-F01, E3-F04#2). */
  async checklist(hduId: string, contexto: ContextoSolicitud) {
    const acceso = await this.organizacion.accesoHdu(hduId, contexto);
    const [registros, certificado] = await Promise.all([this.repositorio.listar(hduId), this.repositorio.buscarCertificado(hduId)]);
    const porClave = new Map(registros.map((registro) => [registro.clave, registro]));
    const estados = estadosDe(registros);
    const abierta = acceso.hdu.estado !== 'CERRADA';
    return {
      hduId,
      resumen: { hduId, ...calcularResumen(estados) },
      entregables: CLAVES_ENTREGABLE.map((clave) => vistaEntregable(clave, porClave.get(clave))),
      permisos: {
        puedeMarcar: abierta && acceso.relacion === 'ANALISTA_ASIGNADO',
        puedeAprobar: abierta && acceso.relacion === 'QE_RESPONSABLE',
        puedeGenerarCertificado: abierta && acceso.relacion === 'QE_RESPONSABLE' && certificado === null,
      },
      certificado: certificado === null ? null : vistaCertificado(certificado),
      certificacion: evaluarCertificacion(estados, certificado !== null, acceso.hdu.estado),
    };
  }

  /** URL firmada para subir un archivo de evidencia directo a Storage (D20, E3-F02#1). */
  async solicitarSubida(
    hduId: string,
    clave: ClaveEntregable,
    solicitud: { nombreArchivo: string; tipoContenido: string; tamanoBytes: number },
    contexto: ContextoSolicitud,
  ) {
    const acceso = await this.organizacion.accesoHdu(hduId, contexto);
    exigirRelacion(acceso.relacion, 'ANALISTA_ASIGNADO', acceso.hdu.estado, 'subir evidencia');
    validarMarcable(estadosDe(await this.repositorio.listar(hduId)), clave);
    if (!esTipoContenidoEvidencia(solicitud.tipoContenido)) throw errorEvidenciaInvalida(`tipo ${solicitud.tipoContenido}`);
    if (solicitud.tamanoBytes < 1 || solicitud.tamanoBytes > TAMANO_MAXIMO_EVIDENCIA) {
      throw errorEvidenciaInvalida(`tamaño ${solicitud.tamanoBytes}`);
    }
    const ruta = `${prefijoEvidencia(hduId, clave)}${randomUUID()}-${sanearNombreArchivo(solicitud.nombreArchivo)}`;
    const firmada = await this.almacen.firmarSubida(BUCKET_EVIDENCIAS, ruta);
    return {
      ruta: firmada.ruta,
      urlSubida: firmada.urlSubida,
      token: firmada.token,
      expiraEn: new Date(Date.now() + SEGUNDOS_SUBIDA * 1000).toISOString(),
    };
  }

  /** Marca con evidencia: queda POR_APROBAR (E3-F02#1, E3-B01#1). */
  async marcar(hduId: string, clave: ClaveEntregable, evidencia: EntradaEvidencia, contexto: ContextoSolicitud): Promise<EntregableVista> {
    const acceso = await this.organizacion.accesoHdu(hduId, contexto);
    exigirRelacion(acceso.relacion, 'ANALISTA_ASIGNADO', acceso.hdu.estado, 'marcar');
    validarMarcable(estadosDe(await this.repositorio.listar(hduId)), clave);

    const datosEvidencia =
      evidencia.tipo === 'ENLACE'
        ? { evidenciaTipo: 'ENLACE' as const, evidenciaUrl: evidencia.url, evidenciaRuta: null, evidenciaNombre: null, evidenciaTipoContenido: null, evidenciaTamanoBytes: null }
        : await this.evidenciaDeArchivo(hduId, clave, evidencia.ruta);

    const ahora = new Date();
    const actualizado = await this.repositorio.cambiar({
      hduId,
      clave,
      estadoEsperado: 'PENDIENTE',
      accion: 'MARCAR',
      actor: actorEvento(acceso),
      cambio: {
        estado: 'POR_APROBAR',
        ...datosEvidencia,
        evidenciaFolio: null,
        completadoPorId: acceso.actor.id,
        completadoPorNombre: acceso.actor.nombre,
        completadoEn: ahora,
        aprobadoPorId: null,
        aprobadoPorNombre: null,
        aprobadoEn: null,
      },
    });
    return vistaEntregable(clave, actualizado);
  }

  /** Desmarca con motivo: vuelve a PENDIENTE y queda el retroceso en la bitácora (E3-F02#3, E3-B04#2). */
  async desmarcar(hduId: string, clave: ClaveEntregable, motivoCrudo: unknown, contexto: ContextoSolicitud): Promise<EntregableVista> {
    const acceso = await this.organizacion.accesoHdu(hduId, contexto);
    exigirRelacion(acceso.relacion, 'ANALISTA_ASIGNADO', acceso.hdu.estado, 'desmarcar');
    const motivo = textoObligatorio(motivoCrudo);
    if (motivo === null) throw errorMotivoRequerido('Indica el motivo para desmarcar el entregable.');
    const estados = estadosDe(await this.repositorio.listar(hduId));
    validarDesmarcable(estados, clave);

    const actualizado = await this.repositorio.cambiar({
      hduId,
      clave,
      estadoEsperado: estados.get(clave) ?? 'PENDIENTE',
      accion: 'DESMARCAR',
      actor: actorEvento(acceso),
      motivo,
      cambio: {
        estado: 'PENDIENTE',
        evidenciaTipo: null,
        evidenciaUrl: null,
        evidenciaRuta: null,
        evidenciaNombre: null,
        evidenciaTipoContenido: null,
        evidenciaTamanoBytes: null,
        evidenciaFolio: null,
        completadoPorId: null,
        completadoPorNombre: null,
        completadoEn: null,
        aprobadoPorId: null,
        aprobadoPorNombre: null,
        aprobadoEn: null,
        observacion: null,
        observadoPorId: null,
        observadoPorNombre: null,
        observadoEn: null,
      },
    });
    return vistaEntregable(clave, actualizado);
  }

  /** Aprobación del QE responsable (E3-F03#1, E3-B02#2). */
  async aprobar(hduId: string, clave: ClaveEntregable, contexto: ContextoSolicitud): Promise<EntregableVista> {
    const acceso = await this.organizacion.accesoHdu(hduId, contexto);
    exigirRelacion(acceso.relacion, 'QE_RESPONSABLE', acceso.hdu.estado, 'aprobar');
    validarPorAprobar(estadosDe(await this.repositorio.listar(hduId)), clave);
    const actualizado = await this.repositorio.cambiar({
      hduId,
      clave,
      estadoEsperado: 'POR_APROBAR',
      accion: 'APROBAR',
      actor: actorEvento(acceso),
      cambio: {
        estado: 'APROBADO',
        aprobadoPorId: acceso.actor.id,
        aprobadoPorNombre: acceso.actor.nombre,
        aprobadoEn: new Date(),
        observacion: null,
        observadoPorId: null,
        observadoPorNombre: null,
        observadoEn: null,
      },
    });
    return vistaEntregable(clave, actualizado);
  }

  /** Rechazo con observaciones: vuelve a PENDIENTE sin evidencia (E3-F03#2). */
  async rechazar(hduId: string, clave: ClaveEntregable, comentarioCrudo: unknown, contexto: ContextoSolicitud): Promise<EntregableVista> {
    const acceso = await this.organizacion.accesoHdu(hduId, contexto);
    exigirRelacion(acceso.relacion, 'QE_RESPONSABLE', acceso.hdu.estado, 'rechazar');
    const comentario = textoObligatorio(comentarioCrudo);
    if (comentario === null) throw errorMotivoRequerido('Indica las observaciones del rechazo.');
    validarPorAprobar(estadosDe(await this.repositorio.listar(hduId)), clave);
    const actualizado = await this.repositorio.cambiar({
      hduId,
      clave,
      estadoEsperado: 'POR_APROBAR',
      accion: 'RECHAZAR',
      actor: actorEvento(acceso),
      motivo: comentario,
      cambio: {
        estado: 'PENDIENTE',
        evidenciaTipo: null,
        evidenciaUrl: null,
        evidenciaRuta: null,
        evidenciaNombre: null,
        evidenciaTipoContenido: null,
        evidenciaTamanoBytes: null,
        completadoPorId: null,
        completadoPorNombre: null,
        completadoEn: null,
        observacion: comentario,
        observadoPorId: acceso.actor.id,
        observadoPorNombre: acceso.actor.nombre,
        observadoEn: new Date(),
      },
    });
    return vistaEntregable(clave, actualizado);
  }

  /** URL firmada de la evidencia de archivo, o del PDF si es el entregable del certificado. */
  async descargarEvidencia(hduId: string, clave: ClaveEntregable, contexto: ContextoSolicitud) {
    await this.organizacion.accesoHdu(hduId, contexto);
    const registro = (await this.repositorio.listar(hduId)).find((item) => item.clave === clave);
    if (registro === undefined || registro.evidenciaRuta === null) throw noEncontrado(`${clave} sin archivo`);
    const bucket = registro.evidenciaTipo === 'CERTIFICADO' ? BUCKET_CERTIFICADOS : BUCKET_EVIDENCIAS;
    const url = await this.almacen.firmarDescarga(bucket, registro.evidenciaRuta, SEGUNDOS_DESCARGA, registro.evidenciaNombre ?? undefined);
    return { url, expiraEn: new Date(Date.now() + SEGUNDOS_DESCARGA * 1000).toISOString() };
  }

  /** Bitácora completa de la HDU (E3-B04#3). */
  async bitacora(hduId: string, contexto: ContextoSolicitud) {
    await this.organizacion.accesoHdu(hduId, contexto);
    const eventos = await this.repositorio.bitacora(hduId);
    return {
      hduId,
      eventos: eventos.map((evento) => ({
        id: evento.id,
        accion: evento.accion,
        clave: evento.clave,
        actor: { id: evento.actorId, nombre: evento.actorNombre, rol: evento.actorRol },
        fecha: evento.fecha.toISOString(),
        valorAnterior: evento.valorAnterior ?? null,
        valorNuevo: evento.valorNuevo ?? null,
        motivo: evento.motivo,
      })),
    };
  }

  /** Bandeja del QE: POR_APROBAR de sus HDU, agrupados (E3-F03#3). */
  async bandeja(contexto: ContextoSolicitud) {
    const hdus = await this.organizacion.hduComoResponsable(contexto);
    const porId = new Map(hdus.map((hdu) => [hdu.id, hdu]));
    const pendientes = await this.repositorio.listarPorAprobar(hdus.map((hdu) => hdu.id));
    const grupos = new Map<string, { hdu: HduParaCertificacion; entregables: EntregableVista[] }>();
    for (const registro of pendientes) {
      const hdu = porId.get(registro.hduId);
      if (hdu === undefined) continue;
      const grupo = grupos.get(hdu.id) ?? { hdu, entregables: [] };
      grupo.entregables.push(vistaEntregable(registro.clave, registro));
      grupos.set(hdu.id, grupo);
    }
    const lista = [...grupos.values()]
      .map((grupo) => ({ ...grupo, entregables: grupo.entregables.sort((a, b) => a.orden - b.orden) }))
      .sort((a, b) => a.hdu.codigo.localeCompare(b.hdu.codigo));
    return { total: pendientes.filter((registro) => porId.has(registro.hduId)).length, grupos: lista };
  }

  /** Genera el PDF con folio, lo guarda y completa el entregable 9 (E3-F04#1, E3-B03#1, D19). */
  async generarCertificado(hduId: string, contexto: ContextoSolicitud) {
    const acceso = await this.organizacion.accesoHdu(hduId, contexto);
    exigirRelacion(acceso.relacion, 'QE_RESPONSABLE', acceso.hdu.estado, 'generar certificado');
    const [registros, existente] = await Promise.all([this.repositorio.listar(hduId), this.repositorio.buscarCertificado(hduId)]);
    validarCertificable(estadosDe(registros), existente !== null, acceso.hdu.estado);

    const emitidoEn = new Date();
    const folio = generarFolio(randomBytes(5), emitidoEn);
    const porClave = new Map(registros.map((registro) => [registro.clave, registro]));
    const filas = CLAVES_ENTREGABLE.map((clave) => {
      const vista = vistaEntregable(clave, porClave.get(clave));
      const persona = (valor: PersonaFecha | null) => (valor === null ? null : { nombre: valor.nombre, fecha: new Date(valor.fecha) });
      if (clave === 'CERTIFICADO') {
        const emisor = { nombre: acceso.actor.nombre, fecha: emitidoEn };
        return { orden: vista.orden, nombre: vista.nombre, estado: 'Emitido', completado: emisor, aprobado: emisor };
      }
      const estado = vista.estado === 'APROBADO' ? 'Aprobado' : vista.estado === 'POR_APROBAR' ? 'Por aprobar' : 'Pendiente';
      return { orden: vista.orden, nombre: vista.nombre, estado, completado: persona(vista.completado), aprobado: persona(vista.aprobado) };
    });

    const contenido = await this.pdf.generar({
      folio,
      emitidoEn,
      emitidoPor: acceso.actor.nombre,
      hdu: acceso.hdu,
      filas,
      urlVerificacion: `${this.configuracion.portalUrl}/verificar/${folio}`,
    });
    const huellaSha256 = createHash('sha256').update(contenido).digest('hex');
    const rutaPdf = `${hduId}/${folio}.pdf`;
    await this.almacen.subir(BUCKET_CERTIFICADOS, rutaPdf, contenido, 'application/pdf');

    const emitido = await this.repositorio.emitirCertificado(
      {
        hduId,
        folio,
        hduCodigo: acceso.hdu.codigo,
        hduTitulo: acceso.hdu.titulo,
        emitidoPorId: acceso.actor.id,
        emitidoPorNombre: acceso.actor.nombre,
        emitidoEn,
        rutaPdf,
        huellaSha256,
      },
      actorEvento(acceso),
    );
    if (emitido === null) {
      await this.almacen.eliminar(BUCKET_CERTIFICADOS, rutaPdf).catch((error: unknown) => {
        this.registro.warn(`No se pudo borrar el PDF huérfano ${rutaPdf}: ${String(error)}`);
      });
      validarCertificable(new Map(), true, acceso.hdu.estado);
    }
    return this.conDescarga(emitido as RegistroCertificado);
  }

  /** Vuelve a descargar el mismo certificado (E3-F04#3). */
  async obtenerCertificado(hduId: string, contexto: ContextoSolicitud) {
    await this.organizacion.accesoHdu(hduId, contexto);
    const certificado = await this.repositorio.buscarCertificado(hduId);
    if (certificado === null) throw noEncontrado(`HDU ${hduId} sin certificado`);
    return this.conDescarga(certificado);
  }

  /** Verificación pública por folio, sin sesión (E3-B03#2, D21). */
  async verificar(folio: string) {
    const certificado = await this.repositorio.buscarCertificadoPorFolio(folio.trim().toUpperCase());
    if (certificado === null) throw noEncontrado(`folio ${folio} inexistente`);
    return {
      folio: certificado.folio,
      valido: certificadoEsValido(certificado),
      hdu: { codigo: certificado.hduCodigo, titulo: certificado.hduTitulo },
      emitidoEn: certificado.emitidoEn.toISOString(),
      emitidoPor: certificado.emitidoPorNombre,
      huellaSha256: certificado.huellaSha256,
    };
  }

  private async conDescarga(certificado: RegistroCertificado) {
    const url = await this.almacen.firmarDescarga(BUCKET_CERTIFICADOS, certificado.rutaPdf, SEGUNDOS_DESCARGA, `${certificado.folio}.pdf`);
    return {
      hduId: certificado.hduId,
      certificado: vistaCertificado(certificado),
      descarga: { url, expiraEn: new Date(Date.now() + SEGUNDOS_DESCARGA * 1000).toISOString() },
    };
  }

  private async evidenciaDeArchivo(hduId: string, clave: ClaveEntregable, ruta: string) {
    if (!ruta.startsWith(prefijoEvidencia(hduId, clave)) || ruta.includes('..')) {
      throw errorEvidenciaInvalida(`ruta ${ruta} fuera de ${prefijoEvidencia(hduId, clave)}`);
    }
    const metadatos = await this.almacen.metadatos(BUCKET_EVIDENCIAS, ruta);
    if (metadatos === null) throw errorEvidenciaInvalida(`archivo ${ruta} no subido`);
    if (!esTipoContenidoEvidencia(metadatos.tipoContenido) || metadatos.tamanoBytes > TAMANO_MAXIMO_EVIDENCIA) {
      throw errorEvidenciaInvalida(`archivo ${ruta}: ${metadatos.tipoContenido}, ${metadatos.tamanoBytes} bytes`);
    }
    const nombreGuardado = ruta.slice(ruta.lastIndexOf('/') + 1).replace(/^[0-9a-f-]{36}-/, '');
    return {
      evidenciaTipo: 'ARCHIVO' as const,
      evidenciaUrl: null,
      evidenciaRuta: ruta,
      evidenciaNombre: nombreGuardado,
      evidenciaTipoContenido: metadatos.tipoContenido,
      evidenciaTamanoBytes: metadatos.tamanoBytes,
    };
  }
}
