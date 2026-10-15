import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorApi, http, registrarManejadorSesionExpirada } from "@/lib/httpClient";
import type { Perfil } from "@/types/dominio";
import {
  cerrarSesion as cerrarSesionProveedor,
  cerrarSesionLocal as cerrarSesionLocalProveedor,
  iniciarSesion as iniciarSesionProveedor,
  inicializarSesion,
} from "./authProvider";
import {
  MENSAJE_ERROR_LOGIN,
  MENSAJE_SESION_EXPIRADA,
  clasificarErrorAcceso,
  clasificarErrorPerfil,
  esErrorAcceso,
  mensajeDeErrorAcceso,
  type TipoErrorAcceso,
} from "./errorAcceso";
import { limpiarSesion, obtenerSesion, suscribirSesion } from "./sessionStore";

/** Mensaje único de error de acceso (D · reglas no negociables #5): nunca revela si el correo existe. */
export { MENSAJE_ERROR_LOGIN };

export type EstadoSesion = "cargando" | "autenticado" | "anonimo";

/** Alerta global del login: el tipo decide el aspecto y el mensaje sale de `mensajeDeErrorAcceso`. */
export interface AlertaAcceso {
  tipo: TipoErrorAcceso;
  mensaje: string;
}

export interface ResultadoLogin {
  ok: boolean;
  tipo?: TipoErrorAcceso;
  mensaje?: string;
}

export interface AuthContextValor {
  estado: EstadoSesion;
  perfil: Perfil | null;
  /** Verdadero desde que se envía el login hasta que `/v1/me` confirma el acceso (o lo rechaza). */
  ingresando: boolean;
  /** Aviso de sesión expirada (E1-B11#1). */
  avisoSesion: string | null;
  /** Error de acceso vigente: credenciales, demasiados intentos o servicio no disponible. */
  errorAcceso: AlertaAcceso | null;
  iniciarSesion: (correo: string, contrasena: string) => Promise<ResultadoLogin>;
  /** Cierra la sesión en todos los dispositivos del usuario (cierre de sesión y cambio de contraseña). */
  cerrarSesion: () => Promise<void>;
  /** Cierra solo la sesión de este navegador. */
  cerrarSesionLocal: () => Promise<void>;
  limpiarAviso: () => void;
  limpiarErrorAcceso: () => void;
  /**
   * RECUPERACION: mientras es verdadero la sesión que dejó el enlace del correo no se usa como sesión de
   * portal (no se llama a `/v1/me` ni se redirige). Lo activa la pantalla `/restablecer-contrasena`.
   */
  establecerModoRecuperacion: (activo: boolean) => void;
}

