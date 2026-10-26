/**
 * Altas idempotentes de la semilla E4 (D88). Inserta el impedimento y sus acciones con las fechas
 * indicadas; el estado, `abierto_desde`, `fecha_resolucion` y el responsable se derivan de las
 * acciones. No borra nada (`svc_impedimentos` no puede, D88).
 */
import { Injectable } from '@nestjs/common';

import { CargaRepositorio, type CargaImpedimentoDatos, type CargaRiesgoDatos } from '../../dominio/repositorios.js';
import { responsableAJson } from './mapeadores.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class CargaPrismaRepositorio extends CargaRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async cargarImpedimento(datos: CargaImpedimentoDatos): Promise<{ creado: boolean; id: string }> {
    const existente = await this.prisma.impedimento.findFirst({ where: { historiaId: datos.hduId, titulo: datos.titulo }, select: { id: true } });
    if (existente !== null) return { creado: false, id: existente.id };

    const registro = datos.acciones[0];
    const ultima = datos.acciones[datos.acciones.length - 1];
    if (registro === undefined || ultima === undefined) throw new Error('El impedimento necesita al menos una acción.');

    let responsable = datos.responsableInicial;
    let abiertoDesde = registro.fecha;
    for (const accion of datos.acciones) {
      if (accion.tipo === 'ESCALAR' && accion.responsableNuevo !== undefined) responsable = accion.responsableNuevo;
      if (accion.tipo === 'REABRIR') abiertoDesde = accion.fecha;
    }
    const resuelto = ultima.estado === 'RESUELTO';

    return this.prisma.$transaction(async (tx) => {
      const fila = await tx.impedimento.create({
        data: {
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          tipo: datos.tipo,
          estado: ultima.estado,
          fechaRegistro: registro.fecha,
          fechaResolucion: resuelto ? ultima.fecha : null,
          certificacionId: datos.certificacionId,
          historiaId: datos.hduId,
          responsableId: responsable.id,
          responsableNombre: responsable.nombre,
          creadoPorId: datos.creadoPor.id,
          creadoPorNombre: datos.creadoPor.nombre,
          creadoPorRol: datos.creadoPor.rol,
          abiertoDesde,
          actualizadoEn: ultima.fecha,
        },
      });
      let responsableAnterior = datos.responsableInicial;
      for (const accion of datos.acciones) {
        await tx.accionImpedimento.create({
          data: {
            impedimentoId: fila.id,
            tipoAccion: accion.tipo,
            estado: accion.estado,
            estadoAnterior: accion.tipo === 'REGISTRAR' ? null : accion.estadoAnterior,
            descripcion: accion.comentario,
            fechaAccion: accion.fecha,
            actorId: accion.actor.id,
            actorNombre: accion.actor.nombre,
            actorRol: accion.actor.rol,
            ...(accion.tipo === 'ESCALAR' && accion.responsableNuevo !== undefined
              ? { detalle: { responsableAnterior: responsableAJson(responsableAnterior), responsableNuevo: responsableAJson(accion.responsableNuevo) } }
              : {}),
          },
        });
        if (accion.tipo === 'ESCALAR' && accion.responsableNuevo !== undefined) responsableAnterior = accion.responsableNuevo;
      }
      return { creado: true, id: fila.id };
    });
  }

  async cargarRiesgo(datos: CargaRiesgoDatos): Promise<{ creado: boolean; id: string }> {
    const existente = await this.prisma.riesgoHdu.findFirst({ where: { historiaId: datos.hduId, fecha: datos.fecha }, select: { id: true } });
    if (existente !== null) return { creado: false, id: existente.id };
    const fila = await this.prisma.riesgoHdu.create({
      data: {
        historiaId: datos.hduId,
        nivel: datos.nivel,
        nivelAnterior: datos.nivelAnterior,
        justificacion: datos.justificacion,
        sugeridoAlFijar: datos.sugeridoAlFijar,
        actorId: datos.actor.id,
        actorNombre: datos.actor.nombre,
        actorRol: datos.actor.rol,
        fecha: datos.fecha,
      },
    });
    return { creado: true, id: fila.id };
  }
}
