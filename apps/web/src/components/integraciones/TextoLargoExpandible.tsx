import { Fragment, useId, useState, type ReactNode } from "react";

const UMBRAL_LARGO = 1200;
const MARCA_NO_MOSTRABLE = "[contenido no mostrable]";
// Solo `http(s)`: un `javascript:` o `data:` nunca coincide y queda como texto plano (D198).
const PATRON = /(https?:\/\/[^\s<>"'`]+|\[contenido no mostrable\])/g;

/** Separa la puntuación final que no es parte de la URL («https://x.cl/a.» ). */
function recortarURL(url: string): { url: string; resto: string } {
  const m = /[.,;:!?)\]]+$/.exec(url);
  return m ? { url: url.slice(0, -m[0].length), resto: m[0] } : { url, resto: "" };
}

/** Convierte texto plano en nodos de React: enlaces `http(s)` y la marca de contenido no mostrable. Nunca HTML. */
function renderizarTextoSeguro(texto: string): ReactNode[] {
  return texto.split(PATRON).map((trozo, i) => {
    if (trozo === MARCA_NO_MOSTRABLE) {
      return (
        <em key={i} className="contenido-no-mostrable" title="Imagen, macro o extensión que Quality360 no muestra">
          {trozo}
        </em>
      );
    }
    if (/^https?:\/\//.test(trozo)) {
      const { url, resto } = recortarURL(trozo);
      try {
        const analizada = new URL(url);
        if (analizada.protocol !== "http:" && analizada.protocol !== "https:") return <Fragment key={i}>{trozo}</Fragment>;
        return (
          <Fragment key={i}>
            <a href={analizada.href} target="_blank" rel="noopener noreferrer">
              {url}
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
            {resto}
          </Fragment>
        );
      } catch {
        return <Fragment key={i}>{trozo}</Fragment>;
      }
    }
    return <Fragment key={i}>{trozo}</Fragment>;
  });
}

interface Props {
  seccion: "descripcion" | "criterios";
  titulo: string;
  codigo: string;
  texto: string | null;
  truncado: boolean;
  urlJira: string | null;
  vacio: string;
  /** Etiqueta pequeña junto al título («Tomados de la descripción»). */
  etiqueta?: string;
  onAnunciar?: (mensaje: string) => void;
}

/**
 * Descripción o criterios de Jira como TEXTO (diseño §2.4): `pre-wrap`, palabra larga sin scroll horizontal, «Ver todo»
 * con scroll interno alcanzable por teclado, aviso de recorte y estado vacío explícito (nunca una sección en blanco).
 */
export function TextoLargoExpandible({ seccion, titulo, codigo, texto, truncado, urlJira, vacio, etiqueta, onAnunciar }: Props) {
  const idTexto = useId();
  const [abierto, setAbierto] = useState(false);
  const largo = (texto?.length ?? 0) > UMBRAL_LARGO;
  const nombre = seccion === "descripcion" ? "Descripción" : "Criterios";
  return (
    <section className="panel-detalle__seccion" aria-labelledby={`${idTexto}-titulo`}>
      <h3 id={`${idTexto}-titulo`}>
        {titulo}
        {etiqueta ? <span className="chip-grupo panel-detalle__etiqueta">{etiqueta}</span> : null}
      </h3>
      {texto === null ? (
        <p className="panel-detalle__vacio" data-testid={`detalle-vacio-${seccion}`}>
          {vacio}
        </p>
      ) : (
        <div data-testid={`detalle-${seccion}`}>
          <div
            id={idTexto}
            className={`panel-detalle__texto texto-largo${largo ? (abierto ? " panel-detalle__texto--abierto" : " panel-detalle__texto--recortado") : ""}`}
            {...(largo && abierto ? { tabIndex: 0, role: "region", "aria-label": `${nombre} completa de ${codigo}` } : {})}
          >
            {renderizarTextoSeguro(texto)}
          </div>
          {largo ? (
            <button
              type="button"
              className="boton boton--terciario"
              data-testid={`boton-ver-todo-${seccion}`}
              aria-expanded={abierto}
              aria-controls={idTexto}
              onClick={() => {
                setAbierto((v) => !v);
                if (!abierto) onAnunciar?.("Texto expandido");
              }}
            >
              {abierto ? "Ver menos" : "Ver todo"}
            </button>
          ) : null}
          {truncado ? (
            <p className="mensaje-aviso" role="note" data-testid="aviso-texto-recortado">
              Texto recortado; ver completo en Jira
              {urlJira ? (
                <>
                  {" "}
                  <a href={urlJira} target="_blank" rel="noopener noreferrer">
                    Abrir en Jira<span className="sr-only"> (se abre en otra pestaña)</span>
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
