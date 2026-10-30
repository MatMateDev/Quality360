/**
 * Archivos CSV/JSON (E5-B03, E5-B04): vista previa e importación (D102, D104, D125). El portal lee el archivo y lo envía
 * como texto. La vista previa valida y simula con el upsert de Organización (`soloSimular`): no escribe, no audita y no
 * registra ejecución. La importación valida todo de nuevo, registra la ejecución apenas pasa la autorización (también
 * si el archivo se rechaza) y escribe por lotes de 25. El contenido nunca se guarda: solo el nombre, el tamaño y la
 * huella SHA-256.
 */
import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import { mensajeDeError } from '../dominio/catalogos.js';
import { MAXIMO_BYTES_ARCHIVO, Presupuesto, TAMANO_LOTE, resultadoFinal, sumarFila } from '../dominio/ejecucion.js';
import { ErrorEstructuraArchivo, OrganizacionNoDisponible } from '../dominio/errores.js';
import type { FilaMapeada } from '../dominio/mapeo/tipos.js';
import type { CodigoErrorIntegracion, Ejecucion, FilaDetalle, OrigenEjecucion } from '../dominio/tipos.js';
import { contadoresVacios } from '../dominio/tipos.js';
import { procesarLote, trocear, type OpcionesLote } from './lotes.js';
import {
  ConfiguracionRepositorio,
  EjecucionRepositorio,
  LectorArchivo,
  ProveedorOrganizacion,
  Reloj,
  type DestinoHdu,
  type Solicitante,
} from './puertos.js';

export interface EntradaArchivo {
  /** Texto libre a propósito: un formato desconocido es 422 y no 400 (E5-B03-T03). */
  readonly formato: string;
  readonly nombre: string;
  readonly contenido: string;
  readonly estricto: boolean;
  readonly vincularExistentes: boolean;
}

const UUID_NULO = '00000000-0000-0000-0000-000000000000';
const ACCION_DE: Record<FilaDetalle['resultado'], 'CREAR' | 'ACTUALIZAR' | 'OMITIR' | 'ERROR'> = {
  CREADA: 'CREAR',
  ACTUALIZADA: 'ACTUALIZAR',
  OMITIDA: 'OMITIR',
  ERROR: 'ERROR',
};

interface Lectura {
  readonly origen: OrigenEjecucion;
  readonly filas: FilaMapeada[];
  readonly columnasIgnoradas: string[];
}

@Injectable()
export class ArchivosAplicacion {
  private readonly registro = new Logger(ArchivosAplicacion.name);

  constructor(
    private readonly configuraciones: ConfiguracionRepositorio,
    private readonly ejecuciones: EjecucionRepositorio,
    private readonly organizacion: ProveedorOrganizacion,
    private readonly lector: LectorArchivo,
    private readonly reloj: Reloj,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  /** `POST /v1/integraciones/archivos/vista-previa`. Errores de estructura: 413 o 422 con `ejecucionId: null`. */
  async vistaPrevia(solicitante: Solicitante, entrada: EntradaArchivo) {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const lectura = this.leer(entrada, null);
    const destino = await this.destino();
    const opciones = this.opciones(lectura.origen, destino, entrada, true);

    const detalle: FilaDetalle[] = [];
    for (const lote of trocear(lectura.filas, TAMANO_LOTE)) {
      // La vista previa no registra ejecución: sin tiempo o sin Organización es un 503 y no un resultado.
      if (!presupuesto.alcanza()) throw new OrganizacionNoDisponible('sin presupuesto de tiempo para la vista previa');
      const resultado = await procesarLote(this.organizacion, solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs), lote, opciones);
      detalle.push(...resultado.detalle);
    }
    const cuenta = (resultado: FilaDetalle['resultado']): number => detalle.filter((fila) => fila.resultado === resultado).length;
    return {
      formato: lectura.origen,
      filas: detalle.length,
      crear: cuenta('CREADA'),
      actualizar: cuenta('ACTUALIZADA'),
      omitir: cuenta('OMITIDA'),
      errores: cuenta('ERROR'),
      advertencias: detalle.filter((fila) => fila.advertencias.length > 0).length,
      columnasIgnoradas: lectura.columnasIgnoradas,
      detalle: detalle.map((fila) => ({
        fila: fila.fila,
        codigo: fila.codigo,
        titulo: fila.titulo,
        accion: ACCION_DE[fila.resultado],
        motivo: fila.motivo,
        advertencias: fila.advertencias,
        cambios: fila.cambios,
      })),
    };
  }

