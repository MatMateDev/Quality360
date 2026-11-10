/**
 * Casos de uso de lectura en vivo (E6-B01, E6-B02#1 y #2): opciones de filtro, cumplimiento, semáforo con drill-down y
 * carga por analista. Sin caché: cada consulta llama a las fuentes (D154). Organización caída: 503; Certificaciones o
 * Impedimentos caídos: solo lo que depende de ellos va `indisponible`, nunca 0 ni VERDE (D169).
 */
import { Inject, Injectable } from '@nestjs/common';
import { accesoDenegado, noEncontrado, servicioNoDisponible } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionIndicadores } from '../configuracion.js';
import { calcularCarga } from '../dominio/carga.js';
import { cifrasCertificaciones, cifrasOrganizacion, contarBloqueadas } from '../dominio/cumplimiento.js';
import { diasEntre, fechaSantiago } from '../dominio/fechas.js';
import { armarDrilldown, evaluarCelula, grupoDeOrden, type SemaforoCelula } from '../dominio/semaforo.js';
import {
  SIN_SPRINT,
  type AmbitoOrganizacion,
  type AvanceHdu,
  type EvaluacionHdu,
  type FiltrosVista,
  type HduAmbito,
  type ImpedimentoBloqueante,
  type MotivoSinDatos,
  type Ref,
} from '../dominio/tipos.js';
import { UmbralRepositorio } from '../dominio/repositorios.js';
import {
  AccesoRechazadoPorFuente,
  FuenteCertificaciones,
  FuenteImpedimentos,
  FuenteNoDisponible,
  FuenteOrganizacion,
  Reloj,
  type Autenticacion,
  type HduParaEvaluar,
} from './puertos.js';

export type AutSesion = Autenticacion & { tipo: 'sesion' };

export function filtrarHdu(hdus: readonly HduAmbito[], filtros: FiltrosVista): HduAmbito[] {
  return hdus.filter((hdu) => {
    if (filtros.celulaId !== null && hdu.celula.id !== filtros.celulaId) return false;
    if (filtros.sprintId === null) return true;
    return filtros.sprintId === SIN_SPRINT ? hdu.sprint === null : hdu.sprint?.id === filtros.sprintId;
  });
}

const estadoBloque = (disponible: boolean): 'ok' | 'indisponible' => (disponible ? 'ok' : 'indisponible');

