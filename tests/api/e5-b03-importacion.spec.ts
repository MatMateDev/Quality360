import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { env } from "../support/env";
import { uid } from "../support/e4";
import { hduFixture } from "../support/e7";
import {
  PREFIJO_MANUAL, cuerpoArchivo, contarHdu, crearHduManual, destino, detalleEjecucion, ejecuciones, estadoConfigBase, estadoSinConfig, hduPorCodigo,
  importar, leerFixture, limpiarE5, sql, tk, vistaPrevia,
} from "../support/e5";

/** E5-B03 · Importar HDU desde CSV/JSON validando el contenido (3 escenarios, T01..T14). */
test.describe.configure({ mode: "default" }); // cada prueba parte de su propio estado base: un fallo no debe ocultar a las demás
test.afterAll(async () => {
  await limpiarE5();
});

const ENC = "codigo,titulo,descripcion,prioridad,celula,sprint,qe_correo";
const csv = (...filas: string[]) => [ENC, ...filas].join("\n") + "\n";
const IMPORT = "/v1/integraciones/archivos/importaciones";
const upsert = (token: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${env.organizacionUrl}/v1/interno/integraciones/hdu/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
const auditoriaTotal = async () => (await sql<{ n: number }>("SELECT count(*)::int n FROM organizacion.auditoria WHERE entidad = 'HDU'"))[0].n;

test.describe("E5-B03 · Importación de archivos", () => {
  test("[E5-B03#1] T01: la vista previa de historias-validas.csv simula 4 creaciones sin escribir, sin ejecución y sin auditoría", async ({ request }) => {
    await estadoConfigBase(request);
    const hdu0 = await contarHdu(request);
    const aud0 = await auditoriaTotal();
    const r = await vistaPrevia(request, "historias-validas.csv");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ formato: "CSV", filas: 4, crear: 4, actualizar: 0, omitir: 0, errores: 0 });
    expect(r.body.detalle).toHaveLength(4);
    expect(r.body.detalle.map((f: any) => f.codigo)).toEqual(["ARC-1", "ARC-2", "ARC-3", "ARC-4"]);
    expect(cumpleContrato("VistaPreviaArchivo", r.body)).toEqual({ ok: true, errores: [] });
    expect(await contarHdu(request)).toBe(hdu0);
    expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(0);
    expect(await auditoriaTotal()).toBe(aud0);
  });

  test("[E5-B03#1] T02: reglas de fila: código inválido, título de 201, descripción de 1.001 y tabla de prioridades", async ({ request }) => {
    await estadoConfigBase(request);
    const filas = [
      `ARC 99,Código con espacio,,ALTA,,,`,
      `${"C".repeat(41)},Código largo,,ALTA,,,`,
      `E5M-T1,${"t".repeat(201)},,ALTA,,,`,
      `E5M-T2,Descripción larga,${"d".repeat(1001)},ALTA,,,`,
      `E5M-P1,Prioridad alta minúscula,,alta,,,`,
      `E5M-P2,Prioridad Alta,,Alta,,,`,
      `E5M-P3,Prioridad Crítica,,Crítica,,,`,
      `E5M-P4,Prioridad High,,High,,,`,
      `E5M-P5,Prioridad urgente,,urgente,,,`,
    ];
    const contenido = csv(...filas);
    const vp = await vistaPrevia(request, "reglas.csv", {}, contenido);
    expect(vp.status).toBe(200);
    const d = (codigo: string | null) => vp.body.detalle.find((f: any) => f.codigo === codigo);
    expect(vp.body.detalle[0]).toMatchObject({ accion: "ERROR", motivo: "CODIGO_INVALIDO" });
    expect(vp.body.detalle[1]).toMatchObject({ accion: "ERROR", motivo: "CODIGO_INVALIDO" });
    expect(d("E5M-T1")).toMatchObject({ accion: "ERROR", motivo: "TITULO_LARGO" });
    expect(d("E5M-T2")).toMatchObject({ accion: "CREAR" });
    expect(d("E5M-T2").advertencias).toContain("DESCRIPCION_TRUNCADA");
    for (const k of ["E5M-P1", "E5M-P2", "E5M-P3", "E5M-P4"]) expect(d(k), k).toMatchObject({ accion: "CREAR" });
    expect(d("E5M-P5")).toMatchObject({ accion: "ERROR", motivo: "PRIORIDAD_INVALIDA" });
    // Se importa para comprobar la prioridad resultante y el recorte de la descripción.
    const imp = await importar(request, "reglas.csv", {}, contenido);
    expect(imp.status).toBe(200);
    expect(imp.body).toMatchObject({ creadas: 5, conError: 4 });
    const prio = async (k: string) => (await hduPorCodigo(request, k)).prioridad;
    expect([await prio("E5M-P1"), await prio("E5M-P2"), await prio("E5M-P3"), await prio("E5M-P4")]).toEqual(["ALTA", "ALTA", "CRITICA", "ALTA"]);
    expect((await hduPorCodigo(request, "E5M-T2")).descripcion).toHaveLength(1000);
  });

  test("[E5-B03#1] T03 (negativo): errores de estructura del archivo con su código y estado; ninguno crea HDU", async ({ request }) => {
    await estadoConfigBase(request);
    const hdu0 = await contarHdu(request);
    const mil = csv(...Array.from({ length: 501 }, (_, i) => `E5M-L${i},Título ${i},,ALTA,,,`));
    const grande = csv(`E5M-G1,${"x".repeat(1_200_000)},,ALTA,,,`);
    const casos: Array<{ nombre: string; formato: string; contenido: string; status: number; codigo: string; faltantes?: string[] }> = [
      { nombre: "vacío", formato: "CSV", contenido: "", status: 422, codigo: "ARCHIVO_VACIO" },
      { nombre: "solo encabezado", formato: "CSV", contenido: `${ENC}\n`, status: 422, codigo: "ARCHIVO_VACIO" },
      { nombre: "501 filas", formato: "CSV", contenido: mil, status: 422, codigo: "DEMASIADAS_FILAS" },
      { nombre: "1,2 MB", formato: "CSV", contenido: grande, status: 413, codigo: "ARCHIVO_MUY_GRANDE" },
      { nombre: "formato XLSX", formato: "XLSX", contenido: "PK\u0003\u0004", status: 422, codigo: "FORMATO_NO_SOPORTADO" },
      { nombre: "CSV con comillas sin cerrar", formato: "CSV", contenido: `${ENC}\nE5M-Q1,"sin cerrar,,ALTA,,,\n`, status: 422, codigo: "ARCHIVO_ILEGIBLE" },
      { nombre: "JSON {", formato: "JSON", contenido: "{", status: 422, codigo: "ARCHIVO_ILEGIBLE" },
      { nombre: 'JSON {"a":1}', formato: "JSON", contenido: '{"a":1}', status: 422, codigo: "ARCHIVO_ILEGIBLE" },
      { nombre: "CSV sin codigo ni titulo", formato: "CSV", contenido: "descripcion,prioridad\nalgo,ALTA\n", status: 422, codigo: "COLUMNAS_FALTANTES", faltantes: ["codigo", "titulo"] },
    ];
    for (const c of casos) {
      for (const ruta of ["vista-previa", "importaciones"] as const) {
        const r = await api.post<any>(request, `/v1/integraciones/archivos/${ruta}`, { token: await tk("adm1"), body: { formato: c.formato, nombre: "x.dat", contenido: c.contenido } });
        expect(r.status, `${c.nombre} (${ruta})`).toBe(c.status);
        expect(r.body.codigo, `${c.nombre} (${ruta})`).toBe(c.codigo);
        if (c.faltantes) expect([...r.body.columnasFaltantes].sort()).toEqual(c.faltantes);
        if (c.status === 413) expect(r.body.mensaje).toContain("1 MB");
      }
    }
    // Columna extra: pasa con COLUMNA_IGNORADA.
    const extra = await vistaPrevia(request, "extra.csv", {}, "codigo,titulo,notas\nE5M-X1,Con columna extra,algo\n");
    expect(extra.status).toBe(200);
    expect(extra.body).toMatchObject({ crear: 1, columnasIgnoradas: ["notas"] });
    expect(extra.body.advertencias).toBeGreaterThan(0);
    expect(await contarHdu(request)).toBe(hdu0);
  });

  test("[E5-B03#2] T04: actualizar solo título y prioridad, vacío no borra, y la auditoría guarda antes y después", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await importar(request, "historias-validas.csv")).body.creadas).toBe(4);
    const antes = await hduPorCodigo(request, "ARC-1");
    expect(antes.descripcion).toBe("Registro básico");
    const nuevo = csv("ARC-1,Alta de cliente v2,   ,CRITICA,,,");
    const r = await importar(request, "actualiza.csv", {}, nuevo);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ actualizadas: 1, creadas: 0, omitidas: 0, conError: 0 });
    const fila = (await detalleEjecucion(request, r.body.id)).body.items[0];
    expect(fila).toMatchObject({ resultado: "ACTUALIZADA", codigo: "ARC-1" });
    expect(Object.keys(fila.cambios).sort()).toEqual(["prioridad", "titulo"]);
    expect(fila.cambios.prioridad).toEqual({ antes: "ALTA", despues: "CRITICA" });
    expect(fila.cambios.titulo).toEqual({ antes: "Alta de cliente", despues: "Alta de cliente v2" });
    const despues = await hduPorCodigo(request, "ARC-1");
    expect(despues.descripcion).toBe("Registro básico");
    const aud = await sql<{ accion: string; antes: any; despues: any }>(
      `SELECT accion, antes, despues FROM organizacion.auditoria WHERE entidad = 'HDU' AND entidad_id = $1 AND accion = 'ACTUALIZAR_HDU'`, [antes.id]);
    expect(aud).toHaveLength(1);
    expect(JSON.stringify(aud[0].antes)).toContain("Alta de cliente");
    expect(JSON.stringify(aud[0].despues)).toContain("Alta de cliente v2");
  });

  test("[E5-B03#2] T05: una HDU en trabajo conserva estado, analista, QE, célula, sprint, checklist, impedimentos y riesgo; solo cambian título y prioridad", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await importar(request, "historias-validas.csv")).body.creadas).toBe(4);
    const h = await hduPorCodigo(request, "ARC-1");
    const qe2 = await tk("qe2");
    const ana3 = await tk("ana3");
    const analista = await uid(request, "ana3");
    const a = await api.put(request, `/v1/hdu/${h.id}/analista`, { token: qe2, body: { analistaId: analista } });
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    const e = await api.post(request, `/v1/hdu/${h.id}/estado`, { token: qe2, body: { estado: "DISENO_PRUEBAS" } });
    expect(e.status, JSON.stringify(e.body)).toBe(200);
    const m = await api.post(request, `/v1/hdu/${h.id}/entregables/PLAN_PRUEBAS/marcar`, { token: ana3, body: { evidencia: { tipo: "ENLACE", url: "https://evidencia.quality360.local/arc1" } } });
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    const imp = await api.post(request, `/v1/hdu/${h.id}/impedimentos`, {
      token: ana3, body: { tipo: "AMBIENTE", titulo: "Ambiente de ARC-1 caído", descripcion: "El ambiente de pruebas de ARC-1 no responde desde ayer.", responsableNombre: "Equipo de Infraestructura" },
    });
    expect(imp.status, JSON.stringify(imp.body)).toBe(201);
    const ri = await api.put(request, `/v1/hdu/${h.id}/riesgo`, { token: qe2, body: { nivel: "MEDIO", justificacion: "Dependencia con otro equipo para ARC-1" } });
    expect(ri.status, JSON.stringify(ri.body)).toBe(200);

    const foto = async () => ({
      hdu: ((r) => { const { titulo: _t, prioridad: _p, actualizadoEn: _a, ...resto } = r; return resto; })((await api.get<any>(request, `/v1/hdu/${h.id}`, { token: qe2 })).body),
      checklist: (await api.get<any>(request, `/v1/hdu/${h.id}/entregables`, { token: qe2 })).body,
      impedimentos: (await api.get<any>(request, `/v1/hdu/${h.id}/impedimentos`, { token: qe2 })).body,
      riesgo: (await api.get<any>(request, `/v1/hdu/${h.id}/riesgo`, { token: qe2 })).body,
      historial: (await api.get<any>(request, `/v1/hdu/${h.id}/historial`, { token: qe2 })).body.items.length,
    });
    const antes = await foto();
    const celulaA = (await destino(request)).celulaA;
    const r = await importar(request, "intenta-mover.csv", {}, csv(`ARC-1,Alta de cliente con título nuevo,,CRITICA,CEL-A,E5 Sprint 2,qe1@quality360.local`));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ actualizadas: 1, conError: 0 });
    const despues = await foto();
    expect(despues).toEqual(antes);
    expect(celulaA).toBeTruthy();
    const ahora = await hduPorCodigo(request, "ARC-1");
    expect(ahora).toMatchObject({ titulo: "Alta de cliente con título nuevo", prioridad: "CRITICA", estado: "DISENO_PRUEBAS" });
    expect(ahora.analista.id).toBe(analista);
    expect(ahora.qeResponsable.id).toBe((await destino(request)).qeId);
    expect(ahora.celula.nombre).toBe("CEL-C");
    expect(ahora.sprint.nombre).toBe("E5 Sprint 2"); // el de la fila al crear; el archivo con CEL-A y otro sprint no lo cambia
  });

  test("[E5-B03#2] T06: importar dos veces el mismo archivo no duplica: la 2.ª deja 4 omitidas SIN_CAMBIOS y no suma auditoría", async ({ request }) => {
    await estadoConfigBase(request);
    const a = await importar(request, "historias-validas.csv");
    expect(a.body).toMatchObject({ creadas: 4, resultado: "EXITOSA" });
    const aud = await auditoriaTotal();
    const b = await importar(request, "historias-validas.csv");
    expect(b.body).toMatchObject({ creadas: 0, actualizadas: 0, omitidas: 4, resultado: "EXITOSA" });
    const filas = (await detalleEjecucion(request, b.body.id)).body.items;
    expect(filas.every((f: any) => f.resultado === "OMITIDA" && f.motivo === "SIN_CAMBIOS")).toBe(true);
    expect(await auditoriaTotal()).toBe(aud);
  });

  test("[E5-B03#2] T07: el código se compara sin distinguir mayúsculas; arc-9 duplicado en el archivo y alta manual duplicada", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await importar(request, "historias-validas.csv")).body.creadas).toBe(4);
    const r1 = await importar(request, "mayus.csv", {}, csv("arc-1,Alta de cliente en minúsculas,,ALTA,,,"));
    expect(r1.body).toMatchObject({ actualizadas: 1, creadas: 0 });
    expect(await sql("SELECT 1 FROM organizacion.historia_usuario WHERE codigo_normalizado = 'arc-1'")).toHaveLength(1);
    const r2 = await importar(request, "dup.csv", {}, csv("ARC-9,Nueve,,ALTA,,,", "arc-9,Nueve minúscula,,ALTA,,,"));
    expect(r2.body).toMatchObject({ creadas: 1, conError: 1 });
    const filas = (await detalleEjecucion(request, r2.body.id)).body.items;
    expect(filas.find((f: any) => f.codigo === "arc-9")).toMatchObject({ resultado: "ERROR", motivo: "CODIGO_DUPLICADO_EN_ARCHIVO" });
    const d = await destino(request);
    const manual = await api.post<any>(request, "/v1/hdu", { token: await tk("qe2"), body: { codigo: "arc-1", titulo: "Manual", celulaId: d.celulaId, sprintId: d.sprint1Id, prioridad: "MEDIA" } });
    expect(manual.status).toBe(409);
    expect(manual.body.codigo).toBe("CODIGO_HDU_DUPLICADO");
  });

  test("[E5-B03#2] T08: una HDU manual se omite salvo que se pida vincular (entonces pasa a CSV); una cerrada nunca se modifica", async ({ request }) => {
    await estadoConfigBase(request);
    const h = await hduFixture(request);
    const h1 = h["E7-H1"];
    const h7 = h["E7-H7"];
    const contenido = csv(`${h1.codigo},Título desde archivo,,CRITICA,,,`, `${h7.codigo},Cerrada desde archivo,,CRITICA,,,`);
    const sin = await importar(request, "manual.csv", {}, contenido);
    expect(sin.body).toMatchObject({ omitidas: 2, actualizadas: 0 });
    const f1 = (await detalleEjecucion(request, sin.body.id)).body.items;
    expect(f1.find((f: any) => f.codigo === h1.codigo)).toMatchObject({ resultado: "OMITIDA", motivo: "HDU_MANUAL_EXISTENTE" });
    expect(f1.find((f: any) => f.codigo === h7.codigo).motivo).toMatch(/HDU_MANUAL_EXISTENTE|HDU_CERRADA/);
    const antesH7 = (await hduPorCodigo(request, h7.codigo)).titulo;
    const antesH1 = await hduPorCodigo(request, h1.codigo);
    try {
      const con = await importar(request, "manual.csv", { vincularExistentes: true }, contenido);
      expect(con.body).toMatchObject({ actualizadas: 1, omitidas: 1 });
      const f2 = (await detalleEjecucion(request, con.body.id)).body.items;
      expect(f2.find((f: any) => f.codigo === h1.codigo).resultado).toBe("ACTUALIZADA");
      expect(f2.find((f: any) => f.codigo === h7.codigo)).toMatchObject({ resultado: "OMITIDA", motivo: "HDU_CERRADA" });
      expect((await hduPorCodigo(request, h1.codigo))).toMatchObject({ titulo: "Título desde archivo", origen: "CSV", estado: antesH1.estado });
      expect((await hduPorCodigo(request, h7.codigo)).titulo).toBe(antesH7);
    } finally {
      // H1 es del fixture compartido: se devuelve a su título, prioridad y origen para no romper otras suites.
      await sql("UPDATE organizacion.historia_usuario SET titulo = $1, prioridad = $2, origen = 'MANUAL' WHERE id_historia = $3", [antesH1.titulo, antesH1.prioridad, antesH1.id]);
    }
  });

  test("[E5-B03#3] T09: modo normal importa las válidas e informa cada error; modo estricto no importa nada; estricto sin errores importa todo", async ({ request }) => {
    await estadoConfigBase(request);
    const n = await importar(request, "historias-con-errores.csv");
    expect(n.status).toBe(200);
    expect(n.body).toMatchObject({ creadas: 2, conError: 7, resultado: "CON_ERRORES", leidas: 9 });
    const filas = (await detalleEjecucion(request, n.body.id, "tamanoPagina=100&soloErrores=true")).body.items;
    expect(filas.map((f: any) => f.motivo).sort()).toEqual([
      "CELULA_NO_ENCONTRADA", "CODIGO_DUPLICADO_EN_ARCHIVO", "CODIGO_INVALIDO", "CODIGO_INVALIDO", "PRIORIDAD_INVALIDA", "QE_INVALIDO", "SPRINT_NO_ENCONTRADO",
    ]);
    expect(await sql("SELECT codigo FROM organizacion.historia_usuario WHERE codigo LIKE 'ARC-1%' ORDER BY codigo")).toEqual([{ codigo: "ARC-10" }, { codigo: "ARC-16" }]);
    await limpiarE5();
    await estadoConfigBase(request);
    const e = await importar(request, "historias-con-errores.csv", { estricto: true });
    expect(e.status).toBe(200);
    expect(e.body).toMatchObject({ resultado: "FALLIDA", codigoError: "MODO_ESTRICTO", creadas: 0, conError: 7, estricto: true });
    expect(await sql("SELECT 1 FROM organizacion.historia_usuario WHERE codigo LIKE 'ARC-1%'")).toHaveLength(0);
    const ok = await importar(request, "historias-validas.csv", { estricto: true });
    expect(ok.body).toMatchObject({ resultado: "EXITOSA", creadas: 4 });
  });

  test("[E5-B03#3] T10: si una HDU se crea a mano entre la vista previa y la confirmación, esa fila se omite y las demás se crean completas", async ({ request }) => {
    await estadoConfigBase(request);
    const contenido = csv(`${PREFIJO_MANUAL}10,Primera,,ALTA,,,`, `${PREFIJO_MANUAL}11,Segunda,,ALTA,,,`, `${PREFIJO_MANUAL}12,Tercera,,ALTA,,,`);
    const vp = await vistaPrevia(request, "carrera.csv", {}, contenido);
    expect(vp.body).toMatchObject({ crear: 3 });
    expect((await crearHduManual(request, `${PREFIJO_MANUAL}11`)).status).toBe(201);
    const r = await importar(request, "carrera.csv", {}, contenido);
    expect(r.body).toMatchObject({ creadas: 2, omitidas: 1, conError: 0 });
    const filas = (await detalleEjecucion(request, r.body.id)).body.items;
    expect(filas[1]).toMatchObject({ resultado: "OMITIDA", motivo: "HDU_MANUAL_EXISTENTE" });
    for (const k of [`${PREFIJO_MANUAL}10`, `${PREFIJO_MANUAL}12`]) {
      const h = await hduPorCodigo(request, k);
      const hist = await api.get<any>(request, `/v1/hdu/${h.id}/historial`, { token: await tk("aud1") });
      expect(hist.body.items.length, `historial inicial de ${k}`).toBeGreaterThanOrEqual(1);
    }
  });

  test("[E5-B03#1] T11 (negativo): QE1, ANA1, LID1 y AUD1 reciben 403 en vista previa e importación; sin token 401; no hay HDU ni ejecuciones", async ({ request }) => {
    await estadoConfigBase(request);
    const hdu0 = await contarHdu(request);
    const cuerpo = cuerpoArchivo("historias-validas.csv");
    for (const clave of ["qe1", "ana1", "lid1", "aud1"] as const) {
      for (const ruta of ["vista-previa", "importaciones"]) {
        const r = await api.post(request, `/v1/integraciones/archivos/${ruta}`, { token: await tk(clave), body: cuerpo });
        expect(r.status, `${clave} ${ruta}`).toBe(403);
        expect((r.body as any).codigo).toBe("ACCESO_DENEGADO");
      }
    }
    for (const ruta of ["vista-previa", "importaciones"]) {
      const r = await api.post(request, `/v1/integraciones/archivos/${ruta}`, { body: cuerpo });
      expect(r.status).toBe(401);
      expect((r.body as any).codigo).toBe("NO_AUTENTICADO");
    }
    expect(await contarHdu(request)).toBe(hdu0);
    expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(0);
  });

  test("[E5-B03#1] T12 (negativo): con el QE por defecto desactivado y una fila con INACT1, esas filas dan QE_INVALIDO y no hay 5xx", async ({ request }) => {
    await estadoConfigBase(request);
    const inact = "inact1@quality360.local";
    const qe2Id = await uid(request, "qe2");
    await sql("UPDATE organizacion.usuario SET activo = false WHERE id_usuario = $1", [qe2Id]);
    try {
      const r = await importar(request, "qe-inactivo.csv", {}, csv("E5M-Q1,Con el QE por defecto,,ALTA,,,", `E5M-Q2,Con INACT1,,ALTA,,,${inact}`));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ creadas: 0, conError: 2 });
      const filas = (await detalleEjecucion(request, r.body.id)).body.items;
      expect(filas.map((f: any) => f.motivo)).toEqual(["QE_INVALIDO", "QE_INVALIDO"]);
      expect(await sql("SELECT 1 FROM organizacion.historia_usuario WHERE codigo LIKE 'E5M-Q%'")).toHaveLength(0);
    } finally {
      await sql("UPDATE organizacion.usuario SET activo = true WHERE id_usuario = $1", [qe2Id]);
    }
  });

  test("[E5-B03#3] T13 (negativo): el upsert interno de Organización exige un Administrador: QE1 403, servicio 403, sin token 401, 26 filas 400 y 25 válidas 200", async ({ request }) => {
    await estadoConfigBase(request);
    const d = await destino(request);
    const fila = (n: number) => ({ fila: n, codigo: `${PREFIJO_MANUAL}U${n}`, titulo: `Upsert ${n}`, descripcion: null, prioridad: "MEDIA" });
    const lote = (n: number) => ({
      origen: "CSV", soloSimular: false, vincularExistentes: false, estricto: false, sprintNoEncontrado: "ERROR",
      destino: { celulaId: d.celulaId, qeResponsableId: d.qeId, sprintRespaldoId: d.sprint1Id },
      filas: Array.from({ length: n }, (_, i) => fila(i + 1)),
    });
    const cod = async (r: Response) => ((await r.json().catch(() => ({}))) as { codigo?: string }).codigo;
    const qe1 = await upsert(await tk("qe1"), lote(1));
    expect([qe1.status, await cod(qe1)]).toEqual([403, "ACCESO_DENEGADO"]);
    const servicio = await upsert("", lote(1), { "X-Q360-Servicio-Token": env.servicioToken });
    expect([servicio.status, await cod(servicio)]).toEqual([403, "ACCESO_DENEGADO"]); // el token de servicio de la semilla no sirve aquí (D100)
    const sinToken = await upsert("", lote(1));
    expect([sinToken.status, await cod(sinToken)]).toEqual([401, "NO_AUTENTICADO"]);
    const veintiseis = await upsert(await tk("adm1"), lote(26));
    expect([veintiseis.status, await cod(veintiseis)]).toEqual([400, "VALIDACION"]);
    const ok = await upsert(await tk("adm1"), lote(25));
    const cuerpo = (await ok.json()) as { filas?: unknown[] };
    expect(ok.status, JSON.stringify(cuerpo).slice(0, 400)).toBe(200);
    expect(await sql("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE codigo LIKE $1", [`${PREFIJO_MANUAL}U%`])).toEqual([{ n: 25 }]);
  });

  test("[E5-B03#2] T14: historias-validas.json crea 3 HDU con origen JSON y acepta qeCorreo y qe_correo", async ({ request }) => {
    await estadoConfigBase(request);
    const r = await importar(request, "historias-validas.json");
    expect(r.body).toMatchObject({ origen: "JSON", creadas: 3, resultado: "EXITOSA" });
    for (const k of ["ARC-J1", "ARC-J2", "ARC-J3"]) expect((await hduPorCodigo(request, k)).origen).toBe("JSON");
    const claves = JSON.stringify([
      { codigo: "ARC-J4", titulo: "Con qeCorreo", qeCorreo: "qe2@quality360.local" },
      { codigo: "ARC-J5", titulo: "Con qe_correo", qe_correo: "qe2@quality360.local" },
    ]);
    const r2 = await importar(request, "claves.json", {}, claves);
    expect(r2.body).toMatchObject({ creadas: 2, conError: 0 });
    // Hash del contenido (E5-B04-T02) disponible también para JSON.
    expect(r2.body.archivo.huella).toBe(createHash("sha256").update(claves).digest("hex"));
    void leerFixture; void estadoSinConfig; void ejecuciones; void IMPORT;
  });
});
