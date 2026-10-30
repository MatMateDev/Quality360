import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { codigoDeEscritura, consultarEstado, esIndisponible, useImportarArchivo, usePrevisualizarArchivo } from "@/api/integraciones";
import { BloqueEstado } from "@/components/BloqueEstado";
import { ErrorIntegracion } from "@/components/integraciones/ErrorIntegracion";
import { PanelEsperaEjecucion } from "@/components/integraciones/PanelEsperaEjecucion";
import { PasosImportacion, type PasoImportacion } from "@/components/integraciones/PasosImportacion";
import { ResultadoEjecucion } from "@/components/integraciones/ResultadoEjecucion";
import { SelectorArchivo } from "@/components/integraciones/SelectorArchivo";
import { VistaPreviaImportacion } from "@/components/integraciones/VistaPreviaImportacion";
import { formatoDeArchivo, leerTexto, TAMANO_MAXIMO_BYTES, urlPlantilla } from "@/lib/archivosImportacion";
import { ErrorApi } from "@/lib/httpClient";
import { PLANTILLA_CSV } from "@/lib/mensajesIntegracion";
import { RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";
import type { Ejecucion, ErrorArchivo, VistaPreviaArchivo } from "@/types/dominio";

interface ArchivoEnMemoria {
  nombre: string;
  tamano: number;
  formato: "CSV" | "JSON";
  /** D118: se conserva para «Importar el mismo archivo». Nunca se muestra ni se guarda fuera de la memoria. */
  contenido: string;
}

type Fase = "sin-archivo" | "validando" | "error" | "indisponible" | "vista-previa" | "importando" | "resultado";

interface FalloArchivo {
  codigo: string;
  columnasFaltantes: readonly string[];
  ejecucionId: string | null;
}

const COLUMNAS_FORMATO: Array<[string, string, string]> = [
  ["codigo", "Sí", "Código de la historia (por ejemplo ARC-1)"],
  ["titulo", "Sí", "Título, hasta 200 caracteres"],
  ["descripcion", "No", "Hasta 1.000 caracteres"],
  ["prioridad", "No", "CRITICA, ALTA, MEDIA o BAJA"],
  ["celula", "No", "Solo se usa al crear"],
  ["sprint", "No", "Solo se usa al crear"],
  ["qe_correo", "No", "Solo se usa al crear"],
];

/** Pestaña «Importar archivo» (E5-F03): elegir, revisar la vista previa (que hace de confirmación) e importar. */
export function PaginaImportar() {
  const previsualizar = usePrevisualizarArchivo();
  const importar = useImportarArchivo();
  const [archivo, setArchivo] = useState<ArchivoEnMemoria | null>(null);
  const [fase, setFase] = useState<Fase>("sin-archivo");
  const [previa, setPrevia] = useState<VistaPreviaArchivo | null>(null);
  const [resultado, setResultado] = useState<Ejecucion | null>(null);
  const [fallo, setFallo] = useState<FalloArchivo | null>(null);
  const [global, setGlobal] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const [estricto, setEstricto] = useState(false);
  const [vincular, setVincular] = useState(false);
  const [claveInput, setClaveInput] = useState(0);
  const selector = useRef<HTMLInputElement>(null);

  const ocupado = fase === "validando" || fase === "importando";
  const paso: PasoImportacion = fase === "sin-archivo" ? 1 : fase === "importando" || fase === "resultado" ? 3 : 2;

  function reiniciar() {
    setArchivo(null);
    setFase("sin-archivo");
    setPrevia(null);
    setResultado(null);
    setFallo(null);
    setGlobal(null);
    setEnCurso(false);
    setClaveInput((n) => n + 1);
    setTimeout(() => selector.current?.focus(), 0);
  }

  function fallar(error: unknown): FalloArchivo | null {
    if (error instanceof ErrorApi && (error.status === 413 || error.status === 422)) {
      const cuerpo = error.cuerpo as Partial<ErrorArchivo> | undefined;
      return { codigo: error.codigo, columnasFaltantes: cuerpo?.columnasFaltantes ?? [], ejecucionId: cuerpo?.ejecucionId ?? null };
    }
    return null;
  }

  async function pedirVistaPrevia(a: ArchivoEnMemoria, vincularExistentes: boolean) {
    setFase("validando");
    setFallo(null);
    setGlobal(null);
    setPrevia(null);
    try {
      const respuesta = await previsualizar.mutateAsync({ formato: a.formato, nombre: a.nombre, contenido: a.contenido, estricto, vincularExistentes });
      setPrevia(respuesta);
      setFase("vista-previa");
    } catch (error) {
      const archivoInvalido = fallar(error);
      if (archivoInvalido) {
        setFallo(archivoInvalido);
        setFase("error");
      } else if (esIndisponible(error)) {
        setFase("indisponible");
      } else {
        setGlobal("No fue posible validar el archivo. Intenta nuevamente.");
        setFase("indisponible");
      }
    }
  }

  async function elegir(file: File) {
    setResultado(null);
    setPrevia(null);
    setEnCurso(false);
    setGlobal(null);
    const formato = formatoDeArchivo(file.name);
    const base = { nombre: file.name, tamano: file.size };
    if (!formato) {
      setArchivo(null);
      setFallo({ codigo: "FORMATO_NO_SOPORTADO", columnasFaltantes: [], ejecucionId: null });
      setFase("error");
      return;
    }
    if (file.size > TAMANO_MAXIMO_BYTES) {
      setArchivo(null);
      setFallo({ codigo: "ARCHIVO_MUY_GRANDE", columnasFaltantes: [], ejecucionId: null });
      setFase("error");
      return;
    }
    let contenido: string;
    try {
      contenido = await leerTexto(file);
    } catch {
      setArchivo(null);
      setFallo({ codigo: "ARCHIVO_ILEGIBLE", columnasFaltantes: [], ejecucionId: null });
      setFase("error");
      return;
    }
    const enMemoria = { ...base, formato, contenido };
    setArchivo(enMemoria);
    await pedirVistaPrevia(enMemoria, vincular);
  }

  async function ejecutarImportacion() {
    if (!archivo) return;
    const inicio = Date.now();
    setFase("importando");
    setFallo(null);
    setGlobal(null);
    setEnCurso(false);
    try {
      const ejecucion = await importar.mutateAsync({ formato: archivo.formato, nombre: archivo.nombre, contenido: archivo.contenido, estricto, vincularExistentes: vincular });
      setResultado(ejecucion);
      setFase("resultado");
      return;
    } catch (error) {
      const codigo = codigoDeEscritura(error);
      const archivoInvalido = fallar(error);
      if (codigo === "SIN_RESPUESTA") {
        setFallo({ codigo, columnasFaltantes: [], ejecucionId: null });
        setFase("vista-previa");
        try {
          const actual = await consultarEstado();
          if (actual.ultimaEjecucion && new Date(actual.ultimaEjecucion.iniciadaEn).getTime() >= inicio - 5000) {
            setResultado(actual.ultimaEjecucion);
            setFase("resultado");
          }
        } catch {
          /* queda la advertencia de SIN_RESPUESTA */
        }
      } else if (error instanceof ErrorApi && error.status === 409 && codigo === "INTEGRACION_EN_CURSO") {
        setEnCurso(true);
        setFase("vista-previa");
      } else if (archivoInvalido) {
        setFallo(archivoInvalido);
        setFase("error");
      } else if (error instanceof ErrorApi && error.status === 403) {
        setGlobal("Ya no tienes permiso para esta acción");
        setFase("vista-previa");
      } else {
        setGlobal("No fue posible importar. Intenta nuevamente.");
        setFase("vista-previa");
      }
    }
  }

  function cambiarVincular(valor: boolean) {
    setVincular(valor);
    // Cambia lo que se actualiza: la vista previa se pide de nuevo. El modo estricto no la afecta.
    if (archivo && (fase === "vista-previa" || fase === "error" || fase === "indisponible")) void pedirVistaPrevia(archivo, valor);
  }

  return (
    <div data-testid="pagina-importar">
      <section className="panel" aria-labelledby="titulo-importar">
        <h2 id="titulo-importar">Importar historias desde un archivo</h2>
        <PasosImportacion paso={paso} />

        <details className="formato-archivo" open data-testid="formato-archivo">
          <summary>Formato y límites</summary>
          <p>
            CSV (separador , o ;) o JSON (lista de objetos o {"{"}&quot;historias&quot;: [...]{"}"}). UTF-8. Máximo 1 MB y 500 filas. Los valores que empiezan con =, +, - o @ se importan como texto.
          </p>
          <table>
            <caption className="sr-only">Columnas del archivo</caption>
            <thead>
              <tr>
                <th scope="col">Columna</th>
                <th scope="col">Obligatoria</th>
                <th scope="col">Uso</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNAS_FORMATO.map(([nombre, obligatoria, uso]) => (
                <tr key={nombre}>
                  <td>
                    <code>{nombre}</code>
                  </td>
                  <td>{obligatoria}</td>
                  <td>{uso}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <a href={urlPlantilla(PLANTILLA_CSV)} download="plantilla-historias.csv" data-testid="enlace-plantilla-csv">
              Descargar plantilla CSV
            </a>{" "}
            (la fila de ejemplo dice «Reemplaza esta fila»).
          </p>
        </details>

        <SelectorArchivo ref={selector} archivo={archivo} deshabilitado={ocupado} claveInput={claveInput} onElegir={(f) => void elegir(f)} onQuitar={reiniciar} />

        <div className="campo">
          <label htmlFor="casilla-estricto">
            <input id="casilla-estricto" data-testid="casilla-estricto" type="checkbox" checked={estricto} disabled={ocupado} aria-describedby="ayuda-estricto" onChange={(e) => setEstricto(e.target.checked)} /> Importar solo si todas las filas son válidas
          </label>
          <span className="campo-ayuda" id="ayuda-estricto">
            Si una fila tiene error, no se importa nada.
          </span>
        </div>
        <div className="campo">
          <label htmlFor="casilla-vincular">
            <input id="casilla-vincular" data-testid="casilla-vincular" type="checkbox" checked={vincular} disabled={ocupado} aria-describedby="ayuda-vincular-archivo" onChange={(e) => cambiarVincular(e.target.checked)} /> Vincular HDU creadas a mano con el mismo código
          </label>
          <span className="campo-ayuda" id="ayuda-vincular-archivo">
            Si ya existe una HDU creada a mano con el mismo código, se actualizará y pasará a figurar como importada del archivo.
          </span>
        </div>
        {vincular ? (
          <p className="mensaje-aviso" role="note" data-testid="aviso-vincular-activo">
            Se actualizarán el título, la descripción y la prioridad de las HDU creadas a mano que coincidan por código. Su estado, analista y checklist no cambian.
          </p>
        ) : null}

        {fase === "validando" ? (
          <p role="status" aria-busy="true" data-testid="estado-validando-archivo">
            Validando el archivo…
          </p>
        ) : null}

        {fase === "indisponible" ? (
          <div data-testid="estado-indisponible-importar">
            <BloqueEstado
              id="importar"
              estado={global ? "error" : "indisponible"}
              mensaje={global ?? "No disponible"}
              onReintentar={archivo ? () => void pedirVistaPrevia(archivo, vincular) : undefined}
            />
          </div>
        ) : null}

        {fase === "error" && fallo ? (
          <ErrorIntegracion
            testId="error-archivo"
            codigo={fallo.codigo}
            contexto={{ columnasFaltantes: fallo.columnasFaltantes }}
            titulo="El archivo no se puede importar"
            sugerencias={["CORREGIR_ARCHIVO"]}
            pie={
              fallo.ejecucionId ? (
                <>
                  No se creó ninguna HDU. La ejecución quedó registrada: <Link to={`${RUTAS_INTEGRACIONES.historial}?ejecucion=${fallo.ejecucionId}`}>Ver en el Historial</Link>
                </>
              ) : (
                "No se creó ninguna HDU."
              )
            }
          />
        ) : null}

        {enCurso ? (
          <p className="mensaje-aviso" role="status" data-testid="aviso-en-curso">
            Ya hay una importación o sincronización en curso. Espera a que termine.
          </p>
        ) : null}
        {fallo && fase === "vista-previa" ? (
          <ErrorIntegracion
            testId="error-archivo"
            codigo={fallo.codigo}
            titulo="No recibimos respuesta"
            pie={<Link to={RUTAS_INTEGRACIONES.historial}>Ver en el Historial</Link>}
          />
        ) : null}
        {global && fase === "vista-previa" ? (
          <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
            {global}
          </p>
        ) : null}

        {(fase === "vista-previa" || fase === "importando") && previa ? <VistaPreviaImportacion previa={previa} estricto={estricto} /> : null}
        {fase === "importando" ? <PanelEsperaEjecucion testId="estado-importando" texto={`Importando ${previa?.filas ?? ""} filas. Puede tardar hasta unos 10 segundos.`} nota="No se puede cancelar. Puedes salir: el resultado quedará en el Historial." /> : null}

        {fase === "vista-previa" || fase === "importando" ? (
          <div className="acciones-vista-previa">
            <button type="button" className="boton boton--secundario" data-testid="boton-cancelar-importacion" disabled={fase === "importando"} onClick={reiniciar}>
              Cancelar
            </button>
            <button type="button" className="boton boton--primario" data-testid="boton-importar" disabled={fase === "importando"} onClick={() => void ejecutarImportacion()}>
              {fase === "importando" ? "Importando…" : "Importar"}
            </button>
          </div>
        ) : null}
      </section>

      {fase === "resultado" && resultado ? (
        <>
          <ResultadoEjecucion
            ejecucion={resultado}
            modo="archivo"
            testId="resultado-importacion"
            testIdError="error-archivo"
            vincularActivo={vincular}
            totalFilasArchivo={previa?.filas}
            acciones={{ importarMismoArchivo: () => void ejecutarImportacion() }}
          />
          <div className="acciones-vista-previa">
            <button type="button" className="boton boton--secundario" data-testid="boton-importar-otro" onClick={reiniciar}>
              Importar otro archivo
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
