import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { guardarRolConocido, leerRolConocido } from "@/auth/rolConocido";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { describirCambios, describirValor } from "@/lib/cambiosSeguros";
import { env } from "@/lib/env";
import { ID } from "@/mocks/data";
import { server } from "@/mocks/server";
import { abrirComo, iniciarSesionUi, renderApp } from "./renderApp";

const ADMIN = "admin@quality360.local";
const QE = "jose.seguel@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";

describe("DEF-07 · tablas accesibles", () => {
  interface Fila {
    id: string;
    nombre: string;
  }
  const columnas: Columna<Fila>[] = [{ id: "nombre", titulo: "Nombre", render: (f) => f.nombre }];

  function tabla(pagina: number) {
    return (
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <TablaBandeja testId="lista-prueba" caption="Filas de prueba" columnas={columnas} items={[{ id: "1", nombre: "Uno" }]} clave={(f) => f.id} focoPagina={pagina} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("no hay <caption> ni tabindex dentro de la tabla; el nombre viene de un encabezado externo [DEF-07]", () => {
    const { container } = render(tabla(1));
    const t = screen.getByTestId("lista-prueba");
    expect(t.querySelector("caption")).toBeNull();
    expect(t.querySelector("[tabindex]")).toBeNull();
    expect(container.querySelector("table [tabindex]")).toBeNull();
    expect(screen.getByRole("table", { name: "Filas de prueba" })).toBe(t);
  });

  it("al cambiar de página el foco pasa al encabezado que nombra la tabla, fuera de ella [DEF-07]", () => {
    const { rerender } = render(tabla(1));
    rerender(tabla(2));
    const titulo = screen.getByRole("heading", { name: "Filas de prueba" });
    expect(titulo).toHaveFocus();
    expect(screen.getByTestId("lista-prueba")).not.toContainElement(titulo);
  });

  it("la barra de progreso del detalle de HDU tiene nombre accesible [DEF-07]", async () => {
    await abrirComo(AUDITOR, `/hdu/${ID.hdu1}`);
    const barra = await screen.findByRole("progressbar", { name: "Avance del checklist" });
    expect(barra).toHaveAttribute("aria-valuetext", expect.stringMatching(/% de cumplimiento/));
  });

  it("el contraste del texto secundario cumple 4.5:1 sobre el fondo [DEF-06]", async () => {
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
    for (const fondo of ["--q360-color-fondo", "--q360-color-superficie", "--q360-color-superficie-sutil", "--q360-color-acento-suave"]) {
      expect(razon(lee("--q360-color-texto-secundario"), lee(fondo))).toBeGreaterThanOrEqual(4.5);
    }
    expect(razon(lee("--q360-color-acento"), lee("--q360-color-fondo"))).toBeGreaterThanOrEqual(4.5);
    const global = (await import("@/styles/global.css?raw")).default as string;
    const badge = global.match(/\.badge-estado\s*{\s*color:\s*(#[0-9a-fA-F]{6})/)![1]!;
    expect(razon(badge, lee("--q360-color-acento-suave"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("DEF-03 · rol cambiado al recargar la URL antigua (D56)", () => {
  async function iniciarComoQe() {
    renderApp("/login");
    await iniciarSesionUi(QE);
    await screen.findByRole("navigation", { name: "Portal" });
    cleanup();
  }

  it("si /qa fue un portal suyo (el último rol conocido era Analista), lleva a /qe con el aviso en vez de «acceso denegado»", async () => {
    await iniciarComoQe();
    guardarRolConocido(ID.qe1, "ANALISTA_QA");
    renderApp("/qa");
    expect(await screen.findByTestId("bandeja-qe")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-rol-cambio")).toHaveTextContent("Tu rol cambió");
    expect(screen.queryByTestId("acceso-denegado")).not.toBeInTheDocument();
    // Pista consumida: queda el rol nuevo.
    expect(leerRolConocido(ID.qe1)).toBe("QE");
  });

  it("si el portal nunca fue suyo, sigue el acceso denegado en la URL pedida (D41)", async () => {
    await iniciarComoQe();
    guardarRolConocido(ID.qe1, "ANALISTA_QA");
    renderApp("/admin/usuarios");
    expect(await screen.findByTestId("bandeja-qe")).toBeInTheDocument();
    cleanup();
    // Segunda carga: ya no hay discrepancia, así que /qa (portal que fue suyo) es ajeno hoy.
    renderApp("/qa");
    expect(await screen.findByTestId("acceso-denegado")).toHaveTextContent("No tienes acceso a esta sección");
  });

  it("sin pista previa (primera carga) un portal ajeno da acceso denegado", async () => {
    await iniciarComoQe();
    sessionStorage.clear();
    renderApp("/qa");
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
  });

  it("cerrar sesión borra la pista del rol", async () => {
    await abrirComo(QE, "/qe");
    guardarRolConocido(ID.qe1, "QE");
    await userEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
    await screen.findByRole("heading", { name: "Inicia sesión" });
    expect(leerRolConocido(ID.qe1)).toBeNull();
  });
});

describe("DEF-04 · filtros HDU y Actor de la bitácora no dependen de la página cargada", () => {
  it("el filtro HDU lista todas las HDU del catálogo y se puede acotar por texto [DEF-04]", async () => {
    const user = userEvent.setup();
    await abrirComo(AUDITOR, "/auditor/bitacora");
    const filtro = await screen.findByTestId("filtro-hdu");
    await screen.findByTestId("lista-bitacora");
    // TARJETAS-3005 no tiene eventos en la bitácora, pero es una HDU que existe.
    await within(filtro).findByRole("option", { name: "TARJETAS-3005" });
    expect(within(filtro).getAllByRole("option").length).toBeGreaterThanOrEqual(7);

    await user.type(screen.getByTestId("filtro-hdu-buscar"), "tarjetas");
    expect(within(filtro).getAllByRole("option").map((o) => o.textContent)).toEqual(["Todos", "TARJETAS-3005"]);
    await user.clear(screen.getByTestId("filtro-hdu-buscar"));
    await user.type(screen.getByTestId("filtro-hdu-buscar"), "zzz");
    expect(await screen.findByTestId("filtro-hdu-sin-coincidencias")).toBeInTheDocument();
  });

  it("el filtro Actor incluye QE y analistas de todas las HDU, no solo de las filas cargadas [DEF-04]", async () => {
    await abrirComo(AUDITOR, "/auditor/bitacora");
    const filtro = await screen.findByTestId("filtro-actor");
    await within(filtro).findByRole("option", { name: "Jose Seguel" });
    expect(within(filtro).getAllByRole("option").length).toBeGreaterThan(3);
  });

  it("recorre el catálogo por páginas de 100 hasta cubrir el total", async () => {
    const paginasPedidas: string[] = [];
    const hdu = (n: number) => ({
      id: `d4000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      codigo: `E7-H${n}`,
      titulo: `HDU ${n}`,
      celula: { id: ID.celPagos, nombre: "Pagos" },
      sprint: { id: ID.sprint19, nombre: "Sprint 19" },
      prioridad: "MEDIA",
      estado: "PENDIENTE",
      qeResponsable: { id: ID.qe1, nombre: "Jose Seguel" },
      analista: null,
      actualizadoEn: "2026-10-20T10:00:00Z",
      seguimiento: { fuente: "certificaciones.checklist", estado: "ok", datos: { porcentaje: 0 } },
    });
    server.use(
      http.get(`${env.gatewayUrl}/v1/bandeja/auditor`, ({ request }) => {
        const url = new URL(request.url);
        const pagina = Number(url.searchParams.get("pagina") ?? 1);
        paginasPedidas.push(url.search);
        const items = pagina === 1 ? Array.from({ length: 100 }, (_, i) => hdu(i + 1)) : [hdu(101), hdu(102)];
        const cont = { fuente: "organizacion.hdu", estado: "ok", datos: { valor: 102 } };
        return HttpResponse.json({
          rol: "AUDITOR",
          generadaEn: "2026-10-21T10:00:00Z",
          contadores: { hduTotal: cont, certificados: cont, eventos7d: cont, cambiosUsuarios7d: cont },
          hdu: { fuente: "organizacion.hdu", estado: "ok", datos: { items, total: 102, pagina, tamanoPagina: 100, orden: "codigo:asc" } },
        });
      }),
    );
    await abrirComo(AUDITOR, "/auditor/bitacora");
    const filtro = await screen.findByTestId("filtro-hdu");
    await within(filtro).findByRole("option", { name: "E7-H102" });
    expect(paginasPedidas.some((p) => p.includes("pagina=2") && p.includes("tamanoPagina=100"))).toBe(true);
  });
});

describe("DEF-05 · auditoría y bitácora sin «…»", () => {
  it("las células se muestran por nombre y el vacío como «sin células»", () => {
    const lineas = describirCambios(
      { celulas: [{ id: "1", nombre: "Pagos" }, { id: "2", nombre: "Clientes" }] },
      { celulas: [] },
    );
    expect(lineas).toEqual(["Células: Pagos, Clientes → sin células"]);
    expect(describirCambios({ celulas: [] }, { celulas: [{ id: "3", nombre: "Tarjetas" }] })).toEqual(["Células: sin células → Tarjetas"]);
  });

  it("los valores anidados de la bitácora (evidencia) se describen y no exponen claves sensibles", () => {
    const texto = describirValor({ estado: "ENTREGADO", evidencia: { tipo: "ENLACE", url: "https://x.test/a", token: "secreto" } });
    expect(texto).toBe("estado: ENTREGADO, evidencia: tipo: ENLACE; url: https://x.test/a");
    expect(texto).not.toContain("…");
    expect(texto).not.toContain("secreto");
  });
});

describe("DEF-08 · ?usuario=<id> fuera de la página 1", () => {
  it("destaca la fila arriba de la tabla aunque la lista no la incluya [DEF-08]", async () => {
    server.use(
      http.get(`${env.gatewayUrl}/v1/usuarios`, ({ request }) => {
        const url = new URL(request.url);
        if (url.pathname !== "/v1/usuarios") return undefined;
        return HttpResponse.json({
          items: [
            {
              id: ID.qe1,
              nombre: "Jose Seguel",
              correo: "jose.seguel@quality360.local",
              rol: "QE",
              activo: true,
              celulasVigentes: [],
              creadoEn: "2026-01-08T09:00:00Z",
              actualizadoEn: "2026-01-08T09:00:00Z",
            },
          ],
          total: 40,
          pagina: 1,
          tamanoPagina: 25,
        });
      }),
    );
    await abrirComo(ADMIN, `/admin/usuarios?usuario=${ID.lider1}`);
    const fila = await screen.findByTestId(`fila-usuario-${ID.lider1}`);
    expect(fila).toHaveAttribute("aria-current", "true");
    expect(within(fila).getByTestId("usuario-fuera-de-pagina")).toBeInTheDocument();
    // Está antes que las filas de la página.
    const filas = screen.getAllByTestId(/^fila-usuario-/);
    expect(filas[0]).toBe(fila);
    expect(screen.getByTestId(`fila-usuario-${ID.qe1}`)).not.toHaveAttribute("aria-current");
  });

  it("si el usuario ya está en la página, no se duplica", async () => {
    await abrirComo(ADMIN, `/admin/usuarios?usuario=${ID.lider1}`);
    await screen.findByTestId(`fila-usuario-${ID.lider1}`);
    expect(screen.getAllByTestId(`fila-usuario-${ID.lider1}`)).toHaveLength(1);
    expect(screen.queryByTestId("usuario-fuera-de-pagina")).not.toBeInTheDocument();
  });
});

describe("DEF-10 · pendientes del Administrador con total y paginación", () => {
  function pendientes(): Array<Record<string, unknown>> {
    const usuario = (n: number) => ({ id: `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, nombre: `Analista ${String(n).padStart(2, "0")}`, correo: `a${n}@q.local`, rol: "ANALISTA_QA" });
    return [
      ...Array.from({ length: 28 }, (_, i) => ({ tipo: "ANALISTA_SIN_QE", usuario: usuario(i + 1), celula: null })),
      { tipo: "LIDER_SIN_CELULAS", usuario: { ...usuario(99), nombre: "Líder Sin Celdas", rol: "LIDER_QA" }, celula: null },
      { tipo: "CELULA_SIN_LIDER", usuario: null, celula: { id: ID.celPagos, nombre: "Pagos" } },
    ];
  }

  it("informa el total, pagina y alcanza «Líder sin células» y «Célula sin líder» [DEF-10]", async () => {
    const todos = pendientes();
    const valor = (v: number) => ({ fuente: "organizacion.usuarios", estado: "ok", datos: { valor: v } });
    server.use(
      http.get(`${env.gatewayUrl}/v1/bandeja/admin`, ({ request }) => {
        const url = new URL(request.url);
        const pagina = Number(url.searchParams.get("pagina") ?? 1);
        const tamano = Number(url.searchParams.get("tamanoPagina") ?? 25);
        return HttpResponse.json({
          rol: "ADMINISTRADOR",
          generadaEn: "2026-10-21T10:00:00Z",
          contadores: {
            usuariosActivos: { fuente: "organizacion.usuarios", estado: "ok", datos: { valor: 1, porRol: { ADMINISTRADOR: 1, QE: 0, ANALISTA_QA: 0, LIDER_QA: 0, AUDITOR: 0 } } },
            usuariosInactivos: valor(0),
            analistasSinQe: valor(28),
            qeSinAnalistas: valor(0),
            lideresSinCelulas: valor(1),
            celulasSinLider: valor(1),
            hduTotal: valor(0),
          },
          pendientes: {
            fuente: "organizacion.usuarios",
            estado: "ok",
            datos: { items: todos.slice((pagina - 1) * tamano, pagina * tamano), total: todos.length, pagina, tamanoPagina: tamano },
          },
          ultimosCambios: { fuente: "organizacion.auditoria", estado: "ok", datos: { items: [] } },
        });
      }),
    );
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin");
    const lista = await screen.findByTestId("lista-pendientes");
    expect(screen.getByTestId("total-pendientes")).toHaveTextContent("30 pendientes en total");
    expect(within(lista).getAllByRole("row")).toHaveLength(26); // encabezado + 25
    expect(screen.getByTestId("paginacion-pendientes")).toHaveTextContent("Mostrando 1–25 de 30");
    expect(within(lista).queryByText("Célula sin líder")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("pagina-siguiente-pendientes"));
    expect(await within(await screen.findByTestId("lista-pendientes")).findByText("Célula sin líder")).toBeInTheDocument();
    expect(within(screen.getByTestId("lista-pendientes")).getByText("Líder sin células")).toBeInTheDocument();
    expect(screen.getByTestId("paginacion-pendientes")).toHaveTextContent("Mostrando 26–30 de 30");
  });

  it("con pocos pendientes muestra el total y no la paginación", async () => {
    await abrirComo(ADMIN, "/admin");
    await screen.findByTestId("lista-pendientes");
    expect(screen.getByTestId("total-pendientes")).toBeInTheDocument();
    expect(screen.queryByTestId("paginacion-pendientes")).not.toBeInTheDocument();
  });
});
