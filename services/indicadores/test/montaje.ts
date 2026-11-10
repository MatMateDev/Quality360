/** Arma el servicio completo para una prueba: Postgres real + las tres fuentes simuladas del `Mundo`. */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { Reloj } from '../src/aplicacion/puertos.js';
import type { ConfiguracionIndicadores } from '../src/configuracion.js';
import { crearApp } from '../src/crear-app.js';
import { configuracionPrueba } from './ayudas-app.js';
import { limpiarIndicadores } from './ayudas-bd.js';
import { bearer, CRON_SECRET, Mundo, TOKEN_INDICADORES, TOKEN_SEMILLA, type ClavePersona } from './mundo.js';

export interface Montaje {
  readonly app: NestExpressApplication;
  readonly mundo: Mundo;
  readonly config: ConfiguracionIndicadores;
  cerrar(): Promise<void>;
  /** Solicitud con la sesión de `persona` (o sin sesión si es `null`). */
  pedir(metodo: 'get' | 'post' | 'put', ruta: string, persona: ClavePersona | null, cuerpo?: unknown): Promise<request.Response>;
}

export interface OpcionesMontaje {
  config?: Partial<ConfiguracionIndicadores>;
  reloj?: Reloj;
  /** Reutiliza un mundo ya iniciado (el llamador lo cierra). */
  mundo?: Mundo;
  /** No limpia las tablas: sirve para levantar una segunda instancia sobre los mismos datos. */
  conservarDatos?: boolean;
}

export async function montar(opciones: OpcionesMontaje = {}): Promise<Montaje> {
  if (opciones.conservarDatos !== true) await limpiarIndicadores();
  const mundo = opciones.mundo ?? new Mundo();
  if (opciones.mundo === undefined) await mundo.iniciar();
  const config: ConfiguracionIndicadores = {
    ...configuracionPrueba({
      organizacionUrl: mundo.urlOrg,
      certificacionesUrl: mundo.urlCert,
      impedimentosUrl: mundo.urlImp,
      cronSecret: CRON_SECRET,
      servicioToken: TOKEN_INDICADORES,
      semillaToken: TOKEN_SEMILLA,
      permitirCargaSemilla: true,
      fuenteTimeoutMs: 1500,
      snapshotTimeoutMs: 3000,
    }),
    ...opciones.config,
  };
  const app = await crearApp(config, { registro: false, extensiones: opciones.reloj === undefined ? undefined : { reloj: opciones.reloj } });
  return {
    app,
    mundo,
    config,
    async cerrar() {
      await app.close();
      if (opciones.mundo === undefined) await mundo.cerrar();
    },
    async pedir(metodo, ruta, persona, cuerpo) {
      let peticion = request(app.getHttpServer())[metodo](ruta);
      if (persona !== null) peticion = peticion.set('authorization', await bearer(persona));
      return cuerpo === undefined ? peticion : peticion.send(cuerpo as object);
    },
  };
}
