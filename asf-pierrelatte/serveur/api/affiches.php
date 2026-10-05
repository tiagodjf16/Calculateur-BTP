<?php
// Affiches dessinées par le serveur, et publication sur la page Facebook du club.
//  - stories des compos (V34) : la story des convoqués quand le coach valide sa compo, la story de la composition
//    30 minutes avant le match (cron des 5 minutes : php …/api/affiches.php compos), en story seulement.
//  - depuis la V33 : affiches « stade de nuit » quand img/fond-domicile.jpg et img/fond-exterieur.jpg sont les nouveaux fonds
//    (1520 x 2180, voir la section du même nom), faites pour chaque format : story 1080 x 1920, publication Instagram
//    1080 x 1350, publication Facebook 1080 x 2160 ; avec les anciens fonds (feuilles 1080 x 1620), rien ne change.
//  - chaque lundi à 9 h : résultats du week-end passé + rencontres du week-end à venir (2 stories + 1 publication avec texte)
//  - le jour d'un match à 9 h : l'affiche de chaque équipe qui joue (story seule)
// Appelé par sync.php (cron horaire). Aperçu pour le bureau : /api/affiches.php?apercu=programme|resultats|match
require_once __DIR__ . '/session.php';
date_default_timezone_set('Europe/Paris');

const AFF_W = 1080, AFF_H = 1920;
$GLOBALS['aff_h'] = AFF_H;
function aff_h(): int { return (int) $GLOBALS['aff_h']; }
function aff_format(string $f): void { $GLOBALS['aff_h'] = ['post' => 1350, 'carre' => 1350, 'fb' => 2160][$f] ?? AFF_H; }
const AFF_SPONSORS_DEFAUT = ['06852d18568369ed3d2a25699b8ba89d', 'd04f5c2d1ae691508adef2afe070bc96', '7667336e5765293f6f3a1514dff12885', '73a52a180481cf087155c4b55d8b8113', 'fd88bb270c793e1b42ef3af2516d8e71', '56e1810bc0e96a0ee5dccdc84d407ea4', '1ab83d9a3dd4b419aab98a7026c2efba', 'b8f1e7a2a8e500fa961768edb816cea2', '2a31d7dc22f171c9dc2e33edc6bd759c', 'f9b791f61c2ba06cc52abba681d374f7', '1cd0bfa977a6adc2e52a591619fc7ea9', 'f3e760daba1e33a9a9a4fbb05927f6e9', '8e4fa34c8c791a460cbfaa5639a9352c', 'bf43b5b9890b0ff1a66b4fc114a81fa0', 'e287a40273d3139775553377548d0dd5', 'da93b7831cadb555d110e842820794f2', 'a720cdaebb6d49f5d52fb328d4d4d9e8', '151e845c78cc61883b3c233149af8cbc', 'd0d12cf8c82b94ebb44ffb88feb8bc51', '3a7fcee0a65c05f3deb0206f154e611c'];
const AFF_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const AFF_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const FB_VERSION = 'v21.0';
if (!function_exists('str_starts_with')) { function str_starts_with(string $h, string $n): bool { return strncmp($h, $n, strlen($n)) === 0; } }
if (!function_exists('str_ends_with')) { function str_ends_with(string $h, string $n): bool { return $n === '' || substr($h, -strlen($n)) === $n; } }

/* ---------- réglages privés (jamais renvoyés par l'API de données) ---------- */
function reglage(string $cle, ?string $defaut = null): ?string {
    base()->exec("CREATE TABLE IF NOT EXISTS reglages (cle VARCHAR(120) PRIMARY KEY, valeur MEDIUMTEXT NOT NULL) DEFAULT CHARSET=utf8mb4");
    $st = base()->prepare('SELECT valeur FROM reglages WHERE cle = ?');
    $st->execute([$cle]);
    $v = $st->fetchColumn();
    return $v === false ? $defaut : $v;
}
function reglage_ecrire(string $cle, ?string $valeur): void {
    base()->exec("CREATE TABLE IF NOT EXISTS reglages (cle VARCHAR(120) PRIMARY KEY, valeur MEDIUMTEXT NOT NULL) DEFAULT CHARSET=utf8mb4");
    if ($valeur === null) { base()->prepare('DELETE FROM reglages WHERE cle = ?')->execute([$cle]); return; }
    base()->prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON DUPLICATE KEY UPDATE valeur = VALUES(valeur)')->execute([$cle, $valeur]);
}

const AFF_CLUBS_DISTRICT = [
    'R.C. SAVASSON' => 538001,
    'A. S. BERG HELVIE' => 581498,
    'A. S. DU DOLON' => 526432,
    'A. S. VEORE MONTOISON' => 580604,
    'A.OM.C. ST REMEZE' => 531589,
    'A.S. ALBOUSSIERE' => 528354,
    'A.S. CANCOISE VILLEVOCANCE' => 530368,
    'A.S. CHAVANAY' => 519727,
    'A.S. CORNAS' => 536261,
    'A.S. LA SANNE ST ROMAIN DE SURIE' => 528571,
    'A.S. ROUSSAS GRANGES GONTARDES' => 532967,
    'A.S. ST BARTHELEMY DE VALS' => 520419,
    'A.S. ST MARCELLOISE' => 526341,
    'A.S. VALENSOLLES' => 521003,
    'ALLEX CHABRILLAN EURRE FOOTBALL CLUB' => 560137,
    'AM.S. DONATIENNE' => 504316,
    'ATHLETIC FOOT CEVEN' => 561202,
    "ATOM'SPORTS FOOTBALL PIERRELATTE" => 504261,
    'AV. S. SUD ARDECHE FOOTBALL' => 550020,
    'AV.S. ROIFFIEUX' => 530927,
    'C.O. CHATEAUNEUF DU RHONE' => 525624,
    'C.O. DONZEROIS' => 504332,
    'C.OM. CHATEAUNEVOIS' => 532822,
    'C.S. CHATEAUNEUF DE GALAURE' => 517555,
    'CERC.S. DE MALATAVERNE' => 533767,
    'DIOIS F.C.' => 548847,
    'E.S. BOULIEU LES ANNONAY' => 504545,
    'EN AVANT MONTVENDRE' => 552265,
    'ENT. S. NORD DROME' => 580873,
    'ENT. SARRAS SPORTS ST VALLIER' => 541513,
    'ENT.S. CHOMERACOISE' => 529711,
    'ENT.S. TREFLE F.' => 549007,
    'ENTENTE CREST AOUSTE' => 551477,
    'ENTENTE SPORTIVE BEAUMONTELEGER' => 582281,
    'ESP. HOSTUNOISE' => 519000,
    'ESPOIR VALENTINOIS' => 552755,
    'ET.S. MALISSARDOISE' => 523342,
    'F. AVENIR LE TEIL MELAS' => 515526,
    'F. C. CLERIEUX-ST/BARDOUX-GRANGES/LES/BEAUMONT' => 553842,
    'F. C. DES JEUNES DE VINEZAC' => 553208,
    'F. C. RAMBERTOIS' => 554458,
    'F. C. RHONE VALLEES' => 551476,
    'F. C. ROCHEGUDIEN' => 563906,
    'F.C. ALIXAN' => 525306,
    'F.C. ANNONAY' => 504343,
    'F.C. BOURG LES VALENCE' => 504375,
    'F.C. BOURGUISAN' => 524469,
    'F.C. BREN' => 536241,
    'F.C. CHABEUILLOIS' => 519780,
    'F.C. CHEYLAROIS' => 504310,
    'F.C. COLOMBIER ST BARTHELEMY' => 549369,
    "F.C. DE LA VALDAINE CLEON D'ANDR" => 540857,
    'F.C. DU CHATELET' => 581391,
    'F.C. DU PLATEAU ARDECHOIS' => 519782,
    'F.C. EYRIEUX EMBROYE' => 546292,
    'F.C. FELINES ST CYR PEAUGRES' => 520730,
    'F.C. GOUBETOIS' => 520265,
    'F.C. HAUTERIVE U.S. GRAND SERRE' => 546999,
    'F.C. LARNAGE SERVES' => 550007,
    'F.C. MUZOLAIS' => 532844,
    'F.C. PEAGEOIS' => 504390,
    'F.C. PORTOIS' => 509606,
    'F.C. SAUZET' => 519783,
    'F.C. TRICASTIN' => 504293,
    "F.C. VALLON PONT D'ARC" => 544907,
    'FOOTBALL CLUB BAUME BOUCHET MONTSEGUR' => 524479,
    'FOOTBALL CLUB HERMITAGE' => 551563,
    'FOOTBALL CLUB MONTELIMAR' => 528941,
    'FOOTBALL EN MONT PILAT' => 552125,
    'FOY.RUR ALLAN' => 517028,
    'IN.C.F. BARB. BESAV.ROCH.SAMSON' => 523208,
    'JOYEUSE S. ST PAUL' => 518765,
    'O. CENTRE ARDECHE' => 504370,
    'O. DE VALENCE' => 549145,
    "O. S. VALLEE DE L'OUVEZE" => 553425,
    'O. SALAISE RHODIA' => 504465,
    'O. ST MONTANAIS' => 548044,
    'PERSEVERANTE S. ROMANAISE' => 504462,
    'R.C. MALVINOIS MAUVES' => 535236,
    'R.C. TOURNON TAIN' => 504437,
    'RHONE CRUSSOL FOOT 07' => 551992,
    'S.C. BOURGUESAN' => 504307,
    'SPORTING CLUB BASSE ARDECHE' => 548045,
    'U. MONTILIENNE S.' => 500355,
    'U. S. CHANAS SABLONS SERRIERES' => 504422,
    "U. S. DU VAL D'AY" => 550632,
    'U. S. MONTMEYRAN' => 552154,
    'U. S. PORTES HAUTES CEVENNES' => 581869,
    'U. S. VALLEE-JABRON' => 590379,
    'U.S. ANCONE' => 520597,
    'U.S. DAVEZIEUX VIDALON' => 509197,
    'U.S. DE PONT LA ROCHE' => 518181,
    'U.S. MONTELIER' => 521473,
    'U.S. MOURSOISE' => 522881,
    'U.S. PEYRINOISE' => 518770,
    'U.S. ROCHEMAURE' => 527007,
    'U.S. ST JUST ST MARCEL' => 545636,
    'U.S. VALS LES BAINS' => 504247,
    'UNION SPORTIVE 2 VALLONS' => 529284,
    'UNION SPORTIVE BAS VIVARAIS' => 560190,
    'UNION SPORTIVE BEAUFORT-AOUSTE' => 524598,
];

function aff_club_numero(string $nom): ?int {
    static $idx = null, $mots = null;
    if ($idx === null) {
        $idx = []; $mots = [];
        $tous = AFF_CLUBS_DISTRICT;
        foreach ((aff_doc('site/clubs-district')['clubs'] ?? []) as $n => $c) if ((int) $c > 0 && !isset($tous[$n])) $tous[$n] = (int) $c;   // liste FFF complète
        foreach ($tous as $n => $c) {
            $idx[cle_club($n)] = $c; $idx[aff_simplifie($n)] = $c;
            $mots[$c] = array_filter(explode('-', aff_simplifie($n)), fn($m) => strlen($m) > 1);
        }
    }
    if (isset($idx[cle_club($nom)])) return $idx[cle_club($nom)];
    if (isset($idx[aff_simplifie($nom)])) return $idx[aff_simplifie($nom)];
    // nom court (« Malataverne », « Centre Ardèche ») : le club dont le nom contient tous ces mots
    $cherche = array_filter(explode('-', aff_simplifie($nom)), fn($m) => strlen($m) > 1);
    if (!$cherche) return null;
    $trouves = [];
    foreach ($mots as $c => $m) if (!array_diff($cherche, $m)) $trouves[] = $c;
    return count($trouves) === 1 ? $trouves[0] : null;
}
/* logo d'un club du district : téléchargé une fois depuis le CDN de la FFF, puis gardé dans /logos */
function aff_logo_district(string $nom) {
    $n = aff_club_numero($nom); if (!$n) return null;
    $dossier = dirname(__DIR__) . '/logos'; if (!is_dir($dossier)) @mkdir($dossier, 0755, true);
    $f = "$dossier/fff-$n.jpg";
    if (!is_file($f) || filesize($f) < 300) {
        $ch = curl_init("https://cdn-transverse.azureedge.net/phlogos/BC$n.jpg");
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => true, CURLOPT_USERAGENT => 'Mozilla/5.0']);
        $b = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        if ($code !== 200 || !$b || strlen($b) < 300) return null;
        @file_put_contents($f, $b);
    }
    static $cache = [];
    if (!array_key_exists($f, $cache)) { $src = aff_image($f); $cache[$f] = $src ? aff_logo_net($src) : null; }
    return $cache[$f];
}
/* plateaux et brassages saisis à la main dans api/plateaux.txt — une ligne par rendez-vous, morceaux séparés par | :
     26/09 | U6-U7 | 9h30 | chez U. Montilienne S. | Stade de l'Hippodrome, 26200 Montélimar
     26/09 | U13 équipe 4 | 14h | domicile | contre Malataverne 3-1, Centre Ardèche 2-2
   L'ordre des morceaux n'a pas d'importance : chacun est reconnu à sa forme. */
function aff_plateaux_fichier(): array {
    $f = __DIR__ . '/plateaux.txt'; if (!is_file($f)) return [];
    $out = [];
    $moisDebut = 8;                                                   // la saison commence en août
    foreach (file($f, FILE_IGNORE_NEW_LINES) ?: [] as $ligne) {
        $ligne = trim((string) $ligne); if ($ligne === '' || $ligne[0] === '#') continue;
        $date = $heure = $equipe = $adresse = ''; $lieu = null; $dom = false; $adv = []; $res = [];
        foreach (array_filter(array_map('trim', explode('|', $ligne)), 'strlen') as $bout) {
            if (!$date && preg_match('#^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$#', $bout, $d)) {
                $mois = (int) $d[2]; $jour = (int) $d[1];
                if (!empty($d[3])) $an = strlen($d[3]) === 2 ? 2000 + (int) $d[3] : (int) $d[3];
                else { $a = (int) date('Y'); $saison = (int) date('n') >= $moisDebut ? $a : $a - 1; $an = $mois >= $moisDebut ? $saison : $saison + 1; }
                $date = sprintf('%04d-%02d-%02d', $an, $mois, $jour);
            } elseif (!$equipe && preg_match('/^U\s?\d{1,2}/i', $bout)) {
                $equipe = aff_maj(preg_replace('/\s*[-\/]\s*/', ' · ', preg_replace('/\s+/', ' ', $bout)));
                $equipe = preg_replace('/U\s?13\s*(?:·\s*)?(?:ÉQUIPE|EQUIPE|EQ\.?)?\s*(\d+)$/u', 'U13 · ÉQUIPE $1', $equipe);
            } elseif (!$heure && preg_match('/^(\d{1,2})\s*[h:]\s*(\d{2})?$/i', $bout, $h)) {
                $heure = sprintf('%02d:%s', (int) $h[1], $h[2] ?? '00');
            } elseif (preg_match('/^(à\s+)?domicile$/iu', $bout)) {
                $dom = true; $lieu = '';
            } elseif (preg_match('/^(?:chez|à|a)\s+(.+)$/iu', $bout, $x)) {
                $lieu = trim($x[1]);
            } elseif (preg_match('/^contre\s+(.+)$/iu', $bout, $x)) {
                foreach (preg_split('/\s*[,;]\s*|\s+et\s+/iu', $x[1]) as $a) {
                    if (!preg_match('/^(.*?)(?:\s+(\d+)\s*-\s*(\d+))?$/u', trim($a), $y) || trim($y[1]) === '') continue;
                    $adv[] = trim($y[1]);
                    if (isset($y[2]) && $y[2] !== '') $res[] = ['adv' => trim($y[1]), 'bp' => (int) $y[2], 'bc' => (int) $y[3]];
                }
            } else {
                $adresse = $bout;                                   // tout le reste : l'adresse du stade
            }
        }
        if (!$date || !$equipe) continue;
        if ($lieu === null) $dom = true;                              // rien d'indiqué : à domicile
        $out[] = ['id' => 'pl-' . substr(md5($date . '|' . $equipe . '|' . ($lieu ?? '')), 0, 12), 'equipe' => $equipe,
            'comp' => preg_match('/U\s?13/i', $equipe) ? 'Brassage' : 'Plateau', 'adv' => $dom ? '' : aff_maj((string) $lieu), 'dom' => $dom,
            'date' => $date, 'heure' => $heure ?: '10:00', 'adresse' => $dom ? '' : $adresse, 'adversaires' => array_map('aff_maj', $adv),
            'resultats' => array_map(fn($r) => ['adv' => aff_maj($r['adv']), 'bp' => $r['bp'], 'bc' => $r['bc']], $res), 'bp' => null, 'bc' => null];
    }
    return $out;
}

/* ---------- données ---------- */
function aff_doc(string $chemin): array {
    $st = base()->prepare('SELECT data FROM documents WHERE path = ?');
    $st->execute([$chemin]);
    return json_decode((string) $st->fetchColumn(), true) ?: [];
}
function aff_matchs(): array {
    $l = [];
    foreach (base()->query("SELECT path, data, maj FROM documents WHERE path LIKE 'matchs/%'") as $r) {
        $m = json_decode($r['data'], true) ?: [];
        $m['id'] = substr($r['path'], 7); $m['_maj'] = (string) ($r['maj'] ?? '');
        if (str_starts_with($m['id'], 'fal-')) continue;             // anciens envois du favori : remplacés par api/plateaux.txt
        $l[] = afn_depuis_base($m);                                    // poules, horaires et scores saisis dans Matchs et plateaux
    }
    return array_merge($l, aff_plateaux_fichier());
}
function aff_joue(array $m): bool { return is_numeric($m['bp'] ?? null) && is_numeric($m['bc'] ?? null); }
function aff_issue(array $m): string { return $m['bp'] > $m['bc'] ? 'V' : ($m['bp'] < $m['bc'] ? 'D' : 'N'); }
function aff_hfr(?string $h): string { return str_replace(':', 'h', (string) $h); }
function aff_date_longue(string $d): string {
    $t = strtotime($d . ' 12:00');
    return AFF_JOURS[(int) date('w', $t)] . ' ' . (int) date('j', $t) . ' ' . AFF_MOIS[(int) date('n', $t) - 1];
}
function aff_maj(string $s): string { return mb_strtoupper($s, 'UTF-8'); }
function aff_club(): array {
    $c = aff_doc('site/club');
    return ['nomCourt' => $c['nomCourt'] ?? 'Pierrelatte', 'stade' => $c['stade'] ?? 'Stade Gustave Jaume',
            'adresse' => 'Stade Gustave Jaume, avenue Pierre de Coubertin, 26700 Pierrelatte'];
}
function aff_lieu(array $m): string {
    if (!empty($m['dom'])) return aff_club()['adresse'];
    if (!empty($m['adresse'])) return $m['adresse'];
    return 'Stade de ' . preg_replace('/\s+\d+$/', '', (string) $m['adv']);
}
/* vendredi, samedi et dimanche du week-end qui contient (ou suit) la date donnée */
function aff_weekend(string $samedi): array {
    $t = strtotime($samedi . ' 12:00');
    return [date('Y-m-d', $t - 86400), date('Y-m-d', $t), date('Y-m-d', $t + 86400)];
}
/* Niveau court à partir de la compétition : « Régional 2 » → R2, « D1 Unique » → D1, « Brassage » → BR, coupes → COUPE */
function aff_niveau(string $comp): string {
    $c = mb_strtolower($comp);
    if (preg_match('/r[ée]gional\s*(\d)/u', $c, $x)) return 'R' . $x[1];
    if (preg_match('/\bd\s*(\d)\b|district\s*(\d)|division\s*(\d)/u', $c, $x)) return 'D' . ($x[1] ?: ($x[2] ?? '') ?: ($x[3] ?? ''));
    if (str_contains($c, 'brassage')) return 'BR';
    if (str_contains($c, 'coupe') || str_contains($c, 'gambardella')) return 'COUPE';
    if (preg_match('/poule\s*([a-z0-9])/u', $c, $x)) return 'P' . mb_strtoupper($x[1]);
    return '2';
}
/* « R2 · POULE C », « BRASSAGE · POULE K », « D1 », « COUPE » : ce qui distingue deux équipes d'une même catégorie */
function aff_sous_etiquette(string $comp): string {
    $n = aff_niveau($comp); $parts = [];
    if ($n === 'BR') $parts[] = 'BRASSAGE'; elseif ($n !== '2' && !str_starts_with($n, 'P')) $parts[] = $n;
    if (preg_match('/poule\s*([a-z0-9]+)/iu', $comp, $x)) $parts[] = 'POULE ' . mb_strtoupper($x[1]);
    return implode(' · ', $parts);
}
/* matchs du foot animation (plateaux U6 à U11, brassage U13) : ils ont leurs propres affiches */
const AFF_EQUIPES_FAL = ['U6 · U7', 'U8 · U9', 'U8 · U9 PROMOTION', 'U8 · U9 ESPOIR', 'U8 · U9 BOURGEON', 'U10 · U11 AVENIR', 'U10 · U11 ESPOIR', 'U10 · U11 BOURGEONS', 'U13 · ÉQUIPE 3', 'U13 · ÉQUIPE 4'];
function aff_fal_valide(array $m): bool { return in_array(mb_strtoupper(trim((string) ($m['equipe'] ?? ''))), AFF_EQUIPES_FAL, true); }
/* matchs des vétérans (onglet Vétérans de l'espace club) */
function aff_vet(array $m): bool {
    return str_starts_with((string) ($m['id'] ?? ''), 'vet-') || (bool) preg_match('/v[ée]t[ée]ran/iu', (string) ($m['equipe'] ?? ''));
}
function aff_fal(array $m): bool {
    $id = (string) ($m['id'] ?? '');
    if (str_starts_with($id, 'pl-')) return true;                     // saisi dans api/plateaux.txt
    if (str_starts_with($id, 'fff-')) return false;                   // championnats FFF (U15 et U17 en brassage compris)
    // saisi à la main : seulement l'école de foot et les U13
    return (bool) preg_match('/plateau|brassage|animation|rentr[ée]e du foot/i', (string) ($m['comp'] ?? ''))
        && (bool) preg_match('/\bu\s?(6|7|8|9|10|11|13)\b|u6 à u11/i', (string) ($m['equipe'] ?? '') . ' ' . (string) ($m['comp'] ?? ''));
}
function aff_plan_weekend(array $matchs, string $samedi, bool $resultats, ?string $lieu = null): array {
    if (isset($GLOBALS['aff_plan_manuel'])) return afn_plan_manuel($GLOBALS['aff_plan_manuel'], $resultats, $lieu);   // onglet « Affiches matchs »
    $fal = !empty($GLOBALS['aff_fal']);
    $matchs = array_values(array_filter($matchs, fn($m) => aff_fal($m) === $fal));
    if ($fal) $matchs = array_values(array_filter($matchs, 'aff_fal_valide'));   // pas de doublon avec une ancienne fiche « U10 · U11 »
    $vet = !empty($GLOBALS['aff_vet']);                                          // vétérans : annonces à part
    $matchs = array_values(array_filter($matchs, fn($m) => aff_vet($m) === $vet));
    if ($vet && $resultats) $matchs = array_values(array_filter($matchs, 'aff_joue'));  // résultats vétérans : seulement avec un score
    // foot animation : pas de résultats pour l'école de foot (U6 à U11) ; seuls les brassages U13 avec leurs scores
    if ($fal && $resultats) $matchs = array_values(array_filter($matchs, fn($m) => aff_scores_brassage($m)));
    $jours = aff_weekend($samedi);
    if ($lieu === 'dom') $matchs = array_filter($matchs, fn($m) => !empty($m['dom']));
    if ($lieu === 'ext') $matchs = array_filter($matchs, fn($m) => empty($m['dom']));
    // résultats : TOUS les matchs du week-end, même ceux pas encore joués (sans score : « NC ») : l'aperçu d'un week-end
    // en cours montre déjà la liste complète ; le lundi, tout est joué. Rencontres : les matchs pas encore joués.
    $sel = array_filter($matchs, fn($m) => in_array($m['date'] ?? '', $jours, true) && ($resultats ? true : !aff_joue($m)));
    // vrais doublons (même match remonté deux fois, nom d'adversaire écrit un peu différemment) : on n'en garde qu'un
    $uniques = [];
    foreach ($sel as $m) {
        $k = $m['date'] . '|' . cle_club((string) ($m['equipeDetail'] ?? $m['equipe'])) . '|' . aff_simplifie((string) $m['adv']);
        if (!isset($uniques[$k]) || (aff_joue($m) && !aff_joue($uniques[$k])) || (empty($uniques[$k]['heure']) && !empty($m['heure']))) $uniques[$k] = $m;
    }
    // même équipe, même compétition, même adversaire deux fois dans le week-end (match reporté dont l'ancienne date
    // est restée) : un seul sur l'affiche, celui qui a un score, sinon le plus récemment mis à jour par la FFF
    $parWeekend = [];
    foreach ($uniques as $m) {
        $k = cle_club((string) ($m['equipeDetail'] ?? $m['equipe'])) . '|' . aff_sous_etiquette((string) ($m['comp'] ?? '')) . '|' . aff_simplifie((string) $m['adv']) . '|' . (empty($m['dom']) ? 'e' : 'd');
        $garde = $parWeekend[$k] ?? null;
        if (!$garde || [aff_joue($m), $m['_maj'] ?? ''] > [aff_joue($garde), $garde['_maj'] ?? '']) $parWeekend[$k] = $m;
    }
    $sel = array_values($parWeekend);
    // match impossible : une équipe ne joue qu'un match de championnat par week-end dans une compétition.
    // Si elle en a deux contre des adversaires différents, on garde celui dont l'adversaire est vraiment dans sa poule
    // (classements FFF de la poule) : l'autre est une erreur du calendrier FFF.
    $groupes = [];
    foreach ($sel as $i => $m) {
        if (aff_fal($m)) continue;                                   // plateaux : plusieurs rendez-vous possibles, rien à vérifier
        $groupes[cle_club((string) ($m['equipeDetail'] ?? $m['equipe'])) . '|' . mb_strtolower(trim((string) ($m['comp'] ?? '')))][] = $i;
    }
    $retires = [];
    foreach ($groupes as $ids) {
        if (count($ids) < 2) continue;
        $avecScore = array_filter($ids, fn($i) => aff_joue($sel[$i]));
        if ($avecScore && count($avecScore) < count($ids)) {        // même équipe, même compétition : le match sans score est l'erreur
            foreach (array_diff($ids, $avecScore) as $i) $retires[$i] = true;
            $ids = array_values($avecScore);
            if (count($ids) < 2) continue;
        }
        $comp = mb_strtolower(trim((string) ($sel[$ids[0]]['comp'] ?? '')));
        $poule = aff_equipes_poule($comp);
        if (!$poule) continue;                                   // pas de classement pour vérifier : on ne touche à rien
        $dansPoule = array_filter($ids, fn($i) => isset($poule[aff_simplifie((string) $sel[$i]['adv'])]));
        if ($dansPoule && count($dansPoule) < count($ids)) foreach (array_diff($ids, $dansPoule) as $i) $retires[$i] = true;
    }
    if ($retires) $sel = array_values(array_diff_key($sel, $retires));
    // niveau et poule notés pour chaque match : deux équipes d'une même catégorie sont toujours différenciées
    foreach ($sel as &$m) {
        $m['sous'] = aff_sous_etiquette((string) ($m['comp'] ?? ''));
        $m['etiquette'] = $m['equipe'] . ($m['sous'] !== '' ? ' (' . mb_convert_case(mb_strtolower($m['sous']), MB_CASE_TITLE) . ')' : '');
    }
    unset($m);
    $out = [];
    foreach ($jours as $d) {
        $l = array_values(array_filter($sel, fn($m) => $m['date'] === $d));
        usort($l, fn($a, $b) => strcmp((string) ($a['heure'] ?? ''), (string) ($b['heure'] ?? '')));
        if ($l) $out[] = ['date' => $d, 'matchs' => $l];
    }
    return $out;
}

/* ---------- dessin : outils ---------- */
const AFF_FICHIERS_POLICES = ['900' => 'BarlowCondensed-Black.ttf', '800' => 'BarlowCondensed-ExtraBold.ttf', '700' => 'BarlowCondensed-Bold.ttf', '600' => 'BarlowCondensed-SemiBold.ttf'];
/* On cherche les polices à plusieurs endroits, au cas où le dossier aurait été déposé ailleurs ; à défaut, une autre graisse. */
function aff_police(string $poids): string {
    static $cache = [];
    if (isset($cache[$poids])) return $cache[$poids];
    $dossiers = [__DIR__ . '/polices', dirname(__DIR__) . '/polices', dirname(__DIR__) . '/api/polices', __DIR__, dirname(__DIR__) . '/Barlow_Condensed', __DIR__ . '/polices/Barlow_Condensed'];
    $voulu = AFF_FICHIERS_POLICES[$poids] ?? 'BarlowCondensed-Bold.ttf';
    foreach (array_merge([$voulu], array_values(AFF_FICHIERS_POLICES)) as $f) foreach ($dossiers as $d) {
        if (is_file("$d/$f") && is_readable("$d/$f")) return $cache[$poids] = "$d/$f";
    }
    return $cache[$poids] = '';
}
function aff_polices_ok(): bool { return aff_police('800') !== '' && function_exists('imagettftext'); }
function aff_c($im, string $hex, float $opacite = 1.0): int {
    $hex = ltrim($hex, '#');
    $a = (int) round(127 * (1 - max(0, min(1, $opacite))));
    return imagecolorallocatealpha($im, hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2)), $a);
}
function aff_larg(string $t, float $px, string $poids): float {
    $f = aff_police($poids);
    if ($f === '' || !function_exists('imagettfbbox')) return strlen($t) * $px * .5;
    $b = @imagettfbbox($px * 0.75, 0, $f, $t);
    return $b ? abs($b[2] - $b[0]) : strlen($t) * $px * .5;
}
function aff_fit(string $t, float $px, string $poids, float $max): float {
    $s = $px;
    while ($s > 20 && aff_larg($t, $s, $poids) > $max) $s -= 2;
    return $s;
}
/* texte posé sur sa ligne de base, comme sur le site ; renvoie la taille réellement utilisée */
function aff_texte($im, string $t, float $x, float $y, float $px, string $poids, string $hex, float $max = 0, string $align = 'left', float $opacite = 1.0): float {
    $s = $max > 0 ? aff_fit($t, $px, $poids, $max) : $px;
    if ($max > 0 && aff_larg($t, $s, $poids) > $max) {           // toujours trop long à la taille minimale : on coupe proprement « … »
        while (mb_strlen($t) > 2 && aff_larg($t . '…', $s, $poids) > $max) $t = rtrim(mb_substr($t, 0, -1), " .·-");
        $t .= '…';
    }
    $w = aff_larg($t, $s, $poids);
    if ($align === 'right') $x -= $w; elseif ($align === 'center') $x -= $w / 2;
    if (aff_police($poids) !== '') imagettftext($im, $s * 0.75, 0, (int) round($x), (int) round($y), aff_c($im, $hex, $opacite), aff_police($poids), $t);
    return $s;
}
/* polygone plein, compatible avec toutes les versions de PHP 7 et 8 */
function aff_poly($im, array $p, int $col): void {
    $p = array_map(fn($v) => (int) round($v), $p);
    if (PHP_VERSION_ID >= 80000) imagefilledpolygon($im, $p, $col); else imagefilledpolygon($im, $p, intdiv(count($p), 2), $col);
}
/* rectangle à coins arrondis, tracé d'un seul polygone (pas de surimpression avec la transparence) */
function aff_coin($im, float $x, float $y, float $w, float $h, float $r, int $col): void {
    $r = max(1, min($r, $w / 2, $h / 2));
    $p = [];
    foreach ([[$x + $w - $r, $y + $r, 270], [$x + $w - $r, $y + $h - $r, 0], [$x + $r, $y + $h - $r, 90], [$x + $r, $y + $r, 180]] as [$cx, $cy, $a0]) {
        for ($i = 0; $i <= 6; $i++) { $a = deg2rad($a0 + $i * 15); $p[] = (int) round($cx + $r * cos($a)); $p[] = (int) round($cy + $r * sin($a)); }
    }
    aff_poly($im, $p, $col);
}
function aff_rect($im, float $x, float $y, float $w, float $h, int $col): void {
    imagefilledrectangle($im, (int) round($x), (int) round($y), (int) round($x + $w) - 1, (int) round($y + $h) - 1, $col);
}
function aff_image(string $chemin) {
    if (!is_file($chemin)) return null;
    $d = @file_get_contents($chemin);
    $i = $d ? @imagecreatefromstring($d) : false;
    if (!$i) return null;
    imagealphablending($i, true);
    return $i;
}
function aff_contenir($im, $src, float $cx, float $cy, float $bw, float $bh, float $kmax = 99): void {
    $k = min($bw / imagesx($src), $bh / imagesy($src), $kmax);
    $w = imagesx($src) * $k; $h = imagesy($src) * $k;
    imagecopyresampled($im, $src, (int) round($cx - $w / 2), (int) round($cy - $h / 2), 0, 0, (int) round($w), (int) round($h), imagesx($src), imagesy($src));
}
function aff_degrade_vertical($im, float $y0, float $y1, array $arrets): void {
    // $arrets : [[position 0..1, '#hex', opacité], ...]
    $h = max(1, $y1 - $y0);
    for ($y = (int) $y0; $y < (int) $y1; $y++) {
        $t = ($y - $y0) / $h;
        for ($i = 0; $i < count($arrets) - 1 && $t > $arrets[$i + 1][0]; $i++);
        [$p0, $c0, $o0] = $arrets[$i]; [$p1, $c1, $o1] = $arrets[min($i + 1, count($arrets) - 1)];
        $k = $p1 > $p0 ? ($t - $p0) / ($p1 - $p0) : 0;
        $a = sscanf(ltrim($c0, '#'), '%02x%02x%02x'); $b = sscanf(ltrim($c1, '#'), '%02x%02x%02x');
        $rgb = sprintf('#%02x%02x%02x', $a[0] + ($b[0] - $a[0]) * $k, $a[1] + ($b[1] - $a[1]) * $k, $a[2] + ($b[2] - $a[2]) * $k);
        imageline($im, 0, $y, AFF_W - 1, $y, aff_c($im, $rgb, $o0 + ($o1 - $o0) * $k));
    }
}
/* texte évidé : seul le contour est visible (calque transparent, trait par copies décalées, intérieur effacé) */
function aff_texte_evide($im, string $t, float $x, float $y, float $px, string $hex, float $max, int $trait = 4): void {
    $s = $max > 0 ? aff_fit($t, $px, '900', $max) : $px;
    $cal = imagecreatetruecolor(AFF_W, aff_h());
    imagealphablending($cal, false);
    imagefilledrectangle($cal, 0, 0, AFF_W, aff_h(), imagecolorallocatealpha($cal, 0, 0, 0, 127));
    imagealphablending($cal, true);
    $c = aff_c($cal, $hex); $f = aff_police('900');
    for ($i = 0; $i < 24; $i++) {
        $a = 2 * M_PI * $i / 24;
        imagettftext($cal, $s * .75, 0, (int) round($x + $trait * cos($a)), (int) round($y + $trait * sin($a)), $c, $f, $t);
    }
    imagealphablending($cal, false);
    imagettftext($cal, $s * .75, 0, (int) round($x), (int) round($y), imagecolorallocatealpha($cal, 0, 0, 0, 127), $f, $t);
    imagealphablending($cal, true);
    imagecopyresampled($im, $cal, 0, 0, 0, 0, AFF_W, aff_h(), AFF_W, aff_h());
    imagedestroy($cal);
}
/* trame de points façon impression, qui grossit vers la droite ($sens 1) ou vers le bas ($sens 2) */
function aff_trame($im, float $x0, float $y0, float $x1, float $y1, int $pas, string $hex, float $opacite, int $sens): void {
    $c = aff_c($im, $hex, $opacite);
    for ($y = (int) $y0; $y < $y1; $y += $pas) for ($x = (int) $x0; $x < $x1; $x += $pas) {
        $k = $sens === 1 ? ($x - $x0) / max(1, $x1 - $x0) : ($y - $y0) / max(1, $y1 - $y0);
        $d = (int) round($pas * .84 * $k);
        if ($d >= 2) imagefilledellipse($im, $x, $y, $d, $d, $c);
    }
}
/* léger grain, comme une photo imprimée */
function aff_grain($im): void {
    mt_srand(7);
    $n = (int) (AFF_W * aff_h() * .09);
    for ($i = 0; $i < $n; $i++) {
        $x = mt_rand(0, AFF_W - 1); $y = mt_rand(0, aff_h() - 1);
        $rgb = imagecolorat($im, $x, $y); $v = mt_rand(-18, 18);
        $r = max(0, min(255, (($rgb >> 16) & 255) + $v)); $g = max(0, min(255, (($rgb >> 8) & 255) + $v)); $b = max(0, min(255, ($rgb & 255) + $v));
        imagesetpixel($im, $x, $y, ($r << 16) | ($g << 8) | $b);
    }
}
function aff_ombre_coin($im, float $x, float $y, float $w, float $h, float $r, float $dx = 8, float $dy = 10): void {
    foreach ([.10, .08, .06] as $i => $o) aff_coin($im, $x + $dx - $i * 2, $y + $dy - $i * 2, $w + $i * 4, $h + $i * 4, $r + $i * 2, aff_c($im, '#000000', $o));
}
function aff_hsl(float $h, float $s, float $l): string {
    $c = (1 - abs(2 * $l - 1)) * $s; $x = $c * (1 - abs(fmod($h / 60, 2) - 1)); $m = $l - $c / 2;
    [$r, $g, $b] = $h < 60 ? [$c, $x, 0] : ($h < 120 ? [$x, $c, 0] : ($h < 180 ? [0, $c, $x] : ($h < 240 ? [0, $x, $c] : ($h < 300 ? [$x, 0, $c] : [$c, 0, $x]))));
    return sprintf('#%02x%02x%02x', ($r + $m) * 255, ($g + $m) * 255, ($b + $m) * 255);
}

/* ---------- blasons ---------- */
/* noms (simplifiés) des équipes des poules FFF d'une compétition, lus dans les classements enregistrés par la synchronisation */
function aff_equipes_poule(string $comp): array {
    static $classements = null;
    if ($classements === null) {
        $classements = [];
        try { foreach (base()->query("SELECT data FROM documents WHERE path LIKE 'classements/%'") as $r) $classements[] = json_decode($r['data'], true) ?: []; }
        catch (Throwable $e) {}
    }
    $noms = [];
    if ($comp === '') return $noms;
    foreach ($classements as $c) {
        if (!str_starts_with(mb_strtolower(trim((string) ($c['titre'] ?? ''))), $comp)) continue;
        foreach ($c['equipes'] ?? [] as $e) $noms[aff_simplifie((string) ($e['nom'] ?? ''))] = true;
    }
    return $noms;
}
function aff_simplifie(string $s): string {
    $s = cle_club($s);
    $s = preg_replace('/\b(fc|as|us|es|o|ol|ent|sc|ac|cs|co|am|et|f|s|de|du|des|la|le|les|d|l|club|football|foot|sportif|sportive|olympique|association|union|entente|etoile|stade)\b/', '', $s);
    $s = preg_replace('/-\d+$/', '', $s);
    return trim(preg_replace('/-+/', '-', $s), '-');
}
function aff_table_logos(): array {
    static $t = null;
    if ($t !== null) return $t;
    $t = []; $taille = []; $racine = dirname(__DIR__);
    $sources = [];
    foreach (glob($racine . '/img/adversaires/*') ?: [] as $f) $sources[] = [pathinfo($f, PATHINFO_FILENAME), $f];
    foreach (aff_doc('site/adversaires') as $k => $v) {
        $f = $racine . '/' . ltrim(preg_replace('/\?.*$/', '', (string) $v), '/');
        if (is_file($f)) $sources[] = [$k, $f];
    }
    foreach ($sources as [$k, $f]) {
        $dim = @getimagesize($f); $px = $dim ? $dim[0] * $dim[1] : 0;
        foreach (array_unique([cle_club($k), aff_simplifie($k)]) as $cle) {
            if ($cle === '') continue;
            if (!isset($t[$cle]) || $px > $taille[$cle]) { $t[$cle] = $f; $taille[$cle] = $px; }
        }
    }
    // les logos choisis à la main passent toujours en priorité
    foreach (glob($racine . '/img/adversaires/choisis/*') ?: [] as $f) {
        $k = pathinfo($f, PATHINFO_FILENAME);
        $t[$k] = $f; $s = aff_simplifie($k); if ($s !== '') $t[$s] = $f;
    }
    return $t;
}
/* Logo nettoyé : fond blanc ou gris clair relié aux bords effacé, marges vides coupées. */
function aff_logo_net($src) {
    $w = imagesx($src); $h = imagesy($src);
    $im = imagecreatetruecolor($w, $h);
    imagealphablending($im, false); imagesavealpha($im, true);
    imagefilledrectangle($im, 0, 0, $w, $h, imagecolorallocatealpha($im, 0, 0, 0, 127));
    imagealphablending($im, true); imagecopy($im, $src, 0, 0, 0, 0, $w, $h); imagealphablending($im, false);
    $fond = function (int $c): bool {
        if ((($c >> 24) & 127) > 100) return true;
        $r = ($c >> 16) & 255; $g = ($c >> 8) & 255; $b = $c & 255;
        return min($r, $g, $b) > 200 && max($r, $g, $b) - min($r, $g, $b) < 22;
    };
    $coins = 0;
    foreach ([[0, 0], [$w - 1, 0], [0, $h - 1], [$w - 1, $h - 1]] as [$x, $y]) if ($fond(imagecolorat($im, $x, $y))) $coins++;
    if ($coins >= 3) {
        $vide = imagecolorallocatealpha($im, 255, 255, 255, 127);
        $vu = []; $pile = [];
        for ($x = 0; $x < $w; $x++) { $pile[] = [$x, 0]; $pile[] = [$x, $h - 1]; }
        for ($y = 0; $y < $h; $y++) { $pile[] = [0, $y]; $pile[] = [$w - 1, $y]; }
        while ($pile) {
            [$x, $y] = array_pop($pile); $k = $y * $w + $x;
            if (isset($vu[$k])) continue;
            $vu[$k] = true;
            if (!$fond(imagecolorat($im, $x, $y))) continue;
            imagesetpixel($im, $x, $y, $vide);
            if ($x + 1 < $w) $pile[] = [$x + 1, $y]; if ($x > 0) $pile[] = [$x - 1, $y];
            if ($y + 1 < $h) $pile[] = [$x, $y + 1]; if ($y > 0) $pile[] = [$x, $y - 1];
        }
    }
    // recadrage sur la partie visible
    $x0 = $w; $y0 = $h; $x1 = -1; $y1 = -1;
    for ($y = 0; $y < $h; $y++) for ($x = 0; $x < $w; $x++) {
        if (((imagecolorat($im, $x, $y) >> 24) & 127) < 80) { if ($x < $x0) $x0 = $x; if ($x > $x1) $x1 = $x; if ($y < $y0) $y0 = $y; if ($y > $y1) $y1 = $y; }
    }
    if ($x1 < 0) return $im;
    $cw = $x1 - $x0 + 1; $ch = $y1 - $y0 + 1;
    $out = imagecreatetruecolor($cw, $ch);
    imagealphablending($out, false); imagesavealpha($out, true);
    imagecopy($out, $im, 0, 0, $x0, $y0, $cw, $ch);
    imagedestroy($im);
    imagealphablending($out, true);
    return $out;
}
function aff_logo_adv(string $nom) {
    $t = aff_table_logos();
    $f = $t[cle_club($nom)] ?? $t[aff_simplifie($nom)] ?? null;
    if (!$f) {
        $s = aff_simplifie($nom);
        if (strlen($s) >= 4) foreach ($t as $k => $v) if (strlen($k) >= 4 && (str_starts_with($k, $s) || str_starts_with($s, $k))) { $f = $v; break; }
    }
    if (!$f) return null;
    static $cache = [];
    if (!array_key_exists($f, $cache)) { $src = aff_image($f); $cache[$f] = $src ? aff_logo_net($src) : null; }
    return $cache[$f];
}
/* Écusson aux initiales, quand aucun logo n'existe pour le club */
function aff_ecusson_initiales($im, string $nom, float $cx, float $cy, float $d): void {
    $h = 0; foreach (mb_str_split($nom) as $ch) $h = ($h * 31 + mb_ord($ch)) % 360;
    $w = $d * .86; $x = $cx - $w / 2; $y = $cy - $d / 2;
    $forme = fn($m) => [$x + $m, $y + $d * .06 + $m, $cx, $y + $m, $x + $w - $m, $y + $d * .06 + $m, $x + $w - $m, $y + $d * .52,
                        $cx + $w * .28, $y + $d * .86 - $m * .6, $cx, $y + $d - $m, $cx - $w * .28, $y + $d * .86 - $m * .6, $x + $m, $y + $d * .52];
    aff_poly($im, $forme(0), aff_c($im, '#FFFFFF'));
    aff_poly($im, $forme(max(3, $d * .05)), aff_c($im, aff_hsl($h, .50, .36)));
    aff_texte($im, aff_initiales($nom), $cx, $cy + $d * .12, $d * .38, '900', '#FFFFFF', $w * .8, 'center');
}
function aff_initiales(string $nom): string {
    $mots = array_values(array_filter(preg_split('/\s+/', preg_replace('/[^0-9A-Za-zÀ-ÿ ]/u', ' ', $nom))));
    $forts = array_values(array_filter($mots, fn($m) => !preg_match('/^(fc|as|us|es|o|ol|ent|sc|ac|cs|co|am|et|f|s|de|du|des|la|le|les|d|l)$/i', $m)));
    $src = $forts ?: $mots;
    $i = implode('', array_map(fn($m) => mb_substr($m, 0, 1), array_slice($src, 0, 2)));
    return aff_maj($i !== '' ? $i : mb_substr($nom, 0, 2));
}
function aff_blason_adv($im, string $nom, float $x, float $y, float $d): void {
    $cx = $x + $d / 2; $cy = $y + $d / 2;
    $logo = aff_logo_adv($nom);
    if ($logo) {
        imagefilledellipse($im, (int) round($cx), (int) round($cy), (int) round($d), (int) round($d), aff_c($im, '#FFFFFF'));
        aff_contenir($im, $logo, $cx, $cy, $d * .74, $d * .74);
        return;
    }
    $h = 0; foreach (mb_str_split($nom) as $ch) $h = ($h * 31 + mb_ord($ch)) % 360;
    imagefilledellipse($im, (int) round($cx), (int) round($cy), (int) round($d), (int) round($d), aff_c($im, '#FFFFFF', .5));
    imagefilledellipse($im, (int) round($cx), (int) round($cy), (int) round($d - max(4, $d * .08)), (int) round($d - max(4, $d * .08)), aff_c($im, aff_hsl($h, .52, .38)));
    aff_texte($im, aff_initiales($nom), $cx, $cy + $d * .15, $d * .42, '800', '#FFFFFF', 0, 'center');
}
function aff_blason_club($im, float $x, float $y, float $d): void {
    static $b = false;
    if ($b === false) $b = aff_image(dirname(__DIR__) . '/img/blason.png');
    if ($b) aff_contenir($im, $b, $x + $d / 2, $y + $d / 2, $d, $d);
}

/* ---------- fond et bandeau partenaires ---------- */
/* Lumière douce : formes dessinées en niveaux de gris sur un petit calque noir, floutées,
   transformées en transparence puis agrandies sur l'affiche (halos, faisceaux, brume). */
function aff_lueur($im, array $formes, float $flou, string $couleur, float $force = 1.0): void {
    $W = AFF_W; $H = aff_h();
    $k = max(2, (int) round($flou / 3.5)); $w = (int) ceil($W / $k); $h = (int) ceil($H / $k);
    $c = imagecreatetruecolor($w, $h);
    imagefilledrectangle($c, 0, 0, $w, $h, imagecolorallocate($c, 0, 0, 0));
    foreach ($formes as $f) $f($c, $k);
    $n = max(1, (int) round(2 * ($flou / $k) ** 2));
    for ($i = 0; $i < min($n, 40); $i++) imagefilter($c, IMG_FILTER_GAUSSIAN_BLUR);
    [$r, $g, $b] = sscanf(ltrim($couleur, '#'), '%02x%02x%02x');
    $l = imagecreatetruecolor($w, $h); imagealphablending($l, false); imagesavealpha($l, true);
    for ($y = 0; $y < $h; $y++) for ($x = 0; $x < $w; $x++) {
        $v = (imagecolorat($c, $x, $y) >> 16) & 255;
        $a = 127 - (int) min(127, $v / 255 * 127 * $force);
        imagesetpixel($l, $x, $y, imagecolorallocatealpha($l, $r, $g, $b, $a));
    }
    imagedestroy($c);
    imagecopyresampled($im, $l, 0, 0, 0, 0, $W, $H, $w, $h);
    imagedestroy($l);
}
function aff_gris($c, int $v): int { return imagecolorallocate($c, $v, $v, $v); }

function aff_photo_fond(): ?string {
    foreach (['jpg', 'jpeg', 'png', 'webp'] as $ext) if (is_file($p = dirname(__DIR__) . "/img/fond-affiche.$ext")) return $p;
    return null;
}
/* Décor : stade de nuit (projecteurs, tribunes aux couleurs du club, pelouse en perspective). */
function aff_fond($im, float $H2): void {
    $W = AFF_W; $H = aff_h(); mt_srand(4);
    // une image de fond choisie par le club (img/fond-affiche.jpg) remplace le décor dessiné
    foreach (array_filter([aff_photo_fond()]) as $p) {
        if (!($src = aff_image($p))) continue;
        $iw = imagesx($src); $ih = imagesy($src);
        // 1) arrière-plan : la même image, agrandie, floutée et assombrie (remplit les côtés sans bandes noires)
        $k = max($W / $iw, $H / $ih); $sw = $W / $k; $sh = $H / $k;
        $pw = (int) ceil($W / 12); $ph = (int) ceil($H / 12);
        $petit = imagecreatetruecolor($pw, $ph);
        imagecopyresampled($petit, $src, 0, 0, (int) (($iw - $sw) / 2), (int) (($ih - $sh) / 2), $pw, $ph, (int) $sw, (int) $sh);
        for ($i = 0; $i < 12; $i++) imagefilter($petit, IMG_FILTER_GAUSSIAN_BLUR);
        imagecopyresampled($im, $petit, 0, 0, 0, 0, $W, $H, $pw, $ph);
        imagedestroy($petit);
        aff_rect($im, 0, 0, $W, $H, aff_c($im, '#050B1F', .45));
        // 2) l'image, à la taille réglée par le club : 0 % = entière (petite), 100 % = remplit tout (bords coupés)
        $zoom = max(0, min(100, (int) reglage('fond_zoom', '60'))) / 100;
        $kIn = min($W / $iw, $H2 / $ih); $kOut = max($W / $iw, $H2 / $ih);
        $k = $kIn + ($kOut - $kIn) * $zoom; $dw = $iw * $k; $dh = $ih * $k;
        imagecopyresampled($im, $src, (int) round(($W - $dw) / 2), (int) round(($H2 - $dh) / 2), 0, 0, (int) round($dw), (int) round($dh), $iw, $ih);
        imagedestroy($src);
        // 3) léger voile bleu pour la lisibilité des textes (plus léger qu'avant : l'image reste bien visible)
        for ($y = 0; $y < $H; $y++) { $t = $y / $H; imageline($im, 0, $y, $W - 1, $y, aff_c($im, '#081234', .18 + .30 * $t)); }
        aff_lueur($im, [function ($c, $k) use ($W, $H) {
            imagefilledrectangle($c, 0, 0, (int) ($W / $k), (int) ($H / $k), aff_gris($c, 170));
            imagefilledellipse($c, (int) ($W / 2 / $k), (int) ($H / 2 / $k), (int) ($W * .84 / $k), (int) ($H * .90 / $k), aff_gris($c, 0));
        }], 120, '#000000');
        return;
    }
    $hz = $H2 * .47; $tb = $hz - $H2 * .20; $py = $tb - $H2 * .10;
    // ciel de nuit
    aff_degrade_vertical($im, 0, $hz + 1, [[0, '#04091A', 1], [1, '#0C1F4C', 1]]);
    // toit et tribunes
    aff_poly($im, [0, $tb - 30, $W, $tb - 50, $W, $tb, 0, $tb + 14], aff_c($im, '#060A18'));
    aff_rect($im, 0, $tb, $W, $hz - $tb, aff_c($im, '#0C142C'));
    $cBleu = aff_c($im, '#1C63C4', .9); $cBlanc = aff_c($im, '#E6ECFA', .86); $cOr = aff_c($im, '#C9A227', .78); $cOmbre = aff_c($im, '#263256');
    $sep = aff_c($im, '#060A18', .63);
    for ($r = 0, $y = (int) $tb + 8; $y < $hz - 4; $y += 11, $r++) {     // le public, rangée par rangée
        for ($x = mt_rand(0, 6); $x < $W; $x += 6 + mt_rand(0, 3)) {
            $v = mt_rand(0, 99);
            $col = $v < 28 ? $cBleu : ($v < 45 ? $cBlanc : ($v < 48 ? $cOr : $cOmbre));
            imagefilledellipse($im, $x + 2, $y + 3, 5, 6, $col);
        }
        if ($r % 4 === 3) aff_rect($im, 0, $y + 8, $W, 2, $sep);
    }
    // pelouse en perspective : bandes de tonte de plus en plus hautes vers le bas
    for ($y = $hz, $h = 14, $i = 0; $y < $H; $y += $h, $h *= 1.28, $i++) aff_rect($im, 0, $y, $W, $h + 1, aff_c($im, $i % 2 ? '#1F6C38' : '#257A40'));
    $L = aff_c($im, '#FFFFFF', .59);
    aff_rect($im, 0, $hz + 8, $W, 4, $L);
    aff_poly($im, [$W / 2 - 2, $hz + 10, $W / 2 + 2, $hz + 10, $W / 2 + 10, $H, $W / 2 - 10, $H], $L);
    $cy = $hz + ($H - $hz) * .30;
    for ($t = 0; $t < 5; $t++) imageellipse($im, (int) ($W / 2), (int) $cy, 660 - $t, 140 - $t, $L);
    imagefilledellipse($im, (int) ($W / 2), (int) $cy, 14, 6, $L);
    // pylônes et rampes de projecteurs
    foreach ([$W * .12, $W * .88] as $px) {
        aff_rect($im, $px - 4, $py, 8, $tb - $py, aff_c($im, '#141A2C'));
        aff_rect($im, $px - 46, $py - 30, 92, 38, aff_c($im, '#1E2438'));
        for ($gx = 0; $gx < 4; $gx++) for ($gy = 0; $gy < 2; $gy++) aff_rect($im, $px - 40 + $gx * 21, $py - 25 + $gy * 16, 14, 11, aff_c($im, '#FFFAE1'));
    }
    // faisceaux, halos, éclat des projecteurs, brume au-dessus de la pelouse
    $pieds = $hz + ($H - $hz) * .5;
    aff_lueur($im, array_map(fn($px) => function ($c, $k) use ($px, $py, $pieds, $W) {
        $fx = $W * .5 + ($px - $W * .5) * .15;
        aff_poly($c, [($px - 30) / $k, $py / $k, ($px + 30) / $k, $py / $k, ($fx + 230) / $k, $pieds / $k, ($fx - 230) / $k, $pieds / $k], aff_gris($c, 70));
    }, [$W * .12, $W * .88]), 22, '#D7E6FF');
    aff_lueur($im, array_merge(
        array_map(fn($px) => function ($c, $k) use ($px, $py) { imagefilledellipse($c, (int) ($px / $k), (int) (($py - 20) / $k), (int) (300 / $k), (int) (300 / $k), aff_gris($c, 255)); }, [$W * .12, $W * .88]),
        [function ($c, $k) use ($hz, $W) { imagefilledrectangle($c, 0, (int) (($hz - 60) / $k), (int) ($W / $k), (int) (($hz + 60) / $k), aff_gris($c, 90)); }]
    ), 50, '#DCE6FF');
    aff_lueur($im, array_map(fn($px) => function ($c, $k) use ($px, $py) { imagefilledellipse($c, (int) ($px / $k), (int) (($py - 15) / $k), (int) max(2, 120 / $k), (int) max(2, 80 / $k), aff_gris($c, 255)); }, [$W * .12, $W * .88]), 14, '#FFFFFA');
    // voile bleu du club vers le bas, et vignette : les textes restent lisibles
    for ($y = 0; $y < $H; $y++) { $t = $y / $H; $o = (60 + 110 * max(0, $t - .35)) / 255; imageline($im, 0, $y, $W - 1, $y, aff_c($im, '#081234', $o)); }
    aff_lueur($im, [function ($c, $k) use ($W, $H) {
        imagefilledrectangle($c, 0, 0, (int) ($W / $k), (int) ($H / $k), aff_gris($c, 170));
        imagefilledellipse($c, (int) ($W / 2 / $k), (int) ($H / 2 / $k), (int) ($W * .84 / $k), (int) ($H * .90 / $k), aff_gris($c, 0));
    }], 120, '#000000');
}
function aff_sponsors(): array {
    $d = aff_doc('site/sponsors');
    // les 30 partenaires du club : img/partenaires/p01 à p30 (jpg ou png), dans cet ordre ; sinon l'ancienne liste du site
    $fixes = [];
    for ($i = 1; $i <= 30; $i++) {
        $id = sprintf('p%02d', $i);
        foreach (['jpg', 'png', 'webp'] as $ext) if (is_file(dirname(__DIR__) . "/img/partenaires/$id.$ext")) { $fixes[] = $id; break; }
    }
    $ids = $fixes ?: array_slice(!empty($d['ids']) ? $d['ids'] : AFF_SPONSORS_DEFAUT, 0, 30);
    // deux feuilles par annonce : la 1re moitié des partenaires sur la feuille domicile, la 2de sur la feuille extérieur
    $partie = $GLOBALS['aff_sp_partie'] ?? null;
    if ($partie === 1 || $partie === 2) { $moitie = (int) ceil(count($ids) / 2); $ids = $partie === 1 ? array_slice($ids, 0, $moitie) : array_slice($ids, $moitie); }
    return $ids;
}
function aff_grille(int $n): array {
    if (aff_compact()) {   // publication ou feuille : bandeau plus bas, logos sur deux lignes
        $cols = $n <= 5 ? max($n, 1) : (int) ceil($n / ceil($n / 8));   // 15 logos : 2 lignes de 8 et 7
        return ['cols' => $cols, 'lignes' => (int) ceil(max($n, 1) / $cols), 'ch' => aff_h() < 1200 ? 40 : 48, 'gap' => 6, 'entete' => aff_h() < 1200 ? 44 : 50];
    }
    $cols = $n <= 4 ? max($n, 1) : ($n <= 12 ? 4 : 5);
    return ['cols' => $cols, 'lignes' => (int) ceil(max($n, 1) / $cols), 'ch' => $n > 12 ? 66 : 82, 'gap' => 10, 'entete' => 64];
}
function aff_hauteur_sponsors(): int {
    $n = count(aff_sponsors());
    if (!$n) return 118;
    $g = aff_grille($n);
    return $g['entete'] + $g['lignes'] * ($g['ch'] + $g['gap']) + 16;
}
function aff_fond_logo($src): string {
    $w = imagesx($src) - 1; $h = imagesy($src) - 1; $somme = [0, 0, 0]; $n = 0;
    foreach ([[0, 0], [$w, 0], [0, $h], [$w, $h]] as [$x, $y]) {
        $c = imagecolorsforindex($src, imagecolorat($src, $x, $y));
        if ($c['alpha'] < 30) { $somme[0] += $c['red']; $somme[1] += $c['green']; $somme[2] += $c['blue']; $n++; }
    }
    if (!$n) return '#F2F4FA';
    [$r, $g, $b] = array_map(fn($v) => (int) round($v / $n), $somme);
    return ($r * .299 + $g * .587 + $b * .114) < 110 ? sprintf('#%02x%02x%02x', $r, $g, $b) : '#F2F4FA';
}
function aff_bandeau_sponsors($im, float $y, float $h): void {
    $ids = aff_sponsors(); $g = aff_grille(count($ids));
    aff_rect($im, 0, $y, AFF_W, $h, aff_c($im, '#FFFFFF'));
    aff_rect($im, 0, $y, AFF_W, 8, aff_c($im, '#1C63C4'));
    aff_rect($im, 0, $y + 8, AFF_W, 4, aff_c($im, '#C9A227'));
    aff_texte($im, 'NOS PARTENAIRES', AFF_W / 2, $y + (aff_compact() ? 42 : 54), aff_compact() ? 30 : 38, '800', '#0B1633', 0, 'center');
    $cw = (AFF_W - 56) / $g['cols'];
    $ch = min(130, max($g['ch'], ($h - $g['entete'] - 16) / max(1, $g['lignes']) - $g['gap']));   // story : logos plus grands
    $y0 = $y + $g['entete'] + max(0, ($h - $g['entete'] - 16 - $g['lignes'] * ($ch + $g['gap'])) / 2);
    foreach ($ids as $i => $id) {
        $c = $i % $g['cols']; $r = intdiv($i, $g['cols']);
        $x = 28 + $c * $cw; $yy = $y0 + $r * ($ch + $g['gap']);
        $f = null;
        foreach (['jpg', 'png', 'webp'] as $ext) if (is_file($p = dirname(__DIR__) . "/img/partenaires/$id.$ext")) { $f = $p; break; }
        $src = $f ? aff_image($f) : null;
        $m = aff_compact() ? 3 : 5; $pad = aff_compact() ? 14 : 36;
        aff_coin($im, $x + $m, $yy, $cw - 2 * $m, $ch, 9, aff_c($im, $src ? aff_fond_logo($src) : '#F2F4FA'));
        if ($src) aff_contenir($im, $src, $x + $cw / 2, $yy + $ch / 2, $cw - $pad, $ch - 14);
    }
}
function aff_nouvelle() {
    $im = imagecreatetruecolor(AFF_W, aff_h());
    imagealphablending($im, true);
    return $im;
}

/* ---------- affiche : rencontres ou résultats du week-end ---------- */
const AFF_MOIS_C = ['JANV.', 'FÉV.', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];
function aff_jour_court(string $d): string {
    $t = strtotime($d . ' 12:00');
    return aff_maj(AFF_JOURS[(int) date('w', $t)]) . ' ' . (int) date('j', $t) . ' ' . AFF_MOIS_C[(int) date('n', $t) - 1];
}
function aff_logo_rond($im, string $nom, float $cx, float $cy, float $d): void {
    $logo = aff_logo_adv($nom);
    if ($logo) {
        imagefilledellipse($im, (int) round($cx), (int) round($cy), (int) round($d * 1.08), (int) round($d * 1.08), aff_c($im, '#FFFFFF', .92));
        aff_contenir($im, $logo, $cx, $cy, $d * .86, $d * .86, 3); return;
    }
    aff_ecusson_initiales($im, $nom, $cx, $cy, $d);
}
function aff_liste(array $matchs, string $samedi, bool $resultats, array $opts = []) {
    if (($nuit = afn_liste($matchs, $samedi, $resultats, $opts)) !== null) return $nuit;     // affiches « stade de nuit »
    if ($fond = aff_fond_lieu($opts['lieu'] ?? null)) {
        $GLOBALS['aff_sp_partie'] = in_array($opts['partie'] ?? null, [1, 2], true) ? $opts['partie'] : null;
        $r = aff_liste_photo($matchs, $samedi, $resultats, $opts, $fond);
        $GLOBALS['aff_sp_partie'] = null;
        return $r;
    }
    $im = aff_nouvelle(); $W = AFF_W; $H = aff_h();
    $lieu = in_array($opts['lieu'] ?? '', ['dom', 'ext'], true) ? $opts['lieu'] : null;
    $plan = aff_plan_weekend($matchs, $samedi, $resultats, $lieu);
    $sp = $opts['sponsors'] ?? true;
    $hSp = $sp ? aff_hauteur_sponsors() : 0; $H2 = $H - $hSp;
    aff_fond($im, $H2);
    $kh = aff_h() < 1200 ? .58 : (aff_h() < 1500 ? .8 : 1);
    $cx = $W / 2; $photo = aff_photo_fond() !== null;
    $dy = 0;
    if (!$photo) { aff_blason_club($im, $cx - 70 * $kh, 18 * $kh, 140 * $kh); $dy = 130 * $kh; }   // l'image du club porte déjà son logo
    $t1 = 'WEEK-END'; $s1 = aff_fit($t1, 150 * $kh, '900', $W - 120);
    aff_texte_evide($im, $t1, $cx - aff_larg($t1, $s1, '900') / 2, 165 * $kh + $dy, $s1, '#FFFFFF', 0);
    aff_texte($im, aff_maj(($opts['titre'] ?? '') !== '' ? $opts['titre'] : ($resultats ? 'Les résultats' : 'Les rencontres')), $cx, 265 * $kh + $dy, 92 * $kh, '900', '#FFFFFF', $W - 120, 'center');
    if ($lieu) {           // plus de dates : seulement domicile ou extérieur
        $lib = $lieu === 'dom' ? 'À DOMICILE' : "À L'EXTÉRIEUR"; $pl = 34 * $kh; $wp = aff_larg($lib, $pl, '800') + 60;
        $y0 = 292 * $kh + $dy;
        aff_poly($im, [$cx - $wp / 2 + 16, $y0, $cx + $wp / 2, $y0, $cx + $wp / 2 - 16, $y0 + 50 * $kh, $cx - $wp / 2, $y0 + 50 * $kh], aff_c($im, '#C9A227'));
        aff_texte($im, $lib, $cx, $y0 + 38 * $kh, $pl, '800', '#0B1633', 0, 'center');
    }
    $HE = 390 * $kh + $dy; $dispo = $H2 - $HE - ($kh < 1 ? 16 : 30);
    $nbM = array_sum(array_map(fn($j) => count($j['matchs']), $plan)); $nbJ = count($plan);
    if (!$nbM) aff_texte($im, $resultats ? 'Aucun résultat ce week-end' : 'Aucun match programmé ce week-end', 48, $HE + 120, 52, '800', '#C9D4F2', $W - 96);
    $besoin = max(1, $nbJ * 74 + $nbM * 128);
    // les lignes grandissent jusqu'à 1,5 fois, puis tout l'espace restant est réparti : la liste va jusqu'en bas
    $f = max(.3, min(1.5, $dispo / $besoin)); $z = min($f, 1.3); $zl = min($f, 1.6); $fj = min($f, 1.3);
    $HJ = 74 * $fj; $HL = 128 * $f;
    $aere = $nbM + $nbJ ? max(0, ($dispo - $nbJ * $HJ - $nbM * $HL) / ($nbM + $nbJ)) : 0;
    $y = $HE;
    foreach ($plan as $j) {
        $y += $aere / 2;
        $lib = aff_jour_court($j['date']); $pj = 46 * $fj;
        aff_texte($im, $lib, 48, $y + $HJ * .72, $pj, '900', '#FFFFFF');
        $wj = aff_larg($lib, $pj, '900');
        aff_rect($im, 48 + $wj + 18, $y + $HJ * .72 - 16 * $fj, $W - 96 - $wj - 18, 4, aff_c($im, '#C9A227'));
        $y += $HJ + $aere / 2;
        foreach ($j['matchs'] as $m) {
            $top = $y + 6; $hb = $HL - 12; $cy = $top + $hb / 2; $dom = !empty($m['dom']);
            aff_coin($im, 34, $top - 2, $W - 68, $hb + 4, 13, aff_c($im, '#FFFFFF', .22));   // liseré
            aff_coin($im, 36, $top, $W - 72, $hb, 12, aff_c($im, '#061030', .50));           // verre foncé : l'image de fond se voit
            // catégorie : colonne à gauche de la carte (les logos ne passent jamais dessus)
            $wt = 150; $ct = aff_c($im, $dom ? '#1C63C4' : '#33476E', .82);
            aff_coin($im, 36, $top, 40, $hb, 12, $ct);
            aff_poly($im, [56, $top, 36 + $wt + 16, $top, 36 + $wt, $top + $hb, 56, $top + $hb], $ct);
            if (($m['sous'] ?? '') !== '') {     // catégorie en grand, niveau et poule en dessous
                aff_texte($im, aff_maj((string) $m['equipe']), 36 + $wt / 2 + 2, $cy - $hb * .02, min($hb * .28, 32), '900', '#FFFFFF', $wt - 26, 'center');
                aff_texte($im, $m['sous'], 36 + $wt / 2 + 2, $cy + $hb * .24, min($hb * .16, 19), '800', '#CFE0FF', $wt - 30, 'center');
            } else aff_texte($im, aff_maj((string) $m['equipe']), 36 + $wt / 2 + 2, $cy + $hb * .11, min($hb * .30, 34), '900', '#FFFFFF', $wt - 26, 'center');
            // tailles calculées à partir de la hauteur de la ligne : le plus grand possible
            $ta = min($hb * .78, 96); $fn = min($hb * .40, 46); $ft = min($hb * .44, 52); $wc = min($hb * 1.6, 190);
            $xc = 36 + $wt + ($W - 72 - $wt) / 2 + 6; $xg = 36 + $wt + 22; $xd = $W - 36 - 16;
            $zone = $xc - $wc / 2 - 14 - ($xg + $ta + 12);
            $nous = ['nom' => 'PIERRELATTE', 'club' => true]; $eux = ['nom' => aff_maj((string) $m['adv']), 'brut' => (string) $m['adv'], 'club' => false];
            [$gauche, $droite] = $dom ? [$nous, $eux] : [$eux, $nous];
            foreach ([[$gauche, 'g'], [$droite, 'd']] as [$e, $cote]) {
                $cx = $cote === 'g' ? $xg + $ta / 2 : $xd - $ta / 2;
                if ($e['club']) aff_blason_club($im, $cx - $ta * .52, $cy - $ta * .52, $ta * 1.04);
                else aff_logo_rond($im, $e['brut'], $cx, $cy, $ta);
                $col = $e['club'] ? '#8FC2FF' : '#FFFFFF';
                if ($cote === 'g') aff_texte($im, $e['nom'], $xg + $ta + 12, $cy + $fn * .36, $fn, '900', $col, $zone);
                else aff_texte($im, $e['nom'], $xd - $ta - 12, $cy + $fn * .36, $fn, '900', $col, $zone, 'right');
            }
            // au centre : l'heure, ou le score (domicile - extérieur) coloré selon le résultat de Pierrelatte
            if ($resultats && aff_joue($m)) {
                $col = ['V' => '#16A34A', 'N' => '#6B7280', 'D' => '#DC2626'][aff_issue($m)];
                $lib = ($dom ? $m['bp'] : $m['bc']) . ' - ' . ($dom ? $m['bc'] : $m['bp']);
            } elseif ($resultats) { $col = '#9CA3AF'; $lib = 'NC'; }
            else { $col = '#C9A227'; $lib = aff_maj(aff_hfr($m['heure'] ?? '')); }
            $hh = $hb * .62;
            aff_poly($im, [$xc - $wc / 2 + 12, $cy - $hh / 2, $xc + $wc / 2, $cy - $hh / 2, $xc + $wc / 2 - 12, $cy + $hh / 2, $xc - $wc / 2, $cy + $hh / 2], aff_c($im, $col));
            aff_texte($im, $lib, $xc, $cy + $ft * .36, $ft, '900', $resultats ? '#FFFFFF' : '#0B1633', $wc - 30, 'center');
            $y += $HL + $aere;
        }
    }
    if ($hSp) aff_bandeau_sponsors($im, $H2, $hSp);
    aff_grain($im);
    return $im;
}

/* ================= Feuilles « week-end » sur les images du club =================
   img/fond-domicile.jpg (le stade) pour les matchs à domicile, img/fond-exterieur.jpg (l'avion) pour l'extérieur.
   L'image est affichée entière (1080 x 1620). Les partenaires s'ajoutent SOUS l'image : rien n'est caché.
   En story (1080 x 1920), la feuille est centrée sur un fond flouté tiré de l'image. */
const AFF_HF = 1620;
function aff_fond_lieu(?string $lieu): ?string {
    $noms = $lieu === 'ext' ? ['fond-exterieur', 'fond-domicile'] : ['fond-domicile', 'fond-exterieur'];
    foreach ($noms as $n) foreach (['jpg', 'jpeg', 'png', 'webp'] as $ext)
        if (is_file($p = dirname(__DIR__) . "/img/$n.$ext")) return $p;
    return null;
}
function aff_compact(): bool { return aff_h() < 1500 || !empty($GLOBALS['aff_feuille']); }
/* l'image du club, entière, sur toute la largeur (recadrée au centre si elle n'est pas au format 2:3) */
function aff_poser_fond($im, string $fichier): void {
    $src = aff_image($fichier);
    if (!$src) { aff_rect($im, 0, 0, AFF_W, AFF_HF, aff_c($im, '#0B1633')); return; }
    $iw = imagesx($src); $ih = imagesy($src);
    $k = max(AFF_W / $iw, AFF_HF / $ih); $sw = AFF_W / $k; $sh = AFF_HF / $k;
    imagecopyresampled($im, $src, 0, 0, (int) (($iw - $sw) / 2), (int) (($ih - $sh) / 2), AFF_W, AFF_HF, (int) $sw, (int) $sh);
    imagedestroy($src);
}
/* barre d'un match : dégradé bleu nuit → bleu club → bleu nuit, coins arrondis, fin contour blanc */
function aff_barre($im, float $x0, float $y0, float $w, float $h, float $r): void {
    $w = (int) round($w); $h = (int) round($h); $r = (int) round(min($r, $h / 2));
    $b = imagecreatetruecolor($w, $h);
    imagealphablending($b, false); imagesavealpha($b, true);
    for ($x = 0; $x < $w; $x++) {
        $k = (1 - abs($x / max(1, $w - 1) - .5) * 2) * .55;
        imageline($b, $x, 0, $x, $h - 1, imagecolorallocatealpha($b, (int) (11 + 17 * $k), (int) (22 + 77 * $k), (int) (51 + 145 * $k), 15));
    }
    $vide = imagecolorallocatealpha($b, 0, 0, 0, 127); $bord = imagecolorallocatealpha($b, 255, 255, 255, 96);
    foreach ([[$r, $r], [$w - 1 - $r, $r], [$r, $h - 1 - $r], [$w - 1 - $r, $h - 1 - $r]] as [$cx, $cy]) {
        $xa = $cx <= $r ? 0 : $cx; $ya = $cy <= $r ? 0 : $cy;
        for ($y = $ya; $y <= $ya + $r; $y++) for ($x = $xa; $x <= $xa + $r; $x++) {
            $d = sqrt(($x - $cx) ** 2 + ($y - $cy) ** 2);
            if ($d > $r) imagesetpixel($b, $x, $y, $vide);
            elseif ($d > $r - 2) imagesetpixel($b, $x, $y, $bord);
        }
    }
    imagefilledrectangle($b, $r, 0, $w - 1 - $r, 1, $bord); imagefilledrectangle($b, $r, $h - 2, $w - 1 - $r, $h - 1, $bord);
    imagefilledrectangle($b, 0, $r, 1, $h - 1 - $r, $bord); imagefilledrectangle($b, $w - 2, $r, $w - 1, $h - 1 - $r, $bord);
    imagecopy($im, $b, (int) round($x0), (int) round($y0), 0, 0, $w, $h);
    imagedestroy($b);
}
/* cadre du résultat : fond de couleur transparent (on voit l'image derrière), bords bien pleins */
const AFF_COUL_ISSUE = ['V' => '#16A34A', 'N' => '#8A8F98', 'D' => '#DC2626'];
function aff_cadre_resultat($im, float $x, float $y, float $w, float $h, float $r, string $hex, float $ep = 5): void {
    $w = (int) round($w); $h = (int) round($h);
    [$cr, $cg, $cb] = sscanf(ltrim($hex, '#'), '%02x%02x%02x');
    $l = imagecreatetruecolor($w, $h); imagealphablending($l, false); imagesavealpha($l, true);
    $vide = imagecolorallocatealpha($l, 0, 0, 0, 127);
    $fond = imagecolorallocatealpha($l, $cr, $cg, $cb, 72);        // environ 45 % d'opacité
    $bord = imagecolorallocatealpha($l, $cr, $cg, $cb, 0);
    $hw = $w / 2; $hh = $h / 2;
    for ($j = 0; $j < $h; $j++) for ($i = 0; $i < $w; $i++) {
        $dx = abs($i + .5 - $hw) - ($hw - $r); $dy = abs($j + .5 - $hh) - ($hh - $r);
        $d = sqrt(max($dx, 0) ** 2 + max($dy, 0) ** 2) + min(max($dx, $dy), 0) - $r;
        imagesetpixel($l, $i, $j, $d > 0 ? $vide : ($d > -$ep ? $bord : $fond));
    }
    imagecopy($im, $l, (int) round($x), (int) round($y), 0, 0, $w, $h);
    imagedestroy($l);
}

/* logo d'une équipe : rond blanc cerclé d'or, logo au centre (blason du club, logo adverse, ou écusson aux initiales) */
function aff_logo_or($im, string $nom, bool $club, float $cx, float $cy, float $d): void {
    imagefilledellipse($im, (int) round($cx), (int) round($cy), (int) round($d + 7), (int) round($d + 7), aff_c($im, '#C9A227'));
    imagefilledellipse($im, (int) round($cx), (int) round($cy), (int) round($d), (int) round($d), aff_c($im, '#FFFFFF'));
    if ($club) { aff_blason_club($im, $cx - $d * .46, $cy - $d * .46, $d * .92); return; }
    $logo = aff_logo_adv($nom) ?: aff_logo_district($nom);
    if ($logo) { aff_contenir($im, $logo, $cx, $cy, $d * .74, $d * .74, 3); return; }
    aff_ecusson_initiales($im, $nom, $cx, $cy, $d * .72);
}
/* une ligne de match */
function aff_ligne_match($im, array $m, bool $resultats, float $x0, float $y0, float $x1, float $hb): void {
    $w = $x1 - $x0; $cy = $y0 + $hb / 2; $xc = ($x0 + $x1) / 2; $dom = !empty($m['dom']);
    $z = min(1, $hb / 108);                                        // réduction quand il y a beaucoup de matchs
    aff_ombre_coin($im, $x0, $y0, $w, $hb, 18, 4, 8);
    aff_barre($im, $x0, $y0, $w, $hb, 18);
    aff_rect($im, $x0 + 30, $y0, $w - 60, 2, aff_c($im, '#C9A227'));
    // au centre : bloc blanc avec un trait de couleur en bas
    $joue = $resultats && aff_joue($m);
    if ($joue) { $issue = aff_issue($m); $trait = ['V' => '#22C55E', 'N' => '#A3A3A3', 'D' => '#EF4444'][$issue]; }
    else $trait = $resultats ? '#A3A3A3' : '#C9A227';
    $sw = 210 * max(.85, $z); $sh = $hb + 14 * $z; $sy = $cy - $sh / 2;
    if ($resultats) aff_cadre_resultat($im, $xc - $sw / 2, $sy, $sw, $sh, 16 * $z, $joue ? AFF_COUL_ISSUE[$issue] : AFF_COUL_ISSUE['N'], 5 * max(.8, $z));
    else {
        aff_coin($im, $xc - $sw / 2, $sy, $sw, $sh, 16 * $z, aff_c($im, $trait));
        aff_coin($im, $xc - $sw / 2, $sy, $sw, $sh - 8 * $z, 16 * $z, aff_c($im, '#FFFFFF'));
    }
    $gG = true; $gD = true;                                         // qui a gagné : le perdant est atténué
    if ($joue) {
        $sg = (int) ($dom ? $m['bp'] : $m['bc']); $sd = (int) ($dom ? $m['bc'] : $m['bp']);
        $gG = $sg >= $sd; $gD = $sd >= $sg;
        $ps = $hb * .74; $by = $cy + $ps * .34;
        foreach ([[$sg, -1], [$sd, 1]] as [$v, $sens]) {
            aff_texte($im, (string) $v, $xc + $sens * 44 * $z + 2, $by + 3, $ps, '900', '#000000', 0, 'center', .45);
            aff_texte($im, (string) $v, $xc + $sens * 44 * $z, $by, $ps, '900', '#FFFFFF', 0, 'center');
        }
        aff_rect($im, $xc - 2, $cy - $hb * .26, 4, $hb * .46, aff_c($im, '#FFFFFF', .85));
    } elseif ($resultats) {
        aff_texte($im, 'NC', $xc, $cy + $hb * .2, $hb * .56, '900', '#FFFFFF', $sw - 30, 'center');   // score pas encore transmis à la FFF
    } else {
        $jour = aff_maj(AFF_JOURS[(int) date('w', strtotime($m['date'] . ' 12:00'))]);
        aff_texte($im, $jour, $xc, $cy - $hb * .15, $hb * .22, '800', '#1C63C4', $sw - 30, 'center');
        aff_texte($im, aff_maj(aff_hfr($m['heure'] ?? '')) ?: '–', $xc, $cy + $hb * .36, $hb * .56, '900', '#0B1633', $sw - 24, 'center');
    }
    // les deux équipes : celle qui reçoit à gauche, celle qui se déplace à droite
    $ta = $hb * .84;
    $nous = ['nom' => 'PIERRELATTE', 'brut' => '', 'club' => true];
    $eux = ['nom' => aff_maj((string) $m['adv']), 'brut' => (string) $m['adv'], 'club' => false];
    [$gauche, $droite] = $dom ? [$nous, $eux] : [$eux, $nous];
    $zone = ($xc - $sw / 2 - 14) - ($x0 + 22 + $ta + 14);
    foreach ([[$gauche, 'g', $gG], [$droite, 'd', $gD]] as [$e, $cote, $gagne]) {
        $cx = $cote === 'g' ? $x0 + 22 + $ta / 2 : $x1 - 22 - $ta / 2;
        aff_logo_or($im, $e['brut'], $e['club'], $cx, $cy, $ta);
        $col = $e['club'] ? '#8FC2FF' : '#FFFFFF'; $op = $gagne ? 1 : .62; $fn = min(40, $hb * .36);
        if ($cote === 'g') aff_texte($im, $e['nom'], $x0 + 22 + $ta + 14, $cy + $fn * .36, $fn, '900', $col, $zone, 'left', $op);
        else aff_texte($im, $e['nom'], $x1 - 22 - $ta - 14, $cy + $fn * .36, $fn, '900', $col, $zone, 'right', $op);
    }
    // la catégorie, avec le niveau et la poule : onglet doré posé sur la barre
    $lab = aff_maj((string) $m['equipe']) . (($m['sous'] ?? '') !== '' ? '  ·  ' . $m['sous'] : '');
    $pl = 24 * $z; $hp = 32 * $z; $wl = aff_larg($lab, $pl, '800') + 36 * $z;
    aff_coin($im, $x0 + 26, $y0 - $hp / 2 - 1, $wl, $hp, 8 * $z, aff_c($im, '#C9A227'));
    aff_texte($im, $lab, $x0 + 26 + $wl / 2, $y0 + $pl * .34, $pl, '800', '#0B1633', 0, 'center');
}
/* ---------- carte d'un plateau ou d'un brassage (foot animation) ----------
   Catégorie en onglet doré, logo et nom du club qui reçoit, stade et ville, jour et heure dans le bloc blanc,
   et en bas les logos des autres clubs présents. */
function aff_lieu_court(array $m): array {
    if (!empty($m['dom'])) return ['STADE GUSTAVE JAUME', 'PIERRELATTE'];
    $adr = (string) ($m['adresse'] ?? '');
    $parts = array_values(array_filter(array_map('trim', explode(',', $adr))));
    $stade = $parts[0] ?? '';
    $ville = preg_match('/\b\d{5}\s+(.+)$/u', $adr, $v) ? trim($v[1]) : (count($parts) > 1 ? end($parts) : '');
    return [aff_maj($stade), aff_maj($ville)];
}
/* brassage U13 : chaque équipe joue deux matchs sur le plateau → on garde les deux scores */
function aff_scores_brassage(array $m): array {   // scores des U10 · U11 et des U13 (une ligne par équipe rencontrée)
    return array_values(array_filter($m['resultats'] ?? [], fn($r) => is_numeric($r['bp'] ?? null) && is_numeric($r['bc'] ?? null) && trim((string) ($r['adv'] ?? '')) !== ''));
}
/* nom court d'un club pour les pastilles : « CERC.S. DE MALATAVERNE » → « MALATAVERNE », « AV. S. SUD ARDECHE FOOTBALL » → « SUD ARDECHE » */
function aff_nom_court(string $nom): string {
    $mots = preg_split('/\s+/u', trim(preg_replace('/\s+\d+$/', '', $nom)));
    $vides = ['FC', 'US', 'AS', 'SC', 'ES', 'RC', 'CO', 'OL', 'AV', 'ENT', 'FOOTBALL', 'FOOT', 'CLUB', 'UNION', 'SPORTIVE', 'SPORTIF', 'ENTENTE', 'ETOILE',
              'OLYMPIQUE', 'ASSOCIATION', 'SPORTING', 'AMICALE', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET'];
    $test = fn($w) => str_contains($w, '.') || in_array(mb_strtoupper(preg_replace("/[^\p{L}]/u", '', $w)), $vides, true);
    while (count($mots) > 1 && $test($mots[0])) array_shift($mots);
    while (count($mots) > 1 && $test(end($mots))) array_pop($mots);
    return aff_maj(implode(' ', $mots));
}
/* les deux lignes du bloc doré : « U10-U11 » / « AVENIR », « U13 » / « ÉQUIPE 4 », « U6-U7 » / « PLATEAU » */
function aff_cat_lignes(array $m): array {
    $e = aff_maj((string) ($m['equipe'] ?? ''));
    if (preg_match('/^(U\s?\d{1,2})\s*·\s*(U\s?\d{1,2})\s*(.*)$/u', $e, $x)) return [$x[1] . '-' . $x[2], trim($x[3]) !== '' ? trim($x[3]) : aff_maj((string) ($m['comp'] ?? 'PLATEAU'))];
    if (preg_match('/^(U\s?\d{1,2})\s*·?\s*(.*)$/u', $e, $x)) return [$x[1], trim($x[2]) !== '' ? trim($x[2]) : aff_maj((string) ($m['comp'] ?? ''))];
    return [$e, aff_maj((string) ($m['comp'] ?? ''))];
}
/* bloc doré à gauche de la carte, dégradé vertical, coins arrondis à gauche seulement */
function aff_bloc_cat($im, float $x0, float $y0, float $h, string $l1, string $l2): float {
    $w = 190;
    $bande = imagecrop($im, ['x' => (int) ($x0 + $w), 'y' => (int) $y0, 'width' => 20, 'height' => (int) ceil($h) + 1]);
    aff_coin($im, $x0, $y0, $w + 18, $h, 18, aff_c($im, '#CFA235'));
    for ($y = 18; $y < $h - 18; $y++) {
        $t = $y / max(1, $h - 1);
        aff_rect($im, $x0, $y0 + $y, $w, 1, imagecolorallocate($im, (int) (0xD9 - 24 * $t), (int) (0xB4 - 26 * $t), (int) (0x3A - 10 * $t)));
    }
    if ($bande) { imagecopy($im, $bande, (int) ($x0 + $w), (int) $y0, 0, 0, 20, (int) ceil($h) + 1); imagedestroy($bande); }
    aff_texte($im, $l1, $x0 + $w / 2, $y0 + $h / 2 - 4, 46, '900', '#0B1633', $w - 24, 'center');
    aff_texte($im, $l2, $x0 + $w / 2, $y0 + $h / 2 + 26, 26, '800', '#0B1633', $w - 24, 'center');
    return $w;
}
function aff_carte_fond($im, float $x0, float $y0, float $x1, float $h): void {
    aff_ombre_coin($im, $x0, $y0, $x1 - $x0, $h, 18, 4, 7);
    aff_barre($im, $x0, $y0, $x1 - $x0, $h, 18);
}
/* hauteur d'une carte : rencontres 182 avec des adversaires (130 sans) ; résultats 66 + 66 par match */
function aff_hauteur_plateau(array $m, bool $resultats): float {
    if ($resultats) return 66 + 66 * max(1, count(aff_scores_brassage($m)));
    return !empty($m['adversaires']) ? 182 : 130;
}
/* ---------- carte d'un plateau ou d'un brassage (rencontres) ---------- */
function aff_ligne_plateau($im, array $m, float $x0, float $y0, float $x1, float $hb, bool $resultats = false): void {
    if ($resultats) { aff_ligne_brassage_res($im, $m, $x0, $y0, $x1, $hb); return; }
    $dom = !empty($m['dom']); $adv = array_values(array_filter($m['adversaires'] ?? [], 'strlen'));
    aff_carte_fond($im, $x0, $y0, $x1, $hb);
    [$l1, $l2] = aff_cat_lignes($m);
    $wc = aff_bloc_cat($im, $x0, $y0, $hb, $l1, $l2);
    $haut = $adv ? $hb - 62 : $hb;                                    // partie haute : club qui reçoit, stade, heure
    $dl = min(78, $haut * .62); $lx = $x0 + $wc + 22 + $dl / 2;
    aff_logo_or($im, $dom ? '' : (string) $m['adv'], $dom, $lx, $y0 + $haut / 2 + 4, $dl);
    // jour et heure
    $bw = 150; $bx = $x1 - 18 - $bw; $by = $y0 + 14; $bh = $haut - 24;
    aff_coin($im, $bx, $by, $bw, $bh, 14, aff_c($im, '#C9A227'));
    aff_coin($im, $bx, $by, $bw, $bh - 6, 14, aff_c($im, '#FFFFFF'));
    $jour = aff_maj(AFF_JOURS[(int) date('w', strtotime($m['date'] . ' 12:00'))]);
    aff_texte($im, $jour, $bx + $bw / 2, $by + $bh * .40, max(18, $bh * .24), '800', '#1C63C4', $bw - 16, 'center');
    aff_texte($im, aff_maj(aff_hfr($m['heure'] ?? '')) ?: '–', $bx + $bw / 2, $by + $bh * .84, max(30, $bh * .42), '900', '#0B1633', $bw - 16, 'center');
    // club qui reçoit et stade
    $tx = $lx + $dl / 2 + 18; $zone = $bx - 16 - $tx;
    [$stade, $ville] = aff_lieu_court($m);
    aff_texte($im, $dom ? 'À DOMICILE' : aff_maj((string) $m['adv']), $tx, $y0 + $haut * .50, 40, '900', '#FFFFFF', $zone);
    aff_texte($im, trim($stade . ($ville ? ' · ' . $ville : '')), $tx, $y0 + $haut * .50 + 34, 25, '700', '#A9CCFF', $zone);
    // bande du bas : « CONTRE » puis une pastille par équipe (logo + nom court)
    if ($adv) {
        $yb = $y0 + $hb - 58;
        aff_coin($im, $x0 + $wc + 10, $yb, ($x1 - 12) - ($x0 + $wc + 10), 46, 12, aff_c($im, '#050B1F', .60));
        aff_texte($im, 'CONTRE', $x0 + $wc + 26, $yb + 31, 22, '900', '#E3B64C', 0);
        $px = $x0 + $wc + 26 + aff_larg('CONTRE', 22, '900') + 16;
        $place = ($x1 - 24 - $px) / min(4, count($adv));
        foreach (array_slice($adv, 0, 4) as $k => $a) {
            $cx = $px + $k * $place;
            aff_logo_or($im, (string) $a, false, $cx + 17, $yb + 23, 32);
            aff_texte($im, aff_nom_court((string) $a), $cx + 40, $yb + 32, 24, '800', '#FFFFFF', $place - 56);
        }
    }
}
/* ---------- résultats : une ligne par match « Pierrelatte · score · adversaire » ---------- */
function aff_ligne_brassage_res($im, array $m, float $x0, float $y0, float $x1, float $hb): void {
    aff_carte_fond($im, $x0, $y0, $x1, $hb);
    [$l1, $l2] = aff_cat_lignes($m);
    $wc = aff_bloc_cat($im, $x0, $y0, $hb, $l1, $l2);
    $zx0 = $x0 + $wc + 18; $zx1 = $x1 - 18; $cx = ($zx0 + $zx1) / 2;
    [$stade, $ville] = aff_lieu_court($m);
    $lieu = !empty($m['dom']) ? 'À DOMICILE · STADE GUSTAVE JAUME' : aff_maj((string) $m['adv']) . ($ville ? ' · ' . $ville : '');
    aff_texte($im, $lieu, $cx, $y0 + 34, 23, '800', '#A9CCFF', $zx1 - $zx0, 'center');
    $scores = array_slice(aff_scores_brassage($m), 0, 6);
    $n = max(1, count($scores)); $k = min(1, ($hb - 66) / (66 * $n));      // la carte peut être un peu réduite si la feuille est pleine
    $rh = 58 * $k; $gap = 8 * $k; $gy = $y0 + 52;
    foreach ($scores as $i => $r) {
        $ry = $gy + $i * ($rh + $gap); $cy = $ry + $rh / 2;
        $bp = (int) $r['bp']; $bc = (int) $r['bc']; $iss = $bp > $bc ? 'V' : ($bp < $bc ? 'D' : 'N');
        $dl = 48 * $k; $sw = 110;
        aff_logo_or($im, '', true, $zx0 + $dl / 2 + 4, $cy, $dl);
        aff_texte($im, 'PIERRELATTE', $zx0 + $dl + 16, $cy + 10 * $k, 30 * $k, '900', '#A9CCFF', $cx - $sw / 2 - ($zx0 + $dl + 26));
        aff_cadre_resultat($im, $cx - $sw / 2, $ry + 3, $sw, $rh - 6, 10, AFF_COUL_ISSUE[$iss], 3);
        aff_texte($im, "$bp - $bc", $cx, $cy + 13 * $k, 38 * $k, '900', '#FFFFFF', $sw - 10, 'center');
        aff_logo_or($im, (string) $r['adv'], false, $zx1 - $dl / 2 - 4, $cy, $dl);
        aff_texte($im, aff_nom_court((string) $r['adv']), $zx1 - $dl - 16, $cy + 10 * $k, 30 * $k, '900', '#FFFFFF', ($zx1 - $dl - 26) - ($cx + $sw / 2 + 10), 'right');
    }
}
function aff_liste_photo(array $matchs, string $samedi, bool $resultats, array $opts, string $fond) {
    $lieu = in_array($opts['lieu'] ?? '', ['dom', 'ext'], true) ? $opts['lieu'] : null;
    $plan = aff_plan_weekend($matchs, $samedi, $resultats, $lieu);
    [$im, $hBas, $hAvant, $story, $avecSp] = aff_feuille_debut($opts, $fond);
    $GLOBALS['aff_bas'] = null;
    $publication = !$story && $hAvant < AFF_HF;                 // format Instagram 4:5 : on remplira toute la largeur
    $W = AFF_W; $cx = $W / 2;
    // titre en haut au milieu, entre le blason et le logo de Pierrelatte
    $fal = !empty($GLOBALS['aff_fal']);
    $vetT = !empty($GLOBALS['aff_vet']);
    $titre = ($opts['titre'] ?? '') !== '' ? aff_maj($opts['titre']) : ($fal ? 'FOOT ANIMATION' : ($vetT ? 'VÉTÉRANS' : ($resultats ? 'RÉSULTATS' : 'RENCONTRES')));
    aff_texte($im, $titre, $cx + 3, 131, 96, '900', '#000000', 560, 'center', .45);
    aff_texte($im, $titre, $cx, 128, 96, '900', '#FFFFFF', 560, 'center');
    $sous = ($fal || $vetT) ? ($resultats ? 'RÉSULTATS DU WEEK-END' : 'RENCONTRES DU WEEK-END') : 'DU WEEK-END';
    aff_texte($im, $sous, $cx + 2, 193, 54, '800', '#000000', 560, 'center', .45);
    aff_texte($im, $sous, $cx, 191, 54, '800', '#C9A227', 560, 'center');
    if ($lieu) {
        $lib = $lieu === 'dom' ? 'À DOMICILE' : "À L'EXTÉRIEUR"; $pl = 34; $wp = aff_larg($lib, $pl, '800') + 70; $y0 = 290;
        aff_poly($im, [$cx - $wp / 2 + 16, $y0, $cx + $wp / 2, $y0, $cx + $wp / 2 - 16, $y0 + 48, $cx - $wp / 2, $y0 + 48], aff_c($im, '#C9A227'));
        aff_texte($im, $lib, $cx, $y0 + 36, $pl, '800', '#0B1633', 0, 'center');
    }
    // les matchs, dans l'ordre du week-end (le jour est écrit dans le bloc de l'heure)
    $liste = [];
    foreach ($plan as $j) foreach ($j['matchs'] as $m) $liste[] = $m;
    $n = count($liste);
    if (!$n) aff_texte($im, $resultats ? 'AUCUN RÉSULTAT CE WEEK-END' : 'AUCUN MATCH PROGRAMMÉ CE WEEK-END', $cx, 900, 52, '800', '#FFFFFF', $W - 160, 'center');
    else {
        $ya = 510; $yb = 1310;                                     // sous l'avion ou la maison (toujours visibles), au-dessus du slogan
        $fal = !empty($GLOBALS['aff_fal']);
        $pas = min(150, ($yb - $ya) / $n); $hb = $pas * .72;
        $y = $ya + ($publication ? 0 : (($yb - $ya) - $pas * $n) / 2) + ($pas - $hb) * .62;
        if ($fal) {                                                            // foot animation : cartes de hauteur variable
            $besoins = array_map(fn($m) => aff_hauteur_plateau($m, $resultats), $liste);
            $gap = 26; $k = min(1, (($yb - $ya) - $gap * ($n - 1)) / max(1, array_sum($besoins)));
            $total = array_sum($besoins) * $k + $gap * ($n - 1);
            $y = $ya + ($publication ? 0 : max(0, (($yb - $ya) - $total) / 2));
            foreach ($liste as $i => $m) {
                $h = $besoins[$i] * $k;
                if ($resultats) aff_ligne_brassage_res($im, $m, 70, $y, $W - 70, $h); else aff_ligne_plateau($im, $m, 70, $y, $W - 70, $h);
                $y += $h + $gap;
            }
            $GLOBALS['aff_bas'] = $y - $gap;
            $liste = [];
        }
        foreach ($liste as $m) {
            aff_ligne_match($im, $m, $resultats, 78, $y, $W - 78, $hb);
            $y += $pas;
            $GLOBALS['aff_bas'] = $y - $pas + $hb;
        }
    }
    return aff_feuille_fin($im, $hBas, $hAvant, $story, $avecSp);
}

/* ---------- outils communs aux feuilles sur image du club ---------- */
function aff_feuille_debut(array $opts, string $fond): array {
    $hAvant = aff_h(); $story = $hAvant === AFF_H;          // story 1080 × 1920 ; les autres formats sont des publications
    $GLOBALS['aff_bas'] = null;                              // bas des cartes, noté par la feuille qui en dessine
    $avecSp = (bool) ($opts['sponsors'] ?? true);
    $GLOBALS['aff_feuille'] = true; $GLOBALS['aff_h'] = AFF_HF;
    $hSp = $avecSp ? aff_hauteur_sponsors() : 0;
    // story : le bas (partenaires, ou bandeau du club sans partenaires) prend toute la place restante, sans flou
    $hBas = $story ? max($hSp, $hAvant - AFF_HF) : $hSp;
    $GLOBALS['aff_h'] = AFF_HF + $hBas;
    $im = aff_nouvelle();
    aff_poser_fond($im, $fond);
    aff_degrade_vertical($im, 560, 1330, [[0, '#050B1F', 0], [.13, '#050B1F', .30], [1, '#050B1F', .30]]);
    return [$im, $hBas, $hAvant, $story, $avecSp];
}
/* bandeau du bas quand il n'y a pas de partenaires (story) : aux couleurs du club */
function aff_bandeau_club($im, float $y, float $h): void {
    aff_rect($im, 0, $y, AFF_W, $h, aff_c($im, '#0B1633'));
    aff_rect($im, 0, $y, AFF_W, 8, aff_c($im, '#1C63C4'));
    aff_rect($im, 0, $y + 8, AFF_W, 4, aff_c($im, '#C9A227'));
    aff_texte($im, 'ASF-PIERRELATTE.FR', AFF_W / 2, $y + $h / 2 + 10, 64, '900', '#FFFFFF', AFF_W - 120, 'center');
    aff_texte($im, "ATOM'SPORTS FOOTBALL PIERRELATTE · DEPUIS 1923", AFF_W / 2, $y + $h / 2 + 62, 30, '700', '#C9A227', AFF_W - 120, 'center');
}
function aff_feuille_fin($im, int $hBas, int $hAvant, bool $story, bool $avecSp) {
    $HF = aff_h();
    if ($hBas > 0) { if ($avecSp) aff_bandeau_sponsors($im, AFF_HF, $hBas); else aff_bandeau_club($im, AFF_HF, $hBas); }
    aff_grain($im);
    $GLOBALS['aff_feuille'] = false; $GLOBALS['aff_h'] = $hAvant;
    if (!$story) {
        // publication (fil Facebook et Instagram) : l'affiche ENTIÈRE, réduite et centrée au format 4:5,
        // sur le bleu nuit du club avec un liseré doré — rien n'est coupé
        if ($HF === $hAvant) return $im;
        if ($HF < $hAvant) {                                   // format Facebook (1:2) : la feuille entière, centrée, bandes bleu nuit en haut et en bas
            $s = imagecreatetruecolor(AFF_W, $hAvant); imagealphablending($s, true);
            aff_rect($s, 0, 0, AFF_W, $hAvant, aff_c($s, '#0B1633'));
            $y = (int) round(($hAvant - $HF) / 2);
            imagecopy($s, $im, 0, $y, 0, 0, AFF_W, $HF);
            aff_rect($s, 0, $y - 4, AFF_W, 4, aff_c($s, '#C9A227'));
            aff_rect($s, 0, $y + $HF, AFF_W, 4, aff_c($s, '#C9A227'));
            aff_texte($s, 'ASF-PIERRELATTE.FR', AFF_W / 2, $y / 2 + 22, 56, '900', '#FFFFFF', AFF_W - 120, 'center');
            imagedestroy($im);
            return $s;
        }
        $bande = $HF - AFF_HF;                                  // hauteur de la bande des partenaires (0 sans partenaires)
        $haut = $hAvant - $bande;                               // place disponible au-dessus d'elle
        $bas = isset($GLOBALS['aff_bas']) ? (int) ceil($GLOBALS['aff_bas']) + 28 : AFF_HF;
        $GLOBALS['aff_bas'] = null;
        if ($bas <= $haut) {
            // les cartes tiennent : l'affiche garde TOUTE sa largeur, seul le bas décoratif (slogan) est laissé de côté
            $s = imagecreatetruecolor(AFF_W, $hAvant); imagealphablending($s, true);
            imagecopy($s, $im, 0, 0, 0, 0, AFF_W, $haut);
            if ($bande > 0) imagecopy($s, $im, 0, $haut, 0, AFF_HF, AFF_W, $bande);
            imagedestroy($im);
            return $s;
        }
        // beaucoup de cartes : on garde tout jusqu'à la dernière carte + les partenaires, réduit au plus juste
        $h1 = min(AFF_HF, $bas) + $bande;
        $t = imagecreatetruecolor(AFF_W, $h1); imagealphablending($t, true);
        imagecopy($t, $im, 0, 0, 0, 0, AFF_W, min(AFF_HF, $bas));
        if ($bande > 0) imagecopy($t, $im, 0, min(AFF_HF, $bas), 0, AFF_HF, AFF_W, $bande);
        imagedestroy($im); $im = $t; $HF = $h1;
        $s = imagecreatetruecolor(AFF_W, $hAvant); imagealphablending($s, true);
        aff_rect($s, 0, 0, AFF_W, $hAvant, aff_c($s, '#0B1633'));                             // bleu nuit du club, uni
        $k = $hAvant / $HF; $w = (int) round(AFF_W * $k); $x = (int) round((AFF_W - $w) / 2);
        imagecopyresampled($s, $im, $x, 0, 0, 0, $w, $hAvant, AFF_W, $HF);
        aff_rect($s, $x - 4, 0, 4, $hAvant, aff_c($s, '#C9A227'));                             // fin liseré doré de chaque côté
        aff_rect($s, $x + $w, 0, 4, $hAvant, aff_c($s, '#C9A227'));
        imagedestroy($im);
        return $s;
    }
    if ($HF === $hAvant) return $im;
    // cas rare (feuille plus haute que la story) : réduite et centrée sur fond bleu nuit
    $s = imagecreatetruecolor(AFF_W, $hAvant); imagealphablending($s, true);
    aff_rect($s, 0, 0, AFF_W, $hAvant, aff_c($s, '#0B1633'));
    $k = $hAvant / $HF;
    imagecopyresampled($s, $im, (int) ((AFF_W - AFF_W * $k) / 2), 0, 0, 0, (int) (AFF_W * $k), $hAvant, AFF_W, $HF);
    imagedestroy($im);
    return $s;
}
/* titre en haut au milieu (entre le blason et le logo de Pierrelatte), sous-titre doré, étiquette domicile / extérieur */
function aff_titre_haut($im, string $titre, string $sous, ?string $lieu): void {
    $cx = AFF_W / 2;
    aff_texte($im, $titre, $cx + 3, 131, 96, '900', '#000000', 560, 'center', .45);
    aff_texte($im, $titre, $cx, 128, 96, '900', '#FFFFFF', 560, 'center');
    if ($sous !== '') {
        aff_texte($im, $sous, $cx + 2, 193, 54, '800', '#000000', 560, 'center', .45);
        aff_texte($im, $sous, $cx, 191, 54, '800', '#C9A227', 560, 'center');
    }
    if ($lieu) {
        $lib = $lieu === 'dom' ? 'À DOMICILE' : "À L'EXTÉRIEUR"; $pl = 34; $wp = aff_larg($lib, $pl, '800') + 70; $y0 = 290;
        aff_poly($im, [$cx - $wp / 2 + 16, $y0, $cx + $wp / 2, $y0, $cx + $wp / 2 - 16, $y0 + 48, $cx - $wp / 2, $y0 + 48], aff_c($im, '#C9A227'));
        aff_texte($im, $lib, $cx, $y0 + 36, $pl, '800', '#0B1633', 0, 'center');
    }
}
/* bandeau d'information : barre bleue, texte à gauche, bloc blanc à droite (heure, résultat…) */
function aff_bandeau_info($im, float $y, string $gauche, string $droite, string $couleurTexte, string $trait, bool $cadre = false): void {
    $x0 = 78; $x1 = AFF_W - 78; $h = 110;
    aff_ombre_coin($im, $x0, $y, $x1 - $x0, $h, 18, 4, 8);
    aff_barre($im, $x0, $y, $x1 - $x0, $h, 18);
    aff_rect($im, $x0 + 30, $y, $x1 - $x0 - 60, 2, aff_c($im, '#C9A227'));
    $bw = $droite !== '' ? 270 : 0;
    aff_texte($im, $gauche, $x0 + 34, $y + $h / 2 + 56 * .36, 56, '900', '#FFFFFF', $x1 - $x0 - $bw - 80);
    if ($droite === '') return;
    $bx = $x1 - 20 - $bw; $by = $y - 8; $bh = $h + 16;
    if ($cadre) {                                                   // résultat : cadre de couleur transparent, texte blanc
        aff_cadre_resultat($im, $bx, $by, $bw, $bh, 16, $trait, 5);
        aff_texte($im, $droite, $bx + $bw / 2, $by + $bh / 2 + 60 * .36, 60, '900', '#FFFFFF', $bw - 34, 'center');
        return;
    }
    aff_coin($im, $bx, $by, $bw, $bh, 16, aff_c($im, $trait));
    aff_coin($im, $bx, $by, $bw, $bh - 8, 16, aff_c($im, '#FFFFFF'));
    aff_texte($im, $droite, $bx + $bw / 2, $by + ($bh - 8) / 2 + 64 * .36, 64, '900', $couleurTexte, $bw - 30, 'center');
}
/* ---------- jour de match / résultat d'un match, sur l'image du club ---------- */
function aff_match_photo(array $m, array $opts, string $fond) {
    [$im, $hBas, $hAvant, $story, $avecSp] = aff_feuille_debut($opts, $fond);
    $W = AFF_W; $cxp = $W / 2; $dom = !empty($m['dom']);
    $score = !empty($opts['score']) && aff_joue($m);
    $sous = aff_sous_etiquette((string) ($m['comp'] ?? ''));
    $cat = aff_maj((string) $m['equipe']) . ($sous !== '' ? ' · ' . $sous : '');
    $perso = trim((string) ($opts['titre'] ?? ''));
    aff_titre_haut($im, $perso !== '' ? aff_maj($perso) : ($score ? 'RÉSULTAT' : 'JOUR DE MATCH'), $cat, $dom ? 'dom' : 'ext');
    // face à face : l'équipe qui reçoit à gauche, celle qui se déplace à droite
    $cy = 850; $d = 270; $xl = 255; $xr = $W - 255;
    $nous = ['nom' => 'PIERRELATTE', 'brut' => '', 'club' => true];
    $eux = ['nom' => aff_maj((string) $m['adv']), 'brut' => (string) $m['adv'], 'club' => false];
    [$gauche, $droite] = $dom ? [$nous, $eux] : [$eux, $nous];
    $gG = true; $gD = true; $issue = null;
    if ($score) {
        $issue = aff_issue($m);
        $sg = (int) ($dom ? $m['bp'] : $m['bc']); $sd = (int) ($dom ? $m['bc'] : $m['bp']);
        $gG = $sg >= $sd; $gD = $sd >= $sg;
    }
    foreach ([[$gauche, $xl, $gG], [$droite, $xr, $gD]] as [$e, $x, $gagne]) {
        imagefilledellipse($im, (int) ($x + 6), (int) ($cy + 12), $d + 10, $d + 10, aff_c($im, '#000000', .35));
        aff_logo_or($im, $e['brut'], $e['club'], $x, $cy, $d);
        aff_texte($im, $e['nom'], $x, $cy + $d / 2 + 72, 52, '900', $e['club'] ? '#8FC2FF' : '#FFFFFF', 400, 'center', $gagne ? 1 : .62);
    }
    // au centre : le score (perdant atténué, trait de couleur) ou « VS »
    $trait = $issue ? ['V' => '#22C55E', 'N' => '#A3A3A3', 'D' => '#EF4444'][$issue] : '#C9A227';
    $sw = 240; $sh = 150; $sy = $cy - $sh / 2;
    if ($score) {
        aff_cadre_resultat($im, $cxp - $sw / 2, $sy, $sw, $sh, 18, AFF_COUL_ISSUE[$issue], 6);
        $ps = 116; $by = $cy + $ps * .34;
        foreach ([[$sg, -1], [$sd, 1]] as [$v, $sens]) {
            aff_texte($im, (string) $v, $cxp + $sens * 56 + 3, $by + 4, $ps, '900', '#000000', 0, 'center', .45);
            aff_texte($im, (string) $v, $cxp + $sens * 56, $by, $ps, '900', '#FFFFFF', 0, 'center');
        }
        aff_rect($im, $cxp - 2, $cy - 42, 4, 76, aff_c($im, '#FFFFFF', .85));
    } else {
        aff_coin($im, $cxp - $sw / 2, $sy, $sw, $sh, 18, aff_c($im, $trait));
        aff_coin($im, $cxp - $sw / 2, $sy, $sw, $sh - 10, 18, aff_c($im, '#FFFFFF'));
        aff_texte($im, 'VS', $cxp, $cy - 5 + 100 * .34, 100, '900', '#0B1633', 0, 'center');
    }
    // date, puis l'heure ou le résultat
    if ($score) aff_bandeau_info($im, 1110, aff_jour_court($m['date']), ['V' => 'VICTOIRE', 'N' => 'MATCH NUL', 'D' => 'DÉFAITE'][$issue],
        '#FFFFFF', AFF_COUL_ISSUE[$issue], true);
    else aff_bandeau_info($im, 1110, aff_jour_court($m['date']), aff_maj(aff_hfr($m['heure'] ?? '')), '#0B1633', '#C9A227');
    // adresse
    imagefilledellipse($im, 104, 1276, 26, 26, aff_c($im, '#C9A227'));
    imagefilledellipse($im, 104, 1276, 10, 10, aff_c($im, '#0A1430'));
    aff_texte($im, aff_maj(aff_lieu($m)), 130, 1287, 32, '800', '#FFFFFF', $W - 220);
    return aff_feuille_fin($im, $hBas, $hAvant, $story, $avecSp);
}
/* ---------- événement du club, sur l'image du stade ---------- */
function aff_evenement_photo(array $o, string $fond) {
    [$im, $hBas, $hAvant, $story, $avecSp] = aff_feuille_debut($o, $fond);
    $W = AFF_W;
    $titre = trim((string) ($o['titre'] ?? '')); $sous = trim((string) ($o['sous'] ?? ''));
    aff_titre_haut($im, aff_maj($titre !== '' ? $titre : 'Événement'), aff_maj($sous !== '' ? $sous : ($titre === '' ? 'du club' : '')), null);
    $y = 660;
    $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($o['date'] ?? '')) ? $o['date'] : '';
    $heure = trim((string) ($o['heure'] ?? ''));
    if ($date !== '') { aff_bandeau_info($im, $y, aff_jour_court($date), $heure !== '' ? aff_maj(aff_hfr($heure)) : '', '#0B1633', '#C9A227'); $y += 160; }
    $lieu = trim((string) ($o['lieu'] ?? ''));
    if ($lieu !== '') {
        imagefilledellipse($im, 104, (int) ($y - 11), 26, 26, aff_c($im, '#C9A227'));
        imagefilledellipse($im, 104, (int) ($y - 11), 10, 10, aff_c($im, '#0A1430'));
        aff_texte($im, aff_maj($lieu), 130, $y, 34, '800', '#FFFFFF', $W - 220);
        $y += 56;
    }
    // informations : une barre par ligne
    $lignes = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', (string) ($o['texte'] ?? '')))));
    foreach (array_slice($lignes, 0, 6) as $l) {
        if ($y + 88 > 1312) break;
        aff_ombre_coin($im, 78, $y, $W - 156, 84, 16, 4, 8);
        aff_barre($im, 78, $y, $W - 156, 84, 16);
        aff_rect($im, 108, $y, $W - 216, 2, aff_c($im, '#C9A227'));
        aff_texte($im, $l, 112, $y + 42 + 40 * .36, 40, '800', '#FFFFFF', $W - 260);
        $y += 104;
    }
    return aff_feuille_fin($im, $hBas, $hAvant, $story, $avecSp);
}

/* ---------- affiche : jour de match ---------- */
function aff_blason_grand($im, string $nom, bool $club, float $cx, float $cy, float $d): void {
    imagefilledellipse($im, (int) round($cx + 8), (int) round($cy + 12), (int) round($d), (int) round($d), aff_c($im, '#000000', .28));
    imagefilledellipse($im, (int) round($cx), (int) round($cy), (int) round($d), (int) round($d), aff_c($im, '#FFFFFF'));
    if ($club) { aff_blason_club($im, $cx - $d * .41, $cy - $d * .41, $d * .82); return; }
    $logo = aff_logo_adv($nom);
    if ($logo) { aff_contenir($im, $logo, $cx, $cy, $d * .70, $d * .70, 2.8); return; }
    aff_ecusson_initiales($im, $nom, $cx, $cy, $d * .66);
}
function aff_match(array $m, array $opts = []) {
    if (($nuit = afn_match($m, $opts)) !== null) return $nuit;                               // affiches « stade de nuit »
    if ($fond = aff_fond_lieu(!empty($m['dom']) ? 'dom' : 'ext')) return aff_match_photo($m, $opts, $fond);
    $im = aff_nouvelle(); $W = AFF_W; $H = aff_h();
    $score = !empty($opts['score']) && aff_joue($m);
    $hSp = ($opts['sponsors'] ?? true) ? aff_hauteur_sponsors() : 0; $H2 = $H - $hSp;
    aff_fond($im, $H2);
    // en-tête
    aff_blason_club($im, 35, 35, 150);
    aff_texte($im, "ATOM'SPORTS", 200, 98, 46, '800', '#FFFFFF');
    aff_texte($im, 'FOOTBALL PIERRELATTE', 200, 142, 34, '700', '#8FC2FF');
    $cat = aff_maj((string) $m['equipe']) . '  ·  ' . aff_maj((string) ($m['comp'] ?? ''));
    $pc = aff_fit($cat, 30, '700', $W * .6); $wc = aff_larg($cat, $pc, '700') + 44;
    aff_poly($im, [$W - 48 - $wc + 18, 196, $W - 48, 196, $W - 66, 244, $W - 48 - $wc, 244], aff_c($im, '#C9A227'));
    aff_texte($im, $cat, $W - 48 - $wc / 2, 231, $pc, '700', '#0B1633', 0, 'center');
    // titre massif
    $couleurIssue = $score ? ['V' => '#16A34A', 'N' => '#6B7280', 'D' => '#DC2626'][aff_issue($m)] : '#C9A227';
    $perso = trim((string) ($opts['titre'] ?? ''));
    if ($perso !== '') {
        [$l1, $l2] = aff_deux_lignes(aff_maj($perso), 230, $W - 96);
        if ($l2 !== '') { aff_texte_evide($im, $l1, 48, 440, 190, '#FFFFFF', $W - 96); aff_texte($im, $l2, 42, 640, 230, '900', '#FFFFFF', $W - 96); }
        else aff_texte($im, $l1, 42, 620, 250, '900', '#FFFFFF', $W - 96);
    } elseif ($score) {
        aff_texte_evide($im, 'RÉSULTAT', 48, 440, 190, '#FFFFFF', $W - 96);
        aff_texte($im, aff_maj(['V' => 'Victoire', 'N' => 'Match nul', 'D' => 'Défaite'][aff_issue($m)]), 42, 640, 230, '900', '#FFFFFF', $W - 96);
    } else {
        aff_texte_evide($im, 'JOUR DE', 48, 440, 190, '#FFFFFF', $W - 96);
        aff_texte($im, 'MATCH', 42, 640, 250, '900', '#FFFFFF', $W - 96);
    }
    aff_rect($im, 52, 668, 190, 12, aff_c($im, $couleurIssue));
    // les deux blasons face à face
    $cy = 880; $d = 300; $dom = !empty($m['dom']); $adv = aff_maj((string) $m['adv']);
    aff_blason_grand($im, $dom ? '' : (string) $m['adv'], $dom, 250, $cy, $d);
    aff_blason_grand($im, $dom ? (string) $m['adv'] : '', !$dom, $W - 250, $cy, $d);
    if ($score) {
        $sc = ($dom ? $m['bp'] : $m['bc']) . '-' . ($dom ? $m['bc'] : $m['bp']);
        aff_poly($im, [$W / 2 - 92, $cy - 66, $W / 2 + 112, $cy - 66, $W / 2 + 92, $cy + 66, $W / 2 - 112, $cy + 66], aff_c($im, '#FFFFFF'));
        aff_texte($im, $sc, $W / 2, $cy + 44, 118, '900', '#0B1633', 190, 'center');
    } else {
        aff_poly($im, [$W / 2 - 70, $cy - 58, $W / 2 + 88, $cy - 58, $W / 2 + 70, $cy + 58, $W / 2 - 88, $cy + 58], aff_c($im, '#FFFFFF'));
        aff_texte($im, 'VS', $W / 2, $cy + 38, 104, '900', '#0B1633', 0, 'center');
    }
    aff_texte($im, $dom ? 'PIERRELATTE' : $adv, 250, $cy + $d / 2 + 80, 56, '800', '#FFFFFF', 440, 'center');
    aff_texte($im, $dom ? $adv : 'PIERRELATTE', $W - 250, $cy + $d / 2 + 80, 56, '800', '#FFFFFF', 440, 'center');
    // bandeau date et heure
    $y0 = 1230;
    aff_poly($im, [40, $y0 + 12, $W - 20, $y0 + 12, $W - 50, $y0 + 152, 10, $y0 + 152], aff_c($im, '#000000', .3));
    aff_poly($im, [30, $y0, $W - 30, $y0, $W - 60, $y0 + 140, 0, $y0 + 140], aff_c($im, '#FFFFFF'));
    aff_poly($im, [$W - 330, $y0, $W - 30, $y0, $W - 60, $y0 + 140, $W - 360, $y0 + 140], aff_c($im, $score ? $couleurIssue : '#1C63C4'));
    aff_texte($im, aff_jour_court($m['date']), 60, $y0 + 100, 84, '900', '#0B1633', $W - 470);
    aff_texte($im, $score ? 'TERMINÉ' : aff_maj(aff_hfr($m['heure'] ?? '')), $W - 195, $y0 + 102, 96, '900', '#FFFFFF', 250, 'center');
    // adresse
    imagefilledellipse($im, 64, (int) ($y0 + 196), 26, 26, aff_c($im, '#C9A227'));
    imagefilledellipse($im, 64, (int) ($y0 + 196), 10, 10, aff_c($im, '#0A1430'));
    aff_texte($im, aff_maj(aff_lieu($m)), 92, $y0 + 207, 30, '700', '#D8E4FB', $W - 140);
    if ($hSp) aff_bandeau_sponsors($im, $H2, $hSp);
    aff_grain($im);
    return $im;
}

/* coupe un titre en deux lignes équilibrées si tout ne tient pas sur une seule */
function aff_deux_lignes(string $t, float $px, float $max): array {
    if (aff_larg($t, $px, '900') <= $max || !str_contains($t, ' ')) return [$t, ''];
    $mots = explode(' ', $t); $mieux = [$t, '']; $ecart = INF;
    for ($i = 1; $i < count($mots); $i++) {
        $a = implode(' ', array_slice($mots, 0, $i)); $b = implode(' ', array_slice($mots, $i));
        $e = abs(aff_larg($a, $px, '900') - aff_larg($b, $px, '900'));
        if ($e < $ecart) { $ecart = $e; $mieux = [$a, $b]; }
    }
    return $mieux;
}

/* ---------- affiche : événement du club ---------- */
function aff_evenement(array $o) {
    if (($nuit = afn_evenement($o)) !== null) return $nuit;                                  // affiches « stade de nuit »
    if ($fond = aff_fond_lieu('dom')) return aff_evenement_photo($o, $fond);
    $im = aff_nouvelle(); $W = AFF_W; $H = aff_h();
    $hSp = ($o['sponsors'] ?? true) ? aff_hauteur_sponsors() : 0; $H2 = $H - $hSp;
    aff_fond($im, $H2);
    aff_blason_club($im, 35, 35, 150);
    aff_texte($im, "ATOM'SPORTS", 200, 98, 46, '800', '#FFFFFF');
    aff_texte($im, 'FOOTBALL PIERRELATTE', 200, 142, 34, '700', '#8FC2FF');
    // titre sur une ou deux lignes
    $titre = aff_maj(trim((string) ($o['titre'] ?? '')) ?: 'Événement du club');
    [$l1, $l2] = aff_deux_lignes($titre, 200, $W - 96);
    $y = 470;
    if ($l2 !== '') { aff_texte_evide($im, $l1, 48, $y, 180, '#FFFFFF', $W - 96); $y += 200; aff_texte($im, $l2, 42, $y, 210, '900', '#FFFFFF', $W - 96); }
    else { aff_texte($im, $l1, 42, $y + 60, 230, '900', '#FFFFFF', $W - 96); $y += 60; }
    aff_rect($im, 52, $y + 28, 190, 12, aff_c($im, '#C9A227'));
    $y += 64;
    $sous = trim((string) ($o['sous'] ?? ''));
    if ($sous !== '') {
        $ps = aff_fit(aff_maj($sous), 36, '800', $W - 160); $ws = aff_larg(aff_maj($sous), $ps, '800') + 50;
        aff_poly($im, [64, $y, 48 + $ws, $y, 32 + $ws, $y + 56, 48, $y + 56], aff_c($im, '#C9A227'));
        aff_texte($im, aff_maj($sous), 48 + $ws / 2, $y + 42, $ps, '800', '#0B1633', 0, 'center');
        $y += 90;
    }
    // date et heure
    $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($o['date'] ?? '')) ? $o['date'] : '';
    if ($date !== '') {
        $y0 = $y + 20;
        aff_poly($im, [40, $y0 + 12, $W - 20, $y0 + 12, $W - 50, $y0 + 152, 10, $y0 + 152], aff_c($im, '#000000', .3));
        aff_poly($im, [30, $y0, $W - 30, $y0, $W - 60, $y0 + 140, 0, $y0 + 140], aff_c($im, '#FFFFFF'));
        $heure = trim((string) ($o['heure'] ?? ''));
        if ($heure !== '') aff_poly($im, [$W - 330, $y0, $W - 30, $y0, $W - 60, $y0 + 140, $W - 360, $y0 + 140], aff_c($im, '#1C63C4'));
        aff_texte($im, aff_jour_court($date), 60, $y0 + 100, 84, '900', '#0B1633', $heure !== '' ? $W - 470 : $W - 140);
        if ($heure !== '') aff_texte($im, aff_maj(aff_hfr($heure)), $W - 195, $y0 + 102, 96, '900', '#FFFFFF', 250, 'center');
        $y = $y0 + 190;
    }
    $lieu = trim((string) ($o['lieu'] ?? ''));
    if ($lieu !== '') {
        imagefilledellipse($im, 64, (int) ($y - 11), 26, 26, aff_c($im, '#C9A227'));
        imagefilledellipse($im, 64, (int) ($y - 11), 10, 10, aff_c($im, '#0A1430'));
        aff_texte($im, aff_maj($lieu), 92, $y, 32, '700', '#D8E4FB', $W - 140);
        $y += 50;
    }
    // informations, une carte blanche par ligne
    $lignes = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', (string) ($o['texte'] ?? '')))));
    $y += 10;
    foreach (array_slice($lignes, 0, 6) as $l) {
        if ($y + 96 > $H2 - 30) break;
        aff_ombre_coin($im, 40, $y, $W - 80, 86, 14);
        aff_coin($im, 40, $y, $W - 80, 86, 14, aff_c($im, '#FFFFFF'));
        aff_poly($im, [40, $y, 70, $y, 58, $y + 86, 40, $y + 86], aff_c($im, '#1C63C4'));
        aff_coin($im, 40, $y, 22, 86, 10, aff_c($im, '#1C63C4'));
        aff_texte($im, $l, 92, $y + 58, 40, '800', '#0B1633', $W - 180);
        $y += 104;
    }
    if ($hSp) aff_bandeau_sponsors($im, $H2, $hSp);
    aff_grain($im);
    return $im;
}

/* Publication du fil : les stories entières, côte à côte, dans un carré 2048 x 2048
   (taille maximale de Facebook : les affiches gardent presque leur pleine résolution, le texte reste net). */
function aff_combiner(array $fichiers, string $nom): string {
    $C = 2048;
    $im = imagecreatetruecolor($C, $C); imagealphablending($im, true);
    aff_rect($im, 0, 0, $C, $C, aff_c($im, '#0A1430'));
    aff_poly($im, [$C * .52, 0, $C, 0, $C, $C, $C * .2, $C], aff_c($im, '#123C8C'));
    aff_poly($im, [$C * .86, 0, $C * .90, 0, $C * .76, $C, $C * .72, $C], aff_c($im, '#FFFFFF', .16));
    $n = count($fichiers); $gap = 44; $marge = 36;
    $w = $n > 1 ? intdiv($C - 2 * $marge - $gap, 2) : 1080; $h = (int) round($w * 1920 / 1080);
    if ($h > $C - 72) { $h = $C - 72; $w = (int) round($h * 1080 / 1920); }
    $x = ($C - ($n * $w + ($n - 1) * $gap)) / 2; $y = ($C - $h) / 2;
    foreach (array_values($fichiers) as $f) {
        $src = aff_image($f);
        if (!$src) continue;
        foreach ([[26, .10], [17, .10], [9, .12]] as [$d, $o]) aff_rect($im, $x + $d, $y + $d + 6, $w, $h, aff_c($im, '#000000', $o));
        imagecopyresampled($im, $src, (int) round($x), (int) round($y), 0, 0, $w, $h, imagesx($src), imagesy($src));
        imagedestroy($src);
        $x += $w + $gap;
    }
    $dossier = dirname(__DIR__) . '/affiches';
    if (!is_dir($dossier)) @mkdir($dossier, 0755, true);
    $fichier = "$dossier/$nom.jpg";
    imageinterlace($im, true);
    imagejpeg($im, $fichier, 96);          // haute qualité : moins de flou après la recompression de Facebook
    imagedestroy($im);
    return $fichier;
}
function aff_enregistrer($im, string $nom): string {
    $dossier = dirname(__DIR__) . '/affiches';
    if (!is_dir($dossier)) @mkdir($dossier, 0755, true);
    $f = "$dossier/$nom.jpg";
    imagejpeg($im, $f, 95);
    imagedestroy($im);
    return $f;
}

/* ================= Affiches « stade de nuit » (saison 2026-2027) =================
   Fonds : img/fond-domicile.jpg et img/fond-exterieur.jpg (le stade Gustave Jaume de nuit avec le ballon du club,
   image de 1520 x 2180). Une seule image par lieu sert aux trois formats : le serveur y découpe la story (1080 x 1920),
   la publication Instagram (1080 x 1350) et la publication Facebook (1080 x 2160), le ballon toujours à sa place.
   Il y dessine tout le reste : voile, bandeau du haut, blason et « 1923 », pastille domicile / extérieur, titres, date,
   la liste des matchs (sa taille est calculée pour que tout tienne, les noms ne sont jamais coupés), la devise du club
   et les partenaires.
   Avec les anciens fonds (feuilles 1080 x 1620 avec la maison ou l'avion), les anciennes affiches sont dessinées comme avant. */
const AFN_FORMATS = [   // positions en pixels, reprises du modèle (affiche.html du kit)
    'fb'    => ['H' => 2160, 'barre' => 58, 'tete' => 96, 'bl' => 120, 'titre' => 300, 't1' => 150, 't2' => 84, 'date' => 630, 'zone' => [802, 1804], 'part' => 1950, 'logo' => 58],
    'story' => ['H' => 1920, 'barre' => 58, 'tete' => 96, 'bl' => 112, 'titre' => 290, 't1' => 140, 't2' => 78, 'date' => 596, 'zone' => [744, 1584], 'part' => 1714, 'logo' => 54],
    'insta' => ['H' => 1350, 'barre' => 46, 'tete' => 66, 'bl' => 84,  'titre' => 176, 't1' => 104, 't2' => 58, 'date' => 402, 'zone' => [474, 1094], 'part' => 1160, 'logo' => 40],
];
const AFN_METAL = ['dom' => [[0, '#FFF3C4'], [.40, '#F2CD6C'], [.66, '#C99A2E'], [1, '#F0CF7A']],     // or (domicile)
                   'ext' => [[0, '#FFFFFF'], [.38, '#DCE8FB'], [.66, '#9DB9E6'], [1, '#E8F0FC']]];    // argent bleuté (extérieur)
const AFN_ACC = ['dom' => ['#E3B64C', '#F7DC92'], 'ext' => ['#A9C4EE', '#E1EBFB']];
const AFN_ISSUE = ['V' => ['#2BB566', '#16773F'], 'D' => ['#D9534B', '#9C2A24'], 'N' => ['#6F7C9C', '#465170']];
const AFN_CIEL = '#C9D4F2';
const AFN_SS = 2;                                   // la liste est dessinée deux fois plus grande puis réduite : bords bien lisses
const AFN_POLICES = ['900i' => 'BarlowCondensed-BlackItalic.ttf', '800i' => 'BarlowCondensed-ExtraBoldItalic.ttf',
    's600' => 'SourceSans3-SemiBold.ttf', 's700' => 'SourceSans3-Bold.ttf', 's800' => 'SourceSans3-ExtraBold.ttf', 's700i' => 'SourceSans3-BoldItalic.ttf',
    'script' => 'KaushanScript-Regular.ttf'];
const AFN_MAITRE = ['W' => 1520, 'H' => 2180, 'bx' => 1220, 'by' => 625, 'r' => 165];           // le fond : taille, centre et rayon du ballon
const AFN_BALLON = ['fb' => [840, 610, 165], 'story' => [845, 566, 150], 'insta' => [870, 330, 118]];   // place du ballon sur chaque format

/* police : '900', '800', '700' (Barlow Condensed), '900i' (italique), 's700', 's800', 's700i' (Source Sans 3) ;
   si une police manque, on prend la Barlow Condensed la plus proche */
function afn_police(string $p): string {
    static $cache = [];
    if (isset($cache[$p])) return $cache[$p];
    if (!isset(AFN_POLICES[$p])) return $cache[$p] = aff_police($p);
    foreach ([__DIR__ . '/polices', dirname(__DIR__) . '/polices', dirname(__DIR__) . '/api/polices', __DIR__] as $d)
        if (is_file($f = $d . '/' . AFN_POLICES[$p]) && is_readable($f)) return $cache[$p] = $f;
    if ($p === 'script') return $cache[$p] = afn_police('800i');
    return $cache[$p] = aff_police(['900i' => '900', '800i' => '800', 's600' => '600', 's700' => '700', 's800' => '800', 's700i' => '700'][$p]);
}
function afn_format(): string { $h = aff_h(); return $h >= 2000 ? 'fb' : ($h < 1500 ? 'insta' : 'story'); }
/* le fond du lieu, s'il s'agit du nouveau fond « stade de nuit » (repère écrit dans l'image, ou sa taille de 1520 x 2180) */
function afn_fond(string $lieu): ?string {
    foreach ($lieu === 'ext' ? ['fond-exterieur', 'fond-domicile'] : ['fond-domicile'] as $n) foreach (['jpg', 'jpeg', 'png', 'webp'] as $ext) {
        if (!is_file($p = dirname(__DIR__) . "/img/$n.$ext")) continue;
        return afn_fond_nuit($p) ? $p : null;                          // c'est le premier fond trouvé qui décide
    }
    return null;
}
function afn_fond_nuit(string $p): bool {
    static $cache = [];
    if (isset($cache[$p])) return $cache[$p];
    if (str_contains((string) @file_get_contents($p, false, null, 0, 65536), 'asf-stade-nuit')) return $cache[$p] = true;
    $d = @getimagesize($p);
    return $cache[$p] = $d && $d[0] >= 1400 && abs($d[1] / $d[0] - AFN_MAITRE['H'] / AFN_MAITRE['W']) < .03;
}
function afn_actif(?string $lieu = null): bool { return aff_polices_ok() && afn_fond($lieu === 'ext' ? 'ext' : 'dom') !== null; }

/* ---------- texte ---------- */
function afn_bb(string $t, float $px, string $f): array { return @imagettfbbox($px * .75, 0, $f, $t) ?: [0, 0, 0, 0, 0, 0, 0, 0]; }
/* avance (largeur typographique, comme dans le navigateur) ; $ls : espacement des lettres en pixels */
function afn_larg(string $t, float $px, string $p, float $ls = 0): float {
    static $memo = [];
    if ($t === '') return 0;
    $k = "$p|$px|$ls|$t";
    if (isset($memo[$k])) return $memo[$k];
    if (count($memo) > 50000) $memo = [];
    $f = afn_police($p); if ($f === '') return $memo[$k] = mb_strlen($t) * $px * .5;
    return $memo[$k] = afn_bb($t . 'H', $px, $f)[2] - afn_bb('H', $px, $f)[2] + $ls * mb_strlen($t);
}
/* écrit sur la ligne de base $y ; $col : couleur déjà allouée ; renvoie la largeur */
function afn_texte($im, string $t, float $x, float $y, float $px, string $p, int $col, string $align = 'left', float $ls = 0): float {
    $f = afn_police($p); if ($f === '' || $t === '') return 0;
    $w = afn_larg($t, $px, $p, $ls);
    if ($align === 'right') $x -= $w; elseif ($align === 'center') $x -= $w / 2;
    if ($ls == 0) { imagettftext($im, $px * .75, 0, (int) round($x), (int) round($y), $col, $f, $t); return $w; }
    $pre = ''; $i = 0;
    foreach (mb_str_split($t) as $c) {
        $dx = $pre === '' ? 0 : afn_bb($pre . 'H', $px, $f)[2] - afn_bb('H', $px, $f)[2];
        imagettftext($im, $px * .75, 0, (int) round($x + $dx + $i * $ls), (int) round($y), $col, $f, $c);
        $pre .= $c; $i++;
    }
    return $w;
}
/* taille qui fait tenir le texte dans $max (comme « data-fit » du modèle) : de $px jusqu'à $px × $min, puis plus petit si vraiment nécessaire */
function afn_fit(string $t, float $px, string $p, float $max, float $min = .6, float $lsEm = 0): float {
    $s = $px;
    while ($s > $px * $min && afn_larg($t, $s, $p, $s * $lsEm) > $max + 1) $s -= .5;
    while ($s > 6 && afn_larg($t, $s, $p, $s * $lsEm) > $max + 1) $s -= .5;     // jamais coupé : on réduit encore
    return $s;
}
/* un nom sur deux lignes (retour à la ligne entre les mots, comme dans le navigateur) */
function afn_deux_lignes(string $t, float $px, string $p, float $max): array {
    $mots = preg_split('/\s+/u', trim($t)); $l1 = array_shift($mots);
    while ($mots && afn_larg($l1 . ' ' . $mots[0], $px, $p) <= $max) $l1 .= ' ' . array_shift($mots);
    return [$l1, implode(' ', $mots)];
}

/* ---------- couleurs, dégradés, formes ---------- */
function afn_rgb(string $hex): array { return sscanf(ltrim($hex, '#'), '%02x%02x%02x'); }
function afn_mix(array $arrets, float $t): array {   // [[position 0..1, '#hex'], …] → [r, g, b]
    $t = max(0, min(1, $t)); $n = count($arrets);
    for ($i = 0; $i < $n - 2 && $t > $arrets[$i + 1][0]; $i++);
    [$p0, $c0] = $arrets[$i]; [$p1, $c1] = $arrets[min($i + 1, $n - 1)];
    $k = $p1 > $p0 ? ($t - $p0) / ($p1 - $p0) : 0; $a = afn_rgb($c0); $b = afn_rgb($c1);
    return [(int) round($a[0] + ($b[0] - $a[0]) * $k), (int) round($a[1] + ($b[1] - $a[1]) * $k), (int) round($a[2] + ($b[2] - $a[2]) * $k)];
}
function afn_c($im, array $rgb, float $op = 1): int { return imagecolorallocatealpha($im, $rgb[0], $rgb[1], $rgb[2], (int) round(127 * (1 - max(0, min(1, $op))))); }
/* retrait horizontal d'un coin arrondi de rayon $r à la hauteur $d (0 = bord) */
function afn_retrait(float $r, float $d): float { if ($r <= 0 || $d >= $r) return 0; $e = $r - $d; return $r - sqrt(max(0, $r * $r - $e * $e)); }
/* rectangle à coins arrondis ($r : rayon ou [haut-gauche, haut-droit, bas-droit, bas-gauche]) rempli :
   $remp = '#hex' | ['v', arrêts] (dégradé vertical) | ['h', arrêts] (dégradé horizontal) ; $op : opacité */
function afn_boite($im, float $x, float $y, float $w, float $h, $r, $remp, float $op = 1): void {
    [$rhg, $rhd, $rbd, $rbg] = is_array($r) ? $r : [$r, $r, $r, $r];
    $x0 = (int) round($x); $y0 = (int) round($y); $x1 = (int) round($x + $w); $y1 = (int) round($y + $h);
    if ($x1 <= $x0 || $y1 <= $y0) return;
    $plein = is_string($remp) ? afn_c($im, afn_rgb($remp), $op) : null;
    if (is_array($remp) && $remp[0] === 'h') {                       // colonne par colonne
        for ($i = $x0; $i < $x1; $i++) {
            $dg = $i + .5 - $x0; $dd = $x1 - $i - .5;
            $ih = max(afn_retrait($rhg, $dg), afn_retrait($rhd, $dd)); $ib = max(afn_retrait($rbg, $dg), afn_retrait($rbd, $dd));
            imageline($im, $i, (int) round($y0 + $ih), $i, (int) round($y1 - $ib) - 1, afn_c($im, afn_mix($remp[1], ($i - $x0) / max(1, $x1 - $x0 - 1)), $op));
        }
        return;
    }
    for ($j = $y0; $j < $y1; $j++) {                                  // ligne par ligne
        $dh = $j + .5 - $y0; $db = $y1 - $j - .5;
        $ig = max(afn_retrait($rhg, $dh), afn_retrait($rbg, $db)); $id = max(afn_retrait($rhd, $dh), afn_retrait($rbd, $db));
        $c = $plein ?? afn_c($im, afn_mix($remp[1], ($j - $y0) / max(1, $y1 - $y0 - 1)), $op);
        imageline($im, (int) round($x0 + $ig), $j, (int) round($x1 - $id) - 1, $j, $c);
    }
}
/* liseré intérieur (« inset ») d'épaisseur $ep le long d'un rectangle arrondi */
function afn_lisere($im, float $x, float $y, float $w, float $h, float $r, float $ep, string $hex, float $op): void {
    $c = afn_c($im, afn_rgb($hex), $op);
    $x0 = (int) round($x); $y0 = (int) round($y); $x1 = (int) round($x + $w); $y1 = (int) round($y + $h);
    for ($j = $y0; $j < $y1; $j++) {
        $dh = $j + .5 - $y0; $db = $y1 - $j - .5; $d = min($dh, $db);
        $io = afn_retrait($r, $d);
        if ($d < $ep) { imageline($im, (int) round($x0 + $io), $j, (int) round($x1 - $io) - 1, $j, $c); continue; }
        $ii = $ep + afn_retrait(max(0, $r - $ep), $d - $ep);
        imageline($im, (int) round($x0 + $io), $j, (int) round($x0 + max($ii, $io + 1)) - 1, $j, $c);
        imageline($im, (int) round($x1 - max($ii, $io + 1)), $j, (int) round($x1 - $io) - 1, $j, $c);
    }
}
/* calque transparent */
function afn_calque(int $w, int $h) {
    $l = imagecreatetruecolor(max(1, $w), max(1, $h));
    imagealphablending($l, false); imagesavealpha($l, true);
    imagefilledrectangle($l, 0, 0, $w, $h, imagecolorallocatealpha($l, 0, 0, 0, 127));
    imagealphablending($l, true);
    return $l;
}
/* ombre douce : $formes dessine en blanc sur un petit masque noir (coordonnées divisées par $k) ; flou ≈ celui du navigateur */
function afn_ombre($im, float $x0, float $y0, float $w, float $h, callable $formes, float $flou, float $op, string $hex = '#000000'): void {
    if ($flou <= 0 || $w < 1 || $h < 1) return;
    $k = max(1, (int) round($flou / 6)); $mw = (int) ceil($w / $k) + 2; $mh = (int) ceil($h / $k) + 2;
    $m = imagecreatetruecolor($mw, $mh);
    imagefilledrectangle($m, 0, 0, $mw, $mh, imagecolorallocate($m, 0, 0, 0));
    $formes($m, $k, imagecolorallocate($m, 255, 255, 255));
    $n = (int) min(40, round((($flou / 2) / (.85 * $k)) ** 2));
    for ($i = 0; $i < $n; $i++) imagefilter($m, IMG_FILTER_GAUSSIAN_BLUR);
    [$r, $g, $b] = afn_rgb($hex);
    $l = afn_calque($mw, $mh); imagealphablending($l, false);
    for ($j = 0; $j < $mh; $j++) for ($i = 0; $i < $mw; $i++) {
        $v = (imagecolorat($m, $i, $j) >> 16) & 255;
        if ($v) imagesetpixel($l, $i, $j, imagecolorallocatealpha($l, $r, $g, $b, 127 - (int) round($v / 255 * 127 * $op)));
    }
    imagedestroy($m);
    imagealphablending($im, true);
    imagecopyresampled($im, $l, (int) round($x0), (int) round($y0), 0, 0, $mw * $k, $mh * $k, $mw, $mh);
    imagedestroy($l);
}
/* texte rempli d'un dégradé vertical (titre « métal ») : $haut et $bas bornent le dégradé */
function afn_texte_degrade($im, string $t, float $x, float $y, float $px, string $p, array $arrets, float $haut, float $bas): void {
    $f = afn_police($p); if ($f === '') return;
    $w = (int) ceil(afn_larg($t, $px, $p) + $px * .4); $h = (int) ceil($px * 1.5);
    $ox = (int) floor($x - $px * .1); $oy = (int) floor($y - $px * 1.15);
    $l = afn_calque($w, $h);
    imagettftext($l, $px * .75, 0, (int) round($x - $ox), (int) round($y - $oy), imagecolorallocate($l, 255, 255, 255), $f, $t);
    imagealphablending($l, false);
    for ($j = 0; $j < $h; $j++) {
        $rgb = afn_mix($arrets, ($oy + $j - $haut) / max(1, $bas - $haut));
        for ($i = 0; $i < $w; $i++) {
            $a = (imagecolorat($l, $i, $j) >> 24) & 127;
            if ($a < 127) imagesetpixel($l, $i, $j, imagecolorallocatealpha($l, $rgb[0], $rgb[1], $rgb[2], $a));
        }
    }
    imagealphablending($im, true);
    imagecopy($im, $l, $ox, $oy, 0, 0, $w, $h);
    imagedestroy($l);
}
/* ombre portée floue d'un texte */
function afn_ombre_texte($im, string $t, float $x, float $y, float $px, string $p, float $dy, float $flou, float $op, float $ls = 0): void {
    $w = afn_larg($t, $px, $p, $ls); $f = afn_police($p); if ($f === '') return;
    $x0 = $x - 2 * $flou; $y0 = $y - $px * 1.1 - 2 * $flou + $dy;
    afn_ombre($im, $x0, $y0, $w + 4 * $flou + $px * .3, $px * 1.4 + 4 * $flou, function ($m, $k, $blanc) use ($t, $x, $y, $x0, $y0, $px, $f, $dy) {
        imagettftext($m, $px / $k * .75, 0, (int) round(($x - $x0) / $k), (int) round(($y + $dy - $y0) / $k), $blanc, $f, $t);
    }, $flou, $op);
}

/* ---------- petits dessins ---------- */
/* icônes (repère de 24 × 24) : maison, avion, repère de lieu */
function afn_icone($im, string $nom, float $x, float $y, float $taille, int $col, ?int $fond = null): void {
    $k = $taille / 24;
    $pts = [];
    if ($nom === 'maison') $pts = [3, 11.2, 12, 4, 21, 11.2, 21, 21, 14.8, 21, 14.8, 14.9, 9.2, 14.9, 9.2, 21, 3, 21];
    elseif ($nom === 'avion') {
        $pts = [21.5, 15.8, 21.5, 13.9, 13.4, 8.8, 13.4, 3.6];
        for ($i = 1; $i < 8; $i++) { $a = M_PI * $i / 8; $pts[] = 12 + 1.4 * cos($a); $pts[] = 3.6 - 1.4 * sin($a); }
        array_push($pts, 10.6, 3.6, 10.6, 8.8, 2.5, 13.9, 2.5, 15.8, 10.6, 13.3, 10.6, 18.7, 8.4, 20.3, 8.4, 22, 12, 21, 15.6, 22, 15.6, 20.3, 13.4, 18.7, 13.4, 13.3);
    } else {                                                          // repère : goutte et rond intérieur
        imagefilledellipse($im, (int) round($x + 12 * $k), (int) round($y + 10 * $k), (int) round(14 * $k), (int) round(14 * $k), $col);
        aff_poly($im, [$x + 5.4 * $k, $y + 12.6 * $k, $x + 18.6 * $k, $y + 12.6 * $k, $x + 12 * $k, $y + 22 * $k], $col);
        if ($fond !== null) imagefilledellipse($im, (int) round($x + 12 * $k), (int) round($y + 10 * $k), (int) round(5.4 * $k), (int) round(5.4 * $k), $fond);
        return;
    }
    $p = []; foreach ($pts as $i => $v) $p[] = ($i % 2 ? $y : $x) + $v * $k;
    aff_poly($im, $p, $col);
}
/* blason rond : blason du club, logo adverse, ou rond bleu nuit aux initiales ; $u = pixels par pixel du modèle */
function afn_blason($im, string $nom, bool $club, float $cx, float $cy, float $d, float $u, ?string $court = null): void {
    $logo = $club ? null : (aff_logo_adv($nom) ?: aff_logo_district($nom));
    $ini = !$club && !$logo;
    foreach ([[10, .07], [6, .09], [3, .11]] as [$e, $o])                                         // ombre portée douce
        imagefilledellipse($im, (int) round($cx), (int) round($cy + 6 * $u), (int) round($d + $e * $u), (int) round($d + $e * $u), aff_c($im, '#000000', $o));
    imagefilledellipse($im, (int) round($cx), (int) round($cy), (int) round($d + 4 * $u), (int) round($d + 4 * $u), aff_c($im, '#FFFFFF', $ini ? .35 : .25));
    if (!$ini) {
        imagefilledellipse($im, (int) round($cx), (int) round($cy), (int) round($d), (int) round($d), aff_c($im, '#FFFFFF'));
        if ($club) aff_blason_club($im, $cx - $d * .43, $cy - $d * .43, $d * .86);
        else aff_contenir($im, $logo, $cx, $cy, $d * .84, $d * .84, 4);
        return;
    }
    // initiales : dégradé radial #4A5784 → #1B2340, centré en haut à gauche
    $r = $d / 2; $gx = $cx - $r + $d * .35; $gy = $cy - $r + $d * .30; $R = $d * .955 * .70;
    $x0 = (int) floor($cx - $r); $y0 = (int) floor($cy - $r); $n = (int) ceil($d) + 1;
    for ($j = 0; $j < $n; $j++) for ($i = 0; $i < $n; $i++) {
        $px = $x0 + $i + .5; $py = $y0 + $j + .5;
        if (($px - $cx) ** 2 + ($py - $cy) ** 2 > $r * $r) continue;
        imagesetpixel($im, $x0 + $i, $y0 + $j, afn_c($im, afn_mix([[0, '#4A5784'], [1, '#1B2340']], sqrt(($px - $gx) ** 2 + ($py - $gy) ** 2) / $R)));
    }
    $vides = ['fc', 'us', 'u', 's', 'as', 'es', 'o', 'et', 'de', 'du', 'd', 'la', 'le', 'f', 'co', 'sc', 'r', 'st'];
    preg_match_all('/[A-Za-zÀ-ÿ]+/u', $court ?? $nom, $mm);
    $mots = array_values(array_filter($mm[0], fn($w) => !in_array(mb_strtolower($w), $vides, true)));
    $i = aff_maj(mb_substr(implode('', array_map(fn($w) => mb_substr($w, 0, 1), $mots)), 0, 2) ?: mb_substr($nom, 0, 2));
    afn_texte($im, $i, $cx, $cy + $d * .42 * .4, $d * .42, '900', aff_c($im, '#FFFFFF'), 'center');
}
/* bloc bleu rayé (catégorie, en-tête de la grande carte) : dégradé à 160° et rayures à -55°, gardé en mémoire par taille */
function afn_raye(int $w, int $h, float $u) {
    static $cache = [];
    $cle = "$w|$h|$u";
    if (isset($cache[$cle])) return $cache[$cle];
    $l = afn_calque($w, $h); imagealphablending($l, false);
    $a = deg2rad(160); $dx = sin($a); $dy = -cos($a); $long = abs($w * $dx) + abs($h * $dy);
    $b = deg2rad(-55); $sx = sin($b); $sy = -cos($b);
    for ($j = 0; $j < $h; $j++) for ($i = 0; $i < $w; $i++) {
        $t = (($i - $w / 2) * $dx + ($j - $h / 2) * $dy) / $long + .5;
        [$r, $g, $bl] = afn_mix([[0, '#2457CF'], [1, '#132F7E']], $t);
        $s = fmod(($i * $sx + $j * $sy) / $u + 10000, 16);
        if ($s < 6) { $r += (255 - $r) * .07; $g += (255 - $g) * .07; $bl += (255 - $bl) * .07; }
        imagesetpixel($l, $i, $j, imagecolorallocate($l, (int) $r, (int) $g, (int) $bl));
    }
    imagealphablending($l, true);
    return $cache[$cle] = $l;
}
/* colle un bloc rayé avec des coins arrondis [hg, hd, bd, bg] */
function afn_coller_raye($im, float $x, float $y, float $w, float $h, array $r, float $u): void {
    $w = (int) round($w); $h = (int) round($h);
    $src = afn_raye($w, $h, $u);
    $l = afn_calque($w, $h); imagealphablending($l, false);
    imagecopy($l, $src, 0, 0, 0, 0, $w, $h);
    $vide = imagecolorallocatealpha($l, 0, 0, 0, 127);
    [$rhg, $rhd, $rbd, $rbg] = $r;
    for ($j = 0; $j < $h; $j++) {
        $dh = $j + .5; $db = $h - $j - .5;
        $ig = (int) round(max(afn_retrait($rhg, $dh), afn_retrait($rbg, $db))); $id = (int) round(max(afn_retrait($rhd, $dh), afn_retrait($rbd, $db)));
        if ($ig > 0) imageline($l, 0, $j, $ig - 1, $j, $vide);
        if ($id > 0) imageline($l, $w - $id, $j, $w - 1, $j, $vide);
    }
    imagealphablending($im, true);
    imagecopy($im, $l, (int) round($x), (int) round($y), 0, 0, $w, $h);
    imagedestroy($l);
}
/* score : deux cases de couleur (victoire, nul, défaite), celle de Pierrelatte cerclée d'or ou d'argent */
function afn_cases($im, array $A, $bp, $bc, bool $nousDabord, float $x, float $y, float $cw, float $ch, float $r, float $gap, float $px, float $u): void {
    $joue = is_numeric($bp) && is_numeric($bc);
    $iss = $joue ? ($bp > $bc ? 'V' : ($bp < $bc ? 'D' : 'N')) : 'N';
    $deg = ['v', [[0, AFN_ISSUE[$iss][0]], [1, AFN_ISSUE[$iss][1]]]];
    if (!$joue) {                                                          // score pas encore transmis : « NC »
        afn_boite($im, $x, $y, $cw * 2 + $gap, $ch, $r, $deg);
        afn_texte($im, 'NC', $x + $cw + $gap / 2, $y + ($ch - 1.2 * $px) / 2 + $px, $px, '900', aff_c($im, '#FFFFFF'), 'center');
        return;
    }
    $vals = $nousDabord ? [[$bp, true], [$bc, false]] : [[$bc, false], [$bp, true]];
    foreach ($vals as $i => [$v, $nous]) {
        $bx = $x + $i * ($cw + $gap);
        if ($nous) { afn_boite($im, $bx, $y, $cw, $ch, $r, $A['accl']); afn_boite($im, $bx + 3 * $u, $y + 3 * $u, $cw - 6 * $u, $ch - 6 * $u, max(0, $r - 3 * $u), $deg); }
        else afn_boite($im, $bx, $y, $cw, $ch, $r, $deg);
        afn_texte($im, (string) $v, $bx + $cw / 2, $y + ($ch - 1.2 * $px) / 2 + $px, $px, '900', aff_c($im, '#FFFFFF'), 'center');
    }
}
/* heure : bloc « métal » avec le jour au-dessus */
function afn_heure($im, array $A, string $jour, string $heure, float $x, float $y, float $w, float $h, float $pj, float $ph, float $u, float $r): void {
    afn_boite($im, $x, $y, $w, $h, $r, ['v', $A['metal']]);
    $top = $y + ($h - $pj - $ph) / 2; $nuit = aff_c($im, '#0B1633');
    afn_texte($im, aff_maj($jour), $x + $w / 2, $top + $pj * .9, $pj, '800', $nuit, 'center', $pj * .14);
    afn_texte($im, $heure !== '' ? $heure : '–', $x + $w / 2, $top + $pj + $ph * .9, $ph, '900i', $nuit, 'center');
}
/* nom d'une équipe : réduit pour tenir, ou sur deux lignes, jamais coupé ; $cy : milieu vertical */
function afn_nom($im, string $nom, float $x, float $cy, float $max, float $px, float $fit, string $p, string $hex, string $align): void {
    $s = $px;
    while ($s > $px * $fit && afn_larg($nom, $s, $p) > $max + 1) $s -= .5;
    $col = aff_c($im, $hex);
    if (afn_larg($nom, $s, $p) <= $max + 1 || !str_contains(trim($nom), ' ')) {
        $s = afn_fit($nom, $s, $p, $max, 0);
        afn_texte($im, $nom, $x, $cy + .4 * $s, $s, $p, $col, $align);
        return;
    }
    $s2 = $px * .78;
    [$l1, $l2] = afn_deux_lignes($nom, $s2, $p, $max);
    $s2 = min(afn_fit($l1, $s2, $p, $max, 0), afn_fit($l2, $s2, $p, $max, 0));
    $lh = .95 * $s2;
    afn_texte($im, $l1, $x, $cy - $lh + .475 * $s2 + .4 * $s2, $s2, $p, $col, $align);
    afn_texte($im, $l2, $x, $cy + .475 * $s2 + .4 * $s2, $s2, $p, $col, $align);
}
/* ligne « lieu » : repère + texte en capitales */
function afn_lieu($im, array $A, string $t, float $x, float $top, float $max, float $px, float $u, int $fondRepere): void {
    $icone = 17 * $u;
    $lh = 1.424 * $px;
    afn_icone($im, 'lieu', $x, $top + ($lh - $icone) / 2, $icone, aff_c($im, $A['acc']), $fondRepere);
    $t = aff_maj($t); $tx = $x + $icone + 7 * $u; $s = afn_fit($t, $px, 's700', $max - ($tx - $x), .7, .06);
    afn_texte($im, $t, $tx, $top + ($lh - 1.424 * $s) / 2 + 1.024 * $s, $s, 's700', aff_c($im, $A['accl']), 'left', $s * .06);
}

/* ---------- les blocs de la liste ---------- */
/* hauteur d'un bloc, en pixels du modèle, pour une largeur de carte $wc */
function afn_hauteur(array $b, float $wc): float {
    switch ($b['t']) {
        case 'match': return 92;
        case 'plateau':
            if (!$b['adv']) return 92;
            return max(92, 12 + 24.2 + 8 + afn_lignes_contre($b, $wc - 150 - 128 - 36) * 42 - 8 + 12);
        case 'plateau-res': return max(92, 12 + 24.2 + count($b['res']) * 52 + 14);
        case 'nos': return afn_poules_geo($b, $wc)['h'];
        case 'tableau': return afn_tableau_geo($b, $wc)['h'];
        case 'duo': return 63.2 + afn_duo_corps($b, $wc)['h'] + 1 + 74;
        case 'evt': return afn_evt($b, $wc)['h'];
        default: return 189.3;
    }
}
/* noms courts des clubs ; un club présent plusieurs fois (plusieurs de ses équipes) garde le numéro : DONZÈRE 1, DONZÈRE 2 */
function afn_noms_numerotes(array $noms, callable $court): array {
    $c = array_map(fn($n) => $court((string) $n), $noms);
    $fois = array_count_values(array_map('mb_strtolower', $c));
    foreach ($c as $i => $n)
        if ($fois[mb_strtolower($n)] > 1 && preg_match('/\s(\d{1,2})$/', trim((string) $noms[$i]), $x)) $c[$i] = $n . ' ' . $x[1];
    return $c;
}
function afn_noms_clubs(array $noms): array { return afn_noms_numerotes($noms, 'aff_nom_club'); }
/* « contre » puis une pastille par club : nombre de lignes, et position de chaque élément */
function afn_contre(array $b, float $max): array {
    $el = [['em', 'contre', afn_larg('contre', 18, 's700i')]];
    $noms = afn_noms_numerotes($b['adv'], fn($a) => aff_maj(aff_nom_court($a)));
    foreach ($b['adv'] as $k => $a) $el[] = ['adv', $a, 34 + 8 + min($max - 42, afn_larg($noms[$k], 24, '800')), $noms[$k]];
    $x = 0; $ligne = 0; $pos = [];
    foreach ($el as $e) {
        if ($x > 0 && $x + $e[2] > $max) { $x = 0; $ligne++; }
        $pos[] = [$e, $x, $ligne]; $x += $e[2] + 18;
    }
    return [$ligne + 1, $pos];
}
function afn_lignes_contre(array $b, float $max): int { return afn_contre($b, $max)[0]; }
function afn_duo_corps(array $b, float $wc): array {
    $mil = $b['res'] ? 104 * 2 + 5 + 8 : 22 + max(afn_larg(aff_maj($b['jour']), 22, '800', 22 * .14), afn_larg($b['heure'], 78, '900i')) + 22;
    $cote = ($wc - 52 - $mil - 20) / 2;
    $deux = false;
    foreach (['PIERRELATTE', $b['adv']] as $n) if (afn_larg($n, 44 * .6, '800') > $cote + 1 && str_contains(trim($n), ' ')) $deux = true;
    $hEq = 190 + 18 + ($deux ? 2 * .95 * 44 * .78 : 44);
    $hMil = $b['res'] ? 120 : 124;
    return ['h' => 34 + max($hEq, $hMil) + 26, 'mil' => $mil, 'cote' => $cote, 'hEq' => $hEq, 'hMil' => $hMil];
}
/* fond d'une carte (dégradé bleu nuit, fin liseré clair) */
function afn_carte($im, float $x, float $y, float $w, float $h, float $r, float $u, string $sens = 'h', float $op1 = .95, float $op2 = .93): void {
    // les deux opacités sont proches : une seule, la moyenne, avec un dégradé de couleur
    afn_boite($im, $x, $y, $w, $h, $r, [$sens, [[0, '#091436'], [1, '#050C22']]], ($op1 + $op2) / 2);
    afn_lisere($im, $x, $y, $w, $h, $r, max(1, $u), '#FFFFFF', .08);
}
/* catégorie dans le bloc rayé de gauche */
function afn_bloc_cat($im, array $A, array $b, float $x, float $y, float $h, float $u): void {
    afn_coller_raye($im, $x, $y, 150 * $u, $h, [14 * $u, 0, 0, 14 * $u], $u);
    afn_boite($im, $x + 147 * $u, $y, 3 * $u, $h, 0, $A['acc']);
    $w = 130 * $u;
    $pb = afn_fit(aff_maj($b['cat']), 34 * $u, '900', $w, .6);
    $ps = $b['niv'] !== '' ? afn_fit(aff_maj($b['niv']), 14 * $u, 's800', $w, .7, .1) : 0;
    $hc = $pb + ($ps ? 4 * $u + 1.1 * $ps : 0); $top = $y + ($h - $hc) / 2; $cx = $x + 75 * $u;
    afn_texte($im, aff_maj($b['cat']), $cx, $top + .9 * $pb, $pb, '900', aff_c($im, '#FFFFFF'), 'center');
    if ($ps) afn_texte($im, aff_maj($b['niv']), $cx, $top + $pb + 4 * $u + (1.1 * $ps - 1.424 * $ps) / 2 + 1.024 * $ps, $ps, 's800', aff_c($im, $A['accl']), 'center', $ps * .1);
}
/* une équipe dans une ligne : nom + blason ($cote 'g' : nom puis blason, aligné à droite) */
function afn_equipe($im, array $e, string $cote, float $x0, float $x1, float $cy, float $d, float $u, float $px, float $gap = 14): void {
    $max = ($x1 - $x0) - $d - $gap * $u;
    $hex = $e['club'] ? '#FFFFFF' : '#D3DDF4'; $p = $e['club'] ? '800' : '700'; $fit = $e['club'] ? .7 : .72;
    if ($cote === 'g') {
        afn_blason($im, $e['brut'], $e['club'], $x1 - $d / 2, $cy, $d, $u);
        afn_nom($im, $e['nom'], $x1 - $d - $gap * $u, $cy, $max, $px, $fit, $p, $hex, 'right');
    } else {
        afn_blason($im, $e['brut'], $e['club'], $x0 + $d / 2, $cy, $d, $u);
        afn_nom($im, $e['nom'], $x0 + $d + $gap * $u, $cy, $max, $px, $fit, $p, $hex, 'left');
    }
}
/* dessine un bloc ; ($x, $y) : coin haut gauche en pixels du calque, $u : pixels du calque par pixel du modèle, $wc : largeur (modèle) */
function afn_bloc($im, array $A, array $b, float $x, float $y, float $u, float $wc): void {
    $h = afn_hauteur($b, $wc) * $u; $w = $wc * $u;
    $fondRepere = afn_c($im, [8, 18, 48]);
    if ($b['t'] === 'vide') {
        afn_carte($im, $x, $y, $w, $h, 18 * $u, $u, 'v', .92, .92);
        $t = aff_maj($b['texte']); $pt = afn_fit($t, 54 * $u, '900i', $w - 60 * $u, .5);
        afn_texte($im, $t, $x + $w / 2, $y + 46 * $u + (54 * $u - $pt) / 2 + .9 * $pt, $pt, '900i', aff_c($im, '#FFFFFF'), 'center');
        afn_texte($im, $b['sous'] ?? 'Rendez-vous le week-end prochain !', $x + $w / 2, $y + 134.5 * $u, 22 * $u, 's700', aff_c($im, AFN_CIEL), 'center');
        return;
    }
    if ($b['t'] === 'duo') { afn_duo($im, $A, $b, $x, $y, $u, $wc); return; }
    if ($b['t'] === 'evt') { afn_evt($b, $wc, $im, $A, $x, $y, $u); return; }
    afn_carte($im, $x, $y, $w, $h, 14 * $u, $u);
    afn_bloc_cat($im, $A, $b, $x, $y, $h, $u);
    $cx0 = $x + 150 * $u;                                                // début de la partie droite
    if ($b['t'] === 'match') {
        $col = ($wc - 278) / 2 * $u; $cy = $y + $h / 2;
        $nous = ['nom' => 'PIERRELATTE', 'brut' => '', 'club' => true];
        $eux = ['nom' => aff_maj($b['adv']), 'brut' => $b['adv'], 'club' => false];
        [$g, $d] = $b['dom'] ? [$nous, $eux] : [$eux, $nous];
        afn_equipe($im, $g, 'g', $cx0 + 14 * $u, $cx0 + $col - 14 * $u, $cy, 54 * $u, $u, 30 * $u);
        $mx = $cx0 + $col;
        if ($b['res']) afn_cases($im, $A, $b['bp'], $b['bc'], $b['dom'], $mx + 5.5 * $u, $y + ($h - 62 * $u) / 2, 56 * $u, 62 * $u, 9 * $u, 5 * $u, 44 * $u, $u);
        else afn_heure($im, $A, $b['jour'], $b['heure'], $mx + 4 * $u, $y + 12 * $u, 120 * $u, $h - 24 * $u, 14 * $u, 40 * $u, $u, 10 * $u);
        afn_equipe($im, $d, 'd', $mx + 128 * $u + 14 * $u, $mx + 128 * $u + $col - 14 * $u, $cy, 54 * $u, $u, 30 * $u);
        return;
    }
    if ($b['t'] === 'plateau') {
        $col = ($wc - 278) * $u; $lx = $cx0 + 18 * $u;
        afn_lieu($im, $A, $b['lieu'], $lx, $y + 12 * $u, $col - 36 * $u, 17 * $u, $u, $fondRepere);
        if ($b['adv']) {
            [, $pos] = afn_contre($b, $wc - 278 - 36);
            foreach ($pos as [$e, $ex, $li]) {
                $ly = $y + (12 + 24.2 + 8 + $li * 42) * $u; $ex = $lx + $ex * $u;
                if ($e[0] === 'em') { afn_texte($im, 'contre', $ex, $ly + 22.6 * $u, 18 * $u, 's700i', aff_c($im, AFN_CIEL)); continue; }
                $n = $e[3];
                afn_blason($im, $e[1], false, $ex + 17 * $u, $ly + 17 * $u, 34 * $u, $u, $n); $max = ($e[2] - 42) * $u;
                $s = afn_fit($n, 24 * $u, '800', $max, 0);
                afn_texte($im, $n, $ex + 42 * $u, $ly + 17 * $u + .4 * $s, $s, '800', aff_c($im, '#E6ECFA'));
            }
        }
        afn_heure($im, $A, $b['jour'], $b['heure'], $cx0 + $col + 4 * $u, $y + 12 * $u, 112 * $u, $h - 24 * $u, 14 * $u, 40 * $u, $u, 10 * $u);
        return;
    }
    if ($b['t'] === 'nos') { afn_poules($im, $A, $b, $x, $y, $h, $u, $wc, $cx0, $fondRepere); return; }
    if ($b['t'] === 'tableau') { afn_tableau($im, $A, $b, $x, $y, $h, $u, $wc, $cx0, $fondRepere); return; }
    // plateau-res : une ligne par match du plateau (Pierrelatte · score · adversaire)
    $zw = ($wc - 150 - 36) * $u; $lx = $cx0 + 18 * $u;
    afn_lieu($im, $A, $b['lieu'], $lx, $y + 12 * $u, $zw, 17 * $u, $u, $fondRepere);
    $mil = 97 * $u; $cote = ($zw - $mil - 20 * $u) / 2;
    foreach ($b['res'] as $i => $r) {
        $ty = $y + (12 + 24.2 + 8 + $i * 52) * $u; $cy = $ty + 22 * $u;
        afn_equipe($im, ['nom' => 'PIERRELATTE', 'brut' => '', 'club' => true], 'g', $lx, $lx + $cote, $cy, 40 * $u, $u, 24 * $u);
        afn_cases($im, $A, $r['bp'], $r['bc'], true, $lx + $cote + 10 * $u + 4 * $u, $ty, 42 * $u, 44 * $u, 7 * $u, 5 * $u, 32 * $u, $u);
        $e = ['nom' => aff_maj($r['adv']), 'brut' => $r['adv'], 'club' => false];
        $rx = $lx + $cote + 20 * $u + $mil;
        $max = $cote - 40 * $u - 14 * $u;
        afn_blason($im, $r['adv'], false, $rx + 20 * $u, $cy, 40 * $u, $u);
        afn_nom($im, $e['nom'], $rx + 54 * $u, $cy, $max, 24 * $u, .66, '700', '#D3DDF4', 'left');
    }
}
/* plateau : une partie par équipe de Pierrelatte (« ÉQUIPE 1 » quand il y en a plusieurs), puis ses matchs :
   l'heure et l'adversaire (rencontres) ou le score et l'adversaire (résultats), sur deux colonnes quand la carte est large */
function afn_poules_geo(array $b, float $wc): array {
    $zw = $b['res'] ? $wc - 150 - 36 : $wc - 278 - 36;
    $max = max([1, ...array_map(fn($e) => count($e['m']), $b['eqs'])]);
    $cols = $zw >= 560 && $max >= 2 ? 2 : 1; $cw = ($zw - ($cols - 1) * 22) / $cols;
    $h = 12 + 24.2 + 6;
    foreach ($b['eqs'] as $k => $e) $h += ($k ? 10 : 0) + ($e['tete'] !== '' ? 30 : 0) + max(1, (int) ceil(count($e['m']) / $cols)) * 46;
    return ['h' => max(92, $h + 10), 'zw' => $zw, 'cols' => $cols, 'cw' => $cw];
}
function afn_poules($im, array $A, array $b, float $x, float $y, float $h, float $u, float $wc, float $cx0, int $fondRepere): void {
    $g = afn_poules_geo($b, $wc); $lx = $cx0 + 18 * $u; $zw = $g['zw'] * $u; $cw = $g['cw'] * $u;
    afn_lieu($im, $A, $b['lieu'], $lx, $y + 12 * $u, $zw, 17 * $u, $u, $fondRepere);
    $heures = !$b['res'] && array_filter(array_merge(...array_map(fn($e) => array_column($e['m'], 'h'), $b['eqs'])), 'strlen');
    $ty = $y + (12 + 24.2 + 6) * $u;
    foreach ($b['eqs'] as $k => $e) {
        if ($k) $ty += 10 * $u;
        if ($e['tete'] !== '') {
            $t = aff_maj($e['tete']); $pt = afn_fit($t, 15 * $u, 's800', $zw, .7, .1);
            $tw = afn_texte($im, $t, $lx, $ty + 20 * $u, $pt, 's800', aff_c($im, $A['accl']), 'left', $pt * .1);
            afn_boite($im, $lx + $tw + 12 * $u, $ty + 14 * $u, max(0, $zw - $tw - 12 * $u), max(1, $u), 0, $A['accl'], .28);
            $ty += 30 * $u;
        }
        if (!$e['m']) { afn_texte($im, 'Matchs à venir', $lx, $ty + 29 * $u, 18 * $u, 's700i', aff_c($im, AFN_CIEL)); $ty += 46 * $u; continue; }
        foreach ($e['m'] as $i => $p) {
            $c = $i % $g['cols']; $r = intdiv($i, $g['cols']);
            $rx = $lx + $c * ($cw + 22 * $u); $cy = $ty + $r * 46 * $u + 23 * $u; $nx = $rx;
            if ($b['res']) { afn_cases($im, $A, $p['bp'], $p['bc'], true, $rx, $cy - 19 * $u, 36 * $u, 38 * $u, 6 * $u, 4 * $u, 26 * $u, $u); $nx += 76 * $u + 14 * $u; }
            elseif ($heures) {
                afn_boite($im, $rx, $cy - 17 * $u, 86 * $u, 34 * $u, 9 * $u, ['v', $A['metal']]);
                $th = $p['h'] !== '' ? $p['h'] : '–'; $ph = afn_fit($th, 24 * $u, '900i', 76 * $u, .7);
                afn_texte($im, $th, $rx + 43 * $u, $cy + .36 * $ph, $ph, '900i', aff_c($im, '#0B1633'), 'center');
                $nx += 86 * $u + 14 * $u;
            }
            afn_blason($im, $p['adv'], false, $nx + 17 * $u, $cy, 34 * $u, $u);
            $max = $rx + $cw - ($nx + 44 * $u);
            afn_nom($im, aff_maj($p['adv']), $nx + 44 * $u, $cy, $max, 23 * $u, .66, '800', '#E6ECFA', 'left');
        }
        $ty += max(1, (int) ceil(count($e['m']) / $g['cols'])) * 46 * $u;
    }
    if (!$b['res']) afn_heure($im, $A, $b['jour'], $b['heure'], $cx0 + ($wc - 278) * $u + 4 * $u, $y + 12 * $u, 112 * $u, $h - 24 * $u, 14 * $u, 40 * $u, $u, 10 * $u);
}
/* poules : « POULE A », ses équipes (Pierrelatte en couleur), puis ses matchs « 10h00  PIERRELATTE – USVJ »
   (rencontres) ou « PIERRELATTE 3 1 USVJ » (résultats), sur deux colonnes quand la carte est large */
function afn_tableau_geo(array $b, float $wc): array {
    $heures = !$b['res'] && array_filter(array_merge(...array_map(fn($q) => array_column($q['m'], 'h'), $b['pls'])), 'strlen');
    $boite = !$b['res'] && !$heures;                                   // la case « SAMEDI 10h00 » seulement si les matchs n'ont pas d'heure
    $zw = $boite ? $wc - 278 - 36 : $wc - 150 - 36;
    $cols = $zw >= 640 ? 2 : 1; $cw = ($zw - ($cols - 1) * 26) / $cols;
    $h = 12 + 24.2 + 6;
    foreach ($b['pls'] as $k => $q) $h += ($k ? 12 : 0) + 30 + ($q['eqs'] ? afn_equipes_pos($q['eqs'], $zw)[0] * 40 + 4 : 0) + (int) ceil(count($q['m']) / $cols) * 44;
    return ['h' => max(92, $h + 10), 'zw' => $zw, 'cols' => $cols, 'cw' => $cw, 'boite' => $boite, 'heures' => (bool) $heures, 'logos' => $cw >= 430];
}
/* équipes d'une poule : blason + nom, à la suite, sur autant de lignes qu'il faut → [nombre de lignes, [[nom, x, ligne, largeur]]] */
function afn_equipes_pos(array $noms, float $max): array {
    $x = 0; $li = 0; $pos = [];
    foreach ($noms as $n) {
        $w = 32 + 8 + min($max - 40, afn_larg(aff_maj($n), 19, 's800', 19 * .03));
        if ($x > 0 && $x + $w > $max) { $x = 0; $li++; }
        $pos[] = [$n, $x, $li, $w]; $x += $w + 22;
    }
    return [$li + 1, $pos];
}
function afn_base_club(string $n): string { return trim(preg_replace('/\s+(\d{1,2}|[A-H])$/u', '', $n)); }   // « USVJ 2 » → « USVJ » (logo)
/* noms à la suite (« A · B · C ») sur une ligne, Pierrelatte en couleur ; réduits pour tenir dans $max */
function afn_noms_ligne($im, array $A, array $noms, float $x, float $y, float $max, float $px, float $u): void {
    $sep = '  ·  '; $t = implode($sep, $noms);
    $s = afn_fit($t, $px, 's800', $max, .55, .04);
    foreach ($noms as $i => $n) {
        if ($i) $x += afn_texte($im, $sep, $x, $y, $s, 's800', aff_c($im, '#7F8DB3'), 'left', $s * .04);
        $x += afn_texte($im, $n, $x, $y, $s, 's800', aff_c($im, afn_nous($n) ? $A['acc'] : '#D3DDF4'), 'left', $s * .04);
    }
}
function afn_tableau($im, array $A, array $b, float $x, float $y, float $h, float $u, float $wc, float $cx0, int $fondRepere): void {
    $g = afn_tableau_geo($b, $wc); $lx = $cx0 + 18 * $u; $zw = $g['zw'] * $u; $cw = $g['cw'] * $u;
    afn_lieu($im, $A, $b['lieu'], $lx, $y + 12 * $u, $zw, 17 * $u, $u, $fondRepere);
    $heures = $g['heures']; $lg = $g['logos'] ? 26 * $u + 6 * $u : 0; $pw = $g['cols'] > 1 ? 72 : 80;
    $ty = $y + (12 + 24.2 + 6) * $u;
    $coul = fn($n) => aff_c($im, afn_nous($n) ? $A['acc'] : '#E6ECFA');
    foreach ($b['pls'] as $k => $q) {
        if ($k) $ty += 12 * $u;
        $t = aff_maj($q['nom']); $pt = 16 * $u;
        $tw = afn_texte($im, $t, $lx, $ty + 21 * $u, $pt, 's800', aff_c($im, $A['accl']), 'left', $pt * .12);
        afn_boite($im, $lx + $tw + 12 * $u, $ty + 15 * $u, max(0, $zw - $tw - 12 * $u), max(1, $u), 0, $A['accl'], .28);
        $ty += 30 * $u;
        if ($q['eqs']) {                                                     // les équipes de la poule, avec leur logo
            [$nl, $pos] = afn_equipes_pos($q['eqs'], $g['zw']);
            foreach ($pos as [$n, $ex, $li, $w]) {
                $cx = $lx + $ex * $u + 16 * $u; $cy = $ty + $li * 40 * $u + 20 * $u;
                afn_blason($im, afn_base_club($n), afn_nous($n), $cx, $cy, 32 * $u, $u);
                $t = aff_maj($n); $ps = afn_fit($t, 19 * $u, 's800', ($w - 40) * $u, 0, .03);
                afn_texte($im, $t, $cx + 24 * $u, $cy + .36 * $ps, $ps, 's800', aff_c($im, afn_nous($n) ? $A['acc'] : '#E6ECFA'), 'left', $ps * .03);
            }
            $ty += $nl * 40 * $u + 4 * $u;
        }
        foreach ($q['m'] as $i => $p) {
            $c = $i % $g['cols']; $r = intdiv($i, $g['cols']);
            $rx = $lx + $c * ($cw + 26 * $u); $cy = $ty + $r * 44 * $u + 22 * $u; $nx = $rx; $fin = $rx + $cw;
            if ($b['res']) {
                $mid = $rx + $cw / 2; $demi = ($cw - 84 * $u) / 2 - 12 * $u - $lg;
                $na = aff_maj($p['a']); $nb = aff_maj($p['b']);
                $sa = afn_fit($na, 21 * $u, '800', $demi, .5); $sb = afn_fit($nb, 21 * $u, '800', $demi, .5);
                if ($lg) {
                    afn_blason($im, afn_base_club($p['a']), afn_nous($p['a']), $mid - 42 * $u - 12 * $u - 13 * $u, $cy, 26 * $u, $u);
                    afn_blason($im, afn_base_club($p['b']), afn_nous($p['b']), $mid + 42 * $u + 12 * $u + 13 * $u, $cy, 26 * $u, $u);
                }
                afn_texte($im, $na, $mid - 42 * $u - 12 * $u - $lg, $cy + .36 * $sa, $sa, '800', $coul($p['a']), 'right');
                if (afn_nous($p['b']) && !afn_nous($p['a'])) afn_cases($im, $A, $p['sb'], $p['sa'], false, $mid - 40 * $u, $cy - 18 * $u, 38 * $u, 36 * $u, 6 * $u, 4 * $u, 25 * $u, $u);
                elseif (afn_nous($p['a']) && !afn_nous($p['b'])) afn_cases($im, $A, $p['sa'], $p['sb'], true, $mid - 40 * $u, $cy - 18 * $u, 38 * $u, 36 * $u, 6 * $u, 4 * $u, 25 * $u, $u);
                else foreach ([$p['sa'], $p['sb']] as $j => $v) {                       // match sans Pierrelatte, ou entre deux équipes de Pierrelatte
                    $bx = $mid - 40 * $u + $j * 42 * $u;
                    afn_boite($im, $bx, $cy - 18 * $u, 38 * $u, 36 * $u, 6 * $u, ['v', [[0, AFN_ISSUE['N'][0]], [1, AFN_ISSUE['N'][1]]]]);
                    afn_texte($im, (string) $v, $bx + 19 * $u, $cy + 9 * $u, 25 * $u, '900', aff_c($im, '#FFFFFF'), 'center');
                }
                afn_texte($im, $nb, $mid + 42 * $u + 12 * $u + $lg, $cy + .36 * $sb, $sb, '800', $coul($p['b']), 'left');
                continue;
            }
            if ($heures) {
                afn_boite($im, $rx, $cy - 16 * $u, $pw * $u, 32 * $u, 9 * $u, ['v', $A['metal']]);
                $th = $p['h'] !== '' ? $p['h'] : '–'; $ph = afn_fit($th, 22 * $u, '900i', ($pw - 10) * $u, .7);
                afn_texte($im, $th, $rx + $pw / 2 * $u, $cy + .36 * $ph, $ph, '900i', aff_c($im, '#0B1633'), 'center');
                $nx += $pw * $u + 12 * $u;
            }
            $na = aff_maj($p['a']); $nb = aff_maj($p['b']); $tiret = 24 * $u; $place = $fin - $nx - $tiret - 2 * $lg;
            $s = min(21 * $u, afn_fit($na . $nb, 21 * $u, '800', $place, .45));
            $wa = afn_larg($na, $s, '800');
            if ($lg) afn_blason($im, afn_base_club($p['a']), afn_nous($p['a']), $nx + 13 * $u, $cy, 26 * $u, $u);
            afn_texte($im, $na, $nx + $lg, $cy + .36 * $s, $s, '800', $coul($p['a']));
            $xb = $nx + $lg + $wa + $tiret;
            afn_texte($im, '–', $nx + $lg + $wa + $tiret / 2, $cy + .36 * $s, $s, '800', aff_c($im, '#7F8DB3'), 'center');
            if ($lg) afn_blason($im, afn_base_club($p['b']), afn_nous($p['b']), $xb + 13 * $u, $cy, 26 * $u, $u);
            afn_texte($im, $nb, $xb + $lg, $cy + .36 * $s, $s, '800', $coul($p['b']));
        }
        $ty += (int) ceil(count($q['m']) / $g['cols']) * 44 * $u;
    }
    if ($g['boite']) afn_heure($im, $A, $b['jour'], $b['heure'], $cx0 + ($wc - 278) * $u + 4 * $u, $y + 12 * $u, 112 * $u, $h - 24 * $u, 14 * $u, 40 * $u, $u, 10 * $u);
}
/* un seul match : grande carte (catégorie en tête, les deux blasons, l'heure ou le score, la date et le stade) */
function afn_duo($im, array $A, array $b, float $x, float $y, float $u, float $wc): void {
    $w = $wc * $u; $c = afn_duo_corps($b, $wc); $h = (63.2 + $c['h'] + 1 + 74) * $u;
    afn_carte($im, $x, $y, $w, $h, 22 * $u, $u, 'v', .94, .94);
    afn_coller_raye($im, $x, $y, $w, 63.2 * $u, [22 * $u, 22 * $u, 0, 0], $u);
    afn_boite($im, $x, $y + 60.2 * $u, $w, 3 * $u, 0, $A['acc']);
    // en-tête : « U18 · DISTRICT 1 »
    $t1 = aff_maj($b['cat']); $t2 = $b['niv'] !== '' ? '· ' . aff_maj($b['niv']) : '';
    $pt = 26 * $u; $ls = $pt * .14;
    while ($pt > 14 * $u && afn_larg($t1, $pt, '900', $ls) + ($t2 ? 14 * $u + afn_larg($t2, $pt, '900', $ls) : 0) > $w - 32 * $u) { $pt -= $u; $ls = $pt * .14; }
    $tw = afn_larg($t1, $pt, '900', $ls) + ($t2 ? 14 * $u + afn_larg($t2, $pt, '900', $ls) : 0);
    $tx = $x + ($w - $tw) / 2; $by = $y + (63.2 * $u - 1.2 * $pt) / 2 + $pt - 1.5 * $u;
    $tx += afn_texte($im, $t1, $tx, $by, $pt, '900', aff_c($im, '#FFFFFF'), 'left', $ls) + 14 * $u;
    if ($t2) afn_texte($im, $t2, $tx, $by, $pt, '900', aff_c($im, $A['accl']), 'left', $ls);
    // corps : équipe qui reçoit à gauche
    $top = $y + (63.2 + 34) * $u; $hc = ($c['h'] - 60) * $u; $cy = $top + $hc / 2;
    $cote = $c['cote'] * $u; $mil = $c['mil'] * $u;
    $nous = ['nom' => 'PIERRELATTE', 'brut' => '', 'club' => true];
    $eux = ['nom' => aff_maj($b['adv']), 'brut' => $b['adv'], 'club' => false];
    foreach ([[$b['dom'] ? $nous : $eux, $x + 26 * $u], [$b['dom'] ? $eux : $nous, $x + $w - 26 * $u - $cote]] as [$e, $ex]) {
        $ey = $cy - $c['hEq'] * $u / 2;
        afn_blason($im, $e['brut'], $e['club'], $ex + $cote / 2, $ey + 95 * $u, 190 * $u, $u);
        afn_nom($im, $e['nom'], $ex + $cote / 2, $ey + (190 + 18) * $u + ($c['hEq'] - 208) * $u / 2, $cote, 44 * $u, .6, $e['club'] ? '800' : '700', $e['club'] ? '#FFFFFF' : '#D3DDF4', 'center');
    }
    $mx = $x + 26 * $u + $cote + 10 * $u;
    if ($b['res']) afn_cases($im, $A, $b['bp'], $b['bc'], $b['dom'], $mx + 4 * $u, $cy - 60 * $u, 104 * $u, 120 * $u, 14 * $u, 5 * $u, 96 * $u, $u);
    else afn_heure($im, $A, $b['jour'], $b['heure'], $mx, $cy - 62 * $u, $mil, 124 * $u, 22 * $u, 78 * $u, $u, 10 * $u);
    // pied : date et stade
    $py = $y + (63.2 + $c['h']) * $u;
    afn_boite($im, $x, $py, $w, max(1, $u), 0, '#FFFFFF', .10);
    $q = aff_maj($b['quand']); $l = aff_maj($b['lieu']);
    $pq = 30 * $u; $pl = 20 * $u; $place = $w - 40 * $u;
    while ($pl > 12 * $u && afn_larg($q, $pq, '800') + 22 * $u + 24 * $u + afn_larg($l, $pl, 's700', $pl * .06) > $place) { $pl -= .5 * $u; if ($pq > 22 * $u) $pq -= .5 * $u; }
    $wl = 24 * $u + afn_larg($l, $pl, 's700', $pl * .06); $tot = afn_larg($q, $pq, '800') + ($l !== '' ? 22 * $u + $wl : 0);
    $px0 = $x + ($w - $tot) / 2; $mid = $py + $u + (16 + 18) * $u;
    $px0 += afn_texte($im, $q, $px0, $mid + .4 * $pq, $pq, '800', aff_c($im, '#FFFFFF')) + 22 * $u;
    if ($l !== '') {
        afn_icone($im, 'lieu', $px0, $mid - 8.5 * $u, 17 * $u, aff_c($im, $A['acc']), afn_c($im, [7, 15, 40]));
        afn_texte($im, $l, $px0 + 24 * $u, $mid + (1.024 - .712) * $pl, $pl, 's700', aff_c($im, $A['accl']), 'left', $pl * .06);
    }
}

/* texte coupé en lignes (entre les mots) pour tenir dans $max */
function afn_paragraphe(string $t, float $px, string $p, float $max): array {
    $l = []; $cur = '';
    foreach (preg_split('/\s+/u', trim($t)) as $mot) {
        if ($cur !== '' && afn_larg("$cur $mot", $px, $p) > $max) { $l[] = $cur; $cur = $mot; }
        else $cur = $cur === '' ? $mot : "$cur $mot";
    }
    if ($cur !== '') $l[] = $cur;
    return $l;
}
/* carte d'un événement (stage, loto, tournoi…) : « Infos pratiques », la date et l'heure, le lieu, puis les informations ligne par ligne.
   Sans $im : calcule seulement la hauteur. */
function afn_evt(array $b, float $wc, $im = null, ?array $A = null, float $x = 0, float $y = 0, float $u = 1): array {
    $pad = 34; $zw = $wc - 2 * $pad; $h = 63.2 + 28;
    $hw = $b['heure'] !== '' ? 22 + max(afn_larg('HEURE', 18, '800', 18 * .14), afn_larg($b['heure'], 64, '900i')) + 22 : 0;
    $dl = []; $pd = 0;
    if ($b['date'] !== '') {
        $pd = afn_fit(aff_maj($b['date']), 56, '900i', $zw - ($hw ? $hw + 24 : 0), .6);
        $dl = ['y' => $h]; $h += 22 + 8 + .9 * 56 + 10;
    }
    $ly = null;
    if ($b['lieu'] !== '') { $ly = $h + 6; $h += 6 + 36; }
    $paras = [];
    if ($b['lignes']) {
        $sep = $h + 18; $h += 18 + 1 + 22;
        foreach ($b['lignes'] as $t) { $ls = afn_paragraphe($t, 32, '700', $zw - 34); $paras[] = [$h, $ls]; $h += count($ls) * 40 + 12; }
        $h -= 12;
    }
    $h += 30;
    if ($im === null) return ['h' => $h];
    $w = $wc * $u; $X = fn($v) => $x + $v * $u; $Y = fn($v) => $y + $v * $u;
    afn_carte($im, $x, $y, $w, $h * $u, 22 * $u, $u, 'v', .94, .94);
    afn_coller_raye($im, $x, $y, $w, 63.2 * $u, [22 * $u, 22 * $u, 0, 0], $u);
    afn_boite($im, $x, $Y(60.2), $w, 3 * $u, 0, $A['acc']);
    $pt = 26 * $u;
    afn_texte($im, 'INFOS PRATIQUES', $x + $w / 2, $Y(31.6) + .4 * $pt, $pt, '900', aff_c($im, '#FFFFFF'), 'center', $pt * .14);
    if ($dl) {
        afn_texte($im, 'RENDEZ-VOUS', $X($pad), $Y($dl['y'] + 16), 15 * $u, 's800', aff_c($im, $A['accl']), 'left', 15 * .2 * $u);
        afn_texte($im, aff_maj($b['date']), $X($pad), $Y($dl['y'] + 30 + .9 * 56 - (56 - $pd) / 2), $pd * $u, '900i', aff_c($im, '#FFFFFF'));
        if ($hw) afn_heure($im, $A, 'Heure', $b['heure'], $X($wc - $pad - $hw), $Y($dl['y'] - 4), $hw * $u, 96 * $u, 18 * $u, 64 * $u, $u, 10 * $u);
    }
    if ($ly !== null) afn_lieu($im, $A, $b['lieu'], $X($pad), $Y($ly), $zw * $u, 22 * $u, $u, afn_c($im, [8, 18, 46]));
    if ($paras) {
        afn_boite($im, $X($pad), $Y($sep), $zw * $u, max(1, $u), 0, '#FFFFFF', .12);
        foreach ($paras as [$py, $ls]) {
            aff_poly($im, [$X($pad + 7), $Y($py + 12), $X($pad + 14), $Y($py + 19), $X($pad + 7), $Y($py + 26), $X($pad), $Y($py + 19)], aff_c($im, $A['acc']));
            foreach ($ls as $i => $l) afn_texte($im, $l, $X($pad + 34), $Y($py + $i * 40 + 31), 32 * $u, '700', aff_c($im, '#E6ECFA'));
        }
    }
    return ['h' => $h];
}

/* ---------- la feuille ---------- */
/* fond, bandeau du haut, pastille domicile / extérieur */
function afn_debut(?string $lieu): array {
    $fmt = afn_format(); $F = AFN_FORMATS[$fmt]; $W = AFF_W; $H = $F['H'];
    $l = $lieu === 'ext' ? 'ext' : 'dom';
    $A = ['fmt' => $fmt, 'F' => $F, 'lieu' => $lieu, 'acc' => AFN_ACC[$l][0], 'accl' => AFN_ACC[$l][1], 'metal' => AFN_METAL[$l]];
    $im = imagecreatetruecolor($W, $H); imagealphablending($im, true);
    aff_rect($im, 0, 0, $W, $H, aff_c($im, '#030817'));
    if ($src = aff_image((string) afn_fond($l))) {                     // la part du fond qui revient à ce format
        [$cx, $cy, $r] = AFN_BALLON[$fmt]; $k = imagesx($src) / AFN_MAITRE['W'];
        $s = $r / (AFN_MAITRE['r'] * $k);                                 // pixels de l'affiche par pixel du fond
        $sw = $W / $s; $sh = $H / $s;
        $sx = max(0, min(imagesx($src) - $sw, AFN_MAITRE['bx'] * $k - $cx / $s));
        $sy = max(0, min(imagesy($src) - $sh, AFN_MAITRE['by'] * $k - $cy / $s));
        imagecopyresampled($im, $src, 0, 0, (int) round($sx), (int) round($sy), $W, $H, (int) round($sw), (int) round($sh));
        imagedestroy($src);
    }
    $A['im'] = $im;
    afn_voile($A);
    afn_tete($A);
    afn_devise($A);
    // bandeau : saison · site · compte Instagram
    $B = $F['barre']; $s = $B * .36; $sp = $s * .82;
    aff_rect($im, 0, 0, $W, $B, aff_c($im, '#050B1F'));
    aff_rect($im, 0, $B - 3, $W, 3, aff_c($im, $A['acc']));
    $an = (int) date('Y') - ((int) date('n') < 8 ? 1 : 0);
    $g = "SAISON $an-" . ($an + 1); $m = 'ASF-PIERRELATTE.FR'; $d = '@ASFP.OFFICIEL';
    $wg = afn_larg($g, $sp, '800', $sp * .18); $wm = afn_larg($m, $s, '800', $s * .14); $wd = afn_larg($d, $sp, '800', $sp * .18);
    $esp = ($W - 68 - $wg - $wm - $wd) / 2;
    afn_texte($im, $g, 34, $B / 2 + .4 * $sp, $sp, '800', aff_c($im, $A['accl']), 'left', $sp * .18);
    afn_texte($im, $m, 34 + $wg + $esp, $B / 2 + .4 * $s, $s, '800', aff_c($im, '#FFFFFF'), 'left', $s * .14);
    afn_texte($im, $d, $W - 34 - $wd, $B / 2 + .4 * $sp, $sp, '800', aff_c($im, $A['accl']), 'left', $sp * .18);
    // pastille « À DOMICILE » (maison) ou « À L'EXTÉRIEUR » (avion), dessinée deux fois plus grande puis réduite
    if ($lieu) {
        $lib = $lieu === 'dom' ? 'À DOMICILE' : "À L'EXTÉRIEUR";
        $pw = 16 + 28 + 10 + afn_larg($lib, 26, '900', 26 * .07) + 22; $px1 = $W - 46; $px0 = $px1 - $pw; $py = $F['tete'] + $F['bl'] * .5 - 26;
        afn_ombre($im, $px0 - 40, $py - 30, $pw + 80, 52 + 80, function ($m, $k, $blanc) use ($pw) {
            aff_coin($m, 40 / $k, (30 + 10) / $k, $pw / $k, 52 / $k, 26 / $k, $blanc);
        }, 26, .45);
        $z = AFN_SS; $c = afn_calque((int) ceil($pw * $z), 52 * $z);
        afn_boite($c, 0, 0, $pw * $z, 52 * $z, 26 * $z, ['v', $A['metal']]);
        afn_icone($c, $lieu === 'dom' ? 'maison' : 'avion', 16 * $z, 12 * $z, 28 * $z, aff_c($c, '#0B1633'));
        afn_texte($c, $lib, (16 + 28 + 10) * $z, 36.4 * $z, 26 * $z, '900', aff_c($c, '#0B1633'), 'left', 26 * .07 * $z);
        $r = afn_calque((int) ceil($pw), 52); imagealphablending($r, false);
        imagecopyresampled($r, $c, 0, 0, 0, 0, (int) ceil($pw), 52, imagesx($c), imagesy($c));
        imagealphablending($im, true); imagecopy($im, $r, (int) round($px0), (int) round($py), 0, 0, (int) ceil($pw), 52);
        imagedestroy($c); imagedestroy($r);
    }
    return $A;
}
/* voile sombre : haut et bas de l'affiche, et côté gauche (sous les titres) ; le ballon et la tribune restent éclairés */
function afn_voile(array $A): void {
    $im = $A['im']; $F = $A['F']; $W = AFF_W; $H = $F['H']; $z0 = $F['zone'][0];
    $v = [[0, .9], [$F['tete'] + $F['bl'] + 20, .35], [$F['titre'] + 60, .1], [$z0 - 160, 0], [$z0 - 10, .72], [$z0 + 160, .86], [$H, .9]];
    for ($y = 0; $y < $H; $y++) {
        for ($i = 0; $i < count($v) - 2 && $y > $v[$i + 1][0]; $i++);
        [$y0, $o0] = $v[$i]; [$y1, $o1] = $v[$i + 1];
        $o = $o0 + ($o1 - $o0) * max(0, min(1, ($y - $y0) / max(1, $y1 - $y0)));
        if ($o > .003) imageline($im, 0, $y, $W - 1, $y, afn_c($im, [3, 8, 23], $o));
    }
    for ($x = 0; $x < $W * .64; $x++) {
        $t = $x / $W; $o = $t < .44 ? .78 - (.78 - .4) * $t / .44 : .4 * (1 - ($t - .44) / .20);
        imageline($im, $x, 0, $x, $H - 1, afn_c($im, [3, 8, 23], $o));
    }
}
/* en-tête : le blason et « 1923 » en lettres évidées dorées (argentées à l'extérieur) */
function afn_tete(array $A): void {
    $im = $A['im']; $F = $A['F']; $bl = $F['bl']; $x = 46; $y = $F['tete'];
    afn_ombre($im, $x - 40, $y - 30, $bl + 80, $bl + 80, function ($m, $k, $blanc) use ($bl) {
        imagefilledellipse($m, (int) round((40 + $bl / 2) / $k), (int) round((30 + 8 + $bl / 2) / $k), (int) round($bl * .94 / $k), (int) round($bl * .94 / $k), $blanc);
    }, 20, .6);
    aff_blason_club($im, $x, $y, $bl);
    $an = ['fb' => 118, 'story' => 110, 'insta' => 84][$A['fmt']];          // taille de « 1923 »
    afn_texte_evide($im, '1923', $x + $bl + 18, $y + $bl / 2 + .4 * $an, $an, '900i', $A['accl'], .85, -.01 * $an);
}
/* texte évidé : seul un fin contour est tracé (dessiné deux fois plus grand puis réduit) */
function afn_texte_evide($im, string $t, float $x, float $y, float $px, string $p, string $hex, float $op, float $ls = 0): void {
    $f = afn_police($p); if ($f === '') return;
    $z = AFN_SS; $w = (int) ceil(afn_larg($t, $px, $p, $ls) + $px * .5); $h = (int) ceil($px * 1.4);
    $ox = (int) floor($x - $px * .15); $oy = (int) floor($y - $px * 1.1);
    $l = afn_calque($w * $z, $h * $z); $c = afn_c($l, afn_rgb($hex), 1);
    $bx = ($x - $ox) * $z; $by = ($y - $oy) * $z;
    for ($i = 0; $i < 16; $i++) { $a = 2 * M_PI * $i / 16; afn_texte($l, $t, $bx + 4 * cos($a), $by + 4 * sin($a), $px * $z, $p, $c, 'left', $ls * $z); }
    imagealphablending($l, false);
    afn_texte($l, $t, $bx, $by, $px * $z, $p, imagecolorallocatealpha($l, 0, 0, 0, 127), 'left', $ls * $z);
    $r = afn_calque($w, $h); imagealphablending($r, false);
    imagecopyresampled($r, $l, 0, 0, 0, 0, $w, $h, $w * $z, $h * $z);
    imagedestroy($l);
    if ($op < 1) {                                                     // opacité du contour
        for ($j = 0; $j < $h; $j++) for ($i = 0; $i < $w; $i++) {
            $c = imagecolorat($r, $i, $j); $a = ($c >> 24) & 127;
            if ($a < 127) imagesetpixel($r, $i, $j, ($c & 0xFFFFFF) | ((127 - (int) round((127 - $a) * $op)) << 24));
        }
    }
    imagealphablending($im, true);
    imagecopy($im, $r, $ox, $oy, 0, 0, $w, $h);
    imagedestroy($r);
}
/* devise du club au-dessus des partenaires : « Plaisir · Respect · Effort · Progrès » et le nom du club en écriture manuscrite */
function afn_devise(array $A): void {
    $im = $A['im']; $W = AFF_W;
    [$s0, $s1] = ['fb' => [1822, 1940], 'story' => [1598, 1706], 'insta' => [1106, 1150]][$A['fmt']]; $sh = $s1 - $s0;
    $val = 'PLAISIR · RESPECT · EFFORT · PROGRÈS'; $nom = "Atom'Sports Football Pierrelatte";
    $kaushan = basename(afn_police('script')) === AFN_POLICES['script'];
    if ($A['fmt'] === 'insta') {                                       // sur une seule ligne
        $pv = 13; $ps = $kaushan ? 30 : 28; $mid = ($s0 + $s1) / 2;
        $wv = afn_larg($val, $pv, 's800', $pv * .32); $ws = afn_larg($nom, $ps, 'script'); $x = ($W - $wv - 26 - $ws) / 2;
        afn_texte($im, $val, $x, $mid + .312 * $pv, $pv, 's800', aff_c($im, $A['accl']), 'left', $pv * .32);
        afn_ombre_texte($im, $nom, $x + $wv + 26, $mid + 10.75, $ps, 'script', 4, 18, .7);
        afn_texte($im, $nom, $x + $wv + 26, $mid + 10.75, $ps, 'script', aff_c($im, '#FFFFFF'));
        return;
    }
    $pv = $sh * .15; $ps = $sh * .42; $hv = 1.424 * $pv; $hs = 1.05 * $ps;
    $top = $s0 + ($sh - $hv - 2 - $hs) / 2;
    afn_texte($im, $val, $W / 2, $top + 1.024 * $pv, $pv, 's800', aff_c($im, $A['accl']), 'center', $pv * .32);
    $by = $top + $hv + 2 + ($hs - 1.451 * $ps) / 2 + 1.084 * $ps;
    $wn = afn_larg($nom, $ps, 'script');
    afn_ombre_texte($im, $nom, $W / 2 - $wn / 2, $by, $ps, 'script', 4, 18, .7);
    afn_texte($im, $nom, $W / 2, $by, $ps, 'script', aff_c($im, '#FFFFFF'), 'center');
}
/* sur-titre, grand titre, sous-titre « métal », date */
function afn_titres(array $A, string $sur, string $t1, string $t2, string $date, bool $deuxLignes = false): void {
    $im = $A['im']; $F = $A['F']; $x = 46;
    [$bx, , $br] = AFN_BALLON[$A['fmt']]; $max = min(640, $bx - $br - $x - 60);   // les titres s'arrêtent avant le ballon
    $fs = $F['t2'] * .26; $y = $F['titre'];
    $sur = aff_maj($sur);
    afn_boite($im, $x, $y + (1.424 * $fs - 3) / 2, 40, 3, 0, ['v', $A['metal']]);
    afn_texte($im, $sur, $x + 54, $y + 1.024 * $fs, $fs, 's800', aff_c($im, $A['accl']), 'left', $fs * .2);
    $y += 1.424 * $fs + 12;
    $t1 = aff_maj($t1); $s1 = afn_fit($t1, $F['t1'], '900i', $max, .55);
    $lignes = [$t1];
    if ($deuxLignes && $s1 < $F['t1'] * .7 && str_contains($t1, ' ')) {          // titre long (stage, tournoi…) : deux lignes équilibrées
        $mots = explode(' ', $t1); $ecart = INF;
        for ($i = 1; $i < count($mots); $i++) {
            $a = implode(' ', array_slice($mots, 0, $i)); $b = implode(' ', array_slice($mots, $i));
            $e = max(afn_larg($a, 100, '900i'), afn_larg($b, 100, '900i'));
            if ($e < $ecart) { $ecart = $e; $lignes = [$a, $b]; }
        }
        $s1 = min(afn_fit($lignes[0], $F['t1'] * .8, '900i', $max, .4), afn_fit($lignes[1], $F['t1'] * .8, '900i', $max, .4));
    }
    foreach ($lignes as $l) {
        afn_ombre_texte($im, $l, $x, $y + .83 * $s1, $s1, '900i', 6, 30, .55);
        afn_texte($im, $l, $x, $y + .83 * $s1, $s1, '900i', aff_c($im, '#FFFFFF'));
        $y += .86 * $s1;
    }
    $y += 4;
    $t2 = aff_maj($t2); $s2 = afn_fit($t2, $F['t2'], '900i', $max, .55);
    if ($t2 !== '') {
        afn_ombre_texte($im, $t2, $x, $y + .875 * $s2, $s2, '900i', 4, 18, .5);
        afn_texte_degrade($im, $t2, $x, $y + .875 * $s2, $s2, '900i', $A['metal'], $y, $y + .95 * $s2);
    }
    if ($date !== '') {
        $fd = afn_fit($date, $F['t2'] * .36, 's700', AFF_W - 2 * $x, .6); $yd = $F['date'] + 1.024 * $F['t2'] * .36;
        afn_ombre_texte($im, $date, $x, $yd, $fd, 's700', 2, 12, .9);
        afn_texte($im, $date, $x, $yd, $fd, 's700', aff_c($im, '#FFFFFF'));
    }
}
/* la liste : taille calculée pour remplir la zone sans déborder, puis réduite d'un coup (bords lisses) */
function afn_zone(array $A, array $blocs, float $zoomMax): void {
    $im = $A['im']; [$z0, $z1] = $A['F']['zone']; $zh = $z1 - $z0; $zw = AFF_W - 60; $n = count($blocs);
    if (!$n) return;
    $k = $zoomMax;
    while (true) {
        $wc = $zw / $k; $hs = array_map(fn($b) => afn_hauteur($b, $wc), $blocs);
        $tot = array_sum($hs) + 12 * ($n - 1);
        if ($tot * $k <= $zh || $k <= .3) break;
        $k -= .01;
    }
    if ($tot * $k > $zh + 2 || $k < .38) $GLOBALS['afn_deborde'] = true;          // illisible ou plus haut que la zone
    $gap = 12;
    if ($n > 1 && $zh - $tot * $k > 0) $gap = min(30, 12 + ($zh - $tot * $k) / $k / ($n - 1));
    $total = (array_sum($hs) + $gap * ($n - 1)) * $k;
    $y = $z0 + ($zh - $total) / 2;
    // calque deux fois plus grand couvrant la zone (avec de la marge pour les ombres)
    $z = AFN_SS; $m = 70; $ly0 = (int) floor($y - $m); $lh = (int) ceil($total + 2 * $m);
    $L = afn_calque(AFF_W * $z, $lh * $z);
    $u = $k * $z; $yy = ($y - $ly0) * $z;
    $pos = [];
    foreach ($blocs as $i => $b) { $pos[] = $yy; $yy += ($hs[$i] + $gap) * $u; }
    // ombres des cartes : 0 12px 30px noir 40 % (50 % sous la grande carte)
    $duo = $blocs[0]['t'] === 'duo';
    afn_ombre($L, 0, 0, AFF_W * $z, $lh * $z, function ($mk, $kk, $blanc) use ($pos, $hs, $u, $z, $duo) {
        foreach ($pos as $i => $py) aff_coin($mk, 30 * $z / $kk, ($py + ($duo ? 24 : 12) * $u) / $kk, (AFF_W - 60) * $z / $kk, $hs[$i] * $u / $kk, 14 * $u / $kk, $blanc);
    }, ($duo ? 60 : 30) * $u, $duo ? .5 : .4);
    foreach ($blocs as $i => $b) afn_bloc($L, $A, $b, 30 * $z, $pos[$i], $u, $zw / $k);
    $R = afn_calque(AFF_W, $lh); imagealphablending($R, false);
    imagecopyresampled($R, $L, 0, 0, 0, 0, AFF_W, $lh, AFF_W * $z, $lh * $z);
    imagedestroy($L);
    imagealphablending($im, true);
    imagecopy($im, $R, 0, $ly0, 0, 0, AFF_W, $lh);
    imagedestroy($R);
}
/* bas de l'affiche : les partenaires (moitié domicile / moitié extérieur), ou le bandeau du club */
function afn_partenaires(array $A, bool $avec): void {
    $im = $A['im']; $F = $A['F']; $W = AFF_W; $H = $F['H']; $P = $F['part'];
    $logos = [];
    if ($avec) foreach (aff_sponsors() as $id) {
        foreach (['jpg', 'png', 'webp'] as $ext) if (is_file($f = dirname(__DIR__) . "/img/partenaires/$id.$ext")) { if ($src = aff_image($f)) $logos[] = $src; break; }
    }
    aff_rect($im, 0, $P - 5, $W, 5, aff_c($im, $A['acc']));
    if (!$logos) {
        aff_rect($im, 0, $P, $W, $H - $P, aff_c($im, '#050B1F'));
        $h = $H - $P;
        afn_texte($im, 'ASF-PIERRELATTE.FR', $W / 2, $P + $h * .48, $h * .28, '900', aff_c($im, '#FFFFFF'), 'center', $h * .28 * .06);
        afn_texte($im, "ATOM'SPORTS FOOTBALL PIERRELATTE · DEPUIS 1923", $W / 2, $P + $h * .72, $h * .12, 's800', aff_c($im, $A['accl']), 'center', $h * .12 * .2);
        return;
    }
    aff_rect($im, 0, $P, $W, $H - $P, aff_c($im, '#FFFFFF'));
    $ph = $A['fmt'] === 'insta' ? 14 : 18; $hh = 1.2 * $ph;
    $L = $F['logo']; $place = $H - $P - 20;
    // rangées de logos (hauteur fixe, largeur selon le logo, 2,4 fois la hauteur au plus), réduites si elles ne tiennent pas
    while (true) {
        $rangs = [[]]; $x = 0;
        foreach ($logos as $src) {
            $lw = min($L * 2.4, $L * imagesx($src) / max(1, imagesy($src)));
            if ($x > 0 && $x + $lw > $W - 40) { $rangs[] = []; $x = 0; }
            $rangs[count($rangs) - 1][] = [$src, $lw]; $x += $lw + 22;
        }
        $tot = $hh + 10 + count($rangs) * $L + (count($rangs) - 1) * 10;
        if ($tot <= $place || $L <= 20) break;
        $L -= 2;
    }
    $y = $P + 10 + ($place - $tot) / 2;
    $nuit = aff_c($im, '#0B1633');
    $wt = afn_larg('NOS PARTENAIRES', $ph, '900', $ph * .24);
    afn_texte($im, 'NOS PARTENAIRES', $W / 2 - $wt / 2, $y + $ph, $ph, '900', $nuit, 'left', $ph * .24);
    foreach ([-1, 1] as $sens) aff_rect($im, $sens < 0 ? $W / 2 - $wt / 2 - 12 - 46 : $W / 2 + $wt / 2 + 12, $y + $hh / 2 - 1, 46, 2, aff_c($im, '#0B1633', .35));
    $y += $hh + 10;
    foreach ($rangs as $rang) {
        $rw = array_sum(array_column($rang, 1)) + 22 * (count($rang) - 1); $x = ($W - $rw) / 2;
        foreach ($rang as [$src, $lw]) { aff_contenir($im, $src, $x + $lw / 2, $y + $L / 2, $lw, $L); $x += $lw + 22; }
        $y += $L + 10;
    }
    foreach ($logos as $src) imagedestroy($src);
}

/* ---------- données des matchs → blocs ---------- */
function afn_cat(array $m, bool $fal): array {
    if ($fal) {
        [$a, $b] = aff_cat_lignes($m);
        if ((int) ($m['nb_equipes'] ?? 0) > 1) $b = !empty($m['numeros']) ? 'ÉQUIPES ' . afn_numeros($m['numeros'], ' · ') : (int) $m['nb_equipes'] . ' ÉQUIPES';   // onglet Affiches matchs
        return [preg_replace('/^(U\s?\d{1,2})-(U\s?\d{1,2})$/u', '$1 · $2', $a), $b];
    }
    $sous = (string) ($m['sous'] ?? aff_sous_etiquette((string) ($m['comp'] ?? '')));
    return [aff_maj((string) ($m['equipe'] ?? '')), $sous !== '' ? $sous : aff_maj((string) ($m['comp'] ?? ''))];
}
function afn_jour(string $d): string { return ucfirst(AFF_JOURS[(int) date('w', strtotime($d . ' 12:00'))]); }
function afn_quand(string $d): string { $t = strtotime($d . ' 12:00'); $j = (int) date('j', $t); return ucfirst(AFF_JOURS[(int) date('w', $t)]) . ' ' . ($j === 1 ? '1er' : $j) . ' ' . AFF_MOIS[(int) date('n', $t) - 1]; }
/* « Samedi 3 et dimanche 4 octobre », « Vendredi 2, samedi 3 et dimanche 4 octobre », « Samedi 31 octobre et dimanche 1er novembre » */
function afn_plusieurs_weekends(array $dates): bool {
    return $dates && (strtotime(max($dates) . ' 12:00') - strtotime(min($dates) . ' 12:00')) > 2.5 * 86400;
}
function afn_date_weekend(array $plan, string $samedi): string {
    $jours = array_column($plan, 'date');
    if (!$jours) $jours = array_slice(aff_weekend($samedi), 1);
    if (afn_plusieurs_weekends($jours)) {                                          // matchs sur plusieurs week-ends : « Du 30 septembre au 10 octobre »
        $d1 = strtotime(min($jours) . ' 12:00'); $d2 = strtotime(max($jours) . ' 12:00'); $j1 = (int) date('j', $d1); $j2 = (int) date('j', $d2);
        return 'Du ' . ($j1 === 1 ? '1er' : $j1) . (date('n', $d1) !== date('n', $d2) ? ' ' . AFF_MOIS[(int) date('n', $d1) - 1] : '') . ' au ' . ($j2 === 1 ? '1er' : $j2) . ' ' . AFF_MOIS[(int) date('n', $d2) - 1];
    }
    $mois = fn($d) => (int) date('n', strtotime($d . ' 12:00'));
    $parts = [];
    foreach ($jours as $i => $d) {
        $t = strtotime($d . ' 12:00'); $j = (int) date('j', $t);
        $txt = AFF_JOURS[(int) date('w', $t)] . ' ' . ($j === 1 ? '1er' : $j);
        if ($i === count($jours) - 1 || $mois($d) !== $mois($jours[$i + 1])) $txt .= ' ' . AFF_MOIS[$mois($d) - 1];
        $parts[] = $txt;
    }
    $der = array_pop($parts);
    return ucfirst($parts ? implode(', ', $parts) . ' et ' . $der : $der);
}
function afn_stade(array $m): string {
    if (!empty($m['dom'])) return 'Stade Gustave Jaume, Pierrelatte';
    [$stade, $ville] = aff_lieu_court($m);
    $t = trim($stade . ($ville !== '' && $ville !== $stade ? ', ' . $ville : ''), ' ,');
    return $t !== '' ? $t : aff_lieu($m);
}
function afn_blocs(array $liste, bool $resultats, bool $fal): array {
    $out = []; $multi = afn_plusieurs_weekends(array_column($liste, 'date'));
    $jour = fn($d) => $multi ? mb_substr(afn_jour($d), 0, 3) . '. ' . date('d/m', strtotime($d . ' 12:00')) : afn_jour($d);   // « Sam. 10/10 »
    foreach ($liste as $m) {
        [$cat, $niv] = afn_cat($m, $fal);
        $b = ['cat' => $cat, 'niv' => $niv, 'dom' => !empty($m['dom']), 'adv' => (string) ($m['adv'] ?? ''), 'jour' => $jour($m['date']),
              'heure' => aff_hfr((string) ($m['heure'] ?? '')), 'quand' => afn_quand($m['date']), 'lieu' => afn_stade($m)];
        if ($fal) {
            $club = aff_nom_club((string) ($m['adv'] ?? ''));
            [, $ville] = aff_lieu_court($m);
            $quoi = preg_match('/brassage/i', (string) ($m['comp'] ?? '')) ? 'Brassage' : 'Plateau';
            $b['lieu'] = !empty($m['dom']) ? 'À domicile · Stade Gustave Jaume, Pierrelatte'
                : ($ville !== '' ? "$quoi à " . mb_convert_case(mb_strtolower($ville), MB_CASE_TITLE) . ($club !== '' ? " · $club" : '') : "$quoi chez $club");
            if ($resultats) { $b['t'] = 'plateau-res'; $b['res'] = array_slice(aff_scores_brassage($m), 0, 6); }
            else { $b['t'] = 'plateau'; $b['adv'] = array_values(array_filter(array_map('strval', $m['adversaires'] ?? []), 'strlen')); }
            if ($eqs = afn_nos_blocs($m, $resultats)) { $b['t'] = 'nos'; $b['res'] = $resultats; $b['eqs'] = $eqs; }
            if ($pls = afn_tableau_blocs($m, $resultats)) { $b['t'] = 'tableau'; $b['res'] = $resultats; $b['pls'] = $pls; }
        } else {
            $b['t'] = 'match'; $b['res'] = $resultats; $b['bp'] = $m['bp'] ?? null; $b['bc'] = $m['bc'] ?? null;
        }
        $out[] = $b;
    }
    return $out;
}
/* plateau : les matchs de chacune de nos équipes (en-tête « Équipe 1 » s'il y en a plusieurs) ; [] sans matchs */
function afn_nos_blocs(array $m, bool $resultats): array {
    $q = is_array($m['nos'] ?? null) ? $m['nos'] : [];
    $plus = count($q) > 1; $out = [];
    foreach ($q as $k => $e) {
        $ms = $resultats ? array_values(array_filter($e['matchs'], fn($p) => $p['bp'] !== null && $p['bc'] !== null)) : $e['matchs'];
        if (!$ms) continue;
        $out[] = ['tete' => $plus ? 'Équipe ' . ($e['n'] ?: $k + 1) : '', 'm' => array_map(fn($p) => ['h' => $p['heure'] !== '' ? aff_hfr($p['heure']) : '', 'adv' => $p['adv'], 'bp' => $p['bp'], 'bc' => $p['bc']], array_slice($ms, 0, 8))];
    }
    return $out;
}
/* poules : nom, équipes et matchs de chaque poule (résultats : les matchs joués) ; [] sans poules */
function afn_tableau_blocs(array $m, bool $resultats): array {
    $out = [];
    foreach ($m['tableau'] ?? [] as $q) {
        $ms = $resultats ? array_values(array_filter($q['matchs'], fn($p) => $p['sa'] !== null && $p['sb'] !== null)) : $q['matchs'];
        if ($resultats && !$ms) continue;
        $out[] = ['nom' => 'Poule ' . $q['nom'], 'eqs' => $q['equipes'], 'm' => array_map(fn($p) => ['h' => $p['heure'] !== '' ? aff_hfr($p['heure']) : ''] + $p, $ms)];
    }
    return $out;
}
/* message : les matchs de chaque équipe (plateau), ou chaque poule avec ses équipes et ses matchs */
function afn_msg_poules(array $m, string $eq, string $ou, string $h): array {
    $txt = [(!empty($m['dom']) ? '🏠 ' : '✈️ ') . "$eq · " . mb_strtolower((string) ($m['comp'] ?? 'plateau')) . " $ou" . ($h ? " à $h" : '')];
    if (!empty($m['tableau'])) {
        foreach ($m['tableau'] as $q) {
            $txt[] = '   Poule ' . $q['nom'] . ($q['equipes'] ? ' : ' . implode(', ', array_map('afn_joli', $q['equipes'])) : '');
            foreach ($q['matchs'] as $p) $txt[] = '      ' . ($p['heure'] !== '' ? aff_hfr($p['heure']) . ' ' : '• ') . afn_joli($p['a']) . ' – ' . afn_joli($p['b']);
        }
        return $txt;
    }
    $plus = count($m['nos']) > 1;
    foreach ($m['nos'] as $k => $e) {
        if (!$e['matchs']) continue;
        $l = array_map(fn($p) => ($p['heure'] !== '' ? aff_hfr($p['heure']) . ' ' : '') . afn_joli($p['adv']), $e['matchs']);
        $txt[] = '   • ' . ($plus ? 'Équipe ' . ($e['n'] ?: $k + 1) . ' : ' : 'Contre ') . implode(', ', $l);
    }
    return $txt;
}
function afn_msg_poules_res(array $m): array {
    $out = []; $em = fn($n, $e) => $n > $e ? '✅' : ($n < $e ? '❌' : '🤝');
    if (!empty($m['tableau'])) {
        foreach ($m['tableau'] as $q) {
            $ms = array_values(array_filter($q['matchs'], fn($p) => $p['sa'] !== null && $p['sb'] !== null));
            if (!$ms) continue;
            $out[] = '   Poule ' . $q['nom'];
            foreach ($ms as $p) {
                $i = afn_nous($p['a']) && !afn_nous($p['b']) ? $em($p['sa'], $p['sb']) : (afn_nous($p['b']) && !afn_nous($p['a']) ? $em($p['sb'], $p['sa']) : '⚽');
                $out[] = "   $i " . afn_joli($p['a']) . ' ' . $p['sa'] . '-' . $p['sb'] . ' ' . afn_joli($p['b']);
            }
        }
        return $out;
    }
    $plus = count($m['nos']) > 1;
    foreach ($m['nos'] as $k => $e) {
        $ms = array_values(array_filter($e['matchs'], fn($p) => $p['bp'] !== null && $p['bc'] !== null));
        if (!$ms) continue;
        if ($plus) $out[] = '   Équipe ' . ($e['n'] ?: $k + 1);
        foreach ($ms as $p) $out[] = '   ' . $em($p['bp'], $p['bc']) . ' ' . $p['bp'] . '-' . $p['bc'] . ' contre ' . afn_joli($p['adv']);
    }
    return $out;
}
function afn_zoom_max(int $n): float { return [1 => 1.4, 2 => 1.4, 3 => 1.28, 4 => 1.18][$n] ?? 1.12; }

/* jour de match ou résultat d'un match (story du jour de match, aperçu « match » / « score ») ; null si le décor manque */
function afn_match(array $m, array $opts = []) {
    $dom = !empty($m['dom']); $lieu = $dom ? 'dom' : 'ext';
    if (!afn_actif($lieu)) return null;
    $score = !empty($opts['score']) && aff_joue($m); $fal = aff_fal($m);
    $m['sous'] = aff_sous_etiquette((string) ($m['comp'] ?? ''));
    $b = afn_blocs([$m], $score, $fal)[0];
    if (!$fal) $b['t'] = 'duo';
    $perso = trim((string) ($opts['titre'] ?? ''));
    $t1 = $perso !== '' ? $perso : ($score ? 'Résultat' : 'Jour de match');
    $t2 = $score ? ['V' => 'Victoire !', 'N' => 'Match nul', 'D' => 'Défaite'][aff_issue($m)] : (string) ($m['equipe'] ?? '');
    $A = afn_debut($lieu);
    afn_titres($A, aff_vet($m) ? 'Championnat vétérans' : ($fal ? 'École de foot' : "Atom'Sports Football Pierrelatte"), $t1, $t2,
        afn_quand($m['date']) . (!$score && ($m['heure'] ?? '') !== '' ? ' · ' . aff_hfr($m['heure']) : ''));
    afn_zone($A, [$b], 1.15);
    afn_partenaires($A, (bool) ($opts['sponsors'] ?? true));
    return $A['im'];
}
/* événement du club (stage, loto, tournoi…) : titre, sous-titre, date, heure, lieu et informations ; null si le décor manque */
function afn_evenement(array $o) {
    if (!afn_actif('dom')) return null;
    $titre = trim(afn_sans_emoji((string) ($o['titre'] ?? ''))); $sous = trim(afn_sans_emoji((string) ($o['sous'] ?? '')));
    $o['lieu'] = afn_sans_emoji((string) ($o['lieu'] ?? '')); $o['texte'] = afn_sans_emoji((string) ($o['texte'] ?? ''));
    $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($o['date'] ?? '')) ? afn_quand($o['date']) : '';
    $heure = trim((string) ($o['heure'] ?? '')); $heure = $heure !== '' ? aff_hfr($heure) : '';
    $lignes = array_slice(array_values(array_filter(array_map('trim', preg_split('/\r?\n/', (string) ($o['texte'] ?? ''))))), 0, 8);
    $A = afn_debut(null);
    afn_titres($A, "Atom'Sports Football Pierrelatte", $titre !== '' ? $titre : 'Événement du club', $sous, '', true);
    $b = ['t' => 'evt', 'date' => $date, 'heure' => $heure, 'lieu' => trim((string) ($o['lieu'] ?? '')), 'lignes' => $lignes];
    if ($date === '' && $b['lieu'] === '' && !$lignes) $b = ['t' => 'vide', 'texte' => 'Infos à venir', 'sous' => 'Toutes les informations très bientôt'];
    afn_zone($A, [$b], 1.15);
    afn_partenaires($A, (bool) ($o['sponsors'] ?? true));
    return $A['im'];
}

/* affiche « résultats » ou « rencontres » du week-end (championnats, foot animation, vétérans) ; null si le décor manque */
function afn_liste(array $matchs, string $samedi, bool $resultats, array $opts) {
    $lieu = in_array($opts['lieu'] ?? '', ['dom', 'ext'], true) ? $opts['lieu'] : null;
    if (!afn_actif($lieu)) return null;
    $plan = aff_plan_weekend($matchs, $samedi, $resultats, $lieu);
    $liste = afn_liste_lieu($matchs, $samedi, $resultats, $lieu);
    if (is_array($opts['indices'] ?? null)) $liste = array_values(array_intersect_key($liste, array_flip(array_map('intval', $opts['indices']))));   // une page de l'annonce
    $suffixe = trim((string) ($opts['suffixe'] ?? ''));
    $fal = !empty($GLOBALS['aff_fal']); $vet = !empty($GLOBALS['aff_vet']);
    $quoi = $resultats ? 'Résultats' : 'Rencontres';
    [$sur, $t1, $t2] = $fal ? ['École de foot', 'Foot animation', "$quoi du week-end"]
        : ($vet ? ['Championnat vétérans', 'Vétérans', "$quoi du week-end"] : ["Atom'Sports Football Pierrelatte", $quoi, 'du week-end']);
    if (trim((string) ($opts['titre'] ?? '')) !== '') {                // titre choisi dans l'espace club
        $t1 = trim((string) $opts['titre']);
        if (preg_match('/week-?end/iu', $t1)) $t2 = $fal || $vet ? $quoi : '';
    }
    $A = afn_debut($lieu);
    afn_titres($A, $sur, $t1, $t2, afn_date_weekend($plan, $samedi) . ($suffixe !== '' ? " · $suffixe" : ''));
    $blocs = afn_blocs($liste, $resultats, $fal);
    if (!$blocs) { $blocs = [['t' => 'vide', 'texte' => $resultats ? 'Aucun résultat ce week-end' : 'Aucun match programmé ce week-end']]; $zm = 1.1; }
    elseif (count($blocs) === 1 && !$fal) { $blocs[0]['t'] = 'duo'; $zm = 1.15; }
    else $zm = afn_zoom_max(count($blocs));
    afn_zone($A, $blocs, $zm);
    $GLOBALS['aff_sp_partie'] = in_array($opts['partie'] ?? null, [1, 2], true) ? $opts['partie'] : ($lieu === 'ext' ? 2 : ($lieu === 'dom' ? 1 : null));
    afn_partenaires($A, (bool) ($opts['sponsors'] ?? true));
    $GLOBALS['aff_sp_partie'] = null;
    return $A['im'];
}

/* ================= Publication : une annonce pour le domicile, une pour l'extérieur =================
   Chaque annonce (rencontres, résultats, foot animation, vétérans) part en deux publications séparées : les matchs à
   domicile, puis ceux à l'extérieur, chacune avec son message. Une liste trop chargée passe sur deux pages (deux images
   dans la même publication) ; sinon une seule. Facebook : une page en 4:5, deux pages côte à côte en 1:2 (montrées en
   entier) ; Instagram : carrousel en 4:5 ; une story par page. */
function aff_genre(string $g): void { $GLOBALS['aff_fal'] = $g === 'fal'; $GLOBALS['aff_vet'] = $g === 'vet'; }
/* facteur d'agrandissement de la liste sur un format (comme afn_zone) : sous 0,8 elle devient trop serrée */
function afn_zoom_pour(array $blocs, string $fmt): float {
    [$z0, $z1] = AFN_FORMATS[$fmt]['zone']; $zh = $z1 - $z0; $zw = AFF_W - 60; $n = count($blocs);
    for ($k = afn_zoom_max($n); $k > .3; $k -= .01) {
        $wc = $zw / $k;
        if ((array_sum(array_map(fn($b) => afn_hauteur($b, $wc), $blocs)) + 12 * ($n - 1)) * $k <= $zh) break;
    }
    return $k;
}
/* foot animation : les catégories dans l'ordre, des U6 · U7 aux U13 (brassage) */
function afn_rang_cat(string $eq): int {
    if (!preg_match('/U\s?(\d{1,2})/u', $eq, $x)) return 9;
    $n = (int) $x[1];
    return $n <= 7 ? 1 : ($n <= 9 ? 2 : ($n <= 11 ? 3 : ($n <= 13 ? 4 : 5)));
}
function afn_groupe_cat(string $eq): string { return [1 => 'U6 · U7', 2 => 'U8 · U9', 3 => 'U10 · U11', 4 => 'U13'][afn_rang_cat($eq)] ?? 'Autres'; }
/* la liste d'une annonce pour un lieu (genre déjà posé) : celle des affiches ; foot animation rangé par catégorie */
function afn_liste_lieu(array $matchs, string $samedi, bool $res, ?string $lieu): array {
    $l = [];
    foreach (aff_plan_weekend($matchs, $samedi, $res, $lieu) as $j) foreach ($j['matchs'] as $m) $l[] = $m;
    if (!empty($GLOBALS['aff_fal'])) {
        foreach ($l as $i => &$m) $m['_ordre'] = $i;
        unset($m);
        usort($l, fn($a, $b) => (afn_rang_cat((string) ($a['equipe'] ?? '')) <=> afn_rang_cat((string) ($b['equipe'] ?? ''))) ?: $a['_ordre'] <=> $b['_ordre']);
    }
    return $l;
}
/* les pages d'une annonce pour un lieu (genre déjà posé) → [['i' => indices dans la liste, 'suffixe' => …], …]
   Tout tient (agrandissement ≥ 0,8 sur la publication 4:5) : une page. Sinon deux pages. Foot animation trop chargé même
   sur deux pages : une affiche par catégorie (U6 · U7, U8 · U9, U10 · U11, U13), toutes dans la même annonce.
   Championnats très chargés : trois ou quatre pages. */
function aff_decoupage(array $matchs, string $samedi, bool $res, string $lieu): array {
    $l = afn_liste_lieu($matchs, $samedi, $res, $lieu); $n = count($l);
    if (!afn_actif($lieu) || $n < 2) return [['i' => range(0, max(0, $n - 1)), 'suffixe' => '']];
    $fal = !empty($GLOBALS['aff_fal']);
    $tient = fn(array $ix) => afn_zoom_pour(afn_blocs(array_map(fn($i) => $l[$i], $ix), $res, $fal), 'insta') >= .8;
    $tout = range(0, $n - 1);
    if ($tient($tout)) return [['i' => $tout, 'suffixe' => '']];
    $coupe = (int) ceil($n / 2);
    if ($fal) {                                                         // foot animation : coupé au changement de catégorie le plus proche du milieu
        $bords = array_filter(range(1, $n - 1), fn($k) => afn_groupe_cat((string) ($l[$k]['equipe'] ?? '')) !== afn_groupe_cat((string) ($l[$k - 1]['equipe'] ?? '')));
        if ($bords) { usort($bords, fn($a, $b) => abs($a - $n / 2) <=> abs($b - $n / 2)); $coupe = $bords[0]; }
    }
    $p1 = range(0, $coupe - 1); $p2 = range($coupe, $n - 1);
    if ($tient($p1) && $tient($p2)) return [['i' => $p1, 'suffixe' => 'page 1/2'], ['i' => $p2, 'suffixe' => 'page 2/2']];
    if ($fal) {
        $groupes = [];
        foreach ($l as $i => $m) $groupes[afn_groupe_cat((string) ($m['equipe'] ?? ''))][] = $i;
        $pages = [];
        foreach ($groupes as $g => $ix) {
            if (count($ix) > 1 && !$tient($ix)) {                       // une catégorie elle-même trop chargée : en deux
                $c = (int) ceil(count($ix) / 2);
                $pages[] = ['i' => array_slice($ix, 0, $c), 'suffixe' => "$g · 1/2"]; $pages[] = ['i' => array_slice($ix, $c), 'suffixe' => "$g · 2/2"];
            } else $pages[] = ['i' => $ix, 'suffixe' => $g];
        }
        return array_slice($pages, 0, 10);                                // un carrousel Instagram : 10 images au plus
    }
    for ($p = 3; $p <= 4; $p++) {
        $morceaux = array_chunk($tout, (int) ceil($n / $p));
        if ($p === 4 || !array_filter($morceaux, fn($ix) => !$tient($ix))) {
            $q = count($morceaux);
            return array_map(fn($ix, $k) => ['i' => $ix, 'suffixe' => 'page ' . ($k + 1) . "/$q"], $morceaux, array_keys($morceaux));
        }
    }
    return [['i' => $tout, 'suffixe' => '']];
}
function aff_lieux(array $matchs, string $samedi, bool $res, string $genre): array {
    aff_genre($genre);
    $l = array_values(array_filter(['dom', 'ext'], fn($x) => (bool) aff_plan_weekend($matchs, $samedi, $res, $x)));
    aff_genre('');
    return $l;
}
/* les images d'une annonce pour un lieu : pN_story, pN_carre, et pN_fb quand il y a exactement deux pages */
function aff_feuilles_lieu(array $matchs, string $samedi, bool $res, string $lieu, string $genre, string $nom, array $fmts = ['story', 'carre', 'fb']): array {
    aff_genre($genre);
    $pages = aff_decoupage($matchs, $samedi, $res, $lieu); $n = count($pages); $f = [];
    foreach ($pages as $k => $pg) foreach ($fmts as $fmt) {
        if ($fmt === 'fb' && $n !== 2) continue;                                     // Facebook : 1:2 seulement pour deux pages côte à côte
        aff_format($fmt); $p = $k + 1;
        $f["p{$p}_$fmt"] = aff_enregistrer(aff_liste($matchs, $samedi, $res, ['lieu' => $lieu, 'sponsors' => true, 'partie' => $lieu === 'dom' ? 1 : 2, 'indices' => $pg['i'], 'suffixe' => $pg['suffixe']]),
            "$nom-$lieu" . ($n > 1 ? "-p$p" : '') . ($fmt === 'story' ? '' : "-$fmt"));
    }
    aff_format('story'); aff_genre('');
    return $f;
}
function aff_pages(array $f, string $fmt): array {
    $l = [];
    for ($p = 1; $p <= 10; $p++) if (!empty($f["p{$p}_$fmt"])) $l[] = $f["p{$p}_$fmt"];
    return $l;
}
/* Facebook : une page en 4:5 ; deux pages côte à côte en 1:2 ; plus (une affiche par catégorie) : toutes en 4:5 */
function aff_images_fb_lieu(array $f): array { $fb = aff_pages($f, 'fb'); return count($fb) === 2 ? $fb : aff_pages($f, 'carre'); }
function aff_message_lieu(string $genre, array $matchs, string $samedi, bool $res, string $lieu): string {
    if ($genre === 'fal') return aff_message_plateaux($matchs, $samedi, $res, $lieu);
    if ($genre === 'vet') return aff_message_veterans($matchs, $samedi, $res, $lieu);
    return $res ? aff_message_resultats($matchs, $samedi, $lieu) : aff_message_rencontres($matchs, $samedi, $lieu);
}
function aff_nom_annonce(string $genre, bool $res, string $lieu): string {
    return ($genre === 'fal' ? 'Foot animation · ' : ($genre === 'vet' ? 'Vétérans · ' : '')) . ($res ? 'résultats' : 'rencontres') . ' · ' . ($lieu === 'dom' ? 'à domicile' : "à l'extérieur");
}
/* publication automatique (cron) d'une annonce pour un lieu ; chaque lieu a sa clé : un échec ne republie pas l'autre */
function aff_traiter_lieu(string $cle, array $matchs, string $samedi, bool $res, string $lieu, string $genre, string $nom, array &$journal): void {
    $texte = null; $msg = function () use (&$texte, $genre, $matchs, $samedi, $res, $lieu) { return $texte ??= aff_message_lieu($genre, $matchs, $samedi, $res, $lieu); };
    aff_traiter("$cle-$lieu", ucfirst(aff_nom_annonce($genre, $res, $lieu)), fn() => aff_feuilles_lieu($matchs, $samedi, $res, $lieu, $genre, $nom), [
        'Facebook' => function (array $f) use ($msg) {
            foreach (aff_pages($f, 'story') as $st) fb_story($st);
            if ($imgs = aff_images_fb_lieu($f)) fb_publication($imgs, $msg());
        },
        'Instagram' => function (array $f) use ($msg) {
            foreach (aff_pages($f, 'story') as $st) ig_story($st);
            if ($imgs = aff_pages($f, 'carre')) ig_publication($imgs, $msg());
        },
    ], $journal);
}
/* déjà publiée par l'ancienne version (domicile et extérieur dans la même annonce) : pas de doublon le jour de la mise à jour */
function aff_deja_publie(string $cle): bool {
    return reglage("pub_$cle") === 'fait' || reglage("pub_facebook_$cle") === 'fait' || reglage("pub_instagram_$cle") === 'fait';
}

/* ---------- affiches de matchs saisis à la main (onglet « Affiches matchs » de l'espace club) ----------
   POST /api/affiches.php?manuel=1, corps JSON :
     { type: rencontres | resultats | fal-rencontres | fal-resultats | vet-rencontres | vet-resultats | match | score,
       lieu: dom | ext | "" (feuille), format: story | carre | fb, titre, sponsors, samedi,
       matchs: [{ equipe, comp, adv, dom, date, heure, bp, bc, adresse, adversaires: [..], resultats: [{adv, bp, bc}] }] }
   &message=1 : le texte de la publication ; &telecharger=1 : l'image en pièce jointe.
   Les matchs saisis remplacent ceux de la base le temps de la requête (aff_plan_weekend lit $GLOBALS['aff_plan_manuel']) :
   les affiches et les messages sont donc exactement ceux du lundi, avec ces matchs-là. */
const AFN_TYPES_MANUEL = ['rencontres', 'resultats', 'fal-rencontres', 'fal-resultats', 'vet-rencontres', 'vet-resultats', 'match', 'score'];
const AFN_MAX_MANUEL = 12;                                                  // au-delà, l'affiche devient illisible : en faire deux
/* les émojis ne sont pas dans la police de l'affiche : on les retire du texte dessiné */
function afn_sans_emoji(string $s): string {
    return preg_replace('/[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE00}-\x{FE0F}\x{200D}\x{20E3}\x{E0020}-\x{E007F}]/u', '', $s) ?? $s;
}
/* [1, 2, 3] → « 1 · 2 · 3 » ; une suite plus longue → « 1 À 5 » */
function afn_numeros(array $n, string $sep): string {
    sort($n);
    return count($n) > 3 && end($n) - $n[0] === count($n) - 1 ? $n[0] . ' À ' . end($n) : implode($sep, $n);
}
/* nom d'équipe dans le message : « FC MONTÉLIMAR » → « FC Montélimar », mais les sigles courts restent (« USVJ B ») */
function afn_joli(string $n): string {
    $n = trim($n);
    if ($n !== mb_strtoupper($n)) return $n === mb_strtolower($n) ? aff_joli($n) : $n;
    $mots = ['DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'SUR', 'EN', 'AUX', 'AU', 'SUD', 'NORD', 'EST', 'PONT', 'ST', 'STE', 'MONT', 'VAL', 'PORT', 'CAP', 'LAC', 'MAS', 'COL', 'GAP', 'BAS', 'HAUT'];
    $o = preg_split('/(\s+)/u', $n, -1, PREG_SPLIT_DELIM_CAPTURE); $j = preg_split('/(\s+)/u', aff_joli($n), -1, PREG_SPLIT_DELIM_CAPTURE);
    if (count($o) === count($j))
        foreach ($o as $i => $w) if (preg_match('/^\p{Lu}{2,4}$/u', $w) && !in_array($w, $mots, true) && preg_match_all('/[AEIOUYÀÂÉÈÊËÎÏÔÛÙÜ]/u', $w) <= 1) $j[$i] = $w;
    return implode('', $j);
}
/* fiche « pl- » de la base : ses rencontres avec horaires (plateau, brassage) ou ses poules → les mêmes blocs que la saisie à la main */
function afn_depuis_base(array $m): array {
    if (!str_starts_with((string) ($m['id'] ?? ''), 'pl-')) return $m;
    $txt = fn($v, int $n) => is_scalar($v) ? mb_substr(trim(preg_replace('/\s+/u', ' ', (string) $v)), 0, $n) : '';
    $but = fn($v) => (is_numeric($v) && (float) $v == (int) $v && $v >= 0 && $v <= 99) ? (int) $v : null;
    $hh = fn($v) => is_scalar($v) && preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/D', (string) $v, $x) ? sprintf('%02d:%s', $x[1], $x[2]) : '';
    $tri = fn($a, $b) => (($a['heure'] === '') <=> ($b['heure'] === '')) ?: strcmp($a['heure'], $b['heure']);
    if (($m['format'] ?? '') === 'poules' && is_array($m['poules'] ?? null)) {
        $tab = [];
        foreach (array_slice($m['poules'], 0, 8) as $k => $q) {
            if (!is_array($q)) continue;
            $noms = [];
            foreach (array_slice(is_array($q['equipes'] ?? null) ? $q['equipes'] : [], 0, 12) as $e) {
                if (!is_array($e) || $txt($e['club'] ?? '', 60) === '') continue;
                $club = afn_nous((string) $e['club']) ? 'PIERRELATTE' : aff_maj($txt($e['club'], 60));
                $noms[(string) ($e['id'] ?? count($noms))] = $club . (!empty($e['n']) && is_numeric($e['n']) ? ' ' . (int) $e['n'] : '');
            }
            $ms = [];
            foreach (array_slice(is_array($q['matchs'] ?? null) ? $q['matchs'] : [], 0, 30) as $p) {
                if (!is_array($p)) continue;
                $a = $noms[(string) ($p['a'] ?? '')] ?? ''; $bb = $noms[(string) ($p['b'] ?? '')] ?? '';
                if ($a !== '' && $bb !== '' && $a !== $bb) $ms[] = ['heure' => $hh($p['heure'] ?? ''), 'a' => $a, 'b' => $bb, 'sa' => $but($p['sa'] ?? null), 'sb' => $but($p['sb'] ?? null)];
            }
            usort($ms, $tri);
            if ($noms || $ms) $tab[] = ['nom' => chr(65 + $k), 'equipes' => array_values($noms), 'matchs' => $ms];
        }
        if ($tab) $m['tableau'] = $tab;
        if ((string) ($m['heure'] ?? '') === '' && ($hs = array_filter(array_merge(...array_map(fn($q) => array_column($q['matchs'], 'heure'), $tab ?: [['matchs' => []]])), 'strlen'))) $m['heure'] = min($hs);
    } elseif (is_array($m['rencontres'] ?? null)) {
        $ms = [];
        foreach (array_slice($m['rencontres'], 0, 12) as $p)
            if (is_array($p) && $txt($p['adv'] ?? '', 60) !== '') $ms[] = ['heure' => $hh($p['heure'] ?? ''), 'adv' => aff_maj($txt($p['adv'], 60)), 'bp' => $but($p['bp'] ?? null), 'bc' => $but($p['bc'] ?? null)];
        usort($ms, $tri);
        if ($ms && array_filter(array_column($ms, 'heure'), 'strlen')) $m['nos'] = [['n' => 0, 'matchs' => $ms]];   // horaires : une ligne par match
    }
    return $m;
}
function afn_nous(string $n): bool { return (bool) preg_match("/pierrelatte|atom'?\s*sports?/iu", $n); }
/* poules : au moins un score (affiche des résultats) */
function afn_tableau_joue(array $m): bool {
    foreach ($m['tableau'] ?? [] as $q) foreach ($q['matchs'] as $p) if ($p['sa'] !== null && $p['sb'] !== null) return true;
    return false;
}
function afn_manuel_lire(array $d): array {
    $type = $d['type'] ?? '';
    $fal = str_starts_with($type, 'fal-'); $vet = str_starts_with($type, 'vet-');
    // texte d'une ligne, sans émoji (la police de l'affiche ne les a pas)
    $txt = fn($v, int $n) => is_scalar($v) ? mb_substr(trim(preg_replace('/\s+/u', ' ', afn_sans_emoji((string) $v))), 0, $n) : '';
    $but = fn($v) => (is_numeric($v) && (float) $v == (int) $v && $v >= 0 && $v <= 99) ? (int) $v : null;
    $out = [];
    foreach (array_slice(is_array($d['matchs'] ?? null) ? $d['matchs'] : [], 0, AFN_MAX_MANUEL) as $i => $m) {
        if (!is_array($m)) continue;
        $date = (string) ($m['date'] ?? '');
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $dd) || !checkdate((int) $dd[2], (int) $dd[3], (int) $dd[1])) continue;
        $heure = is_scalar($m['heure'] ?? null) && preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/D', (string) $m['heure'], $hm) ? sprintf('%02d:%s', $hm[1], $hm[2]) : '';
        // id « fff-man- » : un match de championnat saisi à la main n'est jamais pris pour du foot animation
        $x = ['id' => ($fal ? 'pl-man' : ($vet ? 'vet-man' : 'fff-man-')) . $i, 'equipe' => $txt($m['equipe'] ?? '', 40), 'comp' => $txt($m['comp'] ?? '', 40),
              'adv' => $txt($m['adv'] ?? '', 60), 'dom' => !empty($m['dom']), 'date' => $date, 'heure' => $heure,
              'bp' => $but($m['bp'] ?? null), 'bc' => $but($m['bc'] ?? null), 'adresse' => $txt($m['adresse'] ?? '', 120), '_maj' => ''];
        if ($vet && $x['equipe'] === '') $x['equipe'] = 'Vétérans';
        if (!$fal && !$vet && $x['equipe'] === '') continue;                            // une équipe sans nom n'est pas dessinée
        if ($fal) {
            // « U10-U11 », « u10/u11 espoir » → « U10 · U11 ESPOIR », comme les fiches du foot animation
            $x['equipe'] = preg_replace('/^(U\s?\d{1,2})\s*[-\/·]\s*(U\s?\d{1,2})/u', '$1 · $2', aff_maj($x['equipe']));
            // plusieurs équipes de la catégorie sur le plateau, et leurs numéros (équipe 1, 2, 3… donnés par l'appli)
            $nb = is_numeric($m['equipes'] ?? null) ? max(1, min(8, (int) $m['equipes'])) : 1;
            $nos = is_array($m['numeros'] ?? null) ? $m['numeros'] : (is_numeric($m['numero'] ?? null) ? [$m['numero']] : []);
            $nos = array_slice(array_values(array_unique(array_filter(array_map(fn($v) => is_numeric($v) ? (int) $v : 0, $nos), fn($v) => $v >= 1 && $v <= 16))), 0, 8);
            if (count($nos) > 1) $nb = count($nos);
            if (count($nos) === 1 && $nb === 1 && !preg_match('/ÉQUIPE\s*\d/u', $x['equipe'])) $x['equipe'] .= (str_contains($x['equipe'], '·') ? ' ' : ' · ') . 'ÉQUIPE ' . $nos[0];
            if ($nb > 1) {
                $x['nb_equipes'] = $nb;
                if (count($nos) === $nb) { sort($nos); $x['numeros'] = $nos; }
                $x['equipeDetail'] = $x['equipe'] . (isset($x['numeros']) ? ' (équipes ' . preg_replace('/, (\d+)$/', ' et $1', str_replace(' À ', ' à ', afn_numeros($nos, ', '))) . ')' : " ($nb équipes)");
            }
            if ($x['comp'] === '') $x['comp'] = preg_match('/U\s?13/i', $x['equipe']) ? 'Brassage' : 'Plateau';
            $x['adversaires'] = array_values(array_filter(array_map(fn($a) => aff_maj($txt($a, 60)), array_slice(is_array($m['adversaires'] ?? null) ? $m['adversaires'] : [], 0, 8)), 'strlen'));
            $x['resultats'] = [];
            foreach (array_slice(is_array($m['resultats'] ?? null) ? $m['resultats'] : [], 0, 6) as $r)
                if (is_array($r) && $txt($r['adv'] ?? '', 60) !== '') $x['resultats'][] = ['adv' => aff_maj($txt($r['adv'], 60)), 'bp' => $but($r['bp'] ?? null), 'bc' => $but($r['bc'] ?? null)];
            $hhf = fn($v) => is_scalar($v) && preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/D', (string) $v, $hm) ? sprintf('%02d:%s', $hm[1], $hm[2]) : '';
            $parHeure = fn($a, $b) => (($a['heure'] === '') <=> ($b['heure'] === '')) ?: strcmp($a['heure'], $b['heure']);
            // plateau : les matchs de chacune de nos équipes (heure, adversaire, score), triés par heure
            $nosEq = [];
            foreach (array_slice(is_array($m['nos'] ?? null) ? $m['nos'] : [], 0, 8) as $q) {
                if (!is_array($q)) continue;
                $ms = [];
                foreach (array_slice(is_array($q['matchs'] ?? null) ? $q['matchs'] : [], 0, 8) as $p)
                    if (is_array($p) && $txt($p['adv'] ?? '', 60) !== '')
                        $ms[] = ['heure' => $hhf($p['heure'] ?? ''), 'adv' => aff_maj($txt($p['adv'], 60)), 'bp' => $but($p['bp'] ?? null), 'bc' => $but($p['bc'] ?? null)];
                usort($ms, $parHeure);
                $nosEq[] = ['n' => is_numeric($q['numero'] ?? null) ? max(0, min(16, (int) $q['numero'])) : 0, 'matchs' => $ms];
            }
            if (array_filter($nosEq, fn($q) => $q['matchs'])) {
                $x['nos'] = $nosEq;
                $tous = array_merge(...array_column($nosEq, 'matchs'));
                $x['adversaires'] = array_values(array_unique(array_column($tous, 'adv')));
                $x['resultats'] = array_values(array_map(fn($p) => ['adv' => $p['adv'], 'bp' => $p['bp'], 'bc' => $p['bc']], array_filter($tous, fn($p) => $p['bp'] !== null && $p['bc'] !== null)));
                if ($x['heure'] === '' && ($hs = array_filter(array_column($tous, 'heure'), 'strlen'))) $x['heure'] = min($hs);
            }
            // poules (brassage, tournoi…) : toutes leurs équipes, Pierrelatte parfois plusieurs fois, et leurs matchs
            $tab = [];
            foreach (array_slice(is_array($m['poules'] ?? null) ? $m['poules'] : [], 0, 8) as $k => $q) {
                if (!is_array($q) || !is_array($q['equipes'] ?? null)) continue;
                $eqs = array_values(array_filter(array_map(fn($e) => aff_maj($txt($e, 60)), array_slice($q['equipes'], 0, 12)), 'strlen'));
                $ms = [];
                foreach (array_slice(is_array($q['matchs'] ?? null) ? $q['matchs'] : [], 0, 30) as $p) {
                    if (!is_array($p)) continue;
                    $a = aff_maj($txt($p['a'] ?? '', 60)); $bb = aff_maj($txt($p['b'] ?? '', 60));
                    if ($a !== '' && $bb !== '' && $a !== $bb) $ms[] = ['heure' => $hhf($p['heure'] ?? ''), 'a' => $a, 'b' => $bb, 'sa' => $but($p['sa'] ?? null), 'sb' => $but($p['sb'] ?? null)];
                }
                usort($ms, $parHeure);
                $nom = mb_strtoupper($txt($q['nom'] ?? '', 3));
                if (!preg_match('/^[A-Z0-9]{1,3}$/', $nom)) $nom = chr(65 + min(25, $k));
                if ($eqs || $ms) $tab[] = ['nom' => $nom, 'equipes' => $eqs, 'matchs' => $ms];
            }
            if ($tab) {
                $x['tableau'] = $tab; $x['resultats'] = []; $adv = []; $hs = [];
                foreach ($tab as $q) {
                    foreach ($q['equipes'] as $e) if (!afn_nous($e)) $adv[] = $e;
                    foreach ($q['matchs'] as $p) {
                        if ($p['heure'] !== '') $hs[] = $p['heure'];
                        if ($p['sa'] === null || $p['sb'] === null) continue;
                        if (afn_nous($p['a']) && !afn_nous($p['b'])) $x['resultats'][] = ['adv' => $p['b'], 'bp' => $p['sa'], 'bc' => $p['sb']];
                        elseif (afn_nous($p['b']) && !afn_nous($p['a'])) $x['resultats'][] = ['adv' => $p['a'], 'bp' => $p['sb'], 'bc' => $p['sa']];
                    }
                }
                $x['adversaires'] = array_values(array_unique($adv));
                if ($x['heure'] === '' && $hs) $x['heure'] = min($hs);
            }
            $x['bp'] = $x['bc'] = null;
            if (!$x['dom'] && $x['adv'] === '') continue;                                 // plateau à l'extérieur : il faut le club qui reçoit
            if ($x['equipe'] === '') continue;
        } elseif ($x['adv'] === '') continue;                                         // un match sans adversaire n'est pas dessiné
        $out[] = $x;
    }
    $sa = is_scalar($d['samedi'] ?? null) ? (string) $d['samedi'] : '';
    $ref = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $sa, $sd) && checkdate((int) $sd[2], (int) $sd[3], (int) $sd[1]) ? $sa : ($out ? min(array_column($out, 'date')) : date('Y-m-d'));
    $t = strtotime($ref . ' 12:00'); $w = (int) date('w', $t);
    return [$type, $out, date('Y-m-d', $t + (($w === 0 ? -1 : 6 - $w) * 86400))];
}
/* le « plan » du week-end pour des matchs saisis à la main : tous gardés (aucun tri par la base), par jour puis par heure */
function afn_plan_manuel(array $matchs, bool $resultats, ?string $lieu): array {
    $sel = array_values(array_filter($matchs, fn($m) => $lieu === null || ($lieu === 'dom') === !empty($m['dom'])));
    if (!empty($GLOBALS['aff_fal']) && $resultats) $sel = array_values(array_filter($sel, fn($m) => aff_scores_brassage($m) || afn_tableau_joue($m)));
    foreach ($sel as &$m) {
        $m['sous'] = aff_sous_etiquette((string) ($m['comp'] ?? ''));
        $m['etiquette'] = $m['equipe'] . ($m['sous'] !== '' ? ' (' . mb_convert_case(mb_strtolower($m['sous']), MB_CASE_TITLE) . ')' : '');
    }
    unset($m);
    $jours = array_values(array_unique(array_column($sel, 'date'))); sort($jours);
    $out = [];
    foreach ($jours as $d) {
        $l = array_values(array_filter($sel, fn($m) => $m['date'] === $d));
        usort($l, fn($a, $b) => strcmp((string) ($a['heure'] ?? ''), (string) ($b['heure'] ?? '')));
        $out[] = ['date' => $d, 'matchs' => $l];
    }
    return $out;
}
function afn_manuel_route(): void {
    $refus = function (int $code, string $t) { http_response_code($code); header('Content-Type: text/plain; charset=utf-8'); echo $t; exit; };
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') $refus(405, 'Envoi en POST seulement.');
    $brut = (string) file_get_contents('php://input');
    if (strlen($brut) > 100000) $refus(413, 'Trop de données.');
    $d = json_decode($brut, true, 32, JSON_BIGINT_AS_STRING);
    if (!is_array($d)) $refus(400, 'Données illisibles.');
    if (!in_array($d['type'] ?? '', AFN_TYPES_MANUEL, true)) $refus(400, "Type d'affiche inconnu.");
    [$type, $matchs, $samedi] = afn_manuel_lire($d);
    $res = in_array($type, ['resultats', 'fal-resultats', 'vet-resultats', 'score'], true);
    $fal = str_starts_with($type, 'fal-'); $vet = str_starts_with($type, 'vet-');
    $lieu = in_array($d['lieu'] ?? '', ['dom', 'ext'], true) ? $d['lieu'] : null;
    $GLOBALS['aff_plan_manuel'] = $matchs;
    if (isset($_GET['message'])) {                                            // texte de la publication (toute l'annonce)
        header('Content-Type: text/plain; charset=utf-8');
        if ($type === 'match' || $type === 'score') { echo ''; exit; }      // un seul match : message écrit par l'espace club
        echo $fal ? aff_message_plateaux($matchs, $samedi, $res) : ($vet ? aff_message_veterans($matchs, $samedi, $res)
            : ($res ? aff_message_resultats($matchs, $samedi) : aff_message_rencontres($matchs, $samedi)));
        exit;
    }
    aff_format(in_array($d['format'] ?? '', ['carre', 'post', 'fb'], true) ? $d['format'] : 'story');
    $opts = ['titre' => mb_substr(trim(afn_sans_emoji(is_scalar($d['titre'] ?? null) ? (string) $d['titre'] : '')), 0, 80), 'sponsors' => ($d['sponsors'] ?? true) !== false];
    ob_start();                                                                // un avertissement PHP ne doit jamais casser l'image
    if ($type === 'match' || $type === 'score') {
        if (!$matchs) { http_response_code(422); header('Content-Type: text/plain; charset=utf-8'); echo 'Ajoute le match : date et adversaire.'; exit; }
        if ($type === 'score' && !aff_joue($matchs[0])) { http_response_code(422); header('Content-Type: text/plain; charset=utf-8'); echo 'Ajoute le score du match.'; exit; }
        $im = aff_match($matchs[0], $opts + ['score' => $type === 'score']);
    } else {
        $GLOBALS['aff_fal'] = $fal; $GLOBALS['aff_vet'] = $vet;
        $im = aff_liste($matchs, $samedi, $res, $opts + ['lieu' => $lieu, 'partie' => $lieu === 'dom' ? 1 : ($lieu === 'ext' ? 2 : null)]);
        $GLOBALS['aff_fal'] = $GLOBALS['aff_vet'] = false;
    }
    ob_end_clean();
    if (!$im) $refus(500, "L'affiche n'a pas pu être dessinée.");
    if (!empty($GLOBALS['afn_deborde'])) $refus(422, 'Trop de matchs pour une seule affiche : fais-en deux (par exemple une à domicile et une à l\'extérieur, ou en deux parties).');
    header('Content-Type: image/jpeg'); header('Cache-Control: no-store');
    if (!empty($_GET['telecharger'])) header('Content-Disposition: attachment; filename="asf-pierrelatte-' . $type . ($lieu ? "-$lieu" : '') . "-$samedi.jpg\"");
    imagejpeg($im, null, 92);
    exit;
}
/* GET /api/affiches.php?plan=1&type=…&date=AAAA-MM-JJ : les matchs automatiques du week-end pour ce type d'affiche
   (exactement ceux des affiches du lundi : base, plateaux, vétérans, scores), pour remplir l'onglet « Affiches matchs » */
function afn_plan_route(): void {
    header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    $type = (string) ($_GET['type'] ?? '');
    if (!in_array($type, AFN_TYPES_MANUEL, true)) { http_response_code(400); echo '{"erreur":"type inconnu"}'; exit; }
    $res = in_array($type, ['resultats', 'fal-resultats', 'vet-resultats', 'score'], true);
    $d0 = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['date'] ?? '')) ? (string) $_GET['date'] : date('Y-m-d');
    $t = strtotime($d0 . ' 12:00'); $w = (int) date('w', $t);
    $sam = date('Y-m-d', $t + (($w === 0 ? -1 : 6 - $w) * 86400));
    $GLOBALS['aff_fal'] = str_starts_with($type, 'fal-'); $GLOBALS['aff_vet'] = str_starts_with($type, 'vet-');
    $plan = aff_plan_weekend(aff_matchs(), $sam, $res);
    $GLOBALS['aff_fal'] = $GLOBALS['aff_vet'] = false;
    $num = fn($v) => is_numeric($v) ? (int) $v : null;
    $l = [];
    foreach ($plan as $j) foreach ($j['matchs'] as $m) $l[] = [
        'equipe' => (string) ($m['equipe'] ?? ''), 'comp' => (string) ($m['comp'] ?? ''), 'adv' => (string) ($m['adv'] ?? ''), 'dom' => !empty($m['dom']),
        'date' => (string) ($m['date'] ?? ''), 'heure' => (string) ($m['heure'] ?? ''), 'adresse' => (string) ($m['adresse'] ?? ''),
        'bp' => $num($m['bp'] ?? null), 'bc' => $num($m['bc'] ?? null),
        'adversaires' => array_values(array_map('strval', array_filter((array) ($m['adversaires'] ?? []), 'is_scalar'))),
        'resultats' => array_values(array_map(fn($r) => ['adv' => (string) ($r['adv'] ?? ''), 'bp' => $num($r['bp'] ?? null), 'bc' => $num($r['bc'] ?? null)],
            array_filter((array) ($m['resultats'] ?? []), 'is_array'))),
    ];
    echo json_encode(['samedi' => $sam, 'matchs' => $l], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ================= Affiches des compos : convocation et composition (stories 1080 x 1920) =================
   Quand le coach valide sa compo, la story « convocation » annonce les joueurs convoqués ; 30 minutes avant le coup
   d'envoi, la story « composition » montre le onze de départ sur le terrain, puis les remplaçants.
   Trois styles au choix (ACP_STYLES) :
     - « nuit »    : le stade de nuit des autres affiches du club (fond, blason et « 1923 », or à domicile, argent à l'extérieur) ;
     - « tableau » : le tableau magnétique du coach (feutre vert, cadre alu, aimants bleus, feuille de match punaisée) ;
     - « club »    : affiche éditoriale aux couleurs du club (bleu profond, blanc, or, rayures en biais, grand blason en filigrane).
   Tout ce qui compte reste dans la zone sûre de la story (y 230 → 1690) : Instagram et Facebook posent leurs boutons
   au-dessus et en dessous. Le contenu est dessiné deux fois plus grand sur un calque transparent puis réduit (bords lisses),
   le fond est posé à la taille réelle. Les noms des jeunes (U13, U15…) s'écrivent « Lucas M. » par défaut (mineurs).
   Rien ne doit faire planter l'affiche : heure, rendez-vous ou postes manquants, formation inconnue (liste à la place
   du terrain), 25 convoqués, noms très longs, accents, apostrophes. */
const ACP_STYLES = ['nuit' => 'Stade de nuit', 'tableau' => 'Tableau tactique', 'club' => 'Bleu club'];
/* copie des formations de l'application : [poste, x % (de gauche à droite), y % (du but adverse, en haut, à notre but, en bas)] */
const ACP_FORMATIONS = [
    '4-4-2' => [['GB', 50, 90], ['DG', 14, 71], ['DC', 37, 75], ['DC', 63, 75], ['DD', 86, 71], ['MG', 14, 49], ['MC', 37, 52], ['MC', 63, 52], ['MD', 86, 49], ['BU', 37, 24], ['BU', 63, 24]],
    '4-3-3' => [['GB', 50, 90], ['DG', 14, 71], ['DC', 37, 75], ['DC', 63, 75], ['DD', 86, 71], ['MC', 28, 51], ['MC', 50, 55], ['MC', 72, 51], ['AG', 16, 26], ['BU', 50, 20], ['AD', 84, 26]],
    '4-2-3-1' => [['GB', 50, 90], ['DG', 14, 71], ['DC', 37, 75], ['DC', 63, 75], ['DD', 86, 71], ['MDC', 36, 59], ['MDC', 64, 59], ['MG', 16, 39], ['MOC', 50, 40], ['MD', 84, 39], ['BU', 50, 19]],
    '3-5-2' => [['GB', 50, 90], ['DC', 26, 74], ['DC', 50, 77], ['DC', 74, 74], ['MG', 12, 49], ['MC', 31, 54], ['MC', 50, 46], ['MC', 69, 54], ['MD', 88, 49], ['BU', 37, 23], ['BU', 63, 23]],
    '4-1-4-1' => [['GB', 50, 90], ['DG', 14, 71], ['DC', 37, 75], ['DC', 63, 75], ['DD', 86, 71], ['MDC', 50, 60], ['MG', 14, 44], ['MC', 37, 46], ['MC', 63, 46], ['MD', 86, 44], ['BU', 50, 20]],
    '4-4-1-1' => [['GB', 50, 90], ['DG', 14, 71], ['DC', 37, 75], ['DC', 63, 75], ['DD', 86, 71], ['MG', 14, 51], ['MC', 37, 54], ['MC', 63, 54], ['MD', 86, 51], ['MOC', 50, 34], ['BU', 50, 18]],
    '3-4-3' => [['GB', 50, 90], ['DC', 26, 74], ['DC', 50, 77], ['DC', 74, 74], ['MG', 13, 52], ['MC', 38, 55], ['MC', 62, 55], ['MD', 87, 52], ['AG', 18, 25], ['BU', 50, 19], ['AD', 82, 25]],
    '5-3-2' => [['GB', 50, 90], ['DG', 10, 66], ['DC', 30, 76], ['DC', 50, 79], ['DC', 70, 76], ['DD', 90, 66], ['MC', 30, 51], ['MC', 50, 46], ['MC', 70, 51], ['BU', 37, 22], ['BU', 63, 22]],
    '5-4-1' => [['GB', 50, 90], ['DG', 10, 66], ['DC', 30, 76], ['DC', 50, 79], ['DC', 70, 76], ['DD', 90, 66], ['MG', 16, 49], ['MC', 39, 52], ['MC', 61, 52], ['MD', 84, 49], ['BU', 50, 21]],
    'Foot à 8 (3-3-1)' => [['GB', 50, 90], ['DG', 20, 72], ['DC', 50, 75], ['DD', 80, 72], ['MG', 20, 49], ['MC', 50, 52], ['MD', 80, 49], ['BU', 50, 24]],
    'Foot à 8 (3-1-3)' => [['GB', 50, 90], ['DG', 20, 73], ['DC', 50, 76], ['DD', 80, 73], ['MC', 50, 52], ['AG', 20, 27], ['BU', 50, 22], ['AD', 80, 27]],
    'Foot à 8 (2-3-2)' => [['GB', 50, 90], ['DG', 32, 74], ['DD', 68, 74], ['MG', 18, 50], ['MC', 50, 53], ['MD', 82, 50], ['BU', 35, 24], ['BU', 65, 24]],
    'Foot à 8 (3-2-2)' => [['GB', 50, 90], ['DG', 20, 73], ['DC', 50, 76], ['DD', 80, 73], ['MC', 33, 50], ['MC', 67, 50], ['BU', 33, 24], ['BU', 67, 24]],
    'Foot à 8 (2-4-1)' => [['GB', 50, 90], ['DG', 32, 74], ['DD', 68, 74], ['MG', 14, 50], ['MC', 38, 53], ['MC', 62, 53], ['MD', 86, 50], ['BU', 50, 24]],
    'Foot à 8 (3-2-1-1)' => [['GB', 50, 90], ['DG', 20, 73], ['DC', 50, 76], ['DD', 80, 73], ['MC', 33, 56], ['MC', 67, 56], ['MOC', 50, 40], ['BU', 50, 22]],
    'Foot à 8 (3-1-2-1)' => [['GB', 50, 90], ['DG', 20, 73], ['DC', 50, 76], ['DD', 80, 73], ['MDC', 50, 58], ['MG', 26, 44], ['MD', 74, 44], ['BU', 50, 22]],
    'Foot à 8 (2-1-3-1)' => [['GB', 50, 90], ['DG', 32, 75], ['DD', 68, 75], ['MDC', 50, 60], ['MG', 16, 42], ['MOC', 50, 40], ['MD', 84, 42], ['BU', 50, 21]],
    'Foot à 7 (2-3-1)' => [['GB', 50, 89], ['DG', 30, 71], ['DD', 70, 71], ['MG', 20, 49], ['MC', 50, 52], ['MD', 80, 49], ['BU', 50, 23]],
    'Foot à 7 (3-2-1)' => [['GB', 50, 89], ['DG', 22, 72], ['DC', 50, 75], ['DD', 78, 72], ['MC', 33, 48], ['MC', 67, 48], ['BU', 50, 23]],
    'Foot à 5 (2-2)' => [['GB', 50, 88], ['DEF', 28, 66], ['DEF', 72, 66], ['ATT', 28, 34], ['ATT', 72, 34]],
    'Foot à 5 (1-2-1)' => [['GB', 50, 88], ['DEF', 50, 68], ['MIL', 26, 48], ['MIL', 74, 48], ['ATT', 50, 26]],
];
const ACP_W = 1080, ACP_H = 1920;
const ACP_K = 2;                                    // le contenu est dessiné deux fois plus grand, puis réduit
const ACP_SURE = [230, 1690];                       // zone sûre de la story (sous la barre du haut, au-dessus du champ « Envoyer un message »)
const ACP_BLEU = ['#0F2257', '#1C3F9E'];
const ACP_OR = '#E3B64C';

/* ================= les données ================= */
function acp_jeune(string $equipe): bool { return (bool) preg_match('/^U\s?\d/iu', trim($equipe)); }
/* texte propre : sans émoji, espaces réduits, longueur bornée */
function acp_propre($s, int $max = 200): string {
    if (!is_scalar($s)) return '';
    $s = preg_replace('/\s+/u', ' ', afn_sans_emoji((string) $s)) ?? '';
    // lettres absentes des polices (« Ć », « Ł », « ğ »…) : la lettre sans son accent
    $s = preg_replace_callback('/[^\x{0020}-\x{007E}\x{00A0}-\x{00FF}\x{0152}\x{0153}\x{0178}\x{2018}\x{2019}\x{201C}\x{201D}\x{2013}\x{2014}\x{2026}\x{20AC}]/u', function ($m) {
        $c = $m[0];
        if (class_exists('Normalizer') && ($n = Normalizer::normalize($c, Normalizer::FORM_D)) !== false) $c = preg_replace('/\p{Mn}+/u', '', $n);
        if (preg_match('/^[\x{0020}-\x{00FF}]+$/u', $c)) return $c;
        $a = function_exists('iconv') ? @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $m[0]) : '';
        return is_string($a) ? preg_replace('/[^\x20-\x7E]/', '', $a) : '';
    }, $s) ?? $s;
    return mb_substr(trim($s), 0, $max);
}
function acp_maj_mot(string $w): bool { return (bool) preg_match('/\p{L}/u', $w) && mb_strtoupper($w, 'UTF-8') === $w; }
/* « Lucas MARTIN » → ['Lucas', 'MARTIN'] ; « Jean-Pierre DE LA TOUR » → ['Jean-Pierre', 'DE LA TOUR'] ; sans capitales, le dernier mot est le nom */
function acp_decoupe(string $nom): array {
    $m = explode(' ', $nom); $n = count($m);
    if ($n < 2) return ['', $nom === mb_strtolower($nom, 'UTF-8') ? mb_convert_case($nom, MB_CASE_TITLE, 'UTF-8') : $nom];
    $i = $n;
    while ($i > 1 && acp_maj_mot($m[$i - 1])) $i--;
    if ($i === $n) $i = $n - 1;
    $p = implode(' ', array_slice($m, 0, $i)); $f = implode(' ', array_slice($m, $i));
    if (acp_maj_mot($p) || $p === mb_strtolower($p, 'UTF-8')) $p = mb_convert_case(mb_strtolower($p, 'UTF-8'), MB_CASE_TITLE, 'UTF-8');   // « LUCAS » → « Lucas »
    return [$p, aff_maj($f)];
}
/* « Jean-Baptiste » → « J.-B. », « Lucas » → « L. » */
function acp_initiales(string $prenom): string {
    $o = '';
    foreach (preg_split('/([\s-])/u', $prenom, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) as $b)
        $o .= ($b === '-' || $b === ' ') ? $b : mb_substr($b, 0, 1) . '.';
    return str_replace(' ', '', $o);
}
/* nom affiché : 'complet' → « Lucas MARTIN », 'initiale' → « Lucas M. », 'auto' → initiale pour les jeunes (U13, U15…) */
function acp_nom(string $nom, string $equipe, string $mode = 'auto'): string {
    $nom = acp_propre($nom, 80);
    if ($nom === '') return '';
    if ($mode !== 'complet' && $mode !== 'initiale') $mode = acp_jeune($equipe) ? 'initiale' : 'complet';
    [$p, $f] = acp_decoupe($nom);
    if ($p === '') return $f;
    if ($mode === 'complet') return "$p $f";
    return "$p " . mb_substr($f, 0, 1, 'UTF-8') . '.';
}
/* heure « 18:00 » → « 18h00 » ('' si absente ou illisible) */
function acp_heure($h): string {
    return is_scalar($h) && preg_match('/^\s*(\d{1,2})\s*[:hH]\s*(\d{2})\s*$/', (string) $h, $m) && (int) $m[1] < 24 ? sprintf('%02dh%s', $m[1], $m[2]) : '';
}
/* la compo enregistrée → tout ce que les affiches dessinent, déjà mis en forme */
function acp_donnees(array $c, array $opts = []): array {
    $eq = acp_propre($c['equipe'] ?? '', 40); if ($eq === '') $eq = 'Équipe';
    $mode = in_array($opts['noms'] ?? 'auto', ['complet', 'initiale'], true) ? $opts['noms'] : (acp_jeune($eq) ? 'initiale' : 'complet');
    $date = (string) ($c['date'] ?? '');
    $okDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) && strtotime($date . ' 12:00');
    $dom = !empty($c['dom']);
    $stade = acp_propre($c['lieu'] ?? '', 90);
    if ($stade === '' && $dom) $stade = aff_club()['stade'] . ', Pierrelatte';
    $num = function ($n): string { $n = is_scalar($n) ? trim((string) $n) : ''; return preg_match('/^\d{1,3}$/', $n) ? $n : ''; };
    $joueur = function ($j) use ($eq, $mode, $num): ?array {
        if (!is_array($j)) return null;
        $nom = acp_nom((string) (is_scalar($j['nom'] ?? null) ? $j['nom'] : ''), $eq, $mode);
        if ($nom === '') return null;
        [$p, $f] = acp_decoupe(acp_propre($j['nom'], 80));
        // formes de plus en plus courtes pour les listes serrées : « J.-B. DE LA FONTAINE », puis « DE LA FONTAINE »
        $formes = [$nom];
        if ($mode === 'complet' && $p !== '') { $formes[] = acp_initiales($p) . ' ' . $f; $formes[] = $f; }
        return ['nom' => $nom, 'formes' => $formes, 'prenom' => $p, 'famille' => $f, 'num' => $num($j['num'] ?? ''), 'cap' => !empty($j['cap']), 'poste' => acp_propre($j['poste'] ?? '', 20)];
    };
    // titulaires, à leur place dans la formation (null : poste laissé vide)
    $postes = ACP_FORMATIONS[(string) ($c['formation'] ?? '')] ?? null;
    $tit = [];
    foreach (array_values(is_array($c['titulaires'] ?? null) ? $c['titulaires'] : []) as $i => $t) {
        $j = $joueur($t);
        if ($postes && $i >= count($postes)) { $postes = null; }
        $tit[] = $j;
    }
    if ($postes && !array_filter($tit)) $tit = array_fill(0, count($postes), null);
    if ($postes) {
        $tit = array_pad(array_slice($tit, 0, count($postes)), count($postes), null);
        foreach ($tit as $i => &$t) if ($t) { $t['x'] = $postes[$i][1]; $t['y'] = $postes[$i][2]; $t['poste'] = $postes[$i][0]; }
        unset($t);
    }
    // nom court sur le terrain : le nom de famille (« L. MARTIN » s'il y a deux MARTIN), « Lucas M. » pour les jeunes
    $familles = array_count_values(array_map(fn($t) => $t['famille'], array_filter($tit)));
    foreach ($tit as &$t) if ($t) {
        if ($mode === 'initiale' || $t['prenom'] === '') $t['court'] = $t['nom'];
        else $t['court'] = ($familles[$t['famille']] > 1 ? mb_substr($t['prenom'], 0, 1) . '. ' : '') . $t['famille'];
    }
    unset($t);
    $remp = array_values(array_filter(array_map($joueur, is_array($c['remplacants'] ?? null) ? $c['remplacants'] : [])));
    foreach ($remp as &$r) $r['court'] = $mode === 'initiale' || $r['prenom'] === '' ? $r['nom'] : $r['famille'];
    unset($r);
    $conv = array_values(array_filter(array_map($joueur, is_array($c['convoquesListe'] ?? null) ? $c['convoquesListe'] : [])));
    if (!$conv) $conv = array_merge(array_values(array_filter($tit)), $remp);
    $caps = array_map(fn($t) => $t['nom'], array_filter($tit, fn($t) => $t && $t['cap']));
    foreach ($conv as &$j) $j['cap'] = in_array($j['nom'], $caps, true);
    unset($j);
    $adv = acp_propre($c['adv'] ?? '', 60);
    return [
        'equipe' => $eq, 'mode' => $mode, 'dom' => $dom, 'lieu' => $dom ? 'dom' : 'ext',
        'adv' => $adv !== '' ? aff_maj($adv) : 'ADVERSAIRE', 'adv_brut' => $adv,
        'jour' => $okDate ? afn_jour($date) : '', 'quand' => $okDate ? afn_quand($date) : '',
        'heure' => acp_heure($c['heure'] ?? ''), 'stade' => $stade,
        'rdv' => acp_heure($c['rdvHeure'] ?? ''), 'rdvLieu' => acp_propre($c['rdvLieu'] ?? '', 80),
        'message' => acp_propre($c['message'] ?? '', 400),
        'formation' => $postes ? (string) $c['formation'] : '', 'terrain' => $postes !== null && array_filter($tit),
        'tit' => $tit, 'remp' => $remp, 'conv' => $conv,
    ];
}
/* une compo d'exemple réaliste (aperçus quand aucune compo n'existe encore) */
function acp_exemple(string $equipe = 'Seniors 1'): array {
    $jeune = acp_jeune($equipe);
    $age = preg_match('/^U\s?(\d{1,2})/iu', $equipe, $m) ? (int) $m[1] : 99;
    $formation = $age <= 9 ? 'Foot à 5 (1-2-1)' : ($age <= 13 ? 'Foot à 8 (3-3-1)' : '4-3-3');
    $noms = ['Lucas MARTIN', 'Enzo BERNARD', 'Hugo PETIT', 'Nathan ROUX', 'Théo FAURE', 'Yanis BENALI', 'Mathis GIRARD', 'Léo CHABERT',
             'Rayan HADDAD', 'Noah LEFÈVRE', "Kylian DA SILVA", 'Adam MOREL', 'Sacha VIDAL', 'Tom BRUNEL', 'Jules ARNAUD', 'Ilyes MANSOURI'];
    $postes = ACP_FORMATIONS[$formation];
    $n = count($postes); $nConv = $n + ($n >= 11 ? 3 : 3);
    $nums = [1, 2, 4, 5, 3, 8, 6, 10, 7, 9, 11, 12, 14, 15, 16, 13];
    $ids = []; $joueurs = [];
    for ($i = 0; $i < $nConv; $i++) $joueurs[] = ['nom' => $noms[$i], 'num' => (string) $nums[$i], 'poste' => $i === 0 ? 'Gardien' : ($i < 5 ? 'Défenseur' : ($i < 8 ? 'Milieu' : 'Attaquant'))];
    $tit = [];
    for ($i = 0; $i < $n; $i++) $tit[] = ['nom' => $joueurs[$i]['nom'], 'num' => $joueurs[$i]['num'], 'cap' => $i === ($n >= 11 ? 7 : 2)];
    $remp = array_slice($joueurs, $n);
    $liste = $joueurs; usort($liste, fn($a, $b) => (int) $a['num'] <=> (int) $b['num']);
    $samedi = date('Y-m-d', strtotime('next saturday'));
    return ['id' => 'exemple', 'equipe' => $equipe, 'matchId' => '', 'adv' => $jeune ? 'FC Montélimar' : 'FC Péageois', 'dom' => true,
        'date' => $samedi, 'heure' => $jeune ? '10:30' : '18:00', 'lieu' => 'Stade Gustave Jaume, Pierrelatte',
        'rdvHeure' => $jeune ? '09:45' : '17:00', 'rdvLieu' => 'Vestiaires du stade',
        'message' => 'Concentration et solidarité, on joue ensemble du premier au dernier ballon. Allez Pierrelatte !',
        'formation' => $formation, 'convoques' => [], 'slots' => [], 'capitaine' => '', 'publie' => true,
        'titulaires' => $tit, 'remplacants' => $remp, 'convoquesListe' => $liste, 'maj' => (int) (microtime(true) * 1000)];
}

/* ================= la toile : calque deux fois plus grand sur un fond à la taille réelle ================= */
function acp_toile($fond): array {
    $L = afn_calque(ACP_W * ACP_K, ACP_H * ACP_K);
    return ['fond' => $fond, 'im' => $L];
}
/* réduit le calque et le pose sur le fond : l'image finale (1080 x 1920) */
function acp_fin(array $T) {
    $R = afn_calque(ACP_W, ACP_H); imagealphablending($R, false);
    imagecopyresampled($R, $T['im'], 0, 0, 0, 0, ACP_W, ACP_H, ACP_W * ACP_K, ACP_H * ACP_K);
    imagedestroy($T['im']);
    $im = $T['fond']; imagealphablending($im, true);
    imagecopy($im, $R, 0, 0, 0, 0, ACP_W, ACP_H);
    imagedestroy($R);
    return $im;
}
/* les petits outils, en pixels de l'affiche (1080 x 1920) */
function acp_col(array $T, string $hex, float $op = 1): int { return afn_c($T['im'], afn_rgb($hex), $op); }
function acp_l(string $t, float $px, string $p, float $ls = 0): float { return afn_larg($t, $px * ACP_K, $p, $ls * ACP_K) / ACP_K; }
function acp_fit(string $t, float $px, string $p, float $max, float $min = .6, float $lsEm = 0): float { return afn_fit($t, $px * ACP_K, $p, $max * ACP_K, $min, $lsEm) / ACP_K; }
/* écrit sur la ligne de base $y ; renvoie la largeur */
function acp_t(array $T, string $t, float $x, float $y, float $px, string $p, string $hex, string $align = 'left', float $ls = 0, float $op = 1): float {
    if ($t === '') return 0;
    return afn_texte($T['im'], $t, $x * ACP_K, $y * ACP_K, $px * ACP_K, $p, acp_col($T, $hex, $op), $align, $ls * ACP_K) / ACP_K;
}
/* texte centré verticalement sur $cy (capitales) */
function acp_tc(array $T, string $t, float $x, float $cy, float $px, string $p, string $hex, string $align = 'left', float $ls = 0, float $op = 1): float {
    return acp_t($T, $t, $x, $cy + acp_demi($p) * $px, $px, $p, $hex, $align, $ls, $op);
}
/* moitié de la hauteur des capitales (ligne de base = milieu + demi × taille) */
function acp_demi(string $p): float { return $p[0] === 's' ? .33 : .35; }
function acp_ombre_t(array $T, string $t, float $x, float $y, float $px, string $p, float $dy, float $flou, float $op, string $align = 'left', float $ls = 0): void {
    if ($t === '') return;
    $w = acp_l($t, $px, $p, $ls);
    if ($align === 'right') $x -= $w; elseif ($align === 'center') $x -= $w / 2;
    afn_ombre_texte($T['im'], $t, $x * ACP_K, $y * ACP_K, $px * ACP_K, $p, $dy * ACP_K, $flou * ACP_K, $op, $ls * ACP_K);
}
function acp_degrade_t(array $T, string $t, float $x, float $y, float $px, string $p, array $arrets, string $align = 'left'): void {
    $w = acp_l($t, $px, $p);
    if ($align === 'right') $x -= $w; elseif ($align === 'center') $x -= $w / 2;
    afn_texte_degrade($T['im'], $t, $x * ACP_K, $y * ACP_K, $px * ACP_K, $p, $arrets, ($y - .78 * $px) * ACP_K, ($y + .05 * $px) * ACP_K);
}
/* coupe un texte trop long avec « … » */
function acp_coupe(string $t, float $px, string $p, float $max): string {
    if (acp_l($t, $px, $p) <= $max) return $t;
    while (mb_strlen($t) > 1 && acp_l($t . '…', $px, $p) > $max) $t = rtrim(mb_substr($t, 0, -1), " ,.;:·-");
    return $t . '…';
}
/* paragraphe sur $n lignes au plus, la dernière finit par « … » si le texte est plus long */
function acp_lignes(string $t, float $px, string $p, float $max, int $n): array {
    $l = afn_paragraphe($t, $px * ACP_K, $p, $max * ACP_K);
    if (count($l) <= $n) return $l;
    $l = array_slice($l, 0, $n);
    $l[$n - 1] = acp_coupe($l[$n - 1] . ' …', $px, $p, $max - 1);
    if (!str_ends_with($l[$n - 1], '…')) $l[$n - 1] .= '…';
    $l[$n - 1] = preg_replace('/\s*…+$/u', '…', $l[$n - 1]);
    return $l;
}
function acp_boite(array $T, float $x, float $y, float $w, float $h, $r, $remp, float $op = 1): void {
    $r = is_array($r) ? array_map(fn($v) => $v * ACP_K, $r) : $r * ACP_K;
    afn_boite($T['im'], $x * ACP_K, $y * ACP_K, $w * ACP_K, $h * ACP_K, $r, $remp, $op);
}
function acp_lisere(array $T, float $x, float $y, float $w, float $h, float $r, float $ep, string $hex, float $op): void {
    afn_lisere($T['im'], $x * ACP_K, $y * ACP_K, $w * ACP_K, $h * ACP_K, $r * ACP_K, $ep * ACP_K, $hex, $op);
}
function acp_rond(array $T, float $cx, float $cy, float $d, string $hex, float $op = 1): void {
    imagefilledellipse($T['im'], (int) round($cx * ACP_K), (int) round($cy * ACP_K), (int) round($d * ACP_K), (int) round($d * ACP_K), acp_col($T, $hex, $op));
}
/* anneau (cercle épais) */
function acp_anneau(array $T, float $cx, float $cy, float $d, float $ep, string $hex, float $op = 1): void {
    $im = $T['im']; $c = acp_col($T, $hex, $op);
    imagesetthickness($im, max(1, (int) round($ep * ACP_K)));
    imagearc($im, (int) round($cx * ACP_K), (int) round($cy * ACP_K), (int) round(($d - $ep) * ACP_K), (int) round(($d - $ep) * ACP_K), 0, 360, $c);
    imagesetthickness($im, 1);
}
/* disque en dégradé radial (lumière en haut à gauche) : aimants, jetons */
function acp_rond_degrade(array $T, float $cx, float $cy, float $d, array $arrets, float $gx = .35, float $gy = .3): void {
    $im = $T['im']; $K = ACP_K; $r = $d * $K / 2; $X = $cx * $K; $Y = $cy * $K;
    $lx = $X - $r + 2 * $r * $gx; $ly = $Y - $r + 2 * $r * $gy; $R = 2 * $r * .95;
    $x0 = (int) floor($X - $r); $y0 = (int) floor($Y - $r); $n = (int) ceil(2 * $r) + 2;
    for ($j = 0; $j < $n; $j++) {
        $py = $y0 + $j + .5; $dy2 = ($py - $Y) ** 2;
        if ($dy2 > $r * $r) continue;
        $dx = sqrt($r * $r - $dy2); $a = (int) ceil($X - $dx - .5); $b = (int) floor($X + $dx - .5);
        for ($i = $a; $i <= $b; $i++) imagesetpixel($im, $i, $y0 + $j, afn_c($im, afn_mix($arrets, sqrt(($i + .5 - $lx) ** 2 + ($py - $ly) ** 2) / $R)));
    }
}
function acp_poly(array $T, array $pts, string $hex, float $op = 1): void { aff_poly($T['im'], array_map(fn($v) => $v * ACP_K, $pts), acp_col($T, $hex, $op)); }
/* trait épais entre deux points (quadrilatère) */
function acp_trait(array $T, float $x1, float $y1, float $x2, float $y2, float $ep, string $hex, float $op = 1): void {
    $dx = $x2 - $x1; $dy = $y2 - $y1; $l = sqrt($dx * $dx + $dy * $dy); if ($l < .01) return;
    $nx = -$dy / $l * $ep / 2; $ny = $dx / $l * $ep / 2;
    acp_poly($T, [$x1 + $nx, $y1 + $ny, $x2 + $nx, $y2 + $ny, $x2 - $nx, $y2 - $ny, $x1 - $nx, $y1 - $ny], $hex, $op);
}
/* ligne brisée épaisse (lignes du terrain) : segments et petits disques aux jointures */
function acp_polyligne(array $T, array $pts, float $ep, string $hex, float $op = 1, bool $ferme = false): void {
    $im = $T['im']; $c = acp_col($T, $hex, $op); $K = ACP_K;
    imagesetthickness($im, max(1, (int) round($ep * $K)));
    $n = count($pts) / 2;
    for ($i = 0; $i < $n - ($ferme ? 0 : 1); $i++) {
        $j = ($i + 1) % $n;
        imageline($im, (int) round($pts[2 * $i] * $K), (int) round($pts[2 * $i + 1] * $K), (int) round($pts[2 * $j] * $K), (int) round($pts[2 * $j + 1] * $K), $c);
    }
    imagesetthickness($im, 1);
}
/* ombre douce sous un rectangle arrondi ou un disque */
function acp_ombre(array $T, float $x, float $y, float $w, float $h, float $r, float $flou, float $op, float $dy = 0, string $hex = '#000000'): void {
    $K = ACP_K; $m = 2 * $flou;
    afn_ombre($T['im'], ($x - $m) * $K, ($y + $dy - $m) * $K, ($w + 2 * $m) * $K, ($h + 2 * $m) * $K, function ($mk, $k, $blanc) use ($m, $w, $h, $r, $K) {
        if ($r * 2 >= min($w, $h) - .5 && abs($w - $h) < 1) imagefilledellipse($mk, (int) round(($m + $w / 2) * $K / $k), (int) round(($m + $h / 2) * $K / $k), (int) round($w * $K / $k), (int) round($h * $K / $k), $blanc);
        else aff_coin($mk, $m * $K / $k, $m * $K / $k, $w * $K / $k, $h * $K / $k, max(1, $r * $K / $k), $blanc);
    }, $flou * $K, $op, $hex);
}
function acp_blason(array $T, string $nom, bool $club, float $cx, float $cy, float $d): void { afn_blason($T['im'], $nom, $club, $cx * ACP_K, $cy * ACP_K, $d * ACP_K, ACP_K); }
function acp_icone(array $T, string $nom, float $x, float $y, float $taille, string $hex, ?string $fond = null): void {
    if ($nom === 'horloge') {                                         // cadran et aiguilles
        $cx = $x + $taille / 2; $cy = $y + $taille / 2; $d = $taille * .86;
        acp_rond($T, $cx, $cy, $d, $hex);
        if ($fond !== null) acp_rond($T, $cx, $cy, $d - $taille * .2, $fond);
        acp_trait($T, $cx, $cy + $taille * .04, $cx, $cy - $taille * .24, $taille * .1, $hex);
        acp_trait($T, $cx - $taille * .03, $cy, $cx + $taille * .2, $cy, $taille * .1, $hex);
        return;
    }
    if ($nom === 'bulle') {                                           // bulle de parole (le mot du coach)
        acp_boite($T, $x, $y + $taille * .08, $taille, $taille * .66, $taille * .18, $hex);
        acp_poly($T, [$x + $taille * .22, $y + $taille * .7, $x + $taille * .5, $y + $taille * .7, $x + $taille * .2, $y + $taille * .95], $hex);
        return;
    }
    afn_icone($T['im'], $nom, $x * ACP_K, $y * ACP_K, $taille * ACP_K, acp_col($T, $hex), $fond !== null ? acp_col($T, $fond) : null);
}

/* ================= mise en page commune ================= */
/* grille de noms : nombre de colonnes (1 à 3) et taille de police qui font tout tenir le plus gros possible ;
   $w, $h : la place ; $extra : largeur prise par le numéro et le brassard ; $p : police des noms */
function acp_grille(array $noms, float $w, float $h, float $pxMax, string $p, float $extraEm, float $gapCol = 24, float $ligneMax = 1.9): array {
    $n = max(1, count($noms)); $mieux = null;
    foreach ([1, 2, 3] as $cols) {
        $rows = (int) ceil($n / $cols);
        if ($cols > 1 && $rows < 3 && $n > 3) continue;
        $cw = ($w - ($cols - 1) * $gapCol) / $cols;
        $px = min($pxMax, $h / $rows / 1.45);
        $ls = array_map(fn($t) => acp_l($t, 100, $p) / 100, $noms); sort($ls);
        $long = $ls ? $ls[(int) floor((count($ls) - 1) * .85)] : 1;     // les plus longs prendront une forme courte
        $pxw = ($cw) / ($long + $extraEm);                             // taille qui fait tenir le nom le plus long
        $pxf = min($px, max($px * .78, $pxw));                         // les noms encore trop longs seront réduits un par un
        $score = $pxf - ($cols - 1) * .6;
        if (!$mieux || $score > $mieux['score'] + .01) $mieux = ['cols' => $cols, 'rows' => $rows, 'cw' => $cw, 'px' => $pxf, 'lh' => min($h / $rows, $pxf * $ligneMax), 'score' => $score];
    }
    return $mieux;
}
/* la forme du nom qui tient dans $max sans trop réduire la police : [texte, taille] */
function acp_forme(array $j, float $px, string $p, float $max, float $seuil = .84): array {
    $formes = $j['formes'] ?? [$j['nom']];
    foreach ($formes as $k => $f) {
        $s = acp_fit($f, $px, $p, $max, 0);
        if ($s >= $px * $seuil || $k === count($formes) - 1) return [$f, max($s, min($px * .6, $s))];
    }
    return [$j['nom'], acp_fit($j['nom'], $px, $p, $max, 0)];
}
/* nom d'adversaire qui tient dans $max : sigles pour les mots longs (« ENTENTE SPORTIVE » → « ES »), sinon réduit */
function acp_adv(string $adv, float $px, string $p, float $max, float $min = .7): array {
    $s = $px; while ($s > $px * $min && acp_l($adv, $s, $p) > $max) $s -= .5;
    if (acp_l($adv, $s, $p) <= $max) return [$adv, $s];
    $court = $adv;
    foreach (['/\bENTENTE SPORTIVE\b/u' => 'ES', '/\bUNION SPORTIVE\b/u' => 'US', '/\bASSOCIATION SPORTIVE\b/u' => 'AS', '/\bFOOTBALL CLUB\b/u' => 'FC',
              '/\bSPORTING CLUB\b/u' => 'SC', '/\bOLYMPIQUE\b/u' => 'O.', '/\bAVENIR SPORTIF\b/u' => 'AS', '/\bSAINTE\b/u' => 'STE', '/\bSAINT\b/u' => 'ST', '/\bFOOTBALL\b/u' => 'FOOT'] as $re => $b) {
        $court = preg_replace($re, $b, $court);
        if (acp_l($court, $px * $min, $p) <= $max) break;
    }
    return [$court, acp_fit($court, $px, $p, $max, 0)];
}
/* la date et l'heure en une ligne : « Samedi 10 octobre · 18h00 » */
function acp_quand(array $D, bool $heure = true): string {
    $q = $D['quand'];
    if ($heure && $D['heure'] !== '') $q .= ($q !== '' ? ' · ' : '') . $D['heure'];
    return $q;
}
/* les jetons des titulaires sur un terrain : $P(u, v) → [x, y, échelle]. Chaque étiquette (sous son jeton) garde une
   largeur qui ne mord pas sur ses voisines ; si elle touche le jeton du dessous, ce jeton descend un peu (jusqu'à $yMax),
   sinon tous les jetons rapetissent. $larg(joueur) : largeur voulue de l'étiquette.
   Renvoie [[x, y, d, largeur max, joueur, poste], …] */
function acp_jetons(array $D, callable $P, float $d0, float $hLab, float $ecart, callable $larg, float $yMax, float $wMax = 240): array {
    $postes = ACP_FORMATIONS[$D['formation']] ?? [];
    $pos0 = [];
    foreach ($D['tit'] as $i => $t) {
        if (!isset($postes[$i])) continue;
        $p = $P($postes[$i][1] / 100, $postes[$i][2] / 100);
        $pos0[$i] = ['x' => $p[0], 'y' => $p[1], 'k' => $p[2] ?? 1, 't' => $t, 'poste' => $postes[$i][0], 'w' => $t ? $larg($t) : 0];
    }
    $lim = function (array $pos, int $i, float $d) use ($hLab, $wMax): float {      // largeur permise de l'étiquette
        $a = $pos[$i]; $m = $wMax;
        foreach ($pos as $j => $b) if ($j !== $i && abs($b['y'] - $a['y']) < $d * .9 + $hLab) $m = min($m, abs($b['x'] - $a['x']) - 12);
        return max(92, $m);
    };
    for ($d = $d0; ; $d -= 2) {
        $pos = $pos0; $ok = true;
        for ($tour = 0; $tour < 12; $tour++) {
            $ok = true;
            foreach ($pos as $i => $a) {
                if (!$a['t']) continue;
                $hw = min($a['w'], $lim($pos, $i, $d)) / 2;
                $lt = $a['y'] + $d * $a['k'] / 2 + $ecart; $lb = $lt + $hLab;
                foreach ($pos as $j => $b) {
                    if ($j === $i) continue;
                    $db = $d * $b['k'];
                    if ($b['y'] - $db / 2 < $lb + 3 && $b['y'] + $db / 2 > $lt && abs($b['x'] - $a['x']) < $hw + $db / 2) {
                        $ok = false;
                        $bas = $lb + 3 + $db / 2;                         // le jeton du dessous descend sous l'étiquette
                        if ($b['y'] > $a['y'] && $bas <= $yMax) $pos[$j]['y'] = $bas;
                    }
                }
            }
            if ($ok) break;
        }
        if ($ok || $d <= $d0 * .8) break;
    }
    $o = [];
    foreach ($pos as $i => $a) $o[$i] = [$a['x'], $a['y'], $d * $a['k'], $lim($pos, $i, $d), $a['t'], $a['poste']];
    return $o;
}
/* ================= points d'entrée ================= */
/* affiche des convoqués (story 1080 x 1920) */
function acp_convocation(array $compo, string $style = 'nuit', array $opts = []) {
    return acp_dessiner('convocation', $compo, $style, $opts);
}
/* affiche de la composition de départ (story 1080 x 1920) */
function acp_composition(array $compo, string $style = 'nuit', array $opts = []) {
    return acp_dessiner('composition', $compo, $style, $opts);
}
function acp_dessiner(string $quoi, array $compo, string $style, array $opts) {
    if (!isset(ACP_STYLES[$style])) $style = 'nuit';
    $h = $GLOBALS['aff_h'] ?? null; $GLOBALS['aff_h'] = ACP_H;           // les outils du stade de nuit lisent le format courant
    $D = acp_donnees($compo, $opts);
    $titre = acp_propre($opts['titre'] ?? '', 40);                         // titre choisi dans l'espace club (facultatif)
    $D['titre'] = $titre !== '' ? $titre : ($quoi === 'convocation' ? 'Convocation' : 'La compo');
    try {
        $f = "acp_{$style}_{$quoi}";
        $im = $f($D, $opts);
    } finally { $GLOBALS['aff_h'] = $h ?? AFF_H; }
    return $im;
}

/* ================= style « stade de nuit » ================= */
/* le fond des affiches du club (stade, ballon), son voile, le bandeau du haut, le blason et « 1923 », et le bas */
function acp_nuit_fond(array $D, array $opts): array {
    $l = $D['lieu']; $F = AFN_FORMATS['story']; $W = ACP_W; $H = ACP_H;
    $A = ['fmt' => 'story', 'F' => $F, 'lieu' => $l, 'acc' => AFN_ACC[$l][0], 'accl' => AFN_ACC[$l][1], 'metal' => AFN_METAL[$l]];
    $im = imagecreatetruecolor($W, $H); imagealphablending($im, true);
    aff_rect($im, 0, 0, $W, $H, aff_c($im, '#030817'));
    $fond = afn_fond($l);
    if ($fond && ($src = aff_image($fond))) {                          // même cadrage que la story du jour de match
        [$cx, $cy, $r] = AFN_BALLON['story']; $k = imagesx($src) / AFN_MAITRE['W'];
        $s = $r / (AFN_MAITRE['r'] * $k); $sw = $W / $s; $sh = $H / $s;
        $sx = max(0, min(imagesx($src) - $sw, AFN_MAITRE['bx'] * $k - $cx / $s));
        $sy = max(0, min(imagesy($src) - $sh, AFN_MAITRE['by'] * $k - $cy / $s));
        imagecopyresampled($im, $src, 0, 0, (int) round($sx), (int) round($sy), $W, $H, (int) round($sw), (int) round($sh));
        imagedestroy($src);
    } else aff_degrade_vertical($im, 0, $H, [[0, '#0B1A45', 1], [.5, '#071030', 1], [1, '#030817', 1]]);
    $A['im'] = $im;
    // voile : sombre en haut, léger sur le ballon, de plus en plus dense sous le contenu ; côté gauche assombri sous les titres
    $v = [[0, .9], [240, .4], [330, .12], [560, 0], [700, .62], [860, .86], [$H, .92]];
    for ($y = 0; $y < $H; $y++) {
        for ($i = 0; $i < count($v) - 2 && $y > $v[$i + 1][0]; $i++);
        [$y0, $o0] = $v[$i]; [$y1, $o1] = $v[$i + 1];
        $o = $o0 + ($o1 - $o0) * max(0, min(1, ($y - $y0) / max(1, $y1 - $y0)));
        if ($o > .003) imageline($im, 0, $y, $W - 1, $y, afn_c($im, [3, 8, 23], $o));
    }
    for ($x = 0; $x < $W * .64; $x++) {
        $t = $x / $W; $o = $t < .44 ? .7 - (.7 - .35) * $t / .44 : .35 * (1 - ($t - .44) / .20);
        imageline($im, $x, 0, $x, 760, afn_c($im, [3, 8, 23], $o));
    }
    afn_tete($A);
    // bandeau : saison · site · compte Instagram (comme les autres affiches)
    $B = $F['barre']; $s = $B * .36; $sp = $s * .82;
    aff_rect($im, 0, 0, $W, $B, aff_c($im, '#050B1F'));
    aff_rect($im, 0, $B - 3, $W, 3, aff_c($im, $A['acc']));
    $an = (int) date('Y') - ((int) date('n') < 8 ? 1 : 0);
    $g = "SAISON $an-" . ($an + 1); $m = 'ASF-PIERRELATTE.FR'; $d = '@ASFP.OFFICIEL';
    $wg = afn_larg($g, $sp, '800', $sp * .18); $wm = afn_larg($m, $s, '800', $s * .14); $wd = afn_larg($d, $sp, '800', $sp * .18);
    $esp = ($W - 68 - $wg - $wm - $wd) / 2;
    afn_texte($im, $g, 34, $B / 2 + .4 * $sp, $sp, '800', aff_c($im, $A['accl']), 'left', $sp * .18);
    afn_texte($im, $m, 34 + $wg + $esp, $B / 2 + .4 * $s, $s, '800', aff_c($im, '#FFFFFF'), 'left', $s * .14);
    afn_texte($im, $d, $W - 34 - $wd, $B / 2 + .4 * $sp, $sp, '800', aff_c($im, $A['accl']), 'left', $sp * .18);
    afn_partenaires($A, !empty($opts['sponsors']));
    return $A;
}
/* titres à gauche du ballon : sur-titre, grand titre blanc, équipe en « métal », puis la date */
function acp_nuit_titres(array $T, array $A, string $titre, string $equipe, string $date): float {
    $x = 46; $max = 610; $y = 262;
    $fs = 20; $sur = "ATOM'SPORTS FOOTBALL PIERRELATTE";
    acp_boite($T, $x, $y + (1.424 * $fs - 3) / 2, 40, 3, 0, ['v', $A['metal']]);
    acp_t($T, $sur, $x + 54, $y + 1.024 * $fs, $fs, 's800', $A['accl'], 'left', $fs * .2);
    $y += 1.424 * $fs + 10;
    $t1 = aff_maj($titre); $s1 = acp_fit($t1, 136, '900i', $max, .5);
    acp_ombre_t($T, $t1, $x, $y + .83 * $s1, $s1, '900i', 6, 30, .55);
    acp_t($T, $t1, $x, $y + .83 * $s1, $s1, '900i', '#FFFFFF');
    $y += .86 * $s1 + 6;
    $t2 = aff_maj($equipe); $s2 = acp_fit($t2, 78, '900i', $max, .5);
    acp_ombre_t($T, $t2, $x, $y + .875 * $s2, $s2, '900i', 4, 18, .5);
    acp_degrade_t($T, $t2, $x, $y + .875 * $s2, $s2, '900i', $A['metal']);
    $y += .95 * $s2 + 28;
    if ($date !== '') {
        $fd = acp_fit($date, 32, 's700', $max, .7);
        acp_ombre_t($T, $date, $x, $y + 1.024 * $fd, $fd, 's700', 2, 12, .9);
        acp_t($T, $date, $x, $y + 1.024 * $fd, $fd, 's700', '#FFFFFF');
        $y += 1.424 * $fd;
    }
    return $y;
}
/* pastille « À DOMICILE » (maison) ou « À L'EXTÉRIEUR » (avion) */
function acp_nuit_pastille(array $T, array $A, bool $dom, float $x, float $y, float $hp = 48): float {
    $lib = $dom ? 'À DOMICILE' : "À L'EXTÉRIEUR"; $px = $hp * .5;
    $w = $hp * .32 + $hp * .54 + $hp * .2 + acp_l($lib, $px, '900', $px * .07) + $hp * .44;
    acp_ombre($T, $x, $y, $w, $hp, $hp / 2, 14, .45, 6);
    acp_boite($T, $x, $y, $w, $hp, $hp / 2, ['v', $A['metal']]);
    acp_icone($T, $dom ? 'maison' : 'avion', $x + $hp * .32, $y + $hp * .23, $hp * .54, '#0B1633');
    acp_t($T, $lib, $x + $hp * (.32 + .54 + .2), $y + $hp / 2 + .36 * $px, $px, '900', '#0B1633', 'left', $px * .07);
    return $w;
}
/* carte bleu nuit (comme les cartes des autres affiches), avec ou sans en-tête rayé */
function acp_nuit_carte(array $T, array $A, float $x, float $y, float $w, float $h, string $titre = '', float $ht = 58): void {
    $K = ACP_K;
    acp_ombre($T, $x, $y, $w, $h, 22, 30, .5, 12);
    afn_carte($T['im'], $x * $K, $y * $K, $w * $K, $h * $K, 22 * $K, $K, 'v', .94, .94);
    if ($titre === '') return;
    afn_coller_raye($T['im'], $x * $K, $y * $K, $w * $K, $ht * $K, [22 * $K, 22 * $K, 0, 0], $K);
    acp_boite($T, $x, $y + $ht - 3, $w, 3, 0, $A['acc']);
    $pt = acp_fit($titre, 26, '900', $w - 40, .6, .14);
    acp_tc($T, $titre, $x + $w / 2, $y + ($ht - 3) / 2, $pt, '900', '#FFFFFF', 'center', $pt * .14);
}
/* l'affiche entre deux équipes : [blason] PIERRELATTE … ADVERSAIRE [blason], l'équipe qui reçoit à gauche */
function acp_nuit_duel(array $T, array $A, array $D, float $x, float $y, float $w, float $h, float $d, string $centre, string $sous = ''): void {
    $nous = ['nom' => 'PIERRELATTE', 'brut' => '', 'club' => true];
    $cy = $y + $h / 2; $mil = 150; $cote = ($w - $mil) / 2;
    $eux = ['nom' => acp_adv($D['adv'], 36 * .8, '700', ($cote - $d - 22) * 1.6, 1)[0], 'brut' => $D['adv_brut'], 'club' => false];
    foreach ([[$D['dom'] ? $nous : $eux, 'g'], [$D['dom'] ? $eux : $nous, 'd']] as [$e, $s]) {
        $bx = $s === 'g' ? $x + $d / 2 : $x + $w - $d / 2;
        acp_blason($T, $e['brut'], $e['club'], $bx, $cy, $d);
        $max = $cote - $d - 22;
        $tx = $s === 'g' ? $x + $d + 18 : $x + $w - $d - 18;
        acp_nom_bloc($T, $e['nom'], $tx, $cy, $max, 36, $e['club'] ? '800' : '700', $e['club'] ? '#FFFFFF' : '#D3DDF4', $s === 'g' ? 'left' : 'right');
    }
    $mx = $x + $w / 2;
    if ($sous === '') { acp_degrade_t($T, $centre, $mx, $cy + .35 * 54, 54, '900i', $A['metal'], 'center'); return; }
    acp_degrade_t($T, $centre, $mx, $cy + 6, 50, '900i', $A['metal'], 'center');
    acp_t($T, $sous, $mx, $cy + 36, 15, 's800', $A['accl'], 'center', 15 * .18);
}
/* nom d'équipe sur une ou deux lignes, centré sur $cy */
function acp_nom_bloc(array $T, string $nom, float $x, float $cy, float $max, float $px, string $p, string $hex, string $align): void {
    $s = $px;
    while ($s > $px * .72 && acp_l($nom, $s, $p) > $max + 1) $s -= .5;
    if (acp_l($nom, $s, $p) <= $max + 1 || !str_contains($nom, ' ')) {
        acp_tc($T, $nom, $x, $cy, acp_fit($nom, $s, $p, $max, 0), $p, $hex, $align);
        return;
    }
    $s2 = $px * .8;
    [$l1, $l2] = afn_deux_lignes($nom, $s2 * ACP_K, $p, $max * ACP_K);
    $s2 = min(acp_fit($l1, $s2, $p, $max, 0), acp_fit($l2, $s2, $p, $max, 0));
    acp_tc($T, $l1, $x, $cy - .5 * $s2, $s2, $p, $hex, $align);
    acp_tc($T, $l2, $x, $cy + .5 * $s2, $s2, $p, $hex, $align);
}
/* ligne d'information : icône + texte en capitales (lieu, rendez-vous) */
function acp_nuit_info(array $T, array $A, string $icone, string $etiquette, string $texte, float $x, float $cy, float $max, float $px = 22): void {
    $ic = $px * 1.05;
    acp_icone($T, $icone, $x, $cy - $ic / 2, $ic, $A['acc'], '#081230');
    $tx = $x + $ic + 12;
    if ($etiquette !== '') $tx += acp_tc($T, $etiquette, $tx, $cy, $px * 1.15, '900', '#FFFFFF', 'left', $px * .05) + 12;
    $t = aff_maj($texte);
    $s = acp_fit($t, $px, 's700', $x + $max - $tx, .75, .06);
    acp_tc($T, acp_coupe($t, $s, 's700', $x + $max - $tx), $tx, $cy, $s, 's700', $A['accl'], 'left', $s * .06);
}
/* liste des joueurs en colonnes : numéro dans une pastille « métal », nom, brassard « C » */
function acp_nuit_joueurs(array $T, array $A, array $liste, float $x, float $y, float $w, float $h): void {
    $avecNum = (bool) array_filter($liste, fn($j) => $j['num'] !== '');
    $noms = array_map(fn($j) => $j['nom'] . ($j['cap'] ? ' C' : ''), $liste);
    $g = acp_grille($noms, $w, $h, 44, '800', $avecNum ? 1.75 : .9, 28, 1.62);
    $px = $g['px']; $lh = $g['lh']; $top = $y + ($h - $g['rows'] * $lh) / 2;
    foreach ($liste as $i => $j) {
        $c = intdiv($i, $g['rows']); $r = $i % $g['rows'];
        $cx = $x + $c * ($g['cw'] + 28); $cy = $top + $r * $lh + $lh / 2;
        if ($c === 0 && $r > 0) acp_boite($T, $x, $top + $r * $lh, $w, 1, 0, '#FFFFFF', .07);
        $tx = $cx;
        if ($avecNum) {
            $bw = $px * 1.32; $bh = $px * 1.12;
            if ($j['num'] !== '') {
                acp_boite($T, $cx, $cy - $bh / 2, $bw, $bh, $bh * .22, ['v', $A['metal']]);
                $pn = acp_fit($j['num'], $px * .78, '900i', $bw - 6, .7);
                acp_tc($T, $j['num'], $cx + $bw / 2 - 1, $cy, $pn, '900i', '#0B1633', 'center');
            } else acp_boite($T, $cx + $bw / 2 - $px * .14, $cy - $px * .14, $px * .28, $px * .28, $px * .14, $A['acc'], .8);
            $tx += $bw + $px * .38;
        } else {
            acp_boite($T, $cx + 2, $cy - $px * .12, $px * .24, $px * .24, $px * .12, $A['acc']);
            $tx += $px * .62;
        }
        $capW = $j['cap'] ? $px * .95 : 0;
        [$nom, $s] = acp_forme($j, $px, '800', $cx + $g['cw'] - $tx - $capW);
        $wn = acp_tc($T, $nom, $tx, $cy, $s, '800', '#FFFFFF');
        if ($j['cap']) acp_brassard($T, $tx + $wn + $px * .5, $cy, $px * .74, $A['acc'], '#0B1633');
    }
}
/* brassard de capitaine : pastille ronde « C » */
function acp_brassard(array $T, float $cx, float $cy, float $d, string $fond, string $texte): void {
    acp_rond($T, $cx, $cy, $d, $fond);
    acp_tc($T, 'C', $cx + .5, $cy, $d * .66, '900', $texte, 'center');
}
/* le mot du coach : deux lignes au plus, entre guillemets */
function acp_nuit_mot(array $T, array $A, string $msg, float $x, float $y, float $w): float {
    if ($msg === '') return 0;
    acp_t($T, 'LE MOT DU COACH', $x, $y + 15, 15, 's800', $A['accl'], 'left', 15 * .22);
    $l = acp_lignes('« ' . $msg . ' »', 27, 's700i', $w, 2);
    foreach ($l as $i => $t) acp_t($T, $t, $x, $y + 30 + 30 + $i * 36, 27, 's700i', '#E6ECFA');
    return 30 + count($l) * 36 + 6;
}
function acp_nuit_convocation(array $D, array $opts) {
    $A = acp_nuit_fond($D, $opts); $T = acp_toile($A['im']);
    $yb = acp_nuit_titres($T, $A, $D['titre'], $D['equipe'], acp_quand($D));
    acp_nuit_pastille($T, $A, $D['dom'], 46, $yb + 14);
    // carte du match : les deux équipes, puis le stade et le rendez-vous
    $x = 30; $w = ACP_W - 60; $y = 744;
    $infos = [];
    if ($D['stade'] !== '') $infos[] = ['lieu', '', $D['stade']];
    if ($D['rdv'] !== '' || $D['rdvLieu'] !== '') $infos[] = ['horloge', 'RDV ' . ($D['rdv'] !== '' ? $D['rdv'] : ''), $D['rdvLieu']];
    $hDuel = 132; $hInfo = 50; $hA = 20 + $hDuel + ($infos ? 14 + count($infos) * $hInfo + 10 : 20);
    acp_nuit_carte($T, $A, $x, $y, $w, $hA);
    acp_nuit_duel($T, $A, $D, $x + 26, $y + 20, $w - 52, $hDuel, 104, 'VS');
    if ($infos) {
        $iy = $y + 20 + $hDuel + 14;
        acp_boite($T, $x, $iy - 6, $w, 1, 0, '#FFFFFF', .1);
        foreach ($infos as $k => [$ic, $et, $tx]) acp_nuit_info($T, $A, $ic, $et, $tx, $x + 34, $iy + $k * $hInfo + $hInfo / 2 + 2, $w - 68);
    }
    // carte des convoqués
    $y2 = $y + $hA + 22; $h2 = ACP_SURE[1] - 6 - $y2; $ht = 60;
    $n = count($D['conv']);
    acp_nuit_carte($T, $A, $x, $y2, $w, $h2, $n ? ($n > 1 ? "LES $n CONVOQUÉS" : 'LE CONVOQUÉ') : 'CONVOCATION', $ht);
    $hm = 0;
    if ($D['message'] !== '') {
        $l = acp_lignes('« ' . $D['message'] . ' »', 27, 's700i', $w - 68, 2);
        $hm = 30 + count($l) * 36 + 24;
    }
    $ly = $y2 + $ht + 14; $lh = $h2 - $ht - 14 - 16 - $hm;
    if ($n) acp_nuit_joueurs($T, $A, $D['conv'], $x + 34, $ly, $w - 68, $lh);
    else acp_tc($T, 'LISTE À VENIR', ACP_W / 2, $ly + $lh / 2, 40, '900i', '#FFFFFF', 'center');
    if ($hm) {
        $my = $y2 + $h2 - $hm;
        acp_boite($T, $x, $my, $w, 1, 0, '#FFFFFF', .1);
        acp_nuit_mot($T, $A, $D['message'], $x + 34, $my + 16, $w - 68);
    }
    return acp_fin($T);
}
/* terrain en perspective : (u, v) entre 0 et 1 (v = 0 au but adverse) → pixels ; $r = largeur du fond / largeur du devant */
function acp_persp(float $cx, float $y0, float $y1, float $wb, float $r): callable {
    return function (float $u, float $v) use ($cx, $y0, $y1, $wb, $r): array {
        $iz = $r / (1 - $v + $r * $v);                                   // 1 / profondeur : r au fond, 1 devant
        $g = ($iz - $r) / (1 - $r);
        return [$cx + ($u - .5) * $wb * $iz, $y0 + ($y1 - $y0) * $g, $iz];
    };
}
/* pelouse rayée et lignes blanches d'un terrain entier, vu par $P (perspective ou plat) */
function acp_pelouse(array $T, callable $P, array $teintes, string $ligne, float $opL, float $ep, int $bandes = 12): void {
    $m = .035;                                                           // bord de pelouse autour des lignes
    for ($i = 0; $teintes && $i < $bandes; $i++) {
        $v0 = -$m + (1 + 2 * $m) * $i / $bandes; $v1 = -$m + (1 + 2 * $m) * ($i + 1) / $bandes;
        [$a, $b] = $P(-$m * 1.6, $v0); [$c, $d] = $P(1 + $m * 1.6, $v0); [$e, $f] = $P(1 + $m * 1.6, $v1); [$g, $h] = $P(-$m * 1.6, $v1);
        acp_poly($T, [$a, $b, $c, $d, $e, $f, $g, $h], $teintes[$i % 2]);
    }
    $seg = function (array $pts) use ($T, $P, $ligne, $opL, $ep) {   // [[u, v], …] → polyligne
        $o = []; foreach ($pts as [$u, $v]) { [$x, $y] = $P($u, $v); $o[] = $x; $o[] = $y; }
        acp_polyligne($T, $o, $ep, $ligne, $opL);
    };
    $rect = function (float $u0, float $v0, float $u1, float $v1) use ($seg) {
        $pts = [];
        foreach ([[$u0, $v0, $u1, $v0], [$u1, $v0, $u1, $v1], [$u1, $v1, $u0, $v1], [$u0, $v1, $u0, $v0]] as [$a, $b, $c, $d])
            for ($k = 0; $k <= 8; $k++) $pts[] = [$a + ($c - $a) * $k / 8, $b + ($d - $b) * $k / 8];
        $seg($pts);
    };
    $rect(0, 0, 1, 1);
    $seg([[0, .5], [1, .5]]);
    $ry = 9.15 / 105; $rx = 9.15 / 68; $pts = [];
    for ($k = 0; $k <= 48; $k++) { $a = 2 * M_PI * $k / 48; $pts[] = [.5 + $rx * cos($a), .5 + $ry * sin($a)]; }
    $seg($pts);
    foreach ([0, 1] as $bout) {
        $s = $bout ? -1 : 1; $b = (float) $bout;
        $rect(.5 - 20.16 / 68, $b, .5 + 20.16 / 68, $b + $s * 16.5 / 105);
        $rect(.5 - 9.16 / 68, $b, .5 + 9.16 / 68, $b + $s * 5.5 / 105);
        $pts = [];                                                       // arc de la surface
        for ($k = 0; $k <= 20; $k++) {
            $a = deg2rad(-53 + 106 * $k / 20);
            $pts[] = [.5 + $rx * sin($a), $b + $s * (11 / 105 + $ry * cos($a))];
        }
        $pts = array_values(array_filter($pts, fn($p) => $bout ? $p[1] <= 1 - 16.5 / 105 : $p[1] >= 16.5 / 105));
        if (count($pts) > 1) $seg($pts);
        [$px, $py] = $P(.5, $b + $s * 11 / 105); acp_rond($T, $px, $py, $ep * 2.2, $ligne, $opL);
    }
    [$px, $py] = $P(.5, .5); acp_rond($T, $px, $py, $ep * 2.2, $ligne, $opL);
}
function acp_nuit_composition(array $D, array $opts) {
    $A = acp_nuit_fond($D, $opts); $T = acp_toile($A['im']);
    $yb = acp_nuit_titres($T, $A, $D['titre'], $D['equipe'], acp_quand($D, false) . ($D['heure'] !== '' ? ' · Coup d\'envoi ' . $D['heure'] : ''));
    acp_nuit_pastille($T, $A, $D['dom'], 46, $yb + 14);
    $x = 30; $w = ACP_W - 60; $y = 744;
    // remplaçants en bas
    $remp = $D['remp']; $hR = 0;
    if ($remp) {
        $lignes = acp_nuit_puces_lignes($remp, $w - 52, 30);
        $hR = 58 + 18 + count($lignes['l']) * 56 + 8;
        if ($hR > 260) { $lignes = acp_nuit_puces_lignes($remp, $w - 52, 24); $hR = 58 + 18 + count($lignes['l']) * 48 + 8; }
    }
    $hP = ACP_SURE[1] - 6 - $y - ($hR ? $hR + 18 : 0);
    [$adv] = acp_adv($D['adv'], 26, '900', $w - 40 - acp_l('PIERRELATTE  —  ', 26, '900', 26 * .14) - 26 * .14 * mb_strlen($D['adv']), .75);
    acp_nuit_carte($T, $A, $x, $y, $w, $hP, $D['dom'] ? 'PIERRELATTE  —  ' . $adv : $adv . '  —  PIERRELATTE', 58);
    $py0 = $y + 58;
    if ($D['terrain']) {
        // le terrain en perspective, dans la carte
        $K = ACP_K; $marge = 22;
        $P = acp_persp(ACP_W / 2, $py0 + 44, $y + $hP - 44, $w - 2 * $marge - 120, .78);
        acp_pelouse($T, $P, ['#0E3A22', '#124428'], '#FFFFFF', .42, 2.4, 14);
        acp_nuit_joueurs_terrain($T, $A, $D, $P, $y + $hP - 14 - 25 * 1.32 - 8 - 34);
    } else acp_nuit_titulaires_liste($T, $A, $D, $x + 34, $py0 + 20, $w - 68, $hP - 58 - 40);
    if ($hR) {
        $yR = $y + $hP + 18;
        acp_nuit_carte($T, $A, $x, $yR, $w, $hR, count($remp) > 1 ? 'REMPLAÇANTS' : 'REMPLAÇANT', 58);
        acp_nuit_puces($T, $A, $remp, $x + 26, $yR + 58 + 18, $w - 52, $hR - 58 - 26, $lignes);
    }
    return acp_fin($T);
}
/* les titulaires sur le terrain : jeton « métal » numéroté, brassard, nom en dessous ; poste vide en pointillé */
function acp_nuit_joueurs_terrain(array $T, array $A, array $D, callable $P, float $yMax): void {
    $nb = count($D['tit']); $d0 = $nb >= 10 ? 76 : ($nb >= 7 ? 84 : 94); $px = 25;
    $J = acp_jetons($D, function ($u, $v) use ($P) { [$x, $y, $iz] = $P($u, $v); return [$x, $y, .86 + .14 * ($iz - .78) / .22]; },
        $d0, $px * 1.32, 8, fn($t) => acp_l($t['court'], $px, '800') + 22, $yMax);
    $metal = $D['dom'] ? [[0, '#FFF3C4'], [.45, '#F2CD6C'], [1, '#B98A26']] : [[0, '#FFFFFF'], [.45, '#DCE8FB'], [1, '#8EABD9']];
    foreach ($J as [$x, $y, $d, $maxW, $t, $poste]) {
        if (!$t) {                                                        // poste sans joueur
            acp_anneau($T, $x, $y, $d * .84, 3, '#FFFFFF', .45);
            acp_tc($T, $poste, $x, $y, $d * .3, '900', '#FFFFFF', 'center', 0, .6);
            continue;
        }
        acp_ombre($T, $x - $d / 2, $y - $d / 2, $d, $d, $d / 2, 12, .6, 6);
        acp_rond($T, $x, $y, $d + 6, '#FFFFFF', .9);
        acp_rond_degrade($T, $x, $y, $d, $metal);
        $num = $t['num'] !== '' ? $t['num'] : aff_initiales($t['nom']);
        acp_tc($T, $num, $x - 1, $y, acp_fit($num, $d * .5, '900i', $d * .72, .6), '900i', '#0B1633', 'center');
        if ($t['cap']) { acp_rond($T, $x + $d * .38, $y - $d * .36, $d * .38, '#0B1633'); acp_brassard($T, $x + $d * .38, $y - $d * .36, $d * .32, '#FFFFFF', '#0B1633'); }
        // étiquette du nom
        [$n, $s] = acp_forme(['formes' => array_unique([$t['court'], $t['famille'] ?: $t['court']])] + $t, $px, '800', $maxW - 22, .72);
        $lw = acp_l($n, $s, '800') + 22; $lh = $px * 1.32; $ly = $y + $d / 2 + 8;
        $lx = max(40, min(ACP_W - 40 - $lw, $x - $lw / 2));
        acp_boite($T, $lx, $ly, $lw, $lh, $lh / 2, '#050C22', .88);
        acp_tc($T, $n, $lx + $lw / 2, $ly + $lh / 2, $s, '800', '#FFFFFF', 'center');
    }
}
/* titulaires en liste (formation inconnue) */
function acp_nuit_titulaires_liste(array $T, array $A, array $D, float $x, float $y, float $w, float $h): void {
    $tit = array_values(array_filter($D['tit']));
    acp_t($T, 'TITULAIRES', $x, $y + 18, 18, 's800', $A['accl'], 'left', 18 * .22);
    if (!$tit) { acp_tc($T, 'COMPOSITION À VENIR', ACP_W / 2, $y + $h / 2, 40, '900i', '#FFFFFF', 'center'); return; }
    acp_nuit_joueurs($T, $A, $tit, $x, $y + 36, $w, $h - 36);
}
/* remplaçants en pastilles (numéro + nom) réparties en lignes centrées */
function acp_nuit_puces_lignes(array $liste, float $w, float $px): array {
    $lignes = [[]]; $lw = 0;
    foreach ($liste as $j) {
        $pw = acp_nuit_puce_l($j, $px);
        if ($lignes[count($lignes) - 1] && $lw + 12 + $pw > $w) { $lignes[] = []; $lw = 0; }
        $lignes[count($lignes) - 1][] = $j; $lw += ($lw ? 12 : 0) + $pw;
    }
    return ['px' => $px, 'l' => $lignes];
}
function acp_nuit_puce_l(array $j, float $px): float { return ($j['num'] !== '' ? acp_l($j['num'], $px, '900i') + $px * .6 : 0) + acp_l($j['court'], $px * .86, '800') + $px * 1.1; }
function acp_nuit_puces(array $T, array $A, array $remp, float $x, float $y, float $w, float $h, array $L): void {
    $px = $L['px']; $lignes = $L['l']; $ph = $px * 1.55; $gap = (count($lignes) > 1 ? ($h - count($lignes) * $ph) / (count($lignes) - 1) : 0);
    $gap = min($gap, $px * .5); $top = $y + ($h - count($lignes) * $ph - (count($lignes) - 1) * $gap) / 2;
    foreach ($lignes as $k => $ligne) {
        $tw = array_sum(array_map(fn($j) => acp_nuit_puce_l($j, $px), $ligne)) + 12 * (count($ligne) - 1);
        $cx = $x + ($w - $tw) / 2; $cy = $top + $k * ($ph + $gap) + $ph / 2;
        foreach ($ligne as $j) {
            $pw = acp_nuit_puce_l($j, $px);
            acp_boite($T, $cx, $cy - $ph / 2, $pw, $ph, $ph / 2, '#FFFFFF', .08);
            acp_lisere($T, $cx, $cy - $ph / 2, $pw, $ph, $ph / 2, 1.5, $A['accl'], .35);
            $tx = $cx + $px * .55;
            if ($j['num'] !== '') $tx += acp_tc($T, $j['num'], $tx, $cy, $px, '900i', $A['acc']) + $px * .4;
            acp_tc($T, $j['court'], $tx, $cy, $px * .86, '800', '#FFFFFF');
            $cx += $pw + 12;
        }
    }
}

/* ================= style « tableau tactique » ================= */
/* le tableau magnétique du coach : img/fond-tableau.jpg (feutre vert, cadre aluminium, rebord à feutres) ;
   à défaut, un feutre vert uni dans un cadre gris */
const ACP_TAB_FEUTRE = [34, 34, 1046, 1770];                      // la surface verte du fond
const ACP_TAB_ENCRE = '#1B3A8C';                                   // encre bleue du feutre
function acp_tab_fond() {
    $im = imagecreatetruecolor(ACP_W, ACP_H); imagealphablending($im, true);
    $f = dirname(__DIR__) . '/img/fond-tableau.jpg';
    if (is_file($f) && ($src = aff_image($f))) { imagecopyresampled($im, $src, 0, 0, 0, 0, ACP_W, ACP_H, imagesx($src), imagesy($src)); imagedestroy($src); return $im; }
    aff_rect($im, 0, 0, ACP_W, ACP_H, aff_c($im, '#B9BEC6'));
    [$x0, $y0, $x1, $y1] = ACP_TAB_FEUTRE;
    aff_rect($im, $x0, $y0, $x1 - $x0, $y1 - $y0, aff_c($im, '#215F38'));
    aff_rect($im, 0, $y1, ACP_W, ACP_H - $y1, aff_c($im, '#8E949C'));
    return $im;
}
/* aimant rond brillant : ombre portée, dégradé, reflet ; $teinte 'bleu' | 'rouge' | 'jaune' | 'blanc' */
function acp_aimant(array $T, float $cx, float $cy, float $d, string $teinte = 'bleu'): void {
    $deg = ['bleu' => [[0, '#7FA6FF'], [.35, '#2F5FD0'], [.8, '#163A9A'], [1, '#0F2A72']],
            'rouge' => [[0, '#FF9A8E'], [.35, '#E0473A'], [.8, '#A52219'], [1, '#7E1810']],
            'jaune' => [[0, '#FFF6C2'], [.35, '#F7D046'], [.8, '#D9A512'], [1, '#B0820A']],
            'blanc' => [[0, '#FFFFFF'], [.5, '#EEF1F5'], [1, '#B9C0CA']]][$teinte] ?? null;
    acp_ombre($T, $cx - $d / 2, $cy - $d / 2, $d, $d, $d / 2, max(4, $d * .09), .55, $d * .07);
    acp_rond_degrade($T, $cx, $cy, $d, $deg, .32, .26);
    acp_anneau($T, $cx, $cy, $d, max(1.2, $d * .03), '#000000', .18);
    // reflet : croissant clair en haut à gauche
    $im = $T['im']; $K = ACP_K;
    imagefilledellipse($im, (int) round(($cx - $d * .12) * $K), (int) round(($cy - $d * .2) * $K), (int) round($d * .56 * $K), (int) round($d * .34 * $K), acp_col($T, '#FFFFFF', .22));
}
/* bande de papier blanc (étiquette aimantée) avec un texte */
function acp_tab_etiquette(array $T, string $t, float $cx, float $y, float $px, string $p = '800', string $hex = '#0F2257', float $pad = 10, ?float $w = null): float {
    $w = $w ?? acp_l($t, $px, $p) + 2 * $pad; $h = $px * 1.34; $x = max(ACP_TAB_FEUTRE[0] + 10, min(ACP_TAB_FEUTRE[2] - 10 - $w, $cx - $w / 2));
    acp_ombre($T, $x, $y, $w, $h, 3, 5, .45, 3);
    acp_boite($T, $x, $y, $w, $h, 3, ['v', [[0, '#FFFFFF'], [1, '#EDEDE6']]]);
    acp_tc($T, $t, $x + $w / 2, $y + $h / 2, $px, $p, $hex, 'center');
    return $w;
}
/* écriture au feutre (police manuscrite) */
function acp_feutre(array $T, string $t, float $x, float $y, float $px, string $hex, string $align = 'left', float $op = .96): float {
    return acp_t($T, $t, $x, $y, $px, 'script', $hex, $align, 0, $op);
}
/* le post-it jaune (date, heure, lieu), légèrement de travers */
function acp_tab_postit(array $T, array $D, float $x, float $y, float $w, float $h, float $angle): void {
    $K = ACP_K; $m = 30;
    $C = ['im' => afn_calque((int) (($w + 2 * $m) * $K), (int) (($h + 2 * $m) * $K))];
    acp_ombre($C, $m, $m, $w, $h, 2, 9, .45, 7);
    acp_boite($C, $m, $m, $w, $h, 2, ['v', [[0, '#FFF59A'], [.6, '#FCEB6E'], [1, '#F4DA4E']]]);
    acp_boite($C, $m, $m, $w, 22, 0, '#E8CF42', .55);                           // bande collante
    $cx = $m + $w / 2; $encre = '#22264A';
    $l1 = $D['jour'] !== '' ? $D['jour'] . ' ' . preg_replace('/^\D+/u', '', $D['quand']) : 'Match';
    $s1 = acp_fit($l1, 34, 'script', $w - 30, .6);
    acp_t($C, $l1, $cx, $m + 64, $s1, 'script', $encre, 'center');
    $hh = $D['heure'] !== '' ? $D['heure'] : '--h--';
    acp_t($C, $hh, $cx, $m + 64 + 78, acp_fit($hh, 72, 'script', $w - 30, .6), 'script', '#C8312B', 'center');
    $l3 = $D['dom'] ? 'à domicile' : "à l'extérieur";
    acp_t($C, $l3, $cx, $m + $h - 26, acp_fit($l3, 30, 'script', $w - 30, .6), 'script', $encre, 'center');
    $R = imagerotate($C['im'], $angle, imagecolorallocatealpha($C['im'], 0, 0, 0, 127));
    imagedestroy($C['im']);
    imagealphablending($T['im'], true);
    imagecopy($T['im'], $R, (int) round(($x + $w / 2) * $K - imagesx($R) / 2), (int) round(($y + $h / 2) * $K - imagesy($R) / 2), 0, 0, imagesx($R), imagesy($R));
    imagedestroy($R);
}
/* en-tête au feutre blanc : titre, puis l'étiquette de l'équipe et « contre [blason] ADVERSAIRE » (à gauche du post-it) */
function acp_tab_tete(array $T, array $D, string $titre): float {
    $x = 80; $max = 680;
    acp_feutre($T, $titre, $x, 338, acp_fit($titre, 104, 'script', $max, .6), '#FFFFFF');
    $y = 376; $ph = 32; $hh = $ph * 1.34; $cy = $y + $hh / 2;
    $eq = aff_maj($D['equipe']);
    $w = acp_tab_etiquette($T, $eq, $x + (acp_l($eq, $ph, '900') + 28) / 2, $y, $ph, '900', '#0F2257', 14);
    $cx = $x + $w + 22;
    $cx += acp_feutre($T, $D['dom'] ? 'contre' : 'chez', $cx, $cy + 8, 32, '#FFFFFF') + 14;
    acp_blason($T, $D['adv_brut'], false, $cx + 24, $cy, 46); $cx += 60;
    [$adv, $s] = acp_adv($D['adv'], 32, '800', $x + $max - $cx, .62);
    acp_tc($T, $adv, $cx, $cy, $s, '800', '#FFFFFF');
    return $y + $hh;
}
/* le terrain imprimé sur le tableau : lignes blanches (vue à plat) */
function acp_tab_terrain(array $T, float $x, float $y, float $w, float $h): callable {
    $P = fn($u, $v) => [$x + $u * $w, $y + $v * $h, 1];
    acp_pelouse($T, $P, [], '#FFFFFF', .8, 3.2);
    return $P;
}
function acp_tableau_composition(array $D, array $opts) {
    $T = acp_toile(acp_tab_fond());
    acp_tab_postit($T, $D, 770, 236, 230, 210, -4);
    $yb = acp_tab_tete($T, $D, $D['titre']);
    // remplaçants en bas : aimants plus petits, étiquettes
    $remp = $D['remp']; $hR = 0;
    if ($remp) { $L = acp_tab_bancs($remp, 900); $hR = 70 + count($L['l']) * $L['lh']; }
    $y0 = $yb + 26; $y1 = ACP_SURE[1] - ($hR ? $hR + 20 : 10);
    if ($D['terrain']) {
        $h = $y1 - $y0; $w = min(900, $h * .86); $x = (ACP_W - $w) / 2;
        $P = acp_tab_terrain($T, $x, $y0, $w, $h);
        $px = 24; $nb = count($D['tit']); $d0 = $nb >= 10 ? 74 : ($nb >= 7 ? 84 : 94);
        $J = acp_jetons($D, $P, $d0, $px * 1.34, 7, fn($t) => acp_l($t['court'], $px, '800') + 20, $y1 - 10 - $px * 1.34 - 7 - 30);
        foreach ($J as [$jx, $jy, $d, $maxW, $t, $poste]) {
            if (!$t) {
                acp_anneau($T, $jx, $jy, $d * .8, 3, '#FFFFFF', .7);
                acp_feutre($T, $poste, $jx, $jy + 12, $d * .34, '#FFFFFF', 'center', .85);
                continue;
            }
            acp_aimant($T, $jx, $jy, $d, 'bleu');
            $num = $t['num'] !== '' ? $t['num'] : aff_initiales($t['nom']);
            acp_tc($T, $num, $jx, $jy, acp_fit($num, $d * .48, '900', $d * .7, .6), '900', '#FFFFFF', 'center');
            if ($t['cap']) { acp_aimant($T, $jx + $d * .4, $jy - $d * .36, $d * .4, 'jaune'); acp_tc($T, 'C', $jx + $d * .4, $jy - $d * .36, $d * .26, '900', '#5A3E00', 'center'); }
            [$n, $s] = acp_forme(['formes' => array_unique([$t['court'], $t['famille'] ?: $t['court']])] + $t, $px, '800', $maxW - 20, .72);
            $lw = acp_l($n, $s, '800') + 20;
            acp_tab_etiquette($T, $n, $jx, $jy + $d / 2 + 7, $s, '800', '#0F2257', 10, $lw);
        }
    } else acp_tab_liste_titulaires($T, $D, 80, $y0 + 34, 920, $y1 - $y0 - 34);     // sous le post-it
    if ($hR) {
        $yR = $y1 + 20;
        acp_feutre($T, count($remp) > 1 ? 'Remplaçants' : 'Remplaçant', 80, $yR + 44, 46, '#FFFFFF');
        acp_boite($T, 80, $yR + 58, 300, 3, 1.5, '#FFFFFF', .7);
        acp_tab_banc($T, $remp, 90, $yR + 72, 900, $L);
    }
    return acp_fin($T);
}
/* remplaçants : petits aimants et étiquettes, répartis en lignes */
function acp_tab_bancs(array $remp, float $w): array {
    foreach ([[24, 52], [21, 46], [19, 42]] as [$px, $d]) {
        $l = [[]]; $lw = 0;
        foreach ($remp as $j) {
            $jw = acp_tab_banc_l($j, $px, $d);
            if ($l[count($l) - 1] && $lw + 18 + $jw > $w) { $l[] = []; $lw = 0; }
            $l[count($l) - 1][] = $j; $lw += ($lw ? 18 : 0) + $jw;
        }
        if (count($l) <= 2) break;
    }
    return ['l' => $l, 'px' => $px, 'd' => $d, 'lh' => $d + 18];
}
function acp_tab_banc_l(array $j, float $px, float $d): float { return $d + 10 + acp_l($j['court'], $px, '800') + 14; }
function acp_tab_banc(array $T, array $remp, float $x, float $y, float $w, array $L): void {
    $px = $L['px']; $d = $L['d']; $lh = $px * 1.34;
    foreach ($L['l'] as $k => $ligne) {
        $cx = $x; $cy = $y + $k * $L['lh'] + $d / 2 + 4;
        foreach ($ligne as $j) {
            $jw = acp_tab_banc_l($j, $px, $d); $ex = $cx + $d / 2;           // l'étiquette part du centre de l'aimant
            acp_ombre($T, $ex, $cy - $lh / 2, $jw - $d / 2, $lh, 3, 5, .45, 3);
            acp_boite($T, $ex, $cy - $lh / 2, $jw - $d / 2, $lh, 3, ['v', [[0, '#FFFFFF'], [1, '#EDEDE6']]]);
            acp_tc($T, $j['court'], $cx + $d + 10, $cy, $px, '800', '#0F2257');
            acp_aimant($T, $cx + $d / 2, $cy, $d, 'bleu');
            $num = $j['num'] !== '' ? $j['num'] : aff_initiales($j['nom']);
            acp_tc($T, $num, $cx + $d / 2, $cy, acp_fit($num, $d * .46, '900', $d * .7, .6), '900', '#FFFFFF', 'center');
            $cx += $jw + 18;
        }
    }
}
/* titulaires en liste sur une feuille (formation inconnue) */
function acp_tab_liste_titulaires(array $T, array $D, float $x, float $y, float $w, float $h): void {
    $tit = array_values(array_filter($D['tit']));
    acp_tab_feuille($T, $x, $y, $w, $h);
    acp_t($T, 'TITULAIRES', $x + 40, $y + 84, 34, '900', '#0F2257', 'left', 34 * .06);
    acp_boite($T, $x + 40, $y + 100, $w - 80, 3, 0, '#0F2257');
    if (!$tit) { acp_feutre($T, 'Composition à venir', $x + $w / 2, $y + $h / 2, 48, ACP_TAB_ENCRE, 'center'); return; }
    acp_tab_lignes($T, $tit, $x + 40, $y + 116, $w - 80, $h - 146, false);
}
/* feuille de papier aimantée : ombre douce, deux aimants en haut */
function acp_tab_feuille(array $T, float $x, float $y, float $w, float $h): void {
    acp_ombre($T, $x, $y, $w, $h, 3, 16, .55, 10);
    acp_boite($T, $x, $y, $w, $h, 3, ['v', [[0, '#FFFFFF'], [1, '#F4F2EA']]]);
    acp_aimant($T, $x + 46, $y + 22, 40, 'rouge');
    acp_aimant($T, $x + $w - 46, $y + 22, 40, 'bleu');
}
/* lignes réglées de la feuille : numéro dans une case, nom, coche bleue ; brassard entouré au feutre rouge */
function acp_tab_lignes(array $T, array $liste, float $x, float $y, float $w, float $h, bool $coches = true): float {
    $avecNum = (bool) array_filter($liste, fn($j) => $j['num'] !== '');
    $noms = array_map(fn($j) => $j['nom'] . ($j['cap'] ? ' (C)' : ''), $liste);
    $g = acp_grille($noms, $w, $h, 42, '800', ($avecNum ? 1.55 : .4) + ($coches ? .9 : 0), 34, 1.7);
    $px = $g['px']; $lh = $g['lh'];
    foreach ($liste as $i => $j) {
        $c = intdiv($i, $g['rows']); $r = $i % $g['rows'];
        $cx = $x + $c * ($g['cw'] + 34); $cy = $y + $r * $lh + $lh / 2;
        acp_boite($T, $cx, $y + ($r + 1) * $lh - 1, $g['cw'], 1.5, 0, '#8FA6D6', .55);          // ligne réglée
        $tx = $cx;
        if ($avecNum) {
            $bw = $px * 1.2;
            acp_lisere($T, $cx, $cy - $bw / 2, $bw, $bw, 3, 2, '#0F2257', .8);
            if ($j['num'] !== '') acp_tc($T, $j['num'], $cx + $bw / 2, $cy, acp_fit($j['num'], $px * .72, '900', $bw - 6, .6), '900', '#0F2257', 'center');
            $tx += $bw + $px * .35;
        }
        $fin = $cx + $g['cw'] - ($coches ? $px * .9 : 0);
        $capW = $j['cap'] ? $px * 1.25 : 0;
        [$nom, $s] = acp_forme($j, $px, '800', $fin - $tx - $capW - 6);
        $wn = acp_tc($T, $nom, $tx, $cy, $s, '800', '#14204A');
        if ($j['cap']) {                                                  // « C » entouré au feutre rouge
            $kx = $tx + $wn + $px * .7;
            acp_tc($T, 'C', $kx, $cy, $px * .76, 'script', '#C8312B', 'center');
            acp_anneau($T, $kx + 1, $cy - 1, $px * 1.0, 2.2, '#C8312B', .9);
        }
        if ($coches) acp_coche($T, $fin + $px * .45, $cy, $px * .62);
    }
    return $g['rows'] * $lh;
}
/* coche au feutre bleu */
function acp_coche(array $T, float $cx, float $cy, float $t): void {
    $pts = [[-.5, .02], [-.12, .42], [.55, -.5]];
    $ep = $t * .2;
    acp_trait($T, $cx + $pts[0][0] * $t, $cy + $pts[0][1] * $t, $cx + $pts[1][0] * $t, $cy + $pts[1][1] * $t, $ep, ACP_TAB_ENCRE, .9);
    acp_trait($T, $cx + $pts[1][0] * $t, $cy + $pts[1][1] * $t, $cx + $pts[2][0] * $t, $cy + $pts[2][1] * $t, $ep * .85, ACP_TAB_ENCRE, .9);
    acp_rond($T, $cx + $pts[1][0] * $t, $cy + $pts[1][1] * $t, $ep, ACP_TAB_ENCRE, .9);
}
/* la feuille de match punaisée : en-tête, informations, liste cochée, mot du coach écrit à la main */
function acp_tableau_convocation(array $D, array $opts) {
    $T = acp_toile(acp_tab_fond());
    $x = 84; $w = ACP_W - 168; $y = 236; $h = ACP_SURE[1] + 4 - $y;
    acp_tab_feuille($T, $x, $y, $w, $h);
    $ix = $x + 44; $iw = $w - 88; $navy = '#0F2257';
    // en-tête : blason, « CONVOCATION », équipe
    acp_blason($T, '', true, $ix + 52, $y + 112, 100);
    $tx = $ix + 124;
    $t1 = aff_maj($D['titre']);
    acp_t($T, $t1, $tx, $y + 112, acp_fit($t1, 70, '900', $iw - 124, .45), '900', $navy, 'left', 1);
    $eq = aff_maj($D['equipe']);
    acp_t($T, $eq, $tx, $y + 154, acp_fit($eq, 32, '800', $iw - 124, .6), '800', '#2F5FD0', 'left', 32 * .12);
    $ry = $y + 188;
    acp_boite($T, $ix, $ry, $iw, 4, 0, $navy); acp_boite($T, $ix, $ry + 8, $iw, 1.5, 0, $navy);
    // fiche du match : libellé à gauche, valeur à droite, pointillés
    $lignes = [['MATCH', ($D['dom'] ? 'PIERRELATTE – ' . $D['adv'] : $D['adv'] . ' – PIERRELATTE')]];
    $q = aff_maj(acp_quand($D, false)); $hh = $D['heure'] !== '' ? 'COUP D\'ENVOI ' . aff_maj($D['heure']) : '';
    if ($q !== '' || $hh !== '') $lignes[] = ['DATE', trim($q . ($q !== '' && $hh !== '' ? ' · ' : '') . $hh)];
    $lignes[] = ['LIEU', ($D['stade'] !== '' ? aff_maj($D['stade']) . ' · ' : '') . ($D['dom'] ? 'À DOMICILE' : "À L'EXTÉRIEUR")];
    if ($D['rdv'] !== '' || $D['rdvLieu'] !== '') $lignes[] = ['RENDEZ-VOUS', aff_maj(trim($D['rdv'] . ($D['rdv'] !== '' && $D['rdvLieu'] !== '' ? ' · ' : '') . $D['rdvLieu']))];
    $ly = $ry + 26; $lab = 178;
    foreach ($lignes as [$l, $v]) {
        $cy = $ly + 26;
        acp_tc($T, $l, $ix, $cy, 18, 's800', '#6A7591', 'left', 18 * .14);
        if ($l === 'MATCH') {
            [$adv, $s] = acp_adv($D['adv'], 30, '800', $iw - $lab - acp_l('PIERRELATTE – ', 30 * .8, '800'), .8);
            $v = $D['dom'] ? "PIERRELATTE – $adv" : "$adv – PIERRELATTE";
        }
        $s = acp_fit($v, 30, '800', $iw - $lab, .62);
        acp_tc($T, acp_coupe($v, $s, '800', $iw - $lab), $ix + $lab, $cy, $s, '800', '#14204A');
        for ($k = $ix + $lab; $k < $ix + $iw; $k += 9) acp_boite($T, $k, $ly + 50, 4, 1.5, 0, '#6A7591', .5);
        $ly += 54;
    }
    // la liste
    $n = count($D['conv']);
    $ty = $ly + 34;
    acp_t($T, $n > 1 ? "LES $n CONVOQUÉS" : ($n ? 'LE CONVOQUÉ' : 'CONVOQUÉS'), $ix, $ty + 14, 30, '900', $navy, 'left', 30 * .06);
    acp_boite($T, $ix, $ty + 26, $iw, 3, 0, $navy);
    $hm = 0; $mot = [];
    if ($D['message'] !== '') { $mot = acp_lignes($D['message'], 34, 'script', $iw, 2); $hm = 44 + count($mot) * 46 + 10; }
    $lt = $ty + 40; $lhh = $y + $h - 30 - $hm - $lt;
    $hl = $n ? acp_tab_lignes($T, $D['conv'], $ix, $lt, $iw, $lhh) : 0;
    if (!$n) { acp_feutre($T, 'Liste à venir', ACP_W / 2, $lt + 80, 48, ACP_TAB_ENCRE, 'center'); $hl = 120; }
    if ($hm) {
        $my = min($y + $h - 30 - $hm + 18, $lt + $hl + 34);                // le mot suit la liste, comme écrit sur la feuille
        acp_feutre($T, 'Le mot du coach :', $ix, $my + 26, 30, '#C8312B');
        foreach ($mot as $i => $l) acp_feutre($T, $l, $ix, $my + 26 + 46 + $i * 46, 34, ACP_TAB_ENCRE);
    }
    return acp_fin($T);
}

/* ================= style « bleu club » ================= */
/* fond : dégradé bleu profond, grand blason en filigrane, bandeau du bas ; les rayures en biais sont sur le calque */
function acp_club_fond() {
    $W = ACP_W; $H = ACP_H;
    $im = imagecreatetruecolor($W, $H); imagealphablending($im, true);
    for ($y = 0; $y < $H; $y++) imageline($im, 0, $y, $W - 1, $y, afn_c($im, afn_mix([[0, '#0A1740'], [.32, '#16348A'], [.62, '#1C3F9E'], [1, '#0F2257']], $y / ($H - 1))));
    for ($x = 0; $x < $W; $x++) {                                       // lumière venue de la droite
        $o = .16 * max(0, ($x / $W - .35) / .65) ** 1.5;
        if ($o > .003) imageline($im, $x, 0, $x, $H - 1, afn_c($im, [70, 120, 230], $o));
    }
    // blason en filigrane : silhouette blanche très légère, à cheval sur le bord droit
    $b = aff_image(dirname(__DIR__) . '/img/blason.png');
    if ($b) {
        $d = 1180; $s = imagecreatetruecolor($d, $d); imagealphablending($s, false); imagesavealpha($s, true);
        imagecopyresampled($s, $b, 0, 0, 0, 0, $d, $d, imagesx($b), imagesy($b)); imagedestroy($b);
        $l = afn_calque($d, $d); imagealphablending($l, false);
        for ($j = 0; $j < $d; $j += 1) for ($i = 0; $i < $d; $i++) {
            $c = imagecolorat($s, $i, $j); $a = ($c >> 24) & 127;
            if ($a >= 127) continue;
            $lum = ((($c >> 16) & 255) + (($c >> 8) & 255) + ($c & 255)) / 765;
            $op = (1 - $a / 127) * (.035 + .05 * $lum);
            imagesetpixel($l, $i, $j, imagecolorallocatealpha($l, 255, 255, 255, 127 - (int) round(127 * $op)));
        }
        imagedestroy($s);
        imagealphablending($im, true); imagecopy($im, $l, $W - $d * .62, 760, 0, 0, $d, $d); imagedestroy($l);
    }
    // bas de l'affiche (sous la zone sûre) : filet or, site du club
    aff_rect($im, 0, 1712, $W, $H - 1712, aff_c($im, '#0A1740'));
    aff_rect($im, 0, 1712, $W, 4, aff_c($im, ACP_OR));
    afn_texte($im, 'ASF-PIERRELATTE.FR', $W / 2, 1800, 52, '900i', aff_c($im, '#FFFFFF'), 'center', 2);
    afn_texte($im, "ATOM'SPORTS FOOTBALL PIERRELATTE · DEPUIS 1923", $W / 2, 1846, 19, 's800', aff_c($im, ACP_OR), 'center', 19 * .22);
    return $im;
}
/* rayures en biais qui montent vers la droite, derrière le titre, et filet or : la signature graphique du style ;
   elles s'effacent avant le contenu ($fin) */
function acp_club_rayures(array $T, float $fin = 560): void {
    $t = tan(deg2rad(58)); $pas = 12;
    $bande = function (float $xb, float $larg, string $hex, float $op) use ($T, $t, $fin, $pas) {
        // $xb : abscisse du bord gauche à la hauteur $fin ; tranches horizontales de plus en plus pâles vers le bas
        for ($y = -10; $y < $fin; $y += $pas) {
            $y2 = min($fin, $y + $pas); $k = max(0, min(1, ($fin - $y2) / 260));
            $xa = $xb + ($fin - $y) / $t; $xc = $xb + ($fin - $y2) / $t;
            acp_poly($T, [$xc, $y2, $xc + $larg, $y2, $xa + $larg, $y, $xa, $y], $hex, $op * (.15 + .85 * $k));
        }
    };
    $bande(400, 150, '#FFFFFF', .05);
    $bande(588, 46, '#FFFFFF', .08);
    $bande(668, 12, ACP_OR, .9);
    $bande(712, 240, '#FFFFFF', .04);
}
/* parallélogramme (étiquette penchée) ; renvoie sa largeur */
function acp_biais(array $T, float $x, float $y, float $w, float $h, string $hex, float $op = 1, float $pente = .26): void {
    $k = $h * $pente;
    acp_poly($T, [$x + $k, $y, $x + $w + $k, $y, $x + $w - $k + $k, $y + $h, $x, $y + $h], $hex, $op);
}
/* sur-titre, très grand titre, étiquette or de l'équipe, pastille domicile / extérieur ; renvoie le bas */
function acp_club_titres(array $T, array $D, string $titre): float {
    $x = 56; $y = 250;
    acp_boite($T, $x, $y + 10, 44, 4, 0, ACP_OR);
    acp_t($T, "ATOM'SPORTS FOOTBALL PIERRELATTE", $x + 58, $y + 20, 20, 's800', ACP_OR, 'left', 20 * .22);
    $t = aff_maj($titre); $s = acp_fit($t, 190, '900i', ACP_W - 2 * $x, .4);
    $by = $y + 40 + .8 * $s;
    acp_ombre_t($T, $t, $x - 4, $by, $s, '900i', 8, 26, .45);
    acp_t($T, $t, $x - 4, $by, $s, '900i', '#FFFFFF');
    $y = $by + 26;
    // étiquette or (équipe) et pastille (lieu)
    $eq = aff_maj($D['equipe']); $pe = acp_fit($eq, 44, '900i', 520, .6); $he = 64;
    $we = acp_l($eq, $pe, '900i') + 52;
    acp_ombre($T, $x, $y, $we + $he * .26, $he, 4, 14, .45, 8);
    acp_biais($T, $x, $y, $we, $he, ACP_OR);
    acp_tc($T, $eq, $x + $he * .13 + $we / 2, $y + $he / 2, $pe, '900i', '#0F2257', 'center');
    $lib = $D['dom'] ? 'À DOMICILE' : "À L'EXTÉRIEUR"; $pl = 24;
    $wl = acp_l($lib, $pl, '900', $pl * .1) + 40 + 34; $lx = $x + $we + 28;
    acp_biais($T, $lx, $y, $wl, $he, '#FFFFFF', .12);
    acp_icone($T, $D['dom'] ? 'maison' : 'avion', $lx + 24, $y + $he / 2 - 13, 26, '#FFFFFF');
    acp_tc($T, $lib, $lx + 60, $y + $he / 2, $pl, '900', '#FFFFFF', 'left', $pl * .1);
    return $y + $he;
}
/* carte blanche à coins arrondis, ombre bleu nuit */
function acp_club_carte(array $T, float $x, float $y, float $w, float $h, float $r = 18): void {
    acp_ombre($T, $x, $y, $w, $h, $r, 26, .5, 14, '#040B26');
    acp_boite($T, $x, $y, $w, $h, $r, ['v', [[0, '#FFFFFF'], [1, '#F1F4FB']]]);
}
/* les deux équipes sur une ligne : blason, nom, « VS » or au milieu (l'équipe qui reçoit à gauche) */
function acp_club_duel(array $T, array $D, float $x, float $cy, float $w, float $d, float $px, string $hexNom, string $centre = 'VS'): void {
    $nous = ['PIERRELATTE', '', true]; $eux = [$D['adv'], $D['adv_brut'], false];
    $mil = 110; $cote = ($w - $mil) / 2;
    foreach ([[$D['dom'] ? $nous : $eux, 'g'], [$D['dom'] ? $eux : $nous, 'd']] as [[$nom, $brut, $club], $s]) {
        $bx = $s === 'g' ? $x + $d / 2 : $x + $w - $d / 2;
        acp_blason($T, $brut, $club, $bx, $cy, $d);
        $max = $cote - $d - 16;
        if (!$club) [$nom] = acp_adv($nom, $px * .8, '800', $max * 1.7, 1);
        acp_nom_bloc($T, $nom, $s === 'g' ? $x + $d + 14 : $x + $w - $d - 14, $cy, $max, $px, '800', $hexNom, $s === 'g' ? 'left' : 'right');
    }
    acp_tc($T, $centre, $x + $w / 2, $cy, 46, '900i', ACP_OR, 'center');
}
/* tuiles d'information (libellé or, valeur blanche) côte à côte */
function acp_club_tuiles(array $T, array $tuiles, float $x, float $y, float $w, float $h): void {
    $n = count($tuiles); if (!$n) return;
    $g = 14; $tw = ($w - ($n - 1) * $g) / $n;
    foreach ($tuiles as $i => [$lab, $val]) {
        $tx = $x + $i * ($tw + $g);
        acp_boite($T, $tx, $y, $tw, $h, 14, '#FFFFFF', .08);
        acp_lisere($T, $tx, $y, $tw, $h, 14, 1.5, '#FFFFFF', .22);
        acp_boite($T, $tx + 22, $y + 22, 30, 3, 0, ACP_OR);
        acp_t($T, $lab, $tx + 22, $y + 50, 17, 's800', ACP_OR, 'left', 17 * .18);
        $s = acp_fit($val, 46, '900i', $tw - 44, .55);
        acp_t($T, $val, $tx + 22, $y + $h - 22, $s, '900i', '#FFFFFF');
    }
}
function acp_club_convocation(array $D, array $opts) {
    $T = acp_toile(acp_club_fond());
    acp_club_rayures($T);
    $yb = acp_club_titres($T, $D, $D['titre']);
    $x = 44; $w = ACP_W - 88;
    // tuiles : date, coup d'envoi, rendez-vous
    $tuiles = [];
    if ($D['quand'] !== '') $tuiles[] = ['DATE', aff_maj(preg_replace('/^(\S+) (\S+) (\S+)$/u', '$1 $2 $3', $D['quand']))];
    if ($D['heure'] !== '') $tuiles[] = ["COUP D'ENVOI", aff_maj($D['heure'])];
    if ($D['rdv'] !== '') $tuiles[] = ['RENDEZ-VOUS', aff_maj($D['rdv'])];
    if (count($tuiles) === 3) { $tuiles[0][1] = aff_maj(preg_replace('/^(\S+) /u', '', $D['quand'])); $tuiles[0][0] = aff_maj($D['jour']); }
    $y = $yb + 30;
    if ($tuiles) { acp_club_tuiles($T, $tuiles, $x, $y, $w, 112); $y += 112 + 16; }
    // lieu et lieu du rendez-vous
    $lieux = [];
    if ($D['stade'] !== '') $lieux[] = ['lieu', aff_maj($D['stade'])];
    if ($D['rdvLieu'] !== '') $lieux[] = ['horloge', 'RDV : ' . aff_maj($D['rdvLieu'])];
    foreach ($lieux as [$ic, $t]) {
        acp_icone($T, $ic, $x + 4, $y + 4, 24, ACP_OR, '#16348A');
        $s = acp_fit($t, 22, 's700', $w - 44, .7, .06);
        acp_tc($T, acp_coupe($t, $s, 's700', $w - 44), $x + 40, $y + 16, $s, 's700', '#FFFFFF', 'left', $s * .06);
        $y += 40;
    }
    $y += 12;
    // carte blanche : le match, puis la liste
    $hm = 0; $mot = [];
    if ($D['message'] !== '') { $mot = acp_lignes($D['message'], 28, 's700i', $w - 96, 2); $hm = 22 + count($mot) * 36 + 6; }
    $hC = ACP_SURE[1] - 4 - $hm - $y;
    acp_club_carte($T, $x, $y, $w, $hC);
    acp_club_duel($T, $D, $x + 30, $y + 66, $w - 60, 84, 36, '#0F2257');
    $n = count($D['conv']);
    $hy = $y + 128;
    acp_boite($T, $x, $hy, $w, 52, 0, '#0F2257');
    acp_biais($T, $x + $w - 214 - 52 * .26, $hy, 214, 52, ACP_OR);
    $lib = $n > 1 ? "LES $n CONVOQUÉS" : ($n ? 'LE CONVOQUÉ' : 'CONVOQUÉS');
    acp_tc($T, $lib, $x + 30, $hy + 26, 26, '900', '#FFFFFF', 'left', 26 * .12);
    acp_tc($T, aff_maj($D['equipe']), $x + $w - 24, $hy + 26, acp_fit(aff_maj($D['equipe']), 22, '900i', 170, .6), '900i', '#0F2257', 'right');
    $ly = $hy + 52 + 14; $lh = $y + $hC - 18 - $ly;
    if ($n) acp_club_joueurs($T, $D['conv'], $x + 30, $ly, $w - 60, $lh);
    else acp_tc($T, 'LISTE À VENIR', ACP_W / 2, $ly + $lh / 2, 40, '900i', '#0F2257', 'center');
    // le mot du coach, sur le bleu
    if ($hm) {
        $my = $y + $hC + 22;
        acp_t($T, '«', $x, $my + 58, 84, '900i', ACP_OR);
        foreach ($mot as $i => $l) acp_t($T, $l, $x + 56, $my + 28 + $i * 36, 28, 's700i', '#FFFFFF');
    }
    // la carte blanche cache le bas des rayures : on remet le haut au-dessus de rien d'autre
    return acp_fin($T);
}
/* liste des joueurs sur la carte blanche : numéro bleu en italique, nom bleu nuit, brassard or */
function acp_club_joueurs(array $T, array $liste, float $x, float $y, float $w, float $h): void {
    $avecNum = (bool) array_filter($liste, fn($j) => $j['num'] !== '');
    $noms = array_map(fn($j) => $j['nom'] . ($j['cap'] ? ' C' : ''), $liste);
    $g = acp_grille($noms, $w, $h, 42, '800', $avecNum ? 1.45 : .5, 30, 1.9);
    $px = $g['px']; $lh = $g['lh']; $top = $y + min(($h - $g['rows'] * $lh) / 2, $lh * .8);
    foreach ($liste as $i => $j) {
        $c = intdiv($i, $g['rows']); $r = $i % $g['rows'];
        $cx = $x + $c * ($g['cw'] + 30); $cy = $top + $r * $lh + $lh / 2;
        if ($r % 2 === 0) acp_boite($T, $cx - 12, $cy - $lh / 2 + 2, $g['cw'] + 24, $lh - 4, 8, '#E3E9F6', .7);
        $tx = $cx;
        if ($avecNum) {
            if ($j['num'] !== '') acp_tc($T, $j['num'], $cx + $px * .95, $cy, acp_fit($j['num'], $px * 1.02, '900i', $px * 1.15, .6), '900i', '#2F5FD0', 'right');
            $tx += $px * 1.3;
        } else { acp_biais($T, $cx, $cy - $px * .3, $px * .36, $px * .6, ACP_OR); $tx += $px * .7; }
        $capW = $j['cap'] ? $px * 1.0 : 0;
        [$nom, $s] = acp_forme($j, $px, '800', $cx + $g['cw'] - $tx - $capW);
        $wn = acp_tc($T, $nom, $tx, $cy, $s, '800', '#0F2257');
        if ($j['cap']) acp_brassard($T, $tx + $wn + $px * .55, $cy, $px * .76, ACP_OR, '#0F2257');
    }
}
function acp_club_composition(array $D, array $opts) {
    $T = acp_toile(acp_club_fond());
    acp_club_rayures($T);
    $yb = acp_club_titres($T, $D, $D['titre']);
    $x = 44; $w = ACP_W - 88;
    // ligne du match : PIERRELATTE vs ADVERSAIRE, puis la date et l'heure
    $y = $yb + 26;
    acp_club_duel($T, $D, $x, $y + 34, $w, 68, 32, '#FFFFFF');
    $y += 80;
    $q = aff_maj(acp_quand($D, false)) . ($D['heure'] !== '' ? ($D['quand'] !== '' ? ' · ' : '') . "COUP D'ENVOI " . aff_maj($D['heure']) : '');
    if ($q !== '') { acp_tc($T, $q, ACP_W / 2, $y + 14, acp_fit($q, 22, 's800', $w, .7, .14), 's800', '#C9D6F5', 'center', 22 * .14); $y += 34; }
    // remplaçants : en bas, sur le bleu
    $remp = $D['remp']; $hR = 0; $lr = [];
    if ($remp) {
        $items = array_map(fn($j) => trim(($j['num'] !== '' ? $j['num'] . ' ' : '') . $j['court']), $remp);
        foreach ([30, 27, 24, 21] as $pr) { $lr = acp_club_flux($remp, $pr, $w); if (count($lr) <= ($pr > 27 ? 1 : ($pr > 24 ? 2 : 3))) break; }
        $hR = 44 + count($lr) * $pr * 1.5;
    }
    $yP = $y + 16; $hP = ACP_SURE[1] - 4 - $yP - ($hR ? $hR + 20 : 0);
    acp_club_carte($T, $x, $yP, $w, $hP, 22);
    if ($D['terrain']) {
        $ph = $hP - 40; $pw = min($w - 60, $ph * .8); $px0 = ACP_W / 2 - $pw / 2; $py0 = $yP + 20;
        $P = fn($u, $v) => [$px0 + $u * $pw, $py0 + $v * $ph, 1];
        for ($i = 0, $nb = 14; $i < $nb; $i++) if ($i % 2) acp_boite($T, $x, $py0 - $ph * .035 + ($ph * 1.07) * $i / $nb, $w, $ph * 1.07 / $nb, 0, '#E8EDF8', .8);
        acp_pelouse($T, $P, [], '#1C3F9E', .32, 2.6);
        acp_blason_filigrane($T, ACP_W / 2, $py0 + $ph / 2, $ph * .17);
        $px = 24; $nb = count($D['tit']); $d0 = $nb >= 10 ? 72 : ($nb >= 7 ? 82 : 92);
        $J = acp_jetons($D, $P, $d0, $px * 1.1, 6, fn($t) => acp_l($t['court'], $px, '800') + 8, $yP + $hP - 14 - $px * 1.1 - 6 - 30);
        foreach ($J as [$jx, $jy, $d, $maxW, $t, $poste]) {
            if (!$t) {
                acp_anneau($T, $jx, $jy, $d * .84, 2.5, '#1C3F9E', .45);
                acp_tc($T, $poste, $jx, $jy, $d * .3, '900', '#1C3F9E', 'center', 0, .55);
                continue;
            }
            acp_ombre($T, $jx - $d / 2, $jy - $d / 2, $d, $d, $d / 2, 8, .35, 5, '#0A1740');
            if ($t['cap']) acp_rond($T, $jx, $jy, $d + 10, ACP_OR);
            acp_rond_degrade($T, $jx, $jy, $d, [[0, '#2F5FD0'], [.6, '#1C3F9E'], [1, '#0F2257']]);
            $num = $t['num'] !== '' ? $t['num'] : aff_initiales($t['nom']);
            acp_tc($T, $num, $jx - 1, $jy, acp_fit($num, $d * .5, '900i', $d * .72, .6), '900i', '#FFFFFF', 'center');
            if ($t['cap']) acp_brassard($T, $jx + $d * .4, $jy - $d * .38, $d * .36, ACP_OR, '#0F2257');
            [$n, $s] = acp_forme(['formes' => array_unique([$t['court'], $t['famille'] ?: $t['court']])] + $t, $px, '800', $maxW - 8, .72);
            $ly = $jy + $d / 2 + 6 + $px * .55;
            $lx = max($x + 16 + acp_l($n, $s, '800') / 2, min($x + $w - 16 - acp_l($n, $s, '800') / 2, $jx));
            acp_tc($T, $n, $lx, $ly, $s, '800', '#0F2257', 'center');
        }
    } else {
        $tit = array_values(array_filter($D['tit']));
        acp_t($T, 'TITULAIRES', $x + 30, $yP + 50, 26, '900', '#0F2257', 'left', 26 * .12);
        acp_boite($T, $x + 30, $yP + 62, 60, 4, 0, ACP_OR);
        if ($tit) acp_club_joueurs($T, $tit, $x + 30, $yP + 80, $w - 60, $hP - 100);
        else acp_tc($T, 'COMPOSITION À VENIR', ACP_W / 2, $yP + $hP / 2, 40, '900i', '#0F2257', 'center');
    }
    if ($hR) {
        $yR = $yP + $hP + 22;
        acp_boite($T, $x, $yR + 8, 44, 4, 0, ACP_OR);
        acp_t($T, count($remp) > 1 ? 'REMPLAÇANTS' : 'REMPLAÇANT', $x + 58, $yR + 18, 20, 's800', ACP_OR, 'left', 20 * .22);
        foreach ($lr as $k => $ligne) {
            $cx = $x; $cy = $yR + 44 + $k * $pr * 1.5 + $pr * .75;
            foreach ($ligne as $i => $j) {
                if ($i) { acp_biais($T, $cx + 6, $cy - $pr * .3, $pr * .22, $pr * .6, ACP_OR); $cx += $pr * .22 + 22; }
                if ($j['num'] !== '') $cx += acp_tc($T, $j['num'], $cx, $cy, $pr, '900i', ACP_OR) + $pr * .3;
                $cx += acp_tc($T, $j['court'], $cx, $cy, $pr, '800', '#FFFFFF') + 10;
            }
        }
    }
    return acp_fin($T);
}
/* remplaçants en texte courant : lignes qui tiennent dans $w */
function acp_club_flux(array $liste, float $px, float $w): array {
    $l = [[]]; $lw = 0;
    foreach ($liste as $j) {
        $jw = ($j['num'] !== '' ? acp_l($j['num'], $px, '900i') + $px * .3 : 0) + acp_l($j['court'], $px, '800') + 10;
        $sep = $l[count($l) - 1] ? $px * .22 + 28 : 0;
        if ($l[count($l) - 1] && $lw + $sep + $jw > $w) { $l[] = []; $lw = 0; $sep = 0; }
        $l[count($l) - 1][] = $j; $lw += $sep + $jw;
    }
    return $l;
}
/* blason du club en filigrane au rond central (terrain clair) */
function acp_blason_filigrane(array $T, float $cx, float $cy, float $d): void {
    $b = aff_image(dirname(__DIR__) . '/img/blason.png'); if (!$b) return;
    $K = ACP_K; $n = (int) round($d * $K);
    $s = afn_calque($n, $n); imagealphablending($s, false);
    imagecopyresampled($s, $b, 0, 0, 0, 0, $n, $n, imagesx($b), imagesy($b)); imagedestroy($b);
    for ($j = 0; $j < $n; $j++) for ($i = 0; $i < $n; $i++) {
        $c = imagecolorat($s, $i, $j); $a = ($c >> 24) & 127;
        if ($a < 127) imagesetpixel($s, $i, $j, ($c & 0xFFFFFF) | ((127 - (int) round((127 - $a) * .14)) << 24));
    }
    imagealphablending($T['im'], true);
    imagecopy($T['im'], $s, (int) round($cx * $K - $n / 2), (int) round($cy * $K - $n / 2), 0, 0, $n, $n);
    imagedestroy($s);
}

/* ---------- stories des compos : publication (convocation à la validation, composition avant le match) ----------
   Les affiches elles-mêmes sont dessinées par compo-affiches.php (acp_convocation, acp_composition, acp_exemple).
   Ici : les réglages du bureau, la publication en STORY SEULEMENT (Facebook + Instagram, jamais dans le fil),
   le passage du cron et les adresses utilisées par l'espace club.
   - Réglages : document « site/affiches-compo »
       { actif, convocation, composition, minutesAvant, style, noms, exclues: [équipes sans story] }
   - Convocation : publiée quand le coach valide sa compo (l'application appelle POST ?compo_story=<id>) ;
     le cron la rattrape en journée (8 h – 21 h 30) si l'appel n'a pas pu partir. Une seule fois par compo.
   - Composition : publiée minutesAvant (30 min) avant le coup d'envoi par le cron des 5 minutes
     (php …/api/affiches.php compos, ou ?cron_compos=1&cle=…) ; avec le seul cron horaire, dans l'heure qui précède.
   - Adresses (coach ou bureau) :
       GET  ?apercu=convocation|composition&id=<compo>[&style=][&noms=][&l=largeur]   aperçu JPEG
       GET  ?apercu=convocation|composition&exemple=1&style=…                        aperçu sur une compo d'exemple
       POST ?compo_story=<compo>[&quoi=composition][&forcer=1]                        publier maintenant (JSON)
       GET  ?compo_etat=<compo>                                                       où en sont les deux stories (JSON)
       GET  ?compo_info=1                                                             réglages, cron, ligne à donner à l'hébergeur (JSON) */

const ACP_REGLAGES_DEFAUT = ['actif' => true, 'convocation' => true, 'composition' => true, 'minutesAvant' => 30, 'style' => 'nuit', 'noms' => 'auto', 'exclues' => []];
const ACP_JOUR_DEBUT = 8 * 60, ACP_JOUR_FIN = 21 * 60 + 30;        // convocations de rattrapage : de 8 h à 21 h 30 seulement
const ACP_APRES = 600;                                              // la composition peut encore partir jusqu'à 10 min après le coup d'envoi
const ACP_CRON_FREQUENT = 1200;                                     // cron des 5 minutes vu il y a moins de 20 min : horaire précis

function acp_styles(): array { return defined('ACP_STYLES') ? ACP_STYLES : ['nuit' => 'Stade de nuit', 'tableau' => 'Tableau tactique', 'club' => 'Bleu club']; }
/* l'heure de référence : time(), ou l'heure imposée par les tests (voyage dans le temps) */
function acp_maintenant(): int { return (int) ($GLOBALS['acp_maintenant'] ?? time()); }

function acp_reglages(): array {
    $d = aff_doc('site/affiches-compo');
    $r = ACP_REGLAGES_DEFAUT;
    foreach (['actif', 'convocation', 'composition'] as $k) if (array_key_exists($k, $d)) $r[$k] = (bool) $d[$k];
    if (isset($d['minutesAvant']) && is_numeric($d['minutesAvant'])) $r['minutesAvant'] = max(5, min(180, (int) $d['minutesAvant']));
    if (isset($d['style']) && isset(acp_styles()[$d['style']])) $r['style'] = (string) $d['style'];
    if (isset($d['noms']) && in_array($d['noms'], ['auto', 'complet', 'initiale'], true)) $r['noms'] = $d['noms'];
    if (isset($d['exclues']) && is_array($d['exclues'])) $r['exclues'] = array_values(array_filter(array_map(fn($e) => trim((string) $e), $d['exclues']), 'strlen'));
    return $r;
}

/* ---------- les compos ---------- */
function acp_id($v): string { $v = trim((string) $v); return preg_match('/^[A-Za-z0-9_-]{1,64}$/', $v) ? $v : ''; }
function acp_compo(string $id): ?array {
    if (acp_id($id) === '') return null;
    $c = aff_doc("compos/$id");
    return $c ? ['id' => $id] + $c : null;
}
function acp_compos_publiees(): array {
    $l = [];
    foreach (base()->query("SELECT path, data FROM documents WHERE path LIKE 'compos/%'") as $r) {
        $c = json_decode((string) $r['data'], true);
        if (!is_array($c) || empty($c['publie'])) continue;
        $id = substr((string) $r['path'], 7);
        if (acp_id($id) === '') continue;
        $l[] = ['id' => $id] + $c;
    }
    usort($l, fn($a, $b) => strcmp(($a['date'] ?? '') . ($a['heure'] ?? ''), ($b['date'] ?? '') . ($b['heure'] ?? '')));
    return $l;
}
/* coup d'envoi (horodatage), null sans date ou sans heure valables */
function acp_coup_envoi(array $c): ?int {
    $d = (string) ($c['date'] ?? ''); $h = (string) ($c['heure'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || !preg_match('/^([01]?\d|2[0-3])[:h]([0-5]\d)$/', $h, $m)) return null;
    $t = strtotime(sprintf('%s %02d:%02d:00', $d, $m[1], $m[2]));
    return $t === false ? null : $t;
}
function acp_exclue(string $equipe, array $reg): bool {
    $n = fn($s) => mb_strtolower(preg_replace('/\s+/u', ' ', trim((string) $s)), 'UTF-8');
    foreach ($reg['exclues'] as $e) if ($n($e) === $n($equipe)) return true;
    return false;
}
function acp_de_jour(int $t): bool { $m = (int) date('G', $t) * 60 + (int) date('i', $t); return $m >= ACP_JOUR_DEBUT && $m <= ACP_JOUR_FIN; }
function acp_cle(string $quoi, string $id): string { return ($quoi === 'composition' ? 'compo-' : 'convoc-') . $id; }
function acp_fait(string $quoi, string $id): bool { return reglage('pub_' . acp_cle($quoi, $id)) === 'fait'; }

/* pourquoi cette story ne peut pas partir (null : elle peut partir) ; la fenêtre horaire de la composition est vue à part */
function acp_motif(string $quoi, array $c, array $reg, int $t): ?string {
    if (!$reg['actif']) return 'stories des compos désactivées par le bureau';
    if (!$reg[$quoi]) return $quoi === 'convocation' ? 'story des convoqués désactivée par le bureau' : 'story de la composition désactivée par le bureau';
    if (empty($c['publie'])) return 'compo pas encore publiée';
    if (acp_exclue((string) ($c['equipe'] ?? ''), $reg)) return 'pas de story pour cette équipe (réglage du bureau)';
    $d = (string) ($c['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return 'date du match inconnue';
    if ($d < date('Y-m-d', $t)) return 'match passé';
    $k = acp_coup_envoi($c);
    $titulaires = array_filter(is_array($c['titulaires'] ?? null) ? $c['titulaires'] : [], fn($x) => is_array($x) && trim((string) ($x['nom'] ?? '')) !== '');
    if ($quoi === 'composition') {
        if ($k === null) return "heure du coup d'envoi inconnue";
        if (!$titulaires) return 'aucun titulaire placé sur le terrain';
        if ($t > $k + ACP_APRES) return 'match commencé';
    } else {
        $joueurs = array_merge(is_array($c['convoquesListe'] ?? null) ? $c['convoquesListe'] : [], $titulaires, is_array($c['remplacants'] ?? null) ? $c['remplacants'] : []);
        if (!$joueurs) return 'aucun joueur convoqué';
        if ($k !== null && $t > $k) return 'match commencé';
    }
    return null;
}

/* fenêtre de la story de composition : [début, fin], ou null sans heure */
function acp_fenetre(array $c, array $reg, bool $frequent): ?array {
    $k = acp_coup_envoi($c);
    if ($k === null) return null;
    $debut = $k - $reg['minutesAvant'] * 60 - ($frequent ? 0 : 3600);   // cron horaire seul : dans l'heure qui précède
    return [$debut, $k + ACP_APRES];
}
function acp_cron_frequent(int $t): bool { return (int) reglage('cron_compos_vu', '0') > $t - ACP_CRON_FREQUENT; }
/* première mise en route : les compos publiées avant ne reçoivent pas de convocation de rattrapage (pas de rafale le premier jour) */
function acp_depuis(int $t): int {
    $v = (int) reglage('acp_depuis', '0');
    if ($v <= 0) { $v = $t; reglage_ecrire('acp_depuis', (string) $v); }
    return $v;
}
function acp_rattrapage_ok(array $c, int $depuis): bool {
    if (reglage('acp_attente_' . acp_cle('convocation', $c['id'])) === '1') return true;     // reportée (nuit, publication en cours)
    $maj = is_numeric($c['maj'] ?? null) ? (int) floor($c['maj'] / 1000) : 0;
    return $maj >= $depuis - 86400;
}

/* verrou : le cron des 5 minutes, le cron horaire et le bouton du coach ne publient jamais en même temps */
function acp_verrou(): bool {
    $v = &$GLOBALS['acp_verrou'];
    if (!empty($v['n'])) { $v['n']++; return true; }
    $dossier = dirname(__DIR__) . '/affiches';
    if (!is_dir($dossier)) @mkdir($dossier, 0755, true);
    $f = @fopen("$dossier/.stories-compos.verrou", 'c');
    if (!$f) return true;                                     // pas de fichier possible : on publie quand même (l'anti-doublon reste)
    if (!flock($f, LOCK_EX | LOCK_NB)) { fclose($f); return false; }
    $v = ['n' => 1, 'f' => $f];
    return true;
}
function acp_liberer(): void {
    $v = &$GLOBALS['acp_verrou'];
    if (empty($v['n']) || --$v['n'] > 0) return;
    if (!empty($v['f'])) { flock($v['f'], LOCK_UN); fclose($v['f']); }
    $v = [];
}

/* ---------- dessin et publication ---------- */
function acp_image(string $quoi, array $c, string $style, string $noms) {
    if (!function_exists('acp_convocation')) throw new RuntimeException('affiches des compos absentes (compo-affiches.php)');
    aff_format('story');
    return $quoi === 'composition' ? acp_composition($c, $style, ['noms' => $noms]) : acp_convocation($c, $style, ['noms' => $noms]);
}
/* une story sur un réseau ; les tests branchent $GLOBALS['acp_test_publier'] pour capturer l'envoi au lieu d'appeler Meta */
function acp_story(string $reseau, string $fichier): void {
    if (isset($GLOBALS['acp_test_publier']) && is_callable($GLOBALS['acp_test_publier'])) { ($GLOBALS['acp_test_publier'])($reseau, 'story', $fichier); return; }
    if ($reseau === 'Facebook') fb_story($fichier); else ig_story($fichier);
}
function acp_suivi(string $cle): array { return json_decode((string) reglage("acp_suivi_$cle", ''), true) ?: []; }
function acp_titre(string $quoi, array $c): string { return ($quoi === 'composition' ? 'Composition · ' : 'Convocation · ') . trim((string) ($c['equipe'] ?? '')); }

/* publie la story (Facebook + Instagram) une seule fois grâce à aff_traiter ; rend les états pour l'espace club */
function acp_publier(string $quoi, array $c, array $reg, array &$journal): array {
    $cle = acp_cle($quoi, $c['id']);
    if (reglage("pub_$cle") === 'fait') return acp_suivi($cle)['etats'] ?? ['story déjà publiée'];
    if (!aff_polices_ok()) return ['polices introuvables dans api/polices : story non dessinée'];
    $nom = 'story-' . (function_exists('cle_club') ? cle_club($cle) : preg_replace('/[^a-z0-9-]+/i', '-', $cle));
    $avant = count($journal);
    try {
        aff_traiter($cle, acp_titre($quoi, $c), function () use ($quoi, $c, $reg, $nom) {
            return ['story' => aff_enregistrer(acp_image($quoi, $c, $reg['style'], $reg['noms']), $nom)];
        }, [
            'Facebook' => function (array $f) { acp_story('Facebook', $f['story']); },
            'Instagram' => function (array $f) { acp_story('Instagram', $f['story']); },
        ], $journal);
    } catch (Throwable $e) {                                  // affiche impossible à dessiner : 3 essais, puis on abandonne
        $n = (int) reglage("acp_err_$cle", '0') + 1; reglage_ecrire("acp_err_$cle", (string) $n);
        if ($n >= 3) reglage_ecrire("pub_$cle", 'fait');
        $etats = ['affiche impossible à dessiner : ' . $e->getMessage() . ($n >= 3 ? ' (abandon)' : ' (nouvel essai au prochain passage)')];
        reglage_ecrire("acp_suivi_$cle", json_encode(['quand' => date('c', acp_maintenant()), 'etats' => $etats, 'publiee' => false], JSON_UNESCAPED_UNICODE));
        $journal[] = acp_titre($quoi, $c) . ' : ' . $etats[0];
        return $etats;
    }
    // les états écrits par aff_traiter dans l'historique des affiches (« Facebook : publié · Instagram : pas relié »)
    $etats = [];
    foreach (aff_doc('site/affiches')['liste'] ?? [] as $x) if (($x['cle'] ?? '') === $cle) { $etats = array_values(array_filter(explode(' · ', (string) ($x['etat'] ?? '')))); break; }
    if (!$etats) $etats = ['aucun réseau relié'];
    $publiee = (bool) array_filter($etats, fn($e) => str_ends_with($e, ': publié'));
    $ancien = acp_suivi($cle);
    reglage_ecrire("acp_suivi_$cle", json_encode(['quand' => ($ancien['publiee'] ?? false) ? $ancien['quand'] : date('c', acp_maintenant()), 'etats' => $etats, 'publiee' => $publiee || !empty($ancien['publiee'])], JSON_UNESCAPED_UNICODE));
    if (reglage("pub_$cle") === 'fait') reglage_ecrire('acp_attente_' . $cle, null);
    if (count($journal) === $avant) $journal[] = acp_titre($quoi, $c) . ' : ' . implode(', ', $etats);
    return $etats;
}

/* convocation : appelée quand le coach valide sa compo (et par le cron en rattrapage). $force : même la nuit. */
function acp_publier_convocation(string $id, array &$journal, bool $force = false): array {
    $c = acp_compo($id);
    if (!$c) return ['compo introuvable'];
    $cle = acp_cle('convocation', $c['id']);
    if (acp_fait('convocation', $c['id'])) return acp_suivi($cle)['etats'] ?? ['story des convoqués déjà publiée'];
    $reg = acp_reglages(); $t = acp_maintenant();
    if (($m = acp_motif('convocation', $c, $reg, $t)) !== null) return ["pas de story des convoqués : $m"];
    if (!$force && !acp_de_jour($t)) {
        reglage_ecrire("acp_attente_$cle", '1');
        acp_depuis($t);
        return ['il est tard : la story des convoqués partira ' . ((int) date('G', $t) >= 12 ? 'demain' : 'ce matin') . ' à 8 h'];
    }
    if (!acp_verrou()) { reglage_ecrire("acp_attente_$cle", '1'); return ['une publication est déjà en cours : la story des convoqués partira dans quelques minutes']; }
    try { acp_depuis($t); return acp_publier('convocation', $c, $reg, $journal); }
    finally { acp_liberer(); }
}
/* composition : par le cron dans sa fenêtre ; $force (bouton « Publier maintenant ») : hors fenêtre */
function acp_publier_composition(string $id, array &$journal, bool $force = false): array {
    $c = acp_compo($id);
    if (!$c) return ['compo introuvable'];
    $cle = acp_cle('composition', $c['id']);
    if (acp_fait('composition', $c['id'])) return acp_suivi($cle)['etats'] ?? ['story de la composition déjà publiée'];
    $reg = acp_reglages(); $t = acp_maintenant();
    if (($m = acp_motif('composition', $c, $reg, $t)) !== null) return ["pas de story de la composition : $m"];
    if (!$force) {
        $f = acp_fenetre($c, $reg, acp_cron_frequent($t));
        if (!$f || $t < $f[0] || $t > $f[1]) return ['story de la composition pas encore à l\'heure'];
    }
    if (!acp_verrou()) return ['une publication est déjà en cours : réessaie dans une minute'];
    try { return acp_publier('composition', $c, $reg, $journal); }
    finally { acp_liberer(); }
}

/* ---------- passage du cron (toutes les 5 minutes, et à chaque passage du cron horaire) ---------- */
function acp_cron(array &$journal, ?int $maintenant = null): void {
    $t = $maintenant ?? acp_maintenant();
    $avant = $GLOBALS['acp_maintenant'] ?? null;
    $GLOBALS['acp_maintenant'] = $t;
    $verrou = false;
    try {
        $reg = acp_reglages();
        if (!$reg['actif'] || (!$reg['convocation'] && !$reg['composition'])) return;
        if (!function_exists('acp_convocation')) { $journal[] = 'stories des compos : affiches absentes (compo-affiches.php)'; return; }
        if (!aff_polices_ok()) { $journal[] = 'stories des compos : polices introuvables dans api/polices'; return; }
        $auj = date('Y-m-d', $t);
        $compos = array_values(array_filter(acp_compos_publiees(), fn($c) => (string) ($c['date'] ?? '') >= $auj));
        if (!$compos) return;
        if (!($verrou = acp_verrou())) { $journal[] = 'stories des compos : une publication est déjà en cours'; return; }
        $frequent = acp_cron_frequent($t);
        $depuis = acp_depuis($t);
        foreach ($compos as $c) {
            // a) convocation de rattrapage (l'appel de l'application n'est pas parti, compo publiée par « Publier », soirée…)
            if ($reg['convocation'] && acp_de_jour($t) && !acp_fait('convocation', $c['id']) && acp_rattrapage_ok($c, $depuis)
                && acp_motif('convocation', $c, $reg, $t) === null)
                acp_publier('convocation', $c, $reg, $journal);
            // b) composition : minutesAvant avant le coup d'envoi (cron des 5 minutes), sinon dans l'heure qui précède
            $f = acp_fenetre($c, $reg, $frequent);
            if ($reg['composition'] && $f && $t >= $f[0] && $t <= $f[1] && !acp_fait('composition', $c['id'])
                && acp_motif('composition', $c, $reg, $t) === null)
                acp_publier('composition', $c, $reg, $journal);
        }
    } finally {
        if ($verrou) acp_liberer();
        if ($avant === null) unset($GLOBALS['acp_maintenant']); else $GLOBALS['acp_maintenant'] = $avant;
    }
}

/* ---------- où en sont les stories d'une compo (pour l'espace club) ---------- */
function acp_etat(string $id): array {
    $c = acp_compo($id);
    if (!$c) return ['id' => $id, 'existe' => false];
    $reg = acp_reglages(); $t = acp_maintenant();
    $frequent = acp_cron_frequent($t);
    $r = ['id' => $id, 'existe' => true, 'equipe' => (string) ($c['equipe'] ?? ''), 'publie' => !empty($c['publie']),
          'actif' => $reg['actif'], 'style' => $reg['style'], 'cronFrequent' => $frequent];
    foreach (['convocation', 'composition'] as $quoi) {
        $cle = acp_cle($quoi, $id); $s = acp_suivi($cle);
        $fait = reglage("pub_$cle") === 'fait';
        $e = ['publiee' => !empty($s['publiee']), 'fait' => $fait, 'quand' => $s['quand'] ?? null, 'etats' => $s['etats'] ?? [],
              'motif' => $fait ? null : acp_motif($quoi, $c, $reg, $t)];
        if ($quoi === 'convocation') $e['attente'] = !$fait && reglage("acp_attente_$cle") === '1';
        else {
            $f = acp_fenetre($c, $reg, $frequent);
            $e['prevue'] = $f ? $f[0] + ($frequent ? 0 : 3600) : null;          // l'heure visée : minutesAvant avant le coup d'envoi
            $e['debut'] = $f[0] ?? null; $e['fin'] = $f[1] ?? null; $e['precise'] = $frequent;
            $e['minutesAvant'] = $reg['minutesAvant'];
        }
        $r[$quoi] = $e;
    }
    return $r;
}
function acp_info(): array {
    $vu = (int) reglage('cron_compos_vu', '0');
    $hote = $_SERVER['HTTP_HOST'] ?? 'asf-pierrelatte.fr';
    $r = ['reglages' => acp_reglages(), 'styles' => acp_styles(), 'affiches' => function_exists('acp_convocation'),
          'cron' => ['vu' => $vu ? date('c', $vu) : null, 'frequent' => acp_cron_frequent(time())],
          'url' => 'https://' . $hote . (defined('BASE') ? BASE : '') . '/api/affiches.php?cron_compos=1&cle=TA_CLE', 'cleDefinie' => defined('CLE_ECRITURE')];
    if (rang_effectif() >= 3) $r['commande'] = '/usr/local/bin/php ' . __FILE__ . ' compos > /dev/null 2>&1';
    return $r;
}

/* ---------- réponses ---------- */
function acp_json(array $d, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function acp_texte(string $t, int $code): void {
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8'); header('Cache-Control: no-store');
    echo $t;
    exit;
}

/* cron des 5 minutes : php …/api/affiches.php compos (ligne de commande), ou ?cron_compos=1&cle=<CLE_ECRITURE>.
   Appelé AVANT la vérification du compte (pas de session dans un cron). */
function acp_entree_cron(): void {
    $cli = PHP_SAPI === 'cli' && in_array('compos', array_slice((array) ($_SERVER['argv'] ?? []), 1), true);
    $url = !$cli && PHP_SAPI !== 'cli' && isset($_GET['cron_compos']);
    if (!$cli && !$url) return;
    if ($url && (!defined('CLE_ECRITURE') || !is_string($_GET['cle'] ?? null) || !hash_equals((string) CLE_ECRITURE, $_GET['cle'])))
        acp_json(['erreur' => 'Clé absente ou refusée : ajoute &cle= suivi de la clé d\'écriture du site.'], 403);
    @set_time_limit(240);
    reglage_ecrire('cron_compos_vu', (string) time());
    $journal = [];
    try { acp_cron($journal); } catch (Throwable $e) { $journal[] = 'stories des compos : erreur ' . $e->getMessage(); }
    if ($cli) { if ($journal) echo date('d/m/Y H:i') . "\n" . implode("\n", $journal) . "\n"; exit; }
    acp_json(['ok' => true, 'journal' => $journal]);
}

/* adresses de l'espace club (après la vérification coach ou bureau) */
function acp_route(): void {
    $ap = $_GET['apercu'] ?? null;
    if ($ap === 'convocation' || $ap === 'composition') acp_route_apercu($ap);
    if (isset($_GET['compo_story'])) acp_route_story();
    if (isset($_GET['compo_etat'])) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') acp_json(['erreur' => 'Utilise GET pour lire l\'état des stories.'], 405);
        $id = acp_id($_GET['compo_etat']);
        if ($id === '') acp_json(['erreur' => 'Identifiant de compo manquant ou invalide.'], 400);
        $e = acp_etat($id);
        if (empty($e['existe'])) acp_json(['erreur' => 'Compo introuvable.'], 404);
        acp_json($e);
    }
    if (isset($_GET['compo_info'])) acp_json(acp_info());
}
function acp_route_apercu(string $quoi): void {
    if (!function_exists('acp_convocation')) acp_texte('Affiches des compos absentes : dépose compo-affiches.php et reconstruis affiches.php.', 500);
    $reg = acp_reglages();
    $style = is_string($_GET['style'] ?? null) && isset(acp_styles()[$_GET['style']]) ? $_GET['style'] : $reg['style'];
    $noms = in_array($_GET['noms'] ?? '', ['auto', 'complet', 'initiale'], true) ? $_GET['noms'] : $reg['noms'];
    $exemple = !empty($_GET['exemple']);
    if ($exemple) $c = acp_exemple(mb_substr(trim((string) ($_GET['equipe'] ?? '')), 0, 60) ?: 'Seniors 1');
    else {
        $id = acp_id($_GET['id'] ?? '');
        if ($id === '') acp_texte('Identifiant de compo manquant (&id=…).', 400);
        $c = acp_compo($id);
        if (!$c) acp_texte('Compo introuvable.', 404);
    }
    try { $im = acp_image($quoi, $c, $style, $noms); }
    catch (Throwable $e) { acp_texte('Affiche impossible à dessiner : ' . $e->getMessage(), 500); }
    $l = (int) ($_GET['l'] ?? 0);                               // vignette : largeur demandée (la story garde ses proportions)
    if ($l >= 120 && $l < imagesx($im)) {
        $h = (int) round($l * imagesy($im) / imagesx($im));
        $p = imagecreatetruecolor($l, $h);
        imagecopyresampled($p, $im, 0, 0, 0, 0, $l, $h, imagesx($im), imagesy($im));
        imagedestroy($im); $im = $p;
    }
    header('Content-Type: image/jpeg');
    header('Cache-Control: ' . ($exemple ? 'private, max-age=86400' : 'no-store'));
    if (!empty($_GET['telecharger'])) header('Content-Disposition: attachment; filename="asf-pierrelatte-' . $quoi . '.jpg"');
    imagejpeg($im, null, $l ? 85 : 92);
    imagedestroy($im);
    exit;
}
function acp_route_story(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') acp_json(['erreur' => 'Utilise POST pour publier une story.'], 405);
    $id = acp_id($_GET['compo_story']);
    if ($id === '') acp_json(['erreur' => 'Identifiant de compo manquant ou invalide.'], 400);
    if (!acp_compo($id)) acp_json(['erreur' => 'Compo introuvable.'], 404);
    @set_time_limit(120);
    $journal = [];
    try {
        $etats = ($_GET['quoi'] ?? '') === 'composition' ? acp_publier_composition($id, $journal, true)
            : acp_publier_convocation($id, $journal, !empty($_GET['forcer']));
    } catch (Throwable $e) { acp_json(['erreur' => 'Publication impossible : ' . $e->getMessage()], 500); }
    acp_json(['etats' => $etats, 'etat' => acp_etat($id)]);
}

/* ---------- Facebook ---------- */
/* images d'une annonce Facebook : les deux feuilles en 1080 x 2160 (Facebook les montre en entier côte à côte) ;
   une feuille seule en 1080 x 1350, car Facebook coupe dans le fil une image seule plus haute que 4:5 */
function aff_images_fb(array $f, string $pre = ''): array {
    $fb = array_values(array_filter([$f[$pre . 'dom_fb'] ?? null, $f[$pre . 'ext_fb'] ?? null]));
    if (count($fb) > 1) return $fb;
    $carre = array_values(array_filter([$f[$pre . 'dom_carre'] ?? null, $f[$pre . 'ext_carre'] ?? null]));
    return $carre ?: $fb;
}
function fb_pret(): bool { return reglage('fb_page_id') && reglage('fb_token') && reglage('fb_pause') !== '1'; }
function fb_appel(string $chemin, array $champs): array {
    $ch = curl_init('https://graph.facebook.com/' . FB_VERSION . '/' . $chemin);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $champs, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60]);
    $r = json_decode((string) curl_exec($ch), true) ?: [];
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 400 || isset($r['error'])) throw new RuntimeException(fb_erreur_fr($r['error'] ?? [], (int) $code));
    return $r;
}
/* traduit une erreur de Facebook en une phrase claire, avec ce qu'il faut faire */
function fb_erreur_fr(array $e, int $http = 0): string {
    $c = (int) ($e['code'] ?? 0); $sc = (int) ($e['error_subcode'] ?? 0);
    $brut = trim((string) ($e['error_user_msg'] ?? ($e['message'] ?? "erreur $http")));
    $m = mb_strtolower($brut);
    $aide = match (true) {
        str_contains($m, 'identity') || str_contains($m, 'identité') || str_contains($m, 'publishing authorization') || $sc === 2069007
            => "Meta demande de confirmer ton identité avant que le site publie : sur ton téléphone, ouvre facebook.com/id (connecté à Facebook) et va jusqu'au bout.",
        $c === 190 => "La clé de la page a expiré ou a été retirée : relie à nouveau la page dans les réglages.",
        $c === 368 => "Facebook bloque temporairement les publications de la page (trop de publications ou de suppressions rapprochées) : attends 24 à 72 h avant de réessayer.",
        $c === 10 || $c === 200 || $c === 3 => "L'application n'a pas le droit de publier sur cette page : vérifie qu'elle est « En production » et que la page est bien cochée avec l'autorisation pages_manage_posts.",
        $c === 100 && $sc === 33 => "Cet identifiant n'est pas une page que l'application peut gérer.",
        in_array($c, [4, 17, 32, 613], true) => "Trop de demandes envoyées à Facebook d'un coup : réessaie dans une heure.",
        $c === 9004 || str_contains($m, 'media') => "Facebook n'a pas pu récupérer l'image : réessaie dans quelques minutes.",
        default => '',
    };
    return 'Facebook' . ($c ? " (code $c" . ($sc ? "/$sc" : '') . ')' : '') . ' : ' . $brut . ($aide ? ' → ' . $aide : '');
}
function fb_photo_cachee(string $fichier, string $page, string $jeton): string {
    $r = fb_appel("$page/photos", ['source' => new CURLFile($fichier, 'image/jpeg'), 'published' => 'false', 'access_token' => $jeton]);
    if (empty($r['id'])) throw new RuntimeException('Facebook : photo refusée');
    return $r['id'];
}
/* vérifie que Facebook et Instagram acceptent une publication du site, sans rien publier pour de vrai */
function fb_tester_publication(): array {
    $l = [];
    $dossier = dirname(__DIR__) . '/affiches'; if (!is_dir($dossier)) @mkdir($dossier, 0755, true);
    $f = "$dossier/test-publication.jpg";
    $im = imagecreatetruecolor(600, 600); imagefill($im, 0, 0, imagecolorallocate($im, 28, 63, 158)); imagejpeg($im, $f, 85); imagedestroy($im);
    if (!fb_pret()) $l[] = 'Facebook : page non reliée ou publication en pause.';
    else {
        foreach (fb_pages() as $p) {
            try {
                $effacer = function (string $id) use ($p) {
                    try { $ch = curl_init('https://graph.facebook.com/' . FB_VERSION . "/$id?access_token=" . urlencode($p['jeton']));
                          curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => 'DELETE', CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20]); curl_exec($ch); curl_close($ch); } catch (Throwable $e) {}
                };
                $id = fb_photo_cachee($f, $p['id'], $p['jeton']);          // photo non publiée : invisible sur la page
                $effacer($id);
                // publication non publiée (invisible) : c'est exactement le chemin des vraies annonces, puis on l'efface
                $post = fb_appel($p['id'] . '/feed', ['message' => 'Test du site asf-pierrelatte.fr', 'published' => 'false', 'access_token' => $p['jeton']]);
                if (!empty($post['id'])) $effacer((string) $post['id']);
                $l[] = '✅ Facebook accepte les publications du site sur la page ' . $p['id'] . '.';
            } catch (Throwable $e) { $l[] = '❌ ' . $e->getMessage(); }
        }
    }
    if (!ig_pret()) $l[] = 'Instagram : compte non relié ou publication en pause.';
    else {
        try { ig_conteneur(['image_url' => ig_url($f)]); $l[] = '✅ Instagram accepte les publications du site.'; }   // préparé mais jamais publié
        catch (Throwable $e) { $l[] = '❌ Instagram : ' . preg_replace('/^Facebook/', '', $e->getMessage()); }
    }
    return $l;
}
/* pages où publier : la page du club, et pendant le changement de page, l'ancienne aussi */
function fb_pages(): array {
    // une seule page : celle du club. L'ancienne « deuxième page » (abandonnée) est effacée si elle traîne encore dans les réglages.
    if (reglage('fb_page2_id') || reglage('fb_token2')) { reglage_ecrire('fb_page2_id', null); reglage_ecrire('fb_token2', null); }
    return (reglage('fb_page_id') && reglage('fb_token')) ? [['id' => reglage('fb_page_id'), 'jeton' => reglage('fb_token')]] : [];
}
function fb_story(string $fichier): void {
    $erreurs = [];
    foreach (fb_pages() as $p) {
        try { fb_appel($p['id'] . '/photo_stories', ['photo_id' => fb_photo_cachee($fichier, $p['id'], $p['jeton']), 'access_token' => $p['jeton']]); }
        catch (Throwable $e) { $erreurs[] = $p['id'] . ' : ' . $e->getMessage(); }
    }
    if (count($erreurs) === count(fb_pages())) throw new RuntimeException(implode(' · ', $erreurs));
}
/* une vidéo dans le fil de la page : Facebook va la chercher à son adresse publique (dossier /affiches) */
function fb_video(string $fichier, string $texte): void {
    $erreurs = [];
    foreach (fb_pages() as $p) {
        try {
            $ch = curl_init('https://graph-video.facebook.com/' . FB_VERSION . '/' . $p['id'] . '/videos');
            curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 180,
                CURLOPT_POSTFIELDS => ['file_url' => ig_url($fichier), 'description' => $texte, 'access_token' => $p['jeton']]]);
            $r = json_decode((string) curl_exec($ch), true) ?: [];
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($code >= 400 || isset($r['error'])) throw new RuntimeException(fb_erreur_fr($r['error'] ?? [], (int) $code));
        } catch (Throwable $e) { $erreurs[] = $p['id'] . ' : ' . $e->getMessage(); }
    }
    if (count($erreurs) === count(fb_pages())) throw new RuntimeException(implode(' · ', $erreurs));
}
/* une vidéo en story Facebook : on ouvre l'envoi, Facebook télécharge la vidéo à son adresse publique, puis on publie */
function fb_story_video(string $fichier): void {
    $erreurs = [];
    foreach (fb_pages() as $p) {
        try {
            $debut = fb_appel($p['id'] . '/video_stories', ['upload_phase' => 'start', 'access_token' => $p['jeton']]);
            if (empty($debut['video_id']) || empty($debut['upload_url'])) throw new RuntimeException("Facebook n'a pas ouvert l'envoi de la story vidéo");
            $ch = curl_init($debut['upload_url']);
            curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 180, CURLOPT_POSTFIELDS => '',
                CURLOPT_HTTPHEADER => ['Authorization: OAuth ' . $p['jeton'], 'file_url: ' . ig_url($fichier)]]);
            $r = json_decode((string) curl_exec($ch), true) ?: [];
            curl_close($ch);
            if (empty($r['success'])) throw new RuntimeException('Facebook : la vidéo de la story n\'a pas pu être envoyée');
            fb_appel($p['id'] . '/video_stories', ['upload_phase' => 'finish', 'video_id' => $debut['video_id'], 'access_token' => $p['jeton']]);
        } catch (Throwable $e) { $erreurs[] = $p['id'] . ' : ' . $e->getMessage(); }
    }
    if (count($erreurs) === count(fb_pages())) throw new RuntimeException(implode(' · ', $erreurs));
}
function est_video(string $fichier): bool { return (bool) preg_match('/\.(mp4|mov|m4v|webm)$/i', $fichier); }
function fb_publication(array $fichiers, string $texte): void {
    $erreurs = [];
    foreach (fb_pages() as $p) {
        try {
            $champs = ['message' => $texte, 'access_token' => $p['jeton']];
            foreach (array_values($fichiers) as $i => $f) $champs["attached_media[$i]"] = json_encode(['media_fbid' => fb_photo_cachee($f, $p['id'], $p['jeton'])]);
            fb_appel($p['id'] . '/feed', $champs);
        } catch (Throwable $e) { $erreurs[] = $p['id'] . ' : ' . $e->getMessage(); }
    }
    if (count($erreurs) === count(fb_pages())) throw new RuntimeException(implode(' · ', $erreurs));
}

/* ---------- Instagram (compte professionnel relié à la page Facebook) ----------
   Instagram va chercher l'image à une adresse publique : on lui donne celle du fichier dans /affiches. */
function ig_pret(): bool { return reglage('ig_id') && reglage('fb_token') && reglage('fb_pause') !== '1'; }
function fb_lire(string $chemin, array $q = []): array {
    $ch = curl_init('https://graph.facebook.com/' . FB_VERSION . '/' . $chemin . '?' . http_build_query($q + ['access_token' => reglage('fb_token')]));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30]);
    $r = json_decode((string) curl_exec($ch), true) ?: [];
    curl_close($ch);
    if (isset($r['error'])) throw new RuntimeException('Meta : ' . ($r['error']['message'] ?? 'erreur'));
    return $r;
}
function ig_url(string $fichier): string {
    $site = rtrim(reglage('site_url') ?: ('https://' . ($_SERVER['HTTP_HOST'] ?? 'asf-pierrelatte.fr')), '/');
    return $site . BASE . '/affiches/' . basename($fichier) . '?v=' . @filemtime($fichier);
}
/* prépare un média Instagram et attend qu'il soit prêt, puis rend son identifiant */
function ig_conteneur(array $champs): string {
    $ig = reglage('ig_id');
    $c = fb_appel("$ig/media", $champs + ['access_token' => reglage('fb_token')]);
    if (empty($c['id'])) throw new RuntimeException('Instagram : fichier refusé');
    $video = isset($champs['video_url']);
    for ($i = 0; $i < ($video ? 60 : 15); $i++) {  // Instagram prépare le fichier avant de pouvoir le publier (une vidéo prend plus de temps)
        $s = fb_lire($c['id'], ['fields' => 'status_code,status']);
        if (($s['status_code'] ?? '') === 'FINISHED') break;
        if (($s['status_code'] ?? '') === 'ERROR') throw new RuntimeException($video
            ? "Instagram : la vidéo n'a pas pu être traitée (format MP4 en H.264 conseillé, 3 s à 15 min, 1 Go au plus)"
            : "Instagram : l'image n'a pas pu être traitée");
        sleep($video ? 3 : 2);
    }
    return (string) $c['id'];
}
function ig_publier(array $champs): void {
    fb_appel(reglage('ig_id') . '/media_publish', ['creation_id' => ig_conteneur($champs), 'access_token' => reglage('fb_token')]);
}
function ig_story(string $fichier): void {
    ig_publier(est_video($fichier) ? ['video_url' => ig_url($fichier), 'media_type' => 'STORIES'] : ['image_url' => ig_url($fichier), 'media_type' => 'STORIES']);
}
/* publication dans le fil Instagram : une image, ou un carrousel domicile + extérieur, avec le même texte que Facebook */
function ig_publication(array $fichiers, string $texte): void {
    $fichiers = array_values(array_filter($fichiers));
    if (!$fichiers) return;
    $legende = mb_substr(trim($texte), 0, 2150);
    if (count($fichiers) === 1) {
        ig_publier(est_video($fichiers[0]) ? ['video_url' => ig_url($fichiers[0]), 'media_type' => 'REELS', 'caption' => $legende, 'share_to_feed' => 'true']
            : ['image_url' => ig_url($fichiers[0]), 'caption' => $legende]);
        return;
    }
    $enfants = [];
    foreach (array_slice($fichiers, 0, 10) as $f)
        $enfants[] = ig_conteneur(est_video($f) ? ['video_url' => ig_url($f), 'media_type' => 'VIDEO', 'is_carousel_item' => 'true']
            : ['image_url' => ig_url($f), 'is_carousel_item' => 'true']);
    ig_publier(['media_type' => 'CAROUSEL', 'children' => implode(',', $enfants), 'caption' => $legende]);
}

/* ---------- messages des publications, rédigés à partir des scores et du programme ---------- */
/* « CERC.S. DE MALATAVERNE » → « Cerc.S. de Malataverne » ; « F.C. TRICASTIN » → « F.C. Tricastin » ; sigles gardés */
function aff_joli(string $t): string {
    $petits = ['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'en', 'aux', 'au', 'sous'];
    $sigles = ['FC', 'US', 'AS', 'RC', 'SC', 'ES', 'OL', 'CO', 'AC', 'AV', 'ASF', 'UMS', 'RCS', 'AFC', 'JS', 'SO', 'ASPTT', 'OMS'];
    $mots = preg_split('/(\s+)/u', trim($t), -1, PREG_SPLIT_DELIM_CAPTURE);
    $i = 0;
    foreach ($mots as &$w) {
        if (trim($w) === '') continue;
        $nu = preg_replace('/[^A-Za-zÀ-ÿ0-9]/u', '', $w);
        if (preg_match('/^([A-ZÀ-Ý]\.)+[A-ZÀ-Ý]?\.?$/u', $w) || in_array(mb_strtoupper($nu), $sigles, true) || preg_match('/^(U\d{1,2}|[DR]\d|\d+)$/iu', $nu)) { $w = mb_strtoupper($w); }
        elseif ($i > 0 && in_array(mb_strtolower($nu), $petits, true)) { $w = mb_strtolower($w); }
        else {
            $w = mb_strtolower($w);
            $w = preg_replace_callback("/(^|[-'’.])(\p{L})/u", fn($x) => $x[1] . mb_strtoupper($x[2]), $w);
        }
        $i++;
    }
    unset($w);
    return implode('', $mots);
}
function aff_nom_club(string $adv): string { return aff_joli(preg_replace('/\s+\d+$/', '', trim($adv))); }
/* nom d'équipe dans les textes : « Seniors 1 », « U15 R2 », « U15 2 », « U10-U11 Avenir », « U13 équipe 3 » */
function aff_nom_equipe(array $m): string {
    $e = (string) ($m['equipeDetail'] ?? '') !== '' ? (string) $m['equipeDetail'] : (string) ($m['equipe'] ?? '');
    $e = preg_replace('/r[ée]gional(?:e)?\s*(\d)/iu', 'R$1', $e);
    $e = preg_replace('/f[ée]minin[a-z]*\b.*$/iu', 'Féminines', $e);
    $e = str_replace(' · ', ' ', $e);
    $e = preg_replace('/^(U\d{1,2}) (U\d{1,2})\b/u', '$1-$2', $e);
    return str_replace(['Équipe', 'ÉQUIPE', 'Equipe'], 'équipe', aff_joli($e));
}
function aff_message_resultats(array $matchs, string $samedi, ?string $lieu = null): string {
    $plan = aff_plan_weekend($matchs, $samedi, true, $lieu);
    $v = $n = $d = $nc = [];
    foreach ($plan as $j) foreach ($j['matchs'] as $m) {
        $adv = aff_nom_club((string) $m['adv']); $eq = aff_nom_equipe($m);
        if (!aff_joue($m)) { $nc[] = "• $eq face à $adv : score à venir"; continue; }
        $dom = !empty($m['dom']);
        // une phrase par équipe, selon son résultat et l'écart
        $bp = (int) $m['bp']; $bc = (int) $m['bc']; $ecart = abs($bp - $bc); $ou = $dom ? 'à domicile' : "à l'extérieur";
        $sc = "$bp-$bc";
        if ($bp > $bc)      $phrase = $ecart >= 3 ? "large victoire de nos $eq, $sc face à $adv $ou" : ($ecart === 1 ? "victoire arrachée par nos $eq, $sc contre $adv $ou" : "nos $eq s'imposent $sc face à $adv $ou");
        elseif ($bp < $bc)  $phrase = $ecart === 1 ? "courte défaite de nos $eq, $sc contre $adv $ou" : "nos $eq s'inclinent $sc face à $adv $ou";
        else                $phrase = $bp === 0 ? "match nul et vierge pour nos $eq face à $adv $ou" : "nos $eq accrochent le nul $sc face à $adv $ou";
        $ligne = '• ' . mb_strtoupper(mb_substr($phrase, 0, 1)) . mb_substr($phrase, 1) . ($dom ? ' 🏠' : ' ✈️');
        ['V' => function () use (&$v, $ligne) { $v[] = $ligne; }, 'N' => function () use (&$n, $ligne) { $n[] = $ligne; }, 'D' => function () use (&$d, $ligne) { $d[] = $ligne; }][aff_issue($m)]();
    }
    $total = count($v) + count($n) + count($d);
    if (!$total && !$nc) return '';
    if ($nc) $intro = "⚽ Voici les résultats du week-end de l'ASF Pierrelatte !";
    elseif ($total && count($v) === $total) $intro = "🔥 Carton plein ce week-end pour l'ASF Pierrelatte ! Toutes nos équipes se sont imposées 💙";
    elseif (count($v) > count($d)) $intro = "⚽ Beau week-end pour l'ASF Pierrelatte ! Voici les résultats de nos équipes 💙";
    elseif (count($v) === count($d) && $total) $intro = "⚽ Voici les résultats du week-end de l'ASF Pierrelatte !";
    else $intro = "⚽ Week-end compliqué pour nos équipes, mais on se relève ensemble dès la semaine prochaine 💪";
    $txt = [$intro, ''];
    if ($lieu) array_splice($txt, 1, 0, [$lieu === 'dom' ? '🏠 Nos matchs à domicile' : "✈️ Nos matchs à l'extérieur"]);
    if ($v) { $txt[] = count($v) > 1 ? "✅ Victoires" : "✅ Victoire"; array_push($txt, ...$v); $txt[] = ''; }
    if ($n) { $txt[] = count($n) > 1 ? "🤝 Matchs nuls" : "🤝 Match nul"; array_push($txt, ...$n); $txt[] = ''; }
    if ($d) { $txt[] = count($d) > 1 ? "❌ Défaites" : "❌ Défaite"; array_push($txt, ...$d); $txt[] = ''; }
    if ($nc) { array_push($txt, ...$nc); $txt[] = ''; }
    $txt[] = count($v) ? 'Bravo à tous nos joueurs, joueuses et éducateurs 👏' : 'Merci à nos supporters pour leur soutien 🙏';
    $txt[] = 'Tous les résultats sur asf-pierrelatte.fr';
    $txt[] = '#ASFPierrelatte #AtomSports #Pierrelatte';
    return implode("\n", $txt);
}
/* texte de l'annonce du foot animation */
function aff_message_plateaux(array $matchs, string $samedi, bool $resultats = false, ?string $lieu = null): string {
    $GLOBALS['aff_fal'] = true;
    $plan = aff_plan_weekend($matchs, $samedi, $resultats, $lieu);
    $GLOBALS['aff_fal'] = false;
    if (!$plan) return '';
    $liste = fn(array $noms) => count($noms) > 1 ? implode(', ', array_slice($noms, 0, -1)) . ' et ' . end($noms) : ($noms[0] ?? '');
    if (!$resultats) {
        $txt = ["⚽ Foot animation : le programme du week-end de nos jeunes" . ($lieu === 'dom' ? ' à domicile' : ($lieu === 'ext' ? " à l'extérieur" : '')) . ' !', ''];
        foreach ($plan as $j) {
            $txt[] = '🗓️ ' . aff_date_longue($j['date']);
            foreach ($j['matchs'] as $m) {
                $eq = aff_nom_equipe($m); $h = aff_hfr($m['heure'] ?? '');
                $ou = !empty($m['dom']) ? 'à domicile, au stade Gustave Jaume' : 'chez ' . aff_nom_club((string) $m['adv']);
                if (!empty($m['nos']) || !empty($m['tableau'])) { array_push($txt, ...afn_msg_poules($m, $eq, $ou, $h)); continue; }
                $contre = afn_noms_clubs($m['adversaires'] ?? []);
                $txt[] = (!empty($m['dom']) ? '🏠 ' : '✈️ ') . "$eq · " . mb_strtolower((string) ($m['comp'] ?? 'plateau')) . " $ou" . ($h ? " à $h" : '')
                    . ($contre ? ', avec ' . $liste($contre) : '');
            }
            $txt[] = '';
        }
        $txt[] = 'Allez les petits ! 💙🤍';
        $txt[] = '#ASFPierrelatte #FootAnimation #EcoleDeFoot';
        return implode("\n", $txt);
    }
    // résultats : U10-U11 et U13, une ligne par match, et une phrase d'introduction selon le bilan
    $v = $n = $d = 0; $blocs = [];
    foreach ($plan as $j) foreach ($j['matchs'] as $m) {
        $lignes = [];
        $nomsR = afn_noms_clubs(array_column(aff_scores_brassage($m), 'adv'));
        foreach (aff_scores_brassage($m) as $iR => $r) {
            $bp = (int) $r['bp']; $bc = (int) $r['bc'];
            if ($bp > $bc) { $v++; $e = '✅'; } elseif ($bp < $bc) { $d++; $e = '❌'; } else { $n++; $e = '🤝'; }
            $lignes[] = "   $e $bp-$bc contre " . $nomsR[$iR];
        }
        if (!empty($m['nos']) || !empty($m['tableau'])) $lignes = afn_msg_poules_res($m);
        $blocs[] = (!empty($m['dom']) ? '🏠 ' : '✈️ ') . aff_nom_equipe($m) . ' · ' . (!empty($m['dom']) ? 'à domicile' : 'chez ' . aff_nom_club((string) $m['adv']))
            . "\n" . implode("\n", $lignes);
    }
    $total = $v + $n + $d;
    $pl = fn($k, $mot) => "$k $mot" . ($k > 1 ? 's' : '');
    $bilan = implode(', ', array_filter([$v ? $pl($v, 'victoire') : '', $n ? $pl($n, 'nul') : '', $d ? $pl($d, 'défaite') : '']));
    if ($total && $v === $total) $intro = "🔥 Carton plein pour nos jeunes ce week-end : $bilan !";
    elseif ($v > $d)             $intro = "💪 Beau week-end pour nos jeunes : $bilan.";
    elseif ($v === $d)           $intro = "⚖️ Week-end équilibré pour nos jeunes : $bilan.";
    else                         $intro = "Week-end compliqué pour nos jeunes ($bilan), on garde le sourire et on continue de progresser ! 💙";
    return "⚽ Foot animation : les résultats du week-end" . ($lieu === 'dom' ? ' à domicile' : ($lieu === 'ext' ? " à l'extérieur" : '')) . "\n\n$intro\n\n" . implode("\n\n", $blocs)
        . "\n\nBravo à nos joueurs et à leurs éducateurs ! 👏\n#ASFPierrelatte #FootAnimation";
}
function aff_message_veterans(array $matchs, string $samedi, bool $resultats, ?string $lieu = null): string {
    $GLOBALS['aff_vet'] = true;
    $t = $resultats ? aff_message_resultats($matchs, $samedi, $lieu) : aff_message_rencontres($matchs, $samedi, $lieu);
    $GLOBALS['aff_vet'] = false;
    if (trim($t) === '') return '';
    $t = preg_replace("/^[^\n]*\n/u", '', $t, 1);                        // on remplace la phrase d'introduction générale
    $GLOBALS['aff_vet'] = true; $nb = array_sum(array_map(fn($j) => count($j['matchs']), aff_plan_weekend($matchs, $samedi, $resultats, $lieu))); $GLOBALS['aff_vet'] = false;
    return ($resultats ? ($nb > 1 ? "⚽ Vétérans : les résultats du week-end\n" : "⚽ Vétérans : le résultat du week-end\n")
        : ($nb > 1 ? "⚽ Vétérans : les matchs du week-end\n" : "⚽ Vétérans : le match du week-end\n")) . $t;
}
function aff_message_rencontres(array $matchs, string $samedi, ?string $lieu = null): string {
    $plan = aff_plan_weekend($matchs, $samedi, false, $lieu);
    if (!$plan) return '';
    $txt = [$lieu === 'dom' ? "🏠 Le programme du week-end à domicile de l'ASF Pierrelatte !" : ($lieu === 'ext' ? "✈️ Le programme du week-end à l'extérieur de l'ASF Pierrelatte !" : "📅 Le programme du week-end de l'ASF Pierrelatte !"), ''];
    $domicile = false;
    foreach ($plan as $j) {
        $txt[] = '🗓️ ' . aff_date_longue($j['date']);
        foreach ($j['matchs'] as $m) {
            $adv = aff_nom_club((string) $m['adv']); $h = aff_hfr($m['heure'] ?? '');
            $eq = aff_nom_equipe($m);
            if (!empty($m['dom'])) { $domicile = true; $txt[] = "🏠 $eq reçoit $adv" . ($h !== '' ? " à $h" : ''); }
            else $txt[] = "✈️ $eq se déplace à $adv" . ($h !== '' ? " à $h" : '');
        }
        $txt[] = '';
    }
    if ($domicile) $txt[] = 'Venez nombreux encourager nos équipes au stade Gustave Jaume 💙';
    else $txt[] = 'Allez Pierrelatte ! 💙';
    $txt[] = 'Toutes les infos et les itinéraires sur asf-pierrelatte.fr';
    $txt[] = '#ASFPierrelatte #AtomSports #Pierrelatte';
    return implode("\n", $txt);
}

/* ---------- historique visible par les dirigeants ---------- */
function aff_historique(string $cle, string $titre, array $fichiers, string $etat): void {
    $h = aff_doc('site/affiches');
    $liste = array_values(array_filter($h['liste'] ?? [], fn($x) => ($x['cle'] ?? '') !== $cle));
    array_unshift($liste, ['cle' => $cle, 'titre' => $titre, 'date' => date('c'), 'etat' => $etat,
        'images' => array_map(fn($f) => '/affiches/' . basename($f) . '?v=' . time(), $fichiers)]);
    $json = json_encode(['liste' => array_slice($liste, 0, 30)], JSON_UNESCAPED_UNICODE);
    base()->prepare('INSERT INTO documents (path, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), maj = NOW()')->execute(['site/affiches', $json]);
}
/* Chaque affiche n'est traitée qu'une fois par réseau ; en cas d'échec, 3 essais (un par heure) sur ce réseau seulement. */
function aff_traiter(string $cle, string $titre, callable $creer, array $canaux, array &$journal): void {
    if (reglage("pub_$cle") === 'fait') return;
    $fichiers = $creer();
    if (!$fichiers) { reglage_ecrire("pub_$cle", 'fait'); return; }
    $etats = []; $reste = false;
    foreach ($canaux as $nom => $publier) {
        $pret = $nom === 'Facebook' ? fb_pret() : ig_pret();
        if (!$pret) { $etats[] = "$nom : " . (reglage('fb_pause') === '1' ? 'en pause' : 'pas relié'); continue; }
        $k = strtolower($nom) . "_$cle";
        if (reglage("pub_$k") === 'fait') { $etats[] = "$nom : publié"; continue; }
        try {
            $publier($fichiers);
            reglage_ecrire("pub_$k", 'fait'); $etats[] = "$nom : publié";
            $journal[] = "affiche $cle publiée sur $nom";
        } catch (Throwable $ex) {
            $n = (int) reglage("essai_$k", '0') + 1; reglage_ecrire("essai_$k", (string) $n);
            // blocage temporaire de Facebook (code 368) : on n'insiste pas, chaque nouvel essai prolongerait le blocage
            if (str_contains($ex->getMessage(), 'code 368')) { reglage_ecrire("pub_$k", 'fait'); $etats[] = "$nom : bloqué temporairement par Facebook, à republier avec le bouton « Publier maintenant » une fois le blocage levé"; }
            elseif ($n >= 3) { reglage_ecrire("pub_$k", 'fait'); $etats[] = "$nom : échec définitif (" . $ex->getMessage() . ')'; }
            else { $reste = true; $etats[] = "$nom : échec, nouvel essai dans une heure"; }
            $journal[] = "affiche $cle, $nom : " . $ex->getMessage();
        }
    }
    if (!$reste) reglage_ecrire("pub_$cle", 'fait');
    aff_historique($cle, $titre, array_values($fichiers), implode(' · ', $etats));
}

/* ---------- le programme, appelé à chaque passage du cron ---------- */
/* Publication à la demande : 'resultats' (week-end passé) ou 'rencontres' (week-end à venir),
   championnats puis foot animation, chacune avec ses feuilles domicile et extérieur, ses stories et son texte */
function aff_publier_annonce(string $quoi, array &$journal): void {
    if (!aff_polices_ok()) throw new RuntimeException('polices introuvables dans api/polices');
    $matchs = aff_matchs();
    $lundi = date('Y-m-d', strtotime('monday this week'));
    $res = $quoi === 'resultats';
    $samedi = $res ? date('Y-m-d', strtotime("$lundi -2 days")) : date('Y-m-d', strtotime("$lundi +5 days"));
    foreach (['', 'fal'] as $genre) {
        $lieux = aff_lieux($matchs, $samedi, $res, $genre);
        if (!$lieux) { $journal[] = ucfirst(($genre === 'fal' ? 'Foot animation · ' : '') . ($res ? 'résultats' : 'rencontres')) . ' : rien à publier'; continue; }
        foreach ($lieux as $l) {                                                  // une publication par lieu
            $f = aff_feuilles_lieu($matchs, $samedi, $res, $l, $genre, ($genre === 'fal' ? 'fal-' : '') . ($res ? 'resultats' : 'rencontres') . "-$samedi-manuel");
            $texte = aff_message_lieu($genre, $matchs, $samedi, $res, $l);
            $etats = [];
            if (fb_pret()) {
                try { foreach (aff_pages($f, 'story') as $st) fb_story($st); fb_publication(aff_images_fb_lieu($f), $texte); $etats[] = 'Facebook : publié'; }
                catch (Throwable $e) { $etats[] = 'Facebook : ' . $e->getMessage(); }
            }
            if (ig_pret()) {
                try { foreach (aff_pages($f, 'story') as $st) ig_story($st); ig_publication(aff_pages($f, 'carre'), $texte); $etats[] = 'Instagram : publié'; }
                catch (Throwable $e) { $etats[] = 'Instagram : ' . $e->getMessage(); }
            }
            $journal[] = ucfirst(aff_nom_annonce($genre, $res, $l)) . ' : ' . ($etats ? implode(', ', $etats) : 'aucun réseau relié');
        }
    }
}
function aff_publier_choix(array $annonces, array $o, array &$journal): void {
    if (!aff_polices_ok()) throw new RuntimeException('polices introuvables dans api/polices');
    $matchs = aff_matchs();
    $lundi = date('Y-m-d', strtotime('monday this week'));
    $types = ['resultats' => [true, ''], 'rencontres' => [false, ''], 'fal-resultats' => [true, 'fal'], 'fal-rencontres' => [false, 'fal'],
              'vet-resultats' => [true, 'vet'], 'vet-rencontres' => [false, 'vet']];
    $fbPub = !empty($o['fb_pub']); $fbSt = !empty($o['fb_story']); $igPub = !empty($o['ig_pub']); $igSt = !empty($o['ig_story']);
    $fmts = array_keys(array_filter(['story' => $fbSt || $igSt, 'carre' => $igPub || $fbPub, 'fb' => $fbPub]));
    foreach ($annonces as $cle) {
        if (!isset($types[$cle])) continue;
        [$res, $genre] = $types[$cle];
        $samedi = $res ? date('Y-m-d', strtotime("$lundi -2 days")) : date('Y-m-d', strtotime("$lundi +5 days"));
        $lieux = aff_lieux($matchs, $samedi, $res, $genre);
        if (!$lieux) { $journal[] = ucfirst(($genre === 'fal' ? 'Foot animation · ' : ($genre === 'vet' ? 'Vétérans · ' : '')) . ($res ? 'résultats' : 'rencontres')) . ' : rien à publier'; continue; }
        foreach ($lieux as $l) {                                                  // une publication à domicile, une à l'extérieur
            $f = aff_feuilles_lieu($matchs, $samedi, $res, $l, $genre, "$cle-$samedi-choix", $fmts);
            $texte = aff_message_lieu($genre, $matchs, $samedi, $res, $l);
            $etats = [];
            if ($fbPub || $fbSt) {
                if (!fb_pret()) $etats[] = 'Facebook : non relié ou en pause';
                else try {
                    if ($fbSt) foreach (aff_pages($f, 'story') as $st) fb_story($st);
                    if ($fbPub && ($imgs = aff_images_fb_lieu($f))) fb_publication($imgs, $texte);
                    $etats[] = 'Facebook : ' . implode(' + ', array_filter([$fbPub ? 'publication' : '', $fbSt ? 'story' : '']));
                } catch (Throwable $e) { $etats[] = 'Facebook : ' . $e->getMessage(); }
            }
            if ($igPub || $igSt) {
                if (!ig_pret()) $etats[] = 'Instagram : non relié ou en pause';
                else try {
                    if ($igSt) foreach (aff_pages($f, 'story') as $st) ig_story($st);
                    if ($igPub && ($imgs = aff_pages($f, 'carre'))) ig_publication($imgs, $texte);
                    $etats[] = 'Instagram : ' . implode(' + ', array_filter([$igPub ? 'publication' : '', $igSt ? 'story' : '']));
                } catch (Throwable $e) { $etats[] = 'Instagram : ' . $e->getMessage(); }
            }
            $journal[] = ucfirst(aff_nom_annonce($genre, $res, $l)) . ' → ' . ($etats ? implode(', ', $etats) : 'aucun réseau choisi');
        }
    }
}
function affiches_cron(array &$journal, bool $force = false): void {
    try { acp_cron($journal); } catch (Throwable $e) { $journal[] = 'stories des compos : ' . $e->getMessage(); }   // stories des compos (convocation, composition)
    if (!aff_polices_ok()) { $journal[] = 'affiches : polices introuvables dans api/polices, ou FreeType absent'; return; }
    $maintenant = time();
    if (!$force && (int) date('G', $maintenant) < 9) return;
    $auj = date('Y-m-d', $maintenant);
    $matchs = aff_matchs();

    // lundi : résultats + rencontres, championnats, vétérans et foot animation ; une publication à domicile, une à l'extérieur
    if ((int) date('N', $maintenant) === 1 || $force) {
        $lundi = date('Y-m-d', strtotime('monday this week', $maintenant));
        $sam = date('Y-m-d', strtotime($lundi . ' +5 days'));
        $samPasse = date('Y-m-d', strtotime($lundi . ' -2 days'));
        if (!aff_deja_publie("lundi-$lundi"))
            foreach (['resultats' => [$samPasse, true], 'programme' => [$sam, false]] as $type => [$samedi, $res])
                foreach (aff_lieux($matchs, $samedi, $res, '') as $l)
                    aff_traiter_lieu("lundi-$lundi-$type", $matchs, $samedi, $res, $l, '', ($res ? 'resultats' : 'rencontres') . "-$lundi", $journal);
        // vétérans : seulement quand un match a été saisi (et son score pour les résultats) ; foot animation : rencontres et résultats
        foreach (['vet', 'fal'] as $genre)
            foreach ([['rencontres', false, $sam], ['resultats', true, $samPasse]] as [$quoi, $res, $samedi]) {
                if (aff_deja_publie("$genre-$quoi-$samedi")) continue;
                foreach (aff_lieux($matchs, $samedi, $res, $genre) as $l)
                    aff_traiter_lieu("$genre-$quoi-$samedi", $matchs, $samedi, $res, $l, $genre, "$genre-$quoi-$samedi", $journal);
            }
    }

    // jour de match : une story par équipe
    foreach ($matchs as $m) {
        if (($m['date'] ?? '') !== $auj || aff_joue($m)) continue;
        aff_traiter('match-' . $m['id'], 'Jour de match · ' . $m['equipe'], fn() => ['match' => aff_enregistrer(aff_match($m), 'match-' . cle_club($m['id']))],
            ['Facebook' => function (array $f) { fb_story($f['match']); }, 'Instagram' => function (array $f) { ig_story($f['match']); }], $journal);
    }
}

/* ---------- aperçu et téléchargement pour les dirigeants ----------
   /api/affiches.php?apercu=programme|resultats|match|score|evenement
     &date=AAAA-MM-JJ &id=… &titre=… &sous=… &texte=… &heure=… &lieu=… &sponsors=0 &telecharger=1 */
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    acp_entree_cron();                                                  // cron des stories des compos (sans session)
    if (rang_effectif() < 2) { http_response_code(403); header('Content-Type: text/plain; charset=utf-8'); echo 'Connecte-toi avec un compte coach ou bureau.'; exit; }
    @set_time_limit(60);
    acp_route();                                                        // stories des compos : ?apercu=convocation|composition, ?compo_story, ?compo_etat, ?compo_info
    // /api/affiches.php?verif=1&date=AAAA-MM-JJ : chaque match du week-end, et pourquoi il est (ou n'est pas) sur les affiches
    if (isset($_GET['verif'])) {
        header('Content-Type: text/plain; charset=utf-8');
        $d0 = preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['date'] ?? '') ? $_GET['date'] : date('Y-m-d');
        $t = strtotime($d0 . ' 12:00'); $w = (int) date('w', $t);
        $sam = date('Y-m-d', $t + (($w === 0 ? -1 : 6 - $w) * 86400));
        $jours = aff_weekend($sam); $tous = aff_matchs();
        $surAff = [];
        foreach ([true => 'Résultats', false => 'Rencontres'] as $res => $nomAff)
            foreach (aff_plan_weekend($tous, $sam, (bool) $res) as $j) foreach ($j['matchs'] as $m) $surAff[$m['id']] = $nomAff;
        $liste = array_values(array_filter($tous, fn($m) => in_array($m['date'] ?? '', $jours, true)));
        usort($liste, fn($a, $b) => strcmp(($a['date'] ?? '') . ($a['heure'] ?? ''), ($b['date'] ?? '') . ($b['heure'] ?? '')));
        echo "Week-end du " . date('d/m/Y', strtotime($jours[0])) . " au " . date('d/m/Y', strtotime($jours[2])) . " : " . count($liste) . " match(s) dans le calendrier du site\n";
        echo "(aujourd'hui : " . date('d/m/Y') . ")\n\n";
        $n = 0;
        foreach ($liste as $m) {
            $jour = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][(int) date('w', strtotime($m['date']))];
            $score = aff_joue($m) ? ' · score ' . $m['bp'] . '-' . $m['bc'] : ' · pas de score';
            if (isset($surAff[$m['id']])) { $etat = 'SUR L\'AFFICHE ' . mb_strtoupper($surAff[$m['id']]); $n++; }
            elseif (aff_joue($m) && $m['date'] > date('Y-m-d')) $etat = 'CACHÉ : score noté alors que le match est à venir';
            else $etat = 'CACHÉ : doublon, ou adversaire absent de la poule FFF de l\'équipe (match impossible)';
            echo "$jour " . date('d/m', strtotime($m['date'])) . ' ' . ($m['heure'] ?? '') . ' · ' . ($m['equipe'] ?? '') . ' (' . ($m['comp'] ?? '') . ') · '
               . (!empty($m['dom']) ? 'reçoit ' : 'va à ') . ($m['adv'] ?? '') . $score . "\n    → $etat\n";
            if (!empty($m['fff']) && is_array($m['fff'])) {
                $f = $m['fff'];
                echo "      FFF : match n°" . ($f['match'] ?? '?') . ' · ' . ($f['recoit'] ?? '?') . ' contre ' . ($f['visiteur'] ?? '?') . ' · ' . ($f['compet'] ?? '')
                   . ' · poule ' . ($f['poule'] ?? '?') . ' · journée ' . ($f['journee'] ?? '?') . ' · statut ' . json_encode($f['statut'] ?? null, JSON_UNESCAPED_UNICODE)
                   . ' · équipe ' . ($f['equipe_club'] ?? '?') . "\n";
            } else echo "      (pas de détail FFF enregistré pour ce match" . (str_starts_with((string) $m['id'], 'fff-') ? '' : ' : il n\'a pas été créé par la synchronisation FFF') . ")\n";
        }
        echo "\n$n match(s) sur les affiches.\n";
        // ce que la FFF envoie EN CE MOMENT pour ce week-end (lecture directe, sans rien enregistrer)
        if (defined('CLE_ECRITURE')) {
            @set_time_limit(200);
            $ch = curl_init('https://' . $_SERVER['HTTP_HOST'] . '/api/sync.php?test=1&cle=' . urlencode(CLE_ECRITURE));
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 180]);
            $rep = json_decode((string) curl_exec($ch), true) ?: [];
            curl_close($ch);
            $fff = array_values(array_filter($rep['matchs'] ?? [], fn($m) => in_array($m['date'] ?? '', $jours, true)));
            usort($fff, fn($a, $b) => strcmp(($a['date'] ?? '') . ($a['heure'] ?? ''), ($b['date'] ?? '') . ($b['heure'] ?? '')));
            echo "\nCe que la FFF envoie en ce moment pour ce week-end : " . count($fff) . " match(s)\n";
            echo "(sources : " . implode(' · ', array_filter($rep['journal'] ?? [], fn($l) => preg_match('/dofa|ics|corico|FFF/i', $l))) . ")\n";
            foreach ($fff as $m) {
                $f = is_array($m['fff'] ?? null) ? $m['fff'] : [];
                echo '  ' . date('d/m', strtotime($m['date'])) . ' ' . ($m['heure'] ?? '') . ' · ' . ($m['equipe'] ?? '') . ' (' . ($m['comp'] ?? '') . ') · '
                   . (!empty($m['dom']) ? 'reçoit ' : 'va à ') . ($m['adv'] ?? '') . ' · score ' . json_encode([$m['bp'] ?? null, $m['bc'] ?? null])
                   . ($f ? ' · statut ' . json_encode($f['statut'] ?? null, JSON_UNESCAPED_UNICODE) . ' · ' . ($f['equipe_club'] ?? '') : '') . "\n";
            }
        }
        $ign = json_decode((string) reglage('matchs_ignores', '{}'), true) ?: [];
        $ignWe = array_filter(array_keys($ign), fn($k) => in_array(explode('|', $k)[0], $jours, true));
        echo "\nMatchs de ce week-end supprimés du calendrier (liste d'exclusion) : " . ($ignWe ? '' : 'aucun') . "\n";
        foreach ($ignWe as $k) echo "  - " . str_replace('|', ' · ', $k) . ' (supprimé le ' . date('d/m à H:i', strtotime((string) $ign[$k])) . ")\n";
        exit;
    }
    if (isset($_GET['diag'])) {
        header('Content-Type: text/plain; charset=utf-8');
        $gd = function_exists('gd_info') ? gd_info() : [];
        echo "PHP " . PHP_VERSION . "\n";
        echo "GD : " . ($gd['GD Version'] ?? 'ABSENT') . "\n";
        echo "FreeType (textes) : " . (!empty($gd['FreeType Support']) ? 'oui' : 'NON') . "\n";
        echo "JPEG : " . (!empty($gd['JPEG Support']) ? 'oui' : 'NON') . " | PNG : " . (!empty($gd['PNG Support']) ? 'oui' : 'NON') . "\n\n";
        echo "Dossier attendu : " . __DIR__ . "/polices\n";
        foreach (AFF_FICHIERS_POLICES as $p => $f) echo "  $f : " . (is_file(__DIR__ . "/polices/$f") ? 'présent (' . filesize(__DIR__ . "/polices/$f") . ' octets)' : 'MANQUANT') . "\n";
        echo "\nPolice utilisée : " . (aff_police('800') ?: 'AUCUNE') . "\n";
        echo "Blason : " . (is_file(dirname(__DIR__) . '/img/blason.png') ? 'présent' : 'MANQUANT (img/blason.png)') . "\n";
        $fonds = glob(dirname(__DIR__) . '/img/fond-affiche*') ?: [];
        foreach ($fonds as $fo) {
            $ok = @imagecreatefromstring((string) @file_get_contents($fo));
            $dim = @getimagesize($fo);
            echo "Image de fond : " . basename($fo) . ' · ' . round(filesize($fo) / 1024) . ' Ko · ' . ($dim ? "{$dim[0]} x {$dim[1]} px · {$dim['mime']}" : 'format inconnu')
               . ' · ' . ($ok ? 'lisible par le serveur' : 'ILLISIBLE par le serveur') . "\n";
        }
        echo "Autres fichiers dans img : " . implode(', ', array_map('basename', array_filter(glob(dirname(__DIR__) . '/img/*') ?: [], 'is_file'))) . "\n";
        foreach (['domicile', 'exterieur'] as $n) echo "Image $n : " . (($p = aff_fond_lieu($n === 'domicile' ? 'dom' : 'ext')) && str_contains($p, "fond-$n") ? basename($p) . ' · présente' : "MANQUANTE (attendu : img/fond-$n.jpg)") . "\n";
        echo "Version du moteur : V34 du 04/10 · stories des compos\n";
        $vuC = (int) reglage('cron_compos_vu', '0');
        echo "Stories des compos : " . (function_exists('acp_convocation') ? 'affiches présentes' : 'AFFICHES ABSENTES (compo-affiches.php)')
           . " · cron des 5 minutes : " . ($vuC ? 'dernier passage le ' . date('d/m à H:i', $vuC) . (acp_cron_frequent(time()) ? ' (actif)' : ' (ARRÊTÉ ?)') : 'jamais vu') . "\n";
        echo "Affiches « stade de nuit » : " . (afn_actif('dom') || afn_actif('ext') ? 'ACTIVES' : 'inactives (anciens fonds : anciennes affiches)') . "\n";
        foreach (['dom' => 'domicile', 'ext' => 'extérieur'] as $l => $n)
            echo "  fond $n : " . (afn_fond($l) ? 'nouveau fond « stade de nuit » (' . basename(afn_fond($l)) . ')' : 'ancien fond ou absent') . "\n";
        foreach (AFN_POLICES as $p => $f) echo "  police $f : " . (basename(afn_police($p)) === $f ? 'présente' : 'absente (remplacée par une Barlow Condensed)') . "\n";
        echo "Partenaires : " . count(glob(dirname(__DIR__) . '/img/partenaires/*') ?: []) . " logo(s) dans img/partenaires\n";
        $dossierAff = dirname(__DIR__) . '/affiches';
        echo "Dossier affiches : " . (is_dir($dossierAff) ? (is_writable($dossierAff) ? 'présent, écriture possible' : 'présent mais ÉCRITURE IMPOSSIBLE') : 'absent (sera créé)') . "\n";
        exit;
    }
    if (isset($_GET['manuel'])) afn_manuel_route();                     // affiches de matchs saisis à la main (POST JSON)
    if (isset($_GET['plan'])) afn_plan_route();                         // matchs automatiques du week-end (onglet Affiches matchs)
    $matchs = aff_matchs(); $type = $_GET['apercu'] ?? 'programme';
    $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['date'] ?? '') ? $_GET['date'] : null;
    $opts = ['titre' => mb_substr((string) ($_GET['titre'] ?? ''), 0, 80), 'sponsors' => ($_GET['sponsors'] ?? '1') !== '0'];
    if ($type === 'veterans' || $type === 'veterans-resultats') {                    // affiches des vétérans
        $GLOBALS['aff_vet'] = true;
        $type = $type === 'veterans-resultats' ? 'resultats' : 'programme';
    }
    if ($type === 'plateaux' || $type === 'plateaux-resultats') {                    // affiches du foot animation
        $GLOBALS['aff_fal'] = true;
        $type = $type === 'plateaux-resultats' ? 'resultats' : 'programme';
    }
    aff_format(in_array($_GET['format'] ?? '', ['post', 'carre', 'fb'], true) ? $_GET['format'] : 'story');
    if ($type === 'match' || $type === 'score') {
        $id = $_GET['id'] ?? ''; $m = null;
        foreach ($matchs as $x) if ($x['id'] === $id) $m = $x;
        if (!$m) {
            usort($matchs, fn($a, $b) => strcmp($a['date'], $b['date']));
            if ($type === 'score') { foreach (array_reverse($matchs) as $x) if (aff_joue($x)) { $m = $x; break; } }
            else foreach ($matchs as $x) if (!aff_joue($x) && $x['date'] >= date('Y-m-d')) { $m = $x; break; }
        }
        if (!$m) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Aucun match trouvé.'; exit; }
        $im = aff_match($m, $opts + ['score' => $type === 'score']);
        $nom = ($type === 'score' ? 'resultat-' : 'match-') . cle_club($m['equipe'] . '-' . $m['adv']);
    } elseif ($type === 'evenement') {
        $im = aff_evenement($opts + ['sous' => mb_substr((string) ($_GET['sous'] ?? ''), 0, 80), 'texte' => mb_substr((string) ($_GET['texte'] ?? ''), 0, 600),
            'date' => $date ?? '', 'heure' => preg_match('/^\d{1,2}:\d{2}$/', $_GET['heure'] ?? '') ? $_GET['heure'] : '', 'lieu' => mb_substr((string) ($_GET['lieu'] ?? ''), 0, 90)]);
        $nom = 'evenement-' . cle_club($opts['titre'] ?: 'club');
    } else {
        $lundi = strtotime('monday this week');
        if ($date) { $t = strtotime($date . ' 12:00'); $w = (int) date('w', $t); $t += (($w === 0 ? -1 : 6 - $w) * 86400); $sam = date('Y-m-d', $t); }
        else $sam = date('Y-m-d', $type === 'resultats' ? strtotime('-2 days', $lundi) : strtotime('+5 days', $lundi));
        if ($type === 'resultats' && !isset($_GET['exact']) && !aff_plan_weekend($matchs, $sam, true)) {   // exact=1 : le week-end demandé, même vide
            $joues = array_filter($matchs, fn($x) => aff_joue($x) && $x['date'] <= date('Y-m-d'));
            usort($joues, fn($x, $y) => strcmp($y['date'], $x['date']));
            if ($joues) { $t = strtotime($joues[0]['date'] . ' 12:00'); $w = (int) date('w', $t); $sam = date('Y-m-d', $t + (($w === 0 ? -1 : 6 - $w) * 86400)); }
        }
        if (isset($_GET['message'])) {       // /api/affiches.php?apercu=resultats&message=1 : le texte de la publication
            header('Content-Type: text/plain; charset=utf-8');
            $lieuM = in_array($_GET['lieu'] ?? '', ['dom', 'ext'], true) ? $_GET['lieu'] : null;
            if ($lieuM) { $genreM = !empty($GLOBALS['aff_fal']) ? 'fal' : (!empty($GLOBALS['aff_vet']) ? 'vet' : ''); aff_genre(''); echo aff_message_lieu($genreM, $matchs, $sam, $type === 'resultats', $lieuM); }
            elseif (!empty($GLOBALS['aff_fal'])) { $GLOBALS['aff_fal'] = false; echo aff_message_plateaux($matchs, $sam, $type === 'resultats'); }
            else echo $type === 'resultats' ? aff_message_resultats($matchs, $sam) : aff_message_rencontres($matchs, $sam);
            exit;
        }
        $lieuAp = in_array($_GET['lieu'] ?? '', ['dom', 'ext'], true) ? $_GET['lieu'] : null;
        $pagesAp = $lieuAp ? aff_decoupage($matchs, $sam, $type === 'resultats', $lieuAp) : [];
        if (isset($_GET['pages'])) {                                        // ?pages=1 : les affiches de cette annonce pour ce lieu (onglet Affiches)
            header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
            echo json_encode(['pages' => array_map(fn($p) => $p['suffixe'], $pagesAp ?: [['suffixe' => '']])], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $pgAp = $pagesAp[max(0, min(count($pagesAp) - 1, (int) ($_GET['page'] ?? 1) - 1))] ?? null;   // ?page=2… : les autres pages de l'annonce
        $im = aff_liste($matchs, $sam, $type === 'resultats', $opts + ['lieu' => $_GET['lieu'] ?? null, 'partie' => in_array($_GET['partie'] ?? '', ['1', '2'], true) ? (int) $_GET['partie'] : null]
            + ($pgAp && count($pagesAp) > 1 ? ['indices' => $pgAp['i'], 'suffixe' => $pgAp['suffixe']] : []));
        $nom = ($type === 'resultats' ? 'resultats-' : 'rencontres-') . $sam;
    }
    if (!aff_polices_ok()) {   // on l'écrit sur l'image avec la police de secours de GD
        $rouge = imagecolorallocate($im, 220, 38, 38); $blanc = imagecolorallocate($im, 255, 255, 255);
        imagefilledrectangle($im, 0, 380, AFF_W, 520, $rouge);
        imagestring($im, 5, 40, 410, 'POLICES INTROUVABLES : les textes ne peuvent pas etre ecrits.', $blanc);
        imagestring($im, 5, 40, 440, 'Depose le dossier polices (4 fichiers .ttf) dans le dossier api du site.', $blanc);
        imagestring($im, 5, 40, 470, 'Diagnostic : /api/affiches.php?diag=1', $blanc);
    }
    header('Content-Type: image/jpeg'); header('Cache-Control: no-store');
    if (!empty($_GET['telecharger'])) header('Content-Disposition: attachment; filename="asf-pierrelatte-' . $nom . '.jpg"');
    imagejpeg($im, null, 92);
}
