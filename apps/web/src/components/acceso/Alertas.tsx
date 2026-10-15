import type { ReactNode } from "react";
import type { AlertaAcceso } from "@/auth/AuthContext";
import type { TipoErrorAcceso } from "@/auth/errorAcceso";
import { IconoError, IconoExito, IconoReloj } from "./Iconos";

type Variante = "error" | "aviso" | "exito";

interface PropsAlerta {
  variante: Variante;
  /** `alert` interrumpe al lector de pantalla (errores); `status` espera su turno (avisos). */
  rol: "alert" | "status";
  testId: string;
  /** Subtipo para las pruebas (`data-tipo`). */
  tipo?: string;
  id?: string;
  children: ReactNode;
}

const ICONOS = { error: IconoError, aviso: IconoReloj, exito: IconoExito } as const;

/** Bloque de mensaje de la pantalla de acceso: el icono acompaña al color, que nunca es el único indicio. */
export function Alerta({ variante, rol, testId, tipo, id, children }: PropsAlerta) {
  const Icono = ICONOS[variante];
  return (
    <div id={id} className={`acceso-alerta acceso-alerta--${variante}`} role={rol} data-testid={testId} data-tipo={tipo}>
      <Icono className="acceso-alerta__icono" />
      <span>{children}</span>
    </div>
  );
}

const DATA_TIPO: Record<TipoErrorAcceso, string> = {
  CREDENCIALES: "credenciales",
  DEMASIADOS_INTENTOS: "demasiados-intentos",
  SERVICIO_NO_DISPONIBLE: "servicio",
};

function datoTipoDeErrorAcceso(tipo: TipoErrorAcceso): string {
  return DATA_TIPO[tipo];
}

/** Error global de acceso (credenciales, demasiados intentos o servicio no disponible). */
export function AlertaErrorAcceso({ alerta, testId = "error-login" }: { alerta: AlertaAcceso; testId?: string }) {
  return (
    <Alerta variante="error" rol="alert" testId={testId} tipo={datoTipoDeErrorAcceso(alerta.tipo)}>
      {alerta.mensaje}
    </Alerta>
  );
}