@Injectable()
export class VistasAplicacion {
  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIndicadores,
    private readonly organizacion: FuenteOrganizacion,
    private readonly certificaciones: FuenteCertificaciones,
    private readonly impedimentos: FuenteImpedimentos,
    private readonly umbrales: UmbralRepositorio,
    private readonly reloj: Reloj,
  ) {}

  /** Organización caída → 503 sin cifras; negó el acceso → 403 genérico (D12, D169). */
  async ambito(auth: AutSesion): Promise<AmbitoOrganizacion> {
    try {
      return await this.organizacion.ambito(auth);
    } catch (error) {
      if (error instanceof AccesoRechazadoPorFuente) throw accesoDenegado('Organización negó el ámbito de indicadores');
      if (error instanceof FuenteNoDisponible) throw servicioNoDisponible(error.message);
      throw error;
    }
  }

  private async avanceOpcional(auth: AutSesion, ids: readonly string[]): Promise<Map<string, AvanceHdu> | null> {
    if (ids.length === 0) return new Map();
    try {
      return await this.certificaciones.avance(auth, ids, this.configuracion.fuenteTimeoutMs);
    } catch (error) {
      if (error instanceof FuenteNoDisponible || error instanceof AccesoRechazadoPorFuente) return null;
      throw error;
    }
  }

  private async evaluacionOpcional(
    auth: AutSesion,
    hdu: readonly HduParaEvaluar[],
    incluirImpedimentos: boolean,
  ): Promise<{ evaluaciones: Map<string, EvaluacionHdu>; impedimentos: ImpedimentoBloqueante[] } | null> {
    if (hdu.length === 0) return { evaluaciones: new Map(), impedimentos: [] };
    try {
      return await this.impedimentos.evaluar(auth, hdu, incluirImpedimentos, this.configuracion.fuenteTimeoutMs);
    } catch (error) {
      if (error instanceof FuenteNoDisponible || error instanceof AccesoRechazadoPorFuente) return null;
      throw error;
    }
  }

  private paraEvaluar(hdus: readonly HduAmbito[], avance: ReadonlyMap<string, AvanceHdu> | null): HduParaEvaluar[] {
    return hdus.map((hdu) => ({
      hduId: hdu.id,
      estado: hdu.estado,
      sprintFin: hdu.sprint?.fin ?? null,
      avance: avance === null ? null : (avance.get(hdu.id)?.aprobados ?? 0) * 10,
    }));
  }

  private base(filtros: FiltrosVista): { generadoEn: string; filtros: FiltrosVista } {
    return { generadoEn: this.reloj.ahora().toISOString(), filtros: { celulaId: filtros.celulaId, sprintId: filtros.sprintId } };
  }

  // ----------------------------------------------------------------- filtros (D180)
  async opcionesFiltro(auth: AutSesion) {
    const ambito = await this.ambito(auth);
    const hoy = fechaSantiago(this.reloj.ahora());
    const sprints = new Map<string, { id: string; nombre: string; celulaId: string; inicio: string; fin: string; cerrado: boolean }>();
    let hduSinSprint = 0;
    for (const hdu of ambito.hdu) {
      if (hdu.sprint === null) {
        hduSinSprint += 1;
        continue;
      }
      if (!sprints.has(hdu.sprint.id)) {
        sprints.set(hdu.sprint.id, { id: hdu.sprint.id, nombre: hdu.sprint.nombre, celulaId: hdu.celula.id, inicio: hdu.sprint.inicio, fin: hdu.sprint.fin, cerrado: diasEntre(hdu.sprint.fin, hoy) > 0 });
      }
    }
    const celulas = [...ambito.celulas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return {
      celulas,
      sprints: [...sprints.values()].sort((a, b) => b.inicio.localeCompare(a.inicio) || a.nombre.localeCompare(b.nombre, 'es')),
      hduSinSprint,
    };
  }

  // ------------------------------------------------------------- cumplimiento (B01)
  async cumplimiento(auth: AutSesion, filtros: FiltrosVista, ambitoPrevio?: AmbitoOrganizacion) {
    const ambito = ambitoPrevio ?? (await this.ambito(auth));
    const filtradas = filtrarHdu(ambito.hdu, filtros);
    const base = this.base(filtros);
    if (filtradas.length === 0) {
      const sinValor = { estado: 'ok' as const, valor: null };
      return {
        ...base,
        sinDatos: true,
        motivoSinDatos: (ambito.hdu.length === 0 ? 'AMBITO_VACIO' : 'FILTRO_SIN_COINCIDENCIAS') satisfies MotivoSinDatos,
        hduTotales: sinValor,
        certificadas: sinValor,
        cerradasConExcepcion: sinValor,
        enCurso: sinValor,
        sinIniciar: sinValor,
        bloqueadas: sinValor,
        cumplimientoPromedio: sinValor,
      };
    }

    // Certificaciones e Impedimentos en paralelo; Impedimentos solo necesita `bloqueada` (avance nulo, D188).
    const activas = filtradas.filter((hdu) => hdu.estado !== 'CERRADA');
    const [avance, evaluacion] = await Promise.all([
      this.avanceOpcional(auth, filtradas.map((hdu) => hdu.id)),
      this.evaluacionOpcional(auth, this.paraEvaluar(activas, null), false),
    ]);
    const propias = cifrasOrganizacion(filtradas);
    const cert = avance === null ? null : cifrasCertificaciones(filtradas, avance);
    const conteo = (valor: number | null) => ({ estado: estadoBloque(valor !== null), valor });
    return {
      ...base,
      sinDatos: false,
      motivoSinDatos: null,
      hduTotales: conteo(propias.hduTotales),
      certificadas: conteo(cert?.certificadas ?? null),
      cerradasConExcepcion: conteo(propias.cerradasConExcepcion),
      enCurso: conteo(cert?.enCurso ?? null),
      sinIniciar: conteo(cert?.sinIniciar ?? null),
      bloqueadas: conteo(evaluacion === null ? null : contarBloqueadas(filtradas, evaluacion.evaluaciones)),
      cumplimientoPromedio: { estado: estadoBloque(cert !== null), valor: cert?.cumplimientoPromedio ?? null },
    };
  }

  // --------------------------------------------------------------- semáforo (B02#1)
  private hduPorCelula(hdus: readonly HduAmbito[]): Map<string, HduAmbito[]> {
    const mapa = new Map<string, HduAmbito[]>();
    for (const hdu of hdus) mapa.set(hdu.celula.id, [...(mapa.get(hdu.celula.id) ?? []), hdu]);
    return mapa;
  }

  /** Cadena en serie de D188: Certificaciones (avance) y luego Impedimentos (evaluación con ese avance). */
  private async evaluarActivas(auth: AutSesion, activas: readonly HduAmbito[], incluirImpedimentos: boolean) {
    const avance = await this.avanceOpcional(auth, activas.map((hdu) => hdu.id));
    const evaluacion = await this.evaluacionOpcional(auth, this.paraEvaluar(activas, avance), incluirImpedimentos);
    return { certificacionesCaida: avance === null, evaluacion };
  }

  async semaforo(auth: AutSesion, celulaId: string | null, ambitoPrevio?: AmbitoOrganizacion) {
    return (await this.calcularSemaforo(auth, celulaId, ambitoPrevio)).cuerpo;
  }

  /** El semáforo y los datos por HDU que la exportación necesita (una HDU por fila). */
  async calcularSemaforo(auth: AutSesion, celulaId: string | null, ambitoPrevio?: AmbitoOrganizacion) {
    const ambito = ambitoPrevio ?? (await this.ambito(auth));
    const filtros: FiltrosVista = { celulaId, sprintId: null };
    const celulas = ambito.celulas.filter((celula) => celulaId === null || celula.id === celulaId);
    const base = this.base(filtros);
    if (celulas.length === 0) {
      return {
        cuerpo: {
          ...base,
          sinDatos: true,
          motivoSinDatos: (ambito.celulas.length === 0 ? 'AMBITO_VACIO' : 'FILTRO_SIN_COINCIDENCIAS') satisfies MotivoSinDatos,
          fuentes: { certificaciones: 'ok' as const, impedimentos: 'ok' as const },
          celulas: [] as Array<{ celula: Ref } & SemaforoCelula>,
        },
        evaluaciones: null as ReadonlyMap<string, EvaluacionHdu> | null,
        ambito,
      };
    }
    const porCelula = this.hduPorCelula(ambito.hdu);
    const visibles = new Set(celulas.map((celula) => celula.id));
    const activas = ambito.hdu.filter((hdu) => hdu.estado !== 'CERRADA' && visibles.has(hdu.celula.id));
    const { certificacionesCaida, evaluacion } = activas.length === 0 ? { certificacionesCaida: false, evaluacion: { evaluaciones: new Map<string, EvaluacionHdu>(), impedimentos: [] } } : await this.evaluarActivas(auth, activas, false);

    const tarjetas = celulas.map((celula) => ({
      celula: { id: celula.id, nombre: celula.nombre },
      ...this.tarjeta(porCelula.get(celula.id) ?? [], evaluacion?.evaluaciones ?? null, certificacionesCaida),
    }));
    tarjetas.sort((a, b) => grupoDeOrden(a) - grupoDeOrden(b) || a.celula.nombre.localeCompare(b.celula.nombre, 'es'));
    return {
      cuerpo: {
        ...base,
        sinDatos: false,
        motivoSinDatos: null,
        fuentes: { certificaciones: estadoBloque(!certificacionesCaida), impedimentos: estadoBloque(evaluacion !== null) },
        celulas: tarjetas,
      },
      evaluaciones: (evaluacion?.evaluaciones ?? null) as ReadonlyMap<string, EvaluacionHdu> | null,
      ambito,
    };
  }

  private tarjeta(hdus: readonly HduAmbito[], evaluaciones: ReadonlyMap<string, EvaluacionHdu> | null, certificacionesCaida: boolean): SemaforoCelula {
    return evaluarCelula({ hdu: hdus, evaluaciones, certificacionesCaida });
  }

  async drilldown(auth: AutSesion, celulaId: string) {
    const ambito = await this.ambito(auth);
    const celula: Ref | undefined = ambito.celulas.find((c) => c.id === celulaId);
    const generadoEn = this.reloj.ahora().toISOString();
    if (celula === undefined) {
      // QE y Líder: una célula fuera de su ámbito es un recurso ajeno (403), exista o no (D12).
      if (ambito.usuario.rol !== 'AUDITOR') throw accesoDenegado('célula fuera de ámbito');
      const existente = await this.buscarCelulaOrganizacion(auth, celulaId);
      if (existente === null) throw noEncontrado('célula inexistente');
      return { generadoEn, celula: { id: existente.id, nombre: existente.nombre }, estado: 'SIN_HDU' as const, color: null, calculoParcial: false, items: [] };
    }
    const hdus = ambito.hdu.filter((hdu) => hdu.celula.id === celulaId);
    const activas = hdus.filter((hdu) => hdu.estado !== 'CERRADA');
    const { certificacionesCaida, evaluacion } = activas.length === 0 ? { certificacionesCaida: false, evaluacion: { evaluaciones: new Map<string, EvaluacionHdu>(), impedimentos: [] } } : await this.evaluarActivas(auth, activas, true);
    const tarjeta = this.tarjeta(hdus, evaluacion?.evaluaciones ?? null, certificacionesCaida);
    const items = evaluacion === null ? [] : armarDrilldown(tarjeta.color, activas, evaluacion.evaluaciones, evaluacion.impedimentos);
    return {
      generadoEn,
      celula: { id: celula.id, nombre: celula.nombre },
      estado: tarjeta.estado,
      color: tarjeta.color,
      calculoParcial: tarjeta.calculoParcial || (tarjeta.estado === 'indisponible' && items.length > 0),
      items: items.map((item) => ({
        hdu: { id: item.hdu.id, codigo: item.hdu.codigo, titulo: item.hdu.titulo, estado: item.hdu.estado },
        analista: item.hdu.analista === null ? null : { id: item.hdu.analista.id, nombre: item.hdu.analista.nombre },
        riesgo: item.evaluacion.riesgo,
        motivos: item.motivos,
        impedimentoPrincipal:
          item.impedimentoPrincipal === null
            ? null
            : { id: item.impedimentoPrincipal.id, titulo: item.impedimentoPrincipal.titulo, tipo: item.impedimentoPrincipal.tipo, estado: item.impedimentoPrincipal.estado, diasAbierto: item.impedimentoPrincipal.diasAbierto },
      })),
    };
  }

  private async buscarCelulaOrganizacion(auth: AutSesion, celulaId: string): Promise<Ref | null> {
    try {
      return await this.organizacion.buscarCelula(auth, celulaId);
    } catch (error) {
      if (error instanceof FuenteNoDisponible) throw servicioNoDisponible(error.message);
      throw error;
    }
  }

  // ----------------------------------------------------------------- carga (B02#2)
  async carga(auth: AutSesion, filtros: FiltrosVista, ambitoPrevio?: AmbitoOrganizacion) {
    const ambito = ambitoPrevio ?? (await this.ambito(auth));
    const rol = ambito.usuario.rol as 'QE' | 'LIDER_QA' | 'AUDITOR';
    const filtradas = filtrarHdu(ambito.hdu, filtros);
    const base = this.base(filtros);

    const avance = await this.avanceOpcional(auth, filtradas.map((hdu) => hdu.id));
    const qeIds = rol === 'QE' ? [ambito.usuario.id] : [...new Set(ambito.analistas.map((a) => a.supervisor?.id).filter((id): id is string => id !== undefined))];
    const guardados = await this.umbrales.obtenerVarios(qeIds);
    const resultado = calcularCarga({
      rol,
      usuarioId: ambito.usuario.id,
      usuarioNombre: ambito.usuario.nombre,
      hdu: ambito.hdu,
      analistas: ambito.analistas,
      filtradas,
      avance,
      umbrales: new Map([...guardados.entries()].map(([id, umbral]) => [id, umbral.valor])),
      umbralDefecto: this.configuracion.umbralDefecto,
    });

    const sinAmbito = ambito.hdu.length === 0 && ambito.analistas.length === 0;
    const sinCoincidencias = ambito.hdu.length > 0 && filtradas.length === 0;
    const porcentaje = (valor: number | null) => ({ estado: estadoBloque(avance !== null), valor: avance === null ? null : valor });
    return {
      ...base,
      sinDatos: sinAmbito || sinCoincidencias,
      motivoSinDatos: (sinAmbito ? 'AMBITO_VACIO' : sinCoincidencias ? 'FILTRO_SIN_COINCIDENCIAS' : null) satisfies MotivoSinDatos | null,
      fuentes: { certificaciones: estadoBloque(avance !== null), impedimentos: 'ok' as const },
      grupos: resultado.grupos.map((grupo) => ({
        umbral: { qe: grupo.qe === null ? null : { id: grupo.qe.id, nombre: grupo.qe.nombre }, valor: grupo.umbral, porDefecto: grupo.umbralPorDefecto },
        filas: grupo.filas.map((fila) => ({
          analista: { id: fila.analista.id, nombre: fila.analista.nombre, activo: fila.analista.activo },
          supervisadoPorMi: fila.supervisadoPorMi,
          porEstado: fila.porEstado,
          activas: fila.activas,
          sinHdu: fila.sinHdu,
          cumplimiento: porcentaje(fila.cumplimiento),
          sobrecargado: fila.sobrecargado,
        })),
      })),
      sinAnalista: resultado.sinAnalista,
    };
  }
}
