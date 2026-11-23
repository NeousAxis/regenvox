// Essai du relais des abonnements (web/public/api/ia.php) contre un faux fournisseur Anthropic, sans clé ni appel payant.
// Lancé par essai_relais.sh, qui démarre le serveur PHP avec la configuration écrite ici.
// Vérifie : relais fermé par défaut, codes, requête identique à appelAnthropic, nouvelles tentatives, refus,
// plafond, réservations sous appels simultanés, aucun texte gardé, code d'abonnement valable pour la consultation.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";
import { appelRelais, etatAbonnement, type Requete } from "../../src/appels.js";

const [, , RELAIS, CONFIG, DONNEES, PORT_FAUX] = process.argv;
const CONSULTATION = RELAIS.replace(/ia\.php$/, "consultation.php");
const empreinte = (c: string) => createHash("sha256").update(c.replace(/\s+/g, "").toUpperCase()).digest("hex");
const CODE = "ABCD EFGH JKMN PQRS";
const PETIT = "PETI TPLA FOND 2345";
const SIMUL = "SIMU LTAN ESXX 2345";
const CONSULT = "CONS ULTA TION 2345";
const ecrireConfig = (c: Record<string, unknown>) =>
  fs.writeFileSync(CONFIG, `<?php\nreturn json_decode(${JSON.stringify(JSON.stringify(c))}, true);\n`);

// Faux fournisseur : garde chaque requête reçue et répond selon le texte de la requête.
const recues: { url: string; entetes: http.IncomingHttpHeaders; corps: any }[] = [];
let refuser429 = 1;
let enVol = 0;
let maxEnVol = 0;
const faux = http.createServer((req, res) => {
  let brut = "";
  req.on("data", (d) => (brut += d));
  req.on("end", async () => {
    const corps = JSON.parse(brut);
    recues.push({ url: req.url ?? "", entetes: req.headers, corps });
    const user: string = corps.messages[0].content;
    const repondre = (statut: number, json: unknown) => {
      res.writeHead(statut, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (user.includes("[429]") && refuser429-- > 0) return repondre(429, { type: "error", error: { type: "rate_limit_error", message: "trop" } });
    if (user.includes("[lent]")) {
      maxEnVol = Math.max(maxEnVol, ++enVol);
      await new Promise((ok) => setTimeout(ok, 1500));
      enVol--;
    }
    if (user.includes("[refus]")) return repondre(200, { model: corps.model, stop_reason: "refusal", stop_details: { category: "cyber" }, content: [], usage: { input_tokens: 10, output_tokens: 0 } });
    repondre(200, { model: corps.model, stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: `{"ok":"${corps.model}"}` }], usage: { input_tokens: 1000, output_tokens: 500 } });
  });
});
await new Promise<void>((ok) => faux.listen(Number(PORT_FAUX), "127.0.0.1", ok));

const req = (model: Requete["model"], user: string): Requete => ({ step: "essai", item: "x", model, attempt: 1, system: "Consigne système d'essai.", user, response_path: "" });
const echoue = async (f: Promise<unknown>) => {
  try {
    await f;
  } catch (e: any) {
    return e;
  }
  assert.fail("une erreur était attendue");
};

