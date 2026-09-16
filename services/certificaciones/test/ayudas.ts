/**
 * Utilidades de prueba: un servidor HTTP local simula `/v1/interno/acceso`
 * de Organización (sin depender de que esté levantada) y un token HS256
 * equivalente al de Supabase local.
 */
import { createServer, type Server } from 'node:http';
import { SignJWT } from 'jose';

export const EMISOR = 'http://127.0.0.1:54321/auth/v1';
export const AUDIENCIA = 'authenticated';
export const SECRETO = 'secreto-hs256-solo-para-pruebas-locales-0000';
export const SUB = '5b0c2f0e-8f1e-4c47-9a57-3a0f5d1e2b11';

export async function firmarToken(sub: string = SUB): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: 'prueba@quality360.local', role: 'authenticated', session_id: 'ses-1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(EMISOR)
    .setAudience(AUDIENCIA)
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + 300)
    .sign(new TextEncoder().encode(SECRETO));
}

export interface OrganizacionFalsa {
  url: string;
  responder(cuerpo: unknown, estado?: number): void;
  cerrar(): Promise<void>;
}

/** Simula `GET /v1/interno/acceso` de Organización. */
export async function iniciarOrganizacionFalsa(): Promise<OrganizacionFalsa> {
  let respuesta: { cuerpo: unknown; estado: number } = {
    estado: 200,
    cuerpo: { usuarioId: SUB, rol: 'QE', activo: true, ambito: { qeSupervisorId: null, analistasSupervisadosIds: [] } },
  };

  const servidor: Server = createServer((_peticion, res) => {
    res.writeHead(respuesta.estado, { 'content-type': 'application/json' });
    res.end(JSON.stringify(respuesta.cuerpo));
  });

  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const direccion = servidor.address();
  if (direccion === null || typeof direccion === 'string') throw new Error('no se pudo abrir el servidor falso');

  return {
    url: `http://127.0.0.1:${direccion.port}`,
    responder: (cuerpo, estado = 200) => {
      respuesta = { cuerpo, estado };
    },
    cerrar: () => new Promise<void>((resolver, rechazar) => servidor.close((error) => (error ? rechazar(error) : resolver()))),
  };
}
