/** Implementaciones Prisma de los puertos de persistencia (E6, X1). Todas dentro del esquema `indicadores`. */
import { Injectable } from '@nestjs/common';
import { Prisma } from '#prisma';
import type { EjecucionSnapshot } from '#prisma';

import {
  EjecucionEnCursoError,
  EjecucionRepositorio,
  SnapshotRepositorio,
  UmbralRepositorio,
  type ConsultaSnapshots,
  type Ejecucion,
  type EventoUmbral,
  type FilaSnapshot,
  type FilaSnapshotGuardada,
  type UmbralGuardado,
} from '../../dominio/repositorios.js';
import type { ColorSemaforo, MotivoFalloSnapshot, OrigenSnapshot, ResultadoSnapshot } from '../../dominio/tipos.js';
import { PrismaService } from './prisma.service.js';

const dia = (fecha: Date): string => fecha.toISOString().slice(0, 10);
const aFecha = (texto: string): Date => new Date(`${texto}T00:00:00.000Z`);

@Injectable()
export class SnapshotPrismaRepositorio extends SnapshotRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async guardarLote(filas: readonly FilaSnapshot[], idEjecucion: string, generadoEn: Date): Promise<{ nuevas: number; actualizadas: number }> {
    if (filas.length === 0) return { nuevas: 0, actualizadas: 0 };
    return this.prisma.$transaction(async (tx) => {
      let nuevas = 0;
      let actualizadas = 0;
      for (const f of filas) {
        // `xmax = 0` es verdadero solo para una fila recién insertada; en un upsert actualizado vale distinto de 0.
        const resultado = await tx.$queryRaw<Array<{ insertada: boolean }>>`
          INSERT INTO "snapshot_indicadores" (
            "fecha", "id_celula", "celula_nombre", "id_sprint", "sprint_nombre", "sprint_inicio", "sprint_fin", "ambito",
            "hdu_total", "certificadas", "cerradas_excepcion", "en_curso", "sin_iniciar", "bloqueadas", "suma_avance",
            "cumplimiento_promedio", "hdu_riesgo_alto", "hdu_riesgo_medio", "impedimentos_abiertos", "impedimentos_escalados",
            "semaforo", "id_ejecucion", "generado_en"
          ) VALUES (
            ${f.fecha}::date, ${f.idCelula}::uuid, ${f.celulaNombre}, ${f.idSprint}::uuid, ${f.sprintNombre}, ${f.sprintInicio}::date,
            ${f.sprintFin}::date, ${f.ambito}, ${f.hduTotal}, ${f.certificadas}, ${f.cerradasExcepcion}, ${f.enCurso}, ${f.sinIniciar},
            ${f.bloqueadas}, ${f.sumaAvance}, ${f.cumplimientoPromedio}::numeric, ${f.hduRiesgoAlto}, ${f.hduRiesgoMedio},
            ${f.impedimentosAbiertos}, ${f.impedimentosEscalados}, ${f.semaforo}, ${idEjecucion}::uuid, ${generadoEn}
          )
          ON CONFLICT ("fecha", "id_celula", "id_sprint", "ambito") DO UPDATE SET
            "celula_nombre" = EXCLUDED."celula_nombre", "sprint_nombre" = EXCLUDED."sprint_nombre",
            "sprint_inicio" = EXCLUDED."sprint_inicio", "sprint_fin" = EXCLUDED."sprint_fin",
            "hdu_total" = EXCLUDED."hdu_total", "certificadas" = EXCLUDED."certificadas",
            "cerradas_excepcion" = EXCLUDED."cerradas_excepcion", "en_curso" = EXCLUDED."en_curso",
            "sin_iniciar" = EXCLUDED."sin_iniciar", "bloqueadas" = EXCLUDED."bloqueadas", "suma_avance" = EXCLUDED."suma_avance",
            "cumplimiento_promedio" = EXCLUDED."cumplimiento_promedio", "hdu_riesgo_alto" = EXCLUDED."hdu_riesgo_alto",
            "hdu_riesgo_medio" = EXCLUDED."hdu_riesgo_medio", "impedimentos_abiertos" = EXCLUDED."impedimentos_abiertos",
            "impedimentos_escalados" = EXCLUDED."impedimentos_escalados", "semaforo" = EXCLUDED."semaforo",
            "id_ejecucion" = EXCLUDED."id_ejecucion", "generado_en" = EXCLUDED."generado_en"
          RETURNING (xmax = 0) AS "insertada"`;
        if (resultado[0]?.insertada === true) nuevas += 1;
        else actualizadas += 1;
      }
      return { nuevas, actualizadas };
    });
  }

  async consultar(consulta: ConsultaSnapshots): Promise<FilaSnapshotGuardada[]> {
    const filas = await this.prisma.snapshotIndicadores.findMany({
      where: {
        ambito: consulta.ambito,
        fecha: { gte: aFecha(consulta.desde), lte: aFecha(consulta.hasta) },
        ...(consulta.celulaIds === undefined ? {} : { idCelula: { in: [...consulta.celulaIds] } }),
        ...(consulta.sprintId === undefined ? {} : { idSprint: consulta.sprintId }),
      },
      orderBy: [{ fecha: 'asc' }, { idCelula: 'asc' }, { idSprint: 'asc' }],
    });
    return filas.map((fila) => ({
      id: fila.id,
      idEjecucion: fila.idEjecucion,
      generadoEn: fila.generadoEn,
      fecha: dia(fila.fecha),
      idCelula: fila.idCelula,
      celulaNombre: fila.celulaNombre,
      idSprint: fila.idSprint,
      sprintNombre: fila.sprintNombre,
      sprintInicio: dia(fila.sprintInicio),
      sprintFin: dia(fila.sprintFin),
      ambito: fila.ambito,
      hduTotal: fila.hduTotal,
      certificadas: fila.certificadas,
      cerradasExcepcion: fila.cerradasExcepcion,
      enCurso: fila.enCurso,
      sinIniciar: fila.sinIniciar,
      bloqueadas: fila.bloqueadas,
      sumaAvance: fila.sumaAvance,
      cumplimientoPromedio: fila.cumplimientoPromedio === null ? null : Number(fila.cumplimientoPromedio),
      hduRiesgoAlto: fila.hduRiesgoAlto,
      hduRiesgoMedio: fila.hduRiesgoMedio,
      impedimentosAbiertos: fila.impedimentosAbiertos,
      impedimentosEscalados: fila.impedimentosEscalados,
      semaforo: fila.semaforo as ColorSemaforo,
    }));
  }

  contar(): Promise<number> {
    return this.prisma.snapshotIndicadores.count();
  }
}

