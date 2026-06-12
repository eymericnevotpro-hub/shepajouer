/* ============================================================
   CADRAN — demi-cercle interactif (aiguille glissable + score)
   viewBox 0 0 300 165, centre (150,140), rayon 120.
   ratio 0 = pôle gauche, 1 = pôle droit.
   ============================================================ */
window.SJ = window.SJ || {};

SJ.cadran = (function(){
  const NS = 'http://www.w3.org/2000/svg';
  const CX = 150, CY = 140, R = 120, NR = 118;
  // demi-largeurs des bandes de score, en degrés (zone 2-3-4-3-2)
  const W4 = 5, W3 = 15, W2 = 25;

  const el = (n, a={}) => { const e = document.createElementNS(NS, n); for(const k in a) e.setAttribute(k, a[k]); return e; };
  function pt(ratio, r=R){ const th = (1-ratio)*Math.PI; return [CX + r*Math.cos(th), CY - r*Math.sin(th)]; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  function slicePath(rA, rB){
    const [ax,ay] = pt(clamp(rA,0,1)); const [bx,by] = pt(clamp(rB,0,1));
    return `M${CX},${CY} L${ax.toFixed(1)},${ay.toFixed(1)} A${R},${R} 0 0 1 ${bx.toFixed(1)},${by.toFixed(1)} Z`;
  }

  SJ.scoreFor = function(p, t){ const d = Math.abs(p-t)*180; return d<=W4?4 : d<=W3?3 : d<=W2?2 : 0; };

  function make(opts={}){
    const theme = opts.theme || {left:'Froid', right:'Chaud', el:'❄️', er:'🔥'};
    const svg = el('svg', {viewBox:'0 0 300 165', class:'cadran'});
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label', `cadran de ${theme.left} à ${theme.right}`);

    // base arc
    svg.appendChild(el('path', {d:`M30,140 A120,120 0 0 1 270,140`, fill:'#FFF8EC', stroke:'#3B2D5E', 'stroke-width':3}));

    // groupe zone cible
    const gTarget = el('g'); gTarget.style.display = 'none'; svg.appendChild(gTarget);
    // texte "zone cachée"
    const hidden = el('text', {x:150, y:84, 'font-size':14, 'font-weight':'bold', 'text-anchor':'middle', fill:'#A99CC9', 'font-family':'Baloo 2'});
    hidden.textContent = 'zone cible cachée 🙈'; svg.appendChild(hidden);

    // baseline + hub
    svg.appendChild(el('line', {x1:30,y1:140,x2:270,y2:140, stroke:'#3B2D5E','stroke-width':3}));
    const hub = el('circle', {cx:CX,cy:CY,r:7, fill:'#3B2D5E'});

    // pôles
    const lp = el('text', {x:34, y:159, 'font-size':12.5,'font-weight':'bold','text-anchor':'start',fill:'#7A6BA8','font-family':'Baloo 2'});
    lp.textContent = `${theme.el||''} ${theme.left}`.trim();
    const rp = el('text', {x:266, y:159, 'font-size':12.5,'font-weight':'bold','text-anchor':'end',fill:'#7A6BA8','font-family':'Baloo 2'});
    rp.textContent = `${theme.right} ${theme.er||''}`.trim();

    // aiguille
    const gNeedle = el('g', {class:'needle'}); gNeedle.style.display='none';
    const nLine = el('line', {x1:CX,y1:CY,x2:CX,y2:CY-NR, stroke:opts.needleColor||'#FF5D73','stroke-width':5,'stroke-linecap':'round'});
    const nKnob = el('circle', {cx:CX,cy:CY-NR,r:12, fill:'#FFF', stroke:opts.needleColor||'#FF5D73','stroke-width':4});
    gNeedle.appendChild(nLine); gNeedle.appendChild(nKnob);

    // groupe révélation (aiguilles de tout le monde)
    const gReveal = el('g'); svg.appendChild(gReveal);

    svg.appendChild(gNeedle); svg.appendChild(hub); svg.appendChild(lp); svg.appendChild(rp);

    let target = 0.5, needle = 0.5, dragCb = null, dragging = false, raf = 0;

    function drawTarget(){
      gTarget.innerHTML = '';
      const u = [ [-W2,-W3,2,'#FFE3A8'], [-W3,-W4,3,'#FFC93C'], [-W4,W4,4,'#FF5D73'], [W4,W3,3,'#FFC93C'], [W3,W2,2,'#FFE3A8'] ];
      u.forEach(([a,b,sc,col])=>{
        const rA = target + a/180, rB = target + b/180;
        gTarget.appendChild(el('path', {d:slicePath(rA,rB), fill:col, stroke:'#3B2D5E','stroke-width':1.5}));
        const mid = target + ((a+b)/2)/180;
        const [lx,ly] = pt(clamp(mid,0,1), 96);
        const t = el('text', {x:lx.toFixed(1), y:(ly+4).toFixed(1), 'font-size': sc===4?15:13, 'font-weight':'bold','text-anchor':'middle', fill: sc===4?'#FFFFFF':'#3B2D5E','font-family':'Baloo 2'});
        t.textContent = sc; gTarget.appendChild(t);
      });
    }
    function placeNeedle(r){
      needle = clamp(r,0,1);
      const [x,y] = pt(needle, NR);
      nLine.setAttribute('x2', x.toFixed(2)); nLine.setAttribute('y2', y.toFixed(2));
      nKnob.setAttribute('cx', x.toFixed(2)); nKnob.setAttribute('cy', y.toFixed(2));
    }
    function ratioFromEvent(e){
      const m = svg.getScreenCTM(); if(!m) return needle;
      const pt0 = svg.createSVGPoint(); pt0.x = e.clientX; pt0.y = e.clientY;
      const loc = pt0.matrixTransform(m.inverse());
      let th = Math.atan2(CY - loc.y, loc.x - CX) * 180/Math.PI; // up positive
      if (th < 0) th = (loc.x >= CX) ? 0 : 180;
      return clamp(1 - th/180, 0, 1);
    }

    let lastTick = 0;
    function onMove(e){
      if(!dragging) return; e.preventDefault();
      const r = ratioFromEvent(e); placeNeedle(r);
      const now = performance.now();
      if (now - lastTick > 28){ SJ.audio.tick(); lastTick = now; }
      if (dragCb) dragCb(needle);
    }
    function onUp(){
      if(!dragging) return; dragging = false; svg.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      wobble(); SJ.audio.drop();
    }
    function onDown(e){
      dragging = true; svg.classList.add('dragging'); SJ.audio.unlock();
      placeNeedle(ratioFromEvent(e));
      window.addEventListener('pointermove', onMove, {passive:false});
      window.addEventListener('pointerup', onUp);
      if (dragCb) dragCb(needle);
    }
    function wobble(){
      cancelAnimationFrame(raf);
      const base = needle, t0 = performance.now();
      (function step(t){
        const k = (t - t0)/420; if (k >= 1){ placeNeedle(base); return; }
        const amp = (1-k) * 0.018;
        placeNeedle(base + Math.sin(k*22) * amp);
        raf = requestAnimationFrame(step);
      })(t0);
    }

    return {
      el: svg, theme,
      setTarget(r){ target = clamp(r,0,1); drawTarget(); },
      showTarget(on){ gTarget.style.display = on?'':'none'; hidden.style.display = on?'none':''; },
      hideHidden(){ hidden.style.display='none'; },
      getNeedle(){ return needle; },
      setNeedle(r){ gNeedle.style.display=''; placeNeedle(r); },
      setNeedleColor(c){ nLine.setAttribute('stroke',c); nKnob.setAttribute('stroke',c); },
      enableDrag(cb){ dragCb = cb||null; gNeedle.style.display=''; placeNeedle(needle);
        svg.style.cursor='grab'; svg.addEventListener('pointerdown', onDown); },
      score(p){ return SJ.scoreFor(p===undefined?needle:p, target); },
      // révélation : aiguilles successives + zone, avec dé-superposition + highlight "toi"
      reveal(needles, done){
        gNeedle.style.display='none'; hidden.style.display='none';
        this.showTarget(true);
        gReveal.innerHTML = '';
        // étage les pastilles trop proches le long de leur axe (radius décroissant)
        const THR = 0.045, STEP = 24;
        const sorted = needles.map((n,idx)=>({n,idx})).sort((a,b)=>a.n.ratio-b.n.ratio);
        const levelByIdx = {}; let lvl=0, prev=-9;
        sorted.forEach(o=>{ lvl = Math.abs(o.n.ratio-prev) < THR ? lvl+1 : 0; levelByIdx[o.idx]=lvl; prev=o.n.ratio; });
        // ordre d'apparition : les autres d'abord, "toi" en dernier (au-dessus)
        const order = needles.map((_,k)=>k).sort((a,b)=> (needles[a].you?1:0)-(needles[b].you?1:0));
        let i = 0;
        (function next(){
          if (i >= order.length){ done && done(); return; }
          const idx = order[i++]; const n = needles[idx]; const you = !!n.you;
          const r = clamp(n.ratio,0,1);
          const [rx,ry] = pt(r, NR);                                   // bout réel sur l'arc
          const [bx,by] = pt(r, Math.max(34, NR - levelByIdx[idx]*STEP)); // pastille étagée vers le centre
          const g = el('g'); g.style.transformOrigin = `${CX}px ${CY}px`; g.style.animation = 'popIn .34s cubic-bezier(.34,1.56,.64,1) both';
          g.appendChild(el('line', {x1:CX,y1:CY,x2:rx.toFixed(1),y2:ry.toFixed(1), stroke:n.color||'#4D96FF','stroke-width':you?5:3.5,'stroke-linecap':'round', opacity:you?1:0.92}));
          const rad = you?15:11;
          if (you){ g.appendChild(el('circle', {cx:bx.toFixed(1),cy:by.toFixed(1),r:rad+5, fill:'none', stroke:n.color||'#FF5D73','stroke-width':3, opacity:0.45})); }
          g.appendChild(el('circle', {cx:bx.toFixed(1),cy:by.toFixed(1),r:rad, fill:n.color||'#4D96FF', stroke:'#3B2D5E','stroke-width':you?3:2}));
          const tx = el('text', {x:bx.toFixed(1), y:(by+4).toFixed(1), 'font-size':you?14:11,'text-anchor':'middle','font-family':'Baloo 2'});
          tx.textContent = n.emoji||''; g.appendChild(tx);
          if (you){ const lab = el('text', {x:bx.toFixed(1), y:(by-rad-6).toFixed(1), 'font-size':12,'font-weight':'bold','text-anchor':'middle', fill:'#3B2D5E','font-family':'Baloo 2'}); lab.textContent='toi'; g.appendChild(lab); }
          gReveal.appendChild(g);
          SJ.audio.score(n.pts==null?2:n.pts);
          setTimeout(next, 520);
        })();
      },
      clearReveal(){ gReveal.innerHTML=''; },
    };
  }

  return { make };
})();
