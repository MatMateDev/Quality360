/**
 * Conexión OAuth 2.0 (3LO) con Jira (E5-B08, D209–D218, ADR 0019): iniciar, retorno, elegir sitio y desconectar. Orden de
 * validación: 401 → 403 → 400 → 503 → 409 → ejecución (las guardas y el controlador cubren lo anterior a 503).
 *
 * Ningún `code`, `state`, token ni el Client secret se registra, se guarda en claro ni vuelve en una respuesta, un error o
 * la auditoría: del `state` solo se guarda el hash SHA-256; los tokens, solo cifrados; los errores de Atlassian, solo un
 * código fijo del servicio.
 */
import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import { errorIntegracion } from '../dominio/catalogos.js';
import { Presupuesto } from '../dominio/ejecucion.js';
import { EstadoOauthInvalido, SinConexionOauth, SitioOauthNoValido } from '../dominio/errores.js';
import { armarUrlAutorizacion, BYTES_ESTADO, PATRON_ESTADO, RETENCION_ESTADO_MS, VIGENCIA_ESTADO_MS } from '../dominio/oauth/autorizacion.js';
import {
  DATO_ASOCIADO_ACCESO,
  DATO_ASOCIADO_RENOVACION,
  calcularVencimiento,
  decidirSitios,
  eventoDeConexion,
  faltantesDelCanje,
} from '../dominio/oauth/conexion.js';
import { PERMISOS_REQUERIDOS, PERMISO_LEER_USUARIO } from '../dominio/oauth/permisos.js';
import { seleccionarSitios } from '../dominio/oauth/sitios.js';
import { AUTORIZADOR_ATLASSIAN, type AutorizadorAtlassian, type FalloAtlassian } from '../dominio/puertos/autorizador-atlassian.js';
import { type CredencialJiraOauth, type FuenteJira, type OpcionesLlamada } from '../dominio/puertos/fuente-jira.js';
import type { CodigoErrorIntegracion, ErrorIntegracion } from '../dominio/tipos.js';
import { CredencialesJira } from './credenciales-jira.js';
import {
  CifradorToken,
  ConexionOauthRepositorio,
  ConfiguracionRepositorio,
  FUENTE_JIRA,
  ProveedorOrganizacion,
  Reloj,
  type Solicitante,
} from './puertos.js';
import { vistaConexionOauth, type VistaConexionOauth } from './vistas.js';

export interface ResultadoConexionOauth {
  readonly resultado: 'CONECTADA' | 'ELEGIR_SITIO' | 'ERROR';
  readonly oauth: VistaConexionOauth | null;
  readonly error: ErrorIntegracion | null;
}

export const hashDeEstado = (estado: string): string => createHash('sha256').update(estado, 'utf8').digest('hex');

@Injectable()
export class OauthJiraAplicacion {
  private readonly registro = new Logger(OauthJiraAplicacion.name);

