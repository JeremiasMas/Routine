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
| 💧 Agua | todos los días | 2,15 L (se calcula sola) | *hábito: no da XP* |
| 🇫🇷 Francés | todos los días | 10 min | Duolingo + Coffee Break French |
| 🎹 Piano | lun · vie · sáb · dom | 30 min | proporcional a los minutos |
| 🏋️ Gimnasio | lun · mié · vie | la rutina del día | XP por series; **el nivel lo da la fuerza** |
| 🥊 Muay Thai | mar · jue | 1h 30 por clase | racha semanal (2 clases desde sep. 2026, 1 antes) |
| ✍️ Escritura en Substack | 1 vez por semana | 1 publicación | racha semanal |
| 📏 Composición corporal | 1 vez por semana | 13% de grasa | medirte, no el resultado |

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

Al abrir el registro, la app **propone la rutina que toca ese día** y precarga los
pesos con lo último que levantaste en cada ejercicio: corregís lo que cambió y anotás
las repeticiones. Cada ejercicio terminado **se pliega solo**, así durante el
entrenamiento ves lo que falta y no lo que ya hiciste.

La XP del gimnasio mide **la rutina completada**, no el tonelaje: terminar el día de
pecho (27 series) vale lo mismo que el de hombros (42). El tonelaje se sigue
acumulando como estadística y alimenta los récords personales.

### Francés: Duolingo + podcast 🇫🇷

La moneda son **minutos de francés**, sumando dos fuentes:

| Fuente | Vale |
|---|---|
| 🦉 1 lección de Duolingo | 2 min |
| 🎧 1 episodio de Coffee Break French | 22 min |

Son minutos reales, sin ponderar. La tentación era darle un plus al podcast por
entrenar comprensión auditiva, o a Duolingo por su densidad de repetición, pero
**por minuto se compensan**: Duolingo es más intenso y el podcast más amplio.
El tiempo es el denominador honesto, y evita inventar multiplicadores que no se
pueden defender.

**Un episodio equivale a 11 lecciones.** Con la meta en 10 minutos, cinco
lecciones la cumplen justo y medio episodio también. Si querés cambiar la
equivalencia, está toda en `sources` dentro de `js/config.js`: tocás el número y
toda tu XP se recalcula sola.

### Agua: un hábito, no una disciplina 💧

Tomar agua se registra, cuenta racha y hace falta para el día perfecto, pero
**no tiene XP ni rangos propios**: no es algo que se entrene ni en lo que se
progrese. En el código es `leveled: false`, y cualquier actividad puede serlo.

### Fuerza relativa 💪

**El nivel del gimnasio lo da la fuerza que lográs, no la cantidad de veces que
vas.** Ir treinta veces a mover poco no sube de rango; levantar más, sí. Las
sesiones siguen dando XP (y alimentan tu nivel de jugador), pero el rango de la
actividad sale del promedio de fuerza.

Con tu peso corporal, la carga y las repeticiones estima el **1RM** (fórmula de
Epley) y lo expresa como **múltiplos de tu propio peso**, que es la medida que
permite comparar: 100 kg de sentadilla no significan lo mismo con 61 kg encima
que con 95.

**Por qué no es un promedio de kilos ni de ratios.** Promediar kilos deja que la
sentadilla y el peso muerto tapen a todo lo demás. Promediar ratios tampoco
sirve: 1,5× el peso corporal es *intermedio* en sentadilla y casi *élite* en
press militar. Lo que se promedia es **la posición de cada movimiento en su
propia escala**, así todos pesan igual. El resultado cae en una de seis bandas
—Novato de sala, Fierrero, Atleta, Fuerte, Bestia y Titán— y la app te dice
**qué movimiento está frenando el promedio** y cuántos kilos le faltan.

Con pocos movimientos cargados el promedio es poco representativo, así que la
app lo avisa hasta que tengas al menos tres.

Cada movimiento básico se ubica en una escala de cinco niveles —Principiante,
Novato, Intermedio, Avanzado y Élite— y la app te dice **cuántos kilos te faltan
para el siguiente**. Los ejercicios con estándar son sentadilla, press de banca,
banca inclinada, press militar, remo con barra, peso muerto rumano y dominadas;
los aislados (vuelos, face pulls, tríceps) no reciben nivel, porque no existen
referencias serias de fuerza relativa para ellos.

