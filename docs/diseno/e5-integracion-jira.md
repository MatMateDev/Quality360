# Diseño E5 · Integración con Jira Cloud

Fecha: 2026-10-29. Insumos: `docs/backlog/e5-integracion-jira.md` (E5-F01..F04, D93–D112, secciones 4, 5, 7, 9 y 11) y el sistema visual de E7 y E4 (`docs/diseno/e7-bandejas-por-rol.md`, `docs/diseno/e4-impedimentos-y-riesgos.md`, `tokens.css`, `global.css`, `bandejas.css`, `impedimentos.css`, `components/bandeja/*`, `BloqueEstado`, `TarjetaMetrica`, `DialogoConfirmacion`, `AvisoSoloLectura`, `TablaBandeja`, `BarraFiltros`, `PestanasNav`, `HduDetailPage`). Este documento define **cómo se ve y se comporta** E5; no contiene código. Dueño de construcción: `q360-frontend`.

Notación: «cert.» = elemento certificado, **no se modifica** (texto, `data-testid`, ruta, orden). Lo que no se menciona aquí se resuelve con lo existente.

Decisiones del usuario que gobiernan el diseño: el **Administrador** configura, sincroniza e importa; el token se cifra y **nunca vuelve a mostrarse** («Configurado · termina en XXXX»); el **QE y el Auditor** ven el historial en solo lectura; **Líder y Analista** no tienen acceso.

---

## 1. Principios

1. **Reutilizar, no inventar.** Pestañas por ruta (`PestanasNav`), tarjetas de contador (`TarjetaMetrica`), tablas (`TablaBandeja`), filtros en la URL (`BarraFiltros`, `useFiltrosUrl`), estados (`BloqueDatos`/`BloqueEstado`), aviso de solo lectura (`AvisoSoloLectura`). Los colores de E5 son **alias** de los tokens de E4: no se agrega ningún valor hexadecimal nuevo.
2. **Texto + glifo + color.** Resultado de ejecución, resultado de fila y estado de conexión siempre llevan palabra y una forma distinta (sección 11.2). El color nunca es el único canal.
3. **Un solo componente de historial para tres anfitriones.** `VistaHistorial` se monta en la pestaña «Historial» del Administrador, en `/qe/integraciones` y en la pestaña «Integraciones» del Auditor. Lo que cambia es una propiedad (`soloLectura`); en modo solo lectura **los botones de escritura no existen** (D39, D107).
4. **El servidor decide, el portal explica.** Los mensajes de error del portal salen de una **tabla local por código** (sección 10); el texto que llegue del API solo se usa para un código desconocido, y se recorta. Así ningún mensaje del servicio ni de Jira puede filtrar el token por la interfaz (D105).
5. **El token no vive en el cliente.** El campo nunca se rellena, no se guarda en `localStorage`/`sessionStorage`/URL, no tiene botón «mostrar», `autocomplete="new-password"` y se **vacía tras cada intento** (éxito o error).
6. **Nada de progreso inventado.** La operación es una sola petición de hasta ~10 s sin progreso parcial: la espera es **indeterminada** y no se puede cancelar; se dice así.
7. **Todo lo que escribe es del Administrador.** Los Auditor/QE no ven `<form>` ni `button[type=submit]` en E5 (E7-F06-T07). Los filtros de historial usan `BarraFiltros` (sin `<form>`).
8. **Estado en la URL** en el historial (filtros, orden, página y ejecución abierta), igual que E7/E4.

---

## 2. Rutas, menú y acceso por rol

### 2.1 Rutas

| Ruta | Quién | Contenido |
| --- | --- | --- |
| `/admin/integraciones` (índice) | Administrador | Pestaña **Conexión** (es la pestaña por defecto; **sin redirección**, porque E5-F01-T01 abre esta ruta y espera el formulario) |
| `/admin/integraciones/sincronizar` | Administrador | Pestaña Sincronizar |
| `/admin/integraciones/importar` | Administrador | Pestaña Importar archivo |
| `/admin/integraciones/historial` | Administrador | Pestaña Historial (+ `?ejecucion=<id>` = detalle) |
| `/qe/integraciones` | QE | Historial de solo lectura (+ `?ejecucion=<id>`) |
| `/auditor/integraciones` | Auditor | 6.ª pestaña del portal, mismo historial de solo lectura |
| `/admin/integraciones/*`, `/qe/integraciones`, `/auditor/integraciones` | Líder QA, Analista QA (y el rol equivocado en cada una) | `AccesoDenegado` con «Ir a mi bandeja» vía `RequireRole` (D41) |

El **detalle de una ejecución no tiene ruta propia**: es el mismo componente con `?ejecucion=<id>`, que reemplaza a la lista (con «← Volver al historial» que conserva filtros). Así no se crean tres rutas más ni se rompe el botón «Atrás». Un id inexistente o ajeno muestra el mismo mensaje (sección 9.4).

### 2.2 Menú (`Layout`, `nav aria-label="Portal"`)

| Rol | Menú exacto |
| --- | --- |
| Administrador | `Bandeja, Usuarios, Supervisión, Integraciones, Perfil` (`/admin/integraciones`, **sin** `end`: queda `aria-current` en las cuatro pestañas) |
| QE | `Bandeja, Equipo, Historias supervisadas, Impedimentos, Integraciones, Perfil` (`/qe/integraciones`) |
| Auditor | `Bandeja, Perfil` (cert.). La entrada nueva es la **pestaña** «Integraciones» |
| Líder QA, Analista QA | Sin cambios |

A 375 px `nav-portal` ya hace wrap (el Administrador pasa a 5 ítems, el QE a 6: dos líneas, objetivos de 44 px).

### 2.3 Pestañas

- **Administrador** (`PestanasNav`, `aria-label="Secciones de integraciones"`): `Conexión` (`pestana-conexion`) · `Sincronizar` (`pestana-sincronizar`) · `Importar archivo` (`pestana-importar`) · `Historial` (`pestana-historial`). Los nombres son los del backlog.
- **Auditor** (`PestanasAuditor`): se agrega la 6.ª, **a la derecha** de «Impedimentos»: `{ id: "integraciones", a: "/auditor/integraciones", texto: "Integraciones", testId: "pestana-integraciones" }`. El orden de las cinco existentes no cambia. A 375 px las pestañas hacen scroll horizontal y la activa queda visible (patrón E4).
- **QE**: sin pestañas (una sola vista).

---

## 3. Pestaña «Conexión» (E5-F01)

### 3.1 Cabecera de la página del Administrador

`EncabezadoBandeja`: etiqueta «Portal Administrador», `h1` «Integraciones», descripción «Conecta Quality360 con Jira Cloud para traer historias de usuario, o impórtalas desde un archivo.». Debajo, las pestañas. El foco va al `h1` al entrar (comportamiento existente).

### 3.2 Wireframe 1280

