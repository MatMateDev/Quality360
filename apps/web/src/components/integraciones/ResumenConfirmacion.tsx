import { TEXTO_MARCA_AL_MENOS_UNA, textoBotonConfirmar, textoResumenConfirmacion } from "@/lib/mensajesAsignacion";
import type { Consulta } from "@/types/dominio";

interface Props {
  consulta: Consulta;
  ocupado: boolean;
  onConfirmar: () => void;
}

/** Resumen previo a confirmar (diseño §6.1): contadores en vivo, texto fijo y `boton-confirmar` con N = nuevas + cambios incluidos. */
export function ResumenConfirmacion({ consulta, ocupado, onConfirmar }: Props) {
  const crear = consulta.marcadasNuevas;
  const actualizar = consulta.marcadasCambio;
  const total = crear + actualizar;
  const items = [
    { clave: "a-crear", titulo: "HDU nuevas a crear", valor: crear },
    { clave: "a-actualizar", titulo: "HDU a actualizar", valor: actualizar },
    { clave: "sin-incluir-nuevas", titulo: "Nuevas sin incluir", valor: consulta.nuevas - crear },
    { clave: "sin-incluir-cambios", titulo: "Cambios sin incluir", valor: consulta.cambiaron - actualizar },
  ];
  return (
    <section className="resumen-confirmacion" data-testid="resumen-confirmacion-consulta" aria-labelledby="titulo-resumen-confirmacion" id="resumen-confirmacion">
      <h3 id="titulo-resumen-confirmacion" tabIndex={-1}>
        Resumen antes de confirmar
      </h3>
      <dl className="resumen-ejecucion resumen-ejecucion--previa">
        {items.map((item) => (
          <div key={item.clave} className="tarjeta-resumen resumen-ejecucion__item" data-testid={`contador-${item.clave}`}>
            <dt className="tarjeta-resumen__titulo">{item.titulo}</dt>
            <dd className="tarjeta-resumen__valor">{item.valor}</dd>
          </div>
        ))}
      </dl>
      <p data-testid="texto-confirmacion">{textoResumenConfirmacion(crear, actualizar)}</p>
      <div className="acciones-formulario">
        <button
          type="button"
          className="boton boton--primario"
          data-testid="boton-confirmar"
          aria-disabled={total === 0 || ocupado || undefined}
          aria-describedby={total === 0 ? "ayuda-confirmar" : undefined}
          onClick={() => {
            if (total === 0 || ocupado) return;
            onConfirmar();
          }}
        >
          {ocupado ? "Confirmando…" : textoBotonConfirmar(total)}
        </button>
      </div>
      {total === 0 ? (
        <p id="ayuda-confirmar" className="campo-ayuda" data-testid="ayuda-confirmar">
          {TEXTO_MARCA_AL_MENOS_UNA}
        </p>
      ) : null}
    </section>
  );
}
