<?php
// Messagerie interne de l'app : les joueurs et les dirigeants s'écrivent DANS l'app (jamais par e-mail).
// Deux sortes de conversations : privée (deux personnes) et groupe d'équipe (« Groupe Seniors 1 »).
//   GET  /api/messagerie.php?resume=1                         -> { nonlus, maj }                 (pastille, appelé souvent)
//   GET  /api/messagerie.php?liste=1                          -> { moi, nonlus, conversations }
//   GET  /api/messagerie.php?contacts=1                       -> { groupes, personnes }          (à qui le compte peut écrire)
//   GET  /api/messagerie.php?conv=ID [&avant=N | &apres=N] [&sanslire=1] -> { conv, messages, plusAnciens }
//   POST /api/messagerie.php?ouvrir=1     { avec } ou { equipe }  -> { id }
//   POST /api/messagerie.php?envoyer=1    { conv, texte }         -> { ok, message }
//   POST /api/messagerie.php?lu=1         { conv }                -> { ok }
//   POST /api/messagerie.php?supprimer=1  { message }             -> { ok }
//   POST /api/messagerie.php?muet=1       { conv, muet }          -> { ok }
// Qui peut écrire à qui est décidé ICI, côté serveur (beaucoup de joueurs sont mineurs) :
//   - joueur : à ses coachs, au bureau, dans le groupe de son équipe ; JAMAIS en privé à un autre joueur ;
//   - coach  : à ses joueurs, aux autres coachs, au bureau, dans les groupes de ses équipes ;
//   - bureau : à tout le monde ; lit et écrit dans tous les groupes d'équipe.
// Un compte au code provisoire pas encore changé (rang 0) n'a pas accès à la messagerie, et personne ne peut lui écrire.
// Les messages sont dans trois tables à part (msg_conv, msg_part, msg_msg), créées au premier appel,
// JAMAIS dans la table « documents » (db.php la renvoie à tout le monde selon des rangs).
// Les dates sont enregistrées en heure UTC et renvoyées à l'heure de Paris (2026-10-05T14:02:11+02:00).
require __DIR__ . '/session.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const MG_PAGE = 50;          // messages renvoyés par page
const MG_NOUVEAUX = 200;     // au plus, pour &apres (appelé toutes les 5 s)
const MG_MAX = 2000;         // caractères par message
const MG_LIMITE = 30;        // messages au plus par compte…
const MG_FENETRE = 600;      // …sur 10 minutes (en secondes)
const MG_APERCU = 140;       // longueur du texte dans la notification
const MG_FAMILLES = ['Mes coachs', 'Coachs', 'Bureau', 'Mes joueurs', 'Joueurs'];

function mg_sortir(int $code, array $data): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

/* Les trois tables, créées au premier appel (comme session.php le fait pour les comptes). */
function mg_preparer(PDO $pdo): void {
    // les emojis demandent une connexion en utf8mb4 (utf8 tout court n'en prend que 3 octets)
    $cs = strtolower((string) $pdo->query('SELECT @@character_set_connection')->fetchColumn());
    if ($cs === 'utf8' || $cs === 'utf8mb3') $pdo->exec('SET NAMES utf8mb4');
    if ($pdo->query("SHOW TABLES LIKE 'msg\\_msg'")->fetchColumn()) return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS msg_conv (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(10) NOT NULL,
        cle VARCHAR(190) NOT NULL UNIQUE,
        equipe VARCHAR(80) NOT NULL DEFAULT '',
        cree DATETIME NOT NULL,
        maj DATETIME NOT NULL,
        INDEX (maj)
    ) DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS msg_part (
        conv_id INT NOT NULL,
        compte_id INT NOT NULL,
        lu INT NOT NULL DEFAULT 0,
        muet TINYINT NOT NULL DEFAULT 0,
        PRIMARY KEY (conv_id, compte_id),
        INDEX (compte_id)
    ) DEFAULT CHARSET=utf8mb4");
    // index (compte_id, cree) en plus : sert à la limite de 30 messages par 10 minutes
    $pdo->exec("CREATE TABLE IF NOT EXISTS msg_msg (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conv_id INT NOT NULL,
        compte_id INT NOT NULL,
        texte TEXT NOT NULL,
        cree DATETIME NOT NULL,
        supprime TINYINT NOT NULL DEFAULT 0,
        INDEX (conv_id, id),
        INDEX (compte_id, cree)
    ) DEFAULT CHARSET=utf8mb4");
}

/* ===== petits outils ===== */

