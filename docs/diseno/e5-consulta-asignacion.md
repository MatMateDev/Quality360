# Diseño E5 · Consulta de Jira y asignación de HDU

Fecha: 2026-11-02. Complemento de `docs/diseno/e5-integracion-jira.md` (diseño vigente; sus secciones se citan como «E5 §n») y de `docs/backlog/e5-consulta-asignacion.md` (fuente de verdad: D132–D144, HDU E5-F02, E5-F05, escenario 4 de E5-F04; respuestas del usuario en su sección 13). No contiene código. Dueño de construcción: `q360-frontend`.

Notación: «cert.» = elemento certificado que **no se modifica**. Lo no mencionado aquí se resuelve con lo existente: mismos tokens (solo alias nuevos, ningún hexadecimal), mismos componentes (`PestanasNav`, `TablaBandeja`, `BloqueDatos`/`BloqueEstado`, `ResumenEjecucion`, `ErrorIntegracion`, `PanelEsperaEjecucion`, `ListasFilasEjecucion`, `DialogoConfirmacion`, `Paginacion`, `CeldaCambios`, `ChipsAdvertencias`, `.panel`, `.campo`, `.boton*`, `.mensaje-aviso`).

---

## 1. Decisiones de diseño de este cambio

1. **Una sola pestaña, dos zonas.** La pestaña «Sincronizar» pasa a llamarse **«Consultar Jira»** (ruta `/admin/integraciones/sincronizar` y `data-testid="pestana-sincronizar"` cert., D132). Arriba el **panel de consulta** (qué hace, botón, resultado de la tanda). Debajo, la **consulta abierta** (revisión, asignación, resumen y confirmación). Sin pestaña ni ruta nuevas: la consulta es de la vida del Administrador, no de una URL.
2. **Revisar = leer una lista, asignar = completar tarjetas.** Las filas **Nuevas** son *tarjetas-fila* editables en 1280 y en 375 (cuatro selectores por fila no caben en una tabla de 1180 px útiles). Cambiaron / Sin cambios / Con error son **solo lectura** y usan `TablaBandeja`, que a ≤ 640 px se apila en tarjetas (E5 §11.1).
3. **Dos acciones distintas sobre una fila nueva**, porque la asignación en grupo necesita elegir filas *incompletas*, y marcar una incompleta lo rechaza el servidor (D139):
   - **Seleccionar** (`casilla-seleccionar`): estado del portal, sin guardar; define a qué filas actúa el panel de grupo.
   - **Incluir en la confirmación** (`casilla-marcar`): estado del servidor (`marcada`); solo se habilita con la fila «Lista».
   El panel de grupo trae la opción «Incluir en la confirmación las filas que queden listas» (activa al abrir), de modo que el flujo habitual es: seleccionar → asignar → quedan marcadas.
