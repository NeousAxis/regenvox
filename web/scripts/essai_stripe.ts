// Essai du paiement des abonnements (web/public/api/stripe.php) avec de faux événements Stripe signés en local.
// Lancé par essai_stripe.sh. Aucun appel à Stripe ni à Anthropic.
// Vérifie : formules publiques, signature exigée (fausse, absente, trop vieille), paiement → code accepté par le
// relais (approfondi compris) et par la consultation réelle, événement rejoué, autre produit, paiement sans code,
// paiement différé, échéance qui prolonge, résiliation qui ferme, événement de l'autre mode, codes d'essai écartés
// une fois le mode réel choisi.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import { etatAbonnement } from "../../src/appels.js";

const [, , API, CONFIG, DONNEES] = process.argv;
const RELAIS = `${API}/ia.php`;
const STRIPE = `${API}/stripe.php`;
const CONSULTATION = `${API}/consultation.php`;
const SECRET = "whsec_essai_local";
const empreinte = (c: string) => createHash("sha256").update(c.replace(/\s+/g, "").toUpperCase()).digest("hex");
const ecrireConfig = (c: Record<string, unknown>) =>
  fs.writeFileSync(CONFIG, `<?php\nreturn json_decode(${JSON.stringify(JSON.stringify(c))}, true);\n`);
const jour = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
const dans = (jours: number) => jour(new Date(Date.now() + jours * 86400000));

const FORMULES = {
  mensuel: { nom: "Mensuel", prix: "CHF 49 par mois", lien: "https://buy.stripe.com/test_mensuel", payment_link: "plink_mensuel", plafond_usd: 25, periode: "mois", approfondi: true, duree_jours: 33 },
  essai: { nom: "Une consultation", prix: "CHF 90", lien: "https://buy.stripe.com/test_essai", payment_link: "plink_essai", plafond_usd: 12, periode: "total", approfondi: false, duree_jours: 90 },
  cachee: { nom: "Sans lien", lien: "http://exemple.ch/pas-stripe", payment_link: "plink_cachee" },
};
const base = (mode = "test") => ({
  anthropic_cle: "sk-essai",
  dossier: DONNEES,
  codes: [empreinte("CODE ADMI NESS AI22")],
  stripe: { mode, secrets: ["whsec_ancien", SECRET], formules: FORMULES },
});