Dos detalles que hacen que el número sea honesto:

- En **dominadas la carga es tu peso corporal + el lastre**. Antes un set sin
  lastre calculaba 1RM cero y nunca registraba récord.
- En los ejercicios de peso corporal el récord se mide en **veces tu peso**, no
  en kilos absolutos: así subir de peso no regala un récord que no entrenaste.

Los niveles son referencias generales (del tipo de las tablas de ExRx o Strength
Level). Varían con el peso corporal y con la técnica, así que sirven para
ubicarte y ver progresión, no para discutir decimales.

### Composición corporal 📏

Con **cintura, cuello, estatura y peso** calcula el porcentaje de grasa por el
método de circunferencias de la **Marina de EE.UU.**, y de ahí saca masa magra,
kilos de grasa e IMC. Cada medición se compara con la anterior y la pantalla de
la actividad grafica la tendencia de grasa y de peso.

**El rango sale del porcentaje medido, no de la XP**, y cada nombre describe
dónde estás:

| Grasa corporal | Rango |
|---|---|
| 25% o más | Punto de partida |
| 20 – 25% | En progreso |
| 17 – 20% | Saludable |
| 15 – 17% | Atlético |
| 13 – 15% | Definido |
| menos de 13% | **Marcado** — la meta |

La escalera **termina en la meta del 13% a propósito**: por debajo de ahí ya no
es salud sino preparación de competencia, y una app de rutina no debería
empujar hacia allá con rangos nuevos.

Dos aclaraciones que importan:

- El método tiene un **margen de error de ±3 puntos**. Sirve para ver hacia dónde
  vas, no para creerle el decimal a una medición suelta. Medite siempre igual
  (a la mañana, en ayunas) o la comparación no vale.
- La XP se gana **por medirte, no por el resultado**. Bajar de grasa no da puntos
  y subir no los quita: lo que la app premia es la constancia del seguimiento.

La fórmula se elige en *Ajustes*: la de 3 medidas (cintura, cuello y estatura) es
la que se usa para hombres; la de 4, que suma la cadera, para mujeres.

### Agua 💧

La meta sale de tu peso a razón de **35 ml por kilo** — con 61,5 kg son 2,15 L —
y **se recalcula sola** cada vez que registrás una medición nueva. Se carga con
botones de vaso (250 ml), botella (500 ml) o litro.

### Pasos desde Samsung Health 👟

**Lo que no se puede:** sincronizar en vivo. Samsung Health no expone una API web;
su SDK es solo para apps Android dentro de su programa de socios, y Health Connect
—por donde Samsung Health comparte datos en Android— tampoco es accesible desde un
navegador. Ninguna app web puede leer tus pasos directamente, y prometer lo
contrario sería mentira.

**Lo que sí:** importar la **exportación oficial** de Samsung Health, que podés
repetir cuando quieras:

1. Samsung Health → ⚙ Ajustes → **Descargar datos personales**.
2. Descomprimí el ZIP que te llega.
3. En *Ajustes → Pasos*, elegí el archivo `com.samsung.shealth.step_daily_trend….csv`.

Antes de tocar nada te muestra **una vista previa**: cuántos días entran, cuáles son
nuevos y cuáles pisan algo que habías cargado a mano. El export trae varias filas por
día (una por reloj, una por teléfono y una agregada), así que toma **el máximo de cada
día** en lugar de sumarlas — sumar contaría los pasos dos o tres veces. También acepta
un CSV común con columnas de fecha y pasos.

### Historial previo a la app 📜

Lo que ya venías haciendo antes de instalarla no arranca en cero. En
`js/seed.js` el historial anterior se declara por tramos —"tantas veces por
semana, estos días, desde tal fecha hasta tal otra"— y se expande a registros
reales en una instalación nueva:

```js
// Muay Thai: una clase por semana desde agosto de 2025…
{ activityId: 'muaythai', from: '2025-08-05', to: '2026-09-06', weekdays: [2], value: 90 },
// …y dos por semana desde principios de septiembre de 2026.
{ activityId: 'muaythai', from: '2026-09-07', to: '2026-09-18', weekdays: [2, 4], value: 90 },
```