4. **Guardado inmediato por cambio**, sin botón «Guardar» (la consulta es un borrador del servidor, D139). Cada edición muestra «Guardando…» → «Guardado» en la fila; recargar o volver otro día conserva todo (E5-F05 #2).
5. **Lo irreversible lleva diálogo**: Confirmar, Reemplazar y Descartar usan `DialogoConfirmacion`. Lo reversible (seleccionar, asignar, editar, marcar) no.
6. **Estado por texto + glifo + color** (E5 §1.2, §11.2). Estados de fila: «Sin asignar», «Incompleta (falta: analista)», «Lista», «Marcada».
7. **Los avisos que no bloquean no bloquean**: «La célula no tiene Líder activo…» es `role="note"` con `!`; nunca deshabilita nada (D138).
8. **Confirmar no depende de Jira** y el diseño lo dice en pantalla («No se llamará a Jira»).
9. **Sin posición fija (sticky).** Ninguna barra de acciones queda fija sobre el contenido: evita tapar el foco (WCAG 2.2 · 2.4.11) y ocupar el 375 px. El resumen de confirmación está al final de la consulta y el encabezado de la consulta trae el enlace «Ir al resumen».

---

## 2. Flujo de pantallas y estados

```
 [Sin configuración] ──Ir a Conexión──▶ (E5-F01)
        │
 [Sin consulta] ──Consultar Jira──▶ [Consultando…] ──┬─▶ [Tanda completa] ──┐
        ▲                                             ├─▶ [Tanda incompleta: «Continuar consulta»] ─▶ (otra tanda) ─┤
        │                                             ├─▶ [Sin novedades] (no hay consulta que revisar)             │
        │                                             └─▶ [Error de Jira / 429] (la consulta previa se conserva)    │
        │                                                                                                           ▼
        │                                   ┌────────────────────── [Consulta abierta] ◀─────────────────────────┘
        │                                   │ seleccionar · asignar (fila/grupo) · incluir · «Continuar consulta»
        │                                   │
        │             Consultar Jira ──▶ ¿hay abierta? ─sí─▶ [Diálogo reemplazar] ─ok─▶ nueva consulta (la anterior: Reemplazada)
        │                                   │
        │                                   ├─ Descartar ─▶ [Diálogo] ─ok─▶ [Descartada]
        │                                   ├─ 24 h ─────────────────────▶ [Vencida]          (solo lectura, sin filas)
        │                                   ├─ otra persona la reemplaza ▶ [Reemplazada]      (solo lectura)
        │                                   └─ Confirmar ─▶ [Diálogo] ─ok─▶ [Confirmando…] ─┬─▶ [Confirmada] (resultado)
        │                                                      │                            ├─▶ [Confirmación incompleta] ─ «Continuar confirmación» ─▶ …
        │                                                      │                            └─▶ [Error: Organización]  (la consulta sigue abierta)
        │                                                      ├─▶ 409 CONSULTA_MODIFICADA   ─▶ recarga + aviso (sin escribir)
        │                                                      └─▶ 409 ASIGNACIONES_INVALIDAS ─▶ filas desmarcadas + alerta (sin escribir)
        └─────────────── [Confirmada / Vencida / Reemplazada / Descartada] ── «Consultar Jira» siempre disponible ──┘
```

Estados de la zona «consulta abierta» (`consulta-abierta`, atributo `data-estado`, `data-version`):

| Estado | Qué se ve | Qué se puede hacer |
| --- | --- | --- |
| Sin consulta | Solo el panel de consulta. Texto «Aún no hay una consulta abierta.» (`estado-vacio-consulta`) | Consultar |
| Consultando | Botón «Consultando…» deshabilitado y `estado-consultando` (barra indeterminada, E5 §4.1) | Nada; se puede salir, queda en Historial |
| `ABIERTA` | Cabecera, grupos, resumen | Todo |
| `ABIERTA` con `hayMas` | Igual + `boton-continuar-consulta` | Continuar |
| `ABIERTA` con 500 filas | Aviso `CONSULTA_LLENA`; sin «Continuar» | Confirmar y consultar de nuevo |
| `VENCIDA` | `aviso-consulta-vencida`; sin filas ni selectores | Consultar (sin diálogo de reemplazo) |
| `REEMPLAZADA` | `aviso-consulta-reemplazada` con el nombre de quien la reemplazó | Consultar / ir a la nueva |
| `DESCARTADA` | Cabecera «Descartada», sin filas | Consultar |
| Confirmando | Botón «Confirmando…» y espera indeterminada; todo el resto de la consulta en `inert` | Nada |
| `CONFIRMADA` | `resultado-confirmacion` + cabecera en solo lectura | Consultar |
| Sin permisos | Ver §7 | — |

Reglas transversales: una sola operación a la vez (consulta, continuación o confirmación): mientras corre una, los otros botones de ejecución están deshabilitados; si es ajena, `aviso-en-curso` «Ya hay una consulta o confirmación en curso» (E5 §4.3, polling cada 3 s hasta 30 s). Una consulta `VENCIDA`/`REEMPLAZADA`/`DESCARTADA`/`CONFIRMADA` se muestra como **resumen en solo lectura** (cabecera + contadores); las filas fueron purgadas (D133) y no se simulan.

---

## 3. Pestaña «Consultar Jira»: panel de consulta

Encabezado de página y pestañas (cert., salvo el nombre): `[ Conexión ] [ Consultar Jira ] [ Importar archivo ] [ Historial ]`. El `h1` «Integraciones» y su descripción no cambian.

### 3.1 Wireframe 1280 (sin consulta abierta)

```
 [ Conexión ] [ Consultar Jira ] [ Importar archivo ] [ Historial ]

 ┌ Consultar Jira ─────────────────────────────────────────────────────────────────────────────────────┐
 │ Proyecto QTY en su-empresa.atlassian.net   [✓ Conectado]                                             │
 │ Última ejecución: 02-11-2026 10:20 · [Consulta] [✓ Exitosa] · Ver detalle      (resumen-ultima-sync)  │
 │ Consultar Jira lee las historias y las deja para revisión. No crea ni modifica HDU hasta que confirmes.│
 │ ▸ Qué se puede actualizar al confirmar          ← <details>: «Al confirmar solo se actualizan título,   │
 │                                                    descripción y prioridad de las filas que marques…»  │
 │                                                              [ Consultar Jira ]                       │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
 Aún no hay una consulta abierta.                                                  (estado-vacio-consulta)
```

- Desaparecen: el destino («Las HDU nuevas se crean en CEL-C…»), la casilla «Vincular HDU creadas a mano» y `aviso-vincular-*` (D144). El `<details>` conserva, en una frase, lo que se actualiza y lo que nunca se toca: «Al confirmar se actualizan solo el título, la descripción y la prioridad de las filas que marques en "Cambiaron en Jira". Nunca se modifican el estado, el analista, el QE, el sprint, la célula, el checklist ni los impedimentos. Las HDU cerradas no se modifican.»
- Con consulta abierta, el botón sigue siendo «Consultar Jira» (secundario si hay una abierta, principal si no), y `boton-continuar-consulta` «Continuar consulta» aparece a su izquierda solo con `hayMas`. `aria-describedby` de «Continuar consulta» apunta al aviso de tanda incompleta.
- Sin configuración: `estado-vacio-jira` cert. «Configura la conexión con Jira antes de consultar» + «Ir a Conexión»; no existe `boton-consultar-jira`.

### 3.2 Durante y después de una tanda

Durante: `estado-consultando` (`role="status"`, `aria-busy`): «Leyendo historias de Jira y comparándolas con Quality360. Puede tardar hasta unos 10 segundos. No se puede cancelar. Puedes salir: el resultado quedará en el Historial.» El botón dice «Consultando…» (`aria-disabled`).

Resultado de la tanda (`resultado-consulta`, foco al encabezado `tabIndex=-1`; mismo `panel-resultado` que E5 §4.1):

```
 ┌ resultado-consulta ─────────────────────────────────────────────────────────────────────────────────┐
 │ Resultado: [◐ Con errores]   02-11-2026 10:20 · duración 3,1 s              [Ver detalle en el Historial]│
 │ Se leyeron las historias de Jira y quedaron para revisión. 1 fila no se puede importar.              │
 │ ┌ Leídas ┐ ┌ Nuevas ┐ ┌ Cambiaron ┐ ┌ Sin cambios ┐ ┌ Con error ┐          ┌ Con advertencias ┐     │
 │ │   11   │ │   10   │ │     0     │ │      0      │ │     1     │          │ 4 (informativo)  │     │
 │ └────────┘ └────────┘ └───────────┘ └─────────────┘ └───────────┘          └──────────────────┘     │
 │ Jira pidió esperar 2 veces; se reintentó.                                       (aviso-limite-tasa)  │
 │                                                       [ Revisar y asignar (10 nuevas) ]  (enlace)    │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- `ResumenEjecucion` con variante: cuatro grupos que suman a «Leídas» (`res-nuevas`, `res-cambiaron`, `res-sin-cambios`, `res-con-error`) + `res-advertencias` aparte (borde punteado, «informativo, no suma»). `res-leidas` y los demás muestran el **acumulado de la consulta** (T07: 100 → 200 → 230); bajo la rejilla, si hubo continuaciones: «Esta tanda: N historias.»
- Titulares por resultado: `EXITOSA` «Consulta completa.»; `CON_ERRORES` «Consulta completa. N filas no se pueden importar; las demás quedaron para revisión.»; `INCOMPLETA` ver 3.3; `FALLIDA` ver §7.2.
- «Revisar y asignar (N nuevas)» (`enlace-revisar-consulta`) mueve el foco al encabezado `h2` de la consulta abierta (no hace scroll animado). Si N = 0 y hay cambios: «Revisar los cambios (N)».
- **Sin novedades** (`mensaje-sin-novedades`, tono neutro, glifo `✓`): «Sin novedades: todas las historias de Jira ya están en Quality360 sin cambios». Con `leidas = 0`: «Sin novedades: el proyecto no tiene historias del tipo configurado». No existe `boton-confirmar` y la consulta, si no hay nada que revisar, **no se muestra** como abierta (la cabecera de la consulta solo aparece cuando hay al menos una fila `NUEVA` o `CAMBIO`; con solo `SIN_CAMBIOS`/`CON_ERROR` se muestran los grupos de lectura sin resumen de confirmación).

### 3.3 Tanda incompleta y «Continuar consulta»

`aviso-incompleta` (`mensaje-aviso`, `◔`, `role="status"`, foco al aparecer):

| Causa | Texto |
| --- | --- |
| Tope de 100 por tanda | «Se leyeron 100 historias; quedan más en Jira.» |
| `PRESUPUESTO_DE_TIEMPO` | «Se alcanzó el tiempo máximo. Se leyeron N historias; continúa la consulta para leer el resto.» |
| `JIRA_LIMITE_DE_TASA` con parte leída | «Jira pidió esperar demasiado. Se leyeron N historias; continúa más tarde o importa un archivo.» |
| `TOPE_DE_CONSULTA` / `CONSULTA_LLENA` | «La consulta llegó a 500 filas. Confirma lo que corresponda y consulta de nuevo para traer el resto.» (sin botón «Continuar») |

Debajo: «Lo que ya leíste y asignaste se conserva.» Cada «Continuar consulta» suma a la misma consulta y deja su propia ejecución en el Historial. `boton-continuar-consulta` sobrevive a recargas (se deriva de `hayMas` de la consulta).

### 3.4 Wireframe 375

```
┌────────────────────────────┐
│ Integraciones              │
│ [Conexión][Consultar Jira]→│  ← pestañas con scroll horizontal; activa visible
│ Consultar Jira             │
│ Proyecto QTY               │
│ su-empresa.atlassian.net   │  ← overflow-wrap:anywhere
│ [✓ Conectado]              │
│ Última: 02-11 10:20        │
│ [✓ Exitosa] Ver detalle    │
│ Consultar Jira lee las     │
│ historias y las deja para  │
│ revisión. No crea ni       │
│ modifica HDU hasta que     │
│ confirmes.                 │
│ ▸ Qué se puede actualizar  │
│ [Continuar consulta]       │  ← solo con hayMas; 44 px, ancho completo
│ [Consultar Jira]           │
├────────────────────────────┤
│ Resultado [◐ Con errores]  │
│ ┌ Leídas ───────────── 11 ┐│  ← rejilla de 2 columnas
│ ┌ Nuevas ───────────── 10 ┐│
│ ┌ Cambiaron ─────────── 0 ┐│
│ ┌ Sin cambios ───────── 0 ┐│
│ ┌ Con error ─────────── 1 ┐│
│ ┌ Con advertencias ──── 4 ┐│
│ [Revisar y asignar (10)]   │
└────────────────────────────┘
```

---

## 4. Consulta abierta: revisión y asignación

### 4.1 Cabecera de la consulta (`consulta-abierta`)

```
 ┌ h2 Consulta de Jira · [● Abierta] ────────────────────────────────────────────── [Descartar consulta] ┐
 │ Creada por Admin Uno el 02-11-2026 10:20 · Vence el 03-11-2026 10:20 · Proyecto QTY                      │
 │ ┌ Nuevas ─────┐ ┌ Cambiaron ──┐ ┌ Sin cambios ┐ ┌ Con error ┐   Nuevas: 10 · asignadas 4 · incluidas 4    │
 │ │ 10          │ │ 2           │ │ 8           │ │ 1         │   Cambiaron: 2 · incluidas 1               │
 │ │ Ir a Nuevas │ │ Ir a cambios│ │ Ir a …      │ │ Ir a …    │   [Ir al resumen]  [Actualizar consulta]    │
 │ └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘                                          │
 └────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Las cuatro tarjetas son enlaces ancla a cada grupo (nombre accesible «Ir a Nuevas, 10 filas»). Cuentan con `res-nuevas`/`res-cambiaron`/`res-sin-cambios`/`res-con-error` (los mismos ids que el resultado; solo uno de los dos bloques los contiene por vez, ver §13).
- `boton-actualizar-consulta` (secundario, `type=button`): vuelve a leer la consulta del servidor (no llama a Jira). También se recarga sola al volver a la pestaña del navegador y antes de confirmar. Es la forma de ver lo que otro Administrador cambió sin confirmar.
- «Vence el…» y «Creada por…» son texto, no solo color. Menos de 1 h para vencer: se agrega `mensaje-aviso` «La consulta vence en N minutos.»
- Descartar: botón terciario (texto rojo + palabra) a la derecha de la cabecera; a 375 px va al final de la cabecera, ancho completo.

### 4.2 Estructura de grupos

Cuatro secciones, cada una un `<section>` con `h3` + contador y **disclosure** (`aria-expanded`/`aria-controls`, como E5 §4.6): `grupo-nuevas` (abierta), `grupo-cambiaron` (abierta si > 0), `grupo-sin-cambios` (cerrada), `grupo-con-error` (abierta si > 0). Una sección con 0 filas muestra su título con «0» y no se despliega. Cada sección con filas trae: filtro de texto (`filtro-texto-<grupo>`, código o título, en el servidor), `Paginacion` de **25** por página (tamaño máximo 100) y «Mostrando 1–25 de 230». La página y el filtro viven en el estado local de la sección (no en la URL): la consulta es un borrador, no un destino compartible.

### 4.3 Grupo «Nuevas»: tarjeta-fila y panel de grupo

Panel de grupo, siempre sobre la lista (`panel-asignar-grupo`, `<fieldset>` con `legend` «Asignar a las filas seleccionadas»). Si no hay filas seleccionadas, sus controles se ven pero `aria-disabled` y el botón dice «Aplicar a 0 filas».

```
 ┌ Nuevas (10) ──────────────────────────────────────────────────────────────────────────────── [▾] ┐
 │ Filtrar por código o título [__________________]                                                    │
 │ ┌ panel-asignar-grupo · Asignar a las filas seleccionadas ──────────────────────────────────────┐ │
 │ │ Célula            QE responsable        Analista QA (equipo del QE)    Sprint                    │ │
 │ │ [CEL-C         ▾] [Pablo Núñez       ▾] ┌ Elige…            ┐ ┌ Propuesto por Jira (o respaldo) ┐│ │
 │ │ Sugerida desde    Sugerido desde         │ Ana Rojas         │ │ No cambiar                      ││ │
 │ │ Conexión          Conexión               │ Luis Pérez        │ │ E5 Sprint 1                     ││ │
 │ │                                          └───────────────────┘ │ E5 Sprint 2                     ││ │
 │ │                                                                 └─────────────────────────────────┘│ │
 │ │ ☑ Incluir en la confirmación las filas que queden listas                                          │ │
 │ │ Se aplicará a 4 filas seleccionadas.                         [ Aplicar a 4 filas ] (boton-aplicar-grupo)│
 │ └───────────────────────────────────────────────────────────────────────────────────────────────┘ │
 │ ☐ Seleccionar las 10 de esta página      (casilla-seleccionar-grupo)    [ Incluir todas las listas ] │
 │   (banner tras seleccionar la página, role=status:                                                   │
 │    «Se seleccionaron 10 filas de esta página.» [Seleccionar las 230 filas del grupo])                │
 │                                                                                                      │
 │ ┌ fila-QTY-1 · data-completa="true" ────────────────────────────────────────────────────────────┐   │
 │ │ ☑ Seleccionar     QTY-1  Login con doble factor                       Prioridad: Alta           │   │
 │ │   Sprint en Jira: E5 Sprint 2    [+ Nueva] [Creada por Jira]                                     │   │
 │ │   Célula [CEL-C ▾]   QE responsable [Marta Díaz ▾]   Analista QA [Ana Rojas ▾]  Sprint [E5 Sprint 2 ▾]│   │
 │ │   [Sprint de Jira]   ! La célula no tiene Líder activo: nadie la verá como Líder.               │   │
 │ │   Estado: [✓ Lista]  ☑ Incluir en la confirmación                          Guardado              │   │
 │ └─────────────────────────────────────────────────────────────────────────────────────────────────┘   │
 │ ┌ fila-QTY-4 · data-completa="false" ───────────────────────────────────────────────────────────┐   │
 │ │ ☐ Seleccionar     QTY-4  Exportar reporte mensual                  Prioridad: Sin prioridad     │   │
 │ │   Sprint en Jira: —                                                                              │   │
 │ │   Célula [CEL-C ▾]   QE responsable [Marta Díaz ▾]   Analista QA [Elige… ▾]    Sprint [E5 Sprint 1 ▾]│   │
 │ │   [Sprint de respaldo]                                                                           │   │
 │ │   Estado: [◐ Incompleta (falta: analista)]  ☐ Incluir (deshabilitada: «Falta: analista»)         │   │
 │ └─────────────────────────────────────────────────────────────────────────────────────────────────┘   │
 │ …                                              ◀ Anterior  Página 1 de 1  Siguiente ▶                │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Contenido de la tarjeta-fila** (`fila-<codigo>`; el código se normaliza en mayúsculas, p. ej. `fila-QTY-1`):

| Línea | Contenido |
| --- | --- |
| 1 | `casilla-seleccionar` (etiqueta visible «Seleccionar», nombre accesible «Seleccionar QTY-1»), código en negrita, título completo (`overflow-wrap:anywhere`, máx. 2 líneas con «Ver más» si > 140 caracteres), prioridad a la derecha |
| 2 | «Sprint en Jira: …» (o «—»), chip de grupo, y los chips informativos |
| 3 | Los cuatro selectores, cada uno con **etiqueta visible**: Célula (`selector-celula`), QE responsable (`selector-qe`), Analista QA (`selector-analista`), Sprint (`selector-sprint`) |
| 4 | `chip-sprint-origen` «Sprint de Jira» o `chip-sprint-respaldo` «Sprint de respaldo» (solo mientras el sprint mostrado sea el propuesto; al cambiarlo a mano el chip desaparece), advertencia `SPRINT_NO_ENCONTRADO` y `aviso-sin-lider` |
| 5 | Estado de la fila (texto + glifo), `casilla-marcar` «Incluir en la confirmación» y el indicador de guardado |

Descripción de Jira: no se muestra en la tarjeta (ya está en el servidor y es extensa); `<details>` «Ver descripción» (texto plano, nunca HTML, máx. 1.000 caracteres, `white-space: pre-wrap`, `overflow-wrap:anywhere`).

**Estados de fila (texto + glifo):**

| Estado | Texto | Glifo | Tono | `casilla-marcar` |
| --- | --- | --- | --- | --- |
| Sin asignar | «Sin asignar» | `○` | neutro | deshabilitada, «Falta: célula, QE, analista y sprint» |
| Incompleta | «Incompleta (falta: analista)» (lista exacta de lo que falta, en el orden célula, QE, analista, sprint) | `◐` | ámbar | deshabilitada, «Falta: analista» |
| Lista | «Lista» | `✓` | éxito | habilitada |
| Marcada | «Marcada» (Lista + incluida) | `✓` + `☑` | éxito | marcada |
| Con problema | «No se pudo guardar» | `✕` | rojo | según estado previo |

`data-completa="true|false"` en `fila-<codigo>` es la lista/incompleta (cert. del backlog); `data-marcada` es nuevo.

### 4.4 Reglas de los selectores (D137, D138)

| Selector | Opciones | Comportamiento |
| --- | --- | --- |
| Célula | «Elige…» + células activas (catálogo existente) | Al elegir (o cambiar): el servidor **recalcula el sprint** (D137) y la fila lo refleja; si había un sprint elegido a mano, se reemplaza y se anuncia «El sprint se recalculó para la célula elegida» |
| QE responsable | «Elige…» + usuarios activos con rol QE | Al **cambiar**, el analista se **limpia** y se anuncia «Se limpió el analista: elige uno del equipo de <QE>» |
| Analista QA | «Elige…» + analistas activos del **equipo vigente del QE elegido** | Deshabilitado hasta elegir QE («Elige primero un QE»). Sin analistas: queda vacío con el texto «Este QE no tiene analistas en su equipo» (`ayuda-sin-analistas`) y la fila no se puede incluir |
| Sprint | «Elige un sprint» (solo si no hay propuesta) + sprints **de la célula elegida** | Deshabilitado hasta elegir célula. Editable siempre; muestra el origen de la propuesta |

- Las opciones se cargan de los catálogos existentes y de uno nuevo para los analistas del equipo de un QE (ver §14, brecha 3); las listas largas no se paginan (≤ 100).
- Lista visible de hasta 6 filas (D131): en `panel-asignar-grupo` y en cualquier diálogo, **Analista** y **Sprint** son `select` con `size = min(6, n + 1)`; la opción «Elige…»/«No cambiar» es la primera y **no es un valor**. En las tarjetas-fila (en página, no se recortan) son desplegables normales.
- El panel de grupo aplica solo los campos que se eligieron: el valor por defecto de Célula, QE y Analista es «No cambiar»; el de Sprint es «Propuesto por Jira (o respaldo)». Opción para QE/Analista vacíos con «No cambiar» → conserva lo de cada fila. Si se elige un Analista en el panel, el QE del panel es obligatorio (el analista depende de él); si se elige QE sin analista, **se limpia** el analista de las filas cuyo QE cambia. «Sugerida/o desde Conexión»: Célula y QE del panel se rellenan **como sugerencia** con el destino de Conexión (respuesta 3); es solo la selección inicial del panel, **no** preasigna ninguna fila (D137).
- Elegir a mano un sprint en el panel lo valida contra la célula del panel; «Propuesto por Jira (o respaldo)» deja que cada fila use su propia propuesta.

### 4.5 Aplicar al grupo y resultado parcial (D139)

1. `boton-aplicar-grupo` se habilita con ≥ 1 fila seleccionada y ≥ 1 campo elegido. Texto: «Aplicar a N filas» (singular «Aplicar a 1 fila»).
2. Una sola petición al servidor; mientras corre, el botón dice «Aplicando…» y el panel queda `aria-busy`.
3. Resultado, anunciado en `role="status"` (§9): «Se aplicó a 4 filas. 4 quedaron listas e incluidas.»
4. **Si alguna fila no pasó** (aplicación parcial, nunca silenciosa): `alerta-rechazadas` (`role="alert"`, `tabIndex=-1`, foco), glifo `✕`, título «No se pudo aplicar a 3 filas», lista «QTY-1 · Analista: ANA1 no pertenece al equipo de QE2», y «Las demás filas se actualizaron. Estas filas no cambiaron.» Cada línea enlaza (ancla) a su fila. La alerta queda hasta que se cierre con «Entendido» o se aplique otra acción.
5. Las filas seleccionadas **siguen seleccionadas** tras aplicar (para poder corregir y repetir). «Quitar selección» (`boton-quitar-seleccion`) la limpia.
6. «Seleccionar las N filas del grupo» (`boton-seleccionar-todo-el-grupo`): solo aparece tras marcar la casilla de la página y **sin filtro de texto activo** (con filtro, el servidor no tiene «las filtradas»: se ve la nota «Con un filtro activo solo se selecciona esta página»). Actúa en el servidor con `{grupo, todas:true}`; al elegirlo el contador pasa a «230 filas seleccionadas» y el botón de aplicar a «Aplicar a 230 filas». Después del PATCH, las filas fuera de la página no se renderizan; el resumen del panel indica «230 asignadas».
7. `boton-marcar-todas` «Incluir todas las listas»: marca solo las que están «Listas» e informa en `role="status"`: «Se incluyeron 4 filas. 6 siguen incompletas.» (T14).

### 4.6 Edición por fila

- Cada cambio de selector se guarda al soltarlo (`change`), uno por vez por fila (los controles de esa fila quedan `aria-busy` durante la petición, sin deshabilitarse).
- Indicador de guardado por fila (`guardado-fila-<codigo>`): «Guardando…» → «Guardado» (texto; se oculta a los 4 s). Si falla: «No se pudo guardar» + botón «Reintentar» (`boton-reintentar-fila-<codigo>`) y el valor vuelve al anterior.
- **Servidor rechaza** (422): mensaje bajo el selector del campo afectado (`error-<campo>-<codigo>`, `aria-describedby`, `aria-invalid`), y el valor vuelve al anterior. Textos en §10.
- **Desmarcado automático** (`desmarcadas`): si una edición invalida una fila incluida, se desmarca y se anuncia «QTY-3 dejó de estar incluida: falta el analista». La fila pasa a «Incompleta (falta: …)».
- Cambiar una fila ya incluida **no** exige reconfirmar nada: sigue «Marcada» si queda válida.

### 4.7 Grupo «Cambiaron en Jira» (solo lectura + marcar)

`TablaBandeja` (1280) con columnas: Incluir (`casilla-marcar`, nombre «Incluir QTY-2 en la confirmación») · Código · Título actual · Cambios (`celda-cambios`) · Estado de la HDU · Acción nula. Debajo del título, chips: `chip-creada-a-mano` «Creada a mano» si corresponde.

```
 INCLUIR  CÓDIGO  CAMBIOS                                                          HDU EN QUALITY360
 ☑        QTY-2   Título: Recuperar contraseña → Recuperar clave                  Pendiente · QE1
                  Prioridad: Media → Crítica
 ☐        QTY-1   Descripción: «Permite iniciar sesión…» → «Permite iniciar…»    En curso · QE1
 ☐        QTY-5   Título: Notificaciones → Notificaciones push   [Creada a mano]  Pendiente · QE1
                  ! Al actualizar pasará a figurar como Jira; su estado, analista y QE no cambian.
```

- `CeldaCambios` (cert.): «Campo: antes → después», valores ≤ 200 caracteres, vacío = «(vacío)», `overflow-wrap:anywhere`. Para lectores: «Título: antes "A", después "B"». Descripción: se muestra recortada a 200 caracteres con «(…)» y `<details>` «Ver completa» (antes y después, texto plano).
- Marcar no exige nada. Cabecera de la sección: `casilla-marcar-grupo` «Incluir todas las de esta página» y la nota fija «Al confirmar se actualizan solo título, descripción y prioridad. El estado, el QE, el analista, el sprint y la célula no cambian.»
- 375 px: tarjeta apilada con **Incluir y Código primero** (`celda-prioritaria`), luego título, cada cambio en su línea y la nota de «Creada a mano».

### 4.8 Grupos «Sin cambios» y «Con error» (solo lectura)

- **Sin cambios**: Código · Título · Motivo («Sin cambios» o «La HDU está cerrada y no se modifica»). Cerrada por defecto. Sin casillas.
- **Con error**: Código (o «—») · Motivo («El título es obligatorio», «El código no es válido») con `✕ Error`. Abierta si hay filas. Sin casillas. Nota fija: «Estas filas no se pueden importar desde Jira. Corrígelas en Jira y consulta de nuevo, o impórtalas desde un archivo.»
- Ambas usan `TablaBandeja` apilable (Código y Motivo `celda-prioritaria`).

---

## 5. Validaciones y avisos

| Cuándo | Tipo | Presentación | Bloquea |
| --- | --- | --- | --- |
| Fila nueva incompleta | Estado | «Incompleta (falta: …)» + `casilla-marcar` deshabilitada con el motivo en `aria-describedby` | Solo la inclusión de esa fila |
| QE sin analistas | Ayuda | `ayuda-sin-analistas`: «Este QE no tiene analistas en su equipo. Elige otro QE.» | La inclusión |
| Analista no pertenece al equipo del QE (llega de otra edición) | Error de campo | «<Analista> no pertenece al equipo de <QE>» bajo el selector; el valor no cambia | El cambio |
| Sprint de Jira no existe en la célula | Advertencia | Chip `!` «El sprint de Jira no existe en esta célula» junto al chip «Sprint de respaldo» | No |
| Sin sprint propuesto | Estado | Selector «Elige un sprint»; fila «Incompleta (falta: sprint)» | La inclusión |
| **Célula sin Líder activo** | Aviso (`aviso-sin-lider`, `role="note"`, `!`) | «La célula no tiene Líder activo: nadie la verá como Líder.» (ámbar, junto a los selectores; aparece al fijar la célula; no aparece en CEL-A) | **No**: ni la fila ni «Confirmar» |
| Sin filas incluidas | Estado | `boton-confirmar` deshabilitado (`aria-disabled`) y nota «Marca al menos una fila» (`ayuda-confirmar`, `aria-describedby`) | Confirmar |
| Código de HDU ya existente por otra vía | Informativo | Ya no es «Nueva»: aparece en «Cambiaron» o «Sin cambios» | — |

Los `aria-disabled` se prefieren a `disabled` para las casillas con motivo: así el motivo se lee al enfocar. Un clic en una casilla `aria-disabled` no hace nada y el portal anuncia el motivo.

---

## 6. Resumen previo, confirmación y resultado

### 6.1 Resumen previo a confirmar (`resumen-confirmacion-consulta`, al final de la consulta)

```
 ┌ h3 Resumen antes de confirmar ──────────────────────────────────────────────────────────────────────┐
 │ ┌ HDU nuevas a crear ┐ ┌ HDU a actualizar ┐ ┌ Nuevas sin incluir ┐ ┌ Cambios sin incluir ┐          │
 │ │         4          │ │        1         │ │          6         │ │          1          │          │
 │ └────────────────────┘ └──────────────────┘ └────────────────────┘ └─────────────────────┘          │
 │ Las nuevas se crearán así:  CEL-C · QE2 · ANA3 · E5 Sprint 2  (4)                                    │
 │                             (una línea por combinación distinta, máx. 5; «y N combinaciones más»)    │
 │ Se crearán 4 HDU y se actualizará 1. No se llamará a Jira. Las filas sin marcar se descartarán.      │
 │ ! 2 filas incluidas están en células sin Líder activo.            (solo si aplica; informativo)       │
 │                                                          [ Confirmar (5) ]    (boton-confirmar)       │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Texto fijo exacto, con concordancia: «Se crearán X HDU y se actualizarán Y. No se llamará a Jira. Las filas sin marcar se descartarán.» Singulares: «Se creará 1 HDU», «se actualizará 1»; con 0: «No se creará ninguna HDU» / «No se actualizará ninguna».
- `boton-confirmar` dice «Confirmar (N)» con N = nuevas incluidas + cambios incluidos; con N = 0 está `aria-disabled` y dice «Confirmar (0)» con `ayuda-confirmar` «Marca al menos una fila».
- Los contadores se actualizan en vivo; se anuncian en el `role="status"` general solo con resumen corto (§9), nunca en cada pulsación de un lote.

### 6.2 Diálogo de confirmación (`DialogoConfirmacion`, `dialogo-confirmar-consulta`)

- Título: «Confirmar la consulta de Jira». Cuerpo: «Se crearán 4 HDU y se actualizará 1. No se llamará a Jira. Las 6 filas nuevas y la fila de cambios sin marcar se descartarán: para traerlas tendrás que consultar Jira de nuevo.»
- Botones: **«Confirmar (5)»** (principal) y «Seguir revisando». Foco inicial: «Seguir revisando» (la acción irreversible no es la predeterminada, como el resto de diálogos destructivos de E4). Esc = «Seguir revisando». Al cerrar sin confirmar, el foco vuelve a `boton-confirmar`.
- Al aceptar: el diálogo se cierra, el botón de la página pasa a «Confirmando…» y la consulta queda en `inert`. Envía la `version` vista (D139/D140).

### 6.3 Resultado (`resultado-confirmacion`, foco al encabezado, `role="status"`)

```
 ┌ resultado-confirmacion ─────────────────────────────────────────────────────────────────────────────┐
 │ Resultado: [✓ Exitosa]   02-11-2026 10:42 · duración 2,4 s                  [Ver detalle en el Historial]│
 │ Confirmación completa. Se crearon 4 HDU y se actualizó 1.                                            │
 │ ┌ Leídas ┐ ┌ Creadas ┐ ┌ Actualizadas ┐ ┌ Omitidas ┐ ┌ Con error ┐                                   │
 │ │   5    │ │    4    │ │      1       │ │    0     │ │     0     │                                   │
 │ 6 filas sin marcar no se crearon; consulta de nuevo para traerlas.                                   │
 │ ▾ HDU creadas (4)    QTY-1  Login con doble factor   Alta · CEL-C · QE2 · ANA3 · E5 Sprint 2        │
 │ ▾ HDU actualizadas (1)   QTY-2  Título: Recuperar contraseña → Recuperar clave                       │
 │ ▸ Omitidas (0)       ▸ Filas con error (0)                                                           │
 │                                                              [ Consultar Jira ]                      │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- `ResultadoEjecucion` reutilizado: mismas cuatro listas (`ListasFilasEjecucion`, carga bajo demanda de 25), con la línea de **asignación** en "creadas" (nombres, no ids). Códigos enlazan a `/hdu/:id`.
- Concordancia: «6 filas sin marcar no se crearon; consulta de nuevo para traerlas.» / «1 fila sin marcar no se creó; consulta de nuevo para traerla.» / sin descartadas, la línea no aparece. Se cuentan también las de «Cambiaron» no marcadas: «N filas sin marcar no se procesaron…» cuando hay de ambos tipos se usa la suma con «sin marcar».
- Resultados `OMITIDA` y `ERROR` por fila con su motivo literal: «La HDU se creó mientras revisabas la consulta. No se modificó» (`HDU_CREADA_DESPUES`) y «La asignación ya no es válida» (`ASIGNACION_INVALIDA`). Titular `CON_ERRORES`: «Confirmación completa. N filas tuvieron errores y las demás se procesaron.»
- **Confirmación incompleta** (`aviso-incompleta`, `◔`): «Se aplicaron 25 de 230.» + «La consulta sigue abierta. Continúa para aplicar el resto sin duplicar.» y `boton-continuar-confirmacion` «Continuar confirmación». La cabecera sigue «Abierta» y la consulta, en `inert` solo mientras corre.
- Tras `CONFIRMADA`: cabecera con `[✓ Confirmada]`, sin filas ni selectores; `boton-consultar-jira` disponible sin diálogo.

---

## 7. Errores y casos especiales

### 7.1 Matriz de estados de red

| Bloque | Cargando | Vacío | Error | No disponible |
| --- | --- | --- | --- | --- |
| Panel de consulta | Esqueleto | `estado-vacio-jira` | `estado-error-sincronizacion` (cert.) | `estado-indisponible-sincronizacion` (cert.) |
| Consulta abierta | Esqueleto de cabecera + 3 tarjetas-fila | `estado-vacio-consulta` | `estado-error-consulta` + «Reintentar» | `estado-indisponible-consulta` + «Reintentar» |
| Lista de un grupo | Esqueleto de 3 filas | Sección con 0, sin desplegar | Reintentar dentro de la sección | ídem |
| Selectores (catálogos) | `aria-busy`, «Cargando…» | — | «No pudimos cargar las opciones» + «Reintentar» | ídem |

Regla de E4 que se mantiene: un dato caído nunca es un «0».

### 7.2 Errores de Jira al consultar (incluye 429)

`error-consulta` (`ErrorIntegracion`, `role="alert"`, `data-codigo`, foco, glifo `✕`): título «No se pudo consultar Jira», mensaje fijo por código (E5 §10.1 con «sincronizar» → «consultar», ver §10), línea «La ejecución quedó registrada como fallida y no se guardó ninguna consulta nueva.» y, **si hay una consulta abierta**, «La consulta que tenías abierta se conserva.» (no se toca; sigue debajo, editable). «Qué puedes hacer»: «Consultar de nuevo» (`boton-reintentar-consulta`, botón normal, no reenvía solo) · «Importar un archivo →» · «Ver en el Historial» y los accesos de la tabla de E5 §4.5 (Ir a Conexión para credencial/token). `ORGANIZACION_NO_DISPONIBLE`: «Consultar de nuevo», sin «Importar un archivo».

- **429 sin lectura útil** (`JIRA_LIMITE_DE_TASA`, fallida): «Jira pidió esperar demasiado. Reintenta en unos minutos.» con «Consultar de nuevo» **diferido**: el botón no se bloquea (el servidor decide), pero la sugerencia dice «Espera unos minutos antes de reintentar.»
- **429 con parte leída**: no es error; es tanda `INCOMPLETA` (3.3) con `aviso-limite-tasa` «Jira pidió esperar N veces; se reintentó.» o, si agotó los reintentos, el texto de `JIRA_LIMITE_DE_TASA` de 3.3.
- **`SIN_RESPUESTA`** (504/red): «No recibimos respuesta del servidor. La consulta pudo haberse completado: revisa el Historial antes de reintentar.» + enlace; el portal relee la consulta abierta para sincronizar la pantalla (misma regla de E5 §4.5).

### 7.3 Conflicto entre dos Administradores

- **Ediciones concurrentes** (D139, última escritura gana): no se avisan en el momento. Al volver a la pestaña o con `boton-actualizar-consulta`, la consulta se recarga; si cambió la `version`, `aviso-consulta-modificada` informativo: «Otra persona modificó la consulta. Revisa los cambios.»
- **Confirmar con `version` vieja** (409 `CONSULTA_MODIFICADA`): el diálogo ya se cerró; la consulta se **recarga automáticamente**, el foco pasa a `aviso-consulta-modificada` (`role="alert"`, tono ámbar): «Otra persona modificó la consulta. Recargamos la consulta con sus cambios; revisa y confirma de nuevo. No se creó ni se actualizó ninguna HDU.» Se conservan las selecciones locales cuando las filas siguen existiendo.
- **Ya confirmada por otra persona** (409 `CONSULTA_NO_ABIERTA`, estado `CONFIRMADA`): se muestra el resultado de esa confirmación con `mensaje-aviso`: «Esta consulta ya se confirmó.»
- **Confirmación simultánea** (409 `INTEGRACION_EN_CURSO`): `aviso-en-curso` «Ya hay una consulta o confirmación en curso.» y se consulta el estado hasta que termine.
- **Reemplazada por otra persona** mientras se edita: la primera edición o recarga recibe `CONSULTA_NO_ABIERTA` (`REEMPLAZADA`): `aviso-consulta-reemplazada` «Esta consulta fue reemplazada por <nombre>.», los controles pasan a solo lectura (sin selectores, sin `boton-confirmar`) y el cambio pendiente no se guarda.

### 7.4 Consulta vencida, asignaciones inválidas y otros

- `aviso-consulta-vencida` (`role="alert"` si ocurre al editar o confirmar; `role="status"` al cargar): «La consulta venció. Consulta Jira de nuevo.» Sin filas. `boton-consultar-jira` sin diálogo.
- `alerta-asignaciones-invalidas` (409, `role="alert"`, foco): «No se creó ninguna HDU: N filas tienen una asignación que dejó de ser válida.» + lista «QTY-1 · ANA3 ya no está disponible» / «QTY-2 · ANA3 ya no pertenece al equipo de QE2», «Esas filas quedaron sin incluir. Corrige la asignación y confirma de nuevo.» Las filas se resaltan con el estado «Incompleta» y el campo afectado `aria-invalid`.
- `ORGANIZACION_NO_DISPONIBLE` al confirmar: «No pudimos guardar las HDU en este momento.» + si se aplicó parte: confirmación incompleta (6.3); si no se aplicó nada, la consulta sigue como estaba y «Confirmar» vuelve a estar disponible.
- 5xx o red al editar: «No fue posible guardar. Intenta nuevamente.» (`mensaje-error-global`, cert.) y el valor revierte; lo escrito no se pierde porque es un selector.

### 7.5 Sin permisos

- **Otros roles**: sin pestaña, sin botones; la ruta muestra `AccesoDenegado` (cert., E5-F05-T26). El Auditor y el QE ven el historial pero **no la consulta abierta**: ninguno de `grupo-*`, `boton-confirmar` ni `consulta-abierta` existe en su DOM.
- **Administrador cuyo rol cambia con la pantalla abierta**: 403 `ACCESO_DENEGADO` al escribir → «Ya no tienes permiso para esta acción» + `GET /v1/me` y redirección del flujo existente (E5 §9.3); el estado local se descarta. 404 `CONSULTA_NO_ENCONTRADA` al Administrador: `BloqueEstado` «No encontramos esa consulta. Puede que ya no exista.» + «Consultar Jira».

---

## 8. Diseño responsivo

Puntos de corte (los del portal): 1280 de referencia, `≥ 900` dos columnas de formularios, `≤ 750` una columna y botones a ancho completo, `≤ 640` tablas apiladas.

| Elemento | 1280 | 375 |
| --- | --- | --- |
| Cabecera de la consulta | Una fila: título, metadatos, 4 tarjetas en fila, botones a la derecha | Metadatos como lista de pares apilados; tarjetas en rejilla de 2 (un solo par por fila si el nombre no cabe); «Descartar consulta» al final, ancho completo |
| Tarjeta-fila (Nuevas) | Línea 3 en rejilla de 4 columnas iguales (`minmax(0,1fr)`) | Selectores en 1 columna, etiqueta encima, alto ≥ 44 px; casillas con área táctil de 44 px; estado y guardado debajo |
| `panel-asignar-grupo` | Rejilla de 4; listas visibles de 6 filas | `<details>` «Asignar a las filas seleccionadas» (cerrado), 1 columna; listas visibles de 4 filas; `boton-aplicar-grupo` a ancho completo |
| Cambiaron / Sin cambios / Con error | `TablaBandeja` | `.tabla--apilable`: tarjetas con `celda-prioritaria` primero (Incluir + Código en Cambiaron; Código + Motivo en las otras) |
| Resumen de confirmación | 4 tarjetas en fila | Rejilla de 2; `boton-confirmar` a ancho completo |
| Diálogos | Ancho 480 px | `max-width: calc(100vw - 2rem)`, botones apilados, principal primero |
| Historial | Ver §11 | Tarjetas como en E5 §7.4 con la fase como primera línea secundaria |

**Reglas anti-desborde (criterio de aceptación a 375 px: `document.documentElement.scrollWidth <= 375`, sin scroll horizontal salvo las pestañas y `.tabla-contenedor`):**
- Todo contenedor de rejilla/flex usa `min-width: 0` en sus hijos; los `select` tienen `max-width: 100%` y `width: 100%`.
- Títulos, códigos, nombres de sprint/persona/célula, valores de «antes → después», nombre del archivo y el host del sitio llevan `overflow-wrap: anywhere` (también `word-break: break-word` de respaldo). Un título de 200 caracteres sin espacios se corta en varias líneas; el trazo `→` no puede ser el único punto de quiebre: «antes» y «después» van en elementos separados, apilados a ≤ 640 px.
- El texto largo de un `option` se recorta con elipsis dentro del `select` (comportamiento nativo); el nombre completo queda en `title` y en el valor leído por lectores.
- Sin anchos fijos en px superiores a 100 %; las tarjetas usan `padding` en `rem` y bordes de 1 px.
- QA verifica con un título de 200 caracteres sin espacios, una descripción de 1.000 y un sprint de 80 caracteres (ver §13, casos de datos).

---

## 9. Accesibilidad (WCAG 2.2 AA)

**Estructura y orden de tabulación.** Un único `h1` de la página; `h2` «Consulta de Jira»; `h3` por grupo. Orden por DOM, sin `tabindex` positivos:
1. Pestañas (enlaces) → botones del panel (`Continuar consulta`, `Consultar Jira`).
2. Resultado de la tanda (enlaces «Ver detalle», «Revisar y asignar»).
3. Cabecera de la consulta: tarjetas-ancla → `Actualizar consulta` → `Ir al resumen` → `Descartar consulta`.
4. Por grupo: botón del disclosure → filtro → (Nuevas) panel de grupo en orden Célula, QE, Analista, Sprint, casilla de incluir, `Aplicar` → casilla de página → `Incluir todas las listas` → filas → paginación.
5. Por tarjeta-fila: `Seleccionar` → Célula → QE → Analista → Sprint → «Reintentar» (si existe) → `Incluir en la confirmación`. El orden visual coincide con el del DOM (no se reordena con CSS salvo `celda-prioritaria` en tarjetas apiladas, y allí el DOM ya está en ese orden).
6. Resumen previo → `Confirmar`.

**Etiquetas y nombres.**
- Cada `select` y casilla tiene `<label>` visible. Como se repiten por fila, el nombre accesible es «Célula de QTY-1» (`aria-label` que **empieza** con el texto visible, WCAG 2.5.3), nunca solo «Célula».
- Las casillas: «Seleccionar QTY-1», «Incluir QTY-1 en la confirmación»; la de página: «Seleccionar las 10 filas de esta página».
- Ayudas y motivos de deshabilitado en `aria-describedby`; los errores de campo con `aria-invalid="true"`.
- Chips y estados son texto con glifo `aria-hidden`; las listas de cambios se leen «Título: antes "A", después "B"».
- Tablas: `caption` visible o `sr-only`, `scope="col"`; tarjetas apiladas conservan los `role` de `TablaBandeja`.

**Anuncios (`aria-live`).** Un solo contenedor `anuncios-consulta` (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`, visualmente oculto) montado una vez, con mensajes cortos y sin repetir: «Guardado» (fusionado: «3 cambios guardados» si hubo varios en 2 s), «Se aplicó a 4 filas. 4 quedaron listas e incluidas.», «Se incluyeron 4 filas. 6 siguen incompletas.», «QTY-3 dejó de estar incluida: falta el analista», «Se seleccionaron 10 filas de esta página», «Se limpió el analista: elige uno del equipo de Marta Díaz». `role="alert"` (asertivo) solo para: `error-consulta`, `alerta-rechazadas`, `alerta-asignaciones-invalidas`, `aviso-consulta-modificada`, `aviso-consulta-vencida` (cuando ocurre al actuar) y `mensaje-error-global`. Nunca `aria-live` por pulsación de tecla.

