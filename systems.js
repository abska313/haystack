import { ITEMS, TOOLS, MISSIONS, pickRandomItem, rarityRank } from './items.js';

/* ---------- Game State ---------- */
export class GameState {
  constructor(bus) {
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.money = 0;
    this.xp = 0;
    this.level = 1;
    this.inventory = {};        // { itemId: qty }
    this.ownedTools = ['hands'];
    this.currentTool = 'hands';
    this.toolDurability = { hands: Infinity };
    this.missions = {};         // { id: {progress, done} }
    for (const m of MISSIONS) this.missions[m.id] = { progress: 0, done: false };
    this.moneyEarnedTotal = 0;
    this.hayRemovedTotal = 0;
    this.haySoldTotal = 0;
    this.toolsBoughtCount = 0;
    this.playTime = 0;
    this.discoveredItems = {};  // itemId -> count found (lifetime)
    this._emitAll();
  }

  xpToNext() {
    return Math.floor(50 * Math.pow(1.35, this.level - 1));
  }

  addMoney(n) {
    if (n === 0) return;
    this.money += n;
    if (n > 0) this.moneyEarnedTotal += n;
    this.bus.emit('money', this.money);
    this.bus.emit('moneyChanged');
  }

  spendMoney(n) {
    if (this.money < n) return false;
    this.money -= n;
    this.bus.emit('money', this.money);
    this.bus.emit('moneyChanged');
    return true;
  }

  addXP(n) {
    this.xp += n;
    this.bus.emit('xp', { xp: this.xp, needed: this.xpToNext() });
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level += 1;
      this.addMoney(50 + this.level * 20);
      this.bus.emit('levelUp', this.level);
      this.bus.emit('xp', { xp: this.xp, needed: this.xpToNext() });
    }
    this.bus.emit('xpChanged');
  }

  addItem(id, qty = 1) {
    if (!ITEMS[id]) return;
    this.inventory[id] = (this.inventory[id] || 0) + qty;
    this.discoveredItems[id] = (this.discoveredItems[id] || 0) + qty;
    this.bus.emit('inventoryChanged');
    this.bus.emit('item_collected', { id, qty });
    // Mission: item_found uses lifetime count
    this.bus.emit('item_found', { id, qty });
  }

  removeItem(id, qty = 1) {
    if (!this.inventory[id]) return false;
    if (this.inventory[id] < qty) return false;
    this.inventory[id] -= qty;
    if (this.inventory[id] <= 0) delete this.inventory[id];
    this.bus.emit('inventoryChanged');
    return true;
  }

  itemCount(id) { return this.inventory[id] || 0; }

  addTool(id) {
    if (!this.ownedTools.includes(id)) this.ownedTools.push(id);
    if (this.toolDurability[id] === undefined) this.toolDurability[id] = TOOLS[id]?.durabilityMax || 100;
    this.bus.emit('toolsChanged');
  }

  equipTool(id) {
    if (!this.ownedTools.includes(id)) return false;
    this.currentTool = id;
    this.bus.emit('toolEquipped', id);
    this.bus.emit('toolsChanged');
    return true;
  }

  currentToolDef() { return TOOLS[this.currentTool] || TOOLS.hands; }

  /* ---------- Missions ---------- */
  _checkMissions() {
    for (const m of MISSIONS) {
      const st = this.missions[m.id];
      if (!st || st.done) continue;
      if (st.progress >= m.amount) {
        st.done = true;
        this.addMoney(m.reward.money);
        this.addXP(m.reward.xp);
        this.bus.emit('missionComplete', m);
      }
    }
    this.bus.emit('missionsChanged');
  }

  handleEvent(evt, data) {
    for (const m of MISSIONS) {
      const st = this.missions[m.id];
      if (!st || st.done) continue;
      if (m.event !== evt) continue;
      if (m.target && data.id !== m.target) continue;
      if (evt === 'money_earned') {
        st.progress = this.moneyEarnedTotal;
      } else if (evt === 'tool_bought') {
        st.progress = this.toolsBoughtCount;
      } else {
        st.progress += (data.qty || 1);
      }
    }
    this._checkMissions();
  }

  _emitAll() {
    this.bus.emit('money', this.money);
    this.bus.emit('xp', { xp: this.xp, needed: this.xpToNext() });
    this.bus.emit('inventoryChanged');
    this.bus.emit('toolsChanged');
    this.bus.emit('missionsChanged');
  }

  serialize() {
    return {
      money: this.money, xp: this.xp, level: this.level,
      inventory: this.inventory,
      ownedTools: this.ownedTools,
      currentTool: this.currentTool,
      toolDurability: this.toolDurability,
      missions: this.missions,
      moneyEarnedTotal: this.moneyEarnedTotal,
      hayRemovedTotal: this.hayRemovedTotal,
      haySoldTotal: this.haySoldTotal,
      toolsBoughtCount: this.toolsBoughtCount,
      playTime: this.playTime,
      discoveredItems: this.discoveredItems,
    };
  }

  restore(d) {
    if (!d) return;
    this.money = d.money || 0;
    this.xp = d.xp || 0;
    this.level = d.level || 1;
    this.inventory = d.inventory || {};
    this.ownedTools = d.ownedTools || ['hands'];
    this.currentTool = d.currentTool || 'hands';
    this.toolDurability = d.toolDurability || { hands: Infinity };
    this.missions = d.missions || this.missions;
    this.moneyEarnedTotal = d.moneyEarnedTotal || 0;
    this.hayRemovedTotal = d.hayRemovedTotal || 0;
    this.haySoldTotal = d.haySoldTotal || 0;
    this.toolsBoughtCount = d.toolsBoughtCount || 0;
    this.playTime = d.playTime || 0;
    this.discoveredItems = d.discoveredItems || {};
    this._emitAll();
  }
}

