import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BloqueEstado } from "../BloqueEstado";

/** Aviso fijo de solo lectura (Auditor, D32/D39). Sin botones. */
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
  /** Accesos rápidos de la bandeja (D209): enlaces a la derecha del título, en un `nav` «Accesos rápidos». */
  acciones?: ReactNode;
  children?: ReactNode;
}

/**
 * Etiqueta + h1 + descripción, con los accesos rápidos a la derecha (D209), y debajo la zona de chips/avisos.
 * El foco va al h1 al entrar a la pantalla.
 */
export function EncabezadoBandeja({ etiqueta, titulo = "Bandeja", descripcion, acciones, children }: PropsEncabezado) {
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    h1.current?.focus();
  }, []);
  return (
    <>
      <div className="encabezado encabezado--bandeja">
        <div className="encabezado__texto">
          <p className="etiqueta">{etiqueta}</p>
          <h1 ref={h1} tabIndex={-1}>
            {titulo}
          </h1>
          <p>{descripcion}</p>
        </div>
        {acciones ? (
          <nav className="encabezado__acciones" aria-label="Accesos rápidos">
            {acciones}
          </nav>
        ) : null}
      </div>
      {children}
    </>
  );
}

interface PropsGrupo {
  titulo?: string;
  /** Texto breve bajo el título (p. ej. «Solo consulta…»). */
  descripcion?: string;
  /** Cantidad de tarjetas del grupo: dentro de una `FranjaResumen` reparte el ancho para que todas midan lo mismo (D209). */
  peso?: number;
  compacto?: boolean;
  children: ReactNode;
}

/** Panel con `h2` opcional que envuelve `.tarjetas-resumen`: un tema por grupo (D209). */
export function GrupoContadores({ titulo, descripcion, peso, children, compacto = false }: PropsGrupo) {
  const estilo = peso ? ({ "--q360-peso": peso } as CSSProperties) : undefined;
  return (
    <section className="grupo-contadores" aria-label={titulo ? undefined : "Contadores"} style={estilo}>
      {titulo ? <h2>{titulo}</h2> : null}
      {descripcion ? <p className="grupo-contadores__descripcion">{descripcion}</p> : null}
      <div className={`tarjetas-resumen${compacto ? " tarjetas-resumen--compactas" : ""}`}>{children}</div>
    </section>
  );
}

/** Fila de grupos de contadores: en escritorio comparten el ancho según su `peso`; en pantallas angostas se apilan (D209). */
export function FranjaResumen({ children }: { children: ReactNode }) {
  return <div className="franja-resumen">{children}</div>;
}

/** Los contadores de un tema a la izquierda y su lista a la derecha (p. ej. impedimentos); se apilan bajo 1100 px (D209). */
export function TemaBandeja({ children }: { children: ReactNode }) {
  return <div className="tema-bandeja">{children}</div>;
}

/** Dos paneles lado a lado en escritorio; se apilan bajo 1100 px (D209). */
export function RejillaBandeja({ children }: { children: ReactNode }) {
  return <div className="rejilla-bandeja">{children}</div>;
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