**Foco.**
- Al entrar a la ruta: `h1` (existente).
- Tras una tanda o confirmación: al contenedor de resultado/error (`tabIndex=-1`).
- «Revisar y asignar» y los enlaces-ancla de grupo: al `h2`/`h3` destino (`tabIndex=-1`).
- Tras aplicar al grupo: al `alerta-rechazadas` si existe; si no, el foco se queda en `boton-aplicar-grupo`.
- Tras abrir un diálogo: al botón seguro («Seguir revisando», «Cancelar»); trampa de foco; Esc cierra; al cerrar vuelve al disparador (si el disparador desapareció, al contenedor de la consulta).
- Al cambiar de página dentro de un grupo: al `h3` del grupo; el listado nuevo se anuncia «Página 2 de 10».
- Tras `CONSULTA_MODIFICADA` o recarga: al aviso; nunca se pierde el foco al re-renderizar (las filas conservan clave estable por código).
- Indicador de foco visible, ≥ 2 px, contraste ≥ 3:1 y **no cubierto** por nada (sin elementos sticky ni fixed; el `scroll-padding-top` del portal cubre el encabezado).

**Objetivos y contraste.** Controles ≥ 44 px (token existente `--q360-objetivo-tactil`; el mínimo AA 2.5.8 es 24 px); espacio de ≥ 8 px entre casillas. Pares de color: los alias de §12.2 (≥ 7:1, por inspección; `q360-qa` confirma con axe: sin serious/critical en la pestaña con consulta abierta, con alertas y con diálogo abierto, en 1280 y 375).

