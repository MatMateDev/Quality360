import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthContext";
import { BloqueEstado } from "@/components/BloqueEstado";
import { InsigniaRol } from "@/components/Etiquetas";
import { http } from "@/lib/httpClient";
import type { Perfil } from "@/types/dominio";

/** F11: nombre, correo y rol vigente (de solo lectura). Se refresca al abrir la pantalla (F11#3). */
export function PerfilPage() {
  const { perfil: perfilSesion } = useAuth();
  const perfilQuery = useQuery({
    queryKey: ["perfil", "detalle"],
    queryFn: () => http.get<Perfil>("/v1/me"),
    initialData: perfilSesion ?? undefined,
    refetchOnMount: "always",
  });

  return (
    <section className="panel contenedor--angosto" aria-labelledby="titulo-perfil">
      <div className="encabezado">
        <p className="etiqueta">Mi cuenta</p>
        <h1 id="titulo-perfil">Perfil</h1>
      </div>

      {perfilQuery.isLoading ? <BloqueEstado id="perfil" estado="cargando" /> : null}
      {perfilQuery.isError ? <BloqueEstado id="perfil" estado="error" onReintentar={() => perfilQuery.refetch()} /> : null}

      {perfilQuery.data ? (
        <div className="resumen-detalle">
          <article>
            <span>Nombre</span>
            <strong>{perfilQuery.data.nombre}</strong>
          </article>
          <article>
            <span>Correo</span>
            <strong>{perfilQuery.data.correo}</strong>
          </article>
          <article>
            <span>Rol</span>
            <strong>
              <InsigniaRol rol={perfilQuery.data.rol} />
            </strong>
          </article>
        </div>
      ) : null}

      <p className="indicador-ingresando">El rol lo administra un Administrador; no es editable desde tu perfil.</p>
    </section>
  );
}
