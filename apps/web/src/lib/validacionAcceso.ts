/** Validación en cliente de los campos de acceso. Devuelve el mensaje de error o `undefined` si el valor sirve. */

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LARGO_MINIMO_CONTRASENA = 8;

export function validarCorreo(correo: string): string | undefined {
  const limpio = correo.trim();
  if (!limpio) return "El correo es obligatorio.";
  if (!FORMATO_CORREO.test(limpio)) return "Ingresa un correo válido.";
  return undefined;
}

export function validarContrasenaNueva(contrasena: string): string | undefined {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) return "La contraseña debe tener al menos 8 caracteres.";
  return undefined;
}

export function validarRepeticion(contrasena: string, repetida: string): string | undefined {
  if (contrasena !== repetida) return "Las contraseñas no coinciden.";
  return undefined;
}