try {
  // 1. Fermé par défaut : sans clé ni abonnements, tout est refusé.
  ecrireConfig({});
  let e = await echoue(etatAbonnement(RELAIS, CODE));
  assert.equal(e.relais, "ferme");
  ecrireConfig({ anthropic_cle: "sk-essai", abonnements: {} });
  assert.equal((await echoue(etatAbonnement(RELAIS, CODE))).relais, "ferme");

  ecrireConfig({
    anthropic_cle: "sk-essai",
    anthropic_url: `http://127.0.0.1:${PORT_FAUX}`,
    dossier: DONNEES,
    codes: [empreinte(CONSULT)],
    abonnements: {
      [empreinte(CODE)]: { nom: "Commune d'essai", plafond_usd: 1, periode: "mois", approfondi: true },
      [empreinte(PETIT)]: { nom: "Essai épuisé", plafond_usd: 0.001, periode: "total" },
      [empreinte(SIMUL)]: { nom: "Appels simultanés", plafond_usd: 0.02, periode: "total" },
      [empreinte("EXPI REEX PIRE 2345")]: { nom: "Expiré", plafond_usd: 5, expire: "2020-01-01" },
    },
  });

  // 2. Codes : inconnu, expiré, valable (avec ou sans espaces, en minuscules).
  assert.equal((await echoue(etatAbonnement(RELAIS, "XXXX XXXX XXXX XXXX"))).relais, "code");
  assert.equal((await echoue(etatAbonnement(RELAIS, "EXPI REEX PIRE 2345"))).relais, "expire");
  const etat0 = await etatAbonnement(RELAIS, CODE.toLowerCase().replace(/ /g, ""));
  assert.deepEqual([etat0.nom, etat0.approfondi, etat0.restant_usd, etat0.periode], ["Commune d'essai", true, 1, "mois"]);

  // 3. Requête Opus identique à appelAnthropic, coût décompté.
  const r1 = await appelRelais(RELAIS, CODE, req("opus", "Bonjour opus."));
  assert.equal(r1.texte, '{"ok":"claude-opus-5-5"}');
  assert.deepEqual([r1.tokens_entree, r1.tokens_sortie, r1.modele], [1000, 500, "claude-opus-5-5"]);
  const q1 = recues.at(-1)!;
  assert.equal(q1.url, "/v1/messages?beta=true");
  assert.equal(q1.entetes["x-api-key"], "sk-essai");
  assert.equal(q1.entetes["anthropic-version"], "2026-10-21");
  assert.equal(q1.entetes["anthropic-beta"], "server-side-fallback-2026-07-01");
  assert.deepEqual(q1.corps, { model: "claude-opus-5-5", max_tokens: 16000, output_config: { effort: "high" }, system: "Consigne système d'essai.", messages: [{ role: "user", content: "Bonjour opus." }], fallbacks: "default" });
  const etat1 = await etatAbonnement(RELAIS, CODE);
  assert.equal(etat1.restant_usd, Math.round((1 - (1000 * 4 + 500 * 20) / 1e6) * 100) / 100);

  // 4. Haiku : réflexion faible, pas de repli.
  await appelRelais(RELAIS, CODE, req("haiku", "Bonjour haiku."));
  const q2 = recues.at(-1)!;
  assert.equal(q2.entetes["anthropic-beta"], undefined);
  assert.deepEqual(q2.corps, { model: "claude-haiku-5-5", max_tokens: 16000, output_config: { effort: "low" }, system: "Consigne système d'essai.", messages: [{ role: "user", content: "Bonjour haiku." }] });

  // 4 bis. Limite de réponse : 48000 seulement pour les analyses d'un abonnement approfondi.
  await appelRelais(RELAIS, CODE, { ...req("opus", "Analyse approfondie."), max_tokens: 48000 });
  assert.equal(recues.at(-1)!.corps.max_tokens, 48000);
  assert.equal((await echoue(appelRelais(RELAIS, CODE, { ...req("haiku", "Habitant."), max_tokens: 48000 }))).status, 400);
  assert.equal((await echoue(appelRelais(RELAIS, CODE, { ...req("opus", "Autre limite."), max_tokens: 99999 }))).status, 400);
  assert.equal((await echoue(appelRelais(RELAIS, PETIT, { ...req("opus", "Sans approfondi."), max_tokens: 48000 }))).status, 400);

  // 5. Surcharge passagère du fournisseur : le client réessaie et aboutit.
  const avant429 = recues.length;
  const r429 = await appelRelais(RELAIS, CODE, req("sonnet", "Avec [429] une fois."));
  assert.equal(r429.modele, "claude-sonnet-5-5");
  assert.equal(recues.length - avant429, 2);

  // 6. Refus du modèle : même erreur que appelAnthropic.
  assert.match((await echoue(appelRelais(RELAIS, CODE, req("opus", "[refus]")))).message, /^refus du modèle \(cyber\)$/);

  // 7. Plafond atteint : refus sans appel au fournisseur et sans nouvelle tentative.
  const avantPlafond = recues.length;
  e = await echoue(appelRelais(RELAIS, PETIT, req("haiku", "Trop cher.")));
  assert.deepEqual([e.status, e.relais], [402, "plafond"]);
  assert.equal(recues.length, avantPlafond);

  // 8. Appels simultanés : les réservations empêchent de dépasser ensemble le plafond (0,02 $ : deux appels Haiku au pire
  // en vol à la fois). Un appel terminé libère sa réservation : un appel arrivé ensuite peut passer, sans dépasser le plafond.
  const avantSimul = recues.length;
  const lot = await Promise.allSettled(Array.from({ length: 6 }, () => appelRelais(RELAIS, SIMUL, req("haiku", "[lent] Appel simultané."))));
  const acceptes = lot.filter((x) => x.status === "fulfilled").length;
  assert.ok(maxEnVol <= 2, `appels en vol en même temps : ${maxEnVol}`);
  assert.ok(acceptes >= 2 && acceptes < 6, `appels simultanés acceptés : ${acceptes}`);
  assert.ok(lot.filter((x) => x.status === "rejected").every((x: any) => x.reason.relais === "plafond"));
  assert.equal(recues.length - avantSimul, acceptes);

  // 9. Aucun texte gardé : les comptes ne contiennent que des totaux.
  const comptes = fs.readdirSync(path.join(DONNEES, "abonnements")).filter((f) => f.endsWith(".json"));
  assert.ok(comptes.length >= 3);
  for (const f of comptes) {
    const t = fs.readFileSync(path.join(DONNEES, "abonnements", f), "utf8");
    assert.ok(!/Bonjour|Consigne|simultané|Trop cher/.test(t), `texte gardé dans ${f}`);
    assert.ok(!t.includes("sk-essai"));
  }
  const compte = JSON.parse(fs.readFileSync(path.join(DONNEES, "abonnements", `${empreinte(SIMUL)}.json`), "utf8"));
  assert.equal(Object.keys(compte.reservations).length, 0, "réservation non libérée");

  // 10. Consultation réelle : un code d'abonnement vaut code d'accès quand la liste « codes » n'est pas vide.
  const creer = (code: string) => fetch(`${CONSULTATION}?action=creer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).then((r) => r.json());
  assert.equal((await creer("NIMP ORTE QUOI 2345")).erreur, "code");
  assert.equal((await creer(CODE)).erreur, "id"); // code accepté : la requête échoue plus loin, faute de consultation
  assert.equal((await creer(CONSULT)).erreur, "id");
  assert.equal((await creer("EXPI REEX PIRE 2345")).erreur, "code"); // abonnement expiré : plus de consultation

  console.log(`essai relais OK (${recues.length} requêtes reçues par le faux fournisseur)`);
} finally {
  faux.close();
}
