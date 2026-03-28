import type { CommandType, ParsedCommandResult, TimestampInfo } from "./types";

/**
 * Crée un objet de base pour une commande
 */
function createBaseCommand(
  type: CommandType,
  rawText: string,
  timestampInfo: TimestampInfo
): ParsedCommandResult {
  return {
    type,
    action: "add",
    timestamp: timestampInfo.timestamp,
    timeOffset: timestampInfo.timeOffset,
    isFuture: timestampInfo.isFuture,
    rawText,
    childId: "",
  };
}

/**
 * Détecte un biberon dans le texte
 */
export function detectBiberon(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (
    !lowerText.includes("biberon") &&
    !lowerText.includes("bib ") &&
    !/\bbib\b/.test(lowerText) &&
    !lowerText.includes("bouteille") &&
    !/\bbu\s+\d+/.test(lowerText)
  ) {
    return null;
  }

  const cmd = createBaseCommand("biberon", rawText, timestampInfo);

  // Extraction quantité
  const mlPatterns = [
    /(\d+)\s*(ml)/i,
    /(\d+)\s*millilitre/i,
    /bu\s+(\d+)/i,
    /boire\s+(\d+)/i,
    /donné\s+(\d+)/i,
  ];

  for (const pattern of mlPatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      cmd.quantite = parseInt(match[1]);
      break;
    }
  }

  // Type de biberon
  if (lowerText.includes("maternel") || lowerText.includes("lait maternel")) {
    cmd.typeBiberon = "lait_maternel";
  } else if (lowerText.includes("infantile") || lowerText.includes("lait infantile") || lowerText.includes("formula")) {
    cmd.typeBiberon = "lait_infantile";
  } else if (lowerText.includes("eau")) {
    cmd.typeBiberon = "eau";
  } else if (lowerText.includes("jus")) {
    cmd.typeBiberon = "jus";
  }

  return cmd;
}

/**
 * Détecte une tétée dans le texte
 */
export function detectTetee(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (
    !lowerText.includes("tétée") &&
    !lowerText.includes("tetee") &&
    !lowerText.includes("têtée") &&
    !lowerText.includes("allaitement") &&
    !lowerText.includes("allaité") &&
    !lowerText.includes("nourri au sein") &&
    !lowerText.includes("mis au sein") &&
    !lowerText.includes("donné le sein") &&
    !/\bsein\b/.test(lowerText)
  ) {
    return null;
  }

  const cmd = createBaseCommand("tetee", rawText, timestampInfo);

  // Détection côté
  if (lowerText.includes("gauche") || lowerText.includes("sein gauche")) {
    cmd.coteGauche = true;
  }
  if (lowerText.includes("droit") || lowerText.includes("sein droit")) {
    cmd.coteDroit = true;
  }
  if (lowerText.includes("deux") || lowerText.includes("les 2") || lowerText.includes("both")) {
    cmd.coteGauche = true;
    cmd.coteDroit = true;
  }
  if (!cmd.coteGauche && !cmd.coteDroit) {
    cmd.coteGauche = true;
  }

  // Durée
  const minPatterns = [/(\d+)\s*(min|minute)/i, /pendant\s+(\d+)/i, /duré\s+(\d+)/i];
  for (const pattern of minPatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      cmd.quantite = parseInt(match[1]);
      break;
    }
  }

  return cmd;
}

/**
 * Détecte un pompage dans le texte
 */
export function detectPompage(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (
    !lowerText.includes("pompage") &&
    !lowerText.includes("tire-lait") &&
    !lowerText.includes("pomper") &&
    !lowerText.includes("tiré") &&
    !lowerText.includes("tire")
  ) {
    return null;
  }

  // Éviter conflit avec tétée (sein)
  if (lowerText.includes("tétée") || lowerText.includes("allaité")) {
    return null;
  }

  const cmd = createBaseCommand("pompage", rawText, timestampInfo);

  // Parse quantités gauche/droite
  const matchEt = lowerText.match(/(\d+)\s*(ml)?\s*gauche.*?(\d+)\s*(ml)?\s*droite/i);
  if (matchEt) {
    cmd.quantiteGauche = parseInt(matchEt[1]);
    cmd.quantiteDroite = parseInt(matchEt[3]);
  } else {
    const matchGauche = lowerText.match(/(\d+)\s*(ml)?\s*gauche/i);
    const matchDroite = lowerText.match(/(\d+)\s*(ml)?\s*droite/i);
    if (matchGauche) cmd.quantiteGauche = parseInt(matchGauche[1]);
    if (matchDroite) cmd.quantiteDroite = parseInt(matchDroite[1]);
  }

  return cmd;
}

