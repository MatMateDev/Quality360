import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { contextoDe, estadoSesion } from "../support/e4ui";
import { actual, cabecera, consultarOk, crearManual, descartar, editar, fijarActivo, fila as filaApi, pares } from "../support/e5c";
import { abrirDetalle, abrirGrupo, elegir, fila, irAConsulta, vigilarConfirmaciones } from "../support/e5dui";
import { contarHdu, limpiarE5, sql, tk } from "../support/e5";
import { crearArnesDetalle, crearEquipo, confirmarFila, idHdu, nombreUsuario, prepararDetalle, type ArnesDetalle } from "../support/e5d";
import { jiraFalso } from "../support/jira-falso/cliente";
import { env } from "../support/env";

/** E5-F07 · Asignar y confirmar HDU por HDU (14 escenarios) y E5-F05#14, E5-F02#4, E5-F04#5. Solo el Administrador. Contra el portal real. */
test.describe.configure({ mode: "default" });
let arnes: ArnesDetalle | undefined;
const extras: Array<() => Promise<void>> = [];
test.afterAll(async () => {
  await jiraFalso.reset();
  await limpiarE5();
  for (const l of extras) await l().catch(() => undefined);
  await arnes?.limpiar();
});
test.afterEach(async () => {
  await jiraFalso.modo("NORMAL");
});
async function A(request: Parameters<typeof crearArnesDetalle>[0]): Promise<ArnesDetalle> {
  arnes ??= await crearArnesDetalle(request);
  return arnes;
}
const hdu = async (codigo: string) => (await sql("SELECT id_historia, titulo, qe_responsable_id, analista_id, id_celula, origen, estado FROM organizacion.historia_usuario WHERE codigo_normalizado = lower($1)", [codigo]))[0];
const estado = (page: Page, codigo: string) => fila(page, codigo).getByTestId("estado-fila");

