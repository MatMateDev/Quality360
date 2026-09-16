/**
 * Implementación del puerto `ProveedorIdentidad` con la Admin API de
 * Supabase Auth. `service_role` se usa SOLO aquí (D3) y solo desde el
 * backend: nunca se envía al portal ni a otro servicio.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ErrorProveedorIdentidad, type ProveedorIdentidad } from '../../aplicacion/puertos/proveedor-identidad.js';
import { CONFIGURACION, type ConfiguracionOrganizacion } from '../../configuracion.js';

@Injectable()
export class ProveedorIdentidadSupabase implements ProveedorIdentidad {
  private readonly registro = new Logger(ProveedorIdentidadSupabase.name);
  private readonly cliente: SupabaseClient;

  constructor(@Inject(CONFIGURACION) configuracion: ConfiguracionOrganizacion) {
    this.cliente = createClient(configuracion.supabaseUrl, configuracion.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async invitarUsuario(input: { correo: string; nombre: string }): Promise<{ id: string }> {
    const { data, error } = await this.intentar(() =>
      this.cliente.auth.admin.inviteUserByEmail(input.correo, { data: { nombre: input.nombre } }),
    );
    if (error !== null || data.user === null) {
      throw new ErrorProveedorIdentidad(`No se pudo invitar al usuario en Supabase Auth: ${error?.message ?? 'sin datos'}`, error);
    }
    return { id: data.user.id };
  }

  async crearUsuarioConContrasena(input: { correo: string; nombre: string; contrasena: string }): Promise<{ id: string }> {
    const { data, error } = await this.intentar(() =>
      this.cliente.auth.admin.createUser({
        email: input.correo,
        password: input.contrasena,
        email_confirm: true,
        user_metadata: { nombre: input.nombre },
      }),
    );
    if (error !== null || data.user === null) {
      throw new ErrorProveedorIdentidad(`No se pudo crear el usuario en Supabase Auth: ${error?.message ?? 'sin datos'}`, error);
    }
    return { id: data.user.id };
  }

  async invitarOVincularUsuario(input: { correo: string; nombre: string }): Promise<{ id: string }> {
    try {
      const { data, error } = await this.cliente.auth.admin.inviteUserByEmail(input.correo, { data: { nombre: input.nombre } });
      if (error === null && data.user !== null) return { id: data.user.id };

      const existente = await this.buscarPorCorreo(input.correo);
      if (existente !== null) return existente;

      throw new ErrorProveedorIdentidad(`No se pudo invitar ni vincular al usuario en Supabase Auth: ${error?.message ?? 'sin datos'}`, error);
    } catch (error) {
      if (error instanceof ErrorProveedorIdentidad) throw error;
      const existente = await this.buscarPorCorreo(input.correo);
      if (existente !== null) return existente;
      const detalle = error instanceof Error ? error.message : 'desconocido';
      throw new ErrorProveedorIdentidad(`Supabase Auth no respondió: ${detalle}`, error);
    }
  }

  /** Busca por correo listando usuarios (alcanza para el volumen de una semilla local). */
  private async buscarPorCorreo(correo: string): Promise<{ id: string } | null> {
    try {
      const { data, error } = await this.cliente.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error !== null || data === null) return null;
      const objetivo = correo.trim().toLowerCase();
      const encontrado = data.users.find((usuario) => usuario.email?.toLowerCase() === objetivo);
      return encontrado === undefined ? null : { id: encontrado.id };
    } catch {
      return null;
    }
  }

  async actualizarCorreo(id: string, correo: string): Promise<void> {
    const { error } = await this.intentar(() => this.cliente.auth.admin.updateUserById(id, { email: correo, email_confirm: true }));
    if (error !== null) {
      throw new ErrorProveedorIdentidad(`No se pudo actualizar el correo en Supabase Auth: ${error.message}`, error);
    }
  }

  async eliminarUsuario(id: string): Promise<void> {
    const { error } = await this.intentar(() => this.cliente.auth.admin.deleteUser(id));
    if (error !== null) {
      // Compensación: se deja constancia en el log, pero no se vuelve a lanzar
      // para no ocultar el error original que gatilló la compensación.
      this.registro.error(`No se pudo compensar (eliminar) el usuario ${id} en Supabase Auth: ${error.message}`);
    }
  }

  private async intentar<T>(accion: () => Promise<T>): Promise<T> {
    try {
      return await accion();
    } catch (error) {
      const detalle = error instanceof Error ? error.message : 'desconocido';
      throw new ErrorProveedorIdentidad(`Supabase Auth no respondió: ${detalle}`, error);
    }
  }
}
