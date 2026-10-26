/**
 * Certificaciones falso para las pruebas de las bandejas (E7-B03): sirve
 * `POST /v1/interno/checklist/estados` y `GET /v1/interno/resumen-auditoria` con el
 * seguimiento que cada prueba configura. Con `caida = true` corta la conexión, como un
 * servicio detenido. Las pruebas contra Certificaciones real están en el escenario de la semilla.
 */
import { createServer, type Server } from 'node:http';

import type { SeguimientoHdu } from '../src/dominio/reglas/bandejas.js';

export function seguimientoVacio(hduId: string): SeguimientoHdu {
  return {
    hduId,
    aprobados: 0,
    porcentaje: 0,
    porAprobar: 0,
    observaciones: 0,
    siguienteEntregable: { clave: 'PLAN_PRUEBAS', orden: 1, nombre: 'Plan de pruebas' },
    certificado: null,
    listaParaCertificar: false,
    listaParaCerrar: false,
    porAprobarDesde: null,
    listaDesde: null,
    ultimaActividad: null,
  };
}

export class CertificacionesFalsa {
  readonly seguimientos = new Map<string, SeguimientoHdu>();
  caida = false;
  /** Respuesta de `GET /v1/hdu/{id}/checklist` (cierre de la HDU, D11). */
  checklistCompleto = true;
  resumen = { certificados: 2, eventosUltimos7Dias: 5 };
  /** Cuerpos recibidos en `POST /v1/interno/checklist/estados`. */
  readonly lotes: string[][] = [];
  readonly autorizaciones: Array<string | undefined> = [];
  private servidor: Server | null = null;
  url = '';

  async iniciar(): Promise<void> {
    this.servidor = createServer((peticion, respuesta) => {
      if (this.caida) {
        peticion.socket.destroy();
        return;
      }
      this.autorizaciones.push(peticion.headers.authorization);
      const enviar = (estado: number, cuerpo: unknown): void => {
        respuesta.writeHead(estado, { 'content-type': 'application/json' });
        respuesta.end(JSON.stringify(cuerpo));
      };
      const checklist = peticion.url?.match(/^\/v1\/hdu\/([^/]+)\/checklist$/);
      if (peticion.method === 'GET' && checklist !== null && checklist !== undefined) {
        const completo = this.checklistCompleto;
        return enviar(200, { hduId: checklist[1], totalEntregables: 10, completados: completo ? 10 : 9, porcentajeCumplimiento: completo ? 100 : 90, completo });
      }
      if (peticion.method === 'GET' && peticion.url === '/v1/interno/resumen-auditoria') return enviar(200, this.resumen);
      if (peticion.method === 'POST' && peticion.url === '/v1/interno/checklist/estados') {
        const partes: Buffer[] = [];
        peticion.on('data', (parte: Buffer) => partes.push(parte));
        peticion.on('end', () => {
          const { hduIds } = JSON.parse(Buffer.concat(partes).toString('utf8')) as { hduIds: string[] };
          this.lotes.push(hduIds);
          enviar(200, { items: hduIds.map((id) => this.seguimientos.get(id) ?? seguimientoVacio(id)) });
        });
        return;
      }
      enviar(404, { codigo: 'NO_ENCONTRADO' });
    });
    await new Promise<void>((resolver) => this.servidor?.listen(0, '127.0.0.1', resolver));
    const direccion = this.servidor.address();
    if (direccion === null || typeof direccion === 'string') throw new Error('sin puerto');
    this.url = `http://127.0.0.1:${direccion.port}`;
  }

  fijar(hduId: string, cambios: Partial<SeguimientoHdu>): void {
    this.seguimientos.set(hduId, { ...seguimientoVacio(hduId), ...cambios, hduId });
  }

  async cerrar(): Promise<void> {
    await new Promise<void>((resolver) => {
      if (this.servidor === null) return resolver();
      this.servidor.closeAllConnections();
      this.servidor.close(() => resolver());
    });
  }
}
