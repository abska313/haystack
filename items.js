// Item / Tool / Rarity / Mission database

export const RARITY = {
  common:    { key: 'common',    name: 'Common',    color: '#9a9a9a', weight: 1000 },
  uncommon:  { key: 'uncommon',  name: 'Uncommon',  color: '#4caf50', weight: 300 },
  rare:      { key: 'rare',      name: 'Rare',      color: '#2196f3', weight: 80 },
  epic:      { key: 'epic',      name: 'Epic',      color: '#9c27b0', weight: 20 },
  legendary: { key: 'legendary', name: 'Legendary', color: '#ff9800', weight: 5 },
  mythic:    { key: 'mythic',    name: 'Mythic',    color: '#e91e63', weight: 1 },
};

// drop: probability weight when hay is removed; max amount per removal tick
export const ITEMS = {
  hay:            { id:'hay',            name:'Hay',             desc:'Dried hay from the pile.',        value:1,   weight:0.5,  stack:9999, rarity:'common',    category:'resource', drop: 950, maxDrop: 6, icon:'🌾' },
  straw:          { id:'straw',          name:'Straw',           desc:'Loose straw.',                    value:2,   weight:0.3,  stack:9999, rarity:'common',    category:'resource', drop: 320, maxDrop: 3, icon:'🌿' },
  wood:           { id:'wood',           name:'Wood',            desc:'A scrap of wood.',                value:3,   weight:1.2,  stack:500,  rarity:'common',    category:'resource', drop: 90,  maxDrop: 2, icon:'🪵' },
  scrap:          { id:'scrap',          name:'Scrap Metal',     desc:'Bits of rusted metal.',           value:5,   weight:0.8,  stack:500,  rarity:'common',    category:'resource', drop: 70,  maxDrop: 2, icon:'🔩' },
  cloth:          { id:'cloth',          name:'Cloth',           desc:'Torn cloth.',                     value:4,   weight:0.2,  stack:500,  rarity:'common',    category:'resource', drop: 60,  maxDrop: 2, icon:'🧵' },
  rope:           { id:'rope',           name:'Rope',            desc:'Old rope.',                       value:8,   weight:0.6,  stack:200,  rarity:'common',    category:'resource', drop: 40,  maxDrop: 1, icon:'🪢' },

  needle:         { id:'needle',         name:'Needle',          desc:'A common sewing needle.',         value:25,  weight:0.01, stack:50,   rarity:'common',    category:'rare',     drop: 22,  maxDrop: 1, icon:'📍' },
  coin:           { id:'coin',           name:'Old Coin',        desc:'A weathered coin.',               value:15,  weight:0.02, stack:100,  rarity:'uncommon',  category:'rare',     drop: 22,  maxDrop: 1, icon:'🪙' },
  silver_needle:  { id:'silver_needle',  name:'Silver Needle',   desc:'A shining silver needle.',        value:120, weight:0.01, stack:20,   rarity:'uncommon',  category:'rare',     drop: 5,   maxDrop: 1, icon:'✨' },
  jewelry:        { id:'jewelry',        name:'Old Jewelry',     desc:'A tarnished ring.',               value:180, weight:0.05, stack:10,   rarity:'rare',      category:'rare',     drop: 2,   maxDrop: 1, icon:'💍' },
  golden_needle:  { id:'golden_needle',  name:'Golden Needle',   desc:'A radiant golden needle.',        value:600, weight:0.02, stack:10,   rarity:'rare',      category:'rare',     drop: 0.8, maxDrop: 1, icon:'🌟' },
  watch:          { id:'watch',          name:'Lost Watch',      desc:'A broken pocket watch.',          value:340, weight:0.15, stack:5,    rarity:'epic',      category:'rare',     drop: 0.3, maxDrop: 1, icon:'⌚' },
  ancient_relic:  { id:'ancient_relic',  name:'Ancient Relic',   desc:'Something very old...',           value:1500,weight:0.4,  stack:1,    rarity:'legendary', category:'rare',     drop: 0.06,maxDrop: 1, icon:'🏺' },
};

export const TOOLS = {
  hands:       { id:'hands',       name:'Hands',        desc:'Bare hands. Slow but free.',           price:0,    speed:1,   capacity:1,  durabilityMax:99999, upgradeCost: 40,   icon:'🤚' },
  stick:       { id:'stick',       name:'Stick',        desc:'A simple wooden stick.',               price:50,   speed:1.6, capacity:2,  durabilityMax:500,   upgradeCost: 90,   icon:'🪄' },
  small_rake:  { id:'small_rake',  name:'Small Rake',   desc:'A small basic rake.',                  price:200,  speed:2.2, capacity:5,  durabilityMax:800,   upgradeCost: 320,  icon:'🧹' },
  hay_fork:    { id:'hay_fork',    name:'Hay Fork',     desc:'A sturdy fork for hay.',               price:600,  speed:3.2, capacity:12, durabilityMax:1500,  upgradeCost: 900,  icon:'🔱' },
  large_rake:  { id:'large_rake',  name:'Large Rake',   desc:'Wide rake, big reach.',                price:2000, speed:5,   capacity:25, durabilityMax:3000,  upgradeCost: 3000, icon:'🧽' },
};

export const MISSIONS = [
  { id:'m_first_needle', title:'Find your first needle',     desc:'Find a needle in the hay.',     event:'item_found', target:'needle', amount:1, reward:{money:50,  xp:20} },
  { id:'m_collect_hay',  title:'Collect 50 Hay',              desc:'Pull 50 hay from piles.',       event:'item_collected', target:'hay', amount:50, reward:{money:40,  xp:25} },
  { id:'m_sell_hay',     title:'Sell 20 Hay',                 desc:'Sell hay at the selling pad.',  event:'item_sold', target:'hay', amount:20, reward:{money:60,  xp:30} },
  { id:'m_earn_200',     title:'Earn $200',                   desc:'Earn a total of $200.',         event:'money_earned', target:'',     amount:200, reward:{money:100, xp:40} },
  { id:'m_first_tool',   title:'Buy your first tool',         desc:'Buy a tool from the shop.',     event:'tool_bought', target:'',     amount:1,   reward:{money:75,  xp:35} },
  { id:'m_find_silver',  title:'Find a Silver Needle',        desc:'Find a rare silver needle.',    event:'item_found', target:'silver_needle', amount:1, reward:{money:300, xp:120} },
];

export function pickRandomItem() {
  // Weighted pick based on drop weights
  let total = 0;
  const entries = Object.values(ITEMS);
  for (const it of entries) total += it.drop;
  let r = Math.random() * total;
  for (const it of entries) {
    r -= it.drop;
    if (r <= 0) return it;
  }
  return ITEMS.hay;
}

export function rarityRank(r) {
  const order = ['common','uncommon','rare','epic','legendary','mythic'];
  return order.indexOf(r);
}