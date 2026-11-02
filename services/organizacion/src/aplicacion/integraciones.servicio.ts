/**
 * Internos de E5 para Integraciones (D100, D120, D124): validar y nombrar el destino de las HDU importadas y
 * crear o actualizar HDU en lotes. Nunca llama a Certificaciones ni a Impedimentos.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ConflictoUnicidad } from '../dominio/errores/conflicto-unicidad.js';
import { esQeResponsableValido, normalizarCodigoHdu, sprintEsDeCelula } from '../dominio/reglas/alta-hdu.js';
import {
  PRIORIDAD_POR_DEFECTO,
  decidirSobreExistente,
  elegirSprint,
  textoNoVacio,
  validarReglasDeFila,
  type AdvertenciaUpsert,
  type CambiosHdu,
  type FilaUpsert,
  type MotivoFilaUpsert,
  type ResultadoFilaUpsert,
} from '../dominio/reglas/upsert-hdu.js';
import { CATALOGO_REPOSITORIO, type CatalogoRepositorio } from '../dominio/repositorios/catalogo.repositorio.js';
import {
  INTEGRACION_HDU_REPOSITORIO,
  type IntegracionHduRepositorio,
  type UnidadTrabajoUpsert,
} from '../dominio/repositorios/integracion-hdu.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import type { Actor, Celula, OrigenHdu, PrioridadHdu, Sprint, Usuario } from '../dominio/tipos.js';

export interface DestinoHdu {
  readonly celulaId: string;
  readonly qeResponsableId: string;
  readonly sprintRespaldoId: string;
}

export interface DetalleDestino {
  campo: string;
  codigo: 'NO_EXISTE' | 'NO_PERMITIDO';
  mensaje: string;
}

export interface DestinoResuelto {
  celula: { id: string; nombre: string } | null;
  qeResponsable: { id: string; nombre: string } | null;
  sprintRespaldo: { id: string; nombre: string } | null;
  errores: DetalleDestino[];
}

export interface SolicitudUpsert {
  readonly origen: Exclude<OrigenHdu, 'MANUAL'>;
  readonly soloSimular: boolean;
  readonly vincularExistentes: boolean;
  readonly estricto: boolean;
  readonly destino: DestinoHdu;
  readonly sprintNoEncontrado: 'RESPALDO' | 'ERROR';
  readonly filas: readonly FilaUpsert[];
}

export interface ResultadoFila {
  fila: number;
  codigo: string;
  resultado: ResultadoFilaUpsert;
  motivo: MotivoFilaUpsert | null;
  idHistoria: string | null;
  advertencias: AdvertenciaUpsert[];
  cambios: CambiosHdu | null;
}

export interface ResultadoUpsert {
  simulado: boolean;
  filas: ResultadoFila[];
}

/** El lote estricto tuvo al menos una fila con error: se revierte completo (D125). */
class LoteRevertido extends Error {
  constructor(readonly filas: ResultadoFila[]) {
    super('lote estricto revertido');
  }
}

interface ContextoLote {
  readonly solicitud: SolicitudUpsert;
  readonly actor: Actor;
  readonly destino: DestinoResuelto;
  readonly respaldo: Sprint | null;
  readonly qeDestino: Usuario | null;
}

function persona(usuario: Usuario | null): { id: string; nombre: string } | null {
  return usuario === null ? null : { id: usuario.id, nombre: usuario.nombre };
}

@Injectable()
export class IntegracionesAplicacion {
  private readonly registro = new Logger(IntegracionesAplicacion.name);

  constructor(
    @Inject(CATALOGO_REPOSITORIO) private readonly catalogos: CatalogoRepositorio,
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    @Inject(INTEGRACION_HDU_REPOSITORIO) private readonly repositorio: IntegracionHduRepositorio,
  ) {}

