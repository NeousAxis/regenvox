// Rapport d'une consultation réelle : la synthèse, les chiffres comparés à la simulation, puis toutes les données
// brutes rendues anonymes. Un seul document, autonome, à imprimer ou à enregistrer en PDF.
import { LIBELLES, RACINES, libelleValeur } from './libelles'
import { MASQUE, SEUIL_ANONYMAT, publier, versCsv } from './analyse'
import type { Analyse, LigneAnonyme, LigneComptage } from './analyse'
import type { CleCategorie, Questionnaire, RepereSimulation, Synthese } from './types'

const echapper = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
const paragraphes = (s: string) => s.split(/\n{2,}|\n/).filter((x) => x.trim()).map((x) => `<p>${echapper(x)}</p>`).join('')

interface Entree {
  q: Questionnaire
  sim?: RepereSimulation
  analyse: Analyse
  synthese?: Synthese
  lignes: LigneAnonyme[]
  cases_masquees: number
  modele?: string
}

const T = {
  fr: {
    consultation: 'Consultation',
    reponses: (n: number) => `${n} réponse${n > 1 ? 's' : ''}`,
    date: (iso: string) => iso.split('-').reverse().join('.'),
    du: 'Rapport établi le',
    cloture: 'clôture le',
    formulation: 'Formulation présentée',
    synthese: 'Synthèse',
    pasDeSynthese: "La synthèse rédigée n'a pas encore été faite. Les chiffres et les données ci-dessous sont complets.",
    accueil: 'Accueil de la démarche',
    accueilAide: 'Réponse à « Cette démarche vous parle-t-elle ? », comparée au panel simulé pour la même formulation.',
    reel: 'Réponses réelles',
    simule: 'Panel simulé',
    personnes: 'personnes',
    score: 'Score moyen de soutien, de −3 (opposition) à 3 (porteur)',
    engagement: "Jusqu'où les personnes iraient",
    formats: 'Format préféré',
    qui: 'Qui a répondu',
    quiAide: `Comparé à la population estimée par le panel. Les groupes de moins de ${SEUIL_ANONYMAT} personnes et les personnes sans réponse sont réunis dans une même ligne, d'au moins ${SEUIL_ANONYMAT} personnes, pour qu'aucun petit groupe ne puisse être déduit.`,
    autres: (noms: string[], sans: boolean) => `Réunis : ${[...noms, ...(sans ? ['sans réponse'] : [])].join(', ')}`,
    population: 'Population',
    moinsDe: `moins de ${SEUIL_ANONYMAT}`,
    sansReponse: 'Sans réponse',
    personneNaRepondu: "Personne n'a répondu à cette question : on ne sait rien de cette catégorie.",
    parCategorie: 'Soutien par catégorie, réel et simulé',
    parCategorieAide: `Score moyen de soutien. Les groupes de moins de ${SEUIL_ANONYMAT} personnes sont réunis, de la même manière.`,
    questions: "Réponses aux questions de l'organisateur",
    moyenne: 'Moyenne',
    repondants: 'répondants',
    libres: 'Les réponses libres figurent en annexe.',
    lecture: 'Lecture détaillée',
    segments: 'Groupes et objections',
    freins: 'Ce qui retient de participer',
    themes: 'Thèmes des réponses libres',
    ecarts: 'Écarts avec la simulation',
    surprises: 'Surprises',
    critique: 'Relecture critique',
    methode: 'Méthode et limites',
    methodeTexte: (e: Entree) => [
      "Les réponses ont été chiffrées dans le téléphone ou l'ordinateur de chaque personne, pour la seule clé de l'organisateur. Le serveur de collecte ne pouvait pas les lire. Elles ont été déchiffrées sur l'appareil de l'organisateur.",
      `Aucun nom ni aucune adresse n'est demandé. Les données brutes en annexe sont anonymes : toute combinaison de catégories y est partagée par au moins ${SEUIL_ANONYMAT} personnes, sinon la catégorie est masquée (${MASQUE}). ${e.cases_masquees} cases ont été masquées. Les adresses, liens et numéros de téléphone écrits dans les textes libres ont été retirés. Les lignes sont mélangées : leur ordre ne dit rien de l'ordre d'arrivée.`,
      "Les personnes qui répondent à une consultation ne sont pas tirées au hasard : celles qui se sentent concernées répondent davantage. Les chiffres décrivent les personnes qui ont répondu, pas toute la population.",
      e.sim ? `La comparaison porte sur le panel simulé de la prospective RegenVox (${e.sim.taille_panel} habitants simulés, pondérés comme la population), pour la même formulation.` : '',
      e.synthese && e.modele ? `La synthèse a été rédigée par une IA${e.modele ? ` (${e.modele})` : ''} avec la clé de l'organisateur, à partir des seules données anonymes. Chaque citation a été vérifiée mot pour mot dans les réponses.` : '',
    ],
    annexe: 'Annexe : données brutes anonymes',
    annexeAide: (n: number) => `${n} lignes, une par personne.`,
    numero: 'N°',
    position: 'Position',
    eng: 'Engagement',
    format: 'Format',
    avis: 'Avis',
    retient: 'Ce qui retient',
    ferait: 'Ce qui ferait venir',
    racine: 'racine',
    levier: 'Levier',
    source: 'réponse',
    pied: 'Rapport produit par RegenVox (regenvox.xyz), logiciel libre de Régénère Plus.',
  },
  en: {
    consultation: 'Consultation',
    reponses: (n: number) => `${n} answer${n > 1 ? 's' : ''}`,
    date: (iso: string) => iso.split('-').reverse().join('/'),
    du: 'Report produced on',
    cloture: 'closing on',
    formulation: 'Wording presented',
    synthese: 'Summary',
    pasDeSynthese: 'The written summary has not been produced yet. The figures and data below are complete.',
    accueil: 'Reception of the process',
    accueilAide: 'Answer to “Does this process speak to you?”, compared with the simulated panel for the same wording.',
    reel: 'Real answers',
    simule: 'Simulated panel',
    personnes: 'people',
    score: 'Average support score, from −3 (opposed) to 3 (champion)',
    engagement: 'How far people would go',
    formats: 'Preferred format',
    qui: 'Who answered',
    quiAide: `Compared with the population estimated by the panel. Groups of fewer than ${SEUIL_ANONYMAT} people and people who did not answer are combined in a single row of at least ${SEUIL_ANONYMAT} people, so that no small group can be deduced.`,
    autres: (noms: string[], sans: boolean) => `Combined: ${[...noms, ...(sans ? ['no answer'] : [])].join(', ')}`,
    population: 'Population',
    moinsDe: `fewer than ${SEUIL_ANONYMAT}`,
    sansReponse: 'No answer',
    personneNaRepondu: 'Nobody answered this question: nothing is known about this category.',
    parCategorie: 'Support by category, real and simulated',
    parCategorieAide: `Average support score. Groups of fewer than ${SEUIL_ANONYMAT} people are combined in the same way.`,
    questions: "Answers to the organiser's questions",
    moyenne: 'Average',
    repondants: 'respondents',
    libres: 'Open answers are in the appendix.',
    lecture: 'Detailed reading',
    segments: 'Groups and objections',
    freins: 'What holds people back',
    themes: 'Themes of the open answers',
    ecarts: 'Gaps with the simulation',
    surprises: 'Surprises',
    critique: 'Critical review',
    methode: 'Method and limits',
    methodeTexte: (e: Entree) => [
      "Answers were encrypted on each person's phone or computer, for the organiser's key only. The collection server could not read them. They were decrypted on the organiser's device.",
      `No name or address is asked. The raw data in the appendix is anonymous: every combination of categories is shared by at least ${SEUIL_ANONYMAT} people, otherwise the category is hidden (${MASQUE}). ${e.cases_masquees} cells were hidden. Addresses, links and phone numbers written in open answers were removed. Rows are shuffled: their order says nothing about the order of arrival.`,
      'People who answer a consultation are not drawn at random: those who feel concerned answer more. The figures describe the people who answered, not the whole population.',
      e.sim ? `The comparison uses the simulated panel of the RegenVox foresight (${e.sim.taille_panel} simulated residents, weighted like the population), for the same wording.` : '',
      e.synthese && e.modele ? `The summary was written by an AI${e.modele ? ` (${e.modele})` : ''} with the organiser's key, from the anonymous data only. Every quotation was checked word for word against the answers.` : '',
    ],
    annexe: 'Appendix: anonymous raw data',
    annexeAide: (n: number) => `${n} rows, one per person.`,
    numero: 'No.',
    position: 'Position',
    eng: 'Engagement',
    format: 'Format',
    avis: 'Opinion',
    retient: 'What holds back',
    ferait: 'What would bring them',
    racine: 'root',
    levier: 'Lever',
    source: 'answer',
    pied: 'Report produced by RegenVox (regenvox.xyz), free software by Régénère Plus.',
  },
}

