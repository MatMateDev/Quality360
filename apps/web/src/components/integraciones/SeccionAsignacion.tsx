import { Link } from "react-router-dom";
import { esIndisponible } from "@/api/integraciones";
import { TEXTO_NO_SE_PUDO_GUARDAR, TEXTO_SIN_LIDER, TEXTO_SIN_ANALISTAS, TEXTO_SPRINT_JIRA_AUSENTE, textoAnalistaAutomatico, textoCreada, textoEligeAnalista, textoFalta } from "@/lib/mensajesAsignacion";
import { AlertaHduYaAsignada } from "./AlertaHduYaAsignada";
import { SelectorAsignacion } from "./SelectorAsignacion";
import type { FilaAsignacion } from "./useAsignacionFila";

interface Props {
  fila: FilaAsignacion;
  /** `tarjeta` (lista) o `panel` (sección «Asignación» del detalle): cambia los ids y el `data-origen` del botón. */
  origen: "tarjeta" | "panel";
  soloLectura?: boolean;
  /** El panel pinta la alerta arriba del contenido (diseño §5.4); la tarjeta la pinta aquí. */
  conAlerta?: boolean;
  /** La tarjeta incluye la casilla «Incluir en la confirmación»; el panel no. */
  conMarca?: boolean;
  onAlternarMarca?: (marcar: boolean) => void;
}

