# Diseño E4 · Impedimentos y riesgos

Fecha: 2026-10-26. Insumos: `docs/backlog/e4-impedimentos-y-riesgos.md` (E4-F01..F04, E4-B01..B04, D57–D74, matriz 3.6, sección 6) y el sistema visual ya construido en E7 (`docs/diseno/e7-bandejas-por-rol.md`, `apps/web/src/styles/tokens.css`, `bandejas.css`, `global.css`, `components/bandeja/*`, `BloqueEstado`, `TarjetaMetrica`, `DialogoConfirmacion`, `AvisoSoloLectura`, `TablaBandeja`, `BarraFiltros`, `HduDetailPage`). Este documento define **cómo se ve y se comporta** E4; no contiene código. Dueño de construcción: `q360-frontend`.

Notación: «cert.» = elemento certificado en E7/E1/E2/E3, **no se modifica** (texto, `data-testid`, ruta). Todo lo que no se menciona aquí se resuelve con lo existente.

Decisiones del usuario que gobiernan el diseño: un impedimento abierto o escalado **bloquea el cierre** de la HDU; **solo el QE responsable gestiona** (resolver, escalar, reabrir, seguimiento, fijar riesgo); **registran** el analista asignado y el QE responsable; Administrador, Líder QA, Auditor (y el QE supervisor que no es responsable) **solo leen**; el **Analista no ve el riesgo**.

---

## 1. Principios de E4 sobre lo ya existente

1. **Aditivo.** Nada de lo certificado cambia de texto, testid ni orden. Las secciones nuevas del detalle van **después del checklist y antes de «Cambiar estado»** (así el bloqueo se lee antes de intentar cerrar); los bloques nuevos de bandeja van **debajo** de los certificados (sección 6 del backlog, D71).
2. **El bloqueo es información, no estado.** Se muestra como insignia/aviso «Bloqueada» (D59). Nunca aparece en el selector de estado ni en `InsigniaEstadoHdu`.
3. **Solo lectura se ve, no se insinúa (D39).** Quien no puede gestionar no ve botones (no existen). Como el Administrador sí ve controles en otras partes del detalle, la sección lleva una nota de texto que explica quién gestiona (`nota-impedimentos-solo-lectura`).
4. **Un dato caído nunca es 0 ni «Bajo» (D34, D68).** Impedimentos y riesgo tienen estado propio; si fallan, el resto de la pantalla sigue.
5. **Texto + glifo + color.** Estado de impedimento y nivel de riesgo siempre llevan palabra y forma distinta (sección 3.2). Rojo se reserva para **riesgo Alto y bloqueo**.
6. **Estado en la URL** en las dos pantallas nuevas del QE (filtros, orden, página), igual que E7.
7. **Todo botón `type="button"`**; ningún `<form>` con envío en pantallas del Auditor (E7-F06-T07).

---

## 2. Patrón de impedimento

### 2.1 Vocabulario visual

| Elemento | Presentación |
| --- | --- |
| Estado Abierto | Insignia ámbar `○ Abierto` |
| Estado Escalado | Insignia azul `⇧ Escalado` (alguien más lo tiene en sus manos) |
| Estado Resuelto | Insignia verde `✓ Resuelto` |
| Tipo | Texto plano de la etiqueta del catálogo 3.1 («Ambiente de pruebas»); en tablas, columna propia; sin color |
| Días abiertos | `6 d` visible (`aria-hidden`) + `sr-only` «6 días abiertos». Resuelto: «Resuelto en 3 d» |
| Bloqueo de la HDU | Insignia sólida roja `⊘ Bloqueada` (+ « · N» con el número de abiertos en tablas); aviso de franja en el detalle |
| Nuevo (< 24 h, D72) | Insignia azul `Nuevo` (`insignia-nuevo`), con `sr-only` «registrado hace menos de 24 horas» |
| Responsable | «Nombre» + si es tercero «(externo)» en texto secundario |
| Solo lectura en fila | Texto «Solo lectura» (`texto-solo-lectura`) junto a «Abrir» |

### 2.2 Tarjeta de impedimento (en el detalle de HDU)

Cada impedimento es un `<li>` con `<article>` (no una tabla): lleva descripción, acciones e historial desplegable. Borde izquierdo de 4 px por estado (ámbar/azul/verde) **más** la insignia.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Faltan cuentas de prueba con saldo                       [○ Abierto]  [Nuevo]              6 d       │  h3 + insignias
│ Datos de prueba                                                                                       │  tipo (texto secundario)
│ Faltan cuentas de prueba con saldo suficiente para ejecutar los entregables 4 al 6 del checklist.     │  descripción (pre-wrap)
│ Responsable  Pablo Núñez (QE)      Registrado por  Ana Pérez · Analista QA      Abierto desde  15-10-2026 09:12 │  dl en 3 columnas
│                                                                                                       │
│ [Resolver] [Escalar] [Agregar seguimiento]                         [▸ Ver historial (1)]              │  solo QE responsable | historial para todos
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Reglas:
- Orden de la lista: abiertos y escalados primero (más antiguos arriba, D74), después resueltos (más reciente arriba). **Todos visibles** (no se pliegan los resueltos); si hay más de 10, se muestran 10 y «Mostrar más» (`boton-ver-mas-impedimentos`).
- Acciones por estado (backlog F03): Abierto → Resolver · Escalar · Agregar seguimiento. Escalado → Resolver · Escalar a otro · Agregar seguimiento. Resuelto → Reabrir. HDU cerrada o sin relación de gestión → ninguna.
- Un resuelto se atenúa solo en el borde y la insignia; el texto mantiene contraste pleno.
- «Ver historial» es un botón disclosure (`aria-expanded`, `aria-controls`); carga al abrir (cargando / vacío imposible porque siempre hay REGISTRAR / error con «Reintentar»). Reutiliza `.historial-lista` / `.historial-item`.

Entrada de historial (cronológico, más antiguo primero):

```
 15-10-2026 09:12   REGISTRAR   Ana Pérez · Analista QA            —  →  Abierto      «Registro del impedimento»
 20-10-2026 11:40   ESCALAR     Pablo Núñez · QE                   Abierto → Escalado  Responsable: Pablo Núñez → Luis Soto
                                                                                       «Requiere gestión con TI»
```

Etiquetas legibles de acción: Registró, Escaló, Resolvió, Reabrió, Agregó seguimiento. La fecha usa `<time>` en hora de Chile (`lib/formato.ts`). El texto de la acción REGISTRAR se muestra como «Registró el impedimento».

### 2.3 Registro (E4-F01)

Quién: Analista asignado y QE responsable, HDU no cerrada. El botón `boton-registrar-impedimento` va en la cabecera de la sección. El formulario es **inline** (no diálogo): tiene cuatro campos y un contador, y en 375 px un panel en flujo es más cómodo que un modal. Al abrir, el foco pasa al campo Tipo; el botón de la cabecera queda `aria-expanded="true"`.

