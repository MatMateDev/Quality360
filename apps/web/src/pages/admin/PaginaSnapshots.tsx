import { useState } from "react";
import { useEjecucionesSnapshot, useGenerarSnapshot } from "@/api/indicadores";
import { BloqueEstado } from "@/components/BloqueEstado";
import { Paginacion } from "@/components/bandeja/Paginacion";
import { EncabezadoBandeja } from "@/components/bandeja/Estructura";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { BloqueConsulta } from "@/components/indicadores/estados";
import { formatearDia, formatearFechaHoraChile } from "@/lib/formato";
import { ErrorApi } from "@/lib/httpClient";
import type { EjecucionSnapshot, MotivoFalloSnapshot } from "@/types/dominio";

/** Textos por código: el mensaje del servidor no se muestra (E5 §1.4). */
const MOTIVOS: Record<MotivoFalloSnapshot, string> = {
  ORGANIZACION_NO_DISPONIBLE: "No respondió el servicio de HDU y equipos",
  CERTIFICACIONES_NO_DISPONIBLE: "No respondió el servicio de avance de entregables",
  IMPEDIMENTOS_NO_DISPONIBLE: "No respondió el servicio de impedimentos",
  EXCEDE_TOPE: "Hay más HDU que el máximo por ejecución (1000)",
  CONFIGURACION_INVALIDA: "La configuración del snapshot no es válida",
  INTERRUMPIDA: "La ejecución se interrumpió",
  ERROR_INTERNO: "Error interno",
};
const motivoTexto = (m: MotivoFalloSnapshot | null) => (m === null ? "—" : (MOTIVOS[m] ?? "Error no identificado"));

const RESULTADO = {
  EXITOSA: { glifo: "✓", texto: "Exitosa", clase: "exitosa" },
  FALLIDA: { glifo: "✕", texto: "Fallida", clase: "fallida" },
  EN_CURSO: { glifo: "◔", texto: "En curso", clase: "en-curso" },
} as const;

function InsigniaResultado({ r }: { r: EjecucionSnapshot["resultado"] }) {
  const e = RESULTADO[r];
  return (
    <span className={`insignia-resultado insignia-resultado--${e.clase}`}>
      <span aria-hidden="true">{e.glifo} </span>
      {e.texto}
    </span>
  );
}

const duracion = (ms: number | null) => (ms === null ? "—" : `${Math.round(ms / 1000)} s`);
const origen = (o: EjecucionSnapshot["origen"]) => (o === "CRON" ? "Programada" : "Manual");

type Resultado = { tipo: "exito"; filas: number } | { tipo: "fallida"; motivo: MotivoFalloSnapshot | null } | { tipo: "en-curso" } | { tipo: "permiso" } | { tipo: "error" } | null;

