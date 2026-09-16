import { Controller, Get } from '@nestjs/common';
import { AccesoActual, Roles, type ResolucionAcceso } from '@quality360/auth-nest';

import { UsuariosAplicacion, type PerfilRespuesta } from '../../aplicacion/usuarios.servicio.js';

@Controller('v1/me')
export class SesionController {
  constructor(private readonly usuarios: UsuariosAplicacion) {}

  @Roles('ADMINISTRADOR', 'QE', 'ANALISTA_QA')
  @Get()
  async perfil(@AccesoActual() acceso: ResolucionAcceso): Promise<PerfilRespuesta> {
    return this.usuarios.perfil(acceso.usuarioId);
  }
}
