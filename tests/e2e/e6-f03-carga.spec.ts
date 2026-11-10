import { test } from "@playwright/test";

/**
 * E6-F03 · Carga de trabajo y umbral (12 casos). ESQUELETO de la Q1: todos los casos están pendientes (test.fixme) y NO certifican nada.
 * La Ola 7 los completa contra el stack real (fixture seed:e7 + seed:e4 + seed:e6; proyecto e6-e2e).
 * Fuente de los casos: docs/backlog/e6-indicadores-dashboards.md, sección 10. El ID del escenario va en el nombre: [E6-F03#n].
 */
test.describe("E6-F03 · Carga de trabajo y umbral", () => {
  test.fixme("[E6-F03#1] E6-F03-T01: Abre la pestaña Carga", async () => {
    // Datos: QE1
  });
  test.fixme("[E6-F03#1] E6-F03-T02: Abre la pestaña Carga", async () => {
    // Datos: QE2
  });
  test.fixme("[E6-F03#2] E6-F03-T03: Fija el umbral en 1", async () => {
    // Datos: QE1
  });
  test.fixme("[E6-F03#2] E6-F03-T04: Fija el umbral en 2", async () => {
    // Datos: QE1
  });
  test.fixme("[E6-F03#3] E6-F03-T05: Abre la pestaña Carga", async () => {
    // Datos: QE2 con ANA4 supervisada (ANA4 sin HDU)
  });
  test.fixme("[E6-F03#2] E6-F03-T06: Prueba 0, 51, 2.5, «abc» y vacío; luego 50", async () => {
    // Datos: QE1
  });
  test.fixme("[E6-F03#2] E6-F03-T07: Abre la pestaña Carga", async () => {
    // Datos: LID1 con el umbral de QE1 en 1
  });
  test.fixme("[E6-F03#2] E6-F03-T08: Abre la pestaña Carga", async () => {
    // Datos: AUD1
  });
  test.fixme("[E6-F03#2] E6-F03-T09: QE1 cambia el umbral de 5 a 1; QE2 abre su Carga", async () => {
    // Datos: QE1, QE2
  });
  test.fixme("[E6-F03#2] E6-F03-T10: Ambos abren la Carga", async () => {
    // Datos: ANA1 supervisada por QE1 (umbral 1); H4 (QE2 responsable) reasignada a ANA1 por ADM1; QE2 con umbral 5 (D190)
  });
  test.fixme("[E6-F03#1] E6-F03-T11: Abre la pestaña Carga", async () => {
    // Datos: QE1 con Certificaciones detenido
  });
  test.fixme("[E6-F03#1] E6-F03-T12: Abren la pestaña Carga", async () => {
    // Datos: ANA1, ADM1
  });
});
