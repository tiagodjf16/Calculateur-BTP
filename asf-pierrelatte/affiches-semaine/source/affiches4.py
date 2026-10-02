# Affiches de la semaine ASF Pierrelatte, version 4.
# Mêmes usages que les affiches actuelles du club (résultats / rencontres / foot animation / vétérans, domicile et extérieur,
# formats Facebook 1080x2160, Instagram 1080x1350, Story 1080x1920), avec le fond du stade Gustave Jaume de nuit et le ballon du club.
# Les lignes de matchs sont compactes et la liste s'ajuste au nombre de matchs.
import json, re, html, os, sys

D = '/tmp/claude-0/-home-user-Calculateur-BTP/291990b4-76f7-5681-9dee-a94b37165096/scratchpad'
V4 = f'{D}/affiches/v4'
data = json.load(open(f'{D}/affiches/donnees.json'))
LOGO, SP = data['logo'], data['sp']
esc = html.escape

ICONE = {
  'maison': '<svg viewBox="0 0 24 24"><path d="M3 11.2 12 4l9 7.2V21h-6.2v-6.1H9.2V21H3z"/></svg>',
  'avion': '<svg viewBox="0 0 24 24"><path d="M21.5 15.8v-1.9l-8.1-5.1V3.6a1.4 1.4 0 0 0-2.8 0v5.2l-8.1 5.1v1.9l8.1-2.5v5.4l-2.2 1.6V22l3.6-1 3.6 1v-1.7l-2.2-1.6v-5.4z"/></svg>',
  'lieu': '<svg viewBox="0 0 24 24"><path d="M12 22s-7-6.4-7-12a7 7 0 0 1 14 0c0 5.6-7 12-7 12zm0-9.3a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4z"/></svg>',
}

# géométrie par format : zones verticales (px)
FORMATS = {
  'fb':    dict(W=1080, H=2160, barre=58, tete=96, bl=120, an=118, titre=300, t1=150, t2=84, date=630, zone=(792, 1812), sig=(1822, 1940), part=1950, logo=58),
  'story': dict(W=1080, H=1920, barre=58, tete=96, bl=112, an=110, titre=290, t1=140, t2=78, date=596, zone=(740, 1590), sig=(1598, 1706), part=1714, logo=54),
  'insta': dict(W=1080, H=1350, barre=46, tete=66, bl=84, an=84, titre=176, t1=104, t2=58, date=402, zone=(462, 1102), sig=(1106, 1150), part=1160, logo=40),
}

def blason(nom, cle=None, club=False, d=54):
    if club:
        return f'<span class="bl" style="--d:{d}px"><img src="{LOGO}" alt=""></span>'
    src = data['adv'].get(cle) if cle else None
    if src:
        return f'<span class="bl" style="--d:{d}px"><img src="{src}" alt="" style="transform:scale(1.42)"></span>'
    mots = [w for w in re.findall(r"[A-Za-zÀ-ÿ]+", nom) if w.lower() not in ('fc', 'us', 'u', 's', 'as', 'es', 'o', 'et', 'de', 'du', 'd', 'la', 'le', 'f', 'co', 'sc', 'r', 'st')]
    ini = (''.join(w[0] for w in mots)[:2] or nom[:2]).upper()
    h = sum(map(ord, nom)) % 360
    return f'<span class="bl ini" style="--d:{d}px;--h:{h}"><b>{esc(ini)}</b></span>'

