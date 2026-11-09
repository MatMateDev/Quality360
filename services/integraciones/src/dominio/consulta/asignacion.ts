/**
 * Asignación y marcado de las filas de una consulta (D137-D139, D145, D148). Puro: la combinación final, qué se puede
 * marcar y asignar, la completitud y la decisión de una edición dado lo que Organización validó.
 */
import { CAMPOS_ASIGNACION, type AsignacionFila, type CampoAsignacion, type GrupoConsulta, type OrigenSprint, type Ref } from './tipos.js';

/** Cambio parcial de asignación (`CambioAsignacion`): un campo ausente no cambia; `null` lo limpia. */
export interface CambioAsignacion {
  readonly celulaId?: string | null;
  readonly qeId?: string | null;
  readonly analistaId?: string | null;
  readonly sprintId?: string | null;
}

export type MotivoRechazo =
  | 'QE_INVALIDO'
  | 'ANALISTA_INVALIDO'
  | 'ANALISTA_FUERA_DE_EQUIPO'
  | 'CATALOGO_INVALIDO'
  | 'ASIGNACION_INCOMPLETA'
  | 'FILA_NO_MARCABLE'
  | 'FILA_NO_ASIGNABLE'
  /** Solo una `NUEVA` con `yaAsignada` (D204): otra persona creó su HDU durante la revisión. */
  | 'HDU_YA_ASIGNADA'
  /** Otra petición está confirmando la fila ahora (D202). */
  | 'FILA_EN_CURSO';

export interface Rechazo {
  readonly motivo: MotivoRechazo;
  /** Campo que falló; `null` si el motivo es de la fila (`FILA_NO_*`). */
  readonly campo: CampoAsignacion | null;
  readonly faltantes?: CampoAsignacion[];
}

/** Lo mínimo de una fila que estas reglas necesitan. */
export interface EstadoFila {
  readonly grupo: GrupoConsulta;
  readonly asignacion: AsignacionFila;
  readonly marcada: boolean;
  readonly aplicada: boolean;
  /** El analista lo puso el servidor (D201). Ausente = `false`. */
  readonly analistaAuto?: boolean;
  /** Hay una toma vigente de otra petición (D202). Ausente = `false`. */
  readonly aplicando?: boolean;
  /** La HDU ya existe (D204). Ausente o `null` = no. */
  readonly yaAsignada?: unknown;
}

export type IdsAsignacion = Record<CampoAsignacion, string | null>;

export function idsDe(asignacion: AsignacionFila): IdsAsignacion {
  return { celulaId: asignacion.celula?.id ?? null, qeId: asignacion.qe?.id ?? null, analistaId: asignacion.analista?.id ?? null, sprintId: asignacion.sprint?.id ?? null };
}

/** Campos sin elegir, en el orden del portal. Vacío si la asignación está completa. */
export function faltantes(asignacion: AsignacionFila): CampoAsignacion[] {
  const ids = idsDe(asignacion);
  return CAMPOS_ASIGNACION.filter((campo) => ids[campo] === null);
}

export const estaCompleta = (asignacion: AsignacionFila): boolean => faltantes(asignacion).length === 0;

/** `true` si algún campo está asignado (texto «N filas asignadas» del diálogo de reemplazo). */
export const tieneAsignacion = (asignacion: AsignacionFila): boolean => faltantes(asignacion).length < CAMPOS_ASIGNACION.length;

const tieneYaAsignada = (fila: Pick<EstadoFila, 'yaAsignada'>): boolean => fila.yaAsignada !== undefined && fila.yaAsignada !== null;

/**
 * Solo `NUEVA` se asigna, y una fila ya `aplicada` (por un lote incompleto o por «Confirmar asignación») es de solo lectura
 * (D148). Una `NUEVA` cuya HDU ya existe (`yaAsignada`) tampoco se asigna (D204).
 */
export function puedeAsignarse(fila: Pick<EstadoFila, 'grupo' | 'aplicada' | 'yaAsignada'>): boolean {
  return fila.grupo === 'NUEVA' && !fila.aplicada && !tieneYaAsignada(fila);
}

