/**
 * Cargas idempotentes de la semilla E4 (D88): solo con la credencial de servicio y
 * `PERMITIR_CARGA_SEMILLA=true`. No valida la relación con la HDU ni consulta otros servicios.
 */
import { Injectable } from '@nestjs/common';
import { errorValidacion } from '@quality360/auth-nest';

import { CargaRepositorio, type CargaImpedimentoDatos, type CargaRiesgoDatos } from '../dominio/repositorios.js';

@Injectable()
export class CargaSemillaAplicacion {
  constructor(private readonly repositorio: CargaRepositorio) {}

  cargarImpedimento(datos: CargaImpedimentoDatos): Promise<{ creado: boolean; id: string }> {
    const primera = datos.acciones[0];
    if (primera?.tipo !== 'REGISTRAR') {
      throw errorValidacion([{ campo: 'acciones', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'La primera acción debe ser REGISTRAR.' }]);
    }
    for (let i = 1; i < datos.acciones.length; i += 1) {
      const anterior = datos.acciones[i - 1];
      const accion = datos.acciones[i];
      if (anterior === undefined || accion === undefined) continue;
      if (accion.tipo === 'REGISTRAR' || accion.fecha.getTime() < anterior.fecha.getTime() || accion.estadoAnterior !== anterior.estado) {
        throw errorValidacion([{ campo: `acciones[${i}]`, codigo: 'VALOR_NO_PERMITIDO', mensaje: 'Las acciones deben ser cronológicas y encadenar los estados.' }]);
      }
      if (accion.tipo === 'ESCALAR' && accion.responsableNuevo === undefined) {
        throw errorValidacion([{ campo: `acciones[${i}].responsableNuevo`, codigo: 'REQUERIDO', mensaje: 'Indica el nuevo responsable.' }]);
      }
    }
    return this.repositorio.cargarImpedimento(datos);
  }

  cargarRiesgo(datos: CargaRiesgoDatos): Promise<{ creado: boolean; id: string }> {
    return this.repositorio.cargarRiesgo(datos);
  }
}
