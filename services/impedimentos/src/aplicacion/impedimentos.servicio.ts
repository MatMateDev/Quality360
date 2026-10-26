/**
 * Registro y ciclo de vida de los impedimentos (E4-B01, E4-B02).
 *
 * Orden de validación (D89): 401 → 403 → 400 → 409 `HDU_CERRADA` → 422 → 409 `TRANSICION_INVALIDA`.
 * El controlador valida el cuerpo (400) entre `autorizar…` y `registrar`/`ejecutar`, así un
 * usuario sin permiso recibe 403 antes de que se mire lo que envió.
 */
import { Injectable } from '@nestjs/common';
import { ExcepcionQ360 } from '@quality360/auth-nest';

import { FuenteNoDisponible } from '../dominio/errores.js';
import { descripcionMinima, estadoResultante } from '../dominio/impedimento.js';
import { puedeGestionarPorRelacion, puedeRegistrarPorRelacion, permisosDe } from '../dominio/permisos.js';
import { ErrorTransicionImpedimento } from '../dominio/errores.js';
import { ImpedimentoRepositorio, type PlanTransicion } from '../dominio/repositorios.js';
import {
  ETIQUETAS_TIPO,
  TIPOS_IMPEDIMENTO,
  type ImpedimentoRegistro,
  type OperacionImpedimento,
  type PersonaRol,
  type Responsable,
  type TipoImpedimento,
} from '../dominio/tipos.js';
import { Autorizador, hduCerrada, type Solicitante } from './autorizador.js';
import { EvaluadorRiesgo } from './evaluador-riesgo.js';
import { ProveedorSeguimiento, type AccesoHdu } from './puertos.js';
import { operacionesPermitidas, referenciaHdu, vistaAccion, vistaImpedimento, type ReferenciaTemporal } from './vistas.js';

export interface DatosRegistro {
  readonly tipo: TipoImpedimento;
  readonly titulo: string;
  readonly descripcion: string;
  readonly responsableId?: string;
  readonly responsableNombre?: string;
}

/** Cuerpo de resolver, escalar, reabrir y seguimiento ya validado en forma (largo y tipo). */
export interface DatosOperacion {
  /** Comentario o motivo; puede venir en blanco (422). */
  readonly texto: string;
  readonly responsableId?: string;
  readonly responsableNombre?: string;
}

export interface GestionPrevia {
  readonly impedimento: ImpedimentoRegistro;
  readonly acceso: AccesoHdu;
}

function invalido(codigo: 'RESPONSABLE_INVALIDO' | 'COMENTARIO_REQUERIDO' | 'MOTIVO_REQUERIDO', campo: string, mensaje?: string): ExcepcionQ360 {
  return new ExcepcionQ360(422, codigo, {
    ...(mensaje === undefined ? {} : { mensaje }),
    detalles: [{ campo, codigo: codigo === 'RESPONSABLE_INVALIDO' ? 'NO_PERMITIDO' : 'REQUERIDO', mensaje: mensaje ?? 'Dato inválido.' }],
  });
}

@Injectable()
export class ImpedimentosAplicacion {
  constructor(
    private readonly autorizador: Autorizador,
    private readonly impedimentos: ImpedimentoRepositorio,
    private readonly seguimiento: ProveedorSeguimiento,
    private readonly evaluador: EvaluadorRiesgo,
  ) {}

  private tiempo(): ReferenciaTemporal {
    const ahora = new Date();
    return { ahora, hoy: this.evaluador.hoy(ahora) };
  }

  catalogo() {
    return {
      items: TIPOS_IMPEDIMENTO.map((codigo) => ({ codigo, etiqueta: ETIQUETAS_TIPO[codigo], descripcionMinima: descripcionMinima(codigo) })),
    };
  }

