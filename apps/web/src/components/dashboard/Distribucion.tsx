import { useState, type CSSProperties } from "react";

/** Una parte del total: rol, estado… El color es un token o variable CSS, para que el tema oscuro lo cambie. */
export interface ParteDistribucion {
  clave: string;
  etiqueta: string;
  valor: number;
  color: string;
}

interface PropsDistribucion {
  /** Prefijo de los `data-testid`: `<id>-<clave>` en cada cifra y `<id>-centro` en el centro de la dona. */
  id: string;
  /** Nombre del gráfico para lectores de pantalla («Usuarios activos por rol»). */
  titulo: string;
  partes: readonly ParteDistribucion[];
  /** Texto bajo el total en el centro de la dona («usuarios activos»). */
  unidad: string;
}

// Anillo en un viewBox de 100: radio exterior 50 e interior 33,5, el mismo hueco (67 %) que deja
// `.qe-dashboard__dona-centro`, para que la dona se vea igual que la del Dashboard QE.
const RADIO = 41.75;
const GROSOR = 16.5;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
// Separación entre segmentos (~2 px a 170 px de ancho), con el color de la superficie.
const SEPARACION = 1.2;

export function porcentajeDe(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/**
 * Dona con su lista de partes (nombre, cifra, porcentaje y barra), como la del Dashboard QE.
 * Pasar el puntero por un segmento o por su fila resalta ambos y muestra la cifra en el centro;
 * la lista es la vista de tabla, así que ninguna parte se identifica solo por el color.
 */
export function DistribucionDona({ id, titulo, partes, unidad }: PropsDistribucion) {
  const [activa, setActiva] = useState<string | null>(null);
  const total = partes.reduce((suma, parte) => suma + parte.valor, 0);
  const parteActiva = partes.find((parte) => parte.clave === activa && parte.valor > 0);
  const conValor = partes.filter((parte) => parte.valor > 0);
  const separacion = conValor.length > 1 ? SEPARACION : 0;

  let recorrido = 0;
  const segmentos = conValor.map((parte) => {
    const largo = (parte.valor / total) * CIRCUNFERENCIA;
    const segmento = { parte, inicio: recorrido + separacion / 2, largo: Math.max(largo - separacion, 0.5) };
    recorrido += largo;
    return segmento;
  });

  const resumen = partes.map((parte) => `${parte.etiqueta} ${parte.valor} (${porcentajeDe(parte.valor, total)} %)`).join(", ");

  return (
    <div className="qe-dashboard__distribucion">
      <div className={`qe-dashboard__dona dash-dona${parteActiva ? " dash-dona--resaltada" : ""}`}>
        <svg className="dash-dona__svg" viewBox="0 0 100 100" role="img" aria-label={`${titulo}: ${resumen}`}>
          <g transform="rotate(-90 50 50)">
            {segmentos.map(({ parte, inicio, largo }) => (
              <circle
                key={parte.clave}
                className={`dash-dona__segmento${parte.clave === activa ? " dash-dona__segmento--activo" : ""}`}
                cx="50"
                cy="50"
                r={RADIO}
                fill="none"
                stroke={parte.color}
                strokeWidth={GROSOR}
                strokeDasharray={`${largo} ${CIRCUNFERENCIA - largo}`}
                strokeDashoffset={-inicio}
                onMouseEnter={() => setActiva(parte.clave)}
                onMouseLeave={() => setActiva(null)}
                onClick={() => setActiva((actual) => (actual === parte.clave ? null : parte.clave))}
              />
            ))}
          </g>
        </svg>
        <div className="qe-dashboard__dona-centro" aria-hidden="true" data-testid={`${id}-centro`}>
          <strong>{parteActiva ? parteActiva.valor : total}</strong>
          <span>{parteActiva ? `${parteActiva.etiqueta} · ${porcentajeDe(parteActiva.valor, total)}%` : unidad}</span>
        </div>
      </div>

      <ul className="qe-dashboard__estados dash-leyenda" aria-label={titulo}>
        {partes.map((parte) => {
          const porcentaje = porcentajeDe(parte.valor, total);
          return (
            <li
              key={parte.clave}
              className={`qe-dashboard__estado${parte.clave === activa ? " dash-leyenda__fila--activa" : ""}`}
              style={{ "--qe-barra-color": parte.color } as CSSProperties}
              onMouseEnter={() => setActiva(parte.clave)}
              onMouseLeave={() => setActiva(null)}
            >
              <div className="qe-dashboard__estado-cabecera">
                <span>
                  <span className="dash-leyenda__muestra" style={{ background: parte.color }} aria-hidden="true" />
                  {parte.etiqueta}
                </span>
                <strong data-testid={`${id}-${parte.clave}`}>
                  {parte.valor} ({porcentaje}%)
                </strong>
              </div>
              <progress value={parte.valor} max={total} aria-label={`${titulo}: ${parte.etiqueta}`} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface PropsAnillo {
  /** `data-testid` del anillo; la cifra queda en `<testId>-valor`. */
  testId: string;
  porcentaje: number;
  /** Texto bajo el porcentaje («Cobertura»). */
  etiqueta: string;
  /** Nombre completo para lectores de pantalla («Cobertura de supervisión»). */
  descripcion: string;
  color: string;
}

/** Una sola proporción sobre su total (la «Tasa de cierre» del Dashboard QE): avance sobre una pista neutra. */
export function AnilloPorcentaje({ testId, porcentaje, etiqueta, descripcion, color }: PropsAnillo) {
  const largo = (Math.min(Math.max(porcentaje, 0), 100) / 100) * CIRCUNFERENCIA;
  return (
    <div className="qe-dashboard__dona qe-dashboard__dona--cierre dash-dona" data-testid={testId}>
      <svg className="dash-dona__svg" viewBox="0 0 100 100" role="img" aria-label={`${descripcion}: ${porcentaje} %`}>
        <circle cx="50" cy="50" r={RADIO} fill="none" stroke="var(--q360-color-borde)" strokeWidth={GROSOR} />
        <circle
          cx="50"
          cy="50"
          r={RADIO}
          fill="none"
          stroke={color}
          strokeWidth={GROSOR}
          strokeDasharray={`${largo} ${CIRCUNFERENCIA - largo}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="qe-dashboard__dona-centro" aria-hidden="true">
        <strong data-testid={`${testId}-valor`}>{porcentaje}%</strong>
        <span>{etiqueta}</span>
      </div>
    </div>
  );
}
