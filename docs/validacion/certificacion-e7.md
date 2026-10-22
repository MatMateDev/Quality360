# Certificación E7 · Bandejas por rol (Quality360)

Dueño: `q360-qa`. Alcance: 12 HDU (E7-F01..F07, E7-B01..B05), 36 escenarios, más la regresión de E1, E2, E3, modelo de datos y login. Pruebas en `tests/` (Playwright 1.63, `@axe-core/playwright` 4.14, contrato con `ajv` + `yaml` contra `contracts/*.yaml`).

- **Ronda 1-3** (commit `43f6b67`, base acumulada): 1 HDU CERTIFICADA y 11 OBSERVADAS; 399 pasan, 28 fallan, 2 omitidas de 429. Defectos DEF-01..DEF-11 (historial en git, commits `6b6b212` y `6af3eb8`).
- **Ronda 4 (esta, HEAD `32ce081`)**: tras las correcciones de backend (D55, DEF-01/02/09/11) y frontend (D56, DEF-03..08, DEF-10), base local recreada desde cero.

## Veredicto de la ronda 4

**12 de 12 HDU CERTIFICADAS.** Corrida completa final (`tests/full-run-e7-ronda5.log`, 440 pruebas, 21,6 min): 430 pasan, 9 omitidas, 1 falla. La única falla (E7-F06 T06b) era una prueba desactualizada por el cambio documentado de DEF-04 (el filtro ahora es buscable); se ajustó y el archivo de F06 se reejecutó completo (24 de 24 pasan, incluidas las de preparación). Sin regresiones en E1, E2, E3, modelo de datos ni login. Las 9 omitidas: 8 son los valores absolutos (se ejecutan sobre la base pura, ver abajo; pasaron allí) y `E1-B01#3` (límite de intentos del proveedor, omitida por diseño de esa prueba).

## Entorno y orden de carga del fixture

Base recreada por el coordinador. Para que los conteos de la sección 3 sean exactos **no se usó `npm run local` tal cual** (siempre carga la semilla MVP al final, y esta suma 12 usuarios y 14 HDU). Se levantó el stack con un script que replica `levantar.mjs` sin el paso de semilla (esquemas, buckets, entorno, build, migraciones y procesos), y:

1. **Base pura**: solo `npm run seed:e7` (11 usuarios, 8 HDU). Se corrieron las pruebas de valores absolutos (`tests/api/e7-abs-fixture.spec.ts`, `tests/e2e/e7-abs-fixture-ui.spec.ts`): **8 de 8 pasan** (10 activos 1/2/4/2/1, 1 inactivo, 1 analista sin QE, 0 QE sin analistas, 1 líder sin células, 1 célula sin líder, 8 HDU, 3 pendientes; LID1 2 células, 5 abiertas, 1 cerrada, 1 sin analista, 1 certificado y 6 HDU, LID2 vacío; AUD1 8 HDU y 2 certificados; 2 certificados F7/F8; la bitácora global se recorre completa con 200 en todas las páginas).
2. **Semilla MVP encima** (`npm run seed`) y luego la suite completa. Las pruebas absolutas se omiten solas cuando la base ya no es la pura (y una omitida no certifica; su resultado válido es el del paso 1).

Sin modificar código de producción. Fuente caída: instancias secundarias y un proxy que corta rutas de Organización (`tests/support/entornoE7.ts`). Reproducir: base pura + `seed:e7` y `cd tests && npx playwright test e7-abs`; luego `npm run seed` y `npx playwright test`.

## Cambios en pruebas esta ronda

| Prueba | Cambio | Motivo |
| --- | --- | --- |
| E7-F05 T03 | Resuelve los pendientes de forma reversible (desactiva a los usuarios con pendiente, suma las células libres a LID1) y lo restaura en `finally`; ya no se omite | Verifica «No hay pendientes de configuración» sin alterar el fixture |
| E7-F06 T06b | Escribe en el filtro buscable y elige `E7-H2` | DEF-04 corregido |
| E7-F06 T04 | Basta la flecha «→» (la primera página puede traer exportaciones) | Robustez |
| E1-F08 #3 | `heading` «Usuarios» con `level: 1` | La página de Usuarios ahora tiene más encabezados con ese nombre (modo estricto) |
| E7-F01 T07, bitácora T01b, contratos, axe | Sin cambios: ahora pasan | Correcciones D55/D56 |

Cambios de rondas anteriores (D41 en E1-F02/F05, menú «Bandeja», banner, modelo con 5 roles y tablas `celula_lider`/`hdu_historial_responsable`, reintento 429 en E2-F04#3) siguen vigentes y están documentados en el historial de este archivo (commit `6af3eb8`).

## Dictamen por HDU

| HDU | Dictamen | Fundamento |
| --- | --- | --- |
| E7-F01 | CERTIFICADA | 3 escenarios; T07 (rol cambiado) ya redirige con aviso; matriz 5x4 pasa; axe sin violaciones |
| E7-F02 | CERTIFICADA | 3/3; axe y 375 px |
| E7-F03 | CERTIFICADA | 3/3; axe y 375 px |
| E7-F04 | CERTIFICADA | 3/3; solo lectura y fuente caída |
| E7-F05 | CERTIFICADA | 3/3 incluido T03 y valores absolutos; pendientes sin pérdida de filas |
| E7-F06 | CERTIFICADA | 3/3; exportación CSV, bitácora completa y filtro buscable |
| E7-F07 | CERTIFICADA | 3/3; axe en `/admin/usuarios` |
| E7-B01 | CERTIFICADA | 3/3 con contrato |
| E7-B02 | CERTIFICADA | 3/3 con contrato (`sprint` conforme) |
| E7-B03 | CERTIFICADA | 3/3 con contrato y valores absolutos |
| E7-B04 | CERTIFICADA | 3/3; bitácora global sin 403 |
| E7-B05 | CERTIFICADA | 3/3, API y pantalla; contrato conforme |

Resumen: **CERTIFICADA 12, OBSERVADA 0, NO VERIFICABLE 0.**

## Defectos abiertos

Ninguno de los reportados (DEF-01..DEF-11) sigue reproduciéndose. Observaciones sin defecto:
- La bitácora y la auditoría muestran valores anidados resumidos (el detalle fino quedó fuera del alcance de los escenarios).
- `E1-B01#3` se omite por diseño de esa prueba, no por E7.

## No cubierto
- Accesibilidad de los diálogos abiertos y navegación por teclado (axe corrió sobre las pantallas, no sobre cada diálogo).
- Los valores absolutos se verificaron en la base pura, no en la base con semilla MVP (ahí los conteos globales se contrastan con SQL).
- Los 4 casos de regresión del backlog (F03-T07, F05-T07, F07-T07, B02-T10) se verifican con la corrida de las HDU originales, que pasa.
