// Vercel Function: sirve la app NestJS de este workspace desde su compilación (dist).
// Se usa el código compilado por tsc (con metadatos de decoradores) en vez de dejar que
// Vercel compile src/main.ts. La app se crea una sola vez por instancia y se reutiliza.
import 'reflect-metadata';
import { cargarConfiguracion } from '../dist/configuracion.js';
import { crearApp } from '../dist/crear-app.js';

let servidor;

function obtenerServidor() {
  servidor ??= crearApp(cargarConfiguracion()).then(async (app) => {
    await app.init();
    return app.getHttpAdapter().getInstance();
  });
  return servidor;
}

export default async function manejador(solicitud, respuesta) {
  const express = await obtenerServidor();
  return express(solicitud, respuesta);
}
