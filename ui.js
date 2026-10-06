import { ITEMS, TOOLS, MISSIONS, RARITY } from './items.js';

export class UIManager {
  constructor(bus, state, economy, saveSystem) {
    this.bus = bus;
    this.state = state;
    this.economy = economy;
    this.save = saveSystem;

    this._els = {
      money: document.getElementById('hud-money'),
      level: document.getElementById('hud-level'),
      xp: document.getElementById('hud-xp'),
      xpFill: document.getElementById('hud-xp-fill'),
      toolName: document.getElementById('hud-tool-name'),
      overlay: document.getElementById('modal-overlay'),
      modalTitle: document.getElementById('modal-title'),
      modalBody: document.getElementById('modal-body'),
      modalClose: document.getElementById('modal-close'),
      toast: document.getElementById('toast-area'),
      tutorial: document.getElementById('tutorial'),
    };

    this._bindEvents();
    this._bindButtons();
    this._refreshHud();
  }

  _bindEvents() {
    this.bus.on('money', (m) => this._els.money.textContent = m);
    this.bus.on('levelUp', (lv) => {
      this._els.level.textContent = lv;
      this._showToast(`LEVEL UP! Lv ${lv}`, 'legendary');
      // level-up visual effect on HUD
      this._els.money.parentElement.animate?.(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }],
        { duration: 400 }
      );
    });
    this.bus.on('xp', ({ xp, needed }) => {
      this._els.xp.textContent = `${xp}/${needed}`;
      this._els.xpFill.style.width = `${(xp / needed) * 100}%`;
    });
    this.bus.on('toolsChanged', () => this._refreshTool());
    this.bus.on('toolEquipped', (id) => this._refreshTool());
    this.bus.on('inventoryChanged', () => { if (this._openPanel === 'inventory') this.openInventory(); });
    this.bus.on('missionsChanged', () => { if (this._openPanel === 'missions') this.openMissions(); });
    this.bus.on('rareFound', ({ id, qty }) => {
      const def = ITEMS[id];
      if (!def) return;
      const r = RARITY[def.rarity];
      this._showToast(`${def.icon || ''} ${def.name} ×${qty}`, def.rarity);
      // visual toast color
      const last = this._els.toast.lastChild;
      if (last) last.style.borderColor = r.color;
    });
    this.bus.on('missionComplete', (m) => {
      this._showToast(`Mission Complete: ${m.title}`, 'legendary');
      this.bus.emit('xp', { xp: this.state.xp, needed: this.state.xpToNext() });
    });
    this.bus.on('saved', () => {
      this._showToast('Saved', 'common');
    });
    this.bus.on('openShop', () => this.openShop());
    this.bus.on('openSell', () => this.openSell());
  }

  _bindButtons() {
    document.getElementById('btn-inventory').addEventListener('click', () => this.openInventory());
    document.getElementById('btn-settings').addEventListener('click', () => this.openSettings());
    document.getElementById('btn-missions').addEventListener('click', () => this.openMissions());
    this._els.modalClose.addEventListener('click', () => this.closeModal());
    this._els.overlay.addEventListener('click', (e) => { if (e.target === this._els.overlay) this.closeModal(); });
  }

  _refreshHud() {
    this._els.money.textContent = this.state.money;
    this._els.level.textContent = this.state.level;
    this._els.xp.textContent = `${this.state.xp}/${this.state.xpToNext()}`;
    this._els.xpFill.style.width = `${(this.state.xp / this.state.xpToNext()) * 100}%`;
    this._refreshTool();
  }
  _refreshTool() {
    const t = this.state.currentToolDef();
    this._els.toolName.textContent = t.name;
  }

  _showToast(text, kind = 'common') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    this._els.toast.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  showTutorial(text, ms = 6000) {
    this._els.tutorial.textContent = text;
    this._els.tutorial.classList.remove('hidden');
    clearTimeout(this._tutT);
    this._tutT = setTimeout(() => this._els.tutorial.classList.add('hidden'), ms);
  }
  hideTutorial() { this._els.tutorial.classList.add('hidden'); }

  openModal(title, html) {
    this._els.modalTitle.textContent = title;
    this._els.modalBody.innerHTML = html;
    this._els.overlay.classList.remove('hidden');
    document.getElementById('controls').classList.add('hidden');
  }
  closeModal() {
    this._openPanel = null;
    this._els.overlay.classList.add('hidden');
    document.getElementById('controls').classList.remove('hidden');
  }

  /* ---------- Panels ---------- */
  openInventory() {
    this._openPanel = 'inventory';
    const inv = this.state.inventory;
    const items = Object.keys(inv).filter(id => ITEMS[id]);
    items.sort((a, b) => ITEMS[b].value - ITEMS[a].value);

    let html = `<div class="tabs">
      <div class="tab active">All</div>
    </div>`;

    if (items.length === 0) {
      html += `<p style="opacity:.7;padding:20px 0;text-align:center">Your inventory is empty.<br>Go remove some hay.</p>`;
    } else {
      for (const id of items) {
        const def = ITEMS[id];
        const q = inv[id];
        const r = RARITY[def.rarity];
        html += `<div class="item-row">
          <div>
            <div class="name ${'rarity-'+def.rarity}">${def.icon||''} ${def.name}</div>
            <div class="desc">${def.desc} · <span class="rarity-${def.rarity}">${r.name}</span></div>
          </div>
          <div style="text-align:right">
            <div class="qty">×${q}</div>
            <div class="val">$${def.value} ea</div>
          </div>
        </div>`;
      }
    }
    this.openModal('Inventory', html);
  }

  openMissions() {
    this._openPanel = 'missions';
    let html = '';
    for (const m of MISSIONS) {
      const st = this.state.missions[m.id] || { progress: 0, done: false };
      const pct = Math.min(100, Math.floor((st.progress / m.amount) * 100));
      html += `<div class="mission-row ${st.done ? 'done' : ''}">
        <div class="title">${m.title}</div>
        <div class="progress">${m.desc}</div>
        <div class="progress">${st.progress} / ${m.amount} (${pct}%)</div>
        <div class="progress">Reward: $${m.reward.money} · ${m.reward.xp} XP</div>
      </div>`;
    }
    this.openModal('Missions', html);
  }

  openShop() {
    this._openPanel = 'shop';
    let html = `<p style="opacity:.75;margin-bottom:10px;font-size:13px">Buy tools to search faster and carry more hay.</p>`;
    html += `<div class="tabs"><div class="tab active">Tools</div></div>`;
    for (const id of Object.keys(TOOLS)) {
      const t = TOOLS[id];
      const owned = this.state.ownedTools.includes(id);
      const canBuy = !owned && this.state.money >= t.price;
      html += `<div class="item-row">
        <div>
          <div class="name">${t.icon||''} ${t.name}${owned ? ' ✓' : ''}</div>
          <div class="desc">${t.desc}</div>
          <div class="desc">Speed ×${t.speed} · Capacity ${t.capacity}</div>
        </div>
        <div style="text-align:right">
          <div class="val">$${t.price}</div>
          ${owned
            ? `<button class="item-btn" data-equip="${id}">Equip</button>`
            : `<button class="item-btn" data-buy="${id}" ${canBuy?'':'disabled'}>Buy</button>`}
        </div>
      </div>`;
    }
    this.openModal('Shop', html);

    // Wire buttons
    this._els.modalBody.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = this.economy.buyTool(btn.dataset.buy);
        if (r.ok) this._showToast('Purchased!', 'uncommon');
        else this._showToast(r.reason, 'common');
        this.openShop();
      });
    });
    this._els.modalBody.querySelectorAll('[data-equip]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.equipTool(btn.dataset.equip);
        this._showToast(`Equipped ${TOOLS[btn.dataset.equip].name}`, 'common');
        this.openShop();
      });
    });
  }

  openSell() {
    this._openPanel = 'sell';
    const inv = this.state.inventory;
    const items = Object.keys(inv).filter(id => ITEMS[id] && ITEMS[id].category !== 'tool');
    if (items.length === 0) {
      this.openModal('Selling Area', `<p style="text-align:center;opacity:.7;padding:20px 0">Nothing to sell. Go collect some hay!</p>`);
      return;
    }
    let html = `<p style="opacity:.75;margin-bottom:10px;font-size:13px">Sell items for money.</p>`;
    html += `<div style="display:flex;gap:8px;margin-bottom:10px">
      <button class="item-btn sell" data-sell-all="resource" style="flex:1">Sell All Resources</button>
      <button class="item-btn sell" data-sell-all="rare" style="flex:1">Sell All Rare</button>
    </div>`;
    for (const id of items) {
      const def = ITEMS[id];
      const q = inv[id];
      const r = RARITY[def.rarity];
      html += `<div class="item-row">
        <div>
          <div class="name rarity-${def.rarity}">${def.icon||''} ${def.name}</div>
          <div class="desc">$${def.value} × ${q} = <b>$${def.value * q}</b></div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="item-btn sell" data-sell-1="${id}">Sell 1</button>
          <button class="item-btn sell" data-sell-all="${id}">Sell All</button>
        </div>
      </div>`;
    }
    this.openModal('Selling Area', html);

    this._els.modalBody.querySelectorAll('[data-sell-1]').forEach(b => {
      b.addEventListener('click', () => {
        const r = this.economy.sellItem(b.dataset.sell1, 1);
        if (r.ok) this._showToast(`+$${r.price}`, 'uncommon');
        this.openSell();
      });
    });
    this._els.modalBody.querySelectorAll('[data-sell-all]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.sellAll;
        if (id === 'resource' || id === 'rare') {
          const r = this.economy.sellAllOfCategory(id);
          if (r.total > 0) this._showToast(`Sold ${r.count} items for $${r.total}`, 'uncommon');
          else this._showToast('Nothing to sell in that category', 'common');
        } else {
          const have = this.state.itemCount(id);
          if (have <= 0) return;
          const r = this.economy.sellItem(id, have);
          if (r.ok) this._showToast(`+$${r.price}`, 'uncommon');
        }
        this.openSell();
      });
    });
  }

  openSettings() {
    this._openPanel = 'settings';
    const html = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <button class="item-btn" id="set-save">💾 Manual Save</button>
        <button class="item-btn" id="set-reset" style="background:rgba(200,60,60,0.5)">🗑 Reset Save (Danger)</button>
        <div style="opacity:.7;font-size:12px;margin-top:8px">
          <p>Auto-save every 15 seconds.</p>
          <p>Save uses IndexedDB with LocalStorage fallback.</p>
          <p>HAYSTACK v0.1 — Phase 1</p>
        </div>
      </div>
    `;
    this.openModal('Settings', html);
    document.getElementById('set-save').addEventListener('click', async () => {
      await this.save.save();
      this._showToast('Saved', 'uncommon');
    });
    document.getElementById('set-reset').addEventListener('click', async () => {
      if (!confirm('Erase your save and reset the game?')) return;
      await this.save.wipe();
      location.reload();
    });
  }
}