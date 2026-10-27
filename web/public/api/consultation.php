<?php
// Serveur de collecte des consultations RegenVox (AGPL-3.0-or-later).
//
// Il ne lit rien : il range des boîtes chiffrées dans le navigateur de l'initiateur et des contributeurs.
// Le questionnaire est chiffré avec la clé du lien (jamais envoyée ici), chaque réponse pour la clé publique
// de l'initiateur, et la copie de secours avec une phrase que seul l'initiateur garde. Le serveur rend ces boîtes
// sur demande : à l'initiateur (jeton d'administration) ou à qui prouve connaître la phrase de secours.
//
// Une commune peut installer ce fichier sur son propre hébergement PHP : aucune base de données n'est nécessaire.
// Réglages facultatifs dans config.php (voir config.exemple.php).

declare(strict_types=1);

$config = [
    'dossier' => '',            // dossier des données ; vide : hors du site si possible, sinon api/donnees (protégé)
    'codes' => [],              // empreintes SHA-256 des codes d'abonnement ; vide : création libre
    'origines' => [],           // autres sites autorisés à appeler ce serveur (CORS)
    'max_reponses' => 20000,    // réponses au plus par consultation
    'max_par_heure' => 300,     // réponses au plus par heure, par consultation et par adresse IP (une salle entière partage souvent la même)
    'max_creations_jour' => 20, // consultations créées au plus par jour et par adresse IP
    'proxy' => false,           // vrai seulement derrière un proxy de confiance : l'adresse est alors la dernière de X-Forwarded-For
];
$fichier_config = getenv('REGENVOX_CONFIG') ?: __DIR__ . '/config.php';
if (is_file($fichier_config)) {
    $perso = require $fichier_config;
    if (is_array($perso)) $config = array_merge($config, $perso);
}

const TAILLE_MAX_CORPS = 300000;
const TAILLE_MAX_QUESTIONNAIRE = 200000;
const TAILLE_MAX_REPONSE = 60000;
const PAGE_RELEVE = 500;

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

function erreur(int $code, string $erreur): void
{
    sortir($code, ['ok' => false, 'erreur' => $erreur]);
}

// CORS : seulement pour les origines déclarées. Sur le même site, rien n'est nécessaire.
$origine = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origine !== '' && in_array($origine, (array)$config['origines'], true)) {
    header('Access-Control-Allow-Origin: ' . $origine);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function dossier_donnees(array $config): string
{
    if ($config['dossier'] !== '') return rtrim((string)$config['dossier'], '/');
    $env = getenv('REGENVOX_DONNEES');
    if (is_string($env) && $env !== '') return rtrim($env, '/');
    // De préférence hors du dossier publié par le site.
    $hors = dirname(__DIR__, 2) . '/regenvox_consultations';
    if (is_dir($hors) || (is_writable(dirname($hors)) && @mkdir($hors, 0700, true))) return $hors;
    return __DIR__ . '/donnees';
}

$DONNEES = dossier_donnees($config);
if (!is_dir($DONNEES) && !@mkdir($DONNEES, 0700, true)) erreur(500, 'stockage_indisponible');
// Si les données restent dans le site, on en interdit la lecture directe.
if (strpos(realpath($DONNEES) ?: $DONNEES, realpath(__DIR__) ?: __DIR__) === 0 && !is_file($DONNEES . '/.htaccess')) {
    @file_put_contents($DONNEES . '/.htaccess', "Require all denied\nDeny from all\n");
}

// Contrôles de forme
function est_id($v): bool { return is_string($v) && preg_match('/^[A-Za-z0-9_-]{22}$/', $v) === 1; }
function est_b64u($v, int $max): bool { return is_string($v) && strlen($v) <= $max && preg_match('/^[A-Za-z0-9_-]+$/', $v) === 1; }
function est_hex64($v): bool { return is_string($v) && preg_match('/^[0-9a-f]{64}$/', $v) === 1; }
function est_date($v): bool { return is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) === 1 && checkdate((int)substr($v, 5, 2), (int)substr($v, 8, 2), (int)substr($v, 0, 4)); }

function boite_valide($b, int $max, bool $publique): bool
{
    if (!is_array($b) || ($b['v'] ?? null) !== 1) return false;
    if (!est_b64u($b['iv'] ?? null, 32) || !est_b64u($b['ct'] ?? null, $max)) return false;
    if ($publique && !est_b64u($b['epk'] ?? null, 100)) return false;
    $cles = $publique ? ['v', 'epk', 'iv', 'ct'] : ['v', 'iv', 'ct'];
    return count(array_diff(array_keys($b), $cles)) === 0;
}