CSS = '''
*{box-sizing:border-box;margin:0;padding:0}
:root{--or:#E3B64C;--or-clair:#F7DC92;--or-metal:linear-gradient(180deg,#FFF3C4 0%,#F2CD6C 40%,#C99A2E 66%,#F0CF7A 100%);
  --ar-metal:linear-gradient(180deg,#FFFFFF 0%,#DCE8FB 38%,#9DB9E6 66%,#E8F0FC 100%);--club:#1C4FC4;--nuit:#040A1E;--ciel:#C9D4F2}
.dom{--acc:#E3B64C;--acc-clair:#F7DC92;--metal:var(--or-metal)}
.ext{--acc:#A9C4EE;--acc-clair:#E1EBFB;--metal:var(--ar-metal)}
html,body{background:#000;font-family:"Source Sans 3",sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
.affiche{position:relative;overflow:hidden;width:var(--W);height:var(--H);background:#030817}
.fond{position:absolute;inset:0;background-size:var(--W) var(--H);background-repeat:no-repeat}
.voile{position:absolute;inset:0}
.a{position:absolute;z-index:2}
.cond{font-family:"Barlow Condensed",sans-serif}
.metal{background:var(--metal);-webkit-background-clip:text;background-clip:text;color:transparent}
/* barre du haut */
.barre{left:0;right:0;top:0;height:var(--barre);display:flex;align-items:center;justify-content:space-between;padding:0 34px;background:#050B1F;
  box-shadow:inset 0 -3px 0 var(--acc);font:800 calc(var(--barre)*.36) "Barlow Condensed",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#fff}
.barre span{color:var(--acc-clair);font-size:.82em;letter-spacing:.18em}
/* en-tête façon page d'accueil du site : blason + 1923 */
.tete{left:46px;top:var(--tete);display:flex;align-items:center;gap:18px}
.tete img{width:var(--bl);height:var(--bl);object-fit:contain;filter:drop-shadow(0 8px 20px rgba(0,0,0,.6))}
.an{font:900 italic var(--an)/.8 "Barlow Condensed",sans-serif;color:transparent;-webkit-text-stroke:2px rgba(247,220,146,.85);letter-spacing:-.01em}
.ext .an{-webkit-text-stroke-color:rgba(225,235,251,.85)}
.puce{right:46px;top:calc(var(--tete) + var(--bl)*.5 - 26px);display:flex;align-items:center;gap:10px;height:52px;padding:0 22px 0 16px;border-radius:999px;background:var(--metal);
  color:#0B1633;font:900 26px "Barlow Condensed",sans-serif;letter-spacing:.07em;text-transform:uppercase;box-shadow:0 10px 26px rgba(0,0,0,.45)}
.puce svg{width:28px;height:28px;fill:#0B1633}
/* grand titre */
.titre{left:46px;top:var(--titre);max-width:640px}
.sur{display:flex;align-items:center;gap:14px;font:800 calc(var(--t2)*.26) "Source Sans 3",sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--acc-clair);margin-bottom:12px;white-space:nowrap}
.sur i{width:40px;height:3px;background:var(--metal);flex:none}
.t1{display:block;font:900 italic var(--t1)/.86 "Barlow Condensed",sans-serif;text-transform:uppercase;white-space:nowrap;text-shadow:0 6px 30px rgba(0,0,0,.55);max-width:640px}
.t2{display:block;font:900 italic var(--t2)/.95 "Barlow Condensed",sans-serif;text-transform:uppercase;white-space:nowrap;margin-top:4px;filter:drop-shadow(0 4px 18px rgba(0,0,0,.5));max-width:640px}
.date{left:46px;top:var(--date);font:700 calc(var(--t2)*.36) "Source Sans 3",sans-serif;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.9)}
/* la liste */
.zone{left:30px;right:30px;display:flex;flex-direction:column;justify-content:center}
.lignes{display:flex;flex-direction:column;gap:12px;transform-origin:top center}
.ligne{position:relative;display:grid;align-items:stretch;min-height:92px;border-radius:14px;overflow:hidden;
  background:linear-gradient(90deg,rgba(9,20,54,.95),rgba(5,12,34,.93));box-shadow:0 12px 30px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.08)}
.cat{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:8px 10px;position:relative;
  background:repeating-linear-gradient(-55deg,rgba(255,255,255,.07) 0 6px,transparent 6px 16px),linear-gradient(160deg,#2457CF,#132F7E);box-shadow:inset -3px 0 0 var(--acc)}
.cat b{display:block;max-width:100%;font:900 34px/1 "Barlow Condensed",sans-serif;text-transform:uppercase;white-space:nowrap;overflow:hidden}
.cat small{display:block;max-width:100%;margin-top:4px;font:800 14px/1.1 "Source Sans 3",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--acc-clair);white-space:nowrap;overflow:hidden}
.eq{display:flex;align-items:center;gap:14px;min-width:0;padding:0 14px}
.eq.g{justify-content:flex-end}
.nom{font:800 30px/1 "Barlow Condensed",sans-serif;text-transform:uppercase;white-space:nowrap;overflow:hidden;min-width:0}
.nom.deux{white-space:normal;line-height:.95;overflow-wrap:anywhere}
.eq.g .nom{text-align:right}
.nom.eux{color:#D3DDF4;font-weight:700}
.bl{display:grid;place-items:center;flex:none;width:var(--d);height:var(--d);border-radius:50%;background:#fff;overflow:hidden;box-shadow:0 0 0 2px rgba(255,255,255,.25),0 6px 14px rgba(0,0,0,.45)}
.bl img{width:86%;height:86%;object-fit:contain}
.bl.ini{background:radial-gradient(circle at 35% 30%,#4A5784,#1B2340 70%);box-shadow:0 0 0 2px rgba(255,255,255,.35),0 6px 14px rgba(0,0,0,.45)}
.bl.ini b{font:900 calc(var(--d)*.42) "Barlow Condensed",sans-serif;color:#fff}
.score{display:flex;align-items:center;justify-content:center;gap:5px;padding:0 4px}
.score b{display:grid;place-items:center;width:56px;height:62px;border-radius:9px;font:900 44px "Barlow Condensed",sans-serif;color:#fff}
.V .score b,.score.V b{background:linear-gradient(180deg,#2BB566,#16773F)}.D .score b,.score.D b{background:linear-gradient(180deg,#D9534B,#9C2A24)}.N .score b,.score.N b{background:linear-gradient(180deg,#6F7C9C,#465170)}
.score b.nous{box-shadow:inset 0 0 0 3px var(--acc-clair)}
.heure{display:flex;flex-direction:column;align-items:center;justify-content:center;margin:12px 4px;border-radius:10px;background:var(--metal);color:#0B1633}
.heure small{font:800 14px/1 "Barlow Condensed",sans-serif;letter-spacing:.14em;text-transform:uppercase}
.heure b{font:900 italic 40px/1 "Barlow Condensed",sans-serif}
.lieu{display:flex;align-items:center;gap:7px;font:700 17px "Source Sans 3",sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--acc-clair);white-space:nowrap;overflow:hidden}
.lieu svg{width:17px;height:17px;fill:var(--acc);flex:none}
.contre{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;margin-top:8px}
.contre em{font:italic 700 18px "Source Sans 3",sans-serif;color:var(--ciel)}
.adv{display:inline-flex;align-items:center;gap:8px;font:800 24px/1 "Barlow Condensed",sans-serif;text-transform:uppercase;color:#E6ECFA;white-space:nowrap}
.sous{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;margin-top:8px}
.sous .score b{width:42px;height:44px;font-size:32px;border-radius:7px}
.sous .nom{font-size:24px}
.duo{border-radius:22px;overflow:hidden;background:linear-gradient(180deg,rgba(9,20,54,.94),rgba(5,12,34,.94));box-shadow:0 24px 60px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.1)}
.duo-tete{display:flex;justify-content:center;align-items:center;gap:14px;padding:16px;font:900 26px "Barlow Condensed",sans-serif;letter-spacing:.14em;text-transform:uppercase;
  background:repeating-linear-gradient(-55deg,rgba(255,255,255,.07) 0 6px,transparent 6px 16px),linear-gradient(160deg,#2457CF,#132F7E);box-shadow:inset 0 -3px 0 var(--acc)}
.duo-tete span{color:var(--acc-clair)}
.duo-corps{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;padding:34px 26px 26px}
.duo-eq{display:flex;flex-direction:column;align-items:center;gap:18px;min-width:0;text-align:center}
.duo-eq .nom{font-size:44px;max-width:100%}
.duo .score b{width:104px;height:120px;font-size:96px;border-radius:14px}
.duo .heure{margin:0;padding:12px 22px}.duo .heure small{font-size:22px}.duo .heure b{font-size:78px}
.duo-pied{display:flex;justify-content:center;align-items:center;gap:22px;padding:16px 20px 22px;border-top:1px solid rgba(255,255,255,.1);font:800 30px "Barlow Condensed",sans-serif;text-transform:uppercase}
.duo-pied .lieu{font-size:20px}
.vide{text-align:center;padding:46px 30px;border-radius:18px;background:linear-gradient(180deg,rgba(9,20,54,.92),rgba(5,12,34,.92));box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.vide b{display:block;font:900 italic 54px/1 "Barlow Condensed",sans-serif;text-transform:uppercase}
.vide span{display:block;margin-top:12px;font:700 22px "Source Sans 3",sans-serif;color:var(--ciel)}
/* signature du club */
.sig{left:0;right:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.sig .valeurs{font:800 calc(var(--sigh)*.15) "Source Sans 3",sans-serif;letter-spacing:.32em;text-transform:uppercase;color:var(--acc-clair)}
.sig .script{font:400 calc(var(--sigh)*.42)/1.05 "Kaushan Script",cursive;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.7)}
.insta .sig{flex-direction:row;gap:26px}.insta .sig .valeurs{font-size:13px}.insta .sig .script{font-size:30px}
/* partenaires */
.part{left:0;right:0;bottom:0;top:var(--part);z-index:3;background:#fff;box-shadow:0 -5px 0 var(--acc);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:10px 20px}
.part h4{display:flex;align-items:center;gap:12px;font:900 18px "Barlow Condensed",sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#0B1633}
.part h4 i{width:46px;height:2px;background:#0B1633;opacity:.35}
.logos{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:10px 22px}
.logos img{height:var(--logo);max-width:calc(var(--logo)*2.4);object-fit:contain;display:block}
.insta .part h4{font-size:14px}
'''

