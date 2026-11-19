import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useBandejaAdmin } from "@/api/bandejas";
import { useConteoHduPorEstado } from "@/api/hdu";
import { useInicioAdmin } from "@/api/inicio";
import { BloqueEstado } from "@/components/BloqueEstado";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";
import { TarjetaContador } from "@/components/bandeja/TarjetaContador";
import { AnilloPorcentaje, DistribucionDona, porcentajeDe } from "@/components/dashboard/Distribucion";
import { ESTADOS_HDU, ETIQUETAS_ESTADO_HDU, ETIQUETAS_ROL, ROLES_CATALOGO, type EstadoHdu, type Rol } from "@/types/dominio";
import "../../styles/qe-dashboard.css";
import "../../styles/admin-dashboard.css";

/** Un color fijo por rol (sigue al rol, no a su posición). Valores claro y oscuro en `admin-dashboard.css`. */
const COLOR_ROL: Record<Rol, string> = {
  ANALISTA_QA: "var(--dash-rol-analista)",
  QE: "var(--dash-rol-qe)",
  LIDER_QA: "var(--dash-rol-lider)",
  ADMINISTRADOR: "var(--dash-rol-admin)",
  AUDITOR: "var(--dash-rol-auditor)",
};

/** Los mismos colores por estado que el Dashboard QE: un estado se ve igual en ambos dashboards. */
const COLOR_ESTADO: Record<EstadoHdu, string> = {
  PENDIENTE: "var(--q360-color-texto-secundario)",
  DISENO_PRUEBAS: "var(--q360-color-acento)",
  EN_EJECUCION: "var(--q360-color-lider)",
  PENDIENTE_CIERRE: "var(--q360-color-alerta)",
  CERRADA: "var(--q360-color-exito)",
};

type EstadoTarjeta = "ok" | "cargando" | "error" | "indisponible";

/** Estado de una cifra: error o carga de la consulta; si respondió, `ok` solo con su bloque `ok` (D34). */
function estadoDe(consulta: { isLoading: boolean; isError: boolean }, bloque: { estado: string } | undefined): EstadoTarjeta {
  if (consulta.isError) return "error";
  if (consulta.isLoading) return "cargando";
  return bloque?.estado === "ok" ? "ok" : "indisponible";
}

function plural(cantidad: number, singular: string, varios: string): string {
  return cantidad === 1 ? singular : varios;
}

/**
 * Dashboard del Administrador: la versión del Dashboard QE (E6) con los datos de su rol —usuarios,
 * roles, supervisión, organización QA, HDU de toda la plataforma e impedimentos—. Solo usa consultas
 * que el Administrador ya tiene (inicio, bandeja y listado de HDU); nunca muestra cifras inventadas.
 */
