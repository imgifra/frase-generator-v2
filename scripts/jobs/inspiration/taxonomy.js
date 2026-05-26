const DEFAULT_GROUP = "Humor cotidiano y absurdo";

const TAXONOMY = [
  {
    name: "Amor romántico",
    hint: "Idealizar, ilusionarse, querer amor",
    subtopic: "idealización / ilusión",
    pattern: /\b(amor romantico|amor romántico|amor\b|amar|enamor\w*|ilusion\w*|romantic\w*|idealiz\w*|querer amor|quiero enamorarme|me quiero enamorar|corazon|corazón|sentimiento|potencial|alma gemela|persona correcta|persona indicada|me gusta cuando|no encontre las palabras|te traje musica|te traigo musica|te traje canciones|te dedique musica)\b/
  },
  {
    name: "Desamor y tusa",
    hint: "Duelo, extrañar, dolor emocional",
    subtopic: "duelo / extrañar",
    pattern: /\b(tusa|desamor|duelo|extra[nñ]\w*|lo que extranas|lo que extrañas|duele|dol[io]\w*|dolor|romp\w* el corazon|corazon roto|llor\w*|despedida|perd[ií]|perderte|soltar|superar|me dolio|me dolió|me rompi|me rompí|partida|ausencia|no nos perdimos|idealiz\w*)\b/
  },
  {
    name: "Ex y contacto cero",
    hint: "Ex, bloqueo, recaídas, recuerdos",
    subtopic: "ex / contacto cero",
    pattern: /\b(mi ex|tu ex|su ex|el ex|la ex|un ex|una ex|exnovi[ao]|ex pareja|expareja|ex crush|ex casi algo|contacto 0|contacto cero|bloque[ao]\w*|bloquear|desbloque\w*|reca[ií]d\w*|volverle a escribir|le volvi a escribir|le volví a escribir|record[eé] a mi ex)\b/
  },
  {
    name: "Coqueteo y deseo",
    hint: "Flirteo, atracción, tensión",
    subtopic: "flirteo / tensión",
    pattern: /\b(coquet\w*|flirte\w*|ligue|crush|cita|beso|besar|arrunch\w*|deseo|cachond\w*|tension|tensión|ganas de verte|ganas de vernos|ganas de besarte|me gusta|gustas?|atracci[oó]n|conquist\w*|pretendient\w*|vernos|nos vemos|te quiero cerca|me interesas|quitarme la duda|quiero que me vivas|me vivas|me tengas que vivir|me experimentes|experimentes)\b/
  },
  {
    name: "Vínculos confusos",
    hint: "Ghosting, casi algo, señales mixtas",
    subtopic: "ghosting / casi algo",
    pattern: /\b(casi algo|situationship|ghosting|ghoste\w*|me ghoste\w*|love bombing|lovebombing|se[nñ]ales mixtas|mixed signals|no me escribe|no me habla|me escribe|me responde|me deja en visto|en visto|migaj\w*|intermitente|aparece|desaparece|no sabe lo que quiere|no sabes lo que quieres|cuando me dice|te diria|te diría|me ilusion\w*)\b/
  },
  {
    name: "Sexo y cuerpo",
    hint: "Sexo, intimidad explícita, deseo físico",
    subtopic: "sexo / cuerpo",
    pattern: /\b(sexo|coger|cog[ei]\w*|qliar|culiar|follar|chinga\w*|calenturient\w*|desnud\w*|cuca|culo|tetas|bolas|calzones|ropa puesta|me quito la ropa|sext\w*|cuerpo|cara|carita|carota|fisicamente|físicamente|pelo[s]? de la cuca)\b/
  },
  {
    name: "Dinámica de pareja",
    hint: "Reciprocidad, celos, expectativas, responsabilidad afectiva",
    subtopic: "relación / reciprocidad",
    pattern: /\b(pareja|relaci[oó]n|novi[ao]s?|vincul\w*|reciprocidad|responsabilidad afectiva|celos|celosa|celoso|t[oó]xic\w*|cacho|cachos|infiel|perdonar|perd[oó]n|novia|novio|permiso|trato|tratar|resuelva|resuelve|princess treatment|amor propio|expectativas?)\b/
  },
  {
    name: "Hombres y género",
    hint: "Hombres, mujeres, roles, quejas, red flags",
    subtopic: "género / red flags",
    pattern: /\b(hombres?|mujeres?|viejas?|manes?|man\b|el bobo|un feo|feo hombre|heterosexual|p[eé]talo|caballer\w*|novio\b|cachorro|papi|se[nñ]or|ingeniero|m[eé]dico|red flags?|red flag|roles?|masculin\w*|femenin\w*)\b/
  },
  {
    name: "Actitud, autoestima y límites",
    hint: "Orgullo, independencia, dignidad, no rogar",
    subtopic: "límites / orgullo",
    pattern: /\b(orgullo|estandares|estándares|autoestima|dignidad|limites|límites|prioridad|opcion|opción|independencia|relajad[ao]|duena de la pinata|dueña de la piñata|dueno de la pinata|dueño de la piñata|pelea por los caramelos|nunca pelea|no rogar|rog\w*|no toler\w*|no me confundas|no me busques|no te busco|no me debes|no me pidas|me dio flojera|me da flojera|no respondo|no contesto|contestona|vulgaridad|callada|consejos?|alej\w*|no hay necesidad de forzar|no me haces falta|me haces ruido|me ubico mejor)\b/
  },
  {
    name: "Autorretrato y mood",
    hint: "Cómo soy, mood, contradicciones, autosabotaje",
    subtopic: "yo / mood",
    pattern: /\b(yo\b|a mi\b|a mí\b|me siento|me senti|me sentí|amanec[ií]|estoy|soy|mi momento|mi version|mi versión|mi personalidad|mi defensa|mis contradicciones|autosabotaje|autosabote\w*|yo si|yo sí|me pasa|me gusta manejar|ando|no se socializar|no sé socializar|estoy bien|soy un 10|hacerme dano|hacerme daño|me hicieron dano|me hicieron daño|he sobrevivido|sobreviv[ií]\w*|todavia no puedo hablar|todavía no puedo hablar|todavia no puedo contar|todavía no puedo contar|no puedo hablar|no puedo contar|de lo que todavia no puedo|de lo que todavía no puedo)\b/
  },
  {
    name: "Salud mental",
    hint: "Ansiedad, terapia, depresión, cansancio vital",
    subtopic: "ansiedad / cansancio vital",
    pattern: /\b(salud mental|ansiedad|depresi[oó]n|terapia|psicolog\w*|traumas?|existencial|vacio|vacío|desmorona|estr[eé]s|estresad\w*|agotad\w*|cansancio|cansad\w*|dormir|procrastin\w*|fluoxetina|clonazepam|tca|duelo)\b/
  },
  {
    name: "Universidad y estudio",
    hint: "Parciales, semestre, carrera, estudiar",
    subtopic: "vida universitaria",
    pattern: /\b(universidad|universitari\w*|facultad|semestre|parcial(?:es)?|profe|profesor\w*|clase|estudi\w*|carrera|uni\b|la u\b|syllabus|materia|apuntes|examen(?:es)?|matricula|matrícula)\b/
  },
  {
    name: "Plata, trabajo y vida adulta",
    hint: "Sueldo, deudas, contratos, trabajo, adultez",
    subtopic: "plata / trabajo / adultez",
    pattern: /\b(plata|dinero|billete|sueldo|salario|gast\w*|taca[nñ]o|tarjeta|credito|crédito|compr\w*|pagar|cobrar|cobrame|cóbrame|qr|efectivo|quincena|deuda|trabaj\w*|chamb\w*|jefe|oficina|excel|entrevista|laboral|empleo|camello|contrato|prestacion de servicios|prestación de servicios|trabajador|adultez|vida adulta|domingo|lunes|miercoles|miércoles|semana)\b/
  },
  {
    name: "Bogotá, Colombia y calle",
    hint: "Ciudad, país, clima, cultura local, rolo/parce",
    subtopic: "ciudad / calle",
    pattern: /\b(bogota|bogotá|colombia|transmi|transmilenio|sitp|chapinero|tinto|trancon|trancón|pico y placa|bogotano|bogotana|rolo|rola|medellin|medellín|parcero|parce|nea|mor|mano|chimba|gonorrea|hpta|clima|aguacero|frio|frío|calor|calle|barrio|cai)\b/
  },
  {
    name: "Fiesta, alcohol y sustancias",
    hint: "Tomar, fumar, vapo, guaro, techno, bares",
    subtopic: "fiesta / sustancias",
    pattern: /\b(fiesta|rumba|tomar|trago|alcohol|guaro|pola|cerveza|borrach\w*|fumar|cigarrill\w*|bareta|mota|tussi|sople|vape|vapo|techno|baum|bar(?:es)?|after|pre\b|concierto|festival)\b/
  },
  {
    name: "Tecnología, IA y redes",
    hint: "ChatGPT, IA, Instagram, TikTok, apps, reels",
    subtopic: "tecnología / redes",
    pattern: /\b(chatgpt|ia\b|inteligencia artificial|instagram|tiktok|twitter|x\b|threads|reels?|apps?|app\b|whatsapp|celular|telefono|teléfono|followback|close friends|\bcf\b|historia|historias|like|likes|podcast|meme|memes)\b/
  },
  {
    name: "Política, actualidad y cultura pop",
    hint: "Políticos, farándula, música, memes coyunturales",
    subtopic: "actualidad / cultura pop",
    pattern: /\b(elecciones|candidato|presidente|gobierno|alcalde|congreso|politic[ao]s?|psoe|vox|trump|milei|petro|uribe|fecode|eurovision|papa francisco|papafest|opus dei|fetterman|sinema|zapatero|farándula|farandula|famos[ao]s?|cantante|cancion|canción|musica|música|beele|bts|mundial|copa america|burger master)\b/
  },
  {
    name: "Familia, amigos y hogar",
    hint: "Mamá, papá, amigos, casa, arrunche, domingo",
    subtopic: "familia / hogar",
    pattern: /\b(mama|mamá|papa|papá|padres?|familia|herman\w*|amig\w*|parcer\w*|casa|hogar|cuarto|cama|arrunche|arrunch\w*|domingo|grupo de amigos|grupo de whatsapp)\b/
  },
  {
    name: "Místico y destino",
    hint: "Tarot, Diosito, Mercurio, luna, señales, espiritualidad",
    subtopic: "místico / destino",
    pattern: /\b(tarot|diosito|dios\b|jesucristo|mercurio|luna|universo|señales|senales|karma|destino|manifest\w*|oraciones?|espiritualidad|espiritual|vibras|energ[ií]a|astros?|astral)\b/
  },
  {
    name: DEFAULT_GROUP,
    hint: "Frases random, observaciones raras, chistes sin tema fuerte",
    subtopic: "random / absurdo",
    pattern: /\b(normalicen|la gente|uno\b|nadie\b|todo el mundo|random|absurdo|raro|raras|chiste|observaci[oó]n|me da risa|qué pereza|que pereza)\b/
  }
];

