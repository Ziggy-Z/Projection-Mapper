import type { OverlayMode, Project, Source, SourceParamValue, Surface } from '../model/types';
import { Fbo } from './fbo';
import { cornerPinVertices } from './homography';
import { Program } from './program';
import {
  CHECKER_FS,
  FULLSCREEN_VS,
  GRID_FS,
  MASTER_FS,
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
}

interface SurfaceRes {
  fbo: Fbo;
  vbo: WebGLBuffer;
  vao: WebGLVertexArrayObject;
}

interface SourceRes {
  program: Program | null;
  glsl: string;
  error: string | null;
}

const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);
const FS_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);
const BLACKOUT_FADE_SEC = 0.15;

export class Renderer {
  readonly stats: RenderStats = { frameMs: 16.7, fps: 60, contextLost: false };

  private gl: WebGL2RenderingContext;
  private raf = 0;
  private disposed = false;
  private timeSec = 0;
  private frame = 0;
  private lastT = 0;
  private fade = 1;
  private random: [number, number, number, number];

  private warpProg!: Program;
  private masterProg!: Program;
  private checkerProg!: Program;
  private gridProg!: Program;
  private fsTriVao!: WebGLVertexArrayObject;
  private fsTriVbo!: WebGLBuffer;
  private quadIndexBuf!: WebGLBuffer;
  private outputFbo!: Fbo;
  private surfaceRes = new Map<string, SurfaceRes>();
  private sourceRes = new Map<string, SourceRes>();

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

    this.warpProg = new Program(gl, WARP_VS, WARP_FS);
    this.masterProg = new Program(gl, FULLSCREEN_VS, MASTER_FS);
    this.checkerProg = new Program(gl, FULLSCREEN_VS, CHECKER_FS);
    this.gridProg = new Program(gl, FULLSCREEN_VS, GRID_FS);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    if (!vao || !vbo || !ibo) throw new Error('buffer allocation failed');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, FS_TRIANGLE, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.fsTriVao = vao;
    this.fsTriVbo = vbo;

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, QUAD_INDICES, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this.quadIndexBuf = ibo;

    this.outputFbo = new Fbo(gl, 4, 4);
  }

  private releaseAll(): void {
    const gl = this.gl;
    for (const res of this.surfaceRes.values()) {
      res.fbo.dispose();
      gl.deleteBuffer(res.vbo);
      gl.deleteVertexArray(res.vao);
    }
    this.surfaceRes.clear();
    for (const res of this.sourceRes.values()) res.program?.dispose();
    this.sourceRes.clear();
    this.warpProg?.dispose();
    this.masterProg?.dispose();
    this.checkerProg?.dispose();
    this.gridProg?.dispose();
    this.outputFbo?.dispose();
    gl.deleteBuffer(this.fsTriVbo);
    gl.deleteVertexArray(this.fsTriVao);
    gl.deleteBuffer(this.quadIndexBuf);
  }

  private renderFrame(t: number): void {
    let dt = (t - this.lastT) / 1000;
    this.lastT = t;
    // A long gap means the tab was suspended — don't jump the art forward.
    if (dt > 0.25 || dt < 0) dt = 1 / 60;
    this.stats.frameMs += (dt * 1000 - this.stats.frameMs) * 0.08;
    this.stats.fps = 1000 / Math.max(this.stats.frameMs, 0.01);

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

    const surfaces = project.surfaces.filter((s) => s.enabled);

    // 1. Each surface's source into its offscreen FBO.
    for (const surface of surfaces) {
      const res = this.ensureSurfaceRes(surface, cw, ch);
      this.renderSource(surface, res, project, overlay);
    }

    // 2. Composite each surface into the output FBO through its warp.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFbo.framebuffer);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.warpProg.use();
    this.warpProg.set1i('u_tex', 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const surface of surfaces) {
      const res = this.surfaceRes.get(surface.id);
      if (!res) continue;
      const verts = cornerPinVertices(surface.warp.corners);
      if (!verts) continue; // degenerate quad — skip rather than draw garbage
      gl.bindVertexArray(res.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.bindTexture(gl.TEXTURE_2D, res.fbo.texture);
      this.warpProg.set1f('u_opacity', surface.opacity);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);

    // 3. Alignment grid over the composite, before the master pass, so it is
    // judged under the same output conditions as the content.
    if (overlay === 'grid') {
      this.gridProg.use();
      this.gridProg.set2f('u_resolution', cw, ch);
      gl.bindVertexArray(this.fsTriVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
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
    gl.bindVertexArray(this.fsTriVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // Release GPU resources for surfaces/sources deleted from the document.
    if (this.frame % 120 === 0) this.collectGarbage(project);
  }

  private ensureSurfaceRes(surface: Surface, cw: number, ch: number): SurfaceRes {
    const gl = this.gl;
    let res = this.surfaceRes.get(surface.id);
    if (!res) {
      const vbo = gl.createBuffer();
      const vao = gl.createVertexArray();
      if (!vbo || !vao) throw new Error('surface buffer allocation failed');
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, 4 * 5 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuf);
      gl.bindVertexArray(null);
      res = { fbo: new Fbo(gl, 128, 128), vbo, vao };
      this.surfaceRes.set(surface.id, res);
    }
    // Size the FBO to the warped quad's bounding box, quantized to 128px so
    // dragging a corner doesn't reallocate every frame.
    const xs = surface.warp.corners.map((c) => c[0]);
    const ys = surface.warp.corners.map((c) => c[1]);
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
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo.framebuffer);
    gl.viewport(0, 0, res.fbo.width, res.fbo.height);
    gl.disable(gl.BLEND);

    if (overlay === 'checker') {
      this.checkerProg.use();
      this.checkerProg.set2f('u_squares', 8, 8);
      gl.bindVertexArray(this.fsTriVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      return;
    }

    const source = surface.sourceId
      ? project.sources.find((s) => s.id === surface.sourceId)
      : undefined;
    const prog = source && source.type === 'shader' && source.glsl
      ? this.ensureSourceProgram(source)
      : null;
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
    const params = { ...source!.uniforms, ...surface.sourceParams };
    for (const [key, value] of Object.entries(params)) {
      this.setParamUniform(prog, `u_${key}`, value);
    }
    gl.bindVertexArray(this.fsTriVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /**
   * Compiles a source's shader, caching by source id. On a failed recompile
   * the previous working program is kept — a typo must never black the wall.
   */
  private ensureSourceProgram(source: Source): Program | null {
    const glsl = source.glsl ?? '';
    let res = this.sourceRes.get(source.id);
    if (res && res.glsl === glsl) return res.program;
    let program = res?.program ?? null;
    let error: string | null = null;
    try {
      const next = new Program(this.gl, FULLSCREEN_VS, SOURCE_HEADER + glsl);
      program?.dispose();
      program = next;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.warn(`shader "${source.name}" failed to compile; keeping last good:\n${error}`);
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
      gl.deleteVertexArray(res.vao);
      this.surfaceRes.delete(id);
    }
    const sourceIds = new Set(project.sources.map((s) => s.id));
    for (const [id, res] of this.sourceRes) {
      if (sourceIds.has(id)) continue;
      res.program?.dispose();
      this.sourceRes.delete(id);
    }
  }
}

export function hexToRgb01(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
