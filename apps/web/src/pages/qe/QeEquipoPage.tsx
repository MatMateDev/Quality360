import { useEquipoQe } from "@/api/equipo";
import { BloqueEstado } from "@/components/BloqueEstado";
import { formatearFechaCorta } from "@/lib/formato";

/** F04: analistas con supervisión vigente, identificados por nombre y correo. */
export function QeEquipoPage() {
  const equipoQuery = useEquipoQe();

  return (
    <div>
      <div className="encabezado">
        <p className="etiqueta">Portal QE</p>
        <h1>Mi equipo</h1>
        <p>Analistas QA con supervisión vigente.</p>
      </div>

      <div className="panel">
        {equipoQuery.isLoading ? <BloqueEstado id="equipo-lista" estado="cargando" /> : null}
        {equipoQuery.isError ? (
          <BloqueEstado id="equipo-lista" estado="error" onReintentar={() => equipoQuery.refetch()} />
        ) : null}

        {equipoQuery.data ? (
          equipoQuery.data.items.length === 0 ? (
            <BloqueEstado id="equipo-lista" estado="vacio" mensaje="No tienes analistas asignados." />
          ) : (
            <div className="tabla-contenedor">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Supervisado desde</th>
                  </tr>
                </thead>
                <tbody>
                  {equipoQuery.data.items.map((analista) => (
                    <tr key={analista.id} data-testid={`fila-analista-${analista.id}`}>
                      <td>{analista.nombre}</td>
                      <td>{analista.correo}</td>
                      <td>{formatearFechaCorta(analista.supervisadoDesde)}</td>
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
