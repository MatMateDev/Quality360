import { useState } from "react";
import { obtenerDescargaCertificado } from "@/api/checklist";

interface Props {
  hduId: string;
  /** Folio, para el nombre accesible. */
  folio: string;
  testId: string;
}

/** Descarga del PDF del certificado por URL firmada (permitida a Líder y Auditor, que no pueden escribir). */
export function BotonDescargaCertificado({ hduId, folio, testId }: Props) {
  const [error, setError] = useState(false);
  const [descargando, setDescargando] = useState(false);

  async function descargar() {
    setError(false);
    setDescargando(true);
    try {
      window.location.assign((await obtenerDescargaCertificado(hduId)).descarga.url);
    } catch {
      setError(true);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="boton boton--secundario"
        data-testid={testId}
        aria-label={`Descargar PDF del certificado ${folio}`}
        disabled={descargando}
        onClick={() => void descargar()}
      >
        ⬇ PDF
      </button>
      {error ? (
        <span className="campo-error" role="alert">
          No fue posible descargar el certificado.
        </span>
      ) : null}
    </>
  );
}
