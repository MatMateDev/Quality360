import { Link } from "react-router-dom";
import { useInicioAdmin } from "@/api/inicio";
import { BloqueEstado } from "@/components/BloqueEstado";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";

/** F08: accesos a usuarios, roles y supervisión, sin caché (refleja altas recientes). */
export function AdminInicioPage() {
  const inicioQuery = useInicioAdmin();

  return (
    <div>
      <div className="encabezado">
        <p className="etiqueta">Portal Administrador</p>
        <h1>Inicio</h1>
        <p>Estado de usuarios y de la organización de supervisión QA.</p>
      </div>

      {inicioQuery.isLoading ? <BloqueEstado id="inicio-admin" estado="cargando" /> : null}
      {inicioQuery.isError ? <BloqueEstado id="inicio-admin" estado="error" onReintentar={() => inicioQuery.refetch()} /> : null}

      {inicioQuery.data ? (
        <div className="tarjetas-resumen">
          <TarjetaMetrica
            id="usuarios-total"
            titulo="Usuarios totales"
            estado={inicioQuery.data.usuarios.estado}
            valor={inicioQuery.data.usuarios.estado === "ok" ? inicioQuery.data.usuarios.datos.total : undefined}
          />
          <TarjetaMetrica
            id="usuarios-activos"
            titulo="Usuarios activos"
            estado={inicioQuery.data.usuarios.estado}
            valor={inicioQuery.data.usuarios.estado === "ok" ? inicioQuery.data.usuarios.datos.activos : undefined}
          />
          <TarjetaMetrica
            id="supervision-vigentes"
            titulo="Relaciones vigentes"
            estado={inicioQuery.data.supervision.estado}
            valor={inicioQuery.data.supervision.estado === "ok" ? inicioQuery.data.supervision.datos.relacionesVigentes : undefined}
          />
          <TarjetaMetrica
            id="supervision-sin-supervisor"
            titulo="Analistas sin supervisor"
            estado={inicioQuery.data.supervision.estado}
            valor={inicioQuery.data.supervision.estado === "ok" ? inicioQuery.data.supervision.datos.analistasSinSupervisor : undefined}
          />
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-cabecera">
          <h2>Accesos rápidos</h2>
        </div>
        <div className="enlaces-rapidos">
          <Link className="boton boton--secundario" to="/admin/usuarios">
            Gestionar usuarios
          </Link>
          <Link className="boton boton--secundario" to="/admin/supervision">
            Gestionar supervisión
          </Link>
        </div>
      </div>
    </div>
  );
}
