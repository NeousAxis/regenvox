<?php
// Paiement des abonnements RegenVox par Stripe (AGPL-3.0-or-later).
//
// GET  ?action=formules : les formules en vente (nom, prix affiché, lien de paiement Stripe), lues dans config.php.
// POST (sans action)    : les événements que Stripe envoie après un paiement (webhook), signés avec le secret du
//                         point de réception. Rien n'est cru sans cette signature.
//
// Le navigateur de l'abonné tire son code au sort avant de payer et n'envoie à Stripe que son empreinte
// (client_reference_id du lien de paiement). Quand Stripe confirme le paiement, l'empreinte devient un abonnement :
// le code ouvre alors le test approfondi et la consultation réelle (ia.php, consultation.php).
// Aucune clé d'API Stripe ici : seul le secret de signature des événements, lu dans config.php.
//
// Réglages dans config.php, clé 'stripe' :
//   'mode'     => 'test' ou 'live' : les événements de l'autre mode sont ignorés ;
//   'secrets'  => [secret(s) de signature du point de réception, « whsec_… »] ;
//   'formules' => [ identifiant => ['nom', 'prix' (texte affiché), 'lien' (https://buy.stripe.com/…),
//                  'payment_link' (plink_…, pour reconnaître la formule), 'plafond_usd', 'periode' ('mois' ou 'total'),
//                  'approfondi', 'duree_jours' (validité donnée au paiement ; un abonnement est ensuite prolongé
//                  à chaque échéance payée) ] ].

declare(strict_types=1);

$config = ['dossier' => '', 'origines' => [], 'stripe' => []];
$fichier_config = getenv('REGENVOX_CONFIG') ?: __DIR__ . '/config.php';
if (is_file($fichier_config)) {
    $perso = require $fichier_config;
    if (is_array($perso)) $config = array_merge($config, $perso);
}
require_once __DIR__ . '/abonnements_payes.php';

$S = array_merge([
    'mode' => 'test',
    'secrets' => [],
    'formules' => [],
    'tolerance_s' => 300,   // âge maximal d'un événement signé (rejeu)
    'grace_jours' => 3,     // jours ajoutés après une échéance, le temps que Stripe encaisse la suivante
], is_array($config['stripe']) ? $config['stripe'] : []);
$MODE = rv_mode_stripe($config);

const TAILLE_MAX_EVENEMENT = 512000;
const EVENEMENTS_GARDES = 2000;

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

$methode = $_SERVER['REQUEST_METHOD'] ?? '';
$action = (string)($_GET['action'] ?? '');

// Formules : lecture publique, depuis le site.
if ($action === 'formules') {
    $origine = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origine !== '' && in_array($origine, (array)$config['origines'], true)) {
        header('Access-Control-Allow-Origin: ' . $origine);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET');
        header('Access-Control-Max-Age: 86400');
    }
    if ($methode === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if ($methode !== 'GET') erreur(405, 'methode');
    $liste = [];
    foreach ((array)$S['formules'] as $id => $f) {
        if (!is_string($id) || !is_array($f)) continue;
        $lien = (string)($f['lien'] ?? '');
        if (preg_match('#^https://(buy|checkout)\.stripe\.com/#', $lien) !== 1) continue;
        $liste[] = [
            'id' => $id,
            'nom' => (string)($f['nom'] ?? $id),
            'prix' => (string)($f['prix'] ?? ''),
            'prix_en' => (string)($f['prix_en'] ?? $f['prix'] ?? ''),
            'detail' => (string)($f['detail'] ?? ''),
            'lien' => $lien,
            'plafond_usd' => (float)($f['plafond_usd'] ?? 0),
            'periode' => ($f['periode'] ?? 'mois') === 'total' ? 'total' : 'mois',
            'approfondi' => (bool)($f['approfondi'] ?? false),
        ];
    }
    sortir(200, ['ok' => true, 'mode' => $MODE, 'ouvert' => rv_dossier_stripe($config) !== null && count(array_filter((array)$S['secrets'], fn($x) => is_string($x) && $x !== '')) > 0, 'formules' => $liste]);
}

if ($action !== '') erreur(404, 'action');
if ($methode !== 'POST') erreur(405, 'methode');

// Événement Stripe.
$DOSSIER = rv_dossier_stripe($config);
$secrets = array_values(array_filter((array)$S['secrets'], fn($s) => is_string($s) && $s !== ''));
if ($DOSSIER === null || count($secrets) === 0) erreur(503, 'ferme');

$brut = file_get_contents('php://input', false, null, 0, TAILLE_MAX_EVENEMENT + 1);
if ($brut === false || $brut === '' || strlen($brut) > TAILLE_MAX_EVENEMENT) erreur(413, 'taille');

