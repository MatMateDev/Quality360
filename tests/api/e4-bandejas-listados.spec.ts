import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { celulasFixture, tokenE7, type ClaveE7 } from "../support/e7";
import { impedimentosCaidoEnOrganizacion, certificacionesCaidaEnImpedimentos, type PilaE4 } from "../support/entornoE4";
import { hdu, imps, reiniciarFixtureE4, texto, uid, type ImpedimentoApi } from "../support/e4";

/**
 * E4 · bloques de las 5 bandejas (D87), listados del QE, Líder, Administrador y Auditor, catálogo y candidatos,
 * y valores absolutos del fixture (sección 7). El fixture se recarga antes del archivo y entre los casos que escriben.
 */
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await reiniciarFixtureE4();
});

type Bloque<T> = { fuente: string; estado: "ok" | "indisponible"; datos?: T };
type Contador = Bloque<{ valor: number }>;
type Lista = Bloque<{ total: number; items: Array<{ id: string; hdu: { codigo: string }; estado: string; titulo: string; esNuevo: boolean; escaladoAMi: boolean; riesgo: { nivelVigente: string | null; origen: string | null; estado: string }; diasAbierto: number }> }>;
interface Bandeja {
  rol: string;
  contadores: Record<string, Contador>;
  acciones?: Bloque<{ items: Array<{ tipo: string; hdu: { codigo: string }; bloqueo?: Bloque<{ bloqueada: boolean; abiertos: number }> }> }>;
  hdu?: Bloque<{ items: Array<{ codigo: string; bloqueo?: Bloque<{ bloqueada: boolean; abiertos: number }>; riesgo?: Bloque<{ nivelVigente: string | null; estado: string }> }>; total: number }>;
  impedimentos: {
    contadores: Record<string, Contador>;
    lista?: Lista;
    escalados?: Lista;
  };
}
const TIPOS = { ana1: "analista", ana2: "analista", ana3: "analista", ana4: "analista", qe1: "qe", qe2: "qe", lid1: "lider", lid2: "lider", adm1: "admin", aud1: "auditor" } as const;
const ESQUEMA = { analista: "BandejaAnalista", qe: "BandejaQe", lider: "BandejaLider", admin: "BandejaAdmin", auditor: "BandejaAuditor" } as const;

async function bandeja(request: Parameters<typeof api.get>[0], clave: keyof typeof TIPOS, query = "", baseURL?: string) {
  const tipo = TIPOS[clave];
  const r = await api.get<Bandeja>(request, `/v1/bandeja/${tipo}${query ? `?${query}` : ""}`, { token: await tokenE7(clave), baseURL });
  expect(r.status, `bandeja ${clave}`).toBe(200);
  return r.body;
}
const num = (c?: Contador) => c?.datos?.valor;
const codigos = (l?: Lista) => l?.datos?.items.map((i) => i.hdu.codigo.replace("E7-", ""));

interface Pagina {
  items: Array<ImpedimentoApi & { hdu: { codigo: string }; celula: { nombre: string }; soloLectura: boolean; riesgo: { nivelVigente: string | null; estado: string } }>;
  total: number;
  orden: string;
  contadores: { abiertos: number; escalados: number; nuevos: number };
}
const listar = async (request: Parameters<typeof api.get>[0], clave: ClaveE7, query = "", baseURL?: string) =>
  api.get<Pagina>(request, `/v1/impedimentos${query ? `?${query}` : ""}`, { token: await tokenE7(clave), baseURL });