test.describe("E5-F07 · Asignar y confirmar HDU por HDU", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });

    test("[E5-F07#1] T01: QE con varios analistas (QE1): el selector lista solo a ANA1 y ANA2, dice «Elige un analista del equipo de…» y la fila queda «Incompleta (falta: analista)»", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      await consultarOk(request);
      await irAConsulta(page);
      const fl = fila(page, "QTY-1");
      await elegir(page, fl.getByTestId("selector-celula"), p.celC);
      await elegir(page, fl.getByTestId("selector-qe"), p.qe1);
      const opciones = fl.getByTestId("selector-analista").locator("option");
      await expect.poll(async () => (await opciones.evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).filter(Boolean).sort(), { timeout: 15_000 }).toEqual([p.ana1, p.ana2].sort());
      await expect(fl.getByTestId("ayuda-elige-analista")).toContainText(`Elige un analista del equipo de ${await nombreUsuario(p.qe1)}`);
      await expect(estado(page, "QTY-1")).toContainText(/Incompleta/);
      await expect(estado(page, "QTY-1")).toContainText(/falta: analista/i);
      await expect(fl.getByTestId("aviso-analista-automatico")).toHaveCount(0);
      await expect(fl.getByTestId("boton-confirmar-asignacion")).toHaveAttribute("aria-disabled", "true");
      await expect(fl.getByTestId("motivo-confirmar-QTY-1")).toContainText("Falta: analista");
    });

    test("[E5-F07#2] T02: QE con un solo Analista (QE2): queda asignado solo, se anuncia y se muestra «Asignado automáticamente: único analista de…»; la fila queda «Lista» y cambiar de QE recalcula", async ({ page, request }) => {
      await prepararDetalle(request);
      const a = await A(request);
      const p = await pares(request);
      await consultarOk(request);
      await irAConsulta(page);
      const fl = fila(page, "QTY-1");
      await elegir(page, fl.getByTestId("selector-celula"), p.celC);
      await elegir(page, fl.getByTestId("selector-qe"), p.qe2);
      await expect(fl.getByTestId("selector-analista")).toHaveValue(p.ana3, { timeout: 15_000 });
      const aviso = fl.getByTestId("aviso-analista-automatico");
      await expect(aviso).toBeVisible();
      await expect(aviso).toContainText(`Asignado automáticamente: único analista de ${await nombreUsuario(p.qe2)}`);
      await expect(page.getByTestId("anuncios-consulta")).toContainText(/Analista asignado automáticamente: .*ANA3/);
      await expect(estado(page, "QTY-1")).toContainText("Lista");
      await expect(fl.getByTestId("boton-confirmar-asignacion")).not.toHaveAttribute("aria-disabled", "true");
      // Sobrevive a recargar (viene de analistaAuto).
      await page.reload();
      await expect(page.getByTestId("consulta-abierta")).toBeVisible();
      await expect(fl.getByTestId("aviso-analista-automatico")).toBeVisible();
      // Cambiar de QE recalcula: QE1 limpia (y lo dice); QE6 (1 activo + 1 inactivo) asigna al activo.
      await elegir(page, fl.getByTestId("selector-qe"), p.qe1);
      await expect(fl.getByTestId("selector-analista")).toHaveValue("");
      await expect(fl.getByTestId("aviso-analista-automatico")).toHaveCount(0);
      await expect(page.getByTestId("anuncios-consulta")).toContainText("Se limpió el analista: elige uno del equipo de");
      await elegir(page, fl.getByTestId("selector-qe"), a.qe6.id);
      await expect(fl.getByTestId("selector-analista")).toHaveValue(a.qe6.ana6, { timeout: 15_000 });
      await expect(fl.getByTestId("aviso-analista-automatico")).toBeVisible();
      // Elegido a mano: el aviso automático desaparece.
      await elegir(page, fl.getByTestId("selector-qe"), p.qe1);
      await elegir(page, fl.getByTestId("selector-analista"), p.ana1);
      await expect(fl.getByTestId("aviso-analista-automatico")).toHaveCount(0);
      expect((await filaApi(request, (await actual(request)).body.consulta.id, "QTY-1")).analistaAuto).toBe(false);
    });

    test("[E5-F07#3] T03: QE sin analistas (QE5) o con un único analista inactivo: «Este QE no supervisa analistas activos. Elige otro QE.» y no se puede confirmar; con un activo y otro inactivo se asigna el activo y el inactivo no se lista", async ({ page, request }) => {
      await prepararDetalle(request);
      const a = await A(request);
      const p = await pares(request);
      const solo = await crearEquipo(request, 1, "e5f7");
      extras.push(solo.limpiar);
      await fijarActivo(solo.analistas[0].id, false);
      await consultarOk(request);
      await irAConsulta(page);
      const fl = fila(page, "QTY-1");
      await elegir(page, fl.getByTestId("selector-celula"), p.celC);
      for (const qe of [a.qe5.id, solo.qeId]) {
        await elegir(page, fl.getByTestId("selector-qe"), qe);
        await expect(fl.getByTestId("ayuda-sin-analistas")).toContainText("Este QE no supervisa analistas activos. Elige otro QE.", { timeout: 15_000 });
        expect((await fl.getByTestId("selector-analista").locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).filter(Boolean)).toEqual([]);
        await expect(fl.getByTestId("boton-confirmar-asignacion")).toHaveAttribute("aria-disabled", "true");
        await expect(fl.getByTestId("motivo-confirmar-QTY-1")).toContainText("No se puede confirmar: el QE no tiene analistas activos");
      }
      await elegir(page, fl.getByTestId("selector-qe"), a.qe6.id);
      const lista = async () => (await fl.getByTestId("selector-analista").locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).filter(Boolean);
      await expect.poll(lista, { timeout: 15_000 }).toEqual([a.qe6.ana6]);
      expect(await lista()).not.toContain(a.qe6.ana5);
      await expect(fl.getByTestId("selector-analista")).toHaveValue(a.qe6.ana6, { timeout: 15_000 });
    });

    test("[E5-F07#4] T04: «Confirmar asignación» crea la HDU con célula, QE, Analista y sprint: la fila pasa a «Creada» (solo lectura) con «Asignada a… / …» e «Ir a la HDU», el foco pasa a la siguiente fila, la consulta sigue abierta y no se llama a Jira", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      for (const k of ["QTY-1", "QTY-2"]) {
        const f = await filaApi(request, c.id, k);
        expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      }
      await jiraFalso.limpiarSolicitudes();
      await irAConsulta(page);
      const fl = fila(page, "QTY-1");
      await expect(estado(page, "QTY-1")).toContainText("Lista");
      const boton = fl.getByTestId("boton-confirmar-asignacion");
      await boton.click();
      await expect(fl).toHaveAttribute("data-estado", "creada", { timeout: 30_000 });
      await expect(estado(page, "QTY-1")).toContainText("Creada");
      const chip = fl.getByTestId("chip-creada");
      const qe = await nombreUsuario(p.qe2);
      const ana = await nombreUsuario(p.ana3);
      await expect(chip).toContainText(`Asignada a ${qe} / ${ana}`);
      await expect(chip).toHaveAttribute("data-qe", qe);
      await expect(chip).toHaveAttribute("data-analista", ana);
      const id = await idHdu("QTY-1");
      await expect(fl.getByTestId("enlace-ir-a-hdu")).toHaveAttribute("href", `/hdu/${id}`);
      await expect(fl.getByTestId("selector-qe")).toHaveCount(0); // solo lectura
      await expect(fl.getByTestId("boton-confirmar-asignacion")).toHaveCount(0);
      await expect(page.getByTestId("anuncios-consulta")).toContainText(`HDU QTY-1 creada: asignada a ${qe} / ${ana}`);
      await expect(fila(page, "QTY-2").getByTestId("boton-ver-detalle")).toBeFocused();
      await expect(page.getByTestId("consulta-abierta")).toBeVisible();
      await expect(page.getByTestId("contador-creadas")).toContainText("1 creada");
      expect(await hdu("QTY-1")).toMatchObject({ estado: "PENDIENTE", origen: "JIRA", qe_responsable_id: p.qe2, analista_id: p.ana3, id_celula: p.celC });
      expect((await actual(request)).body.consulta).toMatchObject({ id: c.id, estado: "ABIERTA", creadas: 1 });
      expect(await jiraFalso.solicitudes()).toEqual([]);
      // Desde la HDU creada el Administrador llega a la gestión de HDU (diseño §10.2).
      await fl.getByTestId("enlace-ir-a-hdu").click();
      await expect(page).toHaveURL(new RegExp(`/hdu/${id}$`));
      await expect(page.getByTestId("hdu-origen")).toContainText("Jira", { timeout: 20_000 });
    });

    test("[E5-F07#5] T05: una HDU que ya existe con QE o Analista muestra la alerta «Esta HDU ya fue asignada a <QE> / <Analista>» (o «sin Analista»), sin controles de asignación, con «Ir a la HDU»; role=note al cargar y contador en el grupo", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      await crearManual(request, "QTY-4", "Filtrar por fecha", { prioridad: "BAJA", descripcion: "Texto corto" }); // SIN_CAMBIOS, sin analista
      await crearManual(request, "QTY-3", "Otro título distinto", { prioridad: "MEDIA" }); // CAMBIO
      const idQty3 = await idHdu("QTY-3");
      expect((await api.put<any>(request, `/v1/hdu/${idQty3}/analista`, { token: await tk("qe1"), body: { analistaId: p.ana1 } })).status).toBe(200);
      await consultarOk(request);
      await irAConsulta(page);
      const qe1 = await nombreUsuario(p.qe1);
      await abrirGrupo(page, "sin-cambios");
      const alerta = fila(page, "QTY-4").getByTestId("alerta-hdu-ya-asignada");
      await expect(alerta).toContainText(`Esta HDU ya fue asignada a ${qe1} / sin Analista`);
      await expect(alerta).toHaveAttribute("role", "note");
      await expect(alerta).toHaveAttribute("data-qe", qe1);
      await expect(alerta).toHaveAttribute("data-analista", "");
      await expect(alerta).toHaveAttribute("data-id-historia", (await idHdu("QTY-4"))!);
      await expect(fila(page, "QTY-4").getByTestId("selector-qe")).toHaveCount(0);
      await expect(fila(page, "QTY-4").getByTestId("boton-confirmar-asignacion")).toHaveCount(0);
      await expect(fila(page, "QTY-4").getByTestId("enlace-ir-a-hdu")).toHaveAttribute("href", `/hdu/${await idHdu("QTY-4")}`);
      await abrirGrupo(page, "cambiaron");
      const a3 = fila(page, "QTY-3").getByTestId("alerta-hdu-ya-asignada");
      await expect(a3).toContainText(`Esta HDU ya fue asignada a ${qe1} / ${await nombreUsuario(p.ana1)}`);
      await expect(page.getByTestId("contador-ya-asignadas").first()).toBeVisible();
      // En el panel de detalle la alerta va arriba, completa, con el apoyo y el enlace.
      const panel = await abrirDetalle(page, "QTY-3");
      await expect(panel.getByTestId("alerta-hdu-ya-asignada")).toContainText("No se puede reasignar desde la consulta");
      await expect(panel.getByTestId("boton-confirmar-asignacion")).toHaveCount(0);
      // «Ir a la HDU» lleva a una pantalla de HDU que el Administrador ve.
      await panel.getByTestId("enlace-ir-a-hdu").first().click();
      await expect(page).toHaveURL(new RegExp(`/hdu/${idQty3}$`));
      await expect(page.getByTestId("hdu-origen")).toBeVisible({ timeout: 20_000 });
    });

    test("[E5-F07#6] T06: si el QE crea la HDU mientras el Administrador revisa, «Confirmar asignación» no crea ni pisa nada: aparece la alerta con los nombres actuales (role=alert), la fila queda de solo lectura y el foco va a la alerta", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      const f = await filaApi(request, c.id, "QTY-2");
      expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      await irAConsulta(page);
      await expect(estado(page, "QTY-2")).toContainText("Lista");
      await crearManual(request, "QTY-2", "Creada a mano por QE1", { prioridad: "BAJA" });
      const idManual = await idHdu("QTY-2");
      expect((await api.put<any>(request, `/v1/hdu/${idManual}/analista`, { token: await tk("qe1"), body: { analistaId: p.ana2 } })).status).toBe(200);
      const antes = await hdu("QTY-2");
      const total = await contarHdu(request);
      await fila(page, "QTY-2").getByTestId("boton-confirmar-asignacion").click();
      const alerta = fila(page, "QTY-2").getByTestId("alerta-hdu-ya-asignada");
      await expect(alerta).toBeVisible({ timeout: 30_000 });
      await expect(alerta).toContainText(`Esta HDU ya fue asignada a ${await nombreUsuario(p.qe1)} / ${await nombreUsuario(p.ana2)}`);
      await expect(alerta).toHaveAttribute("role", "alert");
      await expect(alerta.locator("strong").first(), "el foco queda en el título de la alerta (diseño §5.5)").toBeFocused();
      await expect(fila(page, "QTY-2")).toHaveAttribute("data-estado", "ya-asignada");
      await expect(fila(page, "QTY-2").getByTestId("selector-qe")).toHaveCount(0);
      await expect(page.getByTestId("anuncios-consulta")).toContainText(/QTY-2 ya fue asignada a .* No se creó nada\./);
      expect(await hdu("QTY-2"), "la HDU del QE no cambió").toEqual(antes);
      expect(await contarHdu(request)).toBe(total);
    });

    test("[E5-F07#7] T07: si otra persona editó la fila después de verla, «Confirmar asignación» avisa «Otra persona modificó esta HDU», muestra la fila actual, no crea y al confirmar de nuevo crea con lo que se ve", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      const f = await filaApi(request, c.id, "QTY-1");
      expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe1, analistaId: p.ana1 } })).status).toBe(200);
      await irAConsulta(page);
      await expect(fila(page, "QTY-1").getByTestId("selector-analista")).toHaveValue(p.ana1);
      // ADM2 (por API) cambia el analista sin que el portal lo sepa todavía.
      const a = await A(request);
      expect((await api.patch<any>(request, `/v1/integraciones/jira/consultas/${c.id}/items`, { token: a.adm2.token, body: { itemIds: [f.id], asignacion: { analistaId: p.ana2 } } })).status).toBe(200);
      await fila(page, "QTY-1").getByTestId("boton-confirmar-asignacion").click();
      const aviso = fila(page, "QTY-1").getByTestId("aviso-fila-modificada");
      await expect(aviso).toBeVisible({ timeout: 30_000 });
      await expect(aviso).toContainText("Otra persona modificó esta HDU");
      await expect(aviso).toHaveAttribute("role", "alert");
      await expect(fila(page, "QTY-1").getByTestId("selector-analista")).toHaveValue(p.ana2, { timeout: 15_000 });
      expect(await hdu("QTY-1")).toBeUndefined();
      await fila(page, "QTY-1").getByTestId("boton-confirmar-asignacion").click();
      await expect(fila(page, "QTY-1")).toHaveAttribute("data-estado", "creada", { timeout: 30_000 });
      expect((await hdu("QTY-1")).analista_id).toBe(p.ana2);
    });

    test("[E5-F07#8] T08: si el Analista se desactivó, «Confirmar asignación» no crea y dice «<Analista> ya no está disponible.»; se limpia el campo y la fila vuelve a «Incompleta»", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const eq = await crearEquipo(request, 1, "e5f8");
      extras.push(eq.limpiar);
      const c = (await consultarOk(request)).consulta;
      const f = await filaApi(request, c.id, "QTY-1");
      expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: eq.qeId } })).status).toBe(200);
      await irAConsulta(page);
      await expect(estado(page, "QTY-1")).toContainText("Lista");
      await fijarActivo(eq.analistas[0].id, false);
      await fila(page, "QTY-1").getByTestId("boton-confirmar-asignacion").click();
      const error = fila(page, "QTY-1").getByTestId("error-confirmar-asignacion");
      await expect(error).toBeVisible({ timeout: 30_000 });
      await expect(error).toHaveAttribute("role", "alert");
      await expect(error).toContainText(`${eq.analistas[0].nombre} ya no está disponible.`);
      await expect(fila(page, "QTY-1").getByTestId("selector-analista")).toHaveValue("", { timeout: 15_000 });
      await expect(estado(page, "QTY-1")).toContainText(/Incompleta/);
      expect(await hdu("QTY-1")).toBeUndefined();
    });

    test("[E5-F07#9] T09: doble clic = una sola solicitud; si la respuesta se pierde aparece «No se pudo confirmar» con «Reintentar», la fila queda intacta y reintentar no duplica (queda «Creada»)", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      for (const k of ["QTY-1", "QTY-2"]) {
        const f = await filaApi(request, c.id, k);
        expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      }
      await irAConsulta(page);
      const vigia = vigilarConfirmaciones(page);
      await fila(page, "QTY-1").getByTestId("boton-confirmar-asignacion").dblclick();
      await expect(fila(page, "QTY-1")).toHaveAttribute("data-estado", "creada", { timeout: 30_000 });
      expect(vigia.n(), "el doble clic dispara una sola solicitud").toBe(1);
      expect(await sql("SELECT 1 FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-1'")).toHaveLength(1);
      // La respuesta se pierde: el servidor crea la HDU pero el portal no recibe nada.
      let corto = true;
      await page.route(/\/items\/[0-9a-f-]{36}\/confirmaciones$/, async (route) => {
        if (corto) {
          corto = false;
          await route.fetch();
          await route.abort("connectionreset");
        } else await route.continue();
      });
      await fila(page, "QTY-2").getByTestId("boton-confirmar-asignacion").click();
      const error = fila(page, "QTY-2").getByTestId("error-confirmar-asignacion");
      await expect(error).toBeVisible({ timeout: 30_000 });
      await expect(error).toContainText("No se pudo confirmar. Revisa tu conexión e inténtalo de nuevo.");
      const reintentar = fila(page, "QTY-2").getByTestId("boton-reintentar-confirmacion-QTY-2");
      await expect(reintentar).toBeVisible();
      expect(await hdu("QTY-2"), "Organización sí la creó").toBeDefined();
      await reintentar.click();
      await expect(fila(page, "QTY-2")).toHaveAttribute("data-estado", "creada", { timeout: 30_000 });
      expect(await sql("SELECT 1 FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-2'")).toHaveLength(1);
      expect((await sql("SELECT count(*)::int n FROM organizacion.auditoria WHERE accion = 'CREAR_HDU' AND entidad_id = (SELECT id_historia FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-2')"))[0].n).toBe(1);
    });

    test("[E5-F07#10] T10: «Confirmar marcadas (N)» cuenta solo las pendientes, explica la coexistencia y no repite las ya creadas una a una (resultado con «N HDU ya estaban creadas y no se repitieron»)", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      const ids: Record<string, string> = {};
      for (const k of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) {
        const f = await filaApi(request, c.id, k);
        ids[k] = f.id;
        expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      }
      expect((await editar(request, c.id, { itemIds: [ids["QTY-3"], ids["QTY-4"]], marcada: true })).status).toBe(200);
      await irAConsulta(page);
      for (const k of ["QTY-1", "QTY-2"]) {
        await fila(page, k).getByTestId("boton-confirmar-asignacion").click();
        await expect(fila(page, k)).toHaveAttribute("data-estado", "creada", { timeout: 30_000 });
      }
      await expect(page.getByTestId("boton-confirmar")).toContainText("Confirmar marcadas (2)");
      await expect(page.getByTestId("texto-coexistencia")).toContainText("Las HDU que ya confirmaste una a una se conservan y no se repiten.");
      await expect(page.getByTestId("boton-continuar-confirmacion"), "las filas creadas una a una no son un lote incompleto").toHaveCount(0);
      await page.getByTestId("boton-confirmar").click();
      await page.getByTestId("boton-confirmar-dialogo").click();
      await expect(page.getByTestId("resultado-confirmacion")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("texto-ya-creadas")).toContainText("2 HDU ya estaban creadas y no se repitieron");
      expect(await sql("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE codigo IN ('QTY-1','QTY-2','QTY-3','QTY-4')")).toEqual([{ n: 4 }]);
      expect((await sql("SELECT count(*)::int n FROM organizacion.auditoria WHERE accion = 'CREAR_HDU' AND despues::text LIKE $1", [`%${c.id}%`]))[0].n).toBe(4);
    });

    test("[E5-F07#14] T17: teclado y móvil: orden de foco lógico en la fila (Seleccionar → Ver detalle → Célula → QE → Analista → Sprint → Incluir → Confirmar asignación) y, a 375 px, tarjeta apilada con controles de 44 px y sin desborde", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      const f = await filaApi(request, c.id, "QTY-1");
      expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      for (const ancho of [1280, 375]) {
        await page.setViewportSize({ width: ancho, height: ancho > 700 ? 900 : 800 });
        await irAConsulta(page);
        const fl = fila(page, "QTY-1");
        await fl.scrollIntoViewIfNeeded();
        await fl.locator("input[data-testid=casilla-seleccionar]").focus();
        const orden: string[] = [];
        for (let i = 0; i < 12; i += 1) {
          const id = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? "");
          orden.push(id);
          if (id === "boton-confirmar-asignacion") break;
          await page.keyboard.press("Tab");
        }
        const esperado = ["casilla-seleccionar", "boton-codigo-QTY-1", "boton-ver-detalle", "selector-celula", "selector-qe", "selector-analista", "selector-sprint", "casilla-marcar", "boton-confirmar-asignacion"];
        expect(orden.filter((x, i, a) => esperado.includes(x) && a.indexOf(x) === i), `orden de foco a ${ancho}: ${orden.join(" > ")}`).toEqual(esperado);
        if (ancho <= 375) {
          for (const id of ["boton-ver-detalle", "selector-celula", "selector-qe", "selector-analista", "selector-sprint", "boton-confirmar-asignacion"]) {
            const b = await fl.getByTestId(id).boundingBox();
            expect(b?.height ?? 0, `${id} a 375 px`).toBeGreaterThanOrEqual(43.5);
          }
          const caja = await fl.boundingBox();
          const confirmar = await fl.getByTestId("boton-confirmar-asignacion").boundingBox();
          expect((confirmar?.width ?? 0) / (caja?.width ?? 1), "«Confirmar asignación» a ancho completo en móvil").toBeGreaterThan(0.8);
          const sel = await fl.getByTestId("selector-qe").boundingBox();
          expect((sel?.width ?? 0) / (caja?.width ?? 1), "selectores apilados en una columna").toBeGreaterThan(0.8);
        }
        const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, cli: document.documentElement.clientWidth }));
        expect(m.doc).toBeLessThanOrEqual(m.cli);
      }
    });

    test("[E5-F07#10] T16 (supuestos del portal con el servidor real): una HDU creada una a una más 60 marcadas: «Confirmar marcadas (60)»; con el lote cortado a mitad el portal muestra el aviso de incompleta y, también tras recargar, un camino para continuar con N = pendientes; al terminar quedan 61 sin duplicar", async ({ page, request }) => {
      test.setTimeout(300_000);
      const { guardarConfigBase, estadoConfigBase } = await import("../support/e5");
      const { continuar } = await import("../support/e5c");
      const { levantarIntegraciones, proxyOrganizacion } = await import("../support/entornoE5");
      await estadoConfigBase(request);
      expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      await continuar(request, c.id);
      const ids: string[] = [];
      for (let n = 1; n <= 61; n += 1) ids.push((await filaApi(request, c.id, `BIG-${n}`)).id);
      expect((await editar(request, c.id, { itemIds: ids, asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      expect((await editar(request, c.id, { itemIds: ids.slice(1), marcada: true })).status).toBe(200);
      await irAConsulta(page);
      await fila(page, "BIG-1").getByTestId("boton-confirmar-asignacion").click();
      await expect(fila(page, "BIG-1")).toHaveAttribute("data-estado", "creada", { timeout: 30_000 });
      await expect(page.getByTestId("boton-confirmar")).toContainText("Confirmar marcadas (60)", { timeout: 15_000 });
      await expect(page.getByTestId("boton-continuar-confirmacion")).toHaveCount(0);
      // Lote cortado tras 25: se aplica por la instancia con Organización cortada.
      const proxy = await proxyOrganizacion(env.organizacionUrl, 3189, 1);
      const inst = await levantarIntegraciones(3149, { ORGANIZACION_URL: proxy.url });
      await page.route("**/v1/integraciones/jira/consultas/*/confirmaciones", async (route) => {
        const url = new URL(route.request().url());
        const resp = await route.fetch({ url: `${inst.url}${url.pathname}` });
        await route.fulfill({ response: resp });
      });
      try {
        await page.getByTestId("boton-confirmar").click();
        await page.getByTestId("boton-confirmar-dialogo").click();
        await expect(page.getByTestId("aviso-incompleta")).toBeVisible({ timeout: 90_000 });
        await expect(page.getByTestId("aviso-incompleta"), "el aviso cuenta la fila y el lote: 26 de 61").toContainText("Se aplicaron 26 de 61", { timeout: 20_000 });
        test.info().annotations.push({ type: "aviso-incompleta", description: (await page.getByTestId("aviso-incompleta").innerText()).replace(/\s+/g, " ") });
        await expect(page.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "ABIERTA");
      } finally {
        await inst.detener();
        await proxy.cerrar();
      }
      await page.unroute("**/v1/integraciones/jira/consultas/*/confirmaciones");
      const k = (await cabecera(request, c.id)).body;
      expect(k).toMatchObject({ creadas: 26, aplicadas: 26, pendientes: 35 });
      // Sesión nueva (se pierde la memoria de la pantalla): el portal debe seguir ofreciendo cómo terminar, con N = 35.
      await page.reload();
      await expect(page.getByTestId("consulta-abierta")).toBeVisible({ timeout: 30_000 });
      const continuar1 = page.getByTestId("boton-continuar-confirmacion");
      const confirmar1 = page.getByTestId("boton-confirmar");
      const hayContinuar = await continuar1.isVisible().catch(() => false);
      const textoConfirmar = (await confirmar1.count()) ? (await confirmar1.innerText()).replace(/\s+/g, " ") : "";
      test.info().annotations.push({ type: "tras-recargar", description: JSON.stringify({ hayContinuar, textoConfirmar }) });
      expect(hayContinuar || /Confirmar marcadas \(35\)/.test(textoConfirmar), `tras recargar debe haber «Continuar confirmación» o «Confirmar marcadas (35)»: ${JSON.stringify({ hayContinuar, textoConfirmar })}`).toBe(true);
      for (let pasada = 1; pasada <= 5; pasada += 1) {
        if (await continuar1.isVisible().catch(() => false)) await continuar1.click();
        else {
          await confirmar1.click();
          await page.getByTestId("boton-confirmar-dialogo").click();
        }
        const cerrada = await expect(page.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "CONFIRMADA", { timeout: 40_000 }).then(() => true, () => false);
        if (cerrada) break;
      }
      expect((await cabecera(request, c.id)).body).toMatchObject({ estado: "CONFIRMADA", creadas: 61 });
      expect((await sql("SELECT count(*)::int n, count(DISTINCT codigo_normalizado)::int d FROM organizacion.historia_usuario WHERE codigo LIKE 'BIG-%'"))[0]).toEqual({ n: 61, d: 61 });
    });

    test("[E5-F07#11] T11: si la consulta deja de estar vigente (reemplazada por otro Administrador), «Confirmar asignación» no crea nada, avisa con el motivo y ofrece «Consultar Jira»; las HDU ya creadas permanecen", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      for (const k of ["QTY-1", "QTY-2"]) {
        const f = await filaApi(request, c.id, k);
        expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      }
      await irAConsulta(page);
      await fila(page, "QTY-1").getByTestId("boton-confirmar-asignacion").click();
      await expect(fila(page, "QTY-1")).toHaveAttribute("data-estado", "creada", { timeout: 30_000 });
      const a = await A(request);
      const r = await api.post<any>(request, "/v1/integraciones/jira/consultas", { token: a.adm2.token, body: { reemplazar: true } });
      expect(r.status, JSON.stringify(r.body).slice(0, 200)).toBe(200);
      await fila(page, "QTY-2").getByTestId("boton-confirmar-asignacion").click();
      await expect(page.getByTestId("aviso-consulta-reemplazada").or(page.getByTestId("aviso-consulta-vencida")).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: /Consultar Jira|Ir a la nueva consulta/ }).first()).toBeVisible();
      expect(await hdu("QTY-2")).toBeUndefined();
      expect(await hdu("QTY-1"), "lo ya creado permanece").toBeDefined();
    });

    test("[E5-F07#12] T12: con HDU creadas una a una el botón es «Terminar revisión»: pide confirmar con «N HDU ya creadas se conservan; M filas sin confirmar se perderán.», «Seguir revisando» no cierra y «Terminar revisión» cierra, conserva las HDU y ofrece «Consultar Jira»", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      for (const k of ["QTY-1", "QTY-2"]) {
        const f = await filaApi(request, c.id, k);
        expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      }
      await irAConsulta(page);
      await expect(page.getByTestId("boton-descartar-consulta")).toBeVisible(); // sin creadas sigue siendo «Descartar»
      for (const k of ["QTY-1", "QTY-2"]) {
        await fila(page, k).getByTestId("boton-confirmar-asignacion").click();
        await expect(fila(page, k)).toHaveAttribute("data-estado", "creada", { timeout: 30_000 });
      }
      const terminar = page.getByTestId("boton-terminar-revision");
      await expect(terminar).toBeVisible();
      await expect(page.getByTestId("boton-descartar-consulta")).toHaveCount(0);
      await terminar.click();
      const dialogo = page.getByTestId("dialogo-terminar-revision");
      await expect(dialogo).toBeVisible();
      const m = /(\d+) HDU ya creadas se conservan; (\d+) filas sin confirmar se perderán\./.exec(await dialogo.innerText());
      expect(m, await dialogo.innerText()).not.toBeNull();
      expect(m![1]).toBe("2");
      expect(Number(m![2])).toBeGreaterThanOrEqual(8);
      await page.getByTestId("boton-seguir-revisando-terminar").click();
      await expect(dialogo).toHaveCount(0);
      expect((await actual(request)).body.consulta?.estado).toBe("ABIERTA");
      await terminar.click();
      await page.getByTestId("boton-terminar-confirmar").click();
      await expect(page.getByTestId("aviso-consulta-descartada")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: /Consultar Jira/ }).first()).toBeVisible();
      expect((await actual(request)).body.consulta).toBeNull();
      expect(await sql("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE codigo IN ('QTY-1','QTY-2')")).toEqual([{ n: 2 }]);
    });

    test("[E5-F02#4] T14: el diálogo de reemplazo informa «N HDU ya creadas se conservan» además de las filas asignadas", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      const f = await filaApi(request, c.id, "QTY-1");
      expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      expect((await confirmarFila(request, c.id, f.id, (await filaApi(request, c.id, "QTY-1")).revision)).status).toBe(200);
      await irAConsulta(page);
      await page.getByTestId("boton-consultar-jira").click();
      const dialogo = page.getByTestId("dialogo-reemplazar");
      await expect(dialogo).toBeVisible({ timeout: 20_000 });
      await expect(dialogo).toContainText(/1 HDU ya creadas? se conserva/);
      await page.getByRole("button", { name: /Cancelar|Seguir/ }).first().click();
    });

    test("[E5-F04#5] T15: cada confirmación por fila se ve en el historial como ejecución de Confirmación con el chip «Una HDU» y se filtra por alcance", async ({ page, request }) => {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      const f = await filaApi(request, c.id, "QTY-1");
      expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      const r = await confirmarFila(request, c.id, f.id, (await filaApi(request, c.id, "QTY-1")).revision);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      await page.goto(`${env.portalUrl}/admin/integraciones/historial`);
      await expect(page.getByTestId("vista-historial")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[data-testid^=chip-una-hdu-]").first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("[data-testid^=chip-una-hdu-]").first()).toHaveText("Una HDU");
      const filtro = page.getByTestId("filtro-alcance");
      if (await filtro.count()) {
        await filtro.selectOption("HDU");
        await expect(page.locator("[data-testid^=chip-una-hdu-]").first()).toBeVisible({ timeout: 15_000 });
        await filtro.selectOption("LOTE");
        await expect(page.locator("[data-testid^=chip-una-hdu-]")).toHaveCount(0, { timeout: 15_000 });
      } else {
        throw new Error("Falta el filtro por alcance en el historial (data-testid=filtro-alcance)");
      }
    });
  });

  for (const clave of ["qe1", "lid1", "ana1", "aud1"] as const) {
    test(`[E5-F07#13] T13: ${clave.toUpperCase()} no tiene «Confirmar asignación» ni puede confirmar (403)`, async ({ browser, request }) => {
      await prepararDetalle(request);
      const c = (await consultarOk(request)).consulta;
      const f = await filaApi(request, c.id, "QTY-1");
      const { contexto, page } = await contextoDe(browser, clave);
      try {
        await page.goto(`${env.portalUrl}/admin/integraciones/sincronizar`);
        await page.waitForLoadState("networkidle");
        await expect(page.getByTestId("boton-confirmar-asignacion")).toHaveCount(0);
        const r = await confirmarFila(request, c.id, f.id, 1, { clave });
        expect([r.status, r.body.codigo]).toEqual([403, "ACCESO_DENEGADO"]);
      } finally {
        await contexto.close();
      }
    });
  }
});