  /** `POST /v1/integraciones/archivos/importaciones`. */
  async importar(solicitante: Solicitante, entrada: EntradaArchivo): Promise<Ejecucion> {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const bytes = Buffer.from(entrada.contenido, 'utf8');
    const archivo = { nombre: entrada.nombre, tamano: bytes.length, huella: createHash('sha256').update(bytes).digest('hex') };

    let lectura: Lectura;
    try {
      lectura = this.leer(entrada, null);
    } catch (error) {
      // Una estructura rechazada deja una ejecución FALLIDA con la huella (E5-B04-T13); un formato que ni siquiera se
      // reconoce no tiene fuente a la cual atribuirla y no se registra.
      if (!(error instanceof ErrorEstructuraArchivo) || error.codigo === 'FORMATO_NO_SOPORTADO' || error.codigo === 'ARCHIVO_MUY_GRANDE') throw error;
      const ejecucion = await this.iniciar(solicitante, entrada, this.origenDe(entrada.formato), archivo, presupuesto);
      await this.ejecuciones.cerrar(ejecucion.id, {
        ...contadoresVacios(),
        resultado: 'FALLIDA',
        terminadaEn: this.reloj.ahora(),
        duracionMs: Math.max(1, presupuesto.transcurridoMs()),
        codigoError: error.codigo,
        mensajeError: mensajeDeError(error.codigo),
        eventos: [],
        hayMas: false,
        continuarDesde: null,
      });
      throw new ErrorEstructuraArchivo(error.codigo, ejecucion.id, error.columnasFaltantes);
    }

    const destino = await this.destino();
    const ejecucion = await this.iniciar(solicitante, entrada, lectura.origen, archivo, presupuesto);
    try {
      return await this.escribir(solicitante, entrada, lectura, destino, ejecucion, presupuesto);
    } catch (error) {
      this.registro.error(`La ejecución ${ejecucion.id} falló: ${error instanceof Error ? error.name : 'desconocido'}`);
      await this.ejecuciones.interrumpir(ejecucion.id, this.reloj.ahora(), presupuesto.transcurridoMs()).catch(() => undefined);
      throw error;
    }
  }