function mg_maintenant(int $decalage = 0): string { return gmdate('Y-m-d H:i:s', time() + $decalage); }
/* date UTC de la base -> ISO 8601 à l'heure de Paris */
function mg_iso(?string $utc): ?string {
    static $u = null, $paris = null;
    if (!$utc) return null;
    $u = $u ?? new DateTimeZone('UTC');
    $paris = $paris ?? new DateTimeZone('Europe/Paris');
    try { return (new DateTimeImmutable($utc, $u))->setTimezone($paris)->format('c'); } catch (Throwable $e) { return null; }
}
/* un identifiant venu de l'adresse ou du JSON : entier positif, sinon 0 */
function mg_entier($v): int {
    if (is_int($v)) return max(0, $v);
    if (is_string($v) && preg_match('/^\d{1,10}$/', $v)) return (int) $v;
    return 0;
}
/* Nom d'équipe simplifié pour comparer : minuscules, sans accents, espaces regroupés (« Séniors  1 » = « seniors 1 »). */
function mg_simple(string $t): string {
    $t = mb_strtolower(trim((string) preg_replace('/[\s\p{Z}]+/u', ' ', $t)), 'UTF-8');
    if (class_exists('Normalizer')) {
        $n = Normalizer::normalize($t, Normalizer::FORM_D);
        if (is_string($n)) $t = (string) preg_replace('/\p{Mn}+/u', '', $n);
    }
    // sans l'extension intl (et pour œ, æ, ß que la décomposition ne traite pas)
    $t = strtr($t, ['à' => 'a', 'á' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a', 'ç' => 'c', 'è' => 'e', 'é' => 'e',
        'ê' => 'e', 'ë' => 'e', 'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i', 'ñ' => 'n', 'ò' => 'o', 'ó' => 'o', 'ô' => 'o',
        'õ' => 'o', 'ö' => 'o', 'ø' => 'o', 'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u', 'ý' => 'y', 'ÿ' => 'y',
        'œ' => 'oe', 'æ' => 'ae', 'ß' => 'ss']);
    return mb_substr($t, 0, 150);
}
/* Texte d'un message : retours à la ligne gardés, caractères de contrôle et inversions de sens d'écriture retirés. */
function mg_nettoyer($t): string {
    if (!is_string($t) || !mb_check_encoding($t, 'UTF-8')) return '';
    $t = str_replace(["\r\n", "\r", "\u{2028}", "\u{2029}", "\t"], ["\n", "\n", "\n", "\n", ' '], $t);
    $t = (string) preg_replace('/[\x{0000}-\x{0009}\x{000B}-\x{001F}\x{007F}-\x{009F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', $t);
    $t = (string) preg_replace('/^[\s\p{Z}]+|[\s\p{Z}]+$/u', '', $t);
    return (string) preg_replace("/\n{4,}/", "\n\n\n", $t);                 // pas plus de deux lignes vides de suite
}
/* Sur une seule ligne, coupé à $max caractères avec « … » (notifications, aperçu du dernier message). */
function mg_couper(string $t, int $max): string {
    $t = trim((string) preg_replace('/[\s\p{Z}]+/u', ' ', $t));
    return mb_strlen($t) > $max ? rtrim(mb_substr($t, 0, $max - 1)) . '…' : $t;
}
/* « Mehdi BENALI » -> « Mehdi » (même découpage que les identifiants, session.php) */
function mg_prenom(string $nom): string {
    $p = function_exists('decoupe_nom') ? trim((string) decoupe_nom($nom)[0]) : '';
    if ($p === '') $p = (string) (preg_split('/\s+/u', trim($nom))[0] ?? '');
    return $p !== '' ? $p : trim($nom);
}

/* ===== comptes, équipes, libellés ===== */

