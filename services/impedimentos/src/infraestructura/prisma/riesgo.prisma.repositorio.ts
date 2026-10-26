/** Persistencia de `riesgo_hdu` (solo inserción, D65). El vigente es la última fila de la HDU. */
import { Injectable } from '@nestjs/common';

import { RiesgoRepositorio, type PlanRiesgo } from '../../dominio/repositorios.js';
import type { RiesgoFijadoRegistro } from '../../dominio/tipos.js';
import { aRiesgo } from './mapeadores.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class RiesgoPrismaRepositorio extends RiesgoRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ultimoPorHdu(hduIds: readonly string[]): Promise<Map<string, RiesgoFijadoRegistro>> {
    const resultado = new Map<string, RiesgoFijadoRegistro>();
    if (hduIds.length === 0) return resultado;
    // `DISTINCT ON` queda del lado de la base: una fila por HDU, la más reciente.
    const filas = await this.prisma.riesgoHdu.findMany({
      where: { historiaId: { in: [...hduIds] } },
      orderBy: [{ historiaId: 'asc' }, { fecha: 'desc' }, { id: 'desc' }],
      distinct: ['historiaId'],
    });
    for (const fila of filas) resultado.set(fila.historiaId, aRiesgo(fila));
    return resultado;
  }

  async fijar(
    hduId: string,
    decidir: (ultimo: RiesgoFijadoRegistro | null) => PlanRiesgo | null,
  ): Promise<{ cambio: boolean; registro: RiesgoFijadoRegistro }> {
    return this.prisma.$transaction(async (tx) => {
      // Dos cambios simultáneos no deben tomar el mismo `nivel_anterior`: se serializan por HDU.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${hduId}, 0))`;
      const ultimaFila = await tx.riesgoHdu.findFirst({ where: { historiaId: hduId }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }] });
      const ultimo = ultimaFila === null ? null : aRiesgo(ultimaFila);
      const plan = decidir(ultimo);
      if (plan === null) {
        if (ultimo === null) throw new Error('El plan de riesgo no puede omitirse sin un nivel previo.');
        return { cambio: false, registro: ultimo };
      }
      const fila = await tx.riesgoHdu.create({
        data: {
          historiaId: hduId,
          nivel: plan.nivel,
          nivelAnterior: ultimo?.nivel ?? null,
          justificacion: plan.justificacion,
          sugeridoAlFijar: plan.sugeridoAlFijar,
          actorId: plan.actor.id,
          actorNombre: plan.actor.nombre,
          actorRol: plan.actor.rol,
          fecha: plan.ahora,
        },
      });
      return { cambio: true, registro: aRiesgo(fila) };
    });
  }
}
