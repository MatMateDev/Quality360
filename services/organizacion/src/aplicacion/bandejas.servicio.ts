/**
 * Las 5 bandejas por rol (E7-B03, D33, D34, D46, D49). Organización calcula sobre
 * su ámbito y pide a Certificaciones el estado del checklist en lote. Si
 * Certificaciones no responde:
 * - sus contadores y el `seguimiento` de cada fila vienen `indisponible` (200);
 * - un filtro que depende de ella deja la lista `indisponible`, nunca sin filtrar;
 * - un orden que depende de ella cae a uno de respaldo, que se informa en `orden`;
 * - en la del QE solo vienen las acciones `ASIGNAR`, con `calculoParcial: true`.
 * Una falla nunca se convierte en 0 ni en una lista vacía.
 */
import { Inject, Injectable } from '@nestjs/common';
import { accesoDenegado, errorValidacion } from '@quality360/auth-nest';

import { celulaPermitidaParaLider } from '../dominio/reglas/ambito.js';
import {
  accionesPendientesQe,
  actualizadoEn,
  esAbierta,
  filtrarFilasOrganizacion,
  filtrarPorRangoActualizacion,
  ordenarAcciones,
  ordenarFilasHdu,
  ordenDependeDeCertificaciones,
  parsearOrden,
  serializarOrden,
  tamanoEfectivo,
  TIPOS_PENDIENTE_ADMIN,
  type AccionPendiente,
  type FilaHdu,
  type FiltroFilasHdu,
  type MapaSeguimiento,
  type OrdenHdu,
  type SeguimientoHdu,
  type TipoAccionQe,
  type TipoPendienteAdmin,
} from '../dominio/reglas/bandejas.js';
import { rangoValido, sanitizarCambios } from '../dominio/reglas/auditoria-usuarios.js';
import { AUDITORIA_REPOSITORIO, type AuditoriaRepositorio } from '../dominio/repositorios/auditoria.repositorio.js';
import { CATALOGO_REPOSITORIO, type CatalogoRepositorio } from '../dominio/repositorios/catalogo.repositorio.js';
import { CELULA_LIDER_REPOSITORIO, type CelulaLiderRepositorio } from '../dominio/repositorios/celula-lider.repositorio.js';
import { HDU_REPOSITORIO, type HduRepositorio } from '../dominio/repositorios/hdu.repositorio.js';
import { SUPERVISION_REPOSITORIO, type SupervisionRepositorio } from '../dominio/repositorios/supervision.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import {
  conteoPorEstadoVacio,
  type AmbitoAcceso,
  type CatalogoRef,
  type ConteoPorEstado,
  type Hdu,
  type Rol,
  type UsuarioResumen,
} from '../dominio/tipos.js';
import { HduAplicacion, type HduResumenRespuesta } from './hdu.servicio.js';
import { PROVEEDOR_SEGUIMIENTO, type ProveedorSeguimiento, type ResultadoSeguimiento } from './puertos/proveedor-seguimiento.js';
import { SupervisionAplicacion } from './supervision.servicio.js';

// ------------------------------------------------------------------ tipos

export type Bloque<D> =
  | { readonly fuente: string; readonly estado: 'ok'; readonly datos: D }
  | { readonly fuente: string; readonly estado: 'indisponible' };

export interface ContextoBandeja {
  readonly usuarioId: string;
  readonly rol: Rol;
  readonly ambito: AmbitoAcceso;
  readonly token: string;
  readonly traceId: string;
}

export interface ConsultaListaHdu extends FiltroFilasHdu {
  readonly orden?: string;
  readonly pagina?: number;
  readonly tamanoPagina?: number;
  readonly soloConObservaciones?: boolean;
  readonly certificado?: 'con' | 'sin';
}

export interface ItemBandejaHdu extends HduResumenRespuesta {
  readonly actualizadoEn: Date;
  readonly seguimiento: Bloque<SeguimientoHdu>;
}

export interface PaginaBandejaHdu {
  readonly items: ItemBandejaHdu[];
  readonly total: number;
  readonly pagina: number;
  readonly tamanoPagina: number;
  readonly orden: string;
}

