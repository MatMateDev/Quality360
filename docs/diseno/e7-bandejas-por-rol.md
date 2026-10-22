# Diseño E7 · Bandejas por rol

Fecha: 2026-10-21. Insumo: `docs/backlog/e7-bandejas-por-rol.md` (HDU E7-F01..F07, decisiones D28–D40). Este documento define **cómo se ve y se comporta** cada bandeja; no contiene código de la app. Dueño de construcción: `q360-frontend`.

Base visual revisada (estado actual del portal): `apps/web/src/styles/tokens.css` y `global.css`; componentes `Layout`, `BloqueEstado`, `TarjetaMetrica`, `HduListado`, `DialogoConfirmacion`, `Etiquetas`, `AccesoDenegado`; páginas `QaInicioPage`, `QeInicioPage`, `AdminInicioPage`, `AdminUsuariosPage`, `HduDetailPage`, `ChecklistEntregables`. No se introduce ninguna librería: todo se resuelve con las clases existentes (`.encabezado`, `.etiqueta`, `.tarjetas-resumen`, `.tarjeta-resumen`, `.panel`, `.panel-cabecera`, `.filtros`, `.campo`, `.tabla-contenedor`, `.badge*`, `.boton*`, `.bloque-estado*`, `.enlaces-rapidos`, `.barra-progreso`, `.mensaje-aviso`, `.historial-*`, `.dialogo*`) más un conjunto pequeño de clases nuevas (sección 5).

Notación: «cert.» = elemento ya certificado, **no se modifica** (texto, `data-testid`, ruta).

---

## 1. Principios y patrón común de bandeja

### 1.1 Principios

1. **Una bandeja es una lista de trabajo, no un dashboard.** Arriba, pocos contadores; debajo, una tabla accionable. Nada de gráficos (E6).
2. **Lo que requiere acción va primero.** Orden por defecto de cada lista = lo más urgente arriba (observadas, más antiguas).
3. **Un dato caído nunca es 0 (D34).** Cada contador y cada lista tiene su propio estado. El 0 solo aparece con estado `ok`.
4. **Solo lectura se ve, no se insinúa (D32, D39).** Líder y Auditor no ven botones de escritura deshabilitados: no existen. Un aviso permanente lo explica.
5. **Estado en la URL.** Filtros, orden, página y pestaña viven en la query string; «atrás» y compartir enlace funcionan.
6. **Reutilizar antes de crear.** Las bandejas amplían las pantallas de inicio existentes; los resúmenes certificados (E1-F03, F06, F08) se conservan íntegros y se agregan bloques debajo.
7. **Texto + ícono + color.** Nunca solo color para comunicar estado (insignias, alertas, contadores con atención).

### 1.2 Anatomía (desktop 1280 px)

Contenedor existente `.contenedor` (94 % de 1280 = 1203 px útiles). Orden vertical fijo:

```
┌ barra-superior (Layout) ─────────────────────────────────────────────────────────────┐
│ Quality360   [Bandeja] [Mis HDU] [Perfil]              Nombre ▪ <InsigniaRol> [Cerrar sesión] │
└──────────────────────────────────────────────────────────────────────────────────────┘
 [Saltar al contenido]  (primer elemento enfocable, visible solo con foco)

 PORTAL ANALISTA QA                      ← p.etiqueta   (texto cert.: "Portal <rol>")
 Bandeja                                 ← h1 (antes "Inicio")
 Descripción de una línea                ← p
 [chips de contexto: QE supervisor / células]      ← solo donde aplica
 ┌ aviso-solo-lectura ─────────────────────────────┐ ← solo Líder y Auditor
 │ ◉ Vista de solo lectura. No puedes modificar datos. │
 └─────────────────────────────────────────────────┘

 ┌ Contadores (.tarjetas-resumen) ──────────────────────────────────────────────────┐
 │ [Abiertas 2] [Con observaciones 1] [Esperando aprobación 0] [+ tarjetas cert.]    │
 └──────────────────────────────────────────────────────────────────────────────────┘

 ┌ .panel  «Mis HDU» ───────────────────────────────────────────────────────────────┐
 │ h2 + descripción                                          [acción de cabecera]    │
 │ Barra de filtros (.filtros)                                                       │
 │ chips de filtros activos · «Limpiar filtros» · «N resultados» (role=status)       │
 │ Tabla (.tabla-contenedor > table)  o  bloque de estado                            │
 │ Paginación                                                                        │
 └──────────────────────────────────────────────────────────────────────────────────┘

 ┌ .panel  Accesos rápidos (cert., donde existe) ───────────────────────────────────┐
```

Reglas de composición:

- **Encabezado:** conserva `p.etiqueta` con el texto actual («Portal Analista QA», «Portal QE», «Portal Administrador») porque las pruebas lo buscan; se agregan «Portal Líder QA» y «Portal Auditor». El `h1` pasa de «Inicio» a «Bandeja» (ninguna prueba certificada afirma el `h1` de inicio; sí el primer ítem del menú, ver sección 4).
- **Contadores:** usan `.tarjetas-resumen` + `TarjetaMetrica` (extendida con `clave`, sección 5). Máximo 4–5 por fila; si son más (Administrador) se agrupan en secciones con subtítulo `h2`.
- **Contador con atención** (valor > 0 que implica trabajo o pendiente): borde izquierdo `--q360-color-alerta` + texto auxiliar «Requiere atención» (no solo color). Valor 0 = neutro.
- **Los contadores no dependen de los filtros de la lista** (E7-F02-T05: filtrar no cambia el contador).
- **Una sola `h1`**; cada panel lleva `h2`; las tarjetas usan `span` + `strong` como hoy.

### 1.3 Estados de cada bloque (D34 y sección 5 del backlog)

Los cuatro estados reutilizan `BloqueEstado` (testid certificado `bloque-<id>-<estado>`; no cambia). Para cumplir la convención `estado-vacio-<clave>` / `estado-error-<clave>` / `estado-indisponible-<clave>` **sin tocar el testid certificado**, cada bloque de bandeja envuelve a `BloqueEstado` en `BloqueDatos`, que agrega un contenedor con el testid de convención (el anidado queda `estado-vacio-mis-hdu` > `bloque-lista-mis-hdu-vacio`).

| Estado | Contador (tarjeta) | Lista / tabla | Cómo se distingue |
| --- | --- | --- | --- |
| Cargando | Valor reemplazado por barra de esqueleto de 60 px; `aria-busy="true"` en el contenedor; texto oculto «Cargando…» | `BloqueEstado cargando` («Cargando…», cert.) + 5 filas de esqueleto `aria-hidden`; `aria-busy` en el panel | Gris animado; la animación se desactiva con `prefers-reduced-motion` |
| Vacío | `ok` con valor `0` (dato válido) | Mensaje propio de la bandeja (tabla 1.3.1), tono neutro; si hay filtros activos: «No hay HDU con esos filtros» + botón «Limpiar filtros» | Texto y borde neutros. Con filtros y sin filtros son dos mensajes y dos testids distintos |
| Error de consulta | La tarjeta muestra `BloqueEstado error` con «Reintentar» | `BloqueEstado error` (`role="alert"`) + «Reintentar»; se conserva el resto de la pantalla | Rojo suave (`--q360-color-error-fondo`) + texto «Ocurrió un error…» |
| Indisponible (fuente caída, 503 `FUENTE_NO_DISPONIBLE` o `estado: indisponible`) | Texto **«No disponible»** (16 px, gris, clase ya existente `.tarjeta-resumen__valor--indisponible`) en lugar del número | Columna: celda «No disponible». Lista entera: `BloqueEstado indisponible` con «Reintentar» | Gris (`--q360-color-indisponible`) + ícono «⛔ sin conexión» `aria-hidden` + texto; distinto del error (rojo) |