**Otros.** Todo se opera con teclado (sin arrastrar). El estado de una fila nunca depende del color. `prefers-reduced-motion`: sin animación de la barra de espera ni de «Guardado». La consulta es lectura de listas largas: los disclosures y la paginación evitan miles de elementos en el DOM (máx. 25 tarjetas-fila). Textos de Jira siempre como texto (React escapa; sin `dangerouslySetInnerHTML`), incluidos `<b>` y `=`. Idioma `lang="es"`; sin abreviaturas ambiguas.

---

## 10. Textos y mensajes (español de Chile neutro)

### 10.1 Botones y etiquetas

| Elemento | Texto |
| --- | --- |
| Pestaña | «Consultar Jira» |
| Botón principal | «Consultar Jira» → «Consultando…» |
| Continuar | «Continuar consulta» / «Continuar confirmación» (y «Continuando…» mientras corre) |
| Revisar | «Revisar y asignar (N nuevas)» · «Revisar los cambios (N)» |
| Actualizar | «Actualizar consulta» |
| Descartar | «Descartar consulta» (diálogo: título «¿Descartar la consulta?», cuerpo «Se perderán las asignaciones y las filas marcadas. No se creará ni se modificará ninguna HDU.», botones «Descartar consulta» y «Cancelar», foco en «Cancelar») |
| Reemplazar (diálogo) | Título «Ya hay una consulta abierta». Cuerpo: «Ya hay una consulta abierta de Admin Uno del 02-11-2026 10:20 con 3 filas asignadas. Si la reemplazas, se pierden las asignaciones.» Botones «Reemplazar consulta» y «Cancelar» (foco en «Cancelar»). Singular: «con 1 fila asignada»; con 0: «sin filas asignadas». Cancelar no llama a Jira |
| Panel de grupo | Leyenda «Asignar a las filas seleccionadas» · «Aplicar a N filas» · «Aplicando…» · «Quitar selección» |
| Selección | «Seleccionar las N de esta página» · «Seleccionar las N filas del grupo» · «Incluir todas las listas» |
| Fila | «Seleccionar» · «Incluir en la confirmación» |
| Confirmar | «Confirmar (N)» → «Confirmando…» · «Seguir revisando» |
| Opción vacía | «Elige…» (primera, no es un valor) · «Elige un sprint» · «No cambiar» · «Propuesto por Jira (o respaldo)» |
| Chips | «Creada por Jira» (Nueva) · «Creada a mano» · «Sprint de Jira» · «Sprint de respaldo» |

