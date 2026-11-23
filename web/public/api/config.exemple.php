<?php
// Exemple de réglages du serveur de collecte. Copier en config.php (jamais publié dans le dépôt) et adapter.
return [
    // Dossier des données, de préférence hors du site publié. Vide : choix automatique.
    'dossier' => '',
    // Empreintes SHA-256 des codes d'abonnement acceptés pour créer une consultation (en majuscules, sans espaces).
    // Calcul : npx tsx scripts/code_consultation.ts. Liste vide : tout le monde peut créer une consultation.
    'codes' => [
        // 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ],
    // Relais IA des abonnements (ia.php) : clé Anthropic de Régénère Plus. Vide : relais fermé.
    // Ce fichier doit rester hors du site publié (REGENVOX_CONFIG), jamais dans web/public/api.
    'anthropic_cle' => '',
    // Abonnements : empreinte SHA-256 du code => réglages. Calcul : npx tsx scripts/code_consultation.ts.
    // Un code d'abonnement permet aussi de créer une consultation réelle quand la liste « codes » n'est pas vide.
    // plafond_usd : dépense IA permise ; periode : 'mois' (remise à zéro chaque mois) ou 'total' (code d'essai) ;
    // expire : AAAA-MM-JJ, facultatif ; approfondi : tests approfondis permis.
    'abonnements' => [
        // 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' => ['nom' => 'Commune de Vuadens', 'plafond_usd' => 60, 'periode' => 'mois', 'expire' => '2027-12-31', 'approfondi' => true],
        // '<empreinte>' => ['nom' => 'Essai Commune X', 'plafond_usd' => 6, 'periode' => 'total', 'approfondi' => false],
    ],
    // Autres sites autorisés à appeler ce serveur, si la plateforme n'est pas servie depuis le même site.
    'origines' => [],
    // Vrai seulement si le serveur est derrière un proxy de confiance (l'adresse du client est alors la dernière de X-Forwarded-For).
    // Laisser faux sinon : cet en-tête, écrit par le client, permettrait de contourner les limites.
    'proxy' => false,
];
