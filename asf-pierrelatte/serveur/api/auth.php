<?php
// Connexion, création de compte et gestion des comptes par le bureau.
//   GET  /api/auth?action=moi
//   POST /api/auth?action=connexion      { email, mdp }
//   POST /api/auth?action=deconnexion
//   POST /api/auth?action=inscription    { nom, email, mdp, equipe, role, cle? }
//   POST /api/auth?action=motdepasse     { ancien, nouveau }
//   GET  /api/auth?action=comptes                                   (bureau)
//   POST /api/auth?action=maj            { id, role, equipe, joueurNom, actif, licence? }   (bureau autorisé)
//   Rôles, comptes et codes : seuls l'administrateur principal et les membres du bureau qui ont l'onglet « Accès et rôles »
//   peuvent les changer. Un coach ou un dirigeant doit avoir un numéro de licence (sinon il n'a que les droits d'un joueur).
//   POST /api/auth?action=reinit         { id }                     (bureau)
//   POST /api/auth?action=supprimer      { id }                     (bureau)
require __DIR__ . '/session.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function sortir(int $code, array $data): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }

try {
    $pdo = base();
    $action = $_GET['action'] ?? 'moi';
    $m = $_SERVER['REQUEST_METHOD'];
    if ($m !== 'GET') verifier_origine();
    $corps = json_decode(file_get_contents('php://input'), true) ?: [];
    $aucunBureau = (int) $pdo->query("SELECT COUNT(*) FROM comptes WHERE role = 'bureau' AND actif = 1")->fetchColumn() === 0;

    if ($action === 'moi') {
        $c = compte_actuel();
        sortir(200, $c ? ['connecte' => true, 'compte' => public_compte($c) + ['fiche' => fiche_joueur($c)]] : ['connecte' => false, 'aucunBureau' => $aucunBureau]);
    }

    if ($action === 'connexion' && $m === 'POST') {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $st = $pdo->prepare('SELECT COUNT(*) FROM tentatives WHERE ip = ? AND moment > DATE_SUB(NOW(), INTERVAL 15 MINUTE)');
        $st->execute([$ip]);
        if ((int) $st->fetchColumn() >= 8) sortir(429, ['erreur' => 'Trop de tentatives. Réessaie dans un quart d\'heure.']);
        $email = mb_strtolower(trim((string) ($corps['email'] ?? '')));
        $mdp = (string) ($corps['mdp'] ?? '');
        $st = $pdo->prepare('SELECT * FROM comptes WHERE email = ?');
        $st->execute([$email]);
        $c = $st->fetch(PDO::FETCH_ASSOC);
        $naissance = (string) ($corps['naissance'] ?? '');
        $echec = function () use ($pdo, $ip) {
            $pdo->prepare('INSERT INTO tentatives (ip, moment) VALUES (?, NOW())')->execute([$ip]);
            usleep(400000);
            sortir(401, ['erreur' => 'Identifiant ou code incorrect.']);
        };
        // première connexion d'un joueur avec le code commun (identité vérifiée ensuite par la date de naissance),
        // puis son compte est créé à partir des effectifs
        if (!$c && hash_equals(CODE_COMMUN, $mdp)) {
            $liste = identifiants_joueurs();
            if (isset($liste[$email])) {
                $j = $liste[$email];
                $pdo->prepare("INSERT INTO comptes (email, nom, hash, role, role_demande, equipe, joueur_nom, actif, doit_changer, cree) VALUES (?, ?, ?, 'joueur', 'joueur', ?, ?, 1, 1, NOW())")
                    ->execute([$email, $j['nom'], password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), $j['equipe'], $j['nom']]);
                $st->execute([$email]);
                $c = $st->fetch(PDO::FETCH_ASSOC);
            }
        }
        $parCode = $c && !password_verify($mdp, $c['hash']) && hash_equals(CODE_COMMUN, $mdp) && code_commun_valable($c);
        $bon = $c && (password_verify($mdp, $c['hash']) || $parCode);

        if (!$bon) {
            $pdo->prepare('INSERT INTO tentatives (ip, moment) VALUES (?, NOW())')->execute([$ip]);
            usleep(400000);
            sortir(401, ['erreur' => 'Identifiant ou code incorrect.']);
        }
        if (!(int) $c['actif']) sortir(403, ['erreur' => 'Ce compte est désactivé. Rapproche-toi du bureau du club.']);
        if (!hash_equals(CODE_COMMUN, $mdp) && password_needs_rehash($c['hash'], PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE comptes SET hash = ? WHERE id = ?')->execute([password_hash($mdp, PASSWORD_DEFAULT), $c['id']]);
        }
        $pdo->prepare('DELETE FROM tentatives WHERE ip = ?')->execute([$ip]);
        ouvrir_session((int) $c['id'], !empty($corps['rester']));
        sortir(200, ['ok' => true, 'compte' => public_compte($c)]);
    }

    if ($action === 'deconnexion' && $m === 'POST') { fermer_session(); sortir(200, ['ok' => true]); }

    if ($action === 'inscription' && $m === 'POST') {
        $nom = trim(preg_replace('/\s+/', ' ', (string) ($corps['nom'] ?? '')));
        $email = mb_strtolower(trim((string) ($corps['email'] ?? '')));
        $mdp = (string) ($corps['mdp'] ?? '');
        $role = in_array($corps['role'] ?? '', ['joueur', 'entraineur', 'bureau'], true) ? $corps['role'] : 'joueur';
        $equipe = mb_substr(trim((string) ($corps['equipe'] ?? '')), 0, 80);
        if (mb_strlen($nom) < 3) sortir(400, ['erreur' => 'Indique ton prénom et ton nom.']);
        if (!preg_match('/^[a-z0-9._@-]{3,190}$/', $email)) sortir(400, ['erreur' => 'Identifiant invalide : lettres, chiffres, point ou tiret.']);
        if (strlen($mdp) < 8) sortir(400, ['erreur' => 'Le mot de passe doit faire au moins 8 caractères.']);
        $premier = $aucunBureau && !empty($corps['cle']) && hash_equals(CLE_ECRITURE, (string) $corps['cle']);
        if (!$premier) sortir(403, ['erreur' => 'Les accès sont créés par le club. Demande tes identifiants à ton coach ou au bureau.']);
        $st = $pdo->prepare('SELECT id FROM comptes WHERE email = ?');
        $st->execute([$email]);
        if ($st->fetch()) sortir(409, ['erreur' => 'Un compte existe déjà avec cette adresse. Connecte-toi, ou demande au bureau de réinitialiser ton mot de passe.']);
        $pdo->prepare('INSERT INTO comptes (email, nom, hash, role, role_demande, equipe, actif, cree) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())')
            ->execute([$email, $nom, password_hash($mdp, PASSWORD_DEFAULT), $premier ? 'bureau' : 'joueur', $role, $equipe, $premier ? 1 : 0]);
        $id = (int) $pdo->lastInsertId();
        if ($premier) { ouvrir_session($id); sortir(200, ['ok' => true, 'actif' => true]); }
        sortir(200, ['ok' => true, 'actif' => false]);
    }

    if ($action === 'motdepasse' && $m === 'POST') {
        $c = compte_actuel();
        if (!$c) sortir(401, ['erreur' => 'Connecte-toi d\'abord.']);
        $ancien = (string) ($corps['ancien'] ?? '');
        $parCommun = !password_verify($ancien, $c['hash']) && hash_equals(CODE_COMMUN, $ancien) && code_commun_valable($c);
        $okAncien = password_verify($ancien, $c['hash']) || $parCommun;
        if (!$okAncien) sortir(400, ['erreur' => 'Code ou mot de passe actuel incorrect.']);
        if ($parCommun) {
            $naissance = (string) ($corps['naissance'] ?? '');
            $v = naissance_ok($c['joueur_nom'] ?: $c['nom'], $naissance);
            if ($v === null) sortir(403, ['erreur' => "Ta date de naissance n'est pas encore enregistrée par le club. Demande à ton coach."]);
            if ($v === false) {
                $pdo->prepare('INSERT INTO tentatives (ip, moment) VALUES (?, NOW())')->execute([$_SERVER['REMOTE_ADDR'] ?? '']);
                usleep(400000);
                sortir(400, ['erreur' => "La date de naissance ne correspond pas à celle enregistrée par le club."]);
            }
            $pdo->prepare('UPDATE comptes SET naissance = ? WHERE id = ?')->execute([$naissance, $c['id']]);
        }
        $refus = mdp_refus((string) ($corps['nouveau'] ?? ''), $c['email']);
        if ($refus !== '') sortir(400, ['erreur' => $refus]);
        $pdo->prepare('UPDATE comptes SET hash = ?, doit_changer = 0 WHERE id = ?')->execute([password_hash($corps['nouveau'], PASSWORD_DEFAULT), $c['id']]);
        $longue = session_longue();
        $pdo->prepare('DELETE FROM sessions WHERE compte_id = ?')->execute([$c['id']]);
        ouvrir_session((int) $c['id'], $longue);
        sortir(200, ['ok' => true]);
    }

    // ---- réservé au bureau ----
    if (rang(compte_actuel()) < 3 && !cle_valide()) sortir(403, ['erreur' => 'Réservé au bureau du club.']);

    if ($action === 'naissances' && $m === 'POST') {
        $ajout = $pdo->prepare('INSERT INTO naissances (cle, hash, jour) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE hash = VALUES(hash), jour = VALUES(jour)');
        $n = 0;
        foreach (array_slice($corps['liste'] ?? [], 0, 150) as $x) {
            $nom = cle_joueur((string) ($x['nom'] ?? '')); $d = (string) ($x['naissance'] ?? '');
            if ($nom === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) continue;
            $ajout->execute([$nom, password_hash($d, PASSWORD_BCRYPT, ['cost' => 9]), $d]); $n++;
        }
        sortir(200, ['ok' => true, 'enregistrees' => $n]);
    }
    if ($action === 'identifiants') {
        if (!cle_valide() && !peut_gerer_comptes(compte_actuel())) sortir(403, ['erreur' => "Seules les personnes autorisées (bureau, avec l'onglet « Accès et rôles ») voient les identifiants des joueurs."]);
        $etat = [];
        foreach ($pdo->query('SELECT email, doit_changer FROM comptes') as $l) $etat[$l['email']] = (int) $l['doit_changer'] ? 'code pas encore changé' : 'connecté';
        $l = [];
        $dates = [];
        foreach ($pdo->query('SELECT cle FROM naissances') as $x) $dates[$x['cle']] = true;
        foreach (identifiants_joueurs() as $id => $j) $l[] = ['identifiant' => $id, 'nom' => $j['nom'], 'equipe' => $j['equipe'],
            'etat' => $etat[$id] ?? 'jamais connecté', 'naissance' => isset($dates[cle_joueur($j['nom'])])];
        sortir(200, ['code' => CODE_COMMUN, 'jours' => CODE_COMMUN_JOURS, 'liste' => $l]);
    }
    if ($action === 'comptes') {
        $l = $pdo->query('SELECT id, email, nom, role, role_demande, equipe, joueur_nom, licence, actif, cree, derniere FROM comptes ORDER BY actif, nom')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($l as &$x) $x['sansLicence'] = in_array($x['role'], ['entraineur', 'bureau'], true) && !a_licence($x);
        unset($x);
        sortir(200, ['comptes' => $l, 'gerer' => cle_valide() || peut_gerer_comptes(compte_actuel())]);
    }
    // ---- créer les comptes, changer les rôles, donner les codes : les personnes autorisées seulement ----
    if (!cle_valide() && !peut_gerer_comptes(compte_actuel())) {
        sortir(403, ['erreur' => "Seules les personnes autorisées (bureau, avec l'onglet « Accès et rôles ») peuvent gérer les comptes et donner l'accès dirigeant."]);
    }
    $id = (int) ($corps['id'] ?? 0);
    $moi = compte_actuel();
    // l'administrateur principal ne peut être ni rétrogradé, ni désactivé, ni supprimé par un autre compte
    $st = $pdo->prepare('SELECT email FROM comptes WHERE id = ?'); $st->execute([$id]);
    $cible = (string) $st->fetchColumn();
    if ($cible === ADMIN_PRINCIPAL && in_array($action, ['maj', 'supprimer'], true) && (!$moi || $moi['email'] !== ADMIN_PRINCIPAL)) {
        sortir(403, ['erreur' => "Le compte de l'administrateur principal ne peut pas être modifié par un autre compte."]);
    }
    if ($action === 'maj' && $m === 'POST') {
        $role = in_array($corps['role'] ?? '', ['joueur', 'entraineur', 'bureau'], true) ? $corps['role'] : 'joueur';
        if ($moi && $id === (int) $moi['id'] && $role !== 'bureau') sortir(400, ['erreur' => 'Tu ne peux pas retirer tes propres droits de bureau.']);
        $st = $pdo->prepare('SELECT nom, licence FROM comptes WHERE id = ?'); $st->execute([$id]);
        $avant = $st->fetch(PDO::FETCH_ASSOC);
        if (!$avant) sortir(404, ['erreur' => 'Compte introuvable.']);
        // numéro de licence : gardé tel quel s'il n'est pas envoyé
        $licence = (string) $avant['licence'];
        if (array_key_exists('licence', $corps)) {
            $brut = trim((string) $corps['licence']);
            $licence = licence_propre($brut);
            if ($brut !== '' && $licence === '') sortir(400, ['erreur' => 'Numéro de licence invalide : des chiffres seulement (10 en général).']);
        }
        if ($role !== 'joueur' && !empty($corps['actif']) && $cible !== ADMIN_PRINCIPAL && $licence === '') {
            sortir(400, ['erreur' => 'Pas de licence, pas d\'accès dirigeant : indique le numéro de licence de ' . $avant['nom'] . ' pour lui donner ce rôle.']);
        }
        $pdo->prepare('UPDATE comptes SET role = ?, equipe = ?, joueur_nom = ?, actif = ?, licence = ? WHERE id = ?')
            ->execute([$role, mb_substr((string) ($corps['equipe'] ?? ''), 0, 80), mb_substr((string) ($corps['joueurNom'] ?? ''), 0, 120), empty($corps['actif']) ? 0 : 1, $licence, $id]);
        if (empty($corps['actif'])) $pdo->prepare('DELETE FROM sessions WHERE compte_id = ?')->execute([$id]);
        sortir(200, ['ok' => true]);
    }
    if ($action === 'reinit' && $m === 'POST') {
        $mdp = code_provisoire();
        $pdo->prepare('UPDATE comptes SET hash = ?, doit_changer = 1, actif = 1, cree = NOW() WHERE id = ?')->execute([password_hash($mdp, PASSWORD_DEFAULT), $id]);
        $st = $pdo->prepare('SELECT email FROM comptes WHERE id = ?'); $st->execute([$id]);
        $pdo->prepare('DELETE FROM sessions WHERE compte_id = ?')->execute([$id]);
        sortir(200, ['ok' => true, 'mdp' => $mdp, 'identifiant' => $st->fetchColumn()]);
        $pdo->prepare('DELETE FROM sessions WHERE compte_id = ?')->execute([$id]);
        sortir(200, ['ok' => true, 'mdp' => $mdp]);
    }
    if ($action === 'creer_lot' && $m === 'POST') {
        $crees = []; $ignores = 0;
        $existe = $pdo->prepare('SELECT COUNT(*) FROM comptes WHERE joueur_nom = ? AND equipe = ?');
        $ajout = $pdo->prepare('INSERT INTO comptes (email, nom, hash, role, role_demande, equipe, joueur_nom, licence, actif, doit_changer, cree) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NOW())');
        // un coach ou un dirigeant : numéro de licence obligatoire (vérifié avant de créer quoi que ce soit)
        foreach (array_slice($corps['comptes'] ?? [], 0, 600) as $x) {
            if (in_array($x['role'] ?? '', ['entraineur', 'bureau'], true) && licence_propre((string) ($x['licence'] ?? '')) === '') {
                $qui = trim((string) ($x['complet'] ?? (($x['prenom'] ?? '') . ' ' . ($x['nom'] ?? ''))));
                sortir(400, ['erreur' => 'Pas de licence, pas d\'accès dirigeant : indique le numéro de licence' . ($qui !== '' ? ' de ' . $qui : '') . ' (des chiffres, 10 en général).']);
            }
        }
        foreach (array_slice($corps['comptes'] ?? [], 0, 600) as $x) {
            $prenom = trim((string) ($x['prenom'] ?? '')); $nom = trim((string) ($x['nom'] ?? ''));
            $complet = trim((string) ($x['complet'] ?? ($prenom . ' ' . $nom)));
            $equipe = mb_substr(trim((string) ($x['equipe'] ?? '')), 0, 80);
            $role = in_array($x['role'] ?? '', ['joueur', 'entraineur', 'bureau'], true) ? $x['role'] : 'joueur';
            if ($complet === '' || $nom === '') continue;
            if ($role === 'joueur') { $existe->execute([$complet, $equipe]); if ((int) $existe->fetchColumn()) { $ignores++; continue; } }
            $ident = identifiant_libre($prenom, $nom); $code = code_provisoire();
            $ajout->execute([$ident, $complet, password_hash($code, PASSWORD_DEFAULT), $role, $role, $equipe, $role === 'joueur' ? $complet : '', licence_propre((string) ($x['licence'] ?? ''))]);
            $crees[] = ['nom' => $complet, 'equipe' => $equipe, 'role' => $role, 'identifiant' => $ident, 'code' => $code];
        }
        sortir(200, ['ok' => true, 'crees' => $crees, 'ignores' => $ignores]);
    }
    if ($action === 'supprimer' && $m === 'POST') {
        if ($moi && $id === (int) $moi['id']) sortir(400, ['erreur' => 'Tu ne peux pas supprimer ton propre compte.']);
        $pdo->prepare('DELETE FROM sessions WHERE compte_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM comptes WHERE id = ?')->execute([$id]);
        sortir(200, ['ok' => true]);
    }
    sortir(404, ['erreur' => 'action inconnue']);
} catch (Throwable $e) {
    sortir(500, ['erreur' => 'Erreur du serveur.']);
}