### 10.2 Avisos y errores

| Código / situación | Mensaje |
| --- | --- |
| Sin novedades | «Sin novedades: todas las historias de Jira ya están en Quality360 sin cambios» |
| `INTEGRACION_EN_CURSO` (reemplaza el texto de E5 §10.1) | «Ya hay una consulta o confirmación en curso.» |
| `JIRA_NO_CONFIGURADO` | «Configura la conexión con Jira antes de consultar.» |
| `CONSULTA_ABIERTA` | (diálogo de reemplazo, 10.1) |
| `CONSULTA_NO_ABIERTA` | `CONFIRMADA`: «Esta consulta ya se confirmó.» · `REEMPLAZADA`: «Esta consulta fue reemplazada por <nombre>.» · `DESCARTADA`: «Esta consulta se descartó.» |
| `CONSULTA_VENCIDA` | «La consulta venció. Consulta Jira de nuevo.» |
| `CONSULTA_MODIFICADA` | «Otra persona modificó la consulta. Recargamos la consulta con sus cambios; revisa y confirma de nuevo. No se creó ni se actualizó ninguna HDU.» |
| `CONSULTA_LLENA` / `TOPE_DE_CONSULTA` | «La consulta llegó a 500 filas. Confirma lo que corresponda y consulta de nuevo para traer el resto.» |
| `CONSULTA_NO_ENCONTRADA` | «No encontramos esa consulta. Puede que ya no exista.» |
| `SIN_SELECCION` | «Marca al menos una fila.» |
| `ASIGNACION_INCOMPLETA` | «Falta: célula, QE, analista y sprint» (solo lo que falte, separado por comas y «y») |
| `QE_INVALIDO` | «El QE responsable no es válido.» |
| `ANALISTA_FUERA_DE_EQUIPO` | «<Analista> no pertenece al equipo de <QE>.» |
| `ANALISTA_INVALIDO` | «<Analista> ya no está disponible.» |
| `CATALOGO_INVALIDO` (célula) | «La célula no existe o está inactiva.» · (sprint) «El sprint no pertenece a la célula.» |
| `FILA_NO_MARCABLE` / `FILA_NO_ASIGNABLE` | «Esta fila no se puede incluir.» / «Esta fila no se puede asignar.» (no deberían verse: los controles no existen para esas filas) |
| `ASIGNACIONES_INVALIDAS` | (alerta, §7.4) |
| Sprint de Jira ausente en la célula | «El sprint de Jira no existe en esta célula.» |
| Célula sin Líder | «La célula no tiene Líder activo: nadie la verá como Líder.» |
| Sin analistas | «Este QE no tiene analistas en su equipo.» |
| Cambio de QE | «Se limpió el analista: elige uno del equipo de <QE>.» |
| Cambio de célula | «El sprint se recalculó para la célula elegida.» |
| Fila no guardada | «No se pudo guardar. Reintenta.» |
| Habitual de red al escribir | «No fue posible guardar. Intenta nuevamente.» (cert.) |
| Nota de «Cambiaron» | «Al actualizar pasará a figurar como Jira; su estado, analista y QE no cambian.» |
| Motivos de fila nuevos | «La HDU se creó mientras revisabas la consulta. No se modificó» · «La asignación ya no es válida» |