```
┌ Registrar impedimento ────────────────────────────────────────────────────────  data-testid="form-impedimento" ┐
│ Tipo *                                    Título *                                                            │
│ [Seleccione un tipo                 ▾]    [_____________________________________________]   0/200          │
│ Descripción *                                                                                                  │
│ [                                                                                              ]  0/1000      │
│ Qué te impide avanzar y desde cuándo (mínimo 10 caracteres; 20 si el tipo es «Otro»).                          │
│ Responsable de resolverlo *                                                                                    │
│ [Pablo Núñez (QE responsable)       ▾]      ← con «Otro (nombre)…» que revela el campo de texto               │
│ La persona elegida no obtiene permisos en Quality360; sirve para saber a quién se le pidió.                    │
│                                                      [Cancelar]   [Guardar impedimento]                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Etiquetas con asterisco **y** texto «obligatorio» en `sr-only`. `campo-ayuda` para las ayudas, ligadas con `aria-describedby`.
- Tipo: `select` con el catálogo 3.1 (9 códigos, etiquetas). Responsable: `select` con candidatos `REGISTRO` (QE responsable preseleccionado) + «Otro (nombre)…»; al elegir «Otro» aparece `input` (3 a 150) justo debajo y recibe el foco.
- Contadores `n/200`, `n/1000`: texto visible, `maxlength` en los campos, **no** `aria-live` por pulsación. Al llegar al límite se agrega un mensaje `sr-only` en `role="status"`. Para tipo «Otro» el mínimo de la descripción cambia a 20 y la ayuda lo dice.
- Validación al pulsar «Guardar impedimento» (no antes): un `campo-error` por campo («Selecciona un tipo», «El título debe tener entre 5 y 200 caracteres», «La descripción es obligatoria», «La descripción debe tener al menos 10 caracteres», «Indica quién debe resolverlo», «El nombre del responsable debe tener entre 3 y 150 caracteres»), `aria-invalid="true"`, `aria-describedby`, y el foco al primer campo inválido. El formulario **permanece abierto con lo ya escrito** y no se envía nada.
- Guardando: botón «Guardando…» deshabilitado (texto ya usado en E7). Éxito: el formulario se cierra, `mensaje-exito` (`role="status"`): «Impedimento registrado. La HDU quedó bloqueada.», aparece `hdu-bloqueada`, y el foco va al `h3` del impedimento nuevo (`tabIndex=-1`). Error de servidor: `mensaje-error-global` dentro del formulario (tabla 8.2) sin cerrarlo.
- Cancelar con campos escritos: no pide confirmación (se pierde poco); Esc cierra con la misma regla.

### 2.4 Seguimiento, resolver, escalar, reabrir (E4-F03)

Todos usan `DialogoConfirmacion` (ya accesible: `useId`, Esc, foco atrapado y devuelto) con el campo de texto obligatorio. El botón «Confirmar» **no se deshabilita por vacío**: la validación ocurre al pulsarlo (E4-F03-T02 espera el mensaje «Indica la acción tomada»); solo se deshabilita mientras guarda.

| Diálogo (`testId`) | Título | Campos | Texto del botón | Validación |
| --- | --- | --- | --- | --- |
| `dialogo-resolver` | Resolver impedimento | Resumen del impedimento (título, tipo) · Comentario `campo-comentario-impedimento` (3–500) | Confirmar resolución | «Indica la acción tomada» |
| `dialogo-escalar` | Escalar impedimento | Destino `campo-destino-escalamiento` (candidatos `ESCALAMIENTO` + «Otro (nombre)…») · Nombre si «Otro» `campo-destino-otro` · Comentario | Confirmar escalamiento | «Elige a quién escalarlo» · «Indica por qué lo escalas» |
| `dialogo-reabrir` | Reabrir impedimento | Motivo `campo-motivo-reabrir` (3–500) · aviso «La HDU volverá a quedar bloqueada» | Confirmar reapertura | «Indica el motivo» |
| `dialogo-seguimiento` | Agregar seguimiento | Comentario (3–500). Aviso «El estado no cambia» | Guardar seguimiento | «Escribe el seguimiento» |

```
┌ Escalar impedimento ──────────────────────────────────────┐
│ API de Pagos sin sandbox · Dependencia de otro equipo     │
│ Escalar a *                                               │
│ [Luis Soto · Líder QA                              ▾]     │  ← LID1, ADM1, «Otro (nombre)…»
│ Quien recibe el escalamiento lo verá en su bandeja,       │
│ pero no podrá resolverlo: lo sigue gestionando el QE.     │
│ Comentario *                                              │
│ [                                                      ]  │  0/500
│ [mensaje de error del servidor, role=alert]               │
│                          [Cancelar]  [Confirmar escalamiento] │
└───────────────────────────────────────────────────────────┘
```

- El texto aclaratorio de «Escalar» responde a D64 (Líder/Administrador solo leen) para que nadie espere que el destino actúe.
- «Escalar a otro» (ya escalado) excluye al destino vigente de la lista y lo dice en el título («Escalar a otro destino»). Si la lista de candidatos falla: `BloqueEstado error` dentro del diálogo con «Reintentar» y el botón de confirmar deshabilitado; si solo existe «Otro», el selector queda con esa única opción visible y el campo de nombre abierto.
- Post-éxito: cierra, `mensaje-exito` («Impedimento resuelto. La HDU ya no está bloqueada.» solo si era el último; si no, «Impedimento resuelto. La HDU sigue bloqueada por otros N.»), la tarjeta se actualiza (cambian insignia y botones) y el foco va al `h3` del impedimento porque el botón pulsado puede haber desaparecido.
- Cambió el estado mientras el diálogo estaba abierto (409 `TRANSICION_INVALIDA`): el diálogo se cierra, `mensaje-aviso` «El impedimento ya cambió de estado. Se actualizó la lista» y recarga. 403 → «Ya no tienes permiso para esta acción» (sección 8 del backlog) y recarga de la sección (el botón desaparece).
- Reabrir reinicia los días a 0 (`abierto_desde`): la tarjeta lo muestra con «Abierto desde» actualizado y «Registrado el» (fecha original) para no perder el origen. Por eso la grilla de metadatos incluye ambas fechas cuando difieren.

---

## 3. Semáforo de riesgo

### 3.1 Niveles y tokens

| Nivel (`data-nivel`) | Texto | Glifo (forma) | Texto / fondo | Contraste |
| --- | --- | --- | --- | --- |
| `ALTO` | Alto | `▲` triángulo | `#991b1b` / `#fde8e8` | ≈ 7,0:1 |
| `MEDIO` | Medio | `◆` rombo | `#6b4400` / `#fff0b8` | ≈ 7,5:1 |
| `BAJO` | Bajo | `●` círculo | `#0f5132` / `#e5f6ec` | ≈ 8,4:1 |
| `SIN_EVALUAR` | Sin evaluar | `○` círculo vacío | `#5b5f66` / `#eceef1` | ≈ 5,8:1 (par existente) |
| (fuente caída) | No disponible | `⛔` (aria-hidden, como `BloqueEstado`) | `#5b5f66` / `#eceef1` | ≈ 5,8:1 |

Valores calculados por inspección; `q360-qa` los confirma con axe (misma salvedad de E7 1.7).

### 3.2 Componente `SemaforoRiesgo` (tres variantes, un solo testid)

`data-testid="semaforo-riesgo"` con `data-nivel`, y `data-origen="MANUAL|SUGERIDO"` cuando aplica.

1. **Píldora** (tablas, bandejas): `▲ Alto`. Es un `span` con texto visible; el glifo es `aria-hidden`. Sin `role="img"` ni `aria-label` duplicado.
2. **Lámparas** (panel del detalle): tres círculos verticales u horizontales (rojo, amarillo, verde), solo la lámpara del nivel está **encendida** (relleno de color); las otras están vacías. Todas con borde de 2 px `--q360-color-texto-terciario` (el borde da el contraste de componente ≥ 3:1 porque el amarillo solo no lo alcanza). A su derecha, el texto del nivel en 20 px bold con el glifo. Las lámparas son `aria-hidden`; el significado lo da el texto. Posición (arriba/medio/abajo) más forma más palabra: no depende del color.
3. **Sin evaluar / No disponible:** las tres lámparas vacías y el texto.

Nunca se muestra un nivel sin su palabra. En listados ordenados por riesgo, el orden es Alto, Medio, Bajo, Sin evaluar.

### 3.3 Explicación de factores (E4-F04#2)

Cada factor del backlog 3.4 se traduce a una frase con su valor real. **Los umbrales y valores los entrega el servidor en `factores[].detalle`** (D67 los hace configurables; el portal no los hardcodea).

| Código | Frase | Chip |
| --- | --- | --- |
| `IMPEDIMENTO_ABIERTO` | «Hay N impedimento(s) abierto(s) o escalado(s)» | Medio |
| `IMPEDIMENTO_ANTIGUO` | «Un impedimento lleva N días abierto (desde 5 días se considera alto)» | Alto |
| `IMPEDIMENTO_ESCALADO` | «Hay un impedimento escalado» | Alto |
| `SPRINT_VENCIDO` | «El sprint terminó el dd-mm-aaaa y la HDU no está cerrada» | Alto |
| `ATRASO_SPRINT_ALTO` | «Faltan N días para el fin del sprint y el avance es X % (menos de 70 %)» | Alto |
| `ATRASO_SPRINT_MEDIO` | «Faltan N días para el fin del sprint y el avance es X % (menos de 50 %)» | Medio |
| (sin factores) | «Sin factores de riesgo: no hay impedimentos abiertos ni atraso en el sprint» | Bajo |
| factor `indisponible` | «Atraso del sprint: no disponible (no pudimos consultar el avance)» | texto «No disponible» |

Cada ítem es `<li data-testid="factor-<CODIGO>">` con el chip de nivel (texto «Alto»/«Medio»). Regla de lectura: «El nivel sugerido es el más alto de estos factores». Esa línea se muestra siempre sobre la lista.

---

## 4. Detalle de HDU: aviso, sección de impedimentos y panel de riesgo

### 4.1 Orden en `/hdu/:id` (lo certificado no se mueve)

```
 ← Volver a mi bandeja (cert.)
 [aviso-solo-lectura]  (cert., Líder/Auditor)
 [hdu-bloqueada]       ← NUEVO: aviso de franja, solo si la HDU está bloqueada
 encabezado (cert.)        resumen (cert.)        #asignacion (cert.)
 #certificado: ChecklistEntregables (cert.)
 #impedimentos: seccion-impedimentos        ← NUEVO
 #riesgo: panel-riesgo (oculto para el Analista) ← NUEVO
 #estado: Cambiar estado (cert.) + error de cierre bloqueado ← NUEVO mensaje
 Historial (cert.)
```

Se evita agregar una tarjeta al panel de resumen certificado y se evita mezclar eventos en el «Historial» certificado: el historial de gestión vive dentro de cada sección.

### 4.2 Aviso «HDU bloqueada» (`hdu-bloqueada`)

Barra sobre el encabezado, `role="status"`, fondo `--q360-color-error-suave`, borde izquierdo 5 px rojo, glifo `⊘` y texto en negrita: **«HDU bloqueada: 2 impedimentos abiertos. No se podrá cerrar hasta resolverlos.»** + enlace «Ver impedimentos» (`#impedimentos`). Para el Analista: «HDU bloqueada: 1 impedimento abierto. Tu QE responsable lo gestiona.» (sin la mención de cierre si el rol no puede cerrar). Solo aparece con impedimentos reales cargados: si la sección está `indisponible` no hay aviso (no se afirma ni se niega el bloqueo) y la sección lo dice.