const LEGACY_GROUP_MAP = {
  "Ex": "Ex y contacto cero",
  "Hombres": "Hombres y género",
  "Actitud y autoestima": "Actitud, autoestima y límites",
  "Universidad": "Universidad y estudio",
  "Plata y trabajo": "Plata, trabajo y vida adulta",
  "Humor y Colombia": "Bogotá, Colombia y calle"
};

const MATCH_PRIORITY = [
  "Ex y contacto cero",
  "Vínculos confusos",
  "Desamor y tusa",
  "Sexo y cuerpo",
  "Coqueteo y deseo",
  "Dinámica de pareja",
  "Hombres y género",
  "Salud mental",
  "Universidad y estudio",
  "Plata, trabajo y vida adulta",
  "Bogotá, Colombia y calle",
  "Fiesta, alcohol y sustancias",
  "Tecnología, IA y redes",
  "Política, actualidad y cultura pop",
  "Familia, amigos y hogar",
  "Místico y destino",
  "Amor romántico",
  "Actitud, autoestima y límites",
  "Autorretrato y mood",
  DEFAULT_GROUP
];

const DISPLAY_ORDER = [
  "Amor romántico",
  "Desamor y tusa",
  "Ex y contacto cero",
  "Coqueteo y deseo",
  "Vínculos confusos",
  "Sexo y cuerpo",
  "Dinámica de pareja",
  "Hombres y género",
  "Actitud, autoestima y límites",
  "Autorretrato y mood",
  "Salud mental",
  "Universidad y estudio",
  "Plata, trabajo y vida adulta",
  "Bogotá, Colombia y calle",
  "Fiesta, alcohol y sustancias",
  "Tecnología, IA y redes",
  "Política, actualidad y cultura pop",
  DEFAULT_GROUP,
  "Familia, amigos y hogar",
  "Místico y destino"
];

function normalizeGroupName(value) {
  const group = String(value || "").trim();
  return LEGACY_GROUP_MAP[group] || group;
}

function getTaxonomyMatch(scoredText) {
  const hits = TAXONOMY.filter(rule => rule.pattern.test(scoredText));
  if (!hits.length) return null;

  return hits.sort((a, b) => {
    const aIndex = MATCH_PRIORITY.indexOf(a.name);
    const bIndex = MATCH_PRIORITY.indexOf(b.name);
    const safeA = aIndex === -1 ? MATCH_PRIORITY.length : aIndex;
    const safeB = bIndex === -1 ? MATCH_PRIORITY.length : bIndex;
    return safeA - safeB;
  })[0];
}

module.exports = {
  DEFAULT_GROUP,
  TAXONOMY,
  LEGACY_GROUP_MAP,
  DISPLAY_ORDER,
  MATCH_PRIORITY,
  getTaxonomyMatch,
  normalizeGroupName
};