  constructor(
    private readonly conexiones: ConexionOauthRepositorio,
    private readonly configuraciones: ConfiguracionRepositorio,
    private readonly organizacion: ProveedorOrganizacion,
    private readonly credenciales: CredencialesJira,
    private readonly cifrador: CifradorToken,
    private readonly reloj: Reloj,
    @Inject(FUENTE_JIRA) private readonly jira: FuenteJira,
    @Inject(AUTORIZADOR_ATLASSIAN) private readonly atlassian: AutorizadorAtlassian,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  // ------------------------------------------------------------------ iniciar
  /** `POST …/oauth/iniciar`: crea el `state` (solo su hash queda guardado) y devuelve la dirección de Atlassian. */
  async iniciar(solicitante: Solicitante): Promise<{ urlAutorizacion: string; expiraEn: Date }> {
    this.credenciales.exigirDisponible();
    const { clientId, redirectUri, urlAutorizacion } = this.configuracion.oauth;
    const state = randomBytes(BYTES_ESTADO).toString('base64url');
    const ahora = this.reloj.ahora();
    const expiraEn = new Date(ahora.getTime() + VIGENCIA_ESTADO_MS);
    await this.conexiones.crearEstado(hashDeEstado(state), solicitante.usuarioId, ahora, expiraEn, new Date(ahora.getTime() - RETENCION_ESTADO_MS));
    return { urlAutorizacion: armarUrlAutorizacion({ base: urlAutorizacion, clientId: clientId as string, redirectUri: redirectUri as string, state }), expiraEn };
  }

  // ------------------------------------------------------------------ retorno
  /** `POST …/oauth/retorno`: valida y consume el `state`, canjea el `code`, comprueba permisos y sitios, y guarda. */
  async retorno(solicitante: Solicitante, entrada: { state: string; code?: string; error?: string }): Promise<ResultadoConexionOauth> {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    this.credenciales.exigirDisponible();

    // Un `state` mal formado se rechaza sin tocar la base; cualquier otra causa, tras la sentencia atómica. Mismo 400 siempre.
    if (!PATRON_ESTADO.test(entrada.state)) throw new EstadoOauthInvalido();
    const actor = await this.organizacion.perfil(solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs));
    if (!(await this.conexiones.consumirEstado(hashDeEstado(entrada.state), solicitante.usuarioId))) throw new EstadoOauthInvalido();

    // A partir de aquí el `state` está consumido, pase lo que pase. Un error de Atlassian no cambia la conexión anterior.
    if (entrada.error !== undefined) {
      return this.error(entrada.error === 'access_denied' ? 'JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO' : 'JIRA_OAUTH_CANJE_FALLIDO');
    }
    const opciones = this.opciones(presupuesto);
    const canje = await this.atlassian.canjear(entrada.code as string, opciones);
    if (!canje.ok) return this.error(this.codigoDeFallo(canje.fallo, 'JIRA_OAUTH_CANJE_FALLIDO'));

    const { tokenAcceso, tokenRenovacion, scopes } = canje.valor;
    // D218: sin `refresh_token` no hay forma de renovar; sin `scope` se asume lo pedido (RFC 6749 §5.1).
    const faltantes = faltantesDelCanje(scopes, tokenRenovacion !== null);
    if (faltantes.length > 0) return this.error('JIRA_OAUTH_PERMISOS_INSUFICIENTES', faltantes);
    const permisos = scopes ?? [...PERMISOS_REQUERIDOS];

    const recursos = await this.atlassian.sitios(tokenAcceso, opciones);
    if (!recursos.ok) return this.error(this.codigoDeFallo(recursos.fallo, 'JIRA_OAUTH_CANJE_FALLIDO'));
    const decision = decidirSitios(seleccionarSitios(recursos.valor));
    if (decision.tipo === 'SIN_SITIO') return this.error('JIRA_OAUTH_SIN_SITIO');
    if (decision.tipo === 'PERMISOS_INSUFICIENTES') return this.error('JIRA_OAUTH_PERMISOS_INSUFICIENTES', decision.faltantes);

    const ahora = this.reloj.ahora();
    const base = {
      permisos,
      acceso: this.cifrador.cifrarSecreto(tokenAcceso, DATO_ASOCIADO_ACCESO),
      renovacion: this.cifrador.cifrarSecreto(tokenRenovacion as string, DATO_ASOCIADO_RENOVACION),
      accesoExpiraEn: calcularVencimiento(ahora, canje.valor.expiraEnSegundos),
      renovadoEn: null,
      conectadoPor: { id: actor.id, nombre: actor.nombre },
      conectadoEn: ahora,
      actualizadoEn: ahora,
    } as const;

    if (decision.tipo === 'ELEGIR_SITIO') {
      // Varios sitios: queda pendiente, sin sitio ni cuenta, hasta que el Administrador elija (D212).
      await this.conexiones.guardar({ ...base, estado: 'PENDIENTE_SITIO', cloudId: null, sitio: null, candidatos: decision.candidatos, cuentaId: null, cuentaNombre: null }, null);
      return { resultado: 'ELEGIR_SITIO', oauth: await this.vistaActual(), error: null };
    }

    // Un solo sitio: se confirma con `myself` y se guarda `CONECTADA`.
    const sitio = decision.sitio;
    const credencial: CredencialJiraOauth = { tipo: 'OAUTH', cloudId: sitio.id, tokenAcceso, sitio: sitio.url, permisos };
    const cuenta = await this.jira.probarCuenta(credencial, opciones);
    if (!cuenta.ok) return this.errorDeJira(cuenta.codigo, cuenta.permisosFaltantes);
    const evento = eventoDeConexion(await this.conexiones.hayConexionRegistrada());
    await this.conexiones.guardar(
      { ...base, estado: 'CONECTADA', cloudId: sitio.id, sitio, candidatos: null, cuentaId: cuenta.valor.cuentaId, cuentaNombre: cuenta.valor.usuarioJira.slice(0, 150) },
      { tipo: evento, actor: { id: actor.id, nombre: actor.nombre }, sitioNombre: sitio.nombre, cuentaNombre: cuenta.valor.usuarioJira.slice(0, 150), codigo: null, fecha: ahora },
    );
    return { resultado: 'CONECTADA', oauth: await this.vistaActual(), error: null };
  }

