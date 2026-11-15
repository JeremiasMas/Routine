import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GRUPOS, IDS, estadoDeSecciones } from '../js/ajustes.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';

// Ajustes eran nueve secciones abiertas, casi cuatro mil píxeles. Ahora es un
// índice: una fila por sección, que dice en qué está sin abrirla. Lo que se
// prueba acá es justamente eso que dice cada fila, que es lo único que se ve
// la mayoría de las veces.

const gym = DEFAULT_ACTIVITIES.find((a) => a.id === 'gym');
const HOY = '2026-11-15';

const datos = (settings = {}, extra = {}) => ({
  activities: [gym, DEFAULT_ACTIVITIES.find((a) => a.id === 'piano')],
  settings: { height: 160, weight: 61.2, waist: 78, neck: 35, sound: true, ...settings },
  entries: {},
  pausas: [],
  ...extra,
});
const leer = (data, dispositivo = {}) => estadoDeSecciones(data, { hoy: HOY, ...dispositivo });

test('cada sección del índice tiene su estado, y ninguna sobra', () => {
  const estados = leer(datos());
  assert.deepEqual(Object.keys(estados).sort(), [...IDS].sort());
  for (const id of IDS) {
    assert.equal(typeof estados[id].estado, 'string', id);
    assert.ok(estados[id].estado.length > 0, `${id} quedó sin nada que decir`);
    assert.equal(typeof estados[id].alerta, 'boolean', id);
  }
});

test('los ids no se repiten y cada sección tiene ícono y título', () => {
  assert.equal(new Set(IDS).size, IDS.length);
  for (const g of GRUPOS) {
    assert.ok(g.titulo);
    for (const s of g.secciones) assert.ok(s.id && s.icono && s.titulo, JSON.stringify(s));
  }
  // El aviso sólo existe adentro de la app de Android.
  const aviso = GRUPOS.flatMap((g) => g.secciones).find((s) => s.id === 'aviso');
  assert.equal(aviso.soloSi, 'puedeAvisar');
});

test('sin datos no rompe: cada fila dice algo igual', () => {
  for (const vacio of [undefined, null, {}]) {
    const estados = estadoDeSecciones(vacio);
    assert.equal(estados.metas.estado, '0 actividades');
    assert.equal(estados.cuerpo.estado, 'Sin medidas todavía');
    assert.equal(estados.datos.estado, 'Sólo en este dispositivo');
  }
});

test('metas cuenta las actividades, con su singular', () => {
  assert.equal(leer(datos()).metas.estado, '2 actividades');
  assert.equal(leer(datos({}, { activities: [gym] })).metas.estado, '1 actividad');
});

test('medidas dice estatura, peso y grasa, y sólo lo que hay', () => {
  assert.match(leer(datos()).cuerpo.estado, /^160 cm · 61,2 kg · \d+(,\d)?% de grasa$/);
  // Sin cintura no hay grasa que calcular: no se inventa.
  assert.equal(leer(datos({ waist: 0 })).cuerpo.estado, '160 cm · 61,2 kg');
  assert.equal(leer(datos({ weight: 0, waist: 0 })).cuerpo.estado, '160 cm');
});

test('calorías dice la fase y si hay comidas fijas', () => {
  assert.equal(leer(datos({ fase: 'recomponer', fijoKcal: 1092 })).calorias.estado, 'Recomponer · 1.092 kcal fijas');
  assert.equal(leer(datos({ fase: 'bajar' })).calorias.estado, 'Bajar grasa · sin comidas fijas');
  // Una fase que no existe cae en la de por defecto en vez de romper.
  assert.equal(leer(datos({ fase: 'volar', fijoKcal: 0 })).calorias.estado, 'Mantener · sin comidas fijas');
});

test('gimnasio dice en cuántos ejercicios de barra se carga por lado', () => {
  const marcar = (nombres) => Object.fromEntries(nombres.map((n) => [n, { kg: 20, antes: 20 }]));
  assert.equal(leer(datos()).gimnasio.estado, 'Se anota el total: ninguna marcada');
  assert.equal(leer(datos({ barra: marcar(['pecho plano', 'sentadilla con barra']) })).gimnasio.estado,
    'Peso por lado en 2 de 8');
  const todas = ['remo bajo cerrado', 'remo con barra al pecho', 'encogimientos de trapecio', 'pecho plano',
    'pecho inclinado', 'sentadilla con barra', 'peso muerto rumano', 'elevaciones de talón'];
  assert.equal(leer(datos({ barra: marcar(todas) })).gimnasio.estado, 'Peso por lado en los 8');
  // Una máquina con peso anotado es candidata a barra, pero no cuenta en el
  // total: nadie espera marcarle una.
  const conMaquina = datos({ barra: marcar(['pecho plano']) }, {
    entries: { '2026-11-06': { gym: { exercises: [{ name: 'Pec deck', sets: [{ weight: 45, reps: 10 }] }] } } },
  });
  assert.equal(leer(conMaquina).gimnasio.estado, 'Peso por lado en 1 de 8');
});

