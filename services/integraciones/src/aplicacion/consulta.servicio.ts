/**
 * Consulta de Jira (E5 consulta y asignación, D132-D136, D148): una sola petición acotada por el presupuesto (D114) que
 * lee Jira, mapea, clasifica contra Organización en solo lectura y guarda las filas como un borrador revisable. No crea
 * ni modifica HDU. Orden de una tanda: 1) no hay otra ejecución en curso, 2) se lee Jira, 3) se mapea, 4) se clasifica,
 * 5) en UNA transacción se reemplaza la consulta anterior, se crea o acumula la consulta y sus filas y se cierra la
 * ejecución. Si Jira u Organización fallan antes del paso 5, la consulta anterior queda intacta.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import { mensajeDeError } from '../dominio/catalogos.js';
import { clasificarFila, type HduExistente } from '../dominio/consulta/clasificacion.js';
import { ConsultaAbierta, ConsultaNoEncontrada, ErrorDeConsulta } from '../dominio/consulta/errores.js';
import { SIN_CONTEOS, type Consulta, type GrupoConsulta, type Persona } from '../dominio/consulta/tipos.js';
import { calcularVencimiento, decidirConsultar, obstaculoDeContinuar, obstaculoDeLectura, pasoSuVigencia, sinRepetidos } from '../dominio/consulta/vida.js';
import { Presupuesto, resultadoFinal } from '../dominio/ejecucion.js';
import { JiraNoConfigurado, OrganizacionNoDisponible } from '../dominio/errores.js';
import type { CredencialJira, FuenteJira, IssueJira, OpcionesLlamada } from '../dominio/puertos/fuente-jira.js';
import type { CodigoErrorIntegracion, EventoEjecucion, Rol } from '../dominio/tipos.js';
import {
  CifradorToken,
  ConfiguracionRepositorio,
  ConsultaRepositorio,
  EjecucionRepositorio,
  FUENTE_JIRA,
  MapeadorIssues,
  ProveedorOrganizacion,
  Reloj,
  type DatosFilaNueva,
  type Solicitante,
} from './puertos.js';
import { vistaEjecucion } from './vistas.js';
import { vistaConsulta, vistaItem } from './vistas-consulta.js';

const CLAVE_JIRA = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface EntradaListadoItems {
  readonly grupo: GrupoConsulta;
  readonly q?: string;
  readonly pagina: number;
  readonly tamanoPagina: number;
}

/** Lo que una tanda necesita saber de la consulta que continúa o de la nueva que crea. */
interface ContextoTanda {
  readonly existente: Consulta | null;
  readonly reemplaza: Consulta | null;
  readonly proyecto: string;
  readonly sitioHost: string;
  readonly desde: string | undefined;
  readonly sugerencia: {
    readonly celulaId: string;
    readonly celulaNombre: string | null;
    readonly qeId: string;
    readonly qeNombre: string | null;
    readonly sprintRespaldoId: string;
    readonly sprintRespaldoNombre: string | null;
  } | null;
}

@Injectable()
export class ConsultaAplicacion {
  private readonly registro = new Logger(ConsultaAplicacion.name);