### 4.3 Sección «Impedimentos» (`seccion-impedimentos`)

`<section aria-labelledby>` dentro de `.panel` con `id="impedimentos"`. Cabecera `.panel-cabecera`: `h2` «Impedimentos», resumen «2 abiertos · 1 resuelto» (`resumen-impedimentos`) y, a la derecha, `boton-registrar-impedimento` solo para Analista asignado o QE responsable con HDU no cerrada.

Wireframe 1280:

```
 ┌ Impedimentos ──────────────────────────────────────────── 1 abierto · 1 escalado · 1 resuelto ─ [+ Registrar impedimento] ┐
 │ (form-impedimento, si está abierto)                                                                                         │
 │ ┌ ○ Faltan cuentas de prueba con saldo ────────────────── [○ Abierto] [Nuevo] ─────────────────────────────  6 d ┐       │
 │ │ Datos de prueba · descripción…                                                                                  │       │
 │ │ Responsable … · Registrado por … · Abierto desde …                                                              │       │
 │ │ [Resolver] [Escalar] [Agregar seguimiento]                                         [▸ Ver historial (1)]         │       │
 │ └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘       │
 │ ┌ API de Pagos sin sandbox ─────────────────────────────────────────────── [⇧ Escalado] ──────────────────────  3 d ┐      │
 │ │ …                                                                                                                │      │
 │ └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘      │
 │ ┌ Criterio de aceptación ambiguo ───────────────────────────────────────── [✓ Resuelto] ─────────  Resuelto en 3 d ┐      │
 │ └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘      │
 │ nota-impedimentos-solo-lectura: (solo para quien no gestiona)                                                              │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Wireframe 375:

```
┌────────────────────────────┐
│ Impedimentos               │
│ 1 abierto · 1 resuelto     │
│ [+ Registrar impedimento]  │  ← 44 px, ancho completo
│ ┌────────────────────────┐ │
│ │ ○ Abierto   Nuevo  6 d │ │
│ │ Faltan cuentas de      │ │
│ │ prueba con saldo       │ │
│ │ Datos de prueba        │ │
│ │ Descripción…           │ │
│ │ Responsable  P. Núñez  │ │  ← dl apilado etiqueta/valor
│ │ Registró     A. Pérez  │ │
│ │ Desde  15-10 09:12     │ │
│ │ [Resolver]             │ │  ← botones apilados, 44 px
│ │ [Escalar]              │ │
│ │ [Agregar seguimiento]  │ │
│ │ [▸ Ver historial (1)]  │ │
│ └────────────────────────┘ │
└────────────────────────────┘
```

Texto de la nota de solo lectura (`nota-impedimentos-solo-lectura`, `role="note"`, mismo estilo de `AvisoSoloLectura` pero más discreto, sin botones):

| Quién | Texto |
| --- | --- |
| Analista asignado | «Tu QE responsable gestiona los impedimentos (resolver, escalar y reabrir). Tú puedes registrar nuevos.» |
| QE supervisor no responsable | «Solo el QE responsable de la HDU gestiona los impedimentos. Tienes acceso de lectura.» |
| Administrador | «Solo el QE responsable gestiona los impedimentos. Si falta un QE, reasígnalo desde esta pantalla.» (el texto enlaza a `#asignacion`) |
| Líder QA, Auditor | Ya los cubre `aviso-solo-lectura` de la página: no se agrega nota para no duplicar el mensaje |
| HDU cerrada (cualquiera) | «HDU cerrada: no admite nuevos impedimentos.» (`nota-impedimentos-cerrada`) y se conserva el historial |

Estados de la sección (cada uno con testid de convención `estado-*-impedimentos-hdu`):

| Estado | Presentación |
| --- | --- |
| Cargando | `BloqueEstado cargando` + 2 filas de esqueleto; `aria-busy` |
| Vacío | «Esta HDU no tiene impedimentos registrados» (neutro, sin botón de acción adicional) |
| Error | `BloqueEstado error` + «Reintentar»; el botón de registro **no** se muestra |
| Indisponible | `BloqueEstado indisponible` «No disponible» + «Reintentar»; sin aviso de bloqueo ni botón de registro; el resto del detalle carga (E4-F01-T09) |

La lista se identifica como `lista-impedimentos-hdu` (`<ul>`), cada ítem `impedimento-<id>`.

### 4.4 Panel «Riesgo» (`panel-riesgo`) (no existe para el Analista)

Para el Analista el componente **no se renderiza**: sin placeholder, sin texto, sin llamada al servicio (se evita el 403). Para QE responsable: botones. Para QE supervisor, Líder, Administrador, Auditor: mismo panel sin botones.

```
 ┌ Riesgo ─────────────────────────────────────────────────────────── [Usar el sugerido] [Fijar riesgo] ┐
 │  Nivel vigente                                   Sugerencia del sistema                               │
 │  ┌ lámparas ┐  ▲ Alto                           Nivel sugerido: ▲ Alto   (riesgo-sugerido)           │
 │  │ ● rojo   │  Origen: Fijado por Pablo Núñez   El nivel sugerido es el más alto de estos factores: │
 │  │ ○ amar.  │  el 24-10-2026 16:05              · Hay 1 impedimento abierto           [Medio]       │
 │  │ ○ verde  │  «El cliente exige la entrega»    · Un impedimento lleva 6 días abierto [Alto]        │
 │  └──────────┘                                   · Faltan 2 días y el avance es 30 %   [Alto]        │
 │  ▲ La sugerencia actual es Medio, distinta del nivel fijado.   (aviso-sugerencia-distinta)           │
 │  ▸ Historial de cambios de nivel (2)                                                                  │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Origen en texto: «Sugerido por el sistema» o «Fijado por {nombre} el {fecha}» + justificación entre comillas (`riesgo-justificacion`).
- `aviso-sugerencia-distinta` (`mensaje-aviso`, `role="status"`): solo si hay nivel fijado y la sugerencia es otra (D66): «La sugerencia actual es {Alto}». Con glifo `ⓘ`.
- Botones: «Fijar riesgo» (`boton-fijar-riesgo`) siempre para el QE responsable con HDU no cerrada; «Usar el sugerido» (`boton-usar-sugerido`) solo si existe sugerencia (precarga el nivel; la justificación sigue siendo obligatoria).
- Historial de cambios de nivel (`historial-riesgo`): `<details>`; cada fila «{fecha} · {actor} cambió el riesgo de {Medio} a {Alto} (sugerido entonces: {Alto}) — «{justificación}»». Se alimenta de `gestion-impedimentos` filtrado por tipo `RIESGO`.
- Panel a 375 px: lámparas y texto arriba, sugerencia debajo, botones apilados a 44 px.

Diálogo `form-riesgo` (con `DialogoConfirmacion`, título «Fijar nivel de riesgo»):

```
┌ Fijar nivel de riesgo ─────────────────────────────────────┐
│ Nivel *                                                    │
│ (•) ▲ Alto    ( ) ◆ Medio    ( ) ● Bajo                    │  ← fieldset + legend, radios nativos (flechas)
│ Sugerencia del sistema: Alto                               │
│ Justificación *                                            │
│ [                                                       ]  │  0/500
│ [errores: «Elige un nivel» · «La justificación es obligatoria» · «Máximo 500 caracteres»]  │
│                         [Cancelar]  [Guardar nivel]        │
└────────────────────────────────────────────────────────────┘
```

Cada opción lleva el glifo y el texto y, **no** solo color. «Usar el sugerido» abre el mismo diálogo con la opción preseleccionada y el foco en la justificación. Guardar el mismo nivel y la misma justificación no cambia nada (`cambio: false`): mensaje neutro «El nivel ya estaba fijado así» (`aviso-sin-cambios`, testid ya existente).

Estados del panel:

| Estado | Presentación |
| --- | --- |
| Cargando | Esqueleto de lámparas + 3 líneas; `aria-busy` |
| Error | `BloqueEstado error` «Reintentar»; botones ocultos |
| Indisponible total | Lámparas vacías, texto **«No disponible»** en el lugar del nivel (`estado-indisponible-riesgo`), «Reintentar». Nunca «Bajo». Si hay nivel fijado, ese nivel **sí** se muestra (viene de la base propia) y solo el bloque de sugerencia dice «No disponible» |
| Cálculo parcial (`calculoParcial`) | Se muestra el nivel (p. ej. Alto) con la etiqueta de texto `Cálculo parcial` junto al nivel y `aviso-calculo-parcial` (`mensaje-aviso`): «Cálculo parcial: no pudimos consultar el avance del checklist. El nivel real podría ser igual o mayor. Actualiza en unos minutos.» + «Reintentar». La lista de factores marca el factor de atraso como «No disponible» |
| HDU cerrada | Nivel fijado final si existe, o «Sin evaluar»; texto «HDU cerrada: el nivel no se recalcula»; sin botones; el historial se conserva |
| Sin sugerencia por cierre | Cubierto por la fila anterior |

---

## 5. Cierre bloqueado (409 `HDU_BLOQUEADA`) en «Cambiar estado»

El panel certificado `#estado` conserva su estructura y sus botones «Pasar a …». Se agregan dos cosas, ambas **solo** si la transición disponible es «Pasar a Cerrada».

