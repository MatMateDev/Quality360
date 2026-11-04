/**
 * Edición de las filas de una consulta (D139, D145): asignar y marcar, por fila o en grupo. Última escritura gana (no
 * exige `version`). Las combinaciones finales se deduplican antes de validarlas con Organización (una llamada por
 * combinación distinta, en lotes de 100) y todas las filas se guardan en una sola transacción que sube `version` en 1,
 * salvo que nada haya cambiado. Un rechazo en un alcance de varias filas se informa y no frena a las demás; con una sola
 * fila es un 422. No audita fila por fila (es un borrador, D141).
 */
import { Inject, Injectable } from '@nestjs/common';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import {
  combinarAsignacion,
  decidirEdicion,
  puedeAsignarse,
  type CombinacionFinal,
  type ValidacionAsignacion,
} from '../dominio/consulta/asignacion.js';
import { ConsultaNoEncontrada, FilaRechazadaUnica, type FilaRechazadaDto } from '../dominio/consulta/errores.js';
import type { ItemConsulta } from '../dominio/consulta/tipos.js';
import { Presupuesto } from '../dominio/ejecucion.js';
import type { AdvertenciaFila } from '../dominio/tipos.js';
import type { EntradaEdicion } from '../api/validacion/consulta.js';
import { ConsultaAplicacion } from './consulta.servicio.js';
import { ConsultaRepositorio, ProveedorOrganizacion, Reloj, type AsignacionAValidar, type EdicionDeFila, type Solicitante } from './puertos.js';
import { vistaItem } from './vistas-consulta.js';

const MAXIMO_ITEMS_RESPUESTA = 100;

@Injectable()
export class EdicionConsultaAplicacion {
  constructor(
    private readonly consulta: ConsultaAplicacion,
    private readonly consultas: ConsultaRepositorio,
    private readonly organizacion: ProveedorOrganizacion,
    private readonly reloj: Reloj,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  /** `PATCH /consultas/{id}/items`. */
  async editar(solicitante: Solicitante, id: string, entrada: EntradaEdicion) {
    // Primera lectura solo para saber qué filas bloquear (y dar el 404/409 sin tomar bloqueos); la decisión se
    // recalcula con las filas ya bloqueadas, de modo que cada PATCH fusiona sobre lo confirmado por el anterior.
    await this.consulta.abierta(id);
    const previas = await this.filasDelAlcance(id, entrada);
    return this.consultas.conFilasBloqueadas(
      id,
      previas.map((f) => f.id),
      () => this.editarBloqueada(solicitante, id, entrada),
    );
  }

  private async editarBloqueada(solicitante: Solicitante, id: string, entrada: EntradaEdicion) {
    const c = await this.consulta.abierta(id);
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const limite = (): number => presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs);

    const filas = await this.filasDelAlcance(c.id, entrada);
    const unica = entrada.alcance.tipo === 'IDS' && entrada.alcance.itemIds.length === 1;

    // 1) Combinación final de cada fila que se va a asignar.
    const combinaciones = new Map<string, CombinacionFinal>();
    if (entrada.cambio !== undefined) {
      for (const fila of filas) if (puedeAsignarse(fila)) combinaciones.set(fila.id, combinarAsignacion(fila.asignacion, entrada.cambio));
    }

    // 2) Validación con Organización: una llamada por combinación distinta.
    const sprintRespaldoId = c.sugerencia.sprintRespaldo?.id ?? null;
    const aValidar = new Map<string, AsignacionAValidar>();
    const refDeFila = new Map<string, string>();
    for (const fila of filas) {
      const comb = combinaciones.get(fila.id);
      if (comb === undefined) continue;
      const pedido = pedidoDeValidacion(comb, fila, sprintRespaldoId);
      if (pedido === null) continue;
      const { ref: _ref, ...contenido } = pedido;
      const clave = JSON.stringify(contenido);
      if (!aValidar.has(clave)) aValidar.set(clave, { ...pedido, ref: `v${aValidar.size}` });
      refDeFila.set(fila.id, (aValidar.get(clave) as AsignacionAValidar).ref);
    }
    const validaciones = new Map<string, ValidacionAsignacion>();
    if (aValidar.size > 0) {
      for (const v of await this.organizacion.validarAsignaciones([...aValidar.values()], solicitante.contexto, limite())) validaciones.set(v.ref, v);
    }

    // 3) Decisión por fila.
    const rechazadas: FilaRechazadaDto[] = [];
    const ediciones: EdicionDeFila[] = [];
    const cambiadas: ItemConsulta[] = [];
    const desmarcadas: string[] = [];
    let marcadas = 0;
    let incompletas = 0;
    let actor: { id: string; nombre: string } | null = null;
    const ahora = this.reloj.ahora();

    for (const fila of filas) {
      const comb = combinaciones.get(fila.id) ?? null;
      const ref = refDeFila.get(fila.id);
      const validacion = ref === undefined ? null : (validaciones.get(ref) ?? null);
      const d = decidirEdicion(fila, { cambio: entrada.cambio, marcada: entrada.marcada, marcarListas: entrada.marcarListas }, comb, validacion);
      if (d.tipo === 'RECHAZADA') {
        const dto: FilaRechazadaDto = {
          itemId: fila.id,
          codigo: fila.codigo,
          campo: d.rechazo.campo,
          motivo: d.rechazo.motivo,
          ...(d.rechazo.faltantes === undefined ? {} : { faltantes: d.rechazo.faltantes }),
        };
        if (unica) throw new FilaRechazadaUnica(dto);
        rechazadas.push(dto);
        continue;
      }
      if (d.marcadaAhora) marcadas += 1;
      if (d.incompleta) incompletas += 1;
      if (d.desmarcada && fila.codigo !== null) desmarcadas.push(fila.codigo);

      const advertencias = ajustarAdvertencias(fila.advertencias, d.sprintJiraNoEncontrado);
      const avisoSinLider = comb === null ? fila.avisoSinLider : avisoDe(comb, validacion, fila.avisoSinLider);
      const cambio =
        d.cambioAsignacion ||
        d.marcada !== fila.marcada ||
        avisoSinLider !== fila.avisoSinLider ||
        advertencias.length !== fila.advertencias.length;
      if (!cambio) continue;
      if (d.cambioAsignacion && actor === null) actor = await this.organizacion.perfil(solicitante.contexto, limite());
      const asignadoPor = d.cambioAsignacion ? actor : fila.asignadoPor;
      const asignadoEn = d.cambioAsignacion ? ahora : fila.asignadoEn;
      ediciones.push({ itemId: fila.id, asignacion: d.asignacion, avisoSinLider, marcada: d.marcada, advertencias, asignadoPor, asignadoEn });
      cambiadas.push({ ...fila, asignacion: d.asignacion, avisoSinLider, marcada: d.marcada, advertencias, asignadoPor, asignadoEn });
    }

    // 4) Guardar todo junto; si nada cambió, la versión no sube.
    let version = c.version;
    if (ediciones.length > 0) {
      const nueva = await this.consultas.guardarEdiciones(c.id, ediciones, ahora);
      if (nueva === null) throw await this.consulta.errorActual(c.id, 'CONSULTA_NO_ABIERTA');
      version = nueva;
    }
    return {
      aplicadas: ediciones.length,
      marcadas,
      incompletas,
      rechazadas,
      desmarcadas,
      version,
      items: cambiadas.slice(0, MAXIMO_ITEMS_RESPUESTA).map((i) => vistaItem(i, c.sitioHost)),
    };
  }

