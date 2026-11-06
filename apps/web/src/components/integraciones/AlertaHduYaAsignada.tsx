import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { TEXTO_APOYO_YA_ASIGNADA, textoYaAsignada } from "@/lib/mensajesAsignacion";
import type { YaAsignada } from "@/types/dominio";

interface Props {
  codigo: string;
  yaAsignada: YaAsignada;
  /** `completa` (panel), `fila` (tarjeta de una Nueva) o `compacta` (tablas de Cambiaron y Sin cambios). */
  variante: "completa" | "fila" | "compacta";
  /** Apareció durante la sesión (confirmar o refrescar la fila): `role="alert"` y el foco va al título (diseño §5.5). */
  enSesion: boolean;
}

/**
 * «Esta HDU ya fue asignada a <QE> / <Analista>» (D204): advertencia que bloquea, con borde, glifo y texto; nunca solo
 * color. Presente desde la carga usa `role="note"` para no producir decenas de anuncios asertivos.
 */
export function AlertaHduYaAsignada({ codigo, yaAsignada, variante, enSesion }: Props) {
  const titulo = useRef<HTMLElement>(null);
  useEffect(() => {
    if (enSesion) titulo.current?.focus();
  }, [enSesion]);
  const enlace = (
    <Link to={`/hdu/${yaAsignada.idHistoria}`} className={`boton boton--secundario alerta-ya-asignada__enlace`} data-testid="enlace-ir-a-hdu" aria-label={`Ir a la HDU ${codigo} para reasignarla`}>
      Ir a la HDU<span aria-hidden="true"> ↗</span>
    </Link>
  );
  return (
    <div
      className={`alerta-ya-asignada alerta-ya-asignada--${variante}`}
      role={enSesion ? "alert" : "note"}
      data-testid="alerta-hdu-ya-asignada"
      data-qe={yaAsignada.qe}
      data-analista={yaAsignada.analista ?? ""}
      data-id-historia={yaAsignada.idHistoria}
    >
      <span className="alerta-ya-asignada__glifo" aria-hidden="true">
        !
      </span>
      <div className="alerta-ya-asignada__cuerpo">
        <strong ref={titulo} tabIndex={-1} className="texto-largo">
          {textoYaAsignada(yaAsignada)}
        </strong>
        {variante !== "compacta" ? <p className="alerta-ya-asignada__apoyo">{TEXTO_APOYO_YA_ASIGNADA}</p> : null}
      </div>
      {enlace}
    </div>
  );
}
