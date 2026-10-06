import * as THREE from 'three';
import { EventBus, AudioSystem } from './core.js';
import { World } from './world.js';
import { Player } from './player.js';
import { GameState, SearchSystem, EconomySystem, SaveSystem } from './systems.js';
import { UIManager } from './ui.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 400);

    this.bus = new EventBus();
    this.audio = new AudioSystem();
    this.clock = new THREE.Clock();

    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.world, this.audio);
    this.state = new GameState(this.bus);
    this.search = new SearchSystem(this.state, this.bus, this.audio, this.world, this.player, this.camera);
    this.economy = new EconomySystem(this.state, this.bus, this.audio);
    this.save = new SaveSystem(this.state, this.world, this.player, this.audio, this.bus);
    this.ui = new UIManager(this.bus, this.state, this.economy, this.save);

    // Forward state events into missions
    this.bus.on('item_collected', (d) => this.state.handleEvent('item_collected', d));
    this.bus.on('item_found', (d) => this.state.handleEvent('item_found', d));
    this.bus.on('money_earned', () => this.state.handleEvent('money_earned', {}));
    this.bus.on('tool_bought', () => this.state.handleEvent('tool_bought', {}));
    this.bus.on('item_sold', (d) => this.state.handleEvent('item_sold', d));

    // React on rare finds (audio + shake)
    this.bus.on('rareFound', ({ id }) => {
      this.audio.play('find_rare');
      this.player.addShake(0.25);
    });

    // Interact button
    const interactBtn = document.getElementById('btn-interact');
    interactBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.search.tryAction();
    });

    // Resize
    window.addEventListener('resize', () => this._onResize());
    this._onResize();

    // Start overlay
    document.getElementById('start-btn').addEventListener('click', async () => {
      this.audio.init();
      this.audio.resume();
      document.getElementById('start-overlay').style.display = 'none';
      await this._tryLoad();
      this.ui.showTutorial('There is a lost needle hidden inside one of these hay piles. Walk over and press USE to remove hay.', 7000);
    });

    // Pause world physics when tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save.save();
    });
    window.addEventListener('beforeunload', () => this.save.save());

    // PWA service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch((e) => console.warn('SW', e));
      });
    }

    this._running = false;
    this.renderer.setAnimationLoop(() => this._frame());
  }

  async _tryLoad() {
    const ok = await this.save.load();
    if (ok) {
      this.ui.showTutorial('Welcome back!', 2500);
    }
    this._running = true;
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this._running) {
      this.player.update(dt);
      this.world.update();
      this.search.updateProximity();
      this.save.tick(dt);
      this.state.playTime += dt;
    }
    this.renderer.render(this.scene, this.camera);
  }
}

// Bootstrap
window.addEventListener('load', () => {
  try {
    window.game = new Game();
  } catch (e) {
    console.error('Failed to start game:', e);
    alert('Failed to start game. See console.');
  }
});