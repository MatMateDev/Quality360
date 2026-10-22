import { Injectable } from '@nestjs/common';

import type { CatalogoRepositorio } from '../../dominio/repositorios/catalogo.repositorio.js';
import type { Celula, Sprint } from '../../dominio/tipos.js';
import type { EstadoSprint } from '../../dominio/reglas/sprint.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Solo los campos del dominio: los atributos nuevos del modelo de datos no salen por la API. */
const CAMPOS_CELULA = { id: true, nombre: true } as const;
const CAMPOS_SPRINT = { id: true, nombre: true, inicio: true, fin: true } as const;

@Injectable()
export class CatalogoPrismaRepositorio implements CatalogoRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  async listarCelulas(): Promise<Celula[]> {
    return this.prisma.celula.findMany({ select: CAMPOS_CELULA, orderBy: { nombre: 'asc' } });
  }

  async listarSprints(): Promise<Sprint[]> {
    return this.prisma.sprint.findMany({ select: CAMPOS_SPRINT, orderBy: { inicio: 'asc' } });
  }

  async buscarCelula(id: string): Promise<Celula | null> {
    return this.prisma.celula.findUnique({ where: { id }, select: CAMPOS_CELULA });
  }

  async buscarCelulas(ids: readonly string[]): Promise<Celula[]> {
    if (ids.length === 0) return [];
    return this.prisma.celula.findMany({ where: { id: { in: [...ids] } }, select: CAMPOS_CELULA });
  }

  async buscarSprint(id: string): Promise<Sprint | null> {
    return this.prisma.sprint.findUnique({ where: { id }, select: CAMPOS_SPRINT });
  }

  async crearCelulaSiNoExiste(nombre: string): Promise<{ creado: boolean; celula: Celula }> {
    const existente = await this.prisma.celula.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } }, select: CAMPOS_CELULA });
    if (existente !== null) return { creado: false, celula: existente };
    const celula = await this.prisma.celula.create({ data: { nombre }, select: CAMPOS_CELULA });
    return { creado: true, celula };
  }

  async crearSprintSiNoExiste(datos: {
    nombre: string;
    inicio: Date;
    fin: Date;
    estado: EstadoSprint;
    celulaId: string;
  }): Promise<{ creado: boolean; sprint: Sprint }> {
    const existente = await this.prisma.sprint.findFirst({
      where: { nombre: { equals: datos.nombre, mode: 'insensitive' } },
      select: CAMPOS_SPRINT,
    });
    if (existente !== null) return { creado: false, sprint: existente };
    const sprint = await this.prisma.sprint.create({ data: datos, select: CAMPOS_SPRINT });
    return { creado: true, sprint };
  }
}