// Signature Stripe : « t=<horodatage>,v1=<HMAC-SHA256 de "t.corps">[,v1=…] ». Corps brut, tel que reçu.
function signature_valide(string $brut, string $entete, array $secrets, int $tolerance): bool
{
    $t = '';
    $v1 = [];
    foreach (explode(',', $entete) as $morceau) {
        $kv = explode('=', trim($morceau), 2);
        if (count($kv) !== 2) continue;
        if ($kv[0] === 't') $t = $kv[1];
        elseif ($kv[0] === 'v1') $v1[] = $kv[1];
    }
    if ($t === '' || !ctype_digit($t) || count($v1) === 0) return false;
    if (abs(time() - (int)$t) > $tolerance) return false;
    foreach ($secrets as $secret) {
        $attendu = hash_hmac('sha256', $t . '.' . $brut, $secret);
        foreach ($v1 as $s) if (hash_equals($attendu, $s)) return true;
    }
    return false;
}

if (!signature_valide($brut, (string)($_SERVER['HTTP_STRIPE_SIGNATURE'] ?? ''), $secrets, (int)$S['tolerance_s'])) erreur(400, 'signature');

$ev = json_decode($brut, true);
if (!is_array($ev) || !is_string($ev['id'] ?? null) || !is_string($ev['type'] ?? null) || !is_array($ev['data']['object'] ?? null)) erreur(400, 'format');
// Un événement de l'autre mode (essai pendant que le réel tourne, ou l'inverse) est reçu sans rien changer.
if ((bool)($ev['livemode'] ?? false) !== ($MODE === 'live')) sortir(200, ['ok' => true, 'resultat' => 'autre_mode']);

if (!is_dir($DOSSIER) && !@mkdir($DOSSIER, 0700, true) && !is_dir($DOSSIER)) erreur(500, 'stockage_indisponible');

