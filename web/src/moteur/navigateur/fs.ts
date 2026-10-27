// Système de fichiers en mémoire, pour faire tourner le moteur (écrit pour Node) dans le navigateur.
// Seules les fonctions utilisées par le moteur sont fournies. Rien ne quitte la mémoire de l'onglet :
// la plateforme en extrait l'état (exporter) pour le ranger chez l'utilisateur, et le recharge (importer) pour reprendre.
const fichiers = new Map<string, string>();
const dossiers = new Set<string>(["/"]);

const norm = (p: string) => {
  const parts: string[] = [];
  for (const s of String(p).split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") parts.pop();
    else parts.push(s);
  }
  return "/" + parts.join("/");
};
const parent = (p: string) => norm(p).replace(/\/[^/]*$/, "") || "/";
const ajouterDossiers = (d: string) => {
  let x = norm(d);
  while (!dossiers.has(x)) {
    dossiers.add(x);
    x = parent(x);
  }
};
const erreur = (code: string, p: string) => Object.assign(new Error(`${code}: no such file or directory, '${p}'`), { code });

export function readFileSync(p: string, _enc?: unknown): string {
  const v = fichiers.get(norm(p));
  if (v === undefined) throw erreur("ENOENT", p);
  return v;
}
export function writeFileSync(p: string, data: string, _enc?: unknown) {
  ajouterDossiers(parent(p));
  fichiers.set(norm(p), String(data));
}
export function appendFileSync(p: string, data: string, _enc?: unknown) {
  ajouterDossiers(parent(p));
  fichiers.set(norm(p), (fichiers.get(norm(p)) ?? "") + String(data));
}
export function existsSync(p: string) {
  const n = norm(p);
  return fichiers.has(n) || dossiers.has(n);
}
export function mkdirSync(p: string, _opts?: unknown) {
  ajouterDossiers(p);
}
export function readdirSync(p: string): string[] {
  const n = norm(p);
  if (!dossiers.has(n)) throw erreur("ENOENT", p);
  const pref = n === "/" ? "/" : n + "/";
  const noms = new Set<string>();
  for (const k of [...fichiers.keys(), ...dossiers]) if (k.startsWith(pref) && k !== n) noms.add(k.slice(pref.length).split("/")[0]);
  return [...noms].sort();
}
export function rmSync(p: string, opts?: { recursive?: boolean; force?: boolean }) {
  const n = norm(p);
  if (fichiers.delete(n)) return;
  if (dossiers.has(n) && opts?.recursive) {
    for (const k of [...fichiers.keys()]) if (k.startsWith(n + "/")) fichiers.delete(k);
    for (const k of [...dossiers]) if (k === n || k.startsWith(n + "/")) dossiers.delete(k);
    return;
  }
  if (!opts?.force) throw erreur("ENOENT", p);
}

// État complet sous un préfixe (ex. "/moteur/runs/x"), clés relatives au préfixe donné.
export function exporter(prefixe: string): Record<string, string> {
  const n = norm(prefixe);
  const out: Record<string, string> = {};
  for (const [k, v] of fichiers) if (k.startsWith(n + "/")) out[k.slice(n.length + 1)] = v;
  return out;
}
export function importer(prefixe: string, contenu: Record<string, string>) {
  for (const [k, v] of Object.entries(contenu)) writeFileSync(`${norm(prefixe)}/${k}`, v);
}
export function vider() {
  fichiers.clear();
  dossiers.clear();
  dossiers.add("/");
}

export default { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, rmSync };