/** Lista completa, filtrada y ordenada, antes de paginar (la usa también la exportación CSV). */
export interface ListaHduOrdenada {
  readonly filas: FilaHdu[];
  readonly hduPorId: ReadonlyMap<string, Hdu>;
  readonly orden: string;
  /** `null` si no hizo falta pedirlo todavía. */
  readonly seguimiento: ResultadoSeguimiento | null;
}

const SEGUIMIENTO = 'certificaciones.checklist';

const ok = <D>(fuente: string, datos: D): Bloque<D> => ({ fuente, estado: 'ok', datos });
const indisponible = (fuente: string): { fuente: string; estado: 'indisponible' } => ({ fuente, estado: 'indisponible' });
const contador = (fuente: string, valor: number): Bloque<{ valor: number }> => ok(fuente, { valor });

const SEGUIMIENTO_VACIO: ResultadoSeguimiento = { disponible: true, mapa: new Map() };

function ordenInvalido(): never {
  throw errorValidacion([{ campo: 'orden', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'Usa columna:asc o columna:desc con una columna válida.' }]);
}

function paginar<T>(items: readonly T[], pagina: number, tamano: number): T[] {
  return items.slice((pagina - 1) * tamano, pagina * tamano);
}

const ORDEN_ANALISTA: OrdenHdu = [
  { columna: 'observaciones', direccion: 'desc' },
  { columna: 'prioridad', direccion: 'desc' },
  { columna: 'sprint', direccion: 'desc' },
];
const ORDEN_RESPALDO_ANALISTA: OrdenHdu = [{ columna: 'prioridad', direccion: 'desc' }];
const ORDEN_LIDER: OrdenHdu = [
  { columna: 'celula', direccion: 'asc' },
  { columna: 'sprint', direccion: 'desc' },
  { columna: 'codigo', direccion: 'asc' },
];
const ORDEN_AUDITOR: OrdenHdu = [{ columna: 'codigo', direccion: 'asc' }];

// ---------------------------------------------------------------- servicio

@Injectable()
export class BandejasAplicacion {
  constructor(
    @Inject(HDU_REPOSITORIO) private readonly hdus: HduRepositorio,
    @Inject(CATALOGO_REPOSITORIO) private readonly catalogos: CatalogoRepositorio,
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    @Inject(SUPERVISION_REPOSITORIO) private readonly supervisionRepo: SupervisionRepositorio,
    @Inject(CELULA_LIDER_REPOSITORIO) private readonly celulasLider: CelulaLiderRepositorio,
    @Inject(AUDITORIA_REPOSITORIO) private readonly auditoria: AuditoriaRepositorio,
    @Inject(PROVEEDOR_SEGUIMIENTO) private readonly seguimientoProveedor: ProveedorSeguimiento,
    private readonly hduAplicacion: HduAplicacion,
    private readonly supervision: SupervisionAplicacion,
  ) {}

  // ------------------------------------------------------------- Analista

  async analista(ctx: ContextoBandeja, consulta: ConsultaListaHdu) {
    const { filas, hduPorId } = await this.cargar(await this.hdus.listarTodasPorAmbito({ tipo: 'ANALISTA', analistaId: ctx.usuarioId }));
    const seguimiento = await this.pedirSeguimiento(filas.map((fila) => fila.id), ctx);

    const supervisor = await this.supervision
      .resumenSupervisorQa(ctx.usuarioId)
      .then((datos) => ok('organizacion.supervision', datos))
      .catch(() => indisponible('organizacion.supervision'));

    const sumar = (campo: 'observaciones' | 'porAprobar'): Bloque<{ valor: number }> | { fuente: string; estado: 'indisponible' } =>
      seguimiento.disponible
        ? contador(SEGUIMIENTO, filas.reduce((total, fila) => total + (seguimiento.mapa.get(fila.id)?.[campo] ?? 0), 0))
        : indisponible(SEGUIMIENTO);

    const hdu = await this.bloqueLista(ctx, filas, hduPorId, consulta, {
      defecto: ORDEN_ANALISTA,
      respaldo: ORDEN_RESPALDO_ANALISTA,
      seguimientoPrevio: seguimiento,
    });

    return {
      rol: 'ANALISTA_QA' as const,
      generadaEn: new Date(),
      supervisor,
      contadores: {
        abiertas: contador('organizacion.hdu', filas.filter((fila) => esAbierta(fila.estado)).length),
        conObservaciones: sumar('observaciones'),
        esperandoAprobacion: sumar('porAprobar'),
      },
      hdu,
    };
  }