test('días libres mira de hoy en adelante', () => {
  assert.equal(leer(datos()).libres.estado, 'Ninguno por venir');
  // Uno que ya pasó no cuenta: está en la lista de adentro, no en el titular.
  const pasado = { desde: '2026-10-01', hasta: '2026-10-05', tipo: 'vacaciones' };
  assert.equal(leer(datos({}, { pausas: [pasado] })).libres.estado, 'Ninguno por venir');
  const futuro = { desde: '2026-12-20', hasta: '2026-12-31', tipo: 'vacaciones' };
  assert.equal(leer(datos({}, { pausas: [pasado, futuro] })).libres.estado, '1 tramo por venir');
  const otro = { desde: '2027-01-10', hasta: '2027-01-12', tipo: 'vacaciones' };
  assert.equal(leer(datos({}, { pausas: [futuro, otro] })).libres.estado, '2 tramos por venir');
  // El que termina hoy todavía cuenta, y además hoy es libre.
  const hoy = { desde: '2026-11-14', hasta: HOY, tipo: 'vacaciones' };
  assert.equal(leer(datos({}, { pausas: [hoy] })).libres.estado, 'Hoy es día libre');
  // Uno que empezó antes y sigue corriendo también está por venir.
  const enCurso = { desde: '2026-11-10', hasta: '2026-11-20', tipo: 'excusa', actividades: ['gym'] };
  assert.equal(leer(datos({}, { pausas: [enCurso] })).libres.estado, '1 tramo por venir');
  // Un permiso que protege una sola disciplina no hace libre el día entero.
  const parcial = { desde: HOY, hasta: HOY, tipo: 'excusa', actividades: ['gym'] };
  assert.equal(leer(datos({}, { pausas: [parcial] })).libres.estado, '1 tramo por venir');
});

test('pasos dice de dónde vienen según dónde corre la app', () => {
  assert.equal(leer(datos()).pasos.estado, 'Se importan de Samsung Health');
  assert.equal(leer(datos(), { enApp: true, origenDePasos: 'Samsung Health' }).pasos.estado, 'Llegan solos · Samsung Health');
  assert.equal(leer(datos(), { enApp: true }).pasos.estado, 'Llegan solos · Health Connect');
});

test('el aviso dice a qué hora, con los ceros puestos', () => {
  assert.equal(leer(datos()).aviso.estado, 'Apagado');
  assert.equal(leer(datos(), { aviso: { activo: false, hora: 19, minuto: 0 } }).aviso.estado, 'Apagado');
  assert.equal(leer(datos(), { aviso: { activo: true, hora: 7, minuto: 5 } }).aviso.estado, 'Todos los días a las 07:05');
  assert.equal(leer(datos(), { aviso: { activo: true } }).aviso.estado, 'Todos los días a las 19:00');
});

test('aspecto dice el nombre del tema, no su id', () => {
  assert.equal(leer(datos({ tema: 'sangre' })).aspecto.estado, 'Sangre fría');
  assert.equal(leer(datos()).aspecto.estado, 'Consola');
  assert.equal(leer(datos({ tema: 'no existe' })).aspecto.estado, 'Consola');
});

test('sonidos y festejos: los festejos vienen prendidos si nadie los tocó', () => {
  assert.equal(leer(datos({ sound: true })).preferencias.estado, 'Sonidos sí · festejos sí');
  assert.equal(leer(datos({ sound: false, celebrate: false })).preferencias.estado, 'Sonidos no · festejos no');
  assert.equal(leer(datos({ sound: false, celebrate: true })).preferencias.estado, 'Sonidos no · festejos sí');
});