function corps(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') erreur(405, 'methode');
    $taille = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($taille > TAILLE_MAX_CORPS) erreur(413, 'trop_gros');
    $brut = file_get_contents('php://input', false, null, 0, TAILLE_MAX_CORPS + 1);
    if ($brut === false || strlen($brut) > TAILLE_MAX_CORPS) erreur(413, 'trop_gros');
    $v = json_decode($brut, true);
    if (!is_array($v)) erreur(400, 'format');
    return $v;
}

function ecrire_json(string $chemin, $donnees): void
{
    $tmp = $chemin . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, json_encode($donnees, JSON_UNESCAPED_SLASHES)) === false || !rename($tmp, $chemin)) {
        @unlink($tmp);
        erreur(500, 'ecriture');
    }
}

function lire_json(string $chemin)
{
    $brut = @file_get_contents($chemin);
    return $brut === false ? null : json_decode($brut, true);
}

function dossier_consultation(string $DONNEES, string $id): string { return $DONNEES . '/c_' . $id; }

// Verrou par consultation, pour les changements de l'état (fermeture, suppression).
function avec_verrou(string $dossier, callable $f)
{
    $v = fopen($dossier . '/.verrou', 'c');
    if ($v === false) erreur(500, 'verrou');
    flock($v, LOCK_EX);
    try {
        return $f();
    } finally {
        flock($v, LOCK_UN);
        fclose($v);
    }
}

function meta(string $DONNEES, $id): array
{
    if (!est_id($id)) erreur(400, 'id');
    $m = lire_json(dossier_consultation($DONNEES, $id) . '/meta.json');
    if (!is_array($m)) erreur(404, 'inconnue');
    return $m;
}

function admin_ok(array $meta, $jeton): bool
{
    return is_string($jeton) && strlen($jeton) <= 64 && hash_equals((string)$meta['admin'], hash('sha256', $jeton));
}

function ouverte(array $meta): bool
{
    return empty($meta['ferme']) && date('Y-m-d') <= (string)$meta['cloture_le'];
}

function nombre_reponses(string $dossier): int
{
    $n = 0;
    $d = @opendir($dossier . '/reponses');
    if ($d === false) return 0;
    while (($f = readdir($d)) !== false) if (substr($f, -5) === '.json') $n++;
    closedir($d);
    return $n;
}

function supprimer_dossier(string $dossier): void
{
    if (!is_dir($dossier)) return;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dossier, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    @rmdir($dossier);
}

