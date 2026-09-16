/** Cliente de Prisma como servicio de Nest. Conecta al esquema `impedimentos` con el rol `svc_impedimentos`. */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly registro = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.registro.log('Conectado a Postgres (esquema impedimentos, rol svc_impedimentos).');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
