/**
 * Verificación del access token de Supabase: JWKS (RS256/ES256), respaldo
 * HS256, vencimiento, firma inválida, `aud`/`iss` y fallas del proveedor.
 * Cubre los escenarios transversales E1-B01#1, E1-B02#1 y E1-B11#1.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { exportSPKI } from 'jose';

import { ExcepcionQ360 } from '../src/errores.js';
import { VerificadorTokenSupabase, resolverOpcionesVerificador } from '../src/verificador-token.js';
import {
  AUDIENCIA,
  EMISOR,
  SECRETO_HS256,
  SUB,
  crearParLlaves,
  firmarConLlave,
  firmarConSecreto,
  iniciarServidorJwks,
  tokenSinFirma,
  type ParLlaves,
  type ServidorJwks,
} from './ayudas.js';

let llaveRsa: ParLlaves;
let llaveEc: ParLlaves;
let llaveIntrusa: ParLlaves;
let jwks: ServidorJwks;

function crearVerificador(extra: Record<string, unknown> = {}): VerificadorTokenSupabase {
  return new VerificadorTokenSupabase(
    resolverOpcionesVerificador({
      emisor: EMISOR,
      audiencia: AUDIENCIA,
      jwksUrl: jwks.url,
      secretoHs256: SECRETO_HS256,
      ...extra,
    }),
  );
}

/** Ejecuta la verificación y devuelve la excepción esperada. */
async function fallaCon(
  verificador: VerificadorTokenSupabase,
  token: string,
): Promise<ExcepcionQ360> {
  try {
    await verificador.verificar(token);
  } catch (error) {
    assert.ok(error instanceof ExcepcionQ360, `se esperaba ExcepcionQ360 y llegó ${String(error)}`);
    return error;
  }
  throw new Error('la verificación debió fallar y no falló');
}

before(async () => {
  llaveRsa = await crearParLlaves('RS256', 'llave-rsa-1');
  llaveEc = await crearParLlaves('ES256', 'llave-ec-1');
  llaveIntrusa = await crearParLlaves('RS256', 'llave-rsa-1');
  jwks = await iniciarServidorJwks([llaveRsa, llaveEc]);
});

after(async () => {
  await jwks.cerrar();
});

describe('VerificadorTokenSupabase · token válido', () => {
  it('acepta un token RS256 firmado con la llave del JWKS', async () => {
    const identidad = await crearVerificador().verificar(await firmarConLlave(llaveRsa));
    assert.equal(identidad.id, SUB);
    assert.equal(identidad.correo, 'ana.perez@quality360.local');
    assert.equal(identidad.emisor, EMISOR);
  });

  it('acepta un token ES256 eligiendo la llave por kid', async () => {
    const identidad = await crearVerificador().verificar(await firmarConLlave(llaveEc));
    assert.equal(identidad.id, SUB);
  });

  it('acepta HS256 cuando hay secreto configurado (respaldo local)', async () => {
    const identidad = await crearVerificador().verificar(await firmarConSecreto(SECRETO_HS256));
    assert.equal(identidad.id, SUB);
  });

  it('normaliza el correo a minúsculas y no expone rol alguno', async () => {
    const token = await firmarConLlave(llaveRsa, {
      correo: 'Ana.Perez@Quality360.local',
      extras: { user_metadata: { rol: 'ADMINISTRADOR' }, app_metadata: { rol: 'ADMINISTRADOR' } },
    });
    const identidad = await crearVerificador().verificar(token);
    assert.equal(identidad.correo, 'ana.perez@quality360.local');
    assert.deepEqual(
      Object.keys(identidad).sort(),
      ['correo', 'emisor', 'expiraEn', 'id', 'sesionId', 'token'],
      'la identidad solo debe traer datos de autenticación, nunca el rol',
    );
  });

  it('tolera un desfase de reloj menor a la tolerancia', async () => {
    const token = await firmarConLlave(llaveRsa, { vigenciaSegundos: -2 });
    const identidad = await crearVerificador({ toleranciaRelojSegundos: 30 }).verificar(token);
    assert.equal(identidad.id, SUB);
  });
});

