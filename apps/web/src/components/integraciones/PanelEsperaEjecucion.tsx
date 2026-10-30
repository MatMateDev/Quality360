/** Espera indeterminada y no cancelable de una sola petición (D114): sin porcentaje ni contadores parciales. */
export function PanelEsperaEjecucion({ testId, texto, nota }: { testId: string; texto: string; nota?: string }) {
  return (
    <div className="panel panel-espera" role="status" aria-busy="true" data-testid={testId}>
      <div className="barra-espera" aria-hidden="true">
        <span />
      </div>
      <p>{texto}</p>
      {nota ? <p className="campo-ayuda">{nota}</p> : null}
    </div>
  );
}
