import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useImpedimentosHdu } from "@/api/impedimentos";
import { useAuth } from "@/auth/AuthContext";
import { ErrorApi } from "@/lib/httpClient";
import type { Impedimento, ImpedimentoDetalle, OperacionImpedimento, ResultadoAccionImpedimento } from "@/types/dominio";
import { BloqueDatos, type EstadoDatos } from "../bandeja/Estructura";
import { DialogoAccionImpedimento } from "./DialogoAccionImpedimento";
import { FormImpedimento } from "./FormImpedimento";
import { TarjetaImpedimento } from "./TarjetaImpedimento";

const TOPE_VISIBLE = 10;

interface Props {
  hduId: string;
  /** Id del impedimento a resaltar (`?impedimento=`, D78); si no está en la lista, se ignora sin aviso ni error. */
  resaltarId?: string | null;
}

function resumen(abiertos: number, escalados: number, resueltos: number): string {
  const partes: string[] = [];
  if (abiertos > 0) partes.push(`${abiertos} ${abiertos === 1 ? "abierto" : "abiertos"}`);
  if (escalados > 0) partes.push(`${escalados} ${escalados === 1 ? "escalado" : "escalados"}`);
  if (resueltos > 0) partes.push(`${resueltos} ${resueltos === 1 ? "resuelto" : "resueltos"}`);
  return partes.join(" · ");
}

function mensajeExito(operacion: OperacionImpedimento, r: ResultadoAccionImpedimento): string {
  switch (operacion) {
    case "RESOLVER":
      return r.hdu.bloqueada
        ? `Impedimento resuelto. La HDU sigue bloqueada por otros ${r.hdu.abiertos}.`
        : "Impedimento resuelto. La HDU ya no está bloqueada.";
    case "ESCALAR":
      return `Impedimento escalado a ${r.impedimento.responsable.nombre}. La HDU sigue bloqueada.`;
    case "REABRIR":
      return "Impedimento reabierto. La HDU volvió a quedar bloqueada.";
    default:
      return "Seguimiento guardado.";
  }
}

interface DialogoAbierto {
  operacion: OperacionImpedimento;
  impedimento: Impedimento;
}

/**
 * Sección «Impedimentos» del detalle de HDU (E4-F01, E4-F03): cabecera con resumen, botón de registro (solo si el
 * servidor lo permite, D75), tarjetas con sus acciones y los cuatro estados (cargando, vacío, error, indisponible),
 * sin afectar al resto del detalle (E4-F01-T09).
 */
