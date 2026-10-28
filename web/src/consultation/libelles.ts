// Libellés des consultations, dans la langue de la consultation (et non celle de l'interface de l'initiateur) :
// le questionnaire et le rapport doivent parler la langue des personnes consultées.
import type { CleCategorie, Format, Langue, Position } from './types'

interface Libelles {
  categorie: Record<CleCategorie, string>
  categorieCourt: Record<CleCategorie, string>
  position: Record<Position, string>
  positionCourt: Record<Position, string>
  engagement: string[]
  engagementCourt: string[]
  format: Record<Format, string>
  formatCourt: Record<Format, string>
  valeurs: Record<string, string>
}

const fr: Libelles = {
  categorie: {
    groupe: 'Votre groupe',
    tranche_age: 'Votre âge',
    sexe: 'Vous êtes',
    nationalite: 'Votre nationalité',
    activite: 'Votre activité principale',
    menage: 'Votre ménage',
    lieu_de_vie: 'Où vivez-vous ?',
  },
  categorieCourt: { groupe: 'Groupe', tranche_age: 'Âge', sexe: 'Sexe', nationalite: 'Nationalité', activite: 'Activité', menage: 'Ménage', lieu_de_vie: 'Lieu de vie' },
  position: {
    porteur: 'Oui, et je veux y contribuer activement',
    interesse: "Oui, cela m'intéresse",
    indifferent: "Cela m'est égal",
    reticent: "J'ai des réserves",
    opposant: 'Je suis contre',
  },
  positionCourt: { porteur: 'Porteur', interesse: 'Intéressé', indifferent: 'Indifférent', reticent: 'Réticent', opposant: 'Opposé' },
  engagement: [
    'Je ne ferais rien de plus',
    "Je m'informerais",
    'Je donnerais mon avis en ligne',
    'Je viendrais à un atelier sur place',
    "Je m'impliquerais pour porter le projet",
  ],
  engagementCourt: ['Rien de plus', "S'informer", 'Avis en ligne', 'Atelier sur place', 'Porter le projet'],
  format: {
    avis_en_ligne: 'Donner mon avis en ligne, en 10 minutes',
    atelier_presentiel: 'Un atelier sur place, de 2 h 30',
    parcours_distance: 'Un parcours à distance, trois fois 20 minutes',
    aucun: 'Aucun de ces formats',
  },
  formatCourt: { avis_en_ligne: 'Avis en ligne', atelier_presentiel: 'Atelier sur place', parcours_distance: 'Parcours à distance', aucun: 'Aucun' },
  valeurs: { femme: 'Femme', homme: 'Homme', suisse: 'Suisse', etrangere: 'Autre nationalité', autre: 'Autre' },
}

const en: Libelles = {
  categorie: {
    groupe: 'Your group',
    tranche_age: 'Your age',
    sexe: 'You are',
    nationalite: 'Your nationality',
    activite: 'Your main occupation',
    menage: 'Your household',
    lieu_de_vie: 'Where do you live?',
  },
  categorieCourt: { groupe: 'Group', tranche_age: 'Age', sexe: 'Sex', nationalite: 'Nationality', activite: 'Occupation', menage: 'Household', lieu_de_vie: 'Place of residence' },
  position: {
    porteur: 'Yes, and I want to contribute actively',
    interesse: 'Yes, it interests me',
    indifferent: "I don't mind either way",
    reticent: 'I have reservations',
    opposant: "I'm against it",
  },
  positionCourt: { porteur: 'Champion', interesse: 'Interested', indifferent: 'Indifferent', reticent: 'Reluctant', opposant: 'Opposed' },
  engagement: ["I wouldn't do anything more", 'I would keep informed', 'I would give my opinion online', 'I would come to an on-site workshop', 'I would get involved to carry the project'],
  engagementCourt: ['Nothing more', 'Keep informed', 'Online opinion', 'On-site workshop', 'Carry the project'],
  format: {
    avis_en_ligne: 'Give my opinion online, in 10 minutes',
    atelier_presentiel: 'An on-site workshop, 2.5 hours',
    parcours_distance: 'A remote journey, three times 20 minutes',
    aucun: 'None of these formats',
  },
  formatCourt: { avis_en_ligne: 'Online opinion', atelier_presentiel: 'On-site workshop', parcours_distance: 'Remote journey', aucun: 'None' },
  valeurs: {
    femme: 'Woman',
    homme: 'Man',
    suisse: 'Swiss',
    etrangere: 'Other nationality',
    autre: 'Other',
    'vit chez ses parents': 'Lives with parents',
    'seul·e': 'Alone',
    'en couple sans enfant': 'Couple without children',
    'en couple avec enfants': 'Couple with children',
    'parent seul avec enfants': 'Single parent with children',
    'en couple, enfants partis': 'Couple, children have left home',
    'en formation (apprentissage ou études)': 'In education (apprenticeship or studies)',
    'jeune employé·e ou apprenti·e en fin de formation': 'Young employee or apprentice finishing training',
    'retraité·e': 'Retired',
    'agriculteur·rice': 'Farmer',
    "ouvrier·ère ou technicien·ne dans l'industrie": 'Industrial worker or technician',
    'artisan·e ou indépendant·e du bâtiment': 'Construction tradesperson or self-employed',
    "employé·e de commerce, de bureau ou d'administration": 'Office, commercial or administrative employee',
    "professionnel·le de la santé, du social ou de l'éducation": 'Health, social care or education professional',
    'employé·e de la vente, de la restauration ou du transport': 'Retail, catering or transport employee',
    'cadre ou profession libérale': 'Manager or liberal profession',
    'parent au foyer ou sans emploi': 'Stay-at-home parent or unemployed',
  },
}

