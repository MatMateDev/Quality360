import { useState } from "react";
import { formatearDia, formatearDiaMes } from "@/lib/formato";
import type { SerieTendencia } from "@/types/dominio";
import { ESTILOS_SERIE, MuestraSerie, nombreSerie } from "./GraficaTendencia";

const DIA_MS = 86_400_000;
const dia = (fecha: string) => Math.round(Date.parse(`${fecha}T00:00:00Z`) / DIA_MS);
const aFecha = (d: number) => new Date(d * DIA_MS).toISOString().slice(0, 10);

function frase(s: SerieTendencia): string {
  const p = s.puntos;
  const primero = p[0]!;
  const ultimo = p[p.length - 1]!;
  const diff = Math.round(ultimo.cumplimiento) - Math.round(primero.cumplimiento);
  const cambio = p.length === 1 ? "" : diff === 0 ? ", sin cambios" : diff > 0 ? `, ${diff} ${diff === 1 ? "punto" : "puntos"} más` : `, ${-diff} ${diff === -1 ? "punto" : "puntos"} menos`;
  const huecos: string[] = [];
  for (let i = 1; i < p.length; i++) for (let d = dia(p[i - 1]!.fecha) + 1; d < dia(p[i]!.fecha); d++) huecos.push(formatearDiaMes(aFecha(d)));
  const dias = p.length === 1 ? "1 día de historial" : `${p.length} días de historial`;
  const rango = p.length === 1 ? ` (${Math.round(primero.cumplimiento)} % el ${formatearDiaMes(primero.fecha)})` : `, de ${Math.round(primero.cumplimiento)} % (${formatearDiaMes(primero.fecha)}) a ${Math.round(ultimo.cumplimiento)} % (${formatearDiaMes(ultimo.fecha)})${cambio}`;
  const faltan = huecos.length ? `, con ${huecos.length} ${huecos.length === 1 ? "día sin snapshot" : "días sin snapshot"} (${huecos.join(", ")})` : "";
  return `${nombreSerie(s)}: ${dias}${rango}${faltan}.`;
}

/** Resumen textual visible (enlazado con `aria-describedby` del gráfico). */
export function ResumenTendencia({ series, id }: { series: SerieTendencia[]; id: string }) {
  return (
    <div id={id} className="resumen-tendencia" data-testid="resumen-tendencia">
      {series.length > 3 ? (
        <ul>{series.map((s) => <li key={`${s.celula.id}${s.sprint.id}`}>{frase(s)}</li>)}</ul>
      ) : (
        series.map((s) => <p key={`${s.celula.id}${s.sprint.id}`}>{frase(s)}</p>)
      )}
    </div>
  );
}

export function LeyendaTendencia({ series }: { series: SerieTendencia[] }) {
  return (
    <>
      <ul className="leyenda-series" data-testid="leyenda-tendencia" aria-label="Series">
        {series.map((s, i) => {
          const ultimo = s.puntos[s.puntos.length - 1]!;
          return (
            <li key={`${s.celula.id}${s.sprint.id}`}>
              <MuestraSerie indice={i} />
              <span>
                {nombreSerie(s)} (último: {Math.round(ultimo.cumplimiento)} % el {formatearDiaMes(ultimo.fecha)})
              </span>
            </li>
          );
        })}
      </ul>
      <p className="campo-ayuda">Los huecos son días sin snapshot; no se estiman.</p>
    </>
  );
}

const POR_VEZ = 20;

/** Tabla con los mismos puntos del gráfico: siempre en el DOM, una fila por fecha y una columna por serie. */
export function TablaTendencia({ series }: { series: SerieTendencia[] }) {
  const [filas, setFilas] = useState(POR_VEZ);
  const fechas = [...new Set(series.flatMap((s) => s.puntos.map((p) => p.fecha)))].sort();
  return (
    <section aria-labelledby="titulo-datos-grafica">
      <h3 id="titulo-datos-grafica">Datos de la gráfica</h3>
      <div className="tabla-tendencia-contenedor">
        <table data-testid="tabla-tendencia">
          <caption>Cumplimiento promedio por fecha y serie</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              {series.map((s, i) => (
                <th scope="col" key={`${s.celula.id}${s.sprint.id}`}>
                  <MuestraSerie indice={i} /> {ESTILOS_SERIE[i % ESTILOS_SERIE.length]!.glifo} {nombreSerie(s)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fechas.slice(0, filas).map((f) => (
              <tr key={f}>
                <th scope="row">
                  <time dateTime={f}>{formatearDia(f)}</time>
                </th>
                {series.map((s) => {
                  const p = s.puntos.find((x) => x.fecha === f);
                  return (
                    <td key={`${s.celula.id}${s.sprint.id}`} data-label={nombreSerie(s)}>
                      {p ? (
                        `${Math.round(p.cumplimiento)} % · ${p.hduTotal} HDU`
                      ) : (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Sin snapshot</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fechas.length > filas ? (
        <button type="button" className="boton boton--secundario" data-testid="boton-ver-mas-tendencia" onClick={() => setFilas((n) => n + POR_VEZ)}>
          Mostrar más
        </button>
      ) : null}
    </section>
  );
}
