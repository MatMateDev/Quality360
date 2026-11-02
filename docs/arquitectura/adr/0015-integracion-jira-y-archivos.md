# ADR 0015 · Integración con Jira y archivos en su propio servicio, escribiendo HDU solo a través de Organización

- **Estado:** aceptada
- **Fecha:** 2026-10-29
- **Decisiones base:** D93–D112 (backlog E5) y D113–D128 (`decisiones-mvp.md`, Corrida E5)

## Contexto

E5 permite que el Administrador configure una conexión con Jira Cloud, sincronice a mano las historias de un proyecto e importe CSV o JSON. QE y Auditor consultan el historial. El usuario decidió:

- El token se guarda cifrado, con la llave solo en Vercel, y nunca se vuelve a mostrar.
- Una HDU existente solo cambia título, descripción y prioridad.
- Todo cabe en el plan gratuito: funciones de unos 10 s y sin tareas programadas.

Las HDU son de Organización y rigen las reglas no negociables: sin SQL ni llaves foráneas entre esquemas, y cada servicio autoriza por sí mismo.

## Decisión

- **Dueño: el servicio Integraciones** (puerto 3004, quinto proyecto en Vercel). Su esquema `integraciones` guarda la configuración cifrada (AES-256-GCM con IV y etiqueta), los eventos de configuración, las ejecuciones y sus filas. Las tablas son de solo inserción o se cierran una sola vez, y un índice único parcial impide dos ejecuciones simultáneas.
- **Escribe HDU solo a través de Organización.** Usa `POST /v1/interno/integraciones/hdu/upsert`, con lotes de 25 y el token del Administrador. Organización crea por el mismo camino que E2 y actualiza solo los tres campos permitidos, con auditoría `CREAR_HDU` o `ACTUALIZAR_HDU`.
- **Autoriza consultando a Organización** (`/v1/interno/acceso` y `/v1/interno/hdu/ambito`), como Certificaciones e Impedimentos.
- **Una petición acotada por presupuesto.** No hay progreso real ni cola: la ejecución corta en `INCOMPLETA` y se continúa (Jira) o se repite el archivo; repetir es idempotente.
- **El gateway solo reenvía** las rutas declaradas una por una. Si falta `INTEGRACIONES_URL`, solo esas rutas responden 503 (lección del incidente de E4). Si falta la llave, el servicio arranca igual y solo las operaciones que cifran o descifran responden 503.
- **Las exportaciones CSV neutralizan fórmulas en todos los servicios** (D122). La importación guarda el texto tal como llega.

## Consecuencias

- Las HDU importadas aparecen en las bandejas y en los listados. Las pruebas de E5 deben limpiar con el dueño de la base, porque la API no borra HDU.
- El servicio llama a una dirección que escribe el usuario. Por eso solo admite `https://<subdominio>.atlassian.net` y valida antes de cualquier llamada saliente (D95).
- El modo estricto es todo o nada solo si nadie crea en paralelo una HDU con el mismo código entre la simulación y la escritura (D125).
- Rotar la llave obliga a volver a ingresar el token. `llave_version` permite automatizar esa rotación más adelante.

## Alternativas descartadas

- **Integraciones escribe en `organizacion` directamente.** Rompe la regla no negociable 1.
- **Reutilizar la carga semilla (`X-Q360-Servicio-Token`).** Pierde al actor real en la auditoría y saltaría la autorización por rol.
- **Guardar el token en una variable de entorno.** Obliga a redesplegar cada vez que el Administrador cambia la credencial, y no permite configurarlo desde el portal.
- **Sondeo de progreso o una cola.** Necesitaría un trabajo en segundo plano que el plan gratuito no garantiza. El modelo deja abierta esa puerta (`EN_CURSO`).