  // ------------------------------------------------------------------ privados
  private async iniciar(
    solicitante: Solicitante,
    entrada: EntradaArchivo,
    origen: OrigenEjecucion,
    archivo: { nombre: string; tamano: number; huella: string },
    presupuesto: Presupuesto,
  ): Promise<Ejecucion> {
    const actor = await this.organizacion.perfil(solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs));
    return this.ejecuciones.iniciar(
      {
        origen,
        estricto: entrada.estricto,
        vincularExistentes: entrada.vincularExistentes,
        actor: { id: actor.id, nombre: actor.nombre, rol: solicitante.rol },
        proyecto: null,
        sitioHost: null,
        archivo,
        iniciadaEn: this.reloj.ahora(),
      },
      this.configuracion.enCursoMaxMs,
    );
  }

  private origenDe(formato: string): OrigenEjecucion {
    return formato.trim().toUpperCase() === 'JSON' ? 'JSON' : 'CSV';
  }

  /** Tamaño → formato → estructura → filas (D102). El lector es puro: nunca ve la red ni la base. */
  private leer(entrada: EntradaArchivo, ejecucionId: string | null): Lectura {
    if (Buffer.byteLength(entrada.contenido, 'utf8') > MAXIMO_BYTES_ARCHIVO) throw new ErrorEstructuraArchivo('ARCHIVO_MUY_GRANDE', ejecucionId);
    const formato = entrada.formato.trim().toUpperCase();
    if (formato !== 'CSV' && formato !== 'JSON') throw new ErrorEstructuraArchivo('FORMATO_NO_SOPORTADO', ejecucionId);
    const lectura = this.lector.leer(formato, entrada.contenido);
    if (!lectura.ok) throw new ErrorEstructuraArchivo(lectura.codigo, ejecucionId, lectura.columnasFaltantes);
    // `COLUMNA_IGNORADA` aparece una sola vez por archivo, en la primera fila.
    const filas = lectura.filas.map((fila) => ({ ...fila }));
    const primera = filas[0];
    if (lectura.columnasIgnoradas.length > 0 && primera !== undefined && !primera.advertencias.includes('COLUMNA_IGNORADA')) {
      primera.advertencias = [...primera.advertencias, 'COLUMNA_IGNORADA'];
    }
    return { origen: formato, filas, columnasIgnoradas: lectura.columnasIgnoradas };
  }

  /**
   * El destino por defecto es el de la configuración. Sin configuración se envían identificadores nulos: Organización
   * no los encuentra y solo fallan las filas que lo necesitan (`CELULA_NO_ENCONTRADA`, `QE_INVALIDO`, D99).
   */
  private async destino(): Promise<DestinoHdu> {
    const guardada = await this.configuraciones.obtener();
    return guardada === null
      ? { celulaId: UUID_NULO, qeResponsableId: UUID_NULO, sprintRespaldoId: UUID_NULO }
      : { celulaId: guardada.celulaId, qeResponsableId: guardada.qeResponsableId, sprintRespaldoId: guardada.sprintRespaldoId };
  }

  private opciones(origen: OrigenEjecucion, destino: DestinoHdu, entrada: EntradaArchivo, soloSimular: boolean, estricto = false): OpcionesLote {
    return { origen, destino, vincularExistentes: entrada.vincularExistentes, estricto, soloSimular };
  }

  private async escribir(
    solicitante: Solicitante,
    entrada: EntradaArchivo,
    lectura: Lectura,
    destino: DestinoHdu,
    ejecucion: Ejecucion,
    presupuesto: Presupuesto,
  ): Promise<Ejecucion> {
    const contadores = contadoresVacios();
    const estado: { interrupcion: CodigoErrorIntegracion | null } = { interrupcion: null };
    const lotes = trocear(lectura.filas, TAMANO_LOTE);
    const limite = () => presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs);

    /** Envía un lote; devuelve `null` si hay que detenerse (con `estado.interrupcion` fijada). */
    const enviar = async (lote: FilaMapeada[], opciones: OpcionesLote) => {
      if (!presupuesto.alcanza()) {
        estado.interrupcion = 'PRESUPUESTO_DE_TIEMPO';
        return null;
      }
      try {
        return await procesarLote(this.organizacion, solicitante.contexto, limite(), lote, opciones);
      } catch (error) {
        this.registro.error(`Organización no pudo recibir un lote · ${error instanceof Error ? error.name : 'desconocido'}`);
        estado.interrupcion = 'ORGANIZACION_NO_DISPONIBLE';
        return null;
      }
    };

    if (entrada.estricto) {
      // D125: primero se simula el archivo completo. Con una sola fila con error no se escribe nada.
      const simuladas: FilaDetalle[] = [];
      for (const lote of lotes) {
        const resultado = await enviar(lote, this.opciones(lectura.origen, destino, entrada, true));
        if (resultado === null) break;
        simuladas.push(...resultado.detalle);
      }
      if (estado.interrupcion === null) {
        const conError = simuladas.filter((fila) => fila.resultado === 'ERROR');
        if (conError.length > 0) {
          await this.ejecuciones.agregarDetalle(ejecucion.id, conError);
          for (const fila of conError) sumarFila(contadores, fila);
          estado.interrupcion = 'MODO_ESTRICTO';
        }
      }
    }

    if (estado.interrupcion === null) {
      // Modo normal: cada fila es su propia transacción. Modo estricto sin errores: cada lote es una sola transacción.
      for (const lote of lotes) {
        const resultado = await enviar(lote, this.opciones(lectura.origen, destino, entrada, false, entrada.estricto));
        if (resultado === null) break;
        if (resultado.simulado) {
          // Alguien creó una HDU entre la simulación y la escritura: el lote se revirtió completo (D125).
          estado.interrupcion = 'ORGANIZACION_NO_DISPONIBLE';
          break;
        }
        await this.ejecuciones.agregarDetalle(ejecucion.id, resultado.detalle);
        for (const fila of resultado.detalle) sumarFila(contadores, fila);
      }
    }

    const resultado = estado.interrupcion === 'MODO_ESTRICTO' ? 'FALLIDA' : resultadoFinal({ leidas: contadores.leidas, conError: contadores.conError, interrupcion: estado.interrupcion, hayMas: false });
    return this.ejecuciones.cerrar(ejecucion.id, {
      ...contadores,
      resultado,
      terminadaEn: this.reloj.ahora(),
      duracionMs: Math.max(1, presupuesto.transcurridoMs()),
      codigoError: estado.interrupcion,
      mensajeError: estado.interrupcion === null ? null : mensajeDeError(estado.interrupcion),
      eventos: [],
      hayMas: false,
      continuarDesde: null,
    });
  }
}
