/**
 * `IdentidadGuard` y `AccesoGuard` sobre una aplicación NestJS real.
 *
 * Verifica los casos exigidos al agente: token válido, expirado, con firma
 * inválida, con `aud` incorrecto, usuario inactivo y rol no permitido; y que
 * los tres rechazos de autorización devuelven exactamente el mismo cuerpo
 * genérico (D12).
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthNestModule } from '../src/auth-nest.module.js';
import { AccesoActual, IdentidadActual, Publico, Roles } from '../src/decoradores.js';
import { servicioNoDisponible } from '../src/errores.js';
import { RESOLUTOR_DE_ACCESO, type ContextoAcceso, type Identidad, type ResolucionAcceso, type ResolutorDeAcceso } from '../src/tipos.js';
import { middlewareTraza } from '../src/traza.js';
import {
  AUDIENCIA,
  EMISOR,
  SECRETO_HS256,
  SUB,
  crearParLlaves,
  firmarConLlave,
  firmarConSecreto,
  iniciarServidorJwks,
  type ParLlaves,
  type ServidorJwks,
} from './ayudas.js';

const ACCESO_ACTIVO: ResolucionAcceso = {
  usuarioId: SUB,
  rol: 'ANALISTA_QA',
  activo: true,
  ambito: { qeSupervisorId: null, analistasSupervisadosIds: [] },
};

/** Resolutor de prueba: sustituye a Organización. */
class ResolutorFalso implements ResolutorDeAcceso {
  resolucion: ResolucionAcceso | null = ACCESO_ACTIVO;
  error: unknown = null;
  contextos: ContextoAcceso[] = [];

  async resolver(_identidad: Identidad, contexto: ContextoAcceso): Promise<ResolucionAcceso | null> {
    this.contextos.push(contexto);
    if (this.error !== null) throw this.error;
    return this.resolucion;
  }
}

@Controller()
class ControladorPrueba {
  @Publico()
  @Get('health')
  salud(): { estado: string } {
    return { estado: 'ok' };
  }

  @Get('privado')
  privado(@IdentidadActual() identidad: Identidad): { id: string; correo: string | null } {
    return { id: identidad.id, correo: identidad.correo };
  }

  @Get('cualquier-rol')
  cualquierRol(@AccesoActual() acceso: ResolucionAcceso): { rol: string } {
    return { rol: acceso.rol };
  }

  @Roles('ADMINISTRADOR')
  @Get('solo-admin')
  soloAdmin(@AccesoActual() acceso: ResolucionAcceso): { rol: string } {
    return { rol: acceso.rol };
  }
}

let app: INestApplication;
let llaveRsa: ParLlaves;
let jwks: ServidorJwks;
let resolutor: ResolutorFalso;

const http = (): ReturnType<typeof request> => request(app.getHttpServer());

before(async () => {
  llaveRsa = await crearParLlaves('RS256', 'llave-rsa-1');
  jwks = await iniciarServidorJwks([llaveRsa]);
  resolutor = new ResolutorFalso();

  const modulo = await Test.createTestingModule({
    imports: [
      AuthNestModule.forRoot({
        verificador: {
          emisor: EMISOR,
          audiencia: AUDIENCIA,
          jwksUrl: jwks.url,
          secretoHs256: SECRETO_HS256,
        },
        resolutor: { useValue: resolutor },
        guardiaAccesoGlobal: true,
      }),
    ],
    controllers: [ControladorPrueba],
  }).compile();

  app = modulo.createNestApplication({ logger: false });
  app.use(middlewareTraza);
  await app.init();
});

after(async () => {
  await app.close();
  await jwks.cerrar();
});

beforeEach(() => {
  resolutor.resolucion = ACCESO_ACTIVO;
  resolutor.error = null;
  resolutor.contextos = [];
});

describe('IdentidadGuard', () => {
  it('deja pasar una ruta pública sin token', async () => {
    const respuesta = await http().get('/health');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { estado: 'ok' });
  });

  it('token válido: expone sub y correo', async () => {
    const token = await firmarConLlave(llaveRsa);
    const respuesta = await http().get('/privado').set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { id: SUB, correo: 'ana.perez@quality360.local' });
  });

  it('sin cabecera Authorization: 401 NO_AUTENTICADO con traceId', async () => {
    const respuesta = await http().get('/privado');
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
    assert.equal(respuesta.body.mensaje, 'Debes iniciar sesión.');
    assert.deepEqual(respuesta.body.detalles, []);
    assert.equal(respuesta.body.traceId, respuesta.headers['x-trace-id']);
  });

  it('token expirado: 401 SESION_EXPIRADA (E1-B11#1)', async () => {
    const token = await firmarConLlave(llaveRsa, { vigenciaSegundos: -120 });
    const respuesta = await http().get('/privado').set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'SESION_EXPIRADA');
    assert.equal(respuesta.body.mensaje, 'Tu sesión expiró. Inicia sesión nuevamente.');
  });

  it('firma inválida: 401 NO_AUTENTICADO', async () => {
    const intrusa = await crearParLlaves('RS256', 'llave-rsa-1');
    const token = await firmarConLlave(llaveRsa, {}, intrusa.privada);
    const respuesta = await http().get('/privado').set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
  });

  it('aud incorrecto: 401 NO_AUTENTICADO', async () => {
    const token = await firmarConLlave(llaveRsa, { audiencia: 'otro-publico' });
    const respuesta = await http().get('/privado').set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
  });

  it('no resuelve acceso si la sesión no es válida', async () => {
    await http().get('/cualquier-rol');
    assert.equal(resolutor.contextos.length, 0);
  });

  it('propaga una traza válida del cliente y descarta una peligrosa', async () => {
    const token = await firmarConLlave(llaveRsa);
    const buena = await http()
      .get('/privado')
      .set('authorization', `Bearer ${token}`)
      .set('x-trace-id', '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(buena.headers['x-trace-id'], '4bf92f3577b34da6a3ce929d0e0e4736');

    const mala = await http().get('/privado').set('x-trace-id', 'traza con espacios');
    assert.notEqual(mala.body.traceId, 'traza con espacios');
    assert.match(mala.body.traceId, /^[0-9a-f]{32}$/);
  });
});

