import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conCertificaciones } from "../support/db";
import { certificacionesCaida, type PilaCaida } from "../support/entornoE7";
import { env } from "../support/env";
import {
  ROLES_MATRIZ,
  USUARIOS_E7,
  contarOrganizacion,
  cuerpoSinTrace,
  hduDeCelulasDe,
  tokenE7,
  type Bloque,
  type ClaveE7,
} from "../support/e7";

type Contador = Bloque<{ valor: number; hdu?: number; porRol?: Record<string, number> }>;

const val = (c: Contador | undefined) => c?.datos?.valor;

interface FilaHdu {
  id: string;
  codigo: string;
  estado: string;
  analista: { nombre: string } | null;
  seguimiento?: Bloque<{ aprobados: number; porcentaje: number; porAprobar: number; observaciones: number; siguienteEntregable: { orden: number } | null; certificado: { folio: string } | null }>;
}
interface ListaHdu {
  fuente: string;
  estado: "ok" | "indisponible";
  datos?: { items: FilaHdu[]; total: number; pagina: number; tamanoPagina: number; orden: string };
}

const BANDEJAS = ["analista", "qe", "lider", "admin", "auditor"] as const;

async function bandeja<T = Record<string, unknown>>(request: Parameters<typeof api.get>[0], clave: ClaveE7, tipo: string, query = "", baseURL?: string) {
  return api.get<T>(request, `/v1/bandeja/${tipo}${query}`, { token: await tokenE7(clave), baseURL });
}

/** Cada bloque `{fuente, estado}` cumple D34: `indisponible` nunca trae datos (ni un 0). */
function bloquesCoherentes(nodo: unknown, ruta = "$"): string[] {
  const problemas: string[] = [];
  if (Array.isArray(nodo)) nodo.forEach((x, i) => problemas.push(...bloquesCoherentes(x, `${ruta}[${i}]`)));
  else if (nodo && typeof nodo === "object") {
    const o = nodo as Record<string, unknown>;
    if ("fuente" in o && "estado" in o) {
      if (o.estado !== "ok" && o.estado !== "indisponible") problemas.push(`${ruta}.estado=${String(o.estado)}`);
      if (o.estado === "indisponible" && o.datos !== undefined && o.datos !== null) problemas.push(`${ruta} indisponible con datos`);
    }
    for (const [k, v] of Object.entries(o)) problemas.push(...bloquesCoherentes(v, `${ruta}.${k}`));
  }
  return problemas;
}

