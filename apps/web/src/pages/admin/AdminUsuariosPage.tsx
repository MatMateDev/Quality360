import { useState } from "react";
import { BloqueEstado } from "@/components/BloqueEstado";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { InsigniaActivo, InsigniaRol } from "@/components/Etiquetas";
import { ErrorApi } from "@/lib/httpClient";
import { useActualizarUsuario, useCambiarRolUsuario, useCrearUsuario, useUsuarios, type FiltrosUsuarios } from "@/api/usuarios";
import { ROLES_CATALOGO, ETIQUETAS_ROL, type Rol, type Usuario } from "@/types/dominio";

/** F09: listar y buscar, alta con validación, edición, cambio de rol y activar/desactivar con confirmación previa. */
export function AdminUsuariosPage() {
  const [filtros, setFiltros] = useState<FiltrosUsuarios>({});
  const usuariosQuery = useUsuarios(filtros);

  const crearUsuario = useCrearUsuario();
  const actualizarUsuario = useActualizarUsuario();
  const cambiarRolUsuario = useCambiarRolUsuario();

  const [dialogoCrearAbierto, setDialogoCrearAbierto] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState({ nombre: "", correo: "", rol: "ANALISTA_QA" as Rol });
  const [erroresCrear, setErroresCrear] = useState<Record<string, string>>({});

  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [edicion, setEdicion] = useState({ nombre: "", correo: "" });
  const [erroresEditar, setErroresEditar] = useState<Record<string, string>>({});

  const [usuarioCambioRol, setUsuarioCambioRol] = useState<Usuario | null>(null);
  const [rolSeleccionado, setRolSeleccionado] = useState<Rol>("ANALISTA_QA");
  const [errorRol, setErrorRol] = useState<string | null>(null);

  const [usuarioCambioEstado, setUsuarioCambioEstado] = useState<Usuario | null>(null);
  const [errorEstadoAcceso, setErrorEstadoAcceso] = useState<string | null>(null);

  function abrirCrear() {
    setNuevoUsuario({ nombre: "", correo: "", rol: "ANALISTA_QA" });
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
      await crearUsuario.mutateAsync(nuevoUsuario);
      setDialogoCrearAbierto(false);
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
    setErrorRol(null);
  }

  async function confirmarCambioRol() {
    if (!usuarioCambioRol) return;
    try {
      await cambiarRolUsuario.mutateAsync({ id: usuarioCambioRol.id, body: { rol: rolSeleccionado } });
      setUsuarioCambioRol(null);
    } catch (error) {
      setErrorRol(error instanceof ErrorApi ? error.mensaje : "No fue posible cambiar el rol.");
    }
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

  return (
    <div>
      <div className="encabezado">
        <p className="etiqueta">Portal Administrador</p>
        <h1>Usuarios</h1>
        <p>Registro, datos, rol y acceso de cada participante.</p>
      </div>

      <div className="panel">
        <div className="panel-cabecera">
          <div>
            <h2>Listado</h2>
          </div>
          <button type="button" className="boton boton--primario" onClick={abrirCrear}>
            + Nuevo usuario
          </button>
        </div>

        <div className="filtros">
          <div className="campo">
            <label htmlFor="buscador-usuarios">Buscar por nombre o correo</label>
            <input
              id="buscador-usuarios"
              type="search"
              value={filtros.q ?? ""}
              onChange={(evento) => setFiltros((actual) => ({ ...actual, q: evento.target.value || undefined }))}
            />
          </div>
          <div className="campo">
            <label htmlFor="filtro-rol-usuarios">Rol</label>
            <select
              id="filtro-rol-usuarios"
              value={filtros.rol ?? ""}
              onChange={(evento) => setFiltros((actual) => ({ ...actual, rol: (evento.target.value || undefined) as Rol | undefined }))}
            >
              <option value="">Todos los roles</option>
              {ROLES_CATALOGO.map((rol) => (
                <option key={rol} value={rol}>
                  {ETIQUETAS_ROL[rol]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {usuariosQuery.isLoading ? <BloqueEstado id="usuarios-lista" estado="cargando" /> : null}
        {usuariosQuery.isError ? (
          <BloqueEstado id="usuarios-lista" estado="error" onReintentar={() => usuariosQuery.refetch()} />
        ) : null}

        {usuariosQuery.data ? (
          usuariosQuery.data.items.length === 0 ? (
            <BloqueEstado id="usuarios-lista" estado="vacio" mensaje="No hay usuarios que coincidan con la búsqueda." />
          ) : (
            <div className="tabla-contenedor">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Acceso</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosQuery.data.items.map((usuario) => (
                    <tr key={usuario.id} data-testid={`fila-usuario-${usuario.id}`}>
                      <td>{usuario.nombre}</td>
                      <td>{usuario.correo}</td>
                      <td>
                        <InsigniaRol rol={usuario.rol} />
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
                          <button type="button" className="boton--enlace" onClick={() => abrirCambioEstado(usuario)}>
                            {usuario.activo ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {/* Cambio de rol */}
      <DialogoConfirmacion
        abierto={Boolean(usuarioCambioRol)}
        titulo={`Cambiar rol de ${usuarioCambioRol?.nombre ?? ""}`}
        etiquetaConfirmar={cambiarRolUsuario.isPending ? "Guardando…" : "Confirmar cambio"}
        deshabilitado={cambiarRolUsuario.isPending}
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
        {errorRol ? (
          <p className="campo-error" role="alert" data-testid="error-cambio-rol">
            {errorRol}
          </p>
        ) : null}
      </DialogoConfirmacion>

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
