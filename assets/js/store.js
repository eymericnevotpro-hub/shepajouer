/* ============================================================
   STORE — état persistant (localStorage)
   ============================================================ */
window.SJ = window.SJ || {};

SJ.store = (function(){
  const KEY = 'sj.v1';
  const DEFAULTS = {
    pseudo: '',
    avatar: { type:'emoji', value:'😜' },   // ou {type:'draw', value:dataURL}
    coins: 240,
    owned: ['hat-cap','nd-coral','cf-party'],
    equipped: { hat:null, bg:null, needle:'#FF5D73', confetti:'cf-party' },
    settings: { durationId:'normale', packs:['classique'], muted:false },
  };

  let state;
  try {
    state = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}'));
    state.equipped = Object.assign({}, DEFAULTS.equipped, state.equipped);
    state.settings = Object.assign({}, DEFAULTS.settings, state.settings);
    if (!Array.isArray(state.owned)) state.owned = DEFAULTS.owned.slice();
  } catch(e){ state = JSON.parse(JSON.stringify(DEFAULTS)); }

  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }

  return {
    get(k){ return state[k]; },
    all(){ return state; },
    set(k,v){ state[k]=v; save(); },
    setIn(k, sub, v){ state[k] = Object.assign({}, state[k], {[sub]:v}); save(); },
    addCoins(n){ state.coins = Math.max(0, Math.round(state.coins + n)); save(); return state.coins; },
    owns(id){ return state.owned.includes(id); },
    own(id){ if(!state.owned.includes(id)) state.owned.push(id); save(); },
    equip(slot, val){ state.equipped[slot]=val; save(); },
    reset(){ state = JSON.parse(JSON.stringify(DEFAULTS)); save(); },
  };
})();
