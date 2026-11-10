import { useCallback, useRef, useState } from "react";
import { useSemaforo } from "@/api/indicadores";
import { BarraFiltros } from "@/components/bandeja/BarraFiltros";
import { campoCelula } from "@/components/indicadores/camposFiltro";
import { filtrosDeUrl, useContextoIndicadores, useInformarVista } from "@/components/indicadores/contexto";
import { BloqueConsulta, SinDatos } from "@/components/indicadores/estados";
import { PanelDrilldown } from "@/components/indicadores/PanelDrilldown";
import { TarjetaCelula } from "@/components/indicadores/TarjetaCelula";

function AyudaCalculoSemaforo() {
  return (
    <details className="ayuda-calculo" data-testid="ayuda-calculo-semaforo">
      <summary>¿Cómo se calcula el color?</summary>
      <table>
        <caption className="sr-only">Regla de color del semáforo</caption>
        <tbody>
          <tr>
            <th scope="row">▲ Rojo</th>
            <td>Alguna HDU no cerrada tiene riesgo Alto o algún impedimento escalado.</td>
          </tr>
          <tr>
            <th scope="row">◆ Amarillo</th>
            <td>Sin rojo, y alguna HDU no cerrada tiene riesgo Medio o algún impedimento abierto.</td>
          </tr>
          <tr>
            <th scope="row">● Verde</th>
            <td>Hay HDU no cerradas y todas tienen riesgo Bajo y ningún impedimento abierto ni escalado; o la célula solo tiene HDU cerradas.</td>
          </tr>
          <tr>
            <th scope="row">○ Sin HDU</th>
            <td>La célula no tiene HDU en tu ámbito.</td>
          </tr>
        </tbody>
      </table>
      <p>Las HDU cerradas no cuentan. El color depende de las HDU a las que tienes acceso, por eso puede verse distinto para otro rol.</p>
    </details>
  );
}

/** Semáforo por célula (E6-F02). El sprint no filtra (3.4); el drill-down vive en `?detalle=` (§1.8). */
export function PestanaSemaforo() {
  const { filtros, opciones } = useContextoIndicadores();
  const { celulaId } = filtrosDeUrl(filtros);
  const consulta = useSemaforo(celulaId);
  useInformarVista(consulta.data?.generadoEn, consulta.isPending);
  const detalle = filtros.get("detalle");
  const datos = consulta.data;
  const [sinAcceso, setSinAcceso] = useState(false);
  const botones = useRef(new Map<string, HTMLButtonElement | null>());

  const quitarDetalle = useCallback(() => filtros.set({ detalle: undefined }), [filtros]);
  const alSinAcceso = useCallback(() => {
    setSinAcceso(true);
    filtros.set({ detalle: undefined });
  }, [filtros]);

  const seleccionada = datos?.celulas.find((c) => c.celula.id === detalle);
  const ambitoVacio = Boolean(datos?.sinDatos && datos.motivoSinDatos === "AMBITO_VACIO");

  function cerrar() {
    const id = detalle;
    quitarDetalle();
    if (id) setTimeout(() => botones.current.get(id)?.focus(), 0);
  }

  return (
    <section data-testid="pestana-semaforo">
      {ambitoVacio ? null : <BarraFiltros filtros={filtros} campos={[campoCelula(opciones.data)]} clave="semaforo" />}
      <AyudaCalculoSemaforo />
      {sinAcceso ? (
        <p className="mensaje-error-global" role="alert" data-testid="aviso-sin-acceso-celula">
          No tienes acceso a esa célula
        </p>
      ) : null}

      <BloqueConsulta clave="semaforo" consulta={consulta}>
        {datos ? (
          datos.sinDatos ? (
            <SinDatos mensaje={ambitoVacio ? "Aún no tienes HDU en tu ámbito" : "No hay HDU con esos filtros"} onLimpiar={ambitoVacio ? undefined : () => filtros.limpiar(["celula"])} />
          ) : (
            <>
              <h2>Células ({datos.celulas.length})</h2>
              <div className="rejilla-celulas">
                {datos.celulas.map((c) => (
                  <TarjetaCelula
                    key={c.celula.id}
                    celula={c}
                    seleccionada={detalle === c.celula.id}
                    onVerDetalle={() => {
                      setSinAcceso(false);
                      filtros.set({ detalle: c.celula.id });
                    }}
                    ref={(el) => {
                      botones.current.set(c.celula.id, el);
                    }}
                  />
                ))}
              </div>
              {detalle ? (
                <PanelDrilldown celulaId={detalle} celulaNombre={seleccionada?.celula.nombre ?? "la célula"} onCerrar={cerrar} onSinAcceso={alSinAcceso} />
              ) : null}
            </>
          )
        ) : null}
      </BloqueConsulta>
    </section>
  );
}
