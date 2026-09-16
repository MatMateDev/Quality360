import { Module } from '@nestjs/common';

import { InfraestructuraModule } from '../infraestructura/infraestructura.module.js';
import { AccesoAplicacion } from './acceso.servicio.js';
import { AuditoriaAplicacion } from './auditoria.servicio.js';
import { CargaSemillaAplicacion } from './carga-semilla.servicio.js';
import { CatalogosAplicacion } from './catalogos.servicio.js';
import { HduAplicacion } from './hdu.servicio.js';
import { ResumenesAplicacion } from './resumenes.servicio.js';
import { SupervisionAplicacion } from './supervision.servicio.js';
import { UsuariosAplicacion } from './usuarios.servicio.js';

const SERVICIOS = [
  UsuariosAplicacion,
  SupervisionAplicacion,
  CatalogosAplicacion,
  AuditoriaAplicacion,
  AccesoAplicacion,
  ResumenesAplicacion,
  HduAplicacion,
  CargaSemillaAplicacion,
];

@Module({
  imports: [InfraestructuraModule],
  providers: [...SERVICIOS],
  exports: [...SERVICIOS],
})
export class AplicacionModule {}
