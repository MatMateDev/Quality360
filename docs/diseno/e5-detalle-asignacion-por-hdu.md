# Diseño E5 · Detalle de la HDU y asignación una a una

Fecha: 2026-11-05. Complemento de `e5-consulta-asignacion.md` (diseño certificado de la consulta) y del backlog `docs/backlog/e5-detalle-asignacion-por-hdu.md` (E5-F06, E5-F07, ajustes a E5-F05; decisiones D196–D207). Solo diseño: sin código. Se reutilizan los tokens `--q360-*` de `apps/web/src/styles/tokens.css` y las clases de `integraciones.css`; no se crean colores nuevos.

Base actual: `TarjetaFilaNueva.tsx` (tarjeta con 4 selectores, estado, casilla «Incluir en la confirmación», guardado por cambio con `PATCH`), `SelectorAsignacion`, `DialogoConfirmacion` (foco atrapado, Esc, devuelve el foco), región `anuncios-consulta` (`role="status"`, `aria-live="polite"`) de `ConsultaAbierta.tsx`, `PanelDescripcionHdu`, `estadoDeFila` y `textoRechazoFila` de `lib/mensajesAsignacion.ts`.

## 1. Decisiones de diseño

| # | Decisión | Motivo |
| --- | --- | --- |
| 1 | El detalle es un **panel lateral modal** en escritorio (≥ 900 px) y una **hoja a pantalla completa** en móvil (≤ 640 px); entre 641 y 899 px es panel lateral de 90 % del ancho. No se usa «expandible en línea» | Una fila con 8.000 caracteres rompería la lista de 25 tarjetas y haría perder el contexto; el panel conserva la lista al fondo y permite «Anterior/Siguiente» (D207) |
| 2 | La tarjeta-fila **no se rehace**: se le agregan el botón «Ver detalle», el aviso de asignación automática, el botón «Confirmar asignación» y los estados «Creada» y «Ya asignada» | Cero regresión sobre lo certificado (E5-F05) |
| 3 | «Confirmar asignación» (por fila) y «Confirmar marcadas (N)» (lote) conviven; la casilla «Incluir en la confirmación» se mantiene para el lote | D203 |
| 4 | La alerta «ya asignada» es un **bloque fijo con borde, glifo y texto**, nunca solo color, y **bloquea** la edición de la fila | D204 |
| 5 | Todo texto de Jira se pinta como **texto** (React escapa; sin `dangerouslySetInnerHTML`), con `white-space: pre-wrap` y `overflow-wrap: anywhere` | D198 |
| 6 | Un solo alias de tono por significado: éxito = `--q360-color-exito`/`-suave`; ámbar = `--q360-color-alerta`/`-suave`; error = `--q360-color-error`/`-suave`; informativo = `--q360-color-acento-suave`/`-borde` | Pares ya calculados con contraste AA |

## 2. Panel de detalle de la HDU (E5-F06)

### 2.1 Apertura, cierre y navegación

- Disparador: botón secundario **«Ver detalle»** (`boton-ver-detalle`) en la línea 1 de la tarjeta (Nuevas) y en la fila/tarjeta de Cambiaron, Sin cambios y Con error. Nombre accesible: «Ver detalle de QTY-1». Enter sobre el código también abre (el código es un botón con aspecto de texto, `boton-ver-detalle` solo en el botón visible; el código usa `boton-codigo-<codigo>`).
- Contenedor: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` al título (`h2` «QTY-1 · <resumen>»), fondo oscurecido que no cierra al hacer clic si hay una acción en curso. Reutiliza la mecánica de `DialogoConfirmacion` (foco atrapado, Esc, devuelve el foco al botón de la fila; si la fila desapareció, al contenedor de la consulta).
- Foco inicial: el botón «Cerrar» (`boton-cerrar-detalle`), no el primer campo editable, para no activar selectores por accidente.
- Pie fijo **dentro del panel** (no sticky de página): «Anterior» (`boton-anterior`), «Siguiente sin asignar» (`boton-siguiente-sin-asignar`), «Cerrar». Al pasar a otra HDU el foco vuelve al título del panel y se anuncia «Detalle de QTY-2».
- Animación: deslizamiento de 150 ms; con `prefers-reduced-motion` aparece sin animar.

### 2.2 Wireframe 1280 (panel lateral de 520 px)

```
 ┌ lista de la consulta (atenuada, inerte) ─────┬ panel-detalle-hdu ─────────────────────────┐
 │                                              │ QTY-1 · Login con doble factor        [✕ Cerrar]│
 │                                              │ [+ Nueva] [Estado en Jira: En curso]            │
 │                                              │ ┌ alerta-hdu-ya-asignada (si corresponde) ────┐ │
 │                                              │ └──────────────────────────────────────────────┘ │
 │                                              │ Resumen                                          │
 │                                              │ Login con doble factor                           │
 │                                              │ ── Datos ───────────────────────────────────────│
 │                                              │ Estado        En curso   Tipo        Historia    │
 │                                              │ Prioridad     Alta en Jira → Alta en Quality360  │
 │                                              │ Responsable en Jira   Luis Pérez                 │
 │                                              │ Épica         QTY-100 · Autenticación            │
 │                                              │ Sprints       E5 Sprint 2 (Activo, 3 nov–17 nov) │
 │                                              │ Etiquetas     [seguridad] [login]  +3 más        │
 │                                              │ Fechas        Creada · Actualizada · Vence · Resuelta│
 │                                              │ ── Descripción ─────────────────────────────────│
 │                                              │ (texto plano, hasta 8.000, scroll interno)       │
 │                                              │ ── Criterios de aceptación ─────────────────────│
 │                                              │ (texto plano, origen: campo / descripción)       │
 │                                              │ [Abrir en Jira ↗]   Datos de Jira del 5 nov 10:32│
 │                                              │ ── Asignación (solo filas Nuevas) ──────────────│
 │                                              │ Célula · QE · Analista · Sprint · aviso · botón │
 │                                              │ ───────────────────────────────────────────────│
 │                                              │ [◀ Anterior] [Siguiente sin asignar ▶]  [Cerrar]│
 └──────────────────────────────────────────────┴──────────────────────────────────────────────────┘
