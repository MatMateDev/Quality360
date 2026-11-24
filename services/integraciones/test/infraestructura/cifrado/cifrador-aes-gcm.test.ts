/** Cifrado de los tokens (JO2, D94, D128, D214): mismo AES-256-GCM, IV y etiqueta propios, dato asociado por tipo de token. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LlaveCifradoNoDisponible, TokenNoDescifrable } from '../../../src/dominio/errores.js';
import { DATO_ASOCIADO_ACCESO, DATO_ASOCIADO_RENOVACION } from '../../../src/dominio/oauth/conexion.js';
import { CifradorAesGcm } from '../../../src/infraestructura/cifrado/cifrador-aes-gcm.js';

const llave = Buffer.alloc(32, 9);
const otraLlave = Buffer.alloc(32, 10);

describe('cifrarSecreto y descifrarSecreto', () => {
  it('ida y vuelta con IV de 12 bytes y etiqueta de 16, sin subcadenas en claro', () => {
    const c = new CifradorAesGcm(llave);
    const acceso = 'acceso-secreto-muy-largo-ABCDEF0123456789';
    const s = c.cifrarSecreto(acceso, DATO_ASOCIADO_ACCESO);
    assert.equal(s.iv.length, 12);
    assert.equal(s.tag.length, 16);
    assert.equal('ultimos4' in s, false);
    assert.equal(s.cifrado.toString('latin1').includes(acceso.slice(-4)), false);
    assert.equal(s.cifrado.toString('hex').includes(Buffer.from(acceso.slice(0, 8)).toString('hex')), false);
    assert.equal(c.descifrarSecreto(s, DATO_ASOCIADO_ACCESO), acceso);
  });

  it('cada cifrado usa un IV nuevo', () => {
    const c = new CifradorAesGcm(llave);
    const a = c.cifrarSecreto('mismo-texto', DATO_ASOCIADO_ACCESO);
    const b = c.cifrarSecreto('mismo-texto', DATO_ASOCIADO_ACCESO);
    assert.notDeepEqual(a.iv, b.iv);
    assert.notDeepEqual(a.cifrado, b.cifrado);
  });

  it('el dato asociado liga cada token a su tipo: el de acceso no se descifra como el de renovación', () => {
    const c = new CifradorAesGcm(llave);
    const s = c.cifrarSecreto('token', DATO_ASOCIADO_ACCESO);
    assert.throws(() => c.descifrarSecreto(s, DATO_ASOCIADO_RENOVACION), TokenNoDescifrable);
    assert.equal(c.descifrarSecreto(s, DATO_ASOCIADO_ACCESO), 'token');
  });

  it('otra llave o una etiqueta alterada: TokenNoDescifrable, sin el error de crypto', () => {
    const s = new CifradorAesGcm(llave).cifrarSecreto('token', DATO_ASOCIADO_RENOVACION);
    assert.throws(() => new CifradorAesGcm(otraLlave).descifrarSecreto(s, DATO_ASOCIADO_RENOVACION), (e: Error) => e instanceof TokenNoDescifrable && !/auth|decrypt/i.test(e.message));
    const alterada = { ...s, tag: Buffer.alloc(16, 1) };
    assert.throws(() => new CifradorAesGcm(llave).descifrarSecreto(alterada, DATO_ASOCIADO_RENOVACION), TokenNoDescifrable);
  });

  it('sin llave: LlaveCifradoNoDisponible', () => {
    const c = new CifradorAesGcm(null);
    assert.equal(c.disponible, false);
    assert.throws(() => c.cifrarSecreto('x', DATO_ASOCIADO_ACCESO), LlaveCifradoNoDisponible);
    const s = new CifradorAesGcm(llave).cifrarSecreto('x', DATO_ASOCIADO_ACCESO);
    assert.throws(() => c.descifrarSecreto(s, DATO_ASOCIADO_ACCESO), LlaveCifradoNoDisponible);
  });

  it('el API token sigue como antes: cifrar y descifrar con su dato asociado y los últimos 4', () => {
    const c = new CifradorAesGcm(llave);
    const t = c.cifrar('q360-token-valido-AB12');
    assert.equal(t.ultimos4, 'AB12');
    assert.equal(c.descifrar(t), 'q360-token-valido-AB12');
    // Un secreto OAuth no se confunde con el API token.
    const s = c.cifrarSecreto('q360-token-valido-AB12', DATO_ASOCIADO_ACCESO);
    assert.throws(() => c.descifrar({ ...s, ultimos4: 'AB12' }), TokenNoDescifrable);
  });
});
