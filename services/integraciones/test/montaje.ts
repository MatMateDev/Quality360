/** Arma el servicio completo para una prueba: Postgres real + Organización falsa + Jira falso + mapeo y lector falsos. */
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { ConfiguracionIntegraciones } from '../src/configuracion.js';
import { crearApp } from '../src/crear-app.js';
import { configuracionPrueba } from './ayudas-app.js';
import {
  CELULA_C,
  JiraFalso,
  LectorFalso,
  MapeadorFalso,
  PERSONAS,
  RegistroCapturado,
  SPRINT_1,
  TOKEN_JIRA,
  bearer,
  iniciarOrganizacionFalsa,
  limpiarIntegraciones,
  type ClavePersona,
  type OrganizacionFalsa,
} from './ayudas.js';

export interface Montaje {
  readonly app: NestExpressApplication;
  readonly org: OrganizacionFalsa;
  readonly jira: JiraFalso;
  readonly registro: RegistroCapturado | null;
  readonly config: ConfiguracionIntegraciones;
  cerrar(): Promise<void>;
  /** Solicitud HTTP con la sesión de `persona` (o sin sesión si es `null`). */
  pedir(metodo: 'get' | 'post' | 'put', ruta: string, persona: ClavePersona | null, cuerpo?: unknown): Promise<request.Response>;
}

export interface OpcionesMontaje {
  config?: Partial<ConfiguracionIntegraciones>;
  /** Captura el registro del servicio para buscar secretos (E5-B01-T11). */
  capturarRegistro?: boolean;
  /** Reutiliza una Organización falsa ya iniciada. */
  org?: OrganizacionFalsa;
  /** No limpia las tablas: sirve para levantar una segunda instancia sobre los mismos datos (otra llave, otro límite). */
  conservarDatos?: boolean;
}

export async function montar(opciones: OpcionesMontaje = {}): Promise<Montaje> {
  if (opciones.conservarDatos !== true) await limpiarIntegraciones();
  const org = opciones.org ?? (await iniciarOrganizacionFalsa());
  const jira = new JiraFalso();
  const registro = opciones.capturarRegistro === true ? new RegistroCapturado() : null;
  if (registro !== null) Logger.overrideLogger(registro);
  const config = configuracionPrueba(org.url, opciones.config);
  const app = await crearApp(config, {
    registro: registro !== null,
    extensiones: { fuenteJira: jira, mapeador: new MapeadorFalso(), lector: new LectorFalso() },
  });
  return {
    app,
    org,
    jira,
    registro,
    config,
    async cerrar() {
      await app.close();
      if (opciones.org === undefined) await org.cerrar();
      if (registro !== null) Logger.overrideLogger(false);
    },
    async pedir(metodo, ruta, persona, cuerpo) {
      let peticion = request(app.getHttpServer())[metodo](ruta);
      if (persona !== null) peticion = peticion.set('authorization', await bearer(persona));
      return cuerpo === undefined ? peticion : peticion.send(cuerpo as object);
    },
  };
}

/** Cuerpo base de `PUT /v1/integraciones/jira/configuracion` (destino de CEL-C). */
export function configuracionBase(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sitio: 'http://127.0.0.1:4010',
    correo: 'admin@quality360.local',
    token: TOKEN_JIRA,
    proyecto: 'QTY',
    tiposIssue: ['Story', 'Historia'],
    celulaId: CELULA_C.id,
    qeResponsableId: PERSONAS.qe2.id,
    sprintRespaldoId: SPRINT_1.id,
    ...cambios,
  };
}

/** Guarda la configuración base como `adm1` y devuelve la respuesta. */
export async function guardarConfiguracion(m: Montaje, cambios: Record<string, unknown> = {}): Promise<request.Response> {
  return m.pedir('put', '/v1/integraciones/jira/configuracion', 'adm1', configuracionBase(cambios));
}
