/* ============================================================
   DATA — thèmes (par packs), boutique, avatars, bots
   ============================================================ */
window.SJ = window.SJ || {};

SJ.PACKS = [
  { id:'classique', label:'Classique' },
  { id:'pimente',   label:'Pimenté 🌶️' },
  { id:'pop',       label:'Pop culture' },
];

SJ.THEMES = {
  classique: [
    {left:'Froid', right:'Chaud', el:'❄️', er:'🔥'},
    {left:'Petit', right:'Grand', el:'🐜', er:'🐘'},
    {left:'Inutile', right:'Indispensable', el:'', er:''},
    {left:'Moche', right:'Magnifique', el:'', er:'✨'},
    {left:'Lent', right:'Rapide', el:'🐌', er:'⚡'},
    {left:'Pas cher', right:'Hors de prix', el:'', er:'💸'},
    {left:'Calme', right:'Stressant', el:'😌', er:'😱'},
    {left:'Triste', right:'Joyeux', el:'😢', er:'😄'},
    {left:'Banal', right:'Bizarre', el:'', er:'🤪'},
    {left:'Facile', right:'Impossible', el:'', er:''},
  ],
  pimente: [
    {left:'Innocent', right:'Coquin', el:'😇', er:'😏'},
    {left:'Sobre', right:'Bourré', el:'', er:'🍻'},
    {left:'Tabou', right:'Banal', el:'🤐', er:''},
    {left:'Gênant', right:'Classe', el:'😳', er:'😎'},
    {left:'Soft', right:'Hardcore', el:'', er:'🤘'},
    {left:'Sage', right:'Chaud bouillant', el:'😴', er:'🔥'},
    {left:'Légal', right:'Illégal', el:'', er:'🚓'},
    {left:'Privé', right:'À crier sur les toits', el:'🤫', er:'📣'},
  ],
  pop: [
    {left:'Méconnu', right:'Culte', el:'', er:'🎬'},
    {left:'Has-been', right:'Tendance', el:'', er:''},
    {left:'Navet', right:'Chef-d’œuvre', el:'🍅', er:'🏆'},
    {left:'Cringe', right:'Stylé', el:'😬', er:'💅'},
    {left:'Vieux jeu', right:'Hype', el:'', er:'🚀'},
    {left:'Flop', right:'Banger', el:'', er:'🎵'},
    {left:'Nul', right:'Iconique', el:'', er:'⭐'},
    {left:'Underground', right:'Mainstream', el:'', er:''},
  ],
};

/* durée → nombre de tours (repris du lobby) */
SJ.DURATIONS = [
  {id:'courte',  label:'Courte',  rounds:7},
  {id:'normale', label:'Normale', rounds:10},
  {id:'longue',  label:'Longue',  rounds:15},
];

/* indice générique d'un bot proposeur selon la position cible (0=gauche, 1=droite) */
SJ.botClue = function(theme, ratio){
  const L = theme.left.toLowerCase(), R = theme.right.toLowerCase();
  if (ratio < 0.10) return `« ${L} à fond »`;
  if (ratio < 0.28) return `« plutôt ${L} »`;
  if (ratio < 0.43) return `« un peu ${L} »`;
  if (ratio < 0.57) return `« pile au milieu »`;
  if (ratio < 0.72) return `« un peu ${R} »`;
  if (ratio < 0.90) return `« plutôt ${R} »`;
  return `« ${R} à fond »`;
};

