import { Injectable } from '@nestjs/common';

import type { CatalogoRepositorio } from '../../dominio/repositorios/catalogo.repositorio.js';
import type { Celula, Sprint } from '../../dominio/tipos.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CatalogoPrismaRepositorio implements CatalogoRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  async listarCelulas(): Promise<Celula[]> {
    return this.prisma.celula.findMany({ orderBy: { nombre: 'asc' } });
  }

  async listarSprints(): Promise<Sprint[]> {
    return this.prisma.sprint.findMany({ orderBy: { inicio: 'asc' } });
  }

  async buscarCelula(id: string): Promise<Celula | null> {
    return this.prisma.celula.findUnique({ where: { id } });
  }

  async buscarSprint(id: string): Promise<Sprint | null> {
    return this.prisma.sprint.findUnique({ where: { id } });
  }

  async crearCelulaSiNoExiste(nombre: string): Promise<{ creado: boolean; celula: Celula }> {
    const existente = await this.prisma.celula.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
    if (existente !== null) return { creado: false, celula: existente };
    const celula = await this.prisma.celula.create({ data: { nombre } });
    return { creado: true, celula };
  }

  async crearSprintSiNoExiste(nombre: string, inicio: Date, fin: Date): Promise<{ creado: boolean; sprint: Sprint }> {
    const existente = await this.prisma.sprint.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
    if (existente !== null) return { creado: false, sprint: existente };
    const sprint = await this.prisma.sprint.create({ data: { nombre, inicio, fin } });
    return { creado: true, sprint };
  }
}