/**
 * Détecte le domaine "couches" dans le texte.
 * `couche` reste ici un type parapluie de compatibilité pour les commandes
 * vocales; le flux moderne UI continue ensuite à s'appuyer sur `miction` /
 * `selle`.
 */
export function detectCouche(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  const hasPipi = lowerText.includes("pipi") || lowerText.includes("miction") || lowerText.includes("urine") || lowerText.includes("mouillé");
  const hasPopo = lowerText.includes("popo") || lowerText.includes("caca") || lowerText.includes("selle") || lowerText.includes("crotte");
  const hasCouche = lowerText.includes("couche") || lowerText.includes("changé") || lowerText.includes("change de");

  if (!hasPipi && !hasPopo && !hasCouche) {
    return null;
  }

  let type: CommandType;
  if (hasCouche || (hasPipi && hasPopo)) {
    // Preserve the historical umbrella command when the utterance is generic.
    type = "couche";
  } else if (hasPipi) {
    type = "miction";
  } else {
    type = "selle";
  }

  const cmd = createBaseCommand(type, rawText, timestampInfo);
  cmd.pipi = hasPipi || hasCouche;
  cmd.popo = hasPopo;

  // Consistance/couleur pour selles
  if (hasPopo || type === "selle") {
    if (lowerText.includes("liquide") || lowerText.includes("diarrhée")) cmd.consistance = "liquide";
    else if (lowerText.includes("molle") || lowerText.includes("mou")) cmd.consistance = "molle";
    else if (lowerText.includes("normal")) cmd.consistance = "normale";
    else if (lowerText.includes("dur")) cmd.consistance = "dure";

    if (lowerText.includes("jaune")) cmd.couleur = "jaune";
    else if (lowerText.includes("vert")) cmd.couleur = "vert";
    else if (lowerText.includes("marron") || lowerText.includes("brun")) cmd.couleur = "marron";
  }

  return cmd;
}

/**
 * Détecte une vitamine dans le texte
 */
export function detectVitamine(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (!lowerText.includes("vitamine") && !/\bvit\b/i.test(lowerText) && !/\bvite\b/i.test(lowerText)) {
    return null;
  }

  const cmd = createBaseCommand("vitamine", rawText, timestampInfo);

  if (/vitamine\s*k/i.test(lowerText) || /vit\s*k/i.test(lowerText)) {
    cmd.nomVitamine = "Vitamine K";
  } else {
    cmd.nomVitamine = "Vitamine D";
  }

  return cmd;
}

/**
 * Détecte un sommeil dans le texte
 */
export function detectSommeil(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (
    !lowerText.includes("sommeil") &&
    !lowerText.includes("dodo") &&
    !lowerText.includes("sieste") &&
    !lowerText.includes("dort") &&
    !lowerText.includes("dormi") &&
    !lowerText.includes("endormi") &&
    !lowerText.includes("réveillé") &&
    !lowerText.includes("nuit") &&
    !lowerText.includes("couché")
  ) {
    return null;
  }

  const cmd = createBaseCommand("sommeil", rawText, timestampInfo);

  // Durée
  const dureePatterns = [/(\d+)\s*(h|heure)/i, /(\d+)\s*(min|minute)/i, /dormi\s+(\d+)/i];
  for (const pattern of dureePatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      let minutes = parseInt(match[1]);
      if (match[2] && (match[2].startsWith("h") || match[2] === "heure")) {
        minutes *= 60;
      }
      cmd.duree = minutes;
      break;
    }
  }

  return cmd;
}

/**
 * Détecte une activité dans le texte
 */