// Fichier des abonnements payés, modifié sous verrou.
function avec_magasin(string $chemin, callable $f)
{
    $h = fopen($chemin, 'c+');
    if ($h === false) erreur(500, 'stockage_indisponible');
    flock($h, LOCK_EX);
    $texte = stream_get_contents($h);
    $m = json_decode($texte === false || $texte === '' ? '{}' : $texte, true);
    if (!is_array($m)) $m = [];
    foreach (['abonnements', 'fins', 'orphelins', 'evenements'] as $k) if (!is_array($m[$k] ?? null)) $m[$k] = [];
    [$m, $resultat] = $f($m);
    $json = json_encode($m, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    ftruncate($h, 0);
    rewind($h);
    fwrite($h, $json);
    fflush($h);
    flock($h, LOCK_UN);
    fclose($h);
    return $resultat;
}

// Début d'un texte, en caractères (mbstring n'est pas installé sur le serveur).
function debut(string $s, int $n): string { return preg_match('/^.{0,' . $n . '}/us', $s, $m) === 1 ? $m[0] : ''; }

function jour(int $horodatage): string { return date('Y-m-d', $horodatage); }
function plus_tard(string $a, string $b): string { return $a === '' ? $b : ($b === '' ? $a : max($a, $b)); }

// Formule d'un paiement : par le lien de paiement (plink_…), ou par l'identifiant mis en métadonnée du lien.
function formule_de(array $o, array $formules): ?string
{
    $lien = (string)($o['payment_link'] ?? '');
    $meta = (string)($o['metadata']['formule'] ?? '');
    foreach ($formules as $id => $f) {
        if (!is_string($id) || !is_array($f)) continue;
        if ($lien !== '' && hash_equals((string)($f['payment_link'] ?? ''), $lien)) return $id;
    }
    return ($meta !== '' && isset($formules[$meta]) && is_array($formules[$meta])) ? $meta : null;
}

// Nom affiché à l'abonné : le champ « organisation » du paiement s'il existe, sinon le nom du payeur.
function nom_de(array $o): string
{
    foreach ((array)($o['custom_fields'] ?? []) as $c) {
        $v = is_array($c) ? trim((string)($c['text']['value'] ?? $c['dropdown']['value'] ?? '')) : '';
        if ($v !== '' && in_array((string)($c['key'] ?? ''), ['organisation', 'organization', 'commune'], true)) return debut($v, 120);
    }
    $n = trim((string)($o['customer_details']['business_name'] ?? $o['customer_details']['name'] ?? ''));
    return $n !== '' ? debut($n, 120) : 'Abonnement RegenVox';
}

function abonnement_de_facture(array $o): string
{
    $s = $o['subscription'] ?? ($o['parent']['subscription_details']['subscription'] ?? '');
    if (is_array($s)) $s = $s['id'] ?? '';
    return is_string($s) ? $s : '';
}

$resultat = avec_magasin($DOSSIER . '/abonnements.json', function (array $m) use ($ev, $S) {
    if (isset($m['evenements'][$ev['id']])) return [$m, 'deja_traite'];
    $o = $ev['data']['object'];
    $grace = 86400 * max(0, (int)$S['grace_jours']);
    $r = 'ignore';

    switch ($ev['type']) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
            // Virement ou autre paiement différé : l'abonnement attend « async_payment_succeeded ».
            if (!in_array($o['payment_status'] ?? '', ['paid', 'no_payment_required'], true)) { $r = 'paiement_en_attente'; break; }
            $fid = formule_de($o, (array)$S['formules']);
            if ($fid === null) { $r = 'autre_produit'; break; }
            $f = $S['formules'][$fid];
            $session = (string)($o['id'] ?? '');
            $ref = strtolower((string)($o['client_reference_id'] ?? ''));
            if (preg_match('/^[0-9a-f]{64}$/', $ref) !== 1) {
                // Payé sans passer par la page Abonnement : aucun code. Gardé pour qu'on en attribue un à la main.
                $deja = array_filter($m['orphelins'], fn($x) => ($x['session'] ?? '') === $session);
                if (!$deja) $m['orphelins'][] = ['session' => $session, 'formule' => $fid, 'le' => date('c'), 'livemode' => (bool)($ev['livemode'] ?? false)];
                $r = 'sans_code';
                break;
            }
            if (isset($m['abonnements'][$ref]) && ($m['abonnements'][$ref]['session'] ?? '') !== $session) { $r = 'conflit'; break; }
            $sub = is_string($o['subscription'] ?? null) ? $o['subscription'] : '';
            $expire = date('Y-m-d', strtotime('+' . max(1, (int)($f['duree_jours'] ?? 31)) . ' days'));
            if ($sub !== '' && isset($m['fins'][$sub])) $expire = plus_tard($expire, jour((int)$m['fins'][$sub] + $grace));
            $m['abonnements'][$ref] = [
                'nom' => nom_de($o),
                'plafond_usd' => (float)($f['plafond_usd'] ?? 0),
                'periode' => ($f['periode'] ?? 'mois') === 'total' ? 'total' : 'mois',
                'approfondi' => (bool)($f['approfondi'] ?? false),
                'expire' => plus_tard((string)($m['abonnements'][$ref]['expire'] ?? ''), $expire),
                'formule' => $fid,
                'session' => $session,
                'subscription' => $sub,
                'livemode' => (bool)($ev['livemode'] ?? false),
                'cree_le' => (string)($m['abonnements'][$ref]['cree_le'] ?? date('c')),
            ];
            $r = 'abonnement_ouvert';
            break;
        }
        case 'invoice.paid': {
            // Échéance payée (première ou suivante) : l'abonnement court jusqu'à la fin de la période, plus la grâce.
            $sub = abonnement_de_facture($o);
            if ($sub === '') break;
            $fin = 0;
            foreach ((array)($o['lines']['data'] ?? []) as $l) $fin = max($fin, (int)($l['period']['end'] ?? 0));
            if ($fin <= 0) break;
            $m['fins'][$sub] = max((int)($m['fins'][$sub] ?? 0), $fin);
            $r = 'echeance_notee';
            foreach ($m['abonnements'] as $e => $a) {
                if (($a['subscription'] ?? '') !== $sub) continue;
                $m['abonnements'][$e]['expire'] = plus_tard((string)($a['expire'] ?? ''), jour($fin + $grace));
                $r = 'abonnement_prolonge';
            }
            break;
        }
        case 'customer.subscription.deleted': {
            // Abonnement terminé (résilié à l'échéance, ou arrêté) : le code cesse de valoir dès aujourd'hui.
            $sub = (string)($o['id'] ?? '');
            if ($sub === '') break;
            unset($m['fins'][$sub]);
            $hier = date('Y-m-d', strtotime('-1 day'));
            foreach ($m['abonnements'] as $e => $a) {
                if (($a['subscription'] ?? '') !== $sub) continue;
                $m['abonnements'][$e]['expire'] = min((string)($a['expire'] ?: $hier), $hier);
                $r = 'abonnement_ferme';
            }
            break;
        }
    }

    $m['evenements'][$ev['id']] = time();
    if (count($m['evenements']) > EVENEMENTS_GARDES) {
        asort($m['evenements']);
        $m['evenements'] = array_slice($m['evenements'], -EVENEMENTS_GARDES, null, true);
    }
    return [$m, $r];
});

sortir(200, ['ok' => true, 'resultat' => $resultat]);