function aEjecucion(fila: EjecucionSnapshot): Ejecucion {
  return {
    id: fila.id,
    fecha: dia(fila.fecha),
    origen: fila.origen as OrigenSnapshot,
    actorId: fila.actorId,
    actorNombre: fila.actorNombre,
    inicio: fila.inicio,
    fin: fila.fin,
    resultado: fila.resultado as ResultadoSnapshot,
    filasEscritas: fila.filasEscritas,
    filasNuevas: fila.filasNuevas,
    filasActualizadas: fila.filasActualizadas,
    motivo: fila.motivo as MotivoFalloSnapshot | null,
  };
}

@Injectable()
export class EjecucionPrismaRepositorio extends EjecucionRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async iniciar(datos: { fecha: string; origen: OrigenSnapshot; actorId: string | null; actorNombre: string; ahora: Date; abandonoMs: number }): Promise<Ejecucion> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.ejecucionSnapshot.updateMany({
          where: { resultado: 'EN_CURSO', inicio: { lt: new Date(datos.ahora.getTime() - datos.abandonoMs) } },
          data: { resultado: 'FALLIDA', motivo: 'INTERRUMPIDA', fin: datos.ahora },
        });
        const fila = await tx.ejecucionSnapshot.create({
          data: {
            fecha: aFecha(datos.fecha),
            origen: datos.origen,
            actorId: datos.actorId,
            actorNombre: datos.actorNombre,
            inicio: datos.ahora,
            resultado: 'EN_CURSO',
          },
        });
        return aEjecucion(fila);
      });
    } catch (error) {
      // El índice único parcial (resultado = 'EN_CURSO') hace que la segunda ejecución simultánea falle aquí.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new EjecucionEnCursoError();
      throw error;
    }
  }

  async terminarExitosa(id: string, nuevas: number, actualizadas: number, fin: Date): Promise<Ejecucion> {
    const fila = await this.prisma.ejecucionSnapshot.update({
      where: { id },
      data: { resultado: 'EXITOSA', filasNuevas: nuevas, filasActualizadas: actualizadas, filasEscritas: nuevas + actualizadas, fin },
    });
    return aEjecucion(fila);
  }

  async terminarFallida(id: string, motivo: MotivoFalloSnapshot, fin: Date): Promise<Ejecucion> {
    const fila = await this.prisma.ejecucionSnapshot.update({ where: { id }, data: { resultado: 'FALLIDA', motivo, fin } });
    return aEjecucion(fila);
  }

  async listar(pagina: number, tamanoPagina: number): Promise<{ items: Ejecucion[]; total: number }> {
    const [filas, total] = await Promise.all([
      this.prisma.ejecucionSnapshot.findMany({ orderBy: [{ inicio: 'desc' }, { id: 'asc' }], skip: (pagina - 1) * tamanoPagina, take: tamanoPagina }),
      this.prisma.ejecucionSnapshot.count(),
    ]);
    return { items: filas.map(aEjecucion), total };
  }
}

