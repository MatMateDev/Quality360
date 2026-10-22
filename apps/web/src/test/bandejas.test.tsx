import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { ID } from "@/mocks/data";
import { simularFuentes } from "@/mocks/dataE7";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const ANALISTA = "jonathan.choque@quality360.local";
const ANALISTA_SIN_HDU = "ana.perez@quality360.local";
const QE = "jose.seguel@quality360.local";
const QE_SIN_EQUIPO = "constanza.diaz@quality360.local";
const LIDER = "luis.soto@quality360.local";
const LIDER_SIN_CELULAS = "paula.vega@quality360.local";
const ADMIN = "admin@quality360.local";

const valor = (testid: string) => screen.findByTestId(testid);

describe("Bandeja del Analista QA [E7-F02]", () => {
  it("muestra supervisor, contadores y «Mis HDU» con avance y observaciones; los certificados se conservan [E7-F02-T01]", async () => {
    await abrirComo(ANALISTA, "/qa");
    expect(await screen.findByTestId("bandeja-analista")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Bandeja" })).toBeInTheDocument();
    expect(screen.getByText("Portal Analista QA")).toBeInTheDocument();
    expect(await screen.findByTestId("valor-supervisor")).toHaveTextContent("Jose Seguel");
    expect(await valor("contador-abiertas")).toHaveTextContent("2");
    expect(await valor("contador-con-observaciones")).toHaveTextContent("1");
    expect(await valor("contador-esperando-aprobacion")).toHaveTextContent("1");
    expect(screen.getByTestId("tarjeta-hdu-qa")).toHaveTextContent("3");

    const fila = await screen.findByTestId(`fila-hdu-${ID.hdu1}`);
    expect(within(fila).getByTestId(`celda-avance-${ID.hdu1}`)).toHaveTextContent("3/10 · 30 %");
    expect(within(fila).getByTestId(`celda-siguiente-${ID.hdu1}`)).toHaveTextContent("4 · Datos de prueba");
    expect(within(fila).getByTestId(`insignia-observaciones-${ID.hdu1}`)).toHaveTextContent("1 observación");
    expect(screen.getByTestId("total-mis-hdu")).toHaveTextContent("3 resultados");
  });

  it("un analista sin HDU ve contadores en 0 y «No tienes HDU asignadas», sin error [E7-F02-T03]", async () => {
    await abrirComo(ANALISTA_SIN_HDU, "/qa");
    expect(await screen.findByTestId("estado-vacio-mis-hdu")).toHaveTextContent("No tienes HDU asignadas");
    expect(screen.getByTestId("contador-abiertas")).toHaveTextContent("0");
    expect(screen.getByTestId("valor-supervisor")).toHaveTextContent("Sin supervisor asignado");
    expect(screen.queryByTestId("estado-error-mis-hdu")).not.toBeInTheDocument();
  });

  it("con Certificaciones caída, avance y contadores dicen «No disponible», nunca 0; «Abiertas» sigue [E7-F02-T04]", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(ANALISTA, "/qa");
    expect(await screen.findByTestId("estado-indisponible-con-observaciones")).toHaveTextContent("No disponible");
    expect(screen.getByTestId("estado-indisponible-esperando-aprobacion")).toHaveTextContent("No disponible");
    expect(screen.queryByTestId("contador-con-observaciones")).not.toBeInTheDocument();
    expect(await screen.findByTestId("contador-abiertas")).toHaveTextContent("2");
    const fila = await screen.findByTestId(`fila-hdu-${ID.hdu1}`);
    expect(within(fila).getAllByTestId("estado-indisponible-avance")[0]).toHaveTextContent("No disponible");
    expect(within(fila).queryByTestId(`celda-avance-${ID.hdu1}`)).not.toBeInTheDocument();
  });

  it("filtrar por estado acota la lista pero no cambia los contadores, y un filtro sin resultados da su propio vacío [E7-F02-T05]", async () => {
    const user = userEvent.setup();
    await abrirComo(ANALISTA, "/qa");
    await screen.findByTestId(`fila-hdu-${ID.hdu1}`);

    await user.selectOptions(screen.getByLabelText("Estado"), "DISENO_PRUEBAS");
    await waitFor(() => expect(screen.queryByTestId(`fila-hdu-${ID.hdu1}`)).not.toBeInTheDocument());
    expect(screen.getByTestId(`fila-hdu-${ID.hdu2}`)).toBeInTheDocument();
    expect(screen.getByTestId("contador-abiertas")).toHaveTextContent("2");

    await user.selectOptions(screen.getByLabelText("Estado"), "PENDIENTE");
    expect(await screen.findByTestId("estado-vacio-filtros-mis-hdu")).toHaveTextContent("No hay HDU con esos filtros");
    await user.click(screen.getByTestId("boton-limpiar-filtros"));
    expect(await screen.findByTestId(`fila-hdu-${ID.hdu1}`)).toBeInTheDocument();
  });

  it("«Solo con observaciones» con Certificaciones caída deja la lista indisponible, no sin filtrar", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(ANALISTA, "/qa?solo-obs=1");
    expect(await screen.findByTestId("estado-indisponible-mis-hdu")).toBeInTheDocument();
    expect(screen.queryByTestId(`fila-hdu-${ID.hdu2}`)).not.toBeInTheDocument();
  });

  it("un parámetro de URL inválido se ignora sin error", async () => {
    await abrirComo(ANALISTA, "/qa?estado=XYZ&orden=nada&pagina=-3");
    expect(await screen.findByTestId(`fila-hdu-${ID.hdu1}`)).toBeInTheDocument();
    expect(screen.queryByTestId("estado-error-mis-hdu")).not.toBeInTheDocument();
  });

  it("ordenar una columna actualiza aria-sort y la URL", async () => {
    const user = userEvent.setup();
    await abrirComo(ANALISTA, "/qa");
    await screen.findByTestId(`fila-hdu-${ID.hdu1}`);
    const cabecera = screen.getByRole("columnheader", { name: /Código/ });
    expect(cabecera).toHaveAttribute("aria-sort", "none");
    await user.click(within(cabecera).getByRole("button"));
    expect(screen.getByRole("columnheader", { name: /Código/ })).toHaveAttribute("aria-sort", "ascending");
  });
});

