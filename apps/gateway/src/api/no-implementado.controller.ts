/**
 * Capacidades de servicios que aún no existen en el gateway (hoy, solo el
 * prefijo `/v1/certificaciones`; Certificaciones, Impedimentos e
 * Integraciones tienen sus rutas declaradas una por una). Responden 501
 * `CAPACIDAD_NO_DISPONIBLE` después de verificar la sesión, para que el portal
 * distinga «todavía no» de «error».
 *
 * `integraciones{/*ruta}` se retiró en E5 (D127): una ruta de Integraciones
 * que no está en `IntegracionesController` responde 404.
 *
 * Nota: `/v1/interno/*` NO está aquí ni en ningún otro controlador. Esas rutas
 * son internas y desde afuera responden 404, como cualquier ruta inexistente.
 */
import { All, Controller } from '@nestjs/common';
import { capacidadNoDisponible } from '@quality360/auth-nest';

@Controller('v1')
export class NoImplementadoController {
  @All(['certificaciones{/*ruta}'])
  noImplementado(): never {
    throw capacidadNoDisponible(501, 'capacidad de otro servicio, aún no desplegada');
  }
}
