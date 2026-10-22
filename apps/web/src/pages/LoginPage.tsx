import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { AccesoLayout } from "@/components/acceso/AccesoLayout";
import { Alerta, AlertaErrorAcceso } from "@/components/acceso/Alertas";
import { BotonAcceso } from "@/components/acceso/BotonAcceso";
import { CampoContrasena } from "@/components/acceso/CampoContrasena";
import { CampoCorreo } from "@/components/acceso/CampoCorreo";
import { validarCorreo } from "@/lib/validacionAcceso";
import { rutaPermitidaParaRol } from "@/types/dominio";

interface ErroresCampo {
  correo?: string;
  contrasena?: string;
}

interface EstadoLogin {
  /** Ruta a la que volver tras ingresar (la fija `RequireAuth`). */
  desde?: string;
  /** Aviso de éxito que deja `/restablecer-contrasena` al terminar. */
  avisoExito?: string;
}

/**
 * E1-F01: formulario de ingreso (#1 mostrar/ocultar), campos obligatorios sin enviar la solicitud (#2),
 * estado «ingresando» y luego mensaje genérico (#3). Muestra también los avisos de E1-B01#2 (usuario
 * inactivo, mismo mensaje genérico), E1-B01#3 (demasiados intentos) y E1-B11#1 (sesión expirada).
 */
export function LoginPage() {
  const { iniciarSesion, ingresando, estado, perfil, avisoSesion, errorAcceso, limpiarAviso, limpiarErrorAcceso } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const estadoNavegacion = location.state as EstadoLogin | null;

  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [erroresCampo, setErroresCampo] = useState<ErroresCampo>({});
  const [avisoExito, setAvisoExito] = useState<string | null>(() => estadoNavegacion?.avisoExito ?? null);

  const referenciaCorreo = useRef<HTMLInputElement>(null);
  const referenciaContrasena = useRef<HTMLInputElement>(null);

  // El aviso de éxito viaja en `location.state`: se lee una vez y se limpia para que no reaparezca al recargar.
  useEffect(() => {
    if (!estadoNavegacion?.avisoExito) return;
    const { desde } = estadoNavegacion;
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: desde ? { desde } : null });
    // Solo al montar con el aviso: el valor ya quedó guardado en `avisoExito`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (estado === "autenticado") {
      // D41 / E7-F01-T06: la ruta pedida antes del login solo se reutiliza si es del portal del propio rol.
      const desde = estadoNavegacion?.desde;
      const destino = desde && perfil && rutaPermitidaParaRol(desde, perfil.rol) ? desde : "/";
      navigate(destino, { replace: true });
    }
  }, [estado, navigate, estadoNavegacion?.desde, perfil]);

  // Tras un intento fallido se vacía solo la contraseña, el correo queda escrito y el foco vuelve a la contraseña.
  useEffect(() => {
    if (!errorAcceso) return;
    setContrasena("");
    const destino = referenciaCorreo.current?.value ? referenciaContrasena : referenciaCorreo;
    destino.current?.focus();
  }, [errorAcceso]);

  async function manejarSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ingresando) return;

    const correoLimpio = correo.trim();
    const errores: ErroresCampo = {};
    const errorCorreo = validarCorreo(correoLimpio);
    if (errorCorreo) errores.correo = errorCorreo;
    if (!contrasena) errores.contrasena = "La contraseña es obligatoria.";
    setErroresCampo(errores);
    // Sin enviar la solicitud: el foco va al primer campo con error.
    if (errores.correo) {
      referenciaCorreo.current?.focus();
      return;
    }
    if (errores.contrasena) {
      referenciaContrasena.current?.focus();
      return;
    }

    limpiarAviso();
    limpiarErrorAcceso();
    setAvisoExito(null);
    await iniciarSesion(correoLimpio, contrasena);
  }

  return (
    <AccesoLayout>
      <div className="acceso-cabecera">
        <h1>Inicia sesión</h1>
        <p>Usa el correo con el que te habilitó tu administrador.</p>
      </div>

      <form className="acceso-form" onSubmit={manejarSubmit} noValidate>
        {avisoExito ? (
          <Alerta variante="exito" rol="status" testId="aviso-contrasena-actualizada">
            {avisoExito}
          </Alerta>
        ) : null}
        {avisoSesion ? (
          <Alerta variante="aviso" rol="status" testId="aviso-sesion">
            {avisoSesion}
          </Alerta>
        ) : null}
        {errorAcceso ? <AlertaErrorAcceso alerta={errorAcceso} /> : null}

        <CampoCorreo
          id="campo-correo"
          valor={correo}
          referencia={referenciaCorreo}
          error={erroresCampo.correo}
          soloLectura={ingresando}
          alCambiar={(valor) => {
            setCorreo(valor);
            setErroresCampo((actuales) => ({ ...actuales, correo: undefined }));
          }}
        />

        <CampoContrasena
          id="campo-contrasena"
          etiqueta="Contraseña"
          autoComplete="current-password"
          valor={contrasena}
          referencia={referenciaContrasena}
          error={erroresCampo.contrasena}
          soloLectura={ingresando}
          alCambiar={(valor) => {
            setContrasena(valor);
            setErroresCampo((actuales) => ({ ...actuales, contrasena: undefined }));
          }}
          accionEtiqueta={
            <Link className="acceso-enlace-secundario" to="/recuperar-contrasena" data-testid="enlace-recuperar">
              ¿Olvidaste tu contraseña?
            </Link>
          }
        />

        <BotonAcceso
          ocupado={ingresando}
          texto="Ingresar"
          textoOcupado="Ingresando…"
          indicador={
            ingresando ? (
              <p className="acceso-solo-lector" role="status" data-testid="indicador-ingresando">
                Ingresando…
              </p>
            ) : null
          }
        />
      </form>

      <p className="acceso-nota">¿Aún no tienes acceso? Las cuentas las crea el administrador de tu organización.</p>
    </AccesoLayout>
  );
}
