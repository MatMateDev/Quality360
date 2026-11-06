/**
 * Utilidades de prueba de integración: usuarios de Supabase Auth reales
 * (Admin API + inicio de sesión por contraseña contra el Supabase local) y
 * limpieza de las tablas de `organizacion` entre pruebas.
 */
import './entorno.js';

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '#prisma';
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

  await prisma.usuario.create({ data: { id, nombre, correo, rol: { connect: { nombre: rol } }, activo: opciones.activo ?? true } });

  const sesion = await anon.auth.signInWithPassword({ email: correo, password: CONTRASENA_PRUEBA });
  if (sesion.error || sesion.data.session === null) {
    throw new Error(`No se pudo iniciar sesión de prueba: ${sesion.error?.message}`);
  }

  return { id, nombre, correo, rol, token: sesion.data.session.access_token };
}

/** Borra cuentas de prueba de Supabase Auth; ignora las que ya no existen. El registro local lo borra quien llama. */
export async function eliminarCuentasDePrueba(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && error.status !== 404) throw new Error(`No se pudo borrar la cuenta de prueba ${id}: ${error.message}`);
  }
}

/** Lo que una prueba creó y debe borrar al terminar, aunque falle a mitad de camino. */
export interface CreadosEnPrueba {
  readonly usuarios: string[];
  readonly hdus: string[];
  readonly sprints: string[];
  readonly celulas: string[];
}

export function nuevosCreados(): CreadosEnPrueba {
  return { usuarios: [], hdus: [], sprints: [], celulas: [] };
}

/**
 * Borra solo lo registrado en `creados` (no trunca: sirve también sobre una base con otros datos), con sus historiales,
 * auditoría, vínculos de líder y supervisión, y las cuentas de Supabase Auth de los usuarios.
 */
export async function borrarCreados(creados: CreadosEnPrueba): Promise<void> {
  const { usuarios, hdus, sprints, celulas } = creados;
  await prisma.auditoria.deleteMany({ where: { OR: [{ entidadId: { in: [...usuarios, ...hdus] } }, { actorId: { in: usuarios } }] } });
  await prisma.hduHistorialResponsable.deleteMany({ where: { hduId: { in: hdus } } });
  await prisma.hduHistorialAsignacion.deleteMany({ where: { hduId: { in: hdus } } });
  await prisma.hduHistorialEstado.deleteMany({ where: { hduId: { in: hdus } } });
  await prisma.historiaSprint.deleteMany({ where: { OR: [{ hduId: { in: hdus } }, { sprintId: { in: sprints } }] } });
  await prisma.hdu.deleteMany({ where: { id: { in: hdus } } });
  await prisma.sprint.deleteMany({ where: { id: { in: sprints } } });
  await prisma.celulaLider.deleteMany({ where: { OR: [{ usuarioId: { in: usuarios } }, { celulaId: { in: celulas } }] } });
  await prisma.celula.deleteMany({ where: { id: { in: celulas } } });
  await prisma.supervision.deleteMany({ where: { OR: [{ qeId: { in: usuarios } }, { analistaId: { in: usuarios } }] } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
  await eliminarCuentasDePrueba(usuarios);
}

/** Limpia las tablas de `organizacion` entre pruebas (base local compartida, sin datos reales). */
export async function limpiarBaseDeDatos(): Promise<void> {
  await prisma.$executeRawUnsafe(
    // `rol` no se trunca: es un catálogo que carga la migración.
    'TRUNCATE TABLE auditoria, celula_lider, hdu_historial_responsable, hdu_historial_asignacion, hdu_historial_estado, historia_sprint, historia_usuario, supervision, sprint, celula, usuario RESTART IDENTITY CASCADE',
  );
}

export function autorizacion(token: string): string {
  return `Bearer ${token}`;
}

/** Los catálogos no tienen CRUD en el backlog (los carga la semilla); las pruebas los insertan directo. */
export async function crearCelulaDePrueba(nombre = `Célula ${randomUUID()}`): Promise<{ id: string; nombre: string }> {
  return prisma.celula.create({ data: { nombre }, select: { id: true, nombre: true } });
}

export async function crearSprintDePrueba(
  nombre = `Sprint ${randomUUID()}`,
  inicio = new Date('2026-01-01'),
  fin = new Date('2026-01-14'),
): Promise<{ id: string; nombre: string; inicio: Date; fin: Date }> {
  // Sprint.id_celula es obligatorio en el modelo de datos: cada sprint de prueba trae su célula.
  const celula = await crearCelulaDePrueba();
  return prisma.sprint.create({ data: { nombre, inicio, fin, celulaId: celula.id }, select: { id: true, nombre: true, inicio: true, fin: true } });
}
