import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { aQueryApi } from "@/api/bandejas";
import { BloqueEstado } from "@/components/BloqueEstado";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";
import { BloqueDatos } from "@/components/bandeja/Estructura";
import { Paginacion } from "@/components/bandeja/Paginacion";
import { TablaBandeja } from "@/components/bandeja/TablaBandeja";
import { describirCambios } from "@/lib/cambiosSeguros";
import { leerOrden, type FiltrosUrl } from "@/lib/filtrosUrl";
import { abrirComo } from "./renderApp";
import { ID } from "@/mocks/data";

function filtrosDe(consulta: string, extra: Partial<FiltrosUrl> = {}): FiltrosUrl {
  const params = new URLSearchParams(consulta);
  return {
    params,
    get: (k: string) => params.get(k) ?? "",
    set: () => undefined,
    limpiar: () => undefined,
    orden: leerOrden(params.get("orden")),
    pagina: Number(params.get("pagina")) || 1,
    tamano: Number(params.get("tamano")) || 25,
    ...extra,
  } as FiltrosUrl;
}

describe("Cuatro estados de un bloque (D34)", () => {
  it("un contador indisponible dice «No disponible» y nunca 0", () => {
    render(<TarjetaMetrica id="x" clave="x" titulo="Contador" estado="indisponible" mensajeIndisponible="No disponible" />);
    const tarjeta = screen.getByTestId("tarjeta-x");
    expect(tarjeta).toHaveTextContent("No disponible");
    expect(tarjeta).not.toHaveTextContent("0");
    expect(screen.getByTestId("estado-indisponible-x")).toBeInTheDocument();
  });

  it("un contador ok en 0 es un dato válido; con valor > 0 y atención dice «Requiere atención»", () => {
    const { rerender } = render(<TarjetaMetrica id="x" clave="x" titulo="C" estado="ok" valor={0} atencion />);
    expect(screen.getByTestId("contador-x")).toHaveTextContent("0");
    expect(screen.queryByText(/Requiere atención/)).not.toBeInTheDocument();
    rerender(<TarjetaMetrica id="x" clave="x" titulo="C" estado="ok" valor={3} atencion />);
    expect(screen.getByText(/Requiere atención/)).toBeInTheDocument();
  });

  it("vacío e indisponible son bloques distintos; indisponible ofrece «Reintentar»", async () => {
    const reintentar = vi.fn();
    const { rerender } = render(
      <BloqueDatos clave="mis-hdu" estado="vacio" mensajeVacio="No tienes HDU asignadas">
        <p>contenido</p>
      </BloqueDatos>,
    );
    expect(screen.getByTestId("estado-vacio-mis-hdu")).toHaveTextContent("No tienes HDU asignadas");
    expect(screen.getByTestId("bloque-lista-mis-hdu-vacio")).toBeInTheDocument();
    rerender(
      <BloqueDatos clave="mis-hdu" estado="indisponible" onReintentar={reintentar}>
        <p>contenido</p>
      </BloqueDatos>,
    );
    expect(screen.queryByTestId("estado-vacio-mis-hdu")).not.toBeInTheDocument();
    expect(screen.getByTestId("estado-indisponible-mis-hdu")).toHaveTextContent("No disponible");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledOnce();
  });

  it("el texto certificado del indisponible por defecto no cambia", () => {
    render(<BloqueEstado id="hdu-qe" estado="indisponible" />);
    expect(screen.getByTestId("bloque-hdu-qe-indisponible")).toHaveTextContent("Esta información no está disponible en este momento.");
  });
});