test('la copia vencida es la única fila que viene en rojo', () => {
  const nunca = leer(datos(), { diasSinCopia: Infinity, copiaVencida: true });
  assert.deepEqual(nunca.datos, { estado: 'Nunca exportaste tu progreso', alerta: true });
  const vieja = leer(datos(), { diasSinCopia: 20, copiaVencida: true });
  assert.deepEqual(vieja.datos, { estado: 'Hace 20 días que no exportás', alerta: true });
  assert.equal(leer(datos(), { diasSinCopia: 1, copiaVencida: true }).datos.estado, 'Hace 1 día que no exportás');
  for (const [id, e] of Object.entries(nunca)) {
    if (id !== 'datos') assert.equal(e.alerta, false, `${id} salió en rojo`);
  }
});

test('una copia al día se dice sin alarma', () => {
  assert.deepEqual(leer(datos(), { diasSinCopia: 0 }).datos, { estado: 'Copia hecha hoy', alerta: false });
  assert.deepEqual(leer(datos(), { diasSinCopia: 1 }).datos, { estado: 'Última copia hace 1 día', alerta: false });
  assert.equal(leer(datos(), { diasSinCopia: 9 }).datos.estado, 'Última copia hace 9 días');
  // Sin fecha de copia y sin vencer (recién instalada): nada que reclamar.
  assert.deepEqual(leer(datos(), { diasSinCopia: Infinity }).datos, { estado: 'Sólo en este dispositivo', alerta: false });
});

// ── La pantalla ───────────────────────────────────────────────────────────

const fuente = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
const funcion = (texto, firma) => {
  const desde = texto.indexOf(firma);
  assert.ok(desde >= 0, `no existe ${firma}`);
  const resto = texto.slice(desde);
  const fin = resto.slice(10).search(/\n(export )?(async )?function /);
  return fin < 0 ? resto : resto.slice(0, fin + 10);
};

test('la pantalla arma una sección por cada id, y sólo las de este dispositivo', () => {
  const ajustes = fuente('js/views/settings.js');
  const render = funcion(ajustes, 'export function render(');
  for (const id of IDS) assert.match(render, new RegExp(`\\n    ${id}: \\(\\) => `), `falta el contenido de ${id}`);
  assert.match(render, /grupo\.secciones\.filter\(\(sec\) => !sec\.soloSi \|\| disponible\[sec\.soloSi\]\)/);
  assert.match(render, /seccion\(sec, estados\[sec\.id\], contenido\[sec\.id\]\(\), \(\) => leerEstados\(\)\[sec\.id\]\)/);
  // Nada de secciones sueltas por fuera del índice.
  assert.doesNotMatch(render, /root\.append\(tarjetaDe/);
});

test('la sección abierta sobrevive a que la pantalla se redibuje, y se abre de a una', () => {
  const ajustes = fuente('js/views/settings.js');
  // Fuera del render: elegir un tema redibuja todo y no puede cerrarla.
  assert.match(ajustes, /\nlet abierta = null;\n/);
  const sec = funcion(ajustes, 'function seccion(');
  assert.match(sec, /open: abierta === id,/);
  assert.match(sec, /abierta = id;/);
  assert.match(sec, /nodo\.closest\('\.ajustes'\)\?\.querySelectorAll\('details\.ajuste\[open\]'\)/);
  assert.match(sec, /if \(otra !== nodo\) otra\.open = false;/);
  // Al cerrar, la fila vuelve a leer su estado: no todo redibuja.
  assert.match(sec, /const ahora = releer\?\.\(\);/);
  // Es un <details> de verdad: teclado y lector de pantalla gratis.
  assert.match(sec, /el\('details', \{/);
  assert.match(sec, /el\('summary', \{ class: 'ajuste__cabeza' \}/);
});

test('desde el aviso de copia vencida se llega con "Tus datos" abierta', () => {
  const ajustes = fuente('js/views/settings.js');
  assert.match(funcion(ajustes, 'export function abrirSeccion('), /abierta = IDS\.includes\(id\) \? id : null;/);
  const hoy = fuente('js/views/today.js');
  assert.match(hoy, /href: '#\/ajustes',\s*(\/\/[^\n]*\n\s*)*onClick: \(\) => abrirSeccion\('datos'\),/);
});

test('dentro de una sección las tarjetas no dibujan un segundo marco', () => {
  const css = fuente('css/styles.css');
  assert.match(css, /\.ajuste__cuerpo > \.card \{ border: 0; border-radius: 0; background: none; padding: 0; \}/);
  // Abierta, el estado no se repite arriba de lo que ya dice adentro.
  assert.match(css, /\.ajuste\[open\] \.ajuste__estado \{ display: none; \}/);
});
