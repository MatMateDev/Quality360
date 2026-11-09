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
import {
  proponerAnalistaUnico,
  proponerSprint,
  validarAsignacion,
  type ErrorAsignacion,
  type PropuestaSprint,
} from '../dominio/reglas/asignacion-hdu.js';
import { CELULA_LIDER_REPOSITORIO, type CelulaLiderRepositorio } from '../dominio/repositorios/celula-lider.repositorio.js';
import { HDU_REPOSITORIO, type HduRepositorio } from '../dominio/repositorios/hdu.repositorio.js';
import { SUPERVISION_REPOSITORIO, type SupervisionRepositorio } from '../dominio/repositorios/supervision.repositorio.js';
import { CATALOGO_REPOSITORIO, type CatalogoRepositorio } from '../dominio/repositorios/catalogo.repositorio.js';
import {
  INTEGRACION_HDU_REPOSITORIO,
  type HduExistenteUpsert,
  type IntegracionHduRepositorio,
  type UnidadTrabajoUpsert,
} from '../dominio/repositorios/integracion-hdu.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import type { Actor, Celula, EstadoHdu, OrigenHdu, PrioridadHdu, Sprint, Usuario } from '../dominio/tipos.js';

export interface EstadoCodigoHdu {
  codigo: string;
  existe: boolean;
  idHistoria: string | null;
  estado: EstadoHdu | null;
  origen: OrigenHdu | null;
  titulo: string | null;
  descripcion: string | null;
  prioridad: PrioridadHdu | null;
  qeResponsable: string | null;
  /** Nombre del Analista asignado o `null` (D204). */
  analista: string | null;
}

export interface AsignacionAValidar {
  readonly ref: string;
  readonly celulaId?: string;
  readonly qeResponsableId?: string;
  readonly analistaId?: string;
  readonly sprintId?: string;
  readonly proponerAnalista?: boolean;
  readonly proponerSprint?: { readonly nombreJira: string | null; readonly respaldoId: string | null };
}

interface SprintPropuestoRespuesta {
  sprint: { id: string; nombre: string } | null;
  origen: 'JIRA' | 'RESPALDO' | null;
  sprintJiraNoEncontrado: boolean;
}

export interface AsignacionValidada {
  ref: string;
  valida: boolean;
  errores: ErrorAsignacion[];
  celula: { id: string; nombre: string } | null;
  qeResponsable: { id: string; nombre: string } | null;
  analista: { id: string; nombre: string } | null;
  sprint: { id: string; nombre: string } | null;
  sprintPropuesto: SprintPropuestoRespuesta | null;
  celulaSinLiderActivo: boolean;
  /** Solo con `proponerAnalista` y QE válido (D201); `null` en otro caso. */
  analistasActivos: number | null;
  analistaPropuesto: { id: string; nombre: string } | null;
}

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
  /** Presente solo en el modo confirmación (D140, D151): cada fila trae `operacion` y no se usan `destino` ni `sprintNoEncontrado`. */
  readonly consultaId?: string;
  readonly soloSimular: boolean;
  readonly vincularExistentes: boolean;
  readonly estricto: boolean;
  readonly destino?: DestinoHdu;
  readonly sprintNoEncontrado?: 'RESPALDO' | 'ERROR';
  readonly filas: readonly FilaUpsert[];
}

/** Modo archivo: `destino` y `sprintNoEncontrado` son obligatorios. */
interface SolicitudArchivo extends SolicitudUpsert {
  readonly destino: DestinoHdu;
  readonly sprintNoEncontrado: 'RESPALDO' | 'ERROR';
}

