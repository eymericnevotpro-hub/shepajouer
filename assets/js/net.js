/* ============================================================
   NET — couche PeerJS (host id déterministe = "shepa-<CODE>")
   Réutilise le pattern éprouvé du jeu Western.
   `Peer` est un global UMD chargé via <script> dans index.html.
   ============================================================ */
window.SJ = window.SJ || {};
/* global Peer */

SJ.net = (function(){
  const PREFIX = 'shepa-';

  function create(h){
    // h: { onConn(id), onMsg(id,msg), onLeave(id), onState(view), onClose() }
    let peer = null, conns = new Map(), hostConn = null;

    function parse(raw){ try { return typeof raw==='string' ? JSON.parse(raw) : raw; } catch(e){ return null; } }

    function host(code, onReady, onErr){
      peer = new Peer(PREFIX + code);
      peer.on('open', ()=> onReady && onReady());
      peer.on('connection', (c)=>{
        c.on('open', ()=>{ conns.set(c.peer, c); h.onConn && h.onConn(c.peer); });
        c.on('data', (raw)=>{ const m = parse(raw); if (m) h.onMsg && h.onMsg(c.peer, m); });
        c.on('close', ()=>{ conns.delete(c.peer); h.onLeave && h.onLeave(c.peer); });
        c.on('error', (e)=> console.warn('conn error', e));
      });
      peer.on('error', (e)=>{ console.warn('host peer error', e);
        onErr && onErr(e.type === 'unavailable-id' ? 'id-taken' : (e.type||'error')); });
    }

    function join(code, onOpen, onFail){
      peer = new Peer();
      peer.on('open', ()=>{
        const c = peer.connect(PREFIX + code, { reliable:true });
        hostConn = c;
        let opened = false;
        const to = setTimeout(()=>{ if(!opened){ onFail && onFail('timeout'); try{c.close();}catch(e){} } }, 9000);
        c.on('open', ()=>{ opened = true; clearTimeout(to); onOpen && onOpen(); });
        c.on('data', (raw)=>{ const m = parse(raw); if(!m) return;
          if (m.t === 'view') h.onState && h.onState(m.view); else h.onMsg && h.onMsg('host', m); });
        c.on('close', ()=>{ h.onClose && h.onClose(); });
        c.on('error', (e)=>{ if(!opened){ onFail && onFail('error'); } });
      });
      peer.on('error', (e)=>{ console.warn('join peer error', e);
        if (e.type === 'peer-unavailable') onFail && onFail('not-found'); });
    }

    function sendTo(id, msg){ const c = conns.get(id); if (c && c.open) c.send(JSON.stringify(msg)); }
    function broadcast(msg){ const d = JSON.stringify(msg); for (const c of conns.values()) if (c.open) c.send(d); }
    function send(msg){ if (hostConn && hostConn.open) hostConn.send(JSON.stringify(msg)); } // guest → host
    function kick(id){ const c = conns.get(id); if(c){ try{ c.send(JSON.stringify({t:'kicked'})); }catch(e){} setTimeout(()=>{ try{c.close();}catch(e){} },150); } }
    function leave(){ for (const c of conns.values()) { try{c.close();}catch(e){} } conns.clear();
      if (hostConn){ try{hostConn.close();}catch(e){} hostConn=null; }
      if (peer){ try{peer.destroy();}catch(e){} peer=null; } }

    return { host, join, sendTo, broadcast, send, kick, leave, count:()=>conns.size };
  }
  return { create };
})();
