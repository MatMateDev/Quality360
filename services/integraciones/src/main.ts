/** Arranque de Integraciones (puerto 3004, solo red interna). */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';

import { cargarConfiguracion } from './configuracion.js';
import { crearApp } from './crear-app.js';

const registro = new Logger('Integraciones');
const configuracion = cargarConfiguracion();
const app = await crearApp(configuracion);

await app.listen(configuracion.puerto);

registro.log(`Integraciones escuchando en http://localhost:${configuracion.puerto}`);
registro.log(configuracion.llaveCifrado === null ? 'Llave de cifrado no disponible: la integración queda deshabilitada.' : 'Llave de cifrado disponible.');