/* ---------- boutique ---------- */
SJ.SHOP = {
  Chapeaux: [
    {id:'hat-chic',  glyph:'🎩', name:'Chic',       price:50},
    {id:'hat-cow',   glyph:'🤠', name:'Yeehaw',     price:80},
    {id:'hat-crown', glyph:'👑', name:'Royale',     price:200, rare:true},
    {id:'hat-cap',   glyph:'🧢', name:'Streetwear', price:40},
    {id:'hat-grad',  glyph:'🎓', name:'Diplômé',    price:60},
    {id:'hat-party', glyph:'🥳', name:'Fiesta',     price:90},
  ],
  Fonds: [
    {id:'bg-mint',  swatch:'#E4F8F6', name:'Menthe', price:30},
    {id:'bg-blush', swatch:'#FFE3E8', name:'Blush',  price:30},
    {id:'bg-sky',   swatch:'#EAF2FF', name:'Ciel',   price:30},
    {id:'bg-sun',   swatch:'#FFF1C9', name:'Soleil', price:50},
    {id:'bg-lilac', swatch:'#F4EFFF', name:'Lilas',  price:50},
  ],
  Aiguilles: [
    {id:'nd-coral',  swatch:'#FF5D73', name:'Corail', price:0},
    {id:'nd-teal',   swatch:'#2EC4B6', name:'Teal',   price:40},
    {id:'nd-purple', swatch:'#9B5DE5', name:'Violet', price:40},
    {id:'nd-blue',   swatch:'#4D96FF', name:'Bleu',   price:40},
    {id:'nd-gold',   swatch:'#FFC93C', name:'Or',     price:120, rare:true},
  ],
  Confettis: [
    {id:'cf-party',  glyph:'🎉', name:'Fiesta', price:0},
    {id:'cf-pastel', glyph:'🌸', name:'Pastel', price:50},
    {id:'cf-neon',   glyph:'💖', name:'Néon',   price:80},
  ],
};
SJ.shopItem = function(id){
  for (const cat in SJ.SHOP){ const it = SJ.SHOP[cat].find(x=>x.id===id); if(it) return Object.assign({cat},it); }
  return null;
};

/* ---------- avatars ---------- */
SJ.AVATAR = {
  palette: ['#3B2D5E','#FF5D73','#4D96FF','#FFC93C','#2EC4B6','#FFFFFF'],
  sizes: [ {k:'S',w:6}, {k:'M',w:12}, {k:'L',w:22} ],
  templates: ['🐸','👾','🍕','🤖','🦄','😜','🐱','🌵','🍔','👻'],
};

/* ---------- bots ---------- */
SJ.BOTS = [
  {name:'Marco', emoji:'🐸', color:'#2EC4B6'},
  {name:'Jade',  emoji:'🤖', color:'#4D96FF'},
  {name:'Sam',   emoji:'🍕', color:'#FFC93C'},
  {name:'Nora',  emoji:'🦄', color:'#9B5DE5'},
  {name:'Tom',   emoji:'👾', color:'#FF8FA3'},
  {name:'Lou',   emoji:'🌵', color:'#2EC4B6'},
];

SJ.PLAYER_COLORS = ['#FF5D73','#4D96FF','#2EC4B6','#FFC93C','#9B5DE5','#FF8FA3'];