  /** `POST /v1/interno/integraciones/destino`: es una lectura; no escribe nada. */
  async resolverDestino(destino: DestinoHdu): Promise<DestinoResuelto> {
    const [celula, sprint, qe] = await Promise.all([
      this.catalogos.buscarCelula(destino.celulaId),
      this.catalogos.buscarSprint(destino.sprintRespaldoId),
      this.usuarios.buscarPorId(destino.qeResponsableId),
    ]);
    const errores: DetalleDestino[] = [];
    if (celula === null) errores.push({ campo: 'celulaId', codigo: 'NO_EXISTE', mensaje: 'La célula no existe.' });
    if (sprint === null) errores.push({ campo: 'sprintRespaldoId', codigo: 'NO_EXISTE', mensaje: 'El sprint de respaldo no existe.' });
    else if (celula !== null && !sprintEsDeCelula(sprint, celula.id)) {
      errores.push({ campo: 'sprintRespaldoId', codigo: 'NO_PERMITIDO', mensaje: 'El sprint de respaldo debe pertenecer a la célula elegida.' });
    }
    if (qe === null) errores.push({ campo: 'qeResponsableId', codigo: 'NO_EXISTE', mensaje: 'El QE responsable no existe.' });
    else if (!esQeResponsableValido(qe)) errores.push({ campo: 'qeResponsableId', codigo: 'NO_PERMITIDO', mensaje: 'El QE responsable debe tener rol QE y estar activo.' });
    return {
      celula,
      qeResponsable: persona(qe),
      sprintRespaldo: sprint === null ? null : { id: sprint.id, nombre: sprint.nombre },
      errores,
    };
  }

  /**
   * `POST /v1/interno/integraciones/hdu/upsert`. Con `soloSimular` no escribe ni audita. Con `estricto` el lote es
   * una sola transacción: si una fila da error se revierte todo y la respuesta es `simulado: true` (nada se
   * escribió) con el resultado de cada fila. En modo normal cada fila es su propia transacción.
   */
  async upsert(solicitud: SolicitudUpsert, actor: Actor): Promise<ResultadoUpsert> {
    const destino = await this.resolverDestino(solicitud.destino);
    const respaldo = await this.catalogos.buscarSprint(solicitud.destino.sprintRespaldoId);
    const qeDestino = await this.usuarios.buscarPorId(solicitud.destino.qeResponsableId);
    const contexto: ContextoLote = { solicitud, actor, destino, respaldo, qeDestino };

    if (solicitud.soloSimular) return { simulado: true, filas: await this.recorrer(this.repositorio.soloLectura(), contexto, false) };

    if (solicitud.estricto) {
      try {
        return await this.repositorio.enTransaccion(async (unidad) => {
          const filas = await this.recorrer(unidad, contexto, true);
          if (filas.some((fila) => fila.resultado === 'ERROR')) throw new LoteRevertido(filas);
          return { simulado: false, filas };
        });
      } catch (error) {
        if (error instanceof LoteRevertido) {
          // Nada se escribió: las altas no tienen id.
          return { simulado: true, filas: error.filas.map((fila) => (fila.resultado === 'CREADA' ? { ...fila, idHistoria: null } : fila)) };
        }
        this.registro.error(`El lote estricto falló y se revirtió: ${error instanceof Error ? error.message : 'desconocido'}`);
        return { simulado: true, filas: await this.recorrer(this.repositorio.soloLectura(), contexto, false) };
      }
    }

    const filas: ResultadoFila[] = [];
    for (const fila of solicitud.filas) filas.push(await this.filaEnSuTransaccion(fila, contexto));
    return { simulado: false, filas };
  }

  private async recorrer(unidad: UnidadTrabajoUpsert, contexto: ContextoLote, escribir: boolean): Promise<ResultadoFila[]> {
    const filas: ResultadoFila[] = [];
    for (const fila of contexto.solicitud.filas) filas.push(await this.procesarFila(unidad, contexto, fila, escribir));
    return filas;
  }

