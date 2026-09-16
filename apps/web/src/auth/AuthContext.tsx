import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { http, registrarManejadorSesionExpirada } from "@/lib/httpClient";
import type { Perfil } from "@/types/dominio";
import { cerrarSesion as cerrarSesionProveedor, iniciarSesion as iniciarSesionProveedor, inicializarSesion } from "./authProvider";
import { limpiarSesion, obtenerSesion, suscribirSesion } from "./sessionStore";

/** Mensaje único de error de acceso (D · reglas no negociables #5): nunca revela si el correo existe. */
export const MENSAJE_ERROR_LOGIN = "Correo o contraseña incorrectos, o acceso no habilitado.";

export type EstadoSesion = "cargando" | "autenticado" | "anonimo";

export interface ResultadoLogin {
  ok: boolean;
  mensaje?: string;
}

export interface AuthContextValor {
  estado: EstadoSesion;
  perfil: Perfil | null;
  ingresando: boolean;
  avisoSesion: string | null;
  iniciarSesion: (correo: string, contrasena: string) => Promise<ResultadoLogin>;
  cerrarSesion: () => Promise<void>;
  limpiarAviso: () => void;
}

const AuthContext = createContext<AuthContextValor | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [tokenActual, setTokenActual] = useState<string | null>(() => obtenerSesion()?.accessToken ?? null);
  const [listo, setListo] = useState(false);
  const [ingresando, setIngresando] = useState(false);
  const [avisoSesion, setAvisoSesion] = useState<string | null>(null);

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
      setAvisoSesion("Tu sesión expiró. Inicia sesión nuevamente.");
    });
    return () => registrarManejadorSesionExpirada(null);
  }, [queryClient]);

  const perfilQuery = useQuery({
    queryKey: ["perfil", tokenActual],
    queryFn: () => http.get<Perfil>("/v1/me"),
    enabled: Boolean(tokenActual),
    retry: 0,
  });

  useEffect(() => {
    // /v1/me responde 403 genérico si el usuario está inactivo o sin registro en
    // Organización (E1-B01#2): se cierra la sesión y se muestra el mismo mensaje del login.
    if (perfilQuery.isError && tokenActual) {
      limpiarSesion();
      queryClient.clear();
      setAvisoSesion(MENSAJE_ERROR_LOGIN);
    }
  }, [perfilQuery.isError, tokenActual, queryClient]);

  const iniciarSesion = useCallback(async (correo: string, contrasena: string): Promise<ResultadoLogin> => {
    setIngresando(true);
    try {
      await iniciarSesionProveedor(correo, contrasena);
      setAvisoSesion(null);
      return { ok: true };
    } catch {
      return { ok: false, mensaje: MENSAJE_ERROR_LOGIN };
    } finally {
      setIngresando(false);
    }
  }, []);

  const cerrarSesion = useCallback(async () => {
    await cerrarSesionProveedor();
    queryClient.clear();
  }, [queryClient]);

  const limpiarAviso = useCallback(() => setAvisoSesion(null), []);

  const estado: EstadoSesion = !listo
    ? "cargando"
    : tokenActual && perfilQuery.isPending
      ? "cargando"
      : perfilQuery.data
        ? "autenticado"
        : "anonimo";

  const valor: AuthContextValor = {
    estado,
    perfil: perfilQuery.data ?? null,
    ingresando,
    avisoSesion,
    iniciarSesion,
    cerrarSesion,
    limpiarAviso,
  };

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return contexto;
}
