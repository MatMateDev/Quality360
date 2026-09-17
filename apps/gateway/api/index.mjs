// Vercel Function: sirve el gateway NestJS desde su compilación (dist).
// Se usa el código compilado por tsc (con metadatos de decoradores) en vez de dejar que
// Vercel compile src/main.ts. La app se crea una sola vez por instancia y se reutiliza.
import 'reflect-metadata';
import { cargarConfiguracion } from '../dist/configuracion.js';
import { crearApp } from '../dist/crear-app.js';

let servidor;

function obtenerServidor() {
  servidor ??= Promise.resolve()
    .then(() => crearApp(cargarConfiguracion()))
    .then(async (app) => {
      await app.init();
      return app.getHttpAdapter().getInstance();
    })
    .catch((error) => {
      // Sin esto el intento fallido quedaría guardado y la instancia no volvería a intentarlo.
      servidor = undefined;
      throw error;
    });
  return servidor;
}

export default async function manejador(solicitud, respuesta) {
  let express;
  try {
    express = await obtenerServidor();
  } catch (error) {
    // El motivo de ExcepcionQ360 (p. ej. la variable de entorno que falta) no va en el mensaje:
    // se escribe aparte para que aparezca en los logs de Vercel. Al cliente no se le expone.
    console.error(`No se pudo iniciar el servicio: ${error?.motivo ?? error?.message ?? error}`);
    respuesta.statusCode = 503;
    respuesta.setHeader('content-type', 'application/json; charset=utf-8');
    respuesta.end(JSON.stringify({ codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'El servicio no está disponible. Intenta nuevamente.', detalles: [] }));
    return;
  }
  return express(solicitud, respuesta);
}
