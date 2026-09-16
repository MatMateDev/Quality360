/**
 * Utilidades de prueba de integración: usuarios de Supabase Auth reales
 * (Admin API + inicio de sesión por contraseña contra el Supabase local) y
 * limpieza de las tablas de `organizacion` entre pruebas.
 */
import './entorno.js';

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

import type { Rol } from '../src/dominio/tipos.js';

const SUPABASE_URL = requerido('SUPABASE_URL');
const SUPABASE_ANON_KEY = requerido('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = requerido('SUPABASE_SERVICE_ROLE_KEY');
const CONTRASENA_PRUEBA = 'Prueba-Quality360-12345678';

function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim().length === 0) {
    throw new Error(`Falta ${nombre} para las pruebas de integración (ver .env.test).`);
  }
  return valor;
}

export const prisma = new PrismaClient();

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

export interface UsuarioDePrueba {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: Rol;
  readonly token: string;
}

/** Crea la cuenta en Supabase Auth (Admin API), el registro local y devuelve un access token real. */
export async function crearUsuarioDePrueba(rol: Rol, opciones: { nombre?: string; activo?: boolean } = {}): Promise<UsuarioDePrueba> {
  const correo = `prueba.${randomUUID()}@quality360.local`;
  const nombre = opciones.nombre ?? `Usuario de prueba ${rol}`;

  const creado = await admin.auth.admin.createUser({ email: correo, password: CONTRASENA_PRUEBA, email_confirm: true });
  if (creado.error || creado.data.user === null) {
    throw new Error(`No se pudo crear el usuario de prueba en Supabase Auth: ${creado.error?.message}`);
  }
  const id = creado.data.user.id;

  await prisma.usuario.create({ data: { id, nombre, correo, rol, activo: opciones.activo ?? true } });

  const sesion = await anon.auth.signInWithPassword({ email: correo, password: CONTRASENA_PRUEBA });
  if (sesion.error || sesion.data.session === null) {
    throw new Error(`No se pudo iniciar sesión de prueba: ${sesion.error?.message}`);
  }

  return { id, nombre, correo, rol, token: sesion.data.session.access_token };
}

/** Limpia las tablas de `organizacion` entre pruebas (base local compartida, sin datos reales). */
export async function limpiarBaseDeDatos(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE auditoria, hdu_historial_asignacion, hdu_historial_estado, hdu, supervision, sprint, celula, usuario RESTART IDENTITY CASCADE',
  );
}

export function autorizacion(token: string): string {
  return `Bearer ${token}`;
}

/** Los catálogos no tienen CRUD en el backlog (los carga la semilla); las pruebas los insertan directo. */
export async function crearCelulaDePrueba(nombre = `Célula ${randomUUID()}`): Promise<{ id: string; nombre: string }> {
  return prisma.celula.create({ data: { nombre } });
}

export async function crearSprintDePrueba(
  nombre = `Sprint ${randomUUID()}`,
  inicio = new Date('2026-01-01'),
  fin = new Date('2026-01-14'),
): Promise<{ id: string; nombre: string; inicio: Date; fin: Date }> {
  return prisma.sprint.create({ data: { nombre, inicio, fin } });
}
