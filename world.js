import * as THREE from 'three';
import { randRange } from './core.js';

/* ---------- HayPile: InstancedMesh-based removable hay ---------- */
export class HayPile {
  constructor(scene, cx, cy, cz, count, radius) {
    this.scene = scene;
    this.count = count;
    this.radius = radius;
    this.center = new THREE.Vector3(cx, cy, cz);
    this.instances = [];
    this._dirty = true;

    for (let i = 0; i < count; i++) {
      const r = Math.cbrt(Math.random()) * radius;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      const px = Math.cos(theta) * Math.cos(phi) * r;
      const pz = Math.sin(theta) * Math.cos(phi) * r;
      const py = Math.sin(phi) * r * 0.85;
      this.instances.push({
        pos: new THREE.Vector3(cx + px, cy + 0.15 + py, cz + pz),
        rot: new THREE.Euler(randRange(-0.6, 0.6), Math.random() * Math.PI * 2, randRange(-0.6, 0.6)),
        scale: 0.7 + Math.random() * 0.9,
        alive: true
      });
    }

    const geo = new THREE.BoxGeometry(0.5, 0.08, 0.14);
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9b64a, roughness: 0.95, metalness: 0.0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.isHay = true;
    this.mesh.userData.pile = this;
    this.mesh.frustumCulled = false; // keep instances safe
    scene.add(this.mesh);

    this._writeAll();
  }