Los nombres de personas, células y sprints se interpolan como texto. Los mensajes del portal son constantes por código (E5 §1.4); el texto del API solo se usa con códigos desconocidos y recortado a 200 caracteres.

---

## 11. Cambios en pantallas certificadas

| Pantalla | Cambio | Pruebas certificadas afectadas |
| --- | --- | --- |
| **Menú** | Ninguno. El ítem «Integraciones» del Administrador sigue; a `/admin/integraciones` (sin `end`) deja `aria-current` en las cuatro pestañas | — |
| **Pestañas del Administrador** | `Sincronizar` → **`Consultar Jira`**. `data-testid="pestana-sincronizar"` y la ruta no cambian | Las que buscan el texto «Sincronizar» deben usar el testid o el nuevo texto |
| **Conexión** | Panel «Destino de las HDU nuevas» → **«Destino por defecto (archivos y sprint de respaldo)»**. Nota «Las HDU llegan sin analista; tu QE lo asigna después.» → **«Las HDU de Jira se asignan al revisar la consulta. Estos valores se usan al importar archivos.»** La nota del sprint de respaldo se conserva (se usa cuando Jira trae un sprint inexistente en la célula elegida y como valor por defecto). Campos, validaciones y `data-testid` no cambian | E5-F01 que lean los dos textos (D143) |
| **Conexión · descripción de la página** | Sin cambio («…para traer historias de usuario, o impórtalas desde un archivo.») | — |
| **Importar archivo** | Ninguno (conserva `casilla-vincular`; ya no existe la casilla en la otra pestaña, así que el testid queda en una sola ruta) | — |
| **Historial · fase** | Nueva columna **«Fase»** (Consulta · Confirmación · Directa) a la izquierda de «Origen» y filtro `filtro-fase` (Todas · Consulta · Confirmación · Directa; URL `fase`). Para fase **Consulta**: «Creadas/Actualizadas/Omitidas» muestran «—» (no 0) y bajo el Resultado una línea `contadores-consulta`: «10 nuevas · 0 cambiaron · 0 sin cambios». Las ejecuciones previas y de archivo se rotulan «Directa». No se quitan columnas ni testid | E5-F04 (cert.): una columna más |
| **Historial · detalle** | Cabecera con «Fase». *Consulta*: sin tabla de filas; resumen con nuevas / cambiaron / sin cambios / con error + nota «El detalle de una consulta está en Consultar Jira mientras esté abierta» (enlace funcional solo para el Administrador y solo si sigue abierta). *Confirmación*: tabla de siempre más columna **«Asignación»** («CEL-C · QE2 · ANA3 · E5 Sprint 2»). *Directa*: como hoy. El aviso de la última `INCOMPLETA` «Ir a Sincronizar para continuar» → **«Ir a Consultar Jira para continuar»** y solo para fase Consulta/Confirmación (las directas ya no se pueden continuar) | E5-F04, E5-F02 |
| **Historial · solo lectura (QE y Auditor)** | Igual que el Administrador, sin enlaces ni consulta abierta. QE: `nota-integraciones-qe` pasa de «Las HDU nuevas llegan sin analista…» a **«Las HDU que el Administrador crea desde Jira llegan asignadas. Las importadas desde un archivo llegan sin analista: las verás en "Asignar analista".»**; la descripción «…lo que el Administrador sincronizó o importó» → **«…lo que el Administrador consultó, confirmó o importó…»** | E5-F04-T13 |
| **Insignias** | Nuevas: fase (neutra, solo texto) y estado de consulta (`Abierta` `●` azul, `Confirmada` `✓` éxito, `Reemplazada` `⇄` neutro, `Vencida` `◌` neutro, `Descartada` `⊘` neutro) | — |
| **Detalle de HDU (`/hdu/:id`)** | `Origen: Jira` ya existe; sin cambio. Las HDU creadas por confirmación muestran su asignación en los campos de siempre | — |
| **Mensajes** (`lib/mensajesIntegracion`) | Se reemplazan «sincronizar/sincronización» por «consultar/consulta» en `JIRA_NO_CONFIGURADO`, `INTEGRACION_EN_CURSO`; se agregan los códigos de §10.2 | Pruebas que leen esos textos |

