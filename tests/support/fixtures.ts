import type { APIRequestContext } from "@playwright/test";
import { api } from "./api";

export interface CatalogoRef {
  id: string;
  nombre: string;
}

/** Célula y sprint de la semilla, para crear HDU propias de una prueba sin depender de sus IDs reales. */
export async function obtenerCatalogos(request: APIRequestContext, token: string) {
  const [celulas, sprints] = await Promise.all([
    api.get<{ items: CatalogoRef[] }>(request, "/v1/catalogos/celulas", { token }),
    api.get<{ items: CatalogoRef[] }>(request, "/v1/catalogos/sprints", { token }),
  ]);
  if (celulas.status !== 200 || sprints.status !== 200) {
    throw new Error(`No fue posible obtener catálogos: celulas=${celulas.status} sprints=${sprints.status}`);
  }
  return { celula: celulas.body.items[0], sprint: sprints.body.items[0] };
}

export interface UsuarioCreado {
  id: string;
  nombre: string;
  correo: string;
  rol: string;
  activo: boolean;
}

/** Crea un usuario nuevo (invitación, sin contraseña) como Administrador. Entidad propia de la prueba. */
export async function crearUsuario(
  request: APIRequestContext,
  tokenAdmin: string,
  datos: { nombre: string; correo: string; rol: "ADMINISTRADOR" | "QE" | "ANALISTA_QA" },
): Promise<UsuarioCreado> {
  const respuesta = await api.post<UsuarioCreado>(request, "/v1/usuarios", { token: tokenAdmin, body: datos });
  if (respuesta.status !== 201) {
    throw new Error(`No fue posible crear el usuario ${datos.correo}: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  }
  return respuesta.body;
}

/**
 * Crea un usuario con correo fijo (no `correoUnico`) o, si ya existe
 * (`CORREO_DUPLICADO`), reutiliza el existente. Para fixtures que dependen
 * de aparecer en un `<select>` sin paginación (ver el defecto de
 * `q360-frontend` en `AdminSupervisionPage`): crear uno nuevo en cada
 * corrida haría crecer sin límite el catálogo de QE/analistas y tarde o
 * temprano lo sacaría de la primera página. Reutilizar el mismo usuario
 * entre corridas mantiene acotado el tamaño del catálogo.
 */
export async function obtenerOCrearUsuario(
  request: APIRequestContext,
  tokenAdmin: string,
  datos: { nombre: string; correo: string; rol: "ADMINISTRADOR" | "QE" | "ANALISTA_QA" },
): Promise<UsuarioCreado> {
  const respuesta = await api.post<UsuarioCreado>(request, "/v1/usuarios", { token: tokenAdmin, body: datos });
  if (respuesta.status === 201) return respuesta.body;
  if (respuesta.status === 409) return obtenerUsuarioPorCorreo(request, tokenAdmin, datos.correo);
  throw new Error(`No fue posible crear u obtener el usuario ${datos.correo}: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
}

/** Busca un usuario sembrado por correo, con sesión de Administrador. */
export async function obtenerUsuarioPorCorreo(request: APIRequestContext, tokenAdmin: string, correo: string): Promise<UsuarioCreado> {
  const respuesta = await api.get<{ items: UsuarioCreado[] }>(request, `/v1/usuarios?q=${encodeURIComponent(correo)}`, { token: tokenAdmin });
  if (respuesta.status !== 200) {
    throw new Error(`No fue posible buscar ${correo}: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  }
  const encontrado = respuesta.body.items.find((usuario) => usuario.correo.toLowerCase() === correo.toLowerCase());
  if (!encontrado) throw new Error(`No se encontró un usuario con correo ${correo}.`);
  return encontrado;
}

export interface HduCreada {
  id: string;
  codigo: string;
  estado: string;
  qeResponsable: { id: string; nombre: string; correo: string };
  analista: { id: string; nombre: string; correo: string } | null;
}

/** Crea una HDU propia de la prueba con el QE autenticado como responsable. */
export async function crearHdu(
  request: APIRequestContext,
  tokenQe: string,
  datos: { codigo: string; titulo?: string; celulaId: string; sprintId: string; prioridad?: "BAJA" | "MEDIA" | "ALTA" | "CRITICA" },
): Promise<HduCreada> {
  const respuesta = await api.post<HduCreada>(request, "/v1/hdu", {
    token: tokenQe,
    body: {
      codigo: datos.codigo,
      titulo: datos.titulo ?? `HDU de prueba ${datos.codigo}`,
      celulaId: datos.celulaId,
      sprintId: datos.sprintId,
      prioridad: datos.prioridad ?? "MEDIA",
    },
  });
  if (respuesta.status !== 201) {
    throw new Error(`No fue posible crear la HDU ${datos.codigo}: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  }
  return respuesta.body;
}

/**
 * Recorre todas las páginas de `GET /v1/hdu` (la semilla más las que crean
 * otras pruebas ya suman decenas): evita que una aserción por `.toContain`
 * falle solo porque el registro buscado quedó fuera de una única página.
 */
export async function listarTodasHdu(
  request: APIRequestContext,
  token: string,
  filtros: Record<string, string> = {},
): Promise<HduCreada[]> {
  const items: HduCreada[] = [];
  let pagina = 1;
  const tamanoPagina = 100;
  for (;;) {
    const query = new URLSearchParams({ ...filtros, pagina: String(pagina), tamanoPagina: String(tamanoPagina) });
    const respuesta = await api.get<{ items: HduCreada[]; total: number }>(request, `/v1/hdu?${query.toString()}`, { token });
    if (respuesta.status !== 200) {
      throw new Error(`No fue posible listar HDU: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
    }
    items.push(...respuesta.body.items);
    if (items.length >= respuesta.body.total || respuesta.body.items.length === 0) break;
    pagina += 1;
  }
  return items;
}

/** Avanza una HDU un paso de estado (D10). Lanza si el gateway rechaza la transición. */
export async function avanzarEstadoHdu(request: APIRequestContext, token: string, hduId: string, estado: string) {
  const respuesta = await api.post(request, `/v1/hdu/${hduId}/estado`, { token, body: { estado } });
  if (respuesta.status !== 200) {
    throw new Error(`No fue posible avanzar la HDU ${hduId} a ${estado}: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  }
  return respuesta.body;
}
