import { HttpResponse } from "msw";
import type { Rol } from "@/types/dominio";
import { analistasVigentesDe, type UsuarioMock } from "./data";
import { ERROR_ACCESO_DENEGADO, ERROR_NO_AUTENTICADO, decodificarToken } from "./utils";

export function autenticar(request: Request): UsuarioMock | HttpResponse<any> {
  const usuario = decodificarToken(request.headers.get("Authorization"));
  if (!usuario) return HttpResponse.json(ERROR_NO_AUTENTICADO(), { status: 401 });
  if (!usuario.activo) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
  return usuario;
}

export function esUsuarioMock(valor: UsuarioMock | HttpResponse<any>): valor is UsuarioMock {
  return "id" in valor;
}

export function exigirRol(usuario: UsuarioMock, ...roles: Rol[]): HttpResponse<any> | null {
  if (!roles.includes(usuario.rol)) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
  return null;
}

export function analistaEnEquipoDe(qeId: string, analistaId: string): boolean {
  return analistasVigentesDe(qeId).some((relacion) => relacion.analistaId === analistaId);
}

