// node:sqlite avisa en cada arranque que es experimental. Ya lo sabemos, y el
// aviso ensucia la salida de un comando que corre por cron.
//
// El aviso se imprime desde el oyente por defecto de 'warning', así que lo
// reemplazamos por uno que deja pasar todo lo demás.

const oyentes = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', (aviso) => {
  if (aviso?.name === 'ExperimentalWarning' && /SQLite/i.test(aviso.message)) return;
  for (const oyente of oyentes) oyente(aviso);
});