export function detectActivite(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  const activityTriggers = [
    "activité", "activite", "tummy time", "tummytime", "sur le ventre",
    "motricité", "gym bébé", "jeux", "jouer", "jouet", "hochet", "puzzle",
    "lecture", "lire", "livre", "histoire", "conte", "comptine",
    "promenade", "balade", "sortie", "parc", "jardin", "dehors", "poussette",
    "massage", "câlin", "calin", "peau à peau",
    "musique", "chanson", "chanter", "berceuse",
    "éveil", "eveil", "sensoriel", "mobile", "tapis d'éveil",
    "crèche", "creche", "nounou"
  ];

  const hasActivity = activityTriggers.some(trigger => lowerText.includes(trigger));
  if (!hasActivity) {
    return null;
  }

  const cmd = createBaseCommand("activite", rawText, timestampInfo);

  // Détection du type d'activité
  if (lowerText.includes("tummy") || lowerText.includes("sur le ventre")) {
    cmd.typeActivite = "tummyTime";
  } else if (lowerText.includes("motricité") || lowerText.includes("gym")) {
    cmd.typeActivite = "motricite";
  } else if (lowerText.includes("jeux") || lowerText.includes("jouer") || lowerText.includes("jouet") || lowerText.includes("puzzle")) {
    cmd.typeActivite = "jeux";
  } else if (lowerText.includes("lecture") || lowerText.includes("lire") || lowerText.includes("livre") || lowerText.includes("histoire")) {
    cmd.typeActivite = "lecture";
  } else if (lowerText.includes("promenade") || lowerText.includes("balade") || lowerText.includes("parc") || lowerText.includes("jardin") || lowerText.includes("poussette")) {
    cmd.typeActivite = "promenade";
  } else if (lowerText.includes("sortie") || lowerText.includes("dehors")) {
    cmd.typeActivite = "sortie";
  } else if (lowerText.includes("massage")) {
    cmd.typeActivite = "massage";
  } else if (lowerText.includes("câlin") || lowerText.includes("calin") || lowerText.includes("peau à peau")) {
    cmd.typeActivite = "calin";
  } else if (lowerText.includes("musique") || lowerText.includes("chanson") || lowerText.includes("berceuse")) {
    cmd.typeActivite = "musique";
  } else if (lowerText.includes("éveil") || lowerText.includes("eveil") || lowerText.includes("sensoriel")) {
    cmd.typeActivite = "eveil";
  } else if (lowerText.includes("crèche") || lowerText.includes("nounou")) {
    cmd.typeActivite = "garde";
  } else {
    cmd.typeActivite = "autre";
  }

  // Durée
  const minMatch = lowerText.match(/(\d+)\s*(min|minute|h|heure)/i);
  if (minMatch) {
    let minutes = parseInt(minMatch[1]);
    if (minMatch[2].startsWith("h")) minutes *= 60;
    cmd.duree = minutes;
  }

  return cmd;
}

/**
 * Détecte un jalon dans le texte
 */
export function detectJalon(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  const jalonTriggers = [
    "jalon", "milestone", "première dent", "premiere dent", "premiers pas",
    "premier sourire", "premiers mots", "premier mot", "se retourne",
    "tient assis", "assis seul", "rampe", "4 pattes", "se lève", "debout",
    "gazouille", "babille", "dit maman", "dit papa", "premier rire",
    "fait coucou", "attrape", "applaudit"
  ];

  const hasHumeur = lowerText.includes("humeur");
  const hasJalon = jalonTriggers.some(trigger => lowerText.includes(trigger));

  if (!hasJalon && !hasHumeur) {
    return null;
  }

  const cmd = createBaseCommand("jalon", rawText, timestampInfo);

  // Détection du type
  if (lowerText.includes("dent")) cmd.typeJalon = "dent";
  else if (lowerText.includes("pas") || lowerText.includes("marche")) cmd.typeJalon = "pas";
  else if (lowerText.includes("se retourne")) cmd.typeJalon = "retournement";
  else if (lowerText.includes("assis")) cmd.typeJalon = "assis";
  else if (lowerText.includes("rampe") || lowerText.includes("4 pattes")) cmd.typeJalon = "rampe";
  else if (lowerText.includes("debout") || lowerText.includes("se lève")) cmd.typeJalon = "debout";
  else if (lowerText.includes("sourire")) cmd.typeJalon = "sourire";
  else if (lowerText.includes("rire") || lowerText.includes("rit")) cmd.typeJalon = "rire";
  else if (lowerText.includes("mot") || lowerText.includes("maman") || lowerText.includes("papa")) cmd.typeJalon = "mot";
  else if (lowerText.includes("gazouille") || lowerText.includes("babille")) cmd.typeJalon = "gazouillis";
  else if (lowerText.includes("coucou") || lowerText.includes("applaudit")) cmd.typeJalon = "geste_social";
  else if (lowerText.includes("attrape")) cmd.typeJalon = "coordination";
  else if (hasHumeur) {
    cmd.typeJalon = "humeur";
    if (lowerText.includes("super") || lowerText.includes("excellent") || lowerText.includes("génial")) cmd.humeur = 5;
    else if (lowerText.includes("bien") || lowerText.includes("content") || lowerText.includes("joyeux")) cmd.humeur = 4;
    else if (lowerText.includes("normal") || lowerText.includes("ok") || lowerText.includes("bof")) cmd.humeur = 3;
    else if (lowerText.includes("pas bien") || lowerText.includes("fatigué") || lowerText.includes("grognon")) cmd.humeur = 2;
    else if (lowerText.includes("mal") || lowerText.includes("triste") || lowerText.includes("pleure")) cmd.humeur = 1;
  } else {
    cmd.typeJalon = "autre";
  }

  return cmd;
}

