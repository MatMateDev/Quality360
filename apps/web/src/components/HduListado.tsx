import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCelulas, useSprints } from "@/api/catalogos";
import { useListaHdu, type FiltrosHdu } from "@/api/hdu";
import { ESTADOS_HDU, ETIQUETAS_ESTADO_HDU } from "@/types/dominio";
import { BloqueEstado } from "./BloqueEstado";
import { InsigniaEstadoHdu, InsigniaPrioridad } from "./Etiquetas";

interface Props {
  titulo: string;
  descripcion: string;
  idBloque: string;
  mostrarColumnaAnalista?: boolean;
  mostrarColumnaQe?: boolean;
  accionesCabecera?: ReactNode;
}

/** Listado de HDU con filtros de célula, sprint y estado (E2-F03, "Historias supervisadas" del QE). */
export function HduListado({ titulo, descripcion, idBloque, mostrarColumnaAnalista = true, mostrarColumnaQe = false, accionesCabecera }: Props) {
  const [filtros, setFiltros] = useState<FiltrosHdu>({});
  const celulasQuery = useCelulas();
  const sprintsQuery = useSprints();
  const hduQuery = useListaHdu(filtros);

  function limpiarFiltros() {
    setFiltros({});
  }

  return (
    <div>
      <div className="encabezado">
        <p className="etiqueta">{titulo}</p>
        <h1>{titulo}</h1>
        <p>{descripcion}</p>
      </div>

      <div className="panel">
        <div className="panel-cabecera">
          <div>
            <h2>Filtros</h2>
          </div>
          {accionesCabecera}
        </div>

        <div className="filtros">
          <div className="campo">
            <label htmlFor="filtro-celula">Célula</label>
            <select
              id="filtro-celula"
              value={filtros.celulaId ?? ""}
              onChange={(evento) => setFiltros((actual) => ({ ...actual, celulaId: evento.target.value || undefined }))}
            >
              <option value="">Todas las células</option>
              {celulasQuery.data?.items.map((celula) => (
                <option key={celula.id} value={celula.id}>
                  {celula.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="filtro-sprint">Sprint</label>
            <select
              id="filtro-sprint"
              value={filtros.sprintId ?? ""}
              onChange={(evento) => setFiltros((actual) => ({ ...actual, sprintId: evento.target.value || undefined }))}
            >
              <option value="">Todos los sprints</option>
              {sprintsQuery.data?.items.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="filtro-estado">Estado</label>
            <select
              id="filtro-estado"
              value={filtros.estado ?? ""}
              onChange={(evento) => setFiltros((actual) => ({ ...actual, estado: (evento.target.value || undefined) as FiltrosHdu["estado"] }))}
            >
              <option value="">Todos los estados</option>
              {ESTADOS_HDU.map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETAS_ESTADO_HDU[estado]}
                </option>
              ))}
            </select>
          </div>

          <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        </div>

        {hduQuery.isLoading ? <BloqueEstado id={idBloque} estado="cargando" /> : null}
        {hduQuery.isError ? <BloqueEstado id={idBloque} estado="error" onReintentar={() => hduQuery.refetch()} /> : null}

        {hduQuery.data ? (
          hduQuery.data.items.length === 0 ? (
            <BloqueEstado id={idBloque} estado="vacio" mensaje="No hay historias de usuario con esos criterios." />
          ) : (
            <div className="tabla-contenedor">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Título</th>
                    <th>Célula</th>
                    <th>Sprint</th>
                    <th>Prioridad</th>
                    <th>Estado</th>
                    {mostrarColumnaAnalista ? <th>Analista</th> : null}
                    {mostrarColumnaQe ? <th>QE responsable</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {hduQuery.data.items.map((hdu) => (
                    <tr key={hdu.id} data-testid={`fila-hdu-${hdu.id}`}>
                      <td className="codigo">
                        <Link to={`/hdu/${hdu.id}`}>{hdu.codigo}</Link>
                      </td>
                      <td>{hdu.titulo}</td>
                      <td>{hdu.celula.nombre}</td>
                      <td>{hdu.sprint.nombre}</td>
                      <td>
                        <InsigniaPrioridad prioridad={hdu.prioridad} />
                      </td>
                      <td>
                        <InsigniaEstadoHdu estado={hdu.estado} />
                      </td>
                      {mostrarColumnaAnalista ? <td>{hdu.analista?.nombre ?? "Sin asignar"}</td> : null}
                      {mostrarColumnaQe ? <td>{hdu.qeResponsable.nombre}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
