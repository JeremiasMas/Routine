// Registro con niveles, a stderr, para que stdout quede libre para datos.

const NIVELES = { silencio: 0, error: 1, aviso: 2, info: 3, detalle: 4 };

export function crearLog(nivel = 'info', escribir = (linea) => process.stderr.write(`${linea}\n`)) {
  const umbral = NIVELES[nivel] ?? NIVELES.info;
  const emitir = (n, icono) => (...partes) => {
    if (NIVELES[n] > umbral) return;
    escribir(`${icono} ${partes.map(aTextoPlano).join(' ')}`);
  };
  return {
    nivel,
    error: emitir('error', '✖'),
    aviso: emitir('aviso', '▲'),
    info: emitir('info', '·'),
    detalle: emitir('detalle', '  '),
  };
}

function aTextoPlano(parte) {
  if (typeof parte === 'string') return parte;
  if (parte instanceof Error) return parte.message;
  try { return JSON.stringify(parte); } catch { return String(parte); }
}