/** Operación del snapshot (E6-B03, D165): sin cifras, series ni nombres de célula. Solo el Administrador entra (D41). */
export function PaginaSnapshots() {
  const [pagina, setPagina] = useState(1);
  const primera = useEjecucionesSnapshot(1);
  const actual = useEjecucionesSnapshot(pagina);
  const generar = useGenerarSnapshot();
  const [resultado, setResultado] = useState<Resultado>(null);

  async function ejecutar() {
    setResultado(null);
    try {
      const e = await generar.mutateAsync();
      setResultado(e.resultado === "FALLIDA" ? { tipo: "fallida", motivo: e.motivo } : { tipo: "exito", filas: e.filasEscritas });
    } catch (error) {
      if (error instanceof ErrorApi && error.status === 409 && error.codigo === "EJECUCION_EN_CURSO") setResultado({ tipo: "en-curso" });
      else if (error instanceof ErrorApi && error.status === 403) setResultado({ tipo: "permiso" });
      else setResultado({ tipo: "error" });
    }
  }

  const ultima = primera.data?.items[0];
  const columnas: Columna<EjecucionSnapshot>[] = [
    { id: "resultado", titulo: "Resultado", prioritaria: true, render: (e) => <InsigniaResultado r={e.resultado} /> },
    { id: "fecha", titulo: "Fecha", prioritaria: true, render: (e) => formatearDia(e.fecha) },
    { id: "origen", titulo: "Origen", render: (e) => origen(e.origen) },
    { id: "actor", titulo: "Actor", render: (e) => e.actor.nombre },
    { id: "inicio", titulo: "Inicio", render: (e) => formatearFechaHoraChile(e.inicio) },
    { id: "duracion", titulo: "Duración", render: (e) => duracion(e.duracionMs) },
    { id: "filas", titulo: "Filas escritas", render: (e) => e.filasEscritas },
    { id: "motivo", titulo: "Motivo", render: (e) => motivoTexto(e.motivo) },
  ];

  return (
    <div data-testid="pagina-snapshots" className="pagina-indicadores">
      <EncabezadoBandeja
        etiqueta="Portal Administrador"
        titulo="Snapshots de indicadores"
        descripcion="Cada día el sistema guarda una foto de los indicadores para armar la tendencia. Aquí puedes ejecutarla a mano y revisar las últimas ejecuciones. Esta pantalla no muestra cifras de indicadores."
      />

      <section className="panel panel-snapshot" data-testid="snapshot-estado" aria-labelledby="titulo-estado-snapshot">
        <h2 id="titulo-estado-snapshot">Estado</h2>
        {primera.isPending ? (
          <p>Cargando…</p>
        ) : primera.isError ? (
          <BloqueEstado id="snapshot-estado" estado="error" onReintentar={() => void primera.refetch()} />
        ) : ultima ? (
          <p>
            <strong>Última ejecución</strong> <InsigniaResultado r={ultima.resultado} /> · {formatearFechaHoraChile(ultima.inicio)} · {origen(ultima.origen)} · Duración {duracion(ultima.duracionMs)} · {ultima.filasEscritas} filas escritas
          </p>
        ) : (
          <p>Aún no se ha ejecutado ningún snapshot</p>
        )}
        <p>La ejecución programada corre todos los días entre las 02:00 y las 03:59 (hora de Chile).</p>
        <button type="button" className="boton boton--primario" data-testid="boton-generar-snapshot" aria-describedby="ayuda-snapshot" aria-busy={generar.isPending} disabled={generar.isPending} onClick={() => void ejecutar()}>
          {generar.isPending ? "Generando…" : "Generar snapshot ahora"}
        </button>{" "}
        <span className="campo-ayuda" id="ayuda-snapshot">
          Si ya hay una foto de hoy, se actualiza; no se duplica.
        </span>

        {generar.isPending ? (
          <p role="status" data-testid="espera-snapshot">
            Generando el snapshot. Puede tardar unos segundos. No cierres esta página.
          </p>
        ) : null}
        {resultado?.tipo === "exito" ? (
          <p className="mensaje-exito" role="status" data-testid="mensaje-exito">
            Snapshot generado: {resultado.filas} filas escritas.
          </p>
        ) : null}
        {resultado?.tipo === "fallida" ? (
          <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
            {motivoTexto(resultado.motivo)}. No se guardó ninguna fila.
          </p>
        ) : null}
        {resultado?.tipo === "en-curso" ? (
          <p className="mensaje-aviso" role="status" data-testid="aviso-en-curso">
            <span data-testid="mensaje-aviso">Ya hay un snapshot en ejecución. Espera a que termine y vuelve a intentar.</span>
          </p>
        ) : null}
        {resultado?.tipo === "permiso" ? (
          <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
            Ya no tienes permiso para esta acción
          </p>
        ) : null}
        {resultado?.tipo === "error" ? (
          <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
            No fue posible generar el snapshot. Intenta nuevamente.
          </p>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="titulo-ejecuciones">
        <div className="panel-cabecera">
          <h2 id="titulo-ejecuciones">Ejecuciones</h2>
          <button
            type="button"
            className="boton boton--secundario"
            data-testid="boton-actualizar-ejecuciones"
            onClick={() => {
              void primera.refetch();
              void actual.refetch();
            }}
          >
            ↻ Actualizar
          </button>
        </div>
        <BloqueConsulta clave="snapshot-ejecuciones" consulta={actual}>
          {actual.data && actual.data.items.length === 0 ? (
            <div data-testid="estado-vacio-snapshot-ejecuciones">
              <BloqueEstado id="snapshot-ejecuciones" estado="vacio" mensaje="Aún no se ha ejecutado ningún snapshot" />
            </div>
          ) : actual.data ? (
            <>
              <TablaBandeja
                testId="lista-ejecuciones"
                caption="Ejecuciones del snapshot"
                columnas={columnas}
                items={actual.data.items}
                clave={(e) => e.id}
                testIdFila={(e) => `fila-ejecucion-${e.id}`}
                focoPagina={pagina}
              />
              <Paginacion clave="ejecuciones" etiqueta="ejecuciones" total={actual.data.total} pagina={pagina} tamano={actual.data.tamanoPagina} onPagina={setPagina} />
            </>
          ) : null}
        </BloqueConsulta>
      </section>
    </div>
  );
}
