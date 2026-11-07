import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decidirOrigen, origenPreferido, nombreDeApp, CONTADOR_DEL_TELEFONO } from '../js/native.js';

const ajustes = readFileSync('js/views/settings.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const nativo = readFileSync('js/native.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const TEL = { paquete: 'com.android.healthconnect.phone.j59a2b', pasos: 10927 };
const SAMSUNG = { paquete: 'com.sec.android.app.shealth', pasos: 9525 };
const FITBIT = { paquete: 'com.fitbit.FitbitMobile', pasos: 400 };

/* ---------------------------------------------------------------------------
   Elegir sin preguntar
   --------------------------------------------------------------------------- */

test('con dos apps gana el contador del teléfono, solo', () => {
  // Health Connect suma lo que escribe cada una: con las dos activas el total
  // sale inflado. Antes eso abría un cartel con botones cada vez que entrabas.
  assert.equal(decidirOrigen([TEL, SAMSUNG], 'auto', ''), TEL.paquete);
  assert.equal(decidirOrigen([SAMSUNG, TEL], 'auto', ''), TEL.paquete,
    'el orden en que los reporta Android no puede cambiar la elección');
});

test('una vez elegido no se vuelve a elegir', () => {
  // Pedirlo otra vez dispararía una lectura nueva, que vuelve acá: un bucle.
  assert.equal(decidirOrigen([TEL, SAMSUNG], 'auto', TEL.paquete), null);
});

test('con una sola app no hay nada que elegir', () => {
  assert.equal(decidirOrigen([SAMSUNG], 'auto', ''), null);
  assert.equal(decidirOrigen([], 'auto', ''), null);
  assert.equal(decidirOrigen(null, 'auto', ''), null);
});

test('una app que hoy no escribió pasos no cuenta como conflicto', () => {
  assert.equal(decidirOrigen([TEL, { ...SAMSUNG, pasos: 0 }], 'auto', ''), null);
});

test('sin contador del teléfono no se adivina', () => {
  // Entre dos desconocidas, elegir una sería peor que sumarlas: al menos la
  // suma es un número que se entiende.
  assert.equal(decidirOrigen([SAMSUNG, FITBIT], 'auto', ''), null);
});

test('una preferencia tuya gana siempre', () => {
  assert.equal(decidirOrigen([TEL, SAMSUNG], SAMSUNG.paquete, TEL.paquete), SAMSUNG.paquete);
  assert.equal(decidirOrigen([TEL, SAMSUNG], 'todas', TEL.paquete), '', 'sumar todas es cadena vacía');
  assert.equal(decidirOrigen([TEL, SAMSUNG], 'todas', ''), null, 'ya está sumando: no hay que tocar nada');
  assert.equal(decidirOrigen([TEL, SAMSUNG], SAMSUNG.paquete, SAMSUNG.paquete), null);
});

test('el contador del teléfono se reconoce por el prefijo, no por el hash', () => {
  // El paquete trae un hash pegado que cambia entre teléfonos.
  assert.equal(origenPreferido([TEL, SAMSUNG]).paquete, TEL.paquete);
  assert.equal(origenPreferido([{ paquete: `${CONTADOR_DEL_TELEFONO}.otroHash`, pasos: 5 }]).paquete,
    `${CONTADOR_DEL_TELEFONO}.otroHash`);
  assert.equal(origenPreferido([SAMSUNG]), null);
  assert.equal(origenPreferido([{ pasos: 5 }]), null, 'un origen sin paquete no puede romper');
});

test('el nombre que se muestra sale del prefijo', () => {
  assert.equal(nombreDeApp(TEL.paquete), 'Contador del teléfono');
  assert.equal(nombreDeApp(SAMSUNG.paquete), 'Samsung Health');
});

/* ---------------------------------------------------------------------------
   Lo que la pantalla ya no hace
   --------------------------------------------------------------------------- */

test('el puente elige solo al leer los orígenes', () => {
  const bloque = nativo.slice(nativo.indexOf('nativo.origenes = leerOrigenes'));
  assert.match(bloque.slice(0, 700), /decidirOrigen\(/,
    'leer los orígenes dejó de resolver el conflicto: vuelve el cartel');
  assert.match(bloque.slice(0, 700), /if \(destino !== null\) usarSoloOrigen\(destino\)/);
});

test('Ajustes ya no te hace elegir cada vez', () => {
  // La lista y los botones siguen existiendo, pero plegados: el cartel con
  // tres botones aparecía en cada visita aunque ya estuviera resuelto.
  assert.ok(!ajustes.includes("'⚠️ Hay '"), 'volvió el cartel de conflicto');
  assert.ok(!ajustes.includes("'Elegí de cuál querés contar:'"), 'volvió la pregunta');
  assert.match(ajustes, /Contando: \$\{nombreDelOrigen\(\)\}/, 'no dice de cuál está contando');
  assert.match(ajustes, /updateSettings\(\{ pasosOrigen: o\.paquete \}\)/,
    'cambiarlo a mano no se guarda, así que la decisión automática lo pisaría');
});

test('no se dice una fuente y se muestra el número de otra', () => {
  // Decía "según Samsung Health" fijo, con el número del contador del teléfono.
  assert.match(ajustes, /contados de \$\{nombreDelOrigen\(\)\}/);
  assert.ok(!/según Samsung Health/.test(ajustes), 'volvió la fuente escrita a mano');
});
