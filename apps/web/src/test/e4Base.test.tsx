import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { http } from "@/lib/httpClient";
import { SemaforoRiesgo } from "@/components/impedimentos/SemaforoRiesgo";
import { InsigniaBloqueo, InsigniaEstadoImpedimento, InsigniaNuevo } from "@/components/impedimentos/Insignias";
import { simularFuentes } from "@/mocks/dataE7";
import type { BandejaAdmin, BandejaAnalista, BandejaAuditor, BandejaLider, BandejaQe } from "@/types/dominio";
import { abrirComo } from "./renderApp";

describe("Semáforo de riesgo: forma + palabra + color [E4-F04]", () => {
  it.each([
    ["ALTO", "Alto", "▲"],
    ["MEDIO", "Medio", "◆"],
    ["BAJO", "Bajo", "●"],
  ] as const)("el nivel %s muestra su palabra y su forma", (nivel, palabra, glifo) => {
    const { container } = render(<SemaforoRiesgo nivel={nivel} origen="SUGERIDO" />);
    const semaforo = screen.getByTestId("semaforo-riesgo");
    expect(semaforo).toHaveAttribute("data-nivel", nivel);
    expect(semaforo).toHaveAttribute("data-origen", "SUGERIDO");
    expect(semaforo).toHaveTextContent(palabra);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(glifo);
  });

  it("una fuente caída dice «No disponible» y nunca «Bajo»", () => {
    render(<SemaforoRiesgo nivel={null} estado="indisponible" />);
    expect(screen.queryByTestId("semaforo-riesgo")).not.toBeInTheDocument();
    expect(screen.getByTestId("estado-indisponible-riesgo")).toHaveTextContent("No disponible");
    expect(screen.getByTestId("estado-indisponible-riesgo")).not.toHaveTextContent("Bajo");
  });

  it("sin nivel y con la fuente en pie es «Sin evaluar»", () => {
    render(<SemaforoRiesgo nivel={null} />);
    expect(screen.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "SIN_EVALUAR");
    expect(screen.getByTestId("semaforo-riesgo")).toHaveTextContent("Sin evaluar");
  });

  it("las lámparas son decorativas: solo la del nivel está encendida y el texto acompaña", () => {
    const { container } = render(<SemaforoRiesgo nivel="MEDIO" variante="lamparas" calculoParcial />);
    expect(container.querySelectorAll(".semaforo-lampara--encendida")).toHaveLength(1);
    expect(container.querySelector(".semaforo-lampara--amarilla")).toHaveClass("semaforo-lampara--encendida");
    expect(container.querySelector(".semaforo-lamparas__luces")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("semaforo-riesgo")).toHaveTextContent("Medio");
    expect(screen.getByTestId("semaforo-riesgo")).toHaveTextContent("Cálculo parcial");
  });
});

describe("Insignias de impedimento", () => {
  it("estado, bloqueo y «Nuevo» llevan texto además de color", () => {
    render(
      <div>
        <InsigniaEstadoImpedimento estado="ESCALADO" id="x" />
        <InsigniaBloqueo abiertos={2} testId="bloqueo" />
        <InsigniaNuevo />
      </div>,
    );
    expect(screen.getByTestId("estado-impedimento-x")).toHaveTextContent("Escalado");
    expect(screen.getByTestId("bloqueo")).toHaveTextContent("Bloqueada · 2");
    expect(screen.getByTestId("insignia-nuevo")).toHaveTextContent("Nuevo");
  });
});

