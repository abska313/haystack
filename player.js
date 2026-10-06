import * as THREE from 'three';
import { clamp, lerp } from './core.js';

export class Player {
  constructor(camera, world, audio) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;

    this.position = world.spawnPoint.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI;      // face toward hay initially
    this.pitch = 0;
    this.onGround = true;

    this.standHeight = 1.65;
    this.crouchHeight = 1.0;
    this.currentHeight = this.standHeight;

    this.walkSpeed = 4.2;
    this.sprintSpeed = 7.4;
    this.crouchSpeed = 2.2;
    this.jumpSpeed = 6.2;
    this.gravity = 20;

    this.sprinting = false;
    this.crouching = false;

    this.moveInput = { x: 0, y: 0 };

    this.bob = 0;
    this.bobAmount = 0;
    this.shake = 0;

    this._stepTimer = 0;

    this._touchId = null;
    this._joyId = null;

    this._bindTouch();
    this._bindKeyboard();
    this._bindButtons();
  }

  /* ---------------- Input ---------------- */
  _bindTouch() {
    const cam = document.getElementById('camera-area');
    const joyArea = document.getElementById('joystick-area');
    const knob = document.getElementById('joystick-knob');
    const base = document.getElementById('joystick-base');
    const rect = () => base.getBoundingClientRect();

    let jStart = null;
    let cStart = null;

    const sens = 0.0045;

    joyArea.addEventListener('pointerdown', (e) => {
      if (this._joyId !== null) return;
      this._joyId = e.pointerId;
      joyArea.setPointerCapture(e.pointerId);
      const r = rect();
      jStart = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      // If tap far from base, center joystick there? keep simple: use base center
      this._moveJoystick(e, jStart, knob);
    });

    joyArea.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._joyId || !jStart) return;
      this._moveJoystick(e, jStart, knob);
    });

    const endJoy = (e) => {
      if (e.pointerId !== this._joyId) return;
      this._joyId = null; jStart = null;
      this.moveInput.x = 0; this.moveInput.y = 0;
      knob.style.transform = `translate(0px,0px)`;
    };
    joyArea.addEventListener('pointerup', endJoy);
    joyArea.addEventListener('pointercancel', endJoy);

    cam.addEventListener('pointerdown', (e) => {
      if (this._touchId !== null) return;
      this._touchId = e.pointerId;
      cam.setPointerCapture(e.pointerId);
      cStart = { x: e.clientX, y: e.clientY };
    });
    cam.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._touchId || !cStart) return;
      const dx = e.clientX - cStart.x;
      const dy = e.clientY - cStart.y;
      cStart.x = e.clientX; cStart.y = e.clientY;
      this.yaw -= dx * sens;
      this.pitch = clamp(this.pitch - dy * sens, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1);
    });
    const endCam = (e) => {
      if (e.pointerId !== this._touchId) return;
      this._touchId = null; cStart = null;
    };
    cam.addEventListener('pointerup', endCam);
    cam.addEventListener('pointercancel', endCam);

    // Prevent pinch-zoom on the whole app
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  }

  _moveJoystick(e, start, knob) {
    const r = document.getElementById('joystick-base').getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = r.width / 2 - 12;
    const mag = Math.hypot(dx, dy);
    if (mag > max) { dx = (dx / mag) * max; dy = (dy / mag) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.moveInput.x = dx / max;
    this.moveInput.y = dy / max;
  }

  _bindKeyboard() {
    const keys = {};
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'Space') this.tryJump();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    // Map keyboard to moveInput in update()
    this._keys = keys;
  }

  _bindButtons() {
    const jump = document.getElementById('btn-jump');
    const sprint = document.getElementById('btn-sprint');
    const crouch = document.getElementById('btn-crouch');

    jump.addEventListener('pointerdown', (e) => { e.preventDefault(); this.tryJump(); });

    const startSprint = (e) => { e.preventDefault(); this.sprinting = true; };
    const endSprint = (e) => { e.preventDefault(); this.sprinting = false; };
    sprint.addEventListener('pointerdown', startSprint);
    sprint.addEventListener('pointerup', endSprint);
    sprint.addEventListener('pointercancel', endSprint);
    sprint.addEventListener('pointerleave', endSprint);

    const toggleCrouch = (e) => {
      e.preventDefault();
      this.crouching = !this.crouching;
      crouch.classList.toggle('primary', this.crouching);
    };
    crouch.addEventListener('pointerdown', toggleCrouch);
  }

  tryJump() {
    if (!this.onGround) return;
    this.velocity.y = this.jumpSpeed;
    this.onGround = false;
    this.audio.play('jump');
  }

  /* ---------------- Update ---------------- */
  update(dt) {
    // Keyboard adds to moveInput if no touch active
    if (this._keys) {
      let kx = 0, kz = 0;
      if (this._keys['KeyW'] || this._keys['ArrowUp']) kz -= 1;
      if (this._keys['KeyS'] || this._keys['ArrowDown']) kz += 1;
      if (this._keys['KeyA'] || this._keys['ArrowLeft']) kx -= 1;
      if (this._keys['KeyD'] || this._keys['ArrowRight']) kx += 1;
      if (kx || kz) { this.moveInput.x = kx; this.moveInput.y = kz; }
      if (this._keys['ShiftLeft'] || this._keys['ShiftRight']) this.sprinting = true;
      else if (this._joystickActive !== true && !this._touchId) { /* keep state */ }
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const mx = this.moveInput.x;
    const my = this.moveInput.y;
    const moving = Math.hypot(mx, my) > 0.08;

    let speed = this.walkSpeed;
    if (this.sprinting && moving && !this.crouching) speed = this.sprintSpeed;
    if (this.crouching) speed = this.crouchSpeed;

    // Horizontal velocity
    const targetVx = (forward.x * -my + right.x * mx) * speed;
    const targetVz = (forward.z * -my + right.z * mx) * speed;

    // Smooth
    this.velocity.x = lerp(this.velocity.x, targetVx, 1 - Math.pow(0.0001, dt));
    this.velocity.z = lerp(this.velocity.z, targetVz, 1 - Math.pow(0.0001, dt));

    // Vertical
    this.velocity.y -= this.gravity * dt;

    // Height interpolation (crouch)
    const targetHeight = this.crouching ? this.crouchHeight : this.standHeight;
    this.currentHeight = lerp(this.currentHeight, targetHeight, 1 - Math.pow(0.001, dt));

    // Attempt move
    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    this._tryMove(dx, dz);

    // Vertical move
    this.position.y += this.velocity.y * dt;
    if (this.position.y < this.currentHeight) {
      if (!this.onGround) this.audio.play('land');
      this.position.y = this.currentHeight;
      this.velocity.y = 0;
      this.onGround = true;
    }

    // Head bob + footsteps
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontalSpeed > 0.5 && this.onGround) {
      this.bob += dt * (7 + horizontalSpeed * 0.9);
      this.bobAmount = Math.min(0.055, this.bobAmount + dt * 0.5);
      this._stepTimer -= dt * horizontalSpeed;
      if (this._stepTimer <= 0) {
        this._stepTimer = 1.2;
        if (this.audio) this.audio.play('step');
      }
    } else {
      this.bobAmount = Math.max(0, this.bobAmount - dt * 1.2);
    }
    const bobY = Math.sin(this.bob * 2) * this.bobAmount;
    const bobX = Math.cos(this.bob) * this.bobAmount * 0.6;

    // Camera shake decay
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
    const shakeY = (Math.random() - 0.5) * this.shake * 0.2;
    const shakeX = (Math.random() - 0.5) * this.shake * 0.2;

    // Apply to camera
    this.camera.position.set(
      this.position.x + bobX * 0.06,
      this.position.y + bobY,
      this.position.z
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + shakeX;
    this.camera.rotation.x = this.pitch + shakeY;
    this.camera.rotation.z = bobX * 0.25;
  }

  _tryMove(dx, dz) {
    const testX = this.position.x + dx;
    const testZ = this.position.z + dz;
    // Simple AABB collision vs buildings
    const r = 0.45;
    const box = new THREE.Box3(
      new THREE.Vector3(testX - r, 0, testZ - r),
      new THREE.Vector3(testX + r, 2, testZ + r)
    );
    let blocked = false;
    for (const b of this.world.buildings) {
      if (b.box.intersectsBox(box)) { blocked = true; break; }
    }
    if (!blocked) { this.position.x = testX; this.position.z = testZ; }
    else {
      // Try X only
      const bx = new THREE.Box3(
        new THREE.Vector3(testX - r, 0, this.position.z - r),
        new THREE.Vector3(testX + r, 2, this.position.z + r)
      );
      if (!this.world.buildings.some(b => b.box.intersectsBox(bx))) this.position.x = testX;
      const bz = new THREE.Box3(
        new THREE.Vector3(this.position.x - r, 0, testZ - r),
        new THREE.Vector3(this.position.x + r, 2, testZ + r)
      );
      if (!this.world.buildings.some(b => b.box.intersectsBox(bz))) this.position.z = testZ;
    }
    // World bounds
    const R = 90;
    this.position.x = clamp(this.position.x, -R, R);
    this.position.z = clamp(this.position.z, -R, R);
  }

  getForwardVector() {
    const v = new THREE.Vector3(0, 0, -1);
    v.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return v;
  }

  getPosition() { return this.position; }
  addShake(amount) { this.shake = Math.min(1, this.shake + amount); }

  serialize() {
    return {
      position: this.position.toArray(),
      yaw: this.yaw,
      pitch: this.pitch
    };
  }
  restore(data) {
    if (!data) return;
    if (data.position) this.position.fromArray(data.position);
    if (typeof data.yaw === 'number') this.yaw = data.yaw;
    if (typeof data.pitch === 'number') this.pitch = data.pitch;
  }
}