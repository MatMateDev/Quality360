# Guía · Conectar Quality360 con Jira por OAuth 2.0 (3LO)

Para quien despliega Quality360. Toma unos 15 minutos y no tiene costo. Decisiones: D209–D218 y ADR 0019. El Administrador de Quality360 no hace estos pasos: él solo pulsa «Conectar con Jira» (paso 4).

**Antes de empezar.** El Client secret es una contraseña:
- Solo vive en tu gestor de contraseñas y en las variables de Vercel.
- No lo pegues en el chat, en un documento, en un commit ni en un issue. Quality360 nunca lo muestra ni lo pide.
- Si crees que se filtró, genera uno nuevo en la consola de Atlassian (paso 1.5) y repite el paso 2.

## 1. Registrar la app en Atlassian

1. Entra a <https://developer.atlassian.com/console/myapps/> con la cuenta de Atlassian que usará la integración. En el piloto es la dueña de `jseguelh.atlassian.net`.
2. **Create** → **OAuth 2.0 integration**. Nombre: `Quality360`. Acepta los términos y crea la app.
3. **Permissions** → **Jira API** → **Add** y luego **Configure**. En los permisos clásicos agrega **solo** estos dos:

   | Permiso | Nombre en la consola | Para qué |
   | --- | --- | --- |
   | `read:jira-work` | View Jira issue data | Leer el proyecto, los campos y las historias |
   | `read:jira-user` | View user profile | Saber con qué cuenta quedó conectado |

   No agregues permisos de escritura (`write:*`, `manage:*`). El permiso `offline_access` no se marca aquí: Quality360 lo pide al autorizar, para poder renovar la conexión solo.
4. **Authorization** → **OAuth 2.0 (3LO)** → **Add** (o **Configure**). En **Callback URL** escribe exactamente:

   `https://quality360-one.vercel.app/admin/integraciones/jira/oauth/retorno`

   Va sin barra final, sin espacios y sin parámetros. Guarda.
5. **Settings**: copia el **Client ID** y el **Secret** a tu gestor de contraseñas. Si el secreto se pierde o se filtra, genera uno nuevo en esta misma pantalla y repite el paso 2.
6. **Distribution**: solo hace falta si otra cuenta, distinta de la dueña de la app, va a conectar. Pulsa **Edit**, activa **Enable sharing**, completa los campos que pida la consola y guarda. Esa persona verá un aviso de que Atlassian no revisó la app; es esperado. Si solo conecta la dueña, deja la app privada.
7. La app tiene **una sola** URL de retorno, la de producción. En local, las pruebas usan un Atlassian simulado y no necesitan esta app. Si algún día hay que probar en local contra Atlassian real, se registra otra app con su propia URL de retorno.

## 2. Cargar las variables en Vercel

Proyecto `quality360-integraciones` → **Settings** → **Environment Variables**. Agrégalas en **Production** y marca **Sensitive** en las tres:

| Nombre | Valor |
| --- | --- |
| `JIRA_OAUTH_CLIENT_ID` | El Client ID del paso 1.5 |
| `JIRA_OAUTH_CLIENT_SECRET` | El Secret del paso 1.5 |
| `JIRA_OAUTH_REDIRECT_URI` | `https://quality360-one.vercel.app/admin/integraciones/jira/oauth/retorno`, idéntica a la del paso 1.4 |

- No las agregues en otros proyectos: ni el portal ni el gateway las usan.
- No agregues `JIRA_OAUTH_URL_AUTORIZACION`, `JIRA_OAUTH_URL_API` ni `INTEGRACIONES_PERMITIR_HOST_PRUEBA`. Son solo para pruebas locales y en producción se ignoran.
- Confirma que `INTEGRACIONES_LLAVE_CIFRADO` ya existe en ese proyecto (`GUIA-VERCEL.md`, paso 2.5). Sin ella no se puede guardar ninguna credencial.
- **Deployments** → último despliegue → **Redeploy**, porque las variables se leen al arrancar.

Las tres son opcionales: si falta alguna o es inválida, el servicio arranca igual, «Conectar con Jira» aparece deshabilitado y el API token sigue funcionando.

