import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useVerificacionCertificado } from "@/api/checklist";
import { ErrorApi } from "@/lib/httpClient";
import { formatearFecha } from "@/lib/formato";

/** E3-B03#2: verificación pública de un certificado por su folio (D21). No exige sesión. */
export function VerificarCertificadoPage() {
  const { folio } = useParams<{ folio?: string }>();
  const navigate = useNavigate();
  const [entrada, setEntrada] = useState(folio ?? "");
  const verificacion = useVerificacionCertificado(folio);

  function consultar(evento: FormEvent) {
    evento.preventDefault();
    const limpio = entrada.trim().toUpperCase();
    if (limpio) navigate(`/verificar/${encodeURIComponent(limpio)}`);
  }

  const noEncontrado = verificacion.isError && verificacion.error instanceof ErrorApi && verificacion.error.status === 404;

  return (
    <main className="pagina-publica">
      <div className="panel verificacion-panel">
        <p className="etiqueta">Quality360</p>
        <h1>Verificar certificado</h1>
        <p>Ingresa el folio impreso en el certificado de cierre de pruebas.</p>

        <form className="formulario" onSubmit={consultar}>
          <div className="campo">
            <label htmlFor="campo-folio">Folio</label>
            <input id="campo-folio" placeholder="Q360-2026-XXXXXXXX" value={entrada} onChange={(evento) => setEntrada(evento.target.value)} />
          </div>
          <button type="submit" className="boton boton--primario">
            Verificar
          </button>
        </form>

        {verificacion.isLoading ? <p role="status">Verificando…</p> : null}

        {verificacion.data ? (
          <div className="verificacion-resultado verificacion-resultado--valido" role="status" data-testid="verificacion-valida">
            <h2>Certificado válido</h2>
            <dl>
              <dt>Folio</dt>
              <dd>{verificacion.data.folio}</dd>
              <dt>Historia de usuario</dt>
              <dd>
                {verificacion.data.hdu.codigo} · {verificacion.data.hdu.titulo}
              </dd>
              <dt>Emitido</dt>
              <dd>
                {formatearFecha(verificacion.data.emitidoEn)} por {verificacion.data.emitidoPor}
              </dd>
              <dt>Huella SHA-256 del PDF</dt>
              <dd className="texto-huella">{verificacion.data.huellaSha256}</dd>
            </dl>
          </div>
        ) : null}

        {noEncontrado ? (
          <div className="verificacion-resultado verificacion-resultado--invalido" role="alert" data-testid="verificacion-no-encontrada">
            <h2>Folio no encontrado</h2>
            <p>No existe un certificado emitido con ese folio.</p>
          </div>
        ) : null}
        {verificacion.isError && !noEncontrado ? (
          <p className="mensaje-error-global" role="alert">
            No fue posible verificar el folio. Intenta nuevamente.
          </p>
        ) : null}

        <p>
          <Link to="/">Ir al portal</Link>
        </p>
      </div>
    </main>
  );
}
