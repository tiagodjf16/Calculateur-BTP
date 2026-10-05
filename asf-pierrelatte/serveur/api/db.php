<?php
// API de données : GET (lecture filtrée selon le compte), PUT (écrire un document), DELETE (en supprimer un).
// Qui peut lire et écrire quoi est décidé ici, côté serveur : l'affichage du site ne suffit pas.
require __DIR__ . '/session.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');

/* Rang minimal pour lire un document (0 public, 1 joueur, 2 coach, 3 bureau). */
/* une compo publiée n'est montrée au public qu'à partir d'1 h avant le coup d'envoi (l'adversaire ne la voit pas trop tôt) */
function compo_devoilee($data): bool {
    $date = (string) ($data['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return true;
    $heure = preg_match('/^\d{1,2}:\d{2}/', (string) ($data['heure'] ?? '')) ? substr((string) $data['heure'], 0, 5) : '12:00';
    try {
        $debut = new DateTimeImmutable("$date $heure", new DateTimeZone('Europe/Paris'));
        return time() >= $debut->getTimestamp() - 3600;
    } catch (Throwable $e) { return true; }
}
function rang_lecture(string $chemin, $data): int {
    $racine = explode('/', $chemin)[0];
    if (in_array($racine, ['inscriptions', 'acces', 'roles', 'reunions'], true)) return 3;
    if (in_array($chemin, ['site/abonnes', 'site/fff', 'site/rappel'], true)) return 3;
    if ($racine === 'effectifs' || $chemin === 'site/affiches') return 2;
    if ($racine === 'inscrits-stage') return 2;              // coordonnées des familles : réservées au club
    if ($racine === 'messages') return 3;                    // messages du site : le bureau voit tout ; chaque destinataire voit les siens (plus bas)
    if ($racine === 'notifs') return 99;                     // messages personnels des notifications : lus seulement par push.php
    if ($racine === 'compos') {
        if (empty($data['publie'])) return 2;                // brouillon : le staff seulement
        // convocation de l'école de foot (des enfants, U6 à U11) : le club seulement, jamais le public
        $eqC = (string) ($data['equipe'] ?? '');
        if (!empty($data['convocationSeule']) || preg_match('/^\s*U\s?(?:[5-9]|1[01])(?!\d)/iu', $eqC) || preg_match('/u\s?6\s*(à|a)\s*u\s?11/iu', $eqC)) return 1;
        return compo_devoilee($data) ? 0 : 1;               // publiée : le public ne la voit qu'1 h avant le coup d'envoi, les joueurs du club tout de suite
    }
    if (in_array($racine, ['entrainements', 'presences', 'engagements'], true)) return 1;
    return 0;
}

/* Droit d'écrire ou de supprimer un document. */
function peut_ecrire(string $chemin, ?array $compte, int $rang, bool $existe, bool $suppression): bool {
    // les droits des comptes (onglets, équipes gérées, rôle choisi) : les personnes autorisées seulement (voir auth.php)
    if ($chemin === 'site/permissions') return cle_valide() || peut_gerer_comptes($compte);
    if ($rang >= 3) return true;
    $racine = explode('/', $chemin)[0];
    // demande de licence en ligne : tout le monde peut en déposer une, sans pouvoir la modifier ensuite
    if (!$suppression && !$existe && preg_match('#^inscriptions/[a-z0-9-]{1,40}/demandes/[a-z0-9-]{1,40}$#i', $chemin)) return true;
    // inscription à un stage depuis le site : même principe, déposée une fois, jamais modifiable par le public
    if (!$suppression && !$existe && preg_match('#^inscrits-stage/[a-z0-9-]{1,60}$#i', $chemin)) return true;
    // message envoyé depuis la page Contact : déposé une fois, jamais modifiable par le public
    if (!$suppression && !$existe && preg_match('#^messages/[a-z0-9-]{1,60}$#i', $chemin)) return true;
    if ($rang >= 2 && in_array($racine, ['compos', 'effectifs', 'entrainements', 'presences', 'matchs', 'tournois', 'stages', 'inscrits-stage', 'messages', 'clubs-ajoutes'], true)) return true;
    if ($rang >= 1 && $compte) {
        $moi = 'c' . $compte['id'];
        if (in_array($chemin, ["presences/$moi", "engagements/$moi", "acces/$moi"], true)) return true;
    }
    return false;
}

try {
    $pdo = base();
    $methode = $_SERVER['REQUEST_METHOD'];
    $compte = compte_actuel();
    $rang = rang_effectif();

    if ($methode === 'GET') {
        $sortie = [];
        $monMail = strtolower(trim((string) ($compte['email'] ?? '')));
        $simple = fn($t) => trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', (string) $t) ?: '')), '-');
        $monNom = $simple($compte['nom'] ?? '');
        foreach ($pdo->query('SELECT path, data FROM documents') as $ligne) {
            $data = json_decode($ligne['data'], true);
            $ok = $rang >= rang_lecture($ligne['path'], $data);
            // un message du site est aussi visible par la personne à qui il est adressé
            if (!$ok && $compte && str_starts_with($ligne['path'], 'messages/')
                && (((string) ($data['pourCompte'] ?? '') !== '' && (string) $data['pourCompte'] === (string) ($compte['id'] ?? ''))
                    || ($monMail !== '' && strtolower(trim((string) ($data['pourEmail'] ?? ''))) === $monMail)
                    || ($monNom !== '' && $simple($data['pourNom'] ?? '') === $monNom))) $ok = true;
            if ($ok) $sortie[$ligne['path']] = $data;
        }
        echo $sortie ? json_encode($sortie, JSON_UNESCAPED_UNICODE) : '{}';
        exit;
    }

    verifier_origine();
    $corps = json_decode(file_get_contents('php://input'), true) ?: [];
    $chemin = (string) ($corps['path'] ?? '');
    if ($chemin === '' || strlen($chemin) > 250 || !preg_match('#^[a-z0-9_-]+(/[A-Za-z0-9_.:-]+)+$#i', $chemin)) {
        http_response_code(400); echo json_encode(['erreur' => 'chemin invalide']); exit;
    }
    $st = $pdo->prepare('SELECT 1 FROM documents WHERE path = ?');
    $st->execute([$chemin]);
    $existe = (bool) $st->fetchColumn();

    if (!in_array($methode, ['PUT', 'DELETE'], true)) { http_response_code(405); echo json_encode(['erreur' => 'méthode non gérée']); exit; }
    if (!peut_ecrire($chemin, $compte, $rang, $existe, $methode === 'DELETE')) {
        http_response_code($compte || cle_valide() ? 403 : 401);
        echo json_encode(['erreur' => $compte ? "Ton compte n'a pas le droit de modifier cet élément." : 'Connecte-toi pour modifier.']);
        exit;
    }
    // changer le « rôle choisi » d'un compte (joueur et coach, coach et bureau…), c'est donner l'accès dirigeant :
    // l'administrateur principal et les comptes « Joueur, coach et bureau » seulement
    if ($chemin === 'site/permissions' && !cle_valide() && !peut_donner_roles($compte)) {
        $avant = permissions_site();
        $apres = $methode === 'DELETE' ? [] : (is_array($corps['data'] ?? null) ? $corps['data'] : []);
        $serveur = [];                                           // sans « rôle choisi », c'est le rôle du compte
        foreach ($pdo->query('SELECT id, role FROM comptes') as $l) $serveur['c' . $l['id']] = (string) $l['role'];
        $role = fn($p, $k) => (is_array($p[$k] ?? null) ? (string) ($p[$k]['roleChoisi'] ?? '') : '') ?: ($serveur[$k] ?? '');
        foreach (array_unique(array_merge(array_keys($avant), array_keys($apres))) as $k) {
            if ($role($avant, $k) !== $role($apres, $k)) {
                http_response_code(403);
                echo json_encode(['erreur' => "Seules les personnes qui ont tous les rôles (joueur, coach et bureau) peuvent donner l'accès dirigeant ou changer un rôle."]);
                exit;
            }
        }
    }

    if ($methode === 'DELETE') {
        $pdo->prepare('DELETE FROM documents WHERE path = ?')->execute([$chemin]);
        echo json_encode(['ok' => true]); exit;
    }
    $json = json_encode($corps['data'] ?? new stdClass(), JSON_UNESCAPED_UNICODE);
    if (strlen($json) > 2000000) { http_response_code(413); echo json_encode(['erreur' => 'document trop gros']); exit; }
    if ($rang < 2 && str_starts_with($chemin, 'inscrits-stage/') && strlen($json) > 6000) { http_response_code(413); echo json_encode(['erreur' => 'inscription trop longue']); exit; }
    if ($rang < 2 && str_starts_with($chemin, 'messages/') && strlen($json) > 9000) { http_response_code(413); echo json_encode(['erreur' => 'message trop long']); exit; }
    $pdo->prepare('INSERT INTO documents (path, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), maj = NOW()')
        ->execute([$chemin, $json]);
    // une demande de licence crée aussi son dossier parent, pour apparaître dans la liste du bureau
    if (preg_match('#^(inscriptions/[a-z0-9-]+)/demandes/#i', $chemin, $p)) {
        $pdo->prepare('INSERT IGNORE INTO documents (path, data) VALUES (?, ?)')->execute([$p[1], json_encode(['maj' => time()])]);
    }
    echo json_encode(['ok' => true]);

    // notifications ciblées, envoyées après avoir répondu (le visiteur n'attend pas)
    $nouveau = !$existe && (str_starts_with($chemin, 'messages/') || str_starts_with($chemin, 'inscrits-stage/'));
    if ($nouveau && is_file(__DIR__ . '/push-lib.php')) {
        if (function_exists('litespeed_finish_request')) litespeed_finish_request();
        elseif (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        ignore_user_abort(true);
        try {
            require_once __DIR__ . '/push-lib.php';
            $d = $corps['data'] ?? [];
            if (str_starts_with($chemin, 'messages/')) {
                $pour = (string) ($d['pourCompte'] ?? '');
                $texte = trim(($d['objet'] ?? '') . ' : ' . mb_substr((string) ($d['texte'] ?? ''), 0, 120));
                notifier_cibles($pdo, $pour !== '' ? [$pour] : [], $pour !== '' ? [] : ['bureau'],
                    'Nouveau message de ' . ($d['nom'] ?? "quelqu'un"), $texte, '/?msg=' . rawurlencode(substr($chemin, 9)) . '#espace');
            } else {
                notifier_cibles($pdo, [], ['bureau'], 'Nouvelle inscription au stage',
                    trim(($d['prenom'] ?? '') . ' ' . ($d['nom'] ?? '') . ' (' . ($d['categorie'] ?? '') . ') · ' . ($d['stage'] ?? '')), '/#espace');
            }
        } catch (Throwable $e) { /* une notification ratée ne doit jamais bloquer l'enregistrement */ }
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['erreur' => 'Erreur du serveur.']);
}
