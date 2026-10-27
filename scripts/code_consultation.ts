// Crée un code d'accès aux consultations réelles (abonnement, ou gratuité pour une école).
// Le code est à donner à l'organisation ; seule son empreinte va dans web/public/api/config.php (liste « codes »).
// Usage : npx tsx scripts/code_consultation.ts [nom de l'organisation]
import { createHash, randomInt } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // sans 0, 1, I, L, O, U : rien à confondre en le recopiant
const brut = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const code = brut.match(/.{4}/g)!.join(" ");
const empreinte = createHash("sha256").update(brut).digest("hex");
const pour = process.argv.slice(2).join(" ");
console.log(`Code à donner${pour ? ` à ${pour}` : ""} : ${code}`);
console.log(`Ligne pour config.php : '${empreinte}',${pour ? ` // ${pour}` : ""}`);
