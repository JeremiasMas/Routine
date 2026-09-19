# 🎮 Rutina RPG

Un tracker de rutina que funciona como un videojuego: cada disciplina tiene **su propia
barra de XP, su propio nivel y su propia racha**. Sin cuentas, sin servidores, sin
dependencias — se instala en el teléfono y funciona sin conexión.

![Nivel de jugador, misiones diarias y rachas](icons/icon.svg)

## Qué trackea

| Actividad | Meta por defecto | Cómo suma XP |
|---|---|---|
| 📊 Análisis de datos | 45 min por día | proporcional a los minutos |
| 🎹 Piano | 30 min por día | proporcional a los minutos |
| 🏋️ Gimnasio | 4.000 kg de tonelaje | peso × reps de cada serie, + bonus por récord |
| 🥊 Muay Thai | 60 min, 3 veces por semana | racha semanal |
| 👟 Pasos | 10.000 por día | proporcional a los pasos |
| 🇫🇷 Duolingo (francés) | 30 XP por día | proporcional a la XP de Duolingo |
| ✍️ Escritura en Substack | 1 publicación por semana | racha semanal |

Todas las metas se editan desde **Ajustes**, y podés agregar disciplinas nuevas.

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
- **Día perfecto** ⭐ → completar todas las misiones diarias suma 50 XP de bonus.
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
npm test            # 23 tests de la matemática de XP y del motor de rachas
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
  config.js             Actividades, rangos y definición de los logros
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
- Plantillas de rutina del gimnasio para no recargar los mismos ejercicios cada vez.
- Gráfico de progresión de 1RM por ejercicio.
- Sincronización entre dispositivos (hoy el `.json` exportado cumple esa función).
