import type {
  BlendMode,
  OverlayMode,
  Project,
  Source,
  SourceParamValue,
  Surface,
} from '../model/types';
import { getMedia } from '../store/media';
import { GRADIENT_BODY, SOLID_BODY } from '../content/shaders';
import { Fbo } from './fbo';
import { cornerPinVertices } from './homography';
import { tessellateMesh } from './mesh';
import { Program } from './program';
import {
  BLIT_FS,
  CHECKER_FS,
  FILL_FS,
  FULLSCREEN_VS,
  GRID_FS,
  MASTER_FS,
  MAX_MASK_POINTS,
  MAX_MASK_POLYS,
  OUTLINE_SRC_FS,
  SAFE_FS,
  SOURCE_HEADER,
  WARP_FS,
  WARP_VS,
} from './shadersrc';

/**
 * Snapshot the render loop pulls from the store each frame. The loop runs on
 * requestAnimationFrame, fully independent of React; React writes state, this
 * reads it. Nothing here may import React.
 */
export interface RenderState {
  project: Project;
  blackout: boolean;
  overlay: OverlayMode;
}

export interface RenderStats {
  /** Exponential moving average of the rAF interval, ms. */
  frameMs: number;
  fps: number;
  contextLost: boolean;
  /** Total watchdog events since boot. */
  dropEvents: number;
}

export interface WatchdogEntry {
  at: string;
  ms: number;
}

interface SurfaceRes {
  fbo: Fbo;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  /** Identity of the uploaded mesh point array, or null when the buffers
   * hold corner-pin quad data. Mesh geometry re-tessellates only on change. */
  meshKey: unknown;
  indexCount: number;
}

interface SourceRes {
  program: Program | null;
  glsl: string;
  error: string | null;
}

interface MediaRes {
  texture: WebGLTexture | null;
  video: HTMLVideoElement | null;
  objectUrl: string | null;
  ready: boolean;
  failed: boolean;
  lastUsedFrame: number;
}

const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);
const FS_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);
const BLACKOUT_FADE_SEC = 0.15;
const WATCHDOG_LIMIT = 200;
/** Identification hues for the per-surface fill overlay. */
const FILL_COLORS: [number, number, number][] = [
  [0.95, 0.66, 0.23], // tungsten
  [0.31, 0.82, 0.88], // cyan
  [0.85, 0.4, 0.75],
  [0.45, 0.85, 0.45],
  [0.9, 0.45, 0.35],
  [0.55, 0.55, 0.95],
  [0.9, 0.85, 0.4],
  [0.5, 0.8, 0.7],
];

export class Renderer {
  readonly stats: RenderStats = { frameMs: 16.7, fps: 60, contextLost: false, dropEvents: 0 };
  /** Rolling log of sustained frame drops. Reports; never intervenes. */
  readonly watchdogLog: WatchdogEntry[] = [];

  private gl: WebGL2RenderingContext;
  private raf = 0;
  private disposed = false;
  private timeSec = 0;
  private frame = 0;
  private lastT = 0;
  private fade = 1;
  private random: [number, number, number, number];
  private slowSince = 0;
  private lastDropLog = 0;

  private warpProg!: Program;
  private masterProg!: Program;
  private checkerProg!: Program;
  private gridProg!: Program;
  private fillProg!: Program;
  private outlineProg!: Program;
  private blitProg!: Program;
  private safeProg!: Program;
  private fsTriVao!: WebGLVertexArrayObject;
  private fsTriVbo!: WebGLBuffer;
  private outputFbo!: Fbo;
  private surfaceRes = new Map<string, SurfaceRes>();
  private sourceRes = new Map<string, SourceRes>();
  private mediaRes = new Map<string, MediaRes>();
  private maskPts = new Float32Array(MAX_MASK_POINTS * 2);
  private maskRange = new Int32Array(MAX_MASK_POLYS * 2);
  private maskInvert = new Int32Array(MAX_MASK_POLYS);

  private onLost = (e: Event): void => {
    e.preventDefault();
    this.stats.contextLost = true;
  };

  private onRestored = (): void => {
    if (this.disposed) return;
    this.stats.contextLost = false;
    this.initGL();
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private getState: () => RenderState,
  ) {
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.random = [Math.random(), Math.random(), Math.random(), Math.random()];
    this.initGL();
  }

