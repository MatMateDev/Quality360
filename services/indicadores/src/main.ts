/** Arranque de Indicadores (puerto 3005, solo red interna). */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';

import { cargarConfiguracion } from './configuracion.js';
import { crearApp } from './crear-app.js';

const registro = new Logger('Indicadores');
const configuracion = cargarConfiguracion();
const app = await crearApp(configuracion);

await app.listen(configuracion.puerto);

registro.log(`Indicadores escuchando en http://localhost:${configuracion.puerto}`);
registro.log(configuracion.cronSecret === null ? 'CRON_SECRET no configurado: el cron responde 401.' : 'CRON_SECRET configurado.');
registro.log(
  configuracion.servicioToken === null ? 'INDICADORES_SERVICIO_TOKEN no configurado: el snapshot quedará FALLIDA.' : 'INDICADORES_SERVICIO_TOKEN configurado.',
);
