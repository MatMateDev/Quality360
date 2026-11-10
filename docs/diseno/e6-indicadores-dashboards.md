# Diseño E6 · Indicadores, dashboards y cierre con excepción

Fecha: 2026-11-04. Insumos: `docs/backlog/e6-indicadores-dashboards.md` (E6-F01..F05, E6-B01..B05, D153–D175, fixture de la sección 8; fuente de verdad) y el sistema visual ya construido: `docs/diseno/e4-impedimentos-y-riesgos.md`, `docs/diseno/e5-integracion-jira.md`, `apps/web/src/styles/tokens.css`, `global.css`, `bandejas.css`, `impedimentos.css`, `integraciones.css`, `components/bandeja/*` (`PestanasNav`, `TablaBandeja`, `BarraFiltros`, `BloqueDatos`, `AvisoSoloLectura`, `Paginacion`, `BotonExportarCsv`), `components/impedimentos/*` (`SemaforoRiesgo`, `ErrorCierreBloqueado`, `CampoTextoContador`), `BloqueEstado`, `TarjetaMetrica`, `DialogoConfirmacion`, `Layout` y `HduDetailPage`. Este documento define **cómo se ve y se comporta** E6; no contiene código. Dueño de construcción: `q360-frontend`.

Notación: «cert.» = elemento certificado, **no se modifica** (texto, `data-testid`, ruta, orden). Lo que no se menciona aquí se resuelve con lo existente. Si algo de este diseño contradijera el backlog, gana el backlog y se anota en la sección 15.

Decisiones del backlog que gobiernan el diseño: el **QE** ve su ámbito (responsable + supervisados, D153); **Líder QA** (sus células) y **Auditor** (todo) ven lo mismo en **solo lectura** y también exportan; el **Administrador** solo dispara y consulta ejecuciones del snapshot, sin cifras (D165); el **Analista** no ve nada; el color del semáforo siempre lleva texto (3.4); un dato caído **nunca** es 0 ni verde (D169); el umbral de sobrecarga lo fija solo el QE dueño (D159); cerrar con excepción es del **QE responsable**, con justificación, sin certificado y sin reapertura (D173–D175).

No hay librería de gráficos en `apps/web/package.json` (solo React, React Router y TanStack Query): el gráfico de tendencia es **SVG propio** (sección 6.3). No se agrega ninguna dependencia.

---

## 1. Principios

