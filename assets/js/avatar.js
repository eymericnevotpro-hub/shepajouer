/* ============================================================
   AVATAR — zone de dessin circulaire (doigt / souris)
   ============================================================ */
window.SJ = window.SJ || {};

SJ.avatar = (function(){
  function makePad(opts={}){
    const size = opts.size || 250;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cv = document.createElement('canvas');
    cv.className = 'draw-pad';
    cv.width = size*dpr; cv.height = size*dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineJoin = ctx.lineCap = 'round';

    let color = '#3B2D5E', erase = false, width = 12;
    let strokes = [], cur = null, drawing = false;

    function redraw(){
      ctx.clearRect(0,0,size,size);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FFF8EC'; ctx.fillRect(0,0,size,size);
      for (const s of strokes){
        if (s.type === 'image'){
          ctx.globalCompositeOperation = 'source-over';
          if (s.img && s.img.complete) ctx.drawImage(s.img, 0, 0, size, size);
          continue;
        }
        if (s.type === 'emoji'){
          ctx.globalCompositeOperation = 'source-over';
          ctx.font = `${size*0.6}px "Apple Color Emoji","Segoe UI Emoji",serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(s.ch, size/2, size/2 + size*0.03);
          continue;
        }
        ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
        ctx.strokeStyle = s.color; ctx.lineWidth = s.w;
        ctx.beginPath();
        const p = s.pts;
        if (p.length === 1){ ctx.arc(p[0][0],p[0][1], s.w/2, 0, 7); ctx.fillStyle=s.color; if(!s.erase) ctx.fill(); else { ctx.globalAlpha=1; ctx.fillStyle='#000'; ctx.fill(); } continue; }
        ctx.moveTo(p[0][0], p[0][1]);
        for (let i=1;i<p.length;i++) ctx.lineTo(p[i][0], p[i][1]);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    function loc(e){ const r = cv.getBoundingClientRect(); return [ (e.clientX-r.left)/r.width*size, (e.clientY-r.top)/r.height*size ]; }
    function down(e){ e.preventDefault(); drawing = true; SJ.audio.unlock();
      cur = {type:'stroke', color, erase, w:width, pts:[loc(e)]}; strokes.push(cur); redraw();
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    }
    function move(e){ if(!drawing) return; e.preventDefault(); cur.pts.push(loc(e)); redraw(); }
    function up(){ drawing = false; cur = null; }
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move, {passive:false});
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    redraw();
    return {
      canvas: cv,
      setColor(c){ if(c.toUpperCase()==='#FFFFFF'){ erase=true; } else { erase=false; color=c; } },
      setBrush(w){ width = w; },
      undo(){ strokes.pop(); redraw(); SJ.audio.click(); },
      clear(){ strokes = []; redraw(); },
      template(ch){ strokes = [{type:'emoji', ch}]; redraw(); SJ.audio.pop(); },
      // recharge un dessin sauvegardé (PNG) comme calque de base pour pouvoir le modifier
      loadDataURL(url){ if(!url) return; const img = new Image(); const st = {type:'image', img}; strokes.unshift(st); img.onload = redraw; img.src = url; },
      isBlank(){ return strokes.length === 0; },
      toDataURL(){ return cv.toDataURL('image/png'); },
    };
  }
  return { makePad };
})();
