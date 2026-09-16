import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Raíz del monorepo (tests/support -> tests -> raíz). */
export const RAIZ_REPO = path.resolve(__dirname, "..", "..");

/**
 * Parser mínimo de archivos `.env` (no versionados). Solo lee, nunca escribe
 * ni versiona estos archivos (regla no negociable #6).
 */
function leerDotEnv(rutaArchivo: string): Record<string, string> {
  if (!existsSync(rutaArchivo)) return {};
  const contenido = readFileSync(rutaArchivo, "utf8");
  const salida: Record<string, string> = {};
  for (const lineaCruda of contenido.split(/\r?\n/)) {
    const linea = lineaCruda.trim();
    if (!linea || linea.startsWith("#")) continue;
    const indice = linea.indexOf("=");
    if (indice === -1) continue;
    const clave = linea.slice(0, indice).trim();
    let valor = linea.slice(indice + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    salida[clave] = valor;
  }
  return salida;
}

const envWeb = leerDotEnv(path.join(RAIZ_REPO, "apps", "web", ".env.local"));
const envGateway = leerDotEnv(path.join(RAIZ_REPO, "apps", "gateway", ".env"));
const envOrganizacion = leerDotEnv(path.join(RAIZ_REPO, "services", "organizacion", ".env"));
const envCertificaciones = leerDotEnv(path.join(RAIZ_REPO, "services", "certificaciones", ".env"));
const envImpedimentos = leerDotEnv(path.join(RAIZ_REPO, "services", "impedimentos", ".env"));

function requerido(valor: string | undefined, descripcion: string): string {
  if (!valor) {
    throw new Error(
      `Falta configurar ${descripcion}. Verifica apps/web/.env.local o exporta la variable de entorno correspondiente.`,
    );
  }
  return valor;
}

export const env = {
  supabaseUrl: requerido(
    process.env.SUPABASE_URL ?? envWeb.VITE_SUPABASE_URL,
    "VITE_SUPABASE_URL (apps/web/.env.local) o SUPABASE_URL",
  ),
  supabaseAnonKey: requerido(
    process.env.SUPABASE_ANON_KEY ?? envWeb.VITE_SUPABASE_ANON_KEY,
    "VITE_SUPABASE_ANON_KEY (apps/web/.env.local) o SUPABASE_ANON_KEY",
  ),
  gatewayUrl: process.env.GATEWAY_URL ?? envWeb.VITE_GATEWAY_URL ?? "http://localhost:3000",
  portalUrl: process.env.PORTAL_URL ?? "http://localhost:5173",

  // Segunda instancia (gateway + portal) para simular una fuente caída, solo
  // usada por los escenarios que lo requieren (E1-F03#3, E1-F06#3, E1-F08#2,
  // E1-B03#3). El orquestador de la prueba la levanta y la apaga.
  gatewayCaidoUrl: process.env.GATEWAY_CAIDO_URL ?? "http://localhost:3100",
  portalCaidoUrl: process.env.PORTAL_CAIDO_URL ?? "http://localhost:5180",
  gatewayCaidoPuerto: Number(process.env.GATEWAY_CAIDO_PUERTO ?? 3100),
  portalCaidoPuerto: Number(process.env.PORTAL_CAIDO_PUERTO ?? 5180),
  fuenteMuertaPuerto: Number(process.env.FUENTE_MUERTA_PUERTO ?? 3199),

  contrasenaDemo: process.env.SEED_PASSWORD ?? "Quality360Demo#2025",

  organizacionUrl: process.env.ORGANIZACION_URL ?? envGateway.ORGANIZACION_URL ?? "http://localhost:3001",
  certificacionesUrl: process.env.CERTIFICACIONES_URL ?? envGateway.CERTIFICACIONES_URL ?? "http://localhost:3002",

  // Solo para forjar, en tests/support/tokenForjado.ts, un JWT HS256 vencido
  // que ejercite el respaldo local del verificador (E1-B11#1): nunca se usa
  // para autenticarse de verdad ni se expone fuera de tests/.
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? envGateway.SUPABASE_JWT_SECRET ?? "",
  supabaseJwtIssuer: process.env.SUPABASE_JWT_ISSUER ?? envGateway.SUPABASE_JWT_ISSUER ?? `${envGateway.SUPABASE_URL ?? "http://127.0.0.1:54321"}/auth/v1`,

  // Solo para: (a) forjar el password de un administrador propio de la
  // prueba y probar ULTIMO_ADMINISTRADOR sin tocar la sesión de Patricia
  // (E1-B08#2), y (b) el escenario de aislamiento de esquemas (cada rol de
  // servicio no puede leer el esquema de otro). Nunca se registra ni se usa
  // para nada más.
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? envOrganizacion.SUPABASE_SERVICE_ROLE_KEY ?? "",
  databaseUrlOrganizacion: process.env.DATABASE_URL_ORGANIZACION ?? envOrganizacion.DATABASE_URL ?? "",
  databaseUrlCertificaciones: process.env.DATABASE_URL_CERTIFICACIONES ?? envCertificaciones.DATABASE_URL ?? "",
  databaseUrlImpedimentos: process.env.DATABASE_URL_IMPEDIMENTOS ?? envImpedimentos.DATABASE_URL ?? "",
};