/** `NUEVA` completa y `CAMBIO`, ninguna `aplicada`; `SIN_CAMBIOS` y `CON_ERROR` nunca (D139). Una `NUEVA` `yaAsignada` tampoco. */
export function esMarcable(fila: EstadoFila): boolean {
  if (fila.aplicada) return false;
  if (fila.grupo === 'CAMBIO') return true;
  return fila.grupo === 'NUEVA' && !tieneYaAsignada(fila) && estaCompleta(fila.asignacion);
}

/** Por qué no se puede marcar la fila, o `null` si sí. */
export function motivoNoMarcable(fila: EstadoFila): Rechazo | null {
  if (fila.aplicada || fila.grupo === 'SIN_CAMBIOS' || fila.grupo === 'CON_ERROR') return { motivo: 'FILA_NO_MARCABLE', campo: null };
  if (fila.grupo === 'NUEVA' && tieneYaAsignada(fila)) return { motivo: 'FILA_NO_MARCABLE', campo: null };
  if (fila.grupo === 'NUEVA' && !estaCompleta(fila.asignacion)) return { motivo: 'ASIGNACION_INCOMPLETA', campo: null, faltantes: faltantes(fila.asignacion) };
  return null;
}

/** Cómo sale el sprint de la combinación final. */
export type ModoSprint = 'MANTENER' | 'EXPLICITO' | 'PROPONER' | 'LIMPIAR';

export interface CombinacionFinal {
  readonly ids: IdsAsignacion;
  readonly modoSprint: ModoSprint;
  /** Campos que la edición toca (más su pareja): los únicos que se validan contra Organización. */
  readonly aValidar: ReadonlySet<CampoAsignacion>;
  /**
   * D201: la edición cambió el QE y no mandó `analistaId`, así que se le pide a Organización el único Analista activo del
   * equipo vigente de ese QE (`proponerAnalista`).
   */
  readonly proponerAnalista: boolean;
}

/**
 * Combinación final de una fila tras un cambio (D138, D139): cambiar el QE limpia el analista (salvo que venga en el
 * mismo cuerpo), cambiar la célula recalcula el sprint (propuesta de D137) salvo que venga `sprintId`, y un `sprintId`
 * explícito queda `MANUAL`. «Cambiar» es traer un valor distinto del actual.
 */
export function combinarAsignacion(actual: AsignacionFila, cambio: CambioAsignacion): CombinacionFinal {
  const previa = idsDe(actual);
  const ids: IdsAsignacion = { ...previa };
  const tocados = new Set<CampoAsignacion>();
  for (const campo of CAMPOS_ASIGNACION) {
    const valor = cambio[campo];
    if (valor === undefined) continue;
    ids[campo] = valor;
    if (valor !== previa[campo]) tocados.add(campo);
  }
  const trajo = (campo: CampoAsignacion): boolean => cambio[campo] !== undefined;

  if (tocados.has('qeId') && !trajo('analistaId')) ids.analistaId = null;

  let modoSprint: ModoSprint = 'MANTENER';
  if (trajo('sprintId')) {
    modoSprint = ids.sprintId === null ? 'LIMPIAR' : 'EXPLICITO';
    if (ids.sprintId !== previa.sprintId) tocados.add('sprintId');
  } else if (tocados.has('celulaId')) {
    modoSprint = ids.celulaId === null ? 'LIMPIAR' : 'PROPONER';
    ids.sprintId = null;
  }
  if (modoSprint === 'LIMPIAR') ids.sprintId = null;

  const aValidar = new Set<CampoAsignacion>();
  if (tocados.has('qeId') || tocados.has('analistaId')) {
    aValidar.add('qeId');
    aValidar.add('analistaId');
  }
  if (tocados.has('celulaId') || tocados.has('sprintId')) {
    aValidar.add('celulaId');
    aValidar.add('sprintId');
  }
  // Con sprint propuesto no hay `sprintId` que validar: lo propone Organización desde la célula.
  if (modoSprint === 'PROPONER' || modoSprint === 'LIMPIAR') aValidar.delete('sprintId');
  for (const campo of [...aValidar]) if (ids[campo] === null) aValidar.delete(campo);
  const proponerAnalista = tocados.has('qeId') && ids.qeId !== null && !trajo('analistaId');
  return { ids, modoSprint, aValidar, proponerAnalista };
}

export interface ErrorValidacion {
  readonly campo: CampoAsignacion;
  readonly codigo: Exclude<MotivoRechazo, 'ASIGNACION_INCOMPLETA' | 'FILA_NO_MARCABLE' | 'FILA_NO_ASIGNABLE'>;
}