export function AdminDashboardPage() {
  const [temaOscuro, setTemaOscuro] = useState(false);
  const inicio = useInicioAdmin();
  const bandeja = useBandejaAdmin();
  const hdu = useConteoHduPorEstado();
  const idResumen = useId();
  const idRoles = useId();
  const idOrganizacion = useId();
  const idHdu = useId();
  const idRiesgos = useId();

  const usuarios = inicio.data?.usuarios;
  const datosUsuarios = usuarios?.estado === "ok" ? usuarios.datos : undefined;
  const supervision = inicio.data?.supervision;

  const contadores = bandeja.data?.contadores;
  const activos = contadores?.usuariosActivos;
  const datosActivos = activos?.estado === "ok" ? activos.datos : undefined;

  // Cobertura de supervisión: analistas activos con un QE vigente sobre todos los analistas activos.
  const analistasActivos = datosActivos?.porRol.ANALISTA_QA;
  const sinQe = contadores?.analistasSinQe;
  const analistasSinQe = sinQe?.estado === "ok" ? sinQe.datos.valor : undefined;
  const analistasConQe =
    analistasActivos !== undefined && analistasSinQe !== undefined ? Math.max(analistasActivos - analistasSinQe, 0) : undefined;
  const cobertura =
    analistasConQe !== undefined && analistasActivos !== undefined && analistasActivos > 0
      ? porcentajeDe(analistasConQe, analistasActivos)
      : undefined;
  const estadoCobertura: EstadoTarjeta = bandeja.isError
    ? "error"
    : bandeja.isLoading
      ? "cargando"
      : cobertura === undefined
        ? "indisponible"
        : "ok";

  const porEstado = hdu.porEstado;
  const totalHdu = porEstado ? ESTADOS_HDU.reduce((suma, estado) => suma + porEstado[estado], 0) : undefined;
  const cerradas = porEstado?.CERRADA;
  const tasaCierre = totalHdu !== undefined && totalHdu > 0 && cerradas !== undefined ? porcentajeDe(cerradas, totalHdu) : undefined;

  const impedimentos = bandeja.data?.impedimentos;
  const escalados = impedimentos?.escalados;

  return (
    <div className={`qe-dashboard dash-admin${temaOscuro ? " qe-dashboard--oscuro" : ""}`} data-testid="dashboard-admin">
      <header className="qe-dashboard__hero">
        <div>
          <span className="qe-dashboard__etiqueta">Quality360 · Administrador</span>
          <h1>Dashboard Administrador</h1>
          <p>Seguimiento de usuarios, roles, supervisión QA, organización e historias de usuario de toda la plataforma.</p>
        </div>
        <div className="qe-dashboard__acciones">
          <span className="qe-dashboard__insignia">Analítica E6</span>
          <button
            type="button"
            className="qe-dashboard__boton-tema"
            aria-pressed={temaOscuro}
            onClick={() => setTemaOscuro((actual) => !actual)}
          >
            {temaOscuro ? "☀ Modo claro" : "☾ Modo oscuro"}
          </button>
        </div>
      </header>

      <section aria-labelledby={idResumen}>
        <div className="panel-cabecera">
          <div>
            <h2 id={idResumen}>Resumen de la plataforma</h2>
            <p>Indicadores globales de usuarios, supervisión e historias de usuario.</p>
          </div>
        </div>

        <div className="qe-dashboard__metricas">
          <TarjetaMetrica
            id="dash-admin-usuarios"
            titulo="Usuarios activos"
            estado={estadoDe(inicio, usuarios)}
            valor={datosUsuarios?.activos}
            detalle={datosUsuarios ? `de ${datosUsuarios.total} ${plural(datosUsuarios.total, "registrado", "registrados")}` : undefined}
            onReintentar={() => inicio.refetch()}
          />
          <TarjetaMetrica
            id="dash-admin-supervision"
            titulo="Relaciones de supervisión vigentes"
            estado={estadoDe(inicio, supervision)}
            valor={supervision?.estado === "ok" ? supervision.datos.relacionesVigentes : undefined}
            onReintentar={() => inicio.refetch()}
          />
          <TarjetaContador consulta={bandeja} id="dash-admin-hdu" clave="dash-admin-hdu" titulo="HDU en la plataforma" contador={contadores?.hduTotal} />
          <TarjetaMetrica
            id="dash-admin-cobertura"
            titulo="Cobertura de supervisión"
            estado={estadoCobertura}
            valor={cobertura === undefined ? undefined : `${cobertura}%`}
            mensajeIndisponible={analistasActivos === 0 ? "Sin analistas activos" : undefined}
            onReintentar={analistasActivos === 0 ? undefined : () => bandeja.refetch()}
          />
        </div>
      </section>

      <div className="qe-dashboard__contenido">
        <section className="qe-dashboard__panel" aria-labelledby={idRoles}>
          <h2 id={idRoles}>Usuarios activos por rol</h2>
          <p className="qe-dashboard__descripcion">Cantidad y proporción de usuarios activos según su rol en la plataforma.</p>

          {bandeja.isError ? (
            <BloqueEstado id="dash-admin-roles" estado="error" onReintentar={() => bandeja.refetch()} />
          ) : bandeja.isLoading ? (
            <p role="status">Cargando distribución…</p>
          ) : !datosActivos ? (
            <BloqueEstado id="dash-admin-roles" estado="indisponible" onReintentar={() => bandeja.refetch()} />
          ) : datosActivos.valor === 0 ? (
            <p>No hay usuarios activos.</p>
          ) : (
            <DistribucionDona
              id="dash-admin-rol"
              titulo="Usuarios activos por rol"
              unidad="usuarios activos"
              partes={ROLES_CATALOGO.map((rol) => ({ clave: rol, etiqueta: ETIQUETAS_ROL[rol], valor: datosActivos.porRol[rol], color: COLOR_ROL[rol] }))}
            />
          )}

          {cobertura !== undefined && analistasConQe !== undefined && analistasSinQe !== undefined ? (
            <div className="qe-dashboard__cierre">
              <AnilloPorcentaje
                testId="dash-admin-anillo-cobertura"
                porcentaje={cobertura}
                etiqueta="Cobertura"
                descripcion="Cobertura de supervisión"
                color="var(--q360-color-acento)"
              />
              <div className="qe-dashboard__cierre-detalle">
                <h3>Cobertura de supervisión</h3>
                <p>
                  <strong>{analistasConQe}</strong> {plural(analistasConQe, "analista con QE vigente", "analistas con QE vigente")}
                </p>
                <p>
                  <strong>{analistasSinQe}</strong> {plural(analistasSinQe, "analista sin QE", "analistas sin QE")}
                </p>
                <span>Proporción de analistas activos que tienen un QE supervisor vigente.</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="qe-dashboard__panel" aria-labelledby={idOrganizacion}>
          <h2 id={idOrganizacion}>Organización QA</h2>
          <p className="qe-dashboard__descripcion">Configuración pendiente que deja analistas, QE, líderes o células sin cubrir.</p>

          <div className="qe-dashboard__alertas">
            <TarjetaContador consulta={bandeja} id="dash-admin-analistas-sin-qe" clave="dash-admin-analistas-sin-qe" titulo="Analistas sin QE" contador={contadores?.analistasSinQe} atencion />
            <TarjetaContador consulta={bandeja} id="dash-admin-qe-sin-analistas" clave="dash-admin-qe-sin-analistas" titulo="QE sin analistas" contador={contadores?.qeSinAnalistas} atencion />
            <TarjetaContador consulta={bandeja} id="dash-admin-lideres-sin-celulas" clave="dash-admin-lideres-sin-celulas" titulo="Líderes sin células" contador={contadores?.lideresSinCelulas} atencion />
            <TarjetaContador consulta={bandeja} id="dash-admin-celulas-sin-lider" clave="dash-admin-celulas-sin-lider" titulo="Células sin líder" contador={contadores?.celulasSinLider} atencion />
          </div>
          <Link className="boton boton--secundario dash-admin__accion" to="/admin" data-testid="dash-admin-ir-pendientes">
            Resolver pendientes en la Bandeja
          </Link>
        </section>
      </div>

      <div className="qe-dashboard__contenido">
        <section className="qe-dashboard__panel" aria-labelledby={idHdu}>
          <h2 id={idHdu}>HDU de la plataforma por estado</h2>
          <p className="qe-dashboard__descripcion">Cantidad y proporción de historias de usuario en cada etapa del proceso de certificación.</p>

          {hdu.isError ? (
            <BloqueEstado id="dash-admin-hdu-estados" estado="error" onReintentar={hdu.refetch} />
          ) : !porEstado || totalHdu === undefined ? (
            <p role="status">Cargando distribución…</p>
          ) : totalHdu === 0 ? (
            <p>No hay HDU registradas en la plataforma.</p>
          ) : (
            <DistribucionDona
              id="dash-admin-estado"
              titulo="HDU por estado"
              unidad="HDU en la plataforma"
              partes={ESTADOS_HDU.map((estado) => ({ clave: estado, etiqueta: ETIQUETAS_ESTADO_HDU[estado], valor: porEstado[estado], color: COLOR_ESTADO[estado] }))}
            />
          )}

          {tasaCierre !== undefined && totalHdu !== undefined && cerradas !== undefined ? (
            <div className="qe-dashboard__cierre">
              <AnilloPorcentaje
                testId="dash-admin-anillo-cierre"
                porcentaje={tasaCierre}
                etiqueta="Tasa de cierre"
                descripcion="Tasa de cierre de HDU"
                color="var(--q360-color-exito)"
              />
              <div className="qe-dashboard__cierre-detalle">
                <h3>Certificación y cierre</h3>
                <p>
                  <strong>{cerradas}</strong> {plural(cerradas, "HDU cerrada", "HDU cerradas")}
                </p>
                <p>
                  <strong>{totalHdu - cerradas}</strong> {plural(totalHdu - cerradas, "HDU no cerrada", "HDU no cerradas")}
                </p>
                <span>Proporción de HDU cerradas respecto del total de la plataforma.</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="qe-dashboard__panel" aria-labelledby={idRiesgos}>
          <h2 id={idRiesgos}>Riesgos e impedimentos</h2>
          <p className="qe-dashboard__descripcion">
            Situaciones que pueden afectar la certificación de las HDU. Los gestiona el QE responsable de cada HDU; los escalados a ti aparecen
            en tu Bandeja.
          </p>

          <div className="qe-dashboard__alertas">
            <TarjetaContador consulta={bandeja} id="dash-admin-impedimentos-abiertos" clave="dash-admin-impedimentos-abiertos" titulo="Impedimentos abiertos" contador={impedimentos?.contadores.impedimentosAbiertos} />
            <TarjetaContador consulta={bandeja} id="dash-admin-hdu-bloqueadas" clave="dash-admin-hdu-bloqueadas" titulo="HDU bloqueadas" contador={impedimentos?.contadores.hduBloqueadas} />
            <TarjetaContador consulta={bandeja} id="dash-admin-hdu-riesgo-alto" clave="dash-admin-hdu-riesgo-alto" titulo="HDU en riesgo alto" contador={impedimentos?.contadores.hduRiesgoAlto} />
            <TarjetaMetrica
              id="dash-admin-escalados"
              clave="dash-admin-escalados"
              titulo="Impedimentos escalados a mí"
              estado={estadoDe(bandeja, escalados)}
              valor={escalados?.estado === "ok" ? escalados.datos.total : undefined}
              mensajeIndisponible="No disponible"
              atencion
              onReintentar={() => bandeja.refetch()}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
