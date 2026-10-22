<?php
// Notifications : fonctions partagées (push.php, db.php, messagerie.php).
// Appareils Web Push (navigateurs, appli Android) et iPhone avec l'appli du club (endpoint apns:…, envoyés par apns.php).
// Le message n'est pas envoyé dans la notification : l'appareil vient le lire sur /api/push?dernier=1.
// Pour un message personnel, on le range dans notifs/c<id du compte> : l'appareil connecté à ce compte le lira.

if (!defined('VAPID_PUBLIC')) define('VAPID_PUBLIC', 'BGo4HM10InuBdXxhKhoFHQ1NLdCfGOFXe2yiMv-IcFwPDA5LZfSXxLI0za1UxzsdWVp5AJuwuahiFZn80Xo_4fc');
if (!defined('VAPID_SUJET'))  define('VAPID_SUJET', 'mailto:contact@asf-pierrelatte.fr');

if (is_file(__DIR__ . '/apns.php')) require_once __DIR__ . '/apns.php';   // notifications de l'appli iPhone

if (!function_exists('b64u')) {
    function b64u(string $d): string { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }
}

/* Jeton VAPID : prouve au service de notification que l'envoi vient bien du site. */
function jeton_vapid(string $origine): string {
    $entete = b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $corps  = b64u(json_encode(['aud' => $origine, 'exp' => time() + 43200, 'sub' => VAPID_SUJET]));
    $cle = openssl_pkey_get_private(file_get_contents(__DIR__ . '/vapid.pem'));
    if (!$cle) throw new Exception('clé VAPID illisible');
    openssl_sign("$entete.$corps", $der, $cle, OPENSSL_ALGO_SHA256);
    // la signature DER doit être convertie en deux entiers de 32 octets
    $p = 3; $lr = ord($der[$p]); $r = ltrim(substr($der, $p + 1, $lr), "\x00");
    $p += 2 + $lr; $ls = ord($der[$p]); $s = ltrim(substr($der, $p + 1, $ls), "\x00");
    $signature = str_pad($r, 32, "\x00", STR_PAD_LEFT) . str_pad($s, 32, "\x00", STR_PAD_LEFT);
    return "$entete.$corps." . b64u($signature);
}

function b64u_dec(string $s): string { return (string) base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4)); }
/* clé publique brute (65 octets) du téléphone → format PEM que comprend OpenSSL */
function pem_cle_publique(string $point): string {
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $point;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}
/* chiffre le message pour ce téléphone (aes128gcm) ; renvoie le corps à envoyer, ou null si impossible */
function chiffrer_webpush(string $message, array $abo): ?string {
    $uaPub = b64u_dec((string) ($abo['keys']['p256dh'] ?? ''));
    $auth = b64u_dec((string) ($abo['keys']['auth'] ?? ''));
    if (strlen($uaPub) !== 65 || strlen($auth) < 16) return null;
    $eph = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if (!$eph) return null;
    $det = openssl_pkey_get_details($eph);
    $asPub = "\x04" . str_pad($det['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($det['ec']['y'], 32, "\0", STR_PAD_LEFT);
    $cli = openssl_pkey_get_public(pem_cle_publique($uaPub));
    if (!$cli) return null;
    $secret = openssl_pkey_derive($cli, $eph, 32);
    if ($secret === false || strlen($secret) !== 32) return null;
    $ikm = hash_hkdf('sha256', $secret, 32, "WebPush: info\0" . $uaPub . $asPub, $auth);
    $sel = random_bytes(16);
    $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $sel);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $sel);
    $tag = '';
    $ct = openssl_encrypt($message . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    if ($ct === false) return null;
    return $sel . pack('N', 4096) . chr(65) . $asPub . $ct . $tag;
}
/* envoie une notification à un appareil. Avec $message, le texte est chiffré et envoyé dedans ;
   sans, message vide (l'appareil ira lire le dernier message sur le site). Le code de réponse est noté dans $journal. */
function envoyer_notification(array $abo, array &$journal, ?array $message = null): bool {
    $url = $abo['endpoint'] ?? '';
    if (!$url) return false;
    // iPhone avec l'appli du club : notification Apple (APNs), voir apns.php. L'appareil n'est oublié (réponse false)
    // que si Apple dit que le jeton est mort : une clé pas encore réglée ou une panne ne fait jamais perdre un iPhone.
    if (str_starts_with($url, 'apns:')) {
        if (!function_exists('envoyer_apns')) return true;
        $ok = envoyer_apns($abo, $journal, $message ?? ['titre' => 'ASF Pierrelatte', 'texte' => 'Nouveauté sur le site du club', 'lien' => '/']);
        return $ok || empty($GLOBALS['push_a_oublier'][$url]);
    }
    $parts = parse_url($url);
    $origine = $parts['scheme'] . '://' . $parts['host'];
    try { $jwt = jeton_vapid($origine); } catch (Throwable $e) { $journal[] = $e->getMessage(); return false; }
    $corps = null;
    if ($message !== null) {
        try { $corps = chiffrer_webpush(json_encode($message, JSON_UNESCAPED_UNICODE), $abo); } catch (Throwable $e) { $corps = null; }
    }
    $entetes = ['TTL: 86400', 'Urgency: high', 'Authorization: vapid t=' . $jwt . ', k=' . VAPID_PUBLIC];
    if ($corps !== null) { $entetes[] = 'Content-Encoding: aes128gcm'; $entetes[] = 'Content-Type: application/octet-stream'; $entetes[] = 'Content-Length: ' . strlen($corps); }
    else $entetes[] = 'Content-Length: 0';
    $c = curl_init($url);
    curl_setopt_array($c, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_POSTFIELDS => $corps ?? '',
        CURLOPT_HTTPHEADER => $entetes,
    ]);
    $rep = (string) curl_exec($c);
    $code = curl_getinfo($c, CURLINFO_HTTP_CODE);
    $err = curl_error($c);
    curl_close($c);
    $journal[] = ['service' => $parts['host'], 'code' => $code, 'chiffre' => $corps !== null, 'detail' => $code >= 400 ? mb_substr(trim($rep ?: $err), 0, 160) : ''];
    if ($code === 404 || $code === 410) return false;    // abonnement expiré : l'appareil sera oublié
    return $code < 400;                                  // une coupure réseau (0) ne fait pas oublier l'appareil
}