describe("Bandeja del QE [E7-F03]", () => {
  it("«Requiere mi acción» lista una fila por acción con su destino y conserva el resumen de equipo [E7-F03-T01]", async () => {
    await abrirComo(QE, "/qe");
    expect(await screen.findByTestId("bandeja-qe")).toBeInTheDocument();
    expect(await valor("contador-por-aprobar")).toHaveTextContent("1");
    expect(screen.getByTestId("contador-por-aprobar-hdu")).toHaveTextContent("en 1 HDU");
    expect(screen.getByTestId("contador-sin-analista")).toHaveTextContent("1");
    expect(screen.getByTestId("contador-listas-certificar")).toHaveTextContent("1");
    expect(screen.getByTestId("contador-listas-cerrar")).toHaveTextContent("1");

    expect(await screen.findByTestId(`fila-accion-${ID.hdu1}-aprobar`)).toBeInTheDocument();
    expect(screen.getByTestId(`boton-accion-${ID.hdu1}-aprobar`)).toHaveAttribute("href", `/qe/aprobaciones?hdu=${ID.hdu1}`);
    expect(screen.getByTestId(`boton-accion-${ID.hdu5}-asignar`)).toHaveAttribute("href", `/hdu/${ID.hdu5}#asignacion`);
    expect(screen.getByTestId(`boton-accion-${ID.hdu2}-certificar`)).toHaveAttribute("href", `/hdu/${ID.hdu2}#certificado`);
    expect(screen.getByTestId(`boton-accion-${ID.hdu3}-cerrar`)).toHaveAttribute("href", `/hdu/${ID.hdu3}#estado`);
    // Nombre accesible empieza con el texto visible.
    expect(screen.getByTestId(`boton-accion-${ID.hdu1}-aprobar`)).toHaveAccessibleName("Aprobar entregables de PAGOS-1042");

    expect(screen.getByTestId("tarjeta-equipo")).toBeInTheDocument();
    expect(screen.getByTestId("tarjeta-hdu-qe")).toBeInTheDocument();
    expect(screen.getByTestId("enlace-aprobaciones-pendientes")).toBeInTheDocument();
  });

  it("sin acciones ve contadores en 0 y «No tienes acciones pendientes», con el equipo intacto [E7-F03-T03]", async () => {
    await abrirComo(QE_SIN_EQUIPO, "/qe");
    expect(await screen.findByTestId("estado-vacio-requiere-accion")).toHaveTextContent("No tienes acciones pendientes");
    expect(screen.getByTestId("contador-por-aprobar")).toHaveTextContent("0");
    expect(await screen.findByTestId("tarjeta-equipo")).toBeInTheDocument();
  });

  it("con Certificaciones caída solo calcula «Asignar», con aviso parcial y contadores «No disponible» [E7-F03-T04]", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(QE, "/qe");
    expect(await screen.findByTestId("estado-indisponible-por-aprobar")).toHaveTextContent("No disponible");
    expect(screen.getByTestId("estado-indisponible-listas-certificar")).toBeInTheDocument();
    expect(screen.getByTestId("estado-indisponible-listas-cerrar")).toBeInTheDocument();
    expect(screen.getByTestId("contador-sin-analista")).toHaveTextContent("1");
    expect(await screen.findByTestId(`fila-accion-${ID.hdu5}-asignar`)).toBeInTheDocument();
    expect(screen.getByTestId("estado-indisponible-requiere-accion-parcial")).toHaveTextContent("Certificaciones no disponible");
    expect(screen.queryByTestId(`fila-accion-${ID.hdu1}-aprobar`)).not.toBeInTheDocument();
    // No es un vacío falso.
    expect(screen.queryByTestId("estado-vacio-requiere-accion")).not.toBeInTheDocument();
  });

  it("el filtro por tipo de acción que depende de Certificaciones deja la lista indisponible, no sin filtrar", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(QE, "/qe?tipo=APROBAR");
    expect(await screen.findByTestId("estado-indisponible-requiere-accion")).toBeInTheDocument();
  });

  it("«Aprobaciones» acepta ?hdu= y deja visible solo esa HDU [E7-F03-T02]", async () => {
    server.use(
      http.get(`${env.gatewayUrl}/v1/qe/aprobaciones-pendientes`, () =>
        HttpResponse.json({
          total: 2,
          grupos: [
            { hdu: { id: ID.hdu1, codigo: "PAGOS-1042", titulo: "Validación", analista: null }, entregables: [] },
            { hdu: { id: ID.hdu2, codigo: "PAGOS-1043", titulo: "Consulta", analista: null }, entregables: [] },
          ],
        }),
      ),
    );
    await abrirComo(QE, `/qe/aprobaciones?hdu=${ID.hdu1}`);
    expect(await screen.findByTestId("grupo-bandeja-PAGOS-1042")).toBeInTheDocument();
    expect(screen.queryByTestId("grupo-bandeja-PAGOS-1043")).not.toBeInTheDocument();
    expect(screen.getByTestId("enlace-ver-todas-aprobaciones")).toBeInTheDocument();
  });
});

