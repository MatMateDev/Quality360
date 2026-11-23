/**
 * Configuración de Jira (E5-B01): ver, probar y guardar con dos métodos (D94, D95, D111, D112, D116, D120, D209). Orden de
 * `PUT` con API token: formato (400, en la capa `api`, sin ninguna llamada saliente) → llave de cifrado (503) → destino con
 * Organización (422) → prueba con Jira → guardar solo si la prueba pasa. Con OAuth: formato → credenciales de la app y llave
 * (503) → conexión lista (409) → destino (422) → prueba → guardar. El token existe en claro solo dentro de estas funciones.
 *
 * Solo un «Probar y guardar» exitoso cambia el método activo (D209); si la prueba falla nada cambia y, cuando el guardado
 * intentaba cambiar de método, tampoco cambia `estadoConexion` (el método activo no se probó).
 */
import { Inject, Injectable } from '@nestjs/common';
import { errorValidacion } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import { errorIntegracion } from '../dominio/catalogos.js';
import { Presupuesto } from '../dominio/ejecucion.js';
import { DestinoInvalido, JiraNoConfigurado, LlaveCifradoNoDisponible } from '../dominio/errores.js';
import type { CredencialJira, FuenteJira, OpcionesLlamada } from '../dominio/puertos/fuente-jira.js';
import type {
  CampoConfiguracion,
  CodigoErrorIntegracion,
  ConfiguracionGuardada,
  ErrorIntegracion,
  EstadoConexion,
  MetodoConexion,
  TokenCifradoGuardado,
} from '../dominio/tipos.js';
import { CredencialesJira, SesionApiToken, type SesionJira } from './credenciales-jira.js';
import {
  CifradorToken,
  ConexionOauthRepositorio,
  ConfiguracionRepositorio,
  FUENTE_JIRA,
  ProveedorOrganizacion,
  Reloj,
  type DatosEventoOauth,
  type DestinoHdu,
  type DestinoResuelto,
  type Solicitante,
} from './puertos.js';
import { vistaConexionOauth, vistaEvento } from './vistas.js';

export const TIPOS_ISSUE_POR_DEFECTO = ['Story', 'Historia'];

interface EntradaDestino {
  readonly proyecto: string;
  readonly tiposIssue: string[];
  readonly celulaId: string;
  readonly qeResponsableId: string;
  readonly sprintRespaldoId: string;
}

export interface EntradaGuardadoApi extends EntradaDestino {
  /** Ausente equivale a `API_TOKEN` (compatibilidad con el contrato certificado). */
  readonly metodo?: 'API_TOKEN';
  readonly sitio: string;
  readonly correo: string;
  /** Ausente o vacío conserva el guardado (D116). */
  readonly token?: string;
}

/** Con OAuth el sitio sale de la conexión: el cuerpo no trae `sitio`, `correo` ni `token`. */
export interface EntradaGuardadoOauth extends EntradaDestino {
  readonly metodo: 'OAUTH';
}

export type EntradaGuardado = EntradaGuardadoApi | EntradaGuardadoOauth;

export interface EntradaPrueba {
  readonly metodo?: MetodoConexion;
  readonly sitio?: string;
  readonly correo?: string;
  readonly token?: string;
  readonly proyecto?: string;
}

export interface ResultadoPrueba {
  readonly ok: boolean;
  readonly usuarioJira: string | null;
  readonly proyecto: { clave: string; nombre: string } | null;
  readonly error: ErrorIntegracion | null;
}

/** Lo que se guarda, normalizado para los dos métodos. */
interface NuevosDatos extends EntradaDestino {
  readonly metodo: MetodoConexion;
  readonly sitio: string;
  readonly correo: string | null;
}

function comparar(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((valor, indice) => valor === b[indice]);
}