```

### 2.3 Orden de los campos (también el orden del DOM y del foco)

1. Encabezado: código + resumen (`detalle-resumen`), chips de grupo («Nueva», «Cambió», «Sin cambios», «Con error») y estado en Jira (`detalle-estado`).
2. **Alerta de ya asignada** (si aplica), antes de todo lo demás: lo más importante para decidir.
3. Cuadrícula de datos cortos (lista de definición `dl`): Estado (`detalle-estado`), Tipo (`detalle-tipo`), Prioridad (`detalle-prioridad`: «<valor Jira> en Jira → <equivalente> en Quality360»), Responsable en Jira (`detalle-responsable`), Épica (`detalle-epica`), Sprints (`detalle-sprints`), Etiquetas (`detalle-etiquetas`), Fechas (`detalle-fechas`: Creada, Actualizada, Vencimiento, Resuelta; formato «5 nov 2026, 10:32», ausente = «—»).
4. Sección **Descripción** (`detalle-descripcion`).
5. Sección **Criterios de aceptación** (`detalle-criterios`).
6. Para «Cambiaron»: sección **Qué cambió** (reutiliza `CeldaCambios`, «Campo: antes → después»); para «Con error»: sección **Motivo del error**.
7. Pie de datos: «Abrir en Jira» (`enlace-abrir-jira`) y «Datos de Jira del <fecha y hora>».
8. Sección **Asignación** (solo filas Nuevas), con los mismos selectores y botón que la tarjeta (ver sección 3), para decidir sin cerrar.
9. Navegación: Anterior, Siguiente sin asignar, Cerrar.

Cada sección es un `h3`; en móvil las secciones Descripción y Criterios son disclosures (`<details>`) abiertos por defecto.

### 2.4 Descripciones y criterios largos, vacíos o saneados

| Caso | Presentación |
| --- | --- |
| Texto normal (≤ 1.200 caracteres) | Bloque completo, `pre-wrap`, fuente del portal, `max-width: 70ch` |
| Texto largo (> 1.200 caracteres, hasta 8.000) | Se muestran las primeras ~12 líneas (alto máx. 14 rem, `overflow: hidden`) con degradado y botón «Ver todo» (`aria-expanded`, `aria-controls`); al expandir, el bloque queda con `max-height: 50vh` y **scroll interno** con `tabindex="0"` y `aria-label` «Descripción completa de QTY-1» para que el teclado pueda desplazarlo |
| Recortado por el límite (`truncado: true`) | Aviso `aviso-texto-recortado` bajo el texto: «Texto recortado; ver completo en Jira» con enlace a Jira |
| Palabra o URL larga sin espacios | `overflow-wrap: anywhere`; nunca scroll horizontal |
| Vacío (`null`) | Tarjeta atenuada con texto «Sin descripción en Jira» / «Sin criterios de aceptación en Jira» (nunca sección en blanco ni omitida) |
| Criterios tomados de la descripción | Etiqueta pequeña «Tomados de la descripción» junto al `h3` (origen `DESCRIPCION`); si vienen del campo, sin etiqueta |
| Contenido saneado | Listas se ven como listas con sangría (texto con «• » / «1. » conservado), tablas como líneas «celda · celda»; `[contenido no mostrable]` se pinta en cursiva y gris `--q360-color-texto-secundario` con `title` «Imagen, macro o extensión que Quality360 no muestra»; `<script>`, `<b>` y `=cmd` se ven literales |
| Enlaces | Solo `http(s)` clicables (`rel="noopener noreferrer"`, `target="_blank"`, texto + «(se abre en otra pestaña)» en `sr-only`); `javascript:` queda como texto plano |
| Etiquetas | Chips; más de 8 se agrupan: «+N más» (botón que expande); tope 20 y `etiquetasTotal` si hay más: «+N más en Jira» |
| Sprints | Una línea por sprint: «Nombre (Estado, inicio–fin)»; hasta 10 |
| Épica | «QTY-100 · Título» (200 máx. con `texto-largo`); ausente: «Sin épica en Jira» |
| Fechas ausentes o inválidas | «—» |

### 2.5 Enlace a Jira

`enlace-abrir-jira`: botón secundario «Abrir en Jira ↗», `target="_blank"`, `rel="noopener noreferrer"`, nombre accesible «Abrir QTY-1 en Jira (se abre en otra pestaña)». Si no hay `urlJira`, se oculta y no se deja un enlace roto. No llama a Jira desde Quality360.

### 2.6 Móvil (375 px)

- La hoja ocupa 100 % del ancho y alto (`100dvh`); encabezado con código, título y «Cerrar» (44 × 44 px) arriba; contenido con scroll vertical interno; la navegación Anterior/Siguiente queda al final del contenido (sin `position: fixed`, coherente con el diseño base).
- Datos cortos en una columna: etiqueta encima, valor debajo (`dl` apilada).
- Selectores del panel a ancho completo, alto ≥ 44 px; botón «Confirmar asignación» a ancho completo.
- Anti-desborde: `document.documentElement.scrollWidth <= 375` con el panel abierto; QA prueba título de 200 caracteres sin espacios, descripción de 8.000, 25 etiquetas y sprint de 80.

### 2.7 Estados del panel

| Estado | Presentación |
| --- | --- |
| Cargando | Esqueleto (`--q360-color-esqueleto`) con `aria-busy="true"` y texto sr-only «Cargando detalle de QTY-1…»; el encabezado (código y título) ya se ve porque viene de la fila |
| Error al cargar | `error-detalle`, `role="alert"`: «No se pudo cargar el detalle» + «Reintentar» (`boton-reintentar-detalle`); la lista sigue usable |
| Consulta anterior al detalle (`detalle: null`) | `aviso-detalle-antiguo` (informativo): «Consulta anterior al detalle completo; consulta Jira de nuevo». Se ve lo que hay de la fila |
| Consulta vencida, reemplazada o descartada | El panel se cierra, se limpia el texto de Jira de pantalla y aparece `aviso-consulta-vencida` (el de E5-F05 #8) con «Consultar Jira» |
| Sin permiso (403) | El panel no existe para otros roles; si llega la respuesta, el aviso «No tienes permiso para esta acción» |

## 3. Tarjeta-fila ampliada (Nuevas)

### 3.1 Wireframe 1280

```
 ┌ fila-QTY-1 · data-completa="true" ──────────────────────────────────────────────────────────────┐
 │ ☐ Seleccionar   QTY-1  Login con doble factor        Prioridad: Alta          [Ver detalle]       │
 │   Sprint en Jira: E5 Sprint 2    [+ Nueva] [Creada por Jira]                                      │
 │   Célula [CEL-C ▾]  QE responsable [Marta Díaz ▾]  Analista QA [Ana Rojas ▾]  Sprint [E5 Sprint 2 ▾]│
 │   ⓘ Asignado automáticamente: único analista de Marta Díaz            (aviso-analista-automatico) │
 │   [Sprint de Jira]                                                                                 │
 │   Estado: [✓ Lista]  ☐ Incluir en la confirmación   Guardado        [ Confirmar asignación ]       │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Cambios sobre la tarjeta certificada (orden de DOM y de foco): Seleccionar → [Ver detalle] → Célula → QE → Analista → Sprint → (Reintentar de guardado) → Incluir en la confirmación → **Confirmar asignación**. El botón va al final de la fila (a la derecha en escritorio, ancho completo en móvil) porque es la acción de cierre de la fila.

