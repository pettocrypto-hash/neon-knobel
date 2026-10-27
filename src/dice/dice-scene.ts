import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { skinById, type Skin } from '../app/cosmetics';
import { makeFaceTextures, makeGlowTexture, makeGridTexture } from './textures';

/**
 * 3D-Würfelschale. Das Ergebnis jedes Wurfs kommt vom Host; diese Szene
 * simuliert nur eine glaubwürdige Flugbahn (Abprallen, Kollisionen, Rollen)
 * und dreht die Würfel beim Liegenbleiben auf die vorgegebene Augenzahl.
 */

const N = 5;
const HALF = 0.5;
const R = 0.62; // Kollisionsradius
const GRAVITY = -34;

// Flächen der BoxGeometry: +x, -x, +y, -y, +z, -z  → Augenzahlen (Gegenseiten ergeben 7)
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
const UP = new THREE.Vector3(0, 1, 0);

function faceUpQuat(value: number): THREE.Quaternion {
  const idx = FACE_VALUES.indexOf(value);
  return new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[idx], UP);
}

type DieMode = 'rest' | 'fly' | 'settle' | 'move' | 'jump';

interface Die {
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  shadow: THREE.Mesh;
  flame: THREE.Sprite;
  value: number;
  held: boolean;
  locked: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  ang: THREE.Vector3;
  mode: DieMode;
  t: number;
  from: { p: THREE.Vector3; q: THREE.Quaternion };
  to: { p: THREE.Vector3; q: THREE.Quaternion };
  dur: number;
  highlight: number;
}

export interface DiceSceneOptions {
  quality: 'low' | 'medium' | 'high';
  reduceMotion: boolean;
  design: 'neon' | 'clean';
}

/** Farben der Markierungen je Design (gehalten, eingefroren, Auswahl, Streak, Modul). */
const MARKS = {
  neon: { held: 0xb6ff3b, locked: 0x7fd8ff, select: 0xff2bd6, streak: 0x3b8bff, pulse: 0xff2bd6 },
  clean: { held: 0x2563eb, locked: 0x0891b2, select: 0xdb2777, streak: 0xf59e0b, pulse: 0xdb2777 },
};