/* ---------- Hay interaction / search system ---------- */
export class SearchSystem {
  constructor(state, bus, audio, world, player, camera) {
    this.state = state;
    this.bus = bus;
    this.audio = audio;
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.raycaster = new THREE_Raycaster();
    this.lastFound = null;
    this._promptEl = document.getElementById('interact-prompt');
    this._currentTarget = null;
    this._actionCooldown = 0;
  }

  setPrompt(text) {
    if (text) { this._promptEl.textContent = text; this._promptEl.classList.remove('hidden'); }
    else this._promptEl.classList.add('hidden');
  }

  raycastHay() {
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    this.raycaster.far = 5.0;
    const meshes = this.world.hayPiles.map(p => p.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const h = hits[0];
    if (h.instanceId == null) return null;
    const pile = h.object.userData.pile;
    if (!pile) return null;
    const inst = pile.instances[h.instanceId];
    if (!inst || !inst.alive) return null;
    return { pile, point: h.point.clone(), instanceId: h.instanceId };
  }

  updateProximity() {
    // Proximity prompts for shop/sell take priority
    const pp = this.player.getPosition();
    const dShop = pp.distanceTo(this.world.shopPad);
    const dSell = pp.distanceTo(this.world.sellPad);
    if (dSell < 3) {
      this._currentTarget = { kind: 'sell' };
      this.setPrompt('Open Selling Area');
      return;
    }
    if (dShop < 3) {
      this._currentTarget = { kind: 'shop' };
      this.setPrompt('Open Shop');
      return;
    }
    const hit = this.raycastHay();
    if (hit) {
      this._currentTarget = { kind: 'hay', hit };
      const tool = this.state.currentToolDef();
      this.setPrompt(`Remove Hay (${tool.capacity})`);
    } else {
      this._currentTarget = null;
      this.setPrompt(null);
    }
  }

  tryAction() {
    if (!this._currentTarget) return;
    if (this._currentTarget.kind === 'shop') { this.bus.emit('openShop'); return; }
    if (this._currentTarget.kind === 'sell') { this.bus.emit('openSell'); return; }
    if (this._currentTarget.kind === 'hay') {
      this._removeHay(this._currentTarget.hit);
    }
  }

  _removeHay(hit) {
    const tool = this.state.currentToolDef();
    const capacity = tool.capacity;

    // Count actually removed
    const removed = hit.pile.removeNear(hit.point, capacity);
    if (removed <= 0) return;

    // Materials drop from removed units
    // Each removed "unit" yields ~1 hay + occasional extras
    const drops = {};
    for (let i = 0; i < removed; i++) {
      const it = pickRandomItem();
      const q = Math.max(1, Math.min(it.maxDrop || 1, Math.ceil(Math.random() * (it.maxDrop || 1))));
      // common resource yields are frequent; rare items are rare (already weighted)
      drops[it.id] = (drops[it.id] || 0) + (it.category === 'resource' ? q : 1);
    }

    // Guarantee at least 1 hay
    if (!drops.hay) drops.hay = 1;

    // Give to inventory, emit found events
    for (const id in drops) {
      this.state.addItem(id, drops[id]);
      const def = ITEMS[id];
      if (!def) continue;
      // Toast for non-common
      if (def.rarity !== 'common') {
        this.bus.emit('rareFound', { id, qty: drops[id] });
      }
    }

    // Stats / feedback
    this.state.hayRemovedTotal += removed;
    this.state.addXP(Math.max(1, Math.floor(removed * 0.4)));

    this.audio.play(removed > 5 ? 'hay_remove_big' : 'hay_remove');
    this.player.addShake(0.12);
    this.bus.emit('hayRemoved', { removed, drops });
  }
}

/* ---------- Economy (Shop / Sell) ---------- */
export class EconomySystem {
  constructor(state, bus, audio) {
    this.state = state;
    this.bus = bus;
    this.audio = audio;
  }

