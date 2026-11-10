import { Controller, Get } from '@nestjs/common';
import { Publico } from '@quality360/auth-nest';

/** No consulta otros servicios ni informa si `CRON_SECRET` está configurado: solo dice que el proceso responde. */
@Controller('health')
export class SaludController {
  @Publico()
  @Get()
  salud(): { estado: 'ok' } {
    return { estado: 'ok' };
  }
}
