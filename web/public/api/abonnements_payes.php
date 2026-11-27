<?php
// Abonnements payés en ligne (AGPL-3.0-or-later).
//
// stripe.php les range dans un fichier à part, à côté des données ; ia.php et consultation.php les ajoutent à ceux
// de config.php. Comme pour config.php, seule l'empreinte du code est gardée : le code lui-même est tiré au sort
// dans le navigateur de l'abonné, avant le paiement, et n'arrive jamais ici.
// Sans 'dossier' dans config.php, rien n'est lu ni écrit : le paiement en ligne reste fermé.

declare(strict_types=1);

// Dossier du paiement en ligne, ou null s'il est fermé.
function rv_dossier_stripe(array $config): ?string
{
    $d = (string)($config['dossier'] ?? '');
    return $d === '' ? null : rtrim($d, '/') . '/stripe';
}

// Mode attendu des événements Stripe : 'live' (vrais paiements) ou 'test'.
function rv_mode_stripe(array $config): string
{
    return (($config['stripe']['mode'] ?? 'test') === 'live') ? 'live' : 'test';
}

// Abonnements payés, au format de la liste « abonnements » de config.php. Ceux d'un autre mode sont écartés :
// un code payé en mode test ne vaut rien une fois le paiement passé en mode réel.
function rv_abonnements_payes(array $config): array
{
    $d = rv_dossier_stripe($config);
    if ($d === null || !is_file($d . '/abonnements.json')) return [];
    $s = json_decode((string)@file_get_contents($d . '/abonnements.json'), true);
    if (!is_array($s) || !is_array($s['abonnements'] ?? null)) return [];
    $live = rv_mode_stripe($config) === 'live';
    $liste = [];
    foreach ($s['abonnements'] as $e => $a) {
        if (!is_string($e) || preg_match('/^[0-9a-f]{64}$/', $e) !== 1 || !is_array($a)) continue;
        if ((bool)($a['livemode'] ?? false) !== $live) continue;
        $liste[$e] = [
            'nom' => (string)($a['nom'] ?? ''),
            'plafond_usd' => (float)($a['plafond_usd'] ?? 0),
            'periode' => ($a['periode'] ?? 'mois') === 'total' ? 'total' : 'mois',
            'approfondi' => (bool)($a['approfondi'] ?? false),
            'expire' => (string)($a['expire'] ?? ''),
        ];
    }
    return $liste;
}

// Ceux de config.php d'abord : en cas de doublon, le réglage écrit à la main l'emporte.
function rv_avec_abonnements_payes(array $config): array
{
    $config['abonnements'] = (is_array($config['abonnements'] ?? null) ? $config['abonnements'] : []) + rv_abonnements_payes($config);
    return $config;
}
