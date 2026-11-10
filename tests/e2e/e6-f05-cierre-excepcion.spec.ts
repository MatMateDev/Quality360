import { test } from "@playwright/test";

/**
 * E6-F05 · Cierre con excepción (portal) (10 casos). ESQUELETO de la Q1: todos los casos están pendientes (test.fixme) y NO certifican nada.
 * La Ola 7 los completa contra el stack real (fixture seed:e7 + seed:e4 + seed:e6; proyecto e6-e2e).
 * Fuente de los casos: docs/backlog/e6-indicadores-dashboards.md, sección 10. El ID del escenario va en el nombre: [E6-F05#n].
 */
test.describe("E6-F05 · Cierre con excepción (portal)", () => {
  test.fixme("[E6-F05#1] E6-F05-T01: Abre /hdu/<H2> y pulsa boton-cerrar-excepcion", async () => {
    // Datos: QE1, H2 en PENDIENTE_CIERRE (1 aprobado)
  });
  test.fixme("[E6-F05#2] E6-F05-T02: Confirma vacío; luego con 19 caracteres; luego intenta escribir 501", async () => {
    // Datos: QE1, mismo cuadro
  });
  test.fixme("[E6-F05#1] E6-F05-T03: Escribe una justificación de 40 caracteres y confirma", async () => {
    // Datos: QE1
  });
  test.fixme("[E6-F05#3] E6-F05-T04: Revisa el detalle", async () => {
    // Datos: QE1 tras T03
  });
  test.fixme("[E6-F05#3] E6-F05-T05: Abren /hdu/<H2>", async () => {
    // Datos: LID1, AUD1 tras T03
  });
  test.fixme("[E6-F05#1] E6-F05-T06: Abren una HDU en PENDIENTE_CIERRE con menos de 10 aprobados (H5 llevada a ese estado)", async () => {
    // Datos: QE2, ANA2, LID1, AUD1, ADM1
  });
  test.fixme("[E6-F05#2] E6-F05-T07: Escribe una justificación válida y confirma", async () => {
    // Datos: QE1, H1 en PENDIENTE_CIERRE con I2 abierto
  });
  test.fixme("[E6-F05#1] E6-F05-T08: Abre /hdu/<H8>", async () => {
    // Datos: QE1, H8 (10 aprobados, certificado F8)
  });
  test.fixme("[E6-F05#1] E6-F05-T09: Abre /hdu/<H2> y pulsa cerrar", async () => {
    // Datos: QE1 con Certificaciones detenido
  });
  test.fixme("[E6-F05#regresión] E6-F05-T10: Ejecuta las pruebas certificadas de E2-F04, E3-F01 y E7-F03", async () => {
    // Datos: QE1, ANA1, AUD1
  });
});