@Injectable()
export class ConfiguracionAplicacion {
  constructor(
    private readonly configuraciones: ConfiguracionRepositorio,
    private readonly conexiones: ConexionOauthRepositorio,
    private readonly organizacion: ProveedorOrganizacion,
    private readonly cifrador: CifradorToken,
    private readonly reloj: Reloj,
    private readonly credenciales: CredencialesJira,
    @Inject(FUENTE_JIRA) private readonly jira: FuenteJira,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  /**
   * `GET /v1/integraciones/jira/configuracion`. No necesita la llave ni las credenciales de la app, no llama a Atlassian ni a
   * Jira y no renueva nada: informa `llaveDisponible`, `oauthDisponible`, `token.descifrable` y `oauth.descifrable`.
   */
  async obtener(solicitante: Solicitante) {
    return this.vista(await this.configuraciones.obtener(), solicitante, new Presupuesto(this.configuracion.presupuestoMs));
  }

  /** `PUT /v1/integraciones/jira/configuracion`: probar y guardar (D112). */
  async guardar(solicitante: Solicitante, entrada: EntradaGuardado) {
    return entrada.metodo === 'OAUTH' ? this.guardarOauth(solicitante, entrada) : this.guardarApi(solicitante, entrada);
  }

  private async guardarApi(solicitante: Solicitante, entrada: EntradaGuardadoApi) {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    if (!this.cifrador.disponible) throw new LlaveCifradoNoDisponible();

    // 400: la primera vez, o al venir de OAuth, el token es obligatorio (no hay uno guardado que conservar).
    const guardada = await this.configuraciones.obtener();
    const tokenNuevo = entrada.token !== undefined && entrada.token.length > 0 ? entrada.token : null;
    if (tokenNuevo === null && (guardada === null || guardada.token === null)) {
      throw errorValidacion([{ campo: 'token', codigo: 'REQUERIDO', mensaje: 'El API token es obligatorio la primera vez.' }], 'token: obligatorio sin configuración previa');
    }

    // 422: el destino se valida en Organización antes de llamar a Jira.
    const destino: DestinoHdu = { celulaId: entrada.celulaId, qeResponsableId: entrada.qeResponsableId, sprintRespaldoId: entrada.sprintRespaldoId };
    this.exigirDestinoValido(await this.organizacion.destino(destino, solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs)));

    // 409: el token guardado ya no se puede descifrar (la llave cambió).
    const token = tokenNuevo ?? this.tokenGuardado(guardada);
    const credencial: CredencialJira = { sitio: entrada.sitio, correo: entrada.correo, token };

    const cambiaMetodo = guardada !== null && guardada.metodo !== 'API_TOKEN';
    const prueba = await this.ejecutarPrueba(new SesionApiToken(credencial), entrada.proyecto, presupuesto);
    if (!prueba.resultado.ok) return this.pruebaFallida(guardada, cambiaMetodo, prueba.resultado, solicitante, presupuesto);

    const actor = await this.actorDe(solicitante, presupuesto);
    const cifrado: TokenCifradoGuardado = tokenNuevo !== null ? this.cifrador.cifrar(tokenNuevo) : (guardada as ConfiguracionGuardada).token as TokenCifradoGuardado;
    const fecha = this.reloj.ahora();
    // De OAuth a API token se borra la conexión OAuth y se registra `DESCONECTAR` (D209, D217), en la misma transacción.
    const descartarOauth = guardada?.metodo === 'OAUTH' ? await this.eventoDescartar(actor, fecha) : null;
    const nuevos: NuevosDatos = { metodo: 'API_TOKEN', sitio: entrada.sitio, correo: entrada.correo, proyecto: entrada.proyecto, tiposIssue: entrada.tiposIssue, celulaId: entrada.celulaId, qeResponsableId: entrada.qeResponsableId, sprintRespaldoId: entrada.sprintRespaldoId };
    const tokenCambiado = tokenNuevo !== null;
    await this.configuraciones.guardar(
      { ...this.datosGuardado(nuevos, prueba, actor, fecha), token: cifrado, descartarOauth },
      { actor, camposCambiados: this.camposCambiados(guardada, nuevos, tokenCambiado), tokenCambiado, resultadoPrueba: 'OK', fecha },
    );
    return { guardado: true, prueba: prueba.resultado, configuracion: await this.vista(await this.configuraciones.obtener(), solicitante, presupuesto) };
  }

