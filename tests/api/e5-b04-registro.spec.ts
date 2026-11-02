import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conIntegraciones } from "../support/db";
import { env } from "../support/env";
import { hoySantiago, uid } from "../support/e4";
import { crearUsuarioE7 } from "../support/e7";
import {
  borrarUsuariosDePrueba, hallazgosDeSecreto, PREFIJO_MANUAL, URL_INTEGRACIONES, cadenasSecretas, contieneSecreto, detalleEjecucion, destino, ejecuciones, estadoConfigBase, guardarConfigBase, hduPorCodigo,
  importar, leerFixture, limpiarE5, prepararR1aR4, registroServicios, sincronizar, sincronizarOk, sql, tk, vistaPrevia, TOKEN_FALSO, CORREO_FALSO,
} from "../support/e5";
import { levantarIntegraciones, proxyOrganizacion, type InstanciaE5 } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";
import { marcarConEnlace, aprobarEntregable, ORDEN_ENTREGABLES } from "../support/checklist";

/** E5-B04 · Registrar cada ejecución de sincronización o importación (3 escenarios, T01..T15). */
test.describe.configure({ mode: "default" }); // cada prueba parte de su propio estado base: un fallo no debe ocultar a las demás
test.afterAll(async () => {
  await limpiarE5();
});

const ENC = "codigo,titulo,descripcion,prioridad,celula,sprint,qe_correo";
const csv = (...filas: string[]) => [ENC, ...filas].join("\n") + "\n";
const ejecucion = async (request: any, id: string, clave: any = "adm1") => api.get<any>(request, `/v1/integraciones/ejecuciones/${id}`, { token: await tk(clave) });