  // ------------------------------------------------------------------ sitio
  /** `POST …/oauth/sitio`: confirma el sitio elegido con `myself` y deja la conexión `CONECTADA`. */
  async elegirSitio(solicitante: Solicitante, entrada: { sitioId: string }): Promise<ResultadoConexionOauth> {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    this.credenciales.exigirDisponible();

    const conexion = await this.conexiones.obtener();
    if (conexion === null || conexion.estado !== 'PENDIENTE_SITIO' || conexion.candidatos === null) throw new SinConexionOauth();
    // 409 `TOKEN_NO_DESCIFRABLE` antes del 400 del sitio (contrato, orden 409 → 400).
    if (conexion.acceso !== null) this.cifrador.descifrarSecreto(conexion.acceso, DATO_ASOCIADO_ACCESO);
    const elegido = conexion.candidatos.find((s) => s.id === entrada.sitioId);
    if (elegido === undefined) throw new SitioOauthNoValido();

    const actor = await this.actorDe(solicitante, presupuesto);
    const apertura = await this.credenciales.abrir({ presupuesto, actor: async () => actor }, elegido);
    if (!apertura.ok) return this.error(apertura.codigo);

    const opciones = this.opciones(presupuesto);
    const cuenta = await apertura.sesion.llamar((c) => this.jira.probarCuenta(c, opciones));
    if (!cuenta.ok) return this.errorDeJira(cuenta.codigo, cuenta.permisosFaltantes);

    const fresca = await this.conexiones.obtener(); // la renovación pudo cambiar los tokens
    if (fresca === null || fresca.estado !== 'PENDIENTE_SITIO') throw new SinConexionOauth();
    const ahora = this.reloj.ahora();
    const nombreCuenta = cuenta.valor.usuarioJira.slice(0, 150);
    const evento = eventoDeConexion(await this.conexiones.hayConexionRegistrada());
    await this.conexiones.guardar(
      { ...fresca, estado: 'CONECTADA', cloudId: elegido.id, sitio: elegido, candidatos: null, cuentaId: cuenta.valor.cuentaId, cuentaNombre: nombreCuenta, conectadoPor: { id: actor.id, nombre: actor.nombre }, conectadoEn: ahora, actualizadoEn: ahora },
      { tipo: evento, actor: { id: actor.id, nombre: actor.nombre }, sitioNombre: elegido.nombre, cuentaNombre: nombreCuenta, codigo: null, fecha: ahora },
    );
    return { resultado: 'CONECTADA', oauth: await this.vistaActual(), error: null };
  }

  // ------------------------------------------------------------------ desconectar
  /** `DELETE …/oauth`: borra la conexión en cualquier estado. No llama a Atlassian ni necesita las variables ni la llave. */
  async desconectar(solicitante: Solicitante): Promise<void> {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const conexion = await this.conexiones.obtener();
    if (conexion === null) throw new SinConexionOauth();
    const actor = await this.actorDe(solicitante, presupuesto);
    const borrada = await this.conexiones.eliminar({
      tipo: 'DESCONECTAR',
      actor: { id: actor.id, nombre: actor.nombre },
      sitioNombre: conexion.sitio?.nombre ?? null,
      cuentaNombre: conexion.cuentaNombre,
      codigo: null,
      fecha: this.reloj.ahora(),
    });
    if (!borrada) throw new SinConexionOauth();
  }

  // ------------------------------------------------------------------ privados
  private opciones(presupuesto: Presupuesto): OpcionesLlamada {
    return { tiempoLimiteMs: this.configuracion.tiempoLimiteJiraMs, esperaMax429Ms: 0, restanteMs: () => presupuesto.restanteMs() };
  }

  private async actorDe(solicitante: Solicitante, presupuesto: Presupuesto): Promise<{ id: string; nombre: string }> {
    return this.organizacion.perfil(solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs));
  }

  /** La conexión como está guardada, para mostrarla; con `ERROR` es la que ya había (o `null`). */
  private async vistaActual(): Promise<VistaConexionOauth | null> {
    const conexion = await this.conexiones.obtener();
    if (conexion === null) return null;
    const configuracion = await this.configuraciones.obtener();
    return vistaConexionOauth(conexion, this.credenciales.descifrable(conexion), configuracion?.sitio ?? null);
  }

  private async error(codigo: CodigoErrorIntegracion, permisosFaltantes?: readonly string[]): Promise<ResultadoConexionOauth> {
    this.registro.warn(`Conexión OAuth sin cambios · ${codigo}`);
    return { resultado: 'ERROR', oauth: await this.vistaActual(), error: errorIntegracion(codigo, 'JIRA', false, { contexto: 'CONEXION', permisosFaltantes }) };
  }

  /** Un fallo de Jira al confirmar la cuenta, con los códigos que admite el contrato para el retorno y el sitio. */
  private async errorDeJira(codigo: CodigoErrorIntegracion, permisos: readonly string[] | undefined): Promise<ResultadoConexionOauth> {
    switch (codigo) {
      case 'JIRA_CREDENCIAL_INVALIDA':
      case 'JIRA_SIN_PERMISO':
      case 'JIRA_OAUTH_PERMISOS_INSUFICIENTES':
        return this.error('JIRA_OAUTH_PERMISOS_INSUFICIENTES', permisos !== undefined && permisos.length > 0 ? permisos : [PERMISO_LEER_USUARIO]);
      case 'JIRA_SITIO_NO_ENCONTRADO':
      case 'JIRA_PROYECTO_NO_ENCONTRADO':
        return this.error('JIRA_NO_DISPONIBLE');
      default:
        return this.error(codigo);
    }
  }

  /** Canje y sitios: un 400, 401 o 403 es `definitivo` (el código no sirvió); lo demás es pasajero y se informa tal cual. */
  private codigoDeFallo(fallo: FalloAtlassian, definitivo: CodigoErrorIntegracion): CodigoErrorIntegracion {
    switch (fallo) {
      case 'DEFINITIVO':
        return definitivo;
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
}
