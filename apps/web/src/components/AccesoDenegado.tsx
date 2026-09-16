/** Pantalla genérica ante un 403 `ACCESO_DENEGADO` (D12, E2-F04#2). Nunca revela detalles del recurso. */
export function AccesoDenegado() {
  return (
    <div className="acceso-denegado" data-testid="acceso-denegado" role="alert">
      <h1>Acceso denegado</h1>
      <p>No tienes acceso a este recurso.</p>
    </div>
  );
}
