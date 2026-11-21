import { render, screen } from "@testing-library/react";
import css from "../styles/global.css?raw";
import { describe, expect, it } from "vitest";
import { TarjetaCelula } from "@/components/indicadores/TarjetaCelula";
import { TablaTendencia } from "@/components/indicadores/AlternativaTendencia";
import type { SemaforoCelula, SerieTendencia } from "@/types/dominio";

const celula = { celula: { id: "c1", nombre: "CEL-A" }, color: "VERDE", impedimentosAbiertos: 0, impedimentosEscalados: 0 } as unknown as SemaforoCelula;

describe("Accesibilidad del portal de indicadores (DEF-E6-01, 02, 03)", () => {
  it("aria-controls del botón apunta al id real del panel y no se declara sin panel [DEF-E6-01]", () => {
    const { rerender } = render(<TarjetaCelula celula={celula} seleccionada onVerDetalle={() => {}} />);
    expect(screen.getByRole("button", { name: /Ver HDU de CEL-A/ })).toHaveAttribute("aria-controls", "lista-drilldown-panel");
    rerender(<TarjetaCelula celula={celula} seleccionada={false} onVerDetalle={() => {}} />);
    expect(screen.getByRole("button", { name: /Ver HDU de CEL-A/ })).not.toHaveAttribute("aria-controls");
  });

  it("el contenedor de la tabla es enfocable, región con nombre [DEF-E6-02]", () => {
    const serie = { celula: { id: "c1", nombre: "CEL-A" }, sprint: { id: "s1", nombre: "S1" }, puntos: [{ fecha: "2026-01-01", cumplimiento: 50, hduTotal: 2 }] } as unknown as SerieTendencia;
    render(<TablaTendencia series={[serie]} />);
    const region = screen.getByRole("region", { name: /Tabla de cumplimiento por fecha/ });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toContainElement(screen.getByTestId("tabla-tendencia"));
  });

  it("el botón de peligro no queda sobre el fondo de error con el texto rojo claro [DEF-E6-03]", () => {
    const hover = /\.boton--peligro:hover:not\(:disabled\)\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(hover).toContain("var(--q360-color-error-fondo)");
    expect(hover).toMatch(/color:\s*#b91c1c/);
  });
});
