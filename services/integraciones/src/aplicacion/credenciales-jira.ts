/**
 * Credencial de Jira por OAuth (D214, D215, ADR 0019). Entrega al resto de la aplicación una `SesionJira`: la credencial
 * vigente y una forma de llamar a Jira que, ante un 401, hace UNA renovación forzada y UN reintento por operación.
 *
 * Renovación (rotación del token de renovación):
 *  1. Si faltan 5 minutos o más para el vencimiento, el acceso se usa sin candado.
 *  2. Si no: `$transaction` con `SET LOCAL lock_timeout`, `SELECT … FOR UPDATE` de la fila, relectura (si otro proceso ya
 *     renovó, se usa su acceso), llamada a Atlassian, y se guardan el token de renovación NUEVO, el acceso y el vencimiento.
 *  3. La transacción se confirma ANTES de usar el acceso nuevo. Si el candado no se obtiene (55P03): `JIRA_TIEMPO_AGOTADO`.
 *
 * Fallo definitivo (HTTP 400, 401 o 403 de Atlassian): `RECONEXION_NECESARIA`, tokens borrados y un solo `REFRESCO_FALLIDO`.
 * Red, tiempo, 5xx y 429 no tocan la credencial. Ningún token, `code` ni secreto se registra ni se devuelve.
 */
import { Inject, Injectable } from '@nestjs/common';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import type { Presupuesto } from '../dominio/ejecucion.js';
import { CandadoNoObtenido, JiraNoConfigurado, LlaveCifradoNoDisponible, OauthNoConfigurado, OrganizacionDenego, OrganizacionNoDisponible } from '../dominio/errores.js';
import {
  DATO_ASOCIADO_ACCESO,
  DATO_ASOCIADO_RENOVACION,
  calcularVencimiento,
  necesitaRenovar,
  transicionPorFalloDefinitivo,
  type ConexionOauth,
} from '../dominio/oauth/conexion.js';
import type { SitioJira } from '../dominio/oauth/sitios.js';
import { AUTORIZADOR_ATLASSIAN, type AutorizadorAtlassian, type FalloAtlassian } from '../dominio/puertos/autorizador-atlassian.js';
import type { CredencialFuenteJira, CredencialJiraOauth, EventoEspera, OpcionesLlamada, ResultadoJira } from '../dominio/puertos/fuente-jira.js';
import type { CodigoErrorIntegracion } from '../dominio/tipos.js';
import { CifradorToken, ConexionOauthRepositorio, ProveedorOrganizacion, Reloj, type Solicitante } from './puertos.js';

/** Código del evento `REFRESCO_FALLIDO`: constante del servicio, nunca texto de Atlassian. */
export const CODIGO_REFRESCO_FALLIDO = 'RENOVACION_RECHAZADA';

export type CodigoFalloCredencial = 'JIRA_RECONEXION_NECESARIA' | 'JIRA_TIEMPO_AGOTADO' | 'JIRA_NO_DISPONIBLE' | 'JIRA_LIMITE_DE_TASA' | 'JIRA_RESPUESTA_INVALIDA';

/** Lo que devuelve una llamada a Jira hecha por una sesión: los códigos de Jira más los de la credencial OAuth. */
export type ResultadoOperacion<T> =
  | { ok: true; valor: T; eventos: EventoEspera[] }
  | { ok: false; codigo: CodigoErrorIntegracion; eventos: EventoEspera[]; permisosFaltantes?: string[] };

export interface SesionJira {
  /** La URL del sitio de Jira de esta sesión: solo informativa (mapeo y enlaces), nunca se llama. */
  readonly sitio: string;
  llamar<T>(operacion: (c: CredencialFuenteJira) => Promise<ResultadoJira<T>>): Promise<ResultadoOperacion<T>>;
}

export interface ContextoCredencial {
  readonly presupuesto: Presupuesto;
  /**
   * El Administrador cuya operación dispara la renovación: es el actor de `REFRESCO_FALLIDO`. Se resuelve ANTES de abrir la
   * transacción (no se llama a Organización con el candado tomado) y solo si hace falta renovar.
   */
  readonly actor: () => Promise<{ id: string; nombre: string }>;
}

export type ResultadoApertura = { ok: true; sesion: SesionJira } | { ok: false; codigo: CodigoFalloCredencial };

type ResultadoAcceso =
  | { ok: true; token: string; expiraEn: Date; conexion: ConexionOauth }
  | { ok: false; codigo: CodigoFalloCredencial };