export interface ResultadoFila {
  fila: number;
  codigo: string;
  resultado: ResultadoFilaUpsert;
  motivo: MotivoFilaUpsert | null;
  idHistoria: string | null;
  advertencias: AdvertenciaUpsert[];
  cambios: CambiosHdu | null;
  /** Solo con `ASIGNACION_INVALIDA` (D140). */
  errorAsignacion?: ErrorAsignacion;
  /** Solo modo confirmación, `CREAR` y `HDU_CREADA_DESPUES` (D202, D204). */
  existente?: HduExistenteUpsert;
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
  readonly solicitud: SolicitudArchivo;
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
    @Inject(HDU_REPOSITORIO) private readonly hdus: HduRepositorio,
    @Inject(SUPERVISION_REPOSITORIO) private readonly supervision: SupervisionRepositorio,
    @Inject(CELULA_LIDER_REPOSITORIO) private readonly lideres: CelulaLiderRepositorio,
  ) {}

  /**
   * `POST /v1/interno/integraciones/hdu/estado-codigos` (D136): una consulta `codigo_normalizado IN (...)` para todos los
   * códigos. Lectura: no escribe ni audita. Un código con formato inválido responde `existe: false`.
   */
  async estadoCodigos(codigos: readonly string[]): Promise<{ items: EstadoCodigoHdu[] }> {
    const normalizados = codigos.map((codigo) => normalizarCodigoHdu(codigo));
    const encontradas = await this.hdus.buscarPorCodigosNormalizados([...new Set(normalizados)]);
    const porCodigo = new Map(encontradas.map((hdu) => [normalizarCodigoHdu(hdu.codigo), hdu]));
    const nombres = new Map((await this.usuarios.listarResumenPorIds([...new Set(encontradas.flatMap((hdu) => (hdu.analistaId === null ? [hdu.qeResponsableId] : [hdu.qeResponsableId, hdu.analistaId])))])).map((u) => [u.id, u.nombre]));
    return {
      items: codigos.map((codigo, indice) => {
        const hdu = porCodigo.get(normalizados[indice] as string);
        if (hdu === undefined) {
          return { codigo, existe: false, idHistoria: null, estado: null, origen: null, titulo: null, descripcion: null, prioridad: null, qeResponsable: null, analista: null };
        }
        return {
          codigo,
          existe: true,
          idHistoria: hdu.id,
          estado: hdu.estado,
          origen: hdu.origen,
          titulo: hdu.titulo,
          descripcion: hdu.descripcion,
          prioridad: hdu.prioridad,
          qeResponsable: nombres.get(hdu.qeResponsableId) ?? null,
          analista: hdu.analistaId === null ? null : (nombres.get(hdu.analistaId) ?? null),
        };
      }),
    };
  }

  /**
   * `POST /v1/interno/integraciones/asignaciones/validar` (D138, D137, D151): valida cada combinación con las mismas
   * reglas de dominio que la asignación de E2 y propone el sprint. Lectura; responde 200 aunque haya errores.
   */
  async validarAsignaciones(asignaciones: readonly AsignacionAValidar[]): Promise<{ resultados: AsignacionValidada[] }> {
    const memo = <T>(mapa: Map<string, Promise<T>>, clave: string, buscar: () => Promise<T>): Promise<T> => {
      let promesa = mapa.get(clave);
      if (promesa === undefined) {
        promesa = buscar();
        mapa.set(clave, promesa);
      }
      return promesa;
    };
    const celulas = new Map<string, Promise<Celula | null>>();
    const sprints = new Map<string, Promise<Sprint | null>>();
    const usuarios = new Map<string, Promise<Usuario | null>>();
    const equipos = new Map<string, Promise<string[]>>();
    const lideres = new Map<string, Promise<boolean>>();
    const activos = new Map<string, Promise<Array<{ id: string; nombre: string; correo: string }>>>();
    const porNombre = new Map<string, Promise<Sprint | null>>();
    const celula = (id: string) => memo(celulas, id, () => this.catalogos.buscarCelula(id));
    const sprint = (id: string) => memo(sprints, id, () => this.catalogos.buscarSprint(id));
    const usuario = (id: string) => memo(usuarios, id, () => this.usuarios.buscarPorId(id));

    const resultados: AsignacionValidada[] = [];
    for (const a of asignaciones) {
      const [celulaEnc, qe, analista, sprintEnc] = await Promise.all([
        a.celulaId === undefined ? null : celula(a.celulaId),
        a.qeResponsableId === undefined ? null : usuario(a.qeResponsableId),
        a.analistaId === undefined ? null : usuario(a.analistaId),
        a.sprintId === undefined ? null : sprint(a.sprintId),
      ]);
      const qeValido = qe !== null && esQeResponsableValido(qe);
      const equipoDelQe = a.analistaId !== undefined && qeValido ? await memo(equipos, qe.id, () => this.supervision.listarAnalistasVigentesIds(qe.id)) : null;
      const errores = validarAsignacion(
        { celulaId: a.celulaId !== undefined, qeResponsableId: a.qeResponsableId !== undefined, analistaId: a.analistaId !== undefined, sprintId: a.sprintId !== undefined },
        { celula: celulaEnc, qe, analista, sprint: sprintEnc, equipoDelQe },
      );
      const fallo = (campo: ErrorAsignacion['campo']) => errores.some((e) => e.campo === campo);

      let propuesto: SprintPropuestoRespuesta | null = null;
      if (a.proponerSprint !== undefined && a.sprintId === undefined && celulaEnc !== null && !fallo('celulaId')) {
        const { nombreJira, respaldoId } = a.proponerSprint;
        const nombreBuscado = nombreJira !== null && nombreJira.trim().length > 0 ? nombreJira.trim() : null;
        const [delNombre, respaldo] = await Promise.all([
          nombreBuscado === null ? null : memo(porNombre, `${celulaEnc.id}|${nombreBuscado.toLowerCase()}`, () => this.catalogos.buscarSprintDeCelulaPorNombre(celulaEnc.id, nombreBuscado)),
          respaldoId === null ? null : sprint(respaldoId),
        ]);
        const propuesta: PropuestaSprint = proponerSprint({ nombreJira: nombreBuscado, sprintDeLaCelulaConEseNombre: delNombre, respaldo, celulaId: celulaEnc.id });
        const elegido = propuesta.sprintId === null ? null : (propuesta.sprintId === delNombre?.id ? delNombre : respaldo);
        propuesto = {
          sprint: elegido === null ? null : { id: elegido.id, nombre: elegido.nombre },
          origen: propuesta.origen,
          sprintJiraNoEncontrado: propuesta.sprintJiraNoEncontrado,
        };
      }

      let analistasActivos: number | null = null;
      let analistaPropuesto: { id: string; nombre: string } | null = null;
      if (a.proponerAnalista === true && qeValido) {
        const equipoActivo = await memo(activos, qe.id, () => this.supervision.listarAnalistasActivosDelEquipo(qe.id));
        analistasActivos = equipoActivo.length;
        const unico = a.analistaId === undefined ? proponerAnalistaUnico(equipoActivo) : null;
        analistaPropuesto = unico === null ? null : { id: unico.id, nombre: unico.nombre };
      }

      const celulaValida = celulaEnc !== null && !fallo('celulaId') ? celulaEnc : null;
      const sinLider = celulaValida === null ? false : !(await memo(lideres, celulaValida.id, async () => (await this.lideres.lideresActivosDeCelula(celulaValida.id)).length > 0));
      resultados.push({
        ref: a.ref,
        valida: errores.length === 0,
        errores,
        celula: celulaValida === null ? null : { id: celulaValida.id, nombre: celulaValida.nombre },
        qeResponsable: qe !== null && !fallo('qeResponsableId') ? persona(qe) : null,
        analista: analista !== null && !fallo('analistaId') ? persona(analista) : null,
        sprint: sprintEnc !== null && !fallo('sprintId') ? { id: sprintEnc.id, nombre: sprintEnc.nombre } : null,
        sprintPropuesto: propuesto,
        celulaSinLiderActivo: sinLider,
        analistasActivos,
        analistaPropuesto,
      });
    }
    return { resultados };
  }

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
  async upsert(entrada: SolicitudUpsert, actor: Actor): Promise<ResultadoUpsert> {
    if (entrada.consultaId !== undefined) return this.confirmar(entrada, actor);
    const solicitud = entrada as SolicitudArchivo;
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

  /**
   * Modo confirmación (D140, D151): cada fila es su propia transacción y trae su `operacion`. `CREAR` nunca actualiza
   * (si el código ya existe, `HDU_CREADA_DESPUES`, también cuando la unicidad salta al insertar) y vuelve a validar la
   * asignación con D138; `ACTUALIZAR` vincula siempre (D144) y solo toca título, descripción y prioridad.
   */
  private async confirmar(solicitud: SolicitudUpsert, actor: Actor): Promise<ResultadoUpsert> {
    const filas: ResultadoFila[] = [];
    for (const fila of solicitud.filas) filas.push(await this.filaDeConfirmacion(fila, solicitud, actor));
    return { simulado: false, filas };
  }

  private async filaDeConfirmacion(fila: FilaUpsert, solicitud: SolicitudUpsert, actor: Actor): Promise<ResultadoFila> {
    try {
      // Lectura pura antes de abrir la transacción: con connection_limit=1 no se puede pedir otra conexión mientras la unidad de trabajo tiene la única.
      const errorAsignacion = fila.operacion === 'CREAR' && fila.asignacion !== undefined && validarReglasDeFila(fila) === null ? await this.errorDeAsignacion(fila.asignacion) : null;
      return await this.repositorio.enTransaccion((unidad) => this.procesarConfirmacion(unidad, solicitud, fila, actor, errorAsignacion));
    } catch (error) {
      if (error instanceof ConflictoUnicidad) {
        const existente = await this.repositorio.soloLectura().buscarPorCodigoNormalizado(normalizarCodigoHdu(fila.codigo.trim()));
        const detalle = existente === null || solicitud.consultaId === undefined ? null : await this.repositorio.soloLectura().describirExistente(existente.id, solicitud.consultaId, actor.id);
        return { fila: fila.fila, codigo: fila.codigo.trim(), resultado: 'OMITIDA', motivo: 'HDU_CREADA_DESPUES', idHistoria: existente?.id ?? null, advertencias: [], cambios: null, ...(detalle === null ? {} : { existente: detalle }) };
      }
      this.registro.error(`Fila ${fila.fila} (${fila.codigo}) de la confirmación falló: ${error instanceof Error ? error.message : 'desconocido'}`);
      return this.errorDeFila(fila, 'ERROR_INTERNO');
    }
  }

  private async procesarConfirmacion(unidad: UnidadTrabajoUpsert, solicitud: SolicitudUpsert, fila: FilaUpsert, actor: Actor, errorAsignacion: ErrorAsignacion | null): Promise<ResultadoFila> {
    const invalida = validarReglasDeFila(fila);
    if (invalida !== null) return this.errorDeFila(fila, invalida);
    const codigo = fila.codigo.trim();
    const existente = await unidad.buscarPorCodigoNormalizado(normalizarCodigoHdu(codigo));

    if (fila.operacion === 'ACTUALIZAR') {
      if (existente === null) return this.errorDeFila(fila, 'ERROR_INTERNO');
      const decision = decidirSobreExistente(existente, fila, { vincularExistentes: true });
      if (decision.tipo === 'OMITIR') return { fila: fila.fila, codigo, resultado: 'OMITIDA', motivo: decision.motivo, idHistoria: existente.id, advertencias: [], cambios: null };
      await unidad.actualizar(
        {
          antes: existente,
          datos: decision.datos,
          vincula: decision.vincula ? { origen: solicitud.origen, claveExterna: textoNoVacio(fila.claveExterna), urlExterna: textoNoVacio(fila.urlExterna) } : null,
        },
        actor,
      );
      return { fila: fila.fila, codigo, resultado: 'ACTUALIZADA', motivo: null, idHistoria: existente.id, advertencias: [], cambios: decision.cambios };
    }

    // CREAR: nunca actualiza una HDU que apareció mientras se revisaba la consulta.
    if (existente !== null) {
      const detalle = solicitud.consultaId === undefined ? null : await unidad.describirExistente(existente.id, solicitud.consultaId, actor.id);
      return { fila: fila.fila, codigo, resultado: 'OMITIDA', motivo: 'HDU_CREADA_DESPUES', idHistoria: existente.id, advertencias: [], cambios: null, ...(detalle === null ? {} : { existente: detalle }) };
    }
    const asignacion = fila.asignacion;
    if (asignacion === undefined) return this.errorDeFila(fila, 'ERROR_INTERNO');
    if (errorAsignacion !== null) return { ...this.errorDeFila(fila, 'ASIGNACION_INVALIDA'), codigo, errorAsignacion };

    const creada = await unidad.crear(
      {
        codigo,
        titulo: textoNoVacio(fila.titulo) as string,
        descripcion: textoNoVacio(fila.descripcion),
        prioridad: (fila.prioridad as PrioridadHdu | null) ?? PRIORIDAD_POR_DEFECTO,
        celulaId: asignacion.celulaId,
        sprintId: asignacion.sprintId,
        qeResponsableId: asignacion.qeResponsableId,
        analistaId: asignacion.analistaId,
        consultaId: solicitud.consultaId ?? null,
        origen: solicitud.origen,
        claveExterna: solicitud.origen === 'JIRA' ? textoNoVacio(fila.claveExterna) : null,
        urlExterna: solicitud.origen === 'JIRA' ? textoNoVacio(fila.urlExterna) : null,
      },
      actor,
    );
    return { fila: fila.fila, codigo, resultado: 'CREADA', motivo: null, idHistoria: creada.id, advertencias: [], cambios: null };
  }

  /** Revalida la asignación al escribir con las mismas reglas de dominio de la edición (D138); el primer error la rechaza. */
  private async errorDeAsignacion(a: NonNullable<FilaUpsert['asignacion']>): Promise<ErrorAsignacion | null> {
    const [celula, qe, analista, sprint] = await Promise.all([
      this.catalogos.buscarCelula(a.celulaId),
      this.usuarios.buscarPorId(a.qeResponsableId),
      this.usuarios.buscarPorId(a.analistaId),
      this.catalogos.buscarSprint(a.sprintId),
    ]);
    const equipoDelQe = esQeResponsableValido(qe) ? await this.supervision.listarAnalistasVigentesIds(a.qeResponsableId) : null;
    const errores = validarAsignacion(
      { celulaId: true, qeResponsableId: true, analistaId: true, sprintId: true },
      { celula, qe, analista, sprint, equipoDelQe },
    );
    return errores[0] ?? null;
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
    if (nombreCelula !== null) celula = await unidad.buscarCelulaPorNombre(nombreCelula);
    else celula = contexto.destino.celula;
    if (celula === null) return this.errorDeFila(fila, 'CELULA_NO_ENCONTRADA');

    const nombreSprint = textoNoVacio(fila.sprint);
    const sprintDeLaCelula = nombreSprint === null ? null : await unidad.buscarSprintDeCelulaPorNombre(celula.id, nombreSprint);
    const sprint = elegirSprint({
      nombreEnFila: nombreSprint,
      sprintDeLaCelula,
      respaldo: contexto.respaldo,
      celulaId: celula.id,
      sprintNoEncontrado: solicitud.sprintNoEncontrado,
    });
    if (!sprint.ok) return this.errorDeFila(fila, sprint.motivo);

    const correoQe = textoNoVacio(fila.qeCorreo);
    const qe = correoQe === null ? contexto.qeDestino : await unidad.buscarUsuarioPorCorreo(correoQe.toLowerCase());
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