test.describe("E5-B04 · Registro de ejecuciones", () => {
  test("[E5-B04#1] T01: la ejecución de QTY registra origen, actor, fechas, duración, resultado, contadores y proyecto", async ({ request }) => {
    await estadoConfigBase(request);
    const e = await sincronizarOk(request);
    const r = await ejecucion(request, e.id);
    expect(r.status).toBe(200);
    expect(cumpleContrato("Ejecucion", r.body)).toEqual({ ok: true, errores: [] });
    expect(r.body).toMatchObject({
      origen: "JIRA", resultado: "CON_ERRORES", leidas: 11, creadas: 10, actualizadas: 0, omitidas: 0, conError: 1, conAdvertencias: 5, proyecto: "QTY", reintentos429: 0,
      actor: { nombre: expect.stringContaining("ADM1"), rol: "ADMINISTRADOR" },
    });
    expect(r.body.actor.id).toBe(await uid(request, "adm1"));
    expect(Date.parse(r.body.terminadaEn)).toBeGreaterThanOrEqual(Date.parse(r.body.iniciadaEn));
    expect(r.body.duracionMs).toBeGreaterThan(0);
    expect(r.body.duracionMs).toBeLessThanOrEqual(Date.parse(r.body.terminadaEn) - Date.parse(r.body.iniciadaEn) + 250);
  });

  test("[E5-B04#1] T02: la importación de un CSV guarda nombre, tamaño y huella SHA-256, y nunca el contenido", async ({ request }) => {
    await estadoConfigBase(request);
    const contenido = leerFixture("historias-validas.csv");
    const e = (await importar(request, "historias-validas.csv")).body;
    const r = await ejecucion(request, e.id);
    expect(r.body.origen).toBe("CSV");
    expect(r.body.archivo).toEqual({ nombre: "historias-validas.csv", tamano: Buffer.byteLength(contenido, "utf8"), huella: createHash("sha256").update(contenido).digest("hex") });
    expect(cumpleContrato("Ejecucion", r.body)).toEqual({ ok: true, errores: [] });
    const texto = JSON.stringify(r.body);
    for (const fragmento of ["Alta de cliente", "Registro básico", "Consulta, con coma"]) expect(texto).not.toContain(fragmento);
    const volcado = await volcarIntegraciones();
    // El detalle guarda el código y el título de cada fila (dato de la fila), pero no el contenido del archivo: ni el encabezado, ni las líneas crudas, ni la descripción.
    for (const fragmento of [ENC, "Registro básico", "ARC-1,Alta de cliente", contenido.slice(0, 80)]) expect(volcado, `tabla sin «${fragmento}»`).not.toContain(fragmento);
  });

  test("[E5-B04#1] T03: el detalle de QTY trae 11 filas (10 CREADA con idHistoria y QTY-11 ERROR TITULO_VACIO) con la referencia de Jira", async ({ request }) => {
    await estadoConfigBase(request);
    const e = await sincronizarOk(request);
    const d = await detalleEjecucion(request, e.id);
    expect(d.status).toBe(200);
    expect(cumpleContrato("PaginaFilasEjecucion", d.body)).toEqual({ ok: true, errores: [] });
    expect(d.body.total).toBe(11);
    const creadas = d.body.items.filter((f: any) => f.resultado === "CREADA");
    expect(creadas).toHaveLength(10);
    for (const f of creadas) {
      expect(f.idHistoria, f.codigo).toMatch(/^[0-9a-f-]{36}$/);
      expect(f.referencia).toEqual({ estado: "En progreso", responsable: "Persona Jira" });
    }
    expect(d.body.items.find((f: any) => f.codigo === "QTY-11")).toMatchObject({ resultado: "ERROR", motivo: "TITULO_VACIO", idHistoria: null });
  });

  test("[E5-B04#1] T04: en R1–R4 la suma de contadores es igual a leídas y la fallida cierra con código, fecha y los CHECK de la base", async ({ request }) => {
    await prepararR1aR4(request);
    const lista = await ejecuciones(request, "tamanoPagina=100");
    expect(lista.body.items).toHaveLength(4);
    for (const e of lista.body.items) {
      expect(e.creadas + e.actualizadas + e.omitidas + e.conError, `${e.origen} ${e.resultado}`).toBe(e.leidas);
      expect(e.terminadaEn).toBeTruthy();
    }
    const r4 = lista.body.items[0];
    expect(r4).toMatchObject({ resultado: "FALLIDA", leidas: 0, codigoError: "JIRA_NO_DISPONIBLE" });
    expect(cumpleContrato("PaginaEjecuciones", lista.body)).toEqual({ ok: true, errores: [] });
    const checks = await sql<{ def: string }>(`SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE contype='c' AND conrelid='integraciones.ejecucion_integracion'::regclass`);
    expect(checks.map((c) => c.def).join(" ")).toMatch(/leidas/);
  });

  test("[E5-B04#2] T05: el historial se ordena por fecha, filtra por origen y resultado, pagina con tope 100 y acota por desde y hasta", async ({ request }) => {
    const { r1, r2, r3, r4 } = await prepararR1aR4(request);
    const ids = (r: any) => r.body.items.map((e: any) => e.id);
    expect(ids(await ejecuciones(request))).toEqual([r4.id, r3.id, r2.id, r1.id]);
    expect(ids(await ejecuciones(request, "origen=CSV"))).toEqual([r3.id, r2.id]);
    expect(ids(await ejecuciones(request, "resultado=FALLIDA"))).toEqual([r4.id]);
    expect(ids(await ejecuciones(request, "orden=iniciadaEn:asc"))[0]).toBe(r1.id);
    const grande = await ejecuciones(request, "tamanoPagina=500");
    expect(grande.status).toBe(200);
    expect(grande.body.tamanoPagina).toBe(100);
    const hoy = hoySantiago();
    expect((await ejecuciones(request, `desde=${hoy}&hasta=${hoy}`)).body.total).toBe(4);
    expect((await ejecuciones(request, "desde=2099-01-01")).body.total).toBe(0);
    expect((await ejecuciones(request, "hasta=2000-01-01")).body.total).toBe(0);
    expect((await ejecuciones(request, "orden=fecha:asc")).status).toBe(400);
    const p1 = await ejecuciones(request, "tamanoPagina=3&pagina=1");
    const p2 = await ejecuciones(request, "tamanoPagina=3&pagina=2");
    expect([p1.body.items.length, p2.body.items.length, p1.body.total]).toEqual([3, 1, 4]);
  });

  test("[E5-B04#2] T06: el detalle respeta el ámbito del QE: QE2 ve sus HDU, QE1 solo las filas con error (sin título) y el contador de ocultas, AUD1 todo", async ({ request }) => {
    const { r1, r3 } = await prepararR1aR4(request);
    const q2r1 = await detalleEjecucion(request, r1.id, "tamanoPagina=100", "qe2");
    expect(q2r1.status).toBe(200);
    expect(q2r1.body.items).toHaveLength(11);
    expect(q2r1.body.filasOcultas).toBe(0);
    expect(q2r1.body.items.find((f: any) => f.codigo === "QTY-11")).toMatchObject({ resultado: "ERROR", motivo: "TITULO_VACIO" });
    const q1r1 = await detalleEjecucion(request, r1.id, "tamanoPagina=100", "qe1");
    expect(q1r1.body.items.map((f: any) => f.codigo)).toEqual(["QTY-11"]);
    expect(q1r1.body.items[0].titulo ?? null).toBeNull();
    expect(q1r1.body.items[0].referencia ?? null).toBeNull();
    expect(q1r1.body.filasOcultas).toBe(10);
    expect(cumpleContrato("PaginaFilasEjecucion", q1r1.body)).toEqual({ ok: true, errores: [] });
    const q1r3 = await detalleEjecucion(request, r3.id, "tamanoPagina=100", "qe1");
    expect(q1r3.body.items).toHaveLength(7);
    expect(q1r3.body.items.every((f: any) => f.resultado === "ERROR" && f.motivo)).toBe(true);
    expect(q1r3.body.filasOcultas).toBe(2);
    const aud = await detalleEjecucion(request, r1.id, "tamanoPagina=100", "aud1");
    expect(aud.body.items).toHaveLength(11);
    expect(aud.body.filasOcultas).toBe(0);
    // El QE puede leer el resumen de todas las ejecuciones (D106).
    expect((await ejecuciones(request, "", "qe1")).body.total).toBe(4);
  });

  test("[E5-B04#2] T07 (negativo): LID1 y ANA1 reciben 403 en todo; un id inexistente da 404 a ADM1 y AUD1 y 403 a QE1 y LID1; sin token 401", async ({ request }) => {
    const { r1 } = await prepararR1aR4(request);
    for (const clave of ["lid1", "ana1"] as const) {
      const token = await tk(clave);
      for (const ruta of ["/v1/integraciones/ejecuciones", `/v1/integraciones/ejecuciones/${r1.id}`, `/v1/integraciones/ejecuciones/${r1.id}/detalle`, "/v1/integraciones/estado"]) {
        const r = await api.get<any>(request, ruta, { token });
        expect(r.status, `${clave} ${ruta}`).toBe(403);
        expect(r.body.codigo).toBe("ACCESO_DENEGADO");
      }
    }
    const inexistente = "00000000-0000-4000-8000-0000000000aa";
    for (const [clave, status] of [["adm1", 404], ["aud1", 404], ["qe1", 403], ["lid1", 403]] as const) {
      expect((await ejecucion(request, inexistente, clave)).status, clave).toBe(status);
      expect((await detalleEjecucion(request, inexistente, "", clave)).status, `${clave} detalle`).toBe(status);
    }
    for (const ruta of ["/v1/integraciones/ejecuciones", `/v1/integraciones/ejecuciones/${r1.id}`, "/v1/integraciones/estado"]) {
      const r = await api.get<any>(request, ruta);
      expect(r.status, ruta).toBe(401);
      expect(r.body.codigo).toBe("NO_AUTENTICADO");
    }
    const est = await api.get<any>(request, "/v1/integraciones/estado", { token: await tk("qe1") });
    expect(est.status).toBe(200);
    expect(est.body).not.toHaveProperty("jiraConfigurado");
    expect(cumpleContrato("EstadoIntegracion", est.body)).toEqual({ ok: true, errores: [] });
    const estAdm = await api.get<any>(request, "/v1/integraciones/estado", { token: await tk("adm1") });
    expect(estAdm.body.jiraConfigurado).toBe(true);
  });

  test("[E5-B04#3] T08: con Jira en TOKEN_REVOCADO el token, su Base64 y Authorization/Basic no aparecen en la respuesta, en ninguna tabla ni en el registro del servicio", async ({ request }) => {
    await estadoConfigBase(request);
    await jiraFalso.modo("TOKEN_REVOCADO");
    const e = await sincronizarOk(request);
    expect(e).toMatchObject({ resultado: "FALLIDA", codigoError: "JIRA_CREDENCIAL_INVALIDA", mensajeError: "Jira rechazó el correo o el API token. Revisa la conexión." });
    expect(contieneSecreto(JSON.stringify(e))).toBeUndefined();
    const g = await ejecucion(request, e.id);
    expect(contieneSecreto(JSON.stringify(g.body))).toBeUndefined();
    const volcado = await volcarIntegraciones();
    expect(volcado.length).toBeGreaterThan(100);
    for (const s of cadenasSecretas()) expect(volcado, `tablas sin «${s}»`).not.toContain(s);
    expect(hallazgosDeSecreto(registroServicios())).toEqual([]);
    expect(CORREO_FALSO).toBeTruthy();
  });

  test.describe("instancias del perfil de QA", () => {
    let i6: InstanciaE5 | undefined;
    let i7: InstanciaE5 | undefined;
    let proxy: Awaited<ReturnType<typeof proxyOrganizacion>> | undefined;
    test.afterAll(async () => {
      await Promise.all([i6?.detener(), i7?.detener(), proxy?.cerrar()]);
    });

    test("[E5-B04#3] T09: con Organización cortada el error es el mensaje fijo, sin URL internas, trazas ni cabeceras, en la respuesta y en la tabla", async ({ request }) => {
      await estadoConfigBase(request);
      expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
      proxy = await proxyOrganizacion(env.organizacionUrl, 3199, 0);
      i6 = await levantarIntegraciones(3108, { ORGANIZACION_URL: proxy.url });
      const r = await sincronizar(request, {}, "http://localhost:3108");
      expect(r.status).toBe(200);
      expect(r.body.codigoError).toBe("ORGANIZACION_NO_DISPONIBLE");
      expect(r.body.mensajeError).toBe("No pudimos guardar las HDU en este momento.");
      const sospechosos = /127\.0\.0\.1|localhost|:3199|:3001|ECONN|socket|stack|\bat \w+|Authorization|Bearer|Basic /;
      expect(`${r.body.mensajeError}`).not.toMatch(sospechosos);
      const fila = (await sql<{ mensaje_error: string; codigo_error: string }>("SELECT mensaje_error, codigo_error FROM integraciones.ejecucion_integracion WHERE id_ejecucion = $1", [r.body.id]))[0];
      expect(fila.mensaje_error).toBe("No pudimos guardar las HDU en este momento.");
      expect(fila.mensaje_error).not.toMatch(sospechosos);
      const det = await detalleEjecucion(request, r.body.id);
      expect(JSON.stringify(det.body)).not.toMatch(/127\.0\.0\.1|ECONN|socket hang up|Bearer/);
      // Con el presupuesto agotado, el mensaje también es el fijo (E5-B02-T12 cubre el caso por separado).
      expect(`${i6.salida()}`).not.toContain(TOKEN_FALSO);
    });

    test("[E5-B04#1] T10: con svc_integraciones no se puede borrar, modificar una ejecución cerrada ni un detalle, ni violar los CHECK; no hay llaves foráneas a otro esquema", async ({ request }) => {
      await estadoConfigBase(request);
      const e = await sincronizarOk(request);
      const denegado = /permission denied|permiso denegado/i;
      await conIntegraciones(async (c) => {
        await expect(c.query("DELETE FROM integraciones.ejecucion_integracion")).rejects.toThrow(denegado);
        await expect(c.query("DELETE FROM integraciones.detalle_ejecucion")).rejects.toThrow(denegado);
        await expect(c.query("UPDATE integraciones.detalle_ejecucion SET mensaje = 'x'")).rejects.toThrow(denegado);
        await expect(c.query("UPDATE integraciones.ejecucion_integracion SET leidas = 99 WHERE id_ejecucion = $1", [e.id])).rejects.toThrow(/cerrada|inmutable|permission|check/i);
        const base = `INSERT INTO integraciones.ejecucion_integracion (id_ejecucion, origen, actor_id, actor_nombre, actor_rol, iniciada_en, terminada_en, resultado, leidas, creadas, actualizadas, omitidas, con_error)
                      VALUES (gen_random_uuid(), 'JIRA', gen_random_uuid(), 'x', 'ADMINISTRADOR', now(), now(), $1, $2, 1, 0, 0, 0)`;
        await expect(c.query(base, ["INVENTADO", 1])).rejects.toThrow(/check|violates/i);
        await expect(c.query(base, ["EXITOSA", 5])).rejects.toThrow(/check|violates/i); // 1 + 0 + 0 + 0 no suma 5
        const fk = await c.query(`SELECT confrelid::regclass::text r FROM pg_constraint WHERE contype='f' AND connamespace='integraciones'::regnamespace`);
        for (const f of fk.rows) expect(String(f.r)).toMatch(/ejecucion_integracion$/);
      });
    });

    test("[E5-B04#1] T11: dos sincronizaciones simultáneas dan 200 y 409 INTEGRACION_EN_CURSO con una sola ejecución; una EN_CURSO de hace 6 minutos queda INTERRUMPIDA", async ({ request }) => {
      await estadoConfigBase(request);
      i7 = await levantarIntegraciones(3109, { JIRA_TIEMPO_LIMITE_MS: "20000", INTEGRACIONES_PRESUPUESTO_MS: "9500" });
      await jiraFalso.modo("LENTO");
      const [a, b] = await Promise.all([sincronizar(request, {}, i7.url), (async () => { await new Promise((r) => setTimeout(r, 700)); return sincronizar(request, {}, i7!.url); })()]);
      const estados = [a.status, b.status].sort();
      expect(estados).toEqual([200, 409]);
      const conflicto = a.status === 409 ? a : b;
      expect(conflicto.body.codigo).toBe("INTEGRACION_EN_CURSO");
      expect((await sql("SELECT 1 FROM integraciones.ejecucion_integracion"))).toHaveLength(1);
      await jiraFalso.modo("NORMAL");
      // Una fila EN_CURSO antigua se cierra como INTERRUMPIDA y la nueva se ejecuta.
      const adm = await uid(request, "adm1");
      await sql(`INSERT INTO integraciones.ejecucion_integracion (id_ejecucion, origen, actor_id, actor_nombre, actor_rol, iniciada_en, resultado)
                 VALUES ('11111111-1111-4111-8111-111111111111', 'JIRA', $1, 'ADM1 Administrador', 'ADMINISTRADOR', now() - interval '6 minutes', 'EN_CURSO')`, [adm]);
      const est = await api.get<any>(request, "/v1/integraciones/estado", { token: await tk("adm1") });
      expect(est.body.enCurso).toMatchObject({ abandonada: true });
      const nueva = await sincronizar(request, {}, i7.url);
      expect(nueva.status).toBe(200);
      expect(nueva.body.resultado).toMatch(/EXITOSA|CON_ERRORES/);
      const vieja = await sql("SELECT resultado, terminada_en FROM integraciones.ejecucion_integracion WHERE id_ejecucion = '11111111-1111-4111-8111-111111111111'");
      expect(vieja[0].resultado).toBe("INTERRUMPIDA");
      expect(vieja[0].terminada_en).toBeTruthy();
    });
  });

  test("[E5-B04#1] T12: la auditoría de HDU registra 4 CREAR_HDU (origen CSV) y 1 ACTUALIZAR_HDU con antes y después, sin cambiar la vista «auditoría de usuarios»", async ({ request }) => {
    await estadoConfigBase(request);
    const aud = await tk("aud1");
    const vista = async () => {
      const r = await api.get<any>(request, "/v1/auditor/auditoria-usuarios?tamanoPagina=5", { token: aud });
      return { total: r.body.total, ultimos: r.body.items.map((i: any) => i.id) };
    };
    const antes = await vista();
    expect((await importar(request, "historias-validas.csv")).body.creadas).toBe(4);
    expect((await importar(request, "actualiza.csv", {}, csv("ARC-1,Alta de cliente cambiada,,CRITICA,,,"))).body.actualizadas).toBe(1);
    const filas = await sql<{ accion: string; actor_id: string; despues: any; antes: any; entidad_id: string }>(
      `SELECT a.accion, a.actor_id, a.antes, a.despues, a.entidad_id FROM organizacion.auditoria a JOIN organizacion.historia_usuario h ON h.id_historia = a.entidad_id
        WHERE a.entidad = 'HDU' AND h.codigo LIKE 'ARC-%' ORDER BY a.fecha`);
    const crear = filas.filter((f) => f.accion === "CREAR_HDU");
    const actualizar = filas.filter((f) => f.accion === "ACTUALIZAR_HDU");
    expect(crear).toHaveLength(4);
    expect(actualizar).toHaveLength(1);
    const adm = await uid(request, "adm1");
    for (const f of [...crear, ...actualizar]) expect(f.actor_id).toBe(adm);
    for (const f of crear) expect(JSON.stringify(f.despues)).toMatch(/CSV/);
    expect(JSON.stringify(actualizar[0].antes)).toContain("Alta de cliente");
    expect(JSON.stringify(actualizar[0].despues)).toContain("Alta de cliente cambiada");
    const adminAudit = await api.get<any>(request, "/v1/auditoria?tamanoPagina=50", { token: await tk("adm1") });
    expect(adminAudit.status).toBe(200);
    expect(JSON.stringify(adminAudit.body.items.map((i: any) => i.entidad ?? i.accion))).not.toContain("CREAR_HDU");
    expect(await vista()).toEqual(antes);
  });

  test("[E5-B04#1] T13 (negativo): un archivo sin la columna título responde 422 COLUMNAS_FALTANTES con ejecucionId, deja una ejecución FALLIDA con huella y la vista previa no registra nada", async ({ request }) => {
    await estadoConfigBase(request);
    const contenido = leerFixture("sin-columna-titulo.csv");
    const prev = await vistaPrevia(request, "sin-columna-titulo.csv");
    expect(prev.status).toBe(422);
    expect(prev.body.ejecucionId ?? null).toBeNull();
    expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(0);
    const r = await importar(request, "sin-columna-titulo.csv");
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ codigo: "COLUMNAS_FALTANTES", columnasFaltantes: ["titulo"] });
    expect(r.body.ejecucionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(cumpleContrato("ErrorArchivo", r.body)).toEqual({ ok: true, errores: [] });
    const e = await ejecucion(request, r.body.ejecucionId);
    expect(e.body).toMatchObject({ resultado: "FALLIDA", origen: "CSV", leidas: 0, codigoError: "COLUMNAS_FALTANTES" });
    expect(e.body.archivo.huella).toBe(createHash("sha256").update(contenido).digest("hex"));
    expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(1);
  });

  test("[E5-B04#3] T15: toda exportación CSV neutraliza las celdas de texto que empiezan con = + - @ tab o CR (HDU, bitácora, certificados, impedimentos, gestión y auditoría de usuarios)", async ({ request }) => {
    test.setTimeout(300_000);
    await estadoConfigBase(request);
    const t0 = (await sql<{ ahora: Date }>("SELECT now() ahora"))[0].ahora;
    const d = await destino(request);
    const titulos = ["=1+1", "+56", "-x", "@SUMA(A1)", "\tA", "\rB"];
    // Las HDU llegan por la importación (JSON, para poder llevar tabulación y retorno de carro en el título).
    const json = JSON.stringify(titulos.map((t, i) => ({ codigo: `${PREFIJO_MANUAL}F${i + 1}`, titulo: t, prioridad: "ALTA" })));
    const imp = await importar(request, "formulas.json", {}, json);
    expect(imp.status).toBe(200);
    // Si la importación recorta \t y \r (trim), esos dos títulos quedan como "A" y "B": se registra qué se guardó realmente.
    const guardados = await sql<{ codigo: string; titulo: string }>("SELECT codigo, titulo FROM organizacion.historia_usuario WHERE codigo LIKE $1 ORDER BY codigo", [`${PREFIJO_MANUAL}F%`]);
    expect(guardados.map((g) => g.titulo).slice(0, 4)).toEqual(titulos.slice(0, 4));
    // El importador recorta tabulación y retorno de carro iniciales (trim). Para ejercitar igualmente la exportación con esos prefijos se fijan,
    // con el dueño de la base, los títulos de F5 y F6 (un dato así solo puede llegar a la base por una vía distinta de la aplicación).
    const TAB = String.fromCharCode(9);
    const CR = String.fromCharCode(13);
    await sql("UPDATE organizacion.historia_usuario SET titulo = $2 WHERE codigo = $1", [`${PREFIJO_MANUAL}F5`, `${TAB}A`]);
    await sql("UPDATE organizacion.historia_usuario SET titulo = $2 WHERE codigo = $1", [`${PREFIJO_MANUAL}F6`, `${CR}B`]);
    const conControl = 2;
    const h1 = await hduPorCodigo(request, `${PREFIJO_MANUAL}F1`);
    // Un impedimento con título de fórmula en la HDU 1 (lo registra el QE responsable).
    const imped = await api.post<any>(request, `/v1/hdu/${h1.id}/impedimentos`, {
      token: await tk("qe2"),
      body: { tipo: "AMBIENTE", titulo: '=HYPERLINK("x")', descripcion: "+cmd|' /C calc'!A0 con descripción larga de prueba", responsableNombre: "@Equipo externo" },
    });
    expect(imped.status, JSON.stringify(imped.body)).toBe(201);
    // Bitácora y certificado: ciclo completo de la HDU 1 con ANA3 y QE2.
    const analista = await uid(request, "ana3");
    expect((await api.put(request, `/v1/hdu/${h1.id}/analista`, { token: await tk("qe2"), body: { analistaId: analista } })).status).toBe(200);
    const ana3 = await tk("ana3");
    const qe2 = await tk("qe2");
    for (const clave of ORDEN_ENTREGABLES.slice(0, 8)) {
      await marcarConEnlace(request, ana3, h1.id, clave);
      await aprobarEntregable(request, qe2, h1.id, clave);
    }
    const cert = await api.post<any>(request, `/v1/hdu/${h1.id}/certificado`, { token: qe2 });
    expect(cert.status, JSON.stringify(cert.body)).toBe(201);
    // Auditoría de usuarios con un motivo que empieza con «=».
    const adm = await tk("adm1");
    const qeA = await crearUsuarioE7(request, adm, "QE", { prefijo: "e5qa" });
    const qeB = await crearUsuarioE7(request, adm, "QE", { prefijo: "e5qb" });
    const ana = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "e5an" });
    try {
      expect((await api.put(request, `/v1/analistas/${ana.id}/supervisor`, { token: adm, body: { qeId: qeA.id } })).status).toBe(200);
      expect((await api.put(request, `/v1/analistas/${ana.id}/supervisor`, { token: adm, body: { qeId: qeB.id, motivo: "=1+1 cambio de supervisor por prueba E5" } })).status).toBe(200);
      const aud = await tk("aud1");
      const exportaciones = ["hdu", "bitacora", "certificados", "impedimentos", "gestion-impedimentos", "auditoria-usuarios"];
      const texto: Record<string, string> = {};
      for (const nombre of exportaciones) {
        const r = await fetch(`${env.gatewayUrl}/v1/auditor/exportaciones/${nombre}`, { headers: { Authorization: `Bearer ${aud}` } });
        expect(r.status, nombre).toBe(200);
        texto[nombre] = Buffer.from(await r.arrayBuffer()).toString("utf8").replace(/^﻿/, "");
      }
      for (const nombre of exportaciones) {
        const celdas = celdasCsv(texto[nombre]);
        const peligrosas = celdas.filter((c) => /^[=+\-@\t\r]/.test(c) && !/^-?\d+([.,]\d+)?$/.test(c));
        expect(peligrosas, `${nombre}: celdas sin neutralizar`).toEqual([]);
      }
      // Presencia del valor neutralizado donde corresponde.
      const hdu = celdasCsv(texto["hdu"]);
      for (const t of [...titulos.slice(0, 4), `${TAB}A`, `${CR}B`]) expect(hdu, `hdu contiene prefijo en ${JSON.stringify(t)}`).toContain(`'${t}`);
      expect(celdasCsv(texto["impedimentos"])).toContain(`'=HYPERLINK("x")`);
      expect(celdasCsv(texto["gestion-impedimentos"]).some((c) => c.startsWith("'=") || c.startsWith("'@") || c.startsWith("'+"))).toBe(true);
      expect(celdasCsv(texto["bitacora"]).some((c) => c.startsWith("'=") || c.includes(`'=1+1`))).toBe(true);
      expect(celdasCsv(texto["certificados"]).some((c) => c.startsWith("'=") || c.includes(`'=1+1`))).toBe(true);
      expect(celdasCsv(texto["auditoria-usuarios"]).some((c) => c.startsWith("'=1+1"))).toBe(true);
      // Los números y las fechas no se prefijan y las columnas no cambian.
      expect(texto["hdu"].split(/\r?\n/)[0]).toBeTruthy();
      expect(celdasCsv(texto["hdu"]).filter((c) => c.startsWith("'")).every((c) => /^'[=+\-@\t\r]/.test(c))).toBe(true);
      // Registro del alcance: las dos HDU con tabulación o CR inicial solo existen si el importador las conserva.
      test.info().annotations.push({ type: "tab-cr", description: `títulos con tabulación/CR inicial guardados: ${conControl}` });
    } finally {
      // Se borran los tres usuarios y su auditoría: los valores absolutos de E7 (inactivos, últimos cambios) deben quedar como antes de la prueba.
      await borrarUsuariosDePrueba([qeA.id, qeB.id, ana.id], t0);
    }
  });
});

/** Texto de todas las tablas de `integraciones` (cada fila como JSON) para buscar secretos y contenido de archivos. */
async function volcarIntegraciones(): Promise<string> {
  const tablas = ["configuracion_jira", "evento_configuracion", "ejecucion_integracion", "detalle_ejecucion"];
  const partes: string[] = [];
  for (const t of tablas) {
    const filas = await sql<{ j: string }>(`SELECT row_to_json(t)::text j FROM integraciones.${t} t`);
    partes.push(...filas.map((f) => f.j));
  }
  return partes.join("\n");
}

/** Celdas de un CSV con separador `;` o `,` y comillas RFC 4180. */
function celdasCsv(texto: string): string[] {
  const sep = texto.split(/\r?\n/)[0].includes(";") ? ";" : ",";
  const celdas: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { actual += '"'; i += 1; }
      else if (ch === '"') comillas = false;
      else actual += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === String.fromCharCode(13) && texto[i + 1] === String.fromCharCode(10)) continue; // terminador de registro CRLF
    else if (ch === sep || ch === String.fromCharCode(10)) { celdas.push(actual); actual = ""; }
    else actual += ch;
  }
  celdas.push(actual);
  return celdas;
}