  constructor(
    private readonly configuraciones: ConfiguracionRepositorio,
    private readonly ejecuciones: EjecucionRepositorio,
    private readonly consultas: ConsultaRepositorio,
    private readonly organizacion: ProveedorOrganizacion,
    private readonly cifrador: CifradorToken,
    private readonly mapeador: MapeadorIssues,
    private readonly reloj: Reloj,
    @Inject(FUENTE_JIRA) private readonly jira: FuenteJira,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  // ------------------------------------------------------------------ lecturas
  /** `GET /consultas/actual`: aplica el vencimiento perezoso. No llama a Jira ni a Organización. */
  async actual() {
    const abierta = await this.abiertaVigente();
    const ultima = await this.consultas.ultimaCerrada();
    return {
      consulta: abierta === null ? null : vistaConsulta(abierta, await this.consultas.conteos(abierta.id)),
      ultimaCerrada: ultima === null ? null : vistaConsulta(ultima, SIN_CONTEOS),
    };
  }

  /** `GET /consultas/{id}`: cabecera, contadores y versión. Una cerrada responde 200 con su estado y sin filas. */
  async obtener(id: string) {
    const c = await this.existente(id);
    return vistaConsulta(c, c.estado === 'ABIERTA' ? await this.consultas.conteos(c.id) : SIN_CONTEOS);
  }

  /** `GET /consultas/{id}/items`: una consulta cerrada es 409 (410 si venció), nunca una lista vacía (D148). */
  async listarItems(id: string, entrada: EntradaListadoItems) {
    const c = await this.abierta(id);
    const { items, total, yaAsignadas } = await this.consultas.listarItems(c.id, { grupo: entrada.grupo, q: entrada.q }, entrada.pagina, entrada.tamanoPagina);
    return { items: items.map((i) => vistaItem(i, c.sitioHost)), total, pagina: entrada.pagina, tamanoPagina: entrada.tamanoPagina, version: c.version, yaAsignadas };
  }

  /**
   * `GET /consultas/{id}/items/{itemId}` (D200): la fila y su detalle de la base propia, sin llamar a Jira ni a Organización.
   * Orden: 404 (consulta o fila) → 410 → 409. Una consulta cerrada ya no tiene filas, así que su estado manda sobre el 404 de la fila.
   * Una fila anterior al cambio responde 200 con `detalle: null` (E5-B06 #9). Nada de esto se registra en logs.
   */
  async obtenerItem(id: string, itemId: string) {
    const existente = await this.existente(id);
    if (existente.estado === 'ABIERTA' && (await this.consultas.obtenerItems(existente.id, [itemId])).length === 0) throw new ConsultaNoEncontrada();
    const c = await this.abierta(id);
    const leido = await this.consultas.obtenerItemConDetalle(c.id, itemId);
    if (leido === null) throw new ConsultaNoEncontrada();
    return { item: vistaItem(leido.item, c.sitioHost), detalle: leido.detalle, leidaEn: leido.leidaEn ?? c.creadaEn, version: c.version };
  }

  /** `POST /consultas/{id}/descartes`: pasa a `DESCARTADA`, purga las filas y sube la versión. No crea HDU ni registra ejecución. */
  async descartar(solicitante: Solicitante, id: string) {
    const c = await this.abierta(id);
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const actor = await this.organizacion.perfil(solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs));
    const cerrada = await this.consultas.cerrar(c.id, { estado: 'DESCARTADA', en: this.reloj.ahora(), por: { id: actor.id, nombre: actor.nombre } });
    if (cerrada === null) throw await this.errorActual(c.id, 'CONSULTA_NO_ABIERTA');
    return vistaConsulta(cerrada, SIN_CONTEOS);
  }

