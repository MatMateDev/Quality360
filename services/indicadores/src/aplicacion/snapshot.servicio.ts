/**
 * Snapshot diario (E6-B03#1 y #2, D162–D165, D177, D184). Lo disparan el cron (`SISTEMA`), el Administrador (manual) y el
 * gancho de pruebas. Lee con la credencial de Indicadores, no con una sesión: el snapshot necesita una vista global que
 * ningún rol de usuario tiene. Todo o nada: si una fuente falla, la ejecución queda `FALLIDA` con su motivo y no se
 * escribe ninguna fila. Otra ejecución simultánea recibe 409 `EJECUCION_EN_CURSO`.
 */
import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ExcepcionQ360, MENSAJES } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionIndicadores } from '../configuracion.js';
import { fechaSantiago } from '../dominio/fechas.js';
import { EjecucionEnCursoError, EjecucionRepositorio, SnapshotRepositorio, type Ejecucion } from '../dominio/repositorios.js';
import { construirFilasSnapshot } from '../dominio/snapshot.js';
import type { MotivoFalloSnapshot, OrigenSnapshot } from '../dominio/tipos.js';
import {
  CredencialRechazada,
  FuenteCertificaciones,
  FuenteImpedimentos,
  FuenteNoDisponible,
  FuenteOrganizacion,
  Reloj,
  type Autenticacion,
  type NombreFuente,
} from './puertos.js';

/** Una ejecución `EN_CURSO` de más de 5 minutos se considera abandonada (D164, D184). */
export const ABANDONO_MS = 5 * 60 * 1000;

export interface ActorSnapshot {
  readonly id: string | null;
  readonly nombre: string;
}

const MOTIVO_POR_FUENTE: Readonly<Record<NombreFuente, MotivoFalloSnapshot>> = {
  ORGANIZACION: 'ORGANIZACION_NO_DISPONIBLE',
  CERTIFICACIONES: 'CERTIFICACIONES_NO_DISPONIBLE',
  IMPEDIMENTOS: 'IMPEDIMENTOS_NO_DISPONIBLE',
};

export function vistaEjecucion(ejecucion: Ejecucion) {
  return {
    id: ejecucion.id,
    fecha: ejecucion.fecha,
    origen: ejecucion.origen,
    actor: { id: ejecucion.actorId, nombre: ejecucion.actorNombre },
    inicio: ejecucion.inicio.toISOString(),
    fin: ejecucion.fin === null ? null : ejecucion.fin.toISOString(),
    duracionMs: ejecucion.fin === null ? null : Math.max(0, ejecucion.fin.getTime() - ejecucion.inicio.getTime()),
    resultado: ejecucion.resultado,
    filasEscritas: ejecucion.filasEscritas,
    filasNuevas: ejecucion.filasNuevas,
    filasActualizadas: ejecucion.filasActualizadas,
    motivo: ejecucion.motivo,
  };
}

@Injectable()
export class SnapshotAplicacion {
  private readonly registro = new Logger(SnapshotAplicacion.name);

  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIndicadores,
    private readonly organizacion: FuenteOrganizacion,
    private readonly certificaciones: FuenteCertificaciones,
    private readonly impedimentos: FuenteImpedimentos,
    private readonly ejecuciones: EjecucionRepositorio,
    private readonly snapshots: SnapshotRepositorio,
    private readonly reloj: Reloj,
  ) {}

  /**
   * Ejecuta el snapshot. `instante` fija «ahora» (gancho de pruebas, D184); sin él vale el reloj. Devuelve la ejecución
   * cerrada (`EXITOSA` o `FALLIDA`); si hay otra en curso lanza 409 y no crea ejecución.
   */
  async ejecutar(origen: OrigenSnapshot, actor: ActorSnapshot, instante?: Date): Promise<ReturnType<typeof vistaEjecucion>> {
    const ahora = instante ?? this.reloj.ahora();
    const fecha = fechaSantiago(ahora);
    let ejecucion: Ejecucion;
    try {
      ejecucion = await this.ejecuciones.iniciar({ fecha, origen, actorId: actor.id, actorNombre: actor.nombre, ahora: new Date(), abandonoMs: ABANDONO_MS });
    } catch (error) {
      if (error instanceof EjecucionEnCursoError) throw new ExcepcionQ360(409, 'EJECUCION_EN_CURSO', { mensaje: MENSAJES.EJECUCION_EN_CURSO });
      throw error;
    }

    try {
      const escritas = await this.generar(fecha, ejecucion);
      return vistaEjecucion(await this.ejecuciones.terminarExitosa(ejecucion.id, escritas.nuevas, escritas.actualizadas, new Date()));
    } catch (error) {
      const motivo = this.motivoDe(error);
      this.registro.warn(`Snapshot ${ejecucion.id} fallido (${motivo}): ${error instanceof Error ? error.message : 'desconocido'}`);
      return vistaEjecucion(await this.ejecuciones.terminarFallida(ejecucion.id, motivo, new Date()));
    }
  }

  private motivoDe(error: unknown): MotivoFalloSnapshot {
    if (error instanceof MotivoFallo) return error.motivo;
    if (error instanceof CredencialRechazada) return 'CONFIGURACION_INVALIDA';
    if (error instanceof FuenteNoDisponible) return MOTIVO_POR_FUENTE[error.fuente];
    return 'ERROR_INTERNO';
  }

  private async generar(fecha: string, ejecucion: Ejecucion): Promise<{ nuevas: number; actualizadas: number }> {
    const credencial = this.configuracion.servicioToken;
    if (credencial === null) throw new MotivoFallo('CONFIGURACION_INVALIDA');
    const auth: Autenticacion & { tipo: 'servicio' } = { tipo: 'servicio', credencial, traceId: randomUUID().replace(/-/g, '') };
    const timeout = this.configuracion.snapshotTimeoutMs;

    // Se pide una HDU de más que el tope para saber si se excede sin traer todo (D164).
    const datos = await this.organizacion.snapshot(auth, this.configuracion.topeHdu + 1, timeout);
    if (datos.total > this.configuracion.topeHdu) throw new MotivoFallo('EXCEDE_TOPE');

    const avance = await this.certificaciones.avance(auth, datos.hdu.map((hdu) => hdu.id), timeout);
    const activas = datos.hdu.filter((hdu) => hdu.estado !== 'CERRADA');
    const evaluacion =
      activas.length === 0
        ? { evaluaciones: new Map() }
        : await this.impedimentos.evaluar(
            auth,
            activas.map((hdu) => ({ hduId: hdu.id, estado: hdu.estado, sprintFin: hdu.sprint?.fin ?? null, avance: (avance.get(hdu.id)?.aprobados ?? 0) * 10 })),
            false,
            timeout,
          );

    const filas = construirFilasSnapshot({ fecha, hdu: datos.hdu, ambitosQe: datos.ambitosQe, avance, evaluaciones: evaluacion.evaluaciones });
    return this.snapshots.guardarLote(filas, ejecucion.id, new Date());
  }

  async listar(pagina: number, tamanoPagina: number) {
    const { items, total } = await this.ejecuciones.listar(pagina, tamanoPagina);
    return { items: items.map(vistaEjecucion), total, pagina, tamanoPagina };
  }
}

class MotivoFallo extends Error {
  constructor(readonly motivo: MotivoFalloSnapshot) {
    super(motivo);
    this.name = 'MotivoFallo';
  }
}