  // ------------------------------------------------------------------- QE

  async qe(
    ctx: ContextoBandeja,
    consulta: FiltroFilasHdu & { tipoAccion?: TipoAccionQe; pagina?: number; tamanoPagina?: number },
  ) {
    const { filas, hduPorId } = await this.cargar(await this.hdus.listarTodasPorAmbito({ tipo: 'QE', qeResponsableId: ctx.usuarioId, analistasSupervisadosIds: [] }));
    const propias = filas.filter((fila) => fila.qeResponsableId === ctx.usuarioId);
    const seguimiento = await this.pedirSeguimiento(propias.map((fila) => fila.id), ctx);
    const abiertas = propias.filter((fila) => esAbierta(fila.estado));
    const mapa: MapaSeguimiento = seguimiento.disponible ? seguimiento.mapa : new Map();

    const contarSeg = (condicion: (s: SeguimientoHdu) => boolean): Bloque<{ valor: number }> | { fuente: string; estado: 'indisponible' } =>
      seguimiento.disponible
        ? contador(SEGUIMIENTO, abiertas.filter((fila) => { const s = mapa.get(fila.id); return s !== undefined && condicion(s); }).length)
        : indisponible(SEGUIMIENTO);

    const porAprobar = seguimiento.disponible
      ? ok(SEGUIMIENTO, {
          valor: propias.reduce((total, fila) => total + (mapa.get(fila.id)?.porAprobar ?? 0), 0),
          hdu: propias.filter((fila) => (mapa.get(fila.id)?.porAprobar ?? 0) > 0).length,
        })
      : indisponible(SEGUIMIENTO);

    // Acciones: filtros de Organización primero, luego el tipo pedido.
    const candidatas = filtrarFilasOrganizacion(abiertas, consulta);
    const ahora = new Date();
    const pagina = consulta.pagina ?? 1;
    const tamanoPagina = tamanoEfectivo(consulta.tamanoPagina);

    let acciones: Bloque<{ items: unknown[]; total: number; pagina: number; tamanoPagina: number; calculoParcial: boolean }>;
    if (!seguimiento.disponible && consulta.tipoAccion !== undefined && consulta.tipoAccion !== 'ASIGNAR') {
      acciones = indisponible('organizacion.hdu');
    } else {
      const todas: AccionPendiente[] = candidatas.flatMap((fila) => accionesPendientesQe(fila, mapa.get(fila.id), ahora));
      const filtradas = ordenarAcciones(consulta.tipoAccion === undefined ? todas : todas.filter((accion) => accion.tipo === consulta.tipoAccion));
      const pagina_ = paginar(filtradas, pagina, tamanoPagina);
      const resumenes = await this.resumirFilas(pagina_.map((accion) => accion.fila.id), hduPorId);
      acciones = ok('organizacion.hdu', {
        items: pagina_.map((accion) => ({
          hdu: resumenes.get(accion.fila.id) as HduResumenRespuesta,
          tipo: accion.tipo,
          entregablesPorAprobar: accion.entregablesPorAprobar,
          esperandoDesde: accion.esperandoDesde,
          antiguedadDias: accion.antiguedadDias,
        })),
        total: filtradas.length,
        pagina,
        tamanoPagina,
        calculoParcial: !seguimiento.disponible,
      });
    }

    return {
      rol: 'QE' as const,
      generadaEn: ahora,
      contadores: {
        porAprobar,
        sinAnalista: contador('organizacion.hdu', abiertas.filter((fila) => fila.analistaId === null).length),
        listasCertificar: contarSeg((s) => s.listaParaCertificar),
        listasCerrar: contarSeg((s) => s.listaParaCerrar),
      },
      acciones,
    };
  }

  // ---------------------------------------------------------------- Líder

