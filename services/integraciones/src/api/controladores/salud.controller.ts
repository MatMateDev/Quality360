import { Controller, Get } from '@nestjs/common';
import { Publico } from '@quality360/auth-nest';

/** No consulta Jira, Organización ni la llave de cifrado: solo dice que el proceso responde. */
@Controller('health')
export class SaludController {
  @Publico()
  @Get()
  salud(): { estado: 'ok' } {
    return { estado: 'ok' };
  }
}