  buyTool(id) {
    const t = TOOLS[id];
    if (!t) return { ok: false, reason: 'Unknown tool' };
    if (this.state.ownedTools.includes(id)) return { ok: false, reason: 'Already owned' };
    if (this.state.money < t.price) return { ok: false, reason: 'Not enough money' };
    this.state.spendMoney(t.price);
    this.state.addTool(id);
    this.state.toolsBoughtCount += 1;
    this.audio.play('buy');
    this.state.handleEvent('tool_bought', {});
    this.bus.emit('toolsChanged');
    return { ok: true };
  }

  sellItem(id, qty = 1) {
    const def = ITEMS[id];
    if (!def) return { ok: false, reason: 'Unknown item' };
    const have = this.state.itemCount(id);
    if (have < qty) return { ok: false, reason: 'Not enough' };
    if (!this.state.removeItem(id, qty)) return { ok: false, reason: 'Remove failed' };
    const price = def.value * qty;
    this.state.addMoney(price);
    this.state.haySoldTotal += (id === 'hay') ? qty : 0;
    this.audio.play('sell');
    this.state.handleEvent('item_sold', { id, qty });
    this.state.handleEvent('money_earned', {});
    this.bus.emit('inventoryChanged');
    return { ok: true, price };
  }

  sellAllOfCategory(cat) {
    let total = 0, count = 0;
    for (const id of Object.keys(this.state.inventory)) {
      const def = ITEMS[id];
      if (!def || def.category !== cat) continue;
      const q = this.state.inventory[id];
      const r = this.sellItem(id, q);
      if (r.ok) { total += r.price; count += q; }
    }
    return { total, count };
  }
}

/* ---------- Save System ---------- */
export class SaveSystem {
  constructor(state, world, player, audio, bus) {
    this.state = state; this.world = world; this.player = player;
    this.audio = audio; this.bus = bus;
    this.KEY = 'savegame';
    this._saveTimer = 0;
    this._autoSaveInterval = 15;
  }

  async save() {
    const data = {
      version: 1,
      ts: Date.now(),
      state: this.state.serialize(),
      world: this.world.serialize(),
      player: this.player.serialize(),
    };
    const { idbSet } = await import('./core.js');
    await idbSet(this.KEY, data);
    this.bus.emit('saved');
  }

  async load() {
    const { idbGet } = await import('./core.js');
    const data = await idbGet(this.KEY);
    if (!data) return false;
    try {
      this.state.restore(data.state);
      this.world.restore(data.world);
      this.player.restore(data.player);
      return true;
    } catch (e) { console.error('Load failed', e); return false; }
  }

  async wipe() {
    const { idbSet } = await import('./core.js');
    await idbSet(this.KEY, null);
    this.state.reset();
  }

  tick(dt) {
    this._saveTimer += dt;
    if (this._saveTimer > this._autoSaveInterval) {
      this._saveTimer = 0;
      this.save();
    }
  }
}

/* ---------- Tiny Raycaster shim (imported lazily) ---------- */
// Note: we import THREE here so that raycaster works without circular deps.
import * as THREE from 'three';
class THREE_Raycaster extends THREE.Raycaster {}