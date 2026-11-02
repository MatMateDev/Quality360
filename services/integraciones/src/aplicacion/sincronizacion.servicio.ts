/**
 * Sincronización con Jira (E5-B02, E5-B04#1/#3): una sola petición acotada por el presupuesto de tiempo (D96, D114).
 * Inserta la ejecución `EN_CURSO` apenas pasa la autorización, lee páginas de Jira, mapea, escribe por lotes de 25 con
 * el upsert de Organización y cierra la ejecución una sola vez. Las filas de detalle se insertan al terminar cada lote,
 * así que si la función se corta lo hecho queda registrado y la siguiente ejecución lo cierra como `INTERRUMPIDA`.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import { mensajeDeError } from '../dominio/catalogos.js';
import { Presupuesto, TAMANO_LOTE, resultadoFinal, sumarFila } from '../dominio/ejecucion.js';
import { JiraNoConfigurado } from '../dominio/errores.js';
import type { CredencialJira, FuenteJira, IssueJira, OpcionesLlamada } from '../dominio/puertos/fuente-jira.js';
import type { CodigoErrorIntegracion, Ejecucion, EventoEjecucion } from '../dominio/tipos.js';
import { contadoresVacios } from '../dominio/tipos.js';
import { procesarLote, trocear } from './lotes.js';
import {
  CifradorToken,
  ConfiguracionRepositorio,
  EjecucionRepositorio,
  FUENTE_JIRA,
  MapeadorIssues,
  ProveedorOrganizacion,
  Reloj,
  type Solicitante,
} from './puertos.js';

export interface EntradaSincronizacion {
  readonly continuarDesde?: string;
  readonly vincularExistentes: boolean;
}

@Injectable()
export class SincronizacionAplicacion {
  private readonly registro = new Logger(SincronizacionAplicacion.name);

  constructor(
    private readonly configuraciones: ConfiguracionRepositorio,
    private readonly ejecuciones: EjecucionRepositorio,
    private readonly organizacion: ProveedorOrganizacion,
    private readonly cifrador: CifradorToken,
    private readonly mapeador: MapeadorIssues,
    private readonly reloj: Reloj,
    @Inject(FUENTE_JIRA) private readonly jira: FuenteJira,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  /**
   * `POST /v1/integraciones/jira/sincronizaciones`. No registran ejecución: 409 `JIRA_NO_CONFIGURADO`,
   * 409 `TOKEN_NO_DESCIFRABLE`, 503 `LLAVE_CIFRADO_NO_DISPONIBLE`, 503 inicial de Organización y 409 `INTEGRACION_EN_CURSO`.
   */
  async sincronizar(solicitante: Solicitante, entrada: EntradaSincronizacion): Promise<Ejecucion> {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const guardada = await this.configuraciones.obtener();
    if (guardada === null) throw new JiraNoConfigurado();
    const token = this.cifrador.descifrar(guardada.token);
    const credencial: CredencialJira = { sitio: guardada.sitio, correo: guardada.correo, token };

    const actor = await this.organizacion.perfil(solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs));
    const ejecucion = await this.ejecuciones.iniciar(
      {
        origen: 'JIRA',
        estricto: false,
        vincularExistentes: entrada.vincularExistentes,
        actor: { id: actor.id, nombre: actor.nombre, rol: solicitante.rol },
        proyecto: guardada.proyecto,
        sitioHost: new URL(guardada.sitio).host,
        archivo: null,
        iniciadaEn: this.reloj.ahora(),
      },
      this.configuracion.enCursoMaxMs,
    );

    try {
      return await this.recorrer(solicitante, entrada, guardada, credencial, ejecucion, presupuesto);
    } catch (error) {
      // Algo inesperado (base de datos, un defecto): la ejecución no puede quedar abierta.
      this.registro.error(`La ejecución ${ejecucion.id} falló: ${error instanceof Error ? error.name : 'desconocido'}`);
      await this.ejecuciones.interrumpir(ejecucion.id, this.reloj.ahora(), presupuesto.transcurridoMs()).catch(() => undefined);
      throw error;
    }
  }

  private async recorrer(
    solicitante: Solicitante,
    entrada: EntradaSincronizacion,
    guardada: NonNullable<Awaited<ReturnType<ConfiguracionRepositorio['obtener']>>>,
    credencial: CredencialJira,
    ejecucion: Ejecucion,
    presupuesto: Presupuesto,
  ): Promise<Ejecucion> {
    const opciones: OpcionesLlamada = {
      tiempoLimiteMs: this.configuracion.tiempoLimiteJiraMs,
      esperaMax429Ms: this.configuracion.esperaMax429Ms,
      restanteMs: () => presupuesto.restanteMs(),
    };
    const destino = { celulaId: guardada.celulaId, qeResponsableId: guardada.qeResponsableId, sprintRespaldoId: guardada.sprintRespaldoId };
    const contadores = contadoresVacios();
    const eventos: EventoEjecucion[] = [];
    const tope = this.configuracion.topeIssues;
    let interrupcion: CodigoErrorIntegracion | null = null;
    let hayMas = false;
    let ultimaClave: string | null = null;
    let nextPageToken: string | undefined;

    paginas: for (;;) {
      if (!presupuesto.alcanza()) {
        interrupcion = 'PRESUPUESTO_DE_TIEMPO';
        break;
      }
      const pagina = await this.jira.buscarPagina(
        credencial,
        { proyecto: guardada.proyecto, tipos: guardada.tiposIssue, despuesDe: entrada.continuarDesde, nextPageToken, campoSprint: guardada.campoSprint },
        opciones,
      );
      eventos.push(...pagina.eventos);
      if (!pagina.ok) {
        interrupcion = pagina.codigo;
        break;
      }

      const issues: IssueJira[] = pagina.valor.issues.slice(0, Math.max(0, tope - contadores.leidas));
      const recortada = issues.length < pagina.valor.issues.length;
      const filas = issues.map((issue, indice) => this.mapeador.mapear(issue, { fila: contadores.leidas + indice + 1, sitio: credencial.sitio }));

      let procesadas = 0;
      for (const lote of trocear(filas, TAMANO_LOTE)) {
        if (!presupuesto.alcanza()) {
          interrupcion = 'PRESUPUESTO_DE_TIEMPO';
          break paginas;
        }
        let resultado;
        try {
          resultado = await procesarLote(this.organizacion, solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs), lote, {
            origen: 'JIRA',
            destino,
            vincularExistentes: entrada.vincularExistentes,
            estricto: false,
            soloSimular: false,
          });
        } catch (error) {
          this.registro.error(`Organización no pudo recibir un lote · ${error instanceof Error ? error.name : 'desconocido'}`);
          interrupcion = 'ORGANIZACION_NO_DISPONIBLE';
          break paginas;
        }
        await this.ejecuciones.agregarDetalle(ejecucion.id, resultado.detalle);
        for (const fila of resultado.detalle) sumarFila(contadores, fila);
        procesadas += lote.length;
        ultimaClave = issues[procesadas - 1]?.clave ?? ultimaClave;
      }

      // Con el tope exacto, `hayMas` depende de lo que diga Jira: no se inventa una continuación (E5-B02-T06).
      if (recortada || contadores.leidas >= tope) {
        hayMas = recortada || !pagina.valor.esUltima;
        break;
      }
      if (pagina.valor.esUltima || pagina.valor.nextPageToken === null) break;
      nextPageToken = pagina.valor.nextPageToken;
    }

    // Una interrupción con filas ya procesadas se puede continuar desde la última clave; sin filas no hay desde dónde.
    if (interrupcion !== null) hayMas = contadores.leidas > 0;
    const terminadaEn = this.reloj.ahora();
    const resultado = resultadoFinal({ leidas: contadores.leidas, conError: contadores.conError, interrupcion, hayMas });
    return this.ejecuciones.cerrar(ejecucion.id, {
      ...contadores,
      resultado,
      terminadaEn,
      duracionMs: Math.max(1, presupuesto.transcurridoMs()),
      codigoError: interrupcion,
      mensajeError: interrupcion === null ? null : mensajeDeError(interrupcion),
      eventos,
      hayMas,
      continuarDesde: hayMas ? ultimaClave : null,
    });
  }
}
