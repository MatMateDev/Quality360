import { useEffect, useId, useRef, useState } from "react";
import { formatearDia, formatearDiaMes } from "@/lib/formato";
import type { SerieTendencia } from "@/types/dominio";

const DIA_MS = 86_400_000;
const dia = (fecha: string) => Math.round(Date.parse(`${fecha}T00:00:00Z`) / DIA_MS);

/** Aspecto fijo por posición de la serie: color, trazo y marcador (E6 §6.3). El color nunca es el único canal. */
export const ESTILOS_SERIE = [
  { color: "var(--q360-serie-1)", trazo: undefined, marcador: "circulo", glifo: "●" },
  { color: "var(--q360-serie-2)", trazo: "10 5", marcador: "cuadrado", glifo: "■" },
  { color: "var(--q360-serie-3)", trazo: "2 4", marcador: "triangulo", glifo: "▲" },
  { color: "var(--q360-serie-4)", trazo: "10 4 2 4", marcador: "rombo", glifo: "◆" },
  { color: "var(--q360-serie-5)", trazo: "5 3", marcador: "equis", glifo: "✕" },
  { color: "var(--q360-serie-6)", trazo: undefined, marcador: "mas", glifo: "✚" },
] as const;

export const nombreSerie = (s: SerieTendencia) => `${s.celula.nombre} · ${s.sprint.nombre}`;

function Marcador({ tipo, x, y, color }: { tipo: string; x: number; y: number; color: string }) {
  const r = 4.5;
  const comun = { fill: color, stroke: color, strokeWidth: 2 };
  switch (tipo) {
    case "cuadrado":
      return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} {...comun} />;
    case "triangulo":
      return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} {...comun} />;
    case "rombo":
      return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} {...comun} />;
    case "equis":
      return <path d={`M${x - r},${y - r}L${x + r},${y + r}M${x - r},${y + r}L${x + r},${y - r}`} fill="none" stroke={color} strokeWidth={2.5} />;
    case "mas":
      return <path d={`M${x - r},${y}L${x + r},${y}M${x},${y - r}L${x},${y + r}`} fill="none" stroke={color} strokeWidth={2.5} />;
    default:
      return <circle cx={x} cy={y} r={r} {...comun} />;
  }
}

/** Trazo de 32 px para la leyenda: repite color, trazo y marcador. */
export function MuestraSerie({ indice }: { indice: number }) {
  const e = ESTILOS_SERIE[indice % ESTILOS_SERIE.length]!;
  return (
    <svg width="32" height="14" aria-hidden="true" focusable="false">
      <line x1="0" y1="7" x2="32" y2="7" stroke={e.color} strokeWidth="2.5" strokeDasharray={e.trazo} />
      <Marcador tipo={e.marcador} x={16} y={7} color={e.color} />
    </svg>
  );
}

interface Props {
  series: SerieTendencia[];
  ajustada: boolean;
  idEtiqueta: string;
  idDescripcion: string;
}

interface PuntoDibujado {
  serie: number;
  fecha: string;
  cumplimiento: number;
  hduTotal: number;
  x: number;
  y: number;
}

/**
 * Gráfico de líneas SVG propio (sin librerías, E6 §6.3). Solo presenta: recibe series ya ordenadas por el servidor.
 * Un día sin snapshot corta la línea (no se interpola). Todo valor está también en la tabla accesible.
 */
