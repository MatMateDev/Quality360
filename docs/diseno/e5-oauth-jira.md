# Diseño E5 · Conectar con Jira (OAuth 2.0 de Atlassian)

Insumos: `docs/backlog/e5-oauth-jira.md` (E5-F08, E5-B08, cambios a E5-F01, F02, B01 y B02, D209–D218, sección 4.1 de errores y sección 8 de la guía) y `docs/diseno/e5-integracion-jira.md` (pestaña Conexión, sección 3; mensajes, sección 10; accesibilidad, sección 11). Este documento **define cómo se ve y se comporta**; no contiene código. Dueño de construcción: `q360-frontend`.

Notación: «cert.» = elemento certificado que **no cambia** salvo lo dicho aquí. Los nombres de ruta y variables provisionales del backlog se marcan `<…>`; si el arquitecto los cambia, cambia el texto de esas rutas y nada más.

Alcance: pestaña Conexión del Administrador, página de retorno, selección de sitio, cambio de método, mensaje en Consultar Jira y guía en el portal. Todo lo demás de E5 (Sincronizar, Importar, Historial) queda igual.

---

## 1. Principios y sistema visual

1. **Mismo sistema visual de E5.** Tarjetas y paneles de la pestaña Conexión, `chip-conexion`, `ErrorIntegracion`, `BloqueEstado`, `DialogoConfirmacion` y los tokens `--q360-*` existentes. **No se agrega ningún color hexadecimal nuevo.** Los estados nuevos reutilizan los alias de E5:

| Estado de conexión | Glifo + palabra | Alias de color |
| --- | --- | --- |
| Conectado (OAuth o API token) | `✓` | `--q360-color-res-exitosa` (+ `-suave`) |
| Reconexión necesaria | `⚠` | `--q360-color-res-incompleta` (+ `-suave`) |
| Falta elegir el sitio | `◐` | `--q360-color-res-incompleta` (+ `-suave`) |
| Sin conectar | `○` | `--q360-color-res-neutra` (+ `-suave`) |
| Error de prueba | `✕` | `--q360-color-res-fallida` (+ `-suave`) |

   El color nunca es el único canal: siempre hay glifo y palabra.
