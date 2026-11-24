import type { MetodoConexionJira } from "@/types/dominio";

interface Props {
  /** Método elegido en el selector (solo cambia el panel que se muestra). */
  elegido: MetodoConexionJira;
  /** Método activo guardado; `null` sin configuración. Elegir otro NO lo cambia (diseño OAuth §2.2 y §6). */
  activo: MetodoConexionJira | null;
  onElegir: (metodo: MetodoConexionJira) => void;
}

const OPCIONES: Array<{ metodo: MetodoConexionJira; testId: string; titulo: string; texto: string; recomendada: boolean }> = [
  {
    metodo: "OAUTH",
    testId: "opcion-oauth",
    titulo: "Conectar con Jira",
    texto: "Inicias sesión en Atlassian y aceptas permisos de solo lectura. No copias ningún token.",
    recomendada: true,
  },
  {
    metodo: "API_TOKEN",
    testId: "opcion-api-token",
    titulo: "Conectar con API token",
    texto: "Alternativa. Copias un API token de tu cuenta de Atlassian y lo pegas aquí.",
    recomendada: false,
  },
];

/**
 * Selector de método de conexión (diseño OAuth §2.2): `fieldset` con dos radios nativos con forma de tarjeta, que se
 * operan con flechas. OAuth va primero y recomendado; el API token es la segunda opción, con el mismo tamaño.
 */
export function SelectorMetodoConexion({ elegido, activo, onElegir }: Props) {
  return (
    <fieldset className="selector-metodo" data-testid="selector-metodo">
      <legend>Método de conexión</legend>
      <div className="selector-metodo__opciones">
        {OPCIONES.map((o) => {
          const marcada = elegido === o.metodo;
          const esActivo = activo === o.metodo;
          const otroActivo = activo !== null && activo !== o.metodo;
          return (
            <label key={o.metodo} className={`opcion-metodo${marcada ? " opcion-metodo--elegida" : ""}`}>
              <span className="opcion-metodo__cabecera">
                <input type="radio" name="metodo-conexion" value={o.metodo} data-testid={o.testId} checked={marcada} onChange={() => onElegir(o.metodo)} />
                <span className="opcion-metodo__titulo">{o.titulo}</span>
                {o.recomendada ? <span className="insignia-texto">Recomendado</span> : null}
                {esActivo ? <span className="insignia-texto insignia-texto--activo">Método activo</span> : null}
              </span>
              <span className="opcion-metodo__texto">{o.texto}</span>
              {marcada && otroActivo ? (
                <span className="opcion-metodo__activo-ahora" data-testid="metodo-activo-ahora">
                  Método activo ahora: {activo === "OAUTH" ? "OAuth" : "API token"}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