AJUSTE = '''<script>
document.fonts.ready.then(() => {
  // 1. la liste prend la place disponible (sans grossir au point d'écraser les noms)
  const z = document.querySelector(".zone"), l = document.querySelector(".lignes");
  if (z && l){
    let k = Math.min(+l.dataset.max || 1.12, 1.6);
    const h = () => l.getBoundingClientRect().height;
    l.style.zoom = k;
    while (h() > z.clientHeight && k > .5){ k -= .01; l.style.zoom = k; }
    if (h() > z.clientHeight) document.body.dataset.trop = 1;
    // reste de la place : on aère entre les lignes
    const n = l.children.length, reste = z.clientHeight - h();
    if (n > 1 && reste > 0) l.style.gap = Math.min(30, 12 + reste / k / (n - 1)) + "px";
  }
  // 2. les noms trop longs se resserrent, puis passent sur deux lignes : jamais coupés
  document.querySelectorAll("[data-fit]").forEach(e => {
    const s0 = parseFloat(getComputedStyle(e).fontSize);
    let s = s0, min = s0 * (+e.dataset.fit || .6);
    while (e.scrollWidth > e.clientWidth + 1 && s > min){ s -= 1; e.style.fontSize = s + "px"; }
    if (e.scrollWidth > e.clientWidth + 1 && e.classList.contains("nom")){ e.classList.add("deux"); e.style.fontSize = Math.round(s0 * .78) + "px"; }
  });
  document.body.dataset.pret = 1;
});
</script>'''