1. **Pista preventiva** (`pista-cierre-bloqueado`, `mensaje-aviso` `role="note"`), solo si la sección de impedimentos cargó y hay abiertos: «Esta HDU tiene 2 impedimentos abiertos. No podrá cerrarse hasta resolverlos.» + enlace «Ver impedimentos». **El botón no se deshabilita**: la fuente de verdad es el servidor (D60) y el escenario del backlog exige el rechazo 409. La pista solo ahorra el intento.
2. **Error del servidor.** Mapeo en `manejarCambioEstado` por código:

| Respuesta | testid | Mensaje |
| --- | --- | --- |
| 409 `HDU_BLOQUEADA` | `error-hdu-bloqueada` | «No se puede cerrar la HDU: tiene N impedimento(s) abierto(s) o escalado(s). Resuélvelos y vuelve a intentar.» + lista |
| 503 `SERVICIO_NO_DISPONIBLE` | `error-impedimentos-no-disponible` | «No pudimos verificar los impedimentos de la HDU. Intenta de nuevo en unos minutos.» (texto del backlog D60 como primera frase) |
| otros | los ya certificados | sin cambios (`error-checklist-incompleto`, `error-checklist-no-disponible`, `error-transicion-invalida`, `error-cambio-estado`) |

```
 ┌ Cambiar estado ─────────────────────────────────────────────────────────────────────────┐
 │ ⓘ Esta HDU tiene 2 impedimentos abiertos. No podrá cerrarse hasta resolverlos.  [Ver]   │  pista-cierre-bloqueado
 │ [Pasar a Cerrada]                                                                       │
 │ ┌ error-hdu-bloqueada (role=alert, fondo error, foco aquí) ───────────────────────────┐ │
 │ │ No se puede cerrar la HDU: tiene 2 impedimentos abiertos o escalados.               │ │
 │ │ Resuélvelos y vuelve a intentar.                                                    │ │
 │ │  · Faltan cuentas de prueba con saldo — Abierto       (enlace a #impedimento-<id>)  │ │
 │ │  · API de Pagos sin sandbox — Escalado                                              │ │
 │ └─────────────────────────────────────────────────────────────────────────────────────┘ │
 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

Reglas: el contenedor del error recibe el foco (`tabIndex=-1`) para anunciarse; la lista (hasta 20 por contrato) muestra «código/título — estado» con enlaces a la tarjeta del impedimento (`#impedimento-<id>`), y si el cuerpo trae más, «y N más» enlaza a `#impedimentos`; tras el 409 la sección se recarga para quedar sincronizada. El estado de la HDU **no cambia** y el botón sigue habilitado. En el 503 no hay botón «Reintentar» aparte: reintentar es volver a pulsar «Pasar a Cerrada» (evita un segundo botón que cierre sin querer). Para el QE, la fila «Cerrar HDU» de la bandeja mostrará la insignia «Con impedimento abierto» (sección 7.2).

En 375 px la lista del error ocupa el ancho completo; los enlaces tienen 44 px de alto.

---

## 6. Menú del QE y pantallas del QE

### 6.1 Menú

`["Bandeja","Equipo","Historias supervisadas","Impedimentos","Perfil"]` (backlog sección 6). «Impedimentos» (`/qe/impedimentos`) sin `end`, de modo que queda `aria-current="page"` también en `/qe/impedimentos/riesgo`. Los otros cuatro roles no cambian. A 375 px `nav-portal` hace wrap (5 ítems: dos líneas).

### 6.2 `/qe/impedimentos` (E4-F02)

Encabezado: `p.etiqueta` «Portal QE», `h1` «Impedimentos», descripción «Bloqueos de las HDU de tu equipo, ordenados por riesgo y antigüedad.». Debajo, `nav aria-label="Secciones de impedimentos"` con `.pestanas`: «Impedimentos» (`pestana-impedimentos`, activa) y «Riesgo por HDU» (`pestana-riesgo`), ambos enlaces con `aria-current`. Mismo patrón que `PestanasAuditor` (se generaliza a `PestanasNav`).

```
 PORTAL QE
 Impedimentos
 Bloqueos de las HDU de tu equipo, ordenados por riesgo y antigüedad.
 [ Impedimentos ]  [ Riesgo por HDU ]

 ┌ Abiertos ──┐ ┌ Escalados ┐ ┌ Nuevos (24 h) ┐
 │     2  ▲   │ │     1     │ │       0       │       ← clave abiertos / escalados / nuevos
 └────────────┘ └───────────┘ └───────────────┘

 ┌ Impedimentos ──────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ Célula[▾] Tipo[▾] Estado[▾] Analista[▾] Riesgo[▾] Buscar [________]  [☐ Incluir resueltos]                          │
 │ chips · [Limpiar filtros]                                          2 resultados                                      │
 │ ⓘ Ordenamos solo por días abiertos porque el riesgo no está disponible.   ← solo con Certificaciones caída           │
 │ RIESGO  HDU            CÉLULA ANALISTA  TIPO          IMPEDIMENTO              ESTADO   RESPONSABLE DÍAS REGISTRADO     │
 │ ▲ Alto  H1 Título H1   CEL-A  Ana 1    Datos prueba  Faltan cuentas…          ○ Abierto Pablo N.    6 d  15-10 09:12 [Abrir] │
 │ ◆ Medio H6 Título H6   CEL-B  Ana 1    Dependencia   API de Pagos sin sandbox ⇧ Escalado Luis S.    3 d  18-10 10:30 [Abrir] │
 │ Mostrando 1–2 de 2          [◀ Anterior] Página 1 de 1 [Siguiente ▶]                                                  │
 └────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Tabla `lista-impedimentos`** (`TablaBandeja`, `fila-impedimento-<id>`, `hrefFila`). Columnas exactas del backlog: Riesgo · HDU (código en `<Link>` + título en 2 líneas) · Célula · Analista · Tipo · Impedimento · Estado · Responsable · Días abiertos · Registrado · Acción («Abrir»). Ordenables: Riesgo, Días abiertos, Registrado. En el "Abrir" el nombre accesible es «Abrir impedimento: {título}». Si la fila es de una HDU donde solo supervisa, junto a «Abrir» se muestra el texto «Solo lectura» (`texto-solo-lectura`).
- **«Abrir»** lleva a `/hdu/<hduId>?impedimento=<id>#impedimentos` con `location.state.desde` (el detalle pasa `fila-resaltada` a la tarjeta y hace scroll; si el parámetro no existe, ignora). Es un parámetro nuevo de cliente, no afecta contratos.
- **Contadores** `abiertos` (ABIERTO+ESCALADO), `escalados`, `nuevos`; `abiertos` con `atencion`. No dependen de filtros. Estados propios (E7 1.3).
- **Filtros**: `filtro-celula`, `filtro-tipo`, `filtro-estado`, `filtro-analista`, `filtro-riesgo`, `filtro-busqueda`, casilla `filtro-incluir-resueltos` (apagada, URL `resueltos=1`). La URL usa `celula`, `tipo`, `estado`, `analista`, `riesgo`, `q`, `resueltos`, `orden`, `pagina`, `tamano`.
- **Orden por defecto** D74 (abiertos, riesgo, días). Con riesgo indisponible: `aviso-orden-por-dias` (`role="status"`, `mensaje-aviso`) y la celda Riesgo dice «No disponible» (excepto los que tienen nivel fijado, que lo muestran).
- Con `Incluir resueltos`, los resueltos al final con la columna Días mostrando «Resuelto en N d».
- Estados: vacío sin filtros «Tu equipo no tiene bloqueos» (tono éxito, `estado-vacio-impedimentos`, contadores en 0); vacío con filtros «No hay impedimentos con esos filtros» + «Limpiar filtros» (`estado-vacio-filtros-impedimentos`); error `BloqueEstado error` + «Reintentar» (`estado-error-impedimentos`), nunca una lista vacía; indisponible solo parcial (riesgo).

375 px: contadores 2 columnas (el tercero ocupa el ancho), pestañas con scroll horizontal, filtros plegados («Filtros (n)»), cada fila una tarjeta:

```
┌────────────────────────────┐
│ ▲ Alto        [○ Abierto]  │  ← riesgo y estado primero (celda-prioritaria)
│ H1  Título H1              │
│ Faltan cuentas de prueba…  │
│ Tipo       Datos de prueba │
│ Analista   Ana 1           │
│ Responsable Pablo N.       │
│ Días abiertos          6 d │
│ Solo lectura               │
│ [Abrir]                    │  ← 44 px, ancho completo
└────────────────────────────┘
```

### 6.3 `/qe/impedimentos/riesgo` (E4-F04, «Riesgo por HDU»)

