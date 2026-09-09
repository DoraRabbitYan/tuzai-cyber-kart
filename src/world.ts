import * as THREE from 'three';

export type TrackId = 'city' | 'canyon' | 'dock';
export interface TrackFrame {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  yaw: number;
}

type Theme = { background: number; fog: number; ambient: number; sun: number };
type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; colors: THREE.Color[] };
type Pickup = { distance: number; lateral: number; object: THREE.Object3D };
type Obstacle = Pickup & { width: number };
const TAU = Math.PI * 2;
const THEMES: Record<TrackId, Theme> = {
  city: { background: 0x233550, fog: 0x30475f, ambient: 0x92c9f7, sun: 0xb4dcff },
  canyon: { background: 0xc57d69, fog: 0xb87e68, ambient: 0xffd3a0, sun: 0xffd499 },
  dock: { background: 0x101c36, fog: 0x253c5e, ambient: 0x9acaf9, sun: 0xc6e3ff },
};

// First three anchors and the preceding anchor form the start straight.
const ROUTES: Record<TrackId, number[][]> = {
  city: [[0, 0, 0], [0, 0, 30], [0, 0.4, 60], [0, 1, 90], [25, 3, 130], [70, 5, 145], [115, 7, 130], [150, 8, 95], [160, 7, 50], [160, 6, 0], [155, 4, -50], [130, 3, -95], [80, 2, -115], [35, 1, -100], [0, 0, -60], [0, 0, -30]],
  canyon: [[0, 0, 0], [0, 0.5, 30], [0, 1, 60], [0, 2, 90], [30, 5, 135], [85, 8, 145], [135, 9, 125], [165, 7, 85], [165, 5, 40], [143, 3, 0], [152, 2, -45], [135, 2, -90], [85, 3, -122], [35, 2, -105], [0, 0.5, -65], [0, 0, -30]],
  dock: [[0, 0, 0], [0, 0, 30], [0, 0.5, 60], [0, 1, 90], [30, 3, 135], [85, 6, 150], [140, 8, 128], [168, 8, 80], [153, 6, 35], [143, 4, -3], [148, 3, -45], [130, 2, -88], [80, 1, -112], [30, 0.5, -100], [0, 0, -60], [0, 0, -30]],
};

function randomSequence(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function roadTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 1024, ctx => {
    const rng = randomSequence(71);
    ctx.fillStyle = '#354352'; ctx.fillRect(0, 0, 512, 1024);
    for (let i = 0; i < 29000; i++) {
      const shade = 15 + Math.floor(rng() * 65);
      ctx.fillStyle = `rgba(${shade},${shade + 9},${shade + 17},${0.1 + rng() * 0.34})`;
      ctx.fillRect(rng() * 512, rng() * 1024, 1 + rng() * 3, 1 + rng() * 10);
    }
    for (const x of [20, 256, 491]) {
      ctx.fillStyle = '#132536'; ctx.fillRect(x, 0, 2, 1024);
      ctx.fillStyle = '#71818d'; ctx.fillRect(x + 2, 0, 1, 1024);
    }
    for (let y = 0; y < 1024; y += 256) {
      ctx.fillStyle = '#0e1d2c'; ctx.fillRect(0, y, 512, 5);
      ctx.fillStyle = '#7b858e'; ctx.fillRect(0, y + 5, 512, 1);
      for (const x of [13, 37, 242, 269, 475, 499]) {
        ctx.fillStyle = '#131d29'; ctx.beginPath(); ctx.arc(x, y + 17, 2, 0, TAU); ctx.fill();
      }
    }
    // Long, low contrast tire polish is deliberately different from panel seams.
    for (const x of [125, 185, 325, 385]) {
      const gradient = ctx.createLinearGradient(x - 18, 0, x + 18, 0);
      gradient.addColorStop(0, '#43566500'); gradient.addColorStop(0.5, '#93b0bd26'); gradient.addColorStop(1, '#43566500');
      ctx.fillStyle = gradient; ctx.fillRect(x - 18, 0, 36, 1024);
    }
  });
}

function panelTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, ctx => {
    ctx.fillStyle = '#b1bbc5'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#717e8e'; ctx.fillRect(0, 0, 256, 5); ctx.fillRect(0, 0, 5, 256);
    ctx.fillStyle = '#dde7ed'; ctx.fillRect(5, 5, 250, 1); ctx.fillRect(5, 5, 1, 250);
    ctx.strokeStyle = '#85929e'; ctx.lineWidth = 2; ctx.strokeRect(19, 25, 218, 201);
    for (let y = 178; y < 212; y += 6) { ctx.fillStyle = '#536571'; ctx.fillRect(156, y, 65, 2); }
    for (const x of [12, 244]) for (const y of [12, 244]) {
      ctx.fillStyle = '#354654'; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
    }
  });
}

function facadeTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 1024, ctx => {
    const rng = randomSequence(562);
    ctx.fillStyle = '#172437'; ctx.fillRect(0, 0, 512, 1024);
    for (let row = 0; row < 32; row++) {
      const y = row * 32;
      ctx.fillStyle = row % 4 === 0 ? '#526172' : '#304255'; ctx.fillRect(0, y, 512, row % 4 === 0 ? 5 : 2);
      for (let col = 0; col < 10; col++) {
        const x = 14 + col * 49;
        ctx.fillStyle = '#071421'; ctx.fillRect(x - 2, y + 7, 39, 21);
        const light = rng();
        ctx.fillStyle = light < 0.24 ? '#223b51' : light < 0.5 ? '#95bbcd' : light < 0.72 ? '#dec79e' : '#5d98b7';
        ctx.fillRect(x, y + 9, 34, 15);
        ctx.fillStyle = '#192e40'; ctx.fillRect(x + 15, y + 9, 2, 15);
        ctx.fillStyle = '#b9d8e133'; ctx.fillRect(x, y + 9, 34, 2);
      }
    }
    // Solid service strips and occasional blank floors prevent a wallpaper-like window grid.
    ctx.fillStyle = '#102234'; ctx.fillRect(240, 0, 15, 1024);
    ctx.fillStyle = '#507184'; ctx.fillRect(241, 0, 2, 1024);
    for (const y of [188, 476, 764]) {
      ctx.fillStyle = '#23394d'; ctx.fillRect(0, y, 512, 30);
      for (let x = 12; x < 500; x += 16) { ctx.fillStyle = '#091b2c'; ctx.fillRect(x, y + 7, 7, 16); }
    }
  });
}

function sandstoneTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 1024, ctx => {
    const rng = randomSequence(961);
    ctx.fillStyle = '#a67d60'; ctx.fillRect(0, 0, 512, 1024);
    for (let y = 0; y < 1024; y += 3) {
      const band = Math.sin(y * 0.077) * 13 + Math.sin(y * 0.023) * 18;
      const shade = 126 + band + rng() * 15;
      ctx.fillStyle = `rgb(${shade + 27},${shade - 10},${shade - 34})`;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.021 + y * 0.008) * 5 + Math.sin(x * 0.09) * 1.7);
      for (let x = 512; x >= 0; x -= 8) ctx.lineTo(x, y + 5 + Math.sin(x * 0.021 + y * 0.008) * 5 + Math.sin(x * 0.09) * 1.7);
      ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 13000; i++) {
      ctx.fillStyle = rng() < 0.5 ? '#492f222b' : '#eed7b927';
      ctx.fillRect(rng() * 512, rng() * 1024, 1 + rng() * 5, 1 + rng() * 2);
    }
    for (let i = 0; i < 90; i++) {
      const x = rng() * 512, y = rng() * 1024, length = 5 + rng() * 32;
      ctx.fillStyle = '#39291e4d';
      for (let step = 0; step < length; step += 3) ctx.fillRect(x + Math.sin(step * 0.11) * 3, y + step, 0.8, 4);
    }
  });
}

function rockGeometry(): THREE.BufferGeometry {
  // Broad buttresses, eroded shelves and narrow vertical gullies form an asymmetric mesa.
  const geometry = new THREE.CylinderGeometry(0.67, 1, 1, 24, 14);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const theta = Math.atan2(z, x);
    const buttress = Math.sin(theta * 3 + 0.5) * 0.12 + Math.sin(theta * 7 + y * 2) * 0.06;
    const shelf = Math.pow(Math.sin(y * 27 + 0.7), 3) * 0.085;
    const gully = Math.pow(Math.max(0, Math.sin(theta * 11 + y * 0.8)), 6) * 0.09;
    const erosion = 1 + buttress + shelf - gully;
    positions.setXYZ(i, x * erosion + y * 0.09, y + Math.sin(theta * 3) * 0.031 + Math.sin(theta * 9) * 0.009, z * erosion);
  }
  geometry.computeVertexNormals();
  const colors = [];
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const band = 0.72 + y * 0.20 + Math.sin(y * 38) * 0.10;
    const c = new THREE.Color().setRGB(band, band * 0.90, band * 0.81);
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