/** Texto de solo lectura de una fila creada o ya asignada: los selectores se reemplazan por una lista (el lector lee los valores). */
function DatosLectura({ fila }: { fila: FilaAsignacion }) {
  const { item } = fila;
  const a = item.asignacion;
  const y = item.yaAsignada;
  const campos = [
    { etiqueta: "Célula", valor: a?.celula?.nombre },
    { etiqueta: "QE responsable", valor: y?.qe ?? a?.qeResponsable?.nombre },
    { etiqueta: "Analista QA", valor: y ? y.analista : a?.analista?.nombre },
    { etiqueta: "Sprint", valor: a?.sprint?.nombre },
  ];
  return (
    <dl className="fila-asignacion__lectura" data-testid="datos-lectura">
      {campos.map((c) => (
        <div key={c.etiqueta}>
          <dt>{c.etiqueta}</dt>
          <dd className="texto-largo">{c.valor || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Asignación de una fila «Nueva» (diseño §3 y §4): cuatro selectores, aviso de asignación automática, estado y
 * «Confirmar asignación». Con la fila creada o ya asignada es de solo lectura.
 */
export function SeccionAsignacion({ fila, origen, soloLectura = false, conAlerta = true, conMarca = true, onAlternarMarca }: Props) {
  const { item, codigo, celulaId, qeId, nombreQe, ocupado, errores, estado, errorConfirmar, confirmando } = fila;
  const a = item.asignacion;
  const sufijo = `${origen}-${item.id}`;
  const creada = item.aplicada;
  const yaAsignada = item.yaAsignada;
  const lectura = creada || Boolean(yaAsignada) || soloLectura;
  const motivoMarca = item.marcable ? undefined : item.faltantes.length > 0 ? textoFalta(item.faltantes) : "Esta fila no se puede incluir";
  const idMotivoConfirmar = `motivo-confirmar-${sufijo}`;
  const mostrarMotivo = Boolean(fila.motivoConfirmar) && !creada && !yaAsignada && !soloLectura;
  const analistaAuto = item.analistaAuto && Boolean(a?.analista) && Boolean(qeId);

  return (
    <>
      {yaAsignada && conAlerta ? <AlertaHduYaAsignada codigo={codigo} yaAsignada={yaAsignada} variante="fila" enSesion={fila.alertaEnSesion} /> : null}

      {lectura ? (
        creada || yaAsignada ? (
          <DatosLectura fila={fila} />
        ) : null
      ) : (
        <div className="fila-asignacion__selectores">
          <SelectorAsignacion
            id={`celula-${sufijo}`}
            etiqueta="Célula"
            nombreAccesible={`Célula de ${codigo}`}
            valor={celulaId}
            opciones={fila.opcionesCelula}
            vacio="Elige…"
            testId="selector-celula"
            ocupado={ocupado}
            deshabilitado={confirmando}
            error={errores.celulaId}
            idError={`error-celula-${sufijo}`}
            testIdError={`error-celulaId-${codigo}`}
            onCambio={(v) => void fila.cambiar({ celulaId: v === "" ? null : v })}
          />
          <SelectorAsignacion
            id={`qe-${sufijo}`}
            etiqueta="QE responsable"
            nombreAccesible={`QE responsable de ${codigo}`}
            valor={qeId}
            opciones={fila.opcionesQe}
            vacio="Elige…"
            testId="selector-qe"
            ocupado={ocupado}
            deshabilitado={confirmando}
            error={errores.qeId}
            idError={`error-qe-${sufijo}`}
            testIdError={`error-qeId-${codigo}`}
            onCambio={(v) => void fila.cambiar({ qeId: v === "" ? null : v })}
          />
          <SelectorAsignacion
            id={`analista-${sufijo}`}
            etiqueta="Analista QA"
            nombreAccesible={`Analista QA de ${codigo}`}
            valor={a?.analista?.id ?? ""}
            opciones={fila.opcionesAnalista}
            vacio="Elige…"
            testId="selector-analista"
            ocupado={ocupado}
            deshabilitado={!qeId || confirmando}
            motivo={!qeId ? "Elige primero un QE" : undefined}
            ayuda={
              fila.sinAnalistas ? (
                <span data-testid="ayuda-sin-analistas">
                  <span aria-hidden="true">! </span>
                  {TEXTO_SIN_ANALISTAS}
                </span>
              ) : qeId && !a?.analista && fila.analistas.isSuccess ? (
                <span data-testid="ayuda-elige-analista">{textoEligeAnalista(nombreQe)}</span>
              ) : undefined
            }
            idAyuda={`ayuda-analista-${sufijo}`}
            error={errores.analistaId}
            idError={`error-analista-${sufijo}`}
            testIdError={`error-analistaId-${codigo}`}
            onCambio={(v) => void fila.cambiar({ analistaId: v === "" ? null : v }, { analista: fila.opcionesAnalista.find((o) => o.valor === v)?.etiqueta, qe: nombreQe })}
          />
          <SelectorAsignacion
            id={`sprint-${sufijo}`}
            etiqueta="Sprint"
            nombreAccesible={`Sprint de ${codigo}`}
            valor={a?.sprint?.id ?? ""}
            opciones={fila.opcionesSprint}
            vacio="Elige un sprint"
            testId="selector-sprint"
            ocupado={ocupado}
            deshabilitado={!celulaId || confirmando}
            motivo={!celulaId ? "Elige primero una célula" : undefined}
            error={errores.sprintId}
            idError={`error-sprint-${sufijo}`}
            testIdError={`error-sprintId-${codigo}`}
            onCambio={(v) => void fila.cambiar({ sprintId: v === "" ? null : v })}
          />
        </div>
      )}

      {!lectura && analistaAuto ? (
        <p className="aviso-automatico" data-testid="aviso-analista-automatico" data-analista={a?.analista?.nombre}>
          <span aria-hidden="true">ⓘ</span> {textoAnalistaAutomatico(nombreQe)}
        </p>
      ) : null}

      {fila.catalogoCaido && !lectura ? (
        <p className="campo-error" role="status" data-testid={`error-catalogos-${codigo}`}>
          No pudimos cargar las opciones
          {esIndisponible(fila.celulas.error) ? " (no disponible)" : ""}.{" "}
          <button type="button" className="boton boton--secundario" onClick={fila.reintentarCatalogos}>
            Reintentar
          </button>
        </p>
      ) : null}

      {!lectura ? (
        <p className="fila-asignacion__meta">
          {a?.sprintOrigen === "JIRA" ? (
            <span className="chip-grupo" data-testid="chip-sprint-origen">
              Sprint de Jira
            </span>
          ) : null}
          {a?.sprintOrigen === "RESPALDO" ? (
            <span className="chip-grupo" data-testid="chip-sprint-respaldo">
              Sprint de respaldo
            </span>
          ) : null}
          {item.advertencias.includes("SPRINT_NO_ENCONTRADO") && celulaId ? (
            <span className="chip-advertencia" data-testid="aviso-sprint-no-encontrado">
              <span aria-hidden="true">!</span> {TEXTO_SPRINT_JIRA_AUSENTE}
            </span>
          ) : null}
          {item.avisoSinLider ? (
            <span className="mensaje-aviso" role="note" data-testid="aviso-sin-lider">
              <span aria-hidden="true">!</span> {TEXTO_SIN_LIDER}
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="fila-asignacion__pie">
        <span className={`estado-fila estado-fila--${estado.clase}`} data-testid="estado-fila">
          <span aria-hidden="true">{estado.glifo}</span> {estado.texto}
        </span>
        {conMarca && !lectura ? (
          <label className="fila-asignacion__marcar">
            <input
              type="checkbox"
              data-testid="casilla-marcar"
              checked={item.marcada}
              aria-disabled={!item.marcable && !item.marcada ? true : undefined}
              aria-describedby={motivoMarca ? `motivo-marcar-${sufijo}` : undefined}
              onChange={(e) => onAlternarMarca?.(e.target.checked)}
            />
            <span>Incluir en la confirmación</span>
            <span className="sr-only"> {codigo}</span>
          </label>
        ) : null}
        {conMarca && !lectura && motivoMarca && !item.marcada ? (
          <span id={`motivo-marcar-${sufijo}`} className={`campo-ayuda${mostrarMotivo && fila.motivoConfirmar === motivoMarca ? " sr-only" : ""}`} data-testid={`motivo-marcar-${codigo}`}>
            {fila.sinAnalistas && !item.marcable ? `${motivoMarca}. ${TEXTO_SIN_ANALISTAS}` : motivoMarca}
          </span>
        ) : null}
        {errores.marcada ? (
          <span className="campo-error" data-testid={`error-marcada-${codigo}`}>
            {errores.marcada}
          </span>
        ) : null}
        {!lectura ? (
          <span className="guardado-fila" data-testid={`guardado-fila-${codigo}`} aria-live="off">
            {ocupado ? "Guardando…" : fila.guardado ? "Guardado" : ""}
          </span>
        ) : null}
        {fila.fallo ? (
          <span className="guardado-fila guardado-fila--error" role="status">
            <span aria-hidden="true">✕</span> {TEXTO_NO_SE_PUDO_GUARDAR}{" "}
            <button type="button" className="boton boton--secundario" data-testid={`boton-reintentar-fila-${codigo}`} onClick={() => void fila.enviar(fila.fallo!)}>
              Reintentar
            </button>
          </span>
        ) : null}

        {creada ? (
          <span className="chip-creada" data-testid="chip-creada" data-qe={a?.qeResponsable?.nombre} data-analista={a?.analista?.nombre ?? ""}>
            <span aria-hidden="true">✓</span> Creada · {textoCreada(a?.qeResponsable?.nombre ?? "—", a?.analista?.nombre ?? "—")}
            {item.idHistoria ? (
              <>
                {" "}
                <Link to={`/hdu/${item.idHistoria}`} className="boton boton--secundario" data-testid="enlace-ir-a-hdu" aria-label={`Ir a la HDU ${codigo} en Quality360`}>
                  Ir a la HDU<span aria-hidden="true"> ↗</span>
                </Link>
              </>
            ) : null}
          </span>
        ) : null}

        {!lectura ? (
          <button
            type="button"
            className="boton boton--primario fila-asignacion__confirmar"
            data-testid="boton-confirmar-asignacion"
            data-origen={origen === "panel" ? "panel" : undefined}
            aria-disabled={!fila.confirmable || confirmando || fila.bloqueadoPorEspera || ocupado || undefined}
            aria-busy={confirmando || undefined}
            aria-describedby={mostrarMotivo ? idMotivoConfirmar : undefined}
            aria-label={confirmando ? undefined : `Confirmar asignación de ${codigo}`}
            onClick={() => void fila.confirmar()}
          >
            {confirmando ? "Confirmando…" : "Confirmar asignación"}
          </button>
        ) : null}
      </div>

      {mostrarMotivo ? (
        <p id={idMotivoConfirmar} className="campo-ayuda" data-testid={`motivo-confirmar-${codigo}`}>
          {fila.motivoConfirmar}
        </p>
      ) : null}

      {errorConfirmar?.tipo === "texto" || errorConfirmar?.tipo === "invalida" || errorConfirmar?.tipo === "red" ? (
        <p className="error-confirmar" role="alert" data-testid="error-confirmar-asignacion" data-codigo-error={errorConfirmar.codigo}>
          <span aria-hidden="true">✕</span> {errorConfirmar.texto}
          {errorConfirmar.tipo === "red" ? (
            <>
              {" "}
              <button type="button" className="boton boton--secundario" data-testid={`boton-reintentar-confirmacion-${codigo}`} onClick={() => void fila.confirmar()}>
                Reintentar
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {errorConfirmar?.tipo === "modificada" ? (
        <p className="error-confirmar" role="alert" data-testid="aviso-fila-modificada">
          <span aria-hidden="true">!</span> {errorConfirmar.texto}
        </p>
      ) : null}
      {errorConfirmar?.tipo === "en-curso" ? (
        <p className="error-confirmar" role="alert" data-testid="aviso-fila-en-curso">
          <span aria-hidden="true">!</span> {errorConfirmar.texto}
        </p>
      ) : null}
    </>
  );
}
