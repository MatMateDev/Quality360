/**
 * Errores del dominio y de la aplicación. La capa `api` los traduce al formato común de `comun.v1.yaml`.
 * Ninguno lleva el token, la llave ni texto de Jira.
 */

/** Falta o es inválida `INTEGRACIONES_LLAVE_CIFRADO`: solo cifrar y descifrar fallan (D128). */
export class LlaveCifradoNoDisponible extends Error {
  constructor() {
    super('LLAVE_CIFRADO_NO_DISPONIBLE');
  }
}

/** La llave cambió o el token guardado está dañado: hay que volver a ingresarlo (D94). */
export class TokenNoDescifrable extends Error {
  constructor() {
    super('TOKEN_NO_DESCIFRABLE');
  }
}

/** Ya hay una ejecución activa (D104): índice único parcial `ejecucion_en_curso_key`. */
export class IntegracionEnCurso extends Error {
  constructor() {
    super('INTEGRACION_EN_CURSO');
  }
}

/** Organización no respondió o respondió algo ilegible. El detalle va al registro, nunca a la respuesta. */
export class OrganizacionNoDisponible extends Error {
  constructor(readonly motivo: string) {
    super('ORGANIZACION_NO_DISPONIBLE');
  }
}

/** No hay configuración de Jira guardada (409 `JIRA_NO_CONFIGURADO`). */
export class JiraNoConfigurado extends Error {
  constructor() {
    super('JIRA_NO_CONFIGURADO');
  }
}

/** El destino de las HDU no es válido en Organización (422 `CATALOGO_INVALIDO` o `QE_INVALIDO`, D120). */
export class DestinoInvalido extends Error {
  constructor(
    readonly codigo: 'CATALOGO_INVALIDO' | 'QE_INVALIDO',
    readonly detalles: Array<{ campo: string; codigo: string; mensaje: string }>,
  ) {
    super(codigo);
  }
}

/** Error de estructura de un archivo (sección 4.3 del backlog E5): 413 o 422 con `ErrorArchivo`. */
export class ErrorEstructuraArchivo extends Error {
  constructor(
    readonly codigo: 'ARCHIVO_MUY_GRANDE' | 'ARCHIVO_VACIO' | 'FORMATO_NO_SOPORTADO' | 'ARCHIVO_ILEGIBLE' | 'COLUMNAS_FALTANTES' | 'DEMASIADAS_FILAS',
    readonly ejecucionId: string | null,
    readonly columnasFaltantes: Array<'codigo' | 'titulo'> = [],
  ) {
    super(codigo);
  }
}

/** Organización negó el recurso (403): por ejemplo, el upsert con un token que no es de un Administrador. */
export class OrganizacionDenego extends Error {
  constructor(readonly motivo: string) {
    super('ORGANIZACION_DENEGO');
  }
}
