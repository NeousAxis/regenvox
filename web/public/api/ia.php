<?php
// Relais IA de RegenVox (AGPL-3.0-or-later).
//
// Les tests lancés sans clé personnelle passent par ici : avec un code d'abonnement, ou avec un ticket de test
// gratuit. Le navigateur envoie le niveau de l'agent (opus, sonnet, haiku) et les deux textes de sa requête ;
// le serveur choisit seul le modèle et les réglages, les mêmes que src/appels.ts (appelAnthropic), appelle
// Anthropic avec la clé de Régénère Plus et décompte le coût sur le plafond du code ou du ticket. Aucun texte
// n'est gardé ni journalisé : seuls des totaux sont écrits (par empreinte de code, par ticket, par mois).
//
// Fermé par défaut : sans clé Anthropic, et sans abonnement ni test gratuit activé dans config.php, tout est refusé.
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
    // Test gratuit sans clé (test standard seulement). Désactivé par défaut.
    'gratuit' => [],
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
// Test gratuit : plafond par test, budget du mois pour tous les tests gratuits, nouveaux tests par réseau et par jour,
// tests gratuits menés en même temps, durée de validité d'un ticket.
$GRATUIT = array_merge([
    'actif' => false,
    'plafond_test_usd' => 4.0,
    'plafond_mois_usd' => 25.0,
    'tests_par_jour_reseau' => 2,
    'simultanes' => 2,
    'duree_ticket_h' => 24,
], is_array($config['gratuit']) ? $config['gratuit'] : []);

const TAILLE_MAX_CORPS = 3000000;
const MAX_TOKENS = 16000;
// Limite plus haute, seulement pour les analyses d'un test approfondi (MAX_TOKENS_APPROFONDI dans src/cli.ts).
const MAX_TOKENS_APPROFONDI = 48000;
// Profondeur de réflexion par niveau d'agent, comme src/appels.ts.
const EFFORT = ['haiku' => 'low', 'sonnet' => 'medium', 'opus' => 'high'];
// Une réservation oubliée (processus interrompu) est libérée après ce délai, plus long que l'appel le plus long
// (1500 s pour une analyse approfondie).
const RESERVATION_MAX_S = 1600;
// Un test gratuit compte parmi les tests menés en même temps tant qu'un de ses appels est en cours, ou pendant
// ce délai après son dernier appel (le temps de passer d'une étape à la suivante).
const ACTIF_S = 120;

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