```
 PORTAL QE
 Riesgo por HDU
 Nivel de riesgo vigente de las HDU de tu equipo.
 [ Impedimentos ]  [ Riesgo por HDU ]
 ┌ Riesgo por HDU ─────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ Nivel[▾] Célula[▾] Sprint[▾] Analista[▾] Estado[▾ no cerradas] [☐ Solo bloqueadas] Buscar [____]   5 resultados     │
 │ NIVEL    HDU            TÍTULO      CÉLULA SPRINT ANALISTA ESTADO        AVANCE      IMP. ABIERTOS ORIGEN   ACTUALIZADO │
 │ ▲ Alto   H1             Título H1   CEL-A  S-12   Ana 1    En ejecución  3/10 · 30 % 1  ⊘           Sugerido 20-10 09:12 │
 │ ▲ Alto   H5             Título H5   CEL-A  S-12   Sin asig. Pendiente     0/10 · 0 %  0              Sugerido 19-10 17:40 │
 │ ◆ Medio  H6             Título H6   CEL-B  S-11   Ana 1    En ejecución  8/10 · 80 % 1  ⊘           Fijado   24-10 16:05 │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Tabla `lista-riesgo`, `fila-riesgo-<hduId>` (celda `celda-riesgo-<hduId>` con `semaforo-riesgo`). Columnas del backlog: Nivel · HDU · Título · Célula · Sprint · Analista · Estado · Avance · Impedimentos abiertos (número + insignia `⊘` si > 0) · Origen («Fijado» / «Sugerido») · Actualizado. Ordenables: Nivel, Impedimentos abiertos, Código. Orden por defecto: riesgo (Alto primero), impedimentos abiertos, código.
- Filtro `filtro-nivel` con opciones Todos, Alto, Medio, Bajo (y «Sin evaluar» solo cuando Estado incluye cerradas). `filtro-estado` por defecto «No cerradas».
- Fuente caída: filas con nivel fijado muestran su nivel (Origen «Fijado»); las demás «No disponible» (`estado-indisponible-riesgo`), `aviso-orden-por-dias`; si el filtro `nivel` está activo la lista pasa a `BloqueEstado indisponible` «No disponible» con «Reintentar».
- Vacíos: con filtro de nivel «No hay HDU con ese nivel de riesgo» (`estado-vacio-filtros-riesgo`); sin filtros «No tienes HDU en tu ámbito» (`estado-vacio-riesgo`).
- Avance siempre como «n/10 · %» (D16), usando `CeldaAvance`.
- 375 px: tarjetas con el nivel y el origen arriba, avance y número de impedimentos en pares etiqueta/valor.

---

## 7. Bloques nuevos en cada bandeja

Principio: **grupo `Impedimentos` con `h2`** (clase `.grupo-contadores`) que contiene los contadores nuevos y, cuando corresponde, una lista en `.panel`. Siempre **debajo** de lo certificado, o en el lugar que el wireframe indica. Cada contador y lista usa `BloqueDatos` y su estado propio (si Impedimentos cae, solo estos bloques muestran «No disponible»; el resto de la bandeja carga, E7-B03).

### 7.1 Analista · `/qa`

```
 … (certificado: supervisor, HDU asignadas, Abiertas, Con observaciones, Esperando aprobación)
 ┌ Impedimentos abiertos ┐                      ← nuevo contador (clave impedimentos-abiertos, atencion)
 │         2  ▲ Requiere atención │
 └───────────────────────┘
 ┌ Mis HDU ──────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ Estado[▾] Célula[▾] Sprint[▾] [☐ Solo con observaciones] [☐ Solo bloqueadas] Buscar [____]                    │
 │ CÓDIGO TÍTULO CÉLULA SPRINT PRIOR. ESTADO AVANCE SIGUIENTE OBSERV. ACTUALIZADA   BLOQUEO                       │
 │ H1     …      CEL-A  S-12   Alta    En ej.  3/10·30%  …    —        20-10 09:12  ⊘ Bloqueada · 2             │
 │ H2     …      CEL-A  S-12   Media   En ej.  …         …    ▲1 obs.  20-10 09:12  —                          │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Contador `impedimentos-abiertos` (tarjeta `tarjeta-impedimentos-abiertos`): cuenta los de **sus** HDU. Sin riesgo (D73): ni columna, ni contador, ni filtro de riesgo.
- Columna **Bloqueo** (`celda-bloqueo-<hduId>`): al **final** de la tabla, después de «Actualizada», para no desplazar columnas que E7 pudiera afirmar; contenido `⊘ Bloqueada · N` o «—» (no tiene); «No disponible» (`estado-indisponible-bloqueo`) si cae el servicio. En 375 px se marca `celda-prioritaria` y la tarjeta muestra la insignia **junto a la de observaciones** arriba.
- Filtro `filtro-solo-bloqueadas` (URL `solo-bloq=1`). Con Impedimentos caído y el filtro activo, la lista pasa a `BloqueEstado indisponible` (no se simula un vacío).
- Fila: sin cambio de navegación (abre el detalle). Si el contador `impedimentos-abiertos` es > 0 no se agrega otro enlace.

### 7.2 QE · `/qe`

```
 … (certificado: 4 contadores de acción · Requiere mi acción · tarjetas de equipo · accesos rápidos)

 Impedimentos y riesgo                                                            ← h2, después de «Requiere mi acción»
 ┌ Impedimentos abiertos ┐ ┌ Nuevos (24 h) ┐ ┌ HDU en riesgo alto ┐
 │   2 ▲                 │ │      0        │ │      2 ▲           │
 └───────────────────────┘ └───────────────┘ └────────────────────┘
 ┌ Impedimentos de mi equipo ───────────────────────────────────── 10 más recientes · [Ver todos →] ┐
 │ RIESGO   HDU  ANALISTA  TIPO          IMPEDIMENTO              ESTADO     DÍAS                    │
 │ ▲ Alto   H1   Ana 1     Datos prueba  Faltan cuentas…          ○ Abierto   6 d  [Nuevo]          │
 │ ◆ Medio  H6   Ana 1     Dependencia   API de Pagos sin sandbox ⇧ Escalado  3 d                   │
 └─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Contadores: `impedimentos-abiertos`, `impedimentos-nuevos`, `hdu-riesgo-alto` (atención si > 0).
- `lista-impedimentos` (clave `impedimentos` para estados): **bloque aparte**; muestra 10 filas, mismo orden D74, `insignia-nuevo` dentro de la fila, enlace «Ver todos» (`enlace-ver-todos-impedimentos`) a `/qe/impedimentos`. **No** agrega filas a `lista-requiere-accion` (D71, E7-F03-T01 sigue con 4 filas).
- Columnas reducidas (sin Célula, Responsable ni Registrado). La fila navega a `/hdu/<id>?impedimento=<id>#impedimentos`.
- La fila «Cerrar HDU» de `lista-requiere-accion` (cert.) recibe una insignia `insignia-con-impedimento-<hduId>` «Con impedimento abierto» (`badge-bloqueada` suave) **dentro de la celda de acción, debajo del texto «Cerrar HDU»**, en un elemento propio. Riesgo: una prueba que afirme el texto exacto de la celda. Se anota para `q360-qa`.
- Vacío: «Tu equipo no tiene bloqueos» (éxito). Indisponible: contadores «No disponible» y la lista `BloqueEstado indisponible` con «Reintentar».
- 375: contadores 2+1, tarjetas por fila, «Ver todos» como botón secundario de 44 px.

### 7.3 Líder QA · `/lider` (solo lectura)

```
 … (certificado: 5 contadores · resumen por célula)
 Impedimentos y riesgo
 ┌ Impedimentos abiertos ┐ ┌ HDU bloqueadas ┐ ┌ Escalados a mí ┐
 │      3 ▲              │ │     3 ▲        │ │     1 ▲        │
 └───────────────────────┘ └────────────────┘ └────────────────┘
 ┌ Impedimentos de mis células ─────────────────────────────── solo lectura ┐
 │ RIESGO HDU CÉLULA ANALISTA TIPO IMPEDIMENTO ESTADO RESPONSABLE DÍAS     │
 │ ◆ Medio H6 CEL-B Ana 1  Dependencia API de Pagos… ⇧ Escalado  Luis S. (tú) [Escalado a ti] 3 d │
 └──────────────────────────────────────────────────────────────────────────┘
 ┌ HDU de mis células … … CERTIFICADO ACTUALIZ.  BLOQUEO            RIESGO ┐
 │ H1 … 20-10 …  ⊘ Bloqueada · 1   ▲ Alto                                   │
 └──────────────────────────────────────────────────────────────────────────┘
```

- Contadores `impedimentos-abiertos`, `hdu-bloqueadas`, `escalados-a-mi`.
- `lista-impedimentos`: todos los abiertos y escalados de **sus células**, con los escalados a él **primero** y la insignia `insignia-escalado-a-mi` («Escalado a ti»); el backlog no precisa si la lista incluye solo los escalados o todos, pero E4-F03-T04 afirma que, con 2 escalados a él, la lista «muestra ambos», y E4-B04 cuenta 3 abiertos: se diseña la lista completa. Sin botones, sin enlace «Abrir» propio: la fila y el código HDU abren el detalle de solo lectura. No hay columna Acción (E7 1.6).
- `lista-hdu-lider` (cert.): se **agregan al final** las columnas «Bloqueo» (`celda-bloqueo-<hduId>`) y «Riesgo» (`celda-riesgo-<hduId>`, píldora) y el filtro `filtro-solo-bloqueadas`.
- Sin células: nada de esto se renderiza (cert. E7-F04-T04).
- Estados: contadores y lista con estado propio; si falla Certificaciones, la columna Riesgo muestra «No disponible» salvo los fijados.
- 375: la tarjeta de la fila muestra riesgo y bloqueo al principio.

