# 🎮 Rutina RPG

Un tracker de rutina que funciona como un videojuego: cada disciplina tiene **su propia
barra de XP, su propio nivel y su propia racha**. Sin cuentas, sin servidores, sin
dependencias — se instala en el teléfono y funciona sin conexión.

![Nivel de jugador, misiones diarias y rachas](icons/icon.svg)

## Qué trackea

| Actividad | Cuándo toca | Meta | Cómo suma XP |
|---|---|---|---|
| 📊 Análisis de datos | todos los días | 45 min | proporcional a los minutos |
| 👟 Pasos | todos los días | 10.000 | proporcional a los pasos |
| 🇫🇷 Duolingo (francés) | todos los días | 30 XP | proporcional a la XP de Duolingo |
| 🎹 Piano | lun · vie · sáb · dom | 30 min | proporcional a los minutos |
| 🏋️ Gimnasio | lun · mié · vie | la rutina del día | series completadas sobre las planificadas |
| 🥊 Muay Thai | mar · jue | 60 min | racha semanal (2 clases) |
| ✍️ Escritura en Substack | 1 vez por semana | 1 publicación | racha semanal |

**Cada actividad sabe qué días le tocan.** Un martes sin piano o un sábado sin
gimnasio no rompen nada: son días libres, no faltas. Y si hacés de más un día libre,
suma igual — hacer extra nunca penaliza. Todo esto se edita desde **Ajustes**,
incluidos los días, y podés agregar disciplinas nuevas.

### La rutina del gimnasio

Las tres sesiones vienen cargadas como plantillas, con sus ejercicios y su
`3×10-15`:

| Día | Rutina | Ejercicios | Series |
|---|---|---|---|
| Lunes | Espalda / Bíceps + Abs | 10 | 30 |
| Miércoles | Hombros / Tríceps / Antebrazos | 14 | 42 |
| Viernes | Pecho / Piernas | 9 | 27 |
| Sábado (opcional) | Día 4 complementario | lo armás vos | — |

Al abrir el registro, la app **propone la rutina que toca ese día** y precarga los
pesos con lo último que levantaste en cada ejercicio: corregís lo que cambió y anotás
las repeticiones. Cada ejercicio terminado **se pliega solo**, así durante el
entrenamiento ves lo que falta y no lo que ya hiciste. El Día 4 arranca vacío y
recuerda lo que cargaste la vez anterior.

La XP del gimnasio mide **la rutina completada**, no el tonelaje: terminar el día de
pecho (27 series) vale lo mismo que el de hombros (42). El tonelaje se sigue
acumulando como estadística y alimenta los récords personales.

## Cómo funciona la XP

La regla de oro: **cumplir la meta vale 100 XP, sea la actividad que sea.** Así 45
minutos de datos y 10.000 pasos pesan lo mismo, y el progreso es relativo a cada
disciplina en lugar de a la unidad que usa.

- **Progreso parcial** → proporcional (media meta = 50 XP).
- **Pasarse** → suma, con rendimiento decreciente y tope en 160 XP. Un día heroico
  no reemplaza la constancia.
- **Racha** → +2% por día consecutivo, hasta +50%.
- **Escudos de racha** 🛡 → cada 7 días de racha ganás un escudo (máximo 2). Si un día
  no llegás, se gasta un escudo y la racha sobrevive. Un día malo no borra un mes bueno.
- **Día perfecto** ⭐ → completar todo lo que tocaba *ese* día suma 50 XP. Un martes
  son cuatro misiones (datos, pasos, Duolingo y muay thai); un lunes son cinco.
- **Récord personal** 🥇 → superar tu 1RM estimado en un ejercicio suma 25 XP.
- **Logros** 🏆 → 20 medallas con XP propia, desde "Primer paso" hasta "Centurión".

Cada actividad sube de nivel en su propia curva (cada nivel cuesta más que el anterior)
y atraviesa rangos: Novato → Aprendiz → Adepto → Experto → Maestro → Leyenda. La suma
de todo alimenta tu **nivel de jugador**.

Nada de esto se guarda "congelado": la XP, los niveles y las rachas se recalculan
siempre desde tu historial. Si cambiás una meta, todo tu progreso se reajusta solo.

## Cómo usarla

Es un sitio estático: no necesita build ni instalación de paquetes.

```bash
npm start           # genera los íconos y abre http://localhost:8080
# o, sin npm:
node tools/make-icons.mjs && python3 -m http.server 8080
```

> Hay que servirla por HTTP: abrir `index.html` con doble clic no funciona porque el
> navegador bloquea los módulos de JavaScript en `file://`.

### Instalarla en el teléfono

1. Publicala en **GitHub Pages**: en el repositorio, *Settings → Pages → Source:
   GitHub Actions*. El workflow incluido (`.github/workflows/pages.yml`) la despliega
   en cada push a `main`.
2. Abrí la URL en el teléfono → menú del navegador → **"Agregar a pantalla de inicio"**.
3. Queda como una app: pantalla completa, ícono propio y funciona sin señal.

### Tests

```bash
npm test            # 32 tests de la matemática de XP y del motor de rachas
```

## Tus datos

Todo vive **solo en tu dispositivo** (`localStorage` del navegador). No hay servidor ni
cuenta: nadie más ve tu progreso. La contracara es que si borrás los datos del navegador
o cambiás de teléfono, se pierde.

Por eso en *Ajustes* hay **Exportar** e **Importar**: bajás un `.json` con todo tu
historial y lo restaurás donde quieras. Conviene exportar de vez en cuando.

## Estructura

```
index.html              Cáscara de la app
css/styles.css          Tema oscuro, mobile-first
js/
  config.js             Actividades, agenda semanal, rutinas del gym y logros
  xp.js                 Matemática pura: XP, niveles, 1RM  (con tests)
  derive.js             Deriva niveles, rachas y récords del historial (con tests)
  state.js              Persistencia y detección de eventos de juego
  utils.js              Fechas locales, formato y helpers de DOM
  ui/                   Componentes, avisos, panel modal y formularios de registro
  views/                Hoy · Progreso · Logros · Ajustes
  app.js                Router y celebraciones
tools/make-icons.mjs    Genera los PNG del manifest (no se versionan)
sw.js                   Service worker (modo offline)
tests/                  node --test, sin dependencias
```

## Ideas para más adelante

- Importar pasos automáticamente desde Google Fit / Apple Salud.
- Gráfico de progresión de 1RM por ejercicio.
- Temporizador de descanso entre series.
- Sincronización entre dispositivos (hoy el `.json` exportado cumple esa función).
