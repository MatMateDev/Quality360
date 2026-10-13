import type pg from "pg";
import { conCertificaciones, conImpedimentos, conOrganizacion } from "./db";

/**
 * Modelo de datos de Quality360 (corrida «modelo de datos», D23-D27 en
 * `docs/arquitectura/decisiones-mvp.md`). Las expectativas de este archivo salen del
 * modelo ER y lógico (`docs/arquitectura/modelo-datos/*.pdf`) y de la tabla «Distribución
 * y relaciones» de las decisiones, NO de la salida de la base: si la base cambia, estas
 * pruebas deben fallar.
 */
export type Esquema = "organizacion" | "certificaciones" | "impedimentos";
export const ESQUEMAS: Esquema[] = ["organizacion", "certificaciones", "impedimentos"];

/** Rol de servicio (sin superusuario) que opera cada esquema (regla no negociable 1). */
export const ROL_DE: Record<Esquema, string> = {
  organizacion: "svc_organizacion",
  certificaciones: "svc_certificaciones",
  impedimentos: "svc_impedimentos",
};

export const conServicio: Record<Esquema, <T>(fn: (cliente: pg.Client) => Promise<T>) => Promise<T>> = {
  organizacion: conOrganizacion,
  certificaciones: conCertificaciones,
  impedimentos: conImpedimentos,
};

/**
 * Tipos esperados, en una notación corta. Sufijo `?` = admite nulo.
 * `uuid`, `bool` (boolean), `tstz` (timestamptz), `date`, `int`, `text`, `varchar(N)`,
 * `enum` (tipo enumerado de Postgres, D27).
 */
export type TipoColumna = string;

/** Columnas del modelo ER (con los ajustes D26) por tabla. */
export const COLUMNAS_MODELO: Record<Esquema, Record<string, Record<string, TipoColumna>>> = {
  organizacion: {
    rol: { id_rol: "uuid", nombre: "varchar(30)", descripcion: "varchar(150)?" },
    usuario: {
      id_usuario: "uuid",
      nombre: "varchar(120)",
      email: "varchar(150)",
      activo: "bool",
      fecha_creacion: "tstz",
      id_rol: "uuid",
    },
    supervision: {
      id_supervision: "uuid",
      fecha_desde: "tstz",
      fecha_hasta: "tstz?",
      id_supervisor: "uuid",
      id_supervisado: "uuid",
    },
    celula: { id_celula: "uuid", nombre: "varchar(100)", descripcion: "varchar(250)?", activo: "bool" },
    sprint: {
      id_sprint: "uuid",
      nombre: "varchar(100)",
      fecha_inicio: "date",
      fecha_fin: "date",
      estado: "enum",
      id_celula: "uuid",
    },
    historia_usuario: {
      id_historia: "uuid",
      codigo: "varchar(50)",
      titulo: "varchar(200)",
      descripcion: "varchar(1000)?",
      estado: "enum",
      prioridad: "enum", // obligatoria (D26, E2-B01)
      fecha_creacion: "tstz",
      id_celula: "uuid",
    },
    historia_sprint: {
      id_historia_sprint: "uuid",
      fecha_asignacion: "date",
      fecha_retiro: "date?",
      id_historia: "uuid",
      id_sprint: "uuid?",
    },
  },
  certificaciones: {
    certificacion: {
      id_certificacion: "uuid",
      numero_ciclo: "int",
      estado: "enum",
      activo: "bool",
      fecha_inicio: "date",
      fecha_fin: "date?",
      observacion: "varchar(500)?",
      id_historia: "uuid",
    },
    asignacion_certificacion: {
      id_asignacion: "uuid",
      fecha_desde: "tstz",
      fecha_hasta: "tstz?",
      id_certificacion: "uuid",
      id_usuario: "uuid",
    },
    item_checklist: {
      id_item_checklist: "uuid",
      nombre: "varchar(150)", // texto, no INTEGER como dice el diagrama (D26)
      descripcion: "varchar(150)?",
      obligatorio: "bool",
      orden: "int",
      activo: "bool",
      id_certificacion: "uuid",
    },
    entregable: {
      id_entregable: "uuid",
      nombre: "varchar(150)",
      descripcion: "varchar(500)?",
      estado: "enum",
      fecha_creacion: "tstz",
      fecha_validacion: "tstz?",
      id_certificacion: "uuid", // idcertificacion en el diagrama (D26)
      id_item_checklist: "uuid", // extensión del modelo
    },
    evidencia: {
      id_evidencia: "uuid",
      nombre: "varchar(150)",
      descripcion: "varchar(500)?",
      tipo: "enum",
      referencia: "varchar(500)",
      fecha_carga: "tstz",
      id_entregable: "uuid",
    },
    ejecucion_prueba: {
      id_ejecucion: "uuid",
      nombre_prueba: "varchar(200)",
      resultado: "varchar(30)",
      fecha_ejecucion: "tstz",
      ambiente: "varchar(50)?",
      observacion: "varchar(500)?",
      id_certificacion: "uuid",
    },
    defecto: {
      id_defecto: "uuid",
      codigo: "varchar(50)?",
      titulo: "varchar(200)",
      descripcion: "varchar(1000)?",
      severidad: "varchar(20)",
      estado: "varchar(30)",
      fecha_reporte: "tstz",
      fecha_cierre: "tstz?",
      id_certificacion: "uuid",
    },
  },
  impedimentos: {
    impedimento: {
      id_impedimento: "uuid",
      titulo: "varchar(200)",
      descripcion: "varchar(1000)?",
      tipo: "varchar(30)",
      estado: "varchar(30)",
      fecha_registro: "tstz",
      fecha_resolucion: "tstz?",
      id_certificacion: "uuid",
    },
    accion_impedimento: {
      id_accion_impedimento: "uuid",
      descripcion: "varchar(500)", // tipos cortados en el diagrama (D26)
      fecha_accion: "tstz",
      estado: "varchar(30)",
      observacion: "varchar(500)?",
      id_impedimento: "uuid",
    },
  },
};