### 7.4 Administrador · `/admin`

```
 … (certificado: Usuarios · Supervisión y organización · Accesos rápidos · Pendientes · Últimos cambios)
 Impedimentos y riesgo                                                     ← nuevo grupo con h2, tras «Supervisión y organización»
 ┌ Impedimentos abiertos ┐ ┌ HDU bloqueadas ┐ ┌ HDU en riesgo alto ┐
 │      3                │ │      3         │ │       2            │      ← sin tono de atención: no es trabajo suyo
 └───────────────────────┘ └────────────────┘ └────────────────────┘
 ┌ Impedimentos escalados a mí ───────────────────────────────────────────┐
 │ HDU  CÉLULA  IMPEDIMENTO              ESTADO     REGISTRADO POR  DÍAS    │
 │ H1   CEL-A   Faltan cuentas…          ⇧ Escalado Ana 1           6 d    │
 └─────────────────────────────────────────────────────────────────────────┘
```

- Contadores sin `atencion`: el Administrador no gestiona el contenido (D57); el borde de atención se reserva para lo que debe configurar. Por la misma razón el texto del subtítulo del grupo es «Solo consulta. Los gestiona el QE responsable de cada HDU.».
- `lista-impedimentos-escalados`: solo los escalados a él. Vacío: «No tienes impedimentos escalados» (neutro, no verde). Las filas enlazan al detalle `/hdu/:id` (pantalla existente; el backlog prohíbe enlaces a pantallas *nuevas*). Sin botones.
- Error de Organización: se mantiene `bloque-inicio-admin-error` (cert.); este grupo desaparece junto con los demás datos, y los Accesos rápidos permanecen.

### 7.5 Auditor · `/auditor` y pestaña `/auditor/impedimentos`

- Contadores nuevos `impedimentos-abiertos` y `hdu-bloqueadas` se suman a los 4 existentes (6 tarjetas: 6 columnas a 1280, 2×3 en 375).
- Pestaña nueva **«Impedimentos»** (`pestana-impedimentos`), quinta, **a la derecha** de «Auditoría de usuarios» (no cambia el orden de las 4 certificadas). Dentro, `nav aria-label="Vistas de impedimentos"` (enlaces, no tablist) con «Impedimentos» (`vista-impedimentos`) y «Gestión» (`vista-gestion`), URL `?vista=impedimentos|gestion` (por defecto Impedimentos).

```
 [ HDU ] [ Certificados ] [ Bitácora de checklist ] [ Auditoría de usuarios ] [ Impedimentos ]
 ┌ panel-impedimentos ───────────────────────────────────────────────────────────────────────────────────────────────┐
 │ Vistas:  [ Impedimentos ]  [ Gestión ]                                                                              │
 │ Desde[__] Hasta[__] HDU[▾] Estado[▾] Tipo[▾] (Gestión: Actor[▾] Acción[▾]) Buscar[__]                              │
 │ chips · [Limpiar filtros]                                                                                           │
 │ 5 resultados                                                                                [⬇ Exportar CSV]         │
 │ FECHA REG.  HDU  TIPO          TÍTULO               ESTADO     RESPONSABLE  REGISTRADO POR  DÍAS  RESOLUCIÓN         │
 │ 22-10 13:30 H3   Ambiente      Ambiente QA no resp. ○ Abierto  Luis Soto    Ana 3           0 d    —                 │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Vista «Impedimentos» (`lista-auditor-impedimentos`): columnas del backlog: Fecha de registro · HDU · Tipo · Título · Estado · Responsable · Registrado por · Días abiertos · Fecha de resolución. Vista «Gestión» (`lista-auditor-gestion`): Fecha · HDU · Tipo de evento («Impedimento»/«Riesgo», texto) · Acción · Impedimento · Actor (nombre y rol) · Anterior → Nuevo · Comentario. En eventos de riesgo, anterior/nuevo usan la píldora del semáforo (`▲ Alto`) y el comentario es la justificación.
- Filtros: Desde, Hasta, HDU (`filtro-hdu`), Estado (`filtro-estado`), Tipo (`filtro-tipo`), y en Gestión Actor (`filtro-actor`) y Acción (`filtro-accion`). Cada filtro con `<label>`; ninguno en `<form>`; ningún `button[type=submit]`.
- `boton-exportar-csv` (`BotonExportarCsv` existente, recurso `impedimentos` o `gestion-impedimentos` según la vista). Ayuda «Se exportarán N filas con los filtros aplicados» (`ayuda-exportar`), estados exportando / éxito (`estado-exportacion-ok`) / excede (`estado-exportacion-excede`) / error igual que E7 2.5. Archivos `quality360-impedimentos-AAAA-MM-DD.csv` y `quality360-gestion-impedimentos-AAAA-MM-DD.csv`.
- Códigos de HDU enlazan al detalle de solo lectura. Sin acciones de escritura. Orden por defecto: fecha descendente.
- Estados: cada vista independiente; vacío «No hay registros» / «No hay registros con esos filtros» (con exportar deshabilitado y `aria-describedby`); indisponible con «Reintentar» conservando pestaña y vista. Un contador indisponible no oculta la pestaña.
- 375: pestañas con scroll horizontal (la activa visible); vistas como dos botones-enlace de ancho mitad; tablas en tarjetas; «Exportar CSV» a ancho completo.
- **No** se agregan columnas de bloqueo/riesgo a la pestaña HDU del Auditor ni a su CSV (D71).

---

## 8. Estados y errores

### 8.1 Matriz de estados por componente

| Componente | Cargando | Vacío | Error | No disponible | Cálculo parcial |
| --- | --- | --- | --- | --- | --- |
| Sección impedimentos (detalle) | Esqueleto 2 filas | «Esta HDU no tiene impedimentos registrados» | `BloqueEstado error` + Reintentar | «No disponible» + Reintentar; sin botón ni aviso de bloqueo | — |
| Historial del impedimento | «Cargando…» | — (siempre hay REGISTRAR) | Reintentar | Reintentar | — |
| Panel de riesgo | Esqueleto lámparas | — (siempre hay nivel o «Sin evaluar») | Reintentar | «No disponible» (nunca Bajo); el nivel fijado se conserva | Nivel + «Cálculo parcial» + aviso |
| `/qe/impedimentos` | Esqueleto 5 filas | «Tu equipo no tiene bloqueos» / «No hay impedimentos con esos filtros» | Error + Reintentar (Impedimentos u Organización caídos: nunca lista vacía) | Solo la columna Riesgo (y orden por días) | — |
| `/qe/impedimentos/riesgo` | Esqueleto | «No tienes HDU en tu ámbito» / «No hay HDU con ese nivel de riesgo» | Error + Reintentar | Filas sin fijado «No disponible»; con filtro de nivel, lista indisponible | Píldora con `Cálculo parcial` en texto pequeño |
| Contadores de bandeja | Barra de esqueleto | `ok` con 0 | Tarjeta con error | «No disponible» (clave `estado-indisponible-<clave>`) | — |
| Listas de bandeja | Esqueleto | Mensajes de 7.x | Error | `BloqueEstado indisponible` | — |
| Pestaña Auditor | Esqueleto | «No hay registros» | Error | Indisponible + Reintentar | — |

`BloqueDatos` envuelve cada uno con los testids de convención `estado-vacio-<clave>`, `estado-error-<clave>`, `estado-indisponible-<clave>`. Claves nuevas: `impedimentos-hdu`, `riesgo`, `impedimentos`, `impedimentos-abiertos`, `impedimentos-nuevos`, `hdu-riesgo-alto`, `hdu-bloqueadas`, `escalados-a-mi`, `bloqueo`, `impedimentos-escalados`, `auditor-impedimentos`, `auditor-gestion`.

### 8.2 Mensajes de error de acciones

| Respuesta | Contexto | Mensaje (si el API trae mensaje en español, se usa) | Comportamiento |
| --- | --- | --- | --- |
| 400 `VALIDACION` | Registro, diálogos | Mensaje por `campo` (sección 2) | Permanece abierto; foco al campo |
| 422 `COMENTARIO_REQUERIDO`, `MOTIVO_REQUERIDO`, `JUSTIFICACION_REQUERIDA` | Diálogos | «Indica la acción tomada» / «Indica el motivo» / «La justificación es obligatoria» | Bajo el campo (`error-comentario-impedimento`) |
| 422 `RESPONSABLE_INVALIDO` | Registro, escalar | «El responsable elegido ya no está disponible. Actualizamos la lista.» | Recarga candidatos y conserva lo escrito |
| 409 `TRANSICION_INVALIDA` | Cualquier acción | «El impedimento ya cambió de estado. Se actualizó la lista» | Cierra el diálogo, recarga la sección |
| 409 `HDU_CERRADA` | Registro, acciones, riesgo | «La HDU ya está cerrada y no admite cambios.» | Cierra, recarga, desaparecen botones |
| 403 `ACCESO_DENEGADO` | Acción pulsada sin permiso real | «Ya no tienes permiso para esta acción» | Cierra, recarga sección y dispara `GET /v1/me` (E7 4.3) |
| 503 / red / 5xx | Cualquier escritura | «No fue posible guardar. Intenta nuevamente.» (`error-accion-impedimento`, `role="alert"`) | El diálogo/formulario no se cierra; botón vuelve a habilitarse |
| 409 `HDU_BLOQUEADA`, 503 en cierre | Cambiar estado | Sección 5 | — |

---

## 9. Accesibilidad (resumen específico de E4)

- **Contraste ≥ 4,5:1** en todos los pares nuevos (3.1, 10.2); lámparas ≥ 3:1 por borde de 2 px; bordes de estado (4–5 px) son decoración redundante con la insignia.
- **No solo color:** estado de impedimento (glifo + palabra), riesgo (forma + palabra + posición de lámpara), bloqueo (⊘ + «Bloqueada»), «Nuevo» (palabra), «Solo lectura» (palabra).
- **Nombres accesibles:** botones por tarjeta con contexto: «Resolver impedimento: {título}» (texto visible «Resolver» al inicio), «Escalar…», «Reabrir…», «Agregar seguimiento a…», «Ver historial de…». `aria-expanded` y `aria-controls` en disclosures. Semáforo: texto visible, sin duplicar con `aria-label`.
- **Foco:** al abrir diálogo → primer control (comentario o selector); al cerrar → vuelve al disparador; si el disparador desapareció (p. ej. «Resolver» tras resolver), al `h3` de la tarjeta. Errores de validación: foco al primer campo inválido. Error de cierre bloqueado: foco al contenedor del error.
- **Anuncios:** `role="status"` para éxito, contadores de caracteres al límite, `aviso-orden-por-dias`, `aviso-calculo-parcial`; `role="alert"` para errores de servidor y de cierre.
- **Teclado:** todo operable; los radios de `form-riesgo` con flechas; ninguna acción solo por hover; Esc cierra diálogos. Fila de tabla: el código de HDU es el tope de tab (como E7); el botón «Abrir» es un segundo tope intencional (backlog lo exige).
- **375 px:** objetivos de 44 px (`--q360-objetivo-tactil`), botones de tarjeta apilados, formularios de una columna, diálogos a ancho completo (`.dialogo` ya lo hace a ≤ 750 px), tablas apilables a ≤ 640 px con `celda-prioritaria` primero. Sin scroll horizontal fuera de `.tabla-contenedor`.
- **Movimiento:** esqueleto ya respeta `prefers-reduced-motion`; no se agregan animaciones nuevas (el cambio de lámpara no anima).
- **Lectores de pantalla en tablas apiladas:** se mantienen los `role` de `TablaBandeja`; las insignias son texto.

---

## 10. Inventario

### 10.1 Componentes

**Reutilizados sin cambios:** `DialogoConfirmacion`, `BloqueEstado`, `TarjetaMetrica` (con `clave`, `atencion`, `detalle`), `AvisoSoloLectura`, `TablaBandeja`, `BarraFiltros`/`useFiltrosUrl`, `Paginacion`, `BotonExportarCsv`, `PestanasAuditor`, `MensajeExito`, `CeldaAvance`, `InsigniaEstadoHdu`, `Layout`, `AccesoDenegado`, `.historial-*`, `.chips`, `.mensaje-aviso`, `.mensaje-error-global`, `.campo-error`, `.campo-ayuda`.

**Reutilizados con cambios compatibles:**

| Componente | Cambio |
| --- | --- |
| `Layout` | Ítem «Impedimentos» del QE (sin `end`); orden del backlog sección 6 |
| `HduDetailPage` | Slots: `hdu-bloqueada` sobre el encabezado; `SeccionImpedimentos` y `PanelRiesgo` entre `#certificado` y `#estado`; `pista-cierre-bloqueado`; mapeo de `HDU_BLOQUEADA` y `SERVICIO_NO_DISPONIBLE` en `manejarCambioEstado`; lee `?impedimento=` para resaltar |
| `TablaBandeja` | Soporte de `celda-prioritaria` (orden visual en tarjeta ≤ 640 px) |
| `PestanasAuditor` | Se generaliza a `PestanasNav` (mismas clases) para la navegación Impedimentos/Riesgo del QE y las vistas del Auditor; `PestanasAuditor` queda como envoltorio |
| Páginas de bandeja (Analista, QE, Líder, Administrador, Auditor) | Montan los bloques de la sección 7 |
| `columnasHdu` | Nuevas columnas `bloqueo` y `riesgo` opcionales (al final) |

