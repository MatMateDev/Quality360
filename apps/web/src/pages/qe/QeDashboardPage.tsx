
import { useBandejaQe } from "@/api/bandejas";
import { useInicioQe } from "@/api/inicio";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";
import { TarjetaContador } from "@/components/bandeja/TarjetaContador";
import "../../styles/qe-dashboard.css";

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
  "var(--q360-color-lider)",
  "var(--q360-color-alerta)",
  "var(--q360-color-exito)",
] as const;

// Construye un gráfico de dona con los valores de HDU.
function crearGradienteEstados(cantidades: readonly number[]): string {
  const total = cantidades.reduce(
    (suma, cantidad) => suma + cantidad,
    0,
  );

  if (total === 0) {
    return "var(--q360-color-borde)";
  }

  let acumulado = 0;

  const segmentos = cantidades.map((cantidad, indice) => {
    const desde = (acumulado / total) * 100;

    acumulado += cantidad;

    const hasta = (acumulado / total) * 100;
    const color =
      COLORES_ESTADOS[indice] ?? "var(--q360-color-acento)";

    return `${color} ${desde}% ${hasta}%`;
  });

  return `conic-gradient(${segmentos.join(", ")})`;
}

export function QeDashboardPage() {
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

  // Distribución de los cinco estados.
  const gradienteEstados =
    datosHdu && datosHdu.hduEnAmbito > 0
      ? crearGradienteEstados(
          ESTADOS_HDU.map(
            ([clave]) => datosHdu.porEstado[clave],
          ),
        )
      : undefined;

  return (
    <div className="qe-dashboard">
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

        <span className="qe-dashboard__insignia">
          Analítica E6
        </span>
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
            <div className="qe-dashboard__distribucion">
              {/* GRÁFICO DE DONA */}
              <div
                className="qe-dashboard__dona"
                style={{ background: gradienteEstados }}
                aria-hidden="true"
              >
                <div className="qe-dashboard__dona-centro">
                  <strong>{datosHdu.hduEnAmbito}</strong>
                  <span>HDU supervisadas</span>
                </div>
              </div>

              {/* BARRAS Y LEYENDA DE ESTADOS */}
              <div className="qe-dashboard__estados">
                {ESTADOS_HDU.map(([clave, etiqueta]) => {
                  const cantidad =
                    datosHdu.porEstado[clave];

                  const totalHdu =
                    datosHdu.hduEnAmbito;

                  const porcentaje = Math.round(
                    (cantidad / totalHdu) * 100,
                  );

                  return (
                    <div
                      key={clave}
                      className="qe-dashboard__estado"
                    >
                      <div className="qe-dashboard__estado-cabecera">
                        <span>{etiqueta}</span>

                        <strong
                          data-testid={`e6-estado-${clave}`}
                        >
                          {cantidad} ({porcentaje}%)
                        </strong>
                      </div>

                      <progress
                        value={cantidad}
                        max={totalHdu}
                        aria-label={`HDU ${etiqueta}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* SEGUNDA DONA: TASA DE CIERRE */}
          {tasaCierre !== undefined &&
            total !== undefined &&
            cerradas !== undefined && (
              <div className="qe-dashboard__cierre">
                <div
                  className="qe-dashboard__dona qe-dashboard__dona--cierre"
                  style={{
                    background: `conic-gradient(
                      var(--q360-color-exito) 0% ${tasaCierre}%,
                      var(--q360-color-borde) ${tasaCierre}% 100%
                    )`,
                  }}
                  aria-hidden="true"
                >
                  <div className="qe-dashboard__dona-centro">
                    <strong>{tasaCierre}%</strong>
                    <span>Tasa de cierre</span>
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