/* ---------- catalogue de jeux (Salon / menu principal) ---------- */
/* playable:true = jouable maintenant ; les autres = « bientôt » */
SJ.GAMES = [
  // jouables d'abord
  { id:'wavelength', name:"Le demi-cercle", icon:'🎯', tagline:'Vise la zone cachée du cadran. Le jeu signature.', time:'15 min', bg:'#9B5DE5', shadow:'#6E3CB0', text:'#FFFFFF', tint:'#EADBFF', rot:'-3deg', playable:true },
  { id:'draw',  name:'Pictionary',  icon:'✏️', tagline:'Choisis un mot, dessine-le, les autres devinent !',   time:'10 min', bg:'#2EC4B6', shadow:'#1E8B81', text:'#FFFFFF', tint:'#D7F4F0', rot:'4deg', playable:true },
  { id:'bluff', name:'Undercover',         icon:'🎭', tagline:'Tout le monde a un mot… sauf l’imposteur. Démasque-le !', time:'10 min', bg:'#FF8FA3', shadow:'#D45D75', text:'#3B2D5E', tint:'#FFE1E7', rot:'3deg', playable:true },
  { id:'tupreferes', name:'Tu préfères… ?', icon:'🤔', tagline:"Parie le % qui choisira l'option A.",             time:'8 min',  bg:'#FF5D73', shadow:'#C23A50', text:'#FFFFFF', tint:'#FFE1E6', rot:'-2deg', playable:true },
  { id:'partybox',  name:'Party Box',       icon:'📦', tagline:"Plein de mini-jeux qui s'enchaînent de plus en plus vite. 3 vies !", time:'∞', bg:'#6A4BD6', shadow:'#4A2E9E', text:'#FFFFFF', tint:'#EADBFF', rot:'2deg', playable:true },
  { id:'tictacmot', name:'Tic-Tac-Mot',     icon:'💣', tagline:'Trouve un mot avec le bout affiché… avant que la bombe pète !', time:'10 min', bg:'#3B2D5E', shadow:'#1F1638', text:'#FFFFFF', tint:'#EADBFF', rot:'-2deg', playable:true },
  { id:'solo',  name:'Solo !',             icon:'🎴', tagline:'Vide ta main : même couleur ou chiffre, +2, joker… et crie SOLO !', time:'10 min', bg:'#1E8B81', shadow:'#114a43', text:'#FFFFFF', tint:'#D7F4F0', rot:'3deg', playable:true },
  // « bientôt » en dernier (grisés)
  { id:'quiz',  name:'Quiz éclair',        icon:'⚡', tagline:'Le plus rapide à buzzer rafle la mise.',            time:'8 min',  bg:'#FFC93C', shadow:'#D9A416', text:'#3B2D5E', tint:'#FFF1C9', rot:'-3deg' },
  { id:'chain', name:'Mots en chaîne',     icon:'🔗', tagline:'Rebondis de mot en mot sans casser la chaîne.',     time:'6 min',  bg:'#4D96FF', shadow:'#2F6BC4', text:'#FFFFFF', tint:'#DDEBFF', rot:'4deg' },
];

/* ============================================================
   PARTY BOX — micro-jeux rapides enchaînés (survie coopérative)
   make(allowMic) renvoie un micro-jeu : {kind, prompt, ...}
   kinds: 'tapmash' (tape N fois), 'choice' (tape la bonne option),
          'crie' (mic). Pour 'choice', `correct` reste côté hôte.
   ============================================================ */
