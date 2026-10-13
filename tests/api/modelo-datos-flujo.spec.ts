import { expect, test, type APIRequestContext } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import {
  ORDEN_ENTREGABLES,
  NOMBRES_ENTREGABLE,
  aprobarEntregable,
  avanzarChecklist,
  crearHduAsignadaAAna,
  marcarConEnlace,
  type ClaveEntregable,
  type HduConEquipo,
} from "../support/checklist";
import { conCertificaciones, conOrganizacion } from "../support/db";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

/**
 * Corrida «modelo de datos»: al trabajar una HU solo por la API pública (gateway), las filas
 * que quedan en cada esquema son coherentes con el modelo (D23-D27). Las lecturas de base
 * usan el rol de servicio de cada esquema; el cruce entre servicios (id_historia,
 * id_usuario) se hace aquí, en la prueba, nunca con SQL entre esquemas.
 */

interface FilaCertificacion {
  id_certificacion: string;
  numero_ciclo: number;
  estado: string;
  activo: boolean;
  fecha_inicio: Date;
  fecha_fin: Date | null;
  id_historia: string;
}
interface FilaItem {
  id_item_checklist: string;
  nombre: string;
  orden: number;
  clave: string;
  obligatorio: boolean;
  activo: boolean;
  id_certificacion: string;
}
interface FilaEntregable {
  id_entregable: string;
  nombre: string;
  clave: string;
  estado: string;
  id_certificacion: string;
  id_item_checklist: string;
  fecha_validacion: Date | null;
  completado_en: Date | null;
  completado_por_id: string | null;
  aprobado_por_id: string | null;
  observacion: string | null;
}
interface FilaEvidencia {
  id_evidencia: string;
  tipo: string;
  referencia: string;
  fecha_carga: Date;
  id_entregable: string;
  clave: string;
  folio: string | null;
  completado_en: Date | null;
}
interface FilaAsignacion {
  id_asignacion: string;
  id_certificacion: string;
  id_usuario: string;
  fecha_desde: Date;
  fecha_hasta: Date | null;
}
interface FilaCertificado {
  id_certificacion: string;
  hdu_id: string;
  folio: string;
}
interface FotoCertificaciones {
  certificaciones: FilaCertificacion[];
  items: FilaItem[];
  entregables: FilaEntregable[];
  evidencias: FilaEvidencia[];
  asignaciones: FilaAsignacion[];
  certificados: FilaCertificado[];
}

/** Lee, con el rol svc_certificaciones, todo lo que el modelo guarda de una HU (clave de cruce: id_historia). */
async function fotoCertificaciones(hduId: string): Promise<FotoCertificaciones> {
  return conCertificaciones(async (cliente) => {
    const certificaciones = await cliente.query<FilaCertificacion>(
      "select * from certificaciones.certificacion where id_historia = $1 order by numero_ciclo",
      [hduId],
    );
    const ids = certificaciones.rows.map((fila) => fila.id_certificacion);
    const items = await cliente.query<FilaItem>(
      "select * from certificaciones.item_checklist where id_certificacion = any($1::uuid[]) order by id_certificacion, orden",
      [ids],
    );
    const entregables = await cliente.query<FilaEntregable>(
      "select * from certificaciones.entregable where id_certificacion = any($1::uuid[]) order by id_certificacion, clave",
      [ids],
    );
    const evidencias = await cliente.query<FilaEvidencia>(
      `select ev.*, e.clave, e.completado_en
         from certificaciones.evidencia ev join certificaciones.entregable e on e.id_entregable = ev.id_entregable
        where e.id_certificacion = any($1::uuid[]) order by ev.fecha_carga, ev.id_evidencia`,
      [ids],
    );
    const asignaciones = await cliente.query<FilaAsignacion>(
      "select * from certificaciones.asignacion_certificacion where id_certificacion = any($1::uuid[]) order by fecha_desde, id_asignacion",
      [ids],
    );
    const certificados = await cliente.query<FilaCertificado>("select * from certificaciones.certificado where id_certificacion = any($1::uuid[])", [ids]);
    return {
      certificaciones: certificaciones.rows,
      items: items.rows,
      entregables: entregables.rows,
      evidencias: evidencias.rows,
      asignaciones: asignaciones.rows,
      certificados: certificados.rows,
    };
  });
}