  /** Sección «Impedimentos» del detalle: bloqueo, conteos, permisos y la lista (D75). */
  async listarHdu(hduId: string, solicitante: Solicitante) {
    const acceso = await this.autorizador.acceso(hduId, solicitante);
    const filas = await this.impedimentos.listarPorHdu(hduId);
    const tiempo = this.tiempo();
    const bloqueantes = filas.filter((fila) => fila.estado !== 'RESUELTO').sort((a, b) => a.abiertoDesde.getTime() - b.abiertoDesde.getTime() || a.id.localeCompare(b.id));
    const resueltos = filas
      .filter((fila) => fila.estado === 'RESUELTO')
      .sort((a, b) => (b.fechaResolucion?.getTime() ?? 0) - (a.fechaResolucion?.getTime() ?? 0) || a.id.localeCompare(b.id));
    return {
      hduId,
      hduCerrada: acceso.hdu.estado === 'CERRADA',
      bloqueada: bloqueantes.length > 0,
      abiertos: bloqueantes.filter((fila) => fila.estado === 'ABIERTO').length,
      escalados: bloqueantes.filter((fila) => fila.estado === 'ESCALADO').length,
      resueltos: resueltos.length,
      permisos: permisosDe(acceso.relacion, acceso.hdu.estado),
      items: [...bloqueantes, ...resueltos].map((fila) => vistaImpedimento(fila, tiempo, operacionesPermitidas(acceso.relacion, acceso.hdu.estado, fila))),
    };
  }

  /** Candidatos de la tabla 3.5. Solo el Analista asignado y el QE responsable. */
  async candidatos(hduId: string, proposito: 'REGISTRO' | 'ESCALAMIENTO', solicitante: Solicitante) {
    const permitida = proposito === 'REGISTRO' ? puedeRegistrarPorRelacion : puedeGestionarPorRelacion;
    const acceso = await this.autorizador.accesoCon(hduId, solicitante, permitida, { incluirCandidatos: true });
    const items = proposito === 'REGISTRO' ? (acceso.candidatos?.registro ?? []) : (acceso.candidatos?.escalamiento ?? []);
    return { hduId, proposito, items, preseleccionadoId: proposito === 'REGISTRO' ? acceso.hdu.qeResponsable.id : null };
  }

  /** Paso previo al registro: solo el Analista asignado y el QE responsable (403 al resto). */
  autorizarRegistro(hduId: string, solicitante: Solicitante): Promise<AccesoHdu> {
    return this.autorizador.accesoCon(hduId, solicitante, puedeRegistrarPorRelacion, { incluirCandidatos: true });
  }

  async registrar(acceso: AccesoHdu, datos: DatosRegistro, solicitante: Solicitante) {
    if (acceso.hdu.estado === 'CERRADA') throw hduCerrada();
    const responsable = this.responsableDeRegistro(acceso, datos);

    // D58: el ciclo activo se guarda si existe; si Certificaciones no responde, queda NULL y el registro sigue.
    let certificacionId: string | null = null;
    try {
      const estados = await this.seguimiento.estados([acceso.hdu.id], solicitante.contexto);
      certificacionId = estados.get(acceso.hdu.id)?.certificacionId ?? null;
    } catch (error) {
      if (!(error instanceof FuenteNoDisponible)) throw error;
    }

    const ahora = new Date();
    const { impedimento, accion } = await this.impedimentos.crear({
      hduId: acceso.hdu.id,
      certificacionId,
      tipo: datos.tipo,
      titulo: datos.titulo,
      descripcion: datos.descripcion,
      responsable,
      creadoPor: acceso.actor,
      ahora,
    });
    return this.detalle(impedimento, [accion], acceso);
  }

  private responsableDeRegistro(acceso: AccesoHdu, datos: DatosRegistro): Responsable {
    if (datos.responsableId !== undefined) {
      const candidato = acceso.candidatos?.registro.find((persona) => persona.id === datos.responsableId);
      if (candidato === undefined) throw invalido('RESPONSABLE_INVALIDO', 'responsableId', 'El responsable indicado no está entre los candidatos de esta HDU.');
      return { id: candidato.id, nombre: candidato.nombre };
    }
    return { id: null, nombre: datos.responsableNombre ?? '' };
  }

  /** Detalle de un impedimento con su historial, para quien ve la HDU. */
  async obtener(id: string, solicitante: Solicitante) {
    const impedimento = await this.impedimentos.buscarPorId(id);
    if (impedimento === null) throw this.autorizador.noAccesible(solicitante);
    const acceso = await this.autorizador.acceso(impedimento.hduId, solicitante);
    return this.detalle(impedimento, await this.impedimentos.acciones(id), acceso);
  }