let n = 0;
const evenement = (type: string, objet: Record<string, unknown>, livemode = false) => ({ id: `evt_${++n}_${Date.now()}`, type, livemode, data: { object: objet } });
async function envoyer(ev: unknown, { secret = SECRET, decalage = 0, signer = true } = {}) {
  const corps = JSON.stringify(ev);
  const t = Math.floor(Date.now() / 1000) - decalage;
  const sig = createHmac("sha256", secret).update(`${t}.${corps}`).digest("hex");
  const r = await fetch(STRIPE, { method: "POST", headers: { "Content-Type": "application/json", ...(signer ? { "Stripe-Signature": `t=${t},v1=${sig}` } : {}) }, body: corps });
  return { statut: r.status, json: await r.json() };
}
const session = (code: string | null, extra: Record<string, unknown> = {}) => ({
  id: `cs_test_${++n}`, object: "checkout.session", mode: "subscription", payment_status: "paid", status: "complete",
  payment_link: "plink_mensuel", client_reference_id: code === null ? null : empreinte(code), subscription: `sub_${n}`,
  customer_details: { email: "commune@example.ch", name: "Jeanne Exemple" },
  custom_fields: [{ key: "organisation", type: "text", text: { value: "Commune d'Essai" } }],
  ...extra,
});
const magasin = () => JSON.parse(fs.readFileSync(path.join(DONNEES, "stripe/abonnements.json"), "utf8"));
const refus = async (code: string) => {
  try {
    await etatAbonnement(RELAIS, code);
  } catch (e: any) {
    return e.relais ?? e.message;
  }
  return "accepte";
};
// Création d'une consultation : un code accepté passe le contrôle du code et bute ensuite sur l'identifiant manquant.
const creer = async (code: string) => (await (await fetch(`${CONSULTATION}?action=creer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })).json()).erreur;

// 1. Fermé sans réglages : formules vides, événements refusés.
ecrireConfig({});
let f = await (await fetch(`${STRIPE}?action=formules`)).json();
assert.equal(f.ok, true);
assert.equal(f.ouvert, false);
assert.deepEqual(f.formules, []);
assert.equal((await envoyer(evenement("checkout.session.completed", session("AAAA BBBB CCCC DDDD")))).statut, 503);

// 2. Formules publiques : seules celles qui ont un vrai lien Stripe, sans identifiant interne ni secret.
ecrireConfig(base());
f = await (await fetch(`${STRIPE}?action=formules`)).json();
assert.equal(f.ouvert, true);
assert.deepEqual(f.formules.map((x: any) => x.id), ["mensuel", "essai"]);
assert.ok(!JSON.stringify(f).includes("whsec"), "aucun secret dans les formules");
assert.ok(!JSON.stringify(f).includes("payment_link"), "aucun identifiant interne");

// 3. Signature exigée : absente, fausse, trop vieille, corps modifié.
const CODE = "MNPQ RSTV WXYZ 2345";
const ev1 = evenement("checkout.session.completed", session(CODE));
assert.equal((await envoyer(ev1, { signer: false })).statut, 400);
assert.equal((await envoyer(ev1, { secret: "whsec_faux" })).statut, 400);
assert.equal((await envoyer(ev1, { decalage: 600 })).statut, 400);
{
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", SECRET).update(`${t}.${JSON.stringify(ev1)}`).digest("hex");
  const triche = JSON.stringify({ ...ev1, livemode: false, data: { object: { ...ev1.data.object, client_reference_id: empreinte("TRIC HEUR 2345 6789") } } });
  const r = await fetch(STRIPE, { method: "POST", headers: { "Stripe-Signature": `t=${t},v1=${sig}` }, body: triche });
  assert.equal(r.status, 400, "corps modifié après signature");
}
assert.equal(await refus(CODE), "code", "rien n'est ouvert avant un événement signé");

// 4. Paiement : le code s'ouvre (relais, approfondi, consultation réelle), avec le nom de l'organisation.
let r = await envoyer(ev1);
assert.deepEqual([r.statut, r.json.resultat], [200, "abonnement_ouvert"]);
let etat = await etatAbonnement(RELAIS, CODE);
assert.equal(etat.nom, "Commune d'Essai");
assert.equal(etat.approfondi, true);
assert.equal(etat.periode, "mois");
assert.equal(etat.plafond_usd, 25);
assert.equal(etat.expire, dans(33));
assert.equal(await etatAbonnement(RELAIS, CODE.toLowerCase().replace(/ /g, "")).then((x) => x.nom), "Commune d'Essai", "code en minuscules sans espaces");
assert.equal(await creer(CODE), "id", "code payé accepté pour une consultation réelle");
assert.equal(await creer("ZZZZ ZZZZ ZZZZ ZZZZ"), "code", "code inconnu refusé");
assert.ok(!fs.readFileSync(path.join(DONNEES, "stripe/abonnements.json"), "utf8").includes("commune@example.ch"), "aucune adresse email gardée");
assert.ok(!fs.readFileSync(path.join(DONNEES, "stripe/abonnements.json"), "utf8").includes("MNPQ"), "aucun code en clair");

// 5. Le même événement rejoué (Stripe réessaie) ne change rien ; un autre paiement ne prend pas le code d'autrui.
assert.equal((await envoyer(ev1)).json.resultat, "deja_traite");
assert.equal((await envoyer(evenement("checkout.session.completed", session(CODE)))).json.resultat, "conflit");
assert.equal((await etatAbonnement(RELAIS, CODE)).nom, "Commune d'Essai");

// 6. Autre produit du même compte Stripe : ignoré. Paiement sans code : gardé à part, rien d'ouvert.
assert.equal((await envoyer(evenement("checkout.session.completed", session("AUTR EPRO DUIT 2345", { payment_link: "plink_ai_visionary" })))).json.resultat, "autre_produit");
assert.equal(await refus("AUTR EPRO DUIT 2345"), "code");
assert.equal((await envoyer(evenement("checkout.session.completed", session(null)))).json.resultat, "sans_code");
assert.equal(magasin().orphelins.length, 1);

// 7. Paiement différé : rien tant qu'il n'est pas encaissé, puis ouvert. Formule unique : crédit total, sans approfondi.
const DIFF = "DIFF EREX 2345 6789";
const sd = session(DIFF, { payment_status: "unpaid", payment_link: "plink_essai", mode: "payment", subscription: null });
assert.equal((await envoyer(evenement("checkout.session.completed", sd))).json.resultat, "paiement_en_attente");
assert.equal(await refus(DIFF), "code");
assert.equal((await envoyer(evenement("checkout.session.async_payment_succeeded", { ...sd, payment_status: "paid" }))).json.resultat, "abonnement_ouvert");
etat = await etatAbonnement(RELAIS, DIFF);
assert.deepEqual([etat.approfondi, etat.periode, etat.plafond_usd, etat.expire], [false, "total", 12, dans(90)]);

// 8. Échéance payée : prolonge jusqu'à la fin de la période, plus 3 jours. Format de facture ancien et récent.
const sub = magasin().abonnements[empreinte(CODE)].subscription;
const fin = Math.floor(Date.now() / 1000) + 70 * 86400;
r = await envoyer(evenement("invoice.paid", { id: "in_1", subscription: sub, lines: { data: [{ period: { start: 0, end: fin } }] } }));
assert.equal(r.json.resultat, "abonnement_prolonge");
assert.equal((await etatAbonnement(RELAIS, CODE)).expire, jour(new Date((fin + 3 * 86400) * 1000)));
const fin2 = fin + 31 * 86400;
r = await envoyer(evenement("invoice.paid", { id: "in_2", parent: { subscription_details: { subscription: sub } }, lines: { data: [{ period: { end: fin2 } }] } }));
assert.equal((await etatAbonnement(RELAIS, CODE)).expire, jour(new Date((fin2 + 3 * 86400) * 1000)));

// 9. Facture arrivée avant la fin du paiement (ordre non garanti chez Stripe) : l'échéance est reprise ensuite.
const AVANT = "AVAN TFAC TURE 2345";
const sa = session(AVANT);
const fin3 = Math.floor(Date.now() / 1000) + 45 * 86400;
assert.equal((await envoyer(evenement("invoice.paid", { subscription: sa.subscription, lines: { data: [{ period: { end: fin3 } }] } }))).json.resultat, "echeance_notee");
await envoyer(evenement("checkout.session.completed", sa));
assert.equal((await etatAbonnement(RELAIS, AVANT)).expire, jour(new Date((fin3 + 3 * 86400) * 1000)));

// 10. Résiliation : le code est refusé dès le lendemain d'hier, pour le relais comme pour la consultation.
assert.equal((await envoyer(evenement("customer.subscription.deleted", { id: sub, object: "subscription", status: "canceled" }))).json.resultat, "abonnement_ferme");
assert.equal(await refus(CODE), "expire");
assert.equal(await creer(CODE), "code");
assert.equal((await envoyer(evenement("invoice.paid", { subscription: "sub_inconnu", lines: { data: [{ period: { end: fin } }] } }))).json.resultat, "echeance_notee");

// 11. Événement de l'autre mode : reçu sans rien changer. Passage au mode réel : les codes d'essai ne valent plus.
const LIVE = "LIVE MODE 2345 6789";
assert.equal((await envoyer(evenement("checkout.session.completed", session(LIVE), true))).json.resultat, "autre_mode");
assert.equal(await refus(LIVE), "code");
ecrireConfig(base("live"));
assert.equal(await refus(DIFF), "code", "code payé en mode test refusé en mode réel");
assert.equal((await envoyer(evenement("checkout.session.completed", session(LIVE), true))).json.resultat, "abonnement_ouvert");
assert.equal((await etatAbonnement(RELAIS, LIVE)).nom, "Commune d'Essai");

// 12. Le relais reste fermé aux codes quand il n'y a ni abonnement écrit ni abonnement payé.
fs.rmSync(path.join(DONNEES, "stripe"), { recursive: true, force: true });
ecrireConfig({ anthropic_cle: "sk-essai", dossier: DONNEES });
assert.equal(await refus(LIVE), "ferme");

console.log("essai stripe OK : 12 étapes");