export const LIBELLES: Record<Langue, Libelles> = { fr, en }

// Racines des objections, telles que les nomme la lecture (src/schemas.ts).
export const RACINES: Record<Langue, Record<string, string>> = {
  fr: { economique: 'économique', culturelle: 'culturelle', pratique: 'pratique', identitaire: 'identitaire', politique: 'politique', information: "manque d'information" },
  en: { economique: 'economic', culturelle: 'cultural', pratique: 'practical', identitaire: 'identity', politique: 'political', information: 'lack of information' },
}

// Ce qui remplace les coordonnées retirées des textes libres.
export const MASQUAGE: Record<Langue, { adresse: string; lien: string; numero: string }> = {
  fr: { adresse: '[adresse retirée]', lien: '[lien retiré]', numero: '[numéro retiré]' },
  en: { adresse: '[address removed]', lien: '[link removed]', numero: '[number removed]' },
}

const majuscule = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Libellé d'une valeur de catégorie : tranches d'âge mises en mots, valeurs connues traduites, sinon telles quelles.
export function libelleValeur(langue: Langue, cle: CleCategorie, valeur: string): string {
  if (cle === 'tranche_age') {
    const m = valeur.match(/^(\d+)-(\d+)$/)
    if (m) return langue === 'fr' ? `${m[1]} à ${m[2]} ans` : `${m[1]} to ${m[2]}`
    const plus = valeur.match(/^(\d+)\+$/)
    if (plus) return langue === 'fr' ? `${plus[1]} ans et plus` : `${plus[1]} and over`
  }
  const v = LIBELLES[langue].valeurs[valeur] ?? (langue === 'fr' ? fr.valeurs[valeur] : undefined)
  return v ?? majuscule(valeur)
}