**Nuevos:**

| Componente | Función |
| --- | --- |
| `SemaforoRiesgo` | Píldora, lámparas y variante «No disponible» / «Sin evaluar»; `data-nivel`, `data-origen` |
| `InsigniaEstadoImpedimento` | `○ Abierto`, `⇧ Escalado`, `✓ Resuelto` |
| `InsigniaBloqueo` | `⊘ Bloqueada` (con número opcional) |
| `InsigniaNuevo` | «Nuevo» |
| `AvisoHduBloqueada` | Franja del detalle (`hdu-bloqueada`) |
| `SeccionImpedimentos` | Cabecera, resumen, lista, formulario, nota de solo lectura, estados |
| `TarjetaImpedimento` | Tarjeta con metadatos, acciones e historial |
| `HistorialImpedimento` | Lista cronológica (usa `.historial-*`) |
| `FormularioImpedimento` | Registro inline con contadores y validación |
| `SelectorResponsable` | `select` de candidatos + «Otro (nombre)…» (compartido por registro y escalar) |
| `CampoTextoContador` | Textarea/input con contador `n/máx` y mensaje de error |
| `DialogoAccionImpedimento` | Envuelve `DialogoConfirmacion` para resolver, escalar, reabrir y seguimiento |
| `ErrorCierreBloqueado` | Mensaje 409 con lista y enlaces |
| `PanelRiesgo` | Nivel vigente, origen, sugerencia, factores, historial |
| `FactoresRiesgo` | Lista de factores con chip de nivel, `indisponible` y «sin factores» |
| `DialogoFijarRiesgo` | Radios de nivel + justificación |
| `PaginaQeImpedimentos`, `PaginaQeRiesgo` | Pantallas de la sección 6 |
| `BloqueImpedimentosBandeja` | Tabla compacta de 10 filas + «Ver todos» (QE, Líder, Administrador, con columnas por rol) |
| `PanelAuditorImpedimentos` | Pestaña con vistas, filtros y exportación |

### 10.2 Tokens y clases CSS a agregar

En `tokens.css` (ningún token existente cambia de valor):

```
/* Riesgo (texto sobre fondo >= 7:1) */
--q360-color-riesgo-alto: #991b1b;        --q360-color-riesgo-alto-suave: #fde8e8;
--q360-color-riesgo-medio: #6b4400;       --q360-color-riesgo-medio-suave: #fff0b8;
--q360-color-riesgo-bajo: #0f5132;        --q360-color-riesgo-bajo-suave: #e5f6ec;
/* Lámparas del semáforo (solo relleno decorativo; el borde usa --q360-color-texto-terciario) */
--q360-lampara-roja: #dc2626;  --q360-lampara-amarilla: #facc15;  --q360-lampara-verde: #16a34a;
/* Bloqueo (insignia sólida: texto blanco sobre #991b1b ≈ 8:1) */
--q360-color-bloqueo: #991b1b;  --q360-color-bloqueo-texto: #ffffff;
/* Estados de impedimento (texto / fondo ≥ 5,5:1) */
--q360-color-imp-abierto: #6b4400;     --q360-color-imp-abierto-suave: #fff3d6;
--q360-color-imp-escalado: #1d4b9a;    --q360-color-imp-escalado-suave: #eef4ff;
--q360-color-imp-resuelto: #0f5132;    --q360-color-imp-resuelto-suave: #e5f6ec;
```

En `bandejas.css` / `global.css` (clases nuevas):

`.badge-riesgo`, `.badge-riesgo--alto|medio|bajo|sin-evaluar`, `.semaforo` (píldora), `.semaforo-lamparas`, `.semaforo-lampara`, `.semaforo-lampara--encendida`, `.badge-bloqueada`, `.badge-imp-abierto`, `.badge-imp-escalado`, `.badge-imp-resuelto`, `.badge-nuevo`, `.aviso-bloqueada` (franja), `.lista-impedimentos`, `.impedimento`, `.impedimento--abierto|escalado|resuelto` (borde izquierdo), `.impedimento__cabecera`, `.impedimento__meta` (dl en rejilla), `.impedimento__acciones`, `.formulario-impedimento`, `.contador-caracteres`, `.panel-riesgo`, `.panel-riesgo__rejilla` (2 columnas a ≥ 900 px, 1 en móvil), `.lista-factores`, `.factor`, `.celda-prioritaria`, `.texto-solo-lectura`, `.error-cierre-bloqueado`. Reglas ≤ 750 px: `.impedimento__acciones .boton { width: 100%; min-height: var(--q360-objetivo-tactil) }`; `.impedimento__meta` en una columna; `.panel-riesgo__rejilla` en una columna. Regla ≤ 640 px: `.tabla--apilable tr { display: flex; flex-direction: column }` con `.celda-prioritaria { order: -1 }`.

---

## 11. `data-testid` propuestos

Se conservan todos los certificados. Convenciones de E7 (`contador-<clave>`, `lista-<clave>`, `estado-vacio|error|indisponible-<clave>`). Los de `E4` según backlog sección 8 están marcados con *.

