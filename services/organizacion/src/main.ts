/** Arranque de Organización (puerto 3001, solo red interna). */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';

import { cargarConfiguracion } from './configuracion.js';
import { crearApp } from './crear-app.js';

const registro = new Logger('Organizacion');
const configuracion = cargarConfiguracion();
const app = await crearApp(configuracion);

await app.listen(configuracion.puerto);

registro.log(`Organización escuchando en http://localhost:${configuracion.puerto}`);
registro.log(`Supabase: ${configuracion.supabaseUrl} · carga semilla permitida: ${configuracion.permitirCargaSemilla}`);