```
 PORTAL ADMINISTRADOR
 Integraciones
 Conecta Quality360 con Jira Cloud para traer historias de usuario, o impórtalas desde un archivo.
 [ Conexión ] [ Sincronizar ] [ Importar archivo ] [ Historial ]

 ┌ Estado de la conexión ─────────────────────────────────────────────────────────────────────────────┐
 │ [✓ Conectado]  Última prueba: 29-10-2026 10:15        API token: Configurado · termina en AB12     │  chip-conexion · texto-ultima-prueba · token-estado
 └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
 (mensaje-conexion-ok | error-conexion | aviso-token-no-descifrable | aviso-integracion-deshabilitada)

 ┌ Conexión con Jira ────────────────────────────────────┐ ┌ Destino de las HDU nuevas ─────────────────┐
 │ Sitio de Jira *                                       │ │ Célula *                                   │
 │ [https://su-empresa.atlassian.net            ]        │ │ [CEL-C                                  ▾] │
 │ Dirección de tu Jira Cloud, por ejemplo               │ │ QE responsable por defecto *               │
 │ https://su-empresa.atlassian.net                      │ │ [Pablo Núñez                            ▾] │
 │ Correo de la cuenta de Jira *                         │ │ Sprint de respaldo *                       │
 │ [admin@empresa.com                           ]        │ │ [E5 Sprint 1                            ▾] │
 │ API token *                                           │ │ Las HDU llegan sin analista; tu QE lo      │
 │ [••••••••••••••••••                          ]        │ │ asigna después.                            │
 │ Configurado · termina en AB12. Déjalo vacío para      │ │ El sprint de respaldo se usa cuando Jira   │
 │ conservarlo.                                          │ │ trae un sprint que no existe aquí.         │
 │ Clave del proyecto *            Tipos de issue *      │ └─────────────────────────────────────────────┘
 │ [QTY       ] Por ejemplo, QTY   [Story, Historia ]    │
 │                                 De 1 a 5, separados   │
 │                                 por comas.            │
 └───────────────────────────────────────────────────────┘
                                         [Probar sin guardar]  [Probar y guardar]

 ┌ Cambios de configuración ────────────────────────────────────────────────────────────────────────┐
 │ 29-10-2026 10:15 · Admin Uno · cambió: API token (cambiado), Proyecto                              │
 │ 28-10-2026 16:02 · Admin Uno · cambió: Sitio, Correo, API token (cambiado), Célula, QE, Sprint     │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Dos paneles lado a lado a ≥ 900 px (rejilla de 2 columnas, `.formulario-jira`), una columna debajo. El formulario es **un solo `<form noValidate>`**: «Probar y guardar» es `type="submit"` (Enter funciona); «Probar sin guardar» es `type="button"`.

### 3.3 Wireframe 375

```
┌────────────────────────────┐
│ Integraciones              │
│ [Conexión][Sincronizar][Im→│  ← scroll horizontal
│ ┌ Estado ────────────────┐ │
│ │ [✓ Conectado]          │ │
│ │ Última prueba          │ │
│ │ 29-10-2026 10:15       │ │
│ │ API token              │ │
│ │ Configurado · termina  │ │
│ │ en AB12                │ │
│ └────────────────────────┘ │
│ Conexión con Jira          │
│ Sitio de Jira *            │
│ [                       ]  │  ← campos 44 px, una columna
│ …                          │
│ Destino de las HDU nuevas  │
│ …                          │
│ [Probar y guardar]         │  ← botones apilados, ancho completo,
│ [Probar sin guardar]       │     el principal primero
│ Cambios de configuración   │
│ 29-10 10:15 · Admin Uno    │
│ API token (cambiado)…      │
└────────────────────────────┘
```

### 3.4 Campos

| Campo | testid | Control | Ayuda (`campo-ayuda`, ligada con `aria-describedby`) | Validación del portal (al pulsar, no antes) |
| --- | --- | --- | --- | --- |
| Sitio de Jira | `campo-sitio` | `input type="url"` | «Dirección de tu Jira Cloud, por ejemplo https://su-empresa.atlassian.net» | «Ingresa la dirección del sitio de Jira» / «Ingresa una dirección web válida». **No** exige `atlassian.net` (D95 lo decide el servidor; las pruebas usan `http://127.0.0.1`) |
| Correo | `campo-correo` | `input type="email"` | — | «Ingresa el correo de la cuenta de Jira» / «Ingresa un correo con formato válido» |
| API token | `campo-token` | `input type="password"`, `autocomplete="new-password"`, `spellcheck=false`, nunca con valor | Configurado: «Déjalo vacío para conservar el token actual.» Sin token: «Créalo en tu cuenta de Atlassian. Se guarda cifrado y no se vuelve a mostrar.» | Sin token guardado: «Ingresa el API token». Con token guardado, vacío es válido (conservar) |
| Clave del proyecto | `campo-proyecto` | `input` (sin transformar a mayúsculas) | «Por ejemplo, QTY» | «Ingresa la clave del proyecto» / «La clave debe empezar con una letra mayúscula y tener de 2 a 10 caracteres (letras mayúsculas, números o guion bajo)» |
| Tipos de issue | `campo-tipos` | `input`, valor inicial `Story, Historia` | «De 1 a 5 tipos, separados por comas» | «Indica de 1 a 5 tipos de issue» |
| Célula | `campo-celula` | `select` (catálogo existente) | — | «Elige la célula destino» |
| QE responsable por defecto | `campo-qe` | `select` solo QE activos | — | «Elige el QE responsable» |
| Sprint de respaldo | `campo-sprint` | `select` | «Se usa cuando Jira no trae un sprint que exista en Quality360.» | «Elige el sprint de respaldo» |

Reglas: asterisco **y** `sr-only` «obligatorio»; `campo-error` por campo con `aria-invalid="true"` y `aria-describedby`; el foco va al primer campo inválido; **no se envía nada** (E5-F01-T05: el falso no recibe peticiones). Si el catálogo de células/sprints/QE falla, el selector muestra `BloqueEstado error` con «Reintentar» y los dos botones quedan deshabilitados. Si el catálogo de sprints trae la célula de cada sprint, el selector muestra solo los de la célula elegida y se limpia al cambiar de célula (ver conflicto 12).

### 3.5 Estado del token y de la conexión

- `token-estado` (`data-configurado="true|false"`): «Configurado · termina en AB12» o «No configurado». Es **texto**, siempre visible junto al campo y en la franja de estado. Sin ícono de candado que sustituya al texto.
- `chip-conexion` (`data-estado`): `○ Sin probar` (neutro) · `✓ Conectado` (verde) · `✕ Falló la última prueba` (rojo). Junto al chip, `texto-ultima-prueba` con la fecha (`<time>`, hora de Chile) y, si falló, el **mensaje fijo del código** (sección 10), nunca texto de Jira.
- `aviso-token-no-descifrable` (`role="alert"`, 409 `TOKEN_NO_DESCIFRABLE`): «Vuelve a ingresar el API token.» El token pasa a mostrarse «No disponible: vuelve a ingresarlo» y el campo se vuelve obligatorio, como en la primera configuración.
- `aviso-integracion-deshabilitada` (503 `LLAVE_CIFRADO_NO_DISPONIBLE`): «La integración no está habilitada en el servidor. Avisa al responsable del despliegue.» El formulario se muestra deshabilitado (`fieldset disabled`) y no hay botones de guardar.

### 3.6 Flujo de «Probar y guardar»

1. Pulsa: validación local. Con errores, no hay petición.
2. Válido: ambos botones deshabilitados, el principal dice «Probando…» y una línea `role="status"` «Probando la conexión con Jira…» (sin barra; son uno o dos segundos).
3. **Éxito** (`PUT` 200 con `prueba.ok`): `mensaje-conexion-ok` (`mensaje-exito`, `role="status"`): «Conexión exitosa con Jira como Admin Jira Falso». Se agrega «Configuración guardada.» Efectos: `chip-conexion` pasa a «Conectado», `token-estado` se actualiza, el campo de token **se vacía**, la lista de cambios se recarga, el foco permanece en el botón.
4. **Error** (`prueba.error` o `guardado: false`): `error-conexion` (`role="alert"`, `data-codigo`, `tabIndex=-1`, recibe el foco): glifo `✕`, el mensaje fijo del código, una línea con la sugerencia (por ejemplo «Revisa la dirección del sitio») y la frase fija **«No se guardó nada: se conserva la configuración anterior.»** (D112 #1). El campo de token se vacía (con configuración previa no hace falta reescribirlo; en la primera, sí). El resto de los campos conserva lo escrito.
5. **Probar sin guardar** (`boton-probar`): igual, pero el éxito dice «Conexión exitosa con Jira como X. No se guardaron cambios.» y el estado guardado no cambia. Con token vacío y token guardado, prueba con el guardado; sin ninguno, el error local «Ingresa el API token».
6. 403 (perdió el rol): «Ya no tienes permiso para esta acción» y `GET /v1/me` (patrón E4). 5xx o red: `mensaje-error-global` «No fue posible guardar. Intenta nuevamente.» sin cerrar nada.

**No hay diálogos de confirmación nuevos en E5.** Guardar la configuración es reversible y «Sincronizar» es idempotente y no destructivo (D98); la vista previa de la importación ya hace de confirmación (sección 6).

### 3.7 Cambios de configuración

`lista-eventos-configuracion` (`<ul>` en `.historial-lista`): fecha · actor · «cambió: Sitio, Correo, Proyecto…». El token aparece solo como **«API token (cambiado)»** (E5-F01-T08), nunca su valor. Se muestran los 10 últimos. Vacío: «Aún no hay cambios de configuración». Es un bloque con estado propio (clave `eventos-configuracion`): si falla, solo ese bloque dice «No disponible» y el formulario sigue operativo.

### 3.8 Estados de la pestaña

| Estado | Presentación |
| --- | --- |
| Cargando | Esqueleto de la franja y de los dos paneles; `aria-busy` |
| Sin configuración | Formulario vacío (tipos con su valor por defecto), `chip-conexion` «Sin probar», `token-estado` «No configurado». Es un estado normal, no un error |
| Error | `BloqueEstado error` + «Reintentar» (`estado-error-configuracion`); sin formulario |
| No disponible (Integraciones caído, E5-F01-T10) | `BloqueEstado indisponible` «No disponible» + «Reintentar» (`estado-indisponible-configuracion`); las pestañas siguen visibles y el resto del portal funciona |

---

## 4. Pestaña «Sincronizar» (E5-F02)

### 4.1 Wireframe 1280 (listo para ejecutar)

```
 [ Conexión ] [ Sincronizar ] [ Importar archivo ] [ Historial ]

 ┌ Sincronizar con Jira ───────────────────────────────────────────────────────────────────────────────┐
 │ Proyecto QTY en su-empresa.atlassian.net   [✓ Conectado]                                             │
 │ Última ejecución: 29-10-2026 10:20 · [◐ Con errores] · Ver detalle           (resumen-ultima-sync)   │
 │ Las HDU nuevas se crean en CEL-C, con Pablo Núñez como QE y "E5 Sprint 1" de respaldo, sin analista. │
 │ ─────────────────────────────────────────────────────────────────────────────────────────────────── │
 │ Qué se actualiza: solo título, descripción y prioridad, y solo si cambiaron. Nunca el estado, el      │
 │ analista, el QE, el checklist, los impedimentos ni el riesgo. Las HDU cerradas no se modifican.       │
 │ ☐ Vincular HDU creadas a mano con el mismo código                                                     │
 │   (ayuda) Si ya existe una HDU creada a mano con el mismo código de Jira, se actualizará y pasará a   │
 │   figurar como importada de Jira.                                                                      │
 │                                                              [ Sincronizar con Jira ]                 │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**En curso** (el botón se reemplaza por su versión deshabilitada):

```
 │                                                              [ Sincronizando… ] (deshabilitado)     │
 ┌ estado-sincronizando · role="status" · aria-busy ────────────────────────────────────────────────────┐
 │ ▓▓▓▓▓░░░░░░░░░░░░░  Leyendo historias de Jira y guardándolas. Puede tardar hasta unos 10 segundos.   │
 │ No se puede cancelar. Puedes salir: el resultado quedará en el Historial.                             │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

La barra (`.barra-espera`) es **indeterminada**; con `prefers-reduced-motion` no se anima y queda solo el texto. No hay porcentaje ni contadores parciales (no existen en el contrato).

**Resultado** (aparece bajo el panel; el foco pasa al encabezado del resultado, `tabIndex=-1`, que se anuncia):

```
 ┌ resultado-sincronizacion ───────────────────────────────────────────────────────────────────────────┐
 │ Resultado: [◐ Con errores]   29-10-2026 10:20 · duración 3,1 s          [Ver detalle en el Historial] │  resultado-ejecucion · enlace-ver-detalle-ejecucion
 │ Se procesaron las historias de Jira; 1 fila tuvo errores.                                             │
 │ ┌ Leídas ┐ ┌ Creadas ┐ ┌ Actualizadas ┐ ┌ Omitidas ┐ ┌ Con error ┐        ┌ Con advertencias ┐       │  resumen-ejecucion · res-*
 │ │   11   │ │   10    │ │      0       │ │    0     │ │     1     │        │  5  (no suma)    │       │
 │ └────────┘ └─────────┘ └──────────────┘ └──────────┘ └───────────┘        └──────────────────┘       │
 │ Jira pidió esperar 2 veces; se reintentó.                                       (aviso-limite-tasa)   │
 │ ▾ HDU creadas (10)                                                                                    │
 │   QTY-1  Login con doble factor           Alta · Sprint E5 Sprint 2                                   │
 │   QTY-3  Exportar reporte mensual         Crítica · [! Sprint no encontrado: se usó el de respaldo]   │
 │   …                                                                    [Mostrar más (25 de 10)]       │
 │ ▾ Filas con error (1)                                                                                 │
 │   Fila 11  QTY-11   [✕ Error] El título es obligatorio                                                │
 │ ▸ HDU actualizadas (0)      ▸ Omitidas (0)                                                            │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Contenido del bloque «Configuración»

- Se alimenta de `GET configuracion`: proyecto, host del sitio (sin ruta), `chip-conexion`, destino (nombres de célula, QE y sprint). Si el chip dice «Falló la última prueba» se muestra además un `mensaje-aviso` «La última prueba de conexión falló. Revisa la conexión», pero **el botón no se bloquea** (el servidor decide).
- `resumen-ultima-sync` es una línea (no el panel completo del historial): fecha, insignia de resultado y «Ver detalle». Sin ejecuciones: «Aún no se ha sincronizado».
- Los dos textos de «Qué se actualiza» y el destino son fijos y siempre visibles (D98/D99): son lo que el Administrador necesita saber antes de pulsar. En 375 px se agrupan en un `<details>` «Qué hace esta sincronización» (cerrado), salvo el destino.
- Casilla `casilla-vincular` (apagada al abrir, no se recuerda). Al marcarla aparece `aviso-vincular-activo` (`role="note"`): «Se actualizarán el título, la descripción y la prioridad de las HDU creadas a mano que coincidan por código. Su estado, analista y checklist no cambian.» No hay diálogo adicional (ver 3.6).

### 4.3 Botones

- `boton-sincronizar` «Sincronizar con Jira» (principal) → «Sincronizando…» (`aria-disabled`, deshabilitado). Una pulsación = una ejecución.
- `boton-continuar` «Continuar» (secundario) **solo** si la última ejecución es `INCOMPLETA`, de origen Jira y con `continuarDesde`. Sobrevive a recargas porque se deriva de `GET estado`. Repite con la misma casilla de vincular. Durante la ejecución ambos botones están deshabilitados.
- **Ejecución ajena en curso** (otra pestaña o persona, E5-F02-T09): `aviso-en-curso` (`role="status"`) «Ya hay una sincronización en curso» y el botón deshabilitado; el portal consulta `GET estado` cada 3 s hasta 30 s y luego deja «Actualizar». Si la ejecución `EN_CURSO` tiene más de 5 minutos, se considera abandonada (D104) y el botón vuelve a habilitarse, con la nota «La ejecución anterior quedó sin terminar; se marcará como interrumpida.»
- 409 `INTEGRACION_EN_CURSO` recibido al pulsar: mismo `aviso-en-curso`.

### 4.4 Resultado por tipo (D103)

Todos comparten `resultado-ejecucion` (`data-resultado`), el `resumen-ejecucion` y el enlace al detalle.

| Resultado | Titular | Bloque especial | Acciones |
| --- | --- | --- | --- |
| `EXITOSA` con creadas o actualizadas > 0 | «Sincronización completa.» | — | Listas de detalle |
| `EXITOSA` sin cambios (`creadas = 0` y `actualizadas = 0`) | — | `mensaje-sin-cambios` (tono neutro): «Sin cambios: Jira no tiene historias nuevas ni modificadas». Con `leidas = 0`: «Sin cambios: el proyecto no tiene historias del tipo configurado» | Ninguna |
| `CON_ERRORES` | «Sincronización completa. N filas tuvieron errores y las demás se procesaron.» | Lista «Filas con error» abierta | — |
| `INCOMPLETA` | — | `aviso-incompleta` (ver abajo) | `boton-continuar` (solo Jira) |
| `FALLIDA` | — | `error-sincronizacion` (ver 4.5) | Según el código |
| `INTERRUMPIDA` (solo en historial) | «La ejecución quedó sin terminar.» | — | — |

**`aviso-incompleta`** (`mensaje-aviso`, glifo `◔`, foco al aparecer): texto según la causa, siempre con lo procesado:

| Causa | Texto |
| --- | --- |
| Tope de 100 | «Se procesaron 100 historias; quedan más en Jira.» (E5-F02-T07) |
| `PRESUPUESTO_DE_TIEMPO` | «Se alcanzó el tiempo máximo. Se procesaron N historias; continúa para procesar el resto.» |
| `JIRA_LIMITE_DE_TASA` con parte procesada | «Jira pidió esperar demasiado. Se procesaron N historias; continúa más tarde o importa un archivo.» |
| Archivo (sin `continuarDesde`) | «Se procesaron N de M filas por el límite de tiempo. Vuelve a importar el mismo archivo: lo ya importado quedará como "Sin cambios".» |

Debajo del texto: «Las ejecuciones anteriores quedan en el Historial». Cada «Continuar» produce **su propia ejecución y su propio resultado**: el portal muestra la última; no suma tandas (el contrato no las vincula).

**`aviso-vincular-sugerido`**: si hubo omitidas con `HDU_MANUAL_EXISTENTE` y la casilla estaba apagada: «N historias se omitieron porque ya existen como HDU creadas a mano. Activa "Vincular…" y sincroniza de nuevo para adoptarlas.»

### 4.5 `FALLIDA` y sugerencia de importar archivo

`error-sincronizacion` (`role="alert"`, `data-codigo`, `tabIndex=-1` con foco): glifo `✕`, título «No se pudo sincronizar», el **mensaje fijo** del código, y «Qué puedes hacer» con enlaces:

```
 ┌ error-sincronizacion  data-codigo="JIRA_NO_DISPONIBLE" ───────────────────────────────────────────┐
 │ ✕ No se pudo sincronizar                                                                           │
 │ Jira no está disponible por ahora.                                                                  │
 │ La ejecución quedó registrada como fallida y no se creó ninguna HDU.                                │
 │ Qué puedes hacer:  · Reintentar   · Importar un archivo →   · Ver en el Historial                   │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Código | Acción principal | Siempre además |
| --- | --- | --- |
| `JIRA_CREDENCIAL_INVALIDA`, `TOKEN_NO_DESCIFRABLE` | «Ir a Conexión» (`enlace-ir-conexion`) | «Importar un archivo» (`enlace-importar-archivo`) |
| `JIRA_SIN_PERMISO` | «Revisa los permisos de la cuenta sobre el proyecto» (texto) | ídem |
| `JIRA_SITIO_NO_ENCONTRADO`, `JIRA_PROYECTO_NO_ENCONTRADO` | «Revisar la conexión» (enlace a Conexión) | ídem |
| `JIRA_LIMITE_DE_TASA`, `JIRA_TIEMPO_AGOTADO`, `JIRA_RESPUESTA_INVALIDA`, `JIRA_NO_DISPONIBLE` | «Reintentar» (vuelve a ejecutar) | ídem |
| `ORGANIZACION_NO_DISPONIBLE` | «Reintentar» | **Sin** «Importar un archivo»: el archivo también escribe vía Organización y fallaría igual (ver conflicto 6) |
| `JIRA_NO_CONFIGURADO` | Ver estado vacío abajo | — |
| Código desconocido | Mensaje genérico «No pudimos completar la sincronización.» | «Ver en el Historial» |

`enlace-importar-archivo` navega a la pestaña Importar sin perder la página. «Reintentar» (`boton-reintentar-sincronizacion`) es un botón normal (no reenvía automáticamente).

**Sin respuesta** (la función de Vercel se cortó y el portal recibe 504 o red): bloque `error-sincronizacion` con `data-codigo="SIN_RESPUESTA"` (código solo del portal): «No recibimos respuesta del servidor. La sincronización pudo haberse completado: revisa el Historial antes de reintentar.» + enlace al Historial. Se consulta `GET estado` para sincronizar la pantalla (ver conflicto 4).

### 4.6 Listas de detalle

Cuatro secciones con `h3` y contador, cada una un **disclosure** (`aria-expanded`, `aria-controls`): «HDU creadas», «HDU actualizadas», «Omitidas», «Filas con error». Abiertas por defecto las que tienen filas, excepto «Omitidas» (cerrada; el motivo se ve al abrirla). Cargan **bajo demanda** con `GET /ejecuciones/{id}/detalle?resultado=…` (25 por vez, «Mostrar más» `boton-ver-mas-<creadas|actualizadas|omitidas|error>`); mientras cargan: esqueleto de 3 filas; si falla: `BloqueEstado error` + «Reintentar» solo dentro de la sección (el resumen sigue visible).

Fila: código (enlace a `/hdu/:id` si hay `idHistoria`) · título · chips de advertencia (sección 7.3) · lo propio de su resultado:

- Creada: prioridad y sprint asignados.
- Actualizada: cambios `Título: Recuperar contraseña → Recuperar clave`, `Prioridad: Media → Crítica` (`celda-cambios`; ver 7.4).
- Omitida: motivo en español («Sin cambios», «La HDU está cerrada y no se modifica», «Ya existe una HDU creada a mano con este código»).
- Error: número de fila, código, `✕ Error`, motivo.

### 4.7 Estados de la pestaña

| Estado | Presentación |
| --- | --- |
| Cargando configuración | Esqueleto; sin botones |
| Sin configuración (E5-F02-T10) | `estado-vacio-jira` (neutro): «Configura la conexión con Jira antes de sincronizar» + enlace «Ir a Conexión». **No existe** `boton-sincronizar` |
| Error / No disponible | `BloqueEstado` con «Reintentar» (`estado-error-sincronizacion`, `estado-indisponible-sincronizacion`) |
| Integración deshabilitada (503 llave) | Mismo `aviso-integracion-deshabilitada` que Conexión; sin botón |

### 4.8 Wireframe 375

```
┌────────────────────────────┐
│ Sincronizar con Jira       │
│ Proyecto QTY               │
│ su-empresa.atlassian.net   │
│ [✓ Conectado]              │
│ Última: 29-10 10:20        │
│ [◐ Con errores] Ver detalle│
│ Las HDU nuevas van a CEL-C │
│ ▸ Qué hace esta sincro…    │  ← <details>
│ ☐ Vincular HDU creadas a   │
│   mano con el mismo código │
│ [Sincronizar con Jira]     │  ← 44 px, ancho completo
├────────────────────────────┤
│ Resultado [◐ Con errores]  │
│ 29-10-2026 10:20 · 3,1 s   │
│ ┌ Leídas ───────────── 11 ┐│  ← contadores en rejilla de 2
│ ┌ Creadas ──────────── 10 ┐│
│ ┌ Actualizadas ──────── 0 ┐│
│ ┌ Omitidas ──────────── 0 ┐│
│ ┌ Con error ─────────── 1 ┐│
│ ┌ Con advertencias ──── 5 ┐│  ← aparte, "no suma"
│ ▾ HDU creadas (10)         │
│  QTY-1                     │
│  Login con doble factor    │
│  Alta · E5 Sprint 2        │
│ [Mostrar más]              │
│ ▾ Filas con error (1)      │
└────────────────────────────┘
```

---

## 5. Resumen de contadores (compartido por Sincronizar, Importar y Detalle)

`ResumenEjecucion` (`resumen-ejecucion`, `<dl>`): cinco ítems que **suman** (`res-leidas` primero, luego `res-creadas`, `res-actualizadas`, `res-omitidas`, `res-con-error`) y un sexto, **separado visualmente con borde punteado y la leyenda «(informativo, no suma)»**, `res-advertencias`. Se arma con las clases de `TarjetaMetrica` (`tarjeta-resumen`) con `clave` propio para el testid; `res-con-error > 0` usa la regla de atención existente (texto «▲ Requiere atención» **no** se usa aquí para no confundir con el semáforo: se sustituye por la palabra «Revisa las filas con error» bajo el número). Un contador en 0 es un dato válido y se muestra «0». En el historial y el detalle, `Con error` en 0 se muestra «0» (no se oculta). Un `res-*` indisponible nunca muestra 0: usa `BloqueEstado` como el resto.

---

## 6. Pestaña «Importar archivo» (E5-F03)

### 6.1 Flujo en tres pasos

`PasosImportacion` (`<ol>` con `aria-current="step"` y texto, no solo color): **1 Elegir archivo → 2 Revisar la vista previa → 3 Importar**. Estados de pantalla:

`sin archivo` → `validando` → (`error de estructura` | `vista previa`) → `importando` → `resultado`.

### 6.2 Wireframe 1280, paso 2 (vista previa)

```
 [ Conexión ] [ Sincronizar ] [ Importar archivo ] [ Historial ]

 ┌ Importar historias desde un archivo ─────────────────────────────────────────────────────────────────┐
 │ 1 Elegir archivo  ›  [2 Revisar la vista previa]  ›  3 Importar                                       │
 │ ┌ Formato ────────────────────────────────────────────────────────────────────────────────────────┐   │
 │ │ CSV (separador , o ;) o JSON (lista de objetos o {"historias": [...]}). UTF-8. Máximo 1 MB y 500  │   │
 │ │ filas. Obligatorias: codigo, titulo. Opcionales: descripcion, prioridad (CRITICA, ALTA, MEDIA,     │   │
 │ │ BAJA), celula, sprint, qe_correo (estas tres solo se usan al crear).   [Descargar plantilla CSV]  │   │
 │ └──────────────────────────────────────────────────────────────────────────────────────────────────┘   │
 │ Archivo CSV o JSON *   [Elegir archivo]  historias-validas.csv · 1,2 KB       [Quitar archivo]        │
 │ ☐ Importar solo si todas las filas son válidas   (si una fila tiene error, no se importa nada)        │
 │ ☐ Vincular HDU creadas a mano con el mismo código                                                      │
 │                                                                                                        │
 │ ┌ vista-previa ────────────────────────────────────────────────────────────────────────────────────┐ │
 │ │ ┌ Crear ┐ ┌ Actualizar ┐ ┌ Omitir ┐ ┌ Con error ┐   ┌ Con advertencias ┐                          │ │
 │ │ │   4   │ │     0      │ │   0    │ │     0     │   │        1         │                          │ │
 │ │ └───────┘ └────────────┘ └────────┘ └───────────┘   └──────────────────┘                          │ │
 │ │ Al actualizar solo se modifican título, descripción y prioridad.            (aviso-actualizar-campos) │ │
 │ │ Mostrar: [Todas ▾]                                                    4 filas                      │ │
 │ │ FILA  CÓDIGO  TÍTULO                  ACCIÓN        MOTIVO                                         │ │
 │ │ 2     ARC-1   Alta de cliente         [+ Crear]                                                    │ │
 │ │ 3     ARC-2   Baja de cliente         [+ Crear]                                                    │ │
 │ │ 4     ARC-3   Consulta, con coma      [+ Crear]                                                    │ │
 │ │ 7     ARC-9   Reporte                 [✕ Error]     La prioridad no es válida                      │ │
 │ │ Mostrando 1–4 de 4                                       [◀ Anterior] Página 1 de 1 [Siguiente ▶]   │ │
 │ └──────────────────────────────────────────────────────────────────────────────────────────────────┘ │
 │ aviso-estricto (solo con modo estricto y errores)                                                      │
 │                                                          [Cancelar]   [Importar]                       │
 └────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Elementos

| Elemento | Detalle |
| --- | --- |
| Formato y límites | Bloque fijo, texto corto; la lista de columnas es una tabla pequeña de 7 filas (columna · obligatoria · uso) con `caption`, plegada en `<details>` a 375 px |
| Plantilla | `enlace-plantilla-csv` «Descargar plantilla CSV»: se **genera en el cliente** (no hay endpoint). Contiene el encabezado y una fila de ejemplo con código `EJEMPLO-1` y la indicación «Reemplaza esta fila» |
| Selector | `selector-archivo`: `<input type="file" accept=".csv,.json">` nativo, con `<label>` visible «Archivo CSV o JSON». Sin zona de arrastre (no se agrega una interacción que el teclado no pueda igualar). Tras elegir: nombre y tamaño (`archivo-seleccionado`) y `boton-quitar-archivo` «Quitar archivo» |
| Opciones | `casilla-estricto` «Importar solo si todas las filas son válidas» con ayuda; `casilla-vincular` con la misma ayuda y aviso de la sección 4.2. **Cambiar «Vincular» vuelve a pedir la vista previa** (cambia lo que se actualiza); cambiar el modo estricto no |
| Validación del portal | Antes de enviar: extensión (`.csv`/`.json`) y tamaño > 1 MB. Muestran `error-archivo` con los mismos códigos (`FORMATO_NO_SOPORTADO`, `ARCHIVO_MUY_GRANDE`) y **no** hacen petición. El resto lo valida el servidor |
| Validando | `estado-validando-archivo` (`role="status"`, `aria-busy`) «Validando el archivo…»; el selector queda deshabilitado |
| Vista previa | `vista-previa`: contadores `vp-crear`, `vp-actualizar`, `vp-omitir`, `vp-con-error`, `vp-advertencias` (misma forma que 5) y `aviso-actualizar-campos` («Al actualizar solo se modifican título, descripción y prioridad») |
| Tabla | `tabla-vista-previa` (`TablaBandeja`, sin orden), columnas Fila · Código · Título · Acción · Motivo; `fila-vista-previa-<n>`; 25 por página con `Paginacion` (**en el cliente**: el servidor devuelve las ≤ 500 filas de una vez). Filtro `filtro-vista-previa` «Mostrar» (Todas, Crear, Actualizar, Omitir, Con error), por defecto Todas. El orden es el del archivo para poder ubicar la fila |
| Texto del archivo | Siempre texto plano (React escapa); un valor que empieza con `=`, `+`, `-` o `@` se ve tal cual. Los títulos largos se cortan en 2 líneas con el valor completo en `title` |
| Botones | `boton-importar` «Importar» (principal; **solo** con archivo estructuralmente válido) y `boton-cancelar-importacion` «Cancelar» (descarta el archivo; no deja rastro y no pide confirmación). Mientras importa: «Importando…» deshabilitado + `estado-importando` (misma barra indeterminada de 4.1, «Importando N filas. Puede tardar hasta unos 10 segundos.») |

**Modo estricto con errores** (`aviso-estricto`, `mensaje-aviso`, `role="status"`, bajo la tabla y antes de los botones): «Con el modo estricto no se importará nada porque hay 7 filas con error. Se registrará como fallida. Desactívalo para importar las filas válidas.» El botón **sigue habilitado**: E5-F03-T08 exige que importar registre la ejecución `FALLIDA`/`MODO_ESTRICTO`.

**Nada que importar** (crear + actualizar = 0 y sin estricto): nota «No hay filas para crear ni actualizar. Importar solo dejará un registro en el historial.» El botón sigue habilitado (contrato).

La frase de confirmación `resumen-confirmacion` (`role="status"`, sobre los botones) cierra el paso: «Se crearán 4 HDU, se actualizarán 0 y se omitirán 0. 0 filas tienen errores.» La vista previa **es** la confirmación: no hay `DialogoConfirmacion`.

### 6.4 Errores de estructura (E5-F03#2)

`error-archivo` (`role="alert"`, `data-codigo`, glifo `✕`, foco al aparecer). Reemplaza la vista previa; no existe `boton-importar`; sigue visible el selector para elegir otro archivo.

```
 ┌ error-archivo  data-codigo="COLUMNAS_FALTANTES" ──────────────────────────────────────────────────┐
 │ ✕ El archivo no se puede importar                                                                   │
 │ Faltan las columnas: titulo                                                                          │
 │ Corrígelo y vuelve a seleccionarlo. No se creó ninguna HDU.                                          │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Mensajes (tabla 10.2): vacío, formato, ilegible, columnas faltantes (lista completa en una frase, plural fijo «Faltan las columnas: codigo, titulo»), muy grande («máximo 1 MB»), demasiadas filas («máximo 500 filas»). No se muestra nunca contenido del archivo en el error.

### 6.5 Resultado de la importación

Mismo `ResultadoEjecucion` de 4.4 con una cabecera propia: «Archivo: historias-validas.csv · 1,2 KB · huella 3fa9c2e1…» (los 12 primeros caracteres del SHA-256; completo en `title` y en el detalle). Listas de detalle idénticas (4.6). Casos:

- `CON_ERRORES`: lista «Filas con error» abierta con fila, código y motivo.
- `FALLIDA` por `MODO_ESTRICTO`: `error-archivo` con `data-codigo="MODO_ESTRICTO"` «No se importó nada porque el modo estricto detectó N filas con error», contadores (creadas 0, con error N) y enlace «Ver en el Historial».
- `FALLIDA` por estructura detectada al confirmar (4xx): `error-archivo` + «La ejecución quedó registrada» + enlace al historial (`ejecucionId`).
- `INCOMPLETA`: `aviso-incompleta` de archivo (4.4) y `boton-importar-de-nuevo` «Importar el mismo archivo» (el archivo sigue en memoria).
- Final: `boton-importar-otro` «Importar otro archivo» (secundario) limpia el estado y devuelve el foco al selector.

Un 409 `INTEGRACION_EN_CURSO`: `aviso-en-curso` «Ya hay una importación o sincronización en curso. Espera a que termine.» (ver conflicto 14).

### 6.6 Wireframe 375

```
┌────────────────────────────┐
│ Importar archivo           │
│ 1 Elegir › [2 Revisar] › 3 │
│ ▸ Formato y límites        │  ← <details>
│ Archivo CSV o JSON *       │
│ [Elegir archivo]           │
│ historias.csv · 1,2 KB     │
│ [Quitar archivo]           │
│ ☐ Importar solo si todas   │
│   las filas son válidas    │
│ ☐ Vincular HDU creadas a   │
│   mano…                    │
│ ┌ Crear ──────────────  4 ┐│  ← rejilla de 2
│ ┌ Actualizar ─────────  0 ┐│
│ ┌ Omitir ─────────────  0 ┐│
│ ┌ Con error ──────────  1 ┐│
│ Mostrar: [Todas        ▾]  │
│ ┌────────────────────────┐ │
│ │ [✕ Error]      Fila 7  │ │  ← tarjeta; acción primero
│ │ ARC-9  Reporte         │ │
│ │ La prioridad no es     │ │
│ │ válida                 │ │
│ └────────────────────────┘ │
│ [◀ Anterior][Siguiente ▶]  │
│ [Importar]                 │  ← 44 px, ancho completo
│ [Cancelar]                 │
└────────────────────────────┘
```

---

## 7. Historial y detalle de ejecución (E5-F04), compartido por tres roles

### 7.1 Anfitriones

| Anfitrión | Encabezado | Solo lectura |
| --- | --- | --- |
| Administrador, pestaña «Historial» | El de la página «Integraciones» | No muestra aviso (puede operar en las otras pestañas); el historial en sí no tiene botones de escritura |
| QE, `/qe/integraciones` | `EncabezadoBandeja` «Portal QE» · «Integraciones» · «Consulta lo que el Administrador sincronizó o importó desde Jira o desde archivos.» + `AvisoSoloLectura` con el texto «Vista de solo lectura. Aquí ves lo que se sincronizó o importó; no puedes configurar ni ejecutar nada.» + `nota-integraciones-qe`: «Las HDU nuevas llegan sin analista: las verás en tu bandeja, en "Asignar analista".» (enlace a `/qe`) | Sí |
| Auditor, pestaña «Integraciones» | El de `AuditorLayout` (con su `AvisoSoloLectura` certificado, que no se repite) | Sí. Sin exportación a CSV en esta ronda |

### 7.2 Wireframe 1280 (lista)

```
 ┌ ultima-ejecucion ─────────────────────────────────────────────────────────────────────────────────┐
 │ ┌ Última ejecución ──────────────────────┐  ┌ Última completada ──────────────────────────────┐   │
 │ │ 29-10-2026 10:40 · Jira (QTY)          │  │ 29-10-2026 10:30 · CSV (historias-con-err…)     │   │
 │ │ [✕ Fallida] · Admin Uno (Administrador)│  │ [◐ Con errores] · Admin Uno (Administrador)     │   │
 │ │ Leídas 0 · Creadas 0 · Actualiz. 0 …   │  │ Leídas 9 · Creadas 2 · Actualiz. 0 · Omit. 0 …  │   │
 │ │ Jira no está disponible por ahora.     │  │ Con error 7                                     │   │
 │ │ [Ver detalle]                          │  │ [Ver detalle]                                   │   │
 │ └────────────────────────────────────────┘  └──────────────────────────────────────────────────┘   │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌ Ejecuciones ─────────────────────────────────────────────────────────────────────────────────────┐
 │ Origen[Todos ▾] Resultado[Todos ▾] Desde[__] Hasta[__]   chips · [Limpiar filtros]   4 resultados │
 │ FECHA ▾        ORIGEN     ACTOR      RESULTADO         LEÍDAS CREADAS ACTUALIZ. OMITIDAS CON ERROR │
 │ 29-10 10:40    Jira       Admin Uno  [✕ Fallida]          0      0        0        0        0  [Ver detalle]
 │ 29-10 10:30    CSV        Admin Uno  [◐ Con errores]      9      2        0        0        7  [Ver detalle]
 │ 29-10 10:25    CSV        Admin Uno  [✓ Exitosa]          4      4        0        0        0  [Ver detalle]
 │ 29-10 10:20    Jira       Admin Uno  [◐ Con errores]     11     10        0        0        1  [Ver detalle]
 │ Mostrando 1–4 de 4                                           [◀ Anterior] Página 1 de 1 [Siguiente ▶]
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **«Última completada»** = la más reciente `EXITOSA` o `CON_ERRORES` (D103). Sin ninguna: «Aún no hay ejecuciones completadas». Las dos tarjetas son bloques independientes (`estado-*-ultima-ejecucion`).
- **Tabla `lista-ejecuciones`** (`TablaBandeja`, `fila-ejecucion-<id>`, `hrefFila` al detalle con filtros en `state`): columnas Fecha (ordenable, por defecto descendente) · Origen (texto «Jira»/«CSV»/«JSON» con línea secundaria: clave de proyecto o nombre del archivo, truncado con `title`) · Actor · Resultado (`InsigniaResultado`) · Leídas · Creadas · Actualizadas · Omitidas · Con error · Acción («Ver detalle», `boton-ver-detalle-<id>`; nombre accesible «Ver detalle de la ejecución del 29-10-2026 10:40»). Los números van alineados a la derecha, `font-variant-numeric: tabular-nums`. `Con error > 0` va en negrita **y** el resultado ya dice «Con errores»: el énfasis no depende del color.
- **Filtros** (`BarraFiltros`, en la URL): `filtro-origen` (Todos, Jira, CSV, JSON), `filtro-resultado` (Todos, Exitosa, Con errores, Incompleta, Fallida, Interrumpida, En curso), `filtro-desde`, `filtro-hasta`. URL: `origen`, `resultado`, `desde`, `hasta`, `orden`, `pagina`, `tamano`. 25 por página (máx. 100).
- **Fila `EN_CURSO`**: resultado `↻ En curso`, contadores en «—» (no 0), sin «Ver detalle» hasta que cierre (si el detalle ya existe se permite). Una en curso de más de 5 minutos se muestra igual hasta que la siguiente ejecución la marque.
- **Fila `INCOMPLETA` más reciente de Jira** (solo Administrador): en el detalle, `mensaje-aviso` con enlace «Ir a Sincronizar para continuar».

### 7.3 Detalle (`?ejecucion=<id>`)

```
 ← Volver al historial                                                       (enlace-volver-historial)
 ┌ detalle-ejecucion ────────────────────────────────────────────────────────────────────────────────┐
 │ Ejecución del 29-10-2026 10:30            Resultado: [◐ Con errores]                              │  h2 · resultado-ejecucion
 │ Origen      CSV · historias-con-errores.csv (1,4 KB)     Ejecutó   Admin Uno · Administrador      │
 │ Huella      3fa9c2e1…  (SHA-256 completo)                 Duración  1,2 s                         │
 │ Opciones    Modo estricto: no · Vincular HDU manuales: no                                         │
 │ (Jira) Proyecto  QTY · su-empresa.atlassian.net      Esperas por límite de tasa  2 (1,0 s y 1,0 s)│
 │ Nota: Quality360 guarda la huella y el nombre del archivo, no su contenido.                       │
 │ ┌ error-ejecucion  data-codigo="…" (solo si hay error global) ───────────────────────────────┐    │
 │ │ ✕ Jira no está disponible por ahora.   Sugerencia: importar un archivo (solo Administrador: enlace)│
 │ └────────────────────────────────────────────────────────────────────────────────────────────┘    │
 │ [resumen-ejecucion: Leídas 9 · Creadas 2 · Actualizadas 0 · Omitidas 0 · Con error 7 · Adv. 0]     │
 │ [filas-ocultas] 10 filas de HDU fuera de tu ámbito  (solo QE)                                      │
 │ ☐ Solo filas con error                          (filtro-solo-errores)               9 filas       │
 │ FILA CÓDIGO  TÍTULO          RESULTADO        MOTIVO                         CAMBIOS   REF. DE JIRA│
 │ 2    ARC-10  Primera         [+ Creada]       —                              Prior.: —→Alta        │
 │ 3    ARC-11  Urgente         [✕ Error]        La prioridad no es válida                            │
 │ 4    —       Sin código      [✕ Error]        El código no es válido                                │
 │ …                                                                                                  │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Tabla `lista-detalle-ejecucion`** (`fila-detalle-<n>`): Fila · Código · Título · Resultado (`InsigniaFila`) · Motivo (mensaje español de 4.2 + chips de advertencia) · Cambios (`celda-cambios`) · Referencia de Jira (solo ejecuciones de Jira; encabezado «Referencia de Jira (no se guarda)», contenido «Estado: En curso · Responsable: Ana»). 25 por página del servidor.
- **Advertencias** como chips con `!` y texto (`ChipsAdvertencias`): «Sprint no encontrado: se usó el de respaldo», «Sin prioridad», «Prioridad no reconocida», «Título recortado a 200 caracteres», «Descripción recortada a 1.000 caracteres», «Se ignoraron columnas que el importador no usa» (una vez, en la cabecera).
- **Cambios**: lista de `Campo: antes → después` (valores ≤ 200 caracteres, `overflow-wrap: anywhere`; para lectores: «Título: antes "A", después "B"»). Valor vacío = «(vacío)».
- **QE** (D106): ve las filas de sus HDU y todas las filas con error (código y motivo, **sin título**, celda «—»). `filas-ocultas` (`role="status"`, `mensaje-aviso`): «10 filas de HDU fuera de tu ámbito». Si el QE no tiene filas visibles pero hay ocultas, la tabla muestra «No hay filas de tu ámbito en esta ejecución.» (`estado-vacio-detalle-ejecucion`) y el aviso.
- **Sugerencia del error global**: para Administrador, enlace funcional («Ir a Conexión», «Importar archivo»); para QE y Auditor, solo el texto (no tienen esas pantallas).
- 375 px: la cabecera pasa a lista de pares apilados; la tabla en tarjetas con **Resultado y Fila primero** (`celda-prioritaria`), luego código, título, motivo y cambios; `filtro-solo-errores` ocupa el ancho.

### 7.4 Wireframe 375 (lista)

```
┌────────────────────────────┐
│ Última ejecución           │
│ 29-10 10:40 · Jira (QTY)   │
│ [✕ Fallida]                │
│ Jira no está disponible…   │
│ [Ver detalle]              │
│ Última completada          │
│ …                          │
│ Filtros (2) ▾              │
│ ┌────────────────────────┐ │
│ │ [◐ Con errores]        │ │
│ │ 29-10-2026 10:30       │ │
│ │ CSV · historias-con-…  │ │
│ │ Admin Uno              │ │
│ │ Leídas          9      │ │
│ │ Creadas         2      │ │
│ │ Actualizadas    0      │ │
│ │ Omitidas        0      │ │
│ │ Con error       7      │ │
│ │ [Ver detalle]          │ │
│ └────────────────────────┘ │
│ [◀ Anterior][Siguiente ▶]  │
└────────────────────────────┘
```

### 7.5 Estados del historial

| Componente | Cargando | Vacío | Error | No disponible |
| --- | --- | --- | --- | --- |
| `ultima-ejecucion` | Esqueleto de 2 tarjetas | «Aún no se ha sincronizado ni importado nada» (tarjeta 1) / «Aún no hay ejecuciones completadas» (tarjeta 2) | `BloqueEstado error` + Reintentar | «No disponible» + Reintentar |
| `lista-ejecuciones` | Esqueleto de 5 filas | Sin filtros: `estado-vacio-historial` «Aún no se ha sincronizado ni importado nada» (neutro, sin error; E5-F04-T09). Con filtros: `estado-vacio-filtros-historial` «No hay ejecuciones con esos filtros» + «Limpiar filtros» | `estado-error-historial` + Reintentar | `estado-indisponible-historial` «No disponible» + Reintentar (E5-F04-T10: el resto del portal del QE carga) |
| `detalle-ejecucion` | Esqueleto de cabecera y 5 filas | Sin filas: «Esta ejecución no registró filas» (p. ej. `FALLIDA` de credencial); con «solo errores» sin resultados: «Ninguna fila con error» (tono éxito) | Error + Reintentar | No disponible + Reintentar (el encabezado del resumen se conserva si ya cargó) |
| Ejecución inexistente o ajena (404 / 403) | — | `estado-vacio-ejecucion` «No encontramos esa ejecución o no tienes acceso a ella» + «Volver al historial» (mismo texto para todos los roles: no revela si existe) | — | — |

Las dos tarjetas y la tabla tienen estado **propio**: si una falla, la otra no desaparece. Un rol sin acceso (Líder, Analista) nunca llega aquí: `RequireRole` lo detiene antes.

---

## 8. Detalle de HDU: descripción y origen (D108)

### 8.1 Posición

El backlog pide mostrar el texto «después del checklist». E4 ya puso Impedimentos y Riesgo en ese mismo lugar. Orden resultante de `/hdu/:id` (lo certificado no se mueve):

```
 ← Volver a mi bandeja (cert.)
 [aviso-solo-lectura] (cert.)   [hdu-bloqueada] (E4)
 encabezado (cert.)   resumen (cert.)   #asignacion (cert.)
 #certificado: ChecklistEntregables (cert.)
 #descripcion: seccion-descripcion-hdu        ← NUEVO (E5)
 #impedimentos (E4)
 #riesgo (E4)
 #estado: Cambiar estado (cert.)
 Historial (cert.)
```

La descripción queda inmediatamente después del checklist (cumple D108) y antes de los bloques de gestión de E4, que son los que preceden a «Cambiar estado».

### 8.2 Sección «Descripción y origen» (`seccion-descripcion-hdu`)

```
 ┌ Descripción ─────────────────────────────────────────────────────────  Origen: Jira  ┐
 │ Como usuario quiero activar 2FA                                                       │  hdu-descripcion (pre-wrap)
 │                                                                                       │
 │ ⓘ Este texto viene de Jira. Una nueva sincronización puede actualizar el título,      │  nota-origen-hdu (solo si origen ≠ Manual)
 │   la descripción y la prioridad.                                                       │
 └───────────────────────────────────────────────────────────────────────────────────────┘
```

- `.panel` con `.panel-cabecera`: `h2` «Descripción» a la izquierda y a la derecha **`hdu-origen`**: texto «Origen: Jira | CSV | JSON | Manual» con insignia neutra (`InsigniaOrigen`, sin color de significado).
- Texto de la descripción: **texto plano**, `white-space: pre-wrap`, `overflow-wrap: anywhere`; **sin interpretar HTML ni convertir enlaces** (la descripción viene de un sistema externo). Hasta 1.000 caracteres, siempre completa.
- Descripción nula o vacía: «Esta HDU no tiene descripción» (`estado-vacio-descripcion`, neutro). El origen se sigue mostrando.
- `nota-origen-hdu`: solo para origen distinto de Manual. HDU cerrada: «Esta HDU está cerrada: Jira no la modificará.» (D98).
- Si el API no trae `origen` ni `descripcion` (campos aditivos y anulables) la sección **no se renderiza**: ausencia de dato no se confunde con «Manual».
- Todos los roles que ven el detalle la ven (es información, no acción). Sin estado de carga propio: viaja con `GET /v1/hdu/{id}`.
- 375 px: encabezado en dos líneas (título y debajo el origen).

No se agrega columna ni insignia de origen a listados, bandejas ni CSV (D71, D108).

---

## 9. Estados y errores

### 9.1 Matriz por pantalla

| Pantalla / bloque | Cargando | Vacío | Error | No disponible |
| --- | --- | --- | --- | --- |
| Conexión | Esqueleto | Formulario sin datos (normal) | `estado-error-configuracion` | `estado-indisponible-configuracion` |
| Cambios de configuración | «Cargando…» | «Aún no hay cambios de configuración» | Reintentar | «No disponible» |
| Sincronizar | Esqueleto | `estado-vacio-jira` (sin configuración) | `estado-error-sincronizacion` | `estado-indisponible-sincronizacion` |
| Listas de detalle del resultado | Esqueleto 3 filas | Sección con 0: no se despliega | Reintentar dentro de la sección | Reintentar |
| Importar | `estado-validando-archivo` | Sin archivo: instrucciones | `error-archivo` (estructura) | Servicio caído al validar: `BloqueEstado indisponible` con «Reintentar» y el archivo conservado |
| Historial | Sección 7.5 | Sección 7.5 | Sección 7.5 | Sección 7.5 |
| Descripción de HDU | — | «Esta HDU no tiene descripción» | — | Sección oculta |

Claves de `BloqueDatos` nuevas: `configuracion`, `eventos-configuracion`, `sincronizacion`, `historial`, `ultima-ejecucion`, `detalle-ejecucion`, `jira` (vacío de Sincronizar). Regla de E4 que se mantiene: un dato caído **nunca** es un «0» ni un «Sin cambios».

### 9.2 Reglas de red (heredadas de E4)

- 503 `SERVICIO_NO_DISPONIBLE` y fallo de red al **leer** → indisponible. Otro 5xx al leer → error.
- Al **escribir**: 403 → «Ya no tienes permiso para esta acción» + `GET /v1/me`; 401 → flujo de sesión expirada existente; 5xx/red → «No fue posible guardar. Intenta nuevamente.» (`mensaje-error-global`, `role="alert"`) sin perder lo escrito.
- 200 con `error {codigo}` de Jira (D105) **no** es un fallo de red: se muestra con la tabla de la sección 10.

### 9.3 Cierre de sesión o cambio de rol

Si `GET /v1/me` cambia el rol con una pantalla de E5 abierta, aplica el aviso y redirección existentes (E7 4.3). El estado local del formulario (incluido cualquier texto escrito) se descarta.

### 9.4 Seguridad visible

- Ninguna pantalla muestra: el token, su cifrado, la llave, el cuerpo de una respuesta de Jira, el contenido del archivo ni ningún texto de error de Jira.
- El portal no escribe el token en `localStorage`, `sessionStorage`, URL, `console`, ni en el estado global de la sesión. El valor del `input` solo vive en el estado del componente y se borra tras cada intento y al desmontar.
- Los mensajes de la sección 10 son **constantes del portal** indexadas por código.

---

## 10. Mensajes

### 10.1 Errores de Jira y de la configuración (tabla local)

| Código | Mensaje | Sugerencia visible |
| --- | --- | --- |
| `JIRA_CREDENCIAL_INVALIDA` | Jira rechazó el correo o el API token. Revisa la conexión. | Ir a Conexión |
| `JIRA_SIN_PERMISO` | La cuenta de Jira no tiene permiso para leer este proyecto. | Revisa los permisos del proyecto |
| `JIRA_SITIO_NO_ENCONTRADO` | No pudimos conectar con ese sitio de Jira. Revisa la dirección. | Revisa el sitio |
| `JIRA_PROYECTO_NO_ENCONTRADO` | No encontramos el proyecto en Jira. | Revisa la clave |
| `JIRA_LIMITE_DE_TASA` | Jira pidió esperar demasiado. Reintenta en unos minutos. | Continuar más tarde o importar un archivo |
| `JIRA_TIEMPO_AGOTADO` | Jira no respondió a tiempo. | Reintentar o importar un archivo |
| `JIRA_NO_DISPONIBLE` | Jira no está disponible por ahora. | Importar un archivo |
| `JIRA_RESPUESTA_INVALIDA` | Jira respondió algo que no entendimos. | Reintentar o importar un archivo |
| `JIRA_NO_CONFIGURADO` | Configura la conexión con Jira antes de sincronizar. | Ir a Conexión |
| `PRESUPUESTO_DE_TIEMPO` | Se alcanzó el tiempo máximo. Continúa para procesar el resto. | Continuar |
| `ORGANIZACION_NO_DISPONIBLE` | No pudimos guardar las HDU en este momento. | Reintentar |
| `LLAVE_CIFRADO_NO_DISPONIBLE` | La integración no está habilitada en el servidor. | Avisa al responsable del despliegue |
| `TOKEN_NO_DESCIFRABLE` | Vuelve a ingresar el API token. | Ir a Conexión |
| `INTEGRACION_EN_CURSO` | Ya hay una sincronización en curso. | Espera a que termine |
| `SIN_RESPUESTA` (solo portal) | No recibimos respuesta del servidor. La operación pudo haberse completado: revisa el Historial antes de reintentar. | Ver Historial |
| desconocido | No pudimos completar la operación con Jira. | Ver Historial |

### 10.2 Errores de archivo y de modo

| Código | Mensaje |
| --- | --- |
| `ARCHIVO_VACIO` | El archivo está vacío o no tiene filas de datos. |
| `ARCHIVO_MUY_GRANDE` | El archivo supera el máximo de 1 MB. |
| `FORMATO_NO_SOPORTADO` | El formato no es compatible. Usa un archivo .csv o .json. |
| `ARCHIVO_ILEGIBLE` | No pudimos leer el archivo. Revisa que sea un CSV bien formado o un JSON con una lista de historias. |
| `COLUMNAS_FALTANTES` | Faltan las columnas: *(lista)* |
| `DEMASIADAS_FILAS` | El archivo supera el máximo de 500 filas. |
| `MODO_ESTRICTO` | No se importó nada porque el modo estricto detectó *N* filas con error. |

### 10.3 Motivos de fila

Los de la sección 4.2 del backlog, literales. «Sin cambios», «La HDU está cerrada y no se modifica», «Ya existe una HDU creada a mano con este código», «El código no es válido», «El título es obligatorio», «El título supera los 200 caracteres», «La prioridad no es válida», «El código está repetido en el archivo», «La célula no existe», «El sprint no existe», «El QE responsable no es válido», «No pudimos procesar esta fila».

---

## 11. Accesibilidad

### 11.1 Generales (como E4)

- **Contraste ≥ 4,5:1** en todos los pares: se reutilizan pares ya calculados en E4 (ver 12.2). `q360-qa` confirma con axe; criterio de salida: **sin serious/critical** en `/admin/integraciones` (las 4 pestañas, con resultado y con error), `/qe/integraciones`, la pestaña del Auditor, el detalle de ejecución y `/hdu/:id` con origen Jira.
- **No solo color:** resultado, resultado de fila, estado de conexión, advertencia, vista previa («Crear/Actualizar/Omitir/Error») y pasos (`aria-current="step"` más texto).
- **Foco:** al entrar a cada ruta, el `h1`. Tras validación fallida, al primer campo inválido. Tras una prueba o ejecución: al contenedor de resultado/error (`tabIndex=-1`) para que se anuncie. Al cambiar de lista a detalle, al `h2` del detalle; al volver, al botón «Ver detalle» de la fila de origen.
- **Anuncios:** `role="status"` para espera, éxito, `aviso-incompleta`, `aviso-limite-tasa`, `aviso-en-curso`, `filas-ocultas` y totales; `role="alert"` para `error-conexion`, `error-sincronizacion`, `error-archivo`, `error-ejecucion` y errores de servidor. Nunca `aria-live` por pulsación.
- **Teclado:** todo operable. Disclosures de listas con `aria-expanded`/`aria-controls`; selector de archivo nativo (Enter/Espacio); sin arrastrar-y-soltar; Esc no se usa (no hay diálogos). Las pestañas son enlaces (`aria-current="page"`), no `tablist`.
- **Nombres accesibles:** botones de tabla con contexto («Ver detalle de la ejecución del 29-10-2026 10:40»); el texto visible empieza igual que el nombre. `boton-continuar` se asocia con el aviso mediante `aria-describedby`. Los contadores se leen «Creadas: 10» (`<dt>`/`<dd>`).
- **Tablas:** `caption` visible o `sr-only`, `scope="col"`; las tarjetas de 375 px conservan los `role` de `TablaBandeja`. Las insignias son texto.
- **Campos:** `<label>` visible para todos los controles (incluidos los filtros); ayudas con `aria-describedby`; el token con `autocomplete="new-password"` evita que el navegador guarde la clave del portal en lugar del API token.
- **Movimiento:** `.barra-espera` solo se anima si no hay `prefers-reduced-motion`; el resto no anima.
- **375 px:** objetivos de 44 px, botones apilados a ancho completo, formularios de una columna, tablas apilables a ≤ 640 px con `celda-prioritaria`, sin scroll horizontal salvo `.tabla-contenedor` y las pestañas.

### 11.2 Glifos de resultado

| Valor | Texto | Glifo | Tono (alias, sección 12.2) |
| --- | --- | --- | --- |
| `EXITOSA` | Exitosa | `✓` | éxito |
| `CON_ERRORES` | Con errores | `◐` | ámbar |
| `INCOMPLETA` | Incompleta | `◔` | azul |
| `FALLIDA` | Fallida | `✕` | rojo |
| `INTERRUMPIDA` | Interrumpida | `■` | neutro |
| `EN_CURSO` | En curso | `↻` | azul |
| Fila `CREADA` | Creada | `+` | éxito |
| Fila `ACTUALIZADA` | Actualizada | `✎` | azul |
| Fila `OMITIDA` | Omitida | `–` | neutro |
| Fila `ERROR` | Error | `✕` | rojo |
| Advertencia | (texto del chip) | `!` | ámbar |
| Conexión `OK` / `FALLIDA` / `SIN_PROBAR` | Conectado / Falló la última prueba / Sin probar | `✓` / `✕` / `○` | éxito / rojo / neutro |
| Vista previa | Crear / Actualizar / Omitir / Error | `+` / `✎` / `–` / `✕` | ídem fila |

Los glifos son `aria-hidden`; el significado lo da el texto. Ninguno repite el triángulo `▲` del semáforo de riesgo.

---

## 12. Inventario

### 12.1 Componentes

**Reutilizados sin cambios:** `EncabezadoBandeja`, `AvisoSoloLectura`, `GrupoContadores`, `BloqueDatos`/`BloqueEstado`, `TarjetaMetrica` (con `clave`), `TablaBandeja`, `BarraFiltros`/`useFiltrosUrl`, `Paginacion`, `PestanasNav`, `MensajeExito`, `AccesoDenegado`, `RequireRole`, `Layout`, `useOpcionesCatalogo`, `.panel`, `.panel-cabecera`, `.historial-lista`, `.mensaje-aviso`, `.mensaje-error-global`, `.campo`, `.campo-error`, `.campo-ayuda`, `.boton*`, `.chips`, `.texto-huella`, `.esqueleto-fila`.

**Reutilizados con cambios compatibles:**

| Componente | Cambio |
| --- | --- |
| `Layout` | Ítem «Integraciones» del Administrador (`/admin/integraciones`, sin `end`) y del QE (`/qe/integraciones`, tras «Impedimentos») |
| `router.tsx` | Rutas de 2.1; las del Administrador bajo el mismo `RequireRole`; `/auditor/integraciones` bajo el del Auditor |
| `PestanasAuditor` | 6.ª pestaña «Integraciones» |
| `HduDetailPage` | Slot `PanelDescripcionHdu` entre `#certificado` y `#impedimentos` |
| `TablaBandeja` | Ninguno (usa `prioritaria` que ya existe) |

**Nuevos:**

| Componente | Función |
| --- | --- |
| `PaginaIntegraciones` + `PestanasIntegraciones` | Contenedor del Administrador: encabezado, pestañas y `Outlet` |
| `PaginaConexionJira` | Estado, formulario, mensajes y eventos |
| `FormularioConexionJira` | Los 8 campos, validación al pulsar, «Probar y guardar» / «Probar sin guardar» |
| `CampoToken` + `EstadoToken` | Campo de contraseña sin valor y texto «Configurado · termina en XXXX» |
| `ChipConexion` | `○ Sin probar`, `✓ Conectado`, `✕ Falló la última prueba` |
| `ErrorIntegracion` | Panel `role="alert"` con glifo, mensaje fijo por código, sugerencia y enlaces; lo usan Conexión (`error-conexion`), Sincronizar (`error-sincronizacion`), Importar (`error-archivo`) y Detalle (`error-ejecucion`) con su propio testid |
| `ListaEventosConfiguracion` | Últimos cambios (sin token) |
| `PaginaSincronizar` | Configuración, opciones, botones, espera, resultado |
| `PanelEsperaEjecucion` | Barra indeterminada + texto, `role="status"` |
| `ResultadoEjecucion` | Titular, `InsigniaResultado`, `ResumenEjecucion`, avisos (`aviso-incompleta`, `aviso-limite-tasa`, `mensaje-sin-cambios`, `aviso-vincular-sugerido`) y listas |
| `ResumenEjecucion` | Cinco contadores que suman + advertencias aparte |
| `AvisoIncompleta` | Texto por causa y `boton-continuar` / «Importar el mismo archivo» |
| `ListasFilasEjecucion` + `ListaFilasPorResultado` | Cuatro disclosures con carga bajo demanda y «Mostrar más» |
| `InsigniaResultado`, `InsigniaFilaEjecucion`, `InsigniaOrigen` | Glifo + texto + tono (sección 11.2) |
| `ChipsAdvertencias`, `CeldaCambios` | Chips `!` y `Campo: antes → después` |
| `PaginaImportar` | Orquesta el flujo de 6.1 |
| `PasosImportacion` | `<ol>` de 3 pasos |
| `SelectorArchivo` | Input nativo, validación de extensión y tamaño, nombre y tamaño, «Quitar archivo» |
| `VistaPreviaImportacion` | Contadores, aviso fijo, filtro, tabla paginada en cliente, aviso estricto, resumen de confirmación, botones |
| `VistaHistorial` | Historial completo y detalle; recibe `soloLectura` y `rutaBase` |
| `PanelUltimaEjecucion` | Dos tarjetas «Última ejecución» y «Última completada» |
| `TablaEjecuciones` | `lista-ejecuciones` |
| `DetalleEjecucion` | Cabecera, error global, resumen, filtro y `lista-detalle-ejecucion` |
| `PaginaQeIntegraciones` | Encabezado, aviso y `VistaHistorial` |
| `PanelAuditorIntegraciones` | Pestaña del Auditor sobre `VistaHistorial` |
| `PanelDescripcionHdu` | Sección «Descripción» con `Origen: …` y nota |
| `lib/mensajesIntegracion` y `lib/etiquetasIntegracion` | Tablas de las secciones 10 y 11.2 (mensajes, sugerencias, etiquetas de origen y resultado) |

### 12.2 Tokens

**Ningún token existente cambia ni se agrega un valor hexadecimal.** En `tokens.css` se agregan solo **alias** (nombres semánticos sobre los pares ya calculados en E4):

```
/* E5 · resultado de una ejecución o de una fila (texto / fondo; pares de E4 >= 5,5:1) */
--q360-color-res-exitosa:      var(--q360-color-imp-resuelto);   --q360-color-res-exitosa-suave:      var(--q360-color-imp-resuelto-suave);
--q360-color-res-con-errores:  var(--q360-color-imp-abierto);    --q360-color-res-con-errores-suave:  var(--q360-color-imp-abierto-suave);
--q360-color-res-incompleta:   var(--q360-color-imp-escalado);   --q360-color-res-incompleta-suave:   var(--q360-color-imp-escalado-suave);
--q360-color-res-fallida:      var(--q360-color-riesgo-alto);    --q360-color-res-fallida-suave:      var(--q360-color-riesgo-alto-suave);
--q360-color-res-neutra:       var(--q360-color-solo-lectura);   --q360-color-res-neutra-suave:       var(--q360-color-solo-lectura-suave);
/* Barra de espera indeterminada: relleno --q360-color-acento sobre pista --q360-color-borde (>= 3:1 como componente) */
```

Pares: éxito ≈ 8,4:1; ámbar ≈ 7:1; azul ≈ 7:1; rojo ≈ 7:1; neutro ≈ 8:1 (por inspección, igual salvedad que E4 §3.1; `q360-qa` los confirma con axe).

### 12.3 Clases CSS nuevas (`bandejas.css`/`global.css`; `integraciones.css` si se prefiere separar, como `impedimentos.css`)

`.badge-resultado` (+ `--exitosa|con-errores|incompleta|fallida|interrumpida|en-curso`), `.badge-fila-ejecucion` (+ `--creada|actualizada|omitida|error`), `.badge-origen`, `.chip-conexion` (+ `--ok|fallida|sin-probar`), `.chip-advertencia`, `.formulario-jira` (2 columnas a ≥ 900 px, 1 debajo), `.fieldset-integracion`, `.estado-token`, `.lista-eventos-config`, `.panel-resultado` (+ `--fallida|--incompleta` con borde izquierdo de 4 px, redundante con el texto), `.resumen-ejecucion` (rejilla de 5 + 1), `.resumen-ejecucion__aparte` (borde punteado), `.barra-espera` (sin animación con `prefers-reduced-motion`), `.pasos-importacion`, `.zona-archivo`, `.archivo-seleccionado`, `.vista-previa`, `.celda-cambios`, `.contadores-fila` (pares etiqueta/valor, 2 columnas ≤ 640 px), `.detalle-ejecucion__meta` (dl en rejilla; una columna ≤ 750 px), `.nota-origen`. Reglas ≤ 750 px: botones de formulario `width: 100%; min-height: var(--q360-objetivo-tactil)`; `.formulario-jira` en una columna. ≤ 640 px: `.tabla--apilable` con `.celda-prioritaria { order: -1 }` (ya existe).

---

## 13. `data-testid` propuestos

Se conservan todos los certificados y los nombres del backlog (sección 11 del backlog, marcados con *). Convención de E7: `contador-<clave>`, `estado-vacio|error|indisponible-<clave>`.

| Zona | Identificadores |
| --- | --- |
| Navegación | `pestana-conexion`*, `pestana-sincronizar`*, `pestana-importar`*, `pestana-historial`*, `pestana-integraciones` (Auditor), `pagina-integraciones`, `pagina-qe-integraciones`, `panel-integraciones` (Auditor) |
| Conexión | `form-jira`*, `campo-sitio`, `campo-correo`, `campo-token`*, `campo-proyecto`, `campo-tipos`, `campo-celula`, `campo-qe`, `campo-sprint`, `error-campo-<sitio\|correo\|token\|proyecto\|tipos\|celula\|qe\|sprint>`, `token-estado`* (`data-configurado`), `chip-conexion`* (`data-estado`), `texto-ultima-prueba`, `boton-probar-guardar`*, `boton-probar`, `mensaje-conexion-ok`, `error-conexion`* (`data-codigo`), `aviso-token-no-descifrable`, `aviso-integracion-deshabilitada`, `lista-eventos-configuracion`, `evento-configuracion-<id>`, `estado-vacio-eventos-configuracion` |
| Sincronizar | `resumen-ultima-sync`, `casilla-vincular`*, `aviso-vincular-activo`, `aviso-vincular-sugerido`, `boton-sincronizar`*, `boton-continuar`*, `boton-reintentar-sincronizacion`, `estado-sincronizando`, `aviso-en-curso`, `resultado-sincronizacion`, `resumen-ejecucion`*, `res-leidas`*, `res-creadas`*, `res-actualizadas`*, `res-omitidas`*, `res-con-error`*, `res-advertencias`*, `resultado-ejecucion`* (`data-resultado`), `mensaje-sin-cambios`*, `aviso-incompleta`*, `aviso-limite-tasa`, `error-sincronizacion`* (`data-codigo`), `enlace-importar-archivo`, `enlace-ir-conexion`, `enlace-ver-detalle-ejecucion`, `estado-vacio-jira`* |
| Listas del resultado | `lista-hdu-creadas`, `lista-hdu-actualizadas`, `lista-hdu-omitidas`, `lista-filas-con-error`, `boton-seccion-<creadas\|actualizadas\|omitidas\|error>`, `boton-ver-mas-<creadas\|actualizadas\|omitidas\|error>`, `fila-resultado-<n>`, `celda-cambios-<n>` |
| Importar | `pagina-importar`, `pasos-importacion`, `selector-archivo`*, `archivo-seleccionado`, `boton-quitar-archivo`, `enlace-plantilla-csv`, `casilla-estricto`*, `casilla-vincular`*, `estado-validando-archivo`, `error-archivo`* (`data-codigo`), `vista-previa`*, `vp-crear`, `vp-actualizar`, `vp-omitir`, `vp-con-error`, `vp-advertencias`, `aviso-actualizar-campos`, `filtro-vista-previa`, `tabla-vista-previa`, `fila-vista-previa-<n>`, `aviso-estricto`, `resumen-confirmacion`, `boton-importar`*, `boton-cancelar-importacion`, `estado-importando`, `boton-importar-de-nuevo`, `boton-importar-otro`, `resultado-importacion` |
| Historial | `ultima-ejecucion`*, `tarjeta-ultima-ejecucion`, `tarjeta-ultima-completada`, `lista-ejecuciones`*, `fila-ejecucion-<id>`, `celda-resultado-<id>`, `boton-ver-detalle-<id>`, `filtro-origen`, `filtro-resultado`, `filtro-desde`, `filtro-hasta`, `estado-vacio-historial`*, `estado-vacio-filtros-historial`, `estado-error-historial`*, `estado-indisponible-historial`*, `nota-integraciones-qe` |
| Detalle de ejecución | `detalle-ejecucion`*, `enlace-volver-historial`, `lista-detalle-ejecucion`, `fila-detalle-<n>`, `filtro-solo-errores`*, `filas-ocultas`*, `error-ejecucion` (`data-codigo`), `estado-vacio-detalle-ejecucion`, `estado-vacio-ejecucion` |
| Detalle de HDU | `seccion-descripcion-hdu`, `hdu-descripcion`, `hdu-origen`, `nota-origen-hdu`, `estado-vacio-descripcion` |

Repeticiones a acotar con `within(...)`: `casilla-vincular` (una por pestaña, nunca dos montadas a la vez), `resumen-ejecucion` y `res-*` (resultado de Sincronizar/Importar **o** detalle; no coinciden en una misma ruta), `resultado-ejecucion` (una vez por pantalla; en tablas se usa `celda-resultado-<id>`), `fila-detalle-<n>` (por página).

---

## 14. Conflictos y brechas con el backlog E5

1. **Descripción «después del checklist» vs. E4.** D108 y E4 piden el mismo lugar. Se resuelve así: checklist → Descripción y origen → Impedimentos → Riesgo → Cambiar estado (8.1). No cambia ningún testid certificado.
2. **El resultado de «Sincronizar» no trae filas.** El backlog pide listas de creadas/actualizadas/omitidas/con error, pero `POST /sincronizaciones` devuelve «la ejecución». El diseño las carga con `GET /ejecuciones/{id}/detalle?resultado=` (25 por vez). Requiere `ejecucionId` en la respuesta del POST, y `resultado` y paginación en el detalle (ya declarados). Alternativa: devolver las primeras filas en el POST.
3. **No hay progreso real.** Una sola petición de ~10 s, sin parciales ni cancelación: la espera es indeterminada y lo dice. Si se quisiera progreso, haría falta sondeo de `GET /ejecuciones/{id}` mientras `EN_CURSO` (el modelo ya lo permite) y un contador parcial; queda fuera de esta ronda.
4. **Petición cortada.** Si Vercel corta la función (504/red), el portal no sabe el resultado. Se agrega un código **solo del portal**, `SIN_RESPUESTA`, que remite al Historial y consulta `GET /estado`. El backlog no lo contempla; las pruebas no deben afirmar este código en el servidor.
5. **El token se vacía tras cada intento** (éxito o error). El backlog dice que el campo se ve vacío al reabrir, no qué pasa tras un intento fallido. Se elige vaciarlo para que nada del valor sobreviva en el DOM (E5-F01-T03 afirma que el texto no está «en la página»). Costo: en la primera configuración hay que volver a escribir el token tras un error. Si se prefiere conservarlo mientras el formulario esté abierto, el campo sigue siendo `password` y no se envía a ningún lado; es decisión de producto.
6. **`ORGANIZACION_NO_DISPONIBLE` no sugiere «Importar un archivo».** D105 dice que toda falla de Jira lo sugiere; esta no es de Jira y el archivo también escribe vía Organización, así que fallaría igual. Se ofrece «Reintentar».
7. **Ambas sugerencias en errores de credencial.** E5-F02-T06 espera el enlace a Conexión y D105 pide «Importar un archivo» siempre; se muestran los dos, con Conexión como acción principal.
8. **«Continuar» solo para Jira.** D96 define `continuarDesde` solo para Jira. Una importación `INCOMPLETA` no tiene botón «Continuar»: se vuelve a importar el mismo archivo (el portal conserva el archivo en memoria y ofrece «Importar el mismo archivo»). El backlog F03 no cubre `INCOMPLETA` de archivo; conviene un caso de prueba.
9. **Etiquetas faltantes.** La sección 4.1 no da etiqueta a `EN_CURSO` ni a `INTERRUMPIDA`: se proponen «En curso» e «Interrumpida». Tampoco hay mensajes en español para las **advertencias** (solo códigos): se proponen los textos de 7.3.
10. **Plantilla CSV sin endpoint.** El backlog pide un «enlace a una plantilla descargable». Se genera en el cliente (sin cambios de contrato). Incluye una fila de ejemplo `EJEMPLO-1`, con el riesgo de importarla sin editar; por eso lleva la indicación «Reemplaza esta fila».
11. **Mensaje del modo estricto.** El botón «Importar» queda habilitado con errores y modo estricto porque E5-F03-T08 exige registrar la ejecución `FALLIDA`; el aviso previo lo advierte. Mismo criterio para «nada que importar».
12. **Sprint de respaldo y célula.** El backlog dice que «E5 Sprint 1/2» están «en CEL-C» (los sprints pertenecen a una célula), pero el selector pide célula y sprint por separado. Si `GET sprints` expone la célula, el selector filtra por la célula elegida; si no, muestra todos y el servidor valida. Falta confirmar con `q360-arquitecto`. El QE por defecto necesita un listado de QE activos (usuarios con rol QE) accesible al Administrador.
13. **Sin confirmación al vincular en Sincronizar.** «Vincular» actualiza HDU hechas a mano y no deshace; el backlog no pide confirmación y E5-F03-T10 la tendría que atravesar. Se compensa con el aviso `aviso-vincular-activo` y, en importación, con la vista previa. Si se quiere un `DialogoConfirmacion` en Sincronizar, es un paso extra en E5-F02 y hay que avisar a `q360-qa`.
14. **Mensaje de ejecución en curso.** La restricción es una sola ejecución global (sincronizar o importar), pero el texto del backlog dice «Ya hay una sincronización en curso». En Sincronizar se conserva literal (E5-F02-T09); en Importar se usa «Ya hay una importación o sincronización en curso» (el testid `aviso-en-curso` es el mismo).
15. **«Última completada».** Se interpreta como `EXITOSA` o `CON_ERRORES` (F04 lo dice entre paréntesis); una `INCOMPLETA` no cuenta. Si debe contar, es un cambio de `GET /estado`.
16. **Auditor sin exportación.** El backlog no pide CSV para el historial; se mantiene así. El `AvisoSoloLectura` certificado del Auditor dice «consultar y exportar»: en esta pestaña no hay exportación; el texto es cert. y no se cambia.
17. **Detalle sin ruta propia.** D107 no menciona una ruta de detalle; se usa `?ejecucion=` (cliente). Si `q360-qa` prefiere una ruta, `/…/historial/:id` es equivalente y no cambia ningún testid.
18. **Pruebas certificadas afectadas (sección 9 del backlog).** Menú del Administrador y del QE (dato de la prueba), 6.ª pestaña del Auditor en E7-F06-T07 (recorrido sin `button[type=submit]`: este diseño lo cumple), y `HduDetailPage` con un bloque más entre el checklist y los impedimentos: las pruebas que cuenten secciones por posición, y no por testid, deben revisarse.
19. **Referencia de Jira (estado y responsable).** Se muestra solo en el detalle, en columna rotulada «no se guarda» (D101), para QE y Auditor también; no hay dato personal sensible más allá del nombre mostrado en Jira. Si no debe verlo el QE, es un ajuste de D106.
