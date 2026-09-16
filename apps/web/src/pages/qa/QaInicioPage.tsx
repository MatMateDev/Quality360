import { Link } from "react-router-dom";
import { useInicioQa } from "@/api/inicio";
import { BloqueEstado } from "@/components/BloqueEstado";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";

/** F06: QE supervisor ("Sin supervisor asignado" si no tiene) y resumen de HDU asignadas. */
export function QaInicioPage() {
  const inicioQuery = useInicioQa();

  return (
    <div>
      <div className="encabezado">
        <p className="etiqueta">Portal Analista QA</p>
        <h1>Inicio</h1>
        <p>Tu supervisor vigente y el resumen de tus historias asignadas.</p>
      </div>

      {inicioQuery.isLoading ? <BloqueEstado id="inicio-qa" estado="cargando" /> : null}
      {inicioQuery.isError ? <BloqueEstado id="inicio-qa" estado="error" onReintentar={() => inicioQuery.refetch()} /> : null}

      {inicioQuery.data ? (
        <div className="tarjetas-resumen">
          <article className="tarjeta-resumen" data-testid="tarjeta-supervisor">
            <span className="tarjeta-resumen__titulo">QE supervisor</span>
            {inicioQuery.data.supervisor.estado === "ok" ? (
              <strong className="tarjeta-resumen__valor" data-testid="valor-supervisor">
                {inicioQuery.data.supervisor.datos.supervisor?.nombre ?? "Sin supervisor asignado"}
              </strong>
            ) : (
              <BloqueEstado id="supervisor" estado={inicioQuery.data.supervisor.estado} />
            )}
          </article>

          <TarjetaMetrica
            id="hdu-qa"
            titulo="HDU asignadas"
            estado={inicioQuery.data.hdu.estado}
            valor={inicioQuery.data.hdu.estado === "ok" ? inicioQuery.data.hdu.datos.hduAsignadas : undefined}
            onReintentar={() => inicioQuery.refetch()}
          />
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-cabecera">
          <h2>Accesos rápidos</h2>
        </div>
        <div className="enlaces-rapidos">
          <Link className="boton boton--secundario" to="/qa/hdu">
            Ver mis HDU
          </Link>
        </div>
      </div>
    </div>
  );
}
