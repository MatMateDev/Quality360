
import { useBandejaQe } from "@/api/bandejas";
import { useInicioQe } from "@/api/inicio";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";
import { TarjetaContador } from "@/components/bandeja/TarjetaContador";
import "../../styles/qe-dashboard.css";
import { useState } from "react";
import { DistribucionDona } from "@/components/dashboard/Distribucion";
import "../../styles/admin-dashboard.css";

const ESTADOS_HDU = [
  ["PENDIENTE", "Pendiente"],
  ["DISENO_PRUEBAS", "Diseño de pruebas"],
  ["EN_EJECUCION", "En ejecución"],
  ["PENDIENTE_CIERRE", "Pendiente de cierre"],
  ["CERRADA", "Cerrada"],
] as const;

// Colores del gráfico según los tokens de Quality360.
const COLORES_ESTADOS = [
  "var(--q360-color-texto-secundario)",
  "var(--q360-color-acento)",
  "var(--q360-color-violeta)",
  "var(--q360-color-alerta)",
  "var(--q360-color-exito)",
] as const;
  const RADIO_CIERRE = 41.75;
  const CIRCUNFERENCIA_CIERRE = 2 * Math.PI * RADIO_CIERRE;
export function QeDashboardPage() {
  const [temaOscuro, setTemaOscuro] = useState(false);
  const [segmentoCierreActivo, setSegmentoCierreActivo] =
  useState<"cerradas" | "noCerradas" | null>(null);
  const inicio = useInicioQe();
  const bandeja = useBandejaQe(null);

  const equipo = inicio.data?.equipo;
  const hdu = inicio.data?.hdu;

  const datosHdu =
    hdu?.estado === "ok" ? hdu.datos : undefined;

  const estadoEquipo = inicio.isError
    ? "error"
    : inicio.isLoading
      ? "cargando"
      : equipo?.estado ?? "indisponible";

  const estadoHdu = inicio.isError
    ? "error"
    : inicio.isLoading
      ? "cargando"
      : hdu?.estado ?? "indisponible";

  const total = datosHdu?.hduEnAmbito;
  const cerradas = datosHdu?.porEstado.CERRADA;

  // Tasa de cierre, no avance individual de pruebas.
  const tasaCierre =
    total !== undefined &&
    total > 0 &&
    cerradas !== undefined
      ? Math.round((cerradas / total) * 100)
      : undefined;
// Longitud de los segmentos de la dona interactiva.
const longitudCerradas =
  total !== undefined &&
  total > 0 &&
  cerradas !== undefined
    ? (cerradas / total) * CIRCUNFERENCIA_CIERRE
    : 0;

  const longitudNoCerradas =
    CIRCUNFERENCIA_CIERRE - longitudCerradas;

const exportarReportePdf = async () => {
  if (!datosHdu) {
    return;
  }
const contadores =
  bandeja.isLoading || bandeja.isError
    ? undefined
    : bandeja.data?.impedimentos.contadores;

const abiertos = contadores?.impedimentosAbiertos;
const nuevos = contadores?.impedimentosNuevos;
const riesgoAlto = contadores?.hduRiesgoAlto;

  try {
    const { descargarReporteQePdf } = await import(
      "@/lib/reportesQePdf"
    );

    descargarReporteQePdf({
      totalHdu: datosHdu.hduEnAmbito,

      analistas:
        equipo?.estado === "ok"
          ? equipo.datos.analistasVigentes
          : null,

      cerradas: datosHdu.porEstado.CERRADA,

      estados: ESTADOS_HDU.map(([clave, etiqueta]) => ({
        clave,
        etiqueta,
        cantidad: datosHdu.porEstado[clave],
      })),

impedimentosAbiertos:
  abiertos?.estado === "ok"
    ? abiertos.datos.valor
    : null,

impedimentosNuevos24h:
  nuevos?.estado === "ok"
    ? nuevos.datos.valor
    : null,

hduRiesgoAlto:
  riesgoAlto?.estado === "ok"
    ? riesgoAlto.datos.valor
    : null,

    });
  } catch (error) {
    console.error("Error al generar el reporte PDF:", error);
    window.alert(
      "No se pudo generar el reporte PDF. Intenta nuevamente.",
    );
  }
};
const exportarReporteExcel = async () => {
  if (!datosHdu) {
    return;
  }

  const contadores =
    bandeja.isLoading || bandeja.isError
      ? undefined
      : bandeja.data?.impedimentos.contadores;

  const abiertos = contadores?.impedimentosAbiertos;
  const nuevos = contadores?.impedimentosNuevos;
  const riesgoAlto = contadores?.hduRiesgoAlto;

  try {
    const { descargarReporteQeExcel } = await import(
      "@/lib/reportesQeExcel"
    );

    await descargarReporteQeExcel({
      totalHdu: datosHdu.hduEnAmbito,

      analistas:
        equipo?.estado === "ok"
          ? equipo.datos.analistasVigentes
          : null,

      cerradas: datosHdu.porEstado.CERRADA,

      estados: ESTADOS_HDU.map(([clave, etiqueta]) => ({
        clave,
        etiqueta,
        cantidad: datosHdu.porEstado[clave],
      })),

      impedimentosAbiertos:
        abiertos?.estado === "ok"
          ? abiertos.datos.valor
          : null,

      impedimentosNuevos24h:
        nuevos?.estado === "ok"
          ? nuevos.datos.valor
          : null,

      hduRiesgoAlto:
        riesgoAlto?.estado === "ok"
          ? riesgoAlto.datos.valor
          : null,
    });
  } catch (error) {
    console.error("Error al exportar Excel QE:", error);
    window.alert(
      "No fue posible generar el reporte Excel."
    );
  }
};

 return (
    <div
  className={
    temaOscuro
      ? "qe-dashboard qe-dashboard--oscuro"
      : "qe-dashboard"
  }
>
      {/* ENCABEZADO */}
      <header className="qe-dashboard__hero">
        <div>
          <span className="qe-dashboard__etiqueta">
            Quality360 · Quality Engineer
          </span>

          <h1>Dashboard QE</h1>
          <p>
            Seguimiento de certificaciones, historias de usuario,
            equipo QA, riesgos e impedimentos.
          </p>
        </div>
        <div className="qe-dashboard__acciones">
          <button
              type="button"
              className="qe-dashboard__boton-tema"
              onClick={() => void exportarReportePdf()}
              disabled={!datosHdu}
              title="Descargar reporte de gestión QA en formato PDF"
        >
              Exportar PDF
        </button>

        <button
          type="button"
          className="qe-dashboard__boton-tema"
          onClick={() => void exportarReporteExcel()}
          disabled={!datosHdu}
          title="Descargar reporte de gestión QA en formato Excel"
        >
  Exportar Excel
</button>

        <button
            type="button"
            className="qe-dashboard__boton-tema"
            onClick={() => setTemaOscuro((actual) => !actual)}
        >
          {temaOscuro ? "☀ Modo claro" : "☾ Modo oscuro"}
        </button>
      </div>
  </header>
      {/* INDICADORES PRINCIPALES */}
      <section aria-labelledby="e6-titulo-resumen">
        <div className="panel-cabecera">
          <div>
            <h2 id="e6-titulo-resumen">
              Resumen de certificación QA
            </h2>

            <p>
              Indicadores del ámbito de supervisión del QE.
            </p>
          </div>
        </div>
        <div className="qe-dashboard__metricas">
          <TarjetaMetrica
            id="e6-hdu"
            titulo="HDU bajo supervisión"
            estado={estadoHdu}
            valor={total}
            onReintentar={() => inicio.refetch()}
          />

          <TarjetaMetrica
            id="e6-equipo"
            titulo="Analistas supervisados"
            estado={estadoEquipo}
            valor={
              equipo?.estado === "ok"
                ? equipo.datos.analistasVigentes
                : undefined
            }
            onReintentar={() => inicio.refetch()}
          />
          <TarjetaMetrica
            id="e6-cerradas"
            titulo="HDU cerradas"
            estado={estadoHdu}
            valor={cerradas}
            onReintentar={() => inicio.refetch()}
          />

          <TarjetaMetrica
            id="e6-porcentaje"
            titulo="Tasa de cierre de HDU"
            estado={
              estadoHdu === "ok" && total === 0
                ? "indisponible"
                : estadoHdu
            }
            valor={
              tasaCierre === undefined
                ? undefined
                : `${tasaCierre}%`
            }
            mensajeIndisponible={
              total === 0
                ? "Sin HDU para calcular"
                : undefined
            }
            onReintentar={() => inicio.refetch()}
          />
        </div>
      </section>

      {/* PANELES ANALÍTICOS */}
      <div className="qe-dashboard__contenido">
        {/* DISTRIBUCIÓN DE HDU */}
        <section
          className="qe-dashboard__panel"
          aria-labelledby="e6-titulo-estados"
        >
          <h2 id="e6-titulo-estados">
            Distribución de HDU por estado
          </h2>

          <p className="qe-dashboard__descripcion">
            Cantidad y proporción de historias en cada etapa
            del proceso de certificación.
          </p>

          {!datosHdu ? (
            <p role="status">
              {inicio.isLoading
                ? "Cargando distribución..."
                : "Distribución no disponible."}
            </p>
          ) : datosHdu.hduEnAmbito === 0 ? (
            <p>No hay HDU para mostrar.</p>
          ) : (
      <DistribucionDona
        id="e6-estado"
        titulo="Distribución de HDU por estado"
        unidad="HDU supervisadas"
        partes={ESTADOS_HDU.map(([clave, etiqueta], indice) => ({
          clave,
          etiqueta,
          valor: datosHdu.porEstado[clave],
          color:
            COLORES_ESTADOS[indice] ??
          "var(--q360-color-acento)",
      }))}
    />
  )}
          {/* SEGUNDA DONA: TASA DE CIERRE */}
          {tasaCierre !== undefined &&
            total !== undefined &&
            cerradas !== undefined && (
              <div className="qe-dashboard__cierre">
      <div
        className={`qe-dashboard__dona qe-dashboard__dona--cierre dash-dona${
        segmentoCierreActivo ? " dash-dona--resaltada" : ""
      }`}
  >
      <svg
        className="dash-dona__svg"
        viewBox="0 0 100 100"
        role="group"
        aria-label={`Tasa de cierre: ${cerradas} de ${total} HDU cerradas, ${tasaCierre}%`}
  >
        <g transform="rotate(-90 50 50)">
          {cerradas > 0 && (
          <circle
            className={`dash-dona__segmento${
            segmentoCierreActivo === "cerradas"
              ? " dash-dona__segmento--activo"
              : ""
          }`}
          cx="50"
          cy="50"
          r={RADIO_CIERRE}
          fill="none"
          stroke="var(--q360-color-exito)"
          strokeWidth="16.5"
          strokeDasharray={`${longitudCerradas} ${
            CIRCUNFERENCIA_CIERRE - longitudCerradas
          }`}
          tabIndex={0}
          aria-label={`Cerradas: ${cerradas} HDU, ${tasaCierre}%`}
          onMouseEnter={() => setSegmentoCierreActivo("cerradas")}
          onMouseLeave={() => setSegmentoCierreActivo(null)}
          onFocus={() => setSegmentoCierreActivo("cerradas")}
          onBlur={() => setSegmentoCierreActivo(null)}
        />
      )}

      {total > cerradas && (
        <circle
          className={`dash-dona__segmento${
            segmentoCierreActivo === "noCerradas"
              ? " dash-dona__segmento--activo"
              : ""
          }`}
          cx="50"
          cy="50"
          r={RADIO_CIERRE}
          fill="none"
          stroke="var(--q360-color-borde)"
          strokeWidth="16.5"
          strokeDasharray={`${longitudNoCerradas} ${
            CIRCUNFERENCIA_CIERRE - longitudNoCerradas
          }`}
          strokeDashoffset={-longitudCerradas}
          tabIndex={0}
          aria-label={`No cerradas: ${total - cerradas} HDU, ${
            100 - tasaCierre
          }%`}
          onMouseEnter={() => setSegmentoCierreActivo("noCerradas")}
          onMouseLeave={() => setSegmentoCierreActivo(null)}
          onFocus={() => setSegmentoCierreActivo("noCerradas")}
          onBlur={() => setSegmentoCierreActivo(null)}
        />
      )}
    </g>
  </svg>

  <div className="qe-dashboard__dona-centro" aria-hidden="true">
    <strong>
      {segmentoCierreActivo === "cerradas"
        ? cerradas
        : segmentoCierreActivo === "noCerradas"
          ? total - cerradas
          : `${tasaCierre}%`}
    </strong>

    <span>
      {segmentoCierreActivo === "cerradas"
        ? `Cerradas · ${tasaCierre}%`
        : segmentoCierreActivo === "noCerradas"
          ? `No cerradas · ${100 - tasaCierre}%`
          : "Tasa de cierre"}
    </span>
  </div>
</div>
               <div className="qe-dashboard__cierre-detalle">
                  <h3>Certificación y cierre</h3>

               
                <p>
                    <strong>{cerradas}</strong>{" "}
                    {cerradas === 1 ? "HDU cerrada" : "HDU cerradas"}
                </p>

              <p>
                <strong>{total - cerradas}</strong>{" "}
                {total - cerradas === 1
                  ? "HDU no cerrada"
                  : "HDU no cerradas"}
              </p>
                  <span>
                    Proporción de HDU cerradas respecto
                    del total supervisado.
                  </span>
                </div>
              </div>
            )}
        </section>

        {/* RIESGOS E IMPEDIMENTOS */}
        <section
          className="qe-dashboard__panel"
          aria-labelledby="e6-titulo-riesgos"
        >
          <h2 id="e6-titulo-riesgos">
            Riesgos e impedimentos
          </h2>

          <p className="qe-dashboard__descripcion">
            Situaciones que pueden afectar la ejecución
            y certificación de las HDU.
          </p>

          <div className="qe-dashboard__alertas">
            <TarjetaContador
              consulta={bandeja}
              id="e6-impedimentos"
              clave="e6-impedimentos"
              titulo="Impedimentos abiertos"
              contador={
                bandeja.data?.impedimentos.contadores
                  .impedimentosAbiertos
              }
              atencion
            />

            <TarjetaContador
              consulta={bandeja}
              id="e6-nuevos"
              clave="e6-nuevos"
              titulo="Impedimentos nuevos (24 h)"
              contador={
                bandeja.data?.impedimentos.contadores
                  .impedimentosNuevos
              }
            />

            <TarjetaContador
              consulta={bandeja}
              id="e6-riesgo"
              clave="e6-riesgo"
              titulo="HDU con riesgo alto"
              contador={
                bandeja.data?.impedimentos.contadores
                  .hduRiesgoAlto
              }
              atencion
            />
          </div>
        </section>
      </div>
    </div>
  );
}