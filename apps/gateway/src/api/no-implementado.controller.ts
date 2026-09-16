/**
 * Capacidades de servicios que aún no existen (E3 en adelante). Responden 501
 * `CAPACIDAD_NO_DISPONIBLE` después de verificar la sesión, para que el portal
 * distinga «todavía no» de «error».
 *
 * Nota: `/v1/interno/*` NO está aquí ni en ningún otro controlador. Esas rutas
 * son internas y desde afuera responden 404, como cualquier ruta inexistente.
 */
import { All, Controller } from '@nestjs/common';
import { capacidadNoDisponible } from '@quality360/auth-nest';

@Controller('v1')
export class NoImplementadoController {
  @All([
    'certificaciones{/*ruta}',
    'impedimentos{/*ruta}',
    'integraciones{/*ruta}',
  ])
  noImplementado(): never {
    throw capacidadNoDisponible(501, 'capacidad de otro servicio, aún no desplegada');
  }
}
