
import { jsPDF } from "jspdf";
import logoQuality360Es from "../assets/quality360-logo-es-pdf.png?inline";

export interface DatosReporteQe {
  totalHdu: number;
  analistas: number | null;
  cerradas: number;
  estados: readonly {
    clave: string;
    etiqueta: string;
    cantidad: number;
  }[];
  impedimentosAbiertos: number | null;
  impedimentosNuevos24h: number | null;
  hduRiesgoAlto: number | null;
}

const COLORES_ESTADOS = [
  "#64748B",
  "#2563EB",
  "#8B5CF6",
  "#D97706",
  "#059669",
];

const COLOR_CERRADAS = "#059669";
const COLOR_NO_CERRADAS = "#94A3B8";

function porcentaje(cantidad: number, total: number): number {
  return total > 0 ? Math.round((cantidad / total) * 100) : 0;
}

function mostrarValor(valor: number | null): string {
  return valor === null ? "N/D" : String(valor);
}

function rgb(hex: string): [number, number, number] {
  const limpio = hex.replace("#", "");

  return [
    parseInt(limpio.slice(0, 2), 16),
    parseInt(limpio.slice(2, 4), 16),
    parseInt(limpio.slice(4, 6), 16),
  ];
}

function dibujarDona(
  pdf: jsPDF,
  centroX: number,
  centroY: number,
  partes: readonly { cantidad: number; color: string }[],
  valorCentral: string,
  textoCentral: string,
): void {
  const total = partes.reduce(
    (suma, parte) => suma + parte.cantidad,
    0,
  );

  // Canvas de alta resolución para obtener arcos uniformes.
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 600;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("No se pudo generar el gráfico de dona.");
  }

  const centro = 300;
  const radio = 242;
  const grosor = 76;

  ctx.lineWidth = grosor;
  ctx.lineCap = "butt";

  // Anillo de fondo.
  ctx.beginPath();
  ctx.arc(centro, centro, radio, 0, Math.PI * 2);
  ctx.strokeStyle = "#E2E8F0";
  ctx.stroke();

  // Segmentos proporcionales a los indicadores.
  if (total > 0) {
    let anguloActual = -Math.PI / 2;

    for (const parte of partes) {
      if (parte.cantidad <= 0) {
        continue;
      }

      const recorrido =
        (parte.cantidad / total) * Math.PI * 2;

      ctx.beginPath();

      // Ligero solapamiento para evitar líneas entre arcos.
      ctx.arc(
        centro,
        centro,
        radio,
        anguloActual - 0.002,
        anguloActual + recorrido + 0.002,
      );

      ctx.strokeStyle = parte.color;
      ctx.stroke();

      anguloActual += recorrido;
    }
  }

  // Insertar gráfico en el PDF.
  const tamano = 52;

  pdf.addImage(
    canvas.toDataURL("image/png"),
    "PNG",
    centroX - tamano / 2,
    centroY - tamano / 2,
    tamano,
    tamano,
  );

  // Valor central.
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);

  pdf.text(valorCentral, centroX, centroY, {
    align: "center",
  });

  // Etiqueta central.
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);

  pdf.text(textoCentral, centroX, centroY + 6, {
    align: "center",
  });
}
  // Centrar ambos textos.
  // Se ajusta mediante el ancho de cada cadena.

function dibujarIndicador(
  pdf: jsPDF,
  x: number,
  y: number,
  titulo: string,
  valor: string,
): void {
  pdf.setFillColor(243, 246, 250);
  pdf.roundedRect(x, y, 42, 26, 2, 2, "F");

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  pdf.text(titulo, x + 4, y + 8);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.setTextColor(15, 23, 42);
  pdf.text(valor, x + 4, y + 20);
}

