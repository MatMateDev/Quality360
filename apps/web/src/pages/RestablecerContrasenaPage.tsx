import { useLayoutEffect, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { actualizarContrasena, leerEnlaceRecuperacion, verificarEnlaceRecuperacion } from "@/auth/authProvider";
import { useAuth } from "@/auth/AuthContext";
import {
  ErrorRecuperacion,
  MENSAJE_CONTRASENA_ACTUALIZADA,
  MENSAJE_ENLACE_INVALIDO,
  MENSAJE_SERVICIO_NO_DISPONIBLE,
  mensajeDeErrorRecuperacion,
  type TipoErrorRecuperacion,
} from "@/auth/errorAcceso";
import { limpiarSesion } from "@/auth/sessionStore";
import { AccesoLayout } from "@/components/acceso/AccesoLayout";
import { Alerta } from "@/components/acceso/Alertas";
import { BotonAcceso } from "@/components/acceso/BotonAcceso";
import { CampoContrasena } from "@/components/acceso/CampoContrasena";
import { IconoFlechaAtras } from "@/components/acceso/Iconos";
import { LARGO_MINIMO_CONTRASENA, validarContrasenaNueva, validarRepeticion } from "@/lib/validacionAcceso";

type FaseEnlace = "verificando" | "lista" | "invalido" | "servicio";

interface ErroresCampo {
  nueva?: string;
  repetida?: string;
}

interface ErrorEnvio {
  tipo: TipoErrorRecuperacion;
  mensaje: string;
}

const DATA_TIPO: Record<TipoErrorRecuperacion, string> = {
  ENLACE_INVALIDO: "enlace-invalido",
  MISMA_CONTRASENA: "misma-contrasena",
  CONTRASENA_DEBIL: "contrasena-debil",
  DEMASIADOS_INTENTOS: "demasiados-intentos",
  SERVICIO_NO_DISPONIBLE: "servicio",
  DESCONOCIDO: "desconocido",
};

const ID_ALERTA_ENVIO = "alerta-restablecer";

/**
 * E1-F13: destino del enlace del correo. Verifica la sesión de recuperación,
 * pide la contraseña nueva dos veces, la fija con `updateUser`, cierra la sesión y vuelve al login con un aviso.
 *
 * La sesión de recuperación es una sesión real de Supabase: mientras esta pantalla está abierta `AuthContext`
 * está en modo recuperación (no llama a `/v1/me` ni lleva al portal). Si la persona se va sin terminar, la
 * sesión se cierra para que el enlace no equivalga a un ingreso sin contraseña.
 */
export function RestablecerContrasenaPage() {
  const { establecerModoRecuperacion, cerrarSesion, cerrarSesionLocal } = useAuth();
  const navigate = useNavigate();

  // Se lee en el primer render, antes de que se cree el cliente de supabase-js. Con Supabase real también
  // quita los tokens del hash de la URL sin dejar una entrada de historial (ver `leerEnlaceRecuperacionSupabase`).
  const [enlace] = useState(() => leerEnlaceRecuperacion());
  const [fase, setFase] = useState<FaseEnlace>("verificando");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [erroresCampo, setErroresCampo] = useState<ErroresCampo>({});
  const [errorEnvio, setErrorEnvio] = useState<ErrorEnvio | null>(null);
  const [guardando, setGuardando] = useState(false);

  const referenciaNueva = useRef<HTMLInputElement>(null);
  const referenciaRepetida = useRef<HTMLInputElement>(null);
  const montada = useRef(false);
  /** Hay una sesión de recuperación abierta que esta pantalla aún no terminó. */
  const sesionPendiente = useRef(false);

  useLayoutEffect(() => {
    montada.current = true;
    // Antes de que supabase-js deje la sesión en el almacén: así `AuthContext` nunca la usa como sesión de portal.
    establecerModoRecuperacion(true);
    return () => {
      montada.current = false;
      // Diferido para distinguir el desmontaje real de la doble ejecución de StrictMode en desarrollo.
      setTimeout(() => {
        if (montada.current) return;
        const salir = () => establecerModoRecuperacion(false);
        if (sesionPendiente.current) {
          sesionPendiente.current = false;
          // Solo local: abandonar no cambió nada, así que no se cierran las sesiones de otros dispositivos.
          cerrarSesionLocal().catch(() => limpiarSesion()).finally(salir);
        } else {
          salir();
        }
      }, 0);
    };
  }, [establecerModoRecuperacion, cerrarSesionLocal]);

  useEffect(
    () =>
      verificarEnlaceRecuperacion(enlace, (resultado) => {
        if (resultado === "LISTA") {
          sesionPendiente.current = true;
          setFase("lista");
        } else {
          setFase(resultado === "ENLACE_INVALIDO" ? "invalido" : "servicio");
        }
      }),
    [enlace],
  );

  async function manejarSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;

    const errores: ErroresCampo = {
      nueva: validarContrasenaNueva(nueva),
      repetida: validarRepeticion(nueva, repetida),
    };
    setErroresCampo(errores);
    setErrorEnvio(null);
    if (errores.nueva) {
      referenciaNueva.current?.focus();
      return;
    }
    if (errores.repetida) {
      referenciaRepetida.current?.focus();
      return;
    }

    setGuardando(true);
    try {
      await actualizarContrasena(nueva);
    } catch (fallo) {
      setGuardando(false);
      const tipo = fallo instanceof ErrorRecuperacion ? fallo.tipo : "DESCONOCIDO";
      if (tipo === "ENLACE_INVALIDO") {
        setFase("invalido");
      } else {
        setErrorEnvio({ tipo, mensaje: mensajeDeErrorRecuperacion(tipo) });
        if (tipo === "MISMA_CONTRASENA" || tipo === "CONTRASENA_DEBIL") referenciaNueva.current?.focus();
      }
      return;
    }

    // Terminó: la sesión de recuperación se cierra y se vuelve al login con el aviso. El botón sigue
    // ocupado hasta salir de la pantalla para que no se envíe dos veces.
    sesionPendiente.current = false;
    try {
      await cerrarSesion();
    } catch {
      limpiarSesion();
    }
    navigate("/login", { replace: true, state: { avisoExito: MENSAJE_CONTRASENA_ACTUALIZADA } });
  }

  const fallaDeLaNueva = errorEnvio?.tipo === "MISMA_CONTRASENA" || errorEnvio?.tipo === "CONTRASENA_DEBIL";

  return (
    <AccesoLayout>
      <div className="acceso-cabecera">
        <h1>Crea una nueva contraseña</h1>
        <p>Elige una contraseña que no hayas usado antes en Quality360.</p>
      </div>

      {fase === "verificando" ? (
        <p className="acceso-estado" role="status" data-testid="verificando-enlace">
          Verificando el enlace…
        </p>
      ) : null}

      {fase === "invalido" || fase === "servicio" ? (
        <div className="acceso-form">
          {fase === "invalido" ? (
            <Alerta variante="error" rol="alert" testId="enlace-invalido" tipo="enlace-invalido">
              {MENSAJE_ENLACE_INVALIDO}
            </Alerta>
          ) : (
            <Alerta variante="error" rol="alert" testId="error-restablecer" tipo="servicio">
              {MENSAJE_SERVICIO_NO_DISPONIBLE}
            </Alerta>
          )}
          <Link className="acceso-boton acceso-boton--enlace" to="/recuperar-contrasena" data-testid="enlace-solicitar-nuevo">
            Solicitar un enlace nuevo
          </Link>
        </div>
      ) : null}

      {fase === "lista" ? (
        <form className="acceso-form" onSubmit={manejarSubmit} noValidate>
          {errorEnvio ? (
            <Alerta
              id={ID_ALERTA_ENVIO}
              variante="error"
              rol="alert"
              testId="error-restablecer"
              tipo={DATA_TIPO[errorEnvio.tipo]}
            >
              {errorEnvio.mensaje}
            </Alerta>
          ) : null}

          <CampoContrasena
            id="campo-nueva-contrasena"
            etiqueta="Nueva contraseña"
            autoComplete="new-password"
            valor={nueva}
            referencia={referenciaNueva}
            error={erroresCampo.nueva}
            ayuda={`Mínimo ${LARGO_MINIMO_CONTRASENA} caracteres.`}
            invalido={fallaDeLaNueva}
            descritoPor={fallaDeLaNueva ? ID_ALERTA_ENVIO : undefined}
            soloLectura={guardando}
            nombresBoton={["Mostrar nueva contraseña", "Ocultar nueva contraseña"]}
            alCambiar={(valor) => {
              setNueva(valor);
              setErroresCampo((actuales) => ({ ...actuales, nueva: undefined }));
            }}
          />

          <CampoContrasena
            id="campo-repetir-contrasena"
            etiqueta="Repetir contraseña"
            autoComplete="new-password"
            valor={repetida}
            referencia={referenciaRepetida}
            error={erroresCampo.repetida}
            soloLectura={guardando}
            nombresBoton={["Mostrar contraseña repetida", "Ocultar contraseña repetida"]}
            alCambiar={(valor) => {
              setRepetida(valor);
              setErroresCampo((actuales) => ({ ...actuales, repetida: undefined }));
            }}
          />

          <BotonAcceso
            ocupado={guardando}
            texto="Guardar contraseña"
            textoOcupado="Guardando…"
            indicador={
              guardando ? (
                <p className="acceso-solo-lector" role="status" data-testid="indicador-guardando">
                  Guardando…
                </p>
              ) : null
            }
          />
        </form>
      ) : null}

      <Link className="acceso-volver" to="/login" data-testid="enlace-volver-login">
        <IconoFlechaAtras tamano={18} />
        Volver a iniciar sesión
      </Link>
    </AccesoLayout>
  );
}