describe('VerificadorTokenSupabase · token rechazado', () => {
  it('token expirado responde SESION_EXPIRADA (E1-B11#1)', async () => {
    const token = await firmarConLlave(llaveRsa, { vigenciaSegundos: -120 });
    const error = await fallaCon(crearVerificador(), token);
    assert.equal(error.codigo, 'SESION_EXPIRADA');
    assert.equal(error.getStatus(), 401);
  });

  it('firma inválida responde NO_AUTENTICADO', async () => {
    const token = await firmarConLlave(llaveRsa, {}, llaveIntrusa.privada);
    const error = await fallaCon(crearVerificador(), token);
    assert.equal(error.codigo, 'NO_AUTENTICADO');
    assert.equal(error.getStatus(), 401);
  });

  it('aud incorrecto responde NO_AUTENTICADO', async () => {
    const token = await firmarConLlave(llaveRsa, { audiencia: 'otro-publico' });
    const error = await fallaCon(crearVerificador(), token);
    assert.equal(error.codigo, 'NO_AUTENTICADO');
  });

  it('iss incorrecto responde NO_AUTENTICADO', async () => {
    const token = await firmarConLlave(llaveRsa, { emisor: 'http://atacante.local/auth/v1' });
    const error = await fallaCon(crearVerificador(), token);
    assert.equal(error.codigo, 'NO_AUTENTICADO');
  });

  it('alg: none se rechaza', async () => {
    const error = await fallaCon(crearVerificador(), tokenSinFirma());
    assert.equal(error.codigo, 'NO_AUTENTICADO');
  });

  it('HS256 firmado con la llave pública (confusión de algoritmo) se rechaza', async () => {
    const publicaPem = await exportSPKI(llaveRsa.publica);
    const token = await firmarConSecreto(publicaPem, {}, llaveRsa.kid);
    const error = await fallaCon(crearVerificador(), token);
    assert.equal(error.codigo, 'NO_AUTENTICADO');
  });

  it('HS256 sin secreto configurado se rechaza aunque la firma sea correcta', async () => {
    const token = await firmarConSecreto(SECRETO_HS256);
    const error = await fallaCon(crearVerificador({ secretoHs256: null }), token);
    assert.equal(error.codigo, 'NO_AUTENTICADO');
  });

  it('kid desconocido se rechaza', async () => {
    const token = await firmarConLlave(llaveRsa, { kid: 'llave-que-no-existe' });
    const error = await fallaCon(crearVerificador(), token);
    assert.equal(error.codigo, 'NO_AUTENTICADO');
  });

  it('token sin sub o con sub que no es UUID se rechaza', async () => {
    assert.equal((await fallaCon(crearVerificador(), await firmarConLlave(llaveRsa, { sub: null }))).codigo, 'NO_AUTENTICADO');
    assert.equal(
      (await fallaCon(crearVerificador(), await firmarConLlave(llaveRsa, { sub: 'no-es-uuid' }))).codigo,
      'NO_AUTENTICADO',
    );
  });

  it('token sin exp se rechaza', async () => {
    const token = await firmarConLlave(llaveRsa, { sinExpiracion: true });
    const error = await fallaCon(crearVerificador(), token);
    assert.equal(error.codigo, 'NO_AUTENTICADO');
  });

  it('llave de API (role service_role) no vale como sesión de usuario', async () => {
    const token = await firmarConLlave(llaveRsa, { extras: { role: 'service_role' } });
    const error = await fallaCon(crearVerificador(), token);
    assert.equal(error.codigo, 'NO_AUTENTICADO');
  });

  it('sesión anónima de Supabase se rechaza', async () => {
    const token = await firmarConLlave(llaveRsa, { extras: { is_anonymous: true } });
    assert.equal((await fallaCon(crearVerificador(), token)).codigo, 'NO_AUTENTICADO');
  });

  it('basura en la cabecera Authorization se rechaza', async () => {
    assert.equal((await fallaCon(crearVerificador(), 'no-es-un-jwt')).codigo, 'NO_AUTENTICADO');
  });
});

describe('VerificadorTokenSupabase · proveedor caído', () => {
  it('si el JWKS no responde falla cerrado con SERVICIO_NO_DISPONIBLE, no con 401', async () => {
    const servidor = await iniciarServidorJwks([llaveRsa]);
    const verificador = new VerificadorTokenSupabase(
      resolverOpcionesVerificador({
        emisor: EMISOR,
        audiencia: AUDIENCIA,
        jwksUrl: servidor.url,
        tiempoLimiteJwksMs: 500,
      }),
    );
    await servidor.cerrar();

    const error = await fallaCon(verificador, await firmarConLlave(llaveRsa));
    assert.equal(error.codigo, 'SERVICIO_NO_DISPONIBLE');
    assert.equal(error.getStatus(), 503);
  });
});

describe('resolverOpcionesVerificador', () => {
  it('deduce emisor y JWKS desde SUPABASE_URL', () => {
    const opciones = resolverOpcionesVerificador({ supabaseUrl: 'http://127.0.0.1:54321/' });
    assert.equal(opciones.emisor, 'http://127.0.0.1:54321/auth/v1');
    assert.equal(opciones.jwksUrl, 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json');
    assert.equal(opciones.audiencia, 'authenticated');
    assert.equal(opciones.secretoHs256, null, 'el secreto HS256 no tiene valor por defecto');
  });

  it('exige alguna forma de verificar la sesión', () => {
    assert.throws(() => resolverOpcionesVerificador({ emisor: EMISOR }), ExcepcionQ360);
  });
});
