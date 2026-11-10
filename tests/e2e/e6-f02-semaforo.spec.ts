import { test } from "@playwright/test";

/**
 * E6-F02 · Semáforo por célula y drill-down (12 casos). ESQUELETO de la Q1: todos los casos están pendientes (test.fixme) y NO certifican nada.
 * La Ola 7 los completa contra el stack real (fixture seed:e7 + seed:e4 + seed:e6; proyecto e6-e2e).
 * Fuente de los casos: docs/backlog/e6-indicadores-dashboards.md, sección 10. El ID del escenario va en el nombre: [E6-F02#n].
 */
test.describe("E6-F02 · Semáforo por célula y drill-down", () => {
  test.fixme("[E6-F02#1] E6-F02-T01: Abre la pestaña Semáforo", async () => {
    // Datos: QE1
  });
  test.fixme("[E6-F02#1] E6-F02-T02: Abre la pestaña Semáforo", async () => {
    // Datos: QE2
  });
  test.fixme("[E6-F02#1] E6-F02-T03: Abren el semáforo", async () => {
    // Datos: LID1; AUD1
  });
  test.fixme("[E6-F02#2] E6-F02-T04: Selecciona CEL-A", async () => {
    // Datos: QE1
  });
  test.fixme("[E6-F02#2] E6-F02-T05: Selecciona CEL-B", async () => {
    // Datos: QE1
  });
  test.fixme("[E6-F02#2] E6-F02-T06: Selecciona CEL-B; luego CEL-C", async () => {
    // Datos: QE2
  });
  test.fixme("[E6-F02#3] E6-F02-T07: Resuelve I1 en el detalle de H3 (E4-F03) y vuelve al Semáforo; luego reabre I1", async () => {
    // Datos: QE2
  });
  test.fixme("[E6-F02#3] E6-F02-T08: Resuelve I3 y vuelve al Semáforo; luego reabre I3", async () => {
    // Datos: QE1
  });
  test.fixme("[E6-F02#1] E6-F02-T09: Abre el Semáforo", async () => {
    // Datos: QE1 con Impedimentos detenido
  });
  test.fixme("[E6-F02#1] E6-F02-T10: Abre el Semáforo", async () => {
    // Datos: QE1 con Certificaciones detenido
  });
  test.fixme("[E6-F02#1] E6-F02-T11: Abre el Semáforo", async () => {
    // Datos: LID2 con CEL-D asignada (sin HDU)
  });
  test.fixme("[E6-F02#1] E6-F02-T12: Abren el Semáforo", async () => {
    // Datos: ANA1, ADM1
  });
});
