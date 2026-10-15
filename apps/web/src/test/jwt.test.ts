import { describe, expect, it } from "vitest";
import { autenticadoConContrasena, decodificarPayloadJwt, metodosDeAutenticacion } from "@/auth/jwt";
import { base64Estandar, base64Url, crearJwtConPayload } from "./jwtPrueba";

describe("[E1-F13] lectura del payload de un JWT (sin librerías)", () => {
  it("decodifica base64url con y sin relleno, y con caracteres UTF-8", () => {
    const payload = { sub: "u1", nombre: "Ñandú Pérez", simbolos: "??>>~~" };
    expect(decodificarPayloadJwt(crearJwtConPayload(payload))).toEqual(payload);

    // Relleno explícito (=) y alfabeto estándar (+ /) también se toleran.
    const estandar = `${base64Estandar("{}")}.${base64Estandar('{"a":"b"}')}.x`;
    expect(decodificarPayloadJwt(estandar)).toEqual({ a: "b" });
  });

  it("devuelve null si no es un JWT legible", () => {
    expect(decodificarPayloadJwt("")).toBeNull();
    expect(decodificarPayloadJwt("no-es-un-jwt")).toBeNull();
    expect(decodificarPayloadJwt("a.%%%.c")).toBeNull();
    expect(decodificarPayloadJwt(`x.${base64Url("[1,2]")}.z`)).toBeNull();
    expect(decodificarPayloadJwt("mock-token:a1000000-0000-4000-8000-000000000001")).toBeNull();
  });

  it("lista los métodos de autenticación de amr[].method", () => {
    const token = crearJwtConPayload({
      amr: [
        { method: "password", timestamp: 1 },
        { method: "totp", timestamp: 2 },
      ],
    });
    expect(metodosDeAutenticacion(token)).toEqual(["password", "totp"]);
    expect(metodosDeAutenticacion(crearJwtConPayload({ sub: "sin-amr" }))).toEqual([]);
    expect(metodosDeAutenticacion(crearJwtConPayload({ amr: "password" }))).toEqual([]);
    expect(metodosDeAutenticacion(crearJwtConPayload({ amr: [null, 3, { method: 7 }, { method: "otp" }] }))).toEqual(["otp"]);
  });

  it("solo cuenta como «con contraseña» si amr incluye el método password", () => {
    expect(autenticadoConContrasena(crearJwtConPayload({ amr: [{ method: "password", timestamp: 1 }] }))).toBe(true);
    // Sesión del enlace de recuperación: método otp.
    expect(autenticadoConContrasena(crearJwtConPayload({ amr: [{ method: "otp", timestamp: 1 }] }))).toBe(false);
    // Sin claim legible: se rechaza (falla cerrado).
    expect(autenticadoConContrasena(crearJwtConPayload({ sub: "u1" }))).toBe(false);
    expect(autenticadoConContrasena("basura")).toBe(false);
  });
});