Son 61 clases y 91 horas y media que llegan como nivel 11, racha de 59 semanas
y el logro *Nak Muay* ya desbloqueado. Si alguna fecha no coincide, editá el
tramo: los registros se regeneran solos.

Y lo que llevabas hecho **sin fechas** entra como acumulado en
`ACUMULADO_PREVIO`: 613 minutos de análisis de datos y 4 publicaciones de
Substack. Suma al total y a la XP como si lo hubieras cumplido a razón de una
meta por vez, pero **no inventa una racha que no ocurrió**.

### Metas con vigencia

Los objetivos cambian, y el pasado se juzga con el que regía entonces. El muay
thai pasó de una clase por semana a dos, así que la actividad lleva
`weeklyTargetHistory`:

```js
weeklyTargetHistory: [
  { from: '2025-08-04', target: 1 },
  { from: '2026-09-07', target: 2 },
],
```

Sin esto, subir la vara hoy convertiría un año entero de constancia en
cincuenta y seis semanas incumplidas y la racha se caería a dos. Con esto, la
racha son las 59 semanas que de verdad entrenaste.

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

Cada actividad sube de nivel en su propia curva (cada nivel cuesta más que el
anterior) y atraviesa **rangos con nombre propio**: los umbrales son los mismos
para todas —niveles 1, 5, 10, 20, 35 y 50— pero el nombre lo pone la
disciplina, porque "Adepto" no dice nada y "Nak Su" sí.

| Actividad | 1 | 5 | 10 | 20 | 35 | 50 |
|---|---|---|---|---|---|---|
| 📊 Datos | Curioso | Analista Jr. | Analista | Analista Sr. | Científico de datos | Oráculo |
| 🎹 Piano | Primeras teclas | Estudiante | Intérprete | Concertista | Virtuoso | Maestro de capilla |
| 🏋️ Gimnasio* | Novato de sala | Fierrero | Atleta | Fuerte | Bestia | Titán |
| 🥊 Muay Thai | Luk Sit | Nak Muay | Nak Su | Campeón de estadio | Kru | Ajarn |
| 👟 Pasos | Paseante | Caminante | Andariego | Trotamundos | Explorador | Nómade |
| 💧 Agua | Gota | Arroyo | Río | Cascada | Lago | Océano |
| 🇫🇷 Francés | A1 · Débutant | A2 · Élémentaire | B1 · Intermédiaire | B2 · Avancé | C1 · Autonome | C2 · Maîtrise |
| ✍️ Substack | Borrador | Cronista | Editorialista | Ensayista | Escritor | Pluma consagrada |

\* El gimnasio no usa los umbrales de XP: sus seis rangos corresponden a las
bandas de fuerza relativa (de "empezando" a "élite").

El agua no aparece porque es un hábito sin niveles, y la composición corporal
tiene su propia escalera, la de los porcentajes de grasa.

El muay thai usa el escalafón tradicional (discípulo, peleador, guerrero,
instructor, gran maestro) y el francés los niveles reales del Marco Común
Europeo. Una actividad que agregues vos usa los nombres genéricos salvo que le
pongas `tierNames`.

La suma de todo alimenta tu **nivel de jugador**, que sí tiene títulos propios:
Aspirante → Iniciado → Disciplinado → Imparable → Veterano → Campeón → Mito
viviente.

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
npm test            # 92 tests: XP, rangos, rachas, fuerza, cuerpo e importación
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
  body.js               Grasa corporal, IMC y meta de agua  (con tests)
  strength.js           Fuerza relativa y niveles por ejercicio  (con tests)
  seed.js               Historial previo a la app  (con tests)
  steps-import.js       Lectura del CSV de Samsung Health  (con tests)
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

- Gráfico de progresión de 1RM por ejercicio a lo largo del tiempo.
- Temporizador de descanso entre series.
- Recordatorios de agua a lo largo del día.
- Una app Android mínima que lea Health Connect y escriba en este historial:
  es el único camino real a la sincronización automática de pasos.
- Sincronización entre dispositivos (hoy el `.json` exportado cumple esa función).