export function SeccionImpedimentos({ hduId, resaltarId }: Props) {
  const consulta = useImpedimentosHdu(hduId);
  const { perfil } = useAuth();
  const queryClient = useQueryClient();
  const idTitulo = useId();
  const idFormulario = useId();
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [dialogo, setDialogo] = useState<DialogoAbierto | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  const datos = consulta.data;
  let estado: EstadoDatos = "ok";
  if (consulta.isError) estado = consulta.error instanceof ErrorApi && consulta.error.status === 503 ? "indisponible" : "error";
  else if (consulta.isLoading || !datos) estado = "cargando";
  else if (datos.items.length === 0) estado = "vacio";

  const hayResaltado = Boolean(resaltarId && datos?.items.some((i) => i.id === resaltarId));
  useEffect(() => {
    if (hayResaltado) document.getElementById(`impedimento-${resaltarId}`)?.scrollIntoView?.({ block: "center" });
  }, [hayResaltado, resaltarId]);

  function enfocarTitulo(id: string) {
    // El botón pulsado puede haber desaparecido (p. ej. «Resolver»): el foco vuelve al título de la tarjeta.
    setTimeout(() => document.getElementById(`titulo-impedimento-${id}`)?.focus(), 0);
  }

  function recargar() {
    void queryClient.invalidateQueries({ queryKey: ["impedimentos"] });
    void queryClient.invalidateQueries({ queryKey: ["riesgo"] });
  }

  function alRegistrar(impedimento: ImpedimentoDetalle) {
    setFormularioAbierto(false);
    setAviso(null);
    setExito("Impedimento registrado. La HDU quedó bloqueada.");
    enfocarTitulo(impedimento.id);
  }

  function alExito(resultado: ResultadoAccionImpedimento, operacion: OperacionImpedimento) {
    const id = dialogo?.impedimento.id;
    setDialogo(null);
    setAviso(null);
    setExito(mensajeExito(operacion, resultado));
    if (id) enfocarTitulo(id);
  }

  function alDesactualizar(mensaje: string) {
    const id = dialogo?.impedimento.id;
    setDialogo(null);
    setExito(null);
    setAviso(mensaje);
    recargar();
    if (id) enfocarTitulo(id);
  }

  const items = datos?.items ?? [];
  const visibles = verTodos ? items : items.slice(0, TOPE_VISIBLE);
  const rol = perfil?.rol;

  /** Nota de solo lectura (D39, D83): el portal usa el rol que informa el backend y los `permisos` del servidor. */
  let nota: { testId: string; contenido: React.ReactNode } | null = null;
  if (datos) {
    if (datos.hduCerrada) {
      nota = { testId: "nota-impedimentos-cerrada", contenido: "HDU cerrada: no admite nuevos impedimentos." };
    } else if (!datos.permisos.puedeGestionar) {
      if (rol === "ANALISTA_QA") {
        nota = { testId: "nota-impedimentos-solo-lectura", contenido: "Tu QE responsable gestiona los impedimentos (resolver, escalar y reabrir). Tú puedes registrar nuevos." };
      } else if (rol === "QE") {
        nota = { testId: "nota-impedimentos-solo-lectura", contenido: "Solo el QE responsable de la HDU gestiona los impedimentos. Tienes acceso de lectura." };
      } else if (rol === "ADMINISTRADOR") {
        nota = {
          testId: "nota-impedimentos-solo-lectura",
          contenido: (
            <>
              Solo el QE responsable gestiona los impedimentos. Si falta un QE, <a href="#asignacion">reasígnalo desde esta pantalla</a>.
            </>
          ),
        };
      }
    }
  }

  return (
    <section className="panel" id="impedimentos" aria-labelledby={idTitulo} data-testid="seccion-impedimentos" aria-busy={estado === "cargando"}>
      <div className="panel-cabecera">
        <div>
          <h2 id={idTitulo}>Impedimentos</h2>
          {datos && items.length > 0 ? (
            <p data-testid="resumen-impedimentos">{resumen(datos.abiertos, datos.escalados, datos.resueltos)}</p>
          ) : null}
        </div>
        {datos?.permisos.puedeRegistrar ? (
          <button
            type="button"
            className="boton boton--primario boton-registrar"
            data-testid="boton-registrar-impedimento"
            aria-expanded={formularioAbierto}
            aria-controls={idFormulario}
            onClick={() => {
              setExito(null);
              setAviso(null);
              setFormularioAbierto((v) => !v);
            }}
          >
            + Registrar impedimento
          </button>
        ) : null}
      </div>

      {exito ? (
        <p className="mensaje-exito" role="status" data-testid="mensaje-exito-impedimento">
          <span>{exito}</span>
          <button type="button" className="boton--enlace" aria-label="Cerrar mensaje" onClick={() => setExito(null)}>
            ×
          </button>
        </p>
      ) : null}
      {aviso ? (
        <p className="mensaje-aviso" role="status" data-testid="aviso-impedimento">
          {aviso}
        </p>
      ) : null}

      <div id={idFormulario}>
        {formularioAbierto && datos?.permisos.puedeRegistrar ? (
          <FormImpedimento
            hduId={hduId}
            onCancelar={() => setFormularioAbierto(false)}
            onRegistrado={alRegistrar}
            onSinPermiso={() => {
              setFormularioAbierto(false);
              recargar();
            }}
          />
        ) : null}
      </div>

      <BloqueDatos
        clave="impedimentos-hdu"
        estado={estado}
        mensajeVacio="Esta HDU no tiene impedimentos registrados"
        mensajeIndisponible="No disponible"
        onReintentar={() => consulta.refetch()}
      >
        <ul className="lista-impedimentos" data-testid="lista-impedimentos-hdu">
          {visibles.map((i) => (
            <TarjetaImpedimento
              key={i.id}
              impedimento={i}
              resaltado={i.id === resaltarId}
              onOperacion={(operacion, impedimento) => {
                setExito(null);
                setAviso(null);
                setDialogo({ operacion, impedimento });
              }}
            />
          ))}
        </ul>
        {items.length > TOPE_VISIBLE && !verTodos ? (
          <p>
            <button type="button" className="boton boton--secundario" data-testid="boton-ver-mas-impedimentos" onClick={() => setVerTodos(true)}>
              Mostrar más ({items.length - TOPE_VISIBLE})
            </button>
          </p>
        ) : null}
      </BloqueDatos>

      {nota ? (
        <p className="nota-impedimentos" role="note" data-testid={nota.testId}>
          {nota.contenido}
        </p>
      ) : null}

      {dialogo ? (
        <DialogoAccionImpedimento
          key={`${dialogo.operacion}-${dialogo.impedimento.id}`}
          operacion={dialogo.operacion}
          impedimento={dialogo.impedimento}
          hduId={hduId}
          onCerrar={() => setDialogo(null)}
          onExito={alExito}
          onDesactualizado={alDesactualizar}
        />
      ) : null}
    </section>
  );
}