1. **Reutilizar, no inventar.** Pestañas por ruta (`PestanasNav`), tarjetas de cifra (`TarjetaMetrica`), tablas (`TablaBandeja`, apilable a ≤ 640 px), filtros en la URL (`BarraFiltros`, `useFiltrosUrl`), estados (`BloqueDatos`/`BloqueEstado`), solo lectura (`AvisoSoloLectura`), diálogo (`DialogoConfirmacion`), contador de caracteres (`CampoTextoContador`). Los colores de E6 son **alias** de tokens existentes: no se agrega ningún hexadecimal nuevo (E5 §1.1).
2. **Un dato caído nunca es 0, nunca es verde.** Cada cifra y cada tarjeta de célula tiene estado propio `ok | indisponible` (D169). «No disponible» reemplaza la cifra; no hay valores de relleno ni en pantalla ni en los archivos.
3. **Cero no es lo mismo que sin dato.** «0» es un dato válido (`ok`). «Sin datos» (ámbito o filtro vacíos) no muestra cifras ni «0 %». «—» es «no aplica» (analista sin HDU: cumplimiento). Los tres se ven distintos (sección 10.1).
4. **Texto + forma + color.** Semáforo de célula, sobrecarga, resultado de ejecución y series del gráfico siempre llevan palabra y una forma o trazo distinto (sección 11). El color nunca es el único canal.
5. **Gráfico siempre con alternativa.** Resumen textual visible + tabla de los mismos puntos, siempre en el DOM (sección 6.4).
6. **Una vista, tres roles.** QE, Líder y Auditor montan los **mismos componentes**; lo que cambia es el ámbito (lo decide el servidor) y una propiedad `soloLectura`. En solo lectura los controles de escritura **no existen** (D39), no se deshabilitan. Cada rol vive bajo su propio prefijo de ruta, de modo que `RequireRole` resuelva el acceso (D41).
7. **Sin caché, sin datos viejos mezclados.** Las consultas se piden con `staleTime: 0` y se repiten al volver a la pestaña o a la ventana (E6-F02#3). Mientras se recalcula tras un cambio de filtro, las cifras se reemplazan por esqueleto: nunca se mezclan cifras del filtro anterior con el nuevo.
8. **Estado en la URL.** Filtros, vista, drill-down y escala en la URL (`celula`, `sprint`, `detalle`, `desde`, `hasta`, `escala`), igual que E7/E4/E5; «Atrás» funciona.
9. **Todo botón `type="button"`**, salvo el formulario del umbral (solo QE, `submit`). Ninguna pantalla de Líder o Auditor tiene `<form>` ni `button[type=submit]` (E7-F06-T07).
10. **Cierre con excepción es aditivo.** No cambia ningún texto, `data-testid` ni orden certificado del detalle de HDU; agrega un botón, un diálogo, un bloque y un evento de historial (sección 9).

---

## 2. Rutas, menú y acceso por rol

### 2.1 Rutas

Las cuatro pestañas son rutas (patrón E5 §2.1). La pestaña «Cumplimiento» es la **ruta índice, sin redirección**, porque E6-F01-T01 abre `/qe/indicadores` y espera las cifras.

| Ruta | Quién | Contenido |
| --- | --- | --- |
| `/qe/indicadores` | QE | Cumplimiento (índice) |
| `/qe/indicadores/semaforo` | QE | Semáforo por célula (+ `?detalle=<celulaId>` = drill-down abierto) |
| `/qe/indicadores/carga` | QE | Carga por analista y umbral (edición) |
| `/qe/indicadores/tendencia` | QE | Tendencia |
| `/lider/indicadores` y `/lider/indicadores/{semaforo,carga,tendencia}` | Líder QA | Las mismas cuatro, solo lectura |
| `/auditor/indicadores` y `/auditor/indicadores/{semaforo,carga,tendencia}` | Auditor | Las mismas cuatro, solo lectura |
| `/admin/indicadores/snapshots` | Administrador | Snapshot: botón y ejecuciones (sección 8) |
| `/hdu/:id` | Todos los roles con acceso (cert.) | Detalle con el cierre con excepción (sección 9) |
| Cualquier ruta de indicadores de otro rol; todas, para Analista QA; las de dashboards, para el Administrador | — | `AccesoDenegado` con «Ir a mi bandeja» vía `RequireRole` (D41, D153). Las peticiones de datos devuelven 403 |

Rutas de Líder y Auditor: el Auditor **no** usa su barra de pestañas (`PestanasAuditor`): la página `/auditor/indicadores*` se monta **fuera** de `AuditorLayout`, con su propia `PestanasNav`, para no mostrar dos filas de pestañas (seis de E7/E5 y cuatro de E6). El acceso al Auditor es por la opción de menú «Indicadores» (backlog sección 7).

### 2.2 Menú (`Layout`, `nav aria-label="Portal"`)

El backlog (sección 7) fija la posición del QE: la opción nueva va **después de «Impedimentos»**. El código actual ya tiene «Integraciones» en QE y Administrador (E5), que el backlog no menciona; se conserva.

| Rol | Menú exacto (incluye «Perfil» al final) |
| --- | --- |
| QE | `["Bandeja","Equipo","Historias supervisadas","Impedimentos","Indicadores","Integraciones","Perfil"]` (`/qe/indicadores`, sin `end`: queda `aria-current` en las cuatro pestañas) |
| Líder QA | `["Bandeja","Indicadores","Perfil"]` (`/lider/indicadores`, sin `end`) |
| Auditor | `["Bandeja","Indicadores","Perfil"]` (`/auditor/indicadores`, sin `end`) |
| Administrador | `["Bandeja","Usuarios","Supervisión","Integraciones","Snapshots de indicadores","Perfil"]` (`/admin/indicadores/snapshots`) |
| Analista QA | `["Bandeja","Mis HDU","Perfil"]` (sin cambio) |

Efectos en el `Layout` actual:
- **Líder:** «Bandeja» pasa a `end` (hoy no lo tiene) para que no quede `aria-current` en `/lider/indicadores`. No hay otras rutas bajo `/lider`.
- **Auditor:** «Bandeja» hoy no tiene `end` porque debe quedar activa en sus seis pestañas bajo `/auditor/*`. Para excluir `/auditor/indicadores*` se usa una función `isActive` propia en ese ítem (activo si la ruta empieza con `/auditor` y **no** con `/auditor/indicadores`). Sin esto habría dos ítems con `aria-current="page"`.
- **Administrador:** el ítem «Snapshots de indicadores» es el más largo del menú; a 375 px `nav-portal` ya hace wrap (6 ítems en dos o tres líneas, objetivos de 44 px).
- **QE:** 7 ítems; a 375 px, tres líneas de wrap como máximo. Sin cambios de CSS.

### 2.3 Pestañas (`PestanasNav`, `aria-label="Secciones de indicadores"`)

| Texto | `data-testid` | Ruta (QE) |
| --- | --- | --- |
| Cumplimiento | `tab-cumplimiento` | `/qe/indicadores` |
| Semáforo | `tab-semaforo` | `/qe/indicadores/semaforo` |
| Carga | `tab-carga` | `/qe/indicadores/carga` |
| Tendencia | `tab-tendencia` | `/qe/indicadores/tendencia` |

Los `data-testid` son los del backlog (sección 9), distintos de `pestana-*` de E4/E5. Los enlaces de pestaña **conservan** `celula` y `sprint` de la URL al cambiar de pestaña (un QE que filtró CEL-A sigue en CEL-A); el Semáforo **ignora** `sprint` (no filtra por sprint, 3.4) pero lo conserva en la URL para cuando se vuelva. A 375 px las pestañas hacen scroll horizontal interno (patrón E4) y la activa queda visible.

### 2.4 Encabezado común y barra de herramientas

Todas las pantallas de dashboard comparten:

```
 PORTAL QE                                         ← p.etiqueta («Portal Líder QA», «Portal Auditor»)
 Indicadores                                       ← h1 (foco al entrar, como EncabezadoBandeja)
 Cumplimiento de certificación de tu equipo y de los analistas que supervisas.
 ◉ Vista de solo lectura. Puedes consultar y descargar, no modificar.    ← solo Líder/Auditor (AvisoSoloLectura, cert.)
 [ Cumplimiento ] [ Semáforo ] [ Carga ] [ Tendencia ]                    [ ⬇ Exportar ▾ ]
 Ámbito: HDU donde eres QE responsable y las de los analistas que supervisas.   Datos al 04-11-2026 15:20
```

| Rol | Descripción del `h1` | Línea de ámbito (`texto-ambito`) |
| --- | --- | --- |
| QE | «Cumplimiento de certificación de tu equipo y de los analistas que supervisas.» | «Ámbito: HDU donde eres QE responsable y las de los analistas que supervisas.» |
| Líder QA | «Cumplimiento de certificación de tus células.» | «Ámbito: HDU de las células que tienes asignadas.» |
| Auditor | «Cumplimiento de certificación de todas las células.» | «Ámbito: todas las HDU.» |

La línea de ámbito explica por qué las cifras de un QE difieren de las de su bandeja (D153, que incluye supervisados). «Datos al …» (`actualizado-en`) es la hora del navegador en la que llegó la última respuesta, en hora de Chile; se actualiza con cada recarga de datos. El botón «Exportar» (sección 7) vive a la derecha de las pestañas y exporta la pestaña activa.

---

## 3. Cumplimiento (E6-F01)

### 3.1 Wireframe 1280

```
 [ Cumplimiento ] [ Semáforo ] [ Carga ] [ Tendencia ]                                  [ ⬇ Exportar ▾ ]
 ┌ Filtros ─────────────────────────────────────────────────────────────────────────────────────────────┐
 │ Célula [Todas las células ▾]   Sprint [Todos los sprints ▾]                       [Limpiar filtros]    │
 │ chips: Célula: CEL-A × · Sprint: S-12 ×                                           5 HDU en el filtro  │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
 Resumen                                                                         ← h2 (GrupoContadores)
 ┌ Cumplimiento promedio ───────────────────┐ ┌ HDU totales ─────┐ ┌ Bloqueadas ───────────────┐
 │                 44 %                      │ │        5         │ │        2                  │
 │ Promedio del avance real de cada HDU      │ │ en el filtro     │ │ ▲ Requiere atención       │
 │ (cada entregable aprobado suma 10 %).     │ │                  │ │ Transversal: también      │
 │ [indicador-cumplimiento]                  │ │                  │ │ cuentan en su estado.     │
 └───────────────────────────────────────────┘ └──────────────────┘ └───────────────────────────┘
 Estado de las HDU                                                               ← h2
 ┌ Certificadas ┐ ┌ Cerradas con excepción (sin certificado) ┐ ┌ En curso ┐ ┌ Sin iniciar ┐
 │      1       │ │                   0                      │ │    3     │ │      1      │
 │              │ │ Cerradas sin los 10 entregables.          │ │          │ │             │
 └──────────────┘ └──────────────────────────────────────────┘ └──────────┘ └─────────────┘
 Certificadas + Cerradas con excepción + En curso + Sin iniciar = HDU totales (1 + 0 + 3 + 1 = 5).   ← nota-cuadre
```

- **Orden y grupos.** Primero lo que se lee de un vistazo (cumplimiento, totales, bloqueadas), luego el reparto excluyente que suma los totales. «Bloqueadas» va en el primer grupo porque es transversal (D155): no suma en la ecuación y la tarjeta lo dice. Rejilla `auto-fit minmax(200px, 1fr)` de `.tarjetas-resumen` (cert.); «Cumplimiento promedio» ocupa 2 columnas a ≥ 900 px (`.tarjeta-resumen--ancha`).
- **Tarjetas.** Todas son `TarjetaMetrica` con `clave`: título exacto de la lista, valor en `indicador-<clave>` (claves `totales`, `certificadas`, `cerradas-excepcion`, `en-curso`, `sin-iniciar`, `bloqueadas`, `cumplimiento`). Se agrega a `TarjetaMetrica` una propiedad opcional `testIdValor` (por defecto `contador-<clave>`; E6 pasa `indicador-<clave>`). El valor es solo el número («5», «44 %»), sin texto adicional dentro del elemento.
- **Cumplimiento.** Entero con «%» y espacio fino («44 %»). El decimal de la API no se muestra (D156). `0 %` es válido solo si hay HDU en el filtro (`hduTotales > 0`).
- **Nota de cuadre.** `nota-cuadre` (texto pequeño, `--q360-color-texto-secundario`) solo cuando las cuatro cifras están `ok`. Si alguna está indisponible, no se muestra (no se puede afirmar la suma).
- **Bloqueadas** usa `atencion` (borde y «▲ Requiere atención» cuando > 0), igual que E4.
- **Recálculo.** Al cambiar un filtro: las siete tarjetas pasan a `aria-busy="true"` con esqueleto; al llegar los datos, un `role="status"` `sr-only` (`anuncio-recalculo`) dice «Indicadores actualizados: 3 HDU» (o «Sin HDU con esos filtros»). El foco no se mueve (queda en el filtro).

### 3.2 Filtros

`BarraFiltros` con dos campos: `filtro-celula` (primera opción «Todas las células»; solo células con HDU en el ámbito) y `filtro-sprint` (primera «Todos los sprints»; los sprints de esas HDU, los cerrados con «(cerrado)», y la opción «Sin sprint»). URL: `?celula=<id>&sprint=<id>`. El conteo del lado derecho «N HDU en el filtro» se muestra solo con `ok` en totales. Los chips de filtros activos y «Limpiar filtros» son los de `BarraFiltros` (cert.). Un UUID válido que el servidor no reconoce vuelve como `sinDatos` (no error): el mensaje es «No hay HDU con esos filtros». A 375 px los filtros se pliegan en «Filtros (n)» (cert.).

### 3.3 Wireframe 375

```
┌──────────────────────────────┐
│ [Filtros (1)]  [⬇ Exportar ▾] │
│ Célula: CEL-A ×               │
│ ┌ Cumplimiento promedio ────┐ │  ← ancho completo
│ │            13 %           │ │
│ │ Promedio del avance real… │ │
│ └───────────────────────────┘ │
│ ┌ HDU totales ┐ ┌ Bloqueadas ┐│  ← 2 columnas (cert.)
│ │      3      │ │ 1 ▲ Atenc. ││
│ └─────────────┘ └────────────┘│
│ ┌ Certificadas┐ ┌ Cerradas con││
│ │      0      │ │ excepción   ││
│ │             │ │ (sin certif)││
│ └─────────────┘ └─────────────┘│
│ ┌ En curso ───┐ ┌ Sin iniciar ┐│
│ │      2      │ │      1      ││
│ └─────────────┘ └─────────────┘│
└──────────────────────────────┘
```

El título largo «Cerradas con excepción (sin certificado)» se parte en tres líneas dentro de la tarjeta (sin truncar ni `text-overflow`). Sin desborde horizontal: `min-width: 0` en las tarjetas.

### 3.4 Estados

| Situación | Presentación |
| --- | --- |
| Cargando | Siete tarjetas con esqueleto (`aria-busy`). |
| Sin datos, ámbito vacío | Una sola `BloqueEstado` `vacio` (`estado-sin-datos`): «Aún no tienes HDU en tu ámbito». Para Líder/Auditor, mismo texto. Sin tarjetas, sin «0 %». Los filtros se ocultan (no hay nada que filtrar). |
| Sin datos, filtro sin coincidencias | `estado-sin-datos`: «No hay HDU con esos filtros» + botón «Limpiar filtros». Filtros visibles. Sin ningún `indicador-*`. |
| Indicadores no disponibles (Certificaciones caída) | Se conservan `indicador-totales`, `indicador-cerradas-excepcion` e `indicador-bloqueadas` con su valor. `certificadas`, `en-curso`, `sin-iniciar` y `cumplimiento` muestran «⛔ No disponible» (`estado-indisponible-<clave>`) **sin** botón por tarjeta. Sobre las tarjetas aparece **un solo** aviso `aviso-fuente-no-disponible` (`role="status"`, `mensaje-aviso`): «No pudimos consultar el avance de los entregables. Las cifras que dependen de él no se muestran para no entregar datos inexactos.» + «Reintentar». `nota-cuadre` oculta. |
| `bloqueadas` indisponible (Impedimentos caído) | Solo esa tarjeta: «⛔ No disponible» + aviso análogo «No pudimos consultar los impedimentos…». |
| Error (Indicadores caído, 5xx) | `BloqueEstado` `error` (`estado-error-cumplimiento`) con «Reintentar»; nunca tarjetas vacías ni ceros. Pestañas y menú siguen operativos. |
| Servicio de Organización caído (503) | `BloqueEstado` `indisponible`: «No disponible» + «Reintentar»; sin cifras. |
| 403 | `AccesoDenegado` (cert.) con «Ir a mi bandeja». |

---

## 4. Semáforo por célula (E6-F02)

### 4.1 Niveles visuales

El semáforo de célula **reutiliza los pares de color, las formas y los textos del semáforo de riesgo de E4** (E4 §3.1), para que el usuario aprenda un solo lenguaje. Rojo = riesgo Alto o impedimento escalado; el color se calcula en servidor (3.4) y el portal solo lo pinta.

| Estado (`data-color`) | Texto | Glifo | Par texto / fondo | Origen del token |
| --- | --- | --- | --- | --- |
| `ROJO` | Rojo | `▲` | `#991b1b` / `#fde8e8` (≈ 7,0:1) | alias de `--q360-color-riesgo-alto*` |
| `AMARILLO` | Amarillo | `◆` | `#6b4400` / `#fff0b8` (≈ 7,5:1) | alias de `--q360-color-riesgo-medio*` |
| `VERDE` | Verde | `●` | `#0f5132` / `#e5f6ec` (≈ 8,4:1) | alias de `--q360-color-riesgo-bajo*` |
| `SIN_HDU` (gris) | Sin HDU | `○` | `#5b5f66` / `#eceef1` (≈ 5,8:1) | `--q360-color-indisponible*` |
| `NO_DISPONIBLE` (gris) | No disponible | `⛔` | `#5b5f66` / `#eceef1` | `--q360-color-indisponible*` |

Valores por inspección; `q360-qa` los confirma con axe (misma salvedad de E4 §3.1). Posición, forma, palabra y color se repiten: nunca solo color.

### 4.2 Wireframe 1280

```
 [ Cumplimiento ] [ Semáforo ] [ Carga ] [ Tendencia ]                                  [ ⬇ Exportar ▾ ]
 Célula [Todas las células ▾]                                                      [Limpiar filtros]
 ▸ ¿Cómo se calcula el color?                                       ← details (sección 4.5)
 Células (3)                                                                      ← h2
 ┌ CEL-A ────────────────────────┐ ┌ CEL-B ────────────────────────┐ ┌ CEL-C ────────────────────────┐
 │ ◯ ◯ ◯   ▲ Rojo                │ │ ◯ ◯ ◯   ▲ Rojo                │ │ ◯ ◯ ◯   ● Verde               │
 │ (lámpara roja encendida)      │ │                               │ │                               │
 │ Riesgo máximo      ▲ Alto     │ │ Riesgo máximo      ◆ Medio    │ │ Riesgo máximo      ● Bajo     │
 │ Impedimentos abiertos      1  │ │ Impedimentos abiertos      0  │ │ Impedimentos abiertos      0  │
 │ Impedimentos escalados     0  │ │ Impedimentos escalados     1  │ │ Impedimentos escalados     0  │
 │ [Ver HDU de CEL-A]            │ │ [Ver HDU de CEL-B]            │ │ [Ver HDU de CEL-C]            │
 └───────────────────────────────┘ └───────────────────────────────┘ └───────────────────────────────┘
 ┌ HDU que generan el color de CEL-A  (data-testid="lista-drilldown")  [Cerrar detalle] ───────────────┐
 │ HDU   TÍTULO       MOTIVO                RIESGO VIGENTE  IMPEDIMENTO        ANALISTA   ESTADO        │
 │ H1    Título H1    Riesgo alto           ▲ Alto          I2 Abierto · 6 d   Ana 1      En ejecución  [Abrir]│
 │ H5    Título H5    Riesgo alto           ▲ Alto          —                  Sin asign. Pendiente     [Abrir]│
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Tarjeta de célula** (`tarjeta-celula-<codigo>`, `data-color`): `article` con `h3` = nombre de la célula; borde superior de 4 px del color (decoración redundante); lámparas decorativas (`aria-hidden`, patrón `SemaforoRiesgo` variante `lamparas`: la lámpara encendida es la del color; gris = las tres vacías) + el texto del color en 20 px bold con glifo. Dentro, filas etiqueta/valor (`dl`): «Riesgo máximo» (píldora `SemaforoRiesgo`), «Impedimentos abiertos», «Impedimentos escalados». `<codigo>` es el código de la célula (CEL-A).
- **Orden**: rojo, amarillo, verde, gris (Sin HDU y No disponible juntos); dentro del color, por nombre (backlog F02). Rejilla de tarjetas `minmax(320px, 1fr)`: 3 columnas a 1280, 1 a 375.
- **Filtro**: solo `filtro-celula`. No hay filtro de sprint (3.4: es el estado actual).
- **Sin HDU** (gris): la tarjeta solo aparece si el usuario tiene la célula asignada. Texto «Sin HDU en tu ámbito» en lugar de las tres filas; no hay botón de detalle.
- **Cálculo parcial** (Rojo con `calculoParcial`): texto «▲ Rojo» + línea `aviso-calculo-parcial`: «Cálculo parcial: hay un factor rojo confirmado, pero faltan datos de avance para evaluar el resto.»
- **No disponible**: texto «⛔ No disponible» + «No pudimos calcular el riesgo de esta célula. No se asume que esté en orden.» Si el servidor trae «al menos Amarillo»: «No disponible · al menos Amarillo» y la nota «Ya hay un factor amarillo confirmado.» Las filas de riesgo y de impedimentos se reemplazan por «—»; un número que no se pudo calcular no se muestra. Nunca verde.

### 4.3 Drill-down

- **Abrir**: el botón de la tarjeta («Ver HDU de CEL-A», `boton-ver-detalle-<codigo>`, `aria-expanded`, `aria-controls="lista-drilldown"`) pone `?detalle=<celulaId>` en la URL. Un clic en otra tarjeta reemplaza el panel. El panel (`section` con `h3` «HDU que generan el color de CEL-A», `tabIndex=-1`) se monta **debajo de la rejilla**; al abrirlo, el foco pasa al `h3` y la página hace scroll hasta él. «Cerrar detalle» (`boton-cerrar-detalle`) devuelve el foco al botón de la tarjeta. La tarjeta seleccionada lleva borde de acento y el texto «Detalle abierto». Al recargar con `?detalle=` el panel se abre; un id inexistente o ajeno muestra «No hay HDU con esos filtros» (QE y Líder: 403 se traduce a `AccesoDenegado` solo si la ruta entera lo es; para un `detalle` ajeno se muestra «No tienes acceso a esa célula» con `role="alert"` y se quita el parámetro).
- **Tabla** (`TablaBandeja`, `lista-drilldown` en el contenedor, `fila-drilldown-<hduId>`): columnas HDU (código en `<Link>` + título en 2 líneas), Motivo, Riesgo vigente (`SemaforoRiesgo` píldora; «No disponible» si la fuente cayó), Impedimento (`I2 · ○ Abierto · 6 d` con la insignia de E4, o «—»), Analista, Estado (`InsigniaEstadoHdu`), Acción «Abrir». Orden (backlog): motivo de mayor gravedad, riesgo vigente (Alto, Medio), días abiertos del impedimento. «Abrir» lleva a `/hdu/<id>` con `location.state.desde` (vuelve al semáforo con el detalle abierto); nombre accesible «Abrir HDU H1: Título H1».
- **Motivos** (chips con texto y glifo, una HDU puede tener dos): «▲ Riesgo alto» (`RIESGO_ALTO`), «⇧ Impedimento escalado» (`IMPEDIMENTO_ESCALADO`), «◆ Riesgo medio» (`RIESGO_MEDIO`), «○ Impedimento abierto» (`IMPEDIMENTO_ABIERTO`). Un motivo de riesgo y uno de impedimento se muestran juntos en la misma celda, separados.
- **Verde**: panel con el texto «Sin HDU con riesgo ni impedimentos» (`estado-vacio-drilldown`, tono éxito de `BloqueEstado`).
- **Fuente caída**: panel con aviso `role="note"` «Solo mostramos lo que pudimos consultar. Faltan datos de avance o de impedimentos» y las HDU conocidas; las celdas desconocidas dicen «No disponible».
- **Error del drill-down**: `BloqueEstado` `error` dentro del panel + «Reintentar», sin tocar la rejilla de tarjetas.

### 4.4 Wireframe 375

```
┌──────────────────────────────┐
│ Célula [Todas ▾]              │
│ ▸ ¿Cómo se calcula el color?  │
│ ┌ CEL-A ────────────────────┐ │
│ │ ▲ Rojo                    │ │  ← lámparas se ocultan (decorativas); queda glifo + palabra
│ │ Riesgo máximo     ▲ Alto  │ │
│ │ Imp. abiertos          1  │ │
│ │ Imp. escalados         0  │ │
│ │ [Ver HDU de CEL-A]        │ │  ← 44 px, ancho completo
│ └───────────────────────────┘ │
│ ┌ HDU que generan el color ─┐ │  ← debajo de la lista de tarjetas
│ │ ┌─────────────────────┐   │ │
│ │ │ H1  Título H1       │   │ │  ← cada fila una tarjeta apilada
│ │ │ ▲ Riesgo alto       │   │ │
│ │ │ Impedimento I2 ○ 6 d│   │ │
│ │ │ Analista  Ana 1     │   │ │
│ │ │ [Abrir]             │   │ │
│ │ └─────────────────────┘   │ │
└──────────────────────────────┘
```

El motivo y el estado van primero en la tarjeta apilada (`celda-prioritaria`, E4). Al abrir el detalle en una lista larga de células, el scroll lleva al panel.

### 4.5 «¿Cómo se calcula el color?»

`<details>` (cerrado por defecto) con la regla 3.4 en lenguaje llano, para que el usuario entienda por qué una célula está de un color:

| Color | Cuándo |
| --- | --- |
| ▲ Rojo | Alguna HDU no cerrada tiene riesgo Alto o algún impedimento escalado. |
| ◆ Amarillo | Sin rojo, y alguna HDU no cerrada tiene riesgo Medio o algún impedimento abierto. |
| ● Verde | Hay HDU no cerradas y todas tienen riesgo Bajo y ningún impedimento abierto ni escalado; o la célula solo tiene HDU cerradas. |
| ○ Sin HDU | La célula no tiene HDU en tu ámbito. |

Pie del `details`: «Las HDU cerradas no cuentan. El color depende de las HDU a las que tienes acceso, por eso puede verse distinto para otro rol.»

### 4.6 Estados

| Situación | Presentación |
| --- | --- |
| Cargando | Tres tarjetas de esqueleto. |
| Sin células (ámbito vacío) | `estado-sin-datos`: «Aún no tienes HDU en tu ámbito». |
| Filtro sin coincidencias | `estado-sin-datos`: «No hay HDU con esos filtros» + «Limpiar filtros». |
| Fuente caída | Tarjeta por tarjeta (4.2). Ninguna verde. El resto del portal sigue. |
| Error | `BloqueEstado` `error` (`estado-error-semaforo`) + «Reintentar». |
| Vuelta desde el detalle de una HDU | Se pide de nuevo (`refetchOnMount: always`): el color refleja el cambio sin pasos adicionales (F02#3). |

---

## 5. Carga por analista (E6-F03)

### 5.1 Wireframe 1280 (QE)

```
 [ Cumplimiento ] [ Semáforo ] [ Carga ] [ Tendencia ]                                  [ ⬇ Exportar ▾ ]
 ┌ Umbral de sobrecarga ─────────────────────────────────────────────────────────────────────────────┐
 │ Umbral (HDU activas) *  [ 5 ]  [Guardar umbral]   [Valor por defecto]                              │
 │ De 1 a 50 HDU activas; se considera sobrecarga superar este valor.                                 │
 │ Hay sobrecarga con más de 5 HDU activas.                                      (resumen-umbral)     │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 Célula [Todas ▾]  Sprint [Todos ▾]                                                [Limpiar filtros]
 ⓘ Los filtros cambian las columnas por estado. La marca de sobrecarga siempre cuenta todas tus HDU activas.   (solo con filtro)
 ┌ Carga por analista ────────────────────────────────────────────────────────────────────────────────┐
 │ ANALISTA   PEND. DISEÑO EJEC. PEND.CIERRE CERRADA  ACTIVAS CUMPLIMIENTO  CARGA                     │
 │ Ana 1        0     0     2        0         0        2        55 %        2 de 5                   │
 │ Ana 2        0     0     1        1         0        2        55 %        2 de 5                   │
 │ Sin analista asignado   (informativa)                 1         —           No se evalúa            │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 ┌ Historial del umbral (data-testid="historial-umbral") ─────────────────────────────────────────────┐
 │ Aún no has cambiado el umbral.                                                                      │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Tabla de carga

- Tabla `lista-carga` (`TablaBandeja`), fila `fila-analista-<clave>` con `data-sobrecarga="true|false"`. `<clave>` es el código del usuario si existe (el backlog usa `ANA1` de la semilla); si no existe, el id (ver 15, #8). La fila sin analista es `fila-analista-sin-asignar`.
- Columnas: **Analista** (nombre + etiquetas), **Pendiente**, **Diseño de pruebas**, **En ejecución**, **Pendiente de cierre**, **Cerrada** (nombres de `ETIQUETAS_ESTADO_HDU`), **Activas** (número en negrita; es la medida de carga y no cambia con los filtros), **Cumplimiento** (entero con «%», «—» si el analista no tiene HDU, «No disponible» si Certificaciones cayó) y **Carga** (texto que explica la evaluación).
- **Celda Carga**: normal `2 de 5`; sobrecarga `▲ Sobrecargado` (insignia con los tokens de riesgo alto) + «6 de 5»; sin HDU «Sin HDU asignadas»; fila «Sin analista asignado»: «No se evalúa». El texto «Sobrecargado» es lo que ven los lectores de pantalla; la fila además tiene borde izquierdo de 4 px en `--q360-color-riesgo-alto` (decoración redundante).
- **Etiquetas del analista** (texto pequeño bajo el nombre): «Inactivo» (analista desactivado con HDU activas, se evalúa igual), «No supervisado por ti» (solo QE: analista con HDU suyas pero que no supervisa), «Sin QE supervisor» (Líder/Auditor, D160).
- **Cero no es error.** Un analista sin HDU muestra ceros en las cinco columnas de estado, Activas 0, Cumplimiento «—», y «Sin HDU asignadas» en Carga, **sin** insignia de error ni fondo especial (E6-F03-T05). Un error de consulta no muestra esta fila: muestra `BloqueEstado` `error` para toda la tabla.
- **Orden por defecto:** sobrecargados primero, luego activas descendente, luego nombre; «Sin analista asignado» siempre al final. Ordenable por Analista, Activas y Cumplimiento.
- **Filtros** `filtro-celula` y `filtro-sprint` (los mismos de 3.2). Cuando alguno está activo aparece `nota-filtros-carga` (`mensaje-aviso`, `role="note"`): «Los filtros cambian las columnas por estado. La marca de sobrecarga siempre cuenta todas las HDU activas.» La columna Activas no se filtra y puede no coincidir con la suma de las columnas por estado; el encabezado de la columna lleva `title` y la nota lo explica.

### 5.3 Control del umbral (solo QE dueño)

Panel `.panel` con `h2` «Umbral de sobrecarga». Es un `<form>` (únicamente en la vista del QE) para que Enter guarde.

| Elemento | Detalle |
| --- | --- |
| Campo | `campo-umbral`: `<input type="text" inputmode="numeric" autocomplete="off">` con etiqueta «Umbral (HDU activas)» y asterisco + «obligatorio» en `sr-only`. **No** es `type="number"`: el navegador impediría escribir «abc» o «2.5» y el mensaje de error pedido por el backlog nunca aparecería (E6-F03-T06). |
| Estado | Insignia `Valor por defecto` (`insignia-umbral-defecto`) mientras `porDefecto` sea verdadero; desaparece al guardar un valor. |
| Ayuda | «De 1 a 50 HDU activas; se considera sobrecarga superar este valor» (`campo-ayuda`, ligada con `aria-describedby`). |
| Resumen | `resumen-umbral`: «Hay sobrecarga con más de 5 HDU activas» (se actualiza con el valor guardado, no con lo que se escribe). |
| Botón | «Guardar umbral» (`boton-guardar-umbral`, `submit`). |
| Validación | Al pulsar, no antes. Vacío o no entero («abc», «2.5», «1e1»): «Ingresa un número entero». Menor que 1 o mayor que 50: «El umbral debe estar entre 1 y 50». Mensaje en `campo-error` (`error-umbral`, `role="alert"`), `aria-invalid="true"`, foco al campo; no se envía nada. Un `400` del servidor usa los mismos textos. |
| Éxito | `mensaje-exito` (`role="status"`): «Umbral guardado: 1 HDU activa» / «Umbral guardado: 5 HDU activas». La tabla se recarga (esqueleto en la tabla, no en el panel). Si el valor es igual al vigente (200 sin cambios): «El umbral ya era 5». |
| Error | 403: «Ya no tienes permiso para esta acción» (y el panel desaparece al refrescar el perfil, E4 8.2). 5xx o red: «No fue posible guardar. Intenta nuevamente.» (`mensaje-error-global`), el campo conserva lo escrito. |
| Guardando | Botón «Guardando…» deshabilitado, `aria-busy`. |

### 5.4 Historial del umbral

`historial-umbral` es una lista cronológica inversa (más reciente primero, como el servidor), de 5 en 5 con «Mostrar más» (`boton-ver-mas-historial-umbral`), reutilizando `.historial-lista`/`.historial-item`:

```
 04-11-2026 15:20   Matías Araos · QE   Umbral: 5 → 1 HDU activas
```

- Texto «Umbral: 5 → 1» con «de 5 a 1» en `sr-only`. El primer cambio muestra el valor anterior implícito 5 (D-backlog 5: «el implícito 5 se registra como anterior = 5»).
- Vacío: «Aún no has cambiado el umbral». Cargando: «Cargando…». Error: `BloqueEstado` `error` + «Reintentar».
- **QE**: su propio historial, siempre visible bajo la tabla. **Auditor**: el historial de cada QE dentro de su grupo (5.5). **Líder**: no existe (403 del servidor; el portal no lo muestra).

### 5.5 Líder y Auditor: grupos por QE (solo lectura)

```
 ◉ Vista de solo lectura. Puedes consultar y descargar, no modificar.
 Equipo de Pablo Núñez (QE)                                          ← h2  (data-testid="grupo-qe-<id>")
 Umbral: 1 HDU activa  ·  Definido por el QE                          (sin campo ni botón)
 ┌ ANALISTA  PEND.  DISEÑO  EJEC.  PEND.CIERRE  CERRADA  ACTIVAS  CUMPL.  CARGA ──────────────────────┐
 │ Ana 1        0     0      2      0           0        2       55 %    ▲ Sobrecargado · 2 de 1      │
 │ Ana 2        0     0      1      1           0        2       55 %    ▲ Sobrecargado · 2 de 1      │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 Historial del umbral de Pablo Núñez (solo Auditor)  …
 Equipo de Luis Soto (QE)  Umbral: 5 HDU activas · Valor por defecto
 ...
 Sin QE supervisor                                                    ← grupo final
 Umbral: 5 HDU activas · Valor por defecto
 ANA4   0 0 0 0 0   0   —   Sin HDU asignadas      [Sin QE supervisor]
```

- Una fila **por par (analista, QE)** (D160): el mismo analista aparece una vez en cada grupo, con el umbral de ese QE. La carga (Activas) del analista es la misma en ambos grupos; solo cambia el veredicto. El grupo «Sin QE supervisor» va al final y usa el valor por defecto.
- Grupos ordenados por nombre del QE. Los controles de edición (`campo-umbral`, `boton-guardar-umbral`) **no existen**. Lo único interactivo es el orden de columnas y «Mostrar más» del historial.
- El `AvisoSoloLectura` es el cert. (consultar y descargar), válido porque ambos exportan.

### 5.6 Wireframe 375

```
┌──────────────────────────────┐
│ ┌ Umbral de sobrecarga ─────┐ │
│ │ Umbral (HDU activas) *    │ │
│ │ [ 5            ]          │ │  ← 44 px
│ │ Valor por defecto         │ │
│ │ De 1 a 50 HDU activas; …  │ │
│ │ [Guardar umbral]          │ │  ← ancho completo
│ └───────────────────────────┘ │
│ ┌ Ana 1 ────────────────────┐ │  ← tabla apilada
│ │ ▲ Sobrecargado · 2 de 1   │ │  ← celda prioritaria (Carga) primero
│ │ Activas              2    │ │
│ │ Cumplimiento       55 %   │ │
│ │ Pendiente            0    │ │
│ │ Diseño de pruebas    0    │ │
│ │ En ejecución         2    │ │
│ │ Pendiente de cierre  0    │ │
│ │ Cerrada              0    │ │
│ └───────────────────────────┘ │
```

### 5.7 Estados

| Situación | Presentación |
| --- | --- |
| Cargando | Esqueleto de 4 filas; el panel del umbral muestra su campo deshabilitado con «Cargando…». |
| Ámbito vacío | `estado-sin-datos`: «Aún no tienes HDU en tu ámbito». El panel del umbral **sí** se muestra (el QE puede fijarlo antes de tener HDU) y también aparecen sus analistas supervisados con ceros si los hay. |
| QE sin analistas ni HDU (QE3) | Panel del umbral + `estado-sin-datos` «Aún no tienes HDU en tu ámbito». |
| Filtro sin coincidencias | Las filas siguen (con ceros en estados) pero el cumplimiento y la nota explican; si el servidor responde `sinDatos`: «No hay HDU con esos filtros» + «Limpiar filtros». |
| Certificaciones caída | Cantidades por estado y sobrecarga correctas; columna Cumplimiento «⛔ No disponible» (`estado-indisponible-cumplimiento`) por fila, sin botón por fila; un `aviso-fuente-no-disponible` único sobre la tabla con «Reintentar». |
| Error | `BloqueEstado` `error` + «Reintentar» (`estado-error-carga`). El panel del umbral queda visible si su propia consulta cargó. |

---

## 6. Tendencia (E6-F04)

### 6.1 Wireframe 1280

```
 [ Cumplimiento ] [ Semáforo ] [ Carga ] [ Tendencia ]                                  [ ⬇ Exportar ▾ ]
 Célula [Todas ▾]  Sprint [Todos ▾]  Desde [dd-mm-aaaa]  Hasta [dd-mm-aaaa]   [☐ Ajustar escala a los valores]   [Limpiar filtros]
 ⓘ Cada punto muestra el estado de la madrugada de esa fecha, es decir, el cierre del día anterior.  (nota-madrugada)
 Evolución del cumplimiento promedio                                                       ← h2
 En CEL-A · S-12, el cumplimiento pasó de 30 % (12-10) a 40 % (14-10).                     ← resumen-tendencia (visible)
 ┌ grafica-tendencia  role="img" ───────────────────────────────────────────────────────────────────────┐
 │ 100 %┤                                                                                                │
 │  75 %┤┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
 │  50 %┤                                                                                                │
 │  25 %┤┄┄┄┄┄●━━━━━━━━●┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄■                                                              │
 │   0 %┼──────┬────────┬────────┬────────┬──────────                                                   │
 │          12-10    13-10    14-10    15-10                                                           │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
 Series:  ●━ CEL-A · S-12  (último: 40 % el 14-10)      ■ ╌ CEL-B · S-11  (último: 55 % el 15-10)       ← leyenda
 Datos de la gráfica                                                                       ← h3 + tabla
 FECHA        CEL-A · S-12      CEL-B · S-11
 12-10-2026   30 % · 1 HDU      —  Sin snapshot
 13-10-2026   30 % · 1 HDU      50 % · 2 HDU
 14-10-2026   40 % · 1 HDU      —  Sin snapshot
```

### 6.2 Filtros y alcance

- Filtros: `filtro-celula`, `filtro-sprint`, y dos campos de fecha `filtro-desde` y `filtro-hasta` (`<input type="date">` con etiqueta; formato de entrada del navegador, se muestran en dd-mm-aaaa). URL: `celula`, `sprint`, `desde`, `hasta` (ISO). `hasta` anterior a `desde`: `campo-error` «La fecha final debe ser igual o posterior a la inicial», no se consulta.
- **Selección por defecto** (D166): los sprints vigentes de las células visibles, hasta 6 series; si no hay ninguno, el sprint con snapshot más reciente por célula. Si hay más de 6: `mensaje-aviso` «Mostrando 6 de N series. Filtra por célula o sprint para ver otras.»
- **Casilla «Ajustar escala a los valores»** (`filtro-escala`, URL `escala=ajustada`, apagada): por defecto el eje Y va de 0 a 100 % (honesto, pero una serie de 30 a 40 % se ve plana). Al activarla el eje se acota al mínimo y máximo de los datos con margen, y el rótulo del eje lo dice («Escala ajustada: 25 % a 45 %»). Los valores no cambian.
- El Líder ve la historia completa de sus células vigentes, también la anterior a su asignación (D167); el portal no lo marca de forma especial.

### 6.3 Gráfico SVG propio (`GraficaTendencia`)

Un solo componente puro de presentación: recibe series ya ordenadas por el servidor, no calcula indicadores. Sin dependencias.

| Elemento | Especificación |
| --- | --- |
| Contenedor | `figure` con `figcaption` «Cumplimiento promedio por fecha y serie». El `svg` va dentro de un `div` que mide su ancho (`ResizeObserver`) y recompone el dibujo; la fuente **no escala** con el ancho (12 px mínimo en ejes, 13 px en rótulos). Alto: 320 px a ≥ 900 px, 240 px a 375 px. Nunca excede el ancho del contenedor (`max-width: 100%`). |
| Semántica | `role="img"` con `aria-labelledby` (el `figcaption`) y `aria-describedby` (el `resumen-tendencia` visible). El detalle (puntos) **no** se expone dentro del `svg`: lo da la tabla (6.4). `<title>` por punto solo como ayuda del puntero. |
| Eje Y | 0 a 100 %, marcas cada 25 %, rejilla horizontal en `--q360-color-borde`, etiquetas «0 %»…«100 %». |
| Eje X | Escala **temporal lineal** (no categórica): la separación refleja los días reales. Marcas «dd-mm»: hasta 8 a 1280 px, hasta 4 a 375 px (se adelgazan sin rotar el texto). |
| Series | Hasta 6. Cada una combina **color, trazo y marcador** (tabla de abajo). Línea de 2,5 px y marcadores de 8 px. |
| Huecos | Un día sin snapshot **corta la línea**: solo se unen puntos de días consecutivos; el tramo con hueco no se dibuja ni se interpola. Un punto aislado se dibuja solo con su marcador. |
| Marca de fin de sprint | Una línea vertical punteada fina en la fecha de fin de un sprint cerrado (dentro del rango) con el rótulo «Fin S-12» sobre el borde superior. Texto, no solo línea. |
| Puntero | Al pasar el puntero o enfocar el gráfico con teclado se resalta el punto más cercano y se muestra un globo «CEL-A · S-12 · 14-10-2026 · 40 % · 1 HDU». Es una comodidad: **todo valor está también en la tabla**, así que no depende del puntero (WCAG 1.4.13). Sin animaciones. |
| Colores | Alias de tokens existentes (`--q360-serie-1..6`, sección 12.2). Contraste de cada trazo sobre blanco ≥ 3:1 (1.4.11). Los colores no tienen significado semántico: no hay ninguna serie «roja». |

Combinaciones por serie (el orden fijo evita que una serie cambie de aspecto entre cargas, por lo que se asigna por orden de (célula, sprint)):

| # | Color (alias) | Trazo | Marcador |
| --- | --- | --- | --- |
| 1 | `--q360-color-acento` | continuo | círculo `●` |
| 2 | `--q360-color-lider` | guiones largos | cuadrado `■` |
| 3 | `--q360-color-auditor` | punteado | triángulo `▲` |
| 4 | `--q360-color-imp-abierto` | guion-punto | rombo `◆` |
| 5 | `--q360-color-exito` | guiones cortos | equis `✕` |
| 6 | `--q360-color-texto` | continuo fino | más `✚` |

La **leyenda** (`ul` bajo el gráfico, `leyenda-tendencia`) repite cada combinación en un trazo SVG de 32 px, el nombre «CEL-A · S-12» (rótulo exigido «Célula · Sprint») y el último valor «último: 40 % el 14-10». Es texto: se lee y se copia.

### 6.4 Alternativa accesible (resumen + tabla)

1. **Resumen textual** (`resumen-tendencia`, visible sobre el gráfico, enlazado con `aria-describedby`): una frase por serie: «CEL-A · S-12: 3 días de historial, de 30 % (12-10) a 40 % (14-10), 10 puntos más.» / «…sin cambios.» / «…4 puntos menos.». Si hay huecos: «…con 1 día sin snapshot (13-10).» Con más de 3 series se muestra como lista.
2. **Tabla** (`tabla-tendencia`, siempre en el DOM y visible): `caption` «Cumplimiento promedio por fecha y serie»; una fila por fecha con al menos un snapshot, orden ascendente (el del eje X); una columna por serie; celda `30 % · 1 HDU` o «—» con `sr-only` «Sin snapshot» (hueco explícito). 20 filas por vez + «Mostrar más» (`boton-ver-mas-tendencia`). Encabezados de columna con el trazo/marcador de la serie.
3. A ≤ 640 px la tabla se apila: cada fecha es una tarjeta con pares «serie / valor».

### 6.5 Estados

| Situación | Presentación |
| --- | --- |
| Cargando | Esqueleto del gráfico (rectángulo) y de la leyenda. |
| Sin historial | `aviso-sin-historial` (`BloqueEstado` `vacio`): «Aún no hay historial». Debajo, texto de apoyo: «El sistema guarda una foto de los indicadores una vez al día. La tendencia aparecerá desde la primera.» **Sin** gráfico, ejes, tabla ni valores. |
| Un solo día | Se dibuja el punto (marcador) y `aviso-un-solo-dia` (`mensaje-aviso`, `role="note"`): «Aún hay un solo día de historial». La tabla muestra esa fila. |
| Filtro sin coincidencias | `estado-sin-datos`: «No hay historial para esos filtros» + «Limpiar filtros». |
| Huecos | Línea cortada + celdas «—» en la tabla + mención en el resumen. Leyenda de ayuda bajo el gráfico: «Los huecos son días sin snapshot; no se estiman.» |
| Error / indisponible | `BloqueEstado` `error` o `indisponible` (`estado-error-tendencia`) + «Reintentar». Nunca una gráfica con ceros. |
| Líder con `desde` anterior a su asignación | Se muestra la serie completa (D167). |

### 6.6 Wireframe 375

```
┌──────────────────────────────┐
│ [Filtros (2)]  [⬇ Exportar ▾] │
│ ⓘ Cada punto muestra el estado│
│   de la madrugada de esa fecha│
│ Evolución del cumplimiento    │
│ CEL-A · S-12: 3 días, de 30 % │
│ (12-10) a 40 % (14-10).       │
│ ┌ gráfico 343 × 240 ────────┐ │
│ │ 100 %                      │ │
│ │  50 %    ●━━●              │ │
│ │   0 %─┬──────┬──────┬───   │ │
│ │    12-10  13-10  14-10     │ │
│ └────────────────────────────┘ │
│ ●━ CEL-A · S-12  último 40 %  │  ← leyenda en una columna
│ Datos de la gráfica           │
│ ┌ 12-10-2026 ───────────────┐ │
│ │ CEL-A · S-12   30 % · 1 HDU││
│ └───────────────────────────┘ │
│ [Mostrar más]                 │
└──────────────────────────────┘
```

---

## 7. Exportar CSV/PDF (E6-F04#2, común a las cuatro pestañas)

Componente `BotonExportar` (genérico; `BotonExportarCsv` del Auditor queda intacto, cert.). Mismo mecanismo de descarga autenticada con `Blob` y mismo estilo (`boton boton--secundario`).

```
 [ ⬇ Exportar ▾ ]  →   ┌────────────────────────┐
                        │ Descargar CSV          │   ← boton-exportar-csv
                        │ Descargar PDF          │   ← boton-exportar-pdf
                        └────────────────────────┘
 Se exportará la pestaña Semáforo con los filtros aplicados (Célula: CEL-A).      ← ayuda-exportar
```

- **Disparador** `boton-exportar`: `type="button"`, `aria-haspopup="true"`, `aria-expanded`, `aria-controls`. Abre un panel con dos botones (no el patrón ARIA `menu`: son dos botones simples, tabulables). Esc cierra y devuelve el foco al disparador; un clic fuera cierra. Disponible en las cuatro pestañas; el QE, el Líder y el Auditor lo ven; el Administrador y el Analista **no** (D39: no existe).
- **Contenido**: la pestaña activa con los filtros de la URL. La línea `ayuda-exportar` (`aria-describedby` del disparador) dice qué se exporta: «Se exportará la pestaña Cumplimiento con los filtros aplicados (Célula: CEL-A · Sprint: S-12)». Sin filtros: «sin filtros».
- **Mientras se genera**: el disparador dice «Generando…», `aria-busy="true"` y queda deshabilitado; un `role="status"` (`estado-exportacion`) anuncia «Generando el reporte…». No hay progreso inventado.
- **No se deshabilita** cuando la pestaña muestra «No disponible» o sin datos: el servidor decide (E6-F04-T08 espera el mensaje, y un archivo sin datos es válido, B04-T11). Solo se deshabilita mientras la pestaña está **cargando** o se está generando.
- **Resultados** (todos en `estado-exportacion`, bajo el botón):

| Resultado | Mensaje | Rol ARIA |
| --- | --- | --- |
| Éxito | «Se descargó quality360-indicadores-semaforo-20261104.csv» (nombre del servidor; si falta, el del backlog `quality360-indicadores-<vista>-AAAAMMDD.<ext>`) `estado-exportacion-ok` | `status` |
| Archivo sin datos | Mismo éxito + «El archivo indica que no hay datos para los filtros aplicados» | `status` |
| 503 `INDICADORES_NO_DISPONIBLES` | «No se pudo generar el reporte: hay datos no disponibles» (texto exacto del backlog) | `alert` |
| 422 `EXPORTACION_EXCEDE_LIMITE`, CSV | «El reporte tiene demasiadas filas. Acota los filtros.» y el foco va al primer filtro (patrón de `BotonExportarCsv`) | `alert` |
| 422, PDF | «El reporte tiene demasiadas filas para un PDF. Usa CSV.» | `alert` |
| 503 `SERVICIO_NO_DISPONIBLE` | «No fue posible generar el reporte. Intenta nuevamente.» | `alert` |
| 403 | «Ya no tienes permiso para esta acción» | `alert` |
| Red / 5xx | «No fue posible generar el reporte. Intenta nuevamente.» | `alert` |

El mensaje se borra al cambiar de pestaña o de filtro.

---

## 8. Snapshot del Administrador (E6-B03 / D165)

Ruta `/admin/indicadores/snapshots`. Es una pantalla de **operación**: no muestra cifras, series ni nombres de célula (D165). Sin pestañas.

### 8.1 Wireframe 1280

```
 PORTAL ADMINISTRADOR
 Snapshots de indicadores
 Cada día el sistema guarda una foto de los indicadores para armar la tendencia. Aquí puedes
 ejecutarla a mano y revisar las últimas ejecuciones. Esta pantalla no muestra cifras de indicadores.
 ┌ Estado ──────────────────────────────────────────────────  data-testid="snapshot-estado" ─────────┐
 │ Última ejecución   ✓ Exitosa · 04-11-2026 03:00 · Programada · Duración 4 s · 24 filas escritas    │
 │ La ejecución programada corre todos los días entre las 02:00 y las 03:59 (hora de Chile).         │
 │ [ Generar snapshot ahora ]    Si ya hay una foto de hoy, se actualiza; no se duplica.             │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 Ejecuciones                                                                         [↻ Actualizar]
 ┌ lista-ejecuciones ─────────────────────────────────────────────────────────────────────────────────┐
 │ FECHA        ORIGEN       ACTOR      INICIO            DURACIÓN  RESULTADO      FILAS  MOTIVO        │
 │ 04-11-2026   Programada   Sistema    04-11 03:00:02    4 s       ✓ Exitosa       24    —             │
 │ 03-11-2026   Manual       Admin 1    03-11 11:20:10    3 s       ✕ Fallida        0    Impedimentos  │
 │                                                                                    no respondió      │
 │ Mostrando 1–2 de 2          [◀ Anterior] Página 1 de 1 [Siguiente ▶]                                  │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Elementos

- **Estado** (`snapshot-estado`): la última ejecución con insignia de resultado (texto + glifo), fecha y hora de Chile, origen, duración y filas escritas. Sin ejecuciones: «Aún no se ha ejecutado ningún snapshot». El texto del horario programado (D163) es fijo; no promete una hora exacta.
- **Botón** `boton-generar-snapshot`: «Generar snapshot ahora», `type="button"`, sin diálogo de confirmación (la operación es idempotente: refresca la foto de hoy y no duplica; reversible, como el resto de acciones sin diálogo de E5). La ayuda al lado lo dice y está ligada con `aria-describedby`.
- **Mientras corre**: el botón dice «Generando…» y se deshabilita; panel `role="status"` `espera-snapshot`: «Generando el snapshot. Puede tardar unos segundos. No cierres esta página.» (espera indeterminada, sin porcentaje; patrón de `PanelEsperaEjecucion` de E5; no se puede cancelar).
- **Resultados**:

| Resultado | Presentación |
| --- | --- |
| Éxito | `mensaje-exito`: «Snapshot generado: 24 filas escritas.» Se recarga la lista. El foco queda en el botón. |
| Fallida | `mensaje-error-global` (`role="alert"`) con el motivo de la tabla de 8.3 y «No se guardó ninguna fila.» |
| 409 `EJECUCION_EN_CURSO` | `aviso-en-curso` (`mensaje-aviso`, `role="status"`): «Ya hay un snapshot en ejecución. Espera a que termine y vuelve a intentar.» |
| 403 | `AccesoDenegado` (otros roles) o, si el permiso se retira con la pantalla abierta, «Ya no tienes permiso para esta acción». |
| Red / 5xx | «No fue posible generar el snapshot. Intenta nuevamente.» |

- **Lista** `lista-ejecuciones` (`TablaBandeja` + `Paginacion`, `fila-ejecucion-<id>`), la más reciente primero. Columnas: Fecha, Origen («Programada» / «Manual»), Actor («Sistema» para el cron), Inicio (hora de Chile), Duración, Resultado, Filas escritas, Motivo. Una ejecución `EN_CURSO` muestra «◔ En curso» y duración «—». No hay detalle por ejecución (no guarda cifras).
- **Actualizar** (`boton-actualizar-ejecuciones`) recarga la lista y el estado; no hay sondeo automático.

### 8.3 Resultados y motivos (constantes del portal, por código)

| Resultado | Insignia | Tokens (alias E5) |
| --- | --- | --- |
| `EXITOSA` | `✓ Exitosa` | `--q360-color-res-exitosa*` |
| `FALLIDA` | `✕ Fallida` | `--q360-color-res-fallida*` |
| `EN_CURSO` | `◔ En curso` | `--q360-color-res-incompleta*` |

| Motivo (`motivo`) | Texto |
| --- | --- |
| `ORGANIZACION_NO_DISPONIBLE` | No respondió el servicio de HDU y equipos |
| `CERTIFICACIONES_NO_DISPONIBLE` | No respondió el servicio de avance de entregables |
| `IMPEDIMENTOS_NO_DISPONIBLE` | No respondió el servicio de impedimentos |
| `EXCEDE_TOPE` | Hay más HDU que el máximo por ejecución (1000) |
| `ERROR_INTERNO` | Error interno |
| (código desconocido) | «Error no identificado» |

Los textos son tabla local (E5 §1.4): el mensaje del servidor no se muestra.

### 8.4 Wireframe 375

Estado y botón en una columna; el botón ocupa el ancho completo (44 px). La tabla se apila: cada ejecución una tarjeta con el Resultado y la Fecha primero (`celda-prioritaria`) y los demás datos en pares.

---

## 9. Cierre con excepción en el detalle de HDU (E6-F05)

### 9.1 Quién ve qué

| Elemento | QE responsable | QE supervisor (no responsable) | Analista, Líder, Auditor, Administrador |
| --- | --- | --- | --- |
| Botón `boton-cerrar-excepcion` | Sí, con la HDU en `PENDIENTE_CIERRE` y menos de 10 aprobados | No existe | No existe |
| Bloque `cierre-excepcion` y `sin-certificado` | Sí | Sí | Sí (todos los que ven el detalle) |
| Evento en el historial | Sí | Sí | Sí |

Con 10 aprobados el panel «Cambiar estado» queda como hoy («Pasar a Cerrada», sin justificación, cert.).

### 9.2 Orden en `/hdu/:id` (lo certificado no se mueve)

Orden vigente tras E5: encabezado → resumen → **checklist** (`#certificado`) → Descripción y origen (E5) → Impedimentos → Riesgo → **Cambiar estado** (`#estado`) → Historial. E6 agrega, sin mover nada:

1. **Insignia** `insignia-cierre-excepcion` «◐ Cerrada con excepción» junto a `InsigniaEstadoHdu` en el encabezado (cuando `cierre` no es nulo). Sirve para verlo sin bajar.
2. **Bloque `cierre-excepcion`** inmediatamente **después del checklist** y antes de «Descripción y origen» (backlog sección 7: «después del checklist»).
3. **Botón `boton-cerrar-excepcion`** dentro del panel «Cambiar estado», en la misma fila que «Pasar a Cerrada».
4. **Evento «Cierre con excepción»** en el historial existente.

### 9.3 Botón en «Cambiar estado»

```
 ┌ Cambiar estado ──────────────────────────────────────────────────────────────────────┐
 │ ⓘ Esta HDU tiene 2 impedimentos abiertos. No podrá cerrarse hasta resolverlos. [Ver]  │  ← pista cert. (E4)
 │ [Pasar a Cerrada]  [Pasar a En ejecución]  [Cerrar con excepción]                      │
 │ Para cerrar sin completar los 10 entregables usa «Cerrar con excepción». No se         │
 │ emite certificado.                                       (ayuda-cierre-excepcion)       │
 │ ┌ error-checklist-incompleto (cert., role=alert) ─────────────────────────────────┐   │
 │ │ <mensaje certificado, sin cambios>                                                │   │
 │ └───────────────────────────────────────────────────────────────────────────────────┘   │
 │ ⓘ Como QE responsable puedes cerrarla con excepción justificando la decisión.          │  ← aviso-puede-cerrar-excepcion
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

- El botón **existe desde que se abre el detalle** (E6-F05-T01 abre y pulsa sin rechazo previo) y no solo después del 409. El texto del botón de cierre normal sigue siendo el cert. «Pasar a Cerrada» (el backlog lo llama «Cerrar HDU»; ver 15, #1).
- Estilo `boton boton--secundario` (el primario sigue siendo el cierre normal). `aria-describedby` apunta a `ayuda-cierre-excepcion`.
- Si el usuario pulsa «Pasar a Cerrada» con el checklist incompleto, se muestra **el mismo** `error-checklist-incompleto` (mensaje y código cert.) y debajo `aviso-puede-cerrar-excepcion` (`role="note"`, solo si `puedeCerrarConExcepcion` es verdadero). No hay un segundo botón: el aviso remite al que ya está en la fila.
- **Visibilidad del botón**: según `permisos` del detalle (ver 15, #2) y checklist con menos de 10 aprobados. Con el checklist cargando, el botón se muestra deshabilitado; con Certificaciones caída se muestra habilitado y, al pulsarlo, **no se abre el cuadro**: aparece `error-checklist-no-disponible` (texto cert. «No pudimos verificar el checklist de la HDU»; E6-F05-T09) y la HDU no cambia. No se adivina el número de pendientes.
- Después del cierre el panel «Cambiar estado» no tiene transiciones (texto cert. «No hay transiciones disponibles desde el estado actual.») y el botón desaparece.

### 9.4 Diálogo `dialogo-cierre-excepcion`

`DialogoConfirmacion` (`peligro`, `cerrarAlClicFuera={false}` porque hay texto escrito). Es la confirmación: un solo paso, con las consecuencias dichas en el cuerpo.

```
┌ Cerrar con excepción ─────────────────────────────────────────────┐
│ Quedan 9 entregables sin aprobar:                                  │
│  · E02 Matriz de trazabilidad     · E06 Reporte de ejecución       │
│  · E03 …                          · …                              │
│ No se emitirá certificado y la HDU no podrá reabrirse.             │
│ Justificación *                                                    │
│ [                                                              ]   │
│                                                         0/500      │
│ Explica por qué cierras la HDU sin completar el checklist. Quedará │
│ registrada con tu nombre y la fecha.                               │
│ [mensaje de error de campo o del servidor]                         │
│                            [Cancelar]  [Cerrar con excepción]      │
└────────────────────────────────────────────────────────────────────┘
```

- **Texto del cuerpo** (backlog F05): «Quedan N entregables sin aprobar: <lista>. No se emitirá certificado y la HDU no podrá reabrirse». Singular: «Queda 1 entregable sin aprobar:». La lista (`lista-pendientes-cierre`) es una `ul` con código y nombre de cada entregable no aprobado, en dos columnas a ≥ 900 px y una en móvil. Son los datos de la consulta de checklist que el detalle ya hizo.
- **Campo** `campo-justificacion-cierre`: `textarea`, `maxlength=500`, etiqueta «Justificación» con asterisco y «obligatorio» en `sr-only`; contador `n/500` visible (`CampoTextoContador`, no `aria-live` por pulsación; al llegar al límite, mensaje `sr-only` `role="status"`). La ayuda (`campo-ayuda`) va ligada con `aria-describedby`. El mínimo de 20 se explica en el error y en la ayuda: «Entre 20 y 500 caracteres.»
- **Botones**: «Cancelar» y «Cerrar con excepción» (`boton-confirmar-cierre-excepcion`, estilo peligro). El segundo **no se deshabilita por vacío**: valida al pulsar (patrón E4 §2.4). Solo se deshabilita mientras guarda («Guardando…»).
- **Foco**: al abrir, al campo de justificación; al cerrar sin confirmar, vuelve a `boton-cerrar-excepcion`; tras confirmar con éxito, al `h2` del bloque `cierre-excepcion` (`tabIndex=-1`), porque el botón ya no existe.
- **Borrador**: si se cancela o cierra tras un error, el texto escrito se conserva mientras la página siga abierta y reaparece al reabrir el cuadro. Se descarta al cerrar con éxito o al navegar.
- **Validación** (al pulsar «Cerrar con excepción», el cuadro permanece abierto con lo escrito y nada se envía):

| Entrada (después de quitar espacios al inicio y final) | Mensaje (`error-justificacion-cierre`, `campo-error`, `role="alert"`) |
| --- | --- |
| Vacía | La justificación es obligatoria |
| 1 a 19 caracteres | La justificación debe tener entre 20 y 500 caracteres |
| Más de 500 | No se puede escribir: `maxlength` lo impide; si llegara por pegado (se recorta), el contador queda en 500/500 y avisa en `sr-only` |

El servidor repite la validación (422 `JUSTIFICACION_REQUERIDA` → «La justificación es obligatoria»; 400 `VALIDACION` con `campo: justificacion` → «La justificación debe tener entre 20 y 500 caracteres»).

- **Errores del servidor** (se mapean en el diálogo, nunca se muestra el texto crudo del API):

| Respuesta | Comportamiento |
| --- | --- |
| 409 `HDU_BLOQUEADA` | El cuadro **sigue abierto con lo escrito** y muestra dentro `ErrorCierreBloqueado` (cert. E4 §5): «No se puede cerrar: la HDU tiene impedimentos abiertos» (E6-F05-T07) + lista con enlaces `#impedimento-<id>`. Al pulsar un enlace, el cuadro se cierra (el borrador se conserva) y la página va a la tarjeta. Al resolver y volver a pulsar el botón se reabre con el texto. |
| 503 `SERVICIO_NO_DISPONIBLE` | Dentro del cuadro, `mensaje-error-global`: «No pudimos verificar el checklist de la HDU. Intenta de nuevo en unos minutos.» Sigue abierto. |
| 409 `TRANSICION_INVALIDA` o `HDU_CERRADA` | Cierra el cuadro, `mensaje-aviso`: «La HDU ya cambió de estado. Se actualizó la información.» y recarga el detalle. |
| 403 `ACCESO_DENEGADO` | Cierra, «Ya no tienes permiso para esta acción», recarga y refresca `GET /v1/me`. El botón desaparece. |
| 409 `CHECKLIST_INCOMPLETO` | No debería ocurrir con justificación; si ocurre, mensaje genérico del cuadro «No fue posible cerrar la HDU. Actualiza la página e intenta de nuevo.» |
| 5xx / red | «No fue posible guardar. Intenta nuevamente.» (`error-accion-cierre`, `role="alert"`) dentro del cuadro; el botón vuelve a habilitarse. |

- **Éxito**: el cuadro se cierra, `mensaje-exito` (`role="status"`): «HDU cerrada con excepción. Quedó registrada tu justificación.» El detalle se recarga: estado Cerrada, aparecen insignia y bloque, el panel «Cambiar estado» queda sin transiciones. Si, mientras tanto, el checklist llegó a 10 aprobados, la respuesta no trae `cierre` y el mensaje es el del cierre normal: «HDU cerrada. El checklist se completó mientras tanto, por eso no quedó como excepción.»

### 9.5 Bloque `cierre-excepcion` (constancia)

```
┌ ◐ Cerrada con excepción: 1 de 10 entregables aprobados ──────────── [✕ Sin certificado] ┐  ← borde izq. 4 px alerta
│ Esta HDU se cerró sin completar el checklist. No tiene certificado y no puede reabrirse.   │
│ Justificación                                                                              │
│ «El alcance se redujo y los entregables 2 a 10 ya no aplican al proyecto.»                 │  ← pre-wrap, texto completo
│ Cerrada por   Pablo Núñez · QE        Fecha   04-11-2026 15:20                             │
│ Entregables pendientes al cerrar (9)                                                       │
│  · E02 Matriz de trazabilidad  · E03 …  (lista)                       [Ver en el checklist]│
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- `h2` con el texto exacto «Cerrada con excepción: N de 10 entregables aprobados» (N viene de `cierre.aprobados`); `data-testid="cierre-excepcion"` en la sección, `sin-certificado` en la insignia «✕ Sin certificado». Tokens: `--q360-color-alerta`/`-suave` para el borde y el encabezado (#8a5a00 / #fff3d6) e insignia neutral de `--q360-color-solo-lectura*`. Glifo `◐` y `✕` + palabra: no depende del color.
- Autor: nombre y rol (`actor_nombre`, `actor_rol`), fecha con `<time>` en hora de Chile. La justificación es texto plano (nunca HTML), `white-space: pre-wrap`, completa (máx. 500).
- Los pendientes son la lista registrada en `cierre.pendientes`; «Ver en el checklist» es un enlace a `#certificado`. El **checklist se conserva visible** con los entregables pendientes y **sin** botón de generar certificado ni de reabrir (D174, F05-T04). Si existiera un certificado emitido antes del cierre (D174), la insignia «Sin certificado» **no** se muestra; en su lugar «Certificado emitido antes del cierre: sigue vigente» con el control de descarga cert.
- Se muestra a todos los roles con acceso al detalle. No contiene controles.
- Estado de carga: el bloque nace con los datos de `GET /v1/hdu/{id}` (`cierre`); no tiene estado propio. `cierre` nulo: no se renderiza.

### 9.6 Historial

El historial existente (`historial-item-N`, cert.) suma una entrada de tipo «Cierre con excepción»:

```
 04-11-2026 15:20   Cierre con excepción   Pablo Núñez · QE   Pendiente de cierre → Cerrada
                    1 de 10 entregables aprobados
                    «El alcance se redujo y los entregables 2 a 10 ya no aplican al proyecto.»
```

Etiqueta legible «Cierre con excepción» (acción `CERRAR_HDU_PARCIAL`), actor y rol, fecha en hora de Chile, y la justificación completa en una línea de cita (`historial-justificacion`). Visible para QE, Líder y Auditor. No hay otras acciones asociadas a la entrada.

### 9.7 Wireframe 375

El botón de excepción va en su propia línea, ancho completo, 44 px, bajo «Pasar a …». El diálogo ocupa el ancho completo (`.dialogo` a ≤ 750 px, cert.), con `max-height: 90dvh` y scroll **interno** del cuerpo (la lista de pendientes puede tener 9 líneas más el campo); los botones «Cancelar» y «Cerrar con excepción» quedan fijos abajo y se apilan. El bloque `cierre-excepcion` pasa a una columna: título, insignia «Sin certificado» debajo del título, metadatos en pares. Sin desborde horizontal: la justificación hace `overflow-wrap: anywhere`.

---

## 10. Estados y errores

### 10.1 Cero, sin datos, no disponible

| Caso | Se ve | Ejemplo |
| --- | --- | --- |
| Dato válido en cero | El número `0` | «Certificadas: 0» (hay HDU en el filtro) |
| No aplica | «—» | Cumplimiento de un analista sin HDU |
| Sin datos | Mensaje; sin cifras ni «0 %» | «No hay HDU con esos filtros» |
| Fuente caída | «⛔ No disponible» | Certificadas con Certificaciones detenido |
| Error de consulta | `BloqueEstado` `error` + «Reintentar» | Indicadores 5xx |

### 10.2 Matriz por pantalla

| Pantalla / bloque | Cargando | Vacío | Error | No disponible |
| --- | --- | --- | --- | --- |
| Cumplimiento | 7 tarjetas esqueleto | «Aún no tienes HDU en tu ámbito» / «No hay HDU con esos filtros» | `estado-error-cumplimiento` | Por tarjeta + aviso único |
| Semáforo | 3 tarjetas esqueleto | Ídem + «Sin HDU» (célula gris) | `estado-error-semaforo` | Tarjeta «No disponible» (nunca verde) |
| Drill-down | «Cargando…» | «Sin HDU con riesgo ni impedimentos» | Error + Reintentar en el panel | Aviso «solo lo que pudimos consultar» |
| Carga | Esqueleto 4 filas | «Aún no tienes HDU en tu ámbito»; fila «Sin HDU asignadas» | `estado-error-carga` | Columna Cumplimiento «No disponible» |
| Umbral | Campo deshabilitado | — | Error + Reintentar en el panel | — |
| Historial del umbral | «Cargando…» | «Aún no has cambiado el umbral» | Reintentar | — |
| Tendencia | Esqueleto del gráfico | «Aún no hay historial» / «No hay historial para esos filtros» | `estado-error-tendencia` | Error / indisponible + Reintentar |
| Exportar | «Generando…» | Archivo con «Sin datos para los filtros aplicados» | Mensajes de la sección 7 | «No se pudo generar el reporte: hay datos no disponibles» |
| Snapshots | Esqueleto 3 filas | «Aún no se ha ejecutado ningún snapshot» | Error + Reintentar | — |
| Cierre con excepción | «Guardando…» | — | Tabla de 9.4 | «No pudimos verificar el checklist…» |

Claves de `BloqueDatos` nuevas: `indicadores-cumplimiento`, `indicadores-semaforo`, `drilldown`, `indicadores-carga`, `umbral`, `historial-umbral`, `indicadores-tendencia`, `snapshot-ejecuciones`.

### 10.3 Reglas de red (heredadas de E4/E5)

- 503 `SERVICIO_NO_DISPONIBLE` y fallo de red al **leer** → no disponible; otro 5xx al leer → error.
- Al **escribir** (umbral, snapshot, cierre): 403 → «Ya no tienes permiso para esta acción» y `GET /v1/me`; 401 → flujo de sesión expirada; 5xx o red → «No fue posible guardar. Intenta nuevamente.» sin perder lo escrito.
- 403 al **leer** una ruta de indicadores: `AccesoDenegado` (cert.) con «Ir a mi bandeja»; ninguna cifra se pinta.
- Cambio de rol con la pantalla abierta (E7 4.3): se redirige a la bandeja con el aviso cert.; el estado local (umbral escrito, justificación) se descarta.

---

## 11. Accesibilidad (WCAG 2.2 AA)

- **Contraste.** Texto ≥ 4,5:1 en todos los pares (4.1, tarjetas, insignias): se reutilizan pares de E4 ya calculados (≥ 5,5:1). Los trazos y marcadores del gráfico ≥ 3:1 sobre blanco (1.4.11); las lámparas llevan borde de 2 px de `--q360-color-texto-terciario`.
- **No solo color (1.4.1).** Semáforo de célula: posición de lámpara + glifo (`▲ ◆ ● ○ ⛔`) + palabra. Sobrecarga: «▲ Sobrecargado» + borde. Series: trazo + marcador + nombre en la leyenda. Resultado de snapshot: glifo + palabra. Cierre con excepción: `◐` + texto, «✕ Sin certificado».
- **Gráfico.** `role="img"` con nombre y descripción; resumen textual visible; tabla completa siempre disponible; el puntero no es necesario (1.4.13, 2.1.1). Reflujo (1.4.10) a 320 px sin scroll en dos dimensiones; la tabla se apila. Texto del gráfico en px reales, legible con zoom 200 % (1.4.4).
- **Lectores de pantalla.** Cifras: `TarjetaMetrica` ya expone título + valor; cada tarjeta es un `article` con su título. Semáforo: el texto visible del color basta (sin `aria-label` duplicado). Tarjeta de célula: `h3` + `dl`. Anuncios en `role="status"` (recálculo, éxito, aviso de fuente) y `role="alert"` (errores de campo y de servidor). Contadores de caracteres no son `aria-live` por pulsación.
- **Nombres accesibles con contexto.** «Ver HDU de CEL-A», «Abrir HDU H1: Título H1», «Guardar umbral», «Exportar (menú)». Botones iguales en listas llevan el sujeto en su nombre. Tabs: `aria-current="page"`.
- **Foco.** `h1` recibe el foco al entrar a cada pantalla (`EncabezadoBandeja`). Al abrir el drill-down: al `h3` del panel; al cerrarlo: al botón de la tarjeta. Al abrir el diálogo de cierre: al campo de justificación; al cerrar: al disparador (o al `h2` del bloque tras el éxito). Errores de validación: foco al primer campo inválido. Foco siempre visible (`--q360-foco-sombra`, cert.), nunca oculto bajo la barra superior (2.4.11).
- **Teclado.** Todo operable; Esc cierra el diálogo y el panel de exportación; tab order natural; `<tr>` navegables como en E7 (el código de HDU es el tope; «Abrir» es el segundo, intencional). El gráfico es un solo tope de tab (`tabIndex=0`) cuyo único comportamiento es mostrar el globo del punto cercano con flechas izquierda y derecha; no es indispensable (la tabla da todo).
- **Objetivos táctiles.** 44 px (`--q360-objetivo-tactil`) en botones, pestañas, casillas y filas apiladas a ≤ 750 px (2.5.8 ya cumplido con 24 px; se mantiene 44).
- **Autenticación y entrada redundante (3.3.7, 3.3.8).** No hay pasos de autenticación. La justificación del cierre se conserva si el cuadro se cierra por un error (no se pide reescribir).
- **Movimiento.** Ninguna animación nueva; el esqueleto ya respeta `prefers-reduced-motion`. Sin transición al cambiar la lámpara o el trazo.
- **Idioma y fechas.** `lang="es"` global; fechas con `<time datetime>`; cifras con `Intl` en `es-CL` (separador decimal coma si hubiera, porcentajes enteros).

---

## 12. Inventario

### 12.1 Componentes

**Reutilizados sin cambios:** `PestanasNav`, `TablaBandeja`, `BarraFiltros`/`useFiltrosUrl`, `BloqueDatos`, `BloqueEstado`, `AvisoSoloLectura`, `EncabezadoBandeja`, `GrupoContadores`, `MensajeExito`, `Paginacion`, `AccesoDenegado`, `DialogoConfirmacion`, `CampoTextoContador`, `ErrorCierreBloqueado`, `SemaforoRiesgo` (píldora), `InsigniaEstadoHdu`, `Insignias` de impedimento (E4), `.historial-*`, `.chips`, `.mensaje-aviso`, `.mensaje-error-global`, `.campo-error`, `.campo-ayuda`, `.panel`, `.tarjetas-resumen`.

**Reutilizados con cambios compatibles:**

| Componente | Cambio |
| --- | --- |
| `Layout` | Ítem «Indicadores» (QE, Líder, Auditor) y «Snapshots de indicadores» (Administrador); `end` en «Bandeja» del Líder; `isActive` propio en «Bandeja» del Auditor (2.2) |
| `TarjetaMetrica` | Propiedad opcional `testIdValor` (por defecto `contador-<clave>`) para `indicador-<clave>`; sin botón por tarjeta cuando no recibe `onReintentar` (ya es así) |
| `HduDetailPage` | Montar `InsigniaCierreExcepcion` y `BloqueCierreExcepcion` después del checklist; botón y diálogo de cierre con excepción en `#estado`; mapeo de `HDU_BLOQUEADA`/`SERVICIO_NO_DISPONIBLE` dentro del diálogo; entrada de historial «Cierre con excepción» |
| `ChecklistEntregables` | Con `cierre` presente: sin control de generar certificado ni reabrir, pendientes visibles |
| `ErrorCierreBloqueado` | Renderizable dentro de un diálogo (hoy dentro de `#estado`); mismo contenido |
| `columnas`/`opciones` de filtros | Opciones de célula y sprint de indicadores (con «Sin sprint» y «(cerrado)») |

**Nuevos:**

| Componente | Función |
| --- | --- |
| `PaginaIndicadores` (por rol: `QeIndicadoresPage`, `LiderIndicadoresPage`, `AuditorIndicadoresPage`) | Encabezado común (2.4), `PestanasNav`, filtros y exportación; `Outlet` para las cuatro pestañas. Una sola implementación con `rol` y `soloLectura` |
| `PestanaCumplimiento` | Dos grupos de `TarjetaMetrica`, `nota-cuadre`, estados |
| `PestanaSemaforo`, `TarjetaCelula`, `SemaforoCelda`, `PanelDrilldown`, `ChipMotivo`, `AyudaCalculoSemaforo` | Rejilla, tarjeta, lámparas/píldora de célula (extiende `SemaforoRiesgo` con los textos Rojo/Amarillo/Verde/Sin HDU/No disponible), drill-down, motivos y `details` |
| `PestanaCarga`, `TablaCarga`, `InsigniaSobrecarga`, `GrupoQe` | Tabla, insignia «Sobrecargado», grupos por QE de Líder y Auditor |
| `PanelUmbral`, `HistorialUmbral` | Formulario del QE; lista con «Mostrar más» |
| `PestanaTendencia`, `GraficaTendencia`, `LeyendaSeries`, `ResumenTendencia`, `TablaTendencia` | Gráfico SVG, leyenda, resumen textual y tabla accesible |
| `BotonExportar` | Panel CSV/PDF, estados y mensajes de la sección 7 |
| `AvisoFuenteNoDisponible` | Aviso único con «Reintentar» para varias tarjetas |
| `PaginaSnapshots`, `PanelEstadoSnapshot`, `TablaEjecucionesSnapshot` | Pantalla del Administrador |
| `BotonCerrarExcepcion`, `DialogoCierreExcepcion`, `BloqueCierreExcepcion`, `InsigniaCierreExcepcion` | Cierre con excepción (sección 9) |

### 12.2 Tokens (solo alias; ningún hexadecimal nuevo)

En `tokens.css`:

```
/* E6 · semáforo de célula: alias del semáforo de riesgo de E4 */
--q360-color-semaforo-rojo: var(--q360-color-riesgo-alto);       --q360-color-semaforo-rojo-suave: var(--q360-color-riesgo-alto-suave);
--q360-color-semaforo-amarillo: var(--q360-color-riesgo-medio);  --q360-color-semaforo-amarillo-suave: var(--q360-color-riesgo-medio-suave);
--q360-color-semaforo-verde: var(--q360-color-riesgo-bajo);      --q360-color-semaforo-verde-suave: var(--q360-color-riesgo-bajo-suave);
--q360-color-semaforo-gris: var(--q360-color-indisponible);      --q360-color-semaforo-gris-suave: var(--q360-color-indisponible-suave);
/* E6 · sobrecarga y cierre con excepción */
--q360-color-sobrecarga: var(--q360-color-riesgo-alto);          --q360-color-sobrecarga-suave: var(--q360-color-riesgo-alto-suave);
--q360-color-cierre-excepcion: var(--q360-color-alerta);         --q360-color-cierre-excepcion-suave: var(--q360-color-alerta-suave);
/* E6 · series del gráfico (sin significado semántico; el trazo y el marcador distinguen) */
--q360-serie-1: var(--q360-color-acento);      --q360-serie-2: var(--q360-color-lider);
--q360-serie-3: var(--q360-color-auditor);     --q360-serie-4: var(--q360-color-imp-abierto);
--q360-serie-5: var(--q360-color-exito);       --q360-serie-6: var(--q360-color-texto);
--q360-grafica-eje: var(--q360-color-texto-terciario);   --q360-grafica-rejilla: var(--q360-color-borde);
```

### 12.3 Clases CSS nuevas

Nuevo archivo `apps/web/src/styles/indicadores.css` (patrón de `impedimentos.css` y `integraciones.css`), importado en `main.tsx`:

`.tarjeta-resumen--ancha` (2 columnas a ≥ 900 px), `.nota-cuadre`, `.rejilla-celulas` (`minmax(320px, 1fr)`), `.tarjeta-celula`, `.tarjeta-celula--rojo|amarillo|verde|gris` (borde superior 4 px), `.tarjeta-celula--seleccionada`, `.semaforo-celda` (variante de `.semaforo`), `.panel-drilldown`, `.chip-motivo`, `.fila-sobrecarga` (borde izquierdo 4 px), `.badge-sobrecarga`, `.panel-umbral`, `.grupo-qe`, `.figura-tendencia`, `.grafica-tendencia` (`max-width: 100%`), `.leyenda-series`, `.resumen-tendencia`, `.tabla-tendencia`, `.panel-exportar`, `.panel-snapshot`, `.bloque-cierre-excepcion`, `.insignia-cierre-excepcion`, `.insignia-sin-certificado`, `.lista-pendientes-cierre` (2 columnas a ≥ 900 px, 1 en móvil).

Reglas ≤ 750 px: `.rejilla-celulas { grid-template-columns: 1fr }`; `.tarjeta-celula` sin lámparas (decorativas); `.panel-umbral .boton { width: 100% }`; `.dialogo { max-height: 90dvh; overflow: auto }` para el diálogo de cierre; gráfico de 240 px de alto. Reglas ≤ 640 px: `.tabla--apilable` con `celda-prioritaria` primero (cert.) para `lista-carga`, `lista-drilldown`, `tabla-tendencia` y `lista-ejecuciones`. Regla general: ningún contenedor de E6 con `min-width` que supere el viewport; `.tarjeta-resumen` con `min-width: 0` y `overflow-wrap: anywhere`.

---

## 13. `data-testid` propuestos

Se conservan todos los certificados. Convenciones de E7 (`contador-<clave>`, `estado-vacio|error|indisponible-<clave>`). Marcados con * los del backlog (sección 9).

| Zona | Identificadores |
| --- | --- |
| Navegación | `tab-cumplimiento`*, `tab-semaforo`*, `tab-carga`*, `tab-tendencia`*, `pagina-indicadores`, `texto-ambito`, `actualizado-en`, `anuncio-recalculo` |
| Filtros | `filtro-celula`*, `filtro-sprint`*, `filtro-desde`, `filtro-hasta`, `filtro-escala` |
| Cumplimiento | `indicador-totales`*, `indicador-certificadas`*, `indicador-cerradas-excepcion`*, `indicador-en-curso`*, `indicador-sin-iniciar`*, `indicador-bloqueadas`*, `indicador-cumplimiento`*, `estado-sin-datos`*, `estado-indisponible-<clave>`*, `estado-error-<clave>`*, `nota-cuadre`, `aviso-fuente-no-disponible` |
| Semáforo | `tarjeta-celula-<codigo>`* (con `data-color` = `ROJO\|AMARILLO\|VERDE\|SIN_HDU\|NO_DISPONIBLE`), `boton-ver-detalle-<codigo>`, `boton-cerrar-detalle`, `lista-drilldown`*, `fila-drilldown-<hduId>`, `chip-motivo-<MOTIVO>`, `estado-vacio-drilldown`, `aviso-calculo-parcial`, `ayuda-calculo-semaforo` |
| Carga | `lista-carga`, `fila-analista-<clave>`* (con `data-sobrecarga`), `fila-analista-sin-asignar`, `insignia-sobrecarga`, `etiqueta-inactivo`, `etiqueta-no-supervisado`, `etiqueta-sin-qe`, `nota-filtros-carga`, `grupo-qe-<id>`, `campo-umbral`*, `boton-guardar-umbral`*, `insignia-umbral-defecto`, `resumen-umbral`, `error-umbral`, `mensaje-exito-umbral`, `historial-umbral`*, `boton-ver-mas-historial-umbral` |
| Tendencia | `grafica-tendencia`*, `leyenda-tendencia`, `resumen-tendencia`, `tabla-tendencia`, `boton-ver-mas-tendencia`, `nota-madrugada`, `aviso-sin-historial`*, `aviso-un-solo-dia` |
| Exportar | `boton-exportar`*, `boton-exportar-csv`, `boton-exportar-pdf`, `ayuda-exportar`, `estado-exportacion`, `estado-exportacion-ok` |
| Snapshots | `snapshot-estado`*, `boton-generar-snapshot`*, `espera-snapshot`, `aviso-en-curso`, `lista-ejecuciones`, `fila-ejecucion-<id>`, `boton-actualizar-ejecuciones` |
| Cierre con excepción | `boton-cerrar-excepcion`, `ayuda-cierre-excepcion`, `aviso-puede-cerrar-excepcion`, `dialogo-cierre-excepcion`, `lista-pendientes-cierre`, `campo-justificacion-cierre`, `contador-justificacion-cierre`, `error-justificacion-cierre`, `boton-confirmar-cierre-excepcion`, `error-accion-cierre`, `cierre-excepcion`, `sin-certificado`, `insignia-cierre-excepcion`, `historial-justificacion` |

Notas para `q360-qa`: `historial-umbral` se repite por grupo para Líder y Auditor (acotar con `within(grupo-qe-<id>)`); `tarjeta-celula-<codigo>` usa el código de la célula (CEL-A); `fila-analista-<clave>` usa el código del usuario de la semilla (ANA1…); `estado-sin-datos` es único por pantalla.

---

## 14. Pruebas certificadas de UI que cambian

Regla de la sección 7 del backlog: ningún escenario cambia de resultado esperado; se **agrega** contenido. Cambian los datos de las pruebas que afirman un arreglo exacto o un orden.

| Prueba / suite | Qué cambia | Acción |
| --- | --- | --- |
| **E1-F02#3** (menú del QE) y pruebas de menú de E7 y E5 | El arreglo exacto del QE pasa a `["Bandeja","Equipo","Historias supervisadas","Impedimentos","Indicadores","Integraciones","Perfil"]` (el backlog omite «Integraciones», que E5 ya trajo) | Actualizar el dato |
| Menú del Líder QA | `["Bandeja","Indicadores","Perfil"]` (hoy `["Bandeja","Perfil"]`) | Actualizar el dato |
| Menú del Auditor | `["Bandeja","Indicadores","Perfil"]`; «Bandeja» activo en `/auditor/*` salvo `/auditor/indicadores*` | Actualizar el dato; revisar pruebas de `aria-current` |
| Menú del Administrador | `["Bandeja","Usuarios","Supervisión","Integraciones","Snapshots de indicadores","Perfil"]` | Actualizar el dato |
| Menú del Analista | Sin cambio | Debe seguir pasando |
| **E7-F01** (acceso por rol, matriz de rutas) | Se suman `/qe/indicadores*`, `/lider/indicadores*`, `/auditor/indicadores*`, `/admin/indicadores/snapshots`; el resto de roles recibe acceso denegado (D41) | Ampliar la matriz (E7-F01-T04) |
| **E7-F06-T07** (Auditor sin `<form>` ni `button[type=submit]`) | Se suman las pantallas de indicadores del Auditor. Cumplen: no tienen `form`; los botones son `type="button"` (el único `submit` es el umbral del QE, que el Auditor no tiene) | Incluir la ruta en el recorrido |
| **Bandejas de E7** (F02–F06, B03) | Ninguno (D170: no hay contadores ni filas nuevas) | Sin cambio |
| **Exportaciones del Auditor y entradas `EXPORTAR` de auditoría** | Las exportaciones de E6 dejan entradas `EXPORTAR` | Las pruebas de E7 que leen «la última entrada» crean su propio evento antes de leer (aviso de E4) |
| **E2-F04 / `HduDetailPage`** | El panel `#estado` suma `boton-cerrar-excepcion` en la misma fila que «Pasar a …» (solo QE responsable, `PENDIENTE_CIERRE`, < 10 aprobados); el detalle suma `cierre-excepcion` después del checklist. Mensajes y `data-testid` certificados intactos | Las pruebas que cuentan botones del panel o secciones por posición deben usar testid; las de E4 que provocan `HDU_BLOQUEADA` o `CHECKLIST_INCOMPLETO` desde el detalle (H1/H2/H5 en `PENDIENTE_CIERRE`) ven además el botón nuevo y `aviso-puede-cerrar-excepcion` |
| **E2-B02#3** (cierre con checklist incompleto) | Cambia el enunciado, no el resultado (D173): sin justificación, el rechazo `error-checklist-incompleto` es el de siempre | Debe seguir pasando sin cambios |
| **E3 (certificado)** | Una HDU cerrada con excepción no ofrece generar certificado | Caso nuevo: E6-F05-T04 |
| **Historial del detalle** | Entrada nueva «Cierre con excepción» | Pruebas que leen «el último ítem» crean su evento antes de leer |
| **axe sobre pantallas** | Se suman `/qe/indicadores` (4 pestañas), `/lider/indicadores`, `/auditor/indicadores`, `/admin/indicadores/snapshots`, `/hdu/:id` con cierre con excepción y el diálogo | `q360-qa` confirma los contrastes de 4.1 |

---

## 15. Conflictos y brechas con el backlog E6

1. **Texto del botón de cierre.** El backlog nombra el cierre normal «Cerrar HDU»; el código certificado dice «Pasar a Cerrada». Se conserva el cert. (no se renombra) y se agrega «Cerrar con excepción». Las pruebas nuevas deben buscar por `data-testid` o por «Pasar a Cerrada».
2. **Permiso del botón.** `GET /v1/hdu/{id}` no define cómo sabe el portal que el usuario es el QE responsable (el QE supervisor recibe 403, E6-B05-T04). Se necesita `permisos.cerrarConExcepcion` en el detalle (aditivo, como E4 #2); si no llega, el portal solo puede deducirlo por `permisos.cambiarEstado` + rol QE + checklist, con el riesgo de mostrar el botón al supervisor. Pedir a `q360-arquitecto`.
3. **Origen de las opciones de filtro.** El backlog no define de dónde salen las células y sprints del filtro (solo con HDU en el ámbito; sprint con «(cerrado)» y «Sin sprint»). Se necesita un endpoint de opciones (por ejemplo `GET /v1/indicadores/filtros`) o que el cliente las derive de otra consulta; y el valor de «Sin sprint» en `sprintId` (propuesta: literal `SIN_SPRINT`) no figura en el contrato.
4. **Campos del drill-down.** El backlog lista `motivos` por HDU y el orden por riesgo y «días abiertos del impedimento», pero no la forma exacta. El diseño usa por HDU: id, código, título, analista, estado, `nivelVigente`, `motivos[]`, y el impedimento más grave (id/código, estado, días abiertos). Si no llega el impedimento, la columna se omite.
5. **Cumplimiento por analista con filtros.** Si `carga` filtra por célula o sprint, no queda dicho si `cumplimiento` y «Activas» siguen el filtro. El diseño asume: columnas por estado y cumplimiento siguen el filtro; **Activas** y la sobrecarga no (3.5). Confirmar con `q360-backend`; la nota `nota-filtros-carga` lo explica en pantalla.
6. **Orden de la tabla de carga.** El backlog no define el orden; se propone sobrecargados primero, activas descendente, nombre.
7. **Fecha del punto de la tendencia.** El punto refleja la madrugada (D163); el diseño lo dice con `nota-madrugada`. Un día con un snapshot manual a media jornada se ve igual que el programado; el portal no distingue el origen.
8. **Clave de `fila-analista-<codigo>`.** El backlog usa `ANA1` (alias de semilla). Los usuarios pueden no tener un campo «código»; se usa el código si existe y, si no, el id, y `q360-qa` debe acotar por nombre. Pedir a `q360-backend` un `codigo` o `clave` en cada fila.
9. **Dos filas de pestañas del Auditor.** El diseño monta `/auditor/indicadores*` fuera de `AuditorLayout` para no duplicar pestañas, y fuerza la excepción de `aria-current` en «Bandeja». Alternativa más simple: 7.ª pestaña del Auditor (como E5 hizo con «Integraciones»), pero el backlog pide una opción de menú y 4 pestañas propias, que se respetó.
10. **Menú del QE sin «Integraciones» en el backlog.** El arreglo literal del backlog no incluye «Integraciones»; el diseño lo conserva por ser el estado real del código (E5). Si `q360-qa` prefiere ceñirse al backlog, la prueba fallaría por un ítem que ya existe, no por E6.
11. **Insignia en el encabezado.** `insignia-cierre-excepcion` junto al estado no figura en el backlog; es aditiva. Si una prueba lee el texto completo del encabezado de estado, debe revisarse.
12. **Botón visible desde el inicio.** El backlog describe el botón «junto al rechazo» pero las pruebas lo pulsan sin rechazo previo (T01); se muestra siempre que corresponda y el rechazo agrega solo un aviso, sin segundo botón.
13. **Diálogo único.** El backlog pide «confirmación»; el diálogo con las consecuencias y el botón de peligro es esa confirmación (un solo paso). Un segundo diálogo «¿Estás seguro?» no aportaría información y sumaría un paso a F05-T03.
14. **Fecha de «Datos al …».** Es la hora del navegador al recibir la respuesta, no la del servidor; si el reloj del equipo está mal, se ve mal. Alternativa: `generadoEn` de la respuesta (aditivo).
15. **Colores calculados por inspección.** Las series usan alias con contraste ≥ 3:1 calculado a ojo (acento ≈ 5,2:1; líder ≈ 9:1; auditor ≈ 7,2:1; imp-abierto ≈ 8,4:1; éxito ≈ 5,5:1; texto ≈ 15:1). `q360-qa` los confirma con axe.
16. **Tope de 6 series con filtro explícito.** D166 fija 6 series «por defecto». Con un filtro de célula o sprint que devuelva más de 6, el diseño también las limita y avisa (6.2). Si el servidor las entrega todas, el gráfico no sería legible con más de 6 combinaciones de color, trazo y marcador.
17. **Vista previa del cierre en el Líder y Auditor.** Sin botones; ven bloque e historial (F05-T05). El QE supervisor no responsable tampoco ve el botón (D39).
