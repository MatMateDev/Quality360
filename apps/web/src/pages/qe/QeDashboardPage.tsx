
import { useBandejaQe } from "@/api/bandejas";
import { useInicioQe } from "@/api/inicio";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";
import { TarjetaContador } from "@/components/bandeja/TarjetaContador";

export function QeDashboardPage() {
  const inicio = useInicioQe();
  const bandeja = useBandejaQe(null);

  const equipo = inicio.data?.equipo;
  const hdu = inicio.data?.hdu;
  const datosHdu = hdu?.estado === "ok" ? hdu.datos : undefined;

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

  const porcentaje =
    total !== undefined && total > 0 && cerradas !== undefined
      ? Math.round((cerradas / total) * 100)
      : undefined;

  return (
    <div>
      <h1>Dashboard QE</h1>
      <p>Indicadores de seguimiento y certificación Quality360.</p>

      <section>
        <h2>HDU y equipo supervisado</h2>

        <div className="tarjetas-resumen">
          <TarjetaMetrica
            id="e6-equipo"
            titulo="Analistas supervisados"
            estado={estadoEquipo}
            valor={equipo?.estado === "ok" ? equipo.datos.analistasVigentes : undefined}
            onReintentar={() => inicio.refetch()}
          />

          <TarjetaMetrica
            id="e6-hdu"
            titulo="HDU bajo supervisión"
            estado={estadoHdu}
            valor={total}
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
            titulo="Porcentaje de HDU cerradas"
            estado={estadoHdu === "ok" && total === 0 ? "indisponible" : estadoHdu}
            valor={porcentaje === undefined ? undefined : `${porcentaje}%`}
            mensajeIndisponible={total === 0 ? "Sin HDU para calcular" : undefined}
            onReintentar={() => inicio.refetch()}
          />
        </div>
      </section>

      <section>
        
    <section className="panel" aria-labelledby="e6-titulo-estados">
        <h2 id="e6-titulo-estados">Distribución de HDU por estado</h2>
    <p>Historias del ámbito de supervisión QE.</p>

    {!datosHdu ? (
        <p role="status">
        {inicio.isLoading
        ? "Cargando distribución..."
        : "Distribución no disponible."}
    </p>
  ) : datosHdu.hduEnAmbito === 0 ? (
    <p>No hay HDU para mostrar.</p>
  ) : (
    <div>
      {([
        ["PENDIENTE", "Pendiente"],
        ["DISENO_PRUEBAS", "Diseño de pruebas"],
        ["EN_EJECUCION", "En ejecución"],
        ["PENDIENTE_CIERRE", "Pendiente de cierre"],
        ["CERRADA", "Cerrada"],
      ] as const).map(([clave, etiqueta]) => {
        const cantidad = datosHdu.porEstado[clave];
        const totalHdu = datosHdu.hduEnAmbito;
        const porcentaje = Math.round((cantidad / totalHdu) * 100);

        return (
          <div key={clave} style={{ marginBottom: "1rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <span>{etiqueta}</span>
              <strong data-testid={`e6-estado-${clave}`}>
                {cantidad} ({porcentaje}%)
              </strong>
            </div>

            <progress
              value={cantidad}
              max={totalHdu}
              aria-label={`HDU ${etiqueta}`}
              style={{ width: "100%" }}
            />
          </div>
        );
      })}
    </div>
  )}
</section>

        <h2>Impedimentos y riesgos</h2>
        <p>Indicadores de HDU donde el QE es responsable.</p>

        <div className="tarjetas-resumen">
          <TarjetaContador
            consulta={bandeja}
            id="e6-impedimentos"
            clave="e6-impedimentos"
            titulo="Impedimentos abiertos"
            contador={bandeja.data?.impedimentos.contadores.impedimentosAbiertos}
            atencion
          />

          <TarjetaContador
            consulta={bandeja}
            id="e6-nuevos"
            clave="e6-nuevos"
            titulo="Impedimentos nuevos (24 h)"
            contador={bandeja.data?.impedimentos.contadores.impedimentosNuevos}
          />

          <TarjetaContador
            consulta={bandeja}
            id="e6-riesgo"
            clave="e6-riesgo"
            titulo="HDU en riesgo alto"
            contador={bandeja.data?.impedimentos.contadores.hduRiesgoAlto}
            atencion
          />
        </div>
      </section>
    </div>
  );
}
