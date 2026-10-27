import { expect, test } from "@playwright/test";
import {
  ESQUEMAS,
  ROL_DE,
  SOLO_INSERCION,
  TABLAS_EXTENSION,
  columnasReales,
  conServicio,
  tablasDelModelo,
  tablasReales,
  type Esquema,
} from "../support/modeloDatos";

/**
 * Corrida «modelo de datos»: el aislamiento por esquema (regla no negociable 1) debe seguir
 * en pie con las tablas nuevas. Cada rol svc_* solo opera su propio esquema; las tablas
 * nuevas (rol, historia_usuario, historia_sprint, certificacion, item_checklist,
 * evidencia…, impedimento…) no son legibles ni escribibles desde otro rol.
 */
const todasLasTablas = (esquema: Esquema): string[] => [...tablasDelModelo(esquema), ...TABLAS_EXTENSION[esquema], "_prisma_migrations"];

test.describe("[MODELO] Aislamiento de datos por rol de servicio", () => {
  for (const esquema of ESQUEMAS) {
    const ajenos = ESQUEMAS.filter((otro) => otro !== esquema);

    test(`[MODELO] ${ROL_DE[esquema]} no es superusuario ni evade la seguridad por filas`, async () => {
      await conServicio[esquema](async (cliente) => {
        const rol = await cliente.query(
          "select current_user as usuario, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication from pg_roles where rolname = current_user",
        );
        expect(rol.rows[0]).toMatchObject({
          usuario: ROL_DE[esquema],
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolbypassrls: false,
          rolreplication: false,
        });
      });
    });

    test(`[MODELO] ${ROL_DE[esquema]} lee y escribe sus tablas nuevas y no tiene ningún privilegio sobre las de otros esquemas`, async () => {
      await conServicio[esquema](async (cliente) => {
        // Esquema propio: USAGE más SELECT/INSERT/UPDATE sobre cada tabla del modelo.
        const usageProp = await cliente.query<{ ok: boolean }>("select has_schema_privilege(current_user, $1, 'USAGE') as ok", [esquema]);
        expect(usageProp.rows[0].ok, `USAGE de ${ROL_DE[esquema]} sobre ${esquema}`).toBe(true);
        // Los privilegios se consultan por OID de pg_class: resolver el nombre «esquema.tabla» exigiría USAGE y fallaría.
        const privilegiosDe = async (nombreEsquema: string, privilegios: string) =>
          (
            await cliente.query<{ tabla: string; ok: boolean }>(
              `select c.relname as tabla, has_table_privilege(current_user, c.oid, $2) as ok
                 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = $1 and c.relkind in ('r', 'p') order by 1`,
              [nombreEsquema, privilegios],
            )
          ).rows;

        for (const privilegio of ["SELECT", "INSERT", "UPDATE"]) {
          const filas = await privilegiosDe(esquema, privilegio);
          for (const tabla of tablasDelModelo(esquema)) {
            // E4 (D65): las tablas de solo inserción no admiten UPDATE.
            const esperado = !(privilegio === "UPDATE" && SOLO_INSERCION[esquema].includes(tabla));
            expect(filas.find((fila) => fila.tabla === tabla)?.ok, `${privilegio} sobre ${esquema}.${tabla}`).toBe(esperado);
          }
        }

        // Esquemas ajenos: sin USAGE ni privilegio alguno sobre ninguna tabla.
        for (const ajeno of ajenos) {
          const usage = await cliente.query<{ ok: boolean }>("select has_schema_privilege(current_user, $1, 'USAGE') as ok", [ajeno]);
          expect(usage.rows[0].ok, `USAGE de ${ROL_DE[esquema]} sobre ${ajeno}`).toBe(false);
          const tablasAjenas = await tablasReales(cliente, ajeno);
          expect(tablasAjenas.length, `el catálogo debe listar las tablas de ${ajeno}`).toBeGreaterThan(0);
          const filas = await privilegiosDe(ajeno, "SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER");
          for (const tabla of tablasAjenas) {
            expect(filas.find((fila) => fila.tabla === tabla)?.ok, `algún privilegio de ${ROL_DE[esquema]} sobre ${ajeno}.${tabla}`).toBe(false);
          }
        }
      });
    });

    test(`[MODELO] ${ROL_DE[esquema]} recibe «permission denied» al leer o escribir cualquier tabla de otro esquema (incluidas las nuevas)`, async () => {
      await conServicio[esquema](async (cliente) => {
        const denegadas: string[] = [];
        for (const ajeno of ajenos) {
          const columnas = await columnasReales(cliente, ajeno);
          for (const tabla of todasLasTablas(ajeno)) {
            const referencia = `${ajeno}.${tabla}`;
            const columna = columnas.find((fila) => fila.tabla === tabla)?.columna;
            if (!columna) denegadas.push(`SIN COLUMNAS EN EL CATALOGO: ${referencia}`);
            for (const sql of [`select 1 from ${referencia} limit 1`, `update ${referencia} set ${columna} = ${columna} where false`, `delete from ${referencia} where false`]) {
              try {
                await cliente.query(sql);
                denegadas.push(`PERMITIDO: ${sql}`);
              } catch (error) {
                if (!/permission denied/i.test((error as Error).message)) denegadas.push(`ERROR INESPERADO (${(error as Error).message}): ${sql}`);
              }
            }
          }
        }
        expect(denegadas, denegadas.join("\n")).toEqual([]);
      });
    });

    test(`[MODELO] ${ROL_DE[esquema]} tampoco alcanza public, auth ni storage de Supabase`, async () => {
      await conServicio[esquema](async (cliente) => {
        for (const consulta of ["select 1 from public.cualquier_tabla", "select 1 from auth.users limit 1", "select 1 from storage.objects limit 1"]) {
          await expect(cliente.query(consulta), consulta).rejects.toThrow(/permission denied/i);
        }
      });
    });
  }
});
