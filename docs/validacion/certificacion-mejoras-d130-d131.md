# Certificación de las mejoras D130 y D131

Rama `mejora/checklist-libre-y-selector`, sobre el commit `d2f931b` (producto sin cambios en esta certificación). Stack local real: Supabase local, Compose de servicios (`npm run local -- --build`) y semilla MVP + E7 + E4. Dueño: `q360-qa`.

## Dictamen

**CERTIFICADAS.** D130 (checklist en orden libre) y D131 (selectores como lista visible) cumplen sus escenarios y no hay regresiones en E1, E2, E3, modelo de datos, login, E7 ni E4. No hay defectos de producto abiertos.

## Qué se verificó

### D130 · Checklist en orden libre

| Escenario | Prueba | Resultado real |
| --- | --- | --- |
| E3-B02#1 (cambió) | `tests/api/e3-b02-orden-aprobacion.spec.ts` · `[E3-B02#1] orden libre (D130)…` | Pasa. Con PLAN_PRUEBAS pendiente, marcar DASHBOARD y CASOS_PRUEBA responde 200 y queda `POR_APROBAR`. Desmarcar PLAN_PRUEBAS con siguientes marcados responde 200. El certificado sigue respondiendo 409 `ENTREGABLES_PENDIENTES` (detalle incluye PLAN_PRUEBAS). Repetir un marcado responde 409 `ENTREGABLE_YA_REGISTRADO`. |
| E3-F02#2 (cambió) | `tests/e2e/e3-f02-marcar-entregable.spec.ts` · `[E3-F02#2] orden libre (D130)…` | Pasa. En el portal, DASHBOARD se marca con PLAN_PRUEBAS pendiente, queda «Por aprobar», sin aviso y sin el texto «Completa «X» antes de marcar «Y»». |
| E3-B02#2, E3-B02#3, E3-B04#2, E3-B03#3, E3-F01, E3-F03 | Sin cambio | Pasan (aprobación solo del QE, porcentaje, motivo al desmarcar, certificado con 1 a 8). |
| E2-B02#3, modelo de datos | Sin cambio (usan `ORDEN_ENTREGABLES` solo como lista de presentación) | Pasan. |

Cambios de soporte: `tests/support/checklist.ts` solo actualiza el comentario (el arreglo `ORDEN_ENTREGABLES` sigue siendo el orden de presentación de los 10). Ninguna prueba contaba la opción «Selecciona…»: E2-F02 y E7-B05 pasan sin tocarse.

### D131 · Selectores como lista visible

Prueba nueva `tests/e2e/mejoras-d131-listas-dialogo.spec.ts`, a 1280 y 375 px de ancho (alto 800), con 8 analistas en el equipo de Carla y con más de 6 QE de destino (usuarios propios de la prueba, desactivados al terminar):

| Prueba | Resultado real |
| --- | --- |
| `[D131#1]` «Asignar analista» (`#select-analista-hdu`) | Pasa. `size` = 6, más de 6 opciones, la lista se desplaza dentro del diálogo, sin opción vacía, las 8 opciones se seleccionan una a una, la última queda dentro de la lista, el diálogo queda dentro de la ventana, sin desborde horizontal, axe sin violaciones serious/critical. |
| `[D131#2]` «Reasignar QE responsable» (`selector-qe-destino`) | Pasa, con las mismas comprobaciones. |

## Ejecuciones

| Ronda | Qué | Resultado |
| --- | --- | --- |
| Servicio | `npm test -w services/certificaciones` (sin `prisma generate`: en Windows no se regenera con los servicios arriba; el cliente ya venía generado por `npm run local -- --build`) | 77 de 77 pasan |
| Portal | `vitest run` en `apps/web` | 21 archivos, 260 de 260 pasan |
| Playwright, dirigida | e3-b02, e3-f02, e2-f02, mejoras-d131 | 20 de 20 pasan (tras corregir la forma de la respuesta en mi propia prueba: el listado usa `entregables`, no `items`) |
| Playwright, ronda 1 (suite completa) | todos los proyectos | 433 pasan, 11 fallan (todos E4), 133 no corrieron por depender del fallo |
| Playwright, ronda 2 (E4) | `e4-api` + `e4-e2e` | 145 pasan, 1 intermitente (E4-F04#2 T05, pasa en el reintento) |
| Playwright, ronda 2 (suite completa) | todos los proyectos | **567 pasan, 0 fallan, 1 intermitente, 9 omitidas** |

Intermitente de la suite completa de la ronda 2: `[E4-F04#1] T09` (AUD1 no vio `panel-riesgo` en el primer intento, pasó en el reintento). Es el patrón de límite de tasa del gateway que la configuración de E4 ya anticipa con `retries: 1`; no toca el checklist ni los diálogos.

Omitidas (9), no certifican nada y son iguales que antes de la mejora: `[E1-B01#3]` (límite de intentos del proveedor, se omite por diseño en local) y 8 pruebas «ABS» de E7 que exigen la base solo con `seed:e7` y se omiten cuando E4 está cargado.

## Defectos

Ninguno de producto.

Defecto propio de pruebas (corregido en esta rama): `tests/support/e4.ts` (`recargarE4`) seguía parchando `infrastructure/seed/e4/cargar.mjs` por el DEF-E4-01 y lanzaba «cargar.mjs cambió…» porque la semilla ya recorre todas las páginas (commit `73816b3`). Eso causó los 11 fallos de la ronda 1. Ahora ejecuta la semilla tal cual cuando el parche ya no aplica. Es el mismo arreglo que la rama de E5 (`fc1edbf`); al fusionar las ramas puede haber un conflicto trivial en esas líneas, con el mismo contenido.

## Sin cubrir

- La prueba de D131 usa Chromium de escritorio; no se probó con teclado en listas de 375 px más allá de axe.
- `prisma generate` de Certificaciones no se ejecutó dentro de `npm test` (bloqueo de Windows con servicios arriba); el cliente generado es el del `--build`.
