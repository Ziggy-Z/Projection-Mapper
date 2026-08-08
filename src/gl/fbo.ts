/** RGBA8 offscreen render target. */
export class Fbo {
  texture!: WebGLTexture;
  framebuffer!: WebGLFramebuffer;
  width = 0;
  height = 0;

  constructor(
    private gl: WebGL2RenderingContext,
    width: number,
    height: number,
  ) {
    this.allocate(width, height);
  }

  private allocate(width: number, height: number): void {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fb = gl.createFramebuffer();
    if (!tex || !fb) throw new Error('FBO allocation failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.texture = tex;
    this.framebuffer = fb;
    this.width = width;
    this.height = height;
  }

  /** Reallocates if the requested size differs. Returns true if reallocated. */
  ensureSize(width: number, height: number): boolean {
    if (width === this.width && height === this.height) return false;
    this.dispose();
    this.allocate(width, height);
    return true;
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteFramebuffer(this.framebuffer);
  }
}