def page(nom, fmt, lieu, sur, t1, t2, date, contenu, zoom_max=None):
    F = FORMATS[fmt]
    img = f'../scene-{fmt}-{lieu}.png'
    z0, z1 = F['zone']
    s0, s1 = F['sig']
    parts = SP[:15] if lieu == 'dom' else SP[15:30]
    logos = ''.join(f'<img src="{data["emb"][i]}" alt="">' for i in parts if i in data['emb'])
    puce = (ICONE['maison'] + 'À domicile') if lieu == 'dom' else (ICONE['avion'] + "À l'extérieur")
    voile = (f'linear-gradient(180deg,rgba(3,8,23,.9) 0,rgba(3,8,23,.35) {F["tete"] + F["bl"] + 20}px,rgba(3,8,23,.1) {F["titre"] + 60}px,'
             f'transparent {z0 - 160}px,rgba(3,8,23,.72) {z0 - 10}px,rgba(3,8,23,.86) {z0 + 160}px,rgba(3,8,23,.9) 100%),'
             f'linear-gradient(90deg,rgba(3,8,23,.78) 0,rgba(3,8,23,.4) 44%,transparent 64%)')
    doc = f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{nom}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;0,800;0,900;1,600;1,700;1,800;1,900&family=Source+Sans+3:wght@400;600;700;800&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Kaushan+Script&display=swap" rel="stylesheet">