## 3. Preparar la base de datos

Una sola vez, al publicar la corrida OAuth. Lo hace quien publica, o Claude con el conector de Supabase si lo autorizas:

1. Si Supabase está pausado, reactívalo y espera a que quede `ACTIVE_HEALTHY`.
2. Aplica `services/integraciones/prisma/migrations/20261122000000_e5_oauth_jira/migration.sql` con `apply_migration`, con el nombre `q360_integraciones_20261122000000_e5_oauth_jira` y anteponiendo `set local search_path to integraciones;`.
3. Aplica `infrastructure/nube/007_rls_oauth_jira_nube.sql` y haz las comprobaciones de su encabezado.

La migración es compatible con el código anterior: puede aplicarse antes de publicar el código.

## 4. Verificar (prueba manual E5-MAN-02)

1. Con sesión de Administrador, abre **Integraciones** → **Conexión**. «Conectar con Jira» debe estar habilitado.
2. Pulsa «Conectar con Jira», inicia sesión en Atlassian si te lo pide y acepta los permisos. Vuelves a Quality360 con «Conectado con Jira (OAuth) como <tu cuenta> en jseguelh». Si tu cuenta ve varios sitios, elige uno y pulsa «Usar este sitio».
3. En la tarjeta de estado, pulsa «Probar conexión».
4. Elige el proyecto y el destino de las HDU nuevas y pulsa «Probar y guardar». Si antes usabas el API token, desde aquí se usa OAuth y el API token guardado se descarta.
5. Abre **Consultar Jira** y consulta.
6. Espera más de una hora y vuelve a consultar. Debe funcionar sin pedir nada, porque la conexión se renovó sola.
7. Anota el resultado de E5-MAN-02. Si algún paso falló por permisos, anota cuál, para ajustar la lista de permisos (decisiones, pregunta abierta 3).

## 5. Desconectar y revocar

1. **En Quality360:** Conexión → «Desconectar» → «Sí, desconectar». Se borran las credenciales guardadas en Quality360; lo ya importado no se borra.
2. **En Atlassian:** entra a <https://id.atlassian.com/manage-profile/apps> (configuración de la cuenta, apps conectadas), busca `Quality360` y quita el acceso.

Si revocas en Atlassian sin desconectar en Quality360, la siguiente renovación falla y Conexión muestra «Reconexión necesaria».

## 6. Problemas frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| «Conectar con Jira» aparece deshabilitado | Falta o está mal una de las tres variables, o faltó el Redeploy | Revisa los nombres y que la URL de retorno sea `https://`, sin barra final. Luego haz Redeploy |
| Atlassian muestra un error de `redirect_uri` o de callback | La Callback URL de la consola y `JIRA_OAUTH_REDIRECT_URI` no son idénticas | Cópiala de nuevo en los dos lados (pasos 1.4 y 2) |
| «Atlassian no aceptó la autorización» | Client ID o secreto mal copiados, o un secreto nuevo que no se cargó en Vercel | Vuelve a copiar ambos en Vercel y haz Redeploy |
| «Faltan permisos en Atlassian» | La app no tiene los dos permisos de Jira, o no se aceptaron todos | Revisa el paso 1.3 y vuelve a conectar aceptando todo |
| «Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira» | La cuenta no tiene Jira Cloud | Conecta con otra cuenta |
| Otra persona no puede autorizar la app | La app es privada | Paso 1.6 |
| «Reconexión necesaria» | Pasaron 90 días sin usar la conexión, cambió la contraseña de Atlassian o se revocó la app | Pulsa «Reconectar» y acepta de nuevo |
| «Reconexión necesaria» justo después de cambiar la llave de cifrado | Las credenciales guardadas ya no se pueden descifrar | Pulsa «Reconectar» |
| «La integración no está habilitada en el servidor» | Falta `INTEGRACIONES_LLAVE_CIFRADO` o es inválida | `GUIA-VERCEL.md`, paso 2.5 |
| La organización de Atlassian exige aprobar apps de terceros | Política del administrador de Atlassian | Pide la aprobación o usa el API token |
