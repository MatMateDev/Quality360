/** Pruebas unitarias del lector de CSV/JSON (J3, D102, sección 5.2 y casos E5-B03-T01 a T03 y T14). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ErrorEstructuraArchivo, LIMITES, type CodigoErrorArchivo } from '../../../src/dominio/mapeo/tipos.js';
import { detectarSeparador, parsearCsv } from '../../../src/infraestructura/archivos/csv.js';
import { columnaCanonica, huellaDe, leerArchivo } from '../../../src/infraestructura/archivos/lector-archivo.js';

const ENCABEZADO = 'codigo,titulo,descripcion,prioridad,celula,sprint,qe_correo';
const VALIDO = [
  ENCABEZADO,
  'ARC-1,Alta de cliente,Registro básico,ALTA,CEL-C,E5 Sprint 2,',
  'ARC-2,Baja de cliente,,MEDIA,,,',
  'ARC-3,"Consulta, con coma",Detalle,baja,,E5 Sprint 1,',
  'ARC-4,Reporte diario,,CRITICA,CEL-C,,qe2@quality360.local',
].join('\n');

function estructura(formato: unknown, contenido: string): ErrorEstructuraArchivo {
  try {
    leerArchivo({ formato, contenido });
  } catch (e) {
    assert.ok(e instanceof ErrorEstructuraArchivo, `se esperaba ErrorEstructuraArchivo y llegó ${String(e)}`);
    return e;
  }
  assert.fail('se esperaba un error de estructura');
}
const codigoDe = (formato: unknown, contenido: string): CodigoErrorArchivo => estructura(formato, contenido).codigo;

describe('parsearCsv', () => {
  it('comillas, comas, comillas duplicadas y saltos de línea dentro del campo', () => {
    const filas = parsearCsv('a,"b,1","c ""x"""\n"l1\nl2",,fin\n', ',');
    assert.deepEqual(filas, [['a', 'b,1', 'c "x"'], ['l1\nl2', '', 'fin']]);
  });
  it('acepta CRLF, LF y CR, y descarta líneas vacías', () => {
    assert.deepEqual(parsearCsv('a,b\r\n\r\nc,d\re,f\n\n', ','), [['a', 'b'], ['c', 'd'], ['e', 'f']]);
  });
  it('una fila final sin salto de línea se conserva', () => {
    assert.deepEqual(parsearCsv('a,b\nc,d', ','), [['a', 'b'], ['c', 'd']]);
  });
  it('una fila de solo separadores no se descarta', () => {
    assert.deepEqual(parsearCsv(',,\n', ','), [['', '', '']]);
  });
  it('campo entrecomillado vacío al final', () => {
    assert.deepEqual(parsearCsv('a,""', ','), [['a', '']]);
  });
  it('una comilla en medio de un campo sin comillas es literal', () => {
    assert.deepEqual(parsearCsv('5" de alto,x', ','), [['5" de alto', 'x']]);
  });
  it('comillas sin cerrar: ARCHIVO_ILEGIBLE', () => {
    assert.throws(() => parsearCsv('a,"sin cerrar\nb,c', ','), (e) => e instanceof ErrorEstructuraArchivo && e.codigo === 'ARCHIVO_ILEGIBLE');
  });
  it('separador punto y coma', () => {
    assert.deepEqual(parsearCsv('a;"b;1";c', ';'), [['a', 'b;1', 'c']]);
  });
  it('detecta el separador solo en el encabezado y fuera de comillas', () => {
    assert.equal(detectarSeparador('codigo;titulo\nA,"x,y",z,w'), ';');
    assert.equal(detectarSeparador('codigo,titulo;x\n'), ',');
    assert.equal(detectarSeparador('"a;b;c",d,e\n'), ',');
    assert.equal(detectarSeparador('solo'), ',');
  });
});

describe('leerArchivo · CSV', () => {
  it('historias-validas.csv: 4 filas, sin errores, origen CSV', () => {
    const r = leerArchivo({ formato: 'CSV', contenido: VALIDO });
    assert.equal(r.origen, 'CSV');
    assert.equal(r.filas.length, 4);
    assert.deepEqual(r.filas.map((f) => f.error), [null, null, null, null]);
    assert.deepEqual(r.filas.map((f) => f.fila), [1, 2, 3, 4]);
    assert.deepEqual(r.filas.map((f) => f.prioridad), ['ALTA', 'MEDIA', 'BAJA', 'CRITICA']);
    assert.equal(r.filas[2]?.titulo, 'Consulta, con coma');
    assert.equal(r.filas[3]?.qeCorreo, 'qe2@quality360.local');
    assert.equal(r.filas[1]?.celula, null);
    assert.deepEqual(r.advertenciasArchivo, []);
  });

  it('punto y coma, BOM y comillas dan lo mismo que la coma', () => {
    const conPuntoYComa = [
      'codigo;titulo;descripcion;prioridad;celula;sprint;qe_correo',
      '"ARC-1";"Alta de cliente";"Registro básico";"ALTA";"CEL-C";"E5 Sprint 2";""',
      'ARC-2;Baja de cliente;;MEDIA;;;',
      '"ARC-3";"Consulta, con coma";"Detalle";"baja";"";"E5 Sprint 1";""',
      'ARC-4;Reporte diario;;CRITICA;CEL-C;;qe2@quality360.local',
    ].join('\r\n');
    const r = leerArchivo({ formato: 'CSV', contenido: `﻿${conPuntoYComa}` });
    const base = leerArchivo({ formato: 'CSV', contenido: VALIDO });
    assert.deepEqual(r.filas, base.filas);
  });

  it('encabezados sin distinguir mayúsculas ni tildes ni orden', () => {
    const r = leerArchivo({ formato: 'CSV', contenido: 'Título,CÓDIGO,Prioridad\nHola,H-1,alta' });
    assert.equal(r.filas[0]?.codigo, 'H-1');
    assert.equal(r.filas[0]?.titulo, 'Hola');
    assert.equal(r.filas[0]?.prioridad, 'ALTA');
  });

  it('qe_correo, qeCorreo y «QE Correo» son la misma columna', () => {
    for (const nombre of ['qe_correo', 'qeCorreo', 'QE Correo', 'QE-CORREO']) {
      const r = leerArchivo({ formato: 'CSV', contenido: `codigo,titulo,${nombre}\nA,b,q@quality360.local` });
      assert.equal(r.filas[0]?.qeCorreo, 'q@quality360.local', nombre);
    }
  });

  it('una columna extra pasa con una sola COLUMNA_IGNORADA', () => {
    const r = leerArchivo({ formato: 'CSV', contenido: 'codigo,titulo,notas,otra\nA-1,t,x,y\nA-2,t,x,y' });
    assert.deepEqual(r.advertenciasArchivo, ['COLUMNA_IGNORADA']);
    assert.deepEqual(r.columnasIgnoradas, ['notas', 'otra']);
    assert.equal(r.filas.length, 2);
    assert.ok(r.filas.every((f) => !f.advertencias.includes('COLUMNA_IGNORADA')));
  });

  it('celdas faltantes en una fila corta se leen como vacías; las sobrantes se descartan', () => {
    const r = leerArchivo({ formato: 'CSV', contenido: 'codigo,titulo,descripcion\nA-1,t\nA-2,t,d,sobra' });
    assert.equal(r.filas[0]?.descripcion, null);
    assert.equal(r.filas[1]?.descripcion, 'd');
  });

  it('un salto de línea dentro de la descripción se conserva', () => {
    const r = leerArchivo({ formato: 'CSV', contenido: 'codigo,titulo,descripcion\nA-1,t,"l1\nl2"' });
    assert.equal(r.filas[0]?.descripcion, 'l1\nl2');
  });

  it('una columna repetida usa la primera', () => {
    const r = leerArchivo({ formato: 'CSV', contenido: 'codigo,titulo,titulo\nA-1,primero,segundo' });
    assert.equal(r.filas[0]?.titulo, 'primero');
  });

  it('valores con = + - @ se conservan tal cual (D122)', () => {
    const r = leerArchivo({ formato: 'CSV', contenido: 'codigo,titulo,descripcion\nF-1,=SUMA(1),+1\nF-2,-2,@x\nF-3,\'=a,b' });
    assert.deepEqual(r.filas.map((f) => f.titulo), ['=SUMA(1)', '-2', "'=a"]);
    assert.deepEqual(r.filas.map((f) => f.descripcion), ['+1', '@x', 'b']);
  });

  it('historias-con-errores.csv: 2 válidas y 7 con el motivo esperado', () => {
    const csv = [
      ENCABEZADO,
      'ARC-10,Válida,,ALTA,,,',
      'ARC-11,Prioridad mala,,URGENTE,,,',
      ',Sin código,,,,,',
      'ARC 12,Con espacio,,,,,',
      'ARC-10,Repetida,,,,,',
      'ARC-13,Célula mala,,,CEL-Z,,',
      'ARC-14,Sprint malo,,,,No existe,',
      'ARC-15,QE malo,,,,,ana1@quality360.local',
      'ARC-16,Válida,,,,,',
    ].join('\n');
    const r = leerArchivo({ formato: 'CSV', contenido: csv });
    assert.deepEqual(r.filas.map((f) => f.error), [
      null, 'PRIORIDAD_INVALIDA', 'CODIGO_INVALIDO', 'CODIGO_INVALIDO', 'CODIGO_DUPLICADO_EN_ARCHIVO',
      null, null, null, null, // célula, sprint y QE los resuelve Organización (aquí solo se validan formato y largo)
    ]);
    assert.equal(r.filas[5]?.celula, 'CEL-Z');
    assert.equal(r.filas[6]?.sprint, 'No existe');
  });

  it('exactamente 500 filas pasa; 501 es DEMASIADAS_FILAS', () => {
    const filas = (n: number): string => `codigo,titulo\n${Array.from({ length: n }, (_, i) => `H-${i},t`).join('\n')}`;
    assert.equal(leerArchivo({ formato: 'CSV', contenido: filas(LIMITES.archivoMaxFilas) }).filas.length, 500);
    assert.equal(codigoDe('CSV', filas(501)), 'DEMASIADAS_FILAS');
  });
});

describe('leerArchivo · errores de estructura (E5-B03-T03)', () => {
  it('vacío, solo espacios y solo BOM: ARCHIVO_VACIO 422', () => {
    for (const c of ['', '   \n\t', '﻿', '﻿ \n']) {
      const e = estructura('CSV', c);
      assert.equal(e.codigo, 'ARCHIVO_VACIO');
      assert.equal(e.estadoHttp, 422);
    }
  });
  it('solo el encabezado: ARCHIVO_VACIO', () => {
    assert.equal(codigoDe('CSV', ENCABEZADO), 'ARCHIVO_VACIO');
    assert.equal(codigoDe('CSV', `${ENCABEZADO}\n\n`), 'ARCHIVO_VACIO');
    assert.equal(codigoDe('JSON', '[]'), 'ARCHIVO_VACIO');
    assert.equal(codigoDe('JSON', '{"historias":[]}'), 'ARCHIVO_VACIO');
  });
  it('más de 1 MB: ARCHIVO_MUY_GRANDE 413, antes de mirar el formato', () => {
    const e = estructura('XLSX', 'a'.repeat(LIMITES.archivoMaxBytes + 1));
    assert.equal(e.codigo, 'ARCHIVO_MUY_GRANDE');
    assert.equal(e.estadoHttp, 413);
  });
  it('el tamaño se mide en bytes, no en caracteres', () => {
    const justo = 'ñ'.repeat(LIMITES.archivoMaxBytes / 2); // 1 MB exacto en UTF-8
    assert.notEqual(codigoDe('CSV', justo), 'ARCHIVO_MUY_GRANDE');
    assert.equal(codigoDe('CSV', `${justo}ñ`), 'ARCHIVO_MUY_GRANDE');
  });
  it('formato distinto de CSV o JSON: FORMATO_NO_SOPORTADO', () => {
    for (const f of ['XLSX', 'csv', 'json', '', undefined, null, 5]) assert.equal(codigoDe(f, 'a,b\n1,2'), 'FORMATO_NO_SOPORTADO', String(f));
  });
  it('CSV con comillas sin cerrar, JSON mal formado y JSON que no es lista: ARCHIVO_ILEGIBLE', () => {
    assert.equal(codigoDe('CSV', 'codigo,titulo\nA,"sin cerrar\nB,c'), 'ARCHIVO_ILEGIBLE');
    assert.equal(codigoDe('JSON', '{'), 'ARCHIVO_ILEGIBLE');
    assert.equal(codigoDe('JSON', '{"a":1}'), 'ARCHIVO_ILEGIBLE');
    assert.equal(codigoDe('JSON', '"texto"'), 'ARCHIVO_ILEGIBLE');
    assert.equal(codigoDe('JSON', '[1,2]'), 'ARCHIVO_ILEGIBLE');
    assert.equal(codigoDe('JSON', '[{"codigo":"A","titulo":"t"}, null]'), 'ARCHIVO_ILEGIBLE');
    assert.equal(codigoDe('JSON', '{"historias":"no"}'), 'ARCHIVO_ILEGIBLE');
    assert.equal(codigoDe('JSON', '[[1]]'), 'ARCHIVO_ILEGIBLE');
  });
  it('COLUMNAS_FALTANTES lista todas las que faltan', () => {
    assert.deepEqual(estructura('CSV', 'descripcion,prioridad\nx,ALTA').columnasFaltantes, ['codigo', 'titulo']);
    assert.deepEqual(estructura('CSV', 'codigo,descripcion\nA,x').columnasFaltantes, ['titulo']);
    assert.deepEqual(estructura('CSV', 'titulo,descripcion\nA,x').columnasFaltantes, ['codigo']);
    assert.deepEqual(estructura('JSON', '[{"descripcion":"x"}]').columnasFaltantes, ['codigo', 'titulo']);
    assert.equal(estructura('CSV', 'codigo,descripcion\nA,x').estadoHttp, 422);
  });
  it('una columna obligatoria ausente solo en el encabezado pesa más que no tener filas', () => {
    assert.equal(codigoDe('CSV', 'codigo,descripcion'), 'COLUMNAS_FALTANTES');
  });
  it('un separador desconocido (tabulación) deja una sola columna: COLUMNAS_FALTANTES', () => {
    assert.equal(codigoDe('CSV', 'codigo\ttitulo\nA\tb'), 'COLUMNAS_FALTANTES');
  });
  it('una cadena que no es el contenido se trata como vacía', () => {
    assert.equal(codigoDe('CSV', undefined as unknown as string), 'ARCHIVO_VACIO');
  });
});

describe('leerArchivo · JSON (E5-B03-T14)', () => {
  const objetos = [
    { codigo: 'ARC-J1', titulo: 'Uno', prioridad: 'ALTA' },
    { codigo: 'ARC-J2', titulo: 'Dos', prioridad: 'media', qeCorreo: 'a@quality360.local' },
    { codigo: 'ARC-J3', titulo: 'Tres', qe_correo: 'b@quality360.local' },
  ];

  it('lista de 3 objetos: origen JSON, qeCorreo y qe_correo se aceptan', () => {
    const r = leerArchivo({ formato: 'JSON', contenido: JSON.stringify(objetos) });
    assert.equal(r.origen, 'JSON');
    assert.deepEqual(r.filas.map((f) => f.error), [null, null, null]);
    assert.deepEqual(r.filas.map((f) => f.qeCorreo), [null, 'a@quality360.local', 'b@quality360.local']);
    assert.deepEqual(r.filas.map((f) => f.prioridad), ['ALTA', 'MEDIA', null]);
    assert.deepEqual(r.filas.map((f) => f.fila), [1, 2, 3]);
  });
  it('objeto {historias: [...]} y BOM', () => {
    const r = leerArchivo({ formato: 'JSON', contenido: `﻿${JSON.stringify({ historias: objetos })}` });
    assert.equal(r.filas.length, 3);
  });
  it('claves extra: una sola COLUMNA_IGNORADA aunque se repitan', () => {
    const r = leerArchivo({ formato: 'JSON', contenido: JSON.stringify([{ codigo: 'A', titulo: 't', notas: 1 }, { codigo: 'B', titulo: 't', notas: 2, extra: 3 }]) });
    assert.deepEqual(r.advertenciasArchivo, ['COLUMNA_IGNORADA']);
    assert.deepEqual(r.columnasIgnoradas, ['notas', 'extra']);
  });
  it('si el objeto trae las dos formas del correo, gana la primera con valor', () => {
    const r = leerArchivo({ formato: 'JSON', contenido: '[{"codigo":"A","titulo":"t","qe_correo":"","qeCorreo":"x@quality360.local"}]' });
    assert.equal(r.filas[0]?.qeCorreo, 'x@quality360.local');
  });
  it('tipos raros en una fila son error de esa fila, no del archivo', () => {
    const r = leerArchivo({ formato: 'JSON', contenido: '[{"codigo":{"x":1},"titulo":"t"},{"codigo":"B","titulo":["a"]},{"codigo":7,"titulo":true}]' });
    assert.deepEqual(r.filas.map((f) => f.error), ['CODIGO_INVALIDO', 'TITULO_VACIO', null]);
  });
  it('la clave __proto__ no contamina nada', () => {
    const r = leerArchivo({ formato: 'JSON', contenido: '[{"codigo":"A","titulo":"t","__proto__":{"polluted":true}}]' });
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(r.filas.length, 1);
  });
  it('501 objetos: DEMASIADAS_FILAS', () => {
    const lista = Array.from({ length: 501 }, (_, i) => ({ codigo: `H-${i}`, titulo: 't' }));
    assert.equal(codigoDe('JSON', JSON.stringify(lista)), 'DEMASIADAS_FILAS');
  });
});

describe('huella', () => {
  it('es el SHA-256 del contenido recibido (con BOM incluido) y no depende del formato', () => {
    assert.equal(huellaDe('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const a = leerArchivo({ formato: 'CSV', contenido: VALIDO });
    assert.equal(a.huella, huellaDe(VALIDO));
    assert.equal(a.bytes, Buffer.byteLength(VALIDO, 'utf8'));
    assert.notEqual(leerArchivo({ formato: 'CSV', contenido: `﻿${VALIDO}` }).huella, a.huella);
  });
});

describe('columnaCanonica', () => {
  it('reconoce las siete columnas y descarta el resto', () => {
    assert.equal(columnaCanonica('Código'), 'codigo');
    assert.equal(columnaCanonica(' DESCRIPCIÓN '), 'descripcion');
    assert.equal(columnaCanonica('Célula'), 'celula');
    assert.equal(columnaCanonica('notas'), null);
    assert.equal(columnaCanonica(''), null);
    assert.equal(columnaCanonica('constructor'), null);
  });
});
