/**
 * Configuración de Jira (E5-B01): ver, probar y guardar (D94, D95, D111, D112, D116, D120). Orden de `PUT`:
 * formato (400, en la capa `api`, sin ninguna llamada saliente) → llave de cifrado (503) → destino con Organización
 * (422) → prueba con Jira → guardar solo si la prueba pasa. El token existe en claro solo dentro de estas funciones.
 */
import { Inject, Injectable } from '@nestjs/common';
import { errorValidacion } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import { errorIntegracion } from '../dominio/catalogos.js';
import { Presupuesto } from '../dominio/ejecucion.js';
import { DestinoInvalido, LlaveCifradoNoDisponible } from '../dominio/errores.js';
import type { CredencialJira, FuenteJira, OpcionesLlamada } from '../dominio/puertos/fuente-jira.js';
import type {
  CampoConfiguracion,
  CodigoErrorIntegracion,
  ConfiguracionGuardada,
  ErrorIntegracion,
  EstadoConexion,
  TokenCifradoGuardado,
} from '../dominio/tipos.js';
import {
  CifradorToken,
  ConfiguracionRepositorio,
  FUENTE_JIRA,
  ProveedorOrganizacion,
  Reloj,
  type DestinoHdu,
  type DestinoResuelto,
  type Solicitante,
} from './puertos.js';
import { vistaEvento } from './vistas.js';

export const TIPOS_ISSUE_POR_DEFECTO = ['Story', 'Historia'];

export interface EntradaGuardado {
  readonly sitio: string;
  readonly correo: string;
  /** Ausente o vacío conserva el guardado (D116). */
  readonly token?: string;
  readonly proyecto: string;
  readonly tiposIssue: string[];
  readonly celulaId: string;
  readonly qeResponsableId: string;
  readonly sprintRespaldoId: string;
}

export interface EntradaPrueba {
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

function comparar(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((valor, indice) => valor === b[indice]);
}

@Injectable()
export class ConfiguracionAplicacion {
  constructor(
    private readonly configuraciones: ConfiguracionRepositorio,
    private readonly organizacion: ProveedorOrganizacion,
    private readonly cifrador: CifradorToken,
    private readonly reloj: Reloj,
    @Inject(FUENTE_JIRA) private readonly jira: FuenteJira,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  /** `GET /v1/integraciones/jira/configuracion`. No necesita la llave: informa `llaveDisponible` y `token.descifrable`. */
  async obtener(solicitante: Solicitante) {
    return this.vista(await this.configuraciones.obtener(), solicitante, new Presupuesto(this.configuracion.presupuestoMs));
  }

  /** `PUT /v1/integraciones/jira/configuracion`: probar y guardar (D112). */
  async guardar(solicitante: Solicitante, entrada: EntradaGuardado) {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    if (!this.cifrador.disponible) throw new LlaveCifradoNoDisponible();

    // 400: la primera vez el token es obligatorio (no hay uno guardado que conservar).
    const guardada = await this.configuraciones.obtener();
    const tokenNuevo = entrada.token !== undefined && entrada.token.length > 0 ? entrada.token : null;
    if (tokenNuevo === null && guardada === null) {
      throw errorValidacion([{ campo: 'token', codigo: 'REQUERIDO', mensaje: 'El API token es obligatorio la primera vez.' }], 'token: obligatorio sin configuración previa');
    }

    // 422: el destino se valida en Organización antes de llamar a Jira.
    const destino: DestinoHdu = { celulaId: entrada.celulaId, qeResponsableId: entrada.qeResponsableId, sprintRespaldoId: entrada.sprintRespaldoId };
    this.exigirDestinoValido(await this.organizacion.destino(destino, solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs)));

    // 409: el token guardado ya no se puede descifrar (la llave cambió).
    const token = tokenNuevo ?? this.tokenGuardado(guardada);
    const credencial: CredencialJira = { sitio: entrada.sitio, correo: entrada.correo, token };

    const prueba = await this.ejecutarPrueba(credencial, entrada.proyecto, presupuesto);
    if (!prueba.resultado.ok) {
      // Solo se actualiza el estado de la conexión y la última prueba; la configuración anterior queda intacta (D112).
      await this.configuraciones.registrarPrueba('FALLIDA', prueba.resultado.error?.codigo ?? null, this.reloj.ahora());
      const vigente = await this.configuraciones.obtener();
      return { guardado: false, prueba: prueba.resultado, configuracion: await this.vista(vigente, solicitante, presupuesto) };
    }

    const actor = await this.actorDe(solicitante, presupuesto);
    const cifrado: TokenCifradoGuardado = tokenNuevo !== null ? this.cifrador.cifrar(tokenNuevo) : (guardada as ConfiguracionGuardada).token;
    const fecha = this.reloj.ahora();
    const cambiados = this.camposCambiados(guardada, entrada, tokenNuevo !== null);
    await this.configuraciones.guardar(
      {
        sitio: entrada.sitio,
        correo: entrada.correo,
        proyecto: entrada.proyecto,
        tiposIssue: entrada.tiposIssue,
        campoSprint: prueba.campoSprint,
        celulaId: entrada.celulaId,
        qeResponsableId: entrada.qeResponsableId,
        sprintRespaldoId: entrada.sprintRespaldoId,
        token: cifrado,
        actor,
        fecha,
      },
      { actor, camposCambiados: cambiados, tokenCambiado: tokenNuevo !== null, resultadoPrueba: 'OK', fecha },
    );
    return { guardado: true, prueba: prueba.resultado, configuracion: await this.vista(await this.configuraciones.obtener(), solicitante, presupuesto) };
  }