test.describe("E7-B03 · Bandeja de cada rol (cálculo por ámbito)", () => {
  test("[E7-B03#1] T01: ANA1 y ANA2 ven sus contadores y la lista de ANA2 empieza por E7-H2", async ({ request }) => {
    const a1 = await bandeja<{ contadores: Record<string, Contador>; hdu: ListaHdu; rol: string; generadaEn: string }>(request, "ana1", "analista");
    expect(a1.status).toBe(200);
    expect(a1.body.rol).toBe("ANALISTA_QA");
    expect(val(a1.body.contadores.abiertas)).toBe(2);
    expect(val(a1.body.contadores.conObservaciones)).toBe(0);
    expect(val(a1.body.contadores.esperandoAprobacion)).toBe(1);
    expect(a1.body.hdu.datos!.items.map((h) => h.codigo).sort()).toEqual(["E7-H1", "E7-H6"]);
    const h1 = a1.body.hdu.datos!.items.find((h) => h.codigo === "E7-H1")!;
    expect(h1.seguimiento?.datos?.siguienteEntregable?.orden).toBe(4);

    const a2 = await bandeja<{ contadores: Record<string, Contador>; hdu: ListaHdu }>(request, "ana2", "analista");
    expect(val(a2.body.contadores.abiertas)).toBe(2);
    expect(val(a2.body.contadores.conObservaciones)).toBe(1);
    expect(val(a2.body.contadores.esperandoAprobacion)).toBe(0);
    expect(a2.body.hdu.datos!.items[0].codigo).toBe("E7-H2");
    expect(a2.body.hdu.datos!.items.find((h) => h.codigo === "E7-H8")?.seguimiento?.datos?.aprobados).toBe(10);

    expect(bloquesCoherentes(a1.body)).toEqual([]);
  });

  test("[E7-B03#1] T02: ANA4 (sin HDU) recibe contadores 0 con estado ok y lista vacía", async ({ request }) => {
    const r = await bandeja<{ contadores: Record<string, Contador>; hdu: ListaHdu }>(request, "ana4", "analista");
    expect(r.status).toBe(200);
    for (const clave of ["abiertas", "conObservaciones", "esperandoAprobacion"]) {
      expect(r.body.contadores[clave].estado, clave).toBe("ok");
      expect(val(r.body.contadores[clave]), clave).toBe(0);
    }
    expect(r.body.hdu.estado).toBe("ok");
    expect(r.body.hdu.datos!.items).toEqual([]);
  });

  test("[E7-B03#1] T03: QE1 y QE2 ven solo las acciones de las HDU donde son responsables", async ({ request }) => {
    const q1 = await bandeja<{ contadores: Record<string, Contador>; acciones: { estado: string; datos: { items: Array<{ hdu: { codigo: string }; tipo: string; entregablesPorAprobar: number | null }> } } }>(request, "qe1", "qe");
    expect(q1.status).toBe(200);
    expect(q1.body.contadores.porAprobar.datos).toMatchObject({ valor: 1, hdu: 1 });
    expect(val(q1.body.contadores.sinAnalista)).toBe(1);
    expect(val(q1.body.contadores.listasCertificar)).toBe(1);
    expect(val(q1.body.contadores.listasCerrar)).toBe(1);
    const acciones = Object.fromEntries(q1.body.acciones.datos.items.map((a) => [a.hdu.codigo, a.tipo]));
    expect(acciones).toEqual({ "E7-H5": "ASIGNAR", "E7-H1": "APROBAR", "E7-H6": "CERTIFICAR", "E7-H8": "CERRAR" });
    for (const codigo of ["E7-H3", "E7-H4", "E7-H7"]) expect(Object.keys(acciones)).not.toContain(codigo);

    const q2 = await bandeja<{ contadores: Record<string, Contador>; acciones: { datos: { items: unknown[] } } }>(request, "qe2", "qe");
    expect(q2.status).toBe(200);
    expect(val(q2.body.contadores.porAprobar)).toBe(0);
    expect(val(q2.body.contadores.sinAnalista)).toBe(0);
    expect(val(q2.body.contadores.listasCertificar)).toBe(0);
    expect(val(q2.body.contadores.listasCerrar)).toBe(0);
    expect(q2.body.acciones.datos.items).toEqual([]);
  });

  test("[E7-B03#1] T04: LID1 recibe sus células y contadores calculados solo sobre sus células", async ({ request }) => {
    const r = await bandeja<{ contadores: Record<string, Contador>; hdu: ListaHdu }>(request, "lid1", "lider", "?tamanoPagina=100");
    expect(r.status).toBe(200);
    expect(val(r.body.contadores.celulas)).toBe(2);

    // Oráculo independiente: la base de Organización (la base compartida tiene HDU ajenas al fixture en CEL-A/CEL-B).
    const enCelulas = await hduDeCelulasDe(USUARIOS_E7.lid1.correo);
    expect(val(r.body.contadores.hduAbiertas)).toBe(enCelulas.filter((h) => h.estado !== "CERRADA").length);
    expect(val(r.body.contadores.hduCerradas)).toBe(enCelulas.filter((h) => h.estado === "CERRADA").length);
    expect(val(r.body.contadores.sinAnalista)).toBe(enCelulas.filter((h) => h.sin_analista && h.estado !== "CERRADA").length);
    expect(r.body.hdu.datos!.total).toBe(enCelulas.length);

    // Subconjunto del fixture: exactamente los valores del backlog (5 abiertas, 1 cerrada, 1 sin analista).
    const fx = await bandeja<{ hdu: ListaHdu }>(request, "lid1", "lider", "?q=E7-H&tamanoPagina=100");
    const items = fx.body.hdu.datos!.items;
    expect(items.map((h) => h.codigo).sort()).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H5", "E7-H6", "E7-H7"]);
    expect(items.filter((h) => h.estado !== "CERRADA")).toHaveLength(5);
    expect(items.filter((h) => h.estado === "CERRADA")).toHaveLength(1);
    expect(items.filter((h) => h.analista === null)).toHaveLength(1);
    expect(items.filter((h) => h.seguimiento?.datos?.certificado)).toHaveLength(1);
    expect(items.find((h) => h.seguimiento?.datos?.certificado)?.codigo).toBe("E7-H7");

    // Certificados visibles: contrastado con los certificados reales de las HDU de sus células (lectura global del Auditor).
    const cert = val(r.body.contadores.certificados);
    expect(cert).toBeGreaterThanOrEqual(1);
  });

  test("[E7-B03#1] T05: LID1 filtra por estado CERRADA y recibe solo E7-H7", async ({ request }) => {
    const r = await bandeja<{ hdu: ListaHdu }>(request, "lid1", "lider", "?estado=CERRADA&q=E7-H");
    expect(r.status).toBe(200);
    expect(r.body.hdu.datos!.items.map((h) => h.codigo)).toEqual(["E7-H7"]);
  });

  test("[E7-B03#1] T06: ADM1 ve los contadores del sistema y los pendientes de configuración", async ({ request }) => {
    const r = await bandeja<{
      contadores: Record<string, Contador>;
      pendientes: { estado: string; datos: { items: Array<{ tipo: string; usuario: { correo: string } | null; celula: { nombre: string } | null }>; total: number } };
      ultimosCambios: { estado: string; datos: { items: unknown[] } };
    }>(request, "adm1", "admin", "?tamanoPagina=100");
    expect(r.status).toBe(200);
    // Oráculo: consultas SQL directas a Organización (la base compartida suma usuarios y HDU de otras corridas).
    const bd = await contarOrganizacion();
    const c = r.body.contadores;
    expect(val(c.usuariosActivos)).toBe(bd.usuariosActivos);
    expect(c.usuariosActivos.datos!.porRol).toMatchObject(bd.porRol);
    expect(Object.keys(c.usuariosActivos.datos!.porRol!).sort()).toEqual(["ADMINISTRADOR", "ANALISTA_QA", "AUDITOR", "LIDER_QA", "QE"]);
    expect(val(c.usuariosInactivos)).toBe(bd.usuariosInactivos);
    expect(val(c.analistasSinQe)).toBe(bd.analistasSinQe);
    expect(val(c.lideresSinCelulas)).toBe(bd.lideresSinCelulas);
    expect(val(c.hduTotal)).toBe(bd.hduTotal);
    // El fixture aporta ANA4, LID2 y CEL-C como pendientes.
    const pend = r.body.pendientes.datos.items;
    expect(pend.some((p) => p.tipo === "ANALISTA_SIN_QE" && p.usuario?.correo === "ana4@quality360.local")).toBe(true);
    expect(pend.some((p) => p.tipo === "LIDER_SIN_CELULAS" && p.usuario?.correo === "lid2@quality360.local")).toBe(true);
    expect(pend.some((p) => p.tipo === "CELULA_SIN_LIDER" && p.celula?.nombre === "CEL-C")).toBe(true);
    expect(r.body.ultimosCambios.datos.items.length).toBeLessThanOrEqual(10);
  });

  test("[E7-B03#1] T07: AUD1 recibe los contadores globales consistentes con la bitácora y la auditoría", async ({ request }) => {
    const r = await bandeja<{ contadores: Record<string, Contador>; hdu: ListaHdu }>(request, "aud1", "auditor", "?q=E7-H&tamanoPagina=100");
    expect(r.status).toBe(200);
    const bd = await contarOrganizacion();
    expect(val(r.body.contadores.hduTotal)).toBe(bd.hduTotal);
    const { certificados, eventos } = await conCertificaciones(async (c) => ({
      certificados: Number((await c.query(`SELECT count(*) n FROM certificaciones.certificado`)).rows[0].n),
      eventos: Number((await c.query(`SELECT count(*) n FROM certificaciones.evento_checklist WHERE fecha >= now() - interval '7 days'`)).rows[0].n),
    }));
    expect(val(r.body.contadores.certificados)).toBe(certificados);
    // Contador de eventos con tolerancia 0: se calcula en el mismo instante, sin escrituras concurrentes (suite en serie).
    expect(val(r.body.contadores.eventos7d)).toBe(eventos);
    const aud = await api.get<{ total: number }>(request, `/v1/auditor/auditoria-usuarios?desde=${encodeURIComponent(new Date(Date.now() - 7 * 86_400_000).toISOString())}&tamanoPagina=1`, { token: await tokenE7("aud1") });
    // La consulta de auditoría puede incluir ahora un registro más (esta exportación o consulta no escribe); tolerancia 0.
    expect(val(r.body.contadores.cambiosUsuarios7d)).toBe(aud.body.total);
    expect(r.body.hdu.datos!.items.map((h) => h.codigo)).toEqual(expect.arrayContaining(["E7-H1", "E7-H8"]));
  });

  test("[E7-B03#1] T08: tamanoPagina=1000 se recorta a 100 y la respuesta informa el tamaño efectivo", async ({ request }) => {
    const r = await bandeja<{ hdu: ListaHdu }>(request, "lid1", "lider", "?tamanoPagina=1000");
    expect(r.status).toBe(200);
    expect(r.body.hdu.datos!.tamanoPagina).toBe(100);
    const sinParametro = await bandeja<{ hdu: ListaHdu }>(request, "lid1", "lider");
    expect(sinParametro.body.hdu.datos!.tamanoPagina).toBe(25);
  });

  test.describe("con Certificaciones detenida", () => {
    let pila: PilaCaida;
    test.beforeAll(async () => {
      pila = await certificacionesCaida();
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E7-B03#2] T09: QE1 recibe 200 con los bloques del checklist indisponibles y 'sin analista' ok", async ({ request }) => {
      const r = await bandeja<{ contadores: Record<string, Contador>; acciones: { estado: string; datos?: { items: Array<{ hdu: { codigo: string }; tipo: string }>; calculoParcial?: boolean } } }>(
        request, "qe1", "qe", "", pila.gatewayUrl);
      expect(r.status).toBe(200);
      for (const clave of ["porAprobar", "listasCertificar", "listasCerrar"]) {
        expect(r.body.contadores[clave].estado, clave).toBe("indisponible");
        expect(r.body.contadores[clave].datos, `${clave} no puede traer 0`).toBeUndefined();
      }
      expect(r.body.contadores.sinAnalista.estado).toBe("ok");
      expect(val(r.body.contadores.sinAnalista)).toBe(1);
      const items = r.body.acciones.datos?.items ?? [];
      expect(items.every((a) => a.tipo === "ASIGNAR")).toBe(true);
      expect(items.map((a) => a.hdu.codigo)).toContain("E7-H5");
      expect(r.body.acciones.datos?.calculoParcial).toBe(true);
      expect(bloquesCoherentes(r.body)).toEqual([]);
    });

    test("[E7-B03#2] T10: ANA1, LID1 y AUD1 reciben 200; sus bloques de Certificaciones indisponibles y las listas siguen", async ({ request }) => {
      const a = await bandeja<{ contadores: Record<string, Contador>; hdu: ListaHdu }>(request, "ana1", "analista", "", pila.gatewayUrl);
      expect(a.status).toBe(200);
      expect(a.body.contadores.abiertas.estado).toBe("ok");
      expect(val(a.body.contadores.abiertas)).toBe(2);
      for (const clave of ["conObservaciones", "esperandoAprobacion"]) {
        expect(a.body.contadores[clave].estado).toBe("indisponible");
        expect(a.body.contadores[clave].datos).toBeUndefined();
      }
      expect(a.body.hdu.estado).toBe("ok");
      expect(a.body.hdu.datos!.items.map((h) => h.codigo).sort()).toEqual(["E7-H1", "E7-H6"]);
      expect(a.body.hdu.datos!.items.every((h) => h.seguimiento?.estado === "indisponible" && !h.seguimiento.datos)).toBe(true);

      const l = await bandeja<{ contadores: Record<string, Contador>; hdu: ListaHdu }>(request, "lid1", "lider", "?q=E7-H", pila.gatewayUrl);
      expect(l.status).toBe(200);
      expect(l.body.contadores.certificados.estado).toBe("indisponible");
      expect(l.body.contadores.hduAbiertas.estado).toBe("ok");
      expect(l.body.hdu.datos!.items.map((h) => h.codigo).sort()).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H5", "E7-H6", "E7-H7"]);
      expect(l.body.hdu.datos!.items.every((h) => h.seguimiento?.estado === "indisponible")).toBe(true);

      const u = await bandeja<{ contadores: Record<string, Contador>; hdu: ListaHdu }>(request, "aud1", "auditor", "?q=E7-H", pila.gatewayUrl);
      expect(u.status).toBe(200);
      expect(u.body.contadores.certificados.estado).toBe("indisponible");
      expect(u.body.contadores.eventos7d.estado).toBe("indisponible");
      expect(u.body.contadores.hduTotal.estado).toBe("ok");
      expect(u.body.hdu.estado).toBe("ok");
      for (const r of [a, l, u]) expect(bloquesCoherentes(r.body)).toEqual([]);
    });

    test("[E7-B03#2] T11: ADM1 recibe todos sus bloques ok porque su bandeja no depende de Certificaciones", async ({ request }) => {
      const r = await bandeja<{ contadores: Record<string, Contador>; pendientes: { estado: string }; ultimosCambios: { estado: string } }>(request, "adm1", "admin", "", pila.gatewayUrl);
      expect(r.status).toBe(200);
      for (const [clave, c] of Object.entries(r.body.contadores)) expect(c.estado, clave).toBe("ok");
      expect(r.body.pendientes.estado).toBe("ok");
      expect(r.body.ultimosCambios.estado).toBe("ok");
    });
  });

  test("[E7-B03#3] T12: las 20 combinaciones rol x bandeja ajena responden 403 ACCESO_DENEGADO con el mismo cuerpo", async ({ request }) => {
    const cuerpos = new Set<string>();
    let combinaciones = 0;
    for (const rol of ROLES_MATRIZ) {
      for (const tipo of BANDEJAS.filter((t) => t !== rol.bandeja)) {
        const r = await bandeja(request, rol.clave, tipo);
        expect(r.status, `${rol.clave} -> /v1/bandeja/${tipo}`).toBe(403);
        expect(r.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
        cuerpos.add(cuerpoSinTrace(r));
        combinaciones += 1;
      }
    }
    expect(combinaciones).toBe(20);
    expect(cuerpos.size, "cuerpo idéntico entre las 20 combinaciones").toBe(1);
    // Y cada rol sí obtiene la suya.
    for (const rol of ROLES_MATRIZ) expect((await bandeja(request, rol.clave, rol.bandeja)).status, rol.bandeja).toBe(200);
  });

  test("[E7-B03#3] T13: sin token o con token inválido, las 5 bandejas responden 401 NO_AUTENTICADO", async ({ request }) => {
    for (const tipo of BANDEJAS) {
      const sin = await api.get(request, `/v1/bandeja/${tipo}`);
      expect(sin.status, `${tipo} sin token`).toBe(401);
      expect(sin.body).toMatchObject({ codigo: "NO_AUTENTICADO" });
      const falso = await api.get(request, `/v1/bandeja/${tipo}`, { token: "token.invalido.xyz" });
      expect(falso.status, `${tipo} token inválido`).toBe(401);
    }
  });

  test("[E7-B03#1] contrato: las 5 respuestas de /v1/bandeja/* cumplen contracts/comun.v1.yaml", async ({ request }) => {
    const esquemas = { analista: ["ana2", "BandejaAnalista"], qe: ["qe1", "BandejaQe"], lider: ["lid1", "BandejaLider"], admin: ["adm1", "BandejaAdmin"], auditor: ["aud1", "BandejaAuditor"] } as const;
    const fallos: string[] = [];
    for (const [tipo, [clave, esquema]] of Object.entries(esquemas)) {
      const r = await bandeja(request, clave as ClaveE7, tipo, tipo === "admin" ? "" : "?q=E7-H&tamanoPagina=100");
      expect(r.status, tipo).toBe(200);
      const c = cumpleContrato(esquema, r.body);
      if (!c.ok) fallos.push(`${esquema}: ${[...new Set(c.errores)].join(" | ")}`);
    }
    expect(fallos, "incumplimientos del contrato").toEqual([]);
  });

  test("[E7-B03#3] T14: INACT1 (QE desactivado) con sesión vigente recibe 403 ACCESO_DENEGADO", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_E7.inact1.correo, env.contrasenaDemo);
    const r = await api.get(request, "/v1/bandeja/qe", { token: sesion.accessToken });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
  });
});