  private async guardarOauth(solicitante: Solicitante, entrada: EntradaGuardadoOauth) {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    // 503 sin las credenciales de la app o sin llave (D216): no se llama a Atlassian ni se toca nada.
    this.credenciales.exigirDisponible();
    // 409 `JIRA_NO_CONFIGURADO`: sin conexión OAuth, o con el sitio pendiente.
    const conexion = await this.conexiones.obtener();
    if (conexion === null || conexion.estado === 'PENDIENTE_SITIO') throw new JiraNoConfigurado();

    const guardada = await this.configuraciones.obtener();
    const destino: DestinoHdu = { celulaId: entrada.celulaId, qeResponsableId: entrada.qeResponsableId, sprintRespaldoId: entrada.sprintRespaldoId };
    this.exigirDestinoValido(await this.organizacion.destino(destino, solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs)));

    // 409 `TOKEN_NO_DESCIFRABLE` y, con `RECONEXION_NECESARIA`, una sesión que responde `JIRA_RECONEXION_NECESARIA`.
    const sesion = await this.credenciales.sesionOauth(solicitante, presupuesto);
    const cambiaMetodo = guardada !== null && guardada.metodo !== 'OAUTH';
    const prueba = await this.ejecutarPrueba(sesion, entrada.proyecto, presupuesto);
    if (!prueba.resultado.ok) return this.pruebaFallida(guardada, cambiaMetodo, prueba.resultado, solicitante, presupuesto);

