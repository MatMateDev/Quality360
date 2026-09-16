/** Arranque del gateway. Único punto de entrada público (puerto 3000). */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';

import { cargarConfiguracion } from './configuracion.js';
import { crearApp } from './crear-app.js';

const registro = new Logger('Gateway');
const configuracion = cargarConfiguracion();
const app = await crearApp(configuracion);

await app.listen(configuracion.puerto);

registro.log(`Gateway escuchando en http://localhost:${configuracion.puerto}`);
registro.log(`Organización: ${configuracion.organizacionUrl} · Certificaciones: ${configuracion.certificacionesUrl}`);
registro.log(
  `Fuentes de composición · usuarios=${configuracion.fuentes.usuarios} supervision=${configuracion.fuentes.supervision} equipo=${configuracion.fuentes.equipo} supervisor=${configuracion.fuentes.supervisor} hdu=${configuracion.fuentes.hdu} checklist=${configuracion.fuentes.checklist}`,
);