/** Lo que Organización validó para una combinación (`AsignacionValidada`, con los campos del dominio). */
export interface ValidacionAsignacion {
  readonly errores: ErrorValidacion[];
  readonly celula: Ref | null;
  readonly qe: Ref | null;
  readonly analista: Ref | null;
  readonly sprint: Ref | null;
  readonly sprintPropuesto: { readonly sprint: Ref | null; readonly origen: 'JIRA' | 'RESPALDO' | null; readonly sprintJiraNoEncontrado: boolean } | null;
  readonly celulaSinLiderActivo: boolean;
  /** Solo con `proponerAnalista` y QE válido: Analistas activos del equipo vigente del QE (D201). */
  readonly analistasActivos?: number | null;
  /** El único Analista activo del equipo del QE, o `null` con 0 o 2+ (D201). */
  readonly analistaPropuesto?: Ref | null;
}

export interface PedidoEdicion {
  readonly cambio?: CambioAsignacion;
  readonly marcada?: boolean;
  readonly marcarListas?: boolean;
}

export type DecisionEdicion =
  | { readonly tipo: 'RECHAZADA'; readonly rechazo: Rechazo }
  | {
      readonly tipo: 'OK';
      readonly asignacion: AsignacionFila;
      /** D201: el analista lo puso el servidor por ser el único del equipo del QE. */
      readonly analistaAuto: boolean;
      readonly avisoSinLider: boolean;
      /** La advertencia `SPRINT_NO_ENCONTRADO` de D136 solo se recalcula si la célula se fijó en esta edición. */
      readonly sprintJiraNoEncontrado: boolean | null;
      readonly marcada: boolean;
      /** Estaba marcada y esta edición la dejó inválida. */
      readonly desmarcada: boolean;
      /** Quedó marcada por esta petición (cuenta en `marcadas`). */
      readonly marcadaAhora: boolean;
      /** Con `marcarListas`: es una `NUEVA` del alcance que sigue incompleta. */
      readonly incompleta: boolean;
      readonly cambioAsignacion: boolean;
    };

/** Traduce el primer error de validación al rechazo de la fila (el campo se nombra como en `CampoAsignacion`). */
export function rechazoDeValidacion(errores: readonly ErrorValidacion[]): Rechazo | null {
  const primero = errores[0];
  return primero === undefined ? null : { motivo: primero.codigo, campo: primero.campo };
}

/**
 * Decide la edición de UNA fila (D139, D145). Orden: la fila admite asignación → la validación de Organización → el
 * marcado. Una fila rechazada no cambia en nada.
 */