### 3.2 Selector de QE y lista de Analista filtrada por supervisión

| Situación | Selector de Analista | Texto de ayuda / aviso | Estado de la fila |
| --- | --- | --- | --- |
| Sin QE | Deshabilitado, «Elige primero un QE» (existente) | `aria-describedby` con el motivo | Incompleta (falta: …) |
| QE con 2 o más analistas activos | Habilitado; **solo** lista los analistas con supervisión vigente y activos (catálogo `supervisorId`, D147); valor vacío «Elige…» | `ayuda-elige-analista`: «Elige un analista del equipo de <QE>» | Incompleta (falta: analista) |
| QE con exactamente 1 analista activo | Habilitado; ya muestra a ese analista elegido (sigue pudiendo cambiarse solo si hubiera otro, es decir, no cambia: la lista tiene una opción) | `aviso-analista-automatico` (informativo, visible, no solo en `aria-live`): «Asignado automáticamente: único analista de <QE>» | Lista (si célula y sprint están) |
| QE con 0 analistas o único inactivo | Habilitado pero **vacío**, sin opciones; opción «Sin analistas disponibles» como texto de apoyo, no como valor | `ayuda-sin-analistas` (ámbar): «Este QE no tiene analistas activos en su equipo. Elige otro QE.» | Incompleta (falta: analista); «Confirmar asignación» deshabilitado con motivo |
| Cambia el QE (con analista previo) | Se limpia; si el nuevo QE tiene uno solo, se reasigna automáticamente | Se anuncia lo que ocurrió: «Se limpió el analista: elige uno del equipo de <QE>» o «Asignado automáticamente: único analista de <QE>» (una sola frase, nunca ambas) | Se recalcula |
| Analista elegido a mano | Valor propio | El aviso automático **desaparece** (el chip solo vale mientras el valor lo puso el sistema, `analistaAuto`) | Se recalcula |

