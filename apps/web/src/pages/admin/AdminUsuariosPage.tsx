import { useEffect, useRef, useState } from "react";
import { useCelulas } from "@/api/catalogos";
import {
  useActualizarUsuario,
  useCambiarRolUsuario,
  useCrearUsuario,
  useUsuario,
  useUsuarios,
  type FiltrosUsuarios,
} from "@/api/usuarios";
import { BloqueEstado } from "@/components/BloqueEstado";
import { DialogoCelulasLider } from "@/components/DialogoCelulasLider";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { InsigniaActivo, InsigniaRol } from "@/components/Etiquetas";
import { MensajeRelaciones } from "@/components/MensajeRelaciones";
import { relacionesDe } from "@/lib/relaciones";
import { SelectorCelulas } from "@/components/SelectorCelulas";
import { BarraFiltros, type CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { MensajeExito } from "@/components/bandeja/Estructura";
import { Paginacion } from "@/components/bandeja/Paginacion";
import { useFiltrosUrl } from "@/lib/filtrosUrl";
import { ErrorApi } from "@/lib/httpClient";
import { ETIQUETAS_ROL, ROLES_CATALOGO, type Rol, type Usuario } from "@/types/dominio";

const ROL_VALIDO = (valor: string): Rol | undefined => ROLES_CATALOGO.find((r) => r === valor);

/**
 * F09 + E7-F07: listar y buscar (paginado), alta, edición, cambio de rol con células en una sola operación (D42),
 * células del Líder con historial y activar/desactivar, siempre con confirmación previa.
 * Acepta `?usuario=<id>`, `?rol=<ROL>` y `?nuevo=1` (D44, sin ellos la pantalla es la certificada).
 */
export function AdminUsuariosPage() {
  const url = useFiltrosUrl();
  const filtros: FiltrosUsuarios = {
    q: url.get("q") || undefined,
    rol: ROL_VALIDO(url.get("rol")),
    pagina: url.pagina,
    tamanoPagina: url.tamano,
  };
  const usuariosQuery = useUsuarios(filtros);
  const celulasQuery = useCelulas();
  const catalogo = celulasQuery.data?.items ?? [];

  const crearUsuario = useCrearUsuario();
  const actualizarUsuario = useActualizarUsuario();
  const cambiarRolUsuario = useCambiarRolUsuario();

  const [exito, setExito] = useState<string | null>(null);

  const [dialogoCrearAbierto, setDialogoCrearAbierto] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState({ nombre: "", correo: "", rol: "ANALISTA_QA" as Rol });
  const [celulasNuevo, setCelulasNuevo] = useState<string[]>([]);
  const [erroresCrear, setErroresCrear] = useState<Record<string, string>>({});

  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [edicion, setEdicion] = useState({ nombre: "", correo: "" });
  const [erroresEditar, setErroresEditar] = useState<Record<string, string>>({});

  const [usuarioCambioRol, setUsuarioCambioRol] = useState<Usuario | null>(null);
  const [rolSeleccionado, setRolSeleccionado] = useState<Rol>("ANALISTA_QA");
  const [celulasRol, setCelulasRol] = useState<string[]>([]);
  const [errorRol, setErrorRol] = useState<unknown>(null);

  const [usuarioCelulas, setUsuarioCelulas] = useState<Usuario | null>(null);
  const [celulasVacio, setCelulasVacio] = useState(false);

  const [usuarioCambioEstado, setUsuarioCambioEstado] = useState<Usuario | null>(null);
  const [errorEstadoAcceso, setErrorEstadoAcceso] = useState<string | null>(null);

  // ---- preselección por URL (D44) ----
  const idUsuarioUrl = url.get("usuario") || null;
  const usuarioUrl = useUsuario(idUsuarioUrl);
  const yaAbierto = useRef<string | null>(null);
  useEffect(() => {
    if (usuarioUrl.data && yaAbierto.current !== usuarioUrl.data.id) {
      yaAbierto.current = usuarioUrl.data.id;
      if (usuarioUrl.data.rol === "LIDER_QA") setUsuarioCelulas(usuarioUrl.data);
    }
  }, [usuarioUrl.data]);

  const nuevoUrl = url.get("nuevo") === "1";
  const nuevoAbierto = useRef(false);
  useEffect(() => {
    if (nuevoUrl && !nuevoAbierto.current) {
      nuevoAbierto.current = true;
      abrirCrear();
    }
  }, [nuevoUrl]);

  const idResaltado = usuarioUrl.data?.id ?? null;
  const filaResaltada = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    filaResaltada.current?.scrollIntoView?.({ block: "center" });
  }, [idResaltado, usuariosQuery.data]);

  const campos: CampoFiltro[] = [
    { clave: "q", id: "buscador-usuarios", etiqueta: "Buscar por nombre o correo", tipo: "texto" },
    {
      clave: "rol",
      id: "filtro-rol-usuarios",
      etiqueta: "Rol",
      tipo: "select",
      vacio: "Todos los roles",
      opciones: ROLES_CATALOGO.map((rol) => ({ valor: rol, etiqueta: ETIQUETAS_ROL[rol] })),
    },
  ];

  function nombresCelulas(ids: string[]): string {
    return ids
      .map((id) => catalogo.find((c) => c.id === id)?.nombre ?? id)
      .sort((a, b) => a.localeCompare(b))
      .join(", ");
  }

  function abrirCrear() {
    setNuevoUsuario({ nombre: "", correo: "", rol: "ANALISTA_QA" });
    setCelulasNuevo([]);
    setErroresCrear({});
    setDialogoCrearAbierto(true);
  }

  async function confirmarCrear() {
    const errores: Record<string, string> = {};
    if (!nuevoUsuario.nombre.trim()) errores.nombre = "El nombre es obligatorio.";
    if (!nuevoUsuario.correo.trim()) errores.correo = "El correo es obligatorio.";
    setErroresCrear(errores);
    if (Object.keys(errores).length > 0) return;

    try {
      await crearUsuario.mutateAsync(
        nuevoUsuario.rol === "LIDER_QA" ? { ...nuevoUsuario, celulaIds: celulasNuevo } : nuevoUsuario,
      );
      setDialogoCrearAbierto(false);
      setExito(
        nuevoUsuario.rol === "LIDER_QA" && celulasNuevo.length > 0
          ? `${nuevoUsuario.nombre} se registró como Líder QA con ${nombresCelulas(celulasNuevo)}.`
          : `${nuevoUsuario.nombre} se registró como ${ETIQUETAS_ROL[nuevoUsuario.rol]}.`,
      );
    } catch (error) {
      if (error instanceof ErrorApi && error.detalles.length > 0) {
        const nuevos: Record<string, string> = {};
        for (const detalle of error.detalles) nuevos[detalle.campo] = detalle.mensaje;
        setErroresCrear(nuevos);
      } else {
        setErroresCrear({ nombre: error instanceof ErrorApi ? error.mensaje : "No fue posible crear el usuario." });
      }
    }
  }

  function abrirEditar(usuario: Usuario) {
    setUsuarioEditando(usuario);
    setEdicion({ nombre: usuario.nombre, correo: usuario.correo });
    setErroresEditar({});
  }

  async function confirmarEditar() {
    if (!usuarioEditando) return;
    try {
      await actualizarUsuario.mutateAsync({ id: usuarioEditando.id, body: edicion });
      setUsuarioEditando(null);
    } catch (error) {
      setErroresEditar({ correo: error instanceof ErrorApi ? error.mensaje : "No fue posible actualizar el usuario." });
    }
  }

  function abrirCambioRol(usuario: Usuario) {
    setUsuarioCambioRol(usuario);
    setRolSeleccionado(usuario.rol);
    setCelulasRol(usuario.rol === "LIDER_QA" ? usuario.celulasVigentes.map((c) => c.id) : []);
    setErrorRol(null);
  }

  async function confirmarCambioRol() {
    if (!usuarioCambioRol) return;
    setErrorRol(null);
    try {
      // D42: rol y células viajan juntos; el servidor los aplica en una transacción o no aplica nada.
      await cambiarRolUsuario.mutateAsync({
        id: usuarioCambioRol.id,
        body: rolSeleccionado === "LIDER_QA" ? { rol: rolSeleccionado, celulaIds: celulasRol } : { rol: rolSeleccionado },
      });
      setExito(
        rolSeleccionado === "LIDER_QA" && celulasRol.length > 0
          ? `${usuarioCambioRol.nombre} ahora es Líder QA con ${nombresCelulas(celulasRol)}.`
          : `${usuarioCambioRol.nombre} ahora es ${ETIQUETAS_ROL[rolSeleccionado]}.`,
      );
      setUsuarioCambioRol(null);
    } catch (error) {
      setErrorRol(error);
      if (error instanceof ErrorApi && error.status === 422) void celulasQuery.refetch();
    }
  }

  function textoErrorRol(error: unknown): string {
    if (error instanceof ErrorApi && error.status === 422) return "Alguna de las células seleccionadas ya no existe. Actualizamos la lista.";
    if (error instanceof ErrorApi && error.status >= 500) return "No fue posible guardar. Intenta nuevamente.";
    return error instanceof ErrorApi ? error.mensaje : "No fue posible cambiar el rol.";
  }

  function abrirCambioEstado(usuario: Usuario) {
    setUsuarioCambioEstado(usuario);
    setErrorEstadoAcceso(null);
  }

  async function confirmarCambioEstado() {
    if (!usuarioCambioEstado) return;
    try {
      await actualizarUsuario.mutateAsync({ id: usuarioCambioEstado.id, body: { activo: !usuarioCambioEstado.activo } });
      setUsuarioCambioEstado(null);
    } catch (error) {
      setErrorEstadoAcceso(error instanceof ErrorApi ? error.mensaje : "No fue posible actualizar el acceso.");
    }
  }

  const relacionesError = relacionesDe(errorRol);
  const cambiaALider = rolSeleccionado === "LIDER_QA";

  const usuarioFueraDePagina =
    usuarioUrl.data && usuariosQuery.data && !usuariosQuery.data.items.some((u) => u.id === usuarioUrl.data!.id) ? usuarioUrl.data : null;

  function filaUsuario(usuario: Usuario, fueraDePagina: boolean) {
    const resaltado = usuario.id === idResaltado;
    return (
      <tr
        key={usuario.id}
        ref={resaltado ? filaResaltada : undefined}
        data-testid={`fila-usuario-${usuario.id}`}
        className={resaltado ? "fila-usuario--seleccionada" : undefined}
        aria-current={resaltado ? "true" : undefined}
      >
        <td>
          {usuario.nombre}
          {fueraDePagina ? <small data-testid="usuario-fuera-de-pagina"> (usuario indicado en el enlace; no está en esta página)</small> : null}
        </td>
                          <td>{usuario.correo}</td>
                          <td>
                            <InsigniaRol rol={usuario.rol} />
                          </td>
                          <td data-testid={`celulas-usuario-${usuario.id}`}>
                            {usuario.rol !== "LIDER_QA" ? (
                              "—"
                            ) : usuario.celulasVigentes.length === 0 ? (
                              <span className="badge badge-observacion">▲ Sin células</span>
                            ) : (
                              <ul className="chips" style={{ margin: 0 }}>
                                {usuario.celulasVigentes.map((c) => (
                                  <li className="chip" key={c.id}>
                                    {c.nombre}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td>
                            <InsigniaActivo activo={usuario.activo} />
                          </td>
                          <td>
                            <div className="acciones-tabla">
                              <button type="button" className="boton--enlace" onClick={() => abrirEditar(usuario)}>
                                Editar
                              </button>
                              <button type="button" className="boton--enlace" onClick={() => abrirCambioRol(usuario)}>
                                Cambiar rol
                              </button>
                              {usuario.rol === "LIDER_QA" ? (
                                <button
                                  type="button"
                                  className="boton--enlace"
                                  data-testid={`boton-celulas-${usuario.id}`}
                                  onClick={() => {
                                    setCelulasVacio(false);
                                    setUsuarioCelulas(usuario);
                                  }}
                                >
                                  Células
                                </button>
                              ) : null}
                              <button type="button" className="boton--enlace" onClick={() => abrirCambioEstado(usuario)}>
                                {usuario.activo ? "Desactivar" : "Activar"}
                              </button>
                            </div>
                          </td>
      </tr>
    );
  }

  return (
    <div>
      <div className="encabezado">
        <p className="etiqueta">Portal Administrador</p>
        <h1>Usuarios</h1>
        <p>Registro, datos, rol, células y acceso de cada participante.</p>
      </div>

      {exito ? <MensajeExito mensaje={exito} onCerrar={() => setExito(null)} /> : null}
      {idUsuarioUrl && usuarioUrl.isError ? (
        <p className="mensaje-aviso" role="status" data-testid="aviso-usuario-no-encontrado">
          No encontramos al usuario indicado
        </p>
      ) : null}

      <div className="panel">
        <div className="panel-cabecera">
          <div>
            <h2>Listado</h2>
          </div>
          <button type="button" className="boton boton--primario" onClick={abrirCrear}>
            + Nuevo usuario
          </button>
        </div>

        <BarraFiltros filtros={url} campos={campos} clave="usuarios" total={usuariosQuery.data?.total} etiquetaPlural="usuarios" />

        {usuariosQuery.isLoading ? <BloqueEstado id="usuarios-lista" estado="cargando" /> : null}
        {usuariosQuery.isError ? (
          <BloqueEstado id="usuarios-lista" estado="error" onReintentar={() => usuariosQuery.refetch()} />
        ) : null}

        {usuariosQuery.data ? (
          usuariosQuery.data.items.length === 0 ? (
            <BloqueEstado id="usuarios-lista" estado="vacio" mensaje="No hay usuarios que coincidan con la búsqueda." />
          ) : (
            <>
              <div className="tabla-contenedor" role="region" tabIndex={0} aria-label="Tabla desplazable">
                <table aria-label="Usuarios de la plataforma">
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      <th scope="col">Correo</th>
                      <th scope="col">Rol</th>
                      <th scope="col">Células</th>
                      <th scope="col">Acceso</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* DEF-08: el usuario de ?usuario=<id> (resuelto con GET /v1/usuarios/{id}) se destaca arriba si no está en esta página. */}
                    {usuarioFueraDePagina ? filaUsuario(usuarioFueraDePagina, true) : null}
                    {usuariosQuery.data.items.map((usuario) => filaUsuario(usuario, false))}
                  </tbody>
                </table>
              </div>
              <Paginacion
                clave="usuarios"
                etiqueta="usuarios"
                total={usuariosQuery.data.total}
                pagina={usuariosQuery.data.pagina}
                tamano={usuariosQuery.data.tamanoPagina}
                onPagina={(p) => url.set({ pagina: String(p) })}
                onTamano={(t) => url.set({ tamano: t === 25 ? undefined : String(t) })}
              />
            </>
          )
        ) : null}
      </div>

      {/* Alta */}
      <DialogoConfirmacion
        abierto={dialogoCrearAbierto}
        titulo="Nuevo usuario"
        etiquetaConfirmar={crearUsuario.isPending ? "Guardando…" : "Crear"}
        deshabilitado={crearUsuario.isPending}
        onConfirmar={confirmarCrear}
        onCancelar={() => setDialogoCrearAbierto(false)}
      >
        <div className="campo">
          <label htmlFor="alta-nombre">Nombre</label>
          <input
            id="alta-nombre"
            value={nuevoUsuario.nombre}
            onChange={(evento) => setNuevoUsuario((actual) => ({ ...actual, nombre: evento.target.value }))}
            aria-invalid={Boolean(erroresCrear.nombre)}
            aria-describedby={erroresCrear.nombre ? "alta-error-nombre" : undefined}
          />
          {erroresCrear.nombre ? (
            <p className="campo-error" id="alta-error-nombre">
              {erroresCrear.nombre}
            </p>
          ) : null}
        </div>
        <div className="campo">
          <label htmlFor="alta-correo">Correo</label>
          <input
            id="alta-correo"
            type="email"
            value={nuevoUsuario.correo}
            onChange={(evento) => setNuevoUsuario((actual) => ({ ...actual, correo: evento.target.value }))}
            aria-invalid={Boolean(erroresCrear.correo)}
            aria-describedby={erroresCrear.correo ? "alta-error-correo" : undefined}
          />
          {erroresCrear.correo ? (
            <p className="campo-error" id="alta-error-correo" data-testid="error-correo-duplicado">
              {erroresCrear.correo}
            </p>
          ) : null}
        </div>
        <div className="campo">
          <label htmlFor="alta-rol">Rol</label>
          <select
            id="alta-rol"
            value={nuevoUsuario.rol}
            onChange={(evento) => setNuevoUsuario((actual) => ({ ...actual, rol: evento.target.value as Rol }))}
          >
            {ROLES_CATALOGO.map((rol) => (
              <option key={rol} value={rol}>
                {ETIQUETAS_ROL[rol]}
              </option>
            ))}
          </select>
        </div>
        {nuevoUsuario.rol === "LIDER_QA" ? <SelectorCelulas celulas={catalogo} seleccionadas={celulasNuevo} onChange={setCelulasNuevo} /> : null}
      </DialogoConfirmacion>

      {/* Edición */}
      <DialogoConfirmacion
        abierto={Boolean(usuarioEditando)}
        titulo="Editar usuario"
        etiquetaConfirmar={actualizarUsuario.isPending ? "Guardando…" : "Guardar"}
        deshabilitado={actualizarUsuario.isPending}
        onConfirmar={confirmarEditar}
        onCancelar={() => setUsuarioEditando(null)}
      >
        <div className="campo">
          <label htmlFor="editar-nombre">Nombre</label>
          <input id="editar-nombre" value={edicion.nombre} onChange={(evento) => setEdicion((actual) => ({ ...actual, nombre: evento.target.value }))} />
        </div>
        <div className="campo">
          <label htmlFor="editar-correo">Correo</label>
          <input
            id="editar-correo"
            type="email"
            value={edicion.correo}
            onChange={(evento) => setEdicion((actual) => ({ ...actual, correo: evento.target.value }))}
            aria-invalid={Boolean(erroresEditar.correo)}
            aria-describedby={erroresEditar.correo ? "editar-error-correo" : undefined}
          />
          {erroresEditar.correo ? (
            <p className="campo-error" id="editar-error-correo">
              {erroresEditar.correo}
            </p>
          ) : null}
        </div>
      </DialogoConfirmacion>

      {/* Cambio de rol (con células si el nuevo rol es Líder QA) */}
      <DialogoConfirmacion
        abierto={Boolean(usuarioCambioRol)}
        testId="dialogo-cambio-rol"
        titulo={`Cambiar rol de ${usuarioCambioRol?.nombre ?? ""}`}
        etiquetaConfirmar={cambiarRolUsuario.isPending ? "Guardando…" : "Confirmar cambio"}
        deshabilitado={cambiarRolUsuario.isPending}
        cerrarAlClicFuera={false}
        onConfirmar={confirmarCambioRol}
        onCancelar={() => setUsuarioCambioRol(null)}
      >
        <p>
          Rol vigente: <InsigniaRol rol={usuarioCambioRol?.rol ?? "ANALISTA_QA"} />
        </p>
        <div className="campo">
          <label htmlFor="nuevo-rol">Nuevo rol</label>
          <select id="nuevo-rol" value={rolSeleccionado} onChange={(evento) => setRolSeleccionado(evento.target.value as Rol)}>
            {ROLES_CATALOGO.map((rol) => (
              <option key={rol} value={rol}>
                {ETIQUETAS_ROL[rol]}
              </option>
            ))}
          </select>
        </div>
        {cambiaALider ? <SelectorCelulas celulas={catalogo} seleccionadas={celulasRol} onChange={setCelulasRol} /> : null}
        {usuarioCambioRol && rolSeleccionado !== usuarioCambioRol.rol ? (
          <p role="status" data-testid="resumen-cambio-rol">
            Cambiará de {ETIQUETAS_ROL[usuarioCambioRol.rol]} a {ETIQUETAS_ROL[rolSeleccionado]}.
            {cambiaALider ? ` Células que tendrá: ${celulasRol.length > 0 ? nombresCelulas(celulasRol) : "ninguna"}.` : ""}
          </p>
        ) : null}
        {relacionesError && usuarioCambioRol ? (
          <MensajeRelaciones
            usuario={usuarioCambioRol}
            relaciones={relacionesError}
            onQuitarCelulas={() => {
              setCelulasVacio(true);
              setUsuarioCelulas(usuarioCambioRol);
              setUsuarioCambioRol(null);
            }}
          />
        ) : errorRol ? (
          <p className="campo-error" role="alert" data-testid="error-cambio-rol">
            {textoErrorRol(errorRol)}
          </p>
        ) : null}
      </DialogoConfirmacion>

      {/* Células del líder */}
      <DialogoCelulasLider
        usuario={usuarioCelulas}
        vacioInicial={celulasVacio}
        onCerrar={() => {
          setUsuarioCelulas(null);
          setCelulasVacio(false);
        }}
        onGuardado={setExito}
      />

      {/* Activar / desactivar */}
      <DialogoConfirmacion
        abierto={Boolean(usuarioCambioEstado)}
        titulo={usuarioCambioEstado?.activo ? "Desactivar usuario" : "Activar usuario"}
        etiquetaConfirmar={actualizarUsuario.isPending ? "Guardando…" : usuarioCambioEstado?.activo ? "Desactivar" : "Activar"}
        peligro={usuarioCambioEstado?.activo}
        deshabilitado={actualizarUsuario.isPending}
        onConfirmar={confirmarCambioEstado}
        onCancelar={() => setUsuarioCambioEstado(null)}
      >
        <p>
          {usuarioCambioEstado?.activo
            ? `${usuarioCambioEstado?.nombre} perderá el acceso a la plataforma.`
            : `${usuarioCambioEstado?.nombre} recuperará el acceso a la plataforma.`}
        </p>
        {errorEstadoAcceso ? (
          <p className="campo-error" role="alert" data-testid="error-cambio-estado-usuario">
            {errorEstadoAcceso}
          </p>
        ) : null}
      </DialogoConfirmacion>
    </div>
  );
}
