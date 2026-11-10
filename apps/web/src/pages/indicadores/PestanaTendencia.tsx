import { useId } from "react";
import { useTendencia } from "@/api/indicadores";
import { BarraFiltros, type CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { BloqueEstado } from "@/components/BloqueEstado";
import { LeyendaTendencia, ResumenTendencia, TablaTendencia } from "@/components/indicadores/AlternativaTendencia";
import { campoCelula, campoSprint } from "@/components/indicadores/camposFiltro";
import { filtrosDeUrl, useContextoIndicadores, useInformarVista } from "@/components/indicadores/contexto";
import { BloqueConsulta, SinDatos } from "@/components/indicadores/estados";
import { GraficaTendencia } from "@/components/indicadores/GraficaTendencia";

/** Tendencia (E6-F04): evolución del cumplimiento por (célula, sprint) con gráfico SVG, resumen y tabla. */
export function PestanaTendencia() {
  const { filtros, opciones } = useContextoIndicadores();
  const f = filtrosDeUrl(filtros);
  const rangoInvalido = Boolean(f.desde && f.hasta && f.hasta < f.desde);
  const consulta = useTendencia(f, !rangoInvalido);
  useInformarVista(consulta.data?.generadoEn, consulta.isPending && !rangoInvalido);
  const idEtiqueta = useId();
  const idResumen = useId();
  const datos = consulta.data;
  const ajustada = filtros.get("escala") === "1";
  const ambitoVacio = Boolean(datos?.sinDatos && datos.motivoSinDatos === "AMBITO_VACIO");

  const campos: CampoFiltro[] = [
    campoCelula(opciones.data),
    campoSprint(opciones.data),
    { clave: "desde", id: "filtro-desde", etiqueta: "Desde", tipo: "fecha" },
    { clave: "hasta", id: "filtro-hasta", etiqueta: "Hasta", tipo: "fecha" },
    { clave: "escala", id: "filtro-escala", etiqueta: "Ajustar escala a los valores", tipo: "casilla" },
  ];
  const fechasUnicas = datos ? new Set(datos.series.flatMap((s) => s.puntos.map((p) => p.fecha))).size : 0;
  const valores = datos?.series.flatMap((s) => s.puntos.map((p) => p.cumplimiento)) ?? [];

  return (
    <section data-testid="pestana-tendencia">
      {ambitoVacio ? null : <BarraFiltros filtros={filtros} campos={campos} clave="tendencia" />}
      {rangoInvalido ? (
        <p className="campo-error" role="alert" data-testid="error-rango-fechas">
          La fecha final debe ser igual o posterior a la inicial
        </p>
      ) : null}
      <p className="campo-ayuda" data-testid="nota-madrugada">
        Cada punto muestra el estado de la madrugada de esa fecha, es decir, el cierre del día anterior.
      </p>

      {rangoInvalido ? null : (
        <BloqueConsulta clave="tendencia" consulta={consulta}>
          {datos ? (
            datos.sinDatos ? (
              datos.motivoSinDatos === "SIN_HISTORIAL" ? (
                <div data-testid="aviso-sin-historial">
                  <BloqueEstado id="sin-historial" estado="vacio" mensaje="Aún no hay historial" />
                  <p>El sistema guarda una foto de los indicadores una vez al día. La tendencia aparecerá desde la primera.</p>
                </div>
              ) : (
                <SinDatos
                  mensaje={ambitoVacio ? "Aún no tienes HDU en tu ámbito" : "No hay historial para esos filtros"}
                  onLimpiar={ambitoVacio ? undefined : () => filtros.limpiar(["celula", "sprint", "desde", "hasta"])}
                />
              )
            ) : (
              <>
                <h2>Evolución del cumplimiento promedio</h2>
                {datos.totalSeries > datos.series.length ? (
                  <p className="mensaje-aviso" role="note" data-testid="mensaje-aviso">
                    Mostrando {datos.series.length} de {datos.totalSeries} series. Filtra por célula o sprint para ver otras.
                  </p>
                ) : null}
                {fechasUnicas === 1 ? (
                  <p className="mensaje-aviso" role="note" data-testid="aviso-un-solo-dia">
                    Aún hay un solo día de historial
                  </p>
                ) : null}
                <ResumenTendencia series={datos.series} id={idResumen} />
                {ajustada ? (
                  <p className="campo-ayuda">
                    Escala ajustada: {Math.round(Math.min(...valores))} % a {Math.round(Math.max(...valores))} %
                  </p>
                ) : null}
                <figure className="figura-tendencia">
                  <figcaption id={idEtiqueta}>Cumplimiento promedio por fecha y serie</figcaption>
                  <GraficaTendencia series={datos.series} ajustada={ajustada} idEtiqueta={idEtiqueta} idDescripcion={idResumen} />
                </figure>
                <LeyendaTendencia series={datos.series} />
                <TablaTendencia series={datos.series} />
              </>
            )
          ) : null}
        </BloqueConsulta>
      )}
    </section>
  );
}
