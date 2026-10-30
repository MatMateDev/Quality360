/**
 * Impedimentos falso para las pruebas de Organización (E4-B02-T12 a T14, E4 en las bandejas): sirve
 * `GET /v1/interno/hdu/{id}/impedimentos/abiertos` y `POST /v1/interno/impedimentos/evaluacion`
 * con los datos que cada prueba configura. Con `caida = true` corta la conexión, como un servicio
 * detenido. Las pruebas contra Impedimentos real están en `services/impedimentos`.
 */
import { createServer, type Server } from 'node:http';

import type { EvaluacionHduImpedimentos, ImpedimentoBloqueante, ImpedimentoDeLote } from '../src/aplicacion/puertos/proveedor-impedimentos.js';

export function evaluacionVacia(hduId: string): EvaluacionHduImpedimentos {
  return {
    hduId,
    bloqueada: false,
    abiertos: 0,
    escalados: 0,
    nuevos: 0,
    riesgo: { nivelVigente: 'BAJO', origen: 'SUGERIDO', estado: 'ok', calculoParcial: false },
    nivelFijado: null,
    nivelSugerido: 'BAJO',
  };
}

export class ImpedimentosFalsa {
  /** Impedimentos que impiden cerrar cada HDU (`abiertos`). */
  readonly bloqueantes = new Map<string, ImpedimentoBloqueante[]>();
  readonly evaluaciones = new Map<string, EvaluacionHduImpedimentos>();
  readonly impedimentos: ImpedimentoDeLote[] = [];
  caida = false;
  /** Lotes recibidos en la evaluación (con lo que envió Organización). */
  readonly lotes: Array<{ hdu: Array<{ hduId: string; estado: string; sprintFin: string | null; avance: number | null }>; incluirImpedimentos: boolean }> = [];
  readonly consultasAbiertos: string[] = [];
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
      const abiertos = peticion.url?.match(/^\/v1\/interno\/hdu\/([^/]+)\/impedimentos\/abiertos$/);
      if (peticion.method === 'GET' && abiertos !== null && abiertos !== undefined) {
        const hduId = abiertos[1] as string;
        this.consultasAbiertos.push(hduId);
        const todos = this.bloqueantes.get(hduId) ?? [];
        return enviar(200, { hduId, total: todos.length, items: todos.slice(0, 20) });
      }
      if (peticion.method === 'POST' && peticion.url === '/v1/interno/impedimentos/evaluacion') {
        const partes: Buffer[] = [];
        peticion.on('data', (parte: Buffer) => partes.push(parte));
        peticion.on('end', () => {
          const cuerpo = JSON.parse(Buffer.concat(partes).toString('utf8')) as (typeof this.lotes)[number];
          this.lotes.push(cuerpo);
          const ids = new Set(cuerpo.hdu.map((hdu) => hdu.hduId));
          enviar(200, {
            fechaReferencia: new Date().toISOString().slice(0, 10),
            items: cuerpo.hdu.map((hdu) => this.evaluaciones.get(hdu.hduId) ?? evaluacionVacia(hdu.hduId)),
            impedimentos: cuerpo.incluirImpedimentos ? this.impedimentos.filter((impedimento) => ids.has(impedimento.hduId)) : [],
          });
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

  /** Deja a la HDU con un impedimento abierto (o escalado): bloqueada para el cierre y para la evaluación. */
  bloquear(hduId: string, titulo = 'Ambiente no responde', estado: 'ABIERTO' | 'ESCALADO' = 'ABIERTO'): ImpedimentoBloqueante {
    const bloqueante: ImpedimentoBloqueante = { id: crypto.randomUUID(), titulo, tipo: 'AMBIENTE', estado, diasAbierto: 2 };
    this.bloqueantes.set(hduId, [...(this.bloqueantes.get(hduId) ?? []), bloqueante]);
    return bloqueante;
  }

  async cerrar(): Promise<void> {
    await new Promise<void>((resolver) => {
      if (this.servidor === null) return resolver();
      this.servidor.closeAllConnections();
      this.servidor.close(() => resolver());
    });
  }
}