  /**
   * `POST /v1/integraciones/jira/configuracion/probar`: con los campos del cuerpo y, para los que falten, los guardados.
   * Hace exactamente `GET myself` y `GET project/{clave}` (E5-B01-T05); no cambia la configuración ni registra eventos.
   */
  async probar(entrada: EntradaPrueba): Promise<ResultadoPrueba> {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const guardada = await this.configuraciones.obtener();
    const faltantes: Array<{ campo: string; codigo: 'REQUERIDO'; mensaje: string }> = [];
    const sitio = entrada.sitio ?? guardada?.sitio;
    const correo = entrada.correo ?? guardada?.correo;
    const proyecto = entrada.proyecto ?? guardada?.proyecto;
    if (sitio === undefined) faltantes.push({ campo: 'sitio', codigo: 'REQUERIDO', mensaje: 'El sitio es obligatorio.' });
    if (correo === undefined) faltantes.push({ campo: 'correo', codigo: 'REQUERIDO', mensaje: 'El correo es obligatorio.' });
    if (proyecto === undefined) faltantes.push({ campo: 'proyecto', codigo: 'REQUERIDO', mensaje: 'El proyecto es obligatorio.' });
    const tokenCuerpo = entrada.token !== undefined && entrada.token.length > 0 ? entrada.token : null;
    if (tokenCuerpo === null && guardada === null) faltantes.push({ campo: 'token', codigo: 'REQUERIDO', mensaje: 'El API token es obligatorio.' });
    if (faltantes.length > 0) throw errorValidacion(faltantes, faltantes.map((f) => f.campo).join(', '));

    const token = tokenCuerpo ?? this.tokenGuardado(guardada);
    const credencial: CredencialJira = { sitio: sitio as string, correo: correo as string, token };
    return (await this.ejecutarPrueba(credencial, proyecto as string, presupuesto, false)).resultado;
  }

  async eventos(pagina: number, tamanoPagina: number) {
    const resultado = await this.configuraciones.listarEventos(pagina, tamanoPagina);
    return { ...resultado, items: resultado.items.map(vistaEvento) };
  }

  // ------------------------------------------------------------------ privados
  private opciones(presupuesto: Presupuesto): OpcionesLlamada {
    return { tiempoLimiteMs: this.configuracion.tiempoLimiteJiraMs, esperaMax429Ms: this.configuracion.esperaMax429Ms, restanteMs: () => presupuesto.restanteMs() };
  }

  /** Descifra el token guardado. @throws LlaveCifradoNoDisponible, TokenNoDescifrable */
  private tokenGuardado(guardada: ConfiguracionGuardada | null): string {
    if (guardada === null) {
      throw errorValidacion([{ campo: 'token', codigo: 'REQUERIDO', mensaje: 'El API token es obligatorio la primera vez.' }], 'token: obligatorio sin configuración previa');
    }
    return this.cifrador.descifrar(guardada.token);
  }