<style>{CSS}
:root{{--W:{F['W']}px;--H:{F['H']}px;--barre:{F['barre']}px;--tete:{F['tete']}px;--bl:{F['bl']}px;--an:{F['an']}px;--titre:{F['titre']}px;--t1:{F['t1']}px;--t2:{F['t2']}px;
  --date:{F['date']}px;--part:{F['part']}px;--logo:{F['logo']}px;--sigh:{s1 - s0}px}}
</style></head><body>
<div class="affiche {lieu} {fmt}">
  <div class="fond" style="background-image:url({img})"></div>
  <div class="voile" style="background:{voile}"></div>
  <div class="a barre"><span>Saison 2026-2027</span>asf-pierrelatte.fr<span>@asfp.officiel</span></div>
  <div class="a tete"><img src="{LOGO}" alt=""><div class="an">1923</div></div>
  <div class="a puce">{puce}</div>
  <div class="a titre"><div class="sur"><i></i>{sur}</div><span class="t1" data-fit=".55">{t1}</span><span class="t2 metal" data-fit=".55">{t2}</span></div>
  <div class="a date">{date}</div>
  <div class="a zone" style="top:{z0}px;height:{z1 - z0}px"><div class="lignes" data-max="{zoom_max or {1: 1.4, 2: 1.4, 3: 1.28, 4: 1.18}.get(contenu.count('class="ligne'), 1.12)}">{contenu}</div></div>
  <div class="a sig" style="top:{s0}px;height:{s1 - s0}px"><div class="valeurs">Plaisir · Respect · Effort · Progrès</div><div class="script">Atom'Sports Football Pierrelatte</div></div>
  <div class="a part"><h4><i></i>Nos partenaires<i></i></h4><div class="logos">{logos}</div></div>
