/** Arma el servicio completo para una prueba: Postgres real + Organización falsa + Jira falso + mapeo real y lector falso. */
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { ConfiguracionIntegraciones } from '../src/configuracion.js';
import type { CredencialFuenteJira, FuenteJira, OpcionesLlamada } from '../src/dominio/puertos/fuente-jira.js';
import { ClienteJiraHttp } from '../src/infraestructura/jira/cliente-jira-http.js';
import { crearAutorizador, crearMapeador } from '../src/composicion-externa.js';
import { CLIENT_ID_PRUEBA, CLIENT_SECRET_PRUEBA, REDIRECT_PRUEBA, type AtlassianDoble } from './atlassian-doble.js';
import { crearApp } from '../src/crear-app.js';
import { configuracionPrueba } from './ayudas-app.js';
import {
  CELULA_C,
  JiraFalso,
  LectorFalso,
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
  pedir(metodo: 'get' | 'post' | 'put' | 'patch' | 'delete', ruta: string, persona: ClavePersona | null, cuerpo?: unknown): Promise<request.Response>;
}

export interface OpcionesMontaje {
  config?: Partial<ConfiguracionIntegraciones>;
  /** Captura el registro del servicio para buscar secretos (E5-B01-T11). */
  capturarRegistro?: boolean;
  /** Reutiliza una Organización falsa ya iniciada. */
  org?: OrganizacionFalsa;
  /** No limpia las tablas: sirve para levantar una segunda instancia sobre los mismos datos (otra llave, otro límite). */
  conservarDatos?: boolean;
  /** Reemplaza al `JiraFalso` (p. ej. el cliente HTTP real contra un servidor local, para ver las peticiones y su `fields`). */
  fuenteJira?: FuenteJira;
  /**
   * Habilita la conexión OAuth contra este doble de Atlassian (variables `JIRA_OAUTH_*` presentes y hosts de prueba). Las
   * credenciales OAuth van al cliente HTTP real contra el doble; las del API token siguen yendo al `JiraFalso`.
   */
  atlassian?: AtlassianDoble;
}

/** OAuth contra el cliente HTTP real; API token contra el `JiraFalso` programable (comportamiento de siempre). */
export class FuenteJiraMixta implements FuenteJira {
  constructor(
    private readonly falso: JiraFalso,
    private readonly http: ClienteJiraHttp,
  ) {}

  private por(c: CredencialFuenteJira): FuenteJira {
    return 'tipo' in c ? this.http : this.falso;
  }

  probar(c: CredencialFuenteJira, proyecto: string, o: OpcionesLlamada) {
    return this.por(c).probar(c, proyecto, o);
  }

  probarCuenta(c: CredencialFuenteJira, o: OpcionesLlamada) {
    return this.por(c).probarCuenta(c, o);
  }

  detectarCampoSprint(c: CredencialFuenteJira, o: OpcionesLlamada) {
    return this.por(c).detectarCampoSprint(c, o);
  }

  detectarCampos(c: CredencialFuenteJira, o: OpcionesLlamada) {
    return this.por(c).detectarCampos(c, o);
  }

  buscarPagina(c: CredencialFuenteJira, q: Parameters<FuenteJira['buscarPagina']>[1], o: OpcionesLlamada) {
    return this.por(c).buscarPagina(c, q, o);
  }
}

export function configuracionOauth(doble: AtlassianDoble): ConfiguracionIntegraciones['oauth'] {
  return { clientId: CLIENT_ID_PRUEBA, clientSecret: CLIENT_SECRET_PRUEBA, redirectUri: REDIRECT_PRUEBA, urlAutorizacion: doble.url, urlApi: doble.url, disponible: true };
}

export async function montar(opciones: OpcionesMontaje = {}): Promise<Montaje> {
  if (opciones.conservarDatos !== true) await limpiarIntegraciones();
  const org = opciones.org ?? (await iniciarOrganizacionFalsa());
  const jira = new JiraFalso();
  const registro = opciones.capturarRegistro === true ? new RegistroCapturado() : null;
  if (registro !== null) Logger.overrideLogger(registro);
  const doble = opciones.atlassian;
  const config = configuracionPrueba(org.url, { ...(doble === undefined ? {} : { oauth: configuracionOauth(doble) }), ...opciones.config });
  const fuenteJira =
    opciones.fuenteJira ?? (doble === undefined ? jira : new FuenteJiraMixta(jira, new ClienteJiraHttp({ permitirHostPrueba: true, urlApiOauth: doble.url })));
  const app = await crearApp(config, {
    registro: registro !== null,
    extensiones: {
      fuenteJira,
      mapeador: crearMapeador(),
      lector: new LectorFalso(),
      ...(doble === undefined ? {} : { autorizador: crearAutorizador(config) }),
    },
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
