import { Link } from "react-router-dom";
import { useBandejaAprobaciones } from "@/api/checklist";
import { BloqueEstado } from "@/components/BloqueEstado";
import { formatearFecha } from "@/lib/formato";

/** E3-F03#3: bandeja del QE con entregables por aprobar agrupados por HDU. */
export function QeAprobacionesPage() {
  const bandejaQuery = useBandejaAprobaciones();

  return (
    <div>
      <div className="encabezado">
        <p className="etiqueta">Portal QE</p>
        <h1>Aprobaciones pendientes</h1>
        <p>Entregables marcados por los analistas en las HDU donde eres el QE responsable.</p>
      </div>

      {bandejaQuery.isLoading ? <BloqueEstado id="bandeja-aprobaciones" estado="cargando" /> : null}
      {bandejaQuery.isError ? (
        <BloqueEstado id="bandeja-aprobaciones" estado="error" onReintentar={() => bandejaQuery.refetch()} />
      ) : null}

      {bandejaQuery.data ? (
        bandejaQuery.data.grupos.length === 0 ? (
          <BloqueEstado id="bandeja-aprobaciones" estado="vacio" mensaje="No tienes entregables por aprobar." />
        ) : (
          <>
            <p data-testid="bandeja-total">
              {bandejaQuery.data.total} {bandejaQuery.data.total === 1 ? "entregable por aprobar" : "entregables por aprobar"}
            </p>
            {bandejaQuery.data.grupos.map((grupo) => (
              <section key={grupo.hdu.id} className="panel" data-testid={`grupo-bandeja-${grupo.hdu.codigo}`}>
                <div className="panel-cabecera">
                  <div>
                    <p className="etiqueta">{grupo.hdu.codigo}</p>
                    <h2>{grupo.hdu.titulo}</h2>
                    <p>Analista: {grupo.hdu.analista?.nombre ?? "Sin asignar"}</p>
                  </div>
                  <Link className="boton boton--primario" to={`/hdu/${grupo.hdu.id}`}>
                    Revisar HDU
                  </Link>
                </div>
                <ul className="historial-lista">
                  {grupo.entregables.map((entregable) => (
                    <li key={entregable.clave} className="historial-item" data-testid={`bandeja-${grupo.hdu.codigo}-${entregable.clave}`}>
                      <strong>
                        {entregable.orden}. {entregable.nombre}
                      </strong>
                      <p>
                        Marcado por {entregable.completado?.nombre ?? "—"}
                        {entregable.completado ? ` · ${formatearFecha(entregable.completado.fecha)}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )
      ) : null}
    </div>
  );
}
