import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useDrilldown } from "@/api/indicadores";
import { BloqueEstado } from "@/components/BloqueEstado";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { InsigniaEstadoHdu } from "@/components/Etiquetas";
import { DiasAbierto, InsigniaEstadoImpedimento } from "@/components/impedimentos/Insignias";
import { SemaforoRiesgo } from "@/components/impedimentos/SemaforoRiesgo";
import { ErrorApi } from "@/lib/httpClient";
import type { ItemDrilldownSemaforo, MotivoSemaforo } from "@/types/dominio";

const MOTIVOS: Record<MotivoSemaforo, { glifo: string; texto: string; clase: string }> = {
  RIESGO_ALTO: { glifo: "▲", texto: "Riesgo alto", clase: "riesgo-alto" },
  IMPEDIMENTO_ESCALADO: { glifo: "⇧", texto: "Impedimento escalado", clase: "impedimento-escalado" },
  RIESGO_MEDIO: { glifo: "◆", texto: "Riesgo medio", clase: "riesgo-medio" },
  IMPEDIMENTO_ABIERTO: { glifo: "○", texto: "Impedimento abierto", clase: "impedimento-abierto" },
};

interface Props {
  celulaId: string;
  celulaNombre: string;
  onCerrar: () => void;
  /** 403 sobre una célula ajena: la página muestra «No tienes acceso a esa célula» y quita el parámetro. */
  onSinAcceso: () => void;
}

/** HDU que generan el color de una célula (E6-F02#2, D181). El foco pasa al título al abrirse. */
export function PanelDrilldown({ celulaId, celulaNombre, onCerrar, onSinAcceso }: Props) {
  const consulta = useDrilldown(celulaId);
  const ubicacion = useLocation();
  const titulo = useRef<HTMLHeadingElement>(null);
  const desde = `${ubicacion.pathname}${ubicacion.search}`;
  const sinAcceso = consulta.error instanceof ErrorApi && consulta.error.status === 403;

  useEffect(() => {
    titulo.current?.focus();
    titulo.current?.scrollIntoView?.({ block: "start" });
  }, [celulaId]);
  useEffect(() => {
    if (sinAcceso) onSinAcceso();
  }, [sinAcceso, onSinAcceso]);

  const datos = consulta.data;
  const parcial = Boolean(datos && (datos.estado === "indisponible" || datos.calculoParcial || datos.items.some((i) => i.riesgo.estado === "indisponible")));

  const columnas: Columna<ItemDrilldownSemaforo>[] = [
    {
      id: "hdu",
      titulo: "HDU",
      prioritaria: true,
      render: (i) => (
        <>
          <Link to={`/hdu/${i.hdu.id}`} state={{ desde }}>
            {i.hdu.codigo}
          </Link>
          <br />
          {i.hdu.titulo}
        </>
      ),
    },
    {
      id: "motivo",
      titulo: "Motivo",
      prioritaria: true,
      render: (i) =>
        i.motivos.map((m) => (
          <span key={m} className={`chip-motivo chip-motivo--${MOTIVOS[m].clase}`} data-testid={`chip-motivo-${m}`}>
            <span aria-hidden="true">{MOTIVOS[m].glifo} </span>
            {MOTIVOS[m].texto}
          </span>
        )),
    },
    {
      id: "riesgo",
      titulo: "Riesgo vigente",
      render: (i) => <SemaforoRiesgo nivel={i.riesgo.nivelVigente} estado={i.riesgo.estado} origen={i.riesgo.origen} calculoParcial={i.riesgo.calculoParcial} />,
    },
    {
      id: "impedimento",
      titulo: "Impedimento",
      render: (i) =>
        i.impedimentoPrincipal ? (
          <>
            {i.impedimentoPrincipal.titulo} · <InsigniaEstadoImpedimento estado={i.impedimentoPrincipal.estado} /> · <DiasAbierto dias={i.impedimentoPrincipal.diasAbierto} />
          </>
        ) : (
          "—"
        ),
    },
    { id: "analista", titulo: "Analista", render: (i) => i.analista?.nombre ?? "Sin asignar" },
    { id: "estado", titulo: "Estado", render: (i) => <InsigniaEstadoHdu estado={i.hdu.estado} /> },
    {
      id: "accion",
      titulo: "Acción",
      render: (i) => (
        <Link className="boton boton--secundario" to={`/hdu/${i.hdu.id}`} state={{ desde }} aria-label={`Abrir HDU ${i.hdu.codigo}: ${i.hdu.titulo}`}>
          Abrir
        </Link>
      ),
    },
  ];

  return (
    <section className="panel-drilldown" id="lista-drilldown-panel" aria-labelledby="titulo-drilldown" data-testid="panel-drilldown">
      <div className="panel-cabecera">
        <h3 id="titulo-drilldown" ref={titulo} tabIndex={-1}>
          HDU que generan el color de {celulaNombre}
        </h3>
        <button type="button" className="boton boton--secundario" data-testid="boton-cerrar-detalle" onClick={onCerrar}>
          Cerrar detalle
        </button>
      </div>

      {consulta.isPending ? (
        <BloqueEstado id="drilldown" estado="cargando" />
      ) : consulta.isError && !sinAcceso ? (
        <div data-testid="estado-error-drilldown">
          <BloqueEstado
            id="drilldown"
            estado={consulta.error instanceof ErrorApi && consulta.error.status === 503 ? "indisponible" : "error"}
            mensaje={consulta.error instanceof ErrorApi && consulta.error.status === 503 ? "No disponible" : undefined}
            onReintentar={() => void consulta.refetch()}
          />
        </div>
      ) : datos ? (
        <>
          {parcial ? (
            <p className="mensaje-aviso" role="note" data-testid="aviso-drilldown-parcial">
              Solo mostramos lo que pudimos consultar. Faltan datos de avance o de impedimentos.
            </p>
          ) : null}
          {datos.items.length === 0 ? (
            <div data-testid="estado-vacio-drilldown">
              <BloqueEstado id="drilldown" estado="vacio" tono="exito" mensaje="Sin HDU con riesgo ni impedimentos" />
            </div>
          ) : (
            <TablaBandeja
              testId="lista-drilldown"
              caption={`HDU que generan el color de ${celulaNombre}`}
              columnas={columnas}
              items={datos.items}
              clave={(i) => i.hdu.id}
              testIdFila={(i) => `fila-drilldown-${i.hdu.id}`}
            />
          )}
        </>
      ) : null}
    </section>
  );
}