Cambios mínimos a `BloqueEstado` (compatibles hacia atrás): (a) el botón «Reintentar» también se muestra en `indisponible` cuando se pasa `onReintentar` (E7-F06#3, E7-B04); (b) prop opcional `tono="exito"` para el vacío positivo del Administrador («No hay pendientes de configuración», verde); (c) en `indisponible`, el mensaje corto «No disponible» se pasa por la prop `mensaje` en contadores y columnas.

Anti-regresión: una celda/columna indisponible muestra «No disponible» con `data-testid="estado-indisponible-<clave>"`; **nunca** `0`, `—` ni vacío (el guion «—» está reservado para «no tiene», p. ej. sin certificado).

#### 1.3.1 Mensajes de vacío (texto exacto del backlog)

| Bandeja | Lista | Sin filtros | Con filtros |
| --- | --- | --- | --- |
| Analista | Mis HDU | «No tienes HDU asignadas» (más, aparte, «Sin supervisor asignado» si corresponde) | «No hay HDU con esos filtros» |
| QE | Requiere mi acción | «No tienes acciones pendientes» | «No hay acciones con esos filtros» |
| Líder | HDU de mis células | (sin células) «Aún no tienes células asignadas. Pide al Administrador que te las asigne» / (con células) «Tus células aún no tienen HDU» | «No hay HDU con esos filtros» |
| Administrador | Pendientes | «No hay pendientes de configuración» (verde) | — (sin filtros) |
| Administrador | Últimos cambios | «Aún no hay cambios registrados» | — |
| Auditor | Cualquier pestaña | «No hay registros» | «No hay registros con esos filtros» (y «Exportar CSV» deshabilitado) |

### 1.4 Filtros, orden, búsqueda y URL

- **Barra de filtros:** `.filtros` + `.campo` (label arriba, `select` o `input`). Ids de control por pantalla (una bandeja por página, no se repiten): `filtro-celula`, `filtro-sprint`, `filtro-estado` (los mismos ids de `HduListado`), más `filtro-qe`, `filtro-analista`, `filtro-tipo-accion`, `filtro-busqueda`, `filtro-solo-observaciones`, `filtro-sin-analista`, `filtro-certificado`, `filtro-desde`, `filtro-hasta`, `filtro-actor`, `filtro-accion`, `filtro-operacion`, `filtro-usuario-afectado`, `filtro-hdu`.
- **La barra no es un `<form>` con envío.** Los filtros se aplican al cambiar (búsqueda con 300 ms de espera) y no existe ningún `button[type=submit]` en las pantallas del Auditor (E7-F06-T07 lo verifica). Todos los botones son `type="button"`.
- **Búsqueda** (`type="search"`, label «Buscar por código o título»): mínimo 0 caracteres; 2 caracteres para disparar.
- **URL:** `?estado=EN_EJECUCION&celula=<id>&sprint=<id>&qe=<id>&analista=<id>&q=texto&solo-obs=1&sin-analista=1&orden=<columna>:<asc|desc>&pagina=2&tamano=25`. El Auditor suma `desde`, `hasta`, `hdu`, `actor`, `accion`, `operacion`, `usuario`, `certificado=con|sin`. La URL usa `celula`, el API de listado usa `celulaId` y los endpoints de bandeja `celula`; el mapeo es del cliente (`src/api`). Un parámetro inválido (p. ej. `estado=XYZ`) se ignora sin error. Cambiar un filtro devuelve a `pagina=1`.
- **Chips de filtros activos** bajo la barra: cada chip lleva texto «Célula: CEL-A» y una «×» con `aria-label="Quitar filtro Célula: CEL-A"` (botón); más «Limpiar filtros» (`boton--secundario`, `data-testid="boton-limpiar-filtros"`, cert. por analogía con `HduListado`).
- **Recuento:** `<p role="status" data-testid="total-<clave>">6 resultados</p>`; se anuncia al cambiar los filtros. Un contador de «filtros activos» alimenta el botón plegable en móvil.
- **Orden:** encabezados de columna ordenables son `<th aria-sort="ascending|descending|none">` con un `<button type="button">` dentro (flecha ▲▼ además del texto del encabezado). Una columna ordenable activa tiene texto en `--q360-color-texto`. Columnas ordenables: Código, Célula, Sprint, Prioridad, Estado, Avance, Actualizada, Fecha. No ordenables: Título, Acción, Certificado (QE/Líder) y todo lo calculado por Certificaciones cuando está indisponible.
- **Paginación del servidor:** 25 filas (máx. 100). Componente `Paginacion`:

```
 Mostrando 26–50 de 132     [◀ Anterior]  Página 2 de 6  [Siguiente ▶]     Filas por página [25 ▾]
```

  `nav aria-label="Paginación de <lista>"`; botones «Anterior/Siguiente» `type="button"` con `disabled` en los extremos; selector 25/50/100. Testids: `paginacion-<clave>`, `pagina-anterior-<clave>`, `pagina-siguiente-<clave>`, `selector-tamano-<clave>`. Al cambiar de página el foco pasa al `caption` de la tabla (`tabIndex=-1`) y el recuento se anuncia. Con 0–25 resultados se oculta el selector y los botones quedan deshabilitados, pero el texto «Mostrando 1–6 de 6» permanece.

### 1.5 Tabla

- `<table>` dentro de `.tabla-contenedor` (ya con `overflow-x:auto`), con `<caption class="sr-only">` («HDU de mis células, 6 resultados, ordenadas por célula»), `<th scope="col">`.
- **Fila navegable:** el código de la HDU es un `<Link>` a `/hdu/:id` (único tope de tab). Para ratón, toda la fila es clicable (`tr` con `onClick`, `cursor: pointer`, ignorando clics en controles internos); E7-F02-T07 («Pulsa la fila de H2») lo requiere. Hover existente (`tbody tr:hover`).
- **Títulos largos:** `max-width: 260px` con `-webkit-line-clamp: 2` y `title` solo como ayuda secundaria (el texto completo está en el detalle).
- **Fechas:** `<time datetime="ISO">` formateada con `lib/formato.ts` en hora de Chile.
- **Avance:** `Avance` = texto «7/10 · 70 %» (obligatorio, D16) + `.barra-progreso` decorativa `aria-hidden`.
- **Insignia de observación:** `<span class="badge badge-observacion">▲ 1 observación</span>` (texto «N observación(es)»).

### 1.6 Solo lectura visible (Líder y Auditor)

1. `AvisoSoloLectura` (`data-testid="aviso-solo-lectura"`, `role="note"`, bajo el encabezado): fondo `--q360-color-solo-lectura-suave`, ícono ◉ `aria-hidden`, texto «Vista de solo lectura. Puedes consultar y descargar, no modificar.» Sin botones.
2. La insignia de rol del encabezado (`InsigniaRol`) tiene color propio (Líder, Auditor).
3. En `/hdu/:id` se muestra el mismo aviso y **no se renderizan** los controles de marcar, desmarcar, aprobar, rechazar, cambiar estado, asignar ni generar certificado (D39). Se conservan «Descargar evidencia» y «Descargar certificado» (`boton-descargar-certificado`, cert.). La señal existente `checklist-solo-lectura` (cert.) se reutiliza para el checklist. Hoy `HduDetailPage` ya oculta acciones con `hdu.permisos.*`; el trabajo es que el backend entregue `permisos` en `false` para los dos roles nuevos y que no queden textos como «Generar certificado» o selectores vacíos.
4. En listas **no** hay columna «Acciones» ni menú de fila: la única interacción es abrir el detalle y descargar.

### 1.7 Accesibilidad

| Tema | Decisión |
| --- | --- |
| Foco | Se conserva `:focus-visible` global (sombra azul 3 px). Se **agrega** un respaldo para modo de alto contraste: `@media (forced-colors: active) { :focus-visible { outline: 2px solid CanvasText; } }`, porque `box-shadow` desaparece allí. Al navegar a una bandeja el foco va al `h1` (`tabIndex=-1`); al abrir un diálogo, al primer control; al cerrarlo, vuelve al botón que lo abrió |
| Saltar bloques | Enlace «Saltar al contenido» en `Layout` hacia `<main id="contenido">`; visible solo con foco |
| Roles/semántica | `header`, `nav aria-label="Portal"` (cert.), `main`, `section aria-labelledby` por panel, tablas reales con `caption`/`scope`, `aria-sort`, `aria-current="page"` en el menú y en las pestañas, `role="status"` (recuento, cargando, vacío, indisponible) y `role="alert"` (error, acceso denegado, error de formulario) — tal como hoy en `BloqueEstado` |
| Teclado | Todo con Tab/Enter/Espacio; las filas navegan por el enlace del código; orden de tab = orden visual (encabezado → contadores → filtros → tabla → paginación). Diálogos: Esc cierra, foco atrapado, `aria-labelledby` único (`useId`, hoy el id es fijo) |
| Contraste | Todos los pares usados en este diseño cumplen WCAG 2.1 AA (texto normal ≥ 4,5:1, componentes ≥ 3:1). Pares ya existentes verificados por inspección: texto `#172033` / blanco; secundario `#687386` / blanco ≈ 4,8:1 (se usa en 13 px solo en cabeceras de tabla y etiquetas: no bajar de este tono); alerta `#8a5a00` / `#fff3d6`; indisponible `#5b5f66` / `#eceef1`. Pares nuevos (sección 5.2) se diseñaron ≥ 6:1. `q360-qa` o el implementador deben correr una verificación automática (axe) y no confiar solo en estos valores aproximados |
| Color | Estados siempre con texto; las alertas con ícono; la fila «con observaciones» no cambia de fondo (solo la insignia) |
| Objetivos táctiles | `min-height: 44px` para botones, enlaces-botón y filas clicables en ≤ 750 px (`--q360-objetivo-tactil`). Los `boton--enlace` de 4×6 px de la tabla de usuarios no se usan en móvil |
| Movimiento | Esqueleto y transición de `.barra-progreso` respetan `prefers-reduced-motion: reduce` |
| Zoom | Sin alturas fijas; reflujo a 320 px (`min-width` del `body` ya es 320); no se bloquea el zoom |
| Texto | Fechas «21-10-2026 14:35»; números sin abreviar; «No disponible» en vez de iconos solos |

### 1.8 Responsivo

Puntos de quiebre (las variables CSS no sirven en `@media`, se documentan aquí): **1280 / ≥ 1100** escritorio; **≤ 1100** la tabla desplaza horizontal dentro de `.tabla-contenedor` (ya existe); **≤ 750** (ya existe en `global.css`) barra superior apilada, filtros plegables, contadores compactos; **≤ 640** tabla en tarjetas apiladas; **375** objetivo de prueba.

**1280 px:** contadores en una fila (4–5), tabla completa. Las bandejas con más columnas (Líder: 11, Auditor HDU: 10) caben por el recorte de título; si no, scroll interno.

**375 px:**

```
┌────────────────────────────┐
│ Quality360        [☰ Menú] │  ← .barra-superior apilada (existente); nav en una fila con wrap
│ Nombre · Analista QA [Salir]│
├────────────────────────────┤
│ PORTAL ANALISTA QA         │
│ Bandeja                    │
│ ┌────────────┬───────────┐ │  ← .tarjetas-resumen--compactas: 2 columnas
│ │ Abiertas 2 │ Obs.   1  │ │
│ ├────────────┴───────────┤ │
│ │ Esperando aprobación 0 │ │
│ └────────────────────────┘ │
│ Mis HDU                    │
│ [Filtros (2) ▾]            │  ← botón aria-expanded; despliega .filtros en 1 columna
│ 2 resultados               │
│ ┌────────────────────────┐ │
│ │ H2  [En ejecución]     │ │  ← cada fila = tarjeta (table con display:block + roles ARIA explícitos)
│ │ Título de la HDU       │ │
│ │ Célula   CEL-A         │ │
│ │ Avance   2/10 · 20 %   │ │
│ │ ▲ 1 observación        │ │
│ │ Siguiente: 2 · Datos…  │ │
│ └────────────────────────┘ │
│ [◀ Anterior] 1/1 [Sig. ▶]  │
└────────────────────────────┘
```

- `.tabla--apilable` (nueva): en ≤ 640 px los `tr` son bloques-tarjeta; cada `td` lleva `data-label` y muestra `::before` con la etiqueta; el `thead` se oculta visualmente (`sr-only`). Al cambiar `display` se pierde la semántica de tabla en algunos navegadores: se **reponen** `role="table|rowgroup|row|columnheader|cell"` en el JSX. Un solo DOM (no se duplican testids).
- La primera línea de la tarjeta es siempre código (enlace) + estado; el título va debajo; el resto, etiqueta/valor.
- Filtros: botón «Filtros (n)» (`data-testid="boton-filtros"`, `aria-expanded`, `aria-controls`) visible solo ≤ 750 px; en escritorio la barra siempre está abierta.
- Diálogos: ancho 100 %, `max-height: 90vh; overflow: auto`, botones apilados de 44 px.
- Auditor: las pestañas se desplazan horizontalmente (`overflow-x:auto`, sin saltos de línea); «Exportar CSV» ocupa el ancho completo.
- Paginación: «Anterior/Siguiente» a 44 px; selector de tamaño oculto en móvil (se usa 25).

---

## 2. Las cinco bandejas

Convenciones de `data-testid` (sección 5 del backlog): `bandeja-<rol>` en el contenedor raíz de la página; `contador-<clave>` en el **valor** del contador; `tarjeta-<clave>` en la tarjeta (prefijo ya usado por `TarjetaMetrica`); `lista-<clave>` en la `table`; `fila-hdu-<id>` en cada fila de HDU (mismo patrón cert. de `HduListado`); `estado-vacio-<clave>`, `estado-error-<clave>`, `estado-indisponible-<clave>` en el contenedor del estado; `paginacion-<clave>`. Claves de rol: `analista`, `qe`, `lider`, `admin`, `auditor`. Los `data-testid` ya certificados (`tarjeta-supervisor`, `valor-supervisor`, `tarjeta-hdu-qa`, `tarjeta-equipo`, `tarjeta-hdu-qe`, `enlace-aprobaciones-pendientes`, `tarjeta-usuarios-total`, `tarjeta-usuarios-activos`, `tarjeta-supervision-vigentes`, `tarjeta-supervision-sin-supervisor`, `bloque-inicio-*`, `bloque-*-<estado>`, `fila-hdu-<id>`, `fila-usuario-<id>`, `fila-analista-<id>`, `error-cambio-rol`, `error-cambio-estado-usuario`, `acceso-denegado`, `checklist-*`, `boton-*-<entregable>`, `boton-descargar-certificado`, etc.) **no cambian**.

### 2.1 Analista QA · `/qa` (E7-F02)

**Wireframe 1280**

```
 PORTAL ANALISTA QA
 Bandeja
 Tu supervisor, lo que te falta hacer y tus historias asignadas.

 ┌ tarjeta-supervisor (cert.) ──┐ ┌ tarjeta-hdu-qa (cert.) ┐
 │ QE supervisor                │ │ HDU asignadas      2    │
 │ José Seguel                  │ │                          │   ← valor-supervisor: "Sin supervisor asignado" si no hay
 └──────────────────────────────┘ └──────────────────────────┘
 ┌ Abiertas ─┐ ┌ Con observaciones ┐ ┌ Esperando aprobación ┐
 │    2      │ │     1 ▲ Requiere  │ │          0           │
 │           │ │        atención   │ │                      │
 └───────────┘ └───────────────────┘ └──────────────────────┘

 ┌ Mis HDU ─────────────────────────────────────────────────────────────────────────────────────┐
 │ Ordenadas por lo que te falta hacer.                                                          │
 │ Estado [Todos ▾] Célula [Todas ▾] Sprint [Todos ▾] [☐ Solo con observaciones] Buscar [______]│
 │ 2 resultados                                                              [Limpiar filtros]  │
 │ CÓDIGO TÍTULO          CÉLULA SPRINT PRIORIDAD ESTADO       AVANCE     SIGUIENTE   OBSERV.   ACTUALIZADA │
 │ H2     Título H2       CEL-A  S-12   Alta      En ejecución 1/10·10 %  2 · Datos…  ▲1 obs.   20-10 09:12 │
 │ H8     Título H8       CEL-C  S-11   Media     Pend. cierre 10/10·100% Todos aprob. —         19-10 17:40 │
 │ [◀ Anterior]  Página 1 de 1  [Siguiente ▶]                                                    │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌ Accesos rápidos (cert.) ─ [Ver mis HDU] ───────────────────────────────────────────────────┐
```

Contenido: reutiliza las tarjetas certificadas del E1-F06 en la primera fila (supervisor y «HDU asignadas», que cuenta todas las asignadas, distinto de «Abiertas» que excluye cerradas) y agrega la fila de tres contadores. Accesos rápidos se mantiene (cert.).

**Contadores**

| Clave | Título | Qué cuenta | Fuente | Atención |
| --- | --- | --- | --- | --- |
| `abiertas` | Abiertas | Mis HDU no cerradas | Organización | No |
| `con-observaciones` | Con observaciones | Entregables rechazados sin corregir | Certificaciones | Sí si > 0 |
| `esperando-aprobacion` | Esperando aprobación | Entregables en POR_APROBAR | Certificaciones | No |

**Lista `lista-mis-hdu`** (columnas, en orden): Código (enlace, orden) · Título · Célula · Sprint · Prioridad · Estado · Avance (`n/10 · %`) · Siguiente entregable («4 · nombre», o «Todos aprobados») · Observaciones (insignia o vacío) · Actualizada. Orden por defecto: con observaciones, prioridad alta→baja, sprint. Si Certificaciones cae: Avance, Siguiente y Observaciones muestran «No disponible» (`estado-indisponible-avance`), la lista sigue; los contadores `con-observaciones` y `esperando-aprobacion` pasan a «No disponible» (`estado-indisponible-con-observaciones`, `estado-indisponible-esperando-aprobacion`), `abiertas` sigue en su valor (E7-F02-T04).

**Filtros:** Estado (`filtro-estado`), Célula (`filtro-celula`), Sprint (`filtro-sprint`), casilla «Solo con observaciones» (`filtro-solo-observaciones`), búsqueda (`filtro-busqueda`).

**Acciones:** abrir el detalle (código o fila). Ninguna otra: no hay crear ni reasignar. Una HDU ajena abierta por URL → pantalla de acceso denegado (sección 4.3).

**Comportamiento:** «Siguiente entregable» es el primero no aprobado; insignia con «N observación(es)»; abrir H2 lleva al checklist con la observación visible (`observacion-<clave>`, cert.). Sin HDU: contadores en 0 + «No tienes HDU asignadas» (`estado-vacio-mis-hdu`) + tarjeta supervisor «Sin supervisor asignado»; sin mensaje de error.

**Testids nuevos:** `bandeja-analista`, `contador-abiertas`, `contador-con-observaciones`, `contador-esperando-aprobacion`, `tarjeta-abiertas`, `tarjeta-con-observaciones`, `tarjeta-esperando-aprobacion`, `lista-mis-hdu`, `insignia-observaciones-<hduId>`, `celda-siguiente-<hduId>`, `celda-avance-<hduId>`, `filtro-solo-observaciones`, `estado-vacio-mis-hdu`, `estado-vacio-filtros-mis-hdu`, `estado-error-mis-hdu`, `estado-indisponible-<contador|avance|siguiente|observaciones>`, `paginacion-mis-hdu`.

**Móvil 375:** supervisor a ancho completo; tarjeta «HDU asignadas»; los 3 contadores (2+1); lista en tarjetas (código+estado, título, célula/sprint, avance, siguiente, insignia). La insignia de observación va primero visualmente dentro de la tarjeta.

### 2.2 QE · `/qe` (E7-F03)

**Wireframe 1280**

```
 PORTAL QE
 Bandeja
 Lo que requiere tu acción y el resumen de tu equipo.

 ┌ Por aprobar ───────┐ ┌ Sin analista ┐ ┌ Listas para certificar ┐ ┌ Listas para cerrar ┐
 │ 1 entregable       │ │      1       │ │           1            │ │         1          │
 │ en 1 HDU           │ │              │ │                        │ │                    │
 └────────────────────┘ └──────────────┘ └────────────────────────┘ └────────────────────┘

 ┌ Requiere mi acción ────────────────────────────────────────────────────────────────────────────┐
 │ Tipo de acción [Todas ▾] Célula [▾] Sprint [▾] Analista [▾] Buscar [____]        4 resultados  │
 │ HDU   TÍTULO      CÉLULA SPRINT ANALISTA  ACCIÓN PENDIENTE            ANTIGÜEDAD  (acción)       │
 │ H1    Título H1   CEL-A  S-12   Ana 1     ◐ Aprobar 1 entregable      3 días      [Aprobar]      │
 │ H5    Título H5   CEL-A  S-12   Sin asign ◌ Asignar analista          2 días      [Asignar]      │
 │ H6    Título H6   CEL-B  S-11   Ana 1     ✓ Generar certificado       1 día       [Certificar]   │
 │ H8    Título H8   CEL-C  S-11   Ana 2     ■ Cerrar HDU                Hoy         [Cerrar]       │
 │ [◀ Anterior] Página 1 de 1 [Siguiente ▶]                                                         │
 └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌ Tu equipo (cert. E1-F03) ──────────────────────────┐
 │ tarjeta-equipo: Analistas supervisados 2 │ tarjeta-hdu-qe: HDU bajo supervisión 6 │
 └────────────────────────────────────────────────────┘
 ┌ Accesos rápidos (cert.) [Ver equipo] [Ver historias supervisadas] [Aprobaciones pendientes] ┐
```

Orden: los cuatro contadores de acción y la lista van primero (trabajo); debajo, las tarjetas de equipo y Accesos rápidos tal como están certificados.

**Contadores**

| Clave | Título | Contenido | Fuente | Atención |
| --- | --- | --- | --- | --- |
| `por-aprobar` | Por aprobar | N entregables + subtexto «en M HDU» (`contador-por-aprobar-hdu`) | Certificaciones | Sí si > 0 |
| `sin-analista` | Sin analista | HDU sin analista | Organización | Sí si > 0 |
| `listas-certificar` | Listas para certificar | HDU con entregables 1–8 aprobados y el 9 sin aprobar | Certificaciones | Sí si > 0 |
| `listas-cerrar` | Listas para cerrar | HDU con 10 aprobados no cerradas | Certificaciones | Sí si > 0 |

**Lista `lista-requiere-accion`** — columnas: HDU (enlace) · Título · Célula · Sprint · Analista (o «Sin asignar») · Acción pendiente (insignia `badge-accion` con ícono + texto: «Aprobar N entregable(s)», «Asignar analista», «Generar certificado», «Cerrar HDU») · Antigüedad («Hoy», «1 día», «N días») · botón. Orden por defecto: más antigua primero. Filtros: Tipo de acción (`filtro-tipo-accion`: Aprobar, Asignar, Certificar, Cerrar), Célula, Sprint, Analista (`filtro-analista`), búsqueda.

**Acciones** (todas son enlaces con aspecto de botón, `boton boton--primario` para la acción principal; `data-testid="boton-accion-<hduId>-<tipo>"` con tipo = `aprobar|asignar|certificar|cerrar`):

| Botón | Destino |
| --- | --- |
| Aprobar | `/qe/aprobaciones?hdu=<id>` (E3-F03 filtra y deja visible esa HDU) |
| Asignar | `/hdu/<id>#asignacion` (E2-F02, selector de analistas del equipo) |
| Certificar | `/hdu/<id>#certificado` |
| Cerrar | `/hdu/<id>#estado` |

La bandeja no ejecuta ninguna acción. Nombre accesible: «Aprobar entregables de H1» (empieza con el texto visible). Si una HDU tiene dos pendientes simultáneos, aparece una fila por cada acción (testid de fila `fila-accion-<hduId>-<tipo>`; la fila además lleva `fila-hdu-<id>` solo si hay una acción).

**Estados:** sin acciones: contadores en 0 y «No tienes acciones pendientes» (`estado-vacio-requiere-accion`), el resumen del equipo se conserva (E7-F03-T03). Con Certificaciones caída: `por-aprobar`, `listas-certificar`, `listas-cerrar` muestran «No disponible»; `sin-analista` sigue y su fila (H5) aparece; las filas que dependen del checklist no se pueden calcular y se reemplazan por una fila-aviso única «Algunas acciones no se pueden calcular ahora (Certificaciones no disponible)» (`estado-indisponible-requiere-accion-parcial`, con «Reintentar»), nunca por un vacío falso (E7-F03-T04).

**Ámbito:** solo HDU donde es QE responsable; las HDU de sus analistas con otro QE responsable no se listan (E7-F03-T05).

**Testids nuevos:** `bandeja-qe`, `contador-por-aprobar`, `contador-por-aprobar-hdu`, `contador-sin-analista`, `contador-listas-certificar`, `contador-listas-cerrar`, `lista-requiere-accion`, `fila-accion-<hduId>-<tipo>`, `celda-accion-<hduId>`, `celda-antiguedad-<hduId>`, `boton-accion-<hduId>-<tipo>`, `filtro-tipo-accion`.

**Móvil:** contadores 2×2; cada fila = tarjeta con el botón de acción a ancho completo (44 px) al pie. `Aprobar` nunca se oculta.

### 2.3 Líder QA · `/lider` (E7-F04) — solo lectura

**Wireframe 1280**

```
 PORTAL LÍDER QA
 Bandeja
 Estado de las HDU y la certificación de las células que tienes a cargo.
 Mis células: (CEL-A) (CEL-B)                         ← chips (no interactivos), lista "Células a cargo"
 ◉ Vista de solo lectura. Puedes consultar y descargar, no modificar.

 ┌ Células ┐ ┌ HDU abiertas ┐ ┌ HDU cerradas ┐ ┌ Sin analista ┐ ┌ Certificados ┐
 │    2    │ │      5       │ │      1       │ │      1 ▲     │ │      1       │
 └─────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

 ┌ Resumen por célula ───────────────────────────────────────────────────────────────────────┐
 │ CÉLULA  PENDIENTE  DISEÑO PRUEBAS  EN EJECUCIÓN  PEND. CIERRE  CERRADA  AVANCE PROM. (abiertas) │
 │ CEL-A   1          0               2             0             1        4,7/10 · 47 %          │
 │ CEL-B   1          0               1             0             0        ...                    │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
 ┌ HDU de mis células ───────────────────────────────────────────────────────────────────────┐
 │ Célula [▾ solo las mías] Sprint [▾] Estado [▾] QE [▾] Analista [▾] [☐ Sin analista] Buscar │
 │ CÓDIGO TÍTULO CÉLULA SPRINT PRIOR. ESTADO QE RESP. ANALISTA AVANCE CERTIFICADO ACTUALIZ.  │
 │ H1 …  CEL-A S-12 Alta En ejec. QE 1  Ana 1  3/10·30%  —            20-10 …                │
 │ H7 …  CEL-A S-10 Media Cerrada QE 2 Ana 3  10/10·100% F7 [⬇ PDF]   12-10 …                │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
```

**Sin células:** solo encabezado, aviso de solo lectura y un `BloqueEstado vacio` con el texto exacto «Aún no tienes células asignadas. Pide al Administrador que te las asigne» (`estado-vacio-celulas`); **no se renderizan** contadores, resumen ni tabla (E7-F04-T04: nada de cifras ficticias). Tampoco se muestra error.

**Contadores:** `celulas` (n.º de células vigentes), `hdu-abiertas` (no cerradas), `hdu-cerradas`, `sin-analista` (atención si > 0), `certificados` (HDU con certificado; Certificaciones: «No disponible» si cae). `hdu-abiertas` y `sin-analista` vienen de Organización y no se degradan (E7-F04-T05).

**Resumen por célula `lista-resumen-celulas`:** una fila por célula (`fila-celula-<id>`), 5 columnas de conteo por estado (nombres cert. de `ETIQUETAS_ESTADO_HDU`) y «Avance promedio de las abiertas» (Certificaciones; «No disponible» si cae). Sin acciones. Las celdas con 0 muestran «0» legible, no vacío.

**Lista `lista-hdu-lider`:** Código · Título · Célula · Sprint · Prioridad · Estado · QE responsable · Analista («Sin asignar») · Avance · Certificado (folio + enlace-botón «⬇ PDF» `boton-descargar-certificado-<hduId>`, o «—» si no hay, o «No disponible») · Actualizada. Orden por defecto: célula, sprint más reciente, código. Filtros: Célula (solo las vigentes, `filtro-celula`), Sprint, Estado, QE (`filtro-qe`), Analista, casilla «Sin analista» (`filtro-sin-analista`), búsqueda.

**Acciones:** abrir detalle (solo lectura) y descargar certificado. El QE aparece como dato sin acciones, sin jerarquía. Detalle de H4 (otra célula) → acceso denegado. Si el Administrador le quita una célula, desaparece de chips, resumen y lista en la siguiente consulta; el filtro de célula solo ofrece las vigentes.

**Testids nuevos:** `bandeja-lider`, `chips-celulas`, `chip-celula-<id>`, `aviso-solo-lectura`, `contador-celulas`, `contador-hdu-abiertas`, `contador-hdu-cerradas`, `contador-sin-analista`, `contador-certificados`, `lista-resumen-celulas`, `fila-celula-<id>`, `lista-hdu-lider`, `celda-certificado-<hduId>`, `boton-descargar-certificado-<hduId>`, `filtro-sin-analista`, `estado-vacio-celulas`.

**Móvil:** chips envuelven en varias líneas; contadores 2 columnas; el resumen por célula pasa a tarjetas con los 5 estados en una cuadrícula 5×1 de números con etiqueta; la lista en tarjetas; el PDF como botón secundario de 44 px.

### 2.4 Administrador · `/admin` (E7-F05)

**Wireframe 1280**

```
 PORTAL ADMINISTRADOR
 Bandeja
 Estado de usuarios y de la organización de supervisión QA.

 Usuarios
 ┌ Usuarios totales ┐ ┌ Usuarios activos 10 ──────────────────┐ ┌ Usuarios inactivos ┐
 │ (tarjeta-usuarios-total, cert.) │ Admin 1 · QE 2 · Analista QA 4 │ │         1          │
 │       11         │ │ Líder QA 2 · Auditor 1                │ └────────────────────┘
 └──────────────────┘ └───────────────────────────────────────┘
 Supervisión y organización
 ┌ Relaciones vigentes ┐ ┌ Analistas sin supervisor ▲ ┐ ┌ QE sin analistas ┐ ┌ Líderes sin células ▲ ┐ ┌ Células sin líder ▲ ┐ ┌ HDU totales ┐
 │ (cert.)      3      │ │ (cert.)         1          │ │        0         │ │          1            │ │         1           │ │      8      │

 ┌ Accesos rápidos ─ [Gestionar usuarios] [Gestionar supervisión] [Registrar usuario] ──────────┐

 ┌ Pendientes de configuración ──────────────────────────────────────────────────────────────┐
 │ USUARIO / CÉLULA     SITUACIÓN                    ACCIÓN                                    │
 │ ANA4                 Analista sin QE              [Asignar QE]                              │
 │ LID2                 Líder sin células            [Asignar células]                         │
 │ CEL-C                Célula sin líder             [Asignar líder]                           │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
 ┌ Últimos cambios ──────────────────────────────────────────────────────────────────────────┐
 │ FECHA            ACTOR   OPERACIÓN             USUARIO AFECTADO                              │
 │ 21-10 10:12      ADM1    Asignación de células LID2                                         │
 │ …(hasta 10 filas)                                                                          │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
```

**Contadores** (todos de Organización; no dependen de Certificaciones, E7-B03-T11). Para no duplicar ni romper lo certificado, las 4 tarjetas de E1-F08 se conservan con su `id`, título y texto y reciben además `clave`: `tarjeta-usuarios-activos` pasa a contener `contador-usuarios-activos` (con el desglose por rol), `tarjeta-supervision-sin-supervisor` contiene `contador-analistas-sin-qe`.

| Clave | Título (visible) | Detalle |
| --- | --- | --- |
| `usuarios-total` (cert., `tarjeta-usuarios-total`) | Usuarios totales | cert. |
| `usuarios-activos` | Usuarios activos | Valor + `<dl>` con los 5 roles (`desglose-rol-ADMINISTRADOR` … `desglose-rol-AUDITOR`), etiquetas de `ETIQUETAS_ROL` |
| `usuarios-inactivos` | Usuarios inactivos | Valor |
| `supervision-vigentes` (cert.) | Relaciones vigentes | cert. |
| `analistas-sin-qe` | Analistas sin supervisor (título cert.) | Atención si > 0 |
| `qe-sin-analistas` | QE sin analistas | Atención si > 0 |
| `lideres-sin-celulas` | Líderes sin células | Atención si > 0 |
| `celulas-sin-lider` | Células sin líder | Atención si > 0 |
| `hdu-total` | HDU totales | Valor |

Las tarjetas se agrupan en dos secciones con `h2` («Usuarios» y «Supervisión y organización») para que el desglose y las alertas se lean por tema.

**Pendientes `lista-pendientes`:** columnas Usuario o célula · Situación · Acción. Filas `fila-pendiente-<tipo>-<id>` con tipo `analista-sin-qe`, `qe-sin-analistas`, `lider-sin-celulas`, `celula-sin-lider`. Botones (enlaces con aspecto de botón secundario):

| Situación | Botón | Destino |
| --- | --- | --- |
| Analista sin QE | Asignar QE (`boton-asignar-qe-<usuarioId>`) | `/admin/supervision?analista=<id>` (si la pantalla no soporta preselección, abre la pantalla sin ella; ver sección 6) |
| QE sin analistas | Asignar analistas (`boton-asignar-analistas-<usuarioId>`) | `/admin/supervision?qe=<id>` |
| Líder sin células | Asignar células (`boton-asignar-celulas-<usuarioId>`) | `/admin/usuarios?usuario=<id>` con el panel de células abierto |
| Célula sin líder | Asignar líder (`boton-asignar-lider-<celulaId>`) | `/admin/usuarios?rol=LIDER_QA` filtrado (ver sección 6, brecha del backlog) |

Vacío verde con ícono ✓: «No hay pendientes de configuración» (`estado-vacio-pendientes`).

**Últimos cambios `lista-ultimos-cambios`:** 10 filas (`fila-cambio-0` … `fila-cambio-9`; la primera es la más reciente): Fecha · Actor · Operación (texto legible, p. ej. «Asignación de células», «Cambio de rol») · Usuario afectado. Nunca contraseñas ni tokens. Sin paginación (fijo en 10) y con enlace de texto sin acción hacia nada (el Administrador no abre la auditoría completa, D38).

**Estados:** error de Organización (E7-F05-T04): `BloqueEstado error` único bajo el encabezado (`bloque-inicio-admin-error`, cert.) con «Reintentar»; sin contadores ni listas; **Accesos rápidos permanecen visibles** (están fuera del bloque de datos, como hoy). Los pendientes y los últimos cambios tienen estado propio, de modo que si solo fallan los cambios se ve «No disponible» ahí.

**Testids nuevos:** `bandeja-admin`, `contador-usuarios-activos`, `contador-usuarios-inactivos`, `contador-analistas-sin-qe`, `contador-qe-sin-analistas`, `contador-lideres-sin-celulas`, `contador-celulas-sin-lider`, `contador-hdu-total`, `desglose-rol-<codigo>`, `lista-pendientes`, `fila-pendiente-<tipo>-<id>`, `boton-asignar-*`, `lista-ultimos-cambios`, `fila-cambio-<n>`.

**Móvil:** desglose por rol en lista vertical dentro de la tarjeta; pendientes y cambios como tarjetas; el botón de la fila a ancho completo.

### 2.5 Auditor · `/auditor` (E7-F06) — solo lectura y exportación

Rutas: `/auditor` (índice = pestaña HDU), `/auditor/hdu` (misma vista: `/auditor` no redirige, para que E7-F06-T01 vea la lista de inmediato), `/auditor/certificados`, `/auditor/bitacora`, `/auditor/auditoria-usuarios`. Pestañas = enlaces de navegación (`nav aria-label="Secciones del Auditor"`, `aria-current="page"`), no un `tablist` ARIA: cada pestaña es una ruta con su propia URL y estado, igual que `nav-portal`.

**Wireframe 1280**

```
 PORTAL AUDITOR
 Bandeja
 Consulta global de HDU, certificados, bitácora y auditoría de usuarios.
 ◉ Vista de solo lectura. Puedes consultar y exportar, no modificar.

 ┌ HDU totales ┐ ┌ Certificados ┐ ┌ Eventos (7 días) ┐ ┌ Cambios de usuarios (7 días) ┐
 │      8      │ │      2       │ │       42         │ │              9               │
 └─────────────┘ └──────────────┘ └──────────────────┘ └──────────────────────────────┘

 [ HDU ]  [ Certificados ]  [ Bitácora de checklist ]  [ Auditoría de usuarios ]   ← pestañas
 ┌ panel ────────────────────────────────────────────────────────────────────────────────────┐
 │ Célula[▾] Sprint[▾] Estado[▾] QE[▾] Analista[▾] Certificado[Todos ▾] Desde[__] Hasta[__]    │
 │ chips · [Limpiar filtros]                                                                  │
 │ 8 resultados                                                      [⬇ Exportar CSV]          │
 │ tabla … paginación                                                                          │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Contadores:** `hdu-total`, `certificados`, `eventos-7d`, `cambios-usuarios-7d`, cada uno con estado propio (Certificaciones alimenta `certificados` y `eventos-7d`; Organización los demás).

**Pestañas**

| Pestaña (`data-testid`) | Columnas | Filtros | Orden por defecto |
| --- | --- | --- | --- |
| HDU `pestana-hdu` · `lista-auditor-hdu` | Código · Título · Célula · Sprint · Estado · QE · Analista · Avance · Certificado · Actualizada | Célula, Sprint, Estado, QE, Analista, Certificado (todos / con / sin), Desde, Hasta (sobre «Actualizada»), búsqueda | Código |
| Certificados `pestana-certificados` · `lista-certificados` | Folio · HDU (código + título) · Fecha de emisión · QE emisor · Huella SHA-256 (completa, `texto-huella`, en 2–3 líneas) · Validez (Válido / No válido) · Acciones | Desde, Hasta, QE emisor, búsqueda por folio o HDU | Fecha desc |
| Bitácora `pestana-bitacora` · `lista-bitacora` | Fecha · HDU · Entregable · Acción · Actor · Valor anterior → nuevo · Motivo/comentario | Desde, Hasta, HDU (`filtro-hdu`), Actor, Acción (Marcar, Desmarcar, Aprobar, Rechazar, Certificar) | Fecha desc |
| Auditoría de usuarios `pestana-auditoria-usuarios` · `lista-auditoria-usuarios` | Fecha · Actor · Operación · Usuario afectado · Cambios (antes → después) · Motivo | Desde, Hasta, Actor, Operación, Usuario afectado | Fecha desc |

Acciones por fila: HDU abre el detalle (solo lectura: checklist, evidencias con URL firmada, historial de estado y asignación, bitácora, certificado). Certificados: «Descargar PDF» (`boton-descargar-pdf-<folio>`, solicita URL firmada) y «Verificar» (enlace a `/verificar/<folio>`, `target="_blank" rel="noopener noreferrer"`, texto «Verificar (se abre en una pestaña nueva)»). Bitácora/auditoría: el código de HDU o usuario enlaza solo cuando hay destino de lectura.

**Celdas de cambios** («antes → después»): `Rol: Analista QA → Líder QA` en lenguaje natural, no JSON; solo campos de una lista blanca (rol, nombre, correo, estado de acceso, supervisor, células). Defensa adicional: el portal **no renderiza** ninguna clave cuyo nombre contenga `password`, `token` ni `secret`, aunque el API la enviara (E1-B12#3, E7-F06-T04); las etiquetas de la UI no usan esas palabras.

**Exportar CSV**

- Un solo botón por pestaña: `boton-exportar-csv`, `type="button"`, `boton boton--secundario`, texto «Exportar CSV» con ícono ⬇. Exporta lo filtrado, no solo la página visible; el texto de ayuda bajo el recuento dice «Se exportarán 4 filas con los filtros aplicados» (`ayuda-exportar`).
- Estados del botón:
  - Normal: habilitado.
  - Sin resultados, cargando, error o indisponible: `disabled` real + `aria-describedby` apuntando al motivo («No hay registros con esos filtros»).
  - Exportando: texto «Exportando…», `aria-busy="true"`, deshabilitado.
  - Éxito: `role="status"` «Se descargó auditoria-usuarios-2026-10-21.csv (4 filas)» (`estado-exportacion-ok`). La descarga se hace con petición autenticada y `Blob`, no con un `<a href>` público.
  - 422 `EXPORTACION_EXCEDE_LIMITE`: `mensaje-aviso` con «La exportación supera las 50.000 filas. Acota los filtros.» (`estado-exportacion-excede`); el foco va al primer filtro.
  - 503 / red: `mensaje-error-global` «No pudimos generar el archivo. Intenta de nuevo.» + «Reintentar».
- Nombre del archivo: `quality360-<recurso>-<AAAA-MM-DD>.csv`. Formato ya fijado en el backlog (`;`, UTF-8 con BOM, fechas ISO).

**Estados:** cada pestaña es independiente (Certificaciones caída → «Certificados» y «Bitácora» muestran `BloqueEstado indisponible` «No disponible» con «Reintentar», las otras cargan; E7-F06-T08). La pestaña activa se conserva al reintentar. Las pestañas no ocultan un contador indisponible.

**Testids nuevos:** `bandeja-auditor`, `aviso-solo-lectura`, `contador-hdu-total`, `contador-certificados`, `contador-eventos-7d`, `contador-cambios-usuarios-7d`, `pestana-*`, `panel-<pestaña>`, `lista-*`, `filtro-*`, `total-<pestaña>`, `boton-exportar-csv`, `ayuda-exportar`, `estado-exportacion-*`, `boton-descargar-pdf-<folio>`, `enlace-verificar-<folio>`.

**Móvil:** contadores 2×2; pestañas con scroll horizontal y la activa visible (`scrollIntoView`); filtros plegados; fechas como `input type="date"` nativos; tabla en tarjetas, con la huella en `texto-huella` partida; «Exportar CSV» a ancho completo.

---

## 3. Pantalla del Administrador para asignar rol y células al Líder (E7-F07)

Se amplía `/admin/usuarios` (E1-F09) sin cambiar sus tres escenarios ni sus diálogos actuales.

### 3.1 Cambios en la pantalla

1. Selector de rol de «Nuevo usuario» y de «Cambiar rol» muestra los 5 roles en este orden: Analista QA, QE, Líder QA, Administrador, Auditor (`ROLES_CATALOGO` y `ETIQUETAS_ROL` crecen; el filtro «Rol» del listado también).
2. Nueva columna **Células** en la tabla (`celulas-usuario-<id>`): para Líder QA, chips con sus células vigentes o «Sin células» (texto de atención); para el resto, «—». Si el API de listado no trae las células, se muestra solo para filas Líder tras una consulta por usuario; ver sección 6.
3. Nueva acción de fila **Células** (`boton-celulas-<id>`, `boton--enlace` como las demás) solo en filas con rol Líder QA.
4. La tabla acepta `?usuario=<id>` (desde la bandeja del Administrador): resalta la fila (`fila-usuario--seleccionada`, borde izquierdo acento + `aria-current="true"`), la lleva a la vista y abre el diálogo de células si el usuario es Líder; si no existe: `mensaje-aviso` «No encontramos al usuario indicado». También `?nuevo=1` abre «Nuevo usuario».
5. La tabla suma paginación y búsqueda con el patrón común (hoy `useUsuarios` no pagina), porque ahora hay 11+ usuarios y el rol de Líder se busca con frecuencia.

### 3.2 Diálogo «Cambiar rol» ampliado (y «Nuevo usuario»)

Se reutiliza `DialogoConfirmacion`. El flujo ocurre en un solo diálogo, con confirmación previa obligatoria (E1-F09#3).

```
┌ Cambiar rol de Ana Pérez ───────────────────────────────┐
│ Rol vigente: [Analista QA]                               │
│ Nuevo rol: [Líder QA ▾]                                  │
│ ─ aparece solo con Líder QA ───────────────────────────  │
│ Células a cargo                                           │
│ Buscar célula [________]            2 seleccionadas       │
│ ☑ CEL-A   ☑ CEL-B   ☐ CEL-C                              │  ← fieldset con legend, checkboxes
│ ⚠ Este líder no verá ninguna HDU hasta que le asignes     │  ← solo con 0 seleccionadas (mensaje-aviso)
│   células.                                                │
│ Resumen: Cambiará de Analista QA a Líder QA.              │
│          Células que tendrá: CEL-A, CEL-B.                 │  ← resumen-cambio-rol (role=status)
│ [mensaje de error del servidor, role=alert]               │
│                      [Cancelar]  [Confirmar cambio]       │
└──────────────────────────────────────────────────────────┘
```

- Con **Auditor**, Administrador, QE o Analista no aparece la lista de células (E7-F07-T03).
- El diálogo de **Nuevo usuario** muestra el mismo `SelectorCelulas` cuando el rol elegido es Líder QA; permite guardar sin células con el aviso (E7-F07-T05).
- La lista de células viene del catálogo existente (`useCelulas`); solo células existentes. Con más de 8 células hay búsqueda (el campo siempre está; filtra sin salir del foco). Los seleccionados se conservan al filtrar. Debajo hay un contador «n seleccionadas» con `aria-live="polite"`.
- Backdrop: con cambios sin guardar, clic fuera **no** cierra (se agrega prop `cerrarAlClicFuera={false}`); Esc cierra con la misma regla (primero pide «¿Descartar cambios?» solo si hay cambios).
- El botón confirmar dice «Confirmar cambio»; mientras guarda: «Guardando…» y se deshabilita (textos ya usados).
- El resumen previo lista **lo que cambiará**: rol, células agregadas y células quitadas. Es la confirmación explícita de lo que el servidor aplicará.

### 3.3 Diálogo «Células de {nombre}» (acción «Células» y `?usuario=`)

```
┌ Células de Luis Soto ────────────────────────────────────┐
│ Vigentes: (CEL-A) (CEL-B)                                │
│ Células a cargo  [buscador]                 2 seleccionadas│
│ ☑ CEL-A  ☑ CEL-B  ☐ CEL-C                                │
│ Resumen: Se agregará CEL-C. Se quitará CEL-B.             │
│ ▸ Historial (3)                                          │  ← <details>
│    CEL-B · desde 01-09-2026 · vigente · asignó ADM1       │
│    CEL-C · 02-09 → 15-09-2026 · asignó ADM1               │
│                      [Cancelar]  [Guardar células]        │
└──────────────────────────────────────────────────────────┘
```

- «Guardar células» está deshabilitado mientras no haya diferencias con las vigentes. Una confirmación adicional aparece **solo al quitar** células (frase «Luis Soto dejará de ver las HDU de CEL-B» dentro del resumen y el botón cambia a «Quitar y guardar» con `boton--peligro`).
- El historial (`historial-celulas-lider`) usa `.historial-lista`/`.historial-item`: célula, desde, hasta (o «vigente»), quién asignó. Se carga al abrir el `<details>`. Estados cargando/vacío («Aún no tiene historial»)/error con «Reintentar».
- El diálogo reconsulta las vigentes al abrir (`GET celulas-lider`): evita sobrescribir cambios de otro administrador.

### 3.4 Flujo y confirmaciones

| Paso | Qué ve y hace el Administrador | Sistema |
| --- | --- | --- |
| 1 | Entra a Usuarios (desde el menú, desde «Asignar células» de la bandeja o desde «Registrar usuario») | Lista con columna Células |
| 2 | Elige «Cambiar rol» o «Células» | Abre el diálogo con valores vigentes |
| 3 | Elige rol Líder QA y marca células | Resumen en vivo |
| 4 | Pulsa «Confirmar cambio» / «Guardar células» | Una operación (ver 6.1 sobre atomicidad): primero el rol y luego `PUT celulas-lider` |
| 5 | Éxito | El diálogo se cierra, el foco vuelve al botón que lo abrió, aparece `mensaje-exito-usuarios` (`role="status"`, verde, cierra solo a los 6 s o con «×»): «Luis Soto ahora es Líder QA con CEL-A y CEL-B.» La fila se actualiza (chips). El cambio queda en «Últimos cambios» de la bandeja |
| 6 | Error | El diálogo permanece abierto con los datos ingresados; el mensaje va bajo los campos (tabla siguiente) |

### 3.5 Errores y mensajes

| Respuesta | Cuándo | Mensaje al usuario (texto base; si el API envía mensaje en español se muestra el del API) | Acción ofrecida |
| --- | --- | --- | --- |
| 409 `RELACIONES_INCOMPATIBLES` por células (D31) | Cambiar rol a un Líder con células | «Antes de cambiar el rol de {nombre} debes quitarle sus células ({lista}).» Se muestra en `error-cambio-rol` (testid cert.). Sin cambios parciales | Botón `boton--enlace` «Quitar células» → abre el diálogo de células con todo desmarcado |
| 409 `RELACIONES_INCOMPATIBLES` por trabajo abierto (D40) | Cambiar rol de analista con supervisión o HDU abiertas, o de QE con analistas o HDU abiertas | «{nombre} tiene {n} HDU abiertas y/o supervisión vigente. Resuélvelo antes de cambiar el rol.» (usa los detalles del error si vienen) | Enlace «Ir a Supervisión» (`/admin/supervision`) |
| 409 `ROL_INCOMPATIBLE` | Asignar células a quien ya no es Líder (otro administrador cambió el rol) | «Este usuario ya no es Líder QA. Actualizamos los datos.» | Refresca el usuario y cierra la lista de células |
| 409 último administrador (E1-B08#2) | Cambiar el propio rol siendo el único admin | Mensaje del API (ya soportado por `error-cambio-rol`) | Cancelar |
| 422 célula inexistente | La célula fue eliminada entre tanto | «Alguna de las células seleccionadas ya no existe. Actualizamos la lista.» | Recarga el catálogo, conserva las demás marcas |
| 422 rol fuera del catálogo | Solo posible con datos manipulados | «Rol no válido.» | — |
| 403 `ACCESO_DENEGADO` | El rol del Administrador cambió | Pantalla de acceso denegado y reconsulta de `/v1/me` | «Ir a mi bandeja» |
| 401 `SESION_EXPIRADA` | Sesión vencida | Flujo existente de cierre de sesión | Login |
| Red / 5xx | Fallo del servidor | «No fue posible guardar. Intenta nuevamente.» | El diálogo no se cierra; botón vuelve a habilitarse |
| Falla solo la segunda llamada (rol cambiado, células no) | Ver 6.1 | «El rol se cambió, pero no pudimos guardar las células. Reintenta desde «Células».» (`aviso-parcial`) | Botón «Reintentar» |

### 3.6 Testids nuevos

`celulas-usuario-<id>`, `boton-celulas-<id>`, `dialogo-celulas`, `buscador-celulas`, `selector-celulas` (el `fieldset`), `celula-opcion-<id>` (checkbox), `contador-celulas-seleccionadas`, `aviso-lider-sin-celulas`, `resumen-cambio-celulas`, `resumen-cambio-rol`, `historial-celulas-lider`, `historial-celula-<id>`, `mensaje-exito-usuarios`, `boton-quitar-celulas`, `aviso-parcial`. Se conservan `fila-usuario-<id>`, `error-cambio-rol`, `error-correo-duplicado`, `error-cambio-estado-usuario`.

---

## 4. Menú y navegación por rol, acceso denegado

### 4.1 Menú (`Layout`, `nav aria-label="Portal"`, orden exacto)

| Rol | Ítems (en este orden) | Cambia respecto de hoy |
| --- | --- | --- |
| Analista QA | **Bandeja** (`/qa`, `end`) · Mis HDU (`/qa/hdu`) · Perfil | «Inicio» → «Bandeja» |
| QE | **Bandeja** (`/qe`, `end`) · Equipo · Historias supervisadas · Perfil | «Inicio» → «Bandeja»; «Aprobaciones» sigue solo en Accesos rápidos (cert. E1-F02#3) |
| Líder QA | **Bandeja** (`/lider`) · Perfil | Nuevo |
| Administrador | **Bandeja** (`/admin`, `end`) · Usuarios · Supervisión · Perfil | «Inicio» → «Bandeja» |
| Auditor | **Bandeja** (`/auditor`, sin `end`: queda activo en las 4 pestañas) · Perfil | Nuevo |

Líder y Auditor no tienen «Nueva HDU», «Usuarios» ni «Aprobaciones» (E7-F01-T02). Las pestañas del Auditor viven dentro de la bandeja para no duplicar el menú. «Cerrar sesión» sigue como botón a la derecha (no es parte de la lista de enlaces, igual que hoy). Las pruebas certificadas que leen `["Inicio", ...]` deben actualizarse a `["Bandeja", ...]` (sección 4 del backlog; confirmado en `e1-f02`, `e1-f05`).

Barra superior: la insignia de rol muestra los 5 roles (`InsigniaRol`); el logo/marca sigue enlazando a `/` que resuelve al portal del rol (`PortalRedirect` con `rutaPortal` ampliada). A 375 px la barra se apila (regla existente a 750 px) y `nav-portal` hace wrap; con 2–4 ítems cabe en una o dos líneas.

### 4.2 Detalle compartido `/hdu/:id` y `/perfil`

Accesibles por todos los roles según su ámbito. Se agrega al detalle un enlace «← Volver a mi bandeja» (`enlace-volver-bandeja`) arriba del título, que regresa a la URL anterior con filtros (se guarda en `location.state.desde`; si no hay, a `rutaPortal(rol)`). En solo lectura se muestra `aviso-solo-lectura`.

### 4.3 Pantalla de acceso denegado

Se extiende `AccesoDenegado` (cert.: `data-testid="acceso-denegado"`, `role="alert"`, `h1` «Acceso denegado») con dos variantes y un botón:

```
┌──────────────────────────────────────────┐
│              Acceso denegado             │  ← h1 (cert.), recibe el foco
│     No tienes acceso a esta sección.     │  ← variante "seccion" (ruta de otro rol)
│     No tienes acceso a este recurso.     │  ← variante "recurso" (HDU fuera de ámbito, cert. E2-F04#2)
│          [ Ir a mi bandeja ]             │  ← Link a rutaPortal(rol), boton--primario, data-testid="boton-ir-a-mi-bandeja"
└──────────────────────────────────────────┘
```

- Mismo contenedor `.acceso-denegado` (centrado, borde, 40 px de relleno); el botón se agrega siempre.
- **No muestra datos ni revela existencia**: sin nombre de recurso, sin ID, sin rol requerido. El mismo texto para «no existe» y «no autorizado».
- Se muestra **en la URL pedida** (no se redirige) y **dentro del `Layout`** (el menú propio sigue visible). La ruta ajena no dispara ninguna petición de datos (el guard actúa antes de montar la página).
- Aplica a las 20 combinaciones rol × portal ajeno (E7-F01-T04), incluidos Administrador→`/lider`/`/auditor` y Auditor→`/admin`.
- Sin sesión: redirige a `/login` (comportamiento actual) y, tras ingresar, a la bandeja del propio rol aunque la ruta pedida fuera de otro rol (E7-F01-T06; se descarta el `from` si el rol no lo permite).
- Cambio de rol con sesión abierta: cualquier 403 dispara reconsulta de `/v1/me`; si el rol cambió, se redirige a la nueva bandeja y se muestra un aviso `role="status"` «Tu rol cambió. Te llevamos a tu nueva bandeja.» (E7-F01-T07).
- Estados de arranque: mientras se consulta `/v1/me`, pantalla de carga completa (`BloqueEstado cargando`, `data-testid="cargando-sesion"`), nunca un portal equivocado; si falla por red: `BloqueEstado error` con «Reintentar»; 401 `SESION_EXPIRADA` → login (flujo existente).

---

## 5. Inventario de componentes y tokens

### 5.1 Componentes

**Reutilizados sin cambios:** `RequireAuth`, `AuthContext` (`rutaPortal` se amplía), `Etiquetas` (`InsigniaEstadoHdu`, `InsigniaPrioridad`, `InsigniaActivo`), `ChecklistEntregables` (con permisos en false), `useCelulas`/`useSprints`, `lib/formato.ts`, `.panel`, `.filtros`, `.campo`, `.historial-*`, `.barra-progreso`, `.enlaces-rapidos`, `.mensaje-aviso`, `.mensaje-error-global`.

**Reutilizados con cambios compatibles hacia atrás:**

| Componente | Cambio |
| --- | --- |
| `Layout` | Entradas de menú de Líder y Auditor; «Inicio» → «Bandeja»; enlace «Saltar al contenido»; `main id="contenido"` |
| `BloqueEstado` | `onReintentar` también en `indisponible`; prop `tono="exito"`; testid certificado intacto |
| `TarjetaMetrica` | Props opcionales `clave` (agrega `contador-<clave>` al valor y `estado-indisponible-<clave>` al estado), `atencion` (borde + «Requiere atención»), `detalle` (nodo bajo el valor: desglose, «en N HDU»); se mantiene `tarjeta-<id>` |
| `AccesoDenegado` | Prop `variante: "seccion" \| "recurso"`, botón «Ir a mi bandeja», foco en el `h1` |
| `RequireRole` | En vez de `Navigate` al portal propio, renderiza `AccesoDenegado` variante `seccion` (ver 6.2) |
| `DialogoConfirmacion` | `useId` para `aria-labelledby`, Esc, foco atrapado y devuelto, `cerrarAlClicFuera`, `max-height` + scroll, versión móvil a 100 % |
| `InsigniaRol` / `ROLES_CATALOGO` / `ETIQUETAS_ROL` | 5 roles; clases `badge-lider-qa` y `badge-auditor` |
| `HduListado` | Sin cambios en `/qe/hdu` y `/qa/hdu` (certificadas); la bandeja del Analista usa `TablaBandeja` y no reemplaza «Mis HDU» |
| `HduDetailPage` | Aviso de solo lectura, enlace «Volver a mi bandeja», anclas `#asignacion`, `#certificado`, `#estado` |
| `QeAprobacionesPage` | Acepta `?hdu=<id>` (resalta/filtra la HDU) |
| `AdminUsuariosPage` | Roles ampliados, columna/acción de células, `?usuario=`, `?nuevo=`, paginación |
| `AdminInicioPage`, `QaInicioPage`, `QeInicioPage` | Pasan a ser las bandejas; se conservan las tarjetas y Accesos rápidos certificados |

**Nuevos:**

| Componente | Función |
| --- | --- |
| `EncabezadoBandeja` | `p.etiqueta` + `h1 «Bandeja»` + descripción + zona de chips + `AvisoSoloLectura` |
| `AvisoSoloLectura` | Aviso fijo de solo lectura (`aviso-solo-lectura`) |
| `GrupoContadores` | `section` con `h2` opcional que envuelve `.tarjetas-resumen` (`--compactas` en móvil) |
| `BloqueDatos` | Envuelve `BloqueEstado` agregando el testid `estado-<tipo>-<clave>`; decide cargando/error/indisponible/vacío para una consulta |
| `TablaBandeja` | Tabla genérica: `caption`, columnas ordenables con `aria-sort`, fila navegable, esqueleto de carga, modo apilable ≤ 640 px |
| `Paginacion` | Navegación de páginas y tamaño |
| `BarraFiltros` + `useFiltrosUrl` | Sincroniza filtros, orden, página y pestaña con la query string; chips de filtros activos; botón plegable en móvil |
| `BuscadorTexto` | Búsqueda con espera de 300 ms |
| `InsigniaObservaciones`, `InsigniaAccion`, `ChipCelula` | Insignias y chips (con texto + ícono) |
| `CeldaAvance` | `n/10 · %` + barra decorativa, o «No disponible» |
| `PestanasAuditor` | Navegación por pestañas del Auditor |
| `BotonExportarCsv` | Exportación con estados (normal, exportando, éxito, excede, error) |
| `SelectorCelulas` | `fieldset` con buscador y casillas, contador, resumen del cambio |
| `DialogoCelulasLider` | Diálogo de células + historial (`HistorialCelulas`) |
| `MensajeExito` | `role="status"` verde con cierre |
| `ListaPendientes`, `ListaUltimosCambios` | Bloques del Administrador |

### 5.2 Tokens y clases CSS a agregar

En `tokens.css`:

```
/* Roles nuevos (texto sobre fondo ≥ 6:1) */
--q360-color-lider: #5b21b6;            --q360-color-lider-suave: #f1eafe;
--q360-color-auditor: #0f5f6b;          --q360-color-auditor-suave: #e0f4f6;
/* Solo lectura */
--q360-color-solo-lectura: #3b4658;     --q360-color-solo-lectura-suave: #eef1f5;
/* Observaciones / atención */
--q360-color-observacion: var(--q360-color-alerta);
--q360-color-observacion-suave: var(--q360-color-alerta-suave);
--q360-color-atencion-borde: #c98a00;   /* borde izquierdo de tarjeta con atención (no es texto) */
/* Esqueleto */
--q360-color-esqueleto: #e6eaf0;        --q360-color-esqueleto-brillo: #f3f5f8;
/* Interacción */
--q360-objetivo-tactil: 44px;
--q360-ancho-tabla-titulo: 260px;
```

En `global.css` (clases nuevas, mismo estilo de nombres):

`.sr-only`, `.saltar-contenido`, `.aviso-solo-lectura`, `.tarjetas-resumen--compactas`, `.tarjeta-resumen--atencion`, `.tarjeta-resumen__detalle`, `.tarjeta-resumen__atencion` (texto «Requiere atención»), `.grupo-contadores`, `.chips`, `.chip`, `.chip--quitar`, `.badge-lider-qa`, `.badge-auditor`, `.badge-observacion`, `.badge-accion`, `.bloque-estado--exito`, `.esqueleto`/`.esqueleto-fila` (con `@keyframes` y `prefers-reduced-motion`), `.th-ordenable`, `.fila-navegable`, `.fila-resaltada`, `.celda-titulo` (line-clamp), `.tabla--apilable` (reglas ≤ 640 px), `.paginacion`, `.filtros-toggle`, `.filtros--plegado`, `.pestanas`/`.pestana`, `.acciones-tabla` (hoy se usa en `AdminUsuariosPage` pero **no está definida** en `global.css`; se define como `display:flex; gap:12px; flex-wrap:wrap`), `.selector-celulas`, `.mensaje-exito`, `.acceso-denegado__acciones`, y un bloque `@media (forced-colors: active)` para el foco.

Ninguna clase ni token existente cambia de valor. `.badge-estado` sigue igual para estados de HDU.

---

## 6. Conflictos y decisiones pendientes con el backlog E7

1. **Acceso a portal ajeno: redirección vs. pantalla (conflicto real).** La sección 4 del backlog dice que E1-F02#2, E1-F05#3 y E1-F07 siguen con resultado «acceso denegado», pero hoy `RequireRole` **redirige** al portal propio y las pruebas certificadas (`routeGuard.test.tsx`, `tests/e2e/e1-f02-portal-qe.spec.ts`, `e1-f05-portal-qa.spec.ts`) afirman la URL final `/qe`, `/qa`. E7-F01#3 y T04 exigen pantalla de acceso denegado. Este diseño sigue E7-F01 (pantalla en la URL pedida). **Esas pruebas deben reescribirse** (cambio de resultado esperado, no solo casos nuevos); el backlog debe reclasificar el efecto sobre HDU certificada.
2. **Texto de acceso denegado.** El componente actual dice «No tienes acceso a este recurso»; E7 pide «No tienes acceso a esta sección» + «Ir a mi bandeja». Se resolvió con dos variantes (ambos textos coexisten) y el botón en las dos.
3. **Convención `estado-vacio-<clave>` vs. `bloque-<id>-<estado>` ya certificado.** Son dos testids distintos; se resuelve con un contenedor envolvente (`BloqueDatos`) en vez de cambiar el existente.
4. **Atomicidad en E7-F07#2.** El backlog pide «no se aplica ningún cambio parcial», pero asignar rol Líder y sus células son dos operaciones (`ROL_INCOMPATIBLE` obliga a cambiar el rol antes del `PUT celulas-lider`). Si la segunda falla, queda un Líder sin células. Recomendación: que `CambioRol` acepte `celulaIds` opcional y sea una sola transacción; si no, se usa el aviso `aviso-parcial` de 3.5. Lo mismo vale para «Nuevo usuario» con rol Líder.
5. **D40 requiere detalles del 409.** Para el mensaje útil («tiene N HDU abiertas») el error debe incluir detalles; hoy `comun.v1.yaml` solo trae el mensaje genérico de relaciones de supervisión.
6. **Célula sin líder: sin acción definida.** La sección 6.4 define botones para analista sin QE y líder sin células, pero E7-F05-T02 incluye la fila «CEL-C sin líder» sin botón. Se propuso «Asignar líder» → `/admin/usuarios?rol=LIDER_QA`; no hay pantalla de células. También falta definir qué hace «QE sin analistas» (contador sin fila en T02); se propuso «Asignar analistas».
7. **Preselección de usuario.** E7-F05#3 pide abrir `/admin/usuarios` con el usuario seleccionado y E7-F05 «Asignar QE» abre supervisión: ni `AdminUsuariosPage` ni `AdminSupervisionPage` aceptan hoy parámetros; el diseño agrega `?usuario=` y `?analista=`/`?qe=` (la segunda es mejora, no bloquea).
8. **Contadores duplicados en Administrador.** `Analistas sin supervisor` (cert.) y `analistas-sin-qe` (nuevo) son el mismo dato; se unificaron en una tarjeta con ambos testids para no mostrar dos cifras idénticas ni romper pruebas.
9. **Auditor: `/auditor` vs. `/auditor/hdu`.** El backlog nombra ambas rutas; se definió que `/auditor` renderiza la pestaña HDU sin redirigir (E7-F06-T01) y la pestaña enlaza a `/auditor/hdu`.
10. **Definiciones faltantes en E7-B04.** «Validez» del certificado (valores posibles), «Operación» de auditoría (catálogo para el filtro y los textos legibles) y «Acción» de bitácora (el contrato usa verbos en pasado en `ETIQUETAS_ACCION_CHECKLIST`; las pestañas necesitan infinitivos «Marcar/Aprobar…»). Hay que fijar los catálogos en `contracts/`.
11. **Células en el listado de usuarios.** La columna Células exige que `GET /v1/usuarios` incluya las vigentes para Líder o una consulta por fila; el backlog solo define `GET /v1/usuarios/{id}/celulas-lider`.
12. **Pruebas sensibles a este diseño.** E7-F06-T07 prohíbe `button[type=submit]`: todos los controles deben ser `type="button"` y los filtros no pueden estar en un `<form>`; E7-F03-T02 exige `?hdu=` en aprobaciones (cambio sobre pantalla certificada, aditivo). Además `QaHduListPage` y `QeHduListPage` siguen con filtros en estado local y sin paginación; no se tocan en esta ronda.
13. **Revisión de contraste.** Los pares nuevos están calculados por inspección; hace falta una pasada con herramienta (axe/Lighthouse) en `q360-qa` antes de certificar.
14. **Impedimentos (D36).** Ninguna bandeja reserva espacio ni contador para E4; los grupos de contadores están pensados para sumar un bloque nuevo sin rediseñar.

### 6.1 Resolución (q360-arquitecto, 2026-10-21)

Las decisiones completas están en `docs/arquitectura/decisiones-mvp.md`, sección «Corrida E7». Lo que cambia en este diseño:

| # | Resolución | Efecto en el diseño |
| --- | --- | --- |
| 1 | D41: pantalla de acceso denegado en la URL pedida | Se adopta 4.3. Las pruebas certificadas a reescribir están listadas en la Corrida E7 |
| 2, 3, 8, 9, 12, 14 | Se aceptan tal como están propuestas | Ninguno |
| 4 | D42: el cambio de rol acepta `celulaIds` y se aplica en una transacción; `POST /v1/usuarios` también | 3.4 paso 4 es **una sola llamada** (`PUT /v1/usuarios/{id}/rol` con `celulaIds`, o `POST /v1/usuarios`). Se elimina la fila «Falla solo la segunda llamada» de 3.5 y `aviso-parcial`. El diálogo «Células de {nombre}» usa `PUT /v1/usuarios/{id}/celulas-lider` |
| 5 | D43: el 409 trae `relaciones.{analistasVigentes, supervisorVigente, hduAbiertas{total, items}, celulasVigentes}` | Los mensajes de 3.5 se arman con esos campos |
| 6 | D51: «QE sin analistas» → `/admin/supervision?qe=<id>`; «Célula sin líder» → `/admin/usuarios?rol=LIDER_QA` | Se adopta lo propuesto |
| 7, 11 | D44: parámetros de preselección aditivos; `GET /v1/usuarios/{id}` y `Usuario.celulasVigentes` en el listado | La columna Células sale del listado, sin consultas por fila |
| 10 | D45: `valido` booleano (igual que la verificación pública); `OperacionAuditoriaUsuarios` y `AccionChecklist` con etiquetas en `comun.v1.yaml` | Filtros y columnas usan esas etiquetas |
| 13 | `q360-qa` corre axe antes de certificar | Ninguno |

Parámetros de API (D49): las bandejas usan `celulaId`, `sprintId`, `qeId`, `analistaId` y `tamanoPagina`; la URL del portal conserva `?celula=`, `?tamano=`, y `src/api` hace la conversión (1.4).
