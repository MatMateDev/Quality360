import { useMemo, useState } from "react";
import { Paginacion } from "@/components/bandeja/Paginacion";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { textoMotivo } from "@/lib/mensajesIntegracion";
import type { AccionVistaPrevia, FilaVistaPrevia, VistaPreviaArchivo } from "@/types/dominio";
import { CeldaCambios } from "./CeldaCambios";
import { ChipsAdvertencias, InsigniaAccionVistaPrevia } from "./Insignias";

const POR_PAGINA = 25;

const FILTROS: Array<{ valor: "" | AccionVistaPrevia; etiqueta: string }> = [
  { valor: "", etiqueta: "Todas" },
  { valor: "CREAR", etiqueta: "Crear" },
  { valor: "ACTUALIZAR", etiqueta: "Actualizar" },
  { valor: "OMITIR", etiqueta: "Omitir" },
  { valor: "ERROR", etiqueta: "Con error" },
];

function Contador({ clave, titulo, valor, aparte = false }: { clave: string; titulo: string; valor: number; aparte?: boolean }) {
  return (
    <div className={`tarjeta-resumen resumen-ejecucion__item${aparte ? " resumen-ejecucion__aparte" : ""}`} data-testid={clave}>
      <dt className="tarjeta-resumen__titulo">{titulo}</dt>
      <dd className="tarjeta-resumen__valor">{valor}</dd>
      {aparte ? <dd className="resumen-ejecucion__nota">(informativo, no suma)</dd> : null}
    </div>
  );
}

interface Props {
  previa: VistaPreviaArchivo;
  estricto: boolean;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Vista previa de la importación (E5-F03): contadores, aviso de campos, tabla paginada EN EL CLIENTE (el servidor
 * devuelve las ≤ 500 filas de una vez), filtro por acción y las frases de confirmación. El contenido del archivo es
 * siempre texto plano: un valor que empieza con `=`, `+`, `-` o `@` se ve tal cual.
 */
export function VistaPreviaImportacion({ previa, estricto }: Props) {
  const [filtro, setFiltro] = useState<"" | AccionVistaPrevia>("");
  const [pagina, setPagina] = useState(1);
  const filas = useMemo(() => (filtro ? previa.detalle.filter((f) => f.accion === filtro) : previa.detalle), [previa, filtro]);
  const visibles = filas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const columnas: Columna<FilaVistaPrevia>[] = [
    { id: "fila", titulo: "Fila", prioritaria: true, render: (f) => f.fila },
    { id: "codigo", titulo: "Código", render: (f) => (f.codigo ? <span className="codigo">{f.codigo}</span> : "—") },
    {
      id: "titulo",
      titulo: "Título",
      render: (f) => (
        <span className="celda-titulo-corta" title={f.titulo ?? undefined}>
          {f.titulo ?? "—"}
        </span>
      ),
    },
    { id: "accion", titulo: "Acción", prioritaria: true, render: (f) => <InsigniaAccionVistaPrevia accion={f.accion} /> },
    {
      id: "motivo",
      titulo: "Motivo",
      render: (f) => (
        <>
          {f.motivo ? textoMotivo(f.motivo) : "—"}
          {f.accion === "ACTUALIZAR" ? <CeldaCambios cambios={f.cambios} /> : null}
          <ChipsAdvertencias advertencias={f.advertencias} />
        </>
      ),
    },
  ];

  const nada = previa.crear + previa.actualizar === 0;

  return (
    <section className="vista-previa" data-testid="vista-previa" aria-labelledby="titulo-vista-previa">
      <h2 id="titulo-vista-previa">Vista previa</h2>
      <dl className="resumen-ejecucion resumen-ejecucion--previa">
        <Contador clave="vp-crear" titulo="Crear" valor={previa.crear} />
        <Contador clave="vp-actualizar" titulo="Actualizar" valor={previa.actualizar} />
        <Contador clave="vp-omitir" titulo="Omitir" valor={previa.omitir} />
        <Contador clave="vp-con-error" titulo="Con error" valor={previa.errores} />
        <Contador clave="vp-advertencias" titulo="Con advertencias" valor={previa.advertencias} aparte />
      </dl>
      <p className="campo-ayuda" data-testid="aviso-actualizar-campos">
        Al actualizar solo se modifican título, descripción y prioridad.
      </p>
      {previa.columnasIgnoradas.length > 0 ? (
        <p className="campo-ayuda" data-testid="aviso-columnas-ignoradas">
          <span className="chip-advertencia">
            <span aria-hidden="true">!</span> Se ignoraron columnas que el importador no usa
          </span>{" "}
          ({previa.columnasIgnoradas.join(", ")})
        </p>
      ) : null}

      <div className="campo">
        <label htmlFor="filtro-vista-previa">Mostrar</label>
        <select
          id="filtro-vista-previa"
          data-testid="filtro-vista-previa"
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value as "" | AccionVistaPrevia);
            setPagina(1);
          }}
        >
          {FILTROS.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>
      </div>
      <p role="status" data-testid="total-vista-previa">
        {plural(filas.length, "fila", "filas")}
      </p>

      {filas.length === 0 ? (
        <p className="bloque-estado bloque-estado--vacio" data-testid="estado-vacio-vista-previa">
          No hay filas con esa acción.
        </p>
      ) : (
        <>
          <TablaBandeja
            testId="tabla-vista-previa"
            caption="Filas del archivo y lo que haría la importación, en el orden del archivo"
            columnas={columnas}
            items={visibles}
            clave={(f) => String(f.fila)}
            testIdFila={(f) => `fila-vista-previa-${f.fila}`}
            focoPagina={pagina}
          />
          <Paginacion clave="vista-previa" etiqueta="la vista previa" total={filas.length} pagina={pagina} tamano={POR_PAGINA} onPagina={setPagina} />
        </>
      )}

      {estricto && previa.errores > 0 ? (
        <p className="mensaje-aviso" role="status" data-testid="aviso-estricto">
          Con el modo estricto no se importará nada porque hay {plural(previa.errores, "fila con error", "filas con error")}. Se registrará como fallida. Desactívalo para importar las filas válidas.
        </p>
      ) : null}
      {nada && !estricto ? <p className="campo-ayuda">No hay filas para crear ni actualizar. Importar solo dejará un registro en el historial.</p> : null}
      <p role="status" data-testid="resumen-confirmacion">
        Se crearán {previa.crear} HDU, se actualizarán {previa.actualizar} y se omitirán {previa.omitir}. {plural(previa.errores, "fila tiene errores", "filas tienen errores")}.
      </p>
    </section>
  );
}