$abonnements_ouverts = is_array($config['abonnements']) && count($config['abonnements']) > 0;
$gratuit_ouvert = $GRATUIT['actif'] === true;
if (!is_string($config['anthropic_cle']) || $config['anthropic_cle'] === '' || (!$abonnements_ouverts && !$gratuit_ouvert)) {
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

$BASE = dossier_donnees($config);
$COMPTES = $BASE . '/abonnements';
$ESSAIS = $BASE . '/essais';
foreach ([$COMPTES, $ESSAIS] as $d) {
    if (!is_dir($d) && !@mkdir($d, 0700, true)) erreur(500, 'stockage_indisponible');
    if (strpos(realpath($d) ?: $d, realpath(__DIR__) ?: __DIR__) === 0 && !is_file($d . '/.htaccess')) {
        @file_put_contents($d . '/.htaccess', "Require all denied\nDeny from all\n");
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') erreur(405, 'methode');
$taille = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($taille > TAILLE_MAX_CORPS) erreur(413, 'trop_gros');
$brut = file_get_contents('php://input', false, null, 0, TAILLE_MAX_CORPS + 1);
if ($brut === false || strlen($brut) > TAILLE_MAX_CORPS) erreur(413, 'trop_gros');
$c = json_decode($brut, true);
if (!is_array($c)) erreur(400, 'format');

// Compte sous verrou : dépenses par période et réservations des appels en cours. Rien d'autre n'y est écrit.
// $creer faux : un compte absent n'est pas créé (ticket inconnu).
function avec_compte(string $chemin, callable $f, bool $creer = true)
{
    if (!$creer && !is_file($chemin)) return null;
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

// Réseau du demandeur, pour limiter les tests gratuits : l'adresse IPv4, ou le préfixe /56 en IPv6
// (un fournisseur d'accès attribue souvent tout un /56 à un même client). Jamais écrit tel quel.
function reseau(): string
{
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false) return bin2hex(substr((string)inet_pton($ip), 0, 7)) . '/56';
    return $ip;
}

// Nouveaux tests gratuits du jour pour ce réseau : empreinte salée, sel changé chaque jour puis effacé,
// comme les limites du serveur de collecte. $ajouter : compte un test de plus si la limite le permet.
function tests_du_jour(string $ESSAIS, int $max, bool $ajouter): ?int
{
    $base = $ESSAIS . '/reseaux';
    if (!is_dir($base)) @mkdir($base, 0700, true);
    $jour = date('Ymd');
    $sel_fichier = $base . '/sel-' . $jour;
    if (!is_file($sel_fichier)) {
        @file_put_contents($sel_fichier, bin2hex(random_bytes(16)), LOCK_EX);
        foreach (glob($base . '/sel-*') ?: [] as $ancien) if ($ancien !== $sel_fichier) @unlink($ancien);
        foreach (glob($base . '/2*', GLOB_ONLYDIR) ?: [] as $vieux) {
            if (basename($vieux) !== $jour) {
                foreach (glob($vieux . '/*') ?: [] as $f) @unlink($f);
                @rmdir($vieux);
            }
        }
    }
    $dossier = $base . '/' . $jour;
    if (!is_dir($dossier)) @mkdir($dossier, 0700, true);
    $f = fopen($dossier . '/' . hash('sha256', (string)@file_get_contents($sel_fichier) . '|' . reseau()), 'c+');
    if ($f === false) erreur(500, 'stockage_indisponible');
    flock($f, LOCK_EX);
    $n = (int)stream_get_contents($f);
    if ($ajouter) {
        if ($n >= $max) {
            flock($f, LOCK_UN);
            fclose($f);
            return null;
        }
        $n++;
        ftruncate($f, 0);
        rewind($f);
        fwrite($f, (string)$n);
    }
    flock($f, LOCK_UN);
    fclose($f);
    return $n;
}

function ticket_valide($t): bool { return is_string($t) && preg_match('/^[0-9a-f]{32}$/', $t) === 1; }

$action = (string)($_GET['action'] ?? '');
$mois = date('Y-m');
$compte_mois = $ESSAIS . '/mois-' . $mois . '.json';

// Offre gratuite : ouverte ou non, et ce qu'il reste pour ce réseau aujourd'hui.
if ($action === 'gratuit') {
    if (!$gratuit_ouvert) erreur(503, 'gratuit_ferme');
    $faits = tests_du_jour($ESSAIS, (int)$GRATUIT['tests_par_jour_reseau'], false);
    $budget = avec_compte($compte_mois, fn($compte) => [$compte, depense($compte, 'total') + reserve($compte)]);
    sortir(200, [
        'ok' => true,
        'restant_reseau' => max(0, (int)$GRATUIT['tests_par_jour_reseau'] - (int)$faits),
        'budget_ok' => $budget + (float)$GRATUIT['plafond_test_usd'] <= (float)$GRATUIT['plafond_mois_usd'],
    ]);
}

// Ticket de test gratuit, lié au projet : une reprise du même test garde son ticket et son budget.
if ($action === 'essai') {
    if (!$gratuit_ouvert) erreur(503, 'gratuit_ferme');
    $projet = $c['projet'] ?? null;
    if (!is_string($projet) || $projet === '' || strlen($projet) > 120) erreur(400, 'projet');
    $maintenant = time();
    // Ménage : tickets expirés depuis plus d'un jour, avec leur index de projet.
    foreach (glob($ESSAIS . '/t_*.json') ?: [] as $f) {
        $t = json_decode((string)@file_get_contents($f), true);
        if (is_array($t) && (int)($t['exp'] ?? 0) + 86400 < $maintenant) @unlink($f);
    }
    // Index dont le ticket a disparu. Un index illisible (en cours d'écriture) n'est jamais effacé.
    foreach (glob($ESSAIS . '/p_*.json') ?: [] as $f) {
        $p = json_decode((string)@file_get_contents($f), true);
        if (is_array($p) && ticket_valide($p['ticket'] ?? null) && !is_file($ESSAIS . '/t_' . $p['ticket'] . '.json')) @unlink($f);
    }
    $index = $ESSAIS . '/p_' . hash('sha256', $projet) . '.json';
    $ancien = json_decode((string)@file_get_contents($index), true);
    if (is_array($ancien) && ticket_valide($ancien['ticket'] ?? null)) {
        // Lu sous verrou : les appels encore en cours du même test réécrivent ce fichier.
        $exp = avec_compte($ESSAIS . '/t_' . $ancien['ticket'] . '.json', fn($x) => [$x, (int)($x['exp'] ?? 0)], false);
        if ($exp !== null && $exp > $maintenant) sortir(200, ['ok' => true, 'ticket' => $ancien['ticket'], 'plafond_usd' => (float)$GRATUIT['plafond_test_usd']]);
    }
    $budget = avec_compte($compte_mois, fn($compte) => [$compte, depense($compte, 'total') + reserve($compte)]);
    if ($budget + (float)$GRATUIT['plafond_test_usd'] > (float)$GRATUIT['plafond_mois_usd']) erreur(402, 'gratuit_budget');
    $actifs = 0;
    foreach (glob($ESSAIS . '/t_*.json') ?: [] as $f) {
        $t = json_decode((string)@file_get_contents($f), true);
        if (is_array($t) && (int)($t['exp'] ?? 0) > $maintenant && (count((array)($t['reservations'] ?? [])) > 0 || $maintenant - (int)($t['dernier'] ?? 0) < ACTIF_S)) $actifs++;
    }
    if ($actifs >= (int)$GRATUIT['simultanes']) erreur(429, 'gratuit_occupe');
    if (tests_du_jour($ESSAIS, (int)$GRATUIT['tests_par_jour_reseau'], true) === null) erreur(429, 'gratuit_epuise');
    $ticket = bin2hex(random_bytes(16));
    $exp = $maintenant + (int)$GRATUIT['duree_ticket_h'] * 3600;
    avec_compte($ESSAIS . '/t_' . $ticket . '.json', fn($compte) => [$compte + ['exp' => $exp, 'dernier' => $maintenant], null]);
    file_put_contents($index, json_encode(['ticket' => $ticket]), LOCK_EX);
    avec_compte($compte_mois, function ($compte) {
        $compte['tests'] = (int)($compte['tests'] ?? 0) + 1;
        return [$compte, null];
    });
    sortir(200, ['ok' => true, 'ticket' => $ticket, 'plafond_usd' => (float)$GRATUIT['plafond_test_usd']]);
}

// Qui paie l'appel : un abonnement (code) ou un test gratuit (ticket). Chaque compte a sa période et son plafond.
// Le code et le ticket ne circulent que dans le corps de la requête.
$comptes = [];
$abo = null;
if (isset($c['ticket'])) {
    if (!$gratuit_ouvert) erreur(503, 'gratuit_ferme');
    if (!ticket_valide($c['ticket'])) erreur(403, 'ticket');
    $chemin_ticket = $ESSAIS . '/t_' . $c['ticket'] . '.json';
    // Lu sous verrou : les appels simultanés du même test réécrivent ce fichier à chaque réservation.
    $exp = avec_compte($chemin_ticket, fn($x) => [$x, (int)($x['exp'] ?? 0)], false);
    if ($exp === null || $exp <= time()) erreur(403, 'ticket');
    $comptes[] = ['chemin' => $chemin_ticket, 'periode' => 'total', 'plafond' => (float)$GRATUIT['plafond_test_usd'], 'refus' => 'plafond'];
    $comptes[] = ['chemin' => $compte_mois, 'periode' => 'total', 'plafond' => (float)$GRATUIT['plafond_mois_usd'], 'refus' => 'gratuit_budget'];
} else {
    if (!$abonnements_ouverts) erreur(403, 'code');
    $code = is_string($c['code'] ?? null) ? strtoupper((string)preg_replace('/\s+/', '', $c['code'])) : '';
    $empreinte = hash('sha256', $code);
    foreach ($config['abonnements'] as $e => $reglages) {
        if (is_string($e) && is_array($reglages) && hash_equals(strtolower($e), $empreinte)) $abo = $reglages;
    }
    if ($code === '' || $abo === null) erreur(403, 'code');
    $expire = (string)($abo['expire'] ?? '');
    if ($expire !== '' && date('Y-m-d') > $expire) erreur(403, 'expire');
    $periode = ($abo['periode'] ?? 'mois') === 'total' ? 'total' : date('Y-m');
    $comptes[] = ['chemin' => $COMPTES . '/' . $empreinte . '.json', 'periode' => $periode, 'plafond' => (float)($abo['plafond_usd'] ?? 0), 'refus' => 'plafond'];
}

if ($action === 'etat') {
    if ($abo === null) erreur(404, 'action');
    $compte = $comptes[0];
    $depense = avec_compte($compte['chemin'], fn($x) => [$x, depense($x, $compte['periode'])]);
    sortir(200, [
        'ok' => true,
        'nom' => (string)($abo['nom'] ?? ''),
        'approfondi' => (bool)($abo['approfondi'] ?? false),
        'periode' => $compte['periode'] === 'total' ? 'total' : 'mois',
        'plafond_usd' => $compte['plafond'],
        'restant_usd' => max(0, round($compte['plafond'] - $depense, 2)),
        'expire' => (string)($abo['expire'] ?? ''),
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
// La limite approfondie n'est permise qu'à un abonnement approfondi, jamais à un test gratuit.
if ($max_tokens !== MAX_TOKENS && !($max_tokens === MAX_TOKENS_APPROFONDI && $niveau !== 'haiku' && $abo !== null && (bool)($abo['approfondi'] ?? false))) erreur(400, 'max_tokens');

// Réservation avant l'appel, sur chaque compte concerné : le pire coût possible (entrée estimée large, sortie au
// maximum permis). Les appels simultanés ne peuvent donc pas dépasser ensemble un plafond.
[$pin, $pout] = prix_de($config, $modele);
$au_pire = (strlen($system) + strlen($user)) / 2.5 * $pin / 1e6 + $max_tokens * $pout / 1e6;
$id_resa = bin2hex(random_bytes(8));
$reserves = [];
foreach ($comptes as $compte) {
    $accepte = avec_compte($compte['chemin'], function ($x) use ($compte, $au_pire, $id_resa) {
        if (depense($x, $compte['periode']) + reserve($x) + $au_pire > $compte['plafond']) return [$x, false];
        $x['reservations'][$id_resa] = ['usd' => $au_pire, 't' => time()];
        if (isset($x['exp'])) $x['dernier'] = time();
        return [$x, true];
    });
    if (!$accepte) {
        foreach ($reserves as $r) avec_compte($r['chemin'], function ($x) use ($id_resa) {
            unset($x['reservations'][$id_resa]);
            return [$x, null];
        });
        erreur(402, $compte['refus']);
    }
    $reserves[] = $compte;
}

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

// Coût réel, compté même quand la réponse est un refus ou tronquée ; les réservations sont libérées.
$usage = is_array($res) ? ($res['usage'] ?? []) : [];
$entree = (int)($usage['input_tokens'] ?? 0) + (int)($usage['cache_creation_input_tokens'] ?? 0) + (int)($usage['cache_read_input_tokens'] ?? 0);
$sortie = (int)($usage['output_tokens'] ?? 0);
$modele_utilise = is_array($res) && is_string($res['model'] ?? null) ? $res['model'] : $modele;
[$pin2, $pout2] = prix_de($config, $modele_utilise);
$cout = $entree * $pin2 / 1e6 + $sortie * $pout2 / 1e6;
foreach ($comptes as $compte) {
    avec_compte($compte['chemin'], function ($x) use ($compte, $id_resa, $cout, $entree, $sortie) {
        unset($x['reservations'][$id_resa]);
        $d = $x['depenses'][$compte['periode']] ?? ['usd' => 0, 'appels' => 0, 'tokens_entree' => 0, 'tokens_sortie' => 0];
        $d['usd'] = round((float)$d['usd'] + $cout, 6);
        $d['appels'] = (int)$d['appels'] + 1;
        $d['tokens_entree'] = (int)$d['tokens_entree'] + $entree;
        $d['tokens_sortie'] = (int)$d['tokens_sortie'] + $sortie;
        $x['depenses'][$compte['periode']] = $d;
        return [$x, null];
    });
}

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
