/**
 * Cliente de Prisma como servicio de Nest. Conecta al esquema `indicadores` con el rol `svc_indicadores`.
 * No conecta al arrancar: `DATABASE_URL` ausente o una base caída no impiden el arranque (plan E6, X0);
 * la primera consulta conecta, y si falla la capa de aplicación responde 503.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '#prisma';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
