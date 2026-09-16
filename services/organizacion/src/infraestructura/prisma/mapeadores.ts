/** Traduce filas de Prisma a los tipos del dominio. Vive solo en infraestructura. */
import type { Hdu as HduPrisma, Usuario as UsuarioPrisma } from '@prisma/client';

import type { Actor, Hdu, Usuario } from '../../dominio/tipos.js';

export function aUsuarioDominio(fila: UsuarioPrisma): Usuario {
  return {
    id: fila.id,
    nombre: fila.nombre,
    correo: fila.correo,
    rol: fila.rol,
    activo: fila.activo,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
}

export function aHduDominio(fila: HduPrisma): Hdu {
  const creadoPor: Actor = { tipo: fila.creadoPorTipo, id: fila.creadoPorId, nombre: fila.creadoPorNombre };
  return {
    id: fila.id,
    codigo: fila.codigo,
    titulo: fila.titulo,
    celulaId: fila.celulaId,
    sprintId: fila.sprintId,
    prioridad: fila.prioridad,
    qeResponsableId: fila.qeResponsableId,
    analistaId: fila.analistaId,
    estado: fila.estado,
    estadoActualizadoEn: fila.estadoActualizadoEn,
    creadoPor,
    creadoEn: fila.creadoEn,
  };
}
