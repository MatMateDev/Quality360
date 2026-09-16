/** `GET /health`: sin autenticación; solo informa que el proceso responde. */
import { Controller, Get } from '@nestjs/common';
import { Publico } from '@quality360/auth-nest';

@Controller('health')
export class SaludController {
  @Publico()
  @Get()
  salud(): { estado: 'ok' } {
    return { estado: 'ok' };
  }
}