// Textes de la page des contributeurs, toujours dans la langue de la consultation.
export const TEXTES_PARTICIPANT = {
  fr: {
    titrePage: 'Consultation',
    chargement: 'Ouverture du questionnaire…',
    lienInvalide: "Ce lien est incomplet. Ouvrez le lien exact reçu de l'organisation, sans le modifier.",
    introuvable: "Cette consultation n'existe pas ou a été effacée.",
    illisible: "Ce questionnaire ne peut pas être ouvert avec ce lien. Vérifiez que le lien est complet.",
    reseau: 'Connexion impossible. Vérifiez votre connexion internet puis réessayez.',
    reessayer: 'Réessayer',
    fermee: 'Cette consultation est close. Merci de votre intérêt.',
    proposePar: 'Consultation · {organisation}',
    confidentialite: [
      "Vos réponses sont chiffrées sur cet appareil avant d'être envoyées. Seul l'organisateur de la consultation peut les lire : ni le serveur, ni RegenVox.",
      'Aucun nom, aucune adresse, aucun compte. Seule la date du jour est enregistrée avec vos réponses.',
      "L'organisateur analysera l'ensemble des réponses, sans votre nom, avec un outil d'intelligence artificielle de son choix. Un groupe de moins de 5 personnes n'apparaît jamais dans les résultats publiés.",
      'Sur le serveur, les réponses chiffrées sont effacées au plus tard {jours} jours après la clôture du {cloture}.',
    ],
    contact: 'Une question ? {contact}',
    formulationTitre: 'La démarche proposée',
    sectionVous: 'À propos de vous',
    sectionVousAide: 'Ces questions servent à vérifier que toutes les parts de la population sont entendues. Toutes sont facultatives.',
    preferePas: 'Je préfère ne pas répondre',
    sectionDemarche: 'Votre avis sur la démarche',
    position: 'Cette démarche vous parle-t-elle ?',
    engagement: "Jusqu'où iriez-vous ?",
    format: 'Si vous participiez, sous quelle forme ?',
    avis: 'En une phrase, que pensez-vous de cette démarche ?',
    freins: "Qu'est-ce qui pourrait vous empêcher de participer ?",
    envie: "Qu'est-ce qui vous donnerait envie de participer davantage ?",
    texteAide: "N'écrivez ni nom ni coordonnées, les vôtres comme celles des autres.",
    sectionQuestions: "Les questions de l'organisateur",
    obligatoire: 'obligatoire',
    facultatif: 'facultatif',
    echellePeu: 'pas du tout',
    echelleTres: 'tout à fait',
    plusieurs: 'Plusieurs réponses possibles.',
    manque: 'Merci de répondre aux questions obligatoires : {liste}.',
    envoyer: 'Envoyer mes réponses',
    envoi: 'Chiffrement et envoi…',
    erreurEnvoi: "L'envoi a échoué. Vos réponses sont toujours là : réessayez dans un instant.",
    tropDeDemandes: 'Trop de réponses envoyées depuis ce réseau en peu de temps. Réessayez dans une heure.',
    merciTitre: 'Merci, vos réponses sont envoyées',
    merciTexte: "L'organisateur les lira avec toutes les autres. Vous pouvez fermer cette page.",
    dejaRepondu: 'Une réponse a déjà été envoyée depuis cet appareil. Si une autre personne utilise le même appareil, elle peut répondre à son tour.',
    nouvelle: 'Une autre personne veut répondre sur cet appareil',
    pied: 'Questionnaire RegenVox, logiciel libre de Régénère Plus. Les réponses ne transitent que chiffrées.',
  },
  en: {
    titrePage: 'Consultation',
    chargement: 'Opening the questionnaire…',
    lienInvalide: 'This link is incomplete. Open the exact link you received from the organisation, without changing it.',
    introuvable: 'This consultation does not exist or has been deleted.',
    illisible: 'This questionnaire cannot be opened with this link. Check that the link is complete.',
    reseau: 'Connection failed. Check your internet connection and try again.',
    reessayer: 'Try again',
    fermee: 'This consultation is closed. Thank you for your interest.',
    proposePar: 'Consultation · {organisation}',
    confidentialite: [
      'Your answers are encrypted on this device before they are sent. Only the organiser of the consultation can read them: neither the server nor RegenVox.',
      'No name, no address, no account. Only the date is recorded with your answers.',
      'The organiser will analyse all the answers, without your name, with an artificial intelligence tool of its choice. A group of fewer than 5 people never appears in published results.',
      'On the server, encrypted answers are deleted at the latest {jours} days after the closing date of {cloture}.',
    ],
    contact: 'A question? {contact}',
    formulationTitre: 'The proposed process',
    sectionVous: 'About you',
    sectionVousAide: 'These questions check that every part of the population is heard. All are optional.',
    preferePas: "I'd rather not say",
    sectionDemarche: 'Your view on the process',
    position: 'Does this process speak to you?',
    engagement: 'How far would you go?',
    format: 'If you took part, in what form?',
    avis: 'In one sentence, what do you think of this process?',
    freins: 'What could prevent you from taking part?',
    envie: 'What would make you want to take part more?',
    texteAide: "Don't write any names or contact details, yours or anyone else's.",
    sectionQuestions: "The organiser's questions",
    obligatoire: 'required',
    facultatif: 'optional',
    echellePeu: 'not at all',
    echelleTres: 'completely',
    plusieurs: 'Several answers possible.',
    manque: 'Please answer the required questions: {liste}.',
    envoyer: 'Send my answers',
    envoi: 'Encrypting and sending…',
    erreurEnvoi: 'Sending failed. Your answers are still here: try again in a moment.',
    tropDeDemandes: 'Too many answers sent from this network in a short time. Try again in an hour.',
    merciTitre: 'Thank you, your answers have been sent',
    merciTexte: 'The organiser will read them together with all the others. You can close this page.',
    dejaRepondu: 'An answer has already been sent from this device. If someone else uses the same device, they can answer in turn.',
    nouvelle: 'Someone else wants to answer on this device',
    pied: 'RegenVox questionnaire, free software by Régénère Plus. Answers only travel encrypted.',
  },
}

export function remplir(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, nom: string) => (nom in vars ? String(vars[nom]) : m))
}
