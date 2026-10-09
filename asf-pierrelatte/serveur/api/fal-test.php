<?php
// Test : le serveur du club peut-il lire les plateaux du foot animation sur le site de la FFF (epreuves.fff.fr) ?
// À ouvrir une fois, connecté au site avec un compte du bureau : https://asf-pierrelatte.fr/api/fal-test.php
// Ne modifie rien. Le serveur se présente tel qu'il est (le site du club), sans se faire passer pour un navigateur :
// si la FFF refuse les robots, on le respecte et on passe par le favori (le navigateur du dirigeant).
require_once __DIR__ . '/session.php';
date_default_timezone_set('Europe/Paris');
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
if (rang_effectif() < 3) { http_response_code(403); echo "Connecte-toi d'abord au site avec un compte du bureau, puis rouvre cette page.\n"; exit; }
@set_time_limit(60);

const FT_CDG = 125, FT_CLUB = 2177;                                   // district Drôme-Ardèche, ASF Pierrelatte (numéro FFF interne)
const FT_UA = 'ASF-Pierrelatte-site/1.0 (+https://asf-pierrelatte.fr)';
$base = PHP_SAPI === 'cli' && getenv('FT_BASE') ? getenv('FT_BASE') : 'https://epreuves.fff.fr';   // FT_BASE : tests en ligne de commande seulement

function ft_get(string $url, string $accept): array {
    $ch = curl_init($url);
    $h = [];
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
        CURLOPT_USERAGENT => FT_UA, CURLOPT_HTTPHEADER => ['Accept: ' . $accept], CURLOPT_ENCODING => '',
        CURLOPT_HEADERFUNCTION => function ($c, $l) use (&$h) { $p = explode(':', $l, 2); if (count($p) === 2) $h[strtolower(trim($p[0]))][] = trim($p[1]); return strlen($l); }]);
    $b = curl_exec($ch);
    $r = ['code' => (int) curl_getinfo($ch, CURLINFO_HTTP_CODE), 'err' => curl_error($ch), 'h' => $h, 'b' => is_string($b) ? $b : ''];
    curl_close($ch);
    return $r;
}
function ft_ligne(string $titre, array $r): void {
    $srv = implode(', ', $r['h']['server'] ?? []);
    $anti = ($r['code'] === 403 || preg_match('/akamai/i', $srv)) ? '  (protection anti-robots)' : '';
    echo str_pad($titre, 40) . " → réponse " . ($r['code'] ?: 'aucune') . ($r['err'] ? " ({$r['err']})" : '') . "$anti\n";
    $debut = trim(preg_replace('/\s+/', ' ', substr(strip_tags($r['b']), 0, 140)));
    if ($debut !== '') echo "      début : $debut\n";
}
$json = fn(array $r) => $r['code'] === 200 && is_array($d = json_decode($r['b'], true)) ? $d : null;

echo "Test de lecture des plateaux du foot animation · " . date('d/m/Y à H:i') . "\n\n";
$page = ft_get("$base/animation-loisir/cdg/" . FT_CDG . "/club/" . FT_CLUB, 'text/html');
ft_ligne('1. Page Foot animation du club', $page);
$ep = ft_get("$base/api/fal/cdg/" . FT_CDG . "/club/" . FT_CLUB . "/epreuves", 'application/ld+json, application/json');
ft_ligne('2. Liste des épreuves du club', $ep);

$epreuves = ($d = $json($ep)) ? ($d['epreuves'] ?? $d['hydra:member'] ?? []) : null;
$sites = 0; $lus = 0;
if (is_array($epreuves)) {
    echo "\n" . count($epreuves) . " épreuve(s) trouvée(s)" . ($epreuves ? " : " . implode(' · ', array_map(fn($e) => ($e['epNom'] ?? '?') . ' (' . ($e['caCod'] ?? '?') . ')', array_slice($epreuves, 0, 8))) : '') . "\n";
    // les plateaux du mois et des deux suivants, pour la première épreuve
    if ($epreuves) {
        $no = rawurlencode((string) ($epreuves[0]['epNo'] ?? ''));
        for ($i = 0; $i < 3; $i++) {
            $mois = date('Ym', strtotime("first day of +$i month"));
            $r = ft_get("$base/api/fal/cdg/" . FT_CDG . "/club/" . FT_CLUB . "/epreuve/$no/sites?mois=$mois", 'application/ld+json, application/json');
            $s = ($x = $json($r)) ? ($x['epreuve']['sites'] ?? $x['sites'] ?? null) : null;
            echo "   plateaux de " . substr($mois, 4) . "/" . substr($mois, 0, 4) . " : " . (is_array($s) ? count($s) . " trouvé(s)" : "illisible (réponse {$r['code']})") . "\n";
            if (is_array($s)) { $lus++; $sites += count($s); }
            usleep(400000);                                              // doucement : une demande à la fois
        }
    }
}

echo "\nVERDICT : ";
if (is_array($epreuves) && $epreuves && $lus && $sites > 0)
    echo "la FFF laisse le serveur du club lire les plateaux. L'import automatique est possible : envoie cette page à la personne qui s'occupe du site.\n";
elseif (is_array($epreuves) && $lus && $sites === 0)
    echo "la FFF répond, mais avec des listes vides. Soit il n'y a pas encore de plateaux publiés sur ces 3 mois, soit la FFF réserve ces données à son propre site. Refais le test quand le district a publié des dates.\n";
elseif ($page['code'] === 403 || $ep['code'] === 403)
    echo "la FFF refuse le serveur du club (protection anti-robots). On respecte ce refus : les plateaux passeront par le favori « Envoyer au site ASF », depuis ton navigateur.\n";
else
    echo "réponse inattendue. Envoie cette page telle quelle à la personne qui s'occupe du site.\n";