  async lider(ctx: ContextoBandeja, consulta: ConsultaListaHdu) {
    // Fuera de sus células vigentes: 403 genérico (E7-B02-T04, D12).
    if (!celulaPermitidaParaLider('LIDER_QA', ctx.ambito, consulta.celulaId)) throw accesoDenegado('celulaId fuera de las células del líder');

    const vigentes = (await this.celulasLider.listarVigentes(ctx.usuarioId)).map((fila) => fila.celula);
    const celulaIds = vigentes.map((celula) => celula.id);
    const { filas, hduPorId } = await this.cargar(await this.hdus.listarTodasPorAmbito({ tipo: 'CELULAS', celulaIds }));
    const seguimiento = await this.pedirSeguimiento(filas.map((fila) => fila.id), ctx);
    const mapa: MapaSeguimiento = seguimiento.disponible ? seguimiento.mapa : new Map();

    const resumenPorCelula = vigentes.map((celula) => {
      const deCelula = filas.filter((fila) => fila.celulaId === celula.id);
      const porEstado: ConteoPorEstado = conteoPorEstadoVacio();
      for (const fila of deCelula) porEstado[fila.estado] += 1;
      const abiertas = deCelula.filter((fila) => esAbierta(fila.estado));
      const avance = seguimiento.disponible
        ? ok(SEGUIMIENTO, {
            porcentaje:
              abiertas.length === 0
                ? null
                : Math.round((abiertas.reduce((total, fila) => total + (mapa.get(fila.id)?.porcentaje ?? 0), 0) / abiertas.length) * 10) / 10,
          })
        : indisponible(SEGUIMIENTO);
      return { celula, porEstado, avancePromedioAbiertas: avance };
    });

    const hdu = await this.bloqueLista(ctx, filas, hduPorId, consulta, { defecto: ORDEN_LIDER, respaldo: ORDEN_LIDER, seguimientoPrevio: seguimiento });

    return {
      rol: 'LIDER_QA' as const,
      generadaEn: new Date(),
      celulas: ok('organizacion.celulas', { items: vigentes }),
      contadores: {
        celulas: contador('organizacion.celulas', vigentes.length),
        hduAbiertas: contador('organizacion.hdu', filas.filter((fila) => esAbierta(fila.estado)).length),
        hduCerradas: contador('organizacion.hdu', filas.filter((fila) => !esAbierta(fila.estado)).length),
        sinAnalista: contador('organizacion.hdu', filas.filter((fila) => fila.analistaId === null).length),
        certificados: seguimiento.disponible
          ? contador(SEGUIMIENTO, filas.filter((fila) => mapa.get(fila.id)?.certificado != null).length)
          : indisponible(SEGUIMIENTO),
      },
      resumenPorCelula: ok('organizacion.hdu', { items: resumenPorCelula }),
      hdu,
    };
  }

  // ---------------------------------------------------------------- Admin

  async admin(consulta: { pagina?: number; tamanoPagina?: number }) {
    const pagina = consulta.pagina ?? 1;
    const tamanoPagina = tamanoEfectivo(consulta.tamanoPagina);
    const [resumen, activosPorRol, analistasSinQe, qeSinAnalistas, lideresSinCelulas, celulasSinLider, hduTotal, ultimos] = await Promise.all([
      this.usuarios.resumenAdmin(),
      this.usuarios.contarActivosPorRol(),
      this.supervisionRepo.listarAnalistasActivosSinQe(),
      this.supervisionRepo.listarQeActivosSinAnalistas(),
      this.celulasLider.lideresActivosSinCelulas(),
      this.celulasLider.celulasActivasSinLider(),
      this.hdus.contarTodas(),
      this.auditoria.listarUsuarios({}, { pagina: 1, tamanoPagina: 10 }),
    ]);

    const pendientes: Array<{ tipo: TipoPendienteAdmin; usuario: UsuarioResumen | null; celula: CatalogoRef | null }> = [
      ...analistasSinQe.map((usuario) => ({ tipo: 'ANALISTA_SIN_QE' as const, usuario, celula: null })),
      ...qeSinAnalistas.map((usuario) => ({ tipo: 'QE_SIN_ANALISTAS' as const, usuario, celula: null })),
      ...lideresSinCelulas.map((usuario) => ({ tipo: 'LIDER_SIN_CELULAS' as const, usuario, celula: null })),
      ...celulasSinLider.map((celula) => ({ tipo: 'CELULA_SIN_LIDER' as const, usuario: null, celula })),
    ].sort((a, b) => TIPOS_PENDIENTE_ADMIN.indexOf(a.tipo) - TIPOS_PENDIENTE_ADMIN.indexOf(b.tipo));

    const totalActivos = Object.values(activosPorRol).reduce((suma, valor) => suma + valor, 0);
    const registros = await this.registrosUsuarios(ultimos.items);

    return {
      rol: 'ADMINISTRADOR' as const,
      generadaEn: new Date(),
      contadores: {
        usuariosActivos: ok('organizacion.usuarios', { valor: totalActivos, porRol: activosPorRol }),
        usuariosInactivos: contador('organizacion.usuarios', resumen.inactivos),
        analistasSinQe: contador('organizacion.supervision', analistasSinQe.length),
        qeSinAnalistas: contador('organizacion.supervision', qeSinAnalistas.length),
        lideresSinCelulas: contador('organizacion.usuarios', lideresSinCelulas.length),
        celulasSinLider: contador('organizacion.celulas', celulasSinLider.length),
        hduTotal: contador('organizacion.hdu', hduTotal),
      },
      pendientes: ok('organizacion.usuarios', {
        items: paginar(pendientes, pagina, tamanoPagina),
        total: pendientes.length,
        pagina,
        tamanoPagina,
      }),
      ultimosCambios: ok('organizacion.auditoria', { items: registros }),
    };
  }

