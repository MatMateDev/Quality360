import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { FILAS_POR_VEZ, esIndisponible, useFilasPorResultado } from "@/api/integraciones";
import { BloqueEstado } from "@/components/BloqueEstado";
import { textoMotivo } from "@/lib/mensajesIntegracion";
import { ETIQUETAS_PRIORIDAD, type FilaEjecucion, type PrioridadHdu, type ResultadoFila } from "@/types/dominio";
import { CeldaCambios } from "./CeldaCambios";
import { ChipsAdvertencias, InsigniaFilaEjecucion } from "./Insignias";

type Clave = "creadas" | "actualizadas" | "omitidas" | "error";

const SECCIONES: Array<{ clave: Clave; titulo: string; resultado: ResultadoFila; lista: string }> = [
  { clave: "creadas", titulo: "HDU creadas", resultado: "CREADA", lista: "lista-hdu-creadas" },
  { clave: "actualizadas", titulo: "HDU actualizadas", resultado: "ACTUALIZADA", lista: "lista-hdu-actualizadas" },
  { clave: "omitidas", titulo: "Omitidas", resultado: "OMITIDA", lista: "lista-hdu-omitidas" },
  { clave: "error", titulo: "Filas con error", resultado: "ERROR", lista: "lista-filas-con-error" },
];

function CodigoFila({ fila }: { fila: FilaEjecucion }) {
  if (!fila.codigo) return <span>—</span>;
  return fila.idHistoria ? (
    <Link className="codigo" to={`/hdu/${fila.idHistoria}`}>
      {fila.codigo}
    </Link>
  ) : (
    <span className="codigo">{fila.codigo}</span>
  );
}

function FilaResultado({ fila, resultado }: { fila: FilaEjecucion; resultado: ResultadoFila }) {
  const prioridad = fila.cambios?.prioridad?.despues;
  return (
    <li className="fila-resultado" data-testid={`fila-resultado-${fila.fila}`}>
      {resultado === "ERROR" ? <span>Fila {fila.fila}</span> : null}
      <CodigoFila fila={fila} />
      {fila.titulo ? <span>{fila.titulo}</span> : null}
      {resultado === "CREADA" && prioridad ? <span>{ETIQUETAS_PRIORIDAD[prioridad as PrioridadHdu] ?? prioridad}</span> : null}
      {resultado === "ACTUALIZADA" ? <CeldaCambios cambios={fila.cambios} testId={`celda-cambios-${fila.fila}`} /> : null}
      {resultado === "OMITIDA" || resultado === "ERROR" ? (
        <>
          {resultado === "ERROR" ? <InsigniaFilaEjecucion resultado="ERROR" /> : null}
          <span>{textoMotivo(fila.motivo)}</span>
        </>
      ) : null}
      <ChipsAdvertencias advertencias={fila.advertencias} />
    </li>
  );
}

function Seccion({ ejecucionId, definicion, cantidad }: { ejecucionId: string; definicion: (typeof SECCIONES)[number]; cantidad: number }) {
  // Abiertas por defecto las que tienen filas, salvo «Omitidas».
  const [abierta, setAbierta] = useState(cantidad > 0 && definicion.clave !== "omitidas");
  const idPanel = useId();
  const consulta = useFilasPorResultado(ejecucionId, definicion.resultado, abierta && cantidad > 0);
  const filas = consulta.data?.pages.flatMap((p) => p.items) ?? [];

  if (cantidad === 0) {
    return (
      <div className="disclosure">
        <h3>
          {definicion.titulo} (0)
        </h3>
      </div>
    );
  }

  return (
    <div className="disclosure">
      <h3>
        <button type="button" className="disclosure__boton" data-testid={`boton-seccion-${definicion.clave}`} aria-expanded={abierta} aria-controls={idPanel} onClick={() => setAbierta((v) => !v)}>
          <span aria-hidden="true">{abierta ? "▾" : "▸"}</span> {definicion.titulo} ({cantidad})
        </button>
      </h3>
      <div id={idPanel} hidden={!abierta}>
        {abierta ? (
          consulta.isError ? (
            <div data-testid={`estado-${esIndisponible(consulta.error) ? "indisponible" : "error"}-${definicion.lista}`}>
              <BloqueEstado id={definicion.lista} estado={esIndisponible(consulta.error) ? "indisponible" : "error"} mensaje={esIndisponible(consulta.error) ? "No disponible" : undefined} onReintentar={() => void consulta.refetch()} />
            </div>
          ) : consulta.isLoading ? (
            <div aria-busy="true" aria-hidden="true" data-testid={`estado-cargando-${definicion.lista}`}>
              <span className="esqueleto-fila" />
              <span className="esqueleto-fila" />
              <span className="esqueleto-fila" />
            </div>
          ) : (
            <>
              <ul className="lista-filas-ejecucion" data-testid={definicion.lista}>
                {filas.map((fila) => (
                  <FilaResultado key={fila.fila} fila={fila} resultado={definicion.resultado} />
                ))}
              </ul>
              {consulta.hasNextPage ? (
                <button type="button" className="boton boton--secundario" data-testid={`boton-ver-mas-${definicion.clave}`} disabled={consulta.isFetchingNextPage} onClick={() => void consulta.fetchNextPage()}>
                  Mostrar más ({Math.min(FILAS_POR_VEZ, cantidad - filas.length)} de {cantidad - filas.length} restantes)
                </button>
              ) : null}
            </>
          )
        ) : null}
      </div>
    </div>
  );
}

/** Las cuatro listas del resultado, cargadas bajo demanda con `GET …/detalle?resultado=` (D113), de 25 en 25. */
export function ListasFilasEjecucion({ ejecucionId, creadas, actualizadas, omitidas, conError }: { ejecucionId: string; creadas: number; actualizadas: number; omitidas: number; conError: number }) {
  const cantidades: Record<Clave, number> = { creadas, actualizadas, omitidas, error: conError };
  return (
    <div data-testid="listas-filas-ejecucion">
      {SECCIONES.map((definicion) => (
        <Seccion key={`${ejecucionId}-${definicion.clave}`} ejecucionId={ejecucionId} definicion={definicion} cantidad={cantidades[definicion.clave]} />
      ))}
    </div>
  );
}