/** Tablas que no están en el modelo y se conservan porque las exige el backlog (decisiones, «Distribución y relaciones»). */
export const TABLAS_EXTENSION: Record<Esquema, string[]> = {
  organizacion: ["auditoria", "hdu_historial_estado", "hdu_historial_asignacion"],
  certificaciones: ["evento_checklist", "certificado"],
  impedimentos: [],
};

export const tablasDelModelo = (esquema: Esquema): string[] => Object.keys(COLUMNAS_MODELO[esquema]);
export const TOTAL_TABLAS_MODELO = ESQUEMAS.reduce((total, esquema) => total + tablasDelModelo(esquema).length, 0);

/** Llaves foráneas del modelo (tabla «Distribución y relaciones»), dentro de cada esquema: `tabla.columna -> tabla.columna`. */
export const FK_MODELO: Record<Esquema, string[]> = {
  organizacion: [
    "usuario.id_rol -> rol.id_rol",
    "supervision.id_supervisor -> usuario.id_usuario",
    "supervision.id_supervisado -> usuario.id_usuario",
    "sprint.id_celula -> celula.id_celula",
    "historia_usuario.id_celula -> celula.id_celula",
    "historia_sprint.id_historia -> historia_usuario.id_historia",
    "historia_sprint.id_sprint -> sprint.id_sprint",
  ],
  certificaciones: [
    "asignacion_certificacion.id_certificacion -> certificacion.id_certificacion",
    "item_checklist.id_certificacion -> certificacion.id_certificacion",
    "entregable.id_certificacion -> certificacion.id_certificacion",
    "entregable.id_item_checklist -> item_checklist.id_item_checklist",
    "evidencia.id_entregable -> entregable.id_entregable",
    "ejecucion_prueba.id_certificacion -> certificacion.id_certificacion",
    "defecto.id_certificacion -> certificacion.id_certificacion",
  ],
  impedimentos: ["accion_impedimento.id_impedimento -> impedimento.id_impedimento"],
};

/** Llaves foráneas de las tablas de extensión (también dentro del esquema). */
export const FK_EXTENSION: Record<Esquema, string[]> = {
  organizacion: [
    "historia_usuario.qe_responsable_id -> usuario.id_usuario",
    "historia_usuario.analista_id -> usuario.id_usuario",
    "hdu_historial_estado.hdu_id -> historia_usuario.id_historia",
    "hdu_historial_asignacion.hdu_id -> historia_usuario.id_historia",
  ],
  certificaciones: ["certificado.id_certificacion -> certificacion.id_certificacion"],
  impedimentos: [],
};

/** Las 3 relaciones del modelo que cruzan servicios: UUID SIN llave foránea (D24, regla no negociable 3). */
export const RELACIONES_ENTRE_SERVICIOS: Array<{ esquema: Esquema; tabla: string; columna: string; apunta: string }> = [
  { esquema: "certificaciones", tabla: "certificacion", columna: "id_historia", apunta: "organizacion.historia_usuario" },
  { esquema: "certificaciones", tabla: "asignacion_certificacion", columna: "id_usuario", apunta: "organizacion.usuario" },
  { esquema: "impedimentos", tabla: "impedimento", columna: "id_certificacion", apunta: "certificaciones.certificacion" },
];

export interface ColumnaReal {
  tabla: string;
  columna: string;
  tipo: TipoColumna;
  obligatorio: boolean;
}