/** Evidencia vigente de un entregable: la última cargada desde que se marcó (fecha_carga >= completado_en). */
function evidenciaVigente(foto: FotoCertificaciones, clave: string): FilaEvidencia[] {
  return foto.evidencias.filter((fila) => fila.clave === clave && fila.completado_en !== null && fila.fecha_carga >= fila.completado_en);
}
const entregableDe = (foto: FotoCertificaciones, clave: string): FilaEntregable => {
  const fila = foto.entregables.find((candidata) => candidata.clave === clave);
  if (!fila) throw new Error(`No hay entregable ${clave} en la foto de certificaciones.`);
  return fila;
};

// ---------------------------------------------------------------------------------------------
// Flujo A: crear HU (Carla) -> asignar a Ana -> marcar -> aprobar -> rechazar -> volver a marcar
//          -> reasignar a Beatriz -> marcar -> desmarcar. Se memoriza para que cada prueba
//          verifique un aspecto distinto de las MISMAS filas, sin repetir escrituras.
// ---------------------------------------------------------------------------------------------
interface FlujoA {
  equipo: HduConEquipo;
  celulaId: string;
  sprintId: string;
  beatrizId: string;
  urlPlan: string;
  urlDashboardRechazada: string;
  urlDashboardVigente: string;
  urlCasos: string;
  fotos: Record<"inicio" | "marcado" | "aprobado" | "rechazado" | "remarcado" | "reasignado" | "desmarcado", FotoCertificaciones>;
  checklistApi: { entregables: Array<{ clave: string; estado: string; evidencia: { tipo: string; url?: string } | null }>; resumen: { totalEntregables: number; completados: number } };
}

let flujoA: Promise<FlujoA> | undefined;
function obtenerFlujoA(request: APIRequestContext): Promise<FlujoA> {
  flujoA ??= ejecutarFlujoA(request);
  return flujoA;
}