export class DiceScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private dice: Die[] = [];
  private geo: THREE.BufferGeometry;
  private materials: THREE.MeshStandardMaterial[] = [];
  private skin: Skin = skinById('neon');
  private cb = false;
  private floor!: THREE.Mesh;
  private holdZone!: THREE.Mesh;
  private keyLight: THREE.PointLight;
  private fillLight: THREE.PointLight;
  private streakLight: THREE.PointLight;
  private ambient: THREE.AmbientLight;
  private sun: THREE.DirectionalLight;
  private halfW = 4;
  private halfD = 2.4;
  private raf = 0;
  private last = 0;
  private ro: ResizeObserver;
  private streak = 0;
  private selectMode = false;
  private interactive = false;
  private landedCb: (() => void) | null = null;
  private impactCooldown = 0;
  private time = 0;
  private disposed = false;
  private pointerStart: { x: number; y: number; t: number } | null = null;

  onTap: (i: number) => void = () => {};
  onSwipe: () => void = () => {};
  onImpact: (strength: number) => void = () => {};

  constructor(
    private host: HTMLElement,
    private opts: DiceSceneOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.quality !== 'low', alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x06030f, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'dice-canvas';
    host.appendChild(this.canvas);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.ambient = new THREE.AmbientLight(0x6a5aff, 0.35);
    this.scene.add(this.ambient);
    this.keyLight = new THREE.PointLight(0x00f0ff, 40, 30, 1.6);
    this.keyLight.position.set(-4, 6, 3);
    this.fillLight = new THREE.PointLight(0xff2bd6, 30, 30, 1.6);
    this.fillLight.position.set(5, 5, -2);
    this.streakLight = new THREE.PointLight(0x2b7bff, 0, 14, 1.5);
    this.streakLight.position.set(0, 3, 0.5);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.9);
    this.sun.position.set(2, 10, 6);
    this.scene.add(this.keyLight, this.fillLight, this.streakLight, this.sun);

    this.geo = new RoundedBoxGeometry(1, 1, 1, opts.quality === 'low' ? 2 : 4, 0.12);
    this.buildFloor();
    this.buildMaterials();
    this.buildDice();
    this.applyLook();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.layoutRest(true);

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- Aufbau ----------

  private buildFloor() {
    const grid = makeGridTexture();
    grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
    grid.repeat.set(10, 6);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0x0a0718, roughness: 0.65, metalness: 0.3, emissive: 0xffffff, emissiveMap: grid, emissiveIntensity: 0.55 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);
    this.holdZone = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xb6ff3b, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.holdZone.rotation.x = -Math.PI / 2;
    this.holdZone.position.y = 0.005;
    this.scene.add(this.holdZone);
  }

  private buildMaterials() {
    for (const m of this.materials) {
      m.map?.dispose();
      m.emissiveMap?.dispose();
      m.dispose();
    }
    const clean = this.opts.design === 'clean';
    const tex = makeFaceTextures(this.skin, this.cb, clean);
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.materials = FACE_VALUES.map((v) => {
      const { map, emissive } = tex[v - 1];
      map.anisotropy = aniso;
      emissive.anisotropy = aniso;
      if (clean)
        return new THREE.MeshStandardMaterial({ map, roughness: 0.42, metalness: 0, envMapIntensity: 0.55 });
      return new THREE.MeshStandardMaterial({
        map,
        emissiveMap: emissive,
        emissive: 0xffffff,
        emissiveIntensity: 0.62,
        roughness: this.skin.style === 'gold' ? 0.28 : 0.18 + (1 - this.skin.glass) * 0.25,
        metalness: this.skin.style === 'gold' ? 0.85 : 0.25,
        transparent: this.skin.glass > 0.5,
        opacity: 1 - this.skin.glass * 0.14,
        envMapIntensity: 0.7,
      });
    });
    for (const d of this.dice) d.mesh.material = this.materials;
  }

  private buildDice() {
    const glow = makeGlowTexture();
    const shadowTex = makeGlowTexture('rgba(0,0,0,1)');
    for (let i = 0; i < N; i++) {
      const mesh = new THREE.Mesh(this.geo, this.materials);
      mesh.userData.index = i;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 0.84, 40),
        new THREE.MeshBasicMaterial({ color: 0xb6ff3b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.55, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.01;
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x3b8bff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.scale.set(1.9, 1.9, 1);
      this.scene.add(mesh, ring, shadow, flame);
      this.dice.push({
        mesh,
        ring,
        shadow,
        flame,
        value: i + 1,
        held: false,
        locked: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        ang: new THREE.Vector3(),
        mode: 'rest',
        t: 0,
        from: { p: new THREE.Vector3(), q: new THREE.Quaternion() },
        to: { p: new THREE.Vector3(), q: new THREE.Quaternion() },
        dur: 0,
        highlight: 0,
      });
    }
  }

  private setupComposer() {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    if (this.opts.quality !== 'high' || this.opts.design === 'clean') return;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.35, 0.86);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.quality === 'low' ? 1.25 : this.opts.quality === 'medium' ? 1.75 : 2.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(dpr);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;

    // Kamera so weit weg, dass die Schale (mind. 7.6 x 4.4) sichtbar ist.
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const needW = 8.4;
    const needD = 4.8;
    const distW = needW / 2 / Math.tan(fov / 2) / this.camera.aspect;
    const distD = needD / 2 / Math.tan(fov / 2) / 0.86;
    const dist = Math.max(distW, distD);
    const tilt = THREE.MathUtils.degToRad(24);
    this.camera.position.set(0, Math.cos(tilt) * dist, Math.sin(tilt) * dist);
    this.camera.lookAt(0, 0, 0.15);
    this.camera.updateProjectionMatrix();

    const visH = 2 * dist * Math.tan(fov / 2);
    // Vorne (näher an der Kamera) ist der sichtbare Bereich schmaler
    this.halfW = ((visH * this.camera.aspect) / 2) * 0.86 - 0.3;
    this.halfD = (visH * 0.86) / 2 - 0.2;
    this.floor.scale.set(this.halfW * 2 + 6, this.halfD * 2 + 6, 1);
    this.holdZone.scale.set(this.halfW * 2, 1.5, 1);
    this.holdZone.position.z = -this.halfD + 0.75;
    if (this.dice.every((d) => d.mode === 'rest')) this.layoutRest(true);
  }

  // ---------- Öffentliche API ----------

  setSkin(id: string, colorblind = this.cb) {
    const s = skinById(id);
    if (s.id === this.skin.id && colorblind === this.cb) return;
    this.skin = s;
    this.cb = colorblind;
    this.buildMaterials();
    if (this.opts.design === 'clean') return;
    this.keyLight.color.set(s.edge);
    this.fillLight.color.set(s.pip);
  }

  setQuality(q: DiceSceneOptions['quality']) {
    if (q === this.opts.quality) return;
    this.opts.quality = q;
    this.setupComposer();
    this.resize();
  }

  setInteractive(on: boolean) {
    this.interactive = on;
    this.canvas.style.cursor = on ? 'pointer' : 'default';
  }

  setSelectMode(on: boolean) {
    this.selectMode = on;
  }

  setStreak(level: number) {
    this.streak = level;
  }

  /** Haltestatus/Werte ohne Wurf übernehmen (z. B. Halten, Zugwechsel, Reconnect). */
  show(values: number[], held: boolean[], locked: boolean[], instant = false) {
    this.dice.forEach((d, i) => {
      const changedValue = d.value !== values[i];
      const changedHold = d.held !== held[i];
      d.value = values[i];
      d.held = held[i];
      d.locked = locked[i];
      if (d.mode === 'fly' || d.mode === 'settle' || d.mode === 'jump') return;
      if (instant) {
        this.placeAt(d, this.restSpot(i, d.held), faceUpQuat(d.value));
        return;
      }
      if (changedHold || changedValue) {
        const q = changedValue ? this.alignedQuat(d, d.value) : d.mesh.quaternion.clone();
        const target = d.held ? this.restSpot(i, true) : changedHold ? this.restSpot(i, false) : d.pos.clone();
        this.moveTo(d, target, q, changedValue ? 0.45 : 0.28);
      }
    });
  }

  /** Neue Würfelwerte animiert werfen. `rolled[i]` = dieser Würfel wurde geworfen. */
  roll(values: number[], rolled: boolean[], onLanded?: () => void) {
    this.landedCb = onLanded ?? null;
    const fast = this.opts.reduceMotion;
    let any = false;
    this.dice.forEach((d, i) => {
      d.value = values[i];
      if (!rolled[i]) return;
      any = true;
      d.held = false;
      if (fast) {
        this.moveTo(d, this.restSpot(i, false), faceUpQuat(d.value), 0.35);
        return;
      }
      d.mode = 'fly';
      d.t = 0;
      // Start rechts unten außerhalb, Wurf schräg in die Schale
      d.pos.set(this.halfW - 0.4 - Math.random() * 1.6, 1.2 + Math.random() * 1.4, this.halfD - 0.3 - Math.random() * 1.2);
      d.vel.set(-(3.5 + Math.random() * 5), 2 + Math.random() * 3, -(1 + Math.random() * 3.5));
      d.ang.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30);
      d.mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    });
    // Leicht versetzt starten, damit sie nicht exakt übereinander liegen
    this.dice.filter((d) => d.mode === 'fly').forEach((d, k) => (d.pos.z -= k * 0.35));
    if (!any) this.finishLanding();
  }

  /** Alle Würfel ordentlich in ihre Ruheposition schieben (Zugwechsel). */
  gather() {
    this.dice.forEach((d, i) => {
      if (d.mode === 'fly' || d.mode === 'settle') return;
      this.moveTo(d, this.restSpot(i, d.held), this.alignedQuat(d, d.value), 0.4);
    });
  }

  /** Kurzer Ausschlag eines Würfels (Modul-Effekt). */
  pulse(i: number) {
    const d = this.dice[i];
    if (!d) return;
    d.highlight = 1;
    if (d.mode === 'rest') {
      d.mode = 'jump';
      d.t = 0;
      d.dur = 0.55;
      d.from.p.copy(d.pos);
      d.from.q.copy(d.mesh.quaternion);
      d.to.p.copy(d.pos);
      d.to.q.copy(this.alignedQuat(d, d.value));
    }
  }

  /** Alle Würfel springen und drehen sich (5 Gleiche). */
  celebrate() {
    this.dice.forEach((d, i) => {
      if (d.mode !== 'rest') return;
      d.mode = 'jump';
      d.t = -i * 0.06;
      d.dur = 1.1;
      d.from.p.copy(d.pos);
      d.from.q.copy(d.mesh.quaternion);
      d.to.p.copy(d.pos);
      d.to.q.copy(this.alignedQuat(d, d.value));
      d.highlight = 1;
    });
  }

  /** Neon (dunkel, leuchtend) oder klar (heller Tisch, weiches Licht). */
  setDesign(design: DiceSceneOptions['design']) {
    if (design === this.opts.design) return;
    this.opts.design = design;
    this.buildMaterials();
    this.applyLook();
  }

  private applyLook() {
    const clean = this.opts.design === 'clean';
    this.renderer.setClearColor(clean ? 0xe9e4d8 : 0x06030f, 1);
    this.renderer.toneMappingExposure = clean ? 1.0 : 0.92;
    const fm = this.floor.material as THREE.MeshStandardMaterial;
    fm.color.set(clean ? 0xe9e4d8 : 0x0a0718);
    fm.roughness = clean ? 0.95 : 0.65;
    fm.metalness = clean ? 0 : 0.3;
    fm.emissiveIntensity = clean ? 0 : 0.55;
    const hz = this.holdZone.material as THREE.MeshBasicMaterial;
    hz.color.set(clean ? 0x2563eb : 0xb6ff3b);
    hz.opacity = clean ? 0.07 : 0.05;
    hz.blending = clean ? THREE.NormalBlending : THREE.AdditiveBlending;
    hz.needsUpdate = true;
    for (const d of this.dice) {
      for (const m of [d.ring.material as THREE.MeshBasicMaterial, d.flame.material as THREE.SpriteMaterial]) {
        m.blending = clean ? THREE.NormalBlending : THREE.AdditiveBlending;
        m.needsUpdate = true;
      }
      (d.shadow.material as THREE.MeshBasicMaterial).color.set(clean ? 0x6b5a3e : 0x000000);
    }
    this.ambient.color.set(clean ? 0xffffff : 0x6a5aff);
    this.ambient.intensity = clean ? 1.1 : 0.35;
    this.sun.intensity = clean ? 1.6 : 0.9;
    this.keyLight.color.set(clean ? 0xfff4e0 : this.skin.edge);
    this.fillLight.color.set(clean ? 0xe0ecff : this.skin.pip);
    this.keyLight.intensity = clean ? 14 : 40;
    this.fillLight.intensity = clean ? 10 : 30;
    this.setupComposer();
    this.resize();
  }

  setLights(a: string, b: string) {
    if (this.opts.design === 'clean') return;
    this.keyLight.color.set(a);
    this.fillLight.color.set(b);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.composer?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ---------- Layout ----------

  private restSpot(i: number, held: boolean): THREE.Vector3 {
    const spacing = Math.min(1.5, (this.halfW * 2 - 0.4) / N);
    const x = (i - (N - 1) / 2) * spacing;
    const z = held ? -this.halfD + 0.75 : Math.min(this.halfD - 0.8, 0.9);
    return new THREE.Vector3(x, HALF, z);
  }

  private layoutRest(instant: boolean) {
    this.dice.forEach((d, i) => {
      if (instant) this.placeAt(d, this.restSpot(i, d.held), faceUpQuat(d.value));
    });
  }

  private placeAt(d: Die, p: THREE.Vector3, q: THREE.Quaternion) {
    d.mode = 'rest';
    d.pos.copy(p);
    d.vel.set(0, 0, 0);
    d.mesh.quaternion.copy(q);
  }

  private moveTo(d: Die, p: THREE.Vector3, q: THREE.Quaternion, dur: number) {
    d.mode = 'move';
    d.t = 0;
    d.dur = dur;
    d.from.p.copy(d.pos);
    d.from.q.copy(d.mesh.quaternion);
    d.to.p.copy(p);
    d.to.q.copy(q);
  }

  /** Ziel-Orientierung mit Augenzahl oben und möglichst wenig Drehung gegenüber jetzt. */
  private alignedQuat(d: Die, value: number): THREE.Quaternion {
    const base = faceUpQuat(value);
    const cur = d.mesh.quaternion;
    let best = base.clone();
    let bestDot = -1;
    const yaw = new THREE.Quaternion();
    for (let k = 0; k < 24; k++) {
      yaw.setFromAxisAngle(UP, (k / 24) * Math.PI * 2);
      const cand = yaw.clone().multiply(base);
      const dot = Math.abs(cand.dot(cur));
      if (dot > bestDot) {
        bestDot = dot;
        best = cand;
      }
    }
    return best;
  }

  // ---------- Simulation ----------

  private step(dt: number) {
    const minZ = -this.halfD + 1.75; // freie Würfel bleiben vor der Halte-Zone
    const maxZ = this.halfD - 0.55;
    const maxX = this.halfW - 0.55;
    const flying = this.dice.filter((d) => d.mode === 'fly');
    for (const d of flying) {
      d.t += dt;
      d.vel.y += GRAVITY * dt;
      d.pos.addScaledVector(d.vel, dt);
      const onFloor = d.pos.y <= HALF + 0.001;
      if (d.pos.y < HALF) {
        d.pos.y = HALF;
        if (d.vel.y < -1.5) {
          this.impact(Math.min(1, -d.vel.y / 12));
          d.vel.y = -d.vel.y * 0.32;
          d.ang.multiplyScalar(0.75);
          d.ang.x += (Math.random() - 0.5) * 8;
          d.ang.z += (Math.random() - 0.5) * 8;
        } else d.vel.y = 0;
      }
      if (onFloor) {
        const f = Math.pow(0.06, dt);
        d.vel.x *= f;
        d.vel.z *= f;
        // Rollen: Winkelgeschwindigkeit folgt der Bewegung
        d.ang.lerp(new THREE.Vector3(d.vel.z / HALF, d.ang.y * 0.9, -d.vel.x / HALF), 1 - Math.pow(0.02, dt));
      }
      // Wände
      if (d.pos.x < -maxX) {
        d.pos.x = -maxX;
        d.vel.x = Math.abs(d.vel.x) * 0.55;
        this.impact(Math.min(1, Math.abs(d.vel.x) / 8));
      } else if (d.pos.x > maxX && d.vel.x > 0) {
        d.pos.x = maxX;
        d.vel.x = -Math.abs(d.vel.x) * 0.55;
      }
      if (d.pos.z < minZ) {
        d.pos.z = minZ;
        d.vel.z = Math.abs(d.vel.z) * 0.55;
        this.impact(Math.min(1, Math.abs(d.vel.z) / 8));
      } else if (d.pos.z > maxZ && d.vel.z > 0) {
        d.pos.z = maxZ;
        d.vel.z = -Math.abs(d.vel.z) * 0.55;
      }
      // Drehung integrieren
      const w = d.ang.length();
      if (w > 1e-4) {
        const dq = new THREE.Quaternion().setFromAxisAngle(d.ang.clone().divideScalar(w), w * dt);
        d.mesh.quaternion.premultiply(dq).normalize();
      }
    }
    // Kollisionen zwischen allen Würfeln (fliegende stoßen auch liegende an)
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        const a = this.dice[i];
        const b = this.dice[j];
        if (a.mode !== 'fly' && b.mode !== 'fly') continue;
        if (a.held || b.held) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= R * 2 || dist < 1e-5 || Math.abs(a.pos.y - b.pos.y) > 1) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = R * 2 - dist;
        const aMov = a.mode === 'fly' ? 1 : 0;
        const bMov = b.mode === 'fly' ? 1 : 0;
        const tot = aMov + bMov || 1;
        a.pos.x -= (nx * overlap * aMov) / tot;
        a.pos.z -= (nz * overlap * aMov) / tot;
        b.pos.x += (nx * overlap * bMov) / tot;
        b.pos.z += (nz * overlap * bMov) / tot;
        const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rv < 0) {
          const imp = -rv * 0.9;
          if (aMov) {
            a.vel.x -= nx * imp * (bMov ? 0.5 : 1);
            a.vel.z -= nz * imp * (bMov ? 0.5 : 1);
          }
          if (bMov) {
            b.vel.x += nx * imp * (aMov ? 0.5 : 1);
            b.vel.z += nz * imp * (aMov ? 0.5 : 1);
          }
          a.ang.y += (Math.random() - 0.5) * 10;
          b.ang.y += (Math.random() - 0.5) * 10;
          this.impact(Math.min(1, imp / 6));
        }
      }
    // In die Ruhelage überblenden
    for (const d of flying) {
      const slow = d.vel.lengthSq() < 0.5 && d.pos.y < HALF + 0.05;
      if ((d.t > 0.7 && slow) || d.t > 1.7) {
        d.mode = 'settle';
        d.t = 0;
        d.dur = 0.32;
        d.from.p.copy(d.pos);
        d.from.q.copy(d.mesh.quaternion);
        d.to.p.set(d.pos.x + d.vel.x * 0.06, HALF, d.pos.z + d.vel.z * 0.06);
        d.to.q.copy(this.alignedQuat(d, d.value));
      }
    }
  }

  private impact(strength: number) {
    if (strength < 0.15 || this.impactCooldown > 0) return;
    this.impactCooldown = 0.05;
    this.onImpact(strength);
  }

  private animateTweens(dt: number) {
    let settling = false;
    for (const d of this.dice) {
      if (d.mode === 'settle' || d.mode === 'move') {
        settling ||= d.mode === 'settle';
        d.t += dt;
        const k = Math.min(1, d.t / d.dur);
        const e = d.mode === 'move' ? 1 - Math.pow(1 - k, 3) : 1 - Math.pow(1 - k, 2);
        d.pos.lerpVectors(d.from.p, d.to.p, e);
        if (d.mode === 'move') d.pos.y = HALF + Math.sin(k * Math.PI) * 0.45;
        d.mesh.quaternion.slerpQuaternions(d.from.q, d.to.q, e);
        if (k >= 1) {
          d.mode = 'rest';
          d.pos.copy(d.to.p);
          d.mesh.quaternion.copy(d.to.q);
        }
      } else if (d.mode === 'jump') {
        d.t += dt;
        if (d.t < 0) continue;
        const k = Math.min(1, d.t / d.dur);
        d.pos.copy(d.from.p);
        d.pos.y = HALF + Math.sin(k * Math.PI) * (d.dur > 0.8 ? 2.2 : 0.7);
        const spin = new THREE.Quaternion().setFromAxisAngle(UP, k * Math.PI * (d.dur > 0.8 ? 4 : 2));
        d.mesh.quaternion.copy(spin.multiply(d.to.q));
        if (k >= 1) {
          d.mode = 'rest';
          d.pos.copy(d.to.p);
          d.mesh.quaternion.copy(d.to.q);
        }
      }
    }
    if (this.landedCb && this.dice.every((d) => d.mode !== 'fly' && d.mode !== 'settle')) this.finishLanding();
    return settling;
  }

  private finishLanding() {
    const cb = this.landedCb;
    this.landedCb = null;
    // Freie Würfel liegen dort, wo sie gelandet sind – nur Überlappungen mit der Halte-Zone vermeiden.
    cb?.();
  }

  // ---------- Darstellung ----------

  private loop(now: number) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.time += dt;
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);

    // Physik in festen Teilschritten
    const sub = 4;
    for (let s = 0; s < sub; s++) this.step(dt / sub);
    this.animateTweens(dt);

    const burn = this.streak >= 4 ? Math.min(1, (this.streak - 3) / 4) : 0;
    const marks = MARKS[this.opts.design];
    const clean = this.opts.design === 'clean';
    this.streakLight.intensity = this.opts.design === 'clean' ? 0 : burn * (18 + Math.sin(this.time * 9) * 5);
    for (const d of this.dice) {
      d.mesh.position.copy(d.pos);
      const ringMat = d.ring.material as THREE.MeshBasicMaterial;
      const show = d.held || d.locked;
      ringMat.color.set(d.locked ? marks.locked : this.selectMode ? marks.select : marks.held);
      const target = this.selectMode && !d.locked ? 0.55 + Math.sin(this.time * 8) * 0.3 : show ? 0.75 + Math.sin(this.time * 4 + d.pos.x) * 0.2 : 0;
      ringMat.opacity += (target - ringMat.opacity) * Math.min(1, dt * 12);
      d.ring.position.set(d.pos.x, 0.02, d.pos.z);
      const rs = (show ? 1 : 0.6) + (this.selectMode ? 0.08 * Math.sin(this.time * 8) : 0);
      d.ring.scale.setScalar(rs);
      d.ring.rotation.z += dt * (d.locked ? 0.3 : 1.2);
      const h = Math.max(0, d.pos.y - HALF);
      d.shadow.position.set(d.pos.x + h * 0.25, 0.01, d.pos.z + h * 0.15);
      d.shadow.scale.setScalar(1 + h * 0.25);
      (d.shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 / (1 + h * 0.8);
      const fm = d.flame.material as THREE.SpriteMaterial;
      fm.opacity = (burn * (0.45 + Math.sin(this.time * 13 + d.pos.x * 3) * 0.15) + d.highlight * 0.8) * (clean ? 0.6 : 1);
      fm.color.set(d.highlight > 0.05 ? marks.pulse : marks.streak);
      d.flame.position.set(d.pos.x, d.pos.y + 0.25, d.pos.z);
      d.flame.scale.setScalar(1.6 + burn * 0.5 + Math.sin(this.time * 17 + d.pos.z) * 0.1 * burn + d.highlight * 0.8);
      d.highlight = Math.max(0, d.highlight - dt * 1.6);
      // Gehaltene Würfel leicht angehoben und heller
      const lift = d.held && d.mode === 'rest' ? 0.06 + Math.sin(this.time * 3 + d.pos.x) * 0.03 : 0;
      d.mesh.position.y += lift;
    }
    if (this.bloom) this.bloom.strength = 0.42 + burn * 0.35;
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  // ---------- Eingabe ----------

  private onVisibility = () => {
    this.last = 0;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.pointerStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onPointerUp = (e: PointerEvent) => {
    const st = this.pointerStart;
    this.pointerStart = null;
    if (!st) return;
    const dy = e.clientY - st.y;
    const dx = e.clientX - st.x;
    if (dy < -40 && Math.abs(dy) > Math.abs(dx) && performance.now() - st.t < 600) {
      this.onSwipe();
      return;
    }
    if (Math.hypot(dx, dy) > 14 || !this.interactive) return;
    const i = this.pick(e.clientX, e.clientY);
    if (i >= 0) this.onTap(i);
  };

  private pick(cx: number, cy: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.dice.map((d) => d.mesh), false)[0];
    if (hit) return hit.object.userData.index as number;
    // Großzügige Trefferfläche: nächster Würfel in Bodennähe
    const p = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(UP, -HALF), p);
    let best = -1;
    let bd = 0.95;
    this.dice.forEach((d, i) => {
      const dd = Math.hypot(d.pos.x - p.x, d.pos.z - p.z);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    return best;
  }
}
