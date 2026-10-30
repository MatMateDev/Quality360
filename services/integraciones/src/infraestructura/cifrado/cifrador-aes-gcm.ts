/**
 * Cifrado del API token de Jira con AES-256-GCM (D94, D128). IV aleatorio de 12 bytes en cada cifrado, etiqueta de
 * 16 bytes y dato asociado `q360:jira:token:v1`. La llave (32 bytes) viene de `INTEGRACIONES_LLAVE_CIFRADO` y nunca
 * se guarda en la base ni en el repositorio. El token solo vive en memoria durante la petición: este módulo no lo
 * registra ni lo serializa, y los errores que lanza no contienen ni el token ni la llave.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CifradorToken } from '../../aplicacion/puertos.js';
import { CONFIGURACION, type ConfiguracionIntegraciones } from '../../configuracion.js';
import { LlaveCifradoNoDisponible, TokenNoDescifrable } from '../../dominio/errores.js';
import type { TokenCifradoGuardado } from '../../dominio/tipos.js';

export const DATO_ASOCIADO_TOKEN = 'q360:jira:token:v1';
const ALGORITMO = 'aes-256-gcm';
const LARGO_IV = 12;
const LARGO_TAG = 16;
export const VERSION_LLAVE = 1;

/** Implementación pura sobre una llave; la usan la clase de Nest y las pruebas. */
export class CifradorAesGcm extends CifradorToken {
  constructor(private readonly llave: Buffer | null) {
    super();
  }

  get disponible(): boolean {
    return this.llave !== null && this.llave.length === 32;
  }

  cifrar(token: string): TokenCifradoGuardado {
    if (!this.disponible) throw new LlaveCifradoNoDisponible();
    const iv = randomBytes(LARGO_IV);
    const cifrador = createCipheriv(ALGORITMO, this.llave as Buffer, iv, { authTagLength: LARGO_TAG });
    cifrador.setAAD(Buffer.from(DATO_ASOCIADO_TOKEN, 'utf8'));
    const cifrado = Buffer.concat([cifrador.update(token, 'utf8'), cifrador.final()]);
    return { cifrado, iv, tag: cifrador.getAuthTag(), ultimos4: token.slice(-4), llaveVersion: VERSION_LLAVE };
  }

  descifrar(token: TokenCifradoGuardado): string {
    if (!this.disponible) throw new LlaveCifradoNoDisponible();
    try {
      const descifrador = createDecipheriv(ALGORITMO, this.llave as Buffer, token.iv, { authTagLength: LARGO_TAG });
      descifrador.setAAD(Buffer.from(DATO_ASOCIADO_TOKEN, 'utf8'));
      descifrador.setAuthTag(token.tag);
      return Buffer.concat([descifrador.update(token.cifrado), descifrador.final()]).toString('utf8');
    } catch {
      // Llave distinta, etiqueta alterada o datos dañados: nunca se propaga el error de `crypto`.
      throw new TokenNoDescifrable();
    }
  }
}

@Injectable()
export class CifradorTokenAesGcm extends CifradorAesGcm {
  constructor(@Inject(CONFIGURACION) configuracion: ConfiguracionIntegraciones) {
    super(configuracion.llaveCifrado);
  }
}