/** Sesión del API token: una sola llamada, sin renovación (comportamiento anterior a OAuth). */
export class SesionApiToken implements SesionJira {
  constructor(private readonly credencial: CredencialFuenteJira) {}

  get sitio(): string {
    return this.credencial.sitio;
  }

  async llamar<T>(operacion: (c: CredencialFuenteJira) => Promise<ResultadoJira<T>>): Promise<ResultadoOperacion<T>> {
    return operacion(this.credencial);
  }
}

/** La conexión necesita reconexión: toda llamada responde `JIRA_RECONEXION_NECESARIA` (D215) sin salir a la red. */
export class SesionFallida implements SesionJira {
  readonly sitio = '';

  constructor(private readonly codigo: CodigoFalloCredencial) {}

  async llamar<T>(): Promise<ResultadoOperacion<T>> {
    return { ok: false, codigo: this.codigo, eventos: [] };
  }
}

class SesionOauth implements SesionJira {
  private reintentada = false;

  constructor(
    private readonly servicio: CredencialesJira,
    private readonly ctx: ContextoCredencial,
    private actual: CredencialJiraOauth,
    private expiraEn: Date,
    private readonly sitioElegido: SitioJira | null,
  ) {}

  get sitio(): string {
    return this.actual.sitio;
  }

  async llamar<T>(operacion: (c: CredencialFuenteJira) => Promise<ResultadoJira<T>>): Promise<ResultadoOperacion<T>> {
    const primera = await operacion(this.actual);
    if (primera.ok || primera.codigo !== 'JIRA_CREDENCIAL_INVALIDA') return primera;
    // Para el API token `JIRA_CREDENCIAL_INVALIDA` es definitivo; con OAuth un 401 puede ser un acceso que se creía vigente.
    if (this.reintentada) return this.permisosInsuficientes(primera.eventos, primera.permisosFaltantes);
    this.reintentada = true;
    const acceso = await this.servicio.accesoParaSesion(this.ctx, this.expiraEn, this.sitioElegido !== null);
    if (!acceso.ok) return { ok: false, codigo: acceso.codigo, eventos: primera.eventos };
    this.actual = this.servicio.credencialDe(acceso.conexion, acceso.token, this.sitioElegido);
    this.expiraEn = acceso.expiraEn;
    const segunda = await operacion(this.actual);
    const eventos = [...primera.eventos, ...segunda.eventos];
    if (segunda.ok) return { ok: true, valor: segunda.valor, eventos };
    if (segunda.codigo === 'JIRA_CREDENCIAL_INVALIDA') return this.permisosInsuficientes(eventos, segunda.permisosFaltantes);
    return { ...segunda, eventos };
  }

  /** La renovación funcionó y el 401 sigue: el acceso es válido pero no alcanza para esa llamada (D215, D218). */
  private permisosInsuficientes(eventos: EventoEspera[], permisos: string[] | undefined): ResultadoOperacion<never> {
    return { ok: false, codigo: 'JIRA_OAUTH_PERMISOS_INSUFICIENTES', eventos, ...(permisos === undefined || permisos.length === 0 ? {} : { permisosFaltantes: permisos }) };
  }
}

@Injectable()
export class CredencialesJira {
  constructor(
    private readonly conexiones: ConexionOauthRepositorio,
    private readonly cifrador: CifradorToken,
    @Inject(AUTORIZADOR_ATLASSIAN) private readonly autorizador: AutorizadorAtlassian,
    private readonly reloj: Reloj,
    private readonly organizacion: ProveedorOrganizacion,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  /**
   * El contexto de una operación del Administrador. El actor de `REFRESCO_FALLIDO` es quien dispara la renovación; si
   * Organización no responde, igual se registra con su id (la conexión no puede quedar sin marcar por eso).
   */
  contexto(solicitante: Solicitante, presupuesto: Presupuesto): ContextoCredencial {
    return {
      presupuesto,
      actor: async () => {
        try {
          return await this.organizacion.perfil(solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs));
        } catch (error) {
          if (error instanceof OrganizacionNoDisponible || error instanceof OrganizacionDenego) return { id: solicitante.usuarioId, nombre: 'Administrador' };
          throw error;
        }
      },
    };
  }

  /** Una sesión para el método activo: la de OAuth con la conexión, o `SesionFallida` si necesita reconexión. */
  async sesionOauth(solicitante: Solicitante, presupuesto: Presupuesto): Promise<SesionJira> {
    const apertura = await this.abrir(this.contexto(solicitante, presupuesto));
    return apertura.ok ? apertura.sesion : new SesionFallida(apertura.codigo);
  }