</div>
{AJUSTE}
</body></html>'''
    open(f'{V4}/pages/{nom}.html', 'w', encoding='utf-8').write(doc)
    return nom

# ---------- lignes ----------
def cat(c, sous):
    return f'<div class="cat"><b data-fit=".6">{esc(c)}</b><small data-fit=".7">{esc(sous)}</small></div>'

def r_resultat(lieu, m):
    c, niv, adv, cle, bp, bc = m
    iss = 'V' if bp > bc else 'D' if bp < bc else 'N'
    nous = f'<span class="nom nous" data-fit=".7">Pierrelatte</span>{blason("", club=True)}'
    eux_g = f'<span class="nom eux" data-fit=".72">{esc(adv)}</span>{blason(adv, cle)}'
    eux_d = f'{blason(adv, cle)}<span class="nom eux" data-fit=".72">{esc(adv)}</span>'
    nous_d = f'{blason("", club=True)}<span class="nom nous" data-fit=".7">Pierrelatte</span>'
    if lieu == 'dom':
        g, d, sc = nous, eux_d, f'<b class="nous">{bp}</b><b>{bc}</b>'
    else:
        g, d, sc = eux_g, nous_d, f'<b>{bc}</b><b class="nous">{bp}</b>'
    return f'''<div class="ligne {iss}" style="grid-template-columns:150px minmax(0,1fr) 128px minmax(0,1fr)">{cat(c, niv)}
      <div class="eq g">{g}</div><div class="score">{sc}</div><div class="eq">{d}</div></div>'''

def r_rencontre(lieu, m):
    c, niv, adv, cle, jour, h = m
    nous_g = f'<span class="nom nous" data-fit=".7">Pierrelatte</span>{blason("", club=True)}'
    nous_d = f'{blason("", club=True)}<span class="nom nous" data-fit=".7">Pierrelatte</span>'
    eux_g = f'<span class="nom eux" data-fit=".72">{esc(adv)}</span>{blason(adv, cle)}'
    eux_d = f'{blason(adv, cle)}<span class="nom eux" data-fit=".72">{esc(adv)}</span>'
    g, d = (nous_g, eux_d) if lieu == 'dom' else (eux_g, nous_d)
    return f'''<div class="ligne" style="grid-template-columns:150px minmax(0,1fr) 128px minmax(0,1fr)">{cat(c, niv)}
      <div class="eq g">{g}</div><div class="heure"><small>{jour}</small><b>{h}</b></div><div class="eq">{d}</div></div>'''

def r_plateau(lieu, p):
    c, niv, ou, advs, jour, h = p
    advh = ''.join(f'<span class="adv">{blason(a, k, d=34)}{esc(a)}</span>' for a, k in advs)
    return f'''<div class="ligne" style="grid-template-columns:150px minmax(0,1fr) 128px">{cat(c, niv)}
      <div style="padding:12px 18px;min-width:0"><div class="lieu">{ICONE['lieu']}<span data-fit=".7">{esc(ou)}</span></div>
        <div class="contre"><em>contre</em>{advh}</div></div>
      <div class="heure" style="margin-right:12px"><small>{jour}</small><b>{h}</b></div></div>'''

def r_plateau_res(lieu, p):
    c, niv, ou, matchs = p
    lignes = ''
    for adv, cle, bp, bc in matchs:
        iss = 'V' if bp > bc else 'D' if bp < bc else 'N'
        lignes += f'''<div class="sous {iss}"><div class="eq g" style="padding:0"><span class="nom nous">Pierrelatte</span>{blason("", club=True, d=40)}</div>
          <div class="score"><b class="nous">{bp}</b><b>{bc}</b></div><div class="eq" style="padding:0">{blason(adv, cle, d=40)}<span class="nom eux" data-fit=".72">{esc(adv)}</span></div></div>'''
    return f'''<div class="ligne" style="grid-template-columns:150px minmax(0,1fr)">{cat(c, niv)}
      <div style="padding:12px 18px 14px;min-width:0"><div class="lieu">{ICONE['lieu']}<span data-fit=".7">{esc(ou)}</span></div>{lignes}</div></div>'''

def duo(lieu, c, niv, adv, cle, quand, ou, bp=None, bc=None, jour=None, h=None):
    nous = f'<div class="duo-eq">{blason("", club=True, d=190)}<span class="nom nous" data-fit=".6">Pierrelatte</span></div>'
    eux = f'<div class="duo-eq">{blason(adv, cle, d=190)}<span class="nom eux" data-fit=".6">{esc(adv)}</span></div>'
    g, d = (nous, eux) if lieu == 'dom' else (eux, nous)
    if bp is not None:
        iss = 'V' if bp > bc else 'D' if bp < bc else 'N'
        sg, sd = (bp, bc) if lieu == 'dom' else (bc, bp)
        cg, cd = ('nous', '') if lieu == 'dom' else ('', 'nous')
        milieu = f'<div class="score {iss}" style="display:flex"><b class="{cg}">{sg}</b><b class="{cd}">{sd}</b></div>'
        cls = iss
    else:
        milieu = f'<div class="heure"><small>{jour}</small><b>{h}</b></div>'
        cls = ''
    return f'''<div class="duo {cls}"><div class="duo-tete">{esc(c)} <span>· {esc(niv)}</span></div>
      <div class="duo-corps">{g}{milieu}{d}</div>
      <div class="duo-pied">{quand}<span class="lieu">{ICONE['lieu']}{esc(ou)}</span></div></div>'''

def vide(texte, sous):
    return f'<div class="vide"><b>{texte}</b><span>{sous}</span></div>'

# =====================  DONNÉES D'EXEMPLE (reprises des affiches actuelles du club)  =====================
WE_PASSE, WE = 'Samedi 26 et dimanche 27 septembre', 'Samedi 3 et dimanche 4 octobre'
RES_DOM = [('U11', 'Brassage', 'St Montan OL', None, 3, 0), ('U11', 'District 2', 'AS Sud Ardèche F. 3', None, 4, 1),
           ('Féminines', 'Régional 2', 'Echirolles FC', None, 2, 3), ('U15', 'Brassage', 'Châteauneuf R. 2', None, 8, 0),
           ('Seniors 1', 'Coupe de France', 'US Moursoise', None, 3, 0)]
RES_EXT = [('U11', 'Brassage', "US Val d'Ay", None, 11, 1), ('U13', 'Brassage', 'US Vallée Jarron', None, 4, 1),
           ('U15', 'Brassage', 'Crest Aouste', None, 2, 3), ('U13', 'Brassage', 'Athletic Foot Ceven', None, 0, 8),
           ('U18', 'District 1', 'FC Péageois', 'fc-peageois', 2, 1)]
REN_DOM = [('U11', 'Brassage', 'Châteauneuf R.', None, 'Samedi', '10h00'), ('U13', 'Brassage', 'Montélimar', 'montelimar', 'Samedi', '14h00'),
           ('U18', 'District 1', 'FC Eyrieux Embroye', 'fc-eyrieux-embroye', 'Samedi', '15h00'), ('U16', 'Régional 2', 'ES Trinité Lyon', None, 'Dimanche', '13h00')]
REN_EXT = [('U11', 'Brassage', 'Châteauneuf R.', None, 'Samedi', '14h00'), ('U13', 'Brassage', 'US St Just St Marcel', None, 'Samedi', '15h00'),
           ('U15', 'District 2', 'FC 540', None, 'Dimanche', '10h00'), ('Seniors 1', 'D1 Unique', 'O. Salaise Rhodia 2', 'o-salaise-rhodia-2', 'Dimanche', '15h00'),
           ('Seniors 2', 'District 3', 'ES Malissardoise', None, 'Dimanche', '15h00')]
PL_DOM = [('U13', 'Équipe 3', 'À domicile · Stade Gustave Jaume, Pierrelatte', [("Vallon Pont d'Arc", None)], 'Samedi', '13h30'),
          ('U13', 'Équipe 4', 'À domicile · Stade Gustave Jaume, Pierrelatte', [('Athletic Foot Ceven', None)], 'Samedi', '13h30'),
          ('U6 · U7', 'Plateau', 'À domicile · Stade Gustave Jaume, Pierrelatte', [('Donzère', 'co-donzerois'), ('Montélimar', 'montelimar'), ('Malataverne', None)], 'Samedi', '10h00')]
PL_EXT = [('U10 · U11', 'Espoir', 'Plateau à Donzère · C.O. Donzérois', [('CO Donzérois', 'co-donzerois'), ('Châteauneuf du Rhône', None)], 'Samedi', '10h00'),
          ('U8 · U9', 'Plateau', 'Plateau à Montélimar · Stade Tropenas', [('Montélimar', 'montelimar'), ('Malataverne', None), ('Bollène', None)], 'Samedi', '14h00')]
PLR_DOM = [('U13', 'Équipe 3', 'À domicile · Stade Gustave Jaume', [("Vallon Pont d'Arc", None, 4, 2)]),
           ('U13', 'Équipe 4', 'À domicile · Stade Gustave Jaume', [('Athletic Foot Ceven', None, 1, 1)])]
PLR_EXT = [('U10 · U11', 'Espoir', 'Plateau à Donzère · C.O. Donzérois', [('Châteauneuf du Rhône', None, 6, 0), ('CO Donzérois', 'co-donzerois', 3, 3)]),
           ('U13', 'Équipe 2', 'Brassage à Chabeuil', [('Chabeuil FC', 'chabeuil-fc', 0, 2), ('FC Péageois', 'fc-peageois', 2, 2)])]
GROS_WE = REN_DOM + [('U15', 'District 2', 'AS Véore Montoison', 'as-veore-montoison', 'Samedi', '15h30'), ('Féminines', 'Régional 2', 'GUC Football Féminin', None, 'Samedi', '20h00'),
                     ('Seniors 2', 'District 3', 'CO Donzérois', 'co-donzerois', 'Dimanche', '10h00'), ('Seniors 1', 'D1 Unique', 'Chavanay 2', 'chavanay-2', 'Dimanche', '15h00'),
                     ('U18', 'District 1', 'Chabeuil FC', 'chabeuil-fc', 'Dimanche', '15h30')]

def toutes(fmt='fb'):
    n = []
    for lieu, res, ren, pl, plr in (('dom', RES_DOM, REN_DOM, PL_DOM, PLR_DOM), ('ext', RES_EXT, REN_EXT, PL_EXT, PLR_EXT)):
        n.append(page(f'{fmt}-resultats-{lieu}', fmt, lieu, 'Atom\'Sports Football Pierrelatte', 'Résultats', 'du week-end', WE_PASSE, ''.join(r_resultat(lieu, m) for m in res)))
        n.append(page(f'{fmt}-rencontres-{lieu}', fmt, lieu, 'Atom\'Sports Football Pierrelatte', 'Rencontres', 'du week-end', WE, ''.join(r_rencontre(lieu, m) for m in ren)))
        n.append(page(f'{fmt}-foot-animation-rencontres-{lieu}', fmt, lieu, 'École de foot', 'Foot animation', 'Rencontres du week-end', WE, ''.join(r_plateau(lieu, p) for p in pl)))
        n.append(page(f'{fmt}-foot-animation-resultats-{lieu}', fmt, lieu, 'École de foot', 'Foot animation', 'Résultats du week-end', WE_PASSE, ''.join(r_plateau_res(lieu, p) for p in plr)))
    V = ('Vétérans', 'Championnat')
    n.append(page(f'{fmt}-veterans-rencontres-dom', fmt, 'dom', 'Championnat vétérans', 'Vétérans', 'Rencontres du week-end', 'Vendredi 9 octobre',
                  duo('dom', *V, 'CO Donzérois', 'co-donzerois', 'Vendredi 9 octobre', 'Stade Gustave Jaume, Pierrelatte', jour='Vendredi', h='20h30'), 1.15))
    n.append(page(f'{fmt}-veterans-rencontres-ext', fmt, 'ext', 'Championnat vétérans', 'Vétérans', 'Rencontres du week-end', 'Vendredi 16 octobre',
                  duo('ext', *V, 'Montélimar', 'montelimar', 'Vendredi 16 octobre', 'Stade Tropenas, Montélimar', jour='Vendredi', h='20h30'), 1.15))
    n.append(page(f'{fmt}-veterans-resultats-dom', fmt, 'dom', 'Championnat vétérans', 'Vétérans', 'Résultats du week-end', 'Vendredi 2 octobre',
                  duo('dom', *V, 'CO Donzérois', 'co-donzerois', 'Vendredi 2 octobre', 'Stade Gustave Jaume, Pierrelatte', 4, 2), 1.15))
    n.append(page(f'{fmt}-veterans-resultats-ext', fmt, 'ext', 'Championnat vétérans', 'Vétérans', 'Résultats du week-end', 'Vendredi 25 septembre',
                  duo('ext', *V, 'AS Véore Montoison', 'as-veore-montoison', 'Vendredi 25 septembre', 'Stade de Montoison', 1, 1), 1.15))
    return n

os.makedirs(f'{V4}/pages', exist_ok=True)
faites = toutes('fb')
faites.append(page('fb-rencontres-dom-gros-week-end', 'fb', 'dom', "Atom'Sports Football Pierrelatte", 'Rencontres', 'du week-end', WE, ''.join(r_rencontre('dom', m) for m in GROS_WE)))
faites.append(page('fb-aucun-match', 'fb', 'ext', 'Championnat vétérans', 'Vétérans', 'Rencontres du week-end', WE,
                   vide('Aucun match programmé ce week-end', 'Rendez-vous le week-end prochain !'), 1.1))
for fmt in ('insta', 'story'):
    faites += toutes(fmt)
open(f'{V4}/liste.txt', 'w').write('\n'.join(faites))
print(len(faites), 'affiches')
