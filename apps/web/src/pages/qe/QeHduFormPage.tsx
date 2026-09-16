import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCelulas, useSprints } from "@/api/catalogos";
import { useCrearHdu } from "@/api/hdu";
import { ErrorApi } from "@/lib/httpClient";
import { ETIQUETAS_PRIORIDAD, type PrioridadHdu } from "@/types/dominio";

interface Valores {
  codigo: string;
  titulo: string;
  celulaId: string;
  sprintId: string;
  prioridad: PrioridadHdu;
}

const VALORES_INICIALES: Valores = { codigo: "", titulo: "", celulaId: "", sprintId: "", prioridad: "MEDIA" };

/** E2-F01: código, título, célula, sprint y prioridad. Marca campos faltantes y muestra el duplicado junto al código. */
export function QeHduFormPage() {
  const navigate = useNavigate();
  const celulasQuery = useCelulas();
  const sprintsQuery = useSprints();
  const crearHdu = useCrearHdu();

  const [valores, setValores] = useState<Valores>(VALORES_INICIALES);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  function actualizar<K extends keyof Valores>(campo: K, valor: Valores[K]) {
    setValores((actual) => ({ ...actual, [campo]: valor }));
  }

  async function manejarSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const nuevosErrores: Record<string, string> = {};
    if (!valores.codigo.trim()) nuevosErrores.codigo = "El código es obligatorio.";
    if (!valores.titulo.trim()) nuevosErrores.titulo = "El título es obligatorio.";
    if (!valores.celulaId) nuevosErrores.celulaId = "La célula es obligatoria.";
    if (!valores.sprintId) nuevosErrores.sprintId = "El sprint es obligatorio.";
    setErrores(nuevosErrores);
    setErrorGeneral(null);
    if (Object.keys(nuevosErrores).length > 0) return;

    try {
      const creada = await crearHdu.mutateAsync({
        codigo: valores.codigo.trim(),
        titulo: valores.titulo.trim(),
        celulaId: valores.celulaId,
        sprintId: valores.sprintId,
        prioridad: valores.prioridad,
      });
      navigate(`/hdu/${creada.id}`);
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === "CODIGO_HDU_DUPLICADO") {
        setErrores((actual) => ({ ...actual, codigo: error.mensaje }));
        return;
      }
      if (error instanceof ErrorApi && error.codigo === "VALIDACION") {
        const nuevos: Record<string, string> = {};
        for (const detalle of error.detalles) nuevos[detalle.campo] = detalle.mensaje;
        setErrores(nuevos);
        return;
      }
      setErrorGeneral("No fue posible registrar la HDU. Intenta nuevamente.");
    }
  }

  return (
    <div>
      <div className="encabezado">
        <p className="etiqueta">Portal QE</p>
        <h1>Nueva HDU</h1>
        <p>Registra una historia de usuario para iniciar su seguimiento de certificación.</p>
      </div>

      <form className="formulario panel" onSubmit={manejarSubmit} noValidate>
        <div className="campos-formulario">
          <div className="campo">
            <label htmlFor="campo-codigo">Código</label>
            <input
              id="campo-codigo"
              value={valores.codigo}
              placeholder="PAGOS-1042"
              onChange={(evento) => actualizar("codigo", evento.target.value)}
              aria-invalid={Boolean(errores.codigo)}
              aria-describedby={errores.codigo ? "error-codigo" : undefined}
            />
            {errores.codigo ? (
              <p className="campo-error" id="error-codigo" data-testid="error-codigo-hdu">
                {errores.codigo}
              </p>
            ) : null}
          </div>

          <div className="campo campo--amplio">
            <label htmlFor="campo-titulo">Título</label>
            <input
              id="campo-titulo"
              value={valores.titulo}
              onChange={(evento) => actualizar("titulo", evento.target.value)}
              aria-invalid={Boolean(errores.titulo)}
              aria-describedby={errores.titulo ? "error-titulo" : undefined}
            />
            {errores.titulo ? (
              <p className="campo-error" id="error-titulo">
                {errores.titulo}
              </p>
            ) : null}
          </div>

          <div className="campo">
            <label htmlFor="campo-celula">Célula</label>
            <select
              id="campo-celula"
              value={valores.celulaId}
              onChange={(evento) => actualizar("celulaId", evento.target.value)}
              aria-invalid={Boolean(errores.celulaId)}
              aria-describedby={errores.celulaId ? "error-celula" : undefined}
            >
              <option value="">Selecciona una célula</option>
              {celulasQuery.data?.items.map((celula) => (
                <option key={celula.id} value={celula.id}>
                  {celula.nombre}
                </option>
              ))}
            </select>
            {errores.celulaId ? (
              <p className="campo-error" id="error-celula">
                {errores.celulaId}
              </p>
            ) : null}
          </div>

          <div className="campo">
            <label htmlFor="campo-sprint">Sprint</label>
            <select
              id="campo-sprint"
              value={valores.sprintId}
              onChange={(evento) => actualizar("sprintId", evento.target.value)}
              aria-invalid={Boolean(errores.sprintId)}
              aria-describedby={errores.sprintId ? "error-sprint" : undefined}
            >
              <option value="">Selecciona un sprint</option>
              {sprintsQuery.data?.items.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.nombre}
                </option>
              ))}
            </select>
            {errores.sprintId ? (
              <p className="campo-error" id="error-sprint">
                {errores.sprintId}
              </p>
            ) : null}
          </div>

          <div className="campo">
            <label htmlFor="campo-prioridad">Prioridad</label>
            <select id="campo-prioridad" value={valores.prioridad} onChange={(evento) => actualizar("prioridad", evento.target.value as PrioridadHdu)}>
              {Object.entries(ETIQUETAS_PRIORIDAD).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorGeneral ? (
          <p className="mensaje-error-global" role="alert">
            {errorGeneral}
          </p>
        ) : null}

        <div className="acciones-formulario">
          <button type="button" className="boton boton--secundario" onClick={() => navigate(-1)}>
            Cancelar
          </button>
          <button type="submit" className="boton boton--primario" disabled={crearHdu.isPending}>
            {crearHdu.isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