export function descargarReporteQePdf(
  datos: DatosReporteQe,
): void {
  const totalEstados = datos.estados.reduce(
    (suma, estado) => suma + estado.cantidad,
    0,
  );

  if (
    datos.totalHdu < 0 ||
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

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const fecha = new Date();
  const fechaTexto = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(fecha);

  const tasa =
    datos.totalHdu > 0
      ? porcentaje(datos.cerradas, datos.totalHdu)
      : null;

  pdf.setProperties({
    title: "Quality360 - Reporte de Gestión QA",
    subject: "Indicadores del Dashboard QE",
    author: "Quality360",
  });


  // ENCABEZADO CON LOGOTIPO QUALITY360
  pdf.addImage(
    logoQuality360Es,
    "PNG",
    16,
    7,
    36,
    36,
  );

  // Título principal
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("Reporte de Gestión QA", 58, 18);

  // Perfil
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text("Dashboard Quality Engineer (QE)", 58, 25);

  // Lema en español
  pdf.setFontSize(8);
  pdf.text(
    "CALIDAD · VISIBILIDAD · ANÁLISIS · IMPACTO",
    58,
    33,
  );

  // Fecha de generación
  pdf.setFontSize(9);
  pdf.text(`Generado: ${fechaTexto}`, 58, 41);

  // Línea separadora
  pdf.setLineWidth(0.3);
  pdf.setDrawColor(220, 226, 233);
  pdf.line(16, 46, 194, 46);


  // INDICADORES PRINCIPALES
  dibujarIndicador(
    pdf, 16, 52, "HU supervisadas",
    String(datos.totalHdu),
  );

  dibujarIndicador(
    pdf, 61, 52, "Analistas QA",
    mostrarValor(datos.analistas),
  );

  dibujarIndicador(
    pdf, 106, 52, "HU cerradas",
    String(datos.cerradas),
  );

  dibujarIndicador(
    pdf, 151, 52, "Tasa de cierre",
    tasa === null ? "N/D" : `${tasa}%`,
  );

  // TÍTULOS DE LOS GRÁFICOS
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text("HU por estado", 16, 88);
  pdf.text("Tasa de cierre", 118, 88);

  // PRIMERA DONA: DISTRIBUCIÓN DE HU
  dibujarDona(
    pdf,
    59,
    119,
    datos.estados.map((estado, indice) => ({
      cantidad: estado.cantidad,
      color: COLORES_ESTADOS[indice % COLORES_ESTADOS.length],
    })),
    String(datos.totalHdu),
    "HU supervisadas",
  );

  // SEGUNDA DONA: TASA DE CIERRE
  dibujarDona(
    pdf,
    151,
    119,
    [
      {
        cantidad: datos.cerradas,
        color: COLOR_CERRADAS,
      },
      {
        cantidad: datos.totalHdu - datos.cerradas,
        color: COLOR_NO_CERRADAS,
      },
    ],
    tasa === null ? "N/D" : `${tasa}%`,
    "Tasa de cierre",
  );

  // LEYENDA DE ESTADOS
  datos.estados.forEach((estado, indice) => {
    const y = 152 + indice * 8;
    const [rojo, verde, azul] = rgb(
      COLORES_ESTADOS[indice % COLORES_ESTADOS.length],
    );

    pdf.setFillColor(rojo, verde, azul);
    pdf.rect(17, y - 3, 3, 3, "F");

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(30, 41, 59);
    pdf.text(estado.etiqueta, 23, y);

    pdf.text(
      `${estado.cantidad} (${porcentaje(
        estado.cantidad,
        datos.totalHdu,
      )}%)`,
      108,
      y,
      { align: "right" },
    );
  });

  // DETALLE DE CIERRE
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(30, 41, 59);

  pdf.text(
    `Cerradas: ${datos.cerradas}`,
    123,
    158,
  );

  pdf.text(
    `No cerradas: ${datos.totalHdu - datos.cerradas}`,
    123,
    168,
  );

  // RIESGOS E IMPEDIMENTOS
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Riesgos e impedimentos", 16, 207);

  dibujarIndicador(
    pdf, 16, 215, "Imp. abiertos",
    mostrarValor(datos.impedimentosAbiertos),
  );

  dibujarIndicador(
    pdf, 73, 215, "Nuevos (24 h)",
    mostrarValor(datos.impedimentosNuevos24h),
  );

  dibujarIndicador(
    pdf, 130, 215, "HU riesgo alto",
    mostrarValor(datos.hduRiesgoAlto),
  );

  // TRAZABILIDAD DEL REPORTE
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(71, 85, 105);

  pdf.text(
    "Fuente: indicadores del Dashboard QE disponibles al generar el reporte.",
    16,
    258,
  );

  pdf.text(
    "Ámbito: historias de usuario bajo supervisión del QE.",
    16,
    265,
  );

  pdf.text(
    "N/D indica información no disponible.",
    16,
    272,
  );

  pdf.setLineWidth(0.3);
  pdf.setDrawColor(220, 226, 233);
  pdf.line(16, 280, 194, 280);


  pdf.setFontSize(8);
  pdf.text("Quality360 | Gestión y seguimiento de certificaciones QA", 16, 286);
  pdf.text("Página 1 de 1", 194, 286, { align: "right" });

  const fechaArchivo = [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, "0"),
    String(fecha.getDate()).padStart(2, "0"),
  ].join("-");

  pdf.save(`Quality360_Reporte_QE_${fechaArchivo}.pdf`);
}