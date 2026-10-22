import { Controller, Get } from '@nestjs/common';
import { Roles } from '@quality360/auth-nest';

import { UsuariosAplicacion, type RolCatalogo } from '../../aplicacion/usuarios.servicio.js';

@Controller('v1/roles')
export class RolesController {
  constructor(private readonly usuarios: UsuariosAplicacion) {}

  /** Los 5 roles en el orden del selector (D28, E7-B01-T01). */
  @Roles('ADMINISTRADOR')
  @Get()
  roles(): { items: RolCatalogo[] } {
    return this.usuarios.roles();
  }
}
