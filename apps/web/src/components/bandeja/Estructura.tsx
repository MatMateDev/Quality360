import { useEffect, useRef, useState, type ReactNode } from "react";
import { BloqueEstado } from "../BloqueEstado";

/** Aviso fijo de solo lectura (Líder y Auditor, D32/D39). Sin botones. */
export function AvisoSoloLectura({ texto }: { texto?: string }) {
  return (
    <p className="aviso-solo-lectura" role="note" data-testid="aviso-solo-lectura">
      <span aria-hidden="true">◉</span>
      <span>{texto ?? "Vista de solo lectura. Puedes consultar y descargar, no modificar."}</span>
    </p>
  );
}

interface PropsEncabezado {
  /** Texto certificado del portal, p. ej. «Portal Analista QA». */
  etiqueta: string;
  /** Por defecto «Bandeja». */
  titulo?: string;
  descripcion: string;
  children?: ReactNode;
}

/** Etiqueta + h1 + descripción + zona de chips/avisos. El foco va al h1 al entrar a la pantalla. */
export function EncabezadoBandeja({ etiqueta, titulo = "Bandeja", descripcion, children }: PropsEncabezado) {
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    h1.current?.focus();
  }, []);
  return (
    <>
      <div className="encabezado">
        <p className="etiqueta">{etiqueta}</p>
        <h1 ref={h1} tabIndex={-1}>
          {titulo}
        </h1>
        <p>{descripcion}</p>
      </div>
      {children}
    </>
  );
}

/** `section` con `h2` opcional que envuelve `.tarjetas-resumen`. */
export function GrupoContadores({ titulo, children, compacto = false }: { titulo?: string; children: ReactNode; compacto?: boolean }) {
  return (
    <section className="grupo-contadores" aria-label={titulo ? undefined : "Contadores"}>
      {titulo ? <h2>{titulo}</h2> : null}
      <div className={`tarjetas-resumen${compacto ? " tarjetas-resumen--compactas" : ""}`}>{children}</div>
    </section>
  );
}

export type EstadoDatos = "cargando" | "error" | "indisponible" | "vacio" | "ok";

interface PropsBloque {
  /** Clave de la bandeja: genera `estado-<tipo>-<clave>` y `bloque-lista-<clave>-<tipo>`. */
  clave: string;
  estado: EstadoDatos;
  mensajeVacio?: string;
  mensajeIndisponible?: string;
  tonoVacio?: "exito";
  onReintentar?: () => void;
  children?: ReactNode;
}

/**
 * Los cuatro estados de un bloque de bandeja (D34). Envuelve a `BloqueEstado` sin cambiar su testid
 * certificado y agrega el de convención `estado-<tipo>-<clave>`. Un bloque indisponible nunca muestra `0`.
 */
export function BloqueDatos({ clave, estado, mensajeVacio, mensajeIndisponible, tonoVacio, onReintentar, children }: PropsBloque) {
  if (estado === "ok") return <>{children}</>;
  return (
    <div data-testid={`estado-${estado}-${clave}`} aria-busy={estado === "cargando"}>
      <BloqueEstado
        id={`lista-${clave}`}
        estado={estado}
        mensaje={estado === "vacio" ? mensajeVacio : estado === "indisponible" ? (mensajeIndisponible ?? "No disponible") : undefined}
        tono={estado === "vacio" ? tonoVacio : undefined}
        onReintentar={onReintentar}
      />
      {estado === "cargando" ? (
        <div aria-hidden="true">
          <span className="esqueleto-fila" />
          <span className="esqueleto-fila" />
          <span className="esqueleto-fila" />
        </div>
      ) : null}
    </div>
  );
}

/** Mensaje de éxito `role="status"` que se cierra solo a los 6 s o con «×». */
export function MensajeExito({ mensaje, onCerrar }: { mensaje: string; onCerrar: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setVisible(false);
      onCerrar();
    }, 6000);
    return () => clearTimeout(temporizador);
  }, [mensaje, onCerrar]);
  if (!visible) return null;
  return (
    <p className="mensaje-exito" role="status" data-testid="mensaje-exito-usuarios">
      <span>{mensaje}</span>
      <button type="button" className="boton--enlace" onClick={onCerrar} aria-label="Cerrar mensaje">
        ×
      </button>
    </p>
  );
}
