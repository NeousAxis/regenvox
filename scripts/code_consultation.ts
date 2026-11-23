// Crée un code d'abonnement (tests par le relais IA et consultations réelles) ou un code de consultation seule
// (gratuité pour une école). Le code est à donner à l'organisation ; seule son empreinte va dans le config.php du
// serveur : liste « abonnements » (avec ses réglages) ou liste « codes » (consultation seule).
// Usage : npx tsx scripts/code_consultation.ts [nom de l'organisation]
import { createHash, randomInt } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // sans 0, 1, I, L, O, U : rien à confondre en le recopiant
const brut = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const code = brut.match(/.{4}/g)!.join(" ");
const empreinte = createHash("sha256").update(brut).digest("hex");
const pour = process.argv.slice(2).join(" ");
console.log(`Code à donner${pour ? ` à ${pour}` : ""} : ${code}`);
console.log(`Abonnement, ligne pour « abonnements » : '${empreinte}' => ['nom' => '${(pour || "Organisation").replace(/'/g, "\\'")}', 'plafond_usd' => 60, 'periode' => 'mois', 'approfondi' => true],`);
console.log(`Consultation seule, ligne pour « codes » : '${empreinte}',${pour ? ` // ${pour}` : ""}`);
