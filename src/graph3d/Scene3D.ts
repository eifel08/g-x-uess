import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RealFn2 } from '../math/types';
import { buildSurfaceMesh, cubeBox } from './mesh';
import { wheelFactor, zoomDomain } from './zoom';

export interface SurfaceSpec {
  id: string;
  color: string;
  F: RealFn2;
  /** The game's hidden target: gold material, glow and a TARGET badge. */
  target?: boolean;
  /** Badge text for the target, e.g. "TARGET f(x, y)". */
  label?: string;
}

export interface Theme3D {
  background: string;
  grid: string;
  axis: string;
  label: string;
  font: string;
}

export interface Pick3D {
  id: string;
  x: number;
  y: number;
  z: number;
}

const AXIS_COLORS = { x: '#e5484d', y: '#30a46c', z: '#3e63dd' };

interface SurfaceEntry {
  spec: SurfaceSpec;
  mesh: THREE.Mesh;
  lines: THREE.LineSegments;
  badge: THREE.Sprite | null;
}

/** 1-2-5 step giving about `count` intervals over `range`. */
function niceStep(range: number, count: number): number {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/**
 * A self-contained three.js scene for surfaces z = F(x, y) in a cube box.
 * Z is up. Rendering happens on demand (camera moves, data changes), never
 * in a busy loop, and every GPU resource is disposed when replaced.
 */
export class Scene3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.05, 1000);
  private controls: OrbitControls;
  private helpers = new THREE.Group();
  private surfaces = new Map<string, SurfaceEntry>();
  private clipping: THREE.Plane[] = [];
  private raycaster = new THREE.Raycaster();
  private frame = 0;
  private domain = 5;
  private resolution: number;
  private theme: Theme3D;
  private rebuildFrame = 0;
  private fullResTimer = 0;
  private touches = new Map<number, { x: number; y: number }>();
  private cleanup: (() => void)[] = [];
  /** Called whenever the box size changes (zoom, reset). */
  onDomainChange?: (domain: number) => void;

  constructor(container: HTMLElement, theme: Theme3D, resolution: number) {
    this.theme = theme;
    this.resolution = resolution;
    this.renderer = new THREE.WebGLRenderer({ antialias: true }); // throws without WebGL
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';
    container.appendChild(this.canvas);

    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.screenSpacePanning = true;
    // Zoom changes how much of the graph is shown, not how close the camera
    // is: wheel and pinch are handled by zoomBy below. Two fingers still pan.
    this.controls.enableZoom = false;
    this.controls.addEventListener('change', () => this.requestRender());
    this.listenForZoom();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(4, -6, 10);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-6, 5, -3);
    this.scene.add(fill);
    this.scene.add(this.helpers);

    this.applyDomain();
    this.resetView();
  }

  /* -------------------------------- public -------------------------------- */

  setTheme(theme: Theme3D) {
    this.theme = theme;
    this.rebuildHelpers();
    this.requestRender();
  }

  /** Half-size of the box; surfaces are resampled to fill it. Resets the camera. */
  setDomain(domain: number) {
    this.domain = zoomDomain(domain, 1);
    this.resetView();
    this.scheduleRebuild(false);
    this.onDomainChange?.(this.domain);
  }

  /**
   * Zooms by `factor` (>1 shows more of the graph). The box keeps its size
   * on screen while the range of x, y and z it shows grows or shrinks, like
   * zooming a 2D graph. The camera is scaled by the same factor so the view
   * (angle and any panning) is preserved.
   */
  zoomBy(factor: number) {
    const next = zoomDomain(this.domain, factor);
    const k = next / this.domain;
    if (k === 1) return;
    this.domain = next;
    this.camera.position.multiplyScalar(k);
    this.controls.target.multiplyScalar(k);
    this.fitCameraLimits();
    this.controls.update();
    this.scheduleRebuild(true);
    this.onDomainChange?.(next);
  }

  getDomain() {
    return this.domain;
  }

  setResolution(resolution: number) {
    if (resolution === this.resolution) return;
    this.resolution = resolution;
    for (const entry of [...this.surfaces.values()]) this.rebuildSurface(entry.spec);
  }

  /** Replaces the displayed surfaces, rebuilding only those that changed. */
  setSurfaces(specs: readonly SurfaceSpec[]) {
    const keep = new Set(specs.map((s) => s.id));
    for (const [id, entry] of this.surfaces) {
      if (!keep.has(id)) {
        this.disposeEntry(entry);
        this.surfaces.delete(id);
      }
    }
    for (const spec of specs) {
      const old = this.surfaces.get(spec.id)?.spec;
      if (old && old.F === spec.F && old.color === spec.color && old.target === spec.target && old.label === spec.label) continue;
      this.rebuildSurface(spec);
    }
    this.requestRender();
  }

  resetView() {
    const d = this.domain;
    this.camera.position.set(d * 2.3, -d * 2.9, d * 1.9);
    this.controls.target.set(0, 0, 0);
    this.fitCameraLimits();
    this.controls.update();
    this.requestRender();
  }

  private fitCameraLimits() {
    const d = this.domain;
    this.camera.near = d * 0.01;
    this.camera.far = d * 100;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = d * 0.3;
    this.controls.maxDistance = d * 20;
  }

  /**
   * Rebuilds the box helpers and surfaces for the current domain on the next
   * frame (coalescing rapid zoom steps). While zooming, a coarser mesh keeps
   * it smooth; full resolution follows shortly after the gesture stops.
   */
  private scheduleRebuild(interactive: boolean) {
    window.clearTimeout(this.fullResTimer);
    if (interactive) this.fullResTimer = window.setTimeout(() => this.scheduleRebuild(false), 220);
    cancelAnimationFrame(this.rebuildFrame);
    this.rebuildFrame = requestAnimationFrame(() => {
      this.rebuildFrame = 0;
      this.applyDomain();
      const resolution = interactive ? Math.min(this.resolution, 48) : this.resolution;
      for (const entry of [...this.surfaces.values()]) this.rebuildSurface(entry.spec, resolution);
      this.renderNow();
    });
  }

  /** Wheel / trackpad / two-finger pinch → zoomBy. */
  private listenForZoom() {
    const canvas = this.canvas;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoomBy(wheelFactor(e.deltaY, e.deltaMode, canvas.clientHeight, e.ctrlKey));
    };
    const distance = () => {
      const [a, b] = [...this.touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onMove = (e: PointerEvent) => {
      if (!this.touches.has(e.pointerId)) return;
      const before = this.touches.size === 2 ? distance() : 0;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2 && before > 0) {
        const after = distance();
        if (after > 0) this.zoomBy(before / after); // fingers apart → zoom in
      }
    };
    const onUp = (e: PointerEvent) => this.touches.delete(e.pointerId);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    this.cleanup.push(() => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    });
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderNow();
  }

  /** The surface point under a pointer position (client coordinates), inside the box. */
  pick(clientX: number, clientY: number): Pick3D | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = [...this.surfaces.values()].map((e) => e.mesh);
    const d = this.domain * (1 + 1e-6);
    for (const hit of this.raycaster.intersectObjects(meshes, false)) {
      const { x, y, z } = hit.point;
      if (Math.abs(x) <= d && Math.abs(y) <= d && Math.abs(z) <= d) {
        const id = [...this.surfaces.entries()].find(([, e]) => e.mesh === hit.object)?.[0];
        if (!id) continue;
        // Snap z onto the exact surface rather than the triangle.
        const exact = this.surfaces.get(id)!.spec.F(x, y);
        return { id, x, y, z: Number.isFinite(exact) ? exact : z };
      }
    }
    return null;
  }

  requestRender() {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.renderNow());
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.rebuildFrame);
    window.clearTimeout(this.fullResTimer);
    this.cleanup.forEach((fn) => fn());
    for (const entry of this.surfaces.values()) this.disposeEntry(entry);
    this.surfaces.clear();
    disposeTree(this.helpers);
    this.controls.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  /* -------------------------------- private ------------------------------- */

  private renderNow() {
    this.frame = 0;
    this.scene.background = new THREE.Color(this.theme.background);
    this.renderer.render(this.scene, this.camera);
  }

  private applyDomain() {
    const d = this.domain;
    // Cut surfaces exactly at the box faces.
    this.clipping = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), d),
      new THREE.Plane(new THREE.Vector3(1, 0, 0), d),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), d),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), d),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), d),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), d),
    ];
    this.rebuildHelpers();
  }

  private rebuildHelpers() {
    disposeTree(this.helpers);
    this.helpers.clear();
    const d = this.domain;
    const step = niceStep(d, 2.5);
    const minor = step / 2;

    // Grid on the z = 0 plane.
    const grid: number[] = [];
    for (let v = -Math.floor(d / minor) * minor; v <= d + 1e-9; v += minor) {
      grid.push(v, -d, 0, v, d, 0, -d, v, 0, d, v, 0);
    }
    this.helpers.add(lines(grid, this.theme.grid, 0.9));

    // Box edges.
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * d, 2 * d, 2 * d)),
      new THREE.LineBasicMaterial({ color: this.theme.grid, transparent: true, opacity: 0.8 }),
    );
    this.helpers.add(box);

    // Axes, axis names and tick labels.
    const size = d * 0.085;
    for (const axis of ['x', 'y', 'z'] as const) {
      const dir = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
      const end = dir.clone().multiplyScalar(d);
      this.helpers.add(lines([...end.clone().negate().toArray(), ...end.toArray()], AXIS_COLORS[axis], 1));
      const name = label(axis, AXIS_COLORS[axis], this.theme.font, size * 1.4, true);
      name.position.copy(dir.clone().multiplyScalar(d * 1.12));
      this.helpers.add(name);
      for (let v = -Math.floor(d / step) * step; v <= d + 1e-9; v += step) {
        if (Math.abs(v) < 1e-9) continue;
        const tick = label(String(Number(v.toPrecision(6))), this.theme.label, this.theme.font, size, false);
        tick.position.copy(dir.clone().multiplyScalar(v));
        if (axis === 'z') tick.position.x -= size * 0.9;
        else tick.position.z -= size * 0.9;
        this.helpers.add(tick);
      }
    }
  }

  private rebuildSurface(spec: SurfaceSpec, resolution = this.resolution) {
    const existing = this.surfaces.get(spec.id);
    if (existing) this.disposeEntry(existing);

    const box = cubeBox(this.domain);
    const built = buildSurfaceMesh(spec.F, box, resolution);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(built.indices, 1));
    geometry.computeVertexNormals();

    const color = new THREE.Color(spec.color);
    const material = spec.target
      ? new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.35,
          roughness: 0.4,
          metalness: 0.2,
          transparent: true,
          opacity: 0.86,
          side: THREE.DoubleSide,
          clippingPlanes: this.clipping,
          // Lets a matching player surface draw cleanly on top of the target.
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        })
      : new THREE.MeshStandardMaterial({
          color,
          roughness: 0.65,
          metalness: 0.05,
          side: THREE.DoubleSide,
          clippingPlanes: this.clipping,
        });
    const mesh = new THREE.Mesh(geometry, material);
    if (spec.target) mesh.renderOrder = 1; // transparent: after opaque surfaces

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(built.lines, 3));
    const meshLines = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({
        color: spec.target ? color.clone().multiplyScalar(0.55) : color.clone().multiplyScalar(0.6),
        transparent: true,
        opacity: spec.target ? 0.7 : 0.45,
        clippingPlanes: this.clipping,
      }),
    );

    let badge: THREE.Sprite | null = null;
    if (spec.target && spec.label && built.peak) {
      badge = label(spec.label, '#2b1d00', this.theme.font, this.domain * 0.09, true, spec.color);
      const [x, y, z] = built.peak;
      badge.position.set(x, y, Math.min(this.domain * 1.05, z + this.domain * 0.16));
      badge.renderOrder = 10;
    }

    this.scene.add(mesh, meshLines);
    if (badge) this.scene.add(badge);
    this.surfaces.set(spec.id, { spec, mesh, lines: meshLines, badge });
  }

  private disposeEntry(entry: SurfaceEntry) {
    for (const obj of [entry.mesh, entry.lines, entry.badge]) {
      if (!obj) continue;
      this.scene.remove(obj);
      disposeObject(obj);
    }
  }
}

/* ------------------------------- helpers -------------------------------- */

function lines(points: number[], color: string, opacity: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

/** A camera-facing text label (canvas texture on a sprite), `height` world units tall. */
function label(text: string, color: string, font: string, height: number, bold: boolean, pill?: string): THREE.Sprite {
  const px = 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontSpec = `${bold ? '700 ' : '500 '}${px * 0.7}px ${font}`;
  ctx.font = fontSpec;
  const pad = pill ? px * 0.45 : px * 0.1;
  canvas.width = Math.ceil(ctx.measureText(text).width + pad * 2);
  canvas.height = px;
  ctx.font = fontSpec;
  if (pill) {
    ctx.fillStyle = pill;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, px / 2);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  return sprite;
}

function disposeObject(obj: THREE.Object3D) {
  const withGeometry = obj as THREE.Mesh;
  withGeometry.geometry?.dispose();
  const materials = ([] as THREE.Material[]).concat((withGeometry.material as THREE.Material | THREE.Material[]) ?? []);
  for (const m of materials) {
    (m as THREE.SpriteMaterial).map?.dispose();
    m.dispose();
  }
}

function disposeTree(group: THREE.Object3D) {
  group.traverse((child) => {
    if (child !== group) disposeObject(child);
  });
}