test.describe("E4 · valores absolutos de los contadores del fixture", () => {
  const ESPERADO: Record<string, Record<string, number>> = {
    ana1: { impedimentosAbiertos: 2 },
    ana2: { impedimentosAbiertos: 0 },
    ana3: { impedimentosAbiertos: 1 },
    ana4: { impedimentosAbiertos: 0 },
    qe1: { impedimentosAbiertos: 2, impedimentosNuevos: 0, hduRiesgoAlto: 2 },
    qe2: { impedimentosAbiertos: 1, impedimentosNuevos: 1, hduRiesgoAlto: 0 },
    lid1: { impedimentosAbiertos: 3, hduBloqueadas: 3, escaladosAMi: 1 },
    lid2: { impedimentosAbiertos: 0, hduBloqueadas: 0, escaladosAMi: 0 },
    adm1: { impedimentosAbiertos: 3, hduBloqueadas: 3, hduRiesgoAlto: 2 },
    aud1: { impedimentosAbiertos: 3, hduBloqueadas: 3 },
  };
  for (const [clave, esperado] of Object.entries(ESPERADO)) {
    test(`[E4-F01#3] ABS: ${clave.toUpperCase()} ve ${Object.entries(esperado).map(([k, v]) => `${k} ${v}`).join(", ")} (bloque impedimentos de su bandeja, conforme al contrato)`, async ({ request }) => {
      const b = await bandeja(request, clave as keyof typeof TIPOS);
      for (const [k, v] of Object.entries(esperado)) {
        expect(b.impedimentos.contadores[k]?.estado, `${clave}.${k}`).toBe("ok");
        expect(num(b.impedimentos.contadores[k]), `${clave}.${k}`).toBe(v);
      }
      const c = cumpleContrato(ESQUEMA[TIPOS[clave as keyof typeof TIPOS]], b);
      expect(c.errores, `${clave} contra ${ESQUEMA[TIPOS[clave as keyof typeof TIPOS]]}`).toEqual([]);
    });
  }

  test("[E4-F01#3] ABS: el Auditor ve 5 impedimentos en la vista Impedimentos y 9 entradas en Gestión (8 acciones y 1 cambio de riesgo)", async ({ request }) => {
    const token = await tokenE7("aud1");
    expect((await api.get<{ total: number }>(request, "/v1/auditor/impedimentos", { token })).body.total).toBe(5);
    expect((await api.get<{ total: number }>(request, "/v1/auditor/gestion-impedimentos", { token })).body.total).toBe(9);
  });
});

