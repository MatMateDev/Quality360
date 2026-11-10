/**
 * Certificaciones falso para el cierre (E2-B02, E6-B05): sirve `GET /v1/hdu/{id}/checklist` y
 * `GET /v1/hdu/{id}/entregables` con los aprobados que cada prueba fija por HDU. Con `caida = true`
 * corta la conexión, como un servicio detenido.
 */
import { createServer, type Server } from 'node:http';

export const CLAVES_ENTREGABLE = [
  'PLAN_PRUEBAS',
  'DASHBOARD',
  'CASOS_PRUEBA',
  'APROBACION_CASOS',
  'EJECUCION',
  'EVIDENCIAS',
  'DEFECTOS',
  'APROBACION_UAT',
  'CERTIFICADO',
  'CIERRE_PRUEBAS',
] as const;

export class CertificacionesCierreFalsa {
  /** Aprobados por HDU (los primeros N entregables en el orden de D15). Sin fijar: 9. */
  readonly aprobados = new Map<string, number>();
  caida = false;
  /** Cuántas veces se consultó el detalle de entregables (solo el cierre con excepción lo usa). */
  consultasEntregables = 0;
  /** Si es `true`, `/entregables` responde 503 y `/checklist` sigue bien. */
  entregablesCaidos = false;
  private servidor: Server | null = null;
  url = '';

  async iniciar(): Promise<void> {
    this.servidor = createServer((peticion, respuesta) => {
      if (this.caida) {
        peticion.socket.destroy();
        return;
      }
      const enviar = (estado: number, cuerpo: unknown): void => {
        respuesta.writeHead(estado, { 'content-type': 'application/json' });
        respuesta.end(JSON.stringify(cuerpo));
      };
      const checklist = peticion.url?.match(/^\/v1\/hdu\/([^/]+)\/checklist$/);
      if (peticion.method === 'GET' && checklist) {
        const hduId = checklist[1] as string;
        const n = this.aprobados.get(hduId) ?? 9;
        return enviar(200, { hduId, totalEntregables: 10, completados: n, porcentajeCumplimiento: n * 10, completo: n === 10 });
      }
      const entregables = peticion.url?.match(/^\/v1\/hdu\/([^/]+)\/entregables$/);
      if (peticion.method === 'GET' && entregables) {
        this.consultasEntregables += 1;
        if (this.entregablesCaidos) return enviar(503, { codigo: 'SERVICIO_NO_DISPONIBLE' });
        const hduId = entregables[1] as string;
        const n = this.aprobados.get(hduId) ?? 9;
        return enviar(200, {
          hduId,
          entregables: CLAVES_ENTREGABLE.map((clave, indice) => ({ clave, orden: indice + 1, nombre: clave, estado: indice < n ? 'APROBADO' : 'PENDIENTE' })),
        });
      }
      enviar(404, { codigo: 'NO_ENCONTRADO' });
    });
    await new Promise<void>((resolver) => this.servidor?.listen(0, '127.0.0.1', resolver));
    const direccion = this.servidor.address();
    if (direccion === null || typeof direccion === 'string') throw new Error('sin puerto');
    this.url = `http://127.0.0.1:${direccion.port}`;
  }

  async cerrar(): Promise<void> {
    await new Promise<void>((resolver) => {
      if (this.servidor === null) return resolver();
      this.servidor.closeAllConnections();
      this.servidor.close(() => resolver());
    });
  }
}