async function ejecutarFlujoA(request: APIRequestContext): Promise<FlujoA> {
  const equipo = await crearHduAsignadaAAna(request, "MODELO");
  const { hdu, sesionAna, sesionCarla } = equipo;
  const sesionBeatriz = await iniciarSesion(USUARIOS_SEMILLA.beatriz.correo, env.contrasenaDemo);
  const detalle = await api.get<{ celula: { id: string }; sprint: { id: string } }>(request, `/v1/hdu/${hdu.id}`, { token: sesionCarla.accessToken });
  expect(detalle.status).toBe(200);

  const sufijo = Date.now().toString(36);
  const urlPlan = `https://evidencia.quality360.local/modelo/${sufijo}/plan`;
  const urlDashboardRechazada = `https://evidencia.quality360.local/modelo/${sufijo}/dashboard-rechazada`;
  const urlDashboardVigente = `https://evidencia.quality360.local/modelo/${sufijo}/dashboard-vigente`;
  const urlCasos = `https://evidencia.quality360.local/modelo/${sufijo}/casos`;

  const fotos = {} as FlujoA["fotos"];
  fotos.inicio = await fotoCertificaciones(hdu.id);

  await marcarConEnlace(request, sesionAna.accessToken, hdu.id, "PLAN_PRUEBAS", urlPlan);
  fotos.marcado = await fotoCertificaciones(hdu.id);

  await aprobarEntregable(request, sesionCarla.accessToken, hdu.id, "PLAN_PRUEBAS");
  fotos.aprobado = await fotoCertificaciones(hdu.id);

  await marcarConEnlace(request, sesionAna.accessToken, hdu.id, "DASHBOARD", urlDashboardRechazada);
  const rechazo = await api.post(request, `/v1/hdu/${hdu.id}/entregables/DASHBOARD/rechazar`, {
    token: sesionCarla.accessToken,
    body: { comentario: "La evidencia no corresponde (prueba [MODELO])." },
  });
  expect(rechazo.status).toBe(200);
  fotos.rechazado = await fotoCertificaciones(hdu.id);

  await marcarConEnlace(request, sesionAna.accessToken, hdu.id, "DASHBOARD", urlDashboardVigente);
  fotos.remarcado = await fotoCertificaciones(hdu.id);
  const checklist = await api.get<FlujoA["checklistApi"]>(request, `/v1/hdu/${hdu.id}/entregables`, { token: sesionCarla.accessToken });
  expect(checklist.status).toBe(200);

  await aprobarEntregable(request, sesionCarla.accessToken, hdu.id, "DASHBOARD");
  const reasignacion = await api.put(request, `/v1/hdu/${hdu.id}/analista`, {
    token: sesionCarla.accessToken,
    body: { analistaId: sesionBeatriz.userId, motivo: "Reasignación de la prueba [MODELO]" },
  });
  expect(reasignacion.status).toBe(200);
  await marcarConEnlace(request, sesionBeatriz.accessToken, hdu.id, "CASOS_PRUEBA", urlCasos);
  fotos.reasignado = await fotoCertificaciones(hdu.id);

  const desmarcado = await api.post(request, `/v1/hdu/${hdu.id}/entregables/CASOS_PRUEBA/desmarcar`, {
    token: sesionBeatriz.accessToken,
    body: { motivo: "Se vuelve a preparar (prueba [MODELO])." },
  });
  expect(desmarcado.status).toBe(200);
  fotos.desmarcado = await fotoCertificaciones(hdu.id);

  return {
    equipo,
    celulaId: detalle.body.celula.id,
    sprintId: detalle.body.sprint.id,
    beatrizId: sesionBeatriz.userId,
    urlPlan,
    urlDashboardRechazada,
    urlDashboardVigente,
    urlCasos,
    fotos,
    checklistApi: checklist.body,
  };
}