  /** Paso previo a resolver, escalar, reabrir o dar seguimiento: solo el QE responsable. */
  async autorizarGestion(id: string, solicitante: Solicitante, opciones: { incluirCandidatos?: boolean } = {}): Promise<GestionPrevia> {
    const impedimento = await this.impedimentos.buscarPorId(id);
    if (impedimento === null) throw this.autorizador.noAccesible(solicitante);
    const acceso = await this.autorizador.accesoCon(impedimento.hduId, solicitante, puedeGestionarPorRelacion, opciones);
    return { impedimento, acceso };
  }

  async ejecutar(operacion: OperacionImpedimento, previa: GestionPrevia, datos: DatosOperacion) {
    const { impedimento: visto, acceso } = previa;
    if (acceso.hdu.estado === 'CERRADA') throw hduCerrada();

    const comentario = datos.texto.trim();
    if (comentario.length === 0) {
      throw operacion === 'REABRIR'
        ? invalido('MOTIVO_REQUERIDO', 'motivo', 'Indica el motivo del cambio.')
        : invalido('COMENTARIO_REQUERIDO', 'comentario', 'Indica la acción tomada.');
    }
    const responsableNuevo = operacion === 'ESCALAR' ? this.destinoDeEscalamiento(visto, acceso, datos) : undefined;

    const actor: PersonaRol = acceso.actor;
    const ahora = new Date();
    const resultado = await this.impedimentos.transicionar(visto.id, (actual): PlanTransicion => {
      const estado = estadoResultante(actual.estado, operacion);
      // Si el estado ya no es el que vio quien pidió, otra orden se adelantó (D62).
      if (estado === null) throw new ErrorTransicionImpedimento(actual.estado, operacion, actual.estado !== visto.estado);
      return { tipo: operacion, estado, comentario, actor, ahora, ...(responsableNuevo === undefined ? {} : { responsableNuevo }) };
    });

    return {
      impedimento: vistaImpedimento(resultado.impedimento, this.tiempo(), operacionesPermitidas(acceso.relacion, acceso.hdu.estado, resultado.impedimento)),
      accion: vistaAccion(resultado.accion),
      hdu: { bloqueada: resultado.abiertosHdu > 0, abiertos: resultado.abiertosHdu },
    };
  }

  /** Destino del escalamiento (D64): candidato de `ESCALAMIENTO` o tercero; distinto del responsable actual (D92). */
  private destinoDeEscalamiento(impedimento: ImpedimentoRegistro, acceso: AccesoHdu, datos: DatosOperacion): Responsable {
    if (datos.responsableId !== undefined) {
      const candidato = acceso.candidatos?.escalamiento.find((persona) => persona.id === datos.responsableId);
      if (candidato === undefined) throw invalido('RESPONSABLE_INVALIDO', 'responsableId', 'El destino indicado no está entre los candidatos de esta HDU.');
      if (impedimento.responsable.id === candidato.id) throw invalido('RESPONSABLE_INVALIDO', 'responsableId', 'El destino es el responsable actual.');
      return { id: candidato.id, nombre: candidato.nombre };
    }
    const nombre = (datos.responsableNombre ?? '').trim();
    if (impedimento.responsable.id === null && impedimento.responsable.nombre.trim().toLowerCase() === nombre.toLowerCase()) {
      throw invalido('RESPONSABLE_INVALIDO', 'responsableNombre', 'El destino es el responsable actual.');
    }
    return { id: null, nombre };
  }

  private detalle(impedimento: ImpedimentoRegistro, acciones: Parameters<typeof vistaAccion>[0][], acceso: AccesoHdu) {
    return {
      ...vistaImpedimento(impedimento, this.tiempo(), operacionesPermitidas(acceso.relacion, acceso.hdu.estado, impedimento)),
      hdu: referenciaHdu(acceso.hdu),
      hduCerrada: acceso.hdu.estado === 'CERRADA',
      permisos: permisosDe(acceso.relacion, acceso.hdu.estado),
      acciones: acciones.map(vistaAccion),
    };
  }
}