| Zona | Identificadores |
| --- | --- |
| Detalle | `hdu-bloqueada`*, `seccion-impedimentos`*, `resumen-impedimentos`, `lista-impedimentos-hdu`*, `impedimento-<id>`, `estado-impedimento-<id>`, `boton-registrar-impedimento`*, `form-impedimento`*, `campo-tipo-impedimento`, `campo-titulo-impedimento`, `campo-descripcion-impedimento`, `campo-responsable-impedimento`, `campo-responsable-otro`, `contador-descripcion-impedimento`, `boton-guardar-impedimento`, `nota-impedimentos-solo-lectura`, `nota-impedimentos-cerrada`, `boton-ver-mas-impedimentos` |
| Acciones | `boton-resolver-<id>`, `boton-escalar-<id>`, `boton-seguimiento-<id>`, `boton-reabrir-<id>`, `boton-ver-historial-<id>`, `historial-impedimento-<id>`, `accion-impedimento-<id>-<n>`, `dialogo-resolver`, `dialogo-escalar`, `dialogo-reabrir`, `dialogo-seguimiento`, `campo-comentario-impedimento`, `campo-destino-escalamiento`, `campo-destino-otro`, `campo-motivo-reabrir`, `error-comentario-impedimento`, `error-accion-impedimento`, `mensaje-exito-impedimento` |
| Cierre | `pista-cierre-bloqueado`, `error-hdu-bloqueada`, `lista-error-bloqueantes`, `error-impedimentos-no-disponible` |
| Riesgo | `panel-riesgo`*, `semaforo-riesgo`* (con `data-nivel`, `data-origen`), `riesgo-sugerido`*, `riesgo-origen`, `riesgo-justificacion`, `lista-factores-riesgo`, `factor-<CODIGO>`, `aviso-sugerencia-distinta`, `aviso-calculo-parcial`, `boton-fijar-riesgo`, `boton-usar-sugerido`, `form-riesgo`*, `riesgo-opcion-ALTO|MEDIO|BAJO`, `campo-justificacion-riesgo`, `error-justificacion-riesgo`, `error-nivel-riesgo`, `historial-riesgo`, `estado-indisponible-riesgo` |
| QE pantallas | `pagina-qe-impedimentos`, `pagina-qe-riesgo`, `pestana-impedimentos`, `pestana-riesgo`, `contador-abiertos`, `contador-escalados`, `contador-nuevos`, `lista-impedimentos`*, `fila-impedimento-<id>`, `boton-abrir-impedimento-<id>`, `texto-solo-lectura`, `insignia-nuevo`*, `filtro-tipo`, `filtro-riesgo`, `filtro-incluir-resueltos`, `aviso-orden-por-dias`, `estado-vacio-impedimentos`, `estado-vacio-filtros-impedimentos`, `lista-riesgo`, `fila-riesgo-<hduId>`, `celda-riesgo-<hduId>`, `filtro-nivel`, `filtro-solo-bloqueadas`, `estado-vacio-riesgo`, `estado-vacio-filtros-riesgo` |
| Bandejas | Analista: `contador-impedimentos-abiertos`*, `celda-bloqueo-<hduId>`, `filtro-solo-bloqueadas`. QE: `contador-impedimentos-abiertos`*, `contador-impedimentos-nuevos`*, `contador-hdu-riesgo-alto`*, `lista-impedimentos`*, `enlace-ver-todos-impedimentos`, `insignia-con-impedimento-<hduId>`. Líder: `contador-impedimentos-abiertos`*, `contador-hdu-bloqueadas`*, `contador-escalados-a-mi`*, `lista-impedimentos`*, `insignia-escalado-a-mi`, `celda-bloqueo-<hduId>`, `celda-riesgo-<hduId>`. Administrador: `contador-impedimentos-abiertos`*, `contador-hdu-bloqueadas`*, `contador-hdu-riesgo-alto`*, `lista-impedimentos-escalados`*. Auditor: `contador-impedimentos-abiertos`*, `contador-hdu-bloqueadas`*, `pestana-impedimentos`, `panel-impedimentos`, `vista-impedimentos`, `vista-gestion`, `lista-auditor-impedimentos`, `lista-auditor-gestion`, `boton-exportar-csv` (cert.), `estado-exportacion-*` (cert.) |
| Estados | `estado-vacio|error|indisponible-<clave>` con las claves de 8.1 |

`insignia-nuevo`, `semaforo-riesgo`, `celda-bloqueo-*`, `lista-impedimentos` se repiten entre filas o páginas: las pruebas deben acotarlas con `within(fila)` o por ruta. No colisionan dentro de una misma pantalla.

---

## 12. Conflictos y brechas con el backlog E4

> **Resueltos el 2026-10-26** por `q360-arquitecto` en `docs/arquitectura/decisiones-mvp.md`, sección «Corrida E4» (D75–D84 y la tabla «Resolución de los conflictos del diseño»). Los cambios de contrato están en `contracts/impedimentos.v1.yaml` y `contracts/comun.v1.yaml`.

1. **Parámetro de enlace «Abrir».** F02 pide «detalle de la HDU con el impedimento a la vista» sin definir cómo. Se diseña `/hdu/:id?impedimento=<id>#impedimentos`. Es de cliente y no cambia contratos.
2. **Contrato necesario para los permisos del detalle.** `GET /v1/hdu/{id}` no cambia (sección 5 del backlog), por lo que el portal no tiene `permisos` para impedimentos. `GET /v1/hdu/{id}/impedimentos` y `GET …/riesgo` deben devolver `permisos {registrar, gestionar, fijarRiesgo}`, `hduCerrada` y `esNuevo` (D72) para que el botón exista o no sin que el cliente deduzca la relación. Falta en `impedimentos.v1.yaml`.
3. **Factores sin datos.** El backlog entrega códigos y niveles, pero la frase «faltan N días y avance X %» necesita los valores y umbrales (D67 los hace configurables). Se requiere `factores[].detalle` (días, avance, umbral, fecha de fin del sprint). Si no llega, el panel degrada a la frase genérica del código.
4. **Total en el 409 `HDU_BLOQUEADA`.** El cuerpo lista «hasta 20»; para «y N más» falta el total. Se requiere `total` en el error o se muestra solo «y otros».
5. **Lista del Líder ambigua.** Sec. 6 («bloque `lista-impedimentos`») no dice si incluye solo los escalados a él o todos los de sus células; E4-F03-T04 (dos escalados «ambos») y E4-B04 (3 abiertos) permiten ambas. Se diseña la lista completa con los escalados a él primero. Si se prefiere solo los escalados, se oculta lo demás sin cambiar contadores.
6. **Riesgo del Auditor en listados.** F04 afirma que Líder y Auditor «ven el nivel en sus listados según la sección 6», pero sección 6 no agrega nivel a la pestaña HDU del Auditor (y D71 prohíbe cambiar su CSV). Se diseña: Líder sí (columna Riesgo); Auditor solo en el panel del detalle y en la vista «Gestión». Pedir confirmación si debe sumarse una columna en pantalla (sin CSV).
7. **Posición de las columnas nuevas.** Se agregan al **final** en Analista y Líder (el backlog lo pide explícitamente solo para el Líder). Si no hay prueba que afirme encabezados del Analista, se puede mover «Bloqueo» tras «Estado» para mejor lectura.
8. **Insignia «Con impedimento abierto» en la fila «Cerrar HDU».** Aditiva, pero cualquier prueba que lea el texto completo de la celda de acción la rompería; se anota para `q360-qa`.
9. **«Ver historial» como botón.** Se implementa como disclosure con `aria-expanded` (equivalente funcional). No añade `type=submit`.
10. **Historial de riesgo y de gestión del detalle.** El backlog no dice dónde se muestra `GET …/gestion-impedimentos` en el detalle. Se usa para el historial del panel de riesgo (filtrado por `RIESGO`); el historial por impedimento sale de `GET /v1/impedimentos/{id}`. El «Historial» certificado de la HDU no se toca.
11. **Administrador.** D57 le deja solo lectura, pero conserva controles de asignación en el mismo detalle; por eso se agrega la nota textual (no figura en el backlog). Sin botón de escalar/resolver para él (confirma la pregunta abierta 1).
12. **Pasos de validación F03-T02.** El backlog exige «Confirmar» con comentario vacío y mensaje: el botón no se deshabilita por vacío (se aparta de la costumbre de `deshabilitado` de algunos diálogos E7).
13. **Pista de cierre bloqueado.** No está en el backlog; se agrega como aviso no bloqueante. Si `q360-qa` prefiere que la prueba E4-B02-T12/F03 vea siempre el 409 del servidor, la pista no afecta porque el botón sigue habilitado.
14. **Menú del QE.** La opción «Impedimentos» no usa `end`; también queda activa en `/qe/impedimentos/riesgo` (sin impacto en pruebas: solo `aria-current`).
15. **Colores.** Todos los pares se calcularon por inspección; la certificación E4 debe correr axe sobre `/hdu/:id` (4 roles), `/qe/impedimentos`, `/qe/impedimentos/riesgo`, las 5 bandejas y la pestaña del Auditor, como en E7.
