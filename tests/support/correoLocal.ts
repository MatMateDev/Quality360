import { env } from "./env";

/**
 * Lectura de los correos que Supabase Auth local entrega en Mailpit
 * (`[local_smtp]`, puerto 54324). Solo para el entorno local: en la nube los
 * correos salen por el SMTP configurado en el proyecto.
 */
interface ResumenMensaje {
  ID: string;
  Subject: string;
  Created: string;
}

interface Mensaje {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
}

async function buscar(destinatario: string): Promise<ResumenMensaje[]> {
  const consulta = encodeURIComponent(`to:"${destinatario}"`);
  const respuesta = await fetch(`${env.mailpitUrl}/api/v1/search?query=${consulta}&limit=20`);
  if (!respuesta.ok) throw new Error(`Mailpit no respondió la búsqueda: ${respuesta.status}`);
  const datos = (await respuesta.json()) as { messages: ResumenMensaje[] };
  return datos.messages ?? [];
}

/** IDs ya recibidos por el destinatario, para esperar luego solo los nuevos. */
export async function idsRecibidos(destinatario: string): Promise<Set<string>> {
  return new Set((await buscar(destinatario)).map((m) => m.ID));
}

/** Espera un correo nuevo (cuyo ID no esté en `previos`) y lo devuelve completo. */
export async function esperarCorreoNuevo(
  destinatario: string,
  previos: Set<string>,
  tiempoLimiteMs = 15_000,
): Promise<Mensaje> {
  const limite = Date.now() + tiempoLimiteMs;
  while (Date.now() < limite) {
    const nuevo = (await buscar(destinatario)).find((m) => !previos.has(m.ID));
    if (nuevo) {
      const respuesta = await fetch(`${env.mailpitUrl}/api/v1/message/${nuevo.ID}`);
      if (!respuesta.ok) throw new Error(`Mailpit no entregó el mensaje ${nuevo.ID}: ${respuesta.status}`);
      return (await respuesta.json()) as Mensaje;
    }
    await new Promise((resolver) => setTimeout(resolver, 300));
  }
  throw new Error(`No llegó un correo nuevo para ${destinatario} a ${env.mailpitUrl} en ${tiempoLimiteMs} ms.`);
}

/** Primer enlace de verificación de Supabase Auth (`/auth/v1/verify?...`) del correo. */
export function enlaceDeVerificacion(mensaje: Mensaje): URL {
  const enTexto = mensaje.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\?[^\s)\]>]+/)?.[0];
  const enHtml = mensaje.HTML.match(/href="(https?:\/\/[^"]+\/auth\/v1\/verify\?[^"]+)"/)?.[1];
  const crudo = enTexto ?? enHtml;
  if (!crudo) throw new Error(`El correo "${mensaje.Subject}" no trae un enlace /auth/v1/verify.`);
  return new URL(crudo.replace(/&amp;/g, "&"));
}

/** Borra de Mailpit los correos dirigidos a un destinatario (limpieza de lo que dejó una prueba). */
export async function borrarCorreos(destinatario: string): Promise<void> {
  const consulta = encodeURIComponent(`to:"${destinatario}"`);
  await fetch(`${env.mailpitUrl}/api/v1/search?query=${consulta}`, { method: "DELETE" }).catch(() => undefined);
}

/** Cantidad de correos que Mailpit tiene para un destinatario. */
export async function contarCorreos(destinatario: string): Promise<number> {
  return (await buscar(destinatario)).length;
}