/**
 * Détecte une croissance dans le texte
 */
export function detectCroissance(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (
    !lowerText.includes("croissance") &&
    !lowerText.includes("poids") &&
    !lowerText.includes("taille") &&
    !lowerText.includes("périmètre") &&
    !lowerText.includes("mesure")
  ) {
    return null;
  }

  const cmd = createBaseCommand("croissance", rawText, timestampInfo);

  // Poids
  const poidsMatchKg = lowerText.match(/(\d+[.,]?\d*)\s*(kg|kilo)/i);
  const poidsMatchG = lowerText.match(/(\d+)\s*(g|gramme)/i);
  if (poidsMatchKg) {
    cmd.poids = parseFloat(poidsMatchKg[1].replace(",", "."));
  } else if (poidsMatchG) {
    cmd.poids = parseInt(poidsMatchG[1]) / 1000;
  }

  // Taille
  const tailleMatch = lowerText.match(/(\d+[.,]?\d*)\s*(cm|centimètre)/i);
  if (tailleMatch) {
    cmd.taille = parseFloat(tailleMatch[1].replace(",", "."));
  }

  // Périmètre crânien
  if (lowerText.includes("périmètre") || lowerText.includes("crâne")) {
    const pcMatch = lowerText.match(/(\d+[.,]?\d*)\s*(cm)?/i);
    if (pcMatch) {
      cmd.perimetreCranien = parseFloat(pcMatch[1].replace(",", "."));
    }
  }

  return cmd;
}

/**
 * Détecte un repas solide dans le texte
 */
export function detectSolide(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (
    !lowerText.includes("repas") &&
    !lowerText.includes("solide") &&
    !lowerText.includes("purée") &&
    !lowerText.includes("compote") &&
    !lowerText.includes("céréales") &&
    !lowerText.includes("yaourt") &&
    !lowerText.includes("morceaux") &&
    !lowerText.includes("dme") &&
    !lowerText.includes("diversification")
  ) {
    return null;
  }

  const cmd = createBaseCommand("solide", rawText, timestampInfo);

  // Type
  if (lowerText.includes("purée")) cmd.typeSolide = "puree";
  else if (lowerText.includes("compote")) cmd.typeSolide = "compote";
  else if (lowerText.includes("céréales")) cmd.typeSolide = "cereales";
  else if (lowerText.includes("yaourt")) cmd.typeSolide = "yaourt";
  else if (lowerText.includes("morceaux") || lowerText.includes("dme")) cmd.typeSolide = "morceaux";
  else cmd.typeSolide = "autre";

  // Moment
  if (lowerText.includes("petit") && lowerText.includes("déjeuner")) cmd.momentRepas = "petit_dejeuner";
  else if (lowerText.includes("déjeuner") || lowerText.includes("midi")) cmd.momentRepas = "dejeuner";
  else if (lowerText.includes("goûter")) cmd.momentRepas = "gouter";
  else if (lowerText.includes("dîner") || lowerText.includes("soir")) cmd.momentRepas = "diner";

  // Quantité
  if (lowerText.includes("peu")) cmd.quantiteSolide = "peu";
  else if (lowerText.includes("beaucoup") || lowerText.includes("bien mangé")) cmd.quantiteSolide = "beaucoup";
  else cmd.quantiteSolide = "moyen";

  return cmd;
}

/**
 * Détecte un bain dans le texte
 */
