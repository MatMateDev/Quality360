import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { solicitarRecuperacion } from "@/auth/authProvider";
import type { AlertaAcceso } from "@/auth/AuthContext";
import { MENSAJE_RECUPERACION_ENVIADA, esErrorAcceso, mensajeDeErrorAcceso } from "@/auth/errorAcceso";
import { AccesoLayout } from "@/components/acceso/AccesoLayout";
import { Alerta, AlertaErrorAcceso } from "@/components/acceso/Alertas";
import { BotonAcceso } from "@/components/acceso/BotonAcceso";
import { CampoCorreo } from "@/components/acceso/CampoCorreo";
import { IconoFlechaAtras } from "@/components/acceso/Iconos";
import { validarCorreo } from "@/lib/validacionAcceso";

/**
 * E1-F13: pide a Supabase el correo con el enlace para restablecer la
 * contraseña. Si el correo tiene formato válido responde SIEMPRE la misma confirmación, exista o no la
 * cuenta; solo el límite de intentos y la caída del servicio se muestran como error.
 */
export function RecuperarContrasenaPage() {
  const [correo, setCorreo] = useState("");
  const [errorCorreo, setErrorCorreo] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<AlertaAcceso | null>(null);
  const referenciaCorreo = useRef<HTMLInputElement>(null);

  async function manejarSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;

    const correoLimpio = correo.trim();
    const error = validarCorreo(correoLimpio);
    setErrorCorreo(error);
    if (error) {
      referenciaCorreo.current?.focus();
      return;
    }

    setConfirmado(false);
    setErrorEnvio(null);
    setEnviando(true);
    try {
      await solicitarRecuperacion(correoLimpio);
      setConfirmado(true);
    } catch (fallo) {
      if (esErrorAcceso(fallo) && fallo.tipo !== "CREDENCIALES") {
        setErrorEnvio({ tipo: fallo.tipo, mensaje: mensajeDeErrorAcceso(fallo.tipo) });
        referenciaCorreo.current?.focus();
      } else {
        // Cualquier otro fallo se trata como éxito: no se revela si el correo existe.
        setConfirmado(true);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AccesoLayout>
      <div className="acceso-cabecera">
        <h1>Recupera tu contraseña</h1>
        <p>Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva.</p>
      </div>

      <form className="acceso-form" onSubmit={manejarSubmit} noValidate>
        {confirmado ? (
          <Alerta variante="exito" rol="status" testId="confirmacion-recuperacion">
            {MENSAJE_RECUPERACION_ENVIADA}
          </Alerta>
        ) : null}
        {errorEnvio ? <AlertaErrorAcceso alerta={errorEnvio} testId="error-recuperacion" /> : null}

        <CampoCorreo
          id="campo-correo"
          valor={correo}
          referencia={referenciaCorreo}
          error={errorCorreo}
          soloLectura={enviando}
          alCambiar={(valor) => {
            setCorreo(valor);
            setErrorCorreo(undefined);
          }}
        />

        <BotonAcceso
          ocupado={enviando}
          texto="Enviar enlace"
          textoOcupado="Enviando…"
          indicador={
            enviando ? (
              <p className="acceso-solo-lector" role="status" data-testid="indicador-enviando">
                Enviando…
              </p>
            ) : null
          }
        />
      </form>

      <Link className="acceso-volver" to="/login" data-testid="enlace-volver-login">
        <IconoFlechaAtras tamano={18} />
        Volver a iniciar sesión
      </Link>
    </AccesoLayout>
  );
}