function push_lire(PDO $pdo, string $chemin) {
    $st = $pdo->prepare('SELECT data FROM documents WHERE path = ?');
    $st->execute([$chemin]);
    return json_decode($st->fetchColumn() ?: 'null', true);
}
function push_ecrire(PDO $pdo, string $chemin, $data): void {
    $pdo->prepare('INSERT INTO documents (path, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), maj = NOW()')
        ->execute([$chemin, json_encode($data, JSON_UNESCAPED_UNICODE)]);
}

/* Prévenir seulement certaines personnes : les appareils reliés à ces comptes, ou à ces rôles (ex. « bureau »).
   Renvoie le nombre d'appareils prévenus. */
function notifier_cibles(PDO $pdo, array $comptes, array $roles, string $titre, string $texte, string $lien = '/#espace'): int {
    $comptes = array_values(array_filter(array_map('strval', $comptes), 'strlen'));
    $abos = push_lire($pdo, 'site/abonnes') ?: [];
    $cibles = array_values(array_filter($abos, fn($a) =>
        (isset($a['compte']) && in_array((string) $a['compte'], $comptes, true))
        || (isset($a['role']) && in_array((string) $a['role'], $roles, true))));
    if (!$cibles) return 0;
    $message = ['titre' => $titre, 'texte' => $texte, 'lien' => $lien, 'date' => date('c'), 'perso' => true];
    foreach (array_unique(array_filter(array_map(fn($a) => (string) ($a['compte'] ?? ''), $cibles), 'strlen')) as $id)
        push_ecrire($pdo, "notifs/c$id", $message);             // lu par l'appareil de cette personne quand la notification arrive
    $journal = []; $n = 0;
    foreach ($cibles as $a) if (envoyer_notification($a, $journal, $message)) $n++;
    if (function_exists('push_purger')) push_purger($pdo);                  // les iPhone dont l'appli a été supprimée
    $GLOBALS['push_journal'] = $journal;
    return $n;
}