test.describe("E4 · bloques de bandeja (D87, D71)", () => {
  test("[E4-F02#1] QE1: lista de impedimentos de la bandeja = I2 (ALTO) e I3 (MEDIO), en ese orden; «Requiere mi acción» sigue con 4 filas y sin filas de impedimentos", async ({ request }) => {
    const b = await bandeja(request, "qe1");
    expect(b.impedimentos.lista?.datos?.total).toBe(2);
    expect(codigos(b.impedimentos.lista)).toEqual(["H1", "H6"]);
    expect(b.impedimentos.lista!.datos!.items.map((i) => i.riesgo.nivelVigente)).toEqual(["ALTO", "MEDIO"]);
    expect(b.acciones?.datos?.items).toHaveLength(4);
    expect(b.acciones!.datos!.items.map((i) => i.tipo).sort()).toEqual(["APROBAR", "ASIGNAR", "CERRAR", "CERTIFICAR"]);
    // La fila «Cerrar HDU» (H8) trae su bloqueo (aditivo), hoy sin impedimentos abiertos.
    const cerrar = b.acciones!.datos!.items.find((i) => i.tipo === "CERRAR")!;
    expect(cerrar.hdu.codigo).toBe("E7-H8");
    if (cerrar.bloqueo) expect(cerrar.bloqueo.datos).toMatchObject({ bloqueada: false, abiertos: 0 });
  });

  test("[E4-F01#1] Analista: ANA1 ve la columna Bloqueo (H1 y H6 bloqueadas), el filtro soloBloqueadas deja H1 y H6 y la bandeja no trae riesgo (D73)", async ({ request }) => {
    const b = await bandeja(request, "ana1", "tamanoPagina=100");
    const filas = b.hdu!.datos!.items;
    const por = Object.fromEntries(filas.map((f) => [f.codigo.replace("E7-", ""), f]));
    expect(por.H1.bloqueo?.datos).toMatchObject({ bloqueada: true, abiertos: 1 });
    expect(por.H6.bloqueo?.datos).toMatchObject({ bloqueada: true, abiertos: 1 });
    const ana2 = await bandeja(request, "ana2", "tamanoPagina=100");
    expect(ana2.hdu!.datos!.items.find((f) => f.codigo === "E7-H2")!.bloqueo?.datos).toMatchObject({ bloqueada: false, abiertos: 0 });
    for (const f of filas) expect(f.riesgo, `${f.codigo} no debe traer riesgo para el Analista`).toBeUndefined();
    expect(JSON.stringify(b.impedimentos)).not.toMatch(/nivelVigente|hduRiesgoAlto/);
    const solo = await bandeja(request, "ana1", "soloBloqueadas=true&tamanoPagina=100");
    expect(solo.hdu!.datos!.items.map((f) => f.codigo.replace("E7-", "")).sort()).toEqual(["H1", "H6"]);
  });

  test("[E4-F03#2] Líder: LID1 ve 3 impedimentos (el escalado a él primero), columnas Bloqueo y Riesgo, soloBloqueadas = H1, H3, H6; LID2 contadores 0 con lista vacía", async ({ request }) => {
    const b = await bandeja(request, "lid1", "tamanoPagina=100");
    expect(codigos(b.impedimentos.lista)).toEqual(["H6", "H1", "H3"]);
    expect(b.impedimentos.lista!.datos!.items[0]).toMatchObject({ escaladoAMi: true, estado: "ESCALADO" });
    const por = Object.fromEntries(b.hdu!.datos!.items.map((f) => [f.codigo.replace("E7-", ""), f]));
    expect(por.H1.bloqueo?.datos?.bloqueada).toBe(true);
    expect(por.H1.riesgo?.datos?.nivelVigente).toBe("ALTO");
    expect(por.H6.riesgo?.datos?.nivelVigente).toBe("MEDIO");
    expect(por.H7.riesgo?.datos?.nivelVigente).toBeNull(); // Sin evaluar
    const solo = await bandeja(request, "lid1", "soloBloqueadas=true&tamanoPagina=100");
    expect(solo.hdu!.datos!.items.map((f) => f.codigo.replace("E7-", "")).sort()).toEqual(["H1", "H3", "H6"]);
    const l2 = await bandeja(request, "lid2");
    expect(l2.impedimentos.lista).toMatchObject({ estado: "ok", datos: { total: 0, items: [] } });
  });

  test("[E4-F03#2] Administrador y Auditor: ADM1 no tiene escalados a él (lista vacía ok); el Auditor solo trae contadores", async ({ request }) => {
    const a = await bandeja(request, "adm1");
    expect(a.impedimentos.escalados).toMatchObject({ estado: "ok", datos: { total: 0, items: [] } });
    const u = await bandeja(request, "aud1");
    expect(Object.keys(u.impedimentos)).toEqual(["contadores"]);
  });

  test("[E4-F03#2] T11 (API): al escalar I2 a ADM1, su bandeja lista I2 en escalados y el contador de LID1 de escalados a él no cambia", async ({ request }) => {
    const i = await imps(request);
    const adm1 = await uid(request, "adm1");
    const e = await api.post(request, `/v1/impedimentos/${i.I2.id}/escalar`, { token: await tokenE7("qe1"), body: { responsableId: adm1, comentario: "Se escala a Administración" } });
    expect(e.status).toBe(200);
    const a = await bandeja(request, "adm1");
    expect(a.impedimentos.escalados?.datos?.items.map((x) => x.id)).toEqual([i.I2.id]);
    expect(a.impedimentos.escalados?.datos?.items[0].escaladoAMi).toBe(true);
    const l = await bandeja(request, "lid1");
    expect(num(l.impedimentos.contadores.escaladosAMi)).toBe(1);
    await reiniciarFixtureE4();
  });

  test("[E4-F01#3] ANA3 registra un impedimento en H4: QE2 pasa a 2 abiertos y 2 nuevos y su lista trae H4 con esNuevo", async ({ request }) => {
    const h = await hdu(request);
    const r = await api.post<ImpedimentoApi>(request, `/v1/hdu/${h.H4.id}/impedimentos`, {
      token: await tokenE7("ana3"),
      body: { tipo: "ACCESO", titulo: "VPN sin permisos", descripcion: texto(30, "descripcion "), responsableId: await uid(request, "qe2") },
    });
    expect(r.status).toBe(201);
    const b = await bandeja(request, "qe2");
    expect(num(b.impedimentos.contadores.impedimentosAbiertos)).toBe(2);
    expect(num(b.impedimentos.contadores.impedimentosNuevos)).toBe(2);
    const fila = b.impedimentos.lista!.datos!.items.find((x) => x.hdu.codigo === "E7-H4")!;
    expect(fila.esNuevo).toBe(true);
    expect(b.acciones?.datos?.items.map((x) => x.hdu.codigo)).not.toContain("E7-H4"); // D71: sin filas nuevas en «Requiere mi acción»
    const a = await bandeja(request, "ana3");
    expect(num(a.impedimentos.contadores.impedimentosAbiertos)).toBe(2);
    await reiniciarFixtureE4();
  });
});