    const actor = await this.actorDe(solicitante, presupuesto);
    const fecha = this.reloj.ahora();
    const nuevos: NuevosDatos = { metodo: 'OAUTH', sitio: sesion.sitio, correo: null, proyecto: entrada.proyecto, tiposIssue: entrada.tiposIssue, celulaId: entrada.celulaId, qeResponsableId: entrada.qeResponsableId, sprintRespaldoId: entrada.sprintRespaldoId };
    // El API token cifrado se descarta: `tokenCambiado` si había uno.
    const tokenCambiado = guardada?.token != null;
    await this.configuraciones.guardar(
      { ...this.datosGuardado(nuevos, prueba, actor, fecha), token: null, descartarOauth: null },
      { actor, camposCambiados: this.camposCambiados(guardada, nuevos, tokenCambiado), tokenCambiado, resultadoPrueba: 'OK', fecha },
    );
    return { guardado: true, prueba: prueba.resultado, configuracion: await this.vista(await this.configuraciones.obtener(), solicitante, presupuesto) };
  }

  /**
   * `POST /v1/integraciones/jira/configuracion/probar`. API token: con los campos del cuerpo y, para los que falten, los
   * guardados; exactamente `GET myself` y `GET project/{clave}` (E5-B01-T05). OAuth: la conexión guardada (aunque no sea la
   * activa), las mismas dos llamadas, o solo `myself` si no hay proyecto. Ninguna escribe `configuracion_jira` ni registra eventos.
   */
  async probar(solicitante: Solicitante, entrada: EntradaPrueba): Promise<ResultadoPrueba> {
    return entrada.metodo === 'OAUTH' ? this.probarOauth(solicitante, entrada) : this.probarApi(entrada);
  }

  private async probarApi(entrada: EntradaPrueba): Promise<ResultadoPrueba> {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const guardada = await this.configuraciones.obtener();
    const faltantes: Array<{ campo: string; codigo: 'REQUERIDO'; mensaje: string }> = [];
    const sitio = entrada.sitio ?? guardada?.sitio;
    const correo = entrada.correo ?? guardada?.correo ?? undefined;
    const proyecto = entrada.proyecto ?? guardada?.proyecto;
    if (sitio === undefined) faltantes.push({ campo: 'sitio', codigo: 'REQUERIDO', mensaje: 'El sitio es obligatorio.' });
    if (correo === undefined) faltantes.push({ campo: 'correo', codigo: 'REQUERIDO', mensaje: 'El correo es obligatorio.' });
    if (proyecto === undefined) faltantes.push({ campo: 'proyecto', codigo: 'REQUERIDO', mensaje: 'El proyecto es obligatorio.' });
    const tokenCuerpo = entrada.token !== undefined && entrada.token.length > 0 ? entrada.token : null;
    if (tokenCuerpo === null && (guardada === null || guardada.token === null)) faltantes.push({ campo: 'token', codigo: 'REQUERIDO', mensaje: 'El API token es obligatorio.' });
    if (faltantes.length > 0) throw errorValidacion(faltantes, faltantes.map((f) => f.campo).join(', '));

    const token = tokenCuerpo ?? this.tokenGuardado(guardada);
    const credencial: CredencialJira = { sitio: sitio as string, correo: correo as string, token };
    return (await this.ejecutarPrueba(new SesionApiToken(credencial), proyecto as string, presupuesto, false)).resultado;
  }

  private async probarOauth(solicitante: Solicitante, entrada: EntradaPrueba): Promise<ResultadoPrueba> {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    this.credenciales.exigirDisponible();
    const conexion = await this.conexiones.obtener();
    if (conexion === null || conexion.estado === 'PENDIENTE_SITIO') throw new JiraNoConfigurado();
    const proyecto = entrada.proyecto ?? (await this.configuraciones.obtener())?.proyecto ?? null;
    const sesion = await this.credenciales.sesionOauth(solicitante, presupuesto);
    if (proyecto !== null) return (await this.ejecutarPrueba(sesion, proyecto, presupuesto, false)).resultado;

    // Sin proyecto: una sola llamada, `GET myself`, y `proyecto: null` (diseño §3.3, fila 12.4).
    const cuenta = await sesion.llamar((c) => this.jira.probarCuenta(c, this.opciones(presupuesto)));
    if (!cuenta.ok) return this.fallo(cuenta.codigo, cuenta.permisosFaltantes);
    return { ok: true, usuarioJira: cuenta.valor.usuarioJira, proyecto: null, error: null };
  }

  async eventos(pagina: number, tamanoPagina: number) {
    const resultado = await this.configuraciones.listarEventos(pagina, tamanoPagina);
    return { ...resultado, items: resultado.items.map(vistaEvento) };
  }

  // ------------------------------------------------------------------ privados
  private opciones(presupuesto: Presupuesto): OpcionesLlamada {
    return { tiempoLimiteMs: this.configuracion.tiempoLimiteJiraMs, esperaMax429Ms: this.configuracion.esperaMax429Ms, restanteMs: () => presupuesto.restanteMs() };
  }

  /** Descifra el API token guardado. @throws LlaveCifradoNoDisponible, TokenNoDescifrable */
  private tokenGuardado(guardada: ConfiguracionGuardada | null): string {
    if (guardada === null || guardada.token === null) {
      throw errorValidacion([{ campo: 'token', codigo: 'REQUERIDO', mensaje: 'El API token es obligatorio la primera vez.' }], 'token: obligatorio sin configuración previa');
    }
    return this.cifrador.descifrar(guardada.token);
  }

  private async actorDe(solicitante: Solicitante, presupuesto: Presupuesto): Promise<{ id: string; nombre: string }> {
    return this.organizacion.perfil(solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs));
  }

  /** El evento `DESCONECTAR` del cambio a API token. `null` si no queda ninguna conexión que borrar. */
  private async eventoDescartar(actor: { id: string; nombre: string }, fecha: Date): Promise<DatosEventoOauth | null> {
    const conexion = await this.conexiones.obtener();
    if (conexion === null) return null;
    return { tipo: 'DESCONECTAR', actor, sitioNombre: conexion.sitio?.nombre ?? null, cuentaNombre: conexion.cuentaNombre, codigo: null, fecha };
  }

  private exigirDestinoValido(resuelto: DestinoResuelto): void {
    if (resuelto.errores.length === 0) return;
    const catalogo = resuelto.errores.filter((e) => e.campo !== 'qeResponsableId');
    // La célula o el sprint primero (CATALOGO_INVALIDO); si solo falla el QE, QE_INVALIDO.
    if (catalogo.length > 0) throw new DestinoInvalido('CATALOGO_INVALIDO', catalogo);
    throw new DestinoInvalido('QE_INVALIDO', resuelto.errores);
  }

  /**
   * La prueba falló: solo se actualiza el estado de la conexión y la última prueba, y la configuración anterior queda intacta
   * (D112). Si el guardado intentaba cambiar de método no se toca nada: el método activo no se probó (D209).
   */
  private async pruebaFallida(guardada: ConfiguracionGuardada | null, cambiaMetodo: boolean, resultado: ResultadoPrueba, solicitante: Solicitante, presupuesto: Presupuesto) {
    if (!cambiaMetodo) await this.configuraciones.registrarPrueba('FALLIDA', resultado.error?.codigo ?? null, this.reloj.ahora());
    const vigente = await this.configuraciones.obtener();
    return { guardado: false, prueba: resultado, configuracion: await this.vista(vigente ?? guardada, solicitante, presupuesto) };
  }

  private datosGuardado(n: NuevosDatos, prueba: { campoSprint: string | null; campoCriterios: string | null }, actor: { id: string; nombre: string }, fecha: Date) {
    return {
      metodo: n.metodo,
      sitio: n.sitio,
      correo: n.correo,
      proyecto: n.proyecto,
      tiposIssue: n.tiposIssue,
      campoSprint: prueba.campoSprint,
      campoCriterios: prueba.campoCriterios,
      celulaId: n.celulaId,
      qeResponsableId: n.qeResponsableId,
      sprintRespaldoId: n.sprintRespaldoId,
      actor,
      fecha,
    };
  }

  /**
   * Prueba la conexión: `myself` y `project/{clave}` y, si `detectarSprint`, también `field` para encontrar el campo
   * Sprint. Nunca devuelve el texto de Jira: solo el código y el mensaje fijo del servicio. Con OAuth, un 401 renueva el acceso
   * y reintenta una vez por operación (la sesión lo recuerda entre las llamadas).
   */
  private async ejecutarPrueba(
    sesion: SesionJira,
    proyecto: string,
    presupuesto: Presupuesto,
    detectarSprint = true,
  ): Promise<{ resultado: ResultadoPrueba; campoSprint: string | null; campoCriterios: string | null }> {
    const opciones = this.opciones(presupuesto);
    const conexion = await sesion.llamar((c) => this.jira.probar(c, proyecto, opciones));
    if (!conexion.ok) return { resultado: this.fallo(conexion.codigo, conexion.permisosFaltantes), campoSprint: null, campoCriterios: null };
    let campoSprint: string | null = null;
    let campoCriterios: string | null = null;
    if (detectarSprint) {
      // Una sola llamada a `/field`: el campo Sprint y el de Criterios de aceptación (D199). Al probar no se detecta.
      const campos = await sesion.llamar((c) => this.jira.detectarCampos(c, opciones));
      if (!campos.ok) return { resultado: this.fallo(campos.codigo, campos.permisosFaltantes), campoSprint: null, campoCriterios: null };
      campoSprint = campos.valor.sprint;
      campoCriterios = campos.valor.criterios;
    }
    return {
      resultado: { ok: true, usuarioJira: conexion.valor.usuarioJira, proyecto: { clave: conexion.valor.proyecto.clave, nombre: conexion.valor.proyecto.nombre }, error: null },
      campoSprint,
      campoCriterios,
    };
  }

  private fallo(codigo: CodigoErrorIntegracion, permisosFaltantes?: readonly string[]): ResultadoPrueba {
    return { ok: false, usuarioJira: null, proyecto: null, error: errorIntegracion(codigo, 'JIRA', false, { contexto: 'OPERACION', permisosFaltantes }) };
  }

  private camposCambiados(previa: ConfiguracionGuardada | null, nuevos: NuevosDatos, tokenCambiado: boolean): CampoConfiguracion[] {
    const campos: CampoConfiguracion[] = [];
    if (previa === null || previa.sitio !== nuevos.sitio) campos.push('sitio');
    if ((previa?.correo ?? null) !== nuevos.correo) campos.push('correo');
    if (tokenCambiado) campos.push('token');
    if (previa === null || previa.proyecto !== nuevos.proyecto) campos.push('proyecto');
    if (previa === null || !comparar(previa.tiposIssue, nuevos.tiposIssue)) campos.push('tiposIssue');
    if (previa === null || previa.celulaId !== nuevos.celulaId) campos.push('celulaId');
    if (previa === null || previa.qeResponsableId !== nuevos.qeResponsableId) campos.push('qeResponsableId');
    if (previa === null || previa.sprintRespaldoId !== nuevos.sprintRespaldoId) campos.push('sprintRespaldoId');
    // Sin configuración previa el método por defecto es el API token: solo se informa si cambia (D209).
    if ((previa?.metodo ?? 'API_TOKEN') !== nuevos.metodo) campos.push('metodo');
    return campos;
  }

  /** `ConfiguracionJira` del contrato: sin secretos; nombres del destino resueltos en Organización. */
  private async vista(guardada: ConfiguracionGuardada | null, solicitante: Solicitante, presupuesto: Presupuesto) {
    const llaveDisponible = this.cifrador.disponible;
    const conexion = await this.conexiones.obtener();
    const oauth = conexion === null ? null : vistaConexionOauth(conexion, this.credenciales.descifrable(conexion), guardada?.sitio ?? null);
    const comun = { llaveDisponible, oauthDisponible: this.configuracion.oauth.disponible, oauth };
    if (guardada === null) {
      return {
        configurado: false,
        ...comun,
        metodo: null as MetodoConexion | null,
        sitio: null,
        correo: null,
        proyecto: null,
        tiposIssue: [...TIPOS_ISSUE_POR_DEFECTO],
        celula: null,
        qeResponsable: null,
        sprintRespaldo: null,
        token: { configurado: false, ultimos4: null, descifrable: false },
        estadoConexion: 'SIN_PROBAR' as EstadoConexion,
        ultimaPruebaEn: null,
        ultimaPruebaCodigo: null,
        avisosDestino: [] as Array<'QE_INVALIDO' | 'CATALOGO_INVALIDO'>,
        actualizadoEn: null,
        actualizadoPor: null,
      };
    }
    const destino = await this.organizacion.destino(
      { celulaId: guardada.celulaId, qeResponsableId: guardada.qeResponsableId, sprintRespaldoId: guardada.sprintRespaldoId },
      solicitante.contexto,
      presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs),
    );
    const avisos = new Set<'QE_INVALIDO' | 'CATALOGO_INVALIDO'>();
    for (const error of destino.errores) avisos.add(error.campo === 'qeResponsableId' ? 'QE_INVALIDO' : 'CATALOGO_INVALIDO');
    return {
      configurado: true,
      ...comun,
      metodo: guardada.metodo as MetodoConexion | null,
      sitio: guardada.sitio,
      correo: guardada.correo,
      proyecto: guardada.proyecto,
      tiposIssue: guardada.tiposIssue,
      celula: destino.celula,
      qeResponsable: destino.qeResponsable,
      sprintRespaldo: destino.sprintRespaldo,
      token:
        guardada.token === null
          ? { configurado: false, ultimos4: null, descifrable: false }
          : { configurado: true, ultimos4: guardada.token.ultimos4, descifrable: this.esDescifrable(guardada.token) },
      estadoConexion: guardada.estadoConexion,
      ultimaPruebaEn: guardada.ultimaPruebaEn,
      ultimaPruebaCodigo: guardada.ultimaPruebaCodigo,
      avisosDestino: [...avisos],
      actualizadoEn: guardada.actualizadoEn,
      actualizadoPor: { id: guardada.actualizadoPor.id, nombre: guardada.actualizadoPor.nombre },
    };
  }

  private esDescifrable(token: TokenCifradoGuardado): boolean {
    if (!this.cifrador.disponible) return false;
    try {
      this.cifrador.descifrar(token);
      return true;
    } catch {
      return false;
    }
  }
}