test.describe("[MODELO] Flujo por API: una HU trabajada deja filas coherentes", () => {
  // El flujo A (11 escrituras) comparte el límite de tasa del gateway: una espera de ventana completa cabe holgada.
  test.describe.configure({ timeout: 240_000 });

  test("[MODELO] Organización: la HU creada queda en historia_usuario, con su célula, su QE y su analista, y su sprint vigente en historia_sprint", async ({ request }) => {
    const flujo = await obtenerFlujoA(request);
    const { hdu, sesionAna, sesionCarla } = flujo.equipo;

    await conOrganizacion(async (cliente) => {
      const historia = await cliente.query(
        `select h.id_historia, h.codigo, h.estado, h.prioridad, h.id_celula, h.qe_responsable_id, h.analista_id, h.fecha_creacion, rq.nombre as rol_qe, ra.nombre as rol_analista
           from organizacion.historia_usuario h
           join organizacion.usuario uq on uq.id_usuario = h.qe_responsable_id join organizacion.rol rq on rq.id_rol = uq.id_rol
           left join organizacion.usuario ua on ua.id_usuario = h.analista_id left join organizacion.rol ra on ra.id_rol = ua.id_rol
          where h.id_historia = $1`,
        [hdu.id],
      );
      expect(historia.rowCount).toBe(1);
      expect(historia.rows[0]).toMatchObject({
        id_historia: hdu.id,
        codigo: hdu.codigo,
        estado: "PENDIENTE",
        prioridad: "MEDIA",
        id_celula: flujo.celulaId,
        qe_responsable_id: sesionCarla.userId,
        rol_qe: "QE",
        // La HU se reasignó a Beatriz al final del flujo: el analista vigente es el último.
        analista_id: flujo.beatrizId,
        rol_analista: "ANALISTA_QA",
      });
      expect(historia.rows[0].fecha_creacion).toBeInstanceOf(Date);

      // Sprint de la HU: una fila vigente (fecha_retiro nula) que apunta al sprint elegido al crearla.
      const sprint = await cliente.query<{ id_sprint: string; fecha_retiro: Date | null; fecha_asignacion: Date }>(
        "select id_sprint, fecha_retiro, fecha_asignacion from organizacion.historia_sprint where id_historia = $1",
        [hdu.id],
      );
      expect(sprint.rowCount).toBe(1);
      expect(sprint.rows[0].id_sprint).toBe(flujo.sprintId);
      expect(sprint.rows[0].fecha_retiro).toBeNull();
      expect(sprint.rows[0].fecha_asignacion).toBeInstanceOf(Date);

      // El sprint pertenece a una célula (sprint.id_celula obligatoria) y a ambas se llega por llave foránea.
      const cadena = await cliente.query<{ celula_sprint: string }>(
        `select s.id_celula as celula_sprint from organizacion.historia_sprint hs join organizacion.sprint s on s.id_sprint = hs.id_sprint where hs.id_historia = $1`,
        [hdu.id],
      );
      expect(cadena.rows[0].celula_sprint).toMatch(/^[0-9a-f-]{36}$/);

      // Historial de asignación (tabla de extensión de E2-B04): Ana primero, luego Ana -> Beatriz.
      const asignaciones = await cliente.query<{ analista_anterior_id: string | null; analista_nuevo_id: string }>(
        "select analista_anterior_id, analista_nuevo_id from organizacion.hdu_historial_asignacion where hdu_id = $1 order by fecha, id",
        [hdu.id],
      );
      expect(asignaciones.rows).toEqual([
        { analista_anterior_id: null, analista_nuevo_id: sesionAna.userId },
        { analista_anterior_id: sesionAna.userId, analista_nuevo_id: flujo.beatrizId },
      ]);
    });
  });

  test("[MODELO] Certificaciones: antes del primer cambio de un entregable no existe certificación; el primero crea el ciclo 1 con 10 ítems y 10 entregables PENDIENTE", async ({ request }) => {
    const flujo = await obtenerFlujoA(request);
    const hduId = flujo.equipo.hdu.id;

    // La HU se creó y se asignó, pero nadie ha tocado un entregable: no hay ciclo todavía.
    expect(flujo.fotos.inicio.certificaciones).toHaveLength(0);
    expect(flujo.fotos.inicio.entregables).toHaveLength(0);

    const foto = flujo.fotos.marcado;
    expect(foto.certificaciones).toHaveLength(1);
    expect(foto.certificaciones[0]).toMatchObject({ numero_ciclo: 1, estado: "EN_CURSO", activo: true, id_historia: hduId, fecha_fin: null });
    expect(foto.certificaciones[0].fecha_inicio).toBeInstanceOf(Date);
    const idCiclo = foto.certificaciones[0].id_certificacion;

    expect(foto.items).toHaveLength(10);
    expect(foto.items.map((item) => item.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(foto.items.map((item) => item.clave)).toEqual([...ORDEN_ENTREGABLES]);
    expect(foto.items.map((item) => item.nombre)).toEqual(ORDEN_ENTREGABLES.map((clave) => NOMBRES_ENTREGABLE[clave]));
    for (const item of foto.items) {
      expect(item).toMatchObject({ id_certificacion: idCiclo, obligatorio: true, activo: true });
    }

    expect(foto.entregables).toHaveLength(10);
    for (const entregable of foto.entregables) {
      expect(entregable.id_certificacion).toBe(idCiclo);
      // Cada entregable cuelga de EL ítem del mismo ciclo y la misma clave (llave foránea id_item_checklist).
      const item = foto.items.find((candidato) => candidato.id_item_checklist === entregable.id_item_checklist);
      expect(item, `ítem de ${entregable.clave}`).toBeDefined();
      expect(item).toMatchObject({ clave: entregable.clave, id_certificacion: idCiclo, nombre: entregable.nombre });
      expect(entregable.estado).toBe(entregable.clave === "PLAN_PRUEBAS" ? "POR_APROBAR" : "PENDIENTE");
    }
  });

  test("[MODELO] Certificaciones: marcar y aprobar dejan la evidencia vigente y la validación del QE en el entregable", async ({ request }) => {
    const flujo = await obtenerFlujoA(request);
    const { sesionAna, sesionCarla } = flujo.equipo;

    const marcado = entregableDe(flujo.fotos.marcado, "PLAN_PRUEBAS");
    expect(marcado).toMatchObject({ estado: "POR_APROBAR", completado_por_id: sesionAna.userId, fecha_validacion: null, aprobado_por_id: null });
    expect(marcado.completado_en).toBeInstanceOf(Date);

    // Una evidencia (ENLACE) con la URL entregada por la API, vigente (fecha_carga >= completado_en).
    const evidenciasPlan = flujo.fotos.marcado.evidencias.filter((fila) => fila.clave === "PLAN_PRUEBAS");
    expect(evidenciasPlan).toHaveLength(1);
    expect(evidenciasPlan[0]).toMatchObject({ tipo: "ENLACE", referencia: flujo.urlPlan, id_entregable: marcado.id_entregable });
    expect(evidenciaVigente(flujo.fotos.marcado, "PLAN_PRUEBAS").map((fila) => fila.referencia)).toEqual([flujo.urlPlan]);

    const aprobado = entregableDe(flujo.fotos.aprobado, "PLAN_PRUEBAS");
    expect(aprobado).toMatchObject({ estado: "APROBADO", aprobado_por_id: sesionCarla.userId });
    expect(aprobado.fecha_validacion).toBeInstanceOf(Date);
    expect(aprobado.fecha_validacion!.getTime()).toBeGreaterThanOrEqual(aprobado.completado_en!.getTime());
    // Aprobar no crea ni borra evidencias, y la vigente sigue siendo la misma.
    expect(flujo.fotos.aprobado.evidencias.filter((fila) => fila.clave === "PLAN_PRUEBAS")).toHaveLength(1);
    expect(evidenciaVigente(flujo.fotos.aprobado, "PLAN_PRUEBAS").map((fila) => fila.referencia)).toEqual([flujo.urlPlan]);
    // El resto del checklist sigue intacto: 1 aprobado y 9 entregables sin mover (PENDIENTE).
    expect(flujo.fotos.aprobado.entregables.filter((fila) => fila.estado === "APROBADO")).toHaveLength(1);
    expect(flujo.fotos.aprobado.entregables.filter((fila) => fila.estado === "PENDIENTE")).toHaveLength(9);
  });

  test("[MODELO] Certificaciones: la asignación del analista que marca queda abierta; al cambiar de analista la anterior se cierra con fecha_hasta", async ({ request }) => {
    const flujo = await obtenerFlujoA(request);
    const { sesionAna } = flujo.equipo;

    const tras = flujo.fotos.marcado;
    expect(tras.asignaciones).toHaveLength(1);
    expect(tras.asignaciones[0]).toMatchObject({ id_usuario: sesionAna.userId, id_certificacion: tras.certificaciones[0].id_certificacion, fecha_hasta: null });
    expect(tras.asignaciones[0].fecha_desde).toBeInstanceOf(Date);

    // Beatriz, ya reasignada, marcó CASOS_PRUEBA: queda ella como vigente y Ana cerrada (sin borrar la fila).
    const final = flujo.fotos.reasignado;
    expect(final.asignaciones).toHaveLength(2);
    const [primera, segunda] = final.asignaciones;
    expect(primera).toMatchObject({ id_usuario: sesionAna.userId, id_certificacion: tras.certificaciones[0].id_certificacion });
    expect(primera.fecha_hasta).toBeInstanceOf(Date);
    expect(primera.fecha_hasta!.getTime()).toBeGreaterThanOrEqual(primera.fecha_desde.getTime());
    expect(segunda).toMatchObject({ id_usuario: flujo.beatrizId, fecha_hasta: null });
    expect(segunda.fecha_desde.getTime()).toBeGreaterThanOrEqual(primera.fecha_hasta!.getTime());
    // Nunca dos analistas vigentes a la vez en un mismo ciclo.
    expect(final.asignaciones.filter((fila) => fila.fecha_hasta === null)).toHaveLength(1);
  });

  test("[MODELO] Certificaciones: rechazar y desmarcar conservan la evidencia en el historial, pero dejan de ser vigente", async ({ request }) => {
    const flujo = await obtenerFlujoA(request);

    // Tras el rechazo de DASHBOARD: vuelve a PENDIENTE, sin evidencia vigente, y la fila se conserva.
    const rechazado = entregableDe(flujo.fotos.rechazado, "DASHBOARD");
    expect(rechazado.estado).toBe("PENDIENTE");
    expect(rechazado.completado_en).toBeNull();
    expect(rechazado.observacion).toContain("[MODELO]");
    expect(flujo.fotos.rechazado.evidencias.filter((fila) => fila.clave === "DASHBOARD").map((fila) => fila.referencia)).toEqual([flujo.urlDashboardRechazada]);
    expect(evidenciaVigente(flujo.fotos.rechazado, "DASHBOARD")).toHaveLength(0);

    // Al volver a marcar: 2 filas en historial, solo la nueva vigente.
    const remarcado = flujo.fotos.remarcado.evidencias.filter((fila) => fila.clave === "DASHBOARD");
    expect(remarcado.map((fila) => fila.referencia)).toEqual([flujo.urlDashboardRechazada, flujo.urlDashboardVigente]);
    expect(evidenciaVigente(flujo.fotos.remarcado, "DASHBOARD").map((fila) => fila.referencia)).toEqual([flujo.urlDashboardVigente]);
    expect(entregableDe(flujo.fotos.remarcado, "DASHBOARD").estado).toBe("POR_APROBAR");

    // La API pública muestra la misma evidencia vigente que la base.
    const dashboardApi = flujo.checklistApi.entregables.find((fila) => fila.clave === "DASHBOARD");
    expect(dashboardApi).toMatchObject({ estado: "POR_APROBAR", evidencia: { tipo: "ENLACE", url: flujo.urlDashboardVigente } });

    // Desmarcar CASOS_PRUEBA (Beatriz): vuelve a PENDIENTE, la evidencia se conserva y ya no es vigente.
    expect(entregableDe(flujo.fotos.reasignado, "CASOS_PRUEBA").estado).toBe("POR_APROBAR");
    expect(evidenciaVigente(flujo.fotos.reasignado, "CASOS_PRUEBA").map((fila) => fila.referencia)).toEqual([flujo.urlCasos]);
    expect(entregableDe(flujo.fotos.desmarcado, "CASOS_PRUEBA").estado).toBe("PENDIENTE");
    expect(flujo.fotos.desmarcado.evidencias.filter((fila) => fila.clave === "CASOS_PRUEBA").map((fila) => fila.referencia)).toEqual([flujo.urlCasos]);
    expect(evidenciaVigente(flujo.fotos.desmarcado, "CASOS_PRUEBA")).toHaveLength(0);
  });

  test("[MODELO] cruce entre servicios por UUID: el id_historia y el id_usuario de Certificaciones existen en Organización (verificado desde la prueba, sin SQL entre esquemas)", async ({ request }) => {
    const flujo = await obtenerFlujoA(request);
    const foto = flujo.fotos.desmarcado;
    const hduId = flujo.equipo.hdu.id;

    expect(foto.certificaciones.map((fila) => fila.id_historia)).toEqual([hduId]);
    const usuariosAsignados = [...new Set(foto.asignaciones.map((fila) => fila.id_usuario))];
    expect(usuariosAsignados.sort()).toEqual([flujo.equipo.sesionAna.userId, flujo.beatrizId].sort());

    await conOrganizacion(async (cliente) => {
      const historia = await cliente.query("select 1 from organizacion.historia_usuario where id_historia = $1", [hduId]);
      expect(historia.rowCount).toBe(1);
      const usuarios = await cliente.query<{ id_usuario: string }>("select id_usuario from organizacion.usuario where id_usuario = any($1::uuid[])", [usuariosAsignados]);
      expect(usuarios.rows.map((fila) => fila.id_usuario).sort()).toEqual(usuariosAsignados.sort());
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Flujo B: un ciclo completo hasta COMPLETADA, con certificado.
// ---------------------------------------------------------------------------------------------
test.describe("[MODELO] Flujo por API: ciclo completo", () => {
  test("[MODELO] al aprobar los 10 entregables la certificación pasa a COMPLETADA con fecha_fin y su certificado cuelga del ciclo", async ({ request }) => {
    test.setTimeout(300_000);
    const equipo = await crearHduAsignadaAAna(request, "MODELOFIN");
    const { hdu, sesionAna, sesionCarla } = equipo;

    await avanzarChecklist(request, equipo, 8);
    const antes = await fotoCertificaciones(hdu.id);
    expect(antes.certificaciones).toHaveLength(1);
    expect(antes.certificaciones[0]).toMatchObject({ numero_ciclo: 1, estado: "EN_CURSO", fecha_fin: null });

    const certificado = await api.post<{ certificado: { folio: string } }>(request, `/v1/hdu/${hdu.id}/certificado`, { token: sesionCarla.accessToken });
    expect(certificado.status).toBe(201);
    const folio = certificado.body.certificado.folio;

    const cierre: ClaveEntregable = "CIERRE_PRUEBAS";
    await marcarConEnlace(request, sesionAna.accessToken, hdu.id, cierre, "https://evidencia.quality360.local/modelo/cierre");
    const sinAprobarElUltimo = await fotoCertificaciones(hdu.id);
    expect(sinAprobarElUltimo.certificaciones[0]).toMatchObject({ estado: "EN_CURSO", fecha_fin: null });
    await aprobarEntregable(request, sesionCarla.accessToken, hdu.id, cierre);

    const foto = await fotoCertificaciones(hdu.id);
    expect(foto.certificaciones).toHaveLength(1);
    const ciclo = foto.certificaciones[0];
    expect(ciclo).toMatchObject({ numero_ciclo: 1, estado: "COMPLETADA", id_historia: hdu.id });
    expect(ciclo.fecha_fin).toBeInstanceOf(Date);
    expect(ciclo.fecha_fin!.getTime()).toBeGreaterThanOrEqual(ciclo.fecha_inicio.getTime());

    expect(foto.items).toHaveLength(10);
    expect(foto.entregables).toHaveLength(10);
    expect(foto.entregables.every((fila) => fila.estado === "APROBADO" && fila.fecha_validacion !== null)).toBe(true);

    // Una evidencia vigente por cada uno de los 10 entregables (el certificado como evidencia CERTIFICADO con su folio).
    for (const clave of ORDEN_ENTREGABLES) {
      expect(evidenciaVigente(foto, clave), `evidencia vigente de ${clave}`).toHaveLength(1);
    }
    const evidenciaCertificado = evidenciaVigente(foto, "CERTIFICADO")[0];
    expect(evidenciaCertificado).toMatchObject({ tipo: "CERTIFICADO", folio });

    // El certificado emitido (extensión E3) cuelga del ciclo por llave foránea.
    expect(foto.certificados).toHaveLength(1);
    expect(foto.certificados[0]).toMatchObject({ id_certificacion: ciclo.id_certificacion, hdu_id: hdu.id, folio });

    // Una sola asignación, abierta, a nombre de Ana (la QE que aprueba no abre asignaciones).
    expect(foto.asignaciones).toHaveLength(1);
    expect(foto.asignaciones[0]).toMatchObject({ id_usuario: sesionAna.userId, fecha_hasta: null });
  });
});