@Injectable()
export class UmbralPrismaRepositorio extends UmbralRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private aUmbral(fila: { idQe: string; valor: number; actualizadoPor: string; actualizadoEn: Date }): UmbralGuardado {
    return { idQe: fila.idQe, valor: fila.valor, actualizadoPor: fila.actualizadoPor, actualizadoEn: fila.actualizadoEn };
  }

  async obtener(idQe: string): Promise<UmbralGuardado | null> {
    const fila = await this.prisma.umbralCarga.findUnique({ where: { idQe } });
    return fila === null ? null : this.aUmbral(fila);
  }

  async obtenerVarios(idsQe: readonly string[]): Promise<Map<string, UmbralGuardado>> {
    if (idsQe.length === 0) return new Map();
    const filas = await this.prisma.umbralCarga.findMany({ where: { idQe: { in: [...idsQe] } } });
    return new Map(filas.map((fila) => [fila.idQe, this.aUmbral(fila)]));
  }

  async fijar(datos: { idQe: string; valor: number; defecto: number; actorId: string; actorNombre: string }): Promise<{ umbral: UmbralGuardado | null; cambio: boolean }> {
    try {
      return await this.fijarUnaVez(datos);
    } catch (error) {
      // Dos primeras escrituras simultáneas del mismo QE: la perdedora choca con la clave y reintenta ya con la fila creada.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return this.fijarUnaVez(datos);
      throw error;
    }
  }

  private async fijarUnaVez(datos: { idQe: string; valor: number; defecto: number; actorId: string; actorNombre: string }): Promise<{ umbral: UmbralGuardado | null; cambio: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      // Serializa los cambios del mismo QE, también el primero (cuando aún no hay fila que bloquear con FOR UPDATE).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'umbral_carga:' + datos.idQe}))`;
      const filas = await tx.$queryRaw<Array<{ valor: number }>>`SELECT "valor" FROM "umbral_carga" WHERE "id_qe" = ${datos.idQe}::uuid FOR UPDATE`;
      const existente = filas[0];
      const vigente = existente?.valor ?? datos.defecto;
      if (vigente === datos.valor) {
        const fila = await tx.umbralCarga.findUnique({ where: { idQe: datos.idQe } });
        return { umbral: fila === null ? null : this.aUmbral(fila), cambio: false };
      }
      await tx.eventoUmbralCarga.create({
        data: { idQe: datos.idQe, valorAnterior: vigente, valorNuevo: datos.valor, actorId: datos.actorId, actorNombre: datos.actorNombre },
      });
      const fila = await tx.umbralCarga.upsert({
        where: { idQe: datos.idQe },
        create: { idQe: datos.idQe, valor: datos.valor, actualizadoPor: datos.actorId },
        update: { valor: datos.valor, actualizadoPor: datos.actorId, actualizadoEn: new Date() },
      });
      return { umbral: this.aUmbral(fila), cambio: true };
    });
  }

  async historial(idQe: string, pagina: number, tamanoPagina: number): Promise<{ items: EventoUmbral[]; total: number }> {
    const [filas, total] = await Promise.all([
      this.prisma.eventoUmbralCarga.findMany({ where: { idQe }, orderBy: [{ fecha: 'desc' }, { id: 'asc' }], skip: (pagina - 1) * tamanoPagina, take: tamanoPagina }),
      this.prisma.eventoUmbralCarga.count({ where: { idQe } }),
    ]);
    return {
      items: filas.map((fila) => ({
        id: fila.id,
        idQe: fila.idQe,
        valorAnterior: fila.valorAnterior,
        valorNuevo: fila.valorNuevo,
        actorId: fila.actorId,
        actorNombre: fila.actorNombre,
        fecha: fila.fecha,
      })),
      total,
    };
  }
}
