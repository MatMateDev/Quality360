import { useId } from "react";
import { Link } from "react-router-dom";
import { useBandejaAdmin } from "@/api/bandejas";
import { useInicioAdmin } from "@/api/inicio";
import { BloqueEstado } from "@/components/BloqueEstado";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";
import { BloqueDatos, EncabezadoBandeja, GrupoContadores, type EstadoDatos } from "@/components/bandeja/Estructura";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { TarjetaContador } from "@/components/bandeja/TarjetaContador";
import { formatearFecha } from "@/lib/formato";
import {
  ETIQUETAS_OPERACION,
  ETIQUETAS_ROL,
  ROLES_CATALOGO,
  type PendienteConfiguracion,
  type RegistroAuditoriaUsuario,
  type TipoPendienteAdmin,
} from "@/types/dominio";

const SEGMENTO_TIPO: Record<TipoPendienteAdmin, string> = {
  ANALISTA_SIN_QE: "analista-sin-qe",
  QE_SIN_ANALISTAS: "qe-sin-analistas",
  LIDER_SIN_CELULAS: "lider-sin-celulas",
  CELULA_SIN_LIDER: "celula-sin-lider",
};

const SITUACION: Record<TipoPendienteAdmin, string> = {
  ANALISTA_SIN_QE: "Analista sin QE",
  QE_SIN_ANALISTAS: "QE sin analistas",
  LIDER_SIN_CELULAS: "Líder sin células",
  CELULA_SIN_LIDER: "Célula sin líder",
};

function idPendiente(p: PendienteConfiguracion): string {
  return p.usuario?.id ?? p.celula?.id ?? "";
}

/** Destino y rótulo del botón de cada pendiente (D51). */
function accionPendiente(p: PendienteConfiguracion): { a: string; texto: string; testId: string } {
  const id = idPendiente(p);
  switch (p.tipo) {
    case "ANALISTA_SIN_QE":
      return { a: `/admin/supervision?analista=${id}`, texto: "Asignar QE", testId: `boton-asignar-qe-${id}` };
    case "QE_SIN_ANALISTAS":
      return { a: `/admin/supervision?qe=${id}`, texto: "Asignar analistas", testId: `boton-asignar-analistas-${id}` };
    case "LIDER_SIN_CELULAS":
      return { a: `/admin/usuarios?usuario=${id}`, texto: "Asignar células", testId: `boton-asignar-celulas-${id}` };
    default:
      return { a: "/admin/usuarios?rol=LIDER_QA", texto: "Asignar líder", testId: `boton-asignar-lider-${id}` };
  }
}

/**
 * Bandeja del Administrador (E7-F05) sobre el inicio certificado de E1-F08: se conservan las cuatro tarjetas
 * y los accesos, y se agregan contadores de configuración, «Pendientes» y «Últimos cambios».
 */