export function decidirEdicion(fila: EstadoFila, pedido: PedidoEdicion, combinacion: CombinacionFinal | null, validacion: ValidacionAsignacion | null): DecisionEdicion {
  // Otra petición está confirmando la fila: no se edita (D202). Un `marcarListas` de grupo la deja pasar sin tocarla.
  if (fila.aplicando === true && (pedido.cambio !== undefined || pedido.marcada !== undefined)) return { tipo: 'RECHAZADA', rechazo: { motivo: 'FILA_EN_CURSO', campo: null } };
  if (pedido.cambio !== undefined && !puedeAsignarse(fila)) {
    // D204: solo una `NUEVA` con la HDU ya creada es `HDU_YA_ASIGNADA`; `CAMBIO` y `SIN_CAMBIOS` siguen siendo `FILA_NO_ASIGNABLE` (E5-B05-T11).
    const yaCreada = fila.grupo === 'NUEVA' && !fila.aplicada && tieneYaAsignada(fila);
    return { tipo: 'RECHAZADA', rechazo: { motivo: yaCreada ? 'HDU_YA_ASIGNADA' : 'FILA_NO_ASIGNABLE', campo: null } };
  }

  let asignacion = fila.asignacion;
  let analistaAuto = fila.analistaAuto === true;
  let avisoSinLider = false;
  let sprintJiraNoEncontrado: boolean | null = null;
  let cambioAsignacion = false;
  if (pedido.cambio !== undefined && combinacion !== null) {
    if (validacion !== null) {
      const rechazo = rechazoDeValidacion(validacion.errores);
      if (rechazo !== null) return { tipo: 'RECHAZADA', rechazo };
    }
    asignacion = construirAsignacion(fila.asignacion, combinacion, validacion);
    avisoSinLider = validacion?.celulaSinLiderActivo ?? false;
    sprintJiraNoEncontrado = combinacion.modoSprint === 'PROPONER' ? (validacion?.sprintPropuesto?.sprintJiraNoEncontrado ?? false) : null;
    cambioAsignacion = JSON.stringify(idsDe(asignacion)) !== JSON.stringify(idsDe(fila.asignacion)) || asignacion.sprintOrigen !== fila.asignacion.sprintOrigen;
    // D201: el analista es automático solo si lo propuso el servidor en esta edición (o ya lo era y no se tocó el analista).
    if (pedido.cambio.analistaId !== undefined) analistaAuto = false;
    else if (combinacion.proponerAnalista) analistaAuto = asignacion.analista !== null;
    if (asignacion.analista === null) analistaAuto = false;
  }

  const completa = fila.grupo !== 'NUEVA' || estaCompleta(asignacion);
  const despues: EstadoFila = { ...fila, asignacion };
  let marcada = fila.marcada;
  let marcadaAhora = false;
  let desmarcada = false;
  let incompleta = false;

  if (pedido.marcada === true) {
    const rechazo = motivoNoMarcable(despues);
    if (rechazo !== null) return { tipo: 'RECHAZADA', rechazo };
    marcada = true;
    marcadaAhora = !fila.marcada;
  } else if (pedido.marcada === false) {
    if (fila.aplicada) return { tipo: 'RECHAZADA', rechazo: { motivo: 'FILA_NO_MARCABLE', campo: null } };
    marcada = false;
  }

  if (pedido.marcarListas === true && fila.grupo === 'NUEVA' && fila.aplicando !== true && !tieneYaAsignada(fila)) {
    if (esMarcable(despues)) {
      if (!marcada) marcadaAhora = true;
      marcada = true;
    } else if (!fila.aplicada) incompleta = true;
  }

  // Una edición que invalida una fila marcada la desmarca y lo informa.
  if (marcada && !fila.aplicada && fila.grupo === 'NUEVA' && !completa) {
    marcada = false;
    desmarcada = fila.marcada;
  }
  return { tipo: 'OK', asignacion, analistaAuto, avisoSinLider, sprintJiraNoEncontrado, marcada, desmarcada, marcadaAhora, incompleta, cambioAsignacion };
}

/** La asignación resultante: los nombres salen de la validación (D148); lo que no se tocó se conserva. */
export function construirAsignacion(actual: AsignacionFila, combinacion: CombinacionFinal, validacion: ValidacionAsignacion | null): AsignacionFila {
  const { ids } = combinacion;
  const conservar = (campo: CampoAsignacion, previa: Ref | null, nueva: Ref | null | undefined): Ref | null => {
    const id = ids[campo];
    if (id === null) return null;
    if (previa !== null && previa.id === id) return previa;
    return nueva ?? null;
  };
  const celula = conservar('celulaId', actual.celula, validacion?.celula);
  const qe = conservar('qeId', actual.qe, validacion?.qe);
  let analista = conservar('analistaId', actual.analista, validacion?.analista);
  // D201: sin analista elegido y con exactamente uno activo en el equipo vigente del QE, Organización lo propone.
  if (combinacion.proponerAnalista && ids.analistaId === null && validacion?.analistaPropuesto) analista = validacion.analistaPropuesto;

  let sprint: Ref | null = actual.sprint;
  let sprintOrigen: OrigenSprint | null = actual.sprintOrigen;
  switch (combinacion.modoSprint) {
    case 'LIMPIAR':
      sprint = null;
      sprintOrigen = null;
      break;
    case 'EXPLICITO':
      if (actual.sprint?.id === ids.sprintId) break;
      sprint = validacion?.sprint ?? null;
      sprintOrigen = sprint === null ? null : 'MANUAL';
      break;
    case 'PROPONER':
      sprint = validacion?.sprintPropuesto?.sprint ?? null;
      sprintOrigen = sprint === null ? null : (validacion?.sprintPropuesto?.origen ?? null);
      break;
    case 'MANTENER':
      break;
  }
  return { celula, qe, analista, sprint, sprintOrigen };
}
