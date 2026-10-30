import { expect, test } from "@playwright/test";
import { USUARIOS_SEMILLA } from "../support/usuarios";
import {
  COLUMNAS_MODELO,
  ESQUEMAS,
  FK_EXTENSION,
  FK_MODELO,
  RELACIONES_ENTRE_SERVICIOS,
  ROL_DE,
  TABLAS_EXTENSION,
  TOTAL_TABLAS_MODELO,
  codigoDeError,
  columnasReales,
  conServicio,
  enTransaccionRevertida,
  firmaFk,
  llavesForaneas,
  tablasDelModelo,
  tablasReales,
  type Esquema,
} from "../support/modeloDatos";

/**
 * Corrida «modelo de datos» (D23-D27 en docs/arquitectura/decisiones-mvp.md): los esquemas
 * siguen el modelo ER/lógico. Todo se verifica con la conexión del ROL DE SERVICIO de cada
 * esquema (svc_*, sin superusuario), nunca con un rol privilegiado. Las pruebas que
 * escriben lo hacen dentro de una transacción que siempre se revierte.
 */
test.describe("[MODELO] Estructura: tablas y columnas", () => {
  test("[MODELO] existen las 16 tablas del modelo, cada una en el esquema de su servicio", async () => {
    expect(TOTAL_TABLAS_MODELO).toBe(16);
    const faltantes: string[] = [];
    for (const esquema of ESQUEMAS) {
      const reales = await conServicio[esquema]((cliente) => tablasReales(cliente, esquema));
      for (const tabla of tablasDelModelo(esquema)) {
        if (!reales.includes(tabla)) faltantes.push(`${esquema}.${tabla}`);
      }
    }
    expect(faltantes, `Tablas del modelo ausentes: ${faltantes.join(", ")}`).toEqual([]);
  });

  test("[MODELO] cada esquema contiene solo las tablas del modelo y las de extensión documentadas", async () => {
    for (const esquema of ESQUEMAS) {
      const reales = await conServicio[esquema]((cliente) => tablasReales(cliente, esquema));
      const esperadas = [...tablasDelModelo(esquema), ...TABLAS_EXTENSION[esquema]].sort();
      expect(reales, `Tablas de ${esquema}`).toEqual(esperadas);
    }
  });

  test("[MODELO] cada tabla del modelo es legible por el rol de su propio servicio (incluidas las nuevas)", async () => {
    for (const esquema of ESQUEMAS) {
      await conServicio[esquema](async (cliente) => {
        for (const tabla of tablasDelModelo(esquema)) {
          const resultado = await cliente.query(`select count(*)::int as total from ${esquema}.${tabla}`);
          expect(resultado.rows[0].total, `${esquema}.${tabla}`).toBeGreaterThanOrEqual(0);
        }
      });
    }
  });

  for (const esquema of ESQUEMAS) {
    test(`[MODELO] ${esquema}: cada tabla tiene sus columnas clave con el tipo y la obligatoriedad del modelo`, async () => {
      const reales = await conServicio[esquema]((cliente) => columnasReales(cliente, esquema));
      const problemas: string[] = [];
      for (const [tabla, columnas] of Object.entries(COLUMNAS_MODELO[esquema])) {
        for (const [columna, definicion] of Object.entries(columnas)) {
          const admiteNulo = definicion.endsWith("?");
          const tipoEsperado = admiteNulo ? definicion.slice(0, -1) : definicion;
          const real = reales.find((fila) => fila.tabla === tabla && fila.columna === columna);
          if (!real) {
            problemas.push(`${esquema}.${tabla}.${columna}: no existe`);
            continue;
          }
          if (real.tipo !== tipoEsperado) problemas.push(`${esquema}.${tabla}.${columna}: tipo ${real.tipo}, esperado ${tipoEsperado}`);
          if (real.obligatorio === admiteNulo) {
            problemas.push(`${esquema}.${tabla}.${columna}: ${real.obligatorio ? "NOT NULL" : "admite nulo"}, esperado ${admiteNulo ? "nulo" : "NOT NULL"}`);
          }
        }
      }
      expect(problemas, problemas.join("\n")).toEqual([]);
    });
  }

  test("[MODELO] las llaves primarias del modelo son UUID de una sola columna con el nombre del modelo (D25)", async () => {
    const problemas: string[] = [];
    for (const esquema of ESQUEMAS) {
      await conServicio[esquema](async (cliente) => {
        const resultado = await cliente.query<{ tabla: string; columnas: string[]; tipos: string[] }>(
          `select c.relname as tabla,
                  array_agg(a.attname::text order by a.attnum) as columnas,
                  array_agg(format_type(a.atttypid, a.atttypmod) order by a.attnum) as tipos
             from pg_constraint k
             join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
             join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
            where k.contype = 'p' and n.nspname = $1
            group by c.relname, k.oid`,
          [esquema],
        );
        for (const tabla of tablasDelModelo(esquema)) {
          const pk = resultado.rows.find((fila) => fila.tabla === tabla);
          const columnaIdEsperada = Object.entries(COLUMNAS_MODELO[esquema][tabla]).find(([, tipo]) => tipo === "uuid")?.[0];
          if (!pk) {
            problemas.push(`${esquema}.${tabla}: sin llave primaria`);
          } else if (pk.columnas.length !== 1 || pk.tipos[0] !== "uuid" || pk.columnas[0] !== columnaIdEsperada) {
            problemas.push(`${esquema}.${tabla}: PK (${pk.columnas.join(",")}) ${pk.tipos.join(",")}, esperada ${columnaIdEsperada} uuid`);
          }
        }
      });
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  test("[MODELO] ya no quedan tablas ni columnas de la estructura anterior (hdu, correo, qe_id, hdu_id…)", async () => {
    const heredadas: Array<{ esquema: Esquema; tabla: string; columnas: string[] }> = [
      { esquema: "organizacion", tabla: "usuario", columnas: ["id", "correo", "rol", "creado_en"] },
      { esquema: "organizacion", tabla: "supervision", columnas: ["id", "qe_id", "analista_id", "desde", "hasta"] },
      { esquema: "organizacion", tabla: "celula", columnas: ["id"] },
      { esquema: "organizacion", tabla: "sprint", columnas: ["id", "inicio", "fin"] },
      { esquema: "certificaciones", tabla: "entregable", columnas: ["id", "hdu_id", "aprobado_en", "evidencia_tipo", "evidencia_url", "evidencia_ruta", "evidencia_folio"] },
    ];
    const problemas: string[] = [];
    for (const esquema of ESQUEMAS) {
      const [tablas, columnas] = await conServicio[esquema](async (cliente) => [await tablasReales(cliente, esquema), await columnasReales(cliente, esquema)] as const);
      if (esquema === "organizacion" && tablas.includes("hdu")) problemas.push("organizacion.hdu sigue existiendo (ahora es historia_usuario)");
      for (const heredada of heredadas.filter((item) => item.esquema === esquema)) {
        for (const columna of heredada.columnas) {
          if (columnas.some((fila) => fila.tabla === heredada.tabla && fila.columna === columna)) {
            problemas.push(`${esquema}.${heredada.tabla}.${columna} sigue existiendo`);
          }
        }
      }
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  test("[MODELO] organizacion.rol es un catálogo de 5 filas (E7 suma LIDER_QA y AUDITOR) y cada usuario sembrado apunta a su rol por llave foránea", async () => {
    await conServicio.organizacion(async (cliente) => {
      const roles = await cliente.query<{ nombre: string }>("select nombre from organizacion.rol order by nombre");
      expect(roles.rows.map((fila) => fila.nombre)).toEqual(["ADMINISTRADOR", "ANALISTA_QA", "AUDITOR", "LIDER_QA", "QE"]);

      const usuarios = await cliente.query<{ email: string; rol: string }>(
        "select u.email, r.nombre as rol from organizacion.usuario u join organizacion.rol r on r.id_rol = u.id_rol",
      );
      const rolPorCorreo = new Map(usuarios.rows.map((fila) => [fila.email.toLowerCase(), fila.rol]));
      for (const usuario of Object.values(USUARIOS_SEMILLA)) {
        expect(rolPorCorreo.get(usuario.correo), `rol de ${usuario.correo}`).toBe(usuario.rol);
      }
      const huerfanos = await cliente.query(
        "select count(*)::int as total from organizacion.usuario u left join organizacion.rol r on r.id_rol = u.id_rol where r.id_rol is null",
      );
      expect(huerfanos.rows[0].total).toBe(0);
    });
  });
});

test.describe("[MODELO] Estructura: llaves foráneas", () => {
  for (const esquema of ESQUEMAS) {
    test(`[MODELO] ${esquema}: existen las llaves foráneas del modelo dentro del esquema y están validadas`, async () => {
      const todas = await conServicio[esquema](llavesForaneas);
      const propias = todas.filter((fk) => fk.esquemaOrigen === esquema);
      const firmas = propias.map(firmaFk);
      const faltantes = FK_MODELO[esquema].filter((fk) => !firmas.includes(fk));
      expect(faltantes, `Llaves foráneas ausentes en ${esquema}: ${faltantes.join(", ")}`).toEqual([]);

      for (const requerida of FK_MODELO[esquema]) {
        const fk = propias.find((candidata) => firmaFk(candidata) === requerida)!;
        expect(fk.esquemaDestino, `${requerida} debe apuntar dentro de ${esquema}`).toBe(esquema);
        expect(fk.validada, `${requerida} validada`).toBe(true);
      }
    });

    test(`[MODELO] ${esquema}: solo hay llaves foráneas del modelo o de sus tablas de extensión`, async () => {
      const todas = await conServicio[esquema](llavesForaneas);
      const firmas = todas.filter((fk) => fk.esquemaOrigen === esquema).map(firmaFk).sort();
      expect(firmas).toEqual([...FK_MODELO[esquema], ...FK_EXTENSION[esquema]].sort());
    });
  }

  test("[MODELO] no existe ninguna llave foránea entre esquemas (regla no negociable 3), visto desde cada rol de servicio", async () => {
    for (const esquema of ESQUEMAS) {
      const todas = await conServicio[esquema](llavesForaneas);
      const cruzadas = todas.filter((fk) => fk.esquemaOrigen !== fk.esquemaDestino);
      expect(
        cruzadas.map((fk) => `${fk.esquemaOrigen}.${firmaFk(fk)} => ${fk.esquemaDestino}`),
        `Llaves foráneas entre esquemas vistas por ${ROL_DE[esquema]}`,
      ).toEqual([]);
      // Hay llaves foráneas dentro de los tres esquemas (la consulta no está vacía por error).
      expect(todas.length).toBeGreaterThanOrEqual(15);
    }
  });

  test("[MODELO] las 3 relaciones entre servicios son UUID obligatorio sin llave foránea: aceptan un UUID de otro servicio", async () => {
    for (const relacion of RELACIONES_ENTRE_SERVICIOS) {
      await conServicio[relacion.esquema](async (cliente) => {
        const columnas = await columnasReales(cliente, relacion.esquema);
        const columna = columnas.find((fila) => fila.tabla === relacion.tabla && fila.columna === relacion.columna);
        expect(columna, `${relacion.esquema}.${relacion.tabla}.${relacion.columna}`).toMatchObject({ tipo: "uuid", obligatorio: relacion.obligatorio });

        const llaves = await llavesForaneas(cliente);
        const conLlave = llaves.filter((fk) => fk.esquemaOrigen === relacion.esquema && fk.tablaOrigen === relacion.tabla && fk.columnaOrigen === relacion.columna);
        expect(conLlave.map(firmaFk), `${relacion.tabla}.${relacion.columna} (UUID de ${relacion.apunta}) no debe tener llave foránea`).toEqual([]);
      });
    }

    // Prueba de comportamiento, siempre revertida: un UUID inexistente en el otro servicio se acepta.
    await conServicio.certificaciones((cliente) =>
      enTransaccionRevertida(cliente, async () => {
        const ciclo = await cliente.query<{ id: string }>(
          "insert into certificaciones.certificacion (id_certificacion, numero_ciclo, id_historia) values (gen_random_uuid(), 1, gen_random_uuid()) returning id_certificacion as id",
        );
        expect(ciclo.rowCount).toBe(1);
        const asignacion = await cliente.query(
          "insert into certificaciones.asignacion_certificacion (id_asignacion, id_certificacion, id_usuario) values (gen_random_uuid(), $1, gen_random_uuid())",
          [ciclo.rows[0].id],
        );
        expect(asignacion.rowCount).toBe(1);
      }),
    );
    await conServicio.impedimentos((cliente) =>
      enTransaccionRevertida(cliente, async () => {
        const impedimento = await cliente.query(
          "insert into impedimentos.impedimento (id_impedimento, titulo, tipo, estado, id_certificacion, id_historia, responsable_nombre, creado_por_id, creado_por_nombre, creado_por_rol) values (gen_random_uuid(), 'prueba', 'AMBIENTE', 'ABIERTO', gen_random_uuid(), gen_random_uuid(), 'Externo', gen_random_uuid(), 'QA', 'QE')",
        );
        expect(impedimento.rowCount).toBe(1);
      }),
    );
  });

  test("[MODELO] las llaves foráneas se hacen cumplir: un hijo sin padre es rechazado (SQLSTATE 23503) en cada esquema", async () => {
    const intentos: Array<{ esquema: Esquema; descripcion: string; sql: string }> = [
      {
        esquema: "organizacion",
        descripcion: "usuario con un id_rol inexistente",
        sql: "insert into organizacion.usuario (id_usuario, nombre, email, id_rol, actualizado_en) values (gen_random_uuid(), 'x', 'sin-rol@modelo.test', gen_random_uuid(), now())",
      },
      {
        esquema: "organizacion",
        descripcion: "sprint con una id_celula inexistente",
        sql: "insert into organizacion.sprint (id_sprint, nombre, fecha_inicio, fecha_fin, estado, id_celula) values (gen_random_uuid(), 'sprint-sin-celula', current_date, current_date, 'PLANIFICADO', gen_random_uuid())",
      },
      {
        esquema: "organizacion",
        descripcion: "historia_sprint con una id_historia inexistente",
        sql: "insert into organizacion.historia_sprint (id_historia_sprint, id_historia) values (gen_random_uuid(), gen_random_uuid())",
      },
      {
        esquema: "certificaciones",
        descripcion: "item_checklist con una id_certificacion inexistente",
        sql: "insert into certificaciones.item_checklist (id_item_checklist, nombre, orden, id_certificacion, clave) values (gen_random_uuid(), 'x', 1, gen_random_uuid(), 'PLAN_PRUEBAS')",
      },
      {
        esquema: "certificaciones",
        descripcion: "evidencia con un id_entregable inexistente",
        sql: "insert into certificaciones.evidencia (id_evidencia, nombre, tipo, referencia, id_entregable) values (gen_random_uuid(), 'x', 'ENLACE', 'https://modelo.test', gen_random_uuid())",
      },
      {
        esquema: "certificaciones",
        descripcion: "defecto con una id_certificacion inexistente",
        sql: "insert into certificaciones.defecto (id_defecto, titulo, severidad, estado, id_certificacion) values (gen_random_uuid(), 'x', 'ALTA', 'ABIERTO', gen_random_uuid())",
      },
      {
        esquema: "impedimentos",
        descripcion: "accion_impedimento con un id_impedimento inexistente",
        sql: "insert into impedimentos.accion_impedimento (id_accion_impedimento, descripcion, estado, id_impedimento, tipo_accion, actor_id, actor_nombre, actor_rol) values (gen_random_uuid(), 'x', 'ABIERTO', gen_random_uuid(), 'REGISTRAR', gen_random_uuid(), 'QA', 'QE')",
      },
    ];

    const resultados: string[] = [];
    for (const esquema of ESQUEMAS) {
      await conServicio[esquema]((cliente) =>
        enTransaccionRevertida(cliente, async () => {
          for (const intento of intentos.filter((item) => item.esquema === esquema)) {
            // El error de llave foránea se evalúa al final de la sentencia: no hay que adelantar el commit.
            const codigo = await codigoDeError(cliente, intento.sql);
            resultados.push(`${esquema}: ${intento.descripcion} -> ${codigo ?? "ACEPTADO"}`);
          }
        }),
      );
    }
    expect(
      resultados.filter((linea) => !linea.endsWith("-> 23503")),
      `Resultados:\n${resultados.join("\n")}`,
    ).toEqual([]);
    expect(resultados).toHaveLength(intentos.length);
  });
});

test.describe("[MODELO] Estructura: índices únicos parciales (vigentes)", () => {
  test("[MODELO] existen los índices únicos parciales de ciclo activo, asignación vigente, sprint vigente y QE vigente", async () => {
    const esperados: Array<{ esquema: Esquema; patron: RegExp; descripcion: string }> = [
      {
        esquema: "certificaciones",
        patron: /UNIQUE INDEX \w+ ON certificaciones\.certificacion USING btree \(id_historia\) WHERE activo/,
        descripcion: "un solo ciclo activo por HU",
      },
      {
        esquema: "certificaciones",
        patron: /UNIQUE INDEX \w+ ON certificaciones\.asignacion_certificacion USING btree \(id_certificacion\) WHERE \(fecha_hasta IS NULL\)/,
        descripcion: "un solo analista vigente por ciclo",
      },
      {
        esquema: "organizacion",
        patron: /UNIQUE INDEX \w+ ON organizacion\.historia_sprint USING btree \(id_historia\) WHERE \(fecha_retiro IS NULL\)/,
        descripcion: "un solo sprint vigente por HU",
      },
      {
        esquema: "organizacion",
        patron: /UNIQUE INDEX \w+ ON organizacion\.supervision USING btree \(id_supervisado\) WHERE \(fecha_hasta IS NULL\)/,
        descripcion: "un solo QE vigente por analista",
      },
    ];
    for (const esperado of esperados) {
      const indices = await conServicio[esperado.esquema]((cliente) =>
        cliente.query<{ indexdef: string }>("select indexdef from pg_indexes where schemaname = $1", [esperado.esquema]),
      );
      expect(
        indices.rows.some((fila) => esperado.patron.test(fila.indexdef)),
        `Índice parcial «${esperado.descripcion}» en ${esperado.esquema}`,
      ).toBe(true);
    }
  });

  test("[MODELO] la base rechaza un segundo ciclo activo por HU y un segundo analista vigente por ciclo (SQLSTATE 23505)", async () => {
    await conServicio.certificaciones((cliente) =>
      enTransaccionRevertida(cliente, async () => {
        const historia = (await cliente.query<{ id: string }>("select gen_random_uuid() as id")).rows[0].id;
        const primero = await cliente.query<{ id: string }>(
          "insert into certificaciones.certificacion (id_certificacion, numero_ciclo, id_historia) values (gen_random_uuid(), 1, $1) returning id_certificacion as id",
          [historia],
        );
        // Segundo ciclo ACTIVO de la misma HU.
        expect(
          await codigoDeError(cliente, "insert into certificaciones.certificacion (id_certificacion, numero_ciclo, id_historia) values (gen_random_uuid(), 2, $1)", [historia]),
        ).toBe("23505");
        // Mismo número de ciclo, aunque no esté activo.
        expect(
          await codigoDeError(cliente, "insert into certificaciones.certificacion (id_certificacion, numero_ciclo, activo, id_historia) values (gen_random_uuid(), 1, false, $1)", [historia]),
        ).toBe("23505");
        // Un ciclo inactivo con otro número sí se admite (historial).
        expect(
          await codigoDeError(cliente, "insert into certificaciones.certificacion (id_certificacion, numero_ciclo, activo, id_historia) values (gen_random_uuid(), 2, false, $1)", [historia]),
        ).toBeUndefined();

        await cliente.query(
          "insert into certificaciones.asignacion_certificacion (id_asignacion, id_certificacion, id_usuario) values (gen_random_uuid(), $1, gen_random_uuid())",
          [primero.rows[0].id],
        );
        expect(
          await codigoDeError(cliente, "insert into certificaciones.asignacion_certificacion (id_asignacion, id_certificacion, id_usuario) values (gen_random_uuid(), $1, gen_random_uuid())", [primero.rows[0].id]),
        ).toBe("23505");
      }),
    );
  });

  test("[MODELO] la base rechaza un segundo sprint vigente por HU y un segundo QE vigente por analista (SQLSTATE 23505)", async () => {
    await conServicio.organizacion((cliente) =>
      enTransaccionRevertida(cliente, async () => {
        const base = await cliente.query<{ celula: string; qe: string; analista: string }>(
          `select (select id_celula from organizacion.celula limit 1) as celula,
                  (select id_usuario from organizacion.usuario u join organizacion.rol r on r.id_rol = u.id_rol where r.nombre = 'QE' limit 1) as qe,
                  (select id_usuario from organizacion.usuario u join organizacion.rol r on r.id_rol = u.id_rol where r.nombre = 'ANALISTA_QA' order by u.email limit 1) as analista`,
        );
        const { celula, qe, analista } = base.rows[0];
        expect([celula, qe, analista].every(Boolean), "la semilla debe tener célula, QE y analista").toBe(true);

        const historia = (await cliente.query<{ id: string }>("select gen_random_uuid() as id")).rows[0].id;
        await cliente.query(
          `insert into organizacion.historia_usuario (id_historia, codigo, codigo_normalizado, titulo, prioridad, id_celula, qe_responsable_id, creado_por_tipo, creado_por_id, creado_por_nombre)
           values ($1::uuid, 'MODELO-TX', 'modelo-tx-' || $1::uuid::text, 'tx revertida', 'MEDIA', $2, $3, 'SERVICIO', 'prueba', 'prueba')`,
          [historia, celula, qe],
        );
        await cliente.query("insert into organizacion.historia_sprint (id_historia_sprint, id_historia) values (gen_random_uuid(), $1)", [historia]);
        expect(
          await codigoDeError(cliente, "insert into organizacion.historia_sprint (id_historia_sprint, id_historia) values (gen_random_uuid(), $1)", [historia]),
        ).toBe("23505");
        // Con el sprint anterior retirado (fecha_retiro), otro vigente sí se admite: el historial se conserva.
        await cliente.query("update organizacion.historia_sprint set fecha_retiro = current_date where id_historia = $1", [historia]);
        expect(
          await codigoDeError(cliente, "insert into organizacion.historia_sprint (id_historia_sprint, id_historia) values (gen_random_uuid(), $1)", [historia]),
        ).toBeUndefined();

        // Un analista sin supervisión vigente en la transacción: se retiran las vigentes y se prueba el índice.
        await cliente.query("update organizacion.supervision set fecha_hasta = now() where id_supervisado = $1 and fecha_hasta is null", [analista]);
        const insertarSupervision =
          "insert into organizacion.supervision (id_supervision, id_supervisor, id_supervisado, actor_tipo, actor_id, actor_nombre) values (gen_random_uuid(), $1, $2, 'SERVICIO', 'prueba', 'prueba')";
        await cliente.query(insertarSupervision, [qe, analista]);
        expect(await codigoDeError(cliente, insertarSupervision, [qe, analista])).toBe("23505");
      }),
    );
  });
});