  // -------------------------------------------------------------- Auditor

  async auditor(ctx: ContextoBandeja, consulta: ConsultaListaHdu) {
    if (!rangoValido(consulta.desde, consulta.hasta)) {
      throw errorValidacion([{ campo: 'hasta', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'hasta no puede ser anterior a desde.' }]);
    }
    const ahora = new Date();
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [{ filas, hduPorId }, hduTotal, cambiosUsuarios7d, resumen] = await Promise.all([
      this.cargar(await this.hdus.listarTodasPorAmbito({ tipo: 'TODAS' })),
      this.hdus.contarTodas(),
      this.auditoria.contarUsuarios({ desde: hace7Dias }),
      this.seguimientoProveedor.resumenAuditoria(ctx.token, ctx.traceId),
    ]);

    const hdu = await this.bloqueLista(ctx, filas, hduPorId, consulta, { defecto: ORDEN_AUDITOR, respaldo: ORDEN_AUDITOR, seguimientoPrevio: null });

    return {
      rol: 'AUDITOR' as const,
      generadaEn: ahora,
      contadores: {
        hduTotal: contador('organizacion.hdu', hduTotal),
        certificados: resumen.disponible ? contador('certificaciones.certificados', resumen.certificados) : indisponible('certificaciones.certificados'),
        eventos7d: resumen.disponible ? contador('certificaciones.bitacora', resumen.eventosUltimos7Dias) : indisponible('certificaciones.bitacora'),
        cambiosUsuarios7d: contador('organizacion.auditoria', cambiosUsuarios7d),
      },
      hdu,
    };
  }

  /** Para la exportación CSV del Auditor: la lista completa, ya filtrada y ordenada, y el seguimiento de todas sus filas. */
  async listaCompletaAuditor(
    ctx: ContextoBandeja,
    consulta: ConsultaListaHdu,
  ): Promise<{ filas: FilaHdu[]; seguimiento: ResultadoSeguimiento; hduPorId: ReadonlyMap<string, Hdu> }> {
    const { filas, hduPorId } = await this.cargar(await this.hdus.listarTodasPorAmbito({ tipo: 'TODAS' }));
    const filtradas = filtrarFilasOrganizacion(filas, consulta);
    const seguimiento = await this.pedirSeguimiento(filtradas.map((fila) => fila.id), ctx);
    if (!seguimiento.disponible) return { filas: [], seguimiento, hduPorId };

    let resultado = filtrarPorRangoActualizacion(filtradas, seguimiento.mapa, consulta.desde, consulta.hasta);
    if (consulta.certificado !== undefined) {
      resultado = resultado.filter((fila) => (seguimiento.mapa.get(fila.id)?.certificado != null) === (consulta.certificado === 'con'));
    }
    const orden = this.resolverOrden(consulta.orden, ORDEN_AUDITOR, ORDEN_AUDITOR, true);
    return { filas: ordenarFilasHdu(resultado, orden.orden, seguimiento.mapa), seguimiento, hduPorId };
  }