2. **OAuth primero, API token visible.** OAuth es el camino recomendado (D209), pero el API token no se esconde: está siempre a un clic y se anuncia.
3. **El portal no guarda nada sensible.** Ni `code`, ni `state`, ni tokens en `localStorage`, `sessionStorage` ni en la dirección; al leer el retorno se limpia la dirección con `history.replaceState` (D210).
4. **Los mensajes salen de una tabla local por código** (sección 9), como en E5. El texto que llegue del API solo se usa para un código desconocido, recortado. Ningún mensaje nombra variables de entorno ni valores.
5. **El servidor decide, el portal explica.** El portal nunca arma la dirección de Atlassian ni la `redirect_uri`: usa la `urlAutorizacion` que devuelve `oauth/iniciar`.
6. **Nada destructivo sin confirmación.** Desconectar y volver de OAuth a API token piden confirmación; conectar o cambiar de método hacia OAuth no destruye nada hasta que el nuevo funcione.
7. **Solo el Administrador.** Ningún botón ni ruta de OAuth existe para otros roles (E5-F08 #12).

---

## 2. Pestaña «Conexión» (Administrador)

Ruta: `/admin/integraciones` (cert.). Cabecera, pestañas y foco al `h1` al entrar: sin cambios (E5 sección 3.1).

### 2.1 Estructura (de arriba abajo)

1. **Tarjeta de estado de la conexión** (`tarjeta-estado-conexion`): reemplaza la franja de estado actual. Sección 3.
2. **Selector de método** (`selector-metodo`): sección 2.2.
3. **Panel del método elegido** (OAuth o API token).
4. **Proyecto y destino de las HDU nuevas**, sin cambios (cert.), con «Probar sin guardar» y «Probar y guardar».
5. **Cambios de configuración**, ahora incluye los eventos `CONECTAR_OAUTH`, `RECONECTAR`, `DESCONECTAR` y `REFRESCO_FALLIDO` (D217), con los textos de la sección 3.8.

### 2.2 Selector de método

`fieldset` con `legend` «Método de conexión» y dos opciones de radio con forma de tarjeta (rejilla de 2 columnas a ≥ 900 px, una debajo). Radio nativo (se opera con flechas, no se reinventa).

```
 Método de conexión
 ┌───────────────────────────────────────┐  ┌───────────────────────────────────────┐
 │ (●) Conectar con Jira   [Recomendado] │  │ ( ) Conectar con API token            │
 │ Inicias sesión en Atlassian y aceptas │  │ Alternativa. Copias un API token de   │
 │ permisos de solo lectura. No copias   │  │ tu cuenta de Atlassian y lo pegas     │
 │ ningún token.                         │  │ aquí.                                 │
 └───────────────────────────────────────┘  └───────────────────────────────────────┘
```

| Elemento | testid | Texto |
| --- | --- | --- |
| Contenedor | `selector-metodo` | legend «Método de conexión» |
| Opción OAuth | `opcion-oauth` | «Conectar con Jira» + insignia «Recomendado» + «Inicias sesión en Atlassian y aceptas permisos de solo lectura. No copias ningún token.» |
| Opción API token | `opcion-api-token` | «Conectar con API token» + «Alternativa. Copias un API token de tu cuenta de Atlassian y lo pegas aquí.» |

Reglas:
- **Elegir un método no cambia el método activo.** Solo cambia el panel que se muestra. El método activo lo muestra la tarjeta de estado. Esto vale para el cambio seguro de la sección 6.
- Opción inicial: el método activo guardado; sin configuración, **OAuth** (recomendado). Si `oauthDisponible` es `false`, la opción inicial sigue siendo OAuth si no hay configuración, pero con el botón deshabilitado y el motivo visible (2.3); no se salta automáticamente al API token para no ocultar la razón.
- La opción activa se marca con borde de 2 px, el radio relleno y la palabra «Método activo» en la tarjeta correspondiente. No depende solo del color.
- Con un método activo distinto del elegido, la tarjeta de la opción elegida muestra la línea «Método activo ahora: API token» (o OAuth), para que se entienda que aún no cambió nada.

### 2.3 Panel OAuth: botón «Conectar con Jira»

Wireframe 1280 (sin conexión previa y con variables disponibles):

```
 ┌ Conectar con Jira ─────────────────────────────────────────────────────────────────┐
 │ Se abrirá Atlassian para que inicies sesión y aceptes permisos de solo lectura.    │
 │ Quality360 nunca ve tu contraseña ni escribe en Jira.                              │
 │ Permisos que se piden: ver datos de issues, ver el perfil del usuario y mantener   │
 │ la conexión.                                                                       │
 │ [ Conectar con Jira ]                                                              │  boton-conectar-jira
 └────────────────────────────────────────────────────────────────────────────────────┘
```

**Estados del botón** (siempre el mismo `button`, `type="button"`, `data-testid="boton-conectar-jira"`, con `data-estado`):

| Estado (`data-estado`) | Cuándo | Presentación | Comportamiento |
| --- | --- | --- | --- |
| `disponible` | `oauthDisponible` es `true` y no hay retorno en curso | Botón primario «Conectar con Jira» (si ya hay conexión OAuth, el texto es «Reconectar», ver 3.2) | Pulsar llama `POST oauth/iniciar` y redirige a `urlAutorizacion` con `window.location.assign` (no `window.open`, para no bloquear ventanas) |
| `no-disponible` | `oauthDisponible` es `false` o `oauth/iniciar` responde 503 `JIRA_OAUTH_NO_CONFIGURADO` | Mismo botón con **`aria-disabled="true"`**, estilo deshabilitado (fondo neutro, texto con contraste ≥ 4,5:1 sobre su fondo, borde punteado) y **sigue en el orden de tabulación** | Pulsar o Enter **no hace nada** (se ignora el evento). El foco puede llegar y el lector lee el botón y su motivo (`aria-describedby="aviso-oauth-no-disponible"`) |
| `en-curso` | Entre el clic y la redirección, y también durante el procesamiento del retorno | Texto «Conectando…» con indicador giratorio decorativo (`aria-hidden`); sin animación con `prefers-reduced-motion` | `aria-disabled="true"` y `aria-busy="true"`; el clic se ignora (evita doble envío); una `role="status"` dice «Abriendo Atlassian…» |
| `error` (breve) | `oauth/iniciar` falla por red o 5xx | Vuelve a `disponible`; aparece `error-oauth` | Ver 2.4 |

Se usa `aria-disabled` y **no** el atributo `disabled`, de modo que el motivo sea legible por teclado y lector (D216).

`aviso-oauth-no-disponible` (`role="note"` pero siempre en el DOM, ligado con `aria-describedby`; visible solo en `no-disponible`):
«La conexión automática aún no está habilitada en el servidor. Usa la conexión con API token o pide a quien despliega que cargue las credenciales de la app de Atlassian.»
Con un enlace «Usar API token» (`enlace-usar-api-token`) que cambia el selector a la opción API token y lleva el foco a `campo-sitio`, y un enlace «Cómo se configura» (`enlace-ayuda-oauth`) que abre la guía (sección 11).

### 2.4 Errores al iniciar

`error-oauth` (`role="alert"`, `tabIndex=-1`, recibe el foco, `data-codigo`): `ErrorIntegracion` con glifo `✕`.

| Código o causa | Mensaje | Acción |
| --- | --- | --- |
| 503 `JIRA_OAUTH_NO_CONFIGURADO` | «La conexión automática con Jira no está habilitada en el servidor.» + el texto de `aviso-oauth-no-disponible` | «Usar API token» |
| 503 `LLAVE_CIFRADO_NO_DISPONIBLE` | «La integración no está habilitada en el servidor. Avisa al responsable del despliegue.» (cert.) | El panel entero queda deshabilitado, como hoy |
| Red o 5xx | «No fue posible abrir Atlassian. Intenta nuevamente.» | El botón vuelve a `disponible` |
| 403 | «Ya no tienes permiso para esta acción» y se consulta `GET /v1/me` (patrón E4) | — |

### 2.5 Panel API token (alternativa)

Es el formulario actual de E5-F01 **sin cambios** (campos `campo-sitio`, `campo-correo`, `campo-token`, `campo-proyecto`, `campo-tipos`, validaciones, flujo de «Probar y guardar», cert.). Cambios:

- Aparece al elegir `opcion-api-token`, **dentro del mismo `fieldset` de método**, bajo el título «Conectar con API token» y una línea «Úsalo si no puedes conectar con Jira o si tu cuenta no puede aceptar la aplicación.»
- **Visible pero secundario:** es la segunda opción del selector, con el mismo tamaño y peso que la primera; no se esconde en un menú ni en un «Avanzado». El detalle del formulario se muestra al elegir la opción (no colapsado dentro de otro control).
- Los campos de sitio, correo y token **solo existen en este método** (E5-F01 #5, `campo-token` nunca se rellena).
- Si el método activo es OAuth y el Administrador abre este panel, antes del primer campo aparece `aviso-cambio-a-api-token` (sección 6.2).

### 2.6 Estados de la pestaña (adiciones)

| Estado | Presentación |
| --- | --- |
| Cargando | Esqueleto de la tarjeta de estado y del selector; `aria-busy` (cert.) |
| Sin configuración, OAuth disponible | Tarjeta «Sin conectar», selector con OAuth elegido, botón `disponible` |
| Sin configuración, OAuth no disponible | Tarjeta «Sin conectar», botón `no-disponible` con su motivo, API token disponible |
| `PENDIENTE_SITIO` | Tarjeta «Falta elegir el sitio» y la lista de sitios (sección 5) dentro de la pestaña |
| Error / No disponible | Los de E5 (cert.): `estado-error-configuracion`, `estado-indisponible-configuracion` |

### 2.7 Wireframe 375 px

```
┌────────────────────────────┐
│ Integraciones              │
│ [Conexión][Sincronizar][Im→│
│ ┌ Estado de la conexión ─┐ │
│ │ [✓ Conectado con Jira  │ │
│ │  (OAuth)]              │ │
│ │ Cuenta                 │ │
│ │ ana@empresa.com        │ │
│ │ Sitio                  │ │
│ │ empresa (…atlassian.net│ │
│ │ Permisos               │ │
│ │ Solo lectura           │ │
│ │ Renovada el 22-11-2026 │ │
│ │ [Probar conexión]      │ │
│ │ [Desconectar]          │ │
│ └────────────────────────┘ │
│ Método de conexión         │
│ ┌ (●) Conectar con Jira ─┐ │
│ │ Recomendado            │ │
│ └────────────────────────┘ │
│ ┌ ( ) Conectar con API  ─┐ │
│ │ token                  │ │
│ └────────────────────────┘ │
│ [Reconectar]               │  ← ancho completo, 44 px
│ …                          │
└────────────────────────────┘
```

Una sola columna; botones apilados a ancho completo con `min-height: var(--q360-objetivo-tactil)`; correos y URL largos con `overflow-wrap: anywhere`. Sin desbordamiento horizontal a 375 px.

---

## 3. Tarjeta de estado de la conexión

`tarjeta-estado-conexion` (`<section aria-labelledby>`, título «Estado de la conexión»). Reemplaza la franja actual: mantiene `chip-conexion` (cert.) y suma el chip de método. Es una región con foco programático solo tras acciones (3.7).

### 3.1 Contenido común

| Elemento | testid | Contenido |
| --- | --- | --- |
| Chip | `chip-conexion` (con `data-estado`: `sin-conectar`, `conectado-oauth`, `conectado-api-token`, `reconexion-necesaria`, `falta-sitio`, `fallo`) | Glifo + etiqueta (3.2) |
| Estado OAuth | `estado-oauth` (con `data-estado`: `CONECTADA`, `PENDIENTE_SITIO`, `RECONEXION_NECESARIA`) | Solo presente con método OAuth |
| Última prueba | `texto-ultima-prueba` (cert.) | Fecha (`<time>`, hora de Chile) y, si falló, el mensaje fijo del código |

Hay **un** chip por vez, con la palabra completa (la etiqueta no se corta con puntos suspensivos; envuelve en varias líneas a 375 px).

### 3.2 Los cuatro estados

**A. Conectado con Jira (OAuth)** (`data-estado="conectado-oauth"`)

```
 ┌ Estado de la conexión ────────────────────────────────────────────────────────────┐
 │ [✓ Conectado con Jira (OAuth) como ana@empresa.com en empresa]   (chip-conexion)   │
 │ Cuenta: ana@empresa.com                   (cuenta-oauth)                            │
 │ Sitio: empresa · https://empresa.atlassian.net            (sitio-oauth)             │
 │ Permisos concedidos: solo lectura                         (permisos-oauth)          │
 │   · Ver datos de issues  · Ver perfil del usuario  · Mantener la conexión           │
 │ Conectado el 22-11-2026 10:15 · Renovada el 22-11-2026 11:10   (fecha-renovacion)   │
 │ Última prueba: 22-11-2026 10:20                       (texto-ultima-prueba)         │
 │ [ Probar conexión ]  [ Desconectar ]                                                │
 └────────────────────────────────────────────────────────────────────────────────────┘
```

- Chip: «✓ Conectado con Jira (OAuth) como <cuenta> en <sitio>» (D215). `<cuenta>` y `<sitio>` se muestran con el nombre; la URL completa va en `sitio-oauth`.
- `permisos-oauth`: lista de lo concedido, traducido (`read:jira-work` → «Ver datos de issues», `read:jira-user` → «Ver perfil del usuario», `offline_access` → «Mantener la conexión»), precedida de la palabra «Solo lectura». Los códigos técnicos de scope **no** se muestran como texto principal; van como `title`/texto secundario `sr-only` para quien los necesite. Si el servidor devuelve un permiso desconocido, se muestra el código tal cual.
- `fecha-renovacion`: «Renovada el <fecha y hora>». Si aún no se ha renovado: «Aún no se ha renovado (se renueva sola antes de que venza)». Nunca se muestra el vencimiento del token como cuenta regresiva.
- Línea explicativa fija (texto pequeño): «La conexión se renueva sola. Solo tendrás que reconectar si revocas el permiso en Atlassian o si pasan muchos días sin usarla.» (la frase de los «muchos días» es genérica; no promete un plazo que Atlassian puede cambiar).

**B. Reconexión necesaria** (`data-estado="reconexion-necesaria"`, `estado-oauth data-estado="RECONEXION_NECESARIA"`)

```
 ┌ Estado de la conexión ────────────────────────────────────────────────────────────┐
 │ [⚠ Reconexión necesaria]                                       (chip-conexion)    │
 │ ┌ aviso-reconexion · role="alert" ─────────────────────────────────────────────┐ │
 │ │ La conexión con Jira venció. Vuelve a conectar con Jira.                     │ │
 │ │ Mientras tanto no se puede consultar ni sincronizar. Lo que ya está en       │ │
 │ │ Quality360 no se modifica.                                                   │ │
 │ │ [ Reconectar ]   (boton-reconectar-jira)                                     │ │
 │ └──────────────────────────────────────────────────────────────────────────────┘ │
 │ Última cuenta: ana@empresa.com · Sitio: empresa     (si el servidor la informa)  │
 │ [ Desconectar ]                                                                   │
 └────────────────────────────────────────────────────────────────────────────────────┘
```

- «Reconectar» (`boton-reconectar-jira`) ejecuta el mismo flujo que `boton-conectar-jira` (llama a `oauth/iniciar`) y tiene los mismos estados (`disponible`, `no-disponible`, `en-curso`). **No se muestran a la vez** `boton-conectar-jira` y `boton-reconectar-jira` con el mismo propósito: en este estado, el panel OAuth reutiliza el botón único (el de la tarjeta) y el del panel se oculta.
- «Probar conexión» no existe en este estado (no hay credencial que probar).
- Nota de texto: la credencial ya se borró en el servidor (D215); no hay nada que «volver a probar».
- Si falla un transitorio (red, 5xx, 429), **no** se muestra este estado: se mantiene «Conectado» y la prueba muestra `JIRA_NO_DISPONIBLE`, `JIRA_TIEMPO_AGOTADO` o `JIRA_LIMITE_DE_TASA` con el texto de E5 (D215).
- Nota de contraste: «⚠ Reconexión necesaria» usa el alias `res-incompleta` con texto oscuro sobre su fondo suave (≥ 4,5:1, igual que `badge-resultado--incompleta`).

> Observación para el arquitecto: el backlog (E5-F08 #8) nombra al botón «Volver a conectar»; esta solicitud de diseño pide «Reconectar». Se deja **«Reconectar»** como texto del botón y «Vuelve a conectar con Jira» en el mensaje del servidor. Hay que alinear E5-F08 #8 y el caso de prueba al texto final.

**C. Conectado con API token** (`data-estado="conectado-api-token"`)

```
 │ [✓ Conectado con API token]                                      (chip-conexion)    │
 │ Sitio: https://empresa.atlassian.net                                                │
 │ Correo: admin@empresa.com                                                           │
 │ API token: Configurado · termina en AB12                          (token-estado)    │
 │ Última prueba: 22-11-2026 10:20                                                     │
 │ ¿Prefieres no copiar tokens? Conecta con Jira.   [ Conectar con Jira ]              │
 │ [ Probar conexión ]  [ Desconectar ]                                                │
```

- Mantiene `token-estado` y `texto-ultima-prueba` (cert.). El chip cambia de «Conectado» a «Conectado con API token» (D215, E5-F01 #5).
- Se ofrece pasar a OAuth con un texto corto que apunta al selector (no repite el botón si OAuth no está disponible: en ese caso dice «La conexión automática aún no está habilitada en el servidor.»).
- «Desconectar» en este método **no es nuevo ni parte de E5-F08** (el backlog solo define desconectar para OAuth, D217). Para el API token se **omite** el botón «Desconectar»: el token se reemplaza escribiendo otro. Está anotado como brecha 12.1.

**D. Sin conectar** (`data-estado="sin-conectar"`)

```
 │ [○ Sin conectar]                                                  (chip-conexion)  │
 │ Aún no hay una conexión con Jira. Elige un método para empezar.                     │
```

También aplica tras «Desconectar» de OAuth: «Se desconectó de Jira. Las credenciales guardadas se borraron.» más la ayuda para revocar el permiso en Atlassian (3.6). No hay «Probar conexión» ni «Desconectar».

**E. Falta elegir el sitio** (`data-estado="falta-sitio"`, `estado-oauth data-estado="PENDIENTE_SITIO"`)
Chip «◐ Falta elegir el sitio». Debajo, la lista de la sección 5. No se puede consultar ni sincronizar mientras tanto (E5-F08 #4).

### 3.3 «Probar conexión»

`boton-probar-conexion`, `type="button"`, secundario. Llama a `POST .../configuracion/probar` con el método activo (con OAuth no manda sitio, correo ni token, D138-6).

- En curso: texto «Probando…», `aria-disabled="true"`, `role="status"` «Probando la conexión con Jira…».
- Éxito: `mensaje-conexion-ok` (cert., `role="status"`): «Conexión exitosa con Jira como <cuenta>. No se guardaron cambios.» y `texto-ultima-prueba` se actualiza.
- Error: `error-conexion` (cert., `role="alert"`, foco) con el mensaje fijo del código (sección 9). Para `JIRA_RECONEXION_NECESARIA`, la tarjeta pasa a «Reconexión necesaria» y el foco va a `aviso-reconexion`.
- Relación con los botones existentes: «Probar sin guardar» y «Probar y guardar» del panel «Proyecto y destino» **se mantienen** (cert.). «Probar conexión» de la tarjeta solo verifica que la credencial funciona; no valida el proyecto ni guarda nada. Los dos usan la misma llamada y comparten el mensaje de éxito; no se muestran a la vez dos mensajes (se reemplaza el anterior).

### 3.4 «Desconectar» y su diálogo de confirmación

`boton-desconectar-jira`, secundario con texto de peligro (no relleno rojo: el relleno rojo se reserva para el botón de confirmar dentro del diálogo). Con `DialogoConfirmacion` existente:

```
 ┌ Desconectar de Jira ───────────────────────────────────────────────┐   (confirmar-desconexion)
 │ Se borrarán las credenciales guardadas en Quality360. Mientras no   │
 │ vuelvas a conectar, no se podrá consultar ni sincronizar con Jira.  │
 │ Para quitar el permiso en Atlassian, revoca la app desde tu cuenta. │
 │ Lo ya importado no se borra.                                        │
 │            [ Cancelar ]   [ Sí, desconectar ]                       │
 └─────────────────────────────────────────────────────────────────────┘
```

- Texto del backlog (E5-F08 #11): «Se borrarán las credenciales guardadas. Para quitar el permiso en Atlassian, revoca la app desde tu cuenta». Se agrega la frase «Lo ya importado no se borra.» solo si el equipo confirma que es cierto (la desconexión no toca las HDU; D217 no lo contradice).
- `role="alertdialog"`, `aria-labelledby` y `aria-describedby`; atrapa el foco; **Escape equivale a Cancelar**; el foco inicial va a **«Cancelar»** (acción segura); al cerrar, el foco vuelve a `boton-desconectar-jira`, o, tras desconectar, al `h2` de la tarjeta (el botón ya no existe).
- Botones: `boton-cancelar-desconexion`, `boton-confirmar-desconexion` (`confirmar-desconexion` es el testid del diálogo).
- Durante la petición, «Sí, desconectar» dice «Desconectando…» con `aria-disabled`.
- Éxito: se cierra el diálogo, la tarjeta pasa a «Sin conectar», `mensaje-desconexion-ok` (`role="status"`): «Se desconectó de Jira. Las credenciales guardadas se borraron.» y aparece `ayuda-revocar-jira` (3.6).
- Error de red o 5xx: el diálogo se mantiene con `error-desconexion` (`role="alert"`): «No fue posible desconectar. Intenta nuevamente.» 409 `JIRA_OAUTH_SIN_CONEXION`: «No hay una conexión pendiente.» y se recarga la tarjeta.

### 3.5 Acciones por estado

| Estado | Reconectar / Conectar | Probar conexión | Desconectar |
| --- | --- | --- | --- |
| Conectado con Jira (OAuth) | «Reconectar» (secundario, opcional, por si cambió de cuenta) | Sí | Sí |
| Reconexión necesaria | «Reconectar» (**principal**) | No | Sí |
| Conectado con API token | Ofrece «Conectar con Jira» (sección 6.1) | Sí | No (ver 12.1) |
| Falta elegir el sitio | — (se elige abajo) | No | Sí |
| Sin conectar | Según el método elegido | No | No |

### 3.6 `ayuda-revocar-jira`

Bloque informativo (`role="note"`), visible tras desconectar y siempre disponible en la tarjeta OAuth como `details` «Cómo quitar el permiso en Atlassian»:

«Desconectar borra las credenciales guardadas en Quality360, pero el permiso sigue en tu cuenta de Atlassian. Para quitarlo: entra a id.atlassian.com, abre Perfil y visibilidad, luego Apps conectadas, busca Quality360 y revoca el acceso.»

El enlace a `https://id.atlassian.com/` es un `<a target="_blank" rel="noopener noreferrer">` con texto «Abrir id.atlassian.com (se abre en una pestaña nueva)».

### 3.7 Foco y anuncios en la tarjeta

- Tras una acción de la tarjeta, el resultado se anuncia en una región `role="status"` (`anuncio-conexion`) y el foco se queda donde estaba, salvo errores (van a `error-conexion` o `error-oauth`).
- El cambio de estado de la tarjeta (por ejemplo, de «Conectado» a «Sin conectar») **mueve el foco al título de la tarjeta** (`tabIndex=-1`) cuando el control que lo tenía desaparece.
- `chip-conexion` no es un botón ni un enlace; no recibe foco.

### 3.8 Textos de los eventos OAuth en «Cambios de configuración»

| Tipo (D217) | Texto en `lista-eventos-configuracion` |
| --- | --- |
| `CONECTAR_OAUTH` | «<fecha> · <actor> · conectó con Jira (OAuth) como <cuenta> en <sitio>» |
| `RECONECTAR` | «<fecha> · <actor> · reconectó con Jira (OAuth) como <cuenta>» |
| `DESCONECTAR` | «<fecha> · <actor> · desconectó la conexión con Jira» |
| `REFRESCO_FALLIDO` | «<fecha> · Sistema · la renovación de la conexión falló; se necesita reconectar» |

Nunca aparecen tokens, `code` ni `state`. El actor `Sistema` en `REFRESCO_FALLIDO` es una etiqueta del portal (no hay persona).

---

## 4. Ruta de retorno desde Atlassian

Ruta: `<PORTAL>/admin/integraciones/jira/oauth/retorno` (provisional, D210), dentro de `RequireRole` del Administrador. Es una **página sin pestañas ni formulario** con la cabecera del portal (menú) y una tarjeta central.

### 4.1 Comportamiento

1. Al montar, lee `code`, `state` y `error` de la dirección y **de inmediato** la limpia con `history.replaceState` (no deja `code` ni `state` en el historial ni en una recarga). Los valores viven solo en memoria del componente.
2. Si no hay `state` en la dirección (alguien abrió la ruta a mano) y no hay nada que procesar, muestra el estado «Sin autorización pendiente» (4.2.8).
3. Envía `POST oauth/retorno` con `{code, state, error}` **una sola vez** (se protege contra el doble montaje de React en desarrollo con una marca en memoria; si se recarga la página, ya no hay `code`, así que se muestra 4.2.8 en vez de repetir).
4. Sin sesión al volver: el portal lleva al inicio de sesión. Tras iniciar, el `code` ya no existe en el navegador, así que se vuelve a Conexión con el aviso «Inicia la conexión con Jira de nuevo» (D210). Texto del aviso: «Tu sesión se cerró durante la conexión. Vuelve a pulsar «Conectar con Jira».»

La página tiene `data-testid="pagina-retorno-oauth"`; el `h1` es «Conexión con Jira» (etiqueta «Portal Administrador»); el estado actual vive en `estado-retorno` con `data-estado`.

### 4.2 Estados

Tarjeta común: `estado-retorno` (`role="status"`, `aria-live="polite"`, `aria-busy` solo en procesando). Cada estado de error usa `ErrorIntegracion` (`error-oauth`, `role="alert"`, con `data-codigo`), recibe el foco y trae una acción principal y una secundaria. El texto de la columna «Mensaje» es la tabla fija (sección 9).

| # | `data-estado` | Cuándo | Título (`h2`) | Mensaje | Acción principal | Acción secundaria |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `procesando` | Mientras corre `oauth/retorno` (hasta ~8 s) | «Conectando con Jira…» | «Estamos validando la autorización con Atlassian. No cierres esta página.» Indicador de espera indeterminado (`.barra-espera`), sin animación con `prefers-reduced-motion`. Sin porcentaje | — (sin botones; no se puede cancelar) | — |
| 2 | `exito` | `resultado: CONECTADA` | «Conectado con Jira» | «Conectado con Jira (OAuth) como <cuenta> en <sitio>.» | Redirección automática a Conexión (4.3) y botón «Ir a Conexión» (`enlace-ir-conexion`, por si la redirección tarda) | — |
| 3 | `elegir-sitio` | `resultado: ELEGIR_SITIO` | — | No se muestra la lista aquí: se redirige a Conexión con el estado «Falta elegir el sitio» (sección 5) | Redirección | — |
| 4 | `consentimiento-rechazado` | `error=access_denied` o `JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO` | «No se conectó nada» | «No aceptaste los permisos en Atlassian. No se conectó nada.» + «El estado anterior de la conexión no cambió.» | «Volver a Conexión» (`enlace-ir-conexion`) | «Intentar de nuevo» (`boton-conectar-jira`) |
| 5 | `estado-invalido` | 400 `JIRA_OAUTH_ESTADO_INVALIDO` | «La autorización no es válida» | «La autorización venció o no es válida. Vuelve a pulsar «Conectar con Jira».» (**no** dice cuál fue la causa) | «Conectar con Jira» (inicia otra vez; `boton-conectar-jira`) | «Volver a Conexión» |
| 6 | `permisos-insuficientes` | `JIRA_OAUTH_PERMISOS_INSUFICIENTES` | «Faltan permisos» | «Faltan permisos en Atlassian: <lista>. Acepta todos los permisos solicitados.» La lista va con los nombres traducidos de 3.2 (por ejemplo «Ver datos de issues»); «No se guardó nada.» | «Intentar de nuevo» | «Volver a Conexión» |
| 7 | `sin-sitio` | `JIRA_OAUTH_SIN_SITIO` | «Sin acceso a Jira» | «Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira.» + «Prueba con otra cuenta de Atlassian o pide acceso al administrador de tu Jira. No se guardó nada.» | «Intentar con otra cuenta» (reinicia el flujo) | «Volver a Conexión» |
| 8 | `sin-autorizacion` | Se abre la ruta sin `state` ni `error`, o se recarga tras procesar | «No hay una conexión en curso» | «Para conectar con Jira, pulsa «Conectar con Jira» en la pestaña Conexión.» | «Ir a Conexión» | — |
| 9 | `canje-fallido` | `JIRA_OAUTH_CANJE_FALLIDO` | «Atlassian no aceptó la autorización» | «Atlassian no aceptó la autorización. Vuelve a intentarlo.» + «Si vuelve a pasar, avisa a quien administra Quality360: la app de Atlassian puede estar mal configurada.» | «Intentar de nuevo» | «Volver a Conexión» |
| 10 | `error-servidor` | Red, 5xx, 504, `JIRA_NO_DISPONIBLE`, `JIRA_TIEMPO_AGOTADO`, `JIRA_LIMITE_DE_TASA`, o 503 `JIRA_OAUTH_NO_CONFIGURADO` | «No pudimos completar la conexión» | «Hubo un problema del servidor. Intenta nuevamente en unos minutos. No se guardó nada.» (`JIRA_OAUTH_NO_CONFIGURADO`: «La conexión automática con Jira no está habilitada en el servidor.») | «Intentar de nuevo» | «Volver a Conexión» |
| 11 | `sin-respuesta` | La petición se cortó (504 o red) sin saber si terminó | «No recibimos respuesta» | «No recibimos respuesta del servidor. La conexión pudo haberse completado: revisa la pestaña Conexión antes de reintentar.» | «Ir a Conexión» | — |

Notas:
- «Sitio sin Jira» de la solicitud es el estado 7.
- Todas las acciones «Intentar de nuevo» **no** reutilizan el `state` anterior: inician una autorización nueva (`oauth/iniciar`) y tienen los estados de botón de 2.3.
- «Volver a Conexión» no depende de la sesión de Atlassian ni de ningún parámetro.
- Si un error trae un código desconocido: «No pudimos completar la conexión con Jira.» + texto recortado del API a 200 caracteres sin HTML, como en E5.

### 4.3 Éxito: volver a la pestaña con aviso

1. La tarjeta `exito` se muestra ~1,5 s con el texto de 4.2 #2 (suficiente para leerlo y para que el lector lo anuncie), luego `navigate("/admin/integraciones", { replace: true })` con un estado de navegación `{ aviso: "oauth-conectado" }`. El usuario puede saltarse la espera con `enlace-ir-conexion`.
2. `replace: true` para que «Atrás» no regrese a la página de retorno (ya procesada).
3. En Conexión se muestra `aviso-oauth-conectado` (`role="status"`, cerrable con botón «Cerrar aviso», `boton-cerrar-aviso`): «Conectado con Jira (OAuth) como <cuenta> en <sitio>. Ahora elige el proyecto y el destino de las HDU nuevas.» El foco va al `h1` de la página (comportamiento existente) y el aviso se anuncia; **no se roba el foco**.
4. Si ya había proyecto y destino guardados, el aviso termina en «Pulsa «Probar y guardar» para confirmar.»
5. El mismo patrón sirve para los demás resultados: cada error de 4.2 tiene su botón de salida a Conexión; para el rechazo del consentimiento (#4) la redirección **no** es automática (se queda en la página con la acción), porque el Administrador decide si reintenta.

### 4.4 Wireframes de la página de retorno

1280 px, procesando:

```
 PORTAL ADMINISTRADOR
 Conexión con Jira
 ┌ estado-retorno  data-estado="procesando" ─────────────────────────────┐
 │ Conectando con Jira…                                                   │
 │ ▓▓▓▓▓░░░░░░░░░░░░░ Estamos validando la autorización con Atlassian.    │
 │ No cierres esta página.                                                │
 └────────────────────────────────────────────────────────────────────────┘
```

375 px, error de permisos:

```
┌────────────────────────────┐
│ Conexión con Jira          │
│ ┌ ✕ Faltan permisos ─────┐ │
│ │ Faltan permisos en     │ │
│ │ Atlassian: Ver datos   │ │
│ │ de issues. Acepta      │ │
│ │ todos los permisos     │ │
│ │ solicitados.           │ │
│ │ No se guardó nada.     │ │
│ │ [Intentar de nuevo]    │ │
│ │ [Volver a Conexión]    │ │
│ └────────────────────────┘ │
└────────────────────────────┘
```

---

## 5. Selección de sitio (varios sitios)

Se muestra **dentro de la pestaña Conexión**, en la tarjeta de estado «Falta elegir el sitio» (la página de retorno redirige allí, 4.2 #3), porque el estado `PENDIENTE_SITIO` persiste en el servidor y así sobrevive a una recarga (E5-F08 #4: «Mientras no elige, el estado es «Falta elegir el sitio»»).

```
 ┌ Elige el sitio de Jira ────────────────────────────────────────────────┐   (lista-sitios)
 │ Tu cuenta de Atlassian tiene acceso a más de un sitio de Jira.         │
 │ Elige cuál usará Quality360.                                           │
 │  (●) empresa              https://empresa.atlassian.net   Actual        │
 │  ( ) laboratorio          https://laboratorio.atlassian.net            │
 │  ( ) pruebas-qa           https://pruebas-qa.atlassian.net             │
 │                                       [ Usar este sitio ]               │   boton-elegir-sitio
 └────────────────────────────────────────────────────────────────────────┘
```

| Elemento | testid | Detalle |
| --- | --- | --- |
| Grupo | `lista-sitios` | `fieldset` con `legend` «Elige el sitio de Jira» y `aria-describedby` hacia la línea de ayuda; radios nativos |
| Opción | `sitio-opcion-<id>` | Cada una es un `label` con el radio, el **nombre** en negrita y la **URL** en texto secundario en la línea siguiente. Se asocia nombre y URL con `aria-describedby` de modo que el lector lea «empresa, https://empresa.atlassian.net» |
| Insignia | `sitio-actual` | «Actual» (texto, no solo color) en el sitio ya configurado |
| Confirmar | `boton-elegir-sitio` | «Usar este sitio» |
| Error | `error-sitio` | `role="alert"` |

Reglas:
- **Preselección:** el sitio ya configurado si coincide; si no, **ninguna** opción preseleccionada y «Usar este sitio» con `aria-disabled="true"` hasta elegir, con motivo «Elige un sitio para continuar.» (no se adivina un sitio al azar). Con una sola coincidencia no hay lista (D212).
- **Teclado:** Tab entra al grupo en la opción marcada (o la primera); flechas mueven y marcan; Tab sale al botón; Enter sobre el botón confirma. El foco al aparecer la lista va a la `legend`/primer radio del grupo (`tabIndex=-1` en el contenedor) y se anuncia «Tu cuenta tiene acceso a más de un sitio de Jira. Elige cuál usará Quality360.»
- **Confirmar:** `POST oauth/sitio` con `{sitioId}`. En curso: «Guardando…» y `aria-disabled`. Éxito: la tarjeta pasa a «Conectado con Jira (OAuth) como <cuenta> en <sitio>», `aviso-oauth-conectado` y el foco va al título de la tarjeta.
- **Errores:** 400 `JIRA_OAUTH_SITIO_NO_VALIDO`: «El sitio elegido no es válido.» + «Vuelve a pulsar «Conectar con Jira».» y se limpia la lista. 409 `JIRA_OAUTH_SIN_CONEXION`: «No hay una conexión pendiente.» y se recarga. Red o 5xx: «No fue posible guardar el sitio. Intenta nuevamente.» (la lista se conserva).
- **Cancelar / salir:** no hay botón «Cancelar» propio; «Desconectar» de la tarjeta descarta la conexión pendiente. Si el Administrador se va, el estado «Falta elegir el sitio» persiste hasta que elija o desconecte.
- **Lista larga:** más de 8 sitios, la lista tiene `max-height` con scroll interno (`tabIndex=0`, `aria-label` «Lista de sitios»); a 375 px cada opción ocupa el ancho completo con objetivo táctil de 44 px y la URL envuelve (`overflow-wrap: anywhere`).
- Las URL y nombres se escapan como texto (nunca HTML) y solo se muestran, no son enlaces (D212: no se llama a esa URL desde el portal).

---

## 6. Cambio de método

Regla de oro: **nunca queda el sistema sin una credencial válida por un paso intermedio.** Elegir una opción en el selector no cambia el método activo; solo lo cambia una prueba exitosa (D112).

### 6.1 De API token a OAuth

Estado de partida: método activo API token (conectado).

1. El Administrador elige `opcion-oauth`. Aparece `aviso-cambio-a-oauth` (`role="note"`, siempre visible mientras OAuth no esté lista): «Tu conexión con API token sigue activa. No se cambiará hasta que la conexión con Jira funcione.»
2. Pulsa «Conectar con Jira». Se va a Atlassian y vuelve (sección 4). **La credencial OAuth queda guardada como pendiente**, pero **el método activo sigue siendo el API token** y el chip sigue diciendo «Conectado con API token».
3. En Conexión aparece la tarjeta de OAuth recién conectada con la etiqueta «Lista, sin activar» y el texto: «La conexión con Jira funciona, pero todavía no está activa. Pulsa «Probar y guardar» para empezar a usarla; hasta entonces se sigue usando el API token.»
4. «Probar y guardar» con `metodo: OAUTH`. Si pasa: el chip cambia a «Conectado con Jira (OAuth) como <cuenta> en <sitio>», y `mensaje-conexion-ok`: «Conexión exitosa con Jira como <cuenta>. Ahora Quality360 usa esta conexión en lugar del API token.»
5. Si falla la prueba o se cancela el consentimiento: el API token sigue activo y el chip no cambia; `error-conexion` incluye «No se guardó nada: se conserva la configuración anterior.» (D112).
6. Cuando el método activo pasa a OAuth, el API token guardado **deja de usarse**; el portal no lo menciona más (el servidor decide si lo borra; el texto de la línea «API token: Configurado» desaparece de la tarjeta).

> Nota de coordinación: el backlog dice que el API token sigue activo «hasta que la conexión OAuth esté lista y «Probar y guardar» pase». Se requiere que `GET configuracion` distinga «OAuth conectada pero no activa» (por ejemplo `oauth.estado` con `CONECTADA` y `metodo: API_TOKEN`). Está en 12.2.

### 6.2 De OAuth a API token

Estado de partida: método activo OAuth.

1. El Administrador elige `opcion-api-token`. Aparece `aviso-cambio-a-api-token` (`role="alert"` no, `role="note"`; es advertencia visible, no una alerta urgente) antes del formulario:
   «Si guardas la conexión con API token, se borrarán las credenciales de la conexión con Jira (OAuth) guardadas en Quality360. Mientras no guardes, la conexión con Jira (OAuth) sigue activa.»
2. El formulario es el de E5: `campo-token` **vacío** (nunca se rellena), con «Ingresa el API token».
3. Al pulsar «Probar y guardar» con `metodo: API_TOKEN`, **antes de enviar** se abre `DialogoConfirmacion` (`confirmar-cambio-a-api-token`):

```
 ┌ Cambiar a API token ───────────────────────────────────────────────┐
 │ Si la prueba funciona, se borrarán las credenciales de la conexión   │
 │ con Jira (OAuth) y dejará de usarse. Si la prueba falla, no cambia   │
 │ nada. Para volver a OAuth tendrás que conectar con Jira otra vez.    │
 │            [ Cancelar ]   [ Probar y cambiar ]                       │
 └──────────────────────────────────────────────────────────────────────┘
```
   Botones `boton-cancelar-cambio`, `boton-confirmar-cambio`. Mismas reglas del diálogo de 3.4 (foco inicial en Cancelar, Escape cancela, foco de vuelta al botón que lo abrió).
4. Éxito: «Conexión exitosa con Jira como <cuenta>. Configuración guardada. Se borraron las credenciales de la conexión con Jira (OAuth).» y el chip pasa a «Conectado con API token».
5. Fallo: `error-conexion` con «No se guardó nada: se conserva la configuración anterior.»; **las credenciales OAuth no se borran** (D112). El campo `campo-token` se vacía.
6. «Probar sin guardar» no cambia ni borra nada y **no** abre el diálogo.

### 6.3 Cambiar de método sin guardar

Si el Administrador eligió el método contrario y navega a otra pestaña con campos modificados, no se pide confirmación (no hay nada guardado); al volver, el selector parte del método activo. Esto mantiene el criterio de E5 de no pedir confirmaciones donde no hay destrucción.

---

## 7. Consultar Jira: reconexión necesaria

Aplica a la pestaña **Sincronizar** (E5-F02, «Consultar Jira» y «Sincronizar con Jira») y, con el mismo componente, a cualquier bloque `ErrorIntegracion` de integraciones.

`error-sincronizacion` (cert., `role="alert"`, `tabIndex=-1`, foco) con `data-codigo="JIRA_RECONEXION_NECESARIA"`:

```
 ┌ error-sincronizacion  data-codigo="JIRA_RECONEXION_NECESARIA" ─────────────────────┐
 │ ⚠ No se pudo consultar Jira                                                         │
 │ La conexión con Jira venció. Vuelve a conectar con Jira.                            │
 │ No se creó ni se modificó ninguna HDU. Tu consulta abierta se conserva.             │
 │ Qué puedes hacer                                                                    │
 │  · Ir a Conexión (enlace-ir-conexion) → /admin/integraciones                         │
 │  · Importar un archivo (enlace-importar-archivo)                                     │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

- Título: «No se pudo consultar Jira» (consultar) o «No se pudo sincronizar» (sincronizar; cert.). El glifo es `⚠` (no `✕`) porque tiene remedio directo; el borde izquierdo usa `res-incompleta`.
- El enlace «Ir a Conexión» es un `<Link>` (no un `button`) y es la acción principal (primer enlace de «Qué puedes hacer»). Ya existe `enlace-ir-conexion` en E5 (cert.).
- Al volver a Conexión desde este enlace, la tarjeta ya muestra «Reconexión necesaria» y el foco va al `h1` (comportamiento existente); el botón «Reconectar» está a un Tab de distancia por orden de DOM (tarjeta de estado antes que el selector).
- La **consulta abierta se conserva**: los filtros y la vista previa que el usuario ya tenía no se pierden (E5-F02 #4).
- `estado-vacio-jira` (cert.): sigue existiendo para «sin configuración» y no cambia.
- Para el **QE** y el **Auditor** (que ven el historial en solo lectura): en `error-ejecucion` se muestra el texto, **sin enlace**, y se agrega «Avisa a un Administrador para que vuelva a conectar con Jira.» (no tienen la pantalla Conexión; E5 sección 10).
- El Historial registra la ejecución con el código y el mismo mensaje (tabla de la sección 9).

---

## 8. Accesibilidad y móvil

### 8.1 Foco

| Momento | Dónde va el foco |
| --- | --- |
| Volver de Atlassian (página de retorno) | Al `h1` «Conexión con Jira» (`tabIndex=-1`) al montar; al cambiar de «procesando» a un resultado, al título del resultado (`h2`, `tabIndex=-1`) o a `error-oauth` si es error |
| Tras la redirección con éxito a Conexión | Al `h1` de la página (existente); el aviso se anuncia por `role="status"` sin robar el foco |
| Lista de sitios al aparecer | Al contenedor del grupo (anuncia la leyenda) |
| Abrir diálogo | A «Cancelar»; el foco queda atrapado; Escape cancela |
| Cerrar diálogo | Al botón que lo abrió; si ya no existe, al título de la tarjeta |
| Error de la prueba | A `error-conexion` (`tabIndex=-1`) |
| Cambio de estado de la tarjeta por una acción propia | Al título de la tarjeta, solo si el control con foco desapareció |

### 8.2 Anuncios (`aria-live`)

- `role="status"` (educado): «Abriendo Atlassian…», «Conectando con Jira…», éxito de la conexión, sitio guardado, desconexión, resultado de «Probar conexión», `aviso-oauth-conectado`.
- `role="alert"` (asertivo): `error-oauth`, `error-conexion`, `error-sitio`, `error-desconexion`, `aviso-reconexion`, `error-sincronizacion`.
- Una sola región de estado a la vez por pantalla; **no hay `aria-live` por pulsación de tecla**. Los cambios de estado largos (procesando → éxito) usan la misma región para no duplicar lecturas.
- `aviso-cambio-a-api-token` y `aviso-cambio-a-oauth` son `role="note"`: se leen al llegar con el foco, no se interrumpe.

### 8.3 Teclado

- Orden de tabulación de la pestaña: pestañas → tarjeta de estado (Probar conexión, Desconectar) → selector de método (flechas dentro) → panel del método (botón o formulario) → proyecto y destino → Probar sin guardar / Probar y guardar → cambios de configuración.
- `boton-conectar-jira` con `aria-disabled` **sí** recibe foco; Enter y Espacio no hacen nada.
- Los radios (método y sitio) se operan con flechas; Espacio marca.
- El diálogo: Tab y Shift+Tab giran dentro; Escape cancela; Enter sobre el botón enfocado lo activa.
- El indicador de foco es el de E5 (anillo de 2 px con `--q360-color-foco`, ≥ 3:1 sobre cualquier fondo de la tarjeta).

### 8.4 Contraste y no depender del color

- Texto normal ≥ 4,5:1 y componentes/bordes ≥ 3:1 con los tokens existentes. No se añaden colores.
- Botón `aria-disabled` y motivo: el texto deshabilitado **debe seguir siendo legible** (≥ 4,5:1), por eso no se usa opacidad baja sobre el texto: se cambia el fondo a neutro y el borde a punteado. El motivo (`aviso-oauth-no-disponible`) va en texto normal, no atenuado.
- Estados siempre con glifo (`✓ ⚠ ◐ ○ ✕`) y palabra; las insignias «Recomendado», «Actual» y «Método activo» son texto.
- `prefers-reduced-motion`: sin giro del indicador, sin barra animada; queda el texto.

### 8.5 Lectores de pantalla

- Chip: `<span>` con el texto completo; el glifo es `aria-hidden` y la palabra es la que se lee (no se lee «marca de verificación»).
- `<time datetime>` en todas las fechas, en hora de Chile.
- Los enlaces externos dicen «(se abre en una pestaña nueva)» en texto `sr-only`.
- Los scopes se leen con su nombre amigable; el código técnico queda en `title`/`sr-only` secundario.
- `lista-sitios`: cada radio se anuncia «<nombre>, <url>, opción 2 de 3».

### 8.6 Móvil (375 px)

- Una columna; botones a ancho completo y 44 px; selector de método apilado.
- Etiquetas largas del chip y correos/URL envuelven (`overflow-wrap: anywhere`); **sin desbordamiento horizontal**.
- Los diálogos ocupan el ancho con márgenes de 16 px y los botones se apilan con «Cancelar» primero en el DOM.
- Pestañas con scroll horizontal y la activa visible (cert.).
- La página de retorno es una sola tarjeta centrada; los dos botones se apilan.
- Pruebas de axe sobre: pestaña Conexión (todos los estados), página de retorno (11 estados) y los dos diálogos, sin hallazgos serios (E5-F08 #13).

---

## 9. Microcopy final (tabla única)

Todos los textos son fijos del portal. Los códigos del servidor se traducen por esta tabla (D105); ningún texto de Atlassian ni de Jira llega a la interfaz.

### 9.1 Etiquetas y botones

| Elemento | Texto |
| --- | --- |
| Título de la tarjeta | «Estado de la conexión» |
| Leyenda del selector | «Método de conexión» |
| Opción OAuth | «Conectar con Jira» · insignia «Recomendado» |
| Opción API token | «Conectar con API token» |
| Botón principal | «Conectar con Jira» |
| Botón en curso | «Conectando…» (retorno) / «Abriendo Atlassian…» (anuncio al iniciar) |
| Botón con conexión previa o por vencer | «Reconectar» |
| Chip OAuth | «Conectado con Jira (OAuth) como <cuenta> en <sitio>» |
| Chip reconexión | «Reconexión necesaria» |
| Chip API token | «Conectado con API token» |
| Chip sin conexión | «Sin conectar» |
| Chip pendiente de sitio | «Falta elegir el sitio» |
| Chip lista, sin activar | «Lista, sin activar» |
| Acciones de tarjeta | «Probar conexión» · «Desconectar» |
| Sitio | «Usar este sitio» |
| Etiquetas de datos | «Cuenta» · «Sitio» · «Permisos concedidos» · «Conectado el» · «Renovada el» · «Última prueba» |
| Permisos (traducidos) | «Solo lectura» · «Ver datos de issues» · «Ver perfil del usuario» · «Mantener la conexión» |
| Ayuda de revocación | «Cómo quitar el permiso en Atlassian» |
| Cerrar aviso | «Cerrar aviso» |

### 9.2 Mensajes

| Contexto | Texto |
| --- | --- |
| Panel OAuth | «Se abrirá Atlassian para que inicies sesión y aceptes permisos de solo lectura. Quality360 nunca ve tu contraseña ni escribe en Jira.» |
| Permisos pedidos | «Permisos que se piden: ver datos de issues, ver el perfil del usuario y mantener la conexión.» |
| OAuth no disponible | «La conexión automática aún no está habilitada en el servidor. Usa la conexión con API token o pide a quien despliega que cargue las credenciales de la app de Atlassian.» |
| Renovación | «La conexión se renueva sola. Solo tendrás que reconectar si revocas el permiso en Atlassian o si pasan muchos días sin usarla.» |
| Sin renovar aún | «Aún no se ha renovado (se renueva sola antes de que venza)» |
| Reconexión necesaria | «La conexión con Jira venció. Vuelve a conectar con Jira.» + «Mientras tanto no se puede consultar ni sincronizar. Lo que ya está en Quality360 no se modifica.» |
| Sin conectar | «Aún no hay una conexión con Jira. Elige un método para empezar.» |
| Desconexión confirmación | «Se borrarán las credenciales guardadas. Para quitar el permiso en Atlassian, revoca la app desde tu cuenta» |
| Desconexión hecha | «Se desconectó de Jira. Las credenciales guardadas se borraron.» |
| Conexión hecha | «Conectado con Jira (OAuth) como <cuenta> en <sitio>. Ahora elige el proyecto y el destino de las HDU nuevas.» |
| Sesión cerrada | «Tu sesión se cerró durante la conexión. Vuelve a pulsar «Conectar con Jira».» |
| Cambio a OAuth | «Tu conexión con API token sigue activa. No se cambiará hasta que la conexión con Jira funcione.» |
| OAuth lista | «La conexión con Jira funciona, pero todavía no está activa. Pulsa «Probar y guardar» para empezar a usarla; hasta entonces se sigue usando el API token.» |
| Activación | «Conexión exitosa con Jira como <cuenta>. Ahora Quality360 usa esta conexión en lugar del API token.» |
| Cambio a API token | «Si guardas la conexión con API token, se borrarán las credenciales de la conexión con Jira (OAuth) guardadas en Quality360. Mientras no guardes, la conexión con Jira (OAuth) sigue activa.» |
| Confirmación del cambio | «Si la prueba funciona, se borrarán las credenciales de la conexión con Jira (OAuth) y dejará de usarse. Si la prueba falla, no cambia nada. Para volver a OAuth tendrás que conectar con Jira otra vez.» |
| Cambio hecho | «Conexión exitosa con Jira como <cuenta>. Configuración guardada. Se borraron las credenciales de la conexión con Jira (OAuth).» |
| Fallo del cambio | «No se guardó nada: se conserva la configuración anterior.» (cert.) |
| Sitio | «Tu cuenta de Atlassian tiene acceso a más de un sitio de Jira. Elige cuál usará Quality360.» · «Elige un sitio para continuar.» |
| Ayuda en tarjeta de API token | «¿Prefieres no copiar tokens? Conecta con Jira.» |

### 9.3 Códigos de error (sección 4.1 del backlog)

| Código | Mensaje | Acción |
| --- | --- | --- |
| `JIRA_OAUTH_NO_CONFIGURADO` | «La conexión automática con Jira no está habilitada en el servidor.» | «Usar API token» |
| `JIRA_OAUTH_ESTADO_INVALIDO` | «La autorización venció o no es válida. Vuelve a pulsar «Conectar con Jira».» | «Conectar con Jira» |
| `JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO` | «No aceptaste los permisos en Atlassian. No se conectó nada.» | «Intentar de nuevo» |
| `JIRA_OAUTH_CANJE_FALLIDO` | «Atlassian no aceptó la autorización. Vuelve a intentarlo.» | «Intentar de nuevo» |
| `JIRA_OAUTH_SIN_SITIO` | «Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira.» | «Intentar con otra cuenta» |
| `JIRA_OAUTH_PERMISOS_INSUFICIENTES` | «Faltan permisos en Atlassian: <lista>. Acepta todos los permisos solicitados.» | «Intentar de nuevo» |
| `JIRA_RECONEXION_NECESARIA` | «La conexión con Jira venció. Vuelve a conectar con Jira.» | «Ir a Conexión» / «Reconectar» |
| `JIRA_OAUTH_SITIO_NO_VALIDO` | «El sitio elegido no es válido.» | «Conectar con Jira» |
| `JIRA_OAUTH_SIN_CONEXION` | «No hay una conexión pendiente.» | «Conectar con Jira» |
| `JIRA_SIN_PERMISO` (con OAuth) | «La cuenta de Jira conectada no tiene permiso para leer este proyecto.» | «Revisa el proyecto o conecta otra cuenta» |
| `JIRA_PROYECTO_NO_ENCONTRADO` (con OAuth) | «No encontramos el proyecto. Revisa la clave; también puede ser que la cuenta de Jira conectada no tenga permiso para verlo.» | «Revisa la clave del proyecto» |

---

## 10. `data-testid`

Los del backlog (sección 10) **se mantienen con esos nombres**. Adiciones propias del diseño marcadas con +.

| Zona | testid |
| --- | --- |
| Tarjeta de estado | `tarjeta-estado-conexion`+, `chip-conexion` (`data-estado`), `estado-oauth` (`data-estado`), `cuenta-oauth`, `sitio-oauth`, `permisos-oauth`+, `fecha-renovacion`+, `texto-ultima-prueba` (cert.), `token-estado` (cert.), `anuncio-conexion`+ |
| Acciones de tarjeta | `boton-probar-conexion`+, `boton-desconectar-jira`, `confirmar-desconexion` (diálogo), `boton-cancelar-desconexion`+, `boton-confirmar-desconexion`+, `mensaje-desconexion-ok`+, `error-desconexion`+ |
| Reconexión | `aviso-reconexion`, `boton-reconectar-jira` |
| Selector y panel | `selector-metodo`, `opcion-oauth`, `opcion-api-token`, `boton-conectar-jira` (`data-estado`), `aviso-oauth-no-disponible`, `enlace-usar-api-token`+, `enlace-ayuda-oauth`+, `error-oauth` (`data-codigo`) |
| Cambio de método | `aviso-cambio-a-oauth`+, `aviso-cambio-a-api-token`+, `confirmar-cambio-a-api-token`+, `boton-cancelar-cambio`+, `boton-confirmar-cambio`+ |
| Sitios | `lista-sitios`, `sitio-opcion-<id>`+, `sitio-actual`+, `boton-elegir-sitio`, `error-sitio`+ |
| Aviso de éxito | `aviso-oauth-conectado`+, `boton-cerrar-aviso`+ |
| Retorno | `pagina-retorno-oauth`, `estado-retorno` (`data-estado`: `procesando`, `exito`, `consentimiento-rechazado`, `estado-invalido`, `permisos-insuficientes`, `sin-sitio`, `sin-autorizacion`, `canje-fallido`, `error-servidor`, `sin-respuesta`), `enlace-ir-conexion` (cert.) |
| Ayuda | `ayuda-revocar-jira`, `panel-guia-oauth`+, `boton-guia-oauth`+, `guia-oauth-paso-<n>`+ |
| Consultar Jira | `error-sincronizacion` (`data-codigo="JIRA_RECONEXION_NECESARIA"`, cert.), `enlace-ir-conexion` (cert.), `enlace-importar-archivo` (cert.) |

Convención (E5): kebab-case, un testid por elemento accionable o que aporte un estado; `data-estado`/`data-codigo` en lugar de testids por variante.

---

## 11. Guía breve en el portal para el Administrador

### 11.1 Dónde vive

- Enlace «¿Cómo se configura?» (`boton-guia-oauth`) junto al botón «Conectar con Jira» y dentro de `aviso-oauth-no-disponible`. Abre un **panel expandible** (`<details>` o un panel con `aria-expanded`) bajo el botón, `panel-guia-oauth`, sin salir de la pestaña ni abrir diálogo. En 375 px ocupa el ancho; los pasos son una lista ordenada.
- **No es un manual de registro.** El Administrador no registra la app: lo hace quien administra Quality360. El panel debe aclarar eso primero para evitar que el Administrador intente registrar algo.

### 11.2 Contenido del panel (en Spanish, base: sección 8 del backlog)

**Título:** «¿Cómo funciona la conexión con Jira?»

1. **Quién registra la app.** «La aplicación de Quality360 en Atlassian la registra **una sola vez** quien administra Quality360, no tú. Tú no tienes que crear ninguna app ni copiar ningún token.»
2. **Qué haces tú.** «Pulsa «Conectar con Jira», inicia sesión en Atlassian y acepta los permisos de solo lectura. Es solo la primera vez.»
3. **Qué permisos se piden.** «Solo lectura: ver datos de issues, ver el perfil del usuario y mantener la conexión. Quality360 nunca escribe en Jira.»
4. **Qué verás en Atlassian.** «Puede aparecer un aviso de que Atlassian no revisó la app. Es normal mientras la app no esté publicada en su tienda.» (el texto pertenece a Atlassian, E5-F08 reglas).
5. **Si el botón aparece deshabilitado.** «Significa que quien administra Quality360 aún no cargó las credenciales de la app en el servidor. Avísale, o usa la conexión con API token mientras tanto.»
6. **Si dice «Reconexión necesaria».** «Revocaste el permiso en Atlassian o la conexión venció. Pulsa «Reconectar» y acepta de nuevo.»
7. **Cómo quitar el permiso.** «Desconectar borra lo guardado en Quality360. Para quitar el permiso en tu cuenta de Atlassian: id.atlassian.com, Perfil y visibilidad, Apps conectadas, busca Quality360 y revoca el acceso.»

**Pie del panel, para quien administra Quality360:** «¿Eres quien despliega Quality360? Los pasos para registrar la app y cargar sus variables están en la guía de despliegue del proyecto: `docs/backlog/e5-oauth-jira.md`, sección 8. No los pegues en el chat ni en un documento: el Client secret no debe salir de tu gestor de contraseñas ni de la configuración del servidor.»

### 11.3 Reglas del panel

- **El portal no muestra** nombres de variables de entorno, el Client ID, el Client secret ni los valores (E5-F08 #7 y D216). El pie solo menciona el documento por su ruta, no su contenido.
- El panel es texto estático (traducible), sin llamadas al servidor. Siempre está disponible, también con OAuth conectada.
- Un solo panel abierto a la vez; Escape cierra el panel si tiene el foco; el botón conserva `aria-expanded` y `aria-controls`.
- `guia-oauth-paso-<n>` identifica cada paso para las pruebas.

---

## 12. Brechas, supuestos y preguntas para el arquitecto

12.1 **Desconectar con API token.** D217 define «Desconectar» solo para OAuth. Este diseño lo omite en el método API token (la credencial se reemplaza escribiendo otra). Si se quiere un «Desconectar» también ahí, falta la HDU y el endpoint.

12.2 **OAuth lista pero no activa (6.1).** Para mantener el API token activo mientras OAuth se conecta, `GET configuracion` debe informar a la vez `metodo` (activo) y `oauth.estado`. Hoy D215 solo define los tres estados. Hace falta confirmar que el servidor conserva ambas credenciales hasta el «Probar y guardar» con `metodo: OAUTH`.

12.3 **Botón «Reconectar» vs «Volver a conectar».** E5-F08 #8 usa «Volver a conectar»; este diseño usa «Reconectar» por pedido. Hay que unificar el texto en el backlog y en los casos de prueba.

12.4 **«Probar conexión» vs «Probar sin guardar».** El portal actual solo tiene «Probar sin guardar» y «Probar y guardar» en el formulario. Este diseño agrega «Probar conexión» en la tarjeta de estado (comparte la ruta `probar`). Hay que confirmar que `probar` acepta `metodo: OAUTH` sin campos de proyecto.

12.5 **Ruta de retorno.** Provisional (`<PORTAL>/admin/integraciones/jira/oauth/retorno`). Si el arquitecto la cambia, solo cambia el texto de la ruta y la `redirect_uri` registrada en Atlassian; el diseño no depende de ella.

12.6 **Texto «muchos días» (3.2 A).** Es deliberadamente vago; si el arquitecto confirma el plazo de inactividad de Atlassian para la renovación, puede reemplazarse.

12.7 **Sitio que no coincide con el configurado.** Si el sitio devuelto por Atlassian difiere del `sitio_url` de la conexión API token, el aviso al activar OAuth debería advertirlo («El sitio cambió de X a Y»). No está en el backlog; se propone como mejora (no bloquea).

12.8 **Texto «Lo ya importado no se borra»** en el diálogo de desconexión: confirmar con el arquitecto antes de incluirlo.

---

## 13. Trazabilidad con el backlog

| Criterio | Sección de este diseño |
| --- | --- |
| E5-F08 #1 Conexión exitosa | 2.3, 4.2 #2, 4.3 |
| E5-F08 #2 Consentimiento cancelado | 4.2 #4 |
| E5-F08 #3 `state` inválido | 4.2 #5 |
| E5-F08 #4 Varios sitios | 5 |
| E5-F08 #5 Cuenta sin Jira | 4.2 #7 |
| E5-F08 #6 Permisos insuficientes | 4.2 #6 |
| E5-F08 #7 Servidor sin credenciales | 2.3, 2.4 |
| E5-F08 #8 Reconexión necesaria | 3.2 B, 7 |
| E5-F08 #9 Cambio de método | 6 |
| E5-F08 #10 Probar y guardar con OAuth | 3.3, 6.1 |
| E5-F08 #11 Desconectar | 3.4, 3.6 |
| E5-F08 #12 Solo Administrador | 1 (principio 7), 4 |
| E5-F08 #13 Accesibilidad y móvil | 8 |
| E5-F01 #4 y #5 (agregados) | 2.2, 2.5, 3.2 |
| E5-F02 #4 (agregado) | 7 |
| D209 a D218 | 1 a 9 |
| Guía (sección 8 del backlog) | 11 |
