import { Link } from "react-router-dom";
import { useInicioQe } from "@/api/inicio";
import { BloqueEstado } from "@/components/BloqueEstado";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";

/** F03: resumen de equipo y de HDU bajo supervisión, con acceso a ambos listados. */
export function QeInicioPage() {
  const inicioQuery = useInicioQe();

  return (
    <div>
      <div className="encabezado">
        <p className="etiqueta">Portal QE</p>
        <h1>Inicio</h1>
        <p>Resumen de tu equipo y de las historias bajo tu supervisión.</p>
      </div>

      {inicioQuery.isLoading ? <BloqueEstado id="inicio-qe" estado="cargando" /> : null}
      {inicioQuery.isError ? <BloqueEstado id="inicio-qe" estado="error" onReintentar={() => inicioQuery.refetch()} /> : null}

      {inicioQuery.data ? (
        <div className="tarjetas-resumen">
          <TarjetaMetrica
            id="equipo"
            titulo="Analistas supervisados"
            estado={inicioQuery.data.equipo.estado}
            valor={inicioQuery.data.equipo.estado === "ok" ? inicioQuery.data.equipo.datos.analistasVigentes : undefined}
          />
          <TarjetaMetrica
            id="hdu-qe"
            titulo="HDU bajo supervisión"
            estado={inicioQuery.data.hdu.estado}
            valor={inicioQuery.data.hdu.estado === "ok" ? inicioQuery.data.hdu.datos.hduEnAmbito : undefined}
          />
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-cabecera">
          <h2>Accesos rápidos</h2>
        </div>
        <div className="enlaces-rapidos">
          <Link className="boton boton--secundario" to="/qe/equipo">
            Ver equipo
          </Link>
          <Link className="boton boton--secundario" to="/qe/hdu">
            Ver historias supervisadas
          </Link>
        </div>
      </div>
    </div>
  );
}
