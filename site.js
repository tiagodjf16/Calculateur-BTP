// Calculateur BTP — script commun à toutes les pages

(function(){
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // En-tête : bordure quand on fait défiler
  const header = document.querySelector(".site-header");
  if(header){
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive:true });
  }

  // Chiffres animés : anime le texte d'un élément jusqu'à une valeur
  window.animateNumber = function(el, to, decimals = 0){
    const fmt = n => n.toLocaleString("fr-FR", { minimumFractionDigits:decimals, maximumFractionDigits:decimals });
    const from = parseFloat(el.dataset.val || "0");
    el.dataset.val = to;
    if(reduce || from === to){ el.textContent = fmt(to); return; }
    const start = performance.now();
    const dur = 600;
    cancelAnimationFrame(el._raf);
    const tick = now => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (to - from) * e);
      if(t < 1) el._raf = requestAnimationFrame(tick);
    };
    el._raf = requestAnimationFrame(tick);
  };

  // Apparition au défilement (+ compteurs data-count)
  const items = document.querySelectorAll(".reveal");
  const counters = document.querySelectorAll("[data-count]");
  if(!("IntersectionObserver" in window)){
    items.forEach(el => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      entry.target.classList.add("is-in");
      entry.target.querySelectorAll("[data-count]").forEach(c => window.animateNumber(c, parseFloat(c.dataset.count)));
      io.unobserve(entry.target);
    });
  }, { threshold:0.12, rootMargin:"0px 0px -40px 0px" });
  items.forEach(el => io.observe(el));

  // Filet de sécurité : si on saute directement plus bas (lien, retour arrière),
  // tout ce qui est au-dessus de l'écran s'affiche aussi.
  let ticking = false;
  window.addEventListener("scroll", () => {
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      document.querySelectorAll(".reveal:not(.is-in)").forEach(el => {
        if(el.getBoundingClientRect().top < window.innerHeight){
          el.classList.add("is-in");
          el.querySelectorAll("[data-count]").forEach(c => window.animateNumber(c, parseFloat(c.dataset.count)));
          io.unobserve(el);
        }
      });
    });
  }, { passive:true });
  counters.forEach(c => { if(!c.closest(".reveal")) c.textContent = c.dataset.count; });
})();
