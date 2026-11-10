/** Organización por HTTP (D154, D176, D177, D168). Este servicio nunca lee el esquema `organizacion`. */
import { Inject, Injectable } from '@nestjs/common';

import { FuenteNoDisponible, FuenteOrganizacion, type Autenticacion, type DatosSnapshotFuente, type RegistroExportacion } from '../../aplicacion/puertos.js';
import { CONFIGURACION, type ConfiguracionIndicadores } from '../../configuracion.js';
import type { AmbitoOrganizacion, AnalistaAmbito, EstadoHdu, HduAmbito, Ref, Rol } from '../../dominio/tipos.js';
import { llamar } from './http.js';

type Json = Record<string, unknown>;

function ilegible(que: string): never {
  throw new FuenteNoDisponible('ORGANIZACION', `${que} ilegible`);
}
const objeto = (valor: unknown, que: string): Json => (typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Json) : ilegible(que));
const texto = (valor: unknown, que: string): string => (typeof valor === 'string' ? valor : ilegible(que));
const lista = (valor: unknown, que: string): unknown[] => (Array.isArray(valor) ? valor : ilegible(que));

function ref(valor: unknown, que: string): Ref {
  const d = objeto(valor, que);
  return { id: texto(d.id, que), nombre: texto(d.nombre, que) };
}

export function leerHdu(valor: unknown): HduAmbito {
  const d = objeto(valor, 'una HDU');
  const sprint = d.sprint === null || d.sprint === undefined ? null : objeto(d.sprint, 'un sprint');
  const analista = d.analista === null || d.analista === undefined ? null : objeto(d.analista, 'un analista');
  return {
    id: texto(d.id, 'una HDU'),
    codigo: texto(d.codigo, 'una HDU'),
    titulo: texto(d.titulo, 'una HDU'),
    estado: texto(d.estado, 'una HDU') as EstadoHdu,
    cierreParcial: d.cierreParcial === true,
    celula: ref(d.celula, 'una célula'),
    sprint: sprint === null ? null : { id: texto(sprint.id, 'un sprint'), nombre: texto(sprint.nombre, 'un sprint'), inicio: texto(sprint.inicio, 'un sprint'), fin: texto(sprint.fin, 'un sprint') },
    qeResponsable: ref(d.qeResponsable, 'un QE'),
    analista: analista === null ? null : { id: texto(analista.id, 'un analista'), nombre: texto(analista.nombre, 'un analista'), activo: analista.activo !== false },
  };
}

function leerAnalista(valor: unknown): AnalistaAmbito {
  const d = objeto(valor, 'un analista');
  return {
    id: texto(d.id, 'un analista'),
    nombre: texto(d.nombre, 'un analista'),
    activo: d.activo !== false,
    supervisor: d.supervisor === null || d.supervisor === undefined ? null : ref(d.supervisor, 'un supervisor'),
  };
}

@Injectable()
export class OrganizacionCliente extends FuenteOrganizacion {
  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIndicadores) {
    super();
  }

  async ambito(auth: Autenticacion & { tipo: 'sesion' }): Promise<AmbitoOrganizacion> {
    const cuerpo = objeto(
      await llamar<unknown>({ fuente: 'ORGANIZACION', url: this.configuracion.organizacionUrl, ruta: '/v1/interno/indicadores/ambito', metodo: 'GET', auth, timeoutMs: this.configuracion.fuenteTimeoutMs }),
      'el ámbito',
    );
    const usuario = objeto(cuerpo.usuario, 'el usuario');
    return {
      usuario: { id: texto(usuario.id, 'el usuario'), nombre: texto(usuario.nombre, 'el usuario'), rol: texto(usuario.rol, 'el usuario') as Rol },
      todas: cuerpo.todas === true,
      celulas: lista(cuerpo.celulas, 'las células').map((c) => ref(c, 'una célula')),
      hdu: lista(cuerpo.hdu, 'las HDU').map(leerHdu),
      analistas: lista(cuerpo.analistas, 'los analistas').map(leerAnalista),
      // Tolerante: una Organización anterior a D176 completa no la envía.
      qes: cuerpo.qes === undefined ? [] : lista(cuerpo.qes, 'los QE').map((q) => ref(q, 'un QE')),
    };
  }

  async snapshot(auth: Autenticacion & { tipo: 'servicio' }, limite: number, timeoutMs: number): Promise<DatosSnapshotFuente> {
    const cuerpo = objeto(
      await llamar<unknown>({ fuente: 'ORGANIZACION', url: this.configuracion.organizacionUrl, ruta: `/v1/interno/indicadores/snapshot?limite=${limite}`, metodo: 'GET', auth, timeoutMs, reintentos: 1 }),
      'el snapshot',
    );
    if (typeof cuerpo.total !== 'number') ilegible('el total');
    return {
      total: cuerpo.total,
      hdu: lista(cuerpo.hdu, 'las HDU').map(leerHdu),
      ambitosQe: lista(cuerpo.ambitosQe, 'los ámbitos').map((a) => {
        const d = objeto(a, 'un ámbito');
        return { qe: ref(d.qe, 'un QE'), hduIds: lista(d.hduIds, 'los ids').map((id) => texto(id, 'un id')) };
      }),
    };
  }

  async perfil(auth: Autenticacion & { tipo: 'sesion' }): Promise<Ref> {
    const cuerpo = await llamar<unknown>({ fuente: 'ORGANIZACION', url: this.configuracion.organizacionUrl, ruta: '/v1/me', metodo: 'GET', auth, timeoutMs: this.configuracion.fuenteTimeoutMs });
    return ref(cuerpo, 'el perfil');
  }

  async buscarCelula(auth: Autenticacion & { tipo: 'sesion' }, celulaId: string): Promise<Ref | null> {
    const cuerpo = objeto(
      await llamar<unknown>({ fuente: 'ORGANIZACION', url: this.configuracion.organizacionUrl, ruta: '/v1/catalogos/celulas', metodo: 'GET', auth, timeoutMs: this.configuracion.fuenteTimeoutMs }),
      'las células',
    );
    const encontrada = lista(cuerpo.items, 'las células').find((c) => objeto(c, 'una célula').id === celulaId);
    return encontrada === undefined ? null : ref(encontrada, 'una célula');
  }

  async registrarExportacion(auth: Autenticacion & { tipo: 'sesion' }, registro: RegistroExportacion): Promise<void> {
    await llamar<unknown>({
      fuente: 'ORGANIZACION',
      url: this.configuracion.organizacionUrl,
      ruta: '/v1/interno/auditoria/exportaciones',
      metodo: 'POST',
      auth,
      cuerpo: registro,
      timeoutMs: this.configuracion.fuenteTimeoutMs,
    });
  }
}