---

## 12. Inventario

### 12.1 Componentes

Reutilizados sin cambio: ver encabezado. Con cambios compatibles: `PestanasIntegraciones` (texto), `PaginaSincronizar` (se reescribe como `PaginaConsultarJira`; el archivo se renombra), `ResumenEjecucion` (variante con grupos `nuevas/cambiaron/sin cambios` y `con error`), `ResultadoEjecucion` (titulares y línea de descartadas), `ListasFilasEjecucion` (línea de asignación), `TablaEjecuciones` (columna Fase, línea de consulta), `DetalleEjecucion` (cabecera de fase y columna Asignación), `FormularioConexionJira` (dos textos), `PasosImportacion`/`Importar` (sin cambio), `PanelDescripcionHdu` (sin cambio).

Nuevos:

| Componente | Función |
| --- | --- |
| `PaginaConsultarJira` | Panel de consulta, espera, resultado de la tanda y consulta abierta |
| `PanelConsultar` | Resumen de la conexión, texto fijo, `<details>`, botones |
| `ResultadoConsulta` | Titular, `ResumenEjecucion` de la consulta, `aviso-incompleta`, `mensaje-sin-novedades` |
| `ConsultaAbierta` | Cabecera, tarjetas-ancla, grupos, resumen y estados de §2 |
| `CabeceraConsulta` | Autoría, vencimiento, contadores, actualizar, descartar |
| `GrupoConsulta` | Disclosure + filtro + paginación + carga por servidor |
| `PanelAsignarGrupo` | Fieldset con los 4 selectores, opción de incluir y aplicar |
| `TarjetaFilaNueva` | Tarjeta-fila editable (selector ×4, chips, estado, guardado) |
| `SelectorAsignacion` | Selector con etiqueta visible + nombre accesible por fila, opción vacía, listas visibles en panel |
| `EstadoFilaAsignacion` | Texto + glifo + `data-completa` |
| `TablaCambios` | `TablaBandeja` de «Cambiaron» con casilla |
| `TablaSoloLectura` | «Sin cambios» y «Con error» |
| `AlertaRechazadas`, `AlertaAsignacionesInvalidas`, `AvisoConsulta` | Alertas de §7 |
| `ResumenConfirmacion` | Tarjetas, texto fijo, combinaciones, botón |
| `DialogoConfirmarConsulta`, `DialogoReemplazar`, `DialogoDescartar` | Sobre `DialogoConfirmacion` |
| `ResultadoConfirmacion` | Resultado, descartadas, continuar |
| `AnunciosConsulta` | Región `aria-live` única |
| `InsigniaEstadoConsulta`, `InsigniaFase`, `ChipGrupo`, `ChipOrigenSprint` | Glifo + texto + tono |
| `lib/mensajesConsulta` | Tablas de §10 |

### 12.2 Tokens (solo alias)

```
/* E5 consulta · grupos y estado de la consulta (alias de los pares ya calculados en E4 y E5) */
--q360-color-grupo-nuevas:       var(--q360-color-res-exitosa);     --q360-color-grupo-nuevas-suave:       var(--q360-color-res-exitosa-suave);
--q360-color-grupo-cambiaron:    var(--q360-color-res-incompleta);  --q360-color-grupo-cambiaron-suave:    var(--q360-color-res-incompleta-suave);
--q360-color-grupo-sin-cambios:  var(--q360-color-res-neutra);      --q360-color-grupo-sin-cambios-suave:  var(--q360-color-res-neutra-suave);
--q360-color-grupo-con-error:    var(--q360-color-res-fallida);     --q360-color-grupo-con-error-suave:    var(--q360-color-res-fallida-suave);
--q360-color-fila-incompleta:    var(--q360-color-res-con-errores); /* ámbar */
--q360-color-fila-lista:         var(--q360-color-res-exitosa);
```