const pct = (x?: number) => (x === undefined || Number.isNaN(x) ? '' : `${Math.round(x * 100)} %`)
const score = (x: number | null | undefined) => (x === null || x === undefined ? '' : x.toFixed(2).replace('.', ','))

function barres(lignes: LigneComptage[], libelle: (o: string) => string, avecSimule: boolean, t: (typeof T)['fr']): string {
  return `<table class="barres"><thead><tr><th></th><th>${t.reel}</th>${avecSimule ? `<th>${t.simule}</th>` : ''}</tr></thead><tbody>${lignes
    .map(
      (l) => `<tr><th scope="row">${echapper(libelle(l.option))}</th><td><div class="barre"><span style="width:${Math.round(l.part * 100)}%"></span></div><span class="chiffre">${pct(l.part)} (${l.n})</span></td>${
        avecSimule ? `<td><div class="barre sim"><span style="width:${Math.round((l.part_reference ?? 0) * 100)}%"></span></div><span class="chiffre">${pct(l.part_reference)}</span></td>` : ''
      }</tr>`,
    )
    .join('')}</tbody></table>`
}

export function rapportConsultation(e: Entree): string {
  const { q, sim, analyse: a, synthese: s, lignes } = e
  const L = LIBELLES[q.langue]
  const t = T[q.langue]
  const date = new Date().toLocaleDateString(q.langue === 'fr' ? 'fr-CH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const citer = (x: string) => (q.langue === 'fr' ? `«\u00a0${echapper(x)}\u00a0»` : `“${echapper(x)}”`)
  const parId = new Map(q.questions.map((x) => [x.id, x]))

  // Tableaux par catégorie : seulement la vue publiable, où les petits groupes sont réunis (voir publier).
  const publiees = publier(a)
  const nomLigne = (cle: CleCategorie, l: { options: string[]; autres: boolean }) =>
    l.autres ? t.autres(l.options.filter(Boolean).map((o) => libelleValeur(q.langue, cle, o)), l.options.includes('')) : libelleValeur(q.langue, cle, l.options[0])
  const qui = publiees
    .map((c) => {
      if (a.n > 0 && a.categories.find((x) => x.cle === c.cle)?.sans_reponse === a.n) {
        return `<h3>${echapper(L.categorieCourt[c.cle])}</h3><p class="discret">${t.personneNaRepondu}</p>`
      }
      const lignesC = c.lignes
        .map((l) => `<tr${l.autres ? ' class="discret"' : ''}><th scope="row">${echapper(nomLigne(c.cle, l))}</th><td>${l.n}</td><td>${pct(l.part)}</td><td>${pct(l.part_reference)}</td></tr>`)
        .join('')
      return `<h3>${echapper(L.categorieCourt[c.cle])}</h3><table><thead><tr><th></th><th>${t.personnes}</th><th>%</th><th>${t.population}</th></tr></thead><tbody>${lignesC}</tbody></table>`
    })
    .join('')

  const parCategorie = publiees
    .map((c) => {
      if (!c.scores.length) return ''
      return `<h3>${echapper(L.categorieCourt[c.cle])}</h3><table><thead><tr><th></th><th>${t.personnes}</th><th>${t.reel}</th>${sim ? `<th>${t.simule}</th>` : ''}</tr></thead><tbody>${c.scores
        .map((l) => `<tr${l.autres ? ' class="discret"' : ''}><th scope="row">${echapper(nomLigne(c.cle, l))}</th><td>${l.n}</td><td>${score(l.reel)}</td>${sim ? `<td>${score(l.simule)}</td>` : ''}</tr>`)
        .join('')}</tbody></table>`
    })
    .join('')

  const questions = a.questions
    .map((qu) => {
      let corps = ''
      if (qu.options) corps = barres(qu.options, (o) => o, false, t)
      else if (qu.distribution) corps = `${barres(qu.distribution.map((n, i) => ({ option: String(i + 1), n, part: qu.n ? n / qu.n : 0 })), (o) => o, false, t)}<p>${t.moyenne} : ${qu.moyenne === undefined ? '' : qu.moyenne.toFixed(1).replace('.', ',')}</p>`
      else corps = `<p class="discret">${t.libres}</p>`
      return `<h3>${echapper(qu.intitule)}</h3><p class="discret">${qu.n} ${t.repondants}</p>${corps}`
    })
    .join('')

  const lecture = s
    ? `<h2>${t.lecture}</h2>
<h3>${t.segments}</h3>${s.lecture.segments
        .map((g) => `<div class="carte"><p class="titre-carte">${echapper(g.nom)} <span class="discret">(${echapper(L.positionCourt[g.position_dominante])}, ${t.racine} ${echapper(RACINES[q.langue][g.racine] ?? g.racine)})</span></p><blockquote>${citer(g.objection_citee)} <span class="discret">${t.source} ${echapper(g.reponse_source)}</span></blockquote><p><strong>${t.levier} :</strong> ${echapper(g.levier)}</p></div>`)
        .join('')}
${s.lecture.freins_participation.length ? `<h3>${t.freins}</h3><ul>${s.lecture.freins_participation.map((f) => `<li>${echapper(f.frein)} (${f.nombre}). <em>${echapper(f.levier)}</em></li>`).join('')}</ul>` : ''}
${s.lecture.themes.filter((x) => x.themes.length).map((th) => `<h3>${t.themes} : ${echapper(parId.get(th.question_id)?.intitule ?? th.question_id)}</h3><ul>${th.themes.map((x) => `<li><strong>${echapper(x.theme)}</strong> (${x.nombre})${q.langue === 'fr' ? '\u00a0:' : ':'} ${citer(x.citation)}</li>`).join('')}</ul>`).join('')}
${s.lecture.ecarts_avec_simulation.length ? `<h3>${t.ecarts}</h3><ul>${s.lecture.ecarts_avec_simulation.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul>` : ''}
${s.lecture.surprises.length ? `<h3>${t.surprises}</h3><ul>${s.lecture.surprises.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul>` : ''}
<h2>${t.critique}</h2>${s.critique.attaques.map((x) => `<div class="carte"><p>${echapper(x.critique)}</p><p class="discret">${echapper(x.impact)}</p></div>`).join('')}<ul>${s.critique.notes_pour_rapport.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul>`
    : ''

  const colonnesQ = q.questions
  const annexe = `<table class="donnees"><thead><tr><th>${t.numero}</th>${q.categories.map((c) => `<th>${echapper(L.categorieCourt[c.cle])}</th>`).join('')}<th>${t.position}</th><th>${t.eng}</th><th>${t.format}</th><th>${t.avis}</th><th>${t.retient}</th><th>${t.ferait}</th>${colonnesQ.map((x) => `<th>${echapper(x.intitule)}</th>`).join('')}</tr></thead><tbody>${lignes
    .map(
      (l) => `<tr><td>${l.numero}</td>${q.categories
        .map((c) => {
          const v = l.categories[c.cle] ?? ''
          return `<td>${v === MASQUE ? MASQUE : v ? echapper(libelleValeur(q.langue, c.cle, v)) : ''}</td>`
        })
        .join('')}<td>${l.position ? echapper(L.positionCourt[l.position]) : ''}</td><td>${l.engagement !== undefined ? echapper(L.engagementCourt[l.engagement]) : ''}</td><td>${l.format ? echapper(L.formatCourt[l.format]) : ''}</td><td>${echapper(l.avis)}</td><td>${echapper(l.freins)}</td><td>${echapper(l.envie)}</td>${colonnesQ.map((x) => `<td>${echapper(l.reponses[x.id])}</td>`).join('')}</tr>`,
    )
    .join('')}</tbody></table>`

  return `<!DOCTYPE html>
<html lang="${q.langue}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(s?.redaction.titre ?? q.titre)}</title>
<style>
body { font-family: Georgia, serif; color: #1A2332; max-width: 52rem; margin: 0 auto; padding: 2rem 1rem; line-height: 1.6; }
h1 { font-size: 1.9rem; line-height: 1.25; margin: 0 0 0.5rem; }
h2 { font-size: 1.35rem; margin-top: 2.5rem; color: #2A6D8A; border-bottom: 1px solid #E0E7EB; padding-bottom: 0.3rem; }
h3 { font-size: 1.05rem; margin: 1.5rem 0 0.5rem; }
p, li, td, th, blockquote { font-size: 0.98rem; }
.discret { color: #4A5868; font-size: 0.9rem; }
.entete { font-family: system-ui, sans-serif; color: #4A5868; }
.formulation { background: #F2F6F8; border-left: 4px solid #3C8EB4; padding: 0.8rem 1rem; font-style: italic; }
table { border-collapse: collapse; width: 100%; font-family: system-ui, sans-serif; font-size: 0.9rem; margin: 0.5rem 0 1rem; }
th, td { text-align: left; vertical-align: top; padding: 0.35rem 0.5rem; border-bottom: 1px solid #E0E7EB; }
thead th { font-weight: 600; color: #2D3A4A; }
tbody th { font-weight: 500; width: 38%; }
.barres td { width: 31%; }
.barre { display: inline-block; width: 60%; height: 0.7rem; background: #E0E7EB; border-radius: 4px; vertical-align: middle; overflow: hidden; }
.barre span { display: block; height: 100%; background: #2A6D8A; }
.barre.sim span { background: #A7CFE2; }
.chiffre { margin-left: 0.4rem; white-space: nowrap; }
.carte { border: 1px solid #E0E7EB; border-radius: 10px; padding: 0.8rem 1rem; margin: 0.6rem 0; }
.titre-carte { font-weight: 600; margin: 0 0 0.3rem; }
blockquote { margin: 0.3rem 0; padding-left: 0.8rem; border-left: 3px solid #E2BAA7; }
.donnees { font-size: 0.75rem; }
.donnees td, .donnees th { padding: 0.25rem 0.3rem; }
.annexe { overflow-x: auto; }
footer { margin-top: 3rem; font-family: system-ui, sans-serif; font-size: 0.8rem; color: #4A5868; }
@media print { body { max-width: none; } h2 { break-after: avoid; } .carte, tr { break-inside: avoid; } .annexe { overflow: visible; } }
</style>
</head>
<body>
<p class="entete">${t.consultation} · ${echapper(q.organisation.nom)} · ${t.reponses(a.n)} · ${t.cloture} ${echapper(t.date(q.cloture_le))} · ${t.du} ${date}</p>
<h1>${echapper(s?.redaction.titre ?? q.titre)}</h1>
<p class="formulation">${t.formulation}${q.langue === 'fr' ? '\u00a0:' : ':'} ${citer(q.formulation)}</p>

<h2>${t.synthese}</h2>
${s ? `${paragraphes(s.redaction.synthese)}${s.redaction.sections.map((x) => `<h3>${echapper(x.titre)}</h3>${paragraphes(x.contenu)}`).join('')}` : `<p>${t.pasDeSynthese}</p>`}

<h2>${t.accueil}</h2>
<p class="discret">${t.accueilAide} ${a.n_position} ${t.repondants}.</p>
${barres(a.positions, (o) => L.position[o as keyof typeof L.position], !!sim, t)}
<p>${t.score} : <strong>${score(a.score_reel)}</strong>${sim ? ` (${t.simule.toLowerCase()} : ${score(a.score_simule)})` : ''}</p>
<h3>${t.engagement}</h3>
${barres(a.engagement, (o) => L.engagement[Number(o)], !!sim, t)}
<h3>${t.formats}</h3>
${barres(a.formats, (o) => L.formatCourt[o as keyof typeof L.formatCourt], !!sim && Object.keys(sim.formats).length > 0, t)}

<h2>${t.qui}</h2>
<p class="discret">${t.quiAide}</p>
${qui}
${parCategorie ? `<h2>${t.parCategorie}</h2><p class="discret">${t.parCategorieAide}</p>${parCategorie}` : ''}

${q.questions.length ? `<h2>${t.questions}</h2>${questions}` : ''}

${lecture}

<h2>${t.methode}</h2>
${t.methodeTexte(e).filter(Boolean).map((x) => `<p>${echapper(x)}</p>`).join('')}

<h2>${t.annexe}</h2>
<p class="discret">${t.annexeAide(lignes.length)}</p>
<div class="annexe">${annexe}</div>
<footer>${t.pied}</footer>
</body>
</html>`
}

// Les mêmes données anonymes en CSV, avec les libellés du rapport.
export function csvConsultation(q: Questionnaire, lignes: LigneAnonyme[]): string {
  const L = LIBELLES[q.langue]
  const t = T[q.langue]
  const entetes = [t.numero, ...q.categories.map((c) => L.categorieCourt[c.cle]), t.position, t.eng, t.format, t.avis, t.retient, t.ferait, ...q.questions.map((x) => x.intitule)]
  const corps = lignes.map((l) => [
    l.numero,
    ...q.categories.map((c) => {
      const v = l.categories[c.cle] ?? ''
      return v === MASQUE ? MASQUE : v ? libelleValeur(q.langue, c.cle, v) : ''
    }),
    l.position ? L.positionCourt[l.position] : '',
    l.engagement !== undefined ? L.engagementCourt[l.engagement] : '',
    l.format ? L.formatCourt[l.format] : '',
    l.avis ?? '',
    l.freins ?? '',
    l.envie ?? '',
    ...q.questions.map((x) => l.reponses[x.id] ?? ''),
  ])
  return versCsv(entetes, corps)
}