export function detectBain(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (!lowerText.includes("bain") && !lowerText.includes("douche") && !lowerText.includes("lavé")) {
    return null;
  }

  const cmd = createBaseCommand("bain", rawText, timestampInfo);

  const minMatch = lowerText.match(/(\d+)\s*(min|minute)/i);
  if (minMatch) {
    cmd.duree = parseInt(minMatch[1]);
  }

  return cmd;
}

/**
 * Détecte un nettoyage de nez dans le texte
 */
export function detectNettoyageNez(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (
    !lowerText.includes("nez") &&
    !lowerText.includes("mouche") &&
    !lowerText.includes("sérum") &&
    !lowerText.includes("serum") &&
    !lowerText.includes("moucher")
  ) {
    return null;
  }

  const cmd = createBaseCommand("nettoyage_nez", rawText, timestampInfo);

  if (lowerText.includes("sérum") || lowerText.includes("serum") || lowerText.includes("physiologique")) {
    cmd.methode = "serum";
  } else if (lowerText.includes("mouche")) {
    cmd.methode = "mouche_bebe";
  } else if (lowerText.includes("coton") || lowerText.includes("mouchoir")) {
    cmd.methode = "coton";
  }

  return cmd;
}

/**
 * Détecte une température dans le texte
 */
export function detectTemperature(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (
    !lowerText.includes("température") &&
    !lowerText.includes("fièvre") &&
    !lowerText.includes("degré")
  ) {
    return null;
  }

  const cmd = createBaseCommand("temperature", rawText, timestampInfo);

  const tempMatch = lowerText.match(/(\d+[.,]?\d*)\s*(°|degré)?/i);
  if (tempMatch) {
    cmd.valeurTemperature = parseFloat(tempMatch[1].replace(",", "."));
  }

  return cmd;
}

/**
 * Détecte un médicament dans le texte
 */
export function detectMedicament(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  const medTriggers = [
    "médicament", "medicament", "médoc", "sirop", "gouttes", "suppositoire",
    "doliprane", "dafalgan", "efferalgan", "paracétamol", "advil", "nurofen",
    "amoxicilline", "augmentin", "smecta", "biogaia", "gaviscon",
    "calmosine", "dexeryl", "bepanthen", "mitosyl", "ventoline"
  ];

  const hasMed = medTriggers.some(trigger => lowerText.includes(trigger));
  if (!hasMed) {
    return null;
  }

  // Éviter conflit avec vitamine
  if (lowerText.includes("vitamine") && !lowerText.includes("médicament")) {
    return null;
  }

  const cmd = createBaseCommand("medicament", rawText, timestampInfo);

  // Nom du médicament
  if (lowerText.includes("doliprane")) cmd.nomMedicament = "Doliprane";
  else if (lowerText.includes("dafalgan")) cmd.nomMedicament = "Dafalgan";
  else if (lowerText.includes("efferalgan")) cmd.nomMedicament = "Efferalgan";
  else if (lowerText.includes("paracétamol")) cmd.nomMedicament = "Paracétamol";
  else if (lowerText.includes("advil")) cmd.nomMedicament = "Advil";
  else if (lowerText.includes("nurofen")) cmd.nomMedicament = "Nurofen";
  else if (lowerText.includes("amoxicilline")) cmd.nomMedicament = "Amoxicilline";
  else if (lowerText.includes("augmentin")) cmd.nomMedicament = "Augmentin";
  else if (lowerText.includes("smecta")) cmd.nomMedicament = "Smecta";
  else if (lowerText.includes("biogaia")) cmd.nomMedicament = "BioGaia";
  else if (lowerText.includes("gaviscon")) cmd.nomMedicament = "Gaviscon";
  else if (lowerText.includes("calmosine")) cmd.nomMedicament = "Calmosine";
  else if (lowerText.includes("ventoline")) cmd.nomMedicament = "Ventoline";
  else if (lowerText.includes("dexeryl")) cmd.nomMedicament = "Dexeryl";
  else if (lowerText.includes("bepanthen")) cmd.nomMedicament = "Bepanthen";
  else if (lowerText.includes("mitosyl")) cmd.nomMedicament = "Mitosyl";

  // Dosage
  const dosageMatch = lowerText.match(/(\d+[.,]?\d*)\s*(ml|mg|gouttes?)/i);
  if (dosageMatch) {
    cmd.dosage = `${dosageMatch[1]} ${dosageMatch[2]}`;
  }

  return cmd;
}

