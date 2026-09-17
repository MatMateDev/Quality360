/**
 * Archivos de evidencias y certificados en Supabase Storage, siempre en buckets
 * privados y con URL firmadas (D20). Las pruebas reemplazan `ALMACEN_ARCHIVOS`.
 */
import { Inject, Injectable } from '@nestjs/common';
import { servicioNoDisponible } from '@quality360/auth-nest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { CONFIGURACION, type ConfiguracionCertificaciones } from '../configuracion.js';

export const BUCKET_EVIDENCIAS = 'evidencias';
export const BUCKET_CERTIFICADOS = 'certificados';

export const ALMACEN_ARCHIVOS = Symbol.for('quality360.AlmacenArchivos');

export interface SubidaFirmada {
  readonly ruta: string;
  readonly urlSubida: string;
  readonly token: string;
}

export interface MetadatosArchivo {
  readonly tamanoBytes: number;
  readonly tipoContenido: string;
}

export interface AlmacenArchivos {
  firmarSubida(bucket: string, ruta: string): Promise<SubidaFirmada>;
  /** `null` si el archivo no existe. */
  metadatos(bucket: string, ruta: string): Promise<MetadatosArchivo | null>;
  subir(bucket: string, ruta: string, contenido: Uint8Array, tipoContenido: string): Promise<void>;
  eliminar(bucket: string, ruta: string): Promise<void>;
  firmarDescarga(bucket: string, ruta: string, segundos: number, nombreDescarga?: string): Promise<string>;
}

@Injectable()
export class AlmacenSupabase implements AlmacenArchivos {
  private readonly cliente: SupabaseClient;

  constructor(@Inject(CONFIGURACION) configuracion: ConfiguracionCertificaciones) {
    this.cliente = createClient(configuracion.supabaseUrl, configuracion.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async firmarSubida(bucket: string, ruta: string): Promise<SubidaFirmada> {
    const { data, error } = await this.cliente.storage.from(bucket).createSignedUploadUrl(ruta);
    if (error !== null || data === null) throw servicioNoDisponible(`Storage no firmó la subida: ${error?.message ?? 'sin datos'}`);
    return { ruta: data.path, urlSubida: data.signedUrl, token: data.token };
  }

  async metadatos(bucket: string, ruta: string): Promise<MetadatosArchivo | null> {
    const corte = ruta.lastIndexOf('/');
    const carpeta = ruta.slice(0, corte);
    const nombre = ruta.slice(corte + 1);
    const { data, error } = await this.cliente.storage.from(bucket).list(carpeta, { search: nombre, limit: 100 });
    if (error !== null) throw servicioNoDisponible(`Storage no listó ${carpeta}: ${error.message}`);
    const archivo = (data ?? []).find((item) => item.name === nombre);
    if (archivo === undefined || archivo.metadata === null || archivo.metadata === undefined) return null;
    const metadata = archivo.metadata as { size?: unknown; mimetype?: unknown };
    return {
      tamanoBytes: typeof metadata.size === 'number' ? metadata.size : 0,
      tipoContenido: typeof metadata.mimetype === 'string' ? metadata.mimetype : '',
    };
  }

  async subir(bucket: string, ruta: string, contenido: Uint8Array, tipoContenido: string): Promise<void> {
    const { error } = await this.cliente.storage.from(bucket).upload(ruta, contenido, { contentType: tipoContenido, upsert: false });
    if (error !== null) throw servicioNoDisponible(`Storage no guardó ${ruta}: ${error.message}`);
  }

  async eliminar(bucket: string, ruta: string): Promise<void> {
    await this.cliente.storage.from(bucket).remove([ruta]);
  }

  async firmarDescarga(bucket: string, ruta: string, segundos: number, nombreDescarga?: string): Promise<string> {
    const { data, error } = await this.cliente.storage
      .from(bucket)
      .createSignedUrl(ruta, segundos, nombreDescarga === undefined ? undefined : { download: nombreDescarga });
    if (error !== null || data === null) throw servicioNoDisponible(`Storage no firmó la descarga: ${error?.message ?? 'sin datos'}`);
    return data.signedUrl;
  }
}
