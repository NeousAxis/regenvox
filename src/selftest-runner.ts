// Autotest de l'exécuteur API, sans réseau ni clé : un faux serveur local imite les API Anthropic et Mistral.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { runDir, reqPath, respPath, writeJson } from "./store.js";
import { executer } from "./runner.js";

const RUN = "_test-runner";
const reponse = { id: "p01", ok: true };
const recues: any[] = [];

const serveur = http.createServer((req, res) => {
  let corps = "";
  req.on("data", (c) => (corps += c));
  req.on("end", () => {
    const b = JSON.parse(corps || "{}");
    recues.push({ url: req.url, corps: b, cle: req.headers["x-api-key"] ?? req.headers["authorization"] });
    res.setHeader("content-type", "application/json");
    if (req.url?.includes("/v1/messages")) {
      res.end(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: b.model, stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: JSON.stringify(reponse) }], usage: { input_tokens: 120, output_tokens: 12 } }));
    } else {
      res.end(JSON.stringify({ id: "cmpl_test", object: "chat.completion", model: b.model, created: 0, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(reponse) } }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }));
    }
  });
});

async function main() {
  await new Promise<void>((r) => serveur.listen(0, "127.0.0.1", () => r()));
  const port = (serveur.address() as any).port;
  fs.rmSync(runDir(RUN), { recursive: true, force: true });
  process.env.ANTHROPIC_API_KEY = "cle-de-test";
  process.env.MISTRAL_API_KEY = "cle-de-test";

  for (const [fournisseur, chemin] of [["anthropic", ""], ["mistral", ""]] as const) {
    for (const item of ["p01", "p02"]) {
      writeJson(reqPath(RUN, "personas", item), { step: "personas", item, model: item === "p01" ? "haiku" : "opus", attempt: 1, system: "système", user: "utilisateur", response_path: respPath(RUN, "personas", item) });
      fs.rmSync(respPath(RUN, "personas", item), { force: true });
    }
    recues.length = 0;
    const { ok, echecs } = await executer(RUN, "personas", fournisseur, 2, false, { baseURL: `http://127.0.0.1:${port}${chemin}` });
    assert.equal(ok, 2, `${fournisseur} : 2 réponses attendues`);
    assert.equal(echecs, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(respPath(RUN, "personas", "p01"), "utf8")), reponse);
    const modeles = recues.map((x) => x.corps.model).sort();
    if (fournisseur === "anthropic") {
      assert.deepEqual(modeles, ["claude-haiku-5-5", "claude-opus-5-5"]);
      const opus = recues.find((x) => x.corps.model === "claude-opus-5-5")!.corps;
      assert.equal(opus.fallbacks, "default", "repli attendu sur Opus");
      assert.equal(recues.find((x) => x.corps.model === "claude-haiku-5-5")!.corps.fallbacks, undefined, "pas de repli sur Haiku");
      assert.equal(opus.system, "système");
    } else {
      assert.deepEqual(modeles, ["mistral-large-latest", "mistral-small-latest"]);
      assert.equal(recues[0].corps.response_format?.type, "json_object");
    }
    console.log(`${fournisseur} : OK (${recues.map((x) => x.url).join(", ")})`);
  }
  // Une réponse déjà présente n'est pas redemandée.
  recues.length = 0;
  const { ok } = await executer(RUN, "personas", "mistral", 2, false, { baseURL: `http://127.0.0.1:${port}` });
  assert.equal(ok, 0);
  assert.equal(recues.length, 0);
  fs.rmSync(runDir(RUN), { recursive: true, force: true });
  serveur.close();
  console.log("selftest runner OK");
}

main().catch((e) => {
  console.error(e);
  serveur.close();
  process.exit(1);
});
