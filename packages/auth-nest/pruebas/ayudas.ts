/**
 * Utilidades de prueba. No dependen de Supabase: las llaves RSA/EC y el
 * secreto HS256 se generan aquí y el JWKS lo sirve un servidor local.
 */
import { createServer, type Server } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';

export const EMISOR = 'http://127.0.0.1:54321/auth/v1';
export const AUDIENCIA = 'authenticated';
export const SUB = '5b0c2f0e-8f1e-4c47-9a57-3a0f5d1e2b11';
export const SECRETO_HS256 = 'secreto-local-de-pruebas-0123456789-abcdef';

type LlavePrivada = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
type LlavePublica = Awaited<ReturnType<typeof generateKeyPair>>['publicKey'];

export interface ParLlaves {
  kid: string;
  alg: string;
  privada: LlavePrivada;
  publica: LlavePublica;
  jwk: JWK;
}

export async function crearParLlaves(alg: string, kid: string): Promise<ParLlaves> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  const jwk = await exportJWK(publicKey);
  return { kid, alg, privada: privateKey, publica: publicKey, jwk: { ...jwk, kid, alg, use: 'sig' } };
}

export interface ServidorJwks {
  url: string;
  /** Cuántas veces se pidió el JWKS. */
  solicitudes: () => number;
  cerrar: () => Promise<void>;
}

/** Sirve un JWKS con las llaves públicas indicadas. */
export async function iniciarServidorJwks(llaves: ParLlaves[]): Promise<ServidorJwks> {
  let solicitudes = 0;
  const servidor: Server = createServer((peticion, respuesta) => {
    solicitudes += 1;
    if (peticion.url?.startsWith('/auth/v1/.well-known/jwks.json') !== true) {
      respuesta.writeHead(404).end();
      return;
    }
    respuesta.writeHead(200, { 'content-type': 'application/json' });
    respuesta.end(JSON.stringify({ keys: llaves.map((llave) => llave.jwk) }));
  });

  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const direccion = servidor.address();
  if (direccion === null || typeof direccion === 'string') throw new Error('no se pudo abrir el servidor JWKS');

  return {
    url: `http://127.0.0.1:${direccion.port}/auth/v1/.well-known/jwks.json`,
    solicitudes: () => solicitudes,
    cerrar: () =>
      new Promise<void>((resolver, rechazar) =>
        servidor.close((error) => (error ? rechazar(error) : resolver())),
      ),
  };
}

export interface OpcionesToken {
  sub?: string | null;
  correo?: string | null;
  emisor?: string;
  audiencia?: string;
  /** Segundos hasta el vencimiento; negativo = ya vencido. */
  vigenciaSegundos?: number;
  /** `kid` del encabezado; por defecto el de la llave. */
  kid?: string | null;
  extras?: Record<string, unknown>;
  /** Omite `exp`. */
  sinExpiracion?: boolean;
}

function construirFirmador(opciones: OpcionesToken): SignJWT {
  const ahora = Math.floor(Date.now() / 1000);
  const carga: Record<string, unknown> = {
    email: opciones.correo === undefined ? 'ana.perez@quality360.local' : opciones.correo,
    role: 'authenticated',
    session_id: 'ses-1',
    ...opciones.extras,
  };
  if (carga.email === null) delete carga.email;

  const firmador = new SignJWT(carga)
    .setIssuer(opciones.emisor ?? EMISOR)
    .setAudience(opciones.audiencia ?? AUDIENCIA)
    .setIssuedAt(ahora);

  const sub = opciones.sub === undefined ? SUB : opciones.sub;
  if (sub !== null) firmador.setSubject(sub);
  if (opciones.sinExpiracion !== true) firmador.setExpirationTime(ahora + (opciones.vigenciaSegundos ?? 300));
  return firmador;
}

/** Firma con una llave asimétrica (camino JWKS). */
export async function firmarConLlave(
  llave: ParLlaves,
  opciones: OpcionesToken = {},
  llaveDeFirma: LlavePrivada = llave.privada,
): Promise<string> {
  const kid = opciones.kid === undefined ? llave.kid : opciones.kid;
  const encabezado: { alg: string; kid?: string } = { alg: llave.alg };
  if (kid !== null) encabezado.kid = kid;
  return construirFirmador(opciones).setProtectedHeader(encabezado).sign(llaveDeFirma);
}

/** Firma HS256 (respaldo local). */
export async function firmarConSecreto(
  secreto: string,
  opciones: OpcionesToken = {},
  kid?: string,
): Promise<string> {
  const encabezado: { alg: string; kid?: string } = { alg: 'HS256' };
  if (kid !== undefined) encabezado.kid = kid;
  return construirFirmador(opciones)
    .setProtectedHeader(encabezado)
    .sign(new TextEncoder().encode(secreto));
}

/** Token sin firma (`alg: none`). */
export function tokenSinFirma(opciones: OpcionesToken = {}): string {
  const ahora = Math.floor(Date.now() / 1000);
  const codificar = (valor: unknown): string => Buffer.from(JSON.stringify(valor)).toString('base64url');
  const carga = {
    sub: opciones.sub === undefined ? SUB : opciones.sub,
    email: opciones.correo ?? 'ana.perez@quality360.local',
    iss: opciones.emisor ?? EMISOR,
    aud: opciones.audiencia ?? AUDIENCIA,
    role: 'authenticated',
    iat: ahora,
    exp: ahora + (opciones.vigenciaSegundos ?? 300),
  };
  return `${codificar({ alg: 'none', typ: 'JWT' })}.${codificar(carga)}.`;
}