/* ===== convocation : un message personnel à chaque joueur convoqué ===== */
function push_simple(string $t): string {
    $t = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', mb_strtolower($t)) ?: mb_strtolower($t);
    $m = preg_split('/[^a-z0-9]+/', $t, -1, PREG_SPLIT_NO_EMPTY);
    sort($m);
    return implode(' ', $m);                                   // « ANDRE Kylian » = « Kylian Andre »
}
function push_prenom(string $nom): string {
    $m = preg_split('/\s+/u', trim($nom), -1, PREG_SPLIT_NO_EMPTY);
    $pre = array_values(array_filter($m, fn($w) => mb_strtoupper($w) !== $w || mb_strlen($w) === 1));
    $p = $pre ? implode(' ', $pre) : ($m[0] ?? '');
    return mb_strtoupper(mb_substr($p, 0, 1)) . mb_strtolower(mb_substr($p, 1));
}
function push_joli(string $t): string {
    $t = trim(preg_replace('/\s+\d+$/', '', $t));
    $mots = preg_split('/\s+/u', $t, -1, PREG_SPLIT_NO_EMPTY);
    foreach ($mots as $i => &$w) {
        if (str_contains($w, '.') || (mb_strlen($w) <= 3 && mb_strtoupper($w) === $w && preg_match('/^\p{L}+$/u', $w) && !in_array(mb_strtolower($w), ['de', 'du', 'la', 'le', 'les', 'des'], true))) { $w = mb_strtoupper($w); continue; }
        if ($i > 0 && in_array(mb_strtolower($w), ['de', 'du', 'la', 'le', 'les', 'des', 'et', 'sur'], true)) { $w = mb_strtolower($w); continue; }
        $w = mb_strtolower($w);
        $w = preg_replace_callback("/(^|[-'’])(\p{L})/u", fn($x) => $x[1] . mb_strtoupper($x[2]), $w);
    }
    unset($w);
    return implode(' ', $mots);
}
/* $d : equipe, adv, date (AAAA-MM-JJ), heure (HH:MM), rdvHeure, rdvLieu, joueurs (noms des convoqués) */
function notifier_convocation(PDO $pdo, array $d): array {
    $abos = push_lire($pdo, 'site/abonnes') ?: [];
    $jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    $mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    $t = strtotime(($d['date'] ?? '') . ' 12:00');
    $jour = '';
    if ($t) {
        $jour = $jours[(int) date('w', $t)];
        if ($t - time() > 6 * 86400 || $t < strtotime('today')) $jour .= ' ' . (int) date('j', $t) . ' ' . $mois[(int) date('n', $t) - 1];
    }
    $h = fn($x) => preg_match('/^(\d{1,2}):(\d{2})/', (string) $x, $m) ? (int) $m[1] . 'h' . $m[2] : '';
    $lieuRdv = trim((string) ($d['rdvLieu'] ?? ''));
    if ($lieuRdv !== '' && !preg_match('/^(au|aux|à|a|devant|sur|chez|dans|en)\b/iu', $lieuRdv)) $lieuRdv = 'au ' . $lieuRdv;
    $rdv = $h($d['rdvHeure'] ?? '') !== '' ? ' RDV ' . $h($d['rdvHeure']) . ($lieuRdv !== '' ? ' ' . $lieuRdv : '') . '.' : '';
    $corps = trim(($d['equipe'] ?? '') . ' – ' . push_joli((string) ($d['adv'] ?? '')))
        . ($jour !== '' ? ", $jour" : '') . ($h($d['heure'] ?? '') !== '' ? ' à ' . $h($d['heure']) : '') . '.'
        . $rdv . ' Allez Pierrelatte 💪🔵⚪';
    $prevenus = []; $sans = []; $journal = []; $appareils = 0;
    foreach ((array) ($d['joueurs'] ?? []) as $nom) {
        $cle = push_simple((string) $nom);
        if ($cle === '') continue;
        $siens = array_values(array_filter($abos, fn($a) => !empty($a['compte'])
            && ((isset($a['joueur']) && $a['joueur'] !== '' && push_simple($a['joueur']) === $cle) || (isset($a['nom']) && push_simple($a['nom']) === $cle))));
        if (!$siens) { $sans[] = (string) $nom; continue; }
        $message = ['titre' => push_prenom((string) $nom) . ', tu es convoqué ✅', 'texte' => $corps, 'lien' => '/#joueur', 'date' => date('c'), 'perso' => true];
        foreach (array_unique(array_map(fn($a) => (string) $a['compte'], $siens)) as $id) push_ecrire($pdo, "notifs/c$id", $message);
        foreach ($siens as $a) if (envoyer_notification($a, $journal, $message)) $appareils++;
        $prevenus[] = (string) $nom;
    }
    if (function_exists('push_purger')) push_purger($pdo);
    return ['prevenus' => count($prevenus), 'appareils' => $appareils, 'sansAppareil' => $sans, 'exemple' => $corps, 'journal' => $journal];
}
