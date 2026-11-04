import { useState } from "react";
import { useCelulas } from "@/api/catalogos";
import { llamadasConsulta, useAnalistasDeQe, useQeActivos, useSprintsDeCelula } from "@/api/integraciones";
import { useQueryClient } from "@tanstack/react-query";
import { textoAplicarA, textoSeAplico, textoSeleccionadas } from "@/lib/mensajesAsignacion";
import type { Consulta, FilaRechazada, SolicitudEdicionItems } from "@/types/dominio";
import { SelectorAsignacion } from "./SelectorAsignacion";

interface Props {
  consultaId: string;
  sugerencia: Consulta["sugerencia"];
  /** Ids seleccionados en el portal (D145). */
  seleccion: ReadonlySet<string>;
  /** Se eligió «Seleccionar las N filas del grupo»: actúa en el servidor sobre todo el grupo. */
  todoElGrupo: boolean;
  totalGrupo: number;
  filtro: string;
  onQuitarSeleccion: () => void;
  onAnunciar: (mensaje: string) => void;
  onRechazadas: (filas: FilaRechazada[]) => void;
  onErrorDeConsulta: (error: unknown) => boolean;
  onVersion?: (version: number) => void;
}

const TAMANO_LOTE = 100;

/** Panel de grupo (diseño §4.3 y §4.5): aplica solo los campos elegidos a las filas seleccionadas, en una sola petición (por lotes de 100 ids). */
export function PanelAsignarGrupo({ consultaId, sugerencia, seleccion, todoElGrupo, totalGrupo, filtro, onQuitarSeleccion, onAnunciar, onRechazadas, onErrorDeConsulta, onVersion }: Props) {
  const cliente = useQueryClient();
  const celulas = useCelulas();
  const qes = useQeActivos();
  const [celulaId, setCelulaId] = useState(sugerencia.celula?.id ?? "");
  const [qeId, setQeId] = useState(sugerencia.qeResponsable?.id ?? "");
  const [analistaId, setAnalistaId] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [incluir, setIncluir] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState(false);
  const analistas = useAnalistasDeQe(qeId || null);
  const sprints = useSprintsDeCelula(celulaId);

  const cantidad = todoElGrupo ? totalGrupo : seleccion.size;
  const hayCampo = Boolean(celulaId || qeId || analistaId || sprintId);
  const analistaSinQe = Boolean(analistaId) && !qeId;
  const puede = cantidad > 0 && hayCampo && !analistaSinQe && !aplicando;
  const movil = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 750px)").matches;

  const opciones = (items: Array<{ id: string; nombre: string }> | undefined) => (items ?? []).map((x) => ({ valor: x.id, etiqueta: x.nombre }));

  function cambiarQe(valor: string) {
    setQeId(valor);
    setAnalistaId("");
  }

  async function aplicar() {
    if (!puede) return;
    setAplicando(true);
    setErrorGlobal(false);
    const asignacion: NonNullable<SolicitudEdicionItems["asignacion"]> = {};
    if (celulaId) asignacion.celulaId = celulaId;
    if (qeId) asignacion.qeId = qeId;
    if (analistaId) asignacion.analistaId = analistaId;
    if (sprintId) asignacion.sprintId = sprintId;
    const comun = { asignacion, marcarListas: incluir };
    const cuerpos: SolicitudEdicionItems[] = todoElGrupo
      ? [{ grupo: "NUEVA", todas: true, ...(filtro ? { q: filtro } : {}), ...comun }]
      : Array.from({ length: Math.ceil(seleccion.size / TAMANO_LOTE) }, (_, i) => ({ itemIds: [...seleccion].slice(i * TAMANO_LOTE, (i + 1) * TAMANO_LOTE), ...comun }));
    const total = { aplicadas: 0, marcadas: 0, rechazadas: [] as FilaRechazada[] };
    try {
      for (const cuerpo of cuerpos) {
        const r = await llamadasConsulta.editar(consultaId, cuerpo);
        onVersion?.(r.version);
        total.aplicadas += r.aplicadas;
        total.marcadas += r.marcadas;
        total.rechazadas.push(...r.rechazadas);
      }
      onRechazadas(total.rechazadas);
      onAnunciar(textoSeAplico(total.aplicadas, total.marcadas, incluir));
    } catch (error) {
      if (!onErrorDeConsulta(error)) setErrorGlobal(true);
    } finally {
      setAplicando(false);
      void cliente.invalidateQueries({ queryKey: ["integraciones"] });
    }
  }

  const catalogoCaido = celulas.isError || qes.isError;
  const cuerpo = (
    <fieldset className="panel-asignar-grupo" data-testid="panel-asignar-grupo" aria-busy={aplicando || undefined} aria-disabled={cantidad === 0 || undefined}>
      <legend>Asignar a las filas seleccionadas</legend>
      <div className="panel-asignar-grupo__selectores">
        <SelectorAsignacion
          id="grupo-celula"
          etiqueta="Célula"
          valor={celulaId}
          opciones={opciones(celulas.data?.items)}
          vacio="No cambiar"
          testId="grupo-selector-celula"
          lista
          ayuda={sugerencia.celula && celulaId === sugerencia.celula.id ? "Sugerida desde Conexión" : undefined}
          idAyuda="ayuda-grupo-celula"
          onCambio={(v) => {
            setCelulaId(v);
            setSprintId("");
          }}
        />
        <SelectorAsignacion
          id="grupo-qe"
          etiqueta="QE responsable"
          valor={qeId}
          opciones={opciones(qes.data?.items)}
          vacio="No cambiar"
          testId="grupo-selector-qe"
          lista
          ayuda={sugerencia.qeResponsable && qeId === sugerencia.qeResponsable.id ? "Sugerido desde Conexión" : undefined}
          idAyuda="ayuda-grupo-qe"
          onCambio={cambiarQe}
        />
        <SelectorAsignacion
          id="grupo-analista"
          etiqueta="Analista QA (equipo del QE)"
          valor={analistaId}
          opciones={opciones(analistas.data?.items)}
          vacio="No cambiar"
          testId="grupo-selector-analista"
          lista
          deshabilitado={!qeId}
          motivo={!qeId ? "Elige primero un QE" : undefined}
          error={analistaSinQe ? "Elige el QE: el analista depende de él." : undefined}
          idError="error-grupo-analista"
          onCambio={setAnalistaId}
        />
        <SelectorAsignacion
          id="grupo-sprint"
          etiqueta="Sprint"
          valor={sprintId}
          opciones={opciones(sprints.data?.items)}
          vacio="Propuesto por Jira (o respaldo)"
          testId="grupo-selector-sprint"
          lista
          deshabilitado={!celulaId}
          motivo={!celulaId ? "Elige primero una célula para fijar un sprint" : undefined}
          onCambio={setSprintId}
        />
      </div>
      {catalogoCaido ? (
        <p className="campo-error" role="status" data-testid="error-catalogos-grupo">
          No pudimos cargar las opciones.{" "}
          <button type="button" className="boton boton--secundario" onClick={() => void Promise.all([celulas.refetch(), qes.refetch()])}>
            Reintentar
          </button>
        </p>
      ) : null}
      <label className="panel-asignar-grupo__incluir">
        <input type="checkbox" data-testid="casilla-incluir-al-aplicar" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} />
        <span>Incluir en la confirmación las filas que queden listas</span>
      </label>
      <p className="campo-ayuda" data-testid="conteo-seleccion" role="status">
        {cantidad > 0 ? `Se aplicará a ${textoSeleccionadas(cantidad)}.` : "Selecciona filas para asignarlas en grupo."}
      </p>
      <div className="acciones-formulario">
        <button type="button" className="boton boton--primario" data-testid="boton-aplicar-grupo" aria-disabled={!puede || undefined} onClick={() => void aplicar()}>
          {aplicando ? "Aplicando…" : textoAplicarA(cantidad)}
        </button>
        <button type="button" className="boton boton--secundario" data-testid="boton-quitar-seleccion" disabled={cantidad === 0} onClick={onQuitarSeleccion}>
          Quitar selección
        </button>
      </div>
      {errorGlobal ? (
        <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
          No fue posible guardar. Intenta nuevamente.
        </p>
      ) : null}
    </fieldset>
  );
  return movil ? (
    <details className="panel-asignar-grupo__plegable">
      <summary>Asignar a las filas seleccionadas</summary>
      {cuerpo}
    </details>
  ) : (
    cuerpo
  );
}