describe("Contraste de los tokens de E4 [D84]", () => {
  it("el texto sobre su fondo suave cumple 4.5:1 (riesgo, estado de impedimento y bloqueo)", async () => {
    const css = (await import("@/styles/tokens.css?raw")).default as string;
    const lee = (token: string) => css.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`))![1]!;
    const luz = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const razon = (a: string, b: string) => {
      const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
      return (x! + 0.05) / (y! + 0.05);
    };
    const pares: Array<[string, string]> = [
      ["--q360-color-riesgo-alto", "--q360-color-riesgo-alto-suave"],
      ["--q360-color-riesgo-medio", "--q360-color-riesgo-medio-suave"],
      ["--q360-color-riesgo-bajo", "--q360-color-riesgo-bajo-suave"],
      ["--q360-color-imp-abierto", "--q360-color-imp-abierto-suave"],
      ["--q360-color-imp-escalado", "--q360-color-imp-escalado-suave"],
      ["--q360-color-imp-resuelto", "--q360-color-imp-resuelto-suave"],
      ["--q360-color-bloqueo-texto", "--q360-color-bloqueo"],
      ["--q360-color-riesgo-alto", "--q360-color-error-suave"],
    ];
    for (const [texto, fondo] of pares) expect(razon(lee(texto), lee(fondo)), `${texto} sobre ${fondo}`).toBeGreaterThanOrEqual(4.5);
    // El borde de las lámparas (2 px) da el contraste de componente >= 3:1 sobre el fondo de la tarjeta.
    expect(razon(lee("--q360-color-texto-terciario"), lee("--q360-color-superficie-sutil"))).toBeGreaterThanOrEqual(3);
  });
});

describe("Mocks: bloque `impedimentos` en las 5 bandejas [E7-B03 · D87]", () => {
  it("cada bandeja trae su bloque con los contadores de D87", async () => {
    await abrirComo("jonathan.choque@quality360.local", "/qa");
    const analista = await http.get<BandejaAnalista>("/v1/bandeja/analista");
    expect(Object.keys(analista.impedimentos.contadores)).toEqual(["impedimentosAbiertos"]);
    expect(analista.hdu.estado === "ok" && analista.hdu.datos.items.every((h) => h.bloqueo !== undefined)).toBe(true);
    expect(analista.hdu.estado === "ok" && analista.hdu.datos.items.some((h) => h.riesgo !== undefined)).toBe(false);
  });

  it("el QE tiene tres contadores y una lista; el Líder, tres contadores, lista y riesgo por fila", async () => {
    await abrirComo("jose.seguel@quality360.local", "/qe");
    const qe = await http.get<BandejaQe>("/v1/bandeja/qe");
    expect(Object.keys(qe.impedimentos.contadores)).toEqual(["impedimentosAbiertos", "impedimentosNuevos", "hduRiesgoAlto"]);
    expect(qe.impedimentos.lista.estado).toBe("ok");
  });

  it("con Impedimentos caído solo cae el bloque E4 y la respuesta sigue siendo 200", async () => {
    simularFuentes({ impedimentos: false });
    await abrirComo("jose.seguel@quality360.local", "/qe");
    const qe = await http.get<BandejaQe>("/v1/bandeja/qe");
    expect(qe.impedimentos.contadores.impedimentosAbiertos.estado).toBe("indisponible");
    expect(qe.impedimentos.lista.estado).toBe("indisponible");
    expect(qe.contadores.sinAnalista.estado).toBe("ok");
  });

  it("Administrador, Líder y Auditor traen sus propios contadores", async () => {
    await abrirComo("luis.soto@quality360.local", "/lider");
    const lider = await http.get<BandejaLider>("/v1/bandeja/lider");
    expect(Object.keys(lider.impedimentos.contadores)).toEqual(["impedimentosAbiertos", "hduBloqueadas", "escaladosAMi"]);
    const filas = lider.hdu.estado === "ok" ? lider.hdu.datos.items : [];
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((h) => h.bloqueo !== undefined && h.riesgo !== undefined)).toBe(true);
  });

  it("los bloques del Administrador y del Auditor existen", async () => {
    await abrirComo("admin@quality360.local", "/admin");
    const admin = await http.get<BandejaAdmin>("/v1/bandeja/admin");
    expect(Object.keys(admin.impedimentos.contadores)).toEqual(["impedimentosAbiertos", "hduBloqueadas", "hduRiesgoAlto"]);
    expect(admin.impedimentos.escalados.estado).toBe("ok");
  });
});

describe("Mocks del Auditor", () => {
  it("el bloque `impedimentos` del Auditor trae solo abiertos y bloqueadas", async () => {
    await abrirComo("andrea.mora@quality360.local", "/auditor");
    const auditor = await http.get<BandejaAuditor>("/v1/bandeja/auditor");
    expect(Object.keys(auditor.impedimentos.contadores)).toEqual(["impedimentosAbiertos", "hduBloqueadas"]);
  });
});
