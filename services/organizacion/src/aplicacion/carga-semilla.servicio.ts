/**
 * Carga semilla (`/v1/interno/carga/*`, ADR 0007): altas idempotentes por el
 * identificador natural de cada entidad (correo, nombre, código). Una fila
 * inválida se rechaza con su motivo sin afectar a las demás: cada llamada es
 * independiente, así que un lote es tantas llamadas como filas — si una
 * falla, las demás no se ven afectadas (integraciones decide si reintenta).
 * Ver `AMBITO_VACIO` para el contexto `esServicio` que usan los casos de uso.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ExcepcionQ360, MENSAJES, errorValidacion, noEncontrado } from '@quality360/auth-nest';

import { HDU_REPOSITORIO, type HduRepositorio } from '../dominio/repositorios/hdu.repositorio.js';
import { ConflictoUnicidad } from '../dominio/errores/conflicto-unicidad.js';
import { CATALOGO_REPOSITORIO, type CatalogoRepositorio } from '../dominio/repositorios/catalogo.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import { estadoSprintPorFechas } from '../dominio/reglas/sprint.js';
import type { Celula, Rol, Sprint } from '../dominio/tipos.js';
import { ACTOR_SERVICIO } from './actores.js';
import { type HduDetalleRespuesta, HduAplicacion } from './hdu.servicio.js';
import { PROVEEDOR_IDENTIDAD, type ProveedorIdentidad } from './puertos/proveedor-identidad.js';
import { type UsuarioRespuesta, UsuariosAplicacion } from './usuarios.servicio.js';

const AMBITO_VACIO = { qeSupervisorId: null, analistasSupervisadosIds: [], celulasIds: [] };
const CONTEXTO_SERVICIO = { esServicio: true, rol: null, actorId: null, ambito: AMBITO_VACIO } as const;

export interface ResultadoCarga<T> {
  readonly creado: boolean;
  readonly usuario?: T;
}

function catalogoInvalido(): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'CATALOGO_INVALIDO', { mensaje: MENSAJES.CATALOGO_INVALIDO });
}

function qeInvalido(): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'QE_INVALIDO', { mensaje: MENSAJES.QE_INVALIDO });
}

@Injectable()
export class CargaSemillaAplicacion {
  constructor(
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    @Inject(CATALOGO_REPOSITORIO) private readonly catalogos: CatalogoRepositorio,
    @Inject(HDU_REPOSITORIO) private readonly hdus: HduRepositorio,
    @Inject(PROVEEDOR_IDENTIDAD) private readonly identidad: ProveedorIdentidad,
    private readonly usuariosAplicacion: UsuariosAplicacion,
    private readonly hduAplicacion: HduAplicacion,
  ) {}

  /** Idempotente por correo (sin distinguir mayúsculas): si existe, no cambia nada, ni la contraseña. */
  async cargarUsuario(datos: {
    nombre: string;
    correo: string;
    rol: Rol;
    activo?: boolean;
    contrasenaInicial: string;
    celulaIds?: string[];
  }): Promise<{ creado: boolean; usuario: UsuarioRespuesta }> {
    const correo = datos.correo.trim().toLowerCase();
    const existente = await this.usuarios.buscarPorCorreo(correo);
    if (existente !== null) return { creado: false, usuario: await this.usuariosAplicacion.obtener(existente.id) };

    if (datos.celulaIds !== undefined && datos.celulaIds.length > 0) {
      if (datos.rol !== 'LIDER_QA') {
        throw errorValidacion([{ campo: 'celulaIds', codigo: 'NO_PERMITIDO', mensaje: 'Solo un Líder QA puede tener células a cargo.' }]);
      }
      if ((await this.catalogos.buscarCelulas(datos.celulaIds)).length !== new Set(datos.celulaIds).size) throw catalogoInvalido();
    }

    const cuenta = await this.identidad.crearOVincularUsuarioConContrasena({ correo, nombre: datos.nombre.trim(), contrasena: datos.contrasenaInicial });
    try {
      await this.usuarios.crear(
        { id: cuenta.id, nombre: datos.nombre.trim(), correo, rol: datos.rol, activo: datos.activo ?? true, celulaIds: datos.celulaIds },
        ACTOR_SERVICIO,
      );
      return { creado: true, usuario: await this.usuariosAplicacion.obtener(cuenta.id) };
    } catch (error) {
      if (error instanceof ConflictoUnicidad) {
        // Carrera con otra carga concurrente del mismo correo: no es un fallo real.
        const carrera = await this.usuarios.buscarPorCorreo(correo);
        if (carrera !== null) return { creado: false, usuario: await this.usuariosAplicacion.obtener(carrera.id) };
      }
      throw error;
    }
  }

  /** Idempotente por nombre (sin distinguir mayúsculas). */
  async cargarCelula(nombre: string): Promise<{ creado: boolean; celula: Celula }> {
    return this.catalogos.crearCelulaSiNoExiste(nombre.trim());
  }

  /**
   * Idempotente por nombre (sin distinguir mayúsculas). `fin` anterior a `inicio` → 400;
   * célula inexistente → 422. El estado se deduce de las fechas (modelo de datos: Sprint).
   */
  async cargarSprint(datos: { nombre: string; inicio: string; fin: string; celulaId: string }): Promise<{ creado: boolean; sprint: Sprint }> {
    const inicio = new Date(datos.inicio);
    const fin = new Date(datos.fin);
    if (fin.getTime() < inicio.getTime()) {
      throw errorValidacion([{ campo: 'fin', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'fin no puede ser anterior a inicio.' }]);
    }
    if ((await this.catalogos.buscarCelula(datos.celulaId)) === null) throw catalogoInvalido();
    return this.catalogos.crearSprintSiNoExiste({
      nombre: datos.nombre.trim(),
      inicio,
      fin,
      estado: estadoSprintPorFechas(inicio, fin, new Date()),
      celulaId: datos.celulaId,
    });
  }

  /**
   * Fija el sprint vigente de una HDU (E4, D88): para el fixture de riesgo. HDU inexistente: 404; sprint
   * inexistente o de otra célula: 422 CATALOGO_INVALIDO. No audita ni toca el historial de la HDU.
   */
  async cargarSprintHdu(hduId: string, sprintId: string): Promise<{ cambio: boolean; hduId: string; sprintId: string }> {
    const hdu = await this.hdus.buscarPorId(hduId);
    if (hdu === null) throw noEncontrado('HDU inexistente');
    const celulaDelSprint = await this.catalogos.celulaDeSprint(sprintId);
    if (celulaDelSprint === null || celulaDelSprint !== hdu.celulaId) throw catalogoInvalido();
    const { cambio } = await this.hdus.fijarSprintVigente(hduId, sprintId);
    return { cambio, hduId, sprintId };
  }

  /** Idempotente por código (sin distinguir mayúsculas): se crea en PENDIENTE, sin analista. */
  async cargarHdu(datos: {
    codigo: string;
    titulo: string;
    celulaId: string;
    sprintId: string;
    prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
    qeResponsableId: string;
  }): Promise<{ creado: boolean; hdu: HduDetalleRespuesta }> {
    const codigoNormalizado = datos.codigo.trim().toLowerCase();
    const existente = await this.hduAplicacion.buscarPorCodigo(codigoNormalizado);
    if (existente !== null) return { creado: false, hdu: await this.hduAplicacion.obtener(existente.id, CONTEXTO_SERVICIO) };

    const [celula, sprint, qe] = await Promise.all([
      this.catalogos.buscarCelula(datos.celulaId),
      this.catalogos.buscarSprint(datos.sprintId),
      this.usuarios.buscarPorId(datos.qeResponsableId),
    ]);
    if (celula === null || sprint === null) throw catalogoInvalido();
    if (qe === null || qe.rol !== 'QE' || !qe.activo) throw qeInvalido();

    const creada = await this.hduAplicacion.crear(
      { codigo: datos.codigo.trim(), titulo: datos.titulo, celulaId: datos.celulaId, sprintId: datos.sprintId, prioridad: datos.prioridad },
      datos.qeResponsableId,
      ACTOR_SERVICIO,
    );
    return { creado: true, hdu: creada };
  }
}
