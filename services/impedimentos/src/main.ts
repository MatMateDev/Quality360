/** Arranque de Impedimentos (puerto 3003, solo red interna). Esqueleto E1/E2. */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';

import { cargarConfiguracion } from './configuracion.js';
import { crearApp } from './crear-app.js';

const registro = new Logger('Impedimentos');
const configuracion = cargarConfiguracion();
const app = await crearApp(configuracion);

await app.listen(configuracion.puerto);

registro.log(`Impedimentos escuchando en http://localhost:${configuracion.puerto}`);
registro.log(`Organización: ${configuracion.organizacionUrl}`);