  /** Sin las credenciales de la app no se puede renovar: 503 `JIRA_OAUTH_NO_CONFIGURADO`; sin llave, 503 de la llave (D216). */
  exigirDisponible(): void {
    if (!this.configuracion.oauth.disponible) throw new OauthNoConfigurado();
    if (!this.cifrador.disponible) throw new LlaveCifradoNoDisponible();
  }

  /**
   * `oauth.descifrable` de la vista (contrato `ConexionOauthJira`): siempre `false` en `RECONEXION_NECESARIA` (no hay tokens);
   * en `CONECTADA` y `PENDIENTE_SITIO`, `true` solo si hay llave y ambos tokens se descifran con ella.
   */
  descifrable(conexion: ConexionOauth): boolean {
    if (conexion.estado === 'RECONEXION_NECESARIA') return false;
    if (!this.cifrador.disponible || conexion.acceso === null || conexion.renovacion === null) return false;
    try {
      this.cifrador.descifrarSecreto(conexion.acceso, DATO_ASOCIADO_ACCESO);
      this.cifrador.descifrarSecreto(conexion.renovacion, DATO_ASOCIADO_RENOVACION);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Abre una sesión con la conexión `CONECTADA`, o con la `PENDIENTE_SITIO` si se da `sitioElegido` (elegir el sitio llama a
   * `myself` en ese sitio antes de guardarlo). @throws OauthNoConfigurado, LlaveCifradoNoDisponible, JiraNoConfigurado
   * (sin conexión o con el sitio pendiente), TokenNoDescifrable. Con `RECONEXION_NECESARIA` o un fallo de Atlassian: `ok: false`.
   */
  async abrir(ctx: ContextoCredencial, sitioElegido: SitioJira | null = null): Promise<ResultadoApertura> {
    this.exigirDisponible();
    const acceso = await this.acceso(ctx, null, sitioElegido !== null);
    if (!acceso.ok) return acceso;
    return { ok: true, sesion: new SesionOauth(this, ctx, this.credencialDe(acceso.conexion, acceso.token, sitioElegido), acceso.expiraEn, sitioElegido) };
  }

  /** Para `SesionOauth`: renovación forzada tras un 401, solo si el vencimiento guardado sigue siendo el del acceso usado. */
  accesoParaSesion(ctx: ContextoCredencial, expiraEnUsado: Date, permitirPendiente: boolean): Promise<ResultadoAcceso> {
    return this.acceso(ctx, expiraEnUsado, permitirPendiente);
  }

  credencialDe(conexion: ConexionOauth, token: string, sitioElegido: SitioJira | null): CredencialJiraOauth {
    const sitio = sitioElegido ?? conexion.sitio;
    // Los CHECK de la tabla garantizan `cloud_id` y `sitio_url` con `CONECTADA`; con `PENDIENTE_SITIO` los da `sitioElegido`.
    if (sitio === null) throw new JiraNoConfigurado();
    return { tipo: 'OAUTH', cloudId: sitio.id, tokenAcceso: token, sitio: sitio.url, permisos: conexion.permisos };
  }

  // ------------------------------------------------------------------ acceso y renovación
  private opciones(ctx: ContextoCredencial): OpcionesLlamada {
    return { tiempoLimiteMs: this.configuracion.tiempoLimiteJiraMs, esperaMax429Ms: 0, restanteMs: () => ctx.presupuesto.restanteMs() };
  }

  private async acceso(ctx: ContextoCredencial, forzarSobre: Date | null, permitirPendiente: boolean): Promise<ResultadoAcceso> {
    const conexion = await this.conexiones.obtener();
    if (conexion === null) throw new JiraNoConfigurado();
    if (conexion.estado === 'RECONEXION_NECESARIA') return { ok: false, codigo: 'JIRA_RECONEXION_NECESARIA' };
    if (conexion.estado === 'PENDIENTE_SITIO' && !permitirPendiente) throw new JiraNoConfigurado();

    const ahora = this.reloj.ahora();
    const sigueVigente = forzarSobre === null ? !necesitaRenovar(conexion.accesoExpiraEn, ahora) : conexion.accesoExpiraEn?.getTime() !== forzarSobre.getTime();
    if (sigueVigente) return this.usar(conexion);

    // Hay que renovar. El actor se resuelve antes de tomar el candado, para no llamar a Organización con la fila bloqueada.
    const actor = await ctx.actor();
    try {
      return await this.conexiones.conCandado(() => this.renovarBajoCandado(ctx, forzarSobre, actor));
    } catch (error) {
      if (error instanceof CandadoNoObtenido) return { ok: false, codigo: 'JIRA_TIEMPO_AGOTADO' };
      throw error;
    }
  }

  /** Descifra el acceso guardado. @throws TokenNoDescifrable, LlaveCifradoNoDisponible */
  private usar(conexion: ConexionOauth): ResultadoAcceso {
    if (conexion.acceso === null || conexion.accesoExpiraEn === null) return { ok: false, codigo: 'JIRA_RECONEXION_NECESARIA' };
    return { ok: true, token: this.cifrador.descifrarSecreto(conexion.acceso, DATO_ASOCIADO_ACCESO), expiraEn: conexion.accesoExpiraEn, conexion };
  }

  /** Todo lo que está dentro usa el cliente de la transacción que tiene el candado (el repositorio lo garantiza). */
  private async renovarBajoCandado(ctx: ContextoCredencial, forzarSobre: Date | null, actor: { id: string; nombre: string }): Promise<ResultadoAcceso> {
    const actual = await this.conexiones.obtener(); // relectura: otro proceso pudo renovar mientras esperábamos
    if (actual === null) throw new JiraNoConfigurado();
    if (actual.estado === 'RECONEXION_NECESARIA') return { ok: false, codigo: 'JIRA_RECONEXION_NECESARIA' };
    const ahora = this.reloj.ahora();
    const yaRenovada = forzarSobre === null ? !necesitaRenovar(actual.accesoExpiraEn, ahora) : actual.accesoExpiraEn?.getTime() !== forzarSobre.getTime();
    if (yaRenovada) return this.usar(actual);
    if (actual.renovacion === null) return { ok: false, codigo: 'JIRA_RECONEXION_NECESARIA' };

    const tokenRenovacion = this.cifrador.descifrarSecreto(actual.renovacion, DATO_ASOCIADO_RENOVACION);
    const respuesta = await this.autorizador.renovar(tokenRenovacion, this.opciones(ctx));
    if (!respuesta.ok) {
      if (respuesta.fallo !== 'DEFINITIVO') return { ok: false, codigo: codigoPasajero(respuesta.fallo) };
      const transicion = transicionPorFalloDefinitivo(actual.estado);
      await this.conexiones.marcarReconexion(
        this.reloj.ahora(),
        transicion.registrarEvento
          ? { tipo: 'REFRESCO_FALLIDO', actor, sitioNombre: actual.sitio?.nombre ?? null, cuentaNombre: actual.cuentaNombre, codigo: CODIGO_REFRESCO_FALLIDO, fecha: this.reloj.ahora() }
          : null,
      );
      return { ok: false, codigo: 'JIRA_RECONEXION_NECESARIA' };
    }

    const nuevos = respuesta.valor;
    // Si la respuesta no trae `refresh_token` se conserva el anterior (D214).
    const renovacion = nuevos.tokenRenovacion === null ? actual.renovacion : this.cifrador.cifrarSecreto(nuevos.tokenRenovacion, DATO_ASOCIADO_RENOVACION);
    const expiraEn = calcularVencimiento(ahora, nuevos.expiraEnSegundos);
    // Se guarda el token de renovación nuevo (rotación) y, solo al terminar la transacción, se usa el acceso nuevo.
    const conexion = await this.conexiones.guardarTokens({
      acceso: this.cifrador.cifrarSecreto(nuevos.tokenAcceso, DATO_ASOCIADO_ACCESO),
      renovacion,
      accesoExpiraEn: expiraEn,
      renovadoEn: ahora,
    });
    return { ok: true, token: nuevos.tokenAcceso, expiraEn, conexion };
  }
}

function codigoPasajero(fallo: Exclude<FalloAtlassian, 'DEFINITIVO'>): CodigoFalloCredencial {
  switch (fallo) {
    case 'LIMITE_DE_TASA':
      return 'JIRA_LIMITE_DE_TASA';
    case 'TIEMPO_AGOTADO':
      return 'JIRA_TIEMPO_AGOTADO';
    case 'NO_DISPONIBLE':
      return 'JIRA_NO_DISPONIBLE';
    case 'RESPUESTA_INVALIDA':
      return 'JIRA_RESPUESTA_INVALIDA';
  }
}
