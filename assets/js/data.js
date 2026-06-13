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
  { id:'wavelength', name:"Longueur d'onde", icon:'🎯', tagline:'Vise la zone cachée du cadran. Le jeu signature.', time:'15 min', bg:'#9B5DE5', shadow:'#6E3CB0', text:'#FFFFFF', tint:'#EADBFF', rot:'-3deg', playable:true },
  { id:'draw',  name:'Dessine & devine',  icon:'✏️', tagline:'Un joueur dessine, les autres devinent.',          time:'10 min', bg:'#2EC4B6', shadow:'#1E8B81', text:'#FFFFFF', tint:'#D7F4F0', rot:'4deg' },
  { id:'bluff', name:'Bluffe-moi',         icon:'🎭', tagline:'Démasque le menteur caché dans le groupe.',         time:'15 min', bg:'#FF8FA3', shadow:'#D45D75', text:'#3B2D5E', tint:'#FFE1E7', rot:'3deg' },
  { id:'quiz',  name:'Quiz éclair',        icon:'⚡', tagline:'Le plus rapide à buzzer rafle la mise.',            time:'8 min',  bg:'#FFC93C', shadow:'#D9A416', text:'#3B2D5E', tint:'#FFF1C9', rot:'-3deg' },
  { id:'chain', name:'Mots en chaîne',     icon:'🔗', tagline:'Rebondis de mot en mot sans casser la chaîne.',     time:'6 min',  bg:'#4D96FF', shadow:'#2F6BC4', text:'#FFFFFF', tint:'#DDEBFF', rot:'4deg' },
  { id:'polls', name:'Top des sondages',   icon:'📊', tagline:"Devine l'avis de la foule.",                        time:'12 min', bg:'#FF5D73', shadow:'#C23A50', text:'#FFFFFF', tint:'#FFE1E6', rot:'-2deg' },
];