export function GraficaTendencia({ series, ajustada, idEtiqueta, idDescripcion }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(640);
  const [activo, setActivo] = useState<number | null>(null);
  const idGlobo = useId();

  useEffect(() => {
    const el = contenedor.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(() => setAncho(Math.max(240, Math.floor(el.clientWidth))));
    o.observe(el);
    setAncho(Math.max(240, Math.floor(el.clientWidth || 640)));
    return () => o.disconnect();
  }, []);

  const movil = ancho < 520;
  const alto = movil ? 240 : 320;
  const m = { izq: 52, der: 16, sup: 22, inf: 36 };
  const todas = series.flatMap((s) => s.puntos.map((p) => dia(p.fecha)));
  const min = Math.min(...todas);
  const max = Math.max(...todas);
  const valores = series.flatMap((s) => s.puntos.map((p) => p.cumplimiento));
  const yMin = ajustada ? Math.max(0, Math.floor((Math.min(...valores) - 5) / 5) * 5) : 0;
  const yMax = ajustada ? Math.min(100, Math.ceil((Math.max(...valores) + 5) / 5) * 5) : 100;
  const w = ancho - m.izq - m.der;
  const h = alto - m.sup - m.inf;
  const x = (d: number) => m.izq + (max === min ? w / 2 : ((d - min) / (max - min)) * w);
  const y = (v: number) => m.sup + h - ((v - yMin) / (yMax - yMin || 1)) * h;

  const puntos: PuntoDibujado[] = series.flatMap((s, i) =>
    s.puntos.map((p) => ({ serie: i, fecha: p.fecha, cumplimiento: p.cumplimiento, hduTotal: p.hduTotal, x: x(dia(p.fecha)), y: y(p.cumplimiento) })),
  );
  const ordenados = [...puntos].sort((a, b) => a.x - b.x || a.serie - b.serie);

  const marcas: number[] = [];
  const maxMarcas = movil ? 4 : 8;
  const paso = Math.max(1, Math.ceil((max - min + 1) / maxMarcas));
  for (let d = min; d <= max; d += paso) marcas.push(d);
  const pasoY = ajustada ? Math.max(5, Math.ceil((yMax - yMin) / 4 / 5) * 5) : 25;
  const marcasY: number[] = [];
  for (let v = yMin; v <= yMax; v += pasoY) marcasY.push(v);

  const finesSprint = series
    .filter((s) => s.sprint.cerrado && dia(s.sprint.fin) >= min && dia(s.sprint.fin) <= max)
    .map((s) => ({ id: s.sprint.id, nombre: s.sprint.nombre, d: dia(s.sprint.fin) }))
    .filter((f, i, arr) => arr.findIndex((o) => o.id === f.id) === i);

  function mover(delta: number) {
    if (ordenados.length === 0) return;
    setActivo((a) => (a === null ? 0 : Math.min(ordenados.length - 1, Math.max(0, a + delta))));
  }

  const p = activo !== null ? ordenados[activo] : undefined;
  const textoGlobo = p ? `${nombreSerie(series[p.serie]!)} · ${formatearDia(p.fecha)} · ${Math.round(p.cumplimiento)} % · ${p.hduTotal} HDU` : "";

  return (
    <div
      ref={contenedor}
      className="grafica-tendencia"
      data-testid="grafica-tendencia"
      role="img"
      aria-labelledby={idEtiqueta}
      aria-describedby={idDescripcion}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") (e.preventDefault(), mover(1));
        else if (e.key === "ArrowLeft") (e.preventDefault(), mover(-1));
        else if (e.key === "Escape") setActivo(null);
      }}
      onBlur={() => setActivo(null)}
    >
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} focusable="false">
        {marcasY.map((v) => (
          <g key={v}>
            <line x1={m.izq} x2={m.izq + w} y1={y(v)} y2={y(v)} stroke="var(--q360-grafica-rejilla)" strokeWidth="1" />
            <text x={m.izq - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--q360-grafica-eje)">
              {v} %
            </text>
          </g>
        ))}
        {marcas.map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={m.sup + h} y2={m.sup + h + 5} stroke="var(--q360-grafica-eje)" />
            <text x={x(d)} y={alto - 12} textAnchor="middle" fontSize="12" fill="var(--q360-grafica-eje)">
              {formatearDiaMes(new Date(d * DIA_MS).toISOString().slice(0, 10))}
            </text>
          </g>
        ))}
        <line x1={m.izq} x2={m.izq + w} y1={m.sup + h} y2={m.sup + h} stroke="var(--q360-grafica-eje)" />
        {finesSprint.map((f) => (
          <g key={f.id}>
            <line x1={x(f.d)} x2={x(f.d)} y1={m.sup} y2={m.sup + h} stroke="var(--q360-grafica-eje)" strokeDasharray="2 3" />
            <text x={x(f.d)} y={m.sup - 6} textAnchor="middle" fontSize="12" fill="var(--q360-grafica-eje)">
              {`Fin ${f.nombre}`}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const e = ESTILOS_SERIE[i % ESTILOS_SERIE.length]!;
          // Un hueco (día sin snapshot) corta la línea: solo se unen días consecutivos.
          const tramos: string[][] = [];
          let actual: string[] = [];
          let anterior: number | null = null;
          for (const pt of s.puntos) {
            const d = dia(pt.fecha);
            if (anterior !== null && d - anterior > 1) {
              tramos.push(actual);
              actual = [];
            }
            actual.push(`${x(d)},${y(pt.cumplimiento)}`);
            anterior = d;
          }
          tramos.push(actual);
          return (
            <g key={`${s.celula.id}-${s.sprint.id}`} data-serie={nombreSerie(s)}>
              {tramos.filter((t) => t.length > 1).map((t, k) => (
                <polyline key={k} points={t.join(" ")} fill="none" stroke={e.color} strokeWidth="2.5" strokeDasharray={e.trazo} />
              ))}
              {s.puntos.map((pt) => (
                <g key={pt.fecha} data-testid="punto-tendencia">
                  <title>{`${nombreSerie(s)} · ${formatearDia(pt.fecha)} · ${Math.round(pt.cumplimiento)} %`}</title>
                  <Marcador tipo={e.marcador} x={x(dia(pt.fecha))} y={y(pt.cumplimiento)} color={e.color} />
                </g>
              ))}
            </g>
          );
        })}
        {p ? <circle cx={p.x} cy={p.y} r="10" fill="none" stroke="var(--q360-color-texto)" strokeWidth="2" /> : null}
      </svg>
      {p ? (
        <p className="globo-tendencia" id={idGlobo} data-testid="globo-tendencia">
          {textoGlobo}
        </p>
      ) : null}
    </div>
  );
}