  // ---------------------------------------------------------- auxiliares

  /** Filtra, ordena y pagina la lista de HDU de una bandeja, con los degradados de D46. */
  private async bloqueLista(
    ctx: ContextoBandeja,
    filas: readonly FilaHdu[],
    hduPorId: ReadonlyMap<string, Hdu>,
    consulta: ConsultaListaHdu,
    opciones: { defecto: OrdenHdu; respaldo: OrdenHdu; seguimientoPrevio: ResultadoSeguimiento | null },
  ): Promise<Bloque<PaginaBandejaHdu>> {
    const pagina = consulta.pagina ?? 1;
    const tamanoPagina = tamanoEfectivo(consulta.tamanoPagina);
    const ordenPedido = this.parsearOrdenPedido(consulta.orden);
    const base = ordenPedido ?? opciones.defecto;

    const filtradas = filtrarFilasOrganizacion(filas, consulta);
    const dependeDeCertificaciones =
      consulta.soloConObservaciones === true ||
      consulta.certificado !== undefined ||
      consulta.desde !== undefined ||
      consulta.hasta !== undefined ||
      ordenDependeDeCertificaciones(base);

    let seguimiento = opciones.seguimientoPrevio;
    if (seguimiento === null && dependeDeCertificaciones) {
      seguimiento = await this.pedirSeguimiento(filtradas.map((fila) => fila.id), ctx);
    }

    // Un filtro que depende de Certificaciones y no responde deja la lista indisponible (D46).
    const filtraConCertificaciones = consulta.soloConObservaciones === true || consulta.certificado !== undefined;
    if (filtraConCertificaciones && seguimiento !== null && !seguimiento.disponible) return indisponible('organizacion.hdu');

    const mapa: MapaSeguimiento = seguimiento?.disponible === true ? seguimiento.mapa : new Map();
    let resultado = [...filtradas];
    if (consulta.soloConObservaciones === true) resultado = resultado.filter((fila) => (mapa.get(fila.id)?.observaciones ?? 0) > 0);
    if (consulta.certificado !== undefined) {
      resultado = resultado.filter((fila) => (mapa.get(fila.id)?.certificado != null) === (consulta.certificado === 'con'));
    }
    resultado = filtrarPorRangoActualizacion(resultado, mapa, consulta.desde, consulta.hasta);

    const certificacionesOk = seguimiento === null || seguimiento.disponible;
    const orden = ordenDependeDeCertificaciones(base) && !certificacionesOk ? opciones.respaldo : base;
    const ordenadas = ordenarFilasHdu(resultado, orden, mapa);
    const paginaFilas = paginar(ordenadas, pagina, tamanoPagina);

    // Si todavía no se pidió, el seguimiento se pide solo para las filas visibles.
    if (seguimiento === null) seguimiento = await this.pedirSeguimiento(paginaFilas.map((fila) => fila.id), ctx);
    const mapaPagina: MapaSeguimiento = seguimiento.disponible ? seguimiento.mapa : new Map();

    const resumenes = await this.resumirFilas(paginaFilas.map((fila) => fila.id), hduPorId);
    const items: ItemBandejaHdu[] = paginaFilas.map((fila) => {
      const datos = mapaPagina.get(fila.id);
      return {
        ...(resumenes.get(fila.id) as HduResumenRespuesta),
        actualizadoEn: actualizadoEn(fila, datos),
        seguimiento: seguimiento?.disponible === true && datos !== undefined ? ok(SEGUIMIENTO, datos) : indisponible(SEGUIMIENTO),
      };
    });
    return ok('organizacion.hdu', { items, total: ordenadas.length, pagina, tamanoPagina, orden: serializarOrden(orden) });
  }

  private parsearOrdenPedido(texto: string | undefined): OrdenHdu | null {
    if (texto === undefined) return null;
    const orden = parsearOrden(texto);
    if (orden === null) ordenInvalido();
    return orden;
  }

