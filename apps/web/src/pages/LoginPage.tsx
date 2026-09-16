import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

interface ErroresCampo {
  correo?: string;
  contrasena?: string;
}

/** F01: formulario de ingreso, validación en cliente, indicador de "ingresando" y error genérico único. */
export function LoginPage() {
  const { iniciarSesion, ingresando, estado, avisoSesion, limpiarAviso } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [erroresCampo, setErroresCampo] = useState<ErroresCampo>({});
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  useEffect(() => {
    if (estado === "autenticado") {
      const destino = (location.state as { desde?: string } | null)?.desde ?? "/";
      navigate(destino, { replace: true });
    }
  }, [estado, navigate, location.state]);

  async function manejarSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const errores: ErroresCampo = {};
    if (!correo.trim()) errores.correo = "El correo es obligatorio.";
    if (!contrasena) errores.contrasena = "La contraseña es obligatoria.";
    setErroresCampo(errores);
    if (Object.keys(errores).length > 0) return;

    setMensajeError(null);
    limpiarAviso();
    const resultado = await iniciarSesion(correo.trim(), contrasena);
    if (!resultado.ok) {
      setMensajeError(resultado.mensaje ?? "Correo o contraseña incorrectos, o acceso no habilitado.");
    }
  }

  return (
    <div className="pantalla-login">
      <div className="tarjeta-login">
        <p className="etiqueta">Quality360</p>
        <h1>Inicia sesión</h1>
        <p>Ingresa tus credenciales para acceder a tu portal.</p>

        {avisoSesion ? (
          <p className="mensaje-aviso" role="status" data-testid="aviso-sesion">
            {avisoSesion}
          </p>
        ) : null}

        <form className="formulario" onSubmit={manejarSubmit} noValidate>
          <div className="campo">
            <label htmlFor="campo-correo">Correo electrónico</label>
            <input
              id="campo-correo"
              name="correo"
              type="email"
              autoComplete="username"
              value={correo}
              onChange={(evento) => setCorreo(evento.target.value)}
              aria-invalid={Boolean(erroresCampo.correo)}
              aria-describedby={erroresCampo.correo ? "error-correo" : undefined}
            />
            {erroresCampo.correo ? (
              <p className="campo-error" id="error-correo">
                {erroresCampo.correo}
              </p>
            ) : null}
          </div>

          <div className="campo">
            <label htmlFor="campo-contrasena">Contraseña</label>
            <div className="campo-envolver-contrasena">
              <input
                id="campo-contrasena"
                name="contrasena"
                type={mostrarContrasena ? "text" : "password"}
                autoComplete="current-password"
                value={contrasena}
                onChange={(evento) => setContrasena(evento.target.value)}
                aria-invalid={Boolean(erroresCampo.contrasena)}
                aria-describedby={erroresCampo.contrasena ? "error-contrasena" : undefined}
              />
              <button
                type="button"
                className="boton boton--secundario"
                onClick={() => setMostrarContrasena((valor) => !valor)}
                aria-pressed={mostrarContrasena}
              >
                {mostrarContrasena ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            {erroresCampo.contrasena ? (
              <p className="campo-error" id="error-contrasena">
                {erroresCampo.contrasena}
              </p>
            ) : null}
          </div>

          {mensajeError ? (
            <p className="mensaje-error-global" role="alert" data-testid="error-login">
              {mensajeError}
            </p>
          ) : null}

          <button type="submit" className="boton boton--primario" disabled={ingresando}>
            {ingresando ? "Ingresando…" : "Ingresar"}
          </button>
          {ingresando ? (
            <p className="indicador-ingresando" role="status" data-testid="indicador-ingresando">
              Ingresando…
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