**Aviso de asignación automática (`aviso-analista-automatico`).**
- Aspecto: línea con glifo `ⓘ` (`aria-hidden`), fondo `--q360-color-acento-suave`, borde `--q360-color-acento-suave-borde`, texto `--q360-color-texto`; no usa solo color.
- Texto fijo: «Asignado automáticamente: único analista de <QE>». Ayuda extra bajo el selector (`aria-describedby`): «Puedes cambiarlo si el equipo de <QE> cambia.» solo cuando haya otra opción; con una sola opción no se ofrece.
- Anuncio: una vez, en `anuncios-consulta` (`aria-live="polite"`): «Analista asignado automáticamente: <Analista>, único del equipo de <QE>». El aviso visual permanece mientras la fila no cambie de QE; sobrevive a recargas porque viene de `analistaAuto`.

**Estado vacío «este QE no supervisa analistas» (`ayuda-sin-analistas`).**
- Texto: «Este QE no supervisa analistas activos. Elige otro QE.» (variante de la certificada «Este QE no tiene analistas en su equipo»; ver sección 9 sobre el cambio de texto).
- Aspecto: ámbar (`--q360-color-alerta-suave`, glifo `!`), bajo el selector. El select de Analista queda habilitado pero sin opciones; el motivo de la casilla «Incluir» y del botón «Confirmar asignación» lo repiten en `aria-describedby`: «No se puede confirmar: el QE no tiene analistas activos».
- Si el único supervisado está inactivo: mismo texto; no se lista al inactivo.

### 3.3 Estados de la fila (suma a la tabla de §4.3 del diseño base)

| Estado | Texto | Glifo | Tono | Edición | Botón «Confirmar asignación» |
| --- | --- | --- | --- | --- | --- |
| Sin asignar / Incompleta | como hoy | `○` / `◐` | neutro / ámbar | sí | deshabilitado |
| Lista | «Lista» | `✓` | éxito | sí | habilitado |
| Confirmando | «Confirmando…» | `…` | neutro | selectores `aria-busy` y deshabilitados | deshabilitado, texto «Confirmando…» |
| **Creada** | «Creada» | `✓` | éxito | **solo lectura** | no existe; se reemplaza por el enlace «Ir a la HDU» |
| **Ya asignada** | «Ya asignada» | `!` | ámbar | **solo lectura** | no existe |
| Error al confirmar | «No se pudo confirmar» | `✕` | rojo | sí (según el error) | habilitado tras el error (reintento) |

`fila-<codigo>` suma `data-estado="sin-asignar|incompleta|lista|confirmando|creada|ya-asignada|error"`; `data-completa` y `data-marcada` se mantienen.

## 4. Botón «Confirmar asignación» por fila

### 4.1 Estados y microcopy

| Estado | Aspecto | Texto del botón | Notas de accesibilidad |
| --- | --- | --- | --- |
| Deshabilitado por incompleta | `boton boton--primario` con `aria-disabled="true"` (no `disabled`, para que el foco llegue y se lea el motivo) y opacidad estándar del portal | «Confirmar asignación» | `aria-describedby` → `motivo-confirmar-<codigo>` visible bajo el botón: «Falta: analista» (misma función `textoFalta`); si el QE no tiene analistas: «No se puede confirmar: el QE no tiene analistas activos» |
| Habilitado | `boton--primario` | «Confirmar asignación» | Nombre accesible «Confirmar asignación de QTY-1» (empieza por el texto visible, WCAG 2.5.3) |
| Cargando | Mismo botón con `aria-disabled="true"`, `aria-busy`, indicador de progreso en CSS (sin animar con reduced-motion) | «Confirmando…» | El doble clic no dispara dos solicitudes (el segundo clic se ignora mientras `confirmando`) |
| Confirmada | El botón se reemplaza por un bloque `chip-creada` | «✓ Creada» + «Asignada a <QE> / <Analista>» + enlace «Ir a la HDU» | Ver 4.2 |
| Error | El botón vuelve a habilitarse; bajo él `error-confirmar-asignacion` | «Confirmar asignación» (reintento) o «Reintentar» según el error | Ver 4.3 |

### 4.2 Confirmada (creada, solo lectura)

```
 │ Estado: [✓ Creada]   Asignada a Marta Díaz / Ana Rojas     [ Ir a la HDU ↗ ] (enlace-ir-a-hdu)    │
 │ Célula CEL-C · Sprint E5 Sprint 2 (texto, ya no selectores)                                         │
```