export function AdminInicioPage() {
  const inicioQuery = useInicioAdmin();
  const bandeja = useBandejaAdmin();
  const idPendientes = useId();
  const idCambios = useId();
  const datos = bandeja.data;

  const activos = datos?.contadores.usuariosActivos;
  const desglose =
    activos?.estado === "ok" ? (
      <dl>
        {ROLES_CATALOGO.map((rol) => (
          <div key={rol}>
            <dt style={{ display: "inline" }}>{ETIQUETAS_ROL[rol]}: </dt>
            <dd style={{ display: "inline", marginLeft: 0 }} data-testid={`desglose-rol-${rol}`}>
              {activos.datos.porRol[rol]}
            </dd>
          </div>
        ))}
      </dl>
    ) : undefined;

  const pend = datos?.pendientes;
  const estadoPend: EstadoDatos = bandeja.isError ? "error" : bandeja.isLoading || !pend ? "cargando" : pend.estado !== "ok" ? "indisponible" : pend.datos.items.length === 0 ? "vacio" : "ok";
  const cambios = datos?.ultimosCambios;
  const estadoCambios: EstadoDatos = bandeja.isError ? "error" : bandeja.isLoading || !cambios ? "cargando" : cambios.estado !== "ok" ? "indisponible" : cambios.datos.items.length === 0 ? "vacio" : "ok";

  const columnasPend: Columna<PendienteConfiguracion>[] = [
    { id: "quien", titulo: "Usuario o célula", render: (p) => p.usuario?.nombre ?? p.celula?.nombre ?? "—" },
    { id: "situacion", titulo: "Situación", render: (p) => SITUACION[p.tipo] },
    {
      id: "accion",
      titulo: "Acción",
      render: (p) => {
        const accion = accionPendiente(p);
        return (
          <Link className="boton boton--secundario" to={accion.a} data-testid={accion.testId}>
            {accion.texto}
          </Link>
        );
      },
    },
  ];

  const columnasCambios: Columna<RegistroAuditoriaUsuario>[] = [
    { id: "fecha", titulo: "Fecha", render: (r) => <time dateTime={r.fecha}>{formatearFecha(r.fecha)}</time> },
    { id: "actor", titulo: "Actor", render: (r) => r.actor.nombre },
    { id: "operacion", titulo: "Operación", render: (r) => ETIQUETAS_OPERACION[r.operacion] ?? r.operacion },
    { id: "afectado", titulo: "Usuario afectado", render: (r) => r.usuarioAfectado?.nombre ?? "—" },
  ];

  return (
    <div data-testid="bandeja-admin">
      <EncabezadoBandeja etiqueta="Portal Administrador" descripcion="Estado de usuarios y de la organización de supervisión QA." />

      {inicioQuery.isLoading ? <BloqueEstado id="inicio-admin" estado="cargando" /> : null}
      {inicioQuery.isError ? <BloqueEstado id="inicio-admin" estado="error" onReintentar={() => inicioQuery.refetch()} /> : null}
      {bandeja.isError && !inicioQuery.isError ? <BloqueEstado id="bandeja-admin" estado="error" onReintentar={() => bandeja.refetch()} /> : null}

      {inicioQuery.data ? (
        <>
          <GrupoContadores titulo="Usuarios">
            <TarjetaMetrica
              id="usuarios-total"
              titulo="Usuarios totales"
              estado={inicioQuery.data.usuarios.estado}
              valor={inicioQuery.data.usuarios.estado === "ok" ? inicioQuery.data.usuarios.datos.total : undefined}
            />
            <TarjetaMetrica
              id="usuarios-activos"
              clave="usuarios-activos"
              titulo="Usuarios activos"
              estado={inicioQuery.data.usuarios.estado}
              valor={inicioQuery.data.usuarios.estado === "ok" ? inicioQuery.data.usuarios.datos.activos : undefined}
              detalle={desglose}
            />
            <TarjetaContador consulta={bandeja} id="usuarios-inactivos" clave="usuarios-inactivos" titulo="Usuarios inactivos" contador={datos?.contadores.usuariosInactivos} />
          </GrupoContadores>

          <GrupoContadores titulo="Supervisión y organización">
            <TarjetaMetrica
              id="supervision-vigentes"
              titulo="Relaciones vigentes"
              estado={inicioQuery.data.supervision.estado}
              valor={inicioQuery.data.supervision.estado === "ok" ? inicioQuery.data.supervision.datos.relacionesVigentes : undefined}
            />
            <TarjetaMetrica
              id="supervision-sin-supervisor"
              clave="analistas-sin-qe"
              titulo="Analistas sin supervisor"
              atencion
              estado={inicioQuery.data.supervision.estado}
              valor={inicioQuery.data.supervision.estado === "ok" ? inicioQuery.data.supervision.datos.analistasSinSupervisor : undefined}
            />
            <TarjetaContador consulta={bandeja} id="qe-sin-analistas" clave="qe-sin-analistas" titulo="QE sin analistas" contador={datos?.contadores.qeSinAnalistas} atencion />
            <TarjetaContador consulta={bandeja} id="lideres-sin-celulas" clave="lideres-sin-celulas" titulo="Líderes sin células" contador={datos?.contadores.lideresSinCelulas} atencion />
            <TarjetaContador consulta={bandeja} id="celulas-sin-lider" clave="celulas-sin-lider" titulo="Células sin líder" contador={datos?.contadores.celulasSinLider} atencion />
            <TarjetaContador consulta={bandeja} id="hdu-total" clave="hdu-total" titulo="HDU totales" contador={datos?.contadores.hduTotal} />
          </GrupoContadores>
        </>
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
          <Link className="boton boton--secundario" to="/admin/usuarios?nuevo=1">
            Registrar usuario
          </Link>
        </div>
      </div>

      {inicioQuery.isError ? null : (
        <>
          <section className="panel" aria-labelledby={idPendientes}>
            <div className="panel-cabecera">
              <h2 id={idPendientes}>Pendientes de configuración</h2>
            </div>
            <BloqueDatos
              clave="pendientes"
              estado={estadoPend}
              tonoVacio="exito"
              mensajeVacio="No hay pendientes de configuración"
              onReintentar={() => bandeja.refetch()}
            >
              {pend?.estado === "ok" ? (
                <TablaBandeja
                  testId="lista-pendientes"
                  caption="Usuarios y células con configuración pendiente"
                  columnas={columnasPend}
                  items={pend.datos.items}
                  clave={(p) => `${p.tipo}-${idPendiente(p)}`}
                  testIdFila={(p) => `fila-pendiente-${SEGMENTO_TIPO[p.tipo]}-${idPendiente(p)}`}
                />
              ) : null}
            </BloqueDatos>
          </section>

          <section className="panel" aria-labelledby={idCambios}>
            <div className="panel-cabecera">
              <h2 id={idCambios}>Últimos cambios</h2>
            </div>
            <BloqueDatos clave="ultimos-cambios" estado={estadoCambios} mensajeVacio="Aún no hay cambios registrados" onReintentar={() => bandeja.refetch()}>
              {cambios?.estado === "ok" ? (
                <TablaBandeja
                  testId="lista-ultimos-cambios"
                  caption="Los 10 cambios de usuarios más recientes"
                  columnas={columnasCambios}
                  items={cambios.datos.items.slice(0, 10)}
                  clave={(r) => r.id}
                  testIdFila={(r) => `fila-cambio-${cambios.datos.items.indexOf(r)}`}
                />
              ) : null}
            </BloqueDatos>
          </section>
        </>
      )}
    </div>
  );
}