// Limites par adresse IP. L'adresse n'est jamais écrite : seulement une empreinte salée, avec un sel changé chaque jour puis effacé.
// L'en-tête X-Forwarded-For est écrit par le client : on ne le lit que derrière un proxy de confiance,
// et seulement sa dernière entrée, celle que le proxy a ajoutée.
function adresse_ip(): string
{
    global $config;
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if (!empty($config['proxy'])) {
        $parts = array_map('trim', explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')));
        $derniere = (string)end($parts);
        if (filter_var($derniere, FILTER_VALIDATE_IP) !== false) $ip = $derniere;
    }
    return $ip;
}

function limiter(string $DONNEES, string $portee, int $max, string $periode): void
{
    $base = $DONNEES . '/limites';
    if (!is_dir($base)) @mkdir($base, 0700, true);
    $jour = date('Ymd');
    $sel_fichier = $base . '/sel-' . $jour;
    if (!is_file($sel_fichier)) {
        @file_put_contents($sel_fichier, bin2hex(random_bytes(16)), LOCK_EX);
        foreach (glob($base . '/sel-*') ?: [] as $ancien) if ($ancien !== $sel_fichier) @unlink($ancien);
    }
    $sel = (string)@file_get_contents($sel_fichier);
    $tranche = $periode === 'heure' ? date('YmdH') : $jour;
    $dossier = $base . '/' . $tranche;
    if (!is_dir($dossier)) {
        @mkdir($dossier, 0700, true);
        foreach (glob($base . '/2*', GLOB_ONLYDIR) ?: [] as $vieux) {
            if (strcmp(substr(basename($vieux), 0, 8), date('Ymd', time() - 86400)) < 0) supprimer_dossier($vieux);
        }
    }
    $f = fopen($dossier . '/' . hash('sha256', $sel . '|' . $portee . '|' . adresse_ip()), 'c+');
    if ($f === false) return;
    flock($f, LOCK_EX);
    $n = (int)stream_get_contents($f);
    if ($n >= $max) {
        flock($f, LOCK_UN);
        fclose($f);
        erreur(429, 'trop_de_demandes');
    }
    ftruncate($f, 0);
    rewind($f);
    fwrite($f, (string)($n + 1));
    flock($f, LOCK_UN);
    fclose($f);
}

// Une consultation effacée laisse une tombe : son identifiant ne peut plus resservir, sinon quelqu'un qui a l'ancien lien
// (donc la clé du lien) pourrait recréer la consultation avec sa propre clé et recevoir les réponses des anciennes affiches.
function effacer_consultation(string $DONNEES, string $id): void
{
    if (!is_dir($DONNEES . '/supprimees')) @mkdir($DONNEES . '/supprimees', 0700, true);
    @touch($DONNEES . '/supprimees/' . $id);
    supprimer_dossier(dossier_consultation($DONNEES, $id));
}

// Effacement des consultations dont la durée de conservation est passée : une fois par jour, à la première demande du jour.
function purger(string $DONNEES): void
{
    $repere = $DONNEES . '/.purge';
    $aujourdhui = date('Y-m-d');
    if (@file_get_contents($repere) === $aujourdhui) return;
    @file_put_contents($repere, $aujourdhui, LOCK_EX);
    foreach (glob($DONNEES . '/c_*', GLOB_ONLYDIR) ?: [] as $dossier) {
        $m = lire_json($dossier . '/meta.json');
        if (!is_array($m)) continue;
        $fin = strtotime((string)$m['cloture_le'] . ' +' . (int)$m['conservation_jours'] . ' days');
        if ($fin !== false && time() > $fin + 86400) effacer_consultation($DONNEES, substr(basename($dossier), 2));
    }
}

$action = (string)($_GET['action'] ?? '');
purger($DONNEES);

switch ($action) {
    case 'creer': {
        $c = corps();
        limiter($DONNEES, 'creer', (int)$config['max_creations_jour'], 'jour');
        $codes = (array)$config['codes'];
        if (count($codes) > 0) {
            $code = is_string($c['code'] ?? null) ? strtoupper(preg_replace('/\s+/', '', $c['code'])) : '';
            $ok = false;
            foreach ($codes as $e) if (is_string($e) && hash_equals(strtolower($e), hash('sha256', $code))) $ok = true;
            if (!$ok) erreur(403, 'code');
        }
        $id = $c['id'] ?? null;
        if (!est_id($id)) erreur(400, 'id');
        if (!boite_valide($c['questionnaire'] ?? null, TAILLE_MAX_QUESTIONNAIRE, false)) erreur(400, 'questionnaire');
        if (!est_hex64($c['admin'] ?? null)) erreur(400, 'admin');
        if (!est_date($c['cloture_le'] ?? null) || $c['cloture_le'] < date('Y-m-d') || $c['cloture_le'] > date('Y-m-d', strtotime('+366 days'))) erreur(400, 'cloture');
        $conservation = $c['conservation_jours'] ?? null;
        if (!is_int($conservation) || $conservation < 1 || $conservation > 1095) erreur(400, 'conservation');
        $secours = $c['secours'] ?? null;
        if (!is_array($secours) || count($secours) < 1 || count($secours) > 3) erreur(400, 'secours');
        $copies = [];
        foreach ($secours as $s) {
            if (!is_array($s) || !est_hex64($s['preuve_empreinte'] ?? null) || !boite_valide($s['boite'] ?? null, 2000, false)) erreur(400, 'secours');
            $copies[] = ['preuve_empreinte' => $s['preuve_empreinte'], 'boite' => $s['boite']];
        }
        // Dossier de l'initiateur (repères de la simulation), chiffré pour sa propre clé : rendu avec la copie de secours.
        $prive = $c['dossier'] ?? null;
        if ($prive !== null && !boite_valide($prive, TAILLE_MAX_QUESTIONNAIRE, true)) erreur(400, 'dossier');
        $dossier = dossier_consultation($DONNEES, $id);
        if (is_file($DONNEES . '/supprimees/' . $id) || !@mkdir($dossier, 0700)) erreur(409, 'existe');
        @mkdir($dossier . '/reponses', 0700);
        ecrire_json($dossier . '/questionnaire.json', $c['questionnaire']);
        if ($prive !== null) ecrire_json($dossier . '/dossier.json', $prive);
        ecrire_json($dossier . '/meta.json', [
            'version' => 1,
            'cree_le' => date('Y-m-d'),
            'cloture_le' => $c['cloture_le'],
            'conservation_jours' => $conservation,
            'admin' => $c['admin'],
            'secours' => $copies,
            'ferme' => false,
        ]);
        sortir(201, ['ok' => true]);
    }

    case 'questionnaire': {
        $id = $_GET['id'] ?? null;
        $m = meta($DONNEES, $id);
        $q = lire_json(dossier_consultation($DONNEES, $id) . '/questionnaire.json');
        if (!is_array($q)) erreur(404, 'inconnue');
        sortir(200, ['ok' => true, 'questionnaire' => $q, 'ouverte' => ouverte($m), 'cloture_le' => $m['cloture_le']]);
    }

    case 'repondre': {
        $c = corps();
        $id = $c['id'] ?? null;
        $m = meta($DONNEES, $id);
        if (!ouverte($m)) erreur(410, 'fermee');
        if (!boite_valide($c['boite'] ?? null, TAILLE_MAX_REPONSE, true)) erreur(400, 'reponse');
        limiter($DONNEES, 'repondre:' . $id, (int)$config['max_par_heure'], 'heure');
        $dossier = dossier_consultation($DONNEES, $id);
        if (nombre_reponses($dossier) >= (int)$config['max_reponses']) erreur(507, 'pleine');
        // Nom tiré au hasard : rien ne dit l'ordre d'arrivée ; la date du fichier est ramenée à minuit.
        $nom = sprintf('%s/reponses/%s.json', $dossier, bin2hex(random_bytes(16)));
        $f = @fopen($nom, 'x');
        if ($f === false) erreur(500, 'ecriture');
        fwrite($f, json_encode($c['boite'], JSON_UNESCAPED_SLASHES));
        fclose($f);
        @touch($nom, strtotime('today'));
        sortir(201, ['ok' => true]);
    }

    case 'compter': {
        $c = corps();
        $m = meta($DONNEES, $c['id'] ?? null);
        if (!admin_ok($m, $c['jeton'] ?? null)) erreur(403, 'jeton');
        sortir(200, ['ok' => true, 'nombre' => nombre_reponses(dossier_consultation($DONNEES, $c['id'])), 'ouverte' => ouverte($m), 'ferme' => !empty($m['ferme']), 'cloture_le' => $m['cloture_le']]);
    }

    case 'relever': {
        $c = corps();
        $m = meta($DONNEES, $c['id'] ?? null);
        if (!admin_ok($m, $c['jeton'] ?? null)) erreur(403, 'jeton');
        $apres = $c['apres'] ?? '';
        if (!is_string($apres) || ($apres !== '' && preg_match('/^[0-9a-f]{32}\.json$/', $apres) !== 1)) erreur(400, 'apres');
        $noms = array_values(array_filter(scandir(dossier_consultation($DONNEES, $c['id']) . '/reponses') ?: [], function ($f) use ($apres) {
            return substr($f, -5) === '.json' && strcmp($f, $apres) > 0;
        }));
        sort($noms, SORT_STRING);
        $page = array_slice($noms, 0, PAGE_RELEVE);
        $boites = [];
        foreach ($page as $f) {
            $b = lire_json(dossier_consultation($DONNEES, $c['id']) . '/reponses/' . $f);
            if (is_array($b)) $boites[] = $b;
        }
        sortir(200, ['ok' => true, 'boites' => $boites, 'suite' => count($noms) > PAGE_RELEVE ? end($page) : null]);
    }

    case 'fermer': {
        $c = corps();
        $m = meta($DONNEES, $c['id'] ?? null);
        if (!admin_ok($m, $c['jeton'] ?? null)) erreur(403, 'jeton');
        $dossier = dossier_consultation($DONNEES, $c['id']);
        avec_verrou($dossier, function () use ($dossier) {
            $m = lire_json($dossier . '/meta.json');
            $m['ferme'] = true;
            ecrire_json($dossier . '/meta.json', $m);
        });
        sortir(200, ['ok' => true]);
    }

    case 'supprimer': {
        $c = corps();
        $m = meta($DONNEES, $c['id'] ?? null);
        if (!admin_ok($m, $c['jeton'] ?? null)) erreur(403, 'jeton');
        effacer_consultation($DONNEES, $c['id']);
        sortir(200, ['ok' => true]);
    }

    case 'secours': {
        $c = corps();
        limiter($DONNEES, 'secours', 30, 'heure');
        $m = meta($DONNEES, $c['id'] ?? null);
        $preuve = $c['preuve'] ?? null;
        if (!est_b64u($preuve, 64)) erreur(400, 'preuve');
        $e = hash('sha256', $preuve);
        foreach ((array)$m['secours'] as $s) {
            if (hash_equals((string)$s['preuve_empreinte'], $e)) {
                sortir(200, ['ok' => true, 'boite' => $s['boite'], 'dossier' => lire_json(dossier_consultation($DONNEES, $c['id']) . '/dossier.json')]);
            }
        }
        erreur(403, 'phrase');
    }

    default:
        erreur(404, 'action');
}