function normalizarTipo(formato: string, clase: string): string {
  if (clase === "e") return "enum";
  if (formato === "boolean") return "bool";
  if (/^timestamp(\(\d+\))? with time zone$/.test(formato)) return "tstz";
  if (/^timestamp(\(\d+\))? without time zone$/.test(formato)) return "ts";
  if (formato === "integer") return "int";
  const varchar = /^character varying\((\d+)\)$/.exec(formato);
  if (varchar) return `varchar(${varchar[1]})`;
  return formato;
}

/** Tablas base de un esquema (sin `_prisma_migrations`), desde el catálogo (legible por cualquier rol). */
export async function tablasReales(cliente: pg.Client, esquema: Esquema): Promise<string[]> {
  const resultado = await cliente.query<{ tabla: string }>(
    `select c.relname as tabla
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relkind in ('r', 'p') and c.relname <> '_prisma_migrations'
      order by 1`,
    [esquema],
  );
  return resultado.rows.map((fila) => fila.tabla);
}

export async function columnasReales(cliente: pg.Client, esquema: Esquema): Promise<ColumnaReal[]> {
  const resultado = await cliente.query<{ tabla: string; columna: string; formato: string; clase: string; obligatorio: boolean }>(
    `select c.relname as tabla, a.attname as columna, format_type(a.atttypid, a.atttypmod) as formato,
            t.typtype as clase, a.attnotnull as obligatorio
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_type t on t.oid = a.atttypid
      where n.nspname = $1 and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
      order by c.relname, a.attnum`,
    [esquema],
  );
  return resultado.rows.map((fila) => ({
    tabla: fila.tabla,
    columna: fila.columna,
    tipo: normalizarTipo(fila.formato, fila.clase),
    obligatorio: fila.obligatorio,
  }));
}

export interface LlaveForanea {
  esquemaOrigen: string;
  tablaOrigen: string;
  columnaOrigen: string;
  esquemaDestino: string;
  tablaDestino: string;
  columnaDestino: string;
  validada: boolean;
  /** `a` = NO ACTION, `r` = RESTRICT, `c` = CASCADE, `n` = SET NULL (pg_constraint.confdeltype). */
  alBorrar: string;
}

/** Todas las llaves foráneas que tocan alguno de los 3 esquemas de dominio (origen o destino). */
export async function llavesForaneas(cliente: pg.Client): Promise<LlaveForanea[]> {
  const resultado = await cliente.query(
    `select no.nspname as "esquemaOrigen", co.relname as "tablaOrigen", ao.attname as "columnaOrigen",
            nd.nspname as "esquemaDestino", cd.relname as "tablaDestino", ad.attname as "columnaDestino",
            k.convalidated as "validada", k.confdeltype as "alBorrar"
       from pg_constraint k
       join pg_class co on co.oid = k.conrelid join pg_namespace no on no.oid = co.relnamespace
       join pg_class cd on cd.oid = k.confrelid join pg_namespace nd on nd.oid = cd.relnamespace
       join lateral unnest(k.conkey, k.confkey) as par(origen, destino) on true
       join pg_attribute ao on ao.attrelid = k.conrelid and ao.attnum = par.origen
       join pg_attribute ad on ad.attrelid = k.confrelid and ad.attnum = par.destino
      where k.contype = 'f'
        and (no.nspname = any($1) or nd.nspname = any($1))
      order by 1, 2, 3`,
    [ESQUEMAS],
  );
  return resultado.rows as LlaveForanea[];
}

export const firmaFk = (fk: LlaveForanea): string => `${fk.tablaOrigen}.${fk.columnaOrigen} -> ${fk.tablaDestino}.${fk.columnaDestino}`;

/** Ejecuta `fn` dentro de una transacción que SIEMPRE se revierte: no deja filas en la base. */
export async function enTransaccionRevertida<T>(cliente: pg.Client, fn: () => Promise<T>): Promise<T> {
  await cliente.query("begin");
  try {
    return await fn();
  } finally {
    await cliente.query("rollback");
  }
}

/**
 * Ejecuta una sentencia dentro de un savepoint y devuelve el código SQLSTATE si falla
 * (`23503` llave foránea, `23505` único, `42501` privilegio) o `undefined` si funcionó.
 * Siempre deshace la sentencia, así que se puede repetir dentro de una transacción revertida.
 */
export async function codigoDeError(cliente: pg.Client, sql: string, parametros: unknown[] = []): Promise<string | undefined> {
  await cliente.query("savepoint intento");
  try {
    await cliente.query(sql, parametros);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code ?? "SIN_CODIGO";
  } finally {
    await cliente.query("rollback to savepoint intento");
  }
}