export class TrackWorld {
  readonly root = new THREE.Group();
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  readonly width = 15;
  readonly theme: Theme;
  readonly boosts: Array<{ distance: number; lateral: number; width: number; length: number }> = [];
  readonly pickups: Pickup[] = [];
  readonly obstacles: Obstacle[] = [];
  private readonly frames: TrackFrame[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly batches = new Map<string, Batch>();
  private readonly dummy = new THREE.Object3D();
  private readonly animations: Array<{ object: THREE.Object3D; speed: number; axis: 'x' | 'y' | 'z' }> = [];
  private pickupRings!: THREE.InstancedMesh;
  private pickupCores!: THREE.InstancedMesh;
  private pickupHalos!: THREE.InstancedMesh;
  private sky?: THREE.Mesh;
  private readonly metal: THREE.MeshStandardMaterial;
  private readonly dark: THREE.MeshStandardMaterial;
  private readonly trim: THREE.MeshStandardMaterial;
  private readonly cyan: THREE.MeshStandardMaterial;
  private readonly pink: THREE.MeshStandardMaterial;
  private readonly amber: THREE.MeshStandardMaterial;
  private readonly white: THREE.MeshStandardMaterial;
  private facade?: THREE.MeshStandardMaterial;
  private readonly box: THREE.BufferGeometry;
  private readonly cylinder: THREE.BufferGeometry;

  constructor(readonly id: TrackId) {
    this.root.name = `track-${id}`;
    this.theme = { ...THEMES[id] };
    const anchors = ROUTES[id].map(p => new THREE.Vector3(p[0] * 1.14, p[1], p[2] * 1.14));
    this.curve = new THREE.CatmullRomCurve3(anchors, true, 'catmullrom', id === 'canyon' ? 0.55 : 0.5);
    this.curve.arcLengthDivisions = 4096;
    this.curve.updateArcLengths();
    this.length = this.curve.getLength();
    for (let i = 0; i <= 2048; i++) {
      const position = this.curve.getPointAt(i / 2048);
      const tangent = this.curve.getTangentAt(i / 2048).normalize();
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      this.frames.push({ position, tangent, right, yaw: Math.atan2(tangent.x, tangent.z) });
    }
    const panel = panelTexture(); this.textures.push(panel);
    this.metal = this.material({ color: 0x58697e, map: panel, roughness: 0.42, metalness: 0.65 });
    this.dark = this.material({ color: 0x1e2a3c, map: panel, roughness: 0.63, metalness: 0.5 });
    // Shared light trim also paints the grid and guardrail tops: it is a matte
    // coating, while the separate metal material retains exposed-steel highlights.
    this.trim = this.material({ color: 0xa2b1bc, roughness: 0.88, metalness: 0.04, envMapIntensity: 0.2 });
    this.cyan = this.material({ color: 0x145566, emissive: 0x20dfff, emissiveIntensity: 2.0, roughness: 0.35 });
    this.pink = this.material({ color: 0x5c124e, emissive: 0xff34df, emissiveIntensity: 2.0, roughness: 0.35 });
    this.amber = this.material({ color: 0x95541b, emissive: 0xff9b22, emissiveIntensity: 2.3, roughness: 0.4 });
    this.white = this.material({ color: 0xbdcbd4, roughness: 0.9, metalness: 0, envMapIntensity: 0.15 });
    this.box = this.geometry('box', () => new THREE.BoxGeometry(1, 1, 1));
    this.cylinder = this.geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 16));
    this.buildSky();
    this.buildRoad();
    this.buildStartGate();
    this.buildInteractions();
    // The metropolis is the representative world kit; the others use its finished track language.
    if (id === 'city') this.buildCity();
    if (id === 'canyon') this.buildCanyon();
    if (id === 'dock') this.buildDock();
    this.flushBatches();
    this.update(0, 0);
  }

  sample(distance: number, lateral = 0): TrackFrame {
    const u = (((distance % this.length) + this.length) % this.length) / this.length * 2048;
    const index = Math.floor(u), t = u - index;
    const a = this.frames[index], b = this.frames[index + 1];
    const tangent = a.tangent.clone().lerp(b.tangent, t).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    return { position: a.position.clone().lerp(b.position, t).addScaledVector(right, lateral), tangent, right, yaw: Math.atan2(tangent.x, tangent.z) };
  }

  private material(options: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial(options);
    this.materials.push(material); return material;
  }

  private geometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    if (!this.geometries.has(key)) this.geometries.set(key, make());
    return this.geometries.get(key)!;
  }

  private part(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, yaw = 0, pitch = 0, roll = 0, color?: THREE.Color): void {
    const key = `${geometry.uuid}:${material.uuid}`;
    if (!this.batches.has(key)) this.batches.set(key, { geometry, material, matrices: [], colors: [] });
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(pitch, yaw, roll, 'YXZ');
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    const batch = this.batches.get(key)!;
    batch.matrices.push(this.dummy.matrix.clone());
    batch.colors.push(color ?? new THREE.Color(0xffffff));
  }

  private at(distance: number, lateral: number, height: number, geometry: THREE.BufferGeometry, material: THREE.Material, sx: number, sy: number, sz: number, roll = 0): void {
    const frame = this.sample(distance, lateral);
    this.part(geometry, material, frame.position.x, frame.position.y + height, frame.position.z, sx, sy, sz, frame.yaw, -Math.asin(frame.tangent.y), roll);
  }

  private flushBatches(): void {
    for (const batch of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
      batch.matrices.forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, batch.colors[i]); });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
    }
    this.batches.clear();
  }

  private ribbon(left: number, right: number, height: number, material: THREE.Material, name: string): void {
    const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
    const count = 768;
    for (let i = 0; i <= count; i++) {
      const distance = i / count * this.length;
      for (const lateral of [left, right]) {
        const point = this.sample(distance, lateral).position;
        vertices.push(point.x, point.y + height, point.z);
        uv.push(lateral === left ? 0 : 1, distance / 18);
      }
      if (i < count) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 2, n + 3, n + 1); }
    }
    const geometry = this.geometry(name, () => new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.receiveShadow = true; this.root.add(mesh);
  }

  private buildRoad(): void {
    const texture = roadTexture(); this.textures.push(texture);
    const road = this.material({ color: this.id === 'canyon' ? 0xafbac3 : 0xc2d3e5, map: texture, roughness: 0.74, metalness: 0.22 });
    this.ribbon(-8.1, 8.1, -0.65, this.dark, 'deck-understructure');
    this.ribbon(-7.5, 7.5, 0, road, 'racing-surface');
    this.ribbon(-7.63, -7.44, 0.085, this.cyan, 'left-edge-signal');
    this.ribbon(7.44, 7.63, 0.085, this.cyan, 'right-edge-signal');
    for (let distance = 0; distance < this.length; distance += 4.7) {
      for (const side of [-1, 1]) {
        this.at(distance, side * 8, 0.49, this.box, this.dark, 0.72, 1.05, 4.6);
        this.at(distance, side * 7.82, 1.05, this.box, this.trim, 0.48, 0.13, 4.6);
        this.at(distance, side * 7.61, 0.66, this.box, this.metal, 0.05, 0.49, 3.65);
        this.at(distance, side * 7.57, 0.78, this.box, Math.floor(distance / 4.7) % 4 === 0 ? this.white : this.cyan, 0.07, 0.10, 2.25);
        this.at(distance + 2.25, side * 7.93, 0.54, this.box, this.metal, 0.94, 1.18, 0.3);
      }
    }
    for (let distance = 4; distance < this.length; distance += 12) {
      for (const lateral of [-2.5, 2.5]) this.at(distance, lateral, 0.03, this.box, this.trim, 0.08, 0.018, 2.1);
    }
    for (let distance = 24; distance < this.length; distance += 34) {
      const frame = this.sample(distance);
      const height = frame.position.y + 33;
      this.part(this.cylinder, this.dark, frame.position.x, frame.position.y - height / 2 - 1, frame.position.z, 2.6, height, 2.6);
      for (const offset of [-2.8, 2.8]) this.at(distance, offset, -5, this.box, this.metal, 0.6, 9, 1.7, offset > 0 ? 0.22 : -0.22);
      this.at(distance, 0, -1.55, this.box, this.metal, 16.7, 1.8, 3.2);
    }
    const arrowTexture = canvasTexture(512, 128, ctx => {
      ctx.fillStyle = '#0d2035'; ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = '#6bcbdc'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, 504, 120);
      ctx.fillStyle = '#59ebff';
      for (let i = 0; i < 3; i++) { const x = 60 + i * 140; ctx.beginPath(); ctx.moveTo(x, 25); ctx.lineTo(x + 43, 25); ctx.lineTo(x + 84, 64); ctx.lineTo(x + 43, 103); ctx.lineTo(x, 103); ctx.lineTo(x + 41, 64); ctx.closePath(); ctx.fill(); }
    });
    this.textures.push(arrowTexture);
    const arrowMat = this.material({ map: arrowTexture, emissiveMap: arrowTexture, emissive: 0x9fdbe6, emissiveIntensity: 0.42, roughness: 0.86, metalness: 0, envMapIntensity: 0.1, side: THREE.DoubleSide });
    const board = this.geometry('sign-plane', () => new THREE.PlaneGeometry(1, 1));
    for (let distance = 96; distance < this.length; distance += 50) {
      const now = this.sample(distance), next = this.sample(distance + 12);
      const cross = now.tangent.z * next.tangent.x - now.tangent.x * next.tangent.z;
      if (Math.abs(cross) < 0.045) continue;
      const side = cross > 0 ? -1 : 1;
      const f = this.sample(distance, side * 10.6);
      this.part(this.box, this.dark, f.position.x, f.position.y + 2, f.position.z, 5.5, 1.75, 0.5, f.yaw + side * 0.30);
      this.part(board, arrowMat, f.position.x - f.tangent.x * 0.32, f.position.y + 2, f.position.z - f.tangent.z * 0.32, 5.1 * (cross > 0 ? -1 : 1), 1.42, 1, f.yaw + Math.PI + side * 0.30);
    }
  }

  private buildStartGate(): void {
    for (const side of [-1, 1]) {
      this.at(0, side * 8.8, 3.6, this.box, this.dark, 1.8, 8.2, 2.3, side * 0.15);
      this.at(0, side * 8.55, 3.5, this.box, this.trim, 0.26, 7.5, 2.5, side * 0.15);
      this.at(-1.24, side * 8.3, 3.7, this.box, side > 0 ? this.cyan : this.pink, 0.22, 5.4, 0.14, side * 0.15);
      this.at(0, side * 8.8, 0.5, this.box, this.metal, 3.4, 1, 3.7);
    }
    this.at(0, 0, 7.45, this.box, this.dark, 17.7, 1.4, 2.2);
    this.at(-1.16, -4.5, 7.7, this.box, this.pink, 7.2, 0.13, 0.08);
    this.at(-1.16, 4.5, 7.7, this.box, this.cyan, 7.2, 0.13, 0.08);
    const titleTexture = canvasTexture(1024, 128, ctx => {
      ctx.fillStyle = '#122135'; ctx.fillRect(0, 0, 1024, 128);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 66px Arial';
      ctx.fillStyle = '#edfaff'; ctx.fillText('NEON  APEX', 512, 60);
      ctx.fillStyle = '#65e7f8'; ctx.font = '17px Arial'; ctx.fillText('F U T U R E   R A C I N G   L E A G U E', 512, 111);
    });
    this.textures.push(titleTexture);
    const title = this.material({ map: titleTexture, emissiveMap: titleTexture, emissive: 0xffffff, emissiveIntensity: 0.6, side: THREE.DoubleSide });
    const titleFrame = this.sample(-1.13);
    this.part(this.geometry('title-plane', () => new THREE.PlaneGeometry(1, 1)), title, titleFrame.position.x, titleFrame.position.y + 7.26, titleFrame.position.z, 8.6, 1.04, 1, titleFrame.yaw + Math.PI);
    for (let i = -1; i <= 1; i++) { this.at(0, i * 2, 6.1, this.box, this.dark, 0.85, 1.1, 0.7); this.at(-0.4, i * 2, 6.1, this.cylinder, this.cyan, 0.25, 0.1, 0.25); }
    for (let row = 0; row < 2; row++) for (let col = 0; col < 20; col++) {
      this.at(row * 0.6 - 0.3, -7.125 + col * 0.75, 0.025, this.box, (row + col) % 2 ? this.dark : this.white, 0.72, 0.025, 0.58);
    }
    for (let row = 0; row < 4; row++) for (const lateral of [-3.6, 0, 3.6]) {
      this.at(-6 - row * 5, lateral, 0.029, this.box, this.trim, 2.3, 0.02, 0.1);
      this.at(-5.5 - row * 5, lateral - 1.1, 0.029, this.box, this.trim, 0.10, 0.02, 1);
      this.at(-5.5 - row * 5, lateral + 1.1, 0.029, this.box, this.trim, 0.10, 0.02, 1);
    }
  }

  private buildInteractions(): void {
    const boostTexture = canvasTexture(256, 512, ctx => {
      ctx.fillStyle = '#482a1a'; ctx.fillRect(0, 0, 256, 512);
      ctx.strokeStyle = '#ffb135'; ctx.lineWidth = 10; ctx.strokeRect(7, 7, 242, 498);
      for (let y = 60; y < 500; y += 110) {
        ctx.fillStyle = '#ffb038'; ctx.beginPath(); ctx.moveTo(30, y + 65); ctx.lineTo(128, y); ctx.lineTo(226, y + 65); ctx.lineTo(226, y + 88); ctx.lineTo(128, y + 27); ctx.lineTo(30, y + 88); ctx.closePath(); ctx.fill();
      }
    });
    this.textures.push(boostTexture);
    const boostMaterial = this.material({ map: boostTexture, emissiveMap: boostTexture, emissive: 0xffa63c, emissiveIntensity: 0.9, roughness: 0.9, envMapIntensity: 0.1 });
    const pad = this.geometry('boost-pad', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    for (let i = 0; i < 4; i++) {
      const distance = 58 + i * this.length / 4;
      const laterals = i % 2 === 0 ? [-4.5, 0, 4.5] : [i % 3 === 0 ? -3.4 : 3.4];
      for (const lateral of laterals) {
        this.boosts.push({ distance, lateral, width: 3.25, length: 8 });
        this.at(distance, lateral, 0.035, pad, boostMaterial, 3.25, 1, 8);
      }
    }
    const hexRing = this.geometry('pickup-ring', () => new THREE.TorusGeometry(0.76, 0.055, 6, 6));
    const hexCore = this.geometry('pickup-core', () => new THREE.OctahedronGeometry(0.37));
    const halo = this.geometry('pickup-halo', () => new THREE.RingGeometry(0.35, 0.80, 24).rotateX(-Math.PI / 2));
    for (let i = 0; i < 10; i++) {
      const distance = 94 + i * (this.length - 105) / 10;
      for (const lateral of i % 3 === 0 ? [-4.4, 0, 4.4] : [-3.9, 3.9]) {
        const frame = this.sample(distance, lateral), object = new THREE.Object3D();
        object.name = 'energy-pickup'; object.position.copy(frame.position); object.position.y += 1.45;
        object.userData.groundY = frame.position.y; this.root.add(object);
        this.pickups.push({ distance, lateral, object });
      }
    }
    this.pickupRings = new THREE.InstancedMesh(hexRing, this.pink, this.pickups.length);
    this.pickupCores = new THREE.InstancedMesh(hexCore, this.pink, this.pickups.length);
    const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xd31aad, transparent: true, opacity: 0.19, depthWrite: false, side: THREE.DoubleSide }); this.materials.push(haloMaterial);
    this.pickupHalos = new THREE.InstancedMesh(halo, haloMaterial, this.pickups.length);
    for (const mesh of [this.pickupRings, this.pickupCores, this.pickupHalos]) { mesh.frustumCulled = false; this.root.add(mesh); }
    const hazardTexture = canvasTexture(256, 128, ctx => {
      ctx.fillStyle = '#172331'; ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#ff9e26';
      for (let x = -100; x < 350; x += 65) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 28, 0); ctx.lineTo(x + 108, 128); ctx.lineTo(x + 80, 128); ctx.fill(); }
    });
    this.textures.push(hazardTexture);
    const hazard = this.material({ map: hazardTexture, roughness: 0.5, metalness: 0.35 });
    for (let i = 0; i < 5; i++) {
      const distance = 157 + i * (this.length - 195) / 5, lateral = i % 2 ? -4.2 : 4.2;
      const object = new THREE.Object3D(); const frame = this.sample(distance, lateral);
      object.position.copy(frame.position); object.rotation.y = frame.yaw; object.name = 'maintenance-barrier'; this.root.add(object);
      this.obstacles.push({ distance, lateral, width: 2.6, object });
      this.at(distance, lateral, 0.52, this.box, this.dark, 2.6, 1.04, 1.8);
      this.at(distance - 0.94, lateral, 0.59, this.box, hazard, 2.42, 0.74, 0.08);
      for (const side of [-1, 1]) { this.at(distance, lateral + side * 1.1, 0.28, this.box, this.metal, 0.32, 0.56, 2.15); this.at(distance, lateral + side * 0.95, 1.12, this.box, this.amber, 0.22, 0.18, 0.28); }
    }
  }

  private buildSky(): void {
    const material = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color(this.id === 'city' ? '#101a37' : this.id === 'canyon' ? '#687798' : '#020814') }, uHorizon: { value: new THREE.Color(this.id === 'city' ? '#6d839d' : this.id === 'canyon' ? '#ffc698' : '#294977') }, uSun: { value: new THREE.Color(this.id === 'canyon' ? '#fff6c4' : '#b7dbff') }, uDirection: { value: new THREE.Vector3(-0.3, 0.22, 0.7).normalize() }, uStrength: { value: this.id === 'canyon' ? 1 : 0.14 } },
      vertexShader: 'varying vec3 vDirection; void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vDirection; uniform vec3 uTop,uHorizon,uSun,uDirection; uniform float uStrength; void main(){float h=clamp(normalize(vDirection).y,0.0,1.0);vec3 col=mix(uHorizon,uTop,pow(h,0.5));float d=max(dot(normalize(vDirection),uDirection),0.0);col+=uSun*(pow(d,1500.0)*1.4+pow(d,12.0)*0.22)*uStrength;gl_FragColor=vec4(col,1.0);}',
    });
    this.materials.push(material);
    this.sky = new THREE.Mesh(this.geometry('sky', () => new THREE.SphereGeometry(720, 32, 20)), material);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10; this.root.add(this.sky);
    if (this.id !== 'canyon') {
      const rng = randomSequence(447), stars: number[] = [];
      for (let i = 0; i < 700; i++) { const theta = rng() * TAU, phi = rng() * 1.4; stars.push(Math.cos(theta) * Math.cos(phi) * 630, 50 + Math.sin(phi) * 540, Math.sin(theta) * Math.cos(phi) * 630); }
      const geometry = this.geometry('stars', () => new THREE.BufferGeometry()); geometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xc6e8ff, size: this.id === 'dock' ? 0.8 : 0.48, sizeAttenuation: true, transparent: true, opacity: this.id === 'dock' ? 0.8 : 0.42, fog: false }); this.materials.push(starMat); this.root.add(new THREE.Points(geometry, starMat));
    }
  }

  private clearOfTrack(x: number, z: number, radius: number): boolean {
    for (let i = 0; i < this.frames.length; i += 16) {
      const p = this.frames[i].position;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < radius ** 2) return false;
    }
    return true;
  }

  private tower(x: number, z: number, width: number, height: number, seed: number, base = -33): void {
    const rng = randomSequence(seed), body = this.geometry('tower-core', () => new THREE.CylinderGeometry(0.52, 0.66, 1, 8).rotateY(Math.PI / 8));
    const color = new THREE.Color().setHSL(0.58 + rng() * 0.08, 0.18, 0.57 + rng() * 0.3);
    this.part(body, this.dark, x, base + height / 2, z, width, height, width, 0, 0, 0, color);
    if (!this.facade) {
      const texture = facadeTexture(); this.textures.push(texture);
      this.facade = this.material({ color: 0xc0ceda, map: texture, emissiveMap: texture, emissive: 0x9ec5e0, emissiveIntensity: 0.62, metalness: 0.25, roughness: 0.57 });
    }
    // The facade follows the octagonal core's tapered OUTER faces. Previous inset strips
    // sat inside its radius and disappeared on all but the uppermost floors.
    const facade = this.geometry('tower-facade', () => {
      const bottom = 0.66, top = 0.52, sine = Math.sin(Math.PI / 8), cosine = Math.cos(Math.PI / 8);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([-bottom * sine, -0.5, bottom * cosine + 0.003, bottom * sine, -0.5, bottom * cosine + 0.003, -top * sine, 0.5, top * cosine + 0.003, top * sine, 0.5, top * cosine + 0.003], 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
      geometry.setIndex([0, 1, 2, 1, 3, 2]); geometry.computeVertexNormals(); return geometry;
    });
    for (let face = 0; face < 8; face++) {
      const angle = face * Math.PI / 4;
      this.part(facade, this.facade, x, base + height / 2, z, width, height, width, angle, 0, 0, color);
      const corner = angle + Math.PI / 8, midpoint = width * 0.59 + 0.26;
      this.part(this.box, this.metal, x + Math.sin(corner) * midpoint, base + height / 2, z + Math.cos(corner) * midpoint, 0.55, Math.hypot(height, width * 0.14), 0.75, corner, -Math.atan2(width * 0.14, height));
      // Exterior service bays are broad enough to read at racing camera scale.
      if ((face + seed) % 2 === 0) {
        const level = 0.59, radius = (0.66 - level * 0.14) * Math.cos(Math.PI / 8) * width + 0.2;
        const px = x + Math.sin(angle) * radius, pz = z + Math.cos(angle) * radius;
        this.part(this.box, this.dark, px, base + height * level, pz, width * 0.12, height * 0.63, 0.32, angle, -Math.atan2(width * 0.14 * Math.cos(Math.PI / 8), height));
        this.part(this.box, seed % 2 ? this.cyan : this.pink, px + Math.sin(angle) * 0.2, base + height * level, pz + Math.cos(angle) * 0.2, width * 0.032, height * 0.59, 0.09, angle, -Math.atan2(width * 0.14 * Math.cos(Math.PI / 8), height));
        for (const fraction of [0.22, 0.4, 0.6, 0.78]) {
          const r = (0.66 - fraction * 0.14) * Math.cos(Math.PI / 8) * width + 0.31;
          this.part(this.box, this.metal, x + Math.sin(angle) * r, base + height * fraction, z + Math.cos(angle) * r, width * 0.16, 0.45, 0.55, angle);
        }
      }
    }
    const crown = base + height;
    for (const level of [0.09, 0.4, 0.72, 0.93]) {
      const scale = (0.66 - level * 0.14) / 0.59;
      this.part(body, this.metal, x, base + height * level, z, width * scale * 1.08, 1.3, width * scale * 1.08);
      this.part(body, this.dark, x, base + height * level + 0.8, z, width * scale * 1.04, 0.35, width * scale * 1.04);
      if (level > 0.8) this.part(body, seed % 2 ? this.cyan : this.pink, x, base + height * level + 0.77, z, width * scale * 1.065, 0.12, width * scale * 1.065);
    }
    this.part(this.cylinder, this.metal, x, crown + 1, z, width * 0.30, 3, width * 0.30);
    this.part(this.cylinder, this.dark, x, crown + 5, z, 0.3, 10, 0.3);
    this.part(this.box, this.pink, x, crown + 10, z, 0.4, 0.6, 0.4);
  }

  private ringLandmark(x: number, y: number, z: number, radius: number, yaw = 0, tilted = false): void {
    const torus = this.geometry('landmark-ring', () => new THREE.TorusGeometry(1, 0.038, 8, 96));
    this.part(torus, this.dark, x, y, z, radius, radius, radius, yaw, tilted ? 0.28 : 0);
    const rim = this.geometry('landmark-rim', () => new THREE.TorusGeometry(1, 0.008, 6, 96));
    this.part(rim, this.trim, x, y, z - radius * 0.028, radius * 0.978, radius * 0.978, radius * 0.978, yaw, tilted ? 0.28 : 0);
    const arc = this.geometry('landmark-arc', () => new THREE.TorusGeometry(1, 0.009, 6, 10, 0.29));
    const orientation = new THREE.Euler(tilted ? 0.28 : 0, yaw, 0, 'YXZ');
    for (let i = 0; i < 16; i++) {
      const angle = i * TAU / 16;
      this.part(arc, i % 4 === 0 ? this.pink : this.cyan, x, y, z - 0.8, radius * 0.94, radius * 0.94, radius * 0.94, yaw, tilted ? 0.28 : 0, angle);
      const joint = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).applyEuler(orientation);
      this.part(this.box, this.metal, x + joint.x, y + joint.y, z + joint.z, 3.4, 6.0, 3.4, yaw, tilted ? 0.28 : 0, angle);
      const panel = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, -radius * 0.045).applyEuler(orientation);
      this.part(this.box, this.dark, x + panel.x, y + panel.y, z + panel.z, 3.1, 4.7, 0.35, yaw, tilted ? 0.28 : 0, angle);
      const signal = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, -radius * 0.049).applyEuler(orientation);
      this.part(this.box, this.cyan, x + signal.x, y + signal.y, z + signal.z, 0.18, 3.3, 0.12, yaw, tilted ? 0.28 : 0, angle);
    }
  }

  private buildCity(): void {
    const rng = randomSequence(21);
    // Near towers flank the opening straight; varied crowns form the middle and far skyline.
    for (const entry of [[-28, 18, 16, 87], [31, 37, 16, 109], [-35, 90, 23, 132], [36, 102, 13, 68]]) this.tower(entry[0], entry[1], entry[2], entry[3], Math.floor(rng() * 800));
    for (let i = 0; i < 96; i++) {
      const x = -160 + rng() * 430, z = -210 + rng() * 470, width = 10 + rng() * 14;
      if (!this.clearOfTrack(x, z, width * 0.82 + 14)) continue;
      this.tower(x, z, width, 42 + rng() * 104, i + 210);
    }
    this.ringLandmark(2, 58, 182, 62);
    this.ringLandmark(173, 32, -153, 42, 0.42);
    // Suspended transit spine and regular collars make the overhead space inhabited.
    for (const z of [81, -70]) {
      this.part(this.box, this.dark, 78, 25, z, 286, 3.1, 4.7);
      this.part(this.box, this.trim, 78, 23.2, z, 286, 0.4, 4.9);
      this.part(this.box, this.cyan, 78, 25.1, z - 2.44, 286, 0.25, 0.08);
      for (let x = -65; x < 225; x += 12) this.part(this.box, this.metal, x, 25, z, 0.65, 4.2, 5.5);
    }
    const reservoir = this.material({ color: 0x172e45, roughness: 0.18, metalness: 0.72 });
    const water = new THREE.Mesh(this.geometry('water', () => new THREE.PlaneGeometry(760, 760).rotateX(-Math.PI / 2)), reservoir); water.position.set(70, -34, 0); this.root.add(water);
    // Terraces, short green canopies, and warm garden lights break the skyline's vertical rhythm.
    const foliage = this.material({ color: 0x23554e, roughness: 0.9 });
    const tree = this.geometry('tree-canopy', () => new THREE.SphereGeometry(1, 9, 6));
    for (let i = 0; i < 10; i++) {
      const d = 20 + i * this.length / 10, side = i % 2 ? -1 : 1, p = this.sample(d, side * 20).position;
      if (!this.clearOfTrack(p.x, p.z, 13)) continue;
      this.part(this.cylinder, this.dark, p.x, -10, p.z, 10, 2, 10);
      this.part(this.cylinder, this.trim, p.x, -8.8, p.z, 10, 0.3, 10);
      for (let k = 0; k < 5; k++) {
        const a = k * TAU / 5, x = p.x + Math.cos(a) * 6, z = p.z + Math.sin(a) * 6;
        this.part(this.cylinder, this.dark, x, -5.8, z, 0.23, 6, 0.23);
        this.part(tree, foliage, x, -2.5, z, 2.8, 1.4, 2.8);
        this.part(this.box, this.amber, x + 1, -8.4, z, 0.3, 0.4, 0.3);
      }
    }
  }

  private buildCanyon(): void {
    const rng = randomSequence(936);
    const rock = this.geometry('sandstone', rockGeometry);
    const stoneTexture = sandstoneTexture(); this.textures.push(stoneTexture);
    const relief = stoneTexture.clone(); relief.colorSpace = THREE.NoColorSpace; relief.needsUpdate = true; this.textures.push(relief);
    const sandstone = this.material({ color: 0xe8c4a3, map: stoneTexture, bumpMap: relief, bumpScale: 0.46, roughness: 0.94, vertexColors: true });
    for (let i = 0; i < 118; i++) {
      const x = -180 + rng() * 465, z = -220 + rng() * 460, radius = 9 + rng() * 27;
      if (!this.clearOfTrack(x, z, radius * 1.28 + 12)) continue;
      const height = 35 + rng() * 63;
      const color = new THREE.Color().setHSL(0.068 + rng() * 0.028, 0.10 + rng() * 0.14, 0.58 + rng() * 0.27);
      this.part(rock, sandstone, x, height / 2 - 44, z, radius, height, radius * (0.7 + rng() * 0.45), rng() * TAU, 0, 0, color);
      if (rng() < 0.6) this.part(rock, sandstone, x + radius * 0.6, -23, z, radius * 0.75, 31, radius * 0.6, rng() * TAU, 0, 0, color);
    }
    const crystal = this.geometry('crystal', () => new THREE.CylinderGeometry(0, 0.75, 1, 6, 1));
    const crystalMat = this.material({ color: 0x36cabb, emissive: 0x087c95, emissiveIntensity: 0.68, roughness: 0.17, metalness: 0.26 });
    for (let i = 0; i < 45; i++) {
      const distance = i / 45 * this.length, side = i % 2 ? 1 : -1, f = this.sample(distance, side * (14 + rng() * 6));
      if (!this.clearOfTrack(f.position.x, f.position.z, 11)) continue;
      this.part(rock, sandstone, f.position.x, -16, f.position.z, 5 + rng() * 4, 28, 5 + rng() * 4);
      // Small, offset foothill shelves connect the tall mesas to a real canyon floor.
      this.part(rock, sandstone, f.position.x + side * 5, -32, f.position.z + 4, 13, 19 + rng() * 8, 10, rng() * TAU, 0, 0, new THREE.Color(0xaba39b));
      for (let k = 0; k < 4; k++) {
        const h = 2 + rng() * 5;
        this.part(crystal, crystalMat, f.position.x + (rng() - 0.5) * 7, -2 + h / 2, f.position.z + (rng() - 0.5) * 7, 0.65 + rng(), h, 0.65 + rng(), rng() * TAU, (rng() - 0.5) * 0.7, (rng() - 0.5) * 0.5);
      }
    }
    const canyonFloor = this.geometry('canyon-floor', () => {
      const geometry = new THREE.PlaneGeometry(950, 950, 1, 1).rotateX(-Math.PI / 2);
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 24, uv.getY(i) * 24);
      const colors = new Float32Array(geometry.attributes.position.count * 3).fill(0.62);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); return geometry;
    });
    const floor = new THREE.Mesh(canyonFloor, sandstone); floor.position.set(70, -44, 0); floor.receiveShadow = true; this.root.add(floor);
    for (const entry of [[-23, 34, 13, 68], [85, 39, 22, 91], [218, -81, 14, 78]]) this.reactor(entry[0], entry[1], entry[2], entry[3]);
    this.ringLandmark(58, 40, 208, 38, 0, true);
    const solar = this.material({ color: 0x143964, metalness: 0.68, roughness: 0.24, map: this.textures[0] });
    for (let i = 0; i < 8; i++) {
      const f = this.sample(30 + i * this.length / 8, i % 2 ? -25 : 25);
      if (!this.clearOfTrack(f.position.x, f.position.z, 17)) continue;
      this.part(this.box, this.metal, f.position.x, -7, f.position.z, 0.7, 14, 0.7);
      this.part(this.box, this.trim, f.position.x, 0.2, f.position.z, 16.5, 0.4, 9.5, f.yaw, -0.35);
      for (let col = 0; col < 4; col++) {
        const p = f.position.clone().addScaledVector(f.right, (col - 1.5) * 4);
        this.part(this.box, solar, p.x, 0.5, p.z, 3.8, 0.13, 9.1, f.yaw, -0.35);
      }
    }
  }

  private reactor(x: number, z: number, radius: number, height: number): void {
    const base = -31;
    this.part(this.cylinder, this.dark, x, base + height / 2, z, radius * 0.35, height, radius * 0.35);
    this.part(this.cylinder, this.pink, x, base + height * 0.51, z, radius * 0.43, height * 0.82, radius * 0.43);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      this.part(this.box, this.metal, x + Math.cos(a) * radius * 0.56, base + height / 2, z + Math.sin(a) * radius * 0.56, 1.7, height, 1.7, -a);
    }
    for (const level of [0.02, 0.14, 0.45, 0.76, 0.91, 0.99]) {
      this.part(this.cylinder, this.dark, x, base + height * level, z, radius * 0.76, 2.8, radius * 0.76);
      this.part(this.cylinder, this.trim, x, base + height * level + 1.5, z, radius * 0.78, 0.3, radius * 0.78);
      if (level === 0.14 || level === 0.91) this.part(this.cylinder, this.cyan, x, base + height * level + 0.3, z, radius * 0.765, 0.22, radius * 0.765);
    }
  }

  private buildDock(): void {
    const rng = randomSequence(177);
    this.ringLandmark(3, 48, 190, 65);
    this.ringLandmark(240, 22, -103, 48, -0.25, true);
    for (let i = 0; i < 22; i++) {
      const x = -100 + rng() * 380, z = -210 + rng() * 430;
      if (!this.clearOfTrack(x, z, 25)) continue;
      this.reactor(x, z, 8 + rng() * 6, 45 + rng() * 54);
      this.part(this.box, this.dark, x, -15, z, 38, 2, 25);
      this.part(this.box, this.trim, x, -13.7, z, 38, 0.5, 25);
      for (let k = 0; k < 4; k++) {
        const cx = x + (k - 1.5) * 7.8, cz = z + 8;
        this.part(this.box, this.metal, cx, -10, cz, 7, 5.7, 5.5, 0, 0, 0, new THREE.Color(k % 2 ? 0xa0653d : 0x53989b));
        for (let seam = 0; seam < 5; seam++) this.part(this.box, this.dark, cx - 2.6 + seam * 1.3, -10, cz - 2.84, 0.11, 5.5, 0.11);
      }
    }
    // Fabricated overhead ribs. Only space beyond the driving envelope is occupied.
    for (let i = 0; i < 8; i++) {
      const distance = 25 + i * this.length / 8;
      for (const side of [-1, 1]) {
        this.at(distance, side * 10.7, 7, this.box, this.dark, 1.9, 16, 2.4, side * 0.15);
        this.at(distance - 1.26, side * 10.4, 7, this.box, i % 2 ? this.pink : this.cyan, 0.15, 12, 0.1, side * 0.15);
        for (const height of [2.3, 5.2, 8.1, 11]) {
          this.at(distance, side * (10.7 - (height - 7) * 0.15), height, this.box, this.metal, 2.35, 0.65, 2.9, side * 0.15);
          this.at(distance - 1.5, side * (10.7 - (height - 7) * 0.15), height + 0.3, this.box, this.amber, 0.6, 0.11, 0.08);
        }
      }
      this.at(distance, 0, 14.8, this.box, this.metal, 22, 1.3, 2.2);
      for (const lateral of [-7, -3.5, 0, 3.5, 7]) this.at(distance, lateral, 13.6, this.box, this.dark, 0.55, 2, 2.6);
    }
    const earthMaterial = new THREE.ShaderMaterial({ fog: false,
      vertexShader: `varying vec3 vPosition; varying vec3 vViewNormal; varying vec3 vViewDirection;
        void main(){vPosition=position;vec4 view=modelViewMatrix*vec4(position,1.0);vViewNormal=normalMatrix*normal;vViewDirection=-view.xyz;gl_Position=projectionMatrix*view;}`,
      fragmentShader: `varying vec3 vPosition; varying vec3 vViewNormal; varying vec3 vViewDirection;
        float hash(vec3 p){p=fract(p*0.3183099+vec3(0.1,0.2,0.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
        float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float fbm(vec3 p){float value=0.0,weight=0.5;for(int i=0;i<4;i++){value+=noise(p)*weight;p=p*2.03+vec3(13.1,9.2,5.7);weight*=0.5;}return value;}
        float mass(vec2 ll,vec2 center,vec2 radius){vec2 d=(ll-center)/radius;return 1.0-dot(d,d);}
        void main(){vec3 p=normalize(vPosition);vec2 ll=vec2(atan(p.x,-p.z),asin(p.y))*57.29578;
          float mainland=mass(ll,vec2(-108,46),vec2(42,24));
          mainland=max(mainland,mass(ll,vec2(-101,22),vec2(18,22)));
          mainland=max(mainland,mass(ll,vec2(-81,10),vec2(17,9)));
          mainland=max(mainland,mass(ll,vec2(-63,-20),vec2(25,34)));
          mainland=max(mainland,mass(ll,vec2(-67,-43),vec2(10,16)));
          mainland=max(mainland,mass(ll,vec2(-42,74),vec2(21,13)));
          mainland=max(mainland,mass(ll,vec2(18,9),vec2(27,29)));
          mainland=max(mainland,mass(ll,vec2(24,-17),vec2(18,23)));
          mainland=max(mainland,mass(ll,vec2(20,53),vec2(35,20)));
          mainland=max(mainland,mass(ll,vec2(89,48),vec2(63,24)));
          mainland=max(mainland,mass(ll,vec2(79,20),vec2(12,18)));
          mainland=max(mainland,mass(ll,vec2(113,5),vec2(18,10)));
          mainland=max(mainland,mass(ll,vec2(135,-26),vec2(21,14)));
          mainland=max(mainland,mass(ll,vec2(174,-42),vec2(4,11)));
          float geography=mainland+(fbm(p*12.0)-0.5)*0.90;
          float land=smoothstep(-0.06,0.045,geography);
          float coast=smoothstep(-0.24,-0.06,geography)*(1.0-land);
          float terrain=noise(p*48.0);
          float desert=smoothstep(0.10,0.40,fbm(p*6.0+4.0))*smoothstep(0.0,0.22,abs(p.y))*(1.0-smoothstep(0.30,0.72,abs(p.y)));
          vec3 vegetation=mix(vec3(0.13,0.26,0.17),vec3(0.36,0.43,0.23),terrain);
          vegetation=mix(vegetation,vec3(0.65,0.52,0.32),desert*0.7);
          vec3 ocean=mix(vec3(0.025,0.105,0.26),vec3(0.055,0.21,0.39),terrain);
          ocean+=coast*vec3(0.03,0.16,0.17);
          vec3 color=mix(ocean,vegetation,land);
          float ice=smoothstep(0.87,0.96,abs(p.y)+(noise(p*43.0)-0.5)*0.035);color=mix(color,vec3(0.77,0.87,0.91),ice);
          vec3 cloudP=vec3(p.x*1.4,p.y*2.9,p.z*1.4);
          float cloudField=fbm(cloudP*10.0+vec3(6.0,2.0,8.0));
          float cloud=smoothstep(0.49,0.65,cloudField)*(0.5+noise(p*76.0)*0.5);
          color=mix(color*mix(1.0,0.78,cloud),vec3(0.91,0.96,1.0),cloud*0.87);
          float light=0.25+max(dot(p,normalize(vec3(-0.32,0.45,-0.83))),0.0)*0.75;color*=light;
          float rim=pow(1.0-max(dot(normalize(vViewNormal),normalize(vViewDirection)),0.0),3.2);
          color+=vec3(0.055,0.20,0.40)*rim;gl_FragColor=vec4(color,1.0);}`,
    });
    this.materials.push(earthMaterial);
    const earth = new THREE.Mesh(this.geometry('earth', () => new THREE.SphereGeometry(1, 64, 40)), earthMaterial);
    earth.position.set(-165, 39, 320); earth.scale.setScalar(163); earth.rotation.z = -0.25; earth.renderOrder = -1; this.root.add(earth);
    this.animations.push({ object: earth, speed: 0.006, axis: 'y' });
    const orbit = this.geometry('orbital-station-ring', () => new THREE.TorusGeometry(1, 0.006, 6, 100));
    this.part(orbit, this.trim, 55, 17, 20, 330, 330, 330, 0.5, 1.17);
    this.part(orbit, this.metal, 55, 17, 20, 305, 305, 305, 0.5, 1.17);
    const debris = this.geometry('debris', () => new THREE.IcosahedronGeometry(1, 1));
    for (let i = 0; i < 50; i++) {
      const x = -170 + rng() * 470, z = -250 + rng() * 450;
      if (!this.clearOfTrack(x, z, 22)) continue;
      this.part(debris, this.dark, x, -28 - rng() * 33, z, 1 + rng() * 4, 1 + rng() * 3, 1 + rng() * 4, rng() * TAU);
    }
  }

  update(time: number, playerDistance: number): void {
    for (let i = 0; i < this.pickups.length; i++) {
      const pickup = this.pickups[i], scale = pickup.object.visible ? 1 : 0;
      const frame = this.sample(pickup.distance, pickup.lateral);
      this.dummy.position.copy(frame.position); this.dummy.position.y += 1.45 + Math.sin(time * 2.5 + i * 0.9) * 0.14;
      this.dummy.rotation.set(0, frame.yaw + time * 0.6, Math.PI / 6); this.dummy.scale.setScalar(scale); this.dummy.updateMatrix(); this.pickupRings.setMatrixAt(i, this.dummy.matrix);
      this.dummy.rotation.set(time * 0.5, time * 0.9 + i, 0); this.dummy.scale.setScalar(scale * (0.94 + Math.sin(time * 3 + i) * 0.10)); this.dummy.updateMatrix(); this.pickupCores.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.copy(frame.position); this.dummy.position.y += 0.028; this.dummy.rotation.set(0, time * 0.3, 0); this.dummy.scale.setScalar(scale); this.dummy.updateMatrix(); this.pickupHalos.setMatrixAt(i, this.dummy.matrix);
    }
    this.pickupRings.instanceMatrix.needsUpdate = true;
    this.pickupCores.instanceMatrix.needsUpdate = true;
    this.pickupHalos.instanceMatrix.needsUpdate = true;
    for (const animation of this.animations) animation.object.rotation[animation.axis] = time * animation.speed;
    if (this.sky) { const position = this.sample(playerDistance).position; this.sky.position.set(position.x, 0, position.z); }
  }

  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.root.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.root.clear();
  }
}