SJ.PB = (function(){
  const ri = (n)=> Math.floor(Math.random()*n);
  const shuffle = (a)=>{ for(let i=a.length-1;i>0;i--){ const j=ri(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  const EMO = ['🍕','🐸','👾','🦄','🤖','🍔','👻','🌵','⭐','🎈','🐱','🍩','🚀','🎩'];
  const COLORS = [{n:'Rouge',c:'#FF5D73'},{n:'Bleu',c:'#4D96FF'},{n:'Vert',c:'#2EC4B6'},{n:'Jaune',c:'#FFC93C'},{n:'Violet',c:'#9B5DE5'},{n:'Rose',c:'#FF8FA3'}];

  function choice(prompt, options, correct, extra){ return Object.assign({kind:'choice', prompt, options, correct, cat:'normal'}, extra||{}); }

  // chaque builder porte une `key` → on évite de rejouer le même type deux fois de suite
  const BUILDERS = [
    { key:'intrus', fn:()=>{ const base=EMO[ri(EMO.length)]; let odd=base; while(odd===base) odd=EMO[ri(EMO.length)];
      const opts=[base,base,base,base,base]; const pos=ri(5); opts[pos]=odd;
      return choice('Trouve l’intrus 👀', opts, pos, {big:true}); } },
    { key:'math', fn:()=>{ const a=2+ri(9), b=2+ri(9); const c=a+b; const set=new Set([c]); while(set.size<4){ set.add(c + (ri(7)-3) + (ri(2)?1:-1)); } const o=shuffle([...set]); return choice(`${a} + ${b} = ?`, o.map(String), o.indexOf(c)); } },
    { key:'parite', fn:()=>{ const n=2+ri(98); return choice(`${n} c’est…`, ['Pair','Impair'], n%2===0?0:1); } },
    { key:'couleur', fn:()=>{ const t=ri(COLORS.length); const o=shuffle(COLORS.slice()); return choice(`Tape le ${COLORS[t].n}`, o.map(c=>c.c), o.findIndex(c=>c.n===COLORS[t].n), {colormode:true}); } },
    { key:'compter', fn:()=>{ const k=3+ri(5); const e=EMO[ri(EMO.length)]; const set=new Set([k]); while(set.size<4){ set.add(Math.max(1,k+ri(5)-2)); } const o=shuffle([...set]); return choice('Combien ?', o.map(String), o.indexOf(k), {display:e.repeat(k)}); } },
    { key:'suite', fn:()=>{ const s=1+ri(4), st=1+ri(4); const seq=[s,s+st,s+2*st]; const ans=s+3*st; const set=new Set([ans]); while(set.size<4){ set.add(ans+ri(7)-3); } const o=shuffle([...set]); return choice(`${seq.join('  ')}  __`, o.map(String), o.indexOf(ans)); } },
    { key:'mash', fn:()=>{ const t=5+ri(5); return {kind:'tapmash', prompt:'Tape '+t+' fois !', target:t, cat:'normal'}; } },
    // PIÈGE Stroop : clique le bouton de la bonne COULEUR (le texte blanc ment !)
    { key:'trapcolor', fn:()=>{ const cols=shuffle(COLORS.slice()).slice(0,4); const tIdx=ri(4); const target=cols[tIdx];
      const cells=cols.map((c,i)=>({bg:c.c, label:cols[(i+1)%4].n}));   // chaque texte = une AUTRE couleur que le fond
      return {kind:'trapcolor', prompt:`Clique le bouton ${target.n.toUpperCase()}`, cells, correct:tIdx, cat:'trap', trap:true}; } },
    // CAPTCHA EXTRÊME : 5 étapes de plus en plus absurdes à passer dans le temps (mèche plus longue)
    { key:'captcha', fn:()=>({kind:'captcha', prompt:'🤖 CAPTCHA EXTRÊME', dur:11, cat:'trap', trap:true}) },
  ];

  return {
    // avoidKey : clé du mini précédent à ne PAS rejouer ; micTarget = niveau sonore à atteindre
    make(allowMic, avoidKey){
      if(allowMic && avoidKey!=='crie' && Math.random()<0.25)
        return {kind:'crie', prompt:'CRIE le plus fort possible ! 🎤', cat:'mic', key:'crie', micTarget:0.72};
      let pool = BUILDERS.filter(b=> b.key!==avoidKey);
      if(!pool.length) pool = BUILDERS;
      const b = pool[ri(pool.length)];
      const m = b.fn(); m.key = b.key; return m;
    }
  };
})();

/* dilemmes proposés au hasard pour "Tu préfères" (l'auteur peut aussi écrire le sien) */
SJ.DILEMMAS = [
  {a:'🍍 Pizza ananas', b:'🚫 Pizza sans ananas'},
  {a:'🦸 Voler', b:'🫥 Être invisible'},
  {a:'🏖️ Vacances plage', b:'🏔️ Vacances montagne'},
  {a:'🐶 Team chien', b:'🐱 Team chat'},
  {a:'☀️ Lève-tôt', b:'🌙 Couche-tard'},
  {a:'📱 Sans réseau 1 mois', b:'🚿 Sans douche 1 semaine'},
  {a:'🍫 Que du sucré', b:'🧀 Que du salé'},
  {a:'🔮 Voir le futur', b:'⏪ Changer le passé'},
  {a:'💰 Riche mais seul', b:'🥰 Fauché mais entouré'},
  {a:'🎬 Films', b:'🎮 Jeux vidéo'},
];

/* Bluffe-moi (Undercover) : la majorité reçoit `civil`, l'imposteur reçoit `under` (mot proche). */
SJ.UNDERCOVER = [
  {civil:'Chien', under:'Chat'},       {civil:'Café', under:'Thé'},          {civil:'Mer', under:'Piscine'},
  {civil:'Pizza', under:'Tarte'},      {civil:'Été', under:'Hiver'},         {civil:'Lune', under:'Soleil'},
  {civil:'Vélo', under:'Moto'},        {civil:'Roi', under:'Reine'},         {civil:'Pomme', under:'Poire'},
  {civil:'Train', under:'Bus'},        {civil:'Guitare', under:'Violon'},    {civil:'Football', under:'Rugby'},
  {civil:'Médecin', under:'Infirmier'},{civil:'Lion', under:'Tigre'},        {civil:'Crayon', under:'Stylo'},
  {civil:'Neige', under:'Pluie'},      {civil:'Château', under:'Maison'},    {civil:'Avion', under:'Hélicoptère'},
  {civil:'Fraise', under:'Framboise'}, {civil:'Livre', under:'Magazine'},    {civil:'Plage', under:'Désert'},
  {civil:'Vampire', under:'Zombie'},   {civil:'Sorcier', under:'Magicien'},  {civil:'Chocolat', under:'Caramel'},
  {civil:'Montre', under:'Horloge'},   {civil:'Bateau', under:'Sous-marin'}, {civil:'Forêt', under:'Jungle'},
  {civil:'Boulanger', under:'Pâtissier'},{civil:'Téléphone', under:'Tablette'},{civil:'Pirate', under:'Marin'},
  {civil:'Burger', under:'Sandwich'},  {civil:'Ski', under:'Snowboard'},     {civil:'Abeille', under:'Guêpe'},
  {civil:'Professeur', under:'Élève'}, {civil:'Citron', under:'Orange'},     {civil:'Renard', under:'Loup'},
];

/* Dessine & devine (Pictionary) : mots à faire deviner (dessinables). */
SJ.PICTWORDS = [
  'Soleil','Maison','Chat','Chien','Voiture','Arbre','Fleur','Poisson','Étoile','Pizza',
  'Banane','Robot','Fusée','Ballon','Lunettes','Parapluie','Gâteau','Montagne','Avion','Bateau',
  'Vélo','Clé','Cœur','Fantôme','Couronne','Guitare','Téléphone','Champignon','Serpent','Éléphant',
  'Papillon','Cactus','Glace','Hamburger','Échelle','Horloge','Tortue','Dragon','Sorcière','Pingouin',
  'Requin','Abeille','Carotte','Fraise','Parachute','Tente','Château','Pont','Ananas','Crabe',
  'Hibou','Licorne','Volcan','Igloo','Boussole','Trésor','Squelette','Cerf-volant','Lampe','Araignée',
];

/* Tic-Tac-Mot (jeu de la bombe) : un bout de mot à caser dans un mot. Pas de dico — on vérifie juste qu'il contient le bout (≥3 lettres). */
SJ.BOMBSYL = [
  {s:'BR', hints:['BRAS','ZÈBRE','OMBRE']},      {s:'TRA', hints:['TRAIN','EXTRA','TRACE']},
  {s:'OU', hints:['LOUP','ROUGE','FOU']},        {s:'CHA', hints:['CHAT','CACHA','CHANT']},
  {s:'PLI', hints:['PLIER','REPLI','PLIAGE']},   {s:'MENT', hints:['MENTON','VRAIMENT','MENTHE']},
  {s:'RON', hints:['RONFLE','RONDE','MARRON']},  {s:'GRA', hints:['GRAND','AGRAFE','GRAVE']},
  {s:'AN', hints:['ANGE','BANANE','MANGER']},    {s:'IN', hints:['LAPIN','INFO','MOULIN']},
  {s:'ON', hints:['BALLON','MONDE','PONT']},     {s:'RE', hints:['RENARD','CARRÉ','MÈRE']},
  {s:'TER', hints:['TERRE','POTERIE','ENTIER']}, {s:'LA', hints:['LAMPE','SALADE','VOILÀ']},
  {s:'CO', hints:['COQ','ÉCOLE','COLLE']},       {s:'MA', hints:['MAISON','AMANDE','MALIN']},
  {s:'PA', hints:['PAPA','REPAS','PANIER']},     {s:'TI', hints:['TIGRE','PARTI','SORTIE']},
  {s:'CHE', hints:['CHEVAL','BICHE','MARCHE']},  {s:'BLE', hints:['BLEU','TABLE','SABLE']},
  {s:'CLE', hints:['CLÉ','ONCLE','CYCLE']},      {s:'VE', hints:['VENT','RÊVE','VEAU']},
  {s:'OR', hints:['OR','PORTE','TRÉSOR']},       {s:'AR', hints:['ARBRE','GARE','CANARD']},
  {s:'IL', hints:['ÎLE','FACILE','PILE']},       {s:'OI', hints:['OISEAU','ROI','BOÎTE']},
  {s:'EUR', hints:['FLEUR','PEUR','BONHEUR']},   {s:'AGE', hints:['PAGE','NUAGE','IMAGE']},
  {s:'TION', hints:['NATION','POTION','STATION']},{s:'POI', hints:['POISSON','POIRE','POING']},
];

/* Solo ! (jeu de cartes type UNO) — helpers de cartes (porté du handoff Solo.dc.html). Pas de pioche finie : cartes générées au hasard. */
SJ.SOLO = (function(){
  const COLORS=['R','B','G','Y'];
  const CMAP={
    R:{bg:'#FF5D73', sh:'#C23A50', corner:'#FFFFFF', name:'Rouge', ink:'#E8455C'},
    B:{bg:'#4D96FF', sh:'#2F6BC4', corner:'#FFFFFF', name:'Bleu',  ink:'#2F6BC4'},
    G:{bg:'#2EC4B6', sh:'#1E8B81', corner:'#FFFFFF', name:'Vert',  ink:'#1E8B81'},
    Y:{bg:'#FFC93C', sh:'#D9A416', corner:'#3B2D5E', name:'Jaune', ink:'#D9A416'},
    W:{bg:'conic-gradient(#FF5D73 0deg 90deg,#FFC93C 90deg 180deg,#2EC4B6 180deg 270deg,#4D96FF 270deg 360deg)', sh:'#1F1638', corner:'#FFFFFF', name:'Joker', ink:'#3B2D5E'}
  };
  const ri=n=>Math.floor(Math.random()*n);
  function sym(val){ return val==='skip'?'⊘':val==='rev'?'⇄':val==='wild'?'★':val; }
  function label(card){ return CMAP[card.color].name+' '+sym(card.val); }
  function randCard(){ const r=Math.random(); if(r<0.07) return {color:'W', val:Math.random()<0.5?'wild':'+4'};
    const c=COLORS[ri(4)]; const rr=Math.random();
    if(rr<0.12) return {color:c, val:'skip'}; if(rr<0.20) return {color:c, val:'+2'}; if(rr<0.26) return {color:c, val:'rev'};
    return {color:c, val:String(ri(10))}; }
  function startCard(){ let t; do{ t=randCard(); } while(t.color==='W' || ['skip','rev','+2','+4'].indexOf(t.val)>=0); return t; }   // 1re carte = un simple chiffre
  function aiCard(activeColor){ const r=Math.random();
    if(r<0.10) return {color:activeColor, val:'skip'}; if(r<0.18) return {color:activeColor, val:'+2'};
    if(r<0.24) return {color:activeColor, val:'rev'}; if(r<0.29) return {color:'W', val:Math.random()<0.5?'wild':'+4'};
    return {color:activeColor, val:String(ri(10))}; }
  return { COLORS, CMAP, sym, label, randCard, startCard, aiCard };
})();