### 12.3 Clases CSS nuevas (`integraciones.css`)

`.consulta-abierta` (+ `__cabecera`, `__tarjetas`), `.grupo-consulta` (+ `--nuevas|cambiaron|sin-cambios|con-error`), `.panel-asignar-grupo` (rejilla 4 → 2 → 1; `select[size]` con alto de lista), `.fila-asignacion` (tarjeta con rejilla `minmax(0,1fr)`, `overflow-wrap:anywhere`), `.fila-asignacion__selectores`, `.fila-asignacion--incompleta|lista|marcada`, `.estado-fila`, `.chip-grupo`, `.guardado-fila`, `.alerta-rechazadas`, `.resumen-confirmacion`, `.tabla-cambios`, `.texto-largo` (`overflow-wrap:anywhere; word-break:break-word`), `.contadores-consulta`. Ninguna usa `position: sticky/fixed`.

---

## 13. `data-testid` propuestos

Se conservan todos los certificados y los del backlog (E5-F02/F05, sección 9). Convención: `contador-<clave>`, `estado-vacio|error|indisponible-<clave>`.

| Zona | Identificadores |
| --- | --- |
| Pestañas | `pestana-sincronizar` (cert., ahora «Consultar Jira»), `pestana-conexion`, `pestana-importar`, `pestana-historial` |
| Panel de consulta | `boton-consultar-jira`, `boton-continuar-consulta`, `resumen-ultima-sync`, `estado-vacio-jira`, `estado-vacio-consulta`, `estado-consultando`, `aviso-en-curso`, `aviso-limite-tasa`, `aviso-incompleta`, `resultado-consulta`, `resultado-ejecucion` (`data-resultado`), `resumen-ejecucion`, `res-leidas`, `res-nuevas`, `res-cambiaron`, `res-sin-cambios`, `res-con-error`, `res-advertencias`, `mensaje-sin-novedades`, `enlace-revisar-consulta`, `enlace-ver-detalle-ejecucion`, `error-consulta` (`data-codigo`), `boton-reintentar-consulta`, `enlace-importar-archivo`, `enlace-ir-conexion` |
| Diálogos | `dialogo-reemplazar`, `boton-reemplazar-consulta`, `dialogo-confirmar-consulta`, `boton-confirmar-dialogo`, `boton-seguir-revisando`, `dialogo-descartar`, `boton-descartar-confirmar`, `boton-cancelar-dialogo` |
| Consulta abierta | `consulta-abierta` (`data-estado`, `data-version`), `consulta-creada-por`, `consulta-vence`, `contador-nuevas`, `contador-cambiaron`, `contador-sin-cambios`, `contador-con-error`, `contador-asignadas`, `contador-incluidas`, `boton-actualizar-consulta`, `enlace-ir-resumen`, `boton-descartar-consulta`, `anuncios-consulta` |
| Avisos de estado | `aviso-consulta-vencida`, `aviso-consulta-reemplazada`, `aviso-consulta-modificada`, `aviso-consulta-confirmada`, `alerta-asignaciones-invalidas`, `alerta-rechazadas`, `estado-error-consulta`, `estado-indisponible-consulta` |
| Grupos | `grupo-nuevas`, `grupo-cambiaron`, `grupo-sin-cambios`, `grupo-con-error`, `boton-grupo-<nuevas\|cambiaron\|sin-cambios\|con-error>`, `filtro-texto-<grupo>`, `paginacion-<grupo>` |
| Panel de grupo | `panel-asignar-grupo`, `grupo-selector-celula`, `grupo-selector-qe`, `grupo-selector-analista`, `grupo-selector-sprint`, `casilla-incluir-al-aplicar`, `boton-aplicar-grupo`, `boton-quitar-seleccion`, `casilla-seleccionar-grupo`, `boton-seleccionar-todo-el-grupo`, `boton-marcar-todas`, `conteo-seleccion` |
| Fila nueva | `fila-<codigo>` (`data-completa`, `data-marcada`), `casilla-seleccionar`, `casilla-marcar`, `selector-celula`, `selector-qe`, `selector-analista`, `selector-sprint`, `chip-sprint-origen`, `chip-sprint-respaldo`, `aviso-sprint-no-encontrado`, `aviso-sin-lider`, `ayuda-sin-analistas`, `estado-fila`, `guardado-fila-<codigo>`, `error-<campo>-<codigo>`, `boton-reintentar-fila-<codigo>`, `boton-ver-descripcion-<codigo>` |
| Fila de cambios | `fila-<codigo>`, `casilla-marcar`, `celda-cambios`, `chip-creada-a-mano`, `casilla-marcar-grupo` (incluye las de la página), `nota-creada-a-mano` |
| Confirmación | `resumen-confirmacion-consulta`, `contador-a-crear`, `contador-a-actualizar`, `contador-sin-incluir-nuevas`, `contador-sin-incluir-cambios`, `texto-confirmacion`, `lista-combinaciones`, `ayuda-confirmar`, `boton-confirmar`, `estado-confirmando`, `resultado-confirmacion` (`data-resultado`), `res-creadas`, `res-actualizadas`, `res-omitidas`, `texto-descartadas`, `boton-continuar-confirmacion`, `lista-hdu-creadas`, `lista-hdu-actualizadas`, `lista-hdu-omitidas`, `lista-filas-con-error` |
| Historial | `filtro-fase`, `celda-fase-<id>`, `contadores-consulta-<id>`, `celda-asignacion-<n>`, `fase-ejecucion` (detalle) |

Repeticiones a acotar con `within(...)`: `res-*` (resultado de la tanda, de la confirmación y del detalle de Historial son bloques distintos; los de la cabecera se llaman `contador-*` para evitar choques), `casilla-marcar` y `selector-*` (una por fila: usar `within(fila-<codigo>)`), `fila-<codigo>` (una por consulta: el código es único), `selector-*` frente a `grupo-selector-*` (panel).

Casos de datos de diseño para QA (a agregar a la fixture): título de 200 caracteres sin espacios, descripción de 1.000, sprint de Jira de 80 caracteres sin espacios, nombre de célula de 60 caracteres.

---

## 14. Conflictos y brechas con el backlog E5 (para el analista y `q360-frontend`)

1. **Seleccionar vs. incluir (marcar).** El backlog usa una sola casilla `casilla-marcar` para (a) elegir las filas a las que actúa el panel de grupo (T06, T07, T24: «Marca QTY-1 a QTY-4; aplica…») y (b) incluir la fila en la confirmación, que el servidor rechaza si la fila está incompleta (D139, T14). Con una sola casilla el flujo T06 es imposible: no se puede marcar una fila sin asignar. Este diseño separa `casilla-seleccionar` (portal) de `casilla-marcar` (servidor) y agrega la opción «Incluir en la confirmación las filas que queden listas» en el panel. **Requiere ajustar T06, T07, T24 (pasos «Selecciona» en lugar de «Marca»)** y renombrar `casilla-marcar-grupo` (Nuevas) a `casilla-seleccionar-grupo`. Alternativa que no cambia el contrato: marcar filas incompletas y que el servidor las acepte como «marcadas incompletas» (cambiaría D139).
2. **«Seleccionar las N filas del grupo» y filtro de texto.** D139 solo admite `{grupo, todas:true}` (todo el grupo); con filtro activo no hay una selección «las que coinciden». El diseño desactiva el botón con filtro y lo explica. Si se quiere, el contrato necesitaría un `filtro` en el alcance.
3. **Analistas del equipo de un QE.** No hay catálogo directo (el catálogo de personas filtra por rol, no por equipo). Se necesita una lectura barata por QE (p. ej. `GET /v1/catalogos/personas?rol=ANALISTA_QA&equipoDeQe=<id>` o los analistas dentro de la consulta). Sin ella, el portal haría una petición por cambio de QE.
4. **Recarga de la consulta compartida.** D134 la declara compartida, pero no define cómo se entera un Administrador de que otro la cambió antes de confirmar. El diseño recarga al volver a la pestaña, con `boton-actualizar-consulta` y automáticamente tras `CONSULTA_MODIFICADA`; no hay sondeo ni sockets. Si se quiere aviso temprano, bastaría un `GET` ligero con solo `version`.
5. **Contadores acumulados.** El resumen de la tanda muestra el acumulado de la consulta (T07 espera 100, 200, 230); el contador propio de la tanda sale en la ejecución del Historial. Confirmar con el analista que `res-*` es el acumulado.
6. **Etiqueta de «Marcada».** El backlog dice «Lista» o «Marcada» (sección 9). El diseño usa «Marcada» = Lista + incluida. Si el equipo prefiere «Incluida», cambia una constante.
7. **Fase «Directa» y continuaciones antiguas.** Con la ruta de sincronización retirada, una ejecución directa `INCOMPLETA` ya no se puede continuar; el detalle del Historial deja de ofrecer «Ir a Sincronizar para continuar» y lo reemplaza como en §11. La integración con el texto de E5-F04 (cert.) lo confirma `q360-qa`.
8. **Concordancia y plurales.** Los textos de §6 y §10 exigen singular/plural; la tabla `lib/mensajesConsulta` debe construirlos con una función, no con cadenas fijas.
9. **Pestaña «Consultar Jira» en `PanelUltimaEjecucion`.** «Última completada» incluye ahora consultas y confirmaciones: una consulta `EXITOSA` cuenta como completada. Revisar que esa tarjeta no se confunda con una confirmación (muestra la fase en su primera línea).
