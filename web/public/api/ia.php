<?php
// Relais IA des abonnements RegenVox (AGPL-3.0-or-later).
//
// Un test lancé avec un code d'abonnement passe par ici. Le navigateur envoie le niveau de l'agent (opus, sonnet,
// haiku) et les deux textes de sa requête ; le serveur choisit seul le modèle et les réglages, les mêmes que
// src/appels.ts (appelAnthropic), appelle Anthropic avec la clé de Régénère Plus et décompte le coût sur le plafond
// du code. Aucun texte n'est gardé ni journalisé : seuls les totaux par code (son empreinte) sont écrits.
//
// Fermé par défaut : sans clé Anthropic et sans liste d'abonnements dans config.php, tout est refusé.
// Réglages dans le même config.php que le serveur de collecte (voir config.exemple.php).

declare(strict_types=1);

$config = [
    'dossier' => '',
    'origines' => [],
    'anthropic_cle' => '',
    // Empreinte SHA-256 du code (en majuscules, sans espaces) => réglages de l'abonnement :
    // 'nom', 'plafond_usd' (dépense IA permise), 'periode' ('mois' ou 'total'), 'expire' (AAAA-MM-JJ, facultatif),
    // 'approfondi' (vrai : tests approfondis permis).
    'abonnements' => [],
    // Mêmes modèles que fournisseurs.json (contrôlé par npm run selftest).
    'modeles' => ['opus' => 'claude-opus-5-5', 'sonnet' => 'claude-sonnet-5-5', 'haiku' => 'claude-haiku-5-5'],
    // Prix en dollars par million de jetons (entrée, sortie), par modèle effectivement utilisé.
    // Un modèle absent de la liste (repli inattendu) est compté au prix le plus élevé de la liste.
    'prix' => [
        'claude-opus-5-5' => [4.0, 20.0],
        'claude-sonnet-5-5' => [2.0, 10.0],
        'claude-haiku-5-5' => [0.10, 0.50],
        'claude-opus-5' => [5.0, 25.0],
        'claude-opus-4-8' => [5.0, 25.0],
        'claude-sonnet-5' => [2.0, 10.0],
    ],
    'anthropic_url' => 'https://api.anthropic.com',
];
$fichier_config = getenv('REGENVOX_CONFIG') ?: __DIR__ . '/config.php';
if (is_file($fichier_config)) {
    $perso = require $fichier_config;
    if (is_array($perso)) $config = array_merge($config, $perso);
}

const TAILLE_MAX_CORPS = 3000000;
const MAX_TOKENS = 16000;
// Limite plus haute, seulement pour les analyses d'un test approfondi (MAX_TOKENS_APPROFONDI dans src/cli.ts).
const MAX_TOKENS_APPROFONDI = 48000;
// Profondeur de réflexion par niveau d'agent, comme src/appels.ts.
const EFFORT = ['haiku' => 'low', 'sonnet' => 'medium', 'opus' => 'high'];
// Une réservation oubliée (processus interrompu) est libérée après ce délai.
const RESERVATION_MAX_S = 900;

date_default_timezone_set('Europe/Zurich');

function sortir(int $code, array $corps): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    echo json_encode($corps, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function erreur(int $code, string $erreur, string $detail = ''): void
{
    sortir($code, $detail === '' ? ['ok' => false, 'erreur' => $erreur] : ['ok' => false, 'erreur' => $erreur, 'detail' => $detail]);
}

$origine = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origine !== '' && in_array($origine, (array)$config['origines'], true)) {
    header('Access-Control-Allow-Origin: ' . $origine);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!is_string($config['anthropic_cle']) || $config['anthropic_cle'] === '' || !is_array($config['abonnements']) || count($config['abonnements']) === 0) {
    erreur(503, 'ferme');
}

function dossier_donnees(array $config): string
{
    if ($config['dossier'] !== '') return rtrim((string)$config['dossier'], '/');
    $env = getenv('REGENVOX_DONNEES');
    if (is_string($env) && $env !== '') return rtrim($env, '/');
    $hors = dirname(__DIR__, 2) . '/regenvox_consultations';
    if (is_dir($hors) || (is_writable(dirname($hors)) && @mkdir($hors, 0700, true))) return $hors;
    return __DIR__ . '/donnees';
}