- La fila pasa a tarjeta de **solo lectura**: los 4 selectores se sustituyen por texto (`dl`), se quitan «Incluir en la confirmación» y «Seleccionar» pasa a `disabled`. Fondo `--q360-color-exito-suave`, borde izquierdo de 4 px `--q360-color-exito`.
- `enlace-ir-a-hdu`: enlace a la gestión de HDU de la HDU creada (`/hdu/<idHistoria>`, misma pestaña); nombre accesible «Ir a la HDU QTY-1 en Quality360». No es un `target=_blank`.
- Anuncio (`anuncios-consulta`, polite): «HDU QTY-1 creada: asignada a Marta Díaz / Ana Rojas».
- **Foco:** pasa al botón «Ver detalle» de la **siguiente fila nueva sin asignar** de la página; si no hay más, al `h3` del grupo; si el panel de detalle estaba abierto, al botón «Siguiente sin asignar» (o al título del panel si no queda ninguna). Nunca queda el foco en un elemento que desapareció.
- Contadores: el resumen de la consulta pasa a «N creadas» (E5-F07 #4) y el grupo «Nuevas» sigue mostrando la fila con el chip.

### 4.3 Errores

| Código / situación | Dónde se ve | Texto | Efecto |
| --- | --- | --- | --- |
| `ASIGNACION_INCOMPLETA` (422) | `error-confirmar-asignacion` bajo el botón, `role="alert"` | «Falta: analista.» (lista exacta) | La fila vuelve a Incompleta |
| `ASIGNACIONES_INVALIDAS` (409) | Bajo el botón, `role="alert"` | «<Analista> ya no está disponible.» / «<Analista> ya no pertenece al equipo de <QE>.» / «El QE responsable ya no está disponible.» (`textoRechazoFila`) | Se limpia el campo afectado; la fila vuelve a Incompleta |
| `HDU_YA_ASIGNADA` (409) | Pasa a la **alerta** de la sección 5 con nombres actuales | Ver 5 | Fila de solo lectura |
| `FILA_MODIFICADA` (409) | `aviso-fila-modificada`, `role="alert"` | «Otra persona modificó esta HDU. Revisa los datos actuales y confirma de nuevo.» | Se refresca la fila con lo vigente; el botón queda habilitado si sigue lista |
| `FILA_EN_CURSO` (409) | Bajo el botón, `role="alert"` | «Otra persona está confirmando esta HDU ahora. Espera unos segundos y revisa.» | Botón habilitado tras 5 s (reintento manual) |
| Falla de red / 503 `ORGANIZACION_NO_DISPONIBLE` | Bajo el botón, `role="alert"` | «No se pudo confirmar. Revisa tu conexión e inténtalo de nuevo.» + botón «Reintentar» (`boton-reintentar-confirmacion-<codigo>`) | La fila queda intacta; reintentar es idempotente |
| `CONSULTA_VENCIDA` (410) / `CONSULTA_NO_ABIERTA` (409) | `aviso-consulta-vencida` de la consulta | Los textos certificados de E5-F05 #8 | No se crea nada; se ofrece «Consultar Jira»; lo ya creado se conserva |
| 403 | Aviso de permiso global | «No tienes permiso para esta acción.» | — |

El error ocupa su propia línea bajo el botón, con glifo `✕`, fondo `--q360-color-error-suave` y texto `--q360-color-error-texto`; el foco se mantiene en el botón (no se roba el foco); el lector lo anuncia por `role="alert"`.

### 4.4 Coexistencia con «Confirmar marcadas (N)»

- «Confirmar marcadas (N)» (`boton-confirmar`) permanece en el resumen previo al final de la consulta, con su diálogo certificado. N cuenta solo filas **marcadas, completas y no creadas**; las ya creadas una a una no cuentan ni dan error.
- Visualmente jerarquizados: «Confirmar asignación» es primario **dentro de la fila**; «Confirmar marcadas (N)» es primario **del resumen**. Nunca se muestran juntos en el mismo contenedor; en el resumen un texto fijo lo explica: «Las HDU que ya confirmaste una a una se conservan y no se repiten.»
- Una fila que se confirma por fila queda con la casilla «Incluir» desmarcada y deshabilitada (no puede entrar al lote).
- Mientras hay una confirmación grupal en curso, todos los «Confirmar asignación» quedan `aria-disabled` con el motivo «Hay una confirmación grupal en curso»; mientras una fila se confirma, el lote sigue disponible (D202 no toma el candado global), pero omite esa fila.
- Cuando ya hay HDU creadas, «Descartar consulta» pasa a **«Terminar revisión»** (`boton-terminar-revision`) con diálogo: título «¿Terminar la revisión?», cuerpo «N HDU ya creadas se conservan; M filas sin confirmar se perderán.», botones «Seguir revisando» (seguro, foco inicial) y «Terminar revisión».
- Resultado de «Confirmar marcadas»: se mantiene el certificado, más la línea «N HDU ya estaban creadas y no se repitieron» si corresponde.

## 5. Alerta «Esta HDU ya fue asignada a <QE> / <Analista>»

### 5.1 Nivel visual y texto

- Nivel: **advertencia que bloquea** (ámbar), no error: nada falló, la acción no corresponde. Fondo `--q360-color-alerta-suave`, borde de 1 px más borde izquierdo de 4 px `--q360-color-atencion-borde`, texto `--q360-color-texto` (≥ 7:1), glifo `!` en un círculo (`aria-hidden`). Se apoya en el título en negrita, no en el color.
- `alerta-hdu-ya-asignada` con `role="alert"` cuando **aparece** durante la sesión (por `HDU_YA_ASIGNADA` al confirmar o al refrescar una fila); si ya viene en el listado inicial, se pinta como `role="note"` para no producir decenas de anuncios asertivos al cargar la lista. Atributos `data-qe` y `data-analista`.
- Texto principal (en `<strong>`): **«Esta HDU ya fue asignada a <QE> / <Analista>»**. Sin Analista: **«Esta HDU ya fue asignada a <QE> / sin Analista»**. Los nombres se interpolan como texto y con `overflow-wrap: anywhere`.
- Texto secundario: «No se puede reasignar desde la consulta. Para cambiar el QE o el analista, hazlo en la gestión de HDU.»
- Enlace `enlace-ir-a-hdu`: «Ir a la HDU» (misma pestaña, nombre accesible «Ir a la HDU QTY-1 para reasignarla»).

### 5.2 Bloqueo

Mientras la alerta existe: los 4 selectores se muestran como texto de solo lectura (no `disabled` vacíos, para que el lector lea los valores), no hay «Confirmar asignación», la casilla «Incluir en la confirmación» no aparece en filas Nuevas (en Cambiaron se conserva, pues marcar para actualizar título/descripción/prioridad sigue permitido) y el estado de la fila dice «Ya asignada» (`!`, ámbar).

### 5.3 En la lista

```
 ┌ fila-QTY-5 · data-estado="ya-asignada" ─────────────────────────────────────────────────────────┐
 │ ☐ Seleccionar   QTY-5  Notificaciones push                                  [Ver detalle]       │
 │   [+ Nueva]  [Creada a mano]                                                                     │
 │ ┌ alerta-hdu-ya-asignada ──────────────────────────────────────────────────────────────────┐     │
 │ │ !  Esta HDU ya fue asignada a Marta Díaz / sin Analista                                   │     │
 │ │    No se puede reasignar desde la consulta. Hazlo en la gestión de HDU.  [ Ir a la HDU ↗ ]│     │
 │ └───────────────────────────────────────────────────────────────────────────────────────────┘     │
 │   Célula: CEL-C · QE: Marta Díaz · Analista: —  · Sprint: —            Estado: [! Ya asignada]    │
 └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- En **Cambiaron** y **Sin cambios** (tablas): bajo el título aparece la misma alerta en versión compacta (una línea con el texto principal y el enlace); en 375 px es la segunda línea de la tarjeta apilada, justo después de Código y Título.
- Orden en listas mixtas: la alerta no cambia el orden de las filas; el grupo conserva su contador. Un chip `!` «Ya asignada» en el encabezado del grupo indica cuántas hay: «3 ya asignadas» (texto en `contadores-consulta`).

### 5.4 En el panel de detalle

La alerta va **arriba del contenido** (pos. 2 del orden, sección 2.3), en tamaño completo con el texto secundario y el enlace; la sección «Asignación» del panel muestra los valores en solo lectura y no tiene botón. Al abrir el panel con alerta, el lector la lee tras el título (al estar antes en el DOM).

### 5.5 Carrera (se asignó mientras revisaba)

Al pulsar «Confirmar asignación» y recibir `HDU_YA_ASIGNADA` (409): no se crea nada, la tarjeta pasa a «Ya asignada» con los nombres **actuales**, se anuncia con `role="alert"` «QTY-1 ya fue asignada a <QE> / <Analista>. No se creó nada.» y el foco queda en el título de la alerta (`tabIndex=-1`).

## 6. Microcopy final (español de Chile neutro)

| Elemento | Texto |
| --- | --- |
| Botón de fila | «Ver detalle» · nombre accesible «Ver detalle de QTY-1» |
| Botón confirmar fila | «Confirmar asignación» / «Confirmando…» |
| Motivo deshabilitado | «Falta: analista» · «Falta: célula y sprint» · «No se puede confirmar: el QE no tiene analistas activos» · «Hay una confirmación grupal en curso» |
| Estado creada | «Creada» · «Asignada a <QE> / <Analista>» · enlace «Ir a la HDU» |
| Anuncio creada | «HDU QTY-1 creada: asignada a <QE> / <Analista>» |
| Analista automático | «Asignado automáticamente: único analista de <QE>» · anuncio «Analista asignado automáticamente: <Analista>, único del equipo de <QE>» |
| Sin analistas | «Este QE no supervisa analistas activos. Elige otro QE.» |
| Elegir analista | «Elige un analista del equipo de <QE>» |
| Cambio de QE | «Se limpió el analista: elige uno del equipo de <QE>» |
| Alerta ya asignada | «Esta HDU ya fue asignada a <QE> / <Analista>» · «Esta HDU ya fue asignada a <QE> / sin Analista» |
| Apoyo de la alerta | «No se puede reasignar desde la consulta. Para cambiar el QE o el analista, hazlo en la gestión de HDU.» |
| Carrera | «QTY-1 ya fue asignada a <QE> / <Analista>. No se creó nada.» |
| Fila modificada | «Otra persona modificó esta HDU. Revisa los datos actuales y confirma de nuevo.» |
| Fila en curso | «Otra persona está confirmando esta HDU ahora. Espera unos segundos y revisa.» |
| Falla | «No se pudo confirmar. Revisa tu conexión e inténtalo de nuevo.» · «Reintentar» |
| Analista inválido | «<Analista> ya no está disponible.» · «<Analista> ya no pertenece al equipo de <QE>.» |
| Lote | «Confirmar marcadas (N)» · «Las HDU que ya confirmaste una a una se conservan y no se repiten.» · «N HDU ya estaban creadas y no se repitieron» |
| Terminar revisión | «Terminar revisión» · título «¿Terminar la revisión?» · «N HDU ya creadas se conservan; M filas sin confirmar se perderán.» · «Seguir revisando» |
| Panel: títulos | «Detalle de la HDU» (nombre del diálogo, sr-only) · «Descripción» · «Criterios de aceptación» · «Asignación» · «Qué cambió» · «Motivo del error» |
| Panel: vacíos | «Sin descripción en Jira» · «Sin criterios de aceptación en Jira» · «Sin etiquetas en Jira» · «Sin épica en Jira» · «Sin sprint en Jira» · «Sin responsable en Jira» · «—» (fecha) |
| Panel: avisos | «Texto recortado; ver completo en Jira» · «Consulta anterior al detalle completo; consulta Jira de nuevo» · «Tomados de la descripción» · «[contenido no mostrable]» |
| Panel: carga/error | «Cargando detalle de QTY-1…» · «No se pudo cargar el detalle» · «Reintentar» |
| Panel: pie | «Abrir en Jira» · «Datos de Jira del <fecha y hora>» · «Anterior» · «Siguiente sin asignar» · «Cerrar» · anuncio «Detalle de QTY-2» |
| Etiquetas | «Ver todo» / «Ver menos» · «+N más» |

## 7. Accesibilidad

**Foco.**
- Abrir el panel: foco a «Cerrar»; trampa de foco; Esc cierra; al cerrar vuelve a «Ver detalle» de la fila (o al contenedor si la fila ya no existe). El resto de la página queda `inert` y `aria-hidden` detrás del panel.
- Tras confirmar: foco a la siguiente fila nueva sin asignar (`boton-ver-detalle` de esa fila) o al `h3` del grupo (sección 4.2). Tras un error: el foco no se mueve (queda en el botón). Tras una carrera `HDU_YA_ASIGNADA`: al título de la alerta.
- Indicador de foco visible ≥ 2 px (`--q360-foco-color`, `--q360-foco-sombra`) y no tapado: el pie del panel no es sticky sobre el contenido (sin `position: fixed/sticky`), el panel mismo es el único elemento superpuesto.

**Regiones en vivo.**
- `anuncios-consulta` (`role="status"`, `aria-live="polite"`, `aria-atomic`) para: analista asignado automáticamente, HDU creada, «Detalle de QTY-2», «Texto expandido». Mensajes cortos y sin repetir (si hay 3 creadas en 2 s, se fusionan: «3 HDU creadas»).
- `role="alert"` solo para: `alerta-hdu-ya-asignada` cuando aparece en sesión, `error-confirmar-asignacion`, `aviso-fila-modificada`, `error-detalle`, `aviso-consulta-vencida`. La alerta presente desde la carga usa `role="note"` (sección 5.1).
- Nunca `aria-live` por tecla ni por cada apertura de selector.

**Teclado.** Todo se opera sin ratón: Tab/Shift+Tab en el orden del DOM (sección 3.1), Enter/Espacio en botones, Esc en panel y diálogos, flechas en `select`. «Ver todo» y el scroll interno del texto largo son alcanzables (`tabindex="0"`). Sin atajos que choquen con lectores de pantalla.

**Nombres y descripciones.** Cada botón repetido por fila lleva el código en el nombre accesible empezando por el texto visible (WCAG 2.5.3). Los motivos de deshabilitado van en `aria-describedby` y se usan `aria-disabled` en vez de `disabled` para el botón de confirmar (queda en el orden de tabulación y se lee el motivo). Los estados son texto + glifo `aria-hidden`; el color nunca es el único canal.

**Contraste.** Solo se usan los alias existentes: texto `--q360-color-texto` (#172033) sobre `-suave` ≥ 7:1; ámbar `--q360-color-alerta` (#8a5a00) sobre `--q360-color-alerta-suave` (#fff3d6); error `--q360-color-error-texto` sobre `--q360-color-error-suave`; los bordes de 4 px usan `--q360-color-atencion-borde`/`-exito`/`-error` (no portadores de significado único, ≥ 3:1). El texto gris `[contenido no mostrable]` usa `--q360-color-texto-secundario` (#566174) y no baja de 4,5:1. `q360-qa` confirma con axe en: panel abierto, alerta visible, error de confirmación y fila creada, en 1280 y 375, sin hallazgos serious/critical.

**Objetivos y 375 px.**
- Controles ≥ `--q360-objetivo-tactil` (44 px), separación ≥ 8 px entre botones y casillas.
- A 375 px: tarjeta-fila apilada (Seleccionar → código/título → Ver detalle → selectores 1 columna → aviso automático → estado → «Confirmar asignación» a ancho completo); la alerta de ya asignada ocupa todo el ancho, con el enlace «Ir a la HDU» como botón de 44 px debajo del texto; el panel es hoja completa; `document.documentElement.scrollWidth <= 375` en todos los estados; sin scroll horizontal.
- `prefers-reduced-motion`: sin deslizamiento del panel, sin spinner animado (se muestra «Confirmando…» como texto), sin transición de «Guardado».

## 8. `data-testid` nuevos

| `data-testid` | Elemento |
| --- | --- |
| `boton-ver-detalle` | Botón «Ver detalle» en cada fila (la fila ya lleva `fila-<codigo>`; se busca dentro) |
| `boton-codigo-<codigo>` | El código de la fila como botón que abre el detalle |
| `panel-detalle-hdu` | Contenedor del panel (`role="dialog"`; `data-codigo`) |
| `detalle-resumen`, `detalle-descripcion`, `detalle-criterios` | Resumen y secciones de texto |
| `detalle-estado`, `detalle-prioridad`, `detalle-tipo`, `detalle-responsable`, `detalle-etiquetas`, `detalle-sprints`, `detalle-epica`, `detalle-fechas` | Datos cortos |
| `detalle-vacio-<seccion>` | Texto «Sin <campo> en Jira» de una sección vacía (`descripcion`, `criterios`, `etiquetas`, `epica`, `sprints`, `responsable`) |
| `boton-ver-todo-<seccion>` | «Ver todo» / «Ver menos» de descripción o criterios |
| `enlace-abrir-jira` | «Abrir en Jira» |
| `aviso-texto-recortado` | «Texto recortado; ver completo en Jira» |
| `aviso-detalle-antiguo` | Consulta anterior al detalle completo |
| `cargando-detalle`, `error-detalle`, `boton-reintentar-detalle` | Carga y error del panel |
| `boton-anterior`, `boton-siguiente-sin-asignar`, `boton-cerrar-detalle` | Navegación del panel |
| `aviso-analista-automatico` | Aviso «Asignado automáticamente…» (`data-analista`) |
| `ayuda-elige-analista`, `ayuda-sin-analistas` | Existentes; se mantienen con el texto nuevo |
| `boton-confirmar-asignacion` | Botón «Confirmar asignación» por fila y dentro del panel (en el panel, `data-origen="panel"`). La solicitud de diseño sugería `boton-confirmar-fila`; se usa el nombre del backlog (E5-F07) para no duplicar identificadores |
| `motivo-confirmar-<codigo>` | Motivo visible del botón deshabilitado |
| `chip-creada` | Estado «Creada» con «Asignada a …» (`data-qe`, `data-analista`) |
| `enlace-ir-a-hdu` | «Ir a la HDU» (en fila creada y en la alerta) |
| `alerta-hdu-ya-asignada` | Alerta (`data-qe`, `data-analista`, `data-id-historia`) |
| `error-confirmar-asignacion` | Error bajo el botón (`data-codigo-error`) |
| `boton-reintentar-confirmacion-<codigo>` | «Reintentar» tras falla de red |
| `aviso-fila-modificada` | «Otra persona modificó esta HDU…» |
| `aviso-fila-en-curso` | «Otra persona está confirmando…» |
| `boton-confirmar` | Existente; texto «Confirmar marcadas (N)» |
| `boton-terminar-revision`, `dialogo-terminar-revision` | «Terminar revisión» y su diálogo |
| `contador-ya-asignadas` | «N ya asignadas» en el encabezado del grupo |

`fila-<codigo>` suma `data-estado`; `estado-fila` suma las clases `estado-fila--creada` y `estado-fila--ya-asignada`.

## 9. Inventario de cambios para `q360-frontend`

| Componente | Cambio |
| --- | --- |
| `TarjetaFilaNueva` | Botón «Ver detalle», `aviso-analista-automatico`, botón «Confirmar asignación», estados Creada/Ya asignada/Confirmando/Error, modo solo lectura de fila creada, `data-estado` |
| `PanelDetalleHdu` (nuevo) | Panel modal con secciones de la sección 2; reutiliza la mecánica de `DialogoConfirmacion`; incluye la sección «Asignación» compartida con la tarjeta |
| `TextoLargoExpandible` (nuevo) | Bloque de descripción/criterios con «Ver todo», scroll interno y aviso de recorte |
| `AlertaHduYaAsignada` (nuevo) | Variante completa (panel), de fila y compacta (tablas); `role` según aparezca en sesión o venga cargada |
| `ResumenConfirmacion`, `ConsultaAbierta` | «Confirmar marcadas (N)», texto de coexistencia, «Terminar revisión» y su diálogo, N sin filas creadas |
| `GrupoConsulta`, tablas Cambiaron / Sin cambios | Alerta compacta, botón «Ver detalle», `contador-ya-asignadas` |
| `lib/mensajesAsignacion.ts` | Textos de la sección 6 como funciones (`textoAnalistaAutomatico`, `textoYaAsignada`, `textoCreada`, …) |
| `integraciones.css` | `.panel-detalle` (+ `__cabecera`, `__datos`, `__texto`, `__pie`), `.alerta-ya-asignada`, `.aviso-automatico`, `.fila-asignacion--creada|ya-asignada`; ninguna con `position: fixed/sticky` salvo el propio panel superpuesto y su fondo |

**Cambio de texto a coordinar con QA:** «Este QE no tiene analistas en su equipo» (certificado) pasa a «Este QE no supervisa analistas activos» para alinear con el backlog («este QE no supervisa analistas»). Las pruebas que lo leen (`ayuda-sin-analistas`) deben ajustarse.

## 10. Supuestos y puntos para confirmar

1. El panel se ofrece a todas las filas, no solo a Nuevas; los controles de asignación solo aparecen en las Nuevas sin dueño.
2. «Ir a la HDU» navega a la ruta de gestión de HDU existente; si no existe una ruta por `idHistoria`, `q360-frontend` usa la de E2 con filtro por código y se avisa al arquitecto.
3. La alerta presente al cargar la lista usa `role="note"` y no `alert` para no inundar al lector con anuncios asertivos; la alerta que aparece por un evento usa `role="alert"` (E5-F07 #5–#6).
4. El aviso de asignación automática depende de `analistaAuto` que entrega el servidor (D201); si el contrato aún no lo trae, el portal no puede mostrarlo tras recargar.