const AuthContext = createContext<AuthContextValor | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [tokenActual, setTokenActual] = useState<string | null>(() => obtenerSesion()?.accessToken ?? null);
  const [listo, setListo] = useState(false);
  const [enviandoCredenciales, setEnviandoCredenciales] = useState(false);
  const [esperandoPerfil, setEsperandoPerfil] = useState(false);
  const [avisoSesion, setAvisoSesion] = useState<string | null>(null);
  const [errorAcceso, setErrorAcceso] = useState<AlertaAcceso | null>(null);
  const [modoRecuperacion, setModoRecuperacion] = useState(false);

  useEffect(() => {
    const limpiar = inicializarSesion(() => {
      setTokenActual(obtenerSesion()?.accessToken ?? null);
      setListo(true);
    });
    const desuscribir = suscribirSesion(() => setTokenActual(obtenerSesion()?.accessToken ?? null));
    return () => {
      limpiar();
      desuscribir();
    };
    // Solo se ejecuta al montar: iniciarSesion/cerrarSesion pasan por el proveedor, no por este efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    registrarManejadorSesionExpirada(() => {
      queryClient.clear();
      setAvisoSesion(MENSAJE_SESION_EXPIRADA);
    });
    return () => registrarManejadorSesionExpirada(null);
  }, [queryClient]);

  const perfilQuery = useQuery({
    queryKey: ["perfil", tokenActual],
    queryFn: () => http.get<Perfil>("/v1/me"),
    // En modo RECUPERACION la sesión es solo para cambiar la contraseña: no se consulta `/v1/me`.
    enabled: Boolean(tokenActual) && !modoRecuperacion,
    retry: 0,
  });

  useEffect(() => {
    // `/v1/me` responde 403 genérico si el usuario está inactivo o sin registro en Organización
    // (E1-B01#2) y 401 si el token no sirve: se cierra la sesión y se muestra el mismo mensaje del login.
    // Una caída de red o un 5xx no son credenciales: se avisa que el servicio no está disponible.
    if (perfilQuery.isError && tokenActual) {
      const status = perfilQuery.error instanceof ErrorApi ? perfilQuery.error.status : undefined;
      const tipo = clasificarErrorPerfil(status);
      limpiarSesion();
      // Si Organización rechaza al usuario, también se cierra la sesión del proveedor: si no,
      // al recargar se restauraría y el mensaje genérico reaparecería sin un nuevo intento.
      // Solo local: no es el usuario quien pide cerrar, así que no se tocan sus otros dispositivos.
      if (tipo === "CREDENCIALES") void cerrarSesionLocalProveedor().catch(() => undefined);
      queryClient.clear();
      setErrorAcceso({ tipo, mensaje: mensajeDeErrorAcceso(tipo) });
      setEsperandoPerfil(false);
    }
  }, [perfilQuery.isError, perfilQuery.error, tokenActual, queryClient]);

  useEffect(() => {
    // El perfil llegó, o la sesión desapareció antes de que llegara (p. ej. `/v1/me` con SESION_EXPIRADA).
    if (esperandoPerfil && (perfilQuery.isSuccess || !tokenActual)) setEsperandoPerfil(false);
  }, [esperandoPerfil, perfilQuery.isSuccess, tokenActual]);

  const iniciarSesion = useCallback(async (correo: string, contrasena: string): Promise<ResultadoLogin> => {
    setEnviandoCredenciales(true);
    setErrorAcceso(null);
    try {
      await iniciarSesionProveedor(correo, contrasena);
      setAvisoSesion(null);
      // El acceso no termina hasta que `/v1/me` confirme el perfil: el botón sigue en «Ingresando…».
      setEsperandoPerfil(true);
      return { ok: true };
    } catch (error) {
      const tipo = esErrorAcceso(error) ? error.tipo : clasificarErrorAcceso(error);
      const mensaje = mensajeDeErrorAcceso(tipo);
      setErrorAcceso({ tipo, mensaje });
      return { ok: false, tipo, mensaje };
    } finally {
      setEnviandoCredenciales(false);
    }
  }, []);

  const cerrarSesion = useCallback(async () => {
    await cerrarSesionProveedor();
    queryClient.clear();
  }, [queryClient]);

  const cerrarSesionLocal = useCallback(async () => {
    await cerrarSesionLocalProveedor();
    queryClient.clear();
  }, [queryClient]);

  const limpiarAviso = useCallback(() => setAvisoSesion(null), []);
  const limpiarErrorAcceso = useCallback(() => setErrorAcceso(null), []);
  const establecerModoRecuperacion = useCallback((activo: boolean) => setModoRecuperacion(activo), []);

  const estado: EstadoSesion = modoRecuperacion
    ? "anonimo"
    : !listo
      ? "cargando"
      : tokenActual && perfilQuery.isPending
        ? "cargando"
        : perfilQuery.data
          ? "autenticado"
          : "anonimo";

  const valor: AuthContextValor = {
    estado,
    perfil: modoRecuperacion ? null : (perfilQuery.data ?? null),
    ingresando: enviandoCredenciales || esperandoPerfil,
    avisoSesion,
    errorAcceso,
    iniciarSesion,
    cerrarSesion,
    cerrarSesionLocal,
    limpiarAviso,
    limpiarErrorAcceso,
    establecerModoRecuperacion,
  };

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return contexto;
}