/* Un document de la table documents (site/permissions, site/club), lu une fois par appel. */
function mg_doc(PDO $pdo, string $chemin): array {
    static $cache = [];
    if (!array_key_exists($chemin, $cache)) {
        try {
            $st = $pdo->prepare('SELECT data FROM documents WHERE path = ?');
            $st->execute([$chemin]);
            $d = json_decode((string) ($st->fetchColumn() ?: ''), true);
            $cache[$chemin] = is_array($d) ? $d : [];
        } catch (Throwable $e) { $cache[$chemin] = []; }
    }
    return $cache[$chemin];
}
/* Tous les comptes [id => compte], lus une fois par appel. */
function mg_comptes(PDO $pdo): array {
    static $tous = null;
    if ($tous === null) {
        $tous = [];
        foreach ($pdo->query('SELECT id, nom, role, equipe, actif, doit_changer FROM comptes ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) as $c) $tous[(int) $c['id']] = $c;
    }
    return $tous;
}
/* Compte actif, au code personnel (pas provisoire), avec un rôle connu : le seul à qui l'on peut écrire. */
function mg_joignable(?array $c): bool {
    return $c !== null && (int) ($c['actif'] ?? 0) === 1 && (int) ($c['doit_changer'] ?? 0) === 0 && isset(RANGS[$c['role'] ?? '']);
}
/* Les équipes d'un compte [nom simplifié => nom affiché] : comptes.equipe,
   et pour les coachs et le bureau, les équipes cochées dans site/permissions ({"c<id>": {"equipes": [...]}}). */
function mg_equipes(PDO $pdo, array $c): array {
    static $cache = [];
    $id = (int) $c['id'];
    if (isset($cache[$id])) return $cache[$id];
    $l = [];
    foreach (array_merge([(string) ($c['equipe'] ?? '')], mg_equipes_cochees($pdo, $c)) as $x)
        if (($k = mg_simple($x)) !== '' && !isset($l[$k])) $l[$k] = mb_substr(trim($x), 0, 80);
    return $cache[$id] = $l;
}
/* Les équipes cochées pour un coach ou un membre du bureau dans site/permissions (rien pour un joueur). */
function mg_equipes_cochees(PDO $pdo, array $c): array {
    if (!in_array($c['role'] ?? '', ['entraineur', 'bureau'], true)) return [];
    $p = mg_doc($pdo, 'site/permissions')['c' . (int) $c['id']]['equipes'] ?? [];
    return array_values(array_filter(is_array($p) ? $p : [], 'is_string'));
}
function mg_membre(PDO $pdo, array $c, string $eq): bool { return $eq !== '' && isset(mg_equipes($pdo, $c)[$eq]); }
/* [nom simplifié => [ids]] : les membres de chaque équipe (comptes joignables seulement). */
function mg_index_equipes(PDO $pdo): array {
    static $index = null;
    if ($index !== null) return $index;
    $index = [];
    foreach (mg_comptes($pdo) as $id => $c)
        if (mg_joignable($c)) foreach (array_keys(mg_equipes($pdo, $c)) as $k) $index[$k][] = $id;
    return $index;
}
/* Les équipes connues [nom simplifié => nom affiché] : celles des comptes actifs. Pour l'écriture du nom, d'abord les équipes
   cochées dans l'espace club (liste officielle), puis l'équipe des coachs et du bureau, puis celle des joueurs (« u13 » -> « U13 »). */
function mg_noms_equipes(PDO $pdo): array {
    static $noms = null;
    if ($noms !== null) return $noms;
    $actifs = array_filter(mg_comptes($pdo), fn($c) => (int) $c['actif'] === 1 && isset(RANGS[$c['role']]));
    $sources = [];
    foreach ($actifs as $c) foreach (mg_equipes_cochees($pdo, $c) as $x) $sources[] = $x;
    foreach ($actifs as $c) if ($c['role'] !== 'joueur') $sources[] = (string) $c['equipe'];
    foreach ($actifs as $c) if ($c['role'] === 'joueur') $sources[] = (string) $c['equipe'];
    $noms = [];
    foreach ($sources as $x) if (($k = mg_simple($x)) !== '' && !isset($noms[$k])) $noms[$k] = mb_substr(trim($x), 0, 80);
    return $noms;
}
function mg_nom_equipe(PDO $pdo, string $k, string $defaut): string { return mg_noms_equipes($pdo)[$k] ?? $defaut; }
/* Les équipes d'un compte, sous leur nom officiel. */
function mg_noms_de(PDO $pdo, array $c): array {
    $l = [];
    foreach (mg_equipes($pdo, $c) as $k => $nom) $l[] = mg_nom_equipe($pdo, (string) $k, $nom);
    return $l;
}

/* Poste dans le bureau, lu dans site/club (bureau[] puis referents[] dont « compte » vaut l'id), comme conv_auteur(). */
function mg_poste(PDO $pdo, int $id): string {
    $club = mg_doc($pdo, 'site/club');
    foreach (['bureau', 'referents'] as $liste)
        foreach (is_array($club[$liste] ?? null) ? $club[$liste] : [] as $p)
            if (is_array($p) && (string) ($p['compte'] ?? '') !== '' && (string) $p['compte'] === (string) $id) return trim((string) ($p['role'] ?? ''));
    return '';
}
/* « Coach · Seniors 1 », « Bureau · Président », « Bureau », « Joueur · U15 » */
function mg_libelle(PDO $pdo, array $c): string {
    if ($c['role'] === 'bureau') { $p = mg_poste($pdo, (int) $c['id']); return 'Bureau' . ($p !== '' ? ' · ' . $p : ''); }
    $eq = mg_noms_de($pdo, $c);
    return ($c['role'] === 'entraineur' ? 'Coach' : 'Joueur') . ($eq ? ' · ' . implode(', ', $eq) : '');
}
/* {id, nom, role, libelle} d'un compte (même supprimé depuis : son nom reste dans l'historique) */
function mg_personne(PDO $pdo, int $id): array {
    $c = mg_comptes($pdo)[$id] ?? null;
    if (!$c) return ['id' => $id, 'nom' => 'Compte supprimé', 'role' => '', 'libelle' => ''];
    return ['id' => $id, 'nom' => (string) $c['nom'], 'role' => (string) $c['role'], 'libelle' => mg_libelle($pdo, $c)];
}
function mg_trier_personnes(array $l): array {
    $ordre = ['entraineur' => 0, 'bureau' => 1, 'joueur' => 2];
    usort($l, fn($a, $b) => [$ordre[$a['role']] ?? 3, mg_simple($a['nom']), $a['id']] <=> [$ordre[$b['role']] ?? 3, mg_simple($b['nom']), $b['id']]);
    return $l;
}

/* ===== les règles ===== */

/* $a peut-il écrire en privé à $b ? La règle est la même dans les deux sens. */
function mg_peut_ecrire_a(PDO $pdo, array $a, ?array $b): bool {
    if (!$b || (int) $a['id'] === (int) $b['id'] || !mg_joignable($a) || !mg_joignable($b)) return false;
    if ($a['role'] === 'bureau' || $b['role'] === 'bureau') return true;                       // le bureau : avec tout le monde
    if ($a['role'] === 'entraineur' && $b['role'] === 'entraineur') return true;               // entre coachs
    if ($a['role'] === 'joueur' && $b['role'] === 'joueur') return false;                      // jamais entre deux joueurs
    // un joueur et un coach : seulement si le coach encadre l'équipe du joueur
    [$joueur, $coach] = $a['role'] === 'joueur' ? [$a, $b] : [$b, $a];
    return mg_membre($pdo, $coach, mg_simple((string) $joueur['equipe']));
}
/* 'p:4-12' -> [4, 12] */
function mg_ids_prive(string $cle): array { return preg_match('/^p:(\d+)-(\d+)$/', $cle, $m) ? [(int) $m[1], (int) $m[2]] : []; }
/* 'e:seniors 1' -> 'seniors 1' */
function mg_eq_conv(array $c): string { return str_starts_with((string) $c['cle'], 'e:') ? substr((string) $c['cle'], 2) : ''; }
/* Lire : les deux personnes d'une conversation privée ; pour un groupe, ses membres et le bureau. */
function mg_peut_lire(PDO $pdo, array $moi, array $c): bool {
    if ($c['type'] === 'prive') return in_array((int) $moi['id'], mg_ids_prive((string) $c['cle']), true);
    if ($c['type'] === 'equipe') return rang($moi) >= 3 || mg_membre($pdo, $moi, mg_eq_conv($c));
    return false;
}
/* Écrire : revérifié à chaque message (un joueur qui a changé d'équipe ne peut plus écrire à son ancien coach, mais peut relire). */
function mg_peut_ecrire(PDO $pdo, array $moi, array $c): bool {
    if (!mg_peut_lire($pdo, $moi, $c)) return false;
    if ($c['type'] === 'prive') {
        [$x, $y] = mg_ids_prive((string) $c['cle']);
        return mg_peut_ecrire_a($pdo, $moi, mg_comptes($pdo)[$x === (int) $moi['id'] ? $y : $x] ?? null);
    }
    return true;
}

/* ===== conversations ===== */

/* Une conversation, avec l'état du compte (part = participant, lu, muet). */
function mg_conv(PDO $pdo, int $id, int $moi): ?array {
    if ($id <= 0) return null;
    $st = $pdo->prepare('SELECT c.id, c.type, c.cle, c.equipe, c.cree, c.maj, p.compte_id AS part, p.lu, p.muet
        FROM msg_conv c LEFT JOIN msg_part p ON p.conv_id = c.id AND p.compte_id = ? WHERE c.id = ?');
    $st->execute([$moi, $id]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}
/* Le groupe d'une équipe (créé s'il n'existe pas encore) : son id. */
function mg_groupe(PDO $pdo, string $k, string $nom): int {
    $t = mg_maintenant();
    $pdo->prepare("INSERT IGNORE INTO msg_conv (type, cle, equipe, cree, maj) VALUES ('equipe', ?, ?, ?, ?)")->execute(['e:' . $k, mb_substr($nom, 0, 80), $t, $t]);
    $st = $pdo->prepare('SELECT id FROM msg_conv WHERE cle = ?');
    $st->execute(['e:' . $k]);
    return (int) $st->fetchColumn();
}
/* Les membres d'un groupe (ids) : les membres de l'équipe, plus le bureau qui y a écrit (participant). */
function mg_membres_groupe(PDO $pdo, array $c): array {
    $ids = mg_index_equipes($pdo)[mg_eq_conv($c)] ?? [];
    $st = $pdo->prepare('SELECT compte_id FROM msg_part WHERE conv_id = ?');
    $st->execute([(int) $c['id']]);
    $tous = mg_comptes($pdo);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $p) {
        $p = (int) $p;
        $x = $tous[$p] ?? null;
        // un ancien membre (changé d'équipe) n'est plus membre : il ne lit plus le groupe et n'est plus prévenu
        if ($x && !in_array($p, $ids, true) && mg_joignable($x) && rang($x) >= 3) $ids[] = $p;
    }
    return $ids;
}
/* Les conversations que le compte voit dans sa liste [id => conversation].
   $creer : crée au passage les groupes de ses équipes (ils apparaissent toujours, même sans message). */
function mg_visibles(PDO $pdo, array $moi, bool $creer): array {
    $me = (int) $moi['id'];
    $eqs = mg_equipes($pdo, $moi);
    if ($creer) foreach ($eqs as $k => $nom) mg_groupe($pdo, (string) $k, mg_nom_equipe($pdo, (string) $k, $nom));
    $champs = 'c.id, c.type, c.cle, c.equipe, c.cree, c.maj, p.compte_id AS part, p.lu, p.muet';
    // celles où il est participant…
    $st = $pdo->prepare("SELECT $champs FROM msg_part p JOIN msg_conv c ON c.id = p.conv_id WHERE p.compte_id = ?");
    $st->execute([$me]);
    $lignes = $st->fetchAll(PDO::FETCH_ASSOC);
    // …et les groupes de ses équipes
    if ($eqs) {
        $cles = array_map(fn($k) => 'e:' . $k, array_keys($eqs));
        $st = $pdo->prepare("SELECT $champs FROM msg_conv c LEFT JOIN msg_part p ON p.conv_id = c.id AND p.compte_id = ?
            WHERE c.cle IN (" . implode(',', array_fill(0, count($cles), '?')) . ')');
        $st->execute(array_merge([$me], $cles));
        $lignes = array_merge($lignes, $st->fetchAll(PDO::FETCH_ASSOC));
    }
    $l = [];
    foreach ($lignes as $c) {
        if ($c['type'] === 'prive') { if (!in_array($me, mg_ids_prive((string) $c['cle']), true)) continue; }
        elseif ($c['type'] === 'equipe') { if (!isset($eqs[mg_eq_conv($c)]) && !($c['part'] !== null && rang($moi) >= 3)) continue; }
        else continue;
        $l[(int) $c['id']] = $c;
    }
    return $l;
}
/* Messages non lus [conv_id => nombre] : ceux des autres, plus récents que le dernier lu, pas supprimés. */
function mg_nonlus(PDO $pdo, int $me, array $ids): array {
    if (!$ids) return [];
    $st = $pdo->prepare('SELECT m.conv_id, COUNT(*) FROM msg_msg m LEFT JOIN msg_part p ON p.conv_id = m.conv_id AND p.compte_id = ?
        WHERE m.conv_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') AND m.compte_id <> ? AND m.supprime = 0 AND m.id > COALESCE(p.lu, 0)
        GROUP BY m.conv_id');
    $st->execute(array_merge([$me], array_values($ids), [$me]));
    $l = [];
    foreach ($st->fetchAll(PDO::FETCH_NUM) as [$conv, $n]) $l[(int) $conv] = (int) $n;
    return $l;
}
/* Dernier message (non supprimé) de chaque conversation [conv_id => message]. */
function mg_derniers(PDO $pdo, array $ids): array {
    if (!$ids) return [];
    $st = $pdo->prepare('SELECT m.id, m.conv_id, m.compte_id, m.texte, m.cree FROM msg_msg m
        JOIN (SELECT conv_id, MAX(id) AS mid FROM msg_msg WHERE conv_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') AND supprime = 0 GROUP BY conv_id) x
        ON x.mid = m.id');
    $st->execute(array_values($ids));
    $l = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $m) $l[(int) $m['conv_id']] = $m;
    return $l;
}
/* Un élément de la liste des conversations. */
function mg_element(PDO $pdo, array $moi, array $c, ?array $dernier, int $nonlus): array {
    $me = (int) $moi['id'];
    if ($c['type'] === 'prive') {
        [$x, $y] = mg_ids_prive((string) $c['cle']);
        $autre = mg_personne($pdo, $x === $me ? $y : $x);
        $titre = $autre['nom']; $sous = $autre['libelle']; $equipe = null; $avec = [$autre];
        $muet = !empty($c['muet']);
    } else {
        $n = count(mg_membres_groupe($pdo, $c));
        $titre = 'Groupe ' . $c['equipe']; $sous = $n . ($n > 1 ? ' membres' : ' membre'); $equipe = (string) $c['equipe']; $avec = [];
        // le bureau qui n'a jamais écrit dans ce groupe n'en reçoit pas les notifications : il apparaît « muet »
        $muet = $c['part'] !== null ? !empty($c['muet']) : !mg_membre($pdo, $moi, mg_eq_conv($c));
    }
    $d = null;
    if ($dernier) {
        $auteur = mg_comptes($pdo)[(int) $dernier['compte_id']] ?? null;
        $d = ['texte' => mg_couper((string) $dernier['texte'], 160), 'auteur' => $auteur ? mg_prenom((string) $auteur['nom']) : 'Compte supprimé',
            'auteurId' => (int) $dernier['compte_id'], 'date' => mg_iso($dernier['cree'])];
    }
    return ['id' => (int) $c['id'], 'type' => (string) $c['type'], 'titre' => $titre, 'sousTitre' => $sous, 'equipe' => $equipe, 'avec' => $avec,
        'dernier' => $d, 'nonlus' => $nonlus, 'maj' => mg_iso($c['maj']), 'muet' => $muet];
}
/* Un message tel que l'app l'affiche. Un message supprimé : texte vide. */
function mg_message(PDO $pdo, array $m, int $me): array {
    $p = mg_personne($pdo, (int) $m['compte_id']);
    $sup = (int) $m['supprime'] === 1;
    return ['id' => (int) $m['id'], 'auteurId' => (int) $m['compte_id'], 'auteur' => $p['nom'], 'libelle' => $p['libelle'],
        'texte' => $sup ? '' : (string) $m['texte'], 'date' => mg_iso($m['cree']), 'supprime' => $sup, 'moi' => (int) $m['compte_id'] === $me];
}
/* Marque la conversation lue jusqu'à son dernier message.
   Le bureau qui lit un groupe sans y avoir écrit n'en devient pas participant pour autant. */
function mg_marquer_lu(PDO $pdo, array $moi, array $c): void {
    $st = $pdo->prepare('SELECT MAX(id) FROM msg_msg WHERE conv_id = ?');
    $st->execute([(int) $c['id']]);
    $max = (int) $st->fetchColumn();
    if ($max <= 0) return;
    if ($c['type'] === 'prive' || $c['part'] !== null || mg_membre($pdo, $moi, mg_eq_conv($c))) {
        $pdo->prepare('INSERT INTO msg_part (conv_id, compte_id, lu) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE lu = GREATEST(lu, VALUES(lu))')
            ->execute([(int) $c['id'], (int) $moi['id'], $max]);
    }
}
/* Notifications : les autres participants (privé) ou les membres et participants (groupe),
   sauf l'auteur, sauf ceux qui ont coupé la conversation, et seulement des comptes qui peuvent encore la lire. */
function mg_notifier(PDO $pdo, array $moi, array $c, string $texte): void {
    $me = (int) $moi['id'];
    $dest = $c['type'] === 'prive' ? mg_ids_prive((string) $c['cle']) : mg_membres_groupe($pdo, $c);
    $st = $pdo->prepare('SELECT compte_id FROM msg_part WHERE conv_id = ? AND muet = 1');
    $st->execute([(int) $c['id']]);
    $muets = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    $tous = mg_comptes($pdo);
    $joueurs = []; $staff = [];
    foreach (array_unique($dest) as $id) {
        $x = $tous[$id] ?? null;
        if ($id === $me || in_array($id, $muets, true) || !mg_joignable($x)) continue;
        if ($x['role'] === 'joueur') $joueurs[] = (string) $id; else $staff[] = (string) $id;
    }
    if ((!$joueurs && !$staff) || !is_file(__DIR__ . '/push-lib.php')) return;
    require_once __DIR__ . '/push-lib.php';
    if (!function_exists('notifier_cibles')) return;
    if ($c['type'] === 'prive') { $titre = '💬 ' . $moi['nom']; $corps = mg_couper($texte, MG_APERCU); }
    else { $titre = '💬 Groupe ' . $c['equipe']; $corps = mg_couper(mg_prenom((string) $moi['nom']) . ' : ' . $texte, MG_APERCU); }
    // deux envois : le lien ouvre l'espace joueur pour les joueurs, l'espace club pour les autres
    foreach ([[$joueurs, '#joueur'], [$staff, '#espace']] as [$ids, $ancre]) {
        if (!$ids) continue;
        try { notifier_cibles($pdo, $ids, [], $titre, $corps, '/?conv=' . (int) $c['id'] . $ancre); } catch (Throwable $e) { /* jamais bloquant */ }
    }
}

try {
    $pdo = base();
    $methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($methode !== 'GET') verifier_origine();              // POST : JSON obligatoire, depuis le site lui-même
    $moi = compte_actuel();
    // la clé d'écriture (X-Cle) ne donne pas accès à la messagerie : il faut un vrai compte, au code personnel
    if (!$moi || rang($moi) < 1) mg_sortir(401, ['erreur' => 'Connecte-toi (avec ton mot de passe personnel) pour accéder à la messagerie.']);
    mg_preparer($pdo);
    $me = (int) $moi['id'];
    $refus = 'Tu n\'as pas accès à cette conversation.';       // même réponse si elle n'existe pas : rien ne fuit

    if ($methode === 'GET') {
        // pastille : nombre de messages non lus (léger, appelé souvent)
        if (isset($_GET['resume'])) {
            $vis = mg_visibles($pdo, $moi, false);
            $maj = null;
            foreach ($vis as $c) if ($maj === null || strcmp((string) $c['maj'], $maj) > 0) $maj = (string) $c['maj'];
            mg_sortir(200, ['nonlus' => array_sum(mg_nonlus($pdo, $me, array_keys($vis))), 'maj' => mg_iso($maj)]);
        }

        if (isset($_GET['liste'])) {
            $vis = mg_visibles($pdo, $moi, true);
            $ids = array_keys($vis);
            $nonlus = mg_nonlus($pdo, $me, $ids);
            $derniers = mg_derniers($pdo, $ids);
            $l = [];
            foreach ($vis as $id => $c) $l[] = mg_element($pdo, $moi, $c, $derniers[$id] ?? null, $nonlus[$id] ?? 0);
            usort($l, fn($a, $b) => [$b['maj'] ? strtotime($b['maj']) : 0, $b['id']] <=> [$a['maj'] ? strtotime($a['maj']) : 0, $a['id']]);
            mg_sortir(200, ['moi' => ['id' => $me, 'nom' => (string) $moi['nom'], 'role' => (string) $moi['role']],
                'nonlus' => array_sum($nonlus), 'conversations' => $l]);
        }

        // à qui le compte peut écrire : exactement les règles de mg_peut_ecrire_a()
        if (isset($_GET['contacts'])) {
            $bureau = rang($moi) >= 3;
            $personnes = [];
            foreach (mg_comptes($pdo) as $id => $c) {
                if ($id === $me || !mg_peut_ecrire_a($pdo, $moi, $c)) continue;
                if ($c['role'] === 'bureau') $famille = 'Bureau';
                elseif ($c['role'] === 'entraineur') $famille = $moi['role'] === 'joueur' ? 'Mes coachs' : 'Coachs';
                else $famille = $moi['role'] === 'entraineur' ? 'Mes joueurs' : 'Joueurs';
                $personnes[] = ['id' => $id, 'nom' => (string) $c['nom'], 'role' => (string) $c['role'],
                    'equipe' => implode(', ', mg_noms_de($pdo, $c)), 'libelle' => mg_libelle($pdo, $c), 'famille' => $famille];
            }
            // par famille, puis (pour le bureau) par équipe, puis par nom
            usort($personnes, function ($a, $b) use ($bureau) {
                $f = array_search($a['famille'], MG_FAMILLES, true) <=> array_search($b['famille'], MG_FAMILLES, true);
                if ($f !== 0) return $f;
                if ($bureau && $a['famille'] !== 'Bureau' && ($e = strnatcmp(mg_simple($a['libelle']), mg_simple($b['libelle']))) !== 0) return $e;
                return strnatcmp(mg_simple($a['nom']), mg_simple($b['nom'])) ?: $a['id'] <=> $b['id'];
            });
            $eqs = $bureau ? mg_noms_equipes($pdo) + mg_equipes($pdo, $moi) : mg_equipes($pdo, $moi);
            $groupes = [];
            foreach ($eqs as $k => $nom) { $nom = mg_nom_equipe($pdo, (string) $k, $nom); $groupes[] = ['equipe' => $nom, 'titre' => 'Groupe ' . $nom]; }
            usort($groupes, fn($a, $b) => strnatcmp(mg_simple($a['equipe']), mg_simple($b['equipe'])));
            mg_sortir(200, ['groupes' => $groupes, 'personnes' => $personnes]);
        }

        if (isset($_GET['conv'])) {
            $c = mg_conv($pdo, mg_entier($_GET['conv']), $me);
            if (!$c || !mg_peut_lire($pdo, $moi, $c)) mg_sortir(403, ['erreur' => $refus]);
            $id = (int) $c['id'];
            $avant = mg_entier($_GET['avant'] ?? null);
            $apres = mg_entier($_GET['apres'] ?? null);
            $champs = 'SELECT id, conv_id, compte_id, IF(supprime = 1, \'\', texte) AS texte, cree, supprime FROM msg_msg WHERE conv_id = ?';
            if ($apres > 0) {                                     // seulement les nouveaux (appelé toutes les 5 s)
                $st = $pdo->prepare("$champs AND id > ? ORDER BY id ASC LIMIT " . MG_NOUVEAUX);
                $st->execute([$id, $apres]);
                $msgs = $st->fetchAll(PDO::FETCH_ASSOC);
            } else {                                              // les 50 derniers, ou les 50 d'avant MSGID
                $st = $pdo->prepare($avant > 0 ? "$champs AND id < ? ORDER BY id DESC LIMIT " . MG_PAGE : "$champs ORDER BY id DESC LIMIT " . MG_PAGE);
                $st->execute($avant > 0 ? [$id, $avant] : [$id]);
                $msgs = array_reverse($st->fetchAll(PDO::FETCH_ASSOC));
            }
            // plusAnciens : il existe des messages plus anciens que le plus ancien renvoyé (ou que MSGID si &apres ne renvoie rien)
            $borne = $msgs ? (int) $msgs[0]['id'] : ($apres > 0 ? $apres + 1 : 0);
            $plus = false;
            if ($borne > 0) {
                $st = $pdo->prepare('SELECT 1 FROM msg_msg WHERE conv_id = ? AND id < ? LIMIT 1');
                $st->execute([$id, $borne]);
                $plus = (bool) $st->fetchColumn();
            }
            $sanslire = isset($_GET['sanslire']) && !in_array((string) $_GET['sanslire'], ['', '0'], true);
            if (!$sanslire) { mg_marquer_lu($pdo, $moi, $c); $c = mg_conv($pdo, $id, $me) ?? $c; }
            $el = mg_element($pdo, $moi, $c, mg_derniers($pdo, [$id])[$id] ?? null, mg_nonlus($pdo, $me, [$id])[$id] ?? 0);
            $membres = $c['type'] === 'prive' ? mg_ids_prive((string) $c['cle']) : mg_membres_groupe($pdo, $c);
            $el['membres'] = mg_trier_personnes(array_map(fn($i) => mg_personne($pdo, (int) $i), $membres));
            mg_sortir(200, ['conv' => $el, 'messages' => array_map(fn($m) => mg_message($pdo, $m, $me), $msgs), 'plusAnciens' => $plus]);
        }

        foreach (['ouvrir', 'envoyer', 'lu', 'supprimer', 'muet'] as $a) if (isset($_GET[$a])) mg_sortir(405, ['erreur' => 'Méthode refusée.']);
        mg_sortir(400, ['erreur' => 'Action inconnue.']);
    }

    if ($methode !== 'POST') mg_sortir(405, ['erreur' => 'Méthode refusée.']);
    $brut = (string) file_get_contents('php://input', false, null, 0, 65537);
    if (strlen($brut) > 65536) mg_sortir(413, ['erreur' => 'Ton message est trop long.']);
    $corps = json_decode($brut, true);
    if (!is_array($corps)) $corps = [];

    // ouvrir (ou retrouver) une conversation privée ou le groupe d'une équipe
    if (isset($_GET['ouvrir'])) {
        if (array_key_exists('avec', $corps)) {
            $id = mg_entier($corps['avec']);
            $autre = $id > 0 ? (mg_comptes($pdo)[$id] ?? null) : null;
            // même refus si le compte n'existe pas, est désactivé ou n'est pas autorisé : rien ne fuit
            if (!mg_peut_ecrire_a($pdo, $moi, $autre)) mg_sortir(403, ['erreur' => 'Tu ne peux pas écrire à cette personne.']);
            $cle = 'p:' . min($me, $id) . '-' . max($me, $id);
            $t = mg_maintenant();
            $pdo->prepare("INSERT IGNORE INTO msg_conv (type, cle, equipe, cree, maj) VALUES ('prive', ?, '', ?, ?)")->execute([$cle, $t, $t]);
            $st = $pdo->prepare('SELECT id FROM msg_conv WHERE cle = ?');
            $st->execute([$cle]);
            $conv = (int) $st->fetchColumn();
            // seul celui qui l'ouvre la voit tant qu'aucun message n'est écrit
            $pdo->prepare('INSERT IGNORE INTO msg_part (conv_id, compte_id) VALUES (?, ?)')->execute([$conv, $me]);
            mg_sortir(200, ['id' => $conv]);
        }
        if (array_key_exists('equipe', $corps)) {
            $nom = is_string($corps['equipe']) ? trim(mb_substr($corps['equipe'], 0, 120)) : '';
            $k = mg_simple($nom);
            if ($k === '') mg_sortir(400, ['erreur' => 'Indique l\'équipe.']);
            if (rang($moi) >= 3) {
                if (!isset(mg_noms_equipes($pdo)[$k])) {
                    $st = $pdo->prepare('SELECT 1 FROM msg_conv WHERE cle = ?');
                    $st->execute(['e:' . $k]);
                    if (!$st->fetchColumn()) mg_sortir(404, ['erreur' => 'Aucun compte n\'est rattaché à cette équipe.']);
                }
            } elseif (!mg_membre($pdo, $moi, $k)) mg_sortir(403, ['erreur' => 'Tu ne fais pas partie de cette équipe.']);
            // pas de participant ici : le bureau ne le devient qu'en écrivant
            mg_sortir(200, ['id' => mg_groupe($pdo, $k, mg_nom_equipe($pdo, $k, $nom))]);
        }
        mg_sortir(400, ['erreur' => 'Indique à qui tu veux écrire.']);
    }

    // les autres actions portent sur une conversation que le compte peut lire
    if (isset($_GET['envoyer']) || isset($_GET['lu']) || isset($_GET['muet'])) {
        $c = mg_conv($pdo, mg_entier($corps['conv'] ?? null), $me);
        if (!$c || !mg_peut_lire($pdo, $moi, $c)) mg_sortir(403, ['erreur' => $refus]);
        $id = (int) $c['id'];

        if (isset($_GET['envoyer'])) {
            if (!mg_peut_ecrire($pdo, $moi, $c)) mg_sortir(403, ['erreur' => 'Tu ne peux plus écrire dans cette conversation.']);
            $texte = mg_nettoyer($corps['texte'] ?? '');
            if ($texte === '') mg_sortir(400, ['erreur' => 'Ton message est vide.']);
            if (mb_strlen($texte) > MG_MAX) mg_sortir(400, ['erreur' => 'Ton message est trop long (' . MG_MAX . ' caractères au maximum).']);
            $st = $pdo->prepare('SELECT COUNT(*) FROM msg_msg WHERE compte_id = ? AND cree > ?');
            $st->execute([$me, mg_maintenant(-MG_FENETRE)]);
            if ((int) $st->fetchColumn() >= MG_LIMITE) mg_sortir(429, ['erreur' => 'Tu as envoyé beaucoup de messages. Attends quelques minutes avant d\'écrire à nouveau.']);
            $t = mg_maintenant();
            $pdo->prepare('INSERT INTO msg_msg (conv_id, compte_id, texte, cree) VALUES (?, ?, ?, ?)')->execute([$id, $me, $texte, $t]);
            $mid = (int) $pdo->lastInsertId();
            $pdo->prepare('UPDATE msg_conv SET maj = ? WHERE id = ?')->execute([$t, $id]);
            // l'auteur devient participant (le bureau dans un groupe : il en reçoit ensuite les notifications) et a lu son message
            $pdo->prepare('INSERT INTO msg_part (conv_id, compte_id, lu) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE lu = GREATEST(lu, VALUES(lu))')->execute([$id, $me, $mid]);
            // conversation privée : elle apparaît maintenant aussi chez l'autre
            if ($c['type'] === 'prive') foreach (mg_ids_prive((string) $c['cle']) as $p)
                if ($p !== $me) $pdo->prepare('INSERT IGNORE INTO msg_part (conv_id, compte_id) VALUES (?, ?)')->execute([$id, $p]);
            echo json_encode(['ok' => true, 'message' => mg_message($pdo, ['id' => $mid, 'compte_id' => $me, 'texte' => $texte, 'cree' => $t, 'supprime' => 0], $me)],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
            // notifications envoyées après avoir répondu (l'auteur n'attend pas), jamais bloquantes
            if (function_exists('litespeed_finish_request')) litespeed_finish_request();
            elseif (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
            ignore_user_abort(true);
            try { @set_time_limit(120); mg_notifier($pdo, $moi, $c, $texte); } catch (Throwable $e) { /* une notification ratée ne bloque jamais le message */ }
            exit;
        }

        if (isset($_GET['lu'])) { mg_marquer_lu($pdo, $moi, $c); mg_sortir(200, ['ok' => true]); }

        // couper / remettre les notifications de cette conversation
        $muet = in_array($corps['muet'] ?? false, [true, 1, '1', 'true'], true) ? 1 : 0;
        if ($c['type'] === 'equipe' && $c['part'] === null && !mg_membre($pdo, $moi, mg_eq_conv($c))) {
            // le bureau qui n'a jamais écrit dans ce groupe : remettre les notifications = suivre le groupe (sans l'historique en non lu)
            if (!$muet) {
                $st = $pdo->prepare('SELECT COALESCE(MAX(id), 0) FROM msg_msg WHERE conv_id = ?');
                $st->execute([$id]);
                $pdo->prepare('INSERT IGNORE INTO msg_part (conv_id, compte_id, lu, muet) VALUES (?, ?, ?, 0)')->execute([$id, $me, (int) $st->fetchColumn()]);
            }
            mg_sortir(200, ['ok' => true]);
        }
        $pdo->prepare('INSERT INTO msg_part (conv_id, compte_id, muet) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE muet = VALUES(muet)')->execute([$id, $me, $muet]);
        mg_sortir(200, ['ok' => true]);
    }

    // supprimer un message : son auteur, ou le bureau (n'importe lequel)
    if (isset($_GET['supprimer'])) {
        $st = $pdo->prepare('SELECT id, compte_id FROM msg_msg WHERE id = ?');
        $st->execute([mg_entier($corps['message'] ?? null)]);
        $m = $st->fetch(PDO::FETCH_ASSOC);
        if (!$m || ((int) $m['compte_id'] !== $me && rang($moi) < 3)) mg_sortir(403, ['erreur' => 'Tu ne peux pas supprimer ce message.']);
        // le texte reste dans la base (preuve en cas d'abus), mais n'est plus jamais renvoyé
        $pdo->prepare('UPDATE msg_msg SET supprime = 1 WHERE id = ?')->execute([(int) $m['id']]);
        mg_sortir(200, ['ok' => true]);
    }

    mg_sortir(400, ['erreur' => 'Action inconnue.']);
} catch (Throwable $e) {
    mg_sortir(500, ['erreur' => 'Erreur du serveur.']);
}
