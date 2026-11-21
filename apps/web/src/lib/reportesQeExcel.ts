
import writeXlsxFile, {
  type SheetData,
} from "write-excel-file/browser";

import type { DatosReporteQe } from "./reportesQePdf";

const AZUL = "#17365D";
const BLANCO = "#FFFFFF";

function cabecera(texto: string) {
  return {
    value: texto,
    fontWeight: "bold" as const,
    textColor: BLANCO,
    backgroundColor: AZUL,
  };
}

function titulo(texto: string) {
  return {
    value: texto,
    fontWeight: "bold" as const,
    fontSize: 15,
    textColor: AZUL,
  };
}

function valorDisponible(valor: number | null): number | string {
  return valor === null ? "N/D" : valor;
}

function proporcion(cantidad: number, total: number): number {
  return total > 0 ? cantidad / total : 0;
}

export async function descargarReporteQeExcel(
  datos: DatosReporteQe,
): Promise<void> {
  const totalEstados = datos.estados.reduce(
    (total, estado) => total + estado.cantidad,
    0,
  );

  if (
    !Number.isInteger(datos.totalHdu) ||
    datos.totalHdu < 0 ||
    !Number.isInteger(datos.cerradas) ||
    datos.cerradas < 0 ||
    datos.cerradas > datos.totalHdu ||
    datos.estados.some(
      (estado) =>
        !Number.isInteger(estado.cantidad) ||
        estado.cantidad < 0,
    ) ||
    totalEstados !== datos.totalHdu
  ) {
    throw new Error(
      "Los indicadores de certificación no son consistentes.",
    );
  }

  const fecha = new Date();

  const fechaTexto = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(fecha);

  const fechaArchivo = [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, "0"),
    String(fecha.getDate()).padStart(2, "0"),
  ].join("-");

  const tasaCierre =
    datos.totalHdu > 0
      ? proporcion(datos.cerradas, datos.totalHdu)
      : null;

  // HOJA 1: RESUMEN QE
  const resumen: SheetData = [
    [titulo("QUALITY360 - REPORTE DE GESTIÓN QA")],
    ["CALIDAD · VISIBILIDAD · ANÁLISIS · IMPACTO"],
    ["Perfil", "Quality Engineer (QE)"],
    ["Generado", fechaTexto],
    [],
    [cabecera("Indicador"), cabecera("Valor")],
    ["HU supervisadas", datos.totalHdu],
    ["Analistas QA", valorDisponible(datos.analistas)],
    ["HU cerradas", datos.cerradas],
    [
      "Tasa de cierre",
      tasaCierre === null
        ? "N/D"
        : { value: tasaCierre, format: "0%" },
    ],
    [],
    ["Fuente", "Dashboard QE de Quality360"],
    [
      "Ámbito",
      "Historias de usuario bajo supervisión del QE",
    ],
    ["Observación", "N/D: información no disponible"],
  ];

  // HOJA 2: DISTRIBUCIÓN DE HU
  const distribucion: SheetData = [
    [titulo("DISTRIBUCIÓN DE HISTORIAS DE USUARIO")],
    ["Generado", fechaTexto],
    [],
    [
      cabecera("Estado"),
      cabecera("Cantidad"),
      cabecera("Porcentaje"),
    ],
    ...datos.estados.map((estado) => [
      estado.etiqueta,
      estado.cantidad,
      {
        value: proporcion(estado.cantidad, datos.totalHdu),
        format: "0%",
      },
    ]),
    [],
    [
      { value: "TOTAL", fontWeight: "bold" as const },
      { value: datos.totalHdu, fontWeight: "bold" as const },
      {
        value: datos.totalHdu > 0 ? 1 : 0,
        format: "0%",
        fontWeight: "bold" as const,
      },
    ],
  ];

  // HOJA 3: RIESGOS E IMPEDIMENTOS
  const riesgos: SheetData = [
    [titulo("RIESGOS E IMPEDIMENTOS")],
    ["Generado", fechaTexto],
    [],
    [cabecera("Indicador"), cabecera("Valor")],
    [
      "Impedimentos abiertos",
      valorDisponible(datos.impedimentosAbiertos),
    ],
    [
      "Impedimentos nuevos (24 h)",
      valorDisponible(datos.impedimentosNuevos24h),
    ],
    [
      "HU con riesgo alto",
      valorDisponible(datos.hduRiesgoAlto),
    ],
    [],
    ["Observación", "N/D: información no disponible"],
  ];

  // GENERAR Y DESCARGAR EL ARCHIVO EXCEL
  await writeXlsxFile(
    [
      {
        sheet: "Resumen QE",
        data: resumen,
        columns: [
          { width: 34 },
          { width: 53 },
        ],
        showGridLines: false,
      },
      {
        sheet: "Distribución HU",
        data: distribucion,
        columns: [
          { width: 34 },
          { width: 18 },
          { width: 20 },
        ],
        showGridLines: false,
      },
      {
        sheet: "Riesgos e impedimentos",
        data: riesgos,
        columns: [
          { width: 35 },
          { width: 35 },
        ],
        showGridLines: false,
      },
    ],
    {
      fontFamily: "Calibri",
      fontSize: 11,
    },
  ).toFile(`Quality360_Reporte_QE_${fechaArchivo}.xlsx`);
}
