// E5-F01: validación del formulario de conexión, en el cliente y solo al pulsar (diseño §3.4). El servidor repite
// todo (y decide D95: el sitio no exige `atlassian.net` aquí).

export interface CamposConexion {
  sitio: string;
  correo: string;
  token: string;
  proyecto: string;
  tipos: string;
  celulaId: string;
  qeId: string;
  sprintId: string;
}

export type ClaveCampoConexion = "sitio" | "correo" | "token" | "proyecto" | "tipos" | "celula" | "qe" | "sprint";

export type ErroresConexion = Partial<Record<ClaveCampoConexion, string>>;

/** Orden visual del formulario: el foco va al primer campo inválido. */
export const ORDEN_CAMPOS_CONEXION: ClaveCampoConexion[] = ["sitio", "correo", "token", "proyecto", "tipos", "celula", "qe", "sprint"];

export const CLAVE_PROYECTO_RE = /^[A-Z][A-Z0-9_]{1,9}$/;
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** «Story, Historia» → ["Story", "Historia"]; sin vacíos ni repetidos. */
export function separarTipos(texto: string): string[] {
  const vistos = new Set<string>();
  for (const parte of texto.split(",")) {
    const tipo = parte.trim();
    if (tipo) vistos.add(tipo);
  }
  return [...vistos];
}

export function validarConexion(campos: CamposConexion, opciones: { requiereToken: boolean; incluirDestino: boolean }): ErroresConexion {
  const errores: ErroresConexion = {};
  const sitio = campos.sitio.trim();
  if (!sitio) errores.sitio = "Ingresa la dirección del sitio de Jira";
  else {
    let valido = false;
    try {
      const url = new URL(sitio);
      valido = url.protocol === "https:" || url.protocol === "http:";
    } catch {
      valido = false;
    }
    if (!valido) errores.sitio = "Ingresa una dirección web válida";
  }
  const correo = campos.correo.trim();
  if (!correo) errores.correo = "Ingresa el correo de la cuenta de Jira";
  else if (!CORREO_RE.test(correo)) errores.correo = "Ingresa un correo con formato válido";
  if (opciones.requiereToken && campos.token === "") errores.token = "Ingresa el API token";
  const proyecto = campos.proyecto.trim();
  if (!proyecto) errores.proyecto = "Ingresa la clave del proyecto";
  else if (!CLAVE_PROYECTO_RE.test(proyecto))
    errores.proyecto = "La clave debe empezar con una letra mayúscula y tener de 2 a 10 caracteres (letras mayúsculas, números o guion bajo)";
  const tipos = separarTipos(campos.tipos);
  if (tipos.length < 1 || tipos.length > 5) errores.tipos = "Indica de 1 a 5 tipos de issue";
  if (opciones.incluirDestino) {
    if (!campos.celulaId) errores.celula = "Elige la célula destino";
    if (!campos.qeId) errores.qe = "Elige el QE responsable";
    if (!campos.sprintId) errores.sprint = "Elige el sprint de respaldo";
  }
  return errores;
}