  private async actorDe(solicitante: Solicitante, presupuesto: Presupuesto): Promise<{ id: string; nombre: string }> {
    return this.organizacion.perfil(solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs));
  }

  private exigirDestinoValido(resuelto: DestinoResuelto): void {
    if (resuelto.errores.length === 0) return;
    const catalogo = resuelto.errores.filter((e) => e.campo !== 'qeResponsableId');
    // La célula o el sprint primero (CATALOGO_INVALIDO); si solo falla el QE, QE_INVALIDO.
    if (catalogo.length > 0) throw new DestinoInvalido('CATALOGO_INVALIDO', catalogo);
    throw new DestinoInvalido('QE_INVALIDO', resuelto.errores);
  }

  /**
   * Prueba la conexión: `myself` y `project/{clave}` y, si `detectarSprint`, también `field` para encontrar el campo
   * Sprint. Nunca devuelve el texto de Jira: solo el código y el mensaje fijo del servicio.
   */
  private async ejecutarPrueba(
    credencial: CredencialJira,
    proyecto: string,
    presupuesto: Presupuesto,
    detectarSprint = true,
  ): Promise<{ resultado: ResultadoPrueba; campoSprint: string | null }> {
    const opciones = this.opciones(presupuesto);
    const conexion = await this.jira.probar(credencial, proyecto, opciones);
    if (!conexion.ok) return { resultado: this.fallo(conexion.codigo), campoSprint: null };
    let campoSprint: string | null = null;
    if (detectarSprint) {
      const campo = await this.jira.detectarCampoSprint(credencial, opciones);
      if (!campo.ok) return { resultado: this.fallo(campo.codigo), campoSprint: null };
      campoSprint = campo.valor;
    }
    return {
      resultado: { ok: true, usuarioJira: conexion.valor.usuarioJira, proyecto: { clave: conexion.valor.proyecto.clave, nombre: conexion.valor.proyecto.nombre }, error: null },
      campoSprint,
    };
  }

  private fallo(codigo: CodigoErrorIntegracion): ResultadoPrueba {
    return { ok: false, usuarioJira: null, proyecto: null, error: errorIntegracion(codigo, 'JIRA') };
  }

  private camposCambiados(previa: ConfiguracionGuardada | null, entrada: EntradaGuardado, tokenCambiado: boolean): CampoConfiguracion[] {
    const campos: CampoConfiguracion[] = [];
    if (previa === null || previa.sitio !== entrada.sitio) campos.push('sitio');
    if (previa === null || previa.correo !== entrada.correo) campos.push('correo');
    if (tokenCambiado) campos.push('token');
    if (previa === null || previa.proyecto !== entrada.proyecto) campos.push('proyecto');
    if (previa === null || !comparar(previa.tiposIssue, entrada.tiposIssue)) campos.push('tiposIssue');
    if (previa === null || previa.celulaId !== entrada.celulaId) campos.push('celulaId');
    if (previa === null || previa.qeResponsableId !== entrada.qeResponsableId) campos.push('qeResponsableId');
    if (previa === null || previa.sprintRespaldoId !== entrada.sprintRespaldoId) campos.push('sprintRespaldoId');
    return campos;
  }

  /** `ConfiguracionJira` del contrato: sin secretos; nombres del destino resueltos en Organización. */
  private async vista(guardada: ConfiguracionGuardada | null, solicitante: Solicitante, presupuesto: Presupuesto) {
    const llaveDisponible = this.cifrador.disponible;
    if (guardada === null) {
      return {
        configurado: false,
        llaveDisponible,
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
      llaveDisponible,
      sitio: guardada.sitio,
      correo: guardada.correo,
      proyecto: guardada.proyecto,
      tiposIssue: guardada.tiposIssue,
      celula: destino.celula,
      qeResponsable: destino.qeResponsable,
      sprintRespaldo: destino.sprintRespaldo,
      token: { configurado: true, ultimos4: guardada.token.ultimos4, descifrable: this.esDescifrable(guardada.token) },
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