describe("DialogoConfirmacion accesible", () => {
  function Prueba({ cerrarAlClicFuera = true }: { cerrarAlClicFuera?: boolean }) {
    const [abierto, setAbierto] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setAbierto(true)}>
          Abrir
        </button>
        <DialogoConfirmacion
          abierto={abierto}
          titulo="Título"
          cerrarAlClicFuera={cerrarAlClicFuera}
          onConfirmar={() => setAbierto(false)}
          onCancelar={() => setAbierto(false)}
        >
          <input aria-label="Campo" />
        </DialogoConfirmacion>
      </>
    );
  }

  it("Esc cierra, el foco entra al primer control, se atrapa con Tab y vuelve al botón que lo abrió", async () => {
    const user = userEvent.setup();
    render(<Prueba />);
    const abrir = screen.getByRole("button", { name: "Abrir" });
    await user.click(abrir);
    const dialogo = screen.getByRole("dialog", { name: "Título" });
    expect(within(dialogo).getByLabelText("Campo")).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(within(dialogo).getByRole("button", { name: "Confirmar" })).toHaveFocus();
    await user.tab();
    expect(within(dialogo).getByLabelText("Campo")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
  });

  it("con cambios sin guardar un clic en el fondo no cierra", async () => {
    const user = userEvent.setup();
    const { container } = render(<Prueba cerrarAlClicFuera={false} />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.click(container.querySelector(".capa-dialogo")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Conversión de la URL del portal a parámetros del API (D49)", () => {
  const claves = ["estado", "celula", "sprint", "solo-obs", "q"];
  const idValido = "a1000000-0000-4000-8000-000000000001";

  it("traduce celula/sprint/tamano y descarta lo inválido sin error", () => {
    const f = filtrosDe(`estado=EN_EJECUCION&celula=${idValido}&sprint=basura&solo-obs=1&q=a&tamano=500&pagina=2`);
    const query = new URLSearchParams(aQueryApi(f, { claves, ordenables: ["codigo"] }));
    expect(query.get("estado")).toBe("EN_EJECUCION");
    expect(query.get("celulaId")).toBe(idValido);
    expect(query.has("sprintId")).toBe(false);
    expect(query.get("soloConObservaciones")).toBe("true");
    expect(query.has("q")).toBe(false); // mínimo 2 caracteres
    expect(query.get("tamanoPagina")).toBe("100"); // recortado a 100
    expect(query.get("pagina")).toBe("2");
  });

  it("un estado inválido o una columna de orden desconocida se ignoran", () => {
    const query = aQueryApi(filtrosDe("estado=XYZ&orden=nada:asc"), { claves, ordenables: ["codigo"] });
    expect(query).toBe("");
  });

  it("el orden válido pasa tal cual y las exportaciones no paginan", () => {
    expect(aQueryApi(filtrosDe("orden=codigo:desc&pagina=3"), { claves, ordenables: ["codigo"] })).toBe("?orden=codigo%3Adesc&pagina=3");
    expect(aQueryApi(filtrosDe("pagina=3&q=ab"), { claves, paginar: false })).toBe("?q=ab");
  });
});

describe("Paginación y tabla", () => {
  it("Paginacion muestra el rango, deshabilita los extremos y oculta el selector con pocas filas", () => {
    render(<Paginacion clave="x" etiqueta="x" total={6} pagina={1} tamano={25} onPagina={() => undefined} onTamano={() => undefined} />);
    expect(screen.getByTestId("paginacion-x")).toHaveTextContent("Mostrando 1–6 de 6");
    expect(screen.getByTestId("pagina-anterior-x")).toBeDisabled();
    expect(screen.getByTestId("pagina-siguiente-x")).toBeDisabled();
    expect(screen.queryByTestId("selector-tamano-x")).not.toBeInTheDocument();
  });

  it("TablaBandeja: encabezado ordenable con aria-sort y botón type=button", async () => {
    const onOrden = vi.fn();
    render(
      <MemoryRouter>
        <TablaBandeja
          testId="t"
          caption="Prueba"
          columnas={[{ id: "codigo", titulo: "Código", ordenable: true, render: (i: { c: string }) => i.c }, { id: "x", titulo: "X", render: () => "x" }]}
          items={[{ c: "H1" }]}
          clave={(i) => i.c}
          orden={{ columna: "codigo", direccion: "asc" }}
          onOrden={onOrden}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("columnheader", { name: /Código/ })).toHaveAttribute("aria-sort", "ascending");
    const boton = within(screen.getByRole("columnheader", { name: /Código/ })).getByRole("button");
    expect(boton).toHaveAttribute("type", "button");
    await userEvent.click(boton);
    expect(onOrden).toHaveBeenCalledWith("codigo", "desc");
    expect(screen.getByRole("columnheader", { name: "X" })).not.toHaveAttribute("aria-sort");
  });
});

describe("describirCambios: lenguaje natural sin claves sensibles", () => {
  it("describe solo campos de la lista blanca y nunca password, token ni secret", () => {
    const lineas = describirCambios({ rol: "ANALISTA_QA", password: "x" }, { rol: "LIDER_QA", accessToken: "y", client_secret: "z", otro: 1 });
    expect(lineas).toEqual(["Rol: Analista QA → Líder QA"]);
  });
});

describe("Supervisión: preselección por URL (D44)", () => {
  it("?analista=<id> preselecciona al analista y ?qe=<id> al QE", async () => {
    await abrirComo("admin@quality360.local", `/admin/supervision?analista=${ID.qa2}&qe=${ID.qe2}`);
    const analista = await screen.findByLabelText("Analista QA");
    await screen.findByRole("option", { name: "Ana Pérez" });
    expect(analista).toHaveValue(ID.qa2);
    expect(screen.getByLabelText("QE supervisor")).toHaveValue(ID.qe2);
    expect(screen.getByTestId("relacion-vigente-supervision")).toHaveTextContent("Sin supervisor asignado");
  });

  it("un id inexistente muestra un aviso, nunca un error", async () => {
    await abrirComo("admin@quality360.local", "/admin/supervision?analista=00000000-0000-4000-8000-000000000999");
    expect(await screen.findByTestId("aviso-preseleccion")).toHaveTextContent("No encontramos al analista indicado");
  });
});