  _writeAll() {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      const inst = this.instances[i];
      if (!inst.alive) { m.makeScale(0, 0, 0); }
      else {
        q.setFromEuler(inst.rot);
        s.setScalar(inst.scale);
        m.compose(inst.pos, q, s);
      }
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _writeOne(i) {
    const inst = this.instances[i];
    const m = new THREE.Matrix4();
    if (!inst.alive) m.makeScale(0, 0, 0);
    else {
      const q = new THREE.Quaternion().setFromEuler(inst.rot);
      m.compose(inst.pos, q, new THREE.Vector3().setScalar(inst.scale));
    }
    this.mesh.setMatrixAt(i, m);
    this._dirty = true;
  }

  flush() {
    if (this._dirty) { this.mesh.instanceMatrix.needsUpdate = true; this._dirty = false; }
  }

  removeNear(point, n, radius = 1.4) {
    const near = [];
    const r2 = radius * radius;
    for (let i = 0; i < this.count; i++) {
      const inst = this.instances[i];
      if (!inst.alive) continue;
      const d2 = inst.pos.distanceToSquared(point);
      if (d2 < r2) near.push([i, d2]);
    }
    near.sort((a, b) => a[1] - b[1]);
    const take = Math.min(n, near.length);
    for (let k = 0; k < take; k++) {
      const idx = near[k][0];
      this.instances[idx].alive = false;
      this._writeOne(idx);
    }
    return take;
  }

  aliveCount() {
    let n = 0;
    for (const i of this.instances) if (i.alive) n++;
    return n;
  }

  serialize() {
    return {
      center: this.center.toArray(),
      count: this.count,
      radius: this.radius,
      alive: this.instances.map(i => i.alive ? 1 : 0)
    };
  }

  restore(state) {
    if (!state) return;
    if (state.alive && state.alive.length === this.count) {
      for (let i = 0; i < this.count; i++) this.instances[i].alive = !!state.alive[i];
      this._writeAll();
    }
  }
}

/* ---------- World ---------- */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.hayPiles = [];
    this.buildings = [];  // { box: Box3, name, kind }
    this.shopPad = new THREE.Vector3(16, 0, 8);
    this.sellPad = new THREE.Vector3(10, 0, 12);
    this.spawnPoint = new THREE.Vector3(0, 1.65, 14);
    this._build();
  }

  _build() {
    const scene = this.scene;

    scene.background = new THREE.Color(0x9fd3e8);
    scene.fog = new THREE.Fog(0x9fd3e8, 55, 150);

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x506030, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0c8, 1.15);
    sun.position.set(35, 45, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
    sun.shadow.camera.far = 130;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // Ground
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x6c8a3a, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Dirt patches
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x8a6b42, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.PlaneGeometry(3 + Math.random() * 6, 2 + Math.random() * 5);
      const d = new THREE.Mesh(g, dirtMat);
      d.rotation.x = -Math.PI / 2;
      d.rotation.z = Math.random() * Math.PI;
      d.position.set(randRange(-60, 60), 0.01, randRange(-60, 60));
      d.receiveShadow = true;
      scene.add(d);
    }

    // Buildings
    this._makeBarn(-22, 0, -16);
    this._makeWorkshop(22, 0, -16);
    this._makeShop(16, 0, 6);

    // Pads markers
    this._makePad(this.shopPad.x, this.shopPad.z, 0x5a8ce8, 'Shop');
    this._makePad(this.sellPad.x, this.sellPad.z, 0xe8a85a, 'Sell');

    // Fence
    this._makeFence(70);

    // Trees
    for (let i = 0; i < 26; i++) {
      const x = randRange(-80, 80);
      const z = randRange(-80, 80);
      if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;
      this._makeTree(x, 0, z);
    }

    // Hay piles
    this.hayPiles.push(new HayPile(scene, -7, 0, -3, 1600, 3.0));
    this.hayPiles.push(new HayPile(scene,  6, 0, -6, 2000, 3.6));
    this.hayPiles.push(new HayPile(scene, -1, 0,  5, 1400, 2.6));
  }

  _makePad(x, z, color, label) {
    const geo = new THREE.RingGeometry(2.2, 2.7, 32);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, z);
    this.scene.add(ring);
    // Post / sign
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a4a2a })
    );
    post.position.set(x + 2.8, 1, z);
    post.castShadow = true;
    this.scene.add(post);
  }

  _makeBarn(x, y, z) {
    const g = new THREE.Group();
    const w = 11, h = 6, d = 9;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x8a2f2f, roughness: 0.9 })
    );
    wall.position.y = h / 2; wall.castShadow = true; wall.receiveShadow = true;
    g.add(wall);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(w * 0.85, 3.2, 4),
      new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.85 })
    );
    roof.position.y = h + 1.6; roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 3.6),
      new THREE.MeshStandardMaterial({ color: 0x2a1810 })
    );
    door.position.set(0, 1.8, d / 2 + 0.01);
    g.add(door);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.buildings.push({ box: new THREE.Box3().setFromObject(wall), name: 'barn', kind: 'solid' });
  }

  _makeWorkshop(x, y, z) {
    const g = new THREE.Group();
    const w = 9, h = 4.5, d = 8;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x6b6b78, roughness: 0.8, metalness: 0.15 })
    );
    wall.position.y = h / 2; wall.castShadow = true; wall.receiveShadow = true;
    g.add(wall);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2f2f38, roughness: 0.7, metalness: 0.3 })
    );
    roof.position.y = h + 0.15; roof.castShadow = true;
    g.add(roof);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.buildings.push({ box: new THREE.Box3().setFromObject(wall), name: 'workshop', kind: 'solid' });
  }

  _makeShop(x, y, z) {
    const g = new THREE.Group();
    const w = 7, h = 3.6, d = 5;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0xcf9f6a, roughness: 0.9 })
    );
    wall.position.y = h / 2; wall.castShadow = true; wall.receiveShadow = true;
    g.add(wall);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(w * 0.8, 2, 4),
      new THREE.MeshStandardMaterial({ color: 0x6a3f24, roughness: 0.9 })
    );
    roof.position.y = h + 1; roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    // Awning
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(w + 1.5, 0.15, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xb63a3a, roughness: 0.9 })
    );
    awning.position.set(0, h - 0.2, d / 2 + 0.8);
    awning.rotation.x = -0.15;
    awning.castShadow = true;
    g.add(awning);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.buildings.push({ box: new THREE.Box3().setFromObject(wall), name: 'shop', kind: 'solid' });
  }

  _makeFence(radius) {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6);
    const count = Math.floor((2 * Math.PI * radius) / 3);
    const inst = new THREE.InstancedMesh(postGeo, postMat, count);
    inst.castShadow = true;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      m.makeTranslation(x, 0.7, z);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.scene.add(inst);
  }

  _makeTree(x, y, z) {
    const g = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4828, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6a2e, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 3.5, 7), trunkMat);
    trunk.position.y = 1.75; trunk.castShadow = true;
    g.add(trunk);
    const scale = 0.8 + Math.random() * 0.7;
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), leafMat);
      c.position.set(randRange(-0.6, 0.6), 3.6 + i * 0.5, randRange(-0.6, 0.6));
      c.scale.setScalar(1 - i * 0.15);
      c.castShadow = true;
      g.add(c);
    }
    g.scale.setScalar(scale);
    g.position.set(x, y, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(g);
  }

  /* ---------- Serialization ---------- */
  serialize() {
    return { piles: this.hayPiles.map(p => p.serialize()) };
  }
  restore(data) {
    if (!data || !data.piles) return;
    for (let i = 0; i < Math.min(data.piles.length, this.hayPiles.length); i++) {
      this.hayPiles[i].restore(data.piles[i]);
    }
  }

  update() {
    for (const p of this.hayPiles) p.flush();
  }
}