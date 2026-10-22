import { Link } from "react-router-dom";
import type { Relaciones } from "@/lib/relaciones";
import type { Usuario } from "@/types/dominio";

interface Props {
  usuario: Usuario;
  relaciones: Relaciones;
  /** Abre el diálogo de células con todo desmarcado. */
  onQuitarCelulas?: () => void;
}

/**
 * Mensaje del 409 estructurado (D43): informa todas las relaciones a la vez y ofrece una salida por cada una.
 * Con HDU abiertas, un enlace a cada una para reasignarla (el QE responsable lo reasigna el Administrador
 * desde el detalle de la HDU; el analista, también).
 */
export function MensajeRelaciones({ usuario, relaciones, onQuitarCelulas }: Props) {
  const { analistasVigentes, supervisorVigente, hduAbiertas, celulasVigentes } = relaciones;
  const antes = `Antes de cambiar el rol de ${usuario.nombre}`;
  return (
    <div className="campo-error" role="alert" data-testid="error-cambio-rol">
      <ul>
        {celulasVigentes.length > 0 ? (
          <li data-testid="relacion-celulas">
            {antes} debes quitarle sus células ({celulasVigentes.map((c) => c.nombre).join(", ")}).{" "}
            {onQuitarCelulas ? (
              <button type="button" className="boton--enlace" data-testid="boton-quitar-celulas" onClick={onQuitarCelulas}>
                Quitar células
              </button>
            ) : null}
          </li>
        ) : null}
        {hduAbiertas.total > 0 ? (
          <li data-testid="relacion-hdu-abiertas">
            {antes} debes reasignar sus {hduAbiertas.total} {hduAbiertas.total === 1 ? "HDU abierta" : "HDU abiertas"}:
            <ul>
              {hduAbiertas.items.map((h) => (
                <li key={h.id}>
                  <Link to={`/hdu/${h.id}#asignacion`} data-testid={`enlace-hdu-abierta-${h.id}`}>
                    {h.codigo} · {h.titulo}
                  </Link>
                </li>
              ))}
              {hduAbiertas.total > hduAbiertas.items.length ? <li>… y {hduAbiertas.total - hduAbiertas.items.length} más.</li> : null}
            </ul>
          </li>
        ) : null}
        {analistasVigentes.length > 0 ? (
          <li data-testid="relacion-analistas">
            {antes} debes reasignar a sus analistas supervisados ({analistasVigentes.map((a) => a.nombre).join(", ")}).{" "}
            <Link to={`/admin/supervision?qe=${usuario.id}`}>Ir a Supervisión</Link>
          </li>
        ) : null}
        {supervisorVigente ? (
          <li data-testid="relacion-supervisor">
            {antes} debes cambiar su QE supervisor ({supervisorVigente.nombre}).{" "}
            <Link to={`/admin/supervision?analista=${usuario.id}`}>Ir a Supervisión</Link>
          </li>
        ) : null}
      </ul>
      <p>No se aplicó ningún cambio.</p>
    </div>
  );
}