  start(): void {
    this.lastT = performance.now();
    const loop = (t: number): void => {
      if (this.disposed) return;
      this.renderFrame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.releaseAll();
  }

  /** Compile error for a source, or null. For the shader editor. */
  getSourceError(sourceId: string): string | null {
    return this.sourceRes.get(sourceId)?.error ?? null;
  }

  /** Simulates a GPU reset (acceptance test 6). */
  debugLoseContext(restoreAfterMs = 1500): void {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (!ext) return;
    ext.loseContext();
    window.setTimeout(() => ext.restoreContext(), restoreAfterMs);
  }

  /**
   * (Re)creates every context-owned resource. Called at construction and
   * again on webglcontextrestored — after a loss all old handles are dead,
   * so the caches are simply dropped and rebuilt lazily.
   */
  private initGL(): void {
    const gl = this.gl;
    this.surfaceRes.clear();
    this.sourceRes.clear();
    for (const m of this.mediaRes.values()) this.releaseMedia(m, false);
    this.mediaRes.clear();

    this.warpProg = new Program(gl, WARP_VS, WARP_FS);
    this.masterProg = new Program(gl, FULLSCREEN_VS, MASTER_FS);
    this.checkerProg = new Program(gl, FULLSCREEN_VS, CHECKER_FS);
    this.gridProg = new Program(gl, FULLSCREEN_VS, GRID_FS);
    this.fillProg = new Program(gl, FULLSCREEN_VS, FILL_FS);
    this.outlineProg = new Program(gl, FULLSCREEN_VS, OUTLINE_SRC_FS);
    this.blitProg = new Program(gl, FULLSCREEN_VS, BLIT_FS);
    this.safeProg = new Program(gl, FULLSCREEN_VS, SAFE_FS);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('buffer allocation failed');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, FS_TRIANGLE, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.fsTriVao = vao;
    this.fsTriVbo = vbo;

    this.outputFbo = new Fbo(gl, 4, 4);
  }

  private releaseAll(): void {
    const gl = this.gl;
    for (const res of this.surfaceRes.values()) {
      res.fbo.dispose();
      gl.deleteBuffer(res.vbo);
      gl.deleteBuffer(res.ibo);
      gl.deleteVertexArray(res.vao);
    }
    this.surfaceRes.clear();
    for (const res of this.sourceRes.values()) res.program?.dispose();
    this.sourceRes.clear();
    for (const m of this.mediaRes.values()) this.releaseMedia(m, true);
    this.mediaRes.clear();
    this.warpProg?.dispose();
    this.masterProg?.dispose();
    this.checkerProg?.dispose();
    this.gridProg?.dispose();
    this.fillProg?.dispose();
    this.outlineProg?.dispose();
    this.blitProg?.dispose();
    this.safeProg?.dispose();
    this.outputFbo?.dispose();
    gl.deleteBuffer(this.fsTriVbo);
    gl.deleteVertexArray(this.fsTriVao);
  }

  private releaseMedia(m: MediaRes, deleteTexture: boolean): void {
    if (m.video) {
      m.video.pause();
      m.video.src = '';
      m.video = null;
    }
    if (m.objectUrl) {
      URL.revokeObjectURL(m.objectUrl);
      m.objectUrl = null;
    }
    if (deleteTexture && m.texture) this.gl.deleteTexture(m.texture);
    m.texture = null;
  }

  private watchdog(dtMs: number, now: number): void {
    const slow = this.stats.frameMs > 22 || dtMs > 50;
    if (!slow) {
      this.slowSince = 0;
      return;
    }
    if (this.slowSince === 0) this.slowSince = now;
    // Log a sustained slowdown at most once per 10s. Report only — never
    // restart or intervene.
    if (now - this.slowSince > 1000 && now - this.lastDropLog > 10000) {
      this.lastDropLog = now;
      this.stats.dropEvents++;
      this.watchdogLog.push({ at: new Date().toISOString(), ms: Math.round(dtMs * 10) / 10 });
      if (this.watchdogLog.length > WATCHDOG_LIMIT) this.watchdogLog.shift();
    }
  }

  private renderFrame(t: number): void {
    let dt = (t - this.lastT) / 1000;
    this.lastT = t;
    // A long gap means the tab was suspended — don't jump the art forward.
    if (dt > 0.25 || dt < 0) dt = 1 / 60;
    this.stats.frameMs += (dt * 1000 - this.stats.frameMs) * 0.08;
    this.stats.fps = 1000 / Math.max(this.stats.frameMs, 0.01);
    this.watchdog(dt * 1000, t);

    if (this.stats.contextLost) return;

    const gl = this.gl;
    const { project, blackout, overlay } = this.getState();
    this.timeSec += dt;
    this.frame++;

    const target = blackout ? 0 : 1;
    const step = dt / BLACKOUT_FADE_SEC;
    this.fade = target > this.fade
      ? Math.min(target, this.fade + step)
      : Math.max(target, this.fade - step);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.outputFbo.ensureSize(cw, ch);

    const anySolo = project.surfaces.some((s) => s.enabled && s.solo);
    const surfaces = project.surfaces.filter(
      (s) => s.enabled && (!anySolo || s.solo),
    );

    // 1. Each surface's source into its offscreen FBO.
    for (let i = 0; i < surfaces.length; i++) {
      const surface = surfaces[i];
      const res = this.ensureSurfaceRes(surface, cw, ch);
      this.renderSource(surface, res, project, overlay, i);
    }

    // 2. Composite each surface into the output FBO through its warp.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFbo.framebuffer);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);

    this.warpProg.use();
    this.warpProg.set1i('u_tex', 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const surface of surfaces) {
      const res = this.surfaceRes.get(surface.id);
      if (!res) continue;
      if (!this.uploadWarpGeometry(surface, res)) continue;
      this.applyBlend(overlay === 'off' ? surface.blendMode : 'normal');
      this.bindMask(surface, overlay);
      gl.bindVertexArray(res.vao);
      gl.bindTexture(gl.TEXTURE_2D, res.fbo.texture);
      this.warpProg.set1f('u_opacity', overlay === 'off' ? surface.opacity : 1);
      gl.drawElements(gl.TRIANGLES, res.indexCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);

    // 3. Output-space overlays, before the master pass so they are judged
    // under the same output conditions as the content.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    if (overlay === 'grid') {
      this.gridProg.use();
      this.gridProg.set2f('u_resolution', cw, ch);
      this.drawFsTriangle();
    } else if (overlay === 'outline') {
      this.safeProg.use();
      this.safeProg.set2f('u_resolution', cw, ch);
      this.drawFsTriangle();
    }
    gl.disable(gl.BLEND);

    // 4. Master pass to the screen: lift, temperature, gamma, brightness.
    const m = project.master;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    this.masterProg.use();
    this.masterProg.set1i('u_tex', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.outputFbo.texture);
    this.masterProg.set1f('u_blackLift', Math.min(Math.max(m.blackLift, 0), 0.1));
    this.masterProg.set1f('u_temperature', Math.min(Math.max(m.temperature / 100, -1), 1));
    this.masterProg.set1f('u_gammaExp', 2.2 / Math.min(Math.max(m.gamma, 0.5), 6));
    this.masterProg.set1f('u_brightness', Math.min(Math.max(m.brightness, 0), 1) * this.fade);
    this.drawFsTriangle();

    // Release GPU resources for surfaces/sources deleted from the document.
    if (this.frame % 120 === 0) this.collectGarbage(project);
  }

  private applyBlend(mode: BlendMode): void {
    const gl = this.gl;
    // Sources are premultiplied by the warp shader (except multiply-prep).
    switch (mode) {
      case 'add':
        gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
        break;
      case 'screen':
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ZERO, gl.ONE);
        break;
      case 'multiply':
        gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);
        break;
      default:
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    }
    this.warpProg.set1i('u_blendPrep', mode === 'multiply' ? 1 : 0);
  }

  private bindMask(surface: Surface, overlay: OverlayMode): void {
    const mask = surface.mask;
    const active = overlay === 'off' && mask.enabled && mask.polygons.length > 0;
    if (!active) {
      this.warpProg.set1i('u_maskCount', 0);
      return;
    }
    let ptr = 0;
    let polyCount = 0;
    for (const poly of mask.polygons) {
      if (polyCount >= MAX_MASK_POLYS) break;
      if (poly.points.length < 3) continue;
      const count = Math.min(poly.points.length, MAX_MASK_POINTS - ptr);
      if (count < 3) break;
      this.maskRange[polyCount * 2] = ptr;
      this.maskRange[polyCount * 2 + 1] = count;
      this.maskInvert[polyCount] = poly.invert ? 1 : 0;
      for (let i = 0; i < count; i++) {
        this.maskPts[(ptr + i) * 2] = poly.points[i][0];
        this.maskPts[(ptr + i) * 2 + 1] = poly.points[i][1];
      }
      ptr += count;
      polyCount++;
    }
    const gl = this.gl;
    this.warpProg.set1i('u_maskCount', polyCount);
    this.warpProg.set1f('u_maskFeather', mask.feather);
    if (polyCount > 0) {
      const lPts = this.warpProg.loc('u_maskPts[0]');
      const lRange = this.warpProg.loc('u_maskRange[0]');
      const lInv = this.warpProg.loc('u_maskInvert[0]');
      if (lPts) gl.uniform2fv(lPts, this.maskPts);
      if (lRange) gl.uniform2iv(lRange, this.maskRange);
      if (lInv) gl.uniform1iv(lInv, this.maskInvert);
    }
  }

  /**
   * Uploads the surface's warp geometry (corner-pin quad or tessellated
   * mesh). Corner-pin data is tiny and re-uploaded every frame; mesh
   * geometry re-tessellates only when the control points change.
   * Returns false for degenerate geometry, which is skipped.
   */
  private uploadWarpGeometry(surface: Surface, res: SurfaceRes): boolean {
    const gl = this.gl;
    const warp = surface.warp;
    if (warp.type === 'mesh' && warp.mesh) {
      if (res.meshKey === warp.mesh.points) return res.indexCount > 0;
      const geo = tessellateMesh(warp.mesh);
      if (!geo) return false;
      gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, geo.vertices, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      res.meshKey = warp.mesh.points;
      res.indexCount = geo.indices.length;
      return true;
    }
    const verts = cornerPinVertices(warp.corners);
    if (!verts) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    if (res.meshKey !== null || res.indexCount !== 6) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, QUAD_INDICES, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      res.meshKey = null;
      res.indexCount = 6;
    }
    return true;
  }

  private ensureSurfaceRes(surface: Surface, cw: number, ch: number): SurfaceRes {
    const gl = this.gl;
    let res = this.surfaceRes.get(surface.id);
    if (!res) {
      const vbo = gl.createBuffer();
      const ibo = gl.createBuffer();
      const vao = gl.createVertexArray();
      if (!vbo || !ibo || !vao) throw new Error('surface buffer allocation failed');
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, 4 * 5 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, QUAD_INDICES, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      res = { fbo: new Fbo(gl, 128, 128), vbo, ibo, vao, meshKey: null, indexCount: 6 };
      this.surfaceRes.set(surface.id, res);
    }
    // Size the FBO to the warped geometry's bounding box, quantized to 128px
    // so dragging a handle doesn't reallocate every frame.
    const pts =
      surface.warp.type === 'mesh' && surface.warp.mesh
        ? surface.warp.mesh.points
        : surface.warp.corners;
    const xs = pts.map((c) => c[0]);
    const ys = pts.map((c) => c[1]);
    const wPx = (Math.max(...xs) - Math.min(...xs)) * cw;
    const hPx = (Math.max(...ys) - Math.min(...ys)) * ch;
    const quant = (v: number): number => Math.min(4096, Math.max(128, Math.ceil(v / 128) * 128));
    res.fbo.ensureSize(quant(wPx), quant(hPx));
    return res;
  }

  private renderSource(
    surface: Surface,
    res: SurfaceRes,
    project: Project,
    overlay: OverlayMode,
    surfaceIndex: number,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo.framebuffer);
    gl.viewport(0, 0, res.fbo.width, res.fbo.height);
    gl.disable(gl.BLEND);

    if (overlay === 'checker') {
      this.checkerProg.use();
      this.checkerProg.set2f('u_squares', 8, 8);
      this.drawFsTriangle();
      return;
    }
    if (overlay === 'fill' || overlay === 'outline') {
      const prog = overlay === 'fill' ? this.fillProg : this.outlineProg;
      const c = FILL_COLORS[surfaceIndex % FILL_COLORS.length];
      if (overlay === 'outline') {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      prog.use();
      prog.set3f('u_color', c[0], c[1], c[2]);
      this.drawFsTriangle();
      return;
    }

    const source = surface.sourceId
      ? project.sources.find((s) => s.id === surface.sourceId)
      : undefined;
    if (!source) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    if (source.type === 'image' || source.type === 'video') {
      this.renderMediaSource(source);
      return;
    }

    const glsl = this.effectiveGlsl(source);
    const prog = glsl != null ? this.ensureSourceProgram(source, glsl) : null;
    if (!prog) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    prog.use();
    prog.set1f('u_time', this.timeSec);
    prog.set2f('u_resolution', res.fbo.width, res.fbo.height);
    prog.set1i('u_frame', this.frame);
    prog.set4f('u_random', ...this.random);
    const params = { ...source.uniforms, ...surface.sourceParams };
    for (const [key, value] of Object.entries(params)) {
      this.setParamUniform(prog, `u_${key}`, value);
    }
    this.drawFsTriangle();
  }

  /** Solid and gradient sources run through the shader pipeline with
   * internal bodies, so the same param controls and uniforms apply. */
  private effectiveGlsl(source: Source): string | null {
    if (source.type === 'shader') return source.glsl ?? null;
    if (source.type === 'solid') return SOLID_BODY;
    if (source.type === 'gradient') return GRADIENT_BODY;
    return null;
  }

  private renderMediaSource(source: Source): void {
    const gl = this.gl;
    const media = source.mediaId ? this.ensureMedia(source) : null;
    if (!media || !media.ready || !media.texture) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    media.lastUsedFrame = this.frame;
    if (media.video && media.video.readyState >= 2) {
      if (media.video.paused) void media.video.play().catch(() => undefined);
      gl.bindTexture(gl.TEXTURE_2D, media.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, media.video);
    }
    this.blitProg.use();
    this.blitProg.set1i('u_tex', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, media.texture);
    this.drawFsTriangle();
  }

  private ensureMedia(source: Source): MediaRes {
    const id = source.mediaId as string;
    let m = this.mediaRes.get(id);
    if (m) return m;
    m = {
      texture: null,
      video: null,
      objectUrl: null,
      ready: false,
      failed: false,
      lastUsedFrame: this.frame,
    };
    this.mediaRes.set(id, m);
    void this.loadMedia(id, source.type === 'video', m);
    return m;
  }

  private async loadMedia(id: string, isVideo: boolean, m: MediaRes): Promise<void> {
    try {
      const blob = await getMedia(id);
      if (!blob || this.disposed) {
        m.failed = true;
        return;
      }
      const gl = this.gl;
      const makeTexture = (): WebGLTexture => {
        const tex = gl.createTexture();
        if (!tex) throw new Error('texture allocation failed');
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
      };
      if (isVideo) {
        const video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        m.objectUrl = URL.createObjectURL(blob);
        video.src = m.objectUrl;
        await video.play().catch(() => undefined);
        m.video = video;
        m.texture = makeTexture();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        m.ready = true;
      } else {
        const bitmap = await createImageBitmap(blob);
        if (this.disposed) {
          bitmap.close();
          return;
        }
        m.texture = makeTexture();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        bitmap.close();
        m.ready = true;
      }
    } catch (e) {
      console.warn(`media ${id} failed to load`, e);
      m.failed = true;
    }
  }

  private drawFsTriangle(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.fsTriVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /**
   * Compiles a source's shader, caching by source id. On a failed recompile
   * the previous working program is kept — a typo must never black the wall.
   */
  private ensureSourceProgram(source: Source, glsl: string): Program | null {
    const res = this.sourceRes.get(source.id);
    if (res && res.glsl === glsl) return res.program;
    let program = res?.program ?? null;
    let error: string | null = null;
    try {
      const next = new Program(this.gl, FULLSCREEN_VS, SOURCE_HEADER + glsl);
      program?.dispose();
      program = next;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    // Cache under the exact text either way: a broken shader is not retried
    // every frame, and any edit changes the key and triggers a recompile.
    this.sourceRes.set(source.id, { program, glsl, error });
    return program;
  }

  private setParamUniform(prog: Program, name: string, value: SourceParamValue): void {
    if (typeof value === 'number') {
      prog.set1f(name, value);
    } else if (typeof value === 'boolean') {
      prog.set1i(name, value ? 1 : 0);
    } else if (typeof value === 'string' && value.startsWith('#')) {
      const rgb = hexToRgb01(value);
      if (rgb) prog.set3f(name, rgb[0], rgb[1], rgb[2]);
    }
  }

  private collectGarbage(project: Project): void {
    const gl = this.gl;
    const surfaceIds = new Set(project.surfaces.map((s) => s.id));
    for (const [id, res] of this.surfaceRes) {
      if (surfaceIds.has(id)) continue;
      res.fbo.dispose();
      gl.deleteBuffer(res.vbo);
      gl.deleteBuffer(res.ibo);
      gl.deleteVertexArray(res.vao);
      this.surfaceRes.delete(id);
    }
    const sourceIds = new Set(project.sources.map((s) => s.id));
    for (const [id, res] of this.sourceRes) {
      if (sourceIds.has(id)) continue;
      res.program?.dispose();
      this.sourceRes.delete(id);
    }
    const mediaIds = new Set(
      project.sources.map((s) => s.mediaId).filter((x): x is string => !!x),
    );
    for (const [id, m] of this.mediaRes) {
      if (mediaIds.has(id)) {
        // Pause videos that no visible surface has sampled recently.
        if (m.video && !m.video.paused && this.frame - m.lastUsedFrame > 120) m.video.pause();
        continue;
      }
      this.releaseMedia(m, true);
      this.mediaRes.delete(id);
    }
  }
}

export function hexToRgb01(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
