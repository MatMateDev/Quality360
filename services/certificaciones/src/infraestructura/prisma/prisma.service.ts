/** Cliente de Prisma como servicio de Nest. Conecta al esquema `certificaciones` con el rol `svc_certificaciones`. */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '#prisma';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly registro = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.registro.log('Conectado a Postgres (esquema certificaciones, rol svc_certificaciones).');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
