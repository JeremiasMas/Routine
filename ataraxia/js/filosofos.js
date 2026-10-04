/**
 * Un filósofo por nivel, del 1 al 60, en orden de nacimiento.
 *
 * En la otra app los rangos son generales ordenados por lo improbable de lo
 * que lograron. Acá no hay batallas que comparar, así que el orden es el de
 * la historia: se arranca en Mileto preguntando de qué está hecho todo y se
 * termina con Camus imaginando a Sísifo feliz, que es la mejor descripción
 * que existe de alguien que sostiene una rutina.
 *
 * Cada nota es una idea o un dato real de esa persona, no una frase inventada
 * para la ocasión.
 */
export const FILOSOFOS = [
  { nivel: 1, nombre: 'Tales de Mileto', nota: 'Preguntó de qué está hecho todo. Ahí empezó la filosofía.' },
  { nivel: 2, nombre: 'Anaximandro', nota: 'Lo ilimitado: el origen no tiene por qué parecerse a nada conocido.' },
  { nivel: 3, nombre: 'Pitágoras', nota: 'Todo es número. Hasta los pasos.' },
  { nivel: 4, nombre: 'Confucio', nota: 'Aprender y practicar a su debido tiempo, ¿no es acaso un placer?' },
  { nivel: 5, nombre: 'Heráclito', nota: 'Nadie se baña dos veces en el mismo río.' },
  { nivel: 6, nombre: 'Parménides', nota: 'Lo que es, es; lo que no es, no es.' },
  { nivel: 7, nombre: 'Empédocles', nota: 'Cuatro elementos movidos por el amor y la discordia.' },
  { nivel: 8, nombre: 'Zenón de Elea', nota: 'Aquiles nunca alcanza a la tortuga. En teoría.' },
  { nivel: 9, nombre: 'Protágoras', nota: 'El hombre es la medida de todas las cosas.' },
  { nivel: 10, nombre: 'Sócrates', nota: 'Sólo sé que no sé nada.' },
  { nivel: 11, nombre: 'Demócrito', nota: 'Átomos y vacío; todo lo demás es opinión.' },
  { nivel: 12, nombre: 'Platón', nota: 'La caverna: lo que vemos son sombras de otra cosa.' },
  { nivel: 13, nombre: 'Diógenes de Sinope', nota: 'A Alejandro Magno le pidió que se corriera, que le tapaba el sol.' },
  { nivel: 14, nombre: 'Aristóteles', nota: 'La virtud es un hábito: se llega a ser justo haciendo cosas justas.' },
  { nivel: 15, nombre: 'Epicuro', nota: 'El placer sereno: pan, agua y amigos en un jardín.' },
  { nivel: 16, nombre: 'Zenón de Citio', nota: 'Fundó el estoicismo después de perderlo todo en un naufragio.' },
  { nivel: 17, nombre: 'Crisipo', nota: 'Sin Crisipo no habría Estoa, decían los antiguos.' },
  { nivel: 18, nombre: 'Cicerón', nota: 'Llevó la filosofía griega al latín, y con él a todo Occidente.' },
  { nivel: 19, nombre: 'Lucrecio', nota: 'Escribió la física de los átomos en verso.' },
  { nivel: 20, nombre: 'Séneca', nota: 'No es que tengamos poco tiempo: es que perdemos mucho.' },
  { nivel: 21, nombre: 'Epicteto', nota: 'Fue esclavo. Enseñó que hay cosas que dependen de nosotros y otras no.' },
  { nivel: 22, nombre: 'Marco Aurelio', nota: 'Emperador de Roma, escribía cada noche sólo para sí mismo.' },
  { nivel: 23, nombre: 'Plotino', nota: 'Todo emana de lo Uno, y todo busca volver.' },
  { nivel: 24, nombre: 'Agustín de Hipona', nota: '¿Qué es el tiempo? Si nadie me lo pregunta, lo sé.' },
  { nivel: 25, nombre: 'Hipatia', nota: 'Matemática, astrónoma y maestra de filosofía en Alejandría.' },
  { nivel: 26, nombre: 'Boecio', nota: 'Escribió La consolación de la filosofía esperando su condena.' },
  { nivel: 27, nombre: 'Avicena', nota: 'El hombre volante: alguien que flota sin sentir nada igual sabría que existe.' },
  { nivel: 28, nombre: 'Hildegarda de Bingen', nota: 'Abadesa, compositora, médica y visionaria.' },
  { nivel: 29, nombre: 'Averroes', nota: 'Desde Córdoba, el gran comentador de Aristóteles.' },
  { nivel: 30, nombre: 'Maimónides', nota: 'Escribió una Guía de perplejos. Todos lo somos un poco.' },
  { nivel: 31, nombre: 'Tomás de Aquino', nota: 'Una Suma tan grande que no la terminó.' },
  { nivel: 32, nombre: 'Guillermo de Ockham', nota: 'No hay que multiplicar las cosas sin necesidad.' },
  { nivel: 33, nombre: 'Christine de Pizan', nota: 'En 1405 imaginó una ciudad construida por mujeres.' },
  { nivel: 34, nombre: 'Erasmo de Róterdam', nota: 'Escribió un elogio de la locura para hablar en serio.' },
  { nivel: 35, nombre: 'Maquiavelo', nota: 'Miró la política como es, no como debería ser.' },
  { nivel: 36, nombre: 'Montaigne', nota: '¿Qué sé yo? Con esa pregunta inventó el ensayo.' },
  { nivel: 37, nombre: 'Francis Bacon', nota: 'Saber es poder.' },
  { nivel: 38, nombre: 'Thomas Hobbes', nota: 'Dijo que él y el miedo nacieron gemelos. Vivió 91 años.' },
  { nivel: 39, nombre: 'René Descartes', nota: 'Pienso, luego existo.' },
  { nivel: 40, nombre: 'Blaise Pascal', nota: 'El corazón tiene razones que la razón no conoce.' },
  { nivel: 41, nombre: 'John Locke', nota: 'La mente nace como una hoja en blanco.' },
  { nivel: 42, nombre: 'Baruch Spinoza', nota: 'Pulía lentes y escribió una ética con forma de geometría.' },
  { nivel: 43, nombre: 'Leibniz', nota: 'Vivimos en el mejor de los mundos posibles. Voltaire no estuvo de acuerdo.' },
  { nivel: 44, nombre: 'Sor Juana Inés de la Cruz', nota: 'Si Aristóteles hubiera guisado, mucho más hubiera escrito.' },
  { nivel: 45, nombre: 'David Hume', nota: 'La costumbre es la gran guía de la vida humana.' },
  { nivel: 46, nombre: 'Jean-Jacques Rousseau', nota: 'Pensaba mejor caminando: decía que quieto no podía.' },
  { nivel: 47, nombre: 'Immanuel Kant', nota: 'Atrévete a saber. Y salía a caminar a la misma hora todos los días.' },
  { nivel: 48, nombre: 'Mary Wollstonecraft', nota: 'Vindicación de los derechos de la mujer, en 1792.' },
  { nivel: 49, nombre: 'Hegel', nota: 'El búho de Minerva levanta vuelo recién al anochecer.' },
  { nivel: 50, nombre: 'Arthur Schopenhauer', nota: 'Caminaba dos horas por día, con lluvia o sin ella.' },
  { nivel: 51, nombre: 'John Stuart Mill', nota: 'Mejor Sócrates insatisfecho que un tonto satisfecho.' },
  { nivel: 52, nombre: 'Søren Kierkegaard', nota: 'La vida se vive hacia adelante, pero se entiende hacia atrás.' },
  { nivel: 53, nombre: 'William James', nota: 'El hábito es el enorme volante que mueve a la sociedad.' },
  { nivel: 54, nombre: 'Friedrich Nietzsche', nota: 'Sólo valen los pensamientos que se tienen caminando.' },
  { nivel: 55, nombre: 'Ludwig Wittgenstein', nota: 'De lo que no se puede hablar, hay que callar.' },
  { nivel: 56, nombre: 'María Zambrano', nota: 'La razón poética: pensar sin dejar afuera lo que se siente.' },
  { nivel: 57, nombre: 'Hannah Arendt', nota: 'Pensar sin barandillas.' },
  { nivel: 58, nombre: 'Simone de Beauvoir', nota: 'No se nace mujer: se llega a serlo.' },
  { nivel: 59, nombre: 'Simone Weil', nota: 'La atención es la forma más rara y más pura de la generosidad.' },
  { nivel: 60, nombre: 'Albert Camus', nota: 'Hay que imaginarse a Sísifo feliz.' },
];

/** El filósofo que corresponde a un nivel; pasado el 60 se queda en Camus. */
export function filosofoDe(nivel) {
  const n = Math.min(Math.max(1, Math.floor(nivel) || 1), FILOSOFOS.length);
  return FILOSOFOS[n - 1];
}