  /** Modo normal: una transacción por fila. Un fallo inesperado es `ERROR_INTERNO` y no detiene a las demás. */
  private async filaEnSuTransaccion(fila: FilaUpsert, contexto: ContextoLote): Promise<ResultadoFila> {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        return await this.repositorio.enTransaccion((unidad) => this.procesarFila(unidad, contexto, fila, true));
      } catch (error) {
        // Carrera: alguien creó el mismo código entre la lectura y la escritura. Se vuelve a decidir con lo que ya existe.
        if (error instanceof ConflictoUnicidad && intento === 1) continue;
        this.registro.error(`Fila ${fila.fila} (${fila.codigo}) falló: ${error instanceof Error ? error.message : 'desconocido'}`);
        return this.errorDeFila(fila, 'ERROR_INTERNO');
      }
    }
    return this.errorDeFila(fila, 'ERROR_INTERNO');
  }

  private errorDeFila(fila: FilaUpsert, motivo: MotivoFilaUpsert): ResultadoFila {
    return { fila: fila.fila, codigo: fila.codigo, resultado: 'ERROR', motivo, idHistoria: null, advertencias: [], cambios: null };
  }

  /** El algoritmo por fila (D97, D98, D100, D120). */
  private async procesarFila(unidad: UnidadTrabajoUpsert, contexto: ContextoLote, fila: FilaUpsert, escribir: boolean): Promise<ResultadoFila> {
    const { solicitud, actor } = contexto;

    // 1. Reglas de la fila.
    const invalida = validarReglasDeFila(fila);
    if (invalida !== null) return this.errorDeFila(fila, invalida);

    // 2. La HDU, por código sin distinguir mayúsculas.
    const codigo = fila.codigo.trim();
    const existente = await unidad.buscarPorCodigoNormalizado(normalizarCodigoHdu(codigo));

    // 3. Existe.
    if (existente !== null) {
      const decision = decidirSobreExistente(existente, fila, { vincularExistentes: solicitud.vincularExistentes });
      if (decision.tipo === 'OMITIR') {
        return { fila: fila.fila, codigo, resultado: 'OMITIDA', motivo: decision.motivo, idHistoria: existente.id, advertencias: [], cambios: null };
      }
      if (escribir) {
        await unidad.actualizar(
          {
            antes: existente,
            datos: decision.datos,
            vincula: decision.vincula
              ? { origen: solicitud.origen, claveExterna: textoNoVacio(fila.claveExterna), urlExterna: textoNoVacio(fila.urlExterna) }
              : null,
          },
          actor,
        );
      }
      return { fila: fila.fila, codigo, resultado: 'ACTUALIZADA', motivo: null, idHistoria: existente.id, advertencias: [], cambios: decision.cambios };
    }

    // 4. No existe: célula, sprint y QE.
    const nombreCelula = textoNoVacio(fila.celula);
    let celula: Celula | null;
    if (nombreCelula !== null) celula = await this.catalogos.buscarCelulaPorNombre(nombreCelula);
    else celula = contexto.destino.celula;
    if (celula === null) return this.errorDeFila(fila, 'CELULA_NO_ENCONTRADA');

    const nombreSprint = textoNoVacio(fila.sprint);
    const sprintDeLaCelula = nombreSprint === null ? null : await this.catalogos.buscarSprintDeCelulaPorNombre(celula.id, nombreSprint);
    const sprint = elegirSprint({
      nombreEnFila: nombreSprint,
      sprintDeLaCelula,
      respaldo: contexto.respaldo,
      celulaId: celula.id,
      sprintNoEncontrado: solicitud.sprintNoEncontrado,
    });
    if (!sprint.ok) return this.errorDeFila(fila, sprint.motivo);

    const correoQe = textoNoVacio(fila.qeCorreo);
    const qe = correoQe === null ? contexto.qeDestino : await this.usuarios.buscarPorCorreo(correoQe.toLowerCase());
    if (!esQeResponsableValido(qe)) return this.errorDeFila(fila, 'QE_INVALIDO');

    let idHistoria: string | null = null;
    if (escribir) {
      const creada = await unidad.crear(
        {
          codigo,
          titulo: textoNoVacio(fila.titulo) as string,
          descripcion: textoNoVacio(fila.descripcion),
          prioridad: (fila.prioridad as PrioridadHdu | null) ?? PRIORIDAD_POR_DEFECTO,
          celulaId: celula.id,
          sprintId: sprint.sprintId,
          qeResponsableId: (qe as Usuario).id,
          origen: solicitud.origen,
          claveExterna: solicitud.origen === 'JIRA' ? textoNoVacio(fila.claveExterna) : null,
          urlExterna: solicitud.origen === 'JIRA' ? textoNoVacio(fila.urlExterna) : null,
        },
        actor,
      );
      idHistoria = creada.id;
    }
    return {
      fila: fila.fila,
      codigo,
      resultado: 'CREADA',
      motivo: null,
      idHistoria,
      advertencias: sprint.advertencia === null ? [] : [sprint.advertencia],
      cambios: null,
    };
  }
}
