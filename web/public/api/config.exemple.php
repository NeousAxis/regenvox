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
    // Autres sites autorisés à appeler ce serveur, si la plateforme n'est pas servie depuis le même site.
    'origines' => [],
];
