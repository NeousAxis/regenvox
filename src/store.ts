import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const runDir = (runId: string) => path.join(ROOT, "runs", runId);
export const reqPath = (runId: string, step: string, item: string) => path.join(runDir(runId), "requests", step, `${item}.json`);
export const respPath = (runId: string, step: string, item: string) => path.join(runDir(runId), "responses", step, `${item}.json`);
export const okPath = (runId: string, step: string, item: string) => path.join(runDir(runId), "validated", step, `${item}.json`);

export function readJson<T = any>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
export function writeJson(p: string, data: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}
export function exists(p: string) {
  return fs.existsSync(p);
}
export function listItems(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function journal(runId: string, event: Record<string, unknown>) {
  const p = path.join(runDir(runId), "journal.jsonl");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify({ t: new Date().toISOString(), ...event }) + "\n", "utf8");
}

export interface Manifest {
  runId: string;
  caseId: string;
  seed: number;
  createdAt: string;
  attempts: Record<string, number>; // clé "step/item"
  maxAttempts: number;
  N?: number; // taille du panel, si elle diffère de celle du cas
}
export const manifestPath = (runId: string) => path.join(runDir(runId), "manifest.json");
export const loadManifest = (runId: string) => readJson<Manifest>(manifestPath(runId));
export const saveManifest = (m: Manifest) => writeJson(manifestPath(m.runId), m);