describe("Bandeja del Líder QA [E7-F04]", () => {
  it("muestra sus células, el resumen por célula y solo las HDU de ellas, en solo lectura [E7-F04-T01]", async () => {
    await abrirComo(LIDER, "/lider");
    expect(await screen.findByTestId("bandeja-lider")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-solo-lectura")).toBeInTheDocument();
    expect(await screen.findByTestId(`chip-celula-${ID.celPagos}`)).toHaveTextContent("Pagos");
    expect(screen.getByTestId(`chip-celula-${ID.celClientes}`)).toHaveTextContent("Clientes");
    expect(screen.queryByTestId(`chip-celula-${ID.celTarjetas}`)).not.toBeInTheDocument();

    expect(await valor("contador-celulas")).toHaveTextContent("2");
    expect(screen.getByTestId("contador-hdu-abiertas")).toHaveTextContent("5");
    expect(screen.getByTestId("contador-sin-analista")).toHaveTextContent("1");
    expect(screen.getByTestId("contador-certificados")).toHaveTextContent("1");
    expect(await screen.findByTestId(`fila-celula-${ID.celPagos}`)).toBeInTheDocument();

    expect(await screen.findByTestId(`fila-hdu-${ID.hdu1}`)).toBeInTheDocument();
    // La HDU de Tarjetas (otra célula) no aparece.
    expect(screen.queryByTestId(`fila-hdu-${ID.hdu4}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`celda-certificado-${ID.hdu3}`)).toHaveTextContent("Q360-0002");
    expect(screen.getByTestId(`boton-descargar-certificado-${ID.hdu3}`)).toBeInTheDocument();
    expect(screen.getByTestId(`celda-certificado-${ID.hdu1}`)).toHaveTextContent("—");
    // Sin controles de escritura.
    expect(screen.queryByRole("button", { name: /asignar|reasignar|aprobar|cerrar hdu|certificar$/i })).not.toBeInTheDocument();
  });

  it("sin células muestra el mensaje exacto y ni contadores ni tabla, sin error [E7-F04-T04]", async () => {
    await abrirComo(LIDER_SIN_CELULAS, "/lider");
    expect(await screen.findByTestId("estado-vacio-celulas")).toHaveTextContent(
      "Aún no tienes células asignadas. Pide al Administrador que te las asigne",
    );
    expect(screen.queryByTestId("contador-celulas")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lista-hdu-lider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lista-resumen-celulas")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con Certificaciones caída, hdu-abiertas y sin-analista siguen y «Certificados» dice «No disponible» [E7-F04-T05]", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(LIDER, "/lider");
    expect(await valor("contador-hdu-abiertas")).toHaveTextContent("5");
    expect(screen.getByTestId("contador-sin-analista")).toHaveTextContent("1");
    expect(await screen.findByTestId("estado-indisponible-certificados")).toHaveTextContent("No disponible");
    expect((await screen.findAllByTestId("estado-indisponible-avance-promedio")).length).toBe(2);
  });

  it("el filtro de célula solo ofrece las vigentes del líder", async () => {
    await abrirComo(LIDER, "/lider");
    const select = await screen.findByLabelText("Célula");
    await screen.findByTestId(`fila-hdu-${ID.hdu1}`);
    const opciones = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toEqual(["Todas las mías", "Clientes", "Pagos"]);
  });
});

describe("Bandeja del Administrador [E7-F05]", () => {
  it("conserva las tarjetas certificadas y agrega contadores, pendientes y últimos cambios [E7-F05-T01, T02]", async () => {
    await abrirComo(ADMIN, "/admin");
    expect(await screen.findByTestId("bandeja-admin")).toBeInTheDocument();
    expect(await screen.findByTestId("tarjeta-usuarios-total")).toHaveTextContent("10");
    expect(screen.getByTestId("tarjeta-usuarios-activos")).toHaveTextContent("9");
    expect(await screen.findByTestId("desglose-rol-LIDER_QA")).toHaveTextContent("2");
    expect(screen.getByTestId("desglose-rol-AUDITOR")).toHaveTextContent("1");
    expect(screen.getByTestId("tarjeta-supervision-vigentes")).toBeInTheDocument();
    expect(screen.getByTestId("tarjeta-supervision-sin-supervisor")).toHaveTextContent("1");
    expect(screen.getByTestId("contador-analistas-sin-qe")).toHaveTextContent("1");
    expect(await valor("contador-usuarios-inactivos")).toHaveTextContent("1");
    expect(screen.getByTestId("contador-lideres-sin-celulas")).toHaveTextContent("1");
    expect(screen.getByTestId("contador-celulas-sin-lider")).toHaveTextContent("1");
    expect(screen.getByTestId("contador-hdu-total")).toHaveTextContent("6");

    expect(await screen.findByTestId(`fila-pendiente-analista-sin-qe-${ID.qa2}`)).toBeInTheDocument();
    expect(screen.getByTestId(`boton-asignar-qe-${ID.qa2}`)).toHaveAttribute("href", `/admin/supervision?analista=${ID.qa2}`);
    expect(screen.getByTestId(`boton-asignar-analistas-${ID.qe2}`)).toHaveAttribute("href", `/admin/supervision?qe=${ID.qe2}`);
    expect(screen.getByTestId(`boton-asignar-celulas-${ID.lider2}`)).toHaveAttribute("href", `/admin/usuarios?usuario=${ID.lider2}`);
    expect(screen.getByTestId(`boton-asignar-lider-${ID.celTarjetas}`)).toHaveAttribute("href", "/admin/usuarios?rol=LIDER_QA");

    const cambios = await screen.findByTestId("lista-ultimos-cambios");
    expect(within(cambios).getByTestId("fila-cambio-0")).toHaveTextContent("Asignación de células");
  });

  it("si solo fallan los últimos cambios, ese bloque dice «No disponible» y lo demás sigue [E7-F05-T04]", async () => {
    simularFuentes({ cambiosAdmin: false });
    await abrirComo(ADMIN, "/admin");
    expect(await screen.findByTestId("estado-indisponible-ultimos-cambios")).toHaveTextContent("No disponible");
    expect(await screen.findByTestId("lista-pendientes")).toBeInTheDocument();
    expect(screen.getByTestId("contador-hdu-total")).toBeInTheDocument();
  });

  it("sin pendientes muestra el vacío positivo «No hay pendientes de configuración»", async () => {
    server.use(
      http.get(`${env.gatewayUrl}/v1/bandeja/admin`, () =>
        HttpResponse.json({
          rol: "ADMINISTRADOR",
          generadaEn: "2026-10-21T10:00:00Z",
          contadores: {
            usuariosActivos: { fuente: "organizacion.usuarios", estado: "ok", datos: { valor: 1, porRol: { ADMINISTRADOR: 1, QE: 0, ANALISTA_QA: 0, LIDER_QA: 0, AUDITOR: 0 } } },
            usuariosInactivos: { fuente: "organizacion.usuarios", estado: "ok", datos: { valor: 0 } },
            analistasSinQe: { fuente: "organizacion.supervision", estado: "ok", datos: { valor: 0 } },
            qeSinAnalistas: { fuente: "organizacion.supervision", estado: "ok", datos: { valor: 0 } },
            lideresSinCelulas: { fuente: "organizacion.usuarios", estado: "ok", datos: { valor: 0 } },
            celulasSinLider: { fuente: "organizacion.celulas", estado: "ok", datos: { valor: 0 } },
            hduTotal: { fuente: "organizacion.hdu", estado: "ok", datos: { valor: 0 } },
          },
          pendientes: { fuente: "organizacion.usuarios", estado: "ok", datos: { items: [], total: 0, pagina: 1, tamanoPagina: 25 } },
          ultimosCambios: { fuente: "organizacion.auditoria", estado: "ok", datos: { items: [] } },
        }),
      ),
    );
    await abrirComo(ADMIN, "/admin");
    expect(await screen.findByTestId("estado-vacio-pendientes")).toHaveTextContent("No hay pendientes de configuración");
    expect(screen.getByTestId("estado-vacio-ultimos-cambios")).toHaveTextContent("Aún no hay cambios registrados");
  });

  it("si Organización falla, un único error con «Reintentar» y los accesos rápidos siguen [E7-F05-T04]", async () => {
    server.use(http.get(`${env.gatewayUrl}/v1/inicio/admin`, () => HttpResponse.json({ codigo: "ERROR_INTERNO", mensaje: "x", traceId: "t", detalles: [] }, { status: 500 })));
    await abrirComo(ADMIN, "/admin");
    expect(await screen.findByTestId("bloque-inicio-admin-error")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gestionar usuarios" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Registrar usuario" })).toHaveAttribute("href", "/admin/usuarios?nuevo=1");
  });
});
