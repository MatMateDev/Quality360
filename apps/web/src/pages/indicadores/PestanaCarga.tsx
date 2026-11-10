import { useCarga } from "@/api/indicadores";
import { BarraFiltros } from "@/components/bandeja/BarraFiltros";
import { campoCelula, campoSprint } from "@/components/indicadores/camposFiltro";
import { filtrosDeUrl, useContextoIndicadores, useInformarVista } from "@/components/indicadores/contexto";
import { AvisoFuenteNoDisponible, BloqueConsulta, SinDatos } from "@/components/indicadores/estados";
import { HistorialUmbral } from "@/components/indicadores/HistorialUmbral";
import { PanelUmbral } from "@/components/indicadores/PanelUmbral";
import { TablaCarga } from "@/components/indicadores/TablaCarga";
import type { CargaIndicadores, GrupoCarga } from "@/types/dominio";

function GrupoQe({ grupo, sinAnalista, esAuditor }: { grupo: GrupoCarga; sinAnalista: CargaIndicadores["sinAnalista"]; esAuditor: boolean }) {
  const qe = grupo.umbral.qe;
  const id = qe?.id ?? "sin-qe";
  return (
    <section className="grupo-qe" data-testid={`grupo-qe-${id}`} aria-labelledby={`titulo-grupo-${id}`}>
      <h2 id={`titulo-grupo-${id}`}>{qe ? `Equipo de ${qe.nombre} (QE)` : "Sin QE supervisor"}</h2>
      <p>
        Umbral: {grupo.umbral.valor} HDU {grupo.umbral.valor === 1 ? "activa" : "activas"} · {grupo.umbral.porDefecto ? "Valor por defecto" : "Definido por el QE"}
      </p>
      <TablaCarga caption={qe ? `Carga de los analistas de ${qe.nombre}` : "Carga de los analistas sin QE supervisor"} umbral={grupo.umbral.valor} filas={grupo.filas} sinAnalista={sinAnalista} grupoSinQe={!qe} esQe={false} />
      {esAuditor && qe ? <HistorialUmbral qeId={qe.id} /> : null}
    </section>
  );
}

/** Carga por analista y umbral (E6-F03). El QE edita su umbral; Líder y Auditor ven un grupo por QE, solo lectura. */
export function PestanaCarga() {
  const { rol, filtros, opciones } = useContextoIndicadores();
  const { celulaId, sprintId } = filtrosDeUrl(filtros);
  const consulta = useCarga({ celulaId, sprintId });
  useInformarVista(consulta.data?.generadoEn, consulta.isPending);
  const datos = consulta.data;
  const esQe = rol === "QE";
  const ambitoVacio = Boolean(datos?.sinDatos && datos.motivoSinDatos === "AMBITO_VACIO");
  const hayFiltro = Boolean(celulaId || sprintId);
  const certCaida = datos?.fuentes.certificaciones === "indisponible";

  return (
    <section data-testid="pestana-carga">
      {esQe ? <PanelUmbral /> : null}
      {ambitoVacio ? null : <BarraFiltros filtros={filtros} campos={[campoCelula(opciones.data), campoSprint(opciones.data)]} clave="carga" />}
      {hayFiltro ? (
        <p className="mensaje-aviso" role="note" data-testid="nota-filtros-carga">
          <span data-testid="mensaje-aviso">Los filtros cambian las columnas por estado. La marca de sobrecarga siempre cuenta todas las HDU activas.</span>
        </p>
      ) : null}

      <BloqueConsulta clave="carga" consulta={consulta}>
        {datos ? (
          datos.sinDatos ? (
            <SinDatos mensaje={ambitoVacio ? "Aún no tienes HDU en tu ámbito" : "No hay HDU con esos filtros"} onLimpiar={ambitoVacio ? undefined : () => filtros.limpiar(["celula", "sprint"])} />
          ) : (
            <>
              {certCaida ? (
                <AvisoFuenteNoDisponible mensaje="No pudimos consultar el avance de los entregables. El cumplimiento no se muestra para no entregar datos inexactos." onReintentar={() => void consulta.refetch()} />
              ) : null}
              {esQe ? (
                <div className="panel">
                  <h2>Carga por analista</h2>
                  <TablaCarga
                    caption="Carga por analista"
                    umbral={datos.grupos[0]?.umbral.valor ?? 5}
                    filas={datos.grupos[0]?.filas ?? []}
                    sinAnalista={datos.sinAnalista}
                    esQe
                  />
                </div>
              ) : (
                <>
                  {datos.grupos.map((g) => (
                    <GrupoQe key={g.umbral.qe?.id ?? "sin-qe"} grupo={g} sinAnalista={null} esAuditor={rol === "AUDITOR"} />
                  ))}
                  {datos.sinAnalista ? (
                    <section className="grupo-qe">
                      <h2>Sin analista asignado</h2>
                      <TablaCarga caption="HDU sin analista asignado" umbral={5} filas={[]} sinAnalista={datos.sinAnalista} esQe={false} />
                    </section>
                  ) : null}
                </>
              )}
            </>
          )
        ) : null}
      </BloqueConsulta>

      {esQe ? <HistorialUmbral /> : null}
    </section>
  );
}