/**
 * Détecte un symptôme dans le texte
 */
export function detectSymptome(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  const symptomeTriggers = [
    "symptôme", "symptome", "malade", "toux", "tousse", "rhume",
    "nez qui coule", "nez bouché", "vomissement", "vomi", "régurgit",
    "diarrhée", "constipé", "colique", "éruption", "bouton", "rougeur",
    "eczéma", "fièvre", "conjonctivite", "otite"
  ];

  const hasSymptome = symptomeTriggers.some(trigger => lowerText.includes(trigger));
  if (!hasSymptome) {
    return null;
  }

  // Éviter conflit avec température (fièvre avec valeur = température)
  if (lowerText.includes("fièvre") && /\d+[.,]?\d*\s*(°|degré)/i.test(lowerText)) {
    return null;
  }

  const cmd = createBaseCommand("symptome", rawText, timestampInfo);

  // Description
  if (lowerText.includes("toux") || lowerText.includes("tousse")) {
    cmd.descriptionSymptome = lowerText.includes("grasse") ? "Toux grasse" : lowerText.includes("sèche") ? "Toux sèche" : "Toux";
  } else if (lowerText.includes("rhume") || lowerText.includes("nez")) {
    cmd.descriptionSymptome = "Rhume";
  } else if (lowerText.includes("vomissement") || lowerText.includes("vomi")) {
    cmd.descriptionSymptome = "Vomissement";
  } else if (lowerText.includes("régurgit")) {
    cmd.descriptionSymptome = "Régurgitation";
  } else if (lowerText.includes("diarrhée")) {
    cmd.descriptionSymptome = "Diarrhée";
  } else if (lowerText.includes("constipé")) {
    cmd.descriptionSymptome = "Constipation";
  } else if (lowerText.includes("colique")) {
    cmd.descriptionSymptome = "Coliques";
  } else if (lowerText.includes("éruption") || lowerText.includes("bouton")) {
    cmd.descriptionSymptome = "Éruption cutanée";
  } else if (lowerText.includes("rougeur")) {
    cmd.descriptionSymptome = "Rougeurs";
  } else if (lowerText.includes("eczéma")) {
    cmd.descriptionSymptome = "Eczéma";
  } else if (lowerText.includes("conjonctivite")) {
    cmd.descriptionSymptome = "Conjonctivite";
  } else if (lowerText.includes("otite")) {
    cmd.descriptionSymptome = "Otite";
  } else if (lowerText.includes("malade")) {
    cmd.descriptionSymptome = "Malade";
  }

  return cmd;
}

/**
 * Détecte un vaccin dans le texte
 */
export function detectVaccin(lowerText: string, rawText: string, timestampInfo: TimestampInfo): ParsedCommandResult | null {
  if (!lowerText.includes("vaccin") && !lowerText.includes("vaccination") && !lowerText.includes("piqûre")) {
    return null;
  }

  const cmd = createBaseCommand("vaccin", rawText, timestampInfo);

  if (lowerText.includes("dtpolio")) cmd.nomVaccin = "DTPolio";
  else if (lowerText.includes("hexavalent") || lowerText.includes("infanrix")) cmd.nomVaccin = "Hexavalent";
  else if (lowerText.includes("pneumocoque") || lowerText.includes("prevenar")) cmd.nomVaccin = "Pneumocoque";
  else if (lowerText.includes("ror") || lowerText.includes("rougeole")) cmd.nomVaccin = "ROR";
  else if (lowerText.includes("méningocoque")) cmd.nomVaccin = "Méningocoque";
  else if (lowerText.includes("bcg")) cmd.nomVaccin = "BCG";
  else if (lowerText.includes("hépatite")) cmd.nomVaccin = "Hépatite B";
  else if (lowerText.includes("rappel")) cmd.nomVaccin = "Rappel";

  return cmd;
}

/**
 * All detectors in order — used by parseSegmentForAllEvents and parseSingleCommand
 */
export const ALL_DETECTORS = [
  detectBiberon,
  detectTetee,
  detectPompage,
  detectCouche,
  detectVitamine,
  detectSommeil,
  detectActivite,
  detectJalon,
  detectCroissance,
  detectSolide,
  detectBain,
  detectNettoyageNez,
  detectTemperature,
  detectMedicament,
  detectSymptome,
  detectVaccin,
] as const;
