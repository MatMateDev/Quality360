import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ConfiguracionOrganizacion } from '../../src/configuracion.js';
import { ProveedorIdentidadSupabase } from '../../src/infraestructura/supabase/proveedor-identidad.servicio.js';

/** Cliente falso de Supabase Auth: `createUser` falla (la cuenta ya existe) y `listUsers` pagina las cuentas dadas. */
function proveedorConCuentas(correos: string[], porPagina = 1000) {
  const paginasPedidas: number[] = [];
  const proveedor = new ProveedorIdentidadSupabase({
    supabaseUrl: 'http://127.0.0.1:9',
    supabaseServiceRoleKey: 'clave-de-prueba',
  } as ConfiguracionOrganizacion);
  const usuarios = correos.map((correo, indice) => ({ id: `id-${indice}`, email: correo }));
  (proveedor as unknown as { cliente: unknown }).cliente = {
    auth: {
      admin: {
        createUser: async () => ({ data: { user: null }, error: { message: 'A user with this email address has already been registered' } }),
        listUsers: async ({ page, perPage }: { page: number; perPage: number }) => {
          assert.equal(perPage, porPagina);
          paginasPedidas.push(page);
          return { data: { users: usuarios.slice((page - 1) * perPage, page * perPage) }, error: null };
        },
      },
    },
  };
  return { proveedor, paginasPedidas };
}

const entrada = (correo: string) => ({ correo, nombre: 'Patricia Rojas', contrasena: 'clave-de-prueba' });

describe('infraestructura/ProveedorIdentidadSupabase · vincular una cuenta existente', () => {
  it('encuentra la cuenta aunque esté después de las primeras 1000 (semilla con muchas cuentas de prueba)', async () => {
    const correos = [...Array.from({ length: 1000 }, (_, i) => `prueba.${i}@quality360.local`), 'patricia.rojas@quality360.local'];
    const { proveedor, paginasPedidas } = proveedorConCuentas(correos);

    const resultado = await proveedor.crearOVincularUsuarioConContrasena(entrada('Patricia.Rojas@quality360.local'));

    assert.deepEqual(resultado, { id: 'id-1000' });
    assert.deepEqual(paginasPedidas, [1, 2]);
  });

  it('se detiene en la última página y conserva el error original si la cuenta no existe', async () => {
    const correos = Array.from({ length: 1005 }, (_, i) => `prueba.${i}@quality360.local`);
    const { proveedor, paginasPedidas } = proveedorConCuentas(correos);

    await assert.rejects(proveedor.crearOVincularUsuarioConContrasena(entrada('nadie@quality360.local')), /No se pudo crear el usuario/);
    assert.deepEqual(paginasPedidas, [1, 2]);
  });
});