  private resolverOrden(
    texto: string | undefined,
    defecto: OrdenHdu,
    respaldo: OrdenHdu,
    certificacionesOk: boolean,
  ): { orden: OrdenHdu } {
    const base = this.parsearOrdenPedido(texto) ?? defecto;
    return { orden: ordenDependeDeCertificaciones(base) && !certificacionesOk ? respaldo : base };
  }

  private async pedirSeguimiento(ids: readonly string[], ctx: ContextoBandeja): Promise<ResultadoSeguimiento> {
    if (ids.length === 0) return SEGUIMIENTO_VACIO;
    return this.seguimientoProveedor.seguimiento(ids, ctx.token, ctx.traceId);
  }

  /** Resuelve nombres de célula y sprint y las fechas de asignación de cada HDU. */
  private async cargar(hdus: Hdu[]): Promise<{ filas: FilaHdu[]; hduPorId: ReadonlyMap<string, Hdu> }> {
    const [celulas, sprints, cambios] = await Promise.all([
      this.catalogos.listarCelulas(),
      this.catalogos.listarSprints(),
      this.hdus.ultimosCambiosAsignacion(hdus.map((hdu) => hdu.id)),
    ]);
    const nombreCelula = new Map(celulas.map((celula) => [celula.id, celula.nombre]));
    const sprintPorId = new Map(sprints.map((sprint) => [sprint.id, sprint]));
    const filas: FilaHdu[] = hdus.map((hdu) => {
      const sprint = sprintPorId.get(hdu.sprintId);
      return {
        id: hdu.id,
        codigo: hdu.codigo,
        titulo: hdu.titulo,
        estado: hdu.estado,
        prioridad: hdu.prioridad,
        celulaId: hdu.celulaId,
        celulaNombre: nombreCelula.get(hdu.celulaId) ?? '',
        sprintId: hdu.sprintId,
        sprintNombre: sprint?.nombre ?? '',
        sprintInicio: sprint?.inicio ?? new Date(0),
        qeResponsableId: hdu.qeResponsableId,
        analistaId: hdu.analistaId,
        estadoActualizadoEn: hdu.estadoActualizadoEn,
        creadoEn: hdu.creadoEn,
        ultimoCambioAsignacion: cambios.get(hdu.id) ?? null,
      };
    });
    return { filas, hduPorId: new Map(hdus.map((hdu) => [hdu.id, hdu])) };
  }

  private async resumirFilas(ids: readonly string[], hduPorId: ReadonlyMap<string, Hdu>): Promise<Map<string, HduResumenRespuesta>> {
    const unicos = [...new Set(ids)];
    const hdus = unicos.map((id) => hduPorId.get(id)).filter((hdu): hdu is Hdu => hdu !== undefined);
    const resumenes = await this.hduAplicacion.resumir(hdus);
    return new Map(resumenes.map((resumen) => [resumen.id, resumen]));
  }

  /** Convierte entradas de auditoría de usuarios al formato de la API, sin campos fuera de la lista blanca (E1-B12#3). */
  async registrosUsuarios(
    registros: ReadonlyArray<{
      id: string;
      fecha: Date;
      actor: { tipo: 'USUARIO' | 'SERVICIO'; id: string; nombre: string };
      entidad: string;
      entidadId: string;
      accion: string;
      antes: Record<string, unknown> | null;
      despues: Record<string, unknown> | null;
      motivo: string | null;
      usuarioAfectadoId: string | null;
    }>,
  ) {
    const afectados = await this.usuarios.listarResumenPorIds([...new Set(registros.flatMap((r) => (r.usuarioAfectadoId === null ? [] : [r.usuarioAfectadoId])))]);
    const porId = new Map(afectados.map((usuario) => [usuario.id, usuario]));
    return registros.map((registro) => ({
      id: registro.id,
      fecha: registro.fecha,
      actor: registro.actor,
      operacion: registro.accion,
      entidad: registro.entidad,
      entidadId: registro.entidadId,
      usuarioAfectado: registro.usuarioAfectadoId === null ? null : (porId.get(registro.usuarioAfectadoId) ?? null),
      antes: sanitizarCambios(registro.antes),
      despues: sanitizarCambios(registro.despues),
      motivo: registro.motivo,
    }));
  }
}
