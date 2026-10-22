/**
 * Fixture de la sección 3 del backlog E7: células CEL-A/B/C, usuarios ADM1, QE1, QE2,
 * ANA1–ANA4, LID1, LID2, AUD1 e INACT1, y las HDU H1–H8. Se carga directo en la base local
 * con las mismas tablas que usa la API; el estado del checklist lo simula `CertificacionesFalsa`.
 */
import { crearUsuarioDePrueba, prisma, type UsuarioDePrueba } from './ayudas.js';
import type { CertificacionesFalsa } from './certificaciones-falsa.js';
import type { EstadoHdu, PrioridadHdu } from '../src/dominio/tipos.js';

export interface HduFixture {
  readonly id: string;
  readonly codigo: string;
}

export interface FixtureE7 {
  readonly adm1: UsuarioDePrueba;
  readonly qe1: UsuarioDePrueba;
  readonly qe2: UsuarioDePrueba;
  readonly ana1: UsuarioDePrueba;
  readonly ana2: UsuarioDePrueba;
  readonly ana3: UsuarioDePrueba;
  readonly ana4: UsuarioDePrueba;
  readonly lid1: UsuarioDePrueba;
  readonly lid2: UsuarioDePrueba;
  readonly aud1: UsuarioDePrueba;
  readonly inact1: UsuarioDePrueba;
  readonly celdaA: { id: string; nombre: string };
  readonly celdaB: { id: string; nombre: string };
  readonly celdaC: { id: string; nombre: string };
  readonly sprint: { id: string; nombre: string };
  readonly h: Record<'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8', HduFixture>;
}

const ACTOR = { actorTipo: 'SERVICIO' as const, actorId: 'prueba', actorNombre: 'prueba' };

export async function crearFixtureE7(certificaciones: CertificacionesFalsa | null = null): Promise<FixtureE7> {
  const adm1 = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'ADM1' });
  const qe1 = await crearUsuarioDePrueba('QE', { nombre: 'QE1' });
  const qe2 = await crearUsuarioDePrueba('QE', { nombre: 'QE2' });
  const ana1 = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA1' });
  const ana2 = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA2' });
  const ana3 = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA3' });
  const ana4 = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA4' });
  const lid1 = await crearUsuarioDePrueba('LIDER_QA', { nombre: 'LID1' });
  const lid2 = await crearUsuarioDePrueba('LIDER_QA', { nombre: 'LID2' });
  const aud1 = await crearUsuarioDePrueba('AUDITOR', { nombre: 'AUD1' });
  const inact1 = await crearUsuarioDePrueba('QE', { nombre: 'INACT1', activo: false });

  const celdaA = await prisma.celula.create({ data: { nombre: 'CEL-A' }, select: { id: true, nombre: true } });
  const celdaB = await prisma.celula.create({ data: { nombre: 'CEL-B' }, select: { id: true, nombre: true } });
  const celdaC = await prisma.celula.create({ data: { nombre: 'CEL-C' }, select: { id: true, nombre: true } });
  const sprint = await prisma.sprint.create({
    data: { nombre: 'Sprint E7', inicio: new Date('2026-10-01'), fin: new Date('2026-10-14'), celulaId: celdaA.id },
    select: { id: true, nombre: true },
  });

  for (const [qe, analista] of [[qe1, ana1], [qe1, ana2], [qe2, ana3]] as const) {
    await prisma.supervision.create({ data: { qeId: qe.id, analistaId: analista.id, ...ACTOR } });
  }
  for (const celula of [celdaA, celdaB]) {
    await prisma.celulaLider.create({
      data: { usuarioId: lid1.id, celulaId: celula.id, asignadoPorTipo: 'USUARIO', asignadoPorId: adm1.id, asignadoPorNombre: adm1.nombre },
    });
  }

  let contador = 0;
  const crear = async (
    codigo: string,
    celula: { id: string },
    qe: UsuarioDePrueba,
    analista: UsuarioDePrueba | null,
    estado: EstadoHdu,
    prioridad: PrioridadHdu = 'MEDIA',
  ): Promise<HduFixture> => {
    contador += 1;
    const creada = await prisma.hdu.create({
      data: {
        codigo,
        codigoNormalizado: codigo.toLowerCase(),
        titulo: `Historia ${codigo}`,
        celulaId: celula.id,
        historiaSprints: { create: { sprintId: sprint.id } },
        prioridad,
        qeResponsableId: qe.id,
        analistaId: analista?.id ?? null,
        estado,
        // Cada HDU se creó un día después de la anterior: la antigüedad de las acciones es estable.
        creadoEn: new Date(Date.now() - (20 - contador) * 24 * 60 * 60 * 1000),
        creadoPorTipo: 'SERVICIO',
        creadoPorId: 'prueba',
        creadoPorNombre: 'prueba',
      },
    });
    return { id: creada.id, codigo };
  };

  const h = {
    H1: await crear('H1', celdaA, qe1, ana1, 'EN_EJECUCION', 'ALTA'),
    H2: await crear('H2', celdaA, qe1, ana2, 'EN_EJECUCION', 'MEDIA'),
    H3: await crear('H3', celdaB, qe2, ana3, 'PENDIENTE'),
    H4: await crear('H4', celdaC, qe2, ana3, 'DISENO_PRUEBAS'),
    H5: await crear('H5', celdaA, qe1, null, 'PENDIENTE'),
    H6: await crear('H6', celdaB, qe1, ana1, 'EN_EJECUCION', 'BAJA'),
    H7: await crear('H7', celdaA, qe2, ana3, 'CERRADA'),
    H8: await crear('H8', celdaC, qe1, ana2, 'PENDIENTE_CIERRE'),
  };

  if (certificaciones !== null) {
    const dia = (n: number): string => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
    certificaciones.fijar(h.H1.id, { aprobados: 3, porcentaje: 30, porAprobar: 1, porAprobarDesde: dia(2), siguienteEntregable: { clave: 'APROBACION_CASOS', orden: 4, nombre: 'Aprobación de casos de prueba' } });
    certificaciones.fijar(h.H2.id, { aprobados: 1, porcentaje: 10, observaciones: 1, siguienteEntregable: { clave: 'DASHBOARD', orden: 2, nombre: 'Dashboard' } });
    certificaciones.fijar(h.H6.id, { aprobados: 8, porcentaje: 80, listaParaCertificar: true, listaDesde: dia(3), siguienteEntregable: { clave: 'CERTIFICADO', orden: 9, nombre: 'Certificado' } });
    certificaciones.fijar(h.H7.id, { aprobados: 10, porcentaje: 100, listaParaCerrar: true, listaDesde: dia(9), siguienteEntregable: null, certificado: { folio: 'F7', emitidoEn: dia(9) } });
    certificaciones.fijar(h.H8.id, { aprobados: 10, porcentaje: 100, listaParaCerrar: true, listaDesde: dia(4), siguienteEntregable: null, certificado: { folio: 'F8', emitidoEn: dia(4) } });
  }

  return { adm1, qe1, qe2, ana1, ana2, ana3, ana4, lid1, lid2, aud1, inact1, celdaA, celdaB, celdaC, sprint, h };
}
