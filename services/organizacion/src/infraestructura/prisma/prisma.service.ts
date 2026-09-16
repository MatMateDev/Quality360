/**
 * Cliente de Prisma como servicio de Nest. Conecta al esquema `organizacion`
 * con el rol `svc_organizacion` (la `DATABASE_URL` ya trae `?schema=organizacion`,
 * ver prisma/schema.prisma y .env.example).
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly registro = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.registro.log('Conectado a Postgres (esquema organizacion, rol svc_organizacion).');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