  // ------------------------------------------------------------------ consultar y continuar
  /**
   * `POST /consultas`. No registran ejecución: 409 `JIRA_NO_CONFIGURADO`, `TOKEN_NO_DESCIFRABLE`, `CONSULTA_ABIERTA` sin
   * `reemplazar`, 503 de la llave o de Organización y 409 `INTEGRACION_EN_CURSO`.
   */
  async consultar(solicitante: Solicitante, entrada: { reemplazar: boolean }) {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const guardada = await this.configuraciones.obtener();
    if (guardada === null) throw new JiraNoConfigurado();
    const token = this.cifrador.descifrar(guardada.token);

    const abierta = await this.abiertaVigente();
    const decision = decidirConsultar(abierta, entrada.reemplazar, this.reloj.ahora());
    if (decision === 'CONFLICTO' && abierta !== null) {
      throw new ConsultaAbierta(abierta.id, abierta.creadaPor, abierta.creadaEn, (await this.consultas.conteos(abierta.id)).asignadas);
    }

    const limite = presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs);
    const actor = await this.organizacion.perfil(solicitante.contexto, limite);
    const destino = await this.organizacion.destino(
      { celulaId: guardada.celulaId, qeResponsableId: guardada.qeResponsableId, sprintRespaldoId: guardada.sprintRespaldoId },
      solicitante.contexto,
      presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs),
    );
    const contexto: ContextoTanda = {
      existente: null,
      reemplaza: decision === 'REEMPLAZAR' ? abierta : null,
      proyecto: guardada.proyecto,
      sitioHost: new URL(guardada.sitio).host,
      desde: undefined,
      sugerencia: {
        celulaId: guardada.celulaId,
        celulaNombre: destino.celula?.nombre ?? null,
        qeId: guardada.qeResponsableId,
        qeNombre: destino.qeResponsable?.nombre ?? null,
        sprintRespaldoId: guardada.sprintRespaldoId,
        sprintRespaldoNombre: destino.sprintRespaldo?.nombre ?? null,
      },
    };
    return this.ejecutarTanda(solicitante, { id: actor.id, nombre: actor.nombre }, guardada, { sitio: guardada.sitio, correo: guardada.correo, token }, contexto, presupuesto);
  }

  /** `POST /consultas/{id}/continuaciones`: lee desde `continuarDesde` y acumula en la misma consulta sin tocar lo asignado. */
  async continuar(solicitante: Solicitante, id: string) {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const consulta = await this.abierta(id);
    const obstaculo = obstaculoDeContinuar(consulta, this.configuracion.consultaTopeItems);
    if (obstaculo !== null) throw new ErrorDeConsulta(obstaculo, consulta);
    const guardada = await this.configuraciones.obtener();
    if (guardada === null) throw new JiraNoConfigurado();
    const token = this.cifrador.descifrar(guardada.token);
    const actor = await this.organizacion.perfil(solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs));
    const contexto: ContextoTanda = {
      existente: consulta,
      reemplaza: null,
      proyecto: consulta.proyecto,
      sitioHost: consulta.sitioHost,
      desde: consulta.continuarDesde ?? undefined,
      sugerencia: null,
    };
    return this.ejecutarTanda(solicitante, { id: actor.id, nombre: actor.nombre }, guardada, { sitio: guardada.sitio, correo: guardada.correo, token }, contexto, presupuesto);
  }

  private async ejecutarTanda(
    solicitante: Solicitante,
    actor: Persona,
    guardada: NonNullable<Awaited<ReturnType<ConfiguracionRepositorio['obtener']>>>,
    credencial: CredencialJira,
    contexto: ContextoTanda,
    presupuesto: Presupuesto,
  ) {
    const ejecucion = await this.ejecuciones.iniciar(
      {
        origen: 'JIRA',
        fase: 'CONSULTA',
        estricto: false,
        vincularExistentes: false,
        actor: { id: actor.id, nombre: actor.nombre, rol: solicitante.rol as Rol },
        proyecto: contexto.proyecto,
        sitioHost: contexto.sitioHost,
        archivo: null,
        iniciadaEn: this.reloj.ahora(),
      },
      this.configuracion.enCursoMaxMs,
    );
    try {
      return await this.recorrer(solicitante, actor, guardada, credencial, contexto, ejecucion.id, presupuesto);
    } catch (error) {
      // Algo inesperado (base de datos, un defecto): la ejecución no puede quedar abierta.
      this.registro.error(`La ejecución ${ejecucion.id} falló: ${error instanceof Error ? error.name : 'desconocido'}`);
      await this.ejecuciones.interrumpir(ejecucion.id, this.reloj.ahora(), presupuesto.transcurridoMs()).catch(() => undefined);
      throw error;
    }
  }

  private async recorrer(
    solicitante: Solicitante,
    actor: Persona,
    guardada: NonNullable<Awaited<ReturnType<ConfiguracionRepositorio['obtener']>>>,
    credencial: CredencialJira,
    contexto: ContextoTanda,
    ejecucionId: string,
    presupuesto: Presupuesto,
  ) {
    const opciones: OpcionesLlamada = {
      tiempoLimiteMs: this.configuracion.tiempoLimiteJiraMs,
      esperaMax429Ms: this.configuracion.esperaMax429Ms,
      restanteMs: () => presupuesto.restanteMs(),
    };
    const { existente } = contexto;
    const yaGuardadas = existente === null ? 0 : existente.leidas;
    const cupo = Math.max(0, this.configuracion.consultaTopeItems - yaGuardadas);
    const tope = Math.min(this.configuracion.topeIssues, cupo);
    const guardados = existente === null ? new Set<string>() : await this.consultas.codigosGuardados(existente.id);

    const filas: DatosFilaNueva[] = [];
    const eventos: EventoEjecucion[] = [];
    let interrupcion: CodigoErrorIntegracion | null = null;
    let organizacionCaida = false;
    let hayMas = false;
    let ultimaClave: string | null = null;
    let nextPageToken: string | undefined;
    let leidasEnJira = 0;

    paginas: for (;;) {
      if (!presupuesto.alcanza()) {
        interrupcion = 'PRESUPUESTO_DE_TIEMPO';
        break;
      }
      const pagina = await this.jira.buscarPagina(
        credencial,
        { proyecto: contexto.proyecto, tipos: guardada.tiposIssue, despuesDe: contexto.desde, nextPageToken, campoSprint: guardada.campoSprint, campoCriterios: guardada.campoCriterios },
        opciones,
      );
      eventos.push(...pagina.eventos);
      if (!pagina.ok) {
        interrupcion = pagina.codigo;
        break;
      }

      const issues: IssueJira[] = pagina.valor.issues.slice(0, Math.max(0, tope - leidasEnJira));
      const recortada = issues.length < pagina.valor.issues.length;
      const mapeadas = issues.map((issue, indice) => ({ issue, fila: this.mapeador.mapear(issue, { fila: yaGuardadas + filas.length + indice + 1, sitio: credencial.sitio }) }));
      const { nuevas } = sinRepetidos(
        mapeadas.map((m) => ({ ...m, codigo: m.fila.codigo })),
        guardados,
      );

      // Clasificación: solo lectura sobre Organización, por las filas sin error de mapeo (D136).
      const aConsultar = nuevas.filter((m) => m.fila.error === null);
      let existentes: Array<HduExistente | null> = [];
      try {
        if (aConsultar.length > 0) {
          existentes = await this.organizacion.estadoCodigos(
            aConsultar.map((m) => m.fila.codigo),
            solicitante.contexto,
            presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs),
          );
        }
      } catch (error) {
        if (!(error instanceof OrganizacionNoDisponible)) throw error;
        this.registro.error(`Organización no pudo clasificar la consulta · ${error.motivo}`);
        interrupcion = 'ORGANIZACION_NO_DISPONIBLE';
        organizacionCaida = true;
        break paginas;
      }
      const porCodigo = new Map(aConsultar.map((m, i) => [m, existentes[i] ?? null]));
      for (const m of nuevas) {
        const clasificacion = clasificarFila(m.fila, porCodigo.get(m) ?? null);
        const codigo = m.fila.codigo.trim();
        filas.push({
          posicion: yaGuardadas + filas.length + 1,
          grupo: clasificacion.grupo,
          codigo: codigo === '' ? null : codigo,
          titulo: m.fila.titulo,
          descripcion: m.fila.descripcion ?? null,
          prioridad: m.fila.prioridad ?? null,
          sprintJira: m.fila.sprint ?? null,
          referencia: m.fila.referencia,
          advertencias: m.fila.advertencias,
          motivo: clasificacion.motivo,
          existente: porCodigo.get(m) ?? null,
          cambios: clasificacion.cambios,
          detalle: m.fila.detalle === undefined || m.fila.detalle === null ? null : { valor: m.fila.detalle, leidaEn: this.reloj.ahora() },
        });
        if (codigo !== '') guardados.add(codigo.toUpperCase());
      }
      leidasEnJira += issues.length;
      const clave = issues[issues.length - 1]?.clave;
      // Se valida antes de guardarla: luego se interpola en la consulta a Jira (D96).
      if (clave !== undefined && CLAVE_JIRA.test(clave) && clave.length <= 40) ultimaClave = clave;

      // Con el tope exacto, `hayMas` depende de lo que diga Jira: no se inventa una continuación (E5-B02-T06).
      if (recortada || leidasEnJira >= tope) {
        hayMas = recortada || !pagina.valor.esUltima;
        break;
      }
      if (pagina.valor.esUltima || pagina.valor.nextPageToken === null) break;
      nextPageToken = pagina.valor.nextPageToken;
    }

    // Una interrupción con filas ya clasificadas se puede continuar desde la última clave; sin filas no hay desde dónde.
    if (interrupcion !== null && !organizacionCaida) hayMas = filas.length > 0 || contexto.desde !== undefined;
    if (organizacionCaida) filas.length = 0;
    if (interrupcion === null && hayMas && yaGuardadas + filas.length >= this.configuracion.consultaTopeItems) interrupcion = 'TOPE_DE_CONSULTA';

    const porGrupo = (grupo: GrupoConsulta): number => filas.filter((f) => f.grupo === grupo).length;
    const contadores = {
      leidas: filas.length,
      creadas: 0,
      actualizadas: 0,
      omitidas: 0,
      conError: porGrupo('CON_ERROR'),
      conAdvertencias: filas.filter((f) => f.advertencias.length > 0).length,
    };
    const resultado = resultadoFinal({ leidas: contadores.leidas, conError: contadores.conError, interrupcion, hayMas });
    const fallida = resultado === 'FALLIDA';
    const terminadaEn = this.reloj.ahora();
    const continuarDesde = hayMas ? (filas.length > 0 ? ultimaClave : (contexto.desde ?? null)) : null;
    const cierre = {
      ...contadores,
      nuevas: porGrupo('NUEVA'),
      cambiaron: porGrupo('CAMBIO'),
      sinCambios: porGrupo('SIN_CAMBIOS'),
      resultado,
      terminadaEn,
      duracionMs: Math.max(1, presupuesto.transcurridoMs()),
      codigoError: interrupcion,
      mensajeError: interrupcion === null ? null : mensajeDeError(interrupcion),
      eventos,
      hayMas: fallida ? false : hayMas,
      continuarDesde: fallida ? null : continuarDesde,
    };

    // Sin nada que guardar por una falla (D136): la consulta anterior, si había, queda intacta.
    if (fallida) {
      await this.ejecuciones.cerrar(ejecucionId, { ...cierre, consultaId: existente?.id ?? null });
      const sinCambios = existente === null ? null : vistaConsulta(existente, await this.consultas.conteos(existente.id));
      return { consulta: sinCambios, ejecucion: vistaEjecucion(await this.leerEjecucion(ejecucionId)) };
    }

    const guardada2 = await this.consultas.guardarTanda({
      ejecucionId,
      cierre,
      consultaId: existente?.id ?? null,
      nueva:
        existente !== null || contexto.sugerencia === null
          ? null
          : { creadaPor: actor, creadaEn: terminadaEn, proyecto: contexto.proyecto, sitioHost: contexto.sitioHost, sugerencia: contexto.sugerencia },
      reemplaza: contexto.reemplaza === null ? null : { id: contexto.reemplaza.id, por: actor, en: terminadaEn },
      filas,
      venceEn: calcularVencimiento(terminadaEn, this.configuracion.consultaVigenciaMs),
      hayMas,
      continuarDesde,
    });
    return { consulta: vistaConsulta(guardada2, await this.consultas.conteos(guardada2.id)), ejecucion: vistaEjecucion(await this.leerEjecucion(ejecucionId)) };
  }

  private async leerEjecucion(id: string) {
    const e = await this.ejecuciones.obtener(id);
    if (e === null) throw new Error('La ejecución recién cerrada no existe');
    return e;
  }

  // ------------------------------------------------------------------ vida de la consulta
  /** La consulta abierta y vigente. Si pasó `venceEn` la cierra como `VENCIDA` (purga sus filas) y devuelve `null`. */
  async abiertaVigente(): Promise<Consulta | null> {
    const abierta = await this.consultas.obtenerAbierta();
    if (abierta === null) return null;
    if (!pasoSuVigencia(abierta, this.reloj.ahora())) return abierta;
    await this.consultas.cerrar(abierta.id, { estado: 'VENCIDA', en: this.reloj.ahora(), por: null });
    return null;
  }

  /** La consulta por id, con el vencimiento perezoso aplicado. 404 si no existe. */
  async existente(id: string): Promise<Consulta> {
    let c = await this.consultas.obtener(id);
    if (c === null) throw new ConsultaNoEncontrada();
    if (pasoSuVigencia(c, this.reloj.ahora())) {
      c = (await this.consultas.cerrar(c.id, { estado: 'VENCIDA', en: this.reloj.ahora(), por: null })) ?? (await this.consultas.obtener(id)) ?? c;
    }
    return c;
  }

  /** La consulta, abierta y vigente: vencida es 410 y cerrada es 409 (D148). */
  async abierta(id: string): Promise<Consulta> {
    const c = await this.existente(id);
    const obstaculo = obstaculoDeLectura(c, this.reloj.ahora());
    if (obstaculo !== null) throw new ErrorDeConsulta(obstaculo.tipo === 'VENCIDA' ? 'CONSULTA_VENCIDA' : 'CONSULTA_NO_ABIERTA', c);
    return c;
  }

  /** El error de estado con la consulta tal como está ahora (carrera entre dos Administradores). */
  async errorActual(id: string, codigo: 'CONSULTA_NO_ABIERTA' | 'CONSULTA_MODIFICADA'): Promise<ErrorDeConsulta> {
    const c = await this.existente(id);
    const vencida = c.estado === 'VENCIDA';
    return new ErrorDeConsulta(vencida ? 'CONSULTA_VENCIDA' : codigo, c);
  }
}