describe('AccesoGuard', () => {
  it('usuario activo con rol permitido: 200', async () => {
    resolutor.resolucion = { ...ACCESO_ACTIVO, rol: 'ADMINISTRADOR' };
    const token = await firmarConLlave(llaveRsa);
    const respuesta = await http().get('/solo-admin').set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { rol: 'ADMINISTRADOR' });
  });

  it('usuario inactivo: 403 aunque el token siga siendo válido (E1-B07#3)', async () => {
    resolutor.resolucion = { ...ACCESO_ACTIVO, activo: false };
    const token = await firmarConLlave(llaveRsa);
    const respuesta = await http().get('/cualquier-rol').set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
  });

  it('rol no permitido: 403', async () => {
    const token = await firmarConLlave(llaveRsa);
    const respuesta = await http().get('/solo-admin').set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
  });

  it('el rol del token no vale: manda el de Organización (D4)', async () => {
    const token = await firmarConLlave(llaveRsa, {
      extras: { user_metadata: { rol: 'ADMINISTRADOR' }, app_metadata: { rol: 'ADMINISTRADOR' } },
    });
    const respuesta = await http().get('/solo-admin').set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 403, 'un rol inyectado en el token no debe abrir una ruta de administrador');
  });

  it('inactivo, sin registro y rol no permitido responden lo mismo (D12)', async () => {
    const token = await firmarConLlave(llaveRsa);
    const autorizacion = `Bearer ${token}`;

    resolutor.resolucion = { ...ACCESO_ACTIVO, activo: false };
    const inactivo = await http().get('/solo-admin').set('authorization', autorizacion);
    resolutor.resolucion = null;
    const sinRegistro = await http().get('/solo-admin').set('authorization', autorizacion);
    resolutor.resolucion = ACCESO_ACTIVO;
    const rolAjeno = await http().get('/solo-admin').set('authorization', autorizacion);

    for (const respuesta of [inactivo, sinRegistro, rolAjeno]) {
      assert.equal(respuesta.status, 403);
      assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
      assert.equal(respuesta.body.mensaje, 'No tienes acceso a este recurso.');
      assert.deepEqual(respuesta.body.detalles, []);
    }
  });

  it('si Organización no responde, 503 y nunca acceso concedido', async () => {
    resolutor.error = servicioNoDisponible('Organización caída');
    const token = await firmarConLlave(llaveRsa);
    const respuesta = await http().get('/cualquier-rol').set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
  });

  it('resuelve el acceso en cada solicitud, sin caché', async () => {
    const token = await firmarConLlave(llaveRsa);
    await http().get('/cualquier-rol').set('authorization', `Bearer ${token}`);
    await http().get('/cualquier-rol').set('authorization', `Bearer ${token}`);
    assert.equal(resolutor.contextos.length, 2);
    assert.ok(resolutor.contextos[0]?.traceId);
  });
});

describe('Registro del resolutor', () => {
  it('sin ResolutorDeAcceso el guard falla cerrado con 500', async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        AuthNestModule.forRoot({
          verificador: { emisor: EMISOR, audiencia: AUDIENCIA, secretoHs256: SECRETO_HS256 },
          guardiaAccesoGlobal: true,
        }),
      ],
      controllers: [ControladorPrueba],
    }).compile();
    const aplicacion = modulo.createNestApplication({ logger: false });
    await aplicacion.init();

    // Esta aplicación solo verifica HS256, así que el token va con el secreto.
    const token = await firmarConSecreto(SECRETO_HS256);
    const respuesta = await request(aplicacion.getHttpServer())
      .get('/cualquier-rol')
      .set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 500);
    assert.equal(respuesta.body.codigo, 'ERROR_INTERNO');
    assert.equal(respuesta.body.mensaje, 'Ocurrió un error inesperado.');

    await aplicacion.close();
  });

  it('el token de RESOLUTOR_DE_ACCESO es estable entre copias del paquete', () => {
    assert.equal(RESOLUTOR_DE_ACCESO, Symbol.for('quality360.ResolutorDeAcceso'));
  });
});