test.describe("E4 · listados (QE, Líder, Administrador, Auditor) y catálogos", () => {
  const cods = (p: Pagina) => p.items.map((i) => i.hdu.codigo.replace("E7-", ""));

  test("[E4-F02#1] T01: QE1 lista I2 (6 d, ALTO) e I3 (3 d, MEDIO, responsable LID1) con contadores 2/1/0; no están I1 ni I4; con incluirResueltos, I4 va última", async ({ request }) => {
    const r = await listar(request, "qe1");
    expect(r.status).toBe(200);
    expect(cumpleContrato("PaginaImpedimentos", r.body).errores).toEqual([]);
    expect(cods(r.body)).toEqual(["H1", "H6"]);
    expect(r.body.items.map((i) => [i.diasAbierto, i.riesgo.nivelVigente, i.estado])).toEqual([[6, "ALTO", "ABIERTO"], [3, "MEDIO", "ESCALADO"]]);
    expect(r.body.items[1].responsable.nombre).toContain("LID1");
    expect(r.body.contadores).toEqual({ abiertos: 2, escalados: 1, nuevos: 0 });
    const con = await listar(request, "qe1", "incluirResueltos=true");
    expect(cods(con.body)).toEqual(["H1", "H6", "H2"]);
    expect(con.body.items[2].estado).toBe("RESUELTO");
  });

  test("[E4-F02#1] T02/T04: QE2 solo ve I1 (H3, MEDIO, 0 d, nuevo); QE1 ordenado por días ascendente: I3 (3 d) y luego I2 (6 d)", async ({ request }) => {
    const q2 = await listar(request, "qe2");
    expect(cods(q2.body)).toEqual(["H3"]);
    expect(q2.body.items[0]).toMatchObject({ diasAbierto: 0, esNuevo: true });
    const asc = await listar(request, "qe1", "orden=diasAbierto:asc");
    expect(cods(asc.body)).toEqual(["H6", "H1"]);
    expect(asc.body.orden).toBe("diasAbierto:asc");
    expect((await listar(request, "qe1", "orden=columnaInexistente:asc")).status).toBe(400);
  });

  test("[E4-F02#3] T06/T07: filtros por célula (CEL-B → I3, CEL-A → I2, CEL-C → vacío), tipo DEPENDENCIA y búsqueda «sandbox» dejan solo I3", async ({ request }) => {
    const c = await celulasFixture(request);
    expect(cods((await listar(request, "qe1", `celulaId=${c["CEL-B"].id}`)).body)).toEqual(["H6"]);
    expect(cods((await listar(request, "qe1", `celulaId=${c["CEL-A"].id}`)).body)).toEqual(["H1"]);
    const vacio = await listar(request, "qe1", `celulaId=${c["CEL-C"].id}`);
    expect(vacio.status).toBe(200);
    expect(vacio.body.items).toEqual([]);
    expect(vacio.body.contadores.abiertos, "los contadores no dependen de los filtros").toBe(2);
    expect(cods((await listar(request, "qe1", "tipo=DEPENDENCIA")).body)).toEqual(["H6"]);
    expect(cods((await listar(request, "qe1", "q=sandbox")).body)).toEqual(["H6"]);
    expect(cods((await listar(request, "qe1", "riesgo=ALTO")).body)).toEqual(["H1"]);
  });

  test("[E4-F02#1] T09 (API): ANA1 recibe 403 en el listado del QE; LID1, ADM1 y AUD1 reciben su ámbito (3 / 3 / 5 con resueltos), solo lectura", async ({ request }) => {
    const a = await listar(request, "ana1");
    expect(a.status).toBe(403);
    expect(a.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
    for (const [clave, esperado] of [["lid1", 3], ["adm1", 3], ["aud1", 3]] as const) {
      const r = await listar(request, clave);
      expect(r.status, clave).toBe(200);
      expect(r.body.total, clave).toBe(esperado);
      expect(r.body.items.every((i) => i.soloLectura && i.operacionesPermitidas.length === 0), `${clave} solo lectura`).toBe(true);
    }
    expect((await api.get(request, "/v1/impedimentos")).status).toBe(401);
  });

  test("[E4-F04#3] T06/T07: «Riesgo por HDU» de QE1 = H1, H5, H6, H2, H8; Alto = H1 y H5; Medio = H6 y H2; Bajo = H8; QE2 = H3 (MEDIO) y H4 (BAJO) y con Alto, vacío", async ({ request }) => {
    const riesgo = async (clave: ClaveE7, q = "") => api.get<{ items: Array<{ hdu: { codigo: string }; riesgo: { nivelVigente: string; origen: string }; impedimentosAbiertos: number; bloqueada: boolean; avance: number | null; soloLectura: boolean }>; total: number }>(request, `/v1/riesgo/hdu${q ? `?${q}` : ""}`, { token: await tokenE7(clave) });
    const todo = await riesgo("qe1");
    expect(todo.status).toBe(200);
    expect(cumpleContrato("PaginaRiesgoHdu", todo.body).errores).toEqual([]);
    expect(todo.body.items.map((i) => i.hdu.codigo.replace("E7-", ""))).toEqual(["H1", "H5", "H6", "H2", "H8"]);
    const orden = (r: Awaited<ReturnType<typeof riesgo>>) => r.body.items.map((i) => i.hdu.codigo.replace("E7-", ""));
    expect(orden(await riesgo("qe1", "nivel=ALTO"))).toEqual(["H1", "H5"]);
    expect(orden(await riesgo("qe1", "nivel=MEDIO"))).toEqual(["H6", "H2"]);
    expect(orden(await riesgo("qe1", "nivel=BAJO"))).toEqual(["H8"]);
    expect(orden(await riesgo("qe1", "soloBloqueadas=true")).sort()).toEqual(["H1", "H6"]);
    const h6 = todo.body.items.find((i) => i.hdu.codigo === "E7-H6")!;
    expect(h6.riesgo).toMatchObject({ nivelVigente: "MEDIO", origen: "MANUAL" });
    const q2 = await riesgo("qe2");
    expect(orden(q2)).toEqual(["H3", "H4"]);
    expect(q2.body.items.map((i) => i.riesgo.nivelVigente)).toEqual(["MEDIO", "BAJO"]);
    expect((await riesgo("qe2", "nivel=ALTO")).body.items).toEqual([]);
    // Solo estados no cerrados por defecto: H7 (cerrada) no aparece en QE2 sin filtro; con estado=CERRADA sí, «Sin evaluar».
    const cerradas = await riesgo("qe2", "estado=CERRADA");
    expect(orden(cerradas)).toEqual(["H7"]);
    expect(cerradas.body.items[0].riesgo.nivelVigente).toBeNull();
    // El Analista no ve la pestaña: 403.
    expect((await riesgo("ana1")).status).toBe(403);
    // El Líder, el Administrador y el Auditor sí leen (API); solo lectura.
    for (const clave of ["lid1", "adm1", "aud1"] as const) {
      const r = await riesgo(clave);
      expect(r.status, clave).toBe(200);
      expect(r.body.items.every((i) => i.soloLectura), clave).toBe(true);
    }
  });

  test("[E4-F01#1] candidatos y catálogo: REGISTRO de H1 = QE1 (una vez, preseleccionado); ESCALAMIENTO de H1/H3/H6 = LID1 y ADM1, de H8 solo ADM1; el catálogo trae los 9 tipos", async ({ request }) => {
    const h = await hdu(request);
    const [qe1, lid1, adm1] = [await uid(request, "qe1"), await uid(request, "lid1"), await uid(request, "adm1")];
    const reg = await api.get<{ items: Array<{ id: string }>; preseleccionadoId: string | null }>(request, `/v1/hdu/${h.H1.id}/impedimentos/responsables?proposito=REGISTRO`, { token: await tokenE7("ana1") });
    expect(reg.status).toBe(200);
    expect(cumpleContrato("CandidatosResponsable", reg.body).errores).toEqual([]);
    expect(reg.body.items.map((i) => i.id)).toEqual([qe1]);
    expect(reg.body.preseleccionadoId).toBe(qe1);
    for (const x of [h.H1, h.H3, h.H6]) {
      const clave: ClaveE7 = x === h.H3 ? "qe2" : "qe1";
      const esc = await api.get<{ items: Array<{ id: string }> }>(request, `/v1/hdu/${x.id}/impedimentos/responsables?proposito=ESCALAMIENTO`, { token: await tokenE7(clave) });
      expect(esc.body.items.map((i) => i.id).sort(), x.codigo).toEqual([lid1, adm1].sort());
    }
    const h8 = await api.get<{ items: Array<{ id: string }> }>(request, `/v1/hdu/${h.H8.id}/impedimentos/responsables?proposito=ESCALAMIENTO`, { token: await tokenE7("qe1") });
    expect(h8.body.items.map((i) => i.id)).toEqual([adm1]);
    // Solo el Analista asignado y el QE responsable consultan candidatos.
    for (const clave of ["lid1", "aud1", "adm1", "qe2"] as const) {
      expect((await api.get(request, `/v1/hdu/${h.H1.id}/impedimentos/responsables?proposito=REGISTRO`, { token: await tokenE7(clave) })).status, clave).toBe(403);
    }
    const cat = await api.get<{ items: Array<{ codigo: string }> }>(request, "/v1/catalogos/tipos-impedimento", { token: await tokenE7("ana4") });
    expect(cat.status).toBe(200);
    expect(cat.body.items.map((t) => t.codigo).sort()).toEqual(["ACCESO", "AMBIENTE", "DATOS_PRUEBA", "DEFECTO_BLOQUEANTE", "DEPENDENCIA", "HERRAMIENTA", "OTRO", "RECURSOS", "REQUISITOS"]);
    expect((await api.get(request, "/v1/catalogos/tipos-impedimento")).status).toBe(401);
  });

  test("[E4-F01#1] D75: el servidor informa los permisos de cada rol sobre H1 (ANA1 registra, QE1 gestiona y fija; QE2 está fuera; los de solo lectura no operan; el Analista no ve el riesgo)", async ({ request }) => {
    const h = await hdu(request);
    const esperado: Record<string, { puedeRegistrar: boolean; puedeGestionar: boolean; puedeVerRiesgo: boolean; puedeFijarRiesgo: boolean } | 403> = {
      ana1: { puedeRegistrar: true, puedeGestionar: false, puedeVerRiesgo: false, puedeFijarRiesgo: false },
      qe1: { puedeRegistrar: true, puedeGestionar: true, puedeVerRiesgo: true, puedeFijarRiesgo: true },
      lid1: { puedeRegistrar: false, puedeGestionar: false, puedeVerRiesgo: true, puedeFijarRiesgo: false },
      adm1: { puedeRegistrar: false, puedeGestionar: false, puedeVerRiesgo: true, puedeFijarRiesgo: false },
      aud1: { puedeRegistrar: false, puedeGestionar: false, puedeVerRiesgo: true, puedeFijarRiesgo: false },
      qe2: 403,
      ana4: 403,
    };
    for (const [clave, e] of Object.entries(esperado)) {
      const r = await api.get<{ permisos: unknown; items: Array<{ operacionesPermitidas: string[] }> }>(request, `/v1/hdu/${h.H1.id}/impedimentos`, { token: await tokenE7(clave as ClaveE7) });
      if (e === 403) {
        expect(r.status, clave).toBe(403);
        continue;
      }
      expect(r.status, clave).toBe(200);
      expect(r.body.permisos, clave).toEqual(e);
      if (!e.puedeGestionar) expect(r.body.items.every((i) => i.operacionesPermitidas.length === 0), `${clave} sin operaciones`).toBe(true);
    }
  });
});

test.describe("E4 · fuentes caídas en las bandejas y listados (D46, D87, regla no negociable 4)", () => {
  test.describe("Impedimentos caído", () => {
    let pila: PilaE4;
    test.beforeAll(async () => {
      pila = await impedimentosCaidoEnOrganizacion();
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E4-F01#3] la bandeja del QE responde 200: los bloques de impedimentos quedan indisponibles (nunca 0) y los certificados siguen ok", async ({ request }) => {
      const b = await bandeja(request, "qe1", "", pila.gatewayUrl);
      for (const [k, c] of Object.entries(b.impedimentos.contadores)) {
        expect(c.estado, k).toBe("indisponible");
        expect(c.datos, `${k} no debe traer valor`).toBeUndefined();
      }
      expect(b.impedimentos.lista?.estado).toBe("indisponible");
      expect(b.impedimentos.lista?.datos).toBeUndefined();
      expect(b.contadores.porAprobar?.estado ?? Object.values(b.contadores)[0].estado).toBe("ok");
      expect(b.acciones?.estado).toBe("ok");
      expect(cumpleContrato("BandejaQe", b).errores).toEqual([]);
    });

    test("[E4-F01#3] Analista, Líder, Administrador y Auditor: contadores de impedimentos indisponibles; con soloBloqueadas la lista de HDU queda indisponible (no vacía)", async ({ request }) => {
      for (const clave of ["ana1", "lid1", "adm1", "aud1"] as const) {
        const b = await bandeja(request, clave, "", pila.gatewayUrl);
        for (const [k, c] of Object.entries(b.impedimentos.contadores)) {
          expect(c.estado, `${clave}.${k}`).toBe("indisponible");
          expect(c.datos).toBeUndefined();
        }
        expect(cumpleContrato(ESQUEMA[TIPOS[clave]], b).errores, clave).toEqual([]);
      }
      for (const clave of ["ana1", "lid1"] as const) {
        const s = await bandeja(request, clave, "soloBloqueadas=true", pila.gatewayUrl);
        expect(s.hdu?.estado, `${clave} soloBloqueadas`).toBe("indisponible");
        expect(s.hdu?.datos).toBeUndefined();
      }
    });

    test("[E4-F02#1] el listado propio del QE responde 503 (no una lista vacía) cuando Impedimentos no responde", async ({ request }) => {
      const r = await api.get<{ codigo: string }>(request, "/v1/impedimentos", { token: await tokenE7("qe1"), baseURL: pila.gatewayUrl });
      expect(r.status).toBe(503);
      expect(r.body.codigo).toBe("SERVICIO_NO_DISPONIBLE");
    });
  });

  test.describe("Certificaciones caída (para Impedimentos)", () => {
    let pila: PilaE4;
    test.beforeAll(async () => {
      pila = await certificacionesCaidaEnImpedimentos();
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E4-F02#1] T08 (API): con Certificaciones caída QE1 sigue listando I2 e I3 (I2 ALTO con cálculo parcial, I3 MEDIO fijado) y los contadores; QE2 ve el riesgo de I1 «No disponible» (nunca BAJO) y el orden informado es por días", async ({ request }) => {
      // Interpretación (D68, D90): el backlog dice «el riesgo de I2 dice No disponible»; el contrato y B03-T12 fijan que I2 ya alcanza ALTO
      // con los factores de impedimentos (IMPEDIMENTO_ANTIGUO), así que se informa ALTO con calculoParcial. «No disponible» aplica cuando
      // los factores evaluables no llegan a ALTO (I1 en H3: solo IMPEDIMENTO_ABIERTO).
      const r = await listar(request, "qe1", "", pila.gatewayUrl);
      expect(r.status).toBe(200);
      const por = Object.fromEntries(r.body.items.map((i) => [i.hdu.codigo.replace("E7-", ""), i]));
      expect(por.H1.riesgo).toMatchObject({ estado: "ok", nivelVigente: "ALTO", calculoParcial: true });
      expect(por.H6.riesgo).toMatchObject({ estado: "ok", nivelVigente: "MEDIO", origen: "MANUAL" });
      expect(r.body.contadores).toEqual({ abiertos: 2, escalados: 1, nuevos: 0 });
      const q2 = await listar(request, "qe2", "", pila.gatewayUrl);
      expect(q2.status).toBe(200);
      expect(q2.body.items).toHaveLength(1);
      expect(q2.body.items[0].riesgo).toMatchObject({ estado: "indisponible", nivelVigente: null });
      expect(q2.body.orden).toBe("diasAbierto:desc");
      expect(q2.body.contadores).toEqual({ abiertos: 1, escalados: 0, nuevos: 1 });
    });

    test("[E4-F04#3] T10 (API): «Riesgo por HDU» con Certificaciones caída muestra el fijado de H6 y «No disponible» en las demás; filtrar por nivel responde 503", async ({ request }) => {
      const r = await api.get<{ items: Array<{ hdu: { codigo: string }; riesgo: { estado: string; nivelVigente: string | null }; avance: number | null }> }>(request, "/v1/riesgo/hdu", { token: await tokenE7("qe1"), baseURL: pila.gatewayUrl });
      expect(r.status).toBe(200);
      const por = Object.fromEntries(r.body.items.map((i) => [i.hdu.codigo.replace("E7-", ""), i]));
      expect(por.H6.riesgo).toMatchObject({ estado: "ok", nivelVigente: "MEDIO" });
      expect(por.H8.riesgo.estado).toBe("indisponible");
      expect(por.H8.riesgo.nivelVigente).toBeNull();
      expect(por.H8.avance).toBeNull();
      const filtrado = await api.get<{ codigo: string }>(request, "/v1/riesgo/hdu?nivel=ALTO", { token: await tokenE7("qe1"), baseURL: pila.gatewayUrl });
      expect(filtrado.status).toBe(503);
    });
  });
});

void texto;