  private async filasDelAlcance(consultaId: string, entrada: EntradaEdicion): Promise<ItemConsulta[]> {
    if (entrada.alcance.tipo === 'GRUPO') return this.consultas.itemsDeGrupo(consultaId, entrada.alcance.grupo, entrada.alcance.q);
    const pedidas = entrada.alcance.itemIds;
    const encontradas = await this.consultas.obtenerItems(consultaId, pedidas);
    // Un `itemId` de otra consulta (o inexistente) es 404 y no cambia nada.
    if (encontradas.length !== pedidas.length) throw new ConsultaNoEncontrada();
    const porId = new Map(encontradas.map((i) => [i.id, i]));
    return pedidas.map((id) => porId.get(id) as ItemConsulta);
  }
}

/** Lo que se le pide a Organización por una combinación; `null` si no hay nada que validar ni proponer. */
function pedidoDeValidacion(comb: CombinacionFinal, fila: ItemConsulta, sprintRespaldoId: string | null): AsignacionAValidar | null {
  const proponer = comb.modoSprint === 'PROPONER';
  if (comb.aValidar.size === 0 && !proponer) return null;
  const { ids } = comb;
  return {
    ref: '',
    ...(comb.aValidar.has('celulaId') && ids.celulaId !== null ? { celulaId: ids.celulaId } : {}),
    ...(comb.aValidar.has('qeId') && ids.qeId !== null ? { qeResponsableId: ids.qeId } : {}),
    ...(comb.aValidar.has('analistaId') && ids.analistaId !== null ? { analistaId: ids.analistaId } : {}),
    ...(comb.aValidar.has('sprintId') && ids.sprintId !== null ? { sprintId: ids.sprintId } : {}),
    ...(proponer ? { proponerSprint: { nombreJira: fila.sprintJira, respaldoId: sprintRespaldoId } } : {}),
  };
}

/** `SPRINT_NO_ENCONTRADO` solo se recalcula si la célula se fijó en esta edición (`null`: se conserva). */
function ajustarAdvertencias(actuales: AdvertenciaFila[], sprintJiraNoEncontrado: boolean | null): AdvertenciaFila[] {
  if (sprintJiraNoEncontrado === null) return actuales;
  const sin = actuales.filter((a) => a !== 'SPRINT_NO_ENCONTRADO');
  return sprintJiraNoEncontrado ? [...sin, 'SPRINT_NO_ENCONTRADO'] : sin;
}

/** El aviso «célula sin líder» sigue a la célula: se recalcula al tocarla y se limpia si se quita. */
function avisoDe(comb: CombinacionFinal, validacion: ValidacionAsignacion | null, actual: boolean): boolean {
  if (comb.ids.celulaId === null) return false;
  if (comb.aValidar.has('celulaId') && validacion !== null) return validacion.celulaSinLiderActivo;
  return actual;
}