$COMPTES = dossier_donnees($config) . '/abonnements';
if (!is_dir($COMPTES) && !@mkdir($COMPTES, 0700, true)) erreur(500, 'stockage_indisponible');
if (strpos(realpath($COMPTES) ?: $COMPTES, realpath(__DIR__) ?: __DIR__) === 0 && !is_file($COMPTES . '/.htaccess')) {
    @file_put_contents($COMPTES . '/.htaccess', "Require all denied\nDeny from all\n");
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') erreur(405, 'methode');
$taille = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($taille > TAILLE_MAX_CORPS) erreur(413, 'trop_gros');
$brut = file_get_contents('php://input', false, null, 0, TAILLE_MAX_CORPS + 1);
if ($brut === false || strlen($brut) > TAILLE_MAX_CORPS) erreur(413, 'trop_gros');
$c = json_decode($brut, true);
if (!is_array($c)) erreur(400, 'format');

// Abonnement désigné par le code, ou refus. Le code ne circule que dans le corps de la requête.
$code = is_string($c['code'] ?? null) ? strtoupper((string)preg_replace('/\s+/', '', $c['code'])) : '';
$empreinte = hash('sha256', $code);
$abo = null;
foreach ($config['abonnements'] as $e => $reglages) {
    if (is_string($e) && is_array($reglages) && hash_equals(strtolower($e), $empreinte)) $abo = $reglages;
}
if ($code === '' || $abo === null) erreur(403, 'code');
$expire = (string)($abo['expire'] ?? '');
if ($expire !== '' && date('Y-m-d') > $expire) erreur(403, 'expire');
$plafond = (float)($abo['plafond_usd'] ?? 0);
$periode = ($abo['periode'] ?? 'mois') === 'total' ? 'total' : date('Y-m');

// Compte de l'abonnement : dépense de la période et réservations des appels en cours, sous verrou.
function avec_compte(string $dossier, string $empreinte, callable $f)
{
    $chemin = $dossier . '/' . $empreinte . '.json';
    $h = fopen($chemin, 'c+');
    if ($h === false) erreur(500, 'stockage_indisponible');
    flock($h, LOCK_EX);
    $texte = stream_get_contents($h);
    $compte = json_decode($texte === false || $texte === '' ? '{}' : $texte, true);
    if (!is_array($compte)) $compte = [];
    $compte += ['depenses' => [], 'reservations' => []];
    $maintenant = time();
    $compte['reservations'] = array_filter((array)$compte['reservations'], fn($r) => is_array($r) && ($maintenant - (int)($r['t'] ?? 0)) < RESERVATION_MAX_S);
    [$compte, $resultat] = $f($compte);
    ftruncate($h, 0);
    rewind($h);
    fwrite($h, json_encode($compte, JSON_UNESCAPED_SLASHES));
    fflush($h);
    flock($h, LOCK_UN);
    fclose($h);
    return $resultat;
}

function depense(array $compte, string $periode): float
{
    return (float)($compte['depenses'][$periode]['usd'] ?? 0);
}

function reserve(array $compte): float
{
    return array_sum(array_map(fn($r) => (float)($r['usd'] ?? 0), (array)$compte['reservations']));
}

function prix_de(array $config, string $modele): array
{
    if (isset($config['prix'][$modele])) return $config['prix'][$modele];
    $max = [0.0, 0.0];
    foreach ($config['prix'] as $p) if ($p[1] > $max[1]) $max = $p;
    return $max;
}

$action = (string)($_GET['action'] ?? '');

if ($action === 'etat') {
    $etat = avec_compte($COMPTES, $empreinte, fn($compte) => [$compte, ['depense' => depense($compte, $periode), 'reserve' => reserve($compte)]]);
    sortir(200, [
        'ok' => true,
        'nom' => (string)($abo['nom'] ?? ''),
        'approfondi' => (bool)($abo['approfondi'] ?? false),
        'periode' => $periode === 'total' ? 'total' : 'mois',
        'plafond_usd' => $plafond,
        'restant_usd' => max(0, round($plafond - $etat['depense'], 2)),
        'expire' => $expire,
    ]);
}

if ($action !== 'appel') erreur(404, 'action');

$niveau = (string)($c['niveau'] ?? '');
if (!isset(EFFORT[$niveau]) || !isset($config['modeles'][$niveau])) erreur(400, 'niveau');
$system = $c['system'] ?? null;
$user = $c['user'] ?? null;
if (!is_string($system) || !is_string($user) || $user === '') erreur(400, 'format');
$modele = (string)$config['modeles'][$niveau];
$max_tokens = (int)($c['max_tokens'] ?? MAX_TOKENS);
if ($max_tokens !== MAX_TOKENS && !($max_tokens === MAX_TOKENS_APPROFONDI && $niveau !== 'haiku' && (bool)($abo['approfondi'] ?? false))) erreur(400, 'max_tokens');

// Réservation avant l'appel : le pire coût possible (entrée estimée large, sortie au maximum permis).
// Les appels simultanés d'un même test ne peuvent donc pas dépasser ensemble le plafond.
[$pin, $pout] = prix_de($config, $modele);
$au_pire = (strlen($system) + strlen($user)) / 2.5 * $pin / 1e6 + $max_tokens * $pout / 1e6;
$id_resa = bin2hex(random_bytes(8));
$accepte = avec_compte($COMPTES, $empreinte, function ($compte) use ($periode, $plafond, $au_pire, $id_resa) {
    if (depense($compte, $periode) + reserve($compte) + $au_pire > $plafond) return [$compte, false];
    $compte['reservations'][$id_resa] = ['usd' => $au_pire, 't' => time()];
    return [$compte, true];
});
if (!$accepte) erreur(402, 'plafond');

// Même requête que appelAnthropic : repli automatique sur refus pour Opus et Sonnet, pas pour Haiku.
$requete = [
    'model' => $modele,
    'max_tokens' => $max_tokens,
    'output_config' => ['effort' => EFFORT[$niveau]],
    'system' => $system,
    'messages' => [['role' => 'user', 'content' => $user]],
];
$entetes = [
    'Content-Type: application/json',
    'x-api-key: ' . $config['anthropic_cle'],
    'anthropic-version: 2026-10-21',
];
if ($niveau !== 'haiku') {
    $requete['fallbacks'] = 'default';
    $entetes[] = 'anthropic-beta: server-side-fallback-2026-07-01';
}

// Appel par les flux HTTP de PHP (aucune extension requise, sinon openssl) : PHP 8.4 ou plus récent.
@set_time_limit(0);
$contexte = stream_context_create(['http' => [
    'method' => 'POST',
    'header' => implode("\r\n", $entetes),
    'content' => json_encode($requete, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    'timeout' => $max_tokens > MAX_TOKENS ? 1500 : 600,
    'ignore_errors' => true,
]]);
$reponse = @file_get_contents(rtrim((string)$config['anthropic_url'], '/') . '/v1/messages?beta=true', false, $contexte);
$statut = 0;
foreach ((array)http_get_last_response_headers() as $ligne) {
    if (preg_match('#^HTTP/\S+\s+(\d{3})#', (string)$ligne, $m)) $statut = (int)$m[1];
}
$res = is_string($reponse) ? json_decode($reponse, true) : null;

// Coût réel, compté même quand la réponse est un refus ou tronquée ; la réservation est libérée.
$usage = is_array($res) ? ($res['usage'] ?? []) : [];
$entree = (int)($usage['input_tokens'] ?? 0) + (int)($usage['cache_creation_input_tokens'] ?? 0) + (int)($usage['cache_read_input_tokens'] ?? 0);
$sortie = (int)($usage['output_tokens'] ?? 0);
$modele_utilise = is_array($res) && is_string($res['model'] ?? null) ? $res['model'] : $modele;
[$pin2, $pout2] = prix_de($config, $modele_utilise);
$cout = $entree * $pin2 / 1e6 + $sortie * $pout2 / 1e6;
avec_compte($COMPTES, $empreinte, function ($compte) use ($periode, $id_resa, $cout, $entree, $sortie) {
    unset($compte['reservations'][$id_resa]);
    $d = $compte['depenses'][$periode] ?? ['usd' => 0, 'appels' => 0, 'tokens_entree' => 0, 'tokens_sortie' => 0];
    $d['usd'] = round((float)$d['usd'] + $cout, 6);
    $d['appels'] = (int)$d['appels'] + 1;
    $d['tokens_entree'] = (int)$d['tokens_entree'] + $entree;
    $d['tokens_sortie'] = (int)$d['tokens_sortie'] + $sortie;
    $compte['depenses'][$periode] = $d;
    return [$compte, null];
});

if ($reponse === false || $statut === 0) erreur(503, 'fournisseur');
if ($statut === 429) erreur(429, 'surcharge');
if ($statut >= 500) erreur(503, 'fournisseur');
if ($statut === 401 || $statut === 403) erreur(502, 'cle_serveur');
if ($statut !== 200 || !is_array($res)) {
    $message = is_array($res) ? (string)($res['error']['message'] ?? '') : '';
    erreur(502, 'requete', substr($message, 0, 300));
}

$stop = (string)($res['stop_reason'] ?? '');
if ($stop === 'refusal') sortir(200, ['ok' => false, 'erreur' => 'refus', 'detail' => (string)($res['stop_details']['category'] ?? '')]);
if ($stop === 'max_tokens') sortir(200, ['ok' => false, 'erreur' => 'tronque']);
$texte = '';
foreach ((array)($res['content'] ?? []) as $bloc) if (is_array($bloc) && ($bloc['type'] ?? '') === 'text') $texte .= (string)($bloc['text'] ?? '');
$repli = false;
foreach ((array)($usage['iterations'] ?? []) as $it) if (is_array($it) && ($it['type'] ?? '') === 'fallback_message') $repli = true;

sortir(200, [
    'ok' => true,
    'texte' => $texte,
    'tokens_entree' => (int)($usage['input_tokens'] ?? 0),
    'tokens_sortie' => $sortie,
    'modele' => $modele_utilise,
    'repli' => $repli ? $modele_utilise : null,
]);
