/**
 * Módulo de infraestructura: Prisma, los repositorios (ligados a los tokens
 * de `dominio/repositorios`), el resolutor de acceso y el proveedor de
 * identidad. Se importa desde `AppModule` y desde `AuthNestModule.forRoot`
 * (para que `ResolutorAccesoOrganizacion` resuelva sus propias dependencias),
 * así que exporta todo lo que uno u otro necesitan.
 */
import { Module } from '@nestjs/common';

import { AUDITORIA_REPOSITORIO } from '../dominio/repositorios/auditoria.repositorio.js';
import { CATALOGO_REPOSITORIO } from '../dominio/repositorios/catalogo.repositorio.js';
import { HDU_REPOSITORIO } from '../dominio/repositorios/hdu.repositorio.js';
import { SUPERVISION_REPOSITORIO } from '../dominio/repositorios/supervision.repositorio.js';
import { USUARIO_REPOSITORIO } from '../dominio/repositorios/usuario.repositorio.js';
import { PROVEEDOR_IDENTIDAD } from '../aplicacion/puertos/proveedor-identidad.js';
import { AuditoriaPrismaRepositorio } from './repositorios/auditoria.prisma.repositorio.js';
import { CatalogoPrismaRepositorio } from './repositorios/catalogo.prisma.repositorio.js';
import { HduPrismaRepositorio } from './repositorios/hdu.prisma.repositorio.js';
import { SupervisionPrismaRepositorio } from './repositorios/supervision.prisma.repositorio.js';
import { UsuarioPrismaRepositorio } from './repositorios/usuario.prisma.repositorio.js';
import { PrismaService } from './prisma/prisma.service.js';
import { ResolutorAccesoOrganizacion } from './seguridad/resolutor-acceso.servicio.js';
import { ProveedorIdentidadSupabase } from './supabase/proveedor-identidad.servicio.js';

@Module({
  providers: [
    PrismaService,
    { provide: USUARIO_REPOSITORIO, useClass: UsuarioPrismaRepositorio },
    { provide: SUPERVISION_REPOSITORIO, useClass: SupervisionPrismaRepositorio },
    { provide: CATALOGO_REPOSITORIO, useClass: CatalogoPrismaRepositorio },
    { provide: HDU_REPOSITORIO, useClass: HduPrismaRepositorio },
    { provide: AUDITORIA_REPOSITORIO, useClass: AuditoriaPrismaRepositorio },
    { provide: PROVEEDOR_IDENTIDAD, useClass: ProveedorIdentidadSupabase },
    ResolutorAccesoOrganizacion,
  ],
  exports: [
    PrismaService,
    USUARIO_REPOSITORIO,
    SUPERVISION_REPOSITORIO,
    CATALOGO_REPOSITORIO,
    HDU_REPOSITORIO,
    AUDITORIA_REPOSITORIO,
    PROVEEDOR_IDENTIDAD,
    ResolutorAccesoOrganizacion,
  ],
})
export class InfraestructuraModule {}
