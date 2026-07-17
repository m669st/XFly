import { engine, log } from './state'






















const VERT = `#version 300 es
precision highp float;
out vec2 uv;
void main(){
  vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2);
  uv = p;
  gl_Position = vec4(p*2.0-1.0, 0.0, 1.0);
}`


const FRAG_CLEAN = `#version 300 es
precision highp float;
in vec2 uv; out vec4 frag;
uniform sampler2D tex;
uniform vec2 texSize;
uniform float deblockAmt; // 0..1
uniform float deringAmt;  // 0..1

float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
vec3 tap(vec2 o, vec2 px){ return texture(tex, uv + o*px).rgb; }

// H.264 transforms are 4x4 inside 16x16 macroblocks; the steps that survive to be
// visible at streaming bitrates sit on the 8-pixel grid. Every standard stream
// height is a multiple of 8, so the grid holds whichever way the frame is flipped.
const float GRID = 8.0;

// One axis of deblocking. The sampling direction is mirrored for the far side of
// the boundary, which makes the same correction formula apply to both — p0 and q0
// are symmetric under it.
vec3 deblockAxis(vec2 px, vec2 dir, float coord, float amt){
  float m = mod(floor(coord), GRID);
  float side = m == GRID - 1.0 ? 1.0 : (m == 0.0 ? -1.0 : 0.0);
  if (side == 0.0) return vec3(0.0);

  vec2 d = dir * side;
  vec3 p0 = tap(vec2(0.0), px);
  vec3 p1 = tap(-d, px);
  vec3 q0 = tap(d, px);
  vec3 q1 = tap(d*2.0, px);

  float step_  = abs(luma(p0) - luma(q0));
  float detail = max(abs(luma(p1) - luma(p0)), abs(luma(q1) - luma(q0)));

  // alpha: the largest step we are willing to call an artifact.
  // beta: how flat the surroundings must be for that to be credible.
  float alpha = 0.10 * amt;
  float beta  = 0.045 * amt;
  if (step_ >= alpha || detail >= beta) return vec3(0.0);

  vec3 delta = (q0 - p0)*0.5 + (p1 - q1)*0.125;
  float limit = alpha * 0.5;
  return clamp(delta, vec3(-limit), vec3(limit)) * amt;
}

vec3 dering(vec3 c, vec2 px, float amt){
  const float SIGMA_R = 0.075; // below this, wobble is noise; above it, an edge
  vec3 sum = c; float wsum = 1.0;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      if (x == 0 && y == 0) continue;
      vec3 s = tap(vec2(float(x), float(y)), px);
      float ws = exp(-float(x*x + y*y) * 0.5);
      float dl = luma(s) - luma(c);
      float wr = exp(-(dl*dl) / (2.0*SIGMA_R*SIGMA_R));
      float w = ws * wr;
      sum += s * w; wsum += w;
    }
  }
  return mix(c, sum / wsum, amt);
}

void main(){
  vec2 px = 1.0 / texSize;
  vec2 pos = uv * texSize;
  vec3 c = texture(tex, uv).rgb;
  if (deblockAmt > 0.0){
    c += deblockAxis(px, vec2(1.0, 0.0), pos.x, deblockAmt);
    c += deblockAxis(px, vec2(0.0, 1.0), pos.y, deblockAmt);
  }
  if (deringAmt > 0.0) c = dering(c, px, deringAmt);
  frag = vec4(clamp(c, 0.0, 1.0), 1.0);
}`


const FRAG_UPSCALE = `#version 300 es
precision highp float;
in vec2 uv; out vec4 frag;
uniform sampler2D tex; uniform vec2 texSize;
uniform float paramB, paramC;

float mitchell(float x){
  x = abs(x);
  float x2 = x*x, x3 = x2*x;
  if (x < 1.0) {
    return ((12.0 - 9.0*paramB - 6.0*paramC)*x3
          + (-18.0 + 12.0*paramB + 6.0*paramC)*x2
          + (6.0 - 2.0*paramB)) / 6.0;
  }
  if (x < 2.0) {
    return ((-paramB - 6.0*paramC)*x3
          + (6.0*paramB + 30.0*paramC)*x2
          + (-12.0*paramB - 48.0*paramC)*x
          + (8.0*paramB + 24.0*paramC)) / 6.0;
  }
  return 0.0;
}

void main(){
  vec2 texel = 1.0 / texSize;
  // -0.5 puts us in "sample centre" space, where whole numbers land on texels.
  vec2 c = uv * texSize - 0.5;
  vec2 f = fract(c);
  vec2 base = floor(c);

  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  // 4x4 neighbourhood: the cubic kernel is zero past |x| >= 2, so this is the
  // whole of its support and nothing is being approximated away.
  for (int j = -1; j <= 2; j++){
    for (int i = -1; i <= 2; i++){
      vec2 sp = (base + vec2(float(i), float(j)) + 0.5) * texel;
      float w = mitchell(float(i) - f.x) * mitchell(float(j) - f.y);
      sum += texture(tex, sp).rgb * w;
      wsum += w;
    }
  }
  // Normalised rather than trusted to sum to 1: it does in exact arithmetic, and
  // the negative lobes make the error visible as ringing when it does not.
  frag = vec4(clamp(sum / wsum, 0.0, 1.0), 1.0);
}`


const FRAG_BLIT = `#version 300 es
precision highp float;
in vec2 uv; out vec4 frag;
uniform sampler2D tex;
void main(){ frag = vec4(texture(tex, uv).rgb, 1.0); }`


const FRAG_SHARPEN = `#version 300 es
precision highp float;
in vec2 uv; out vec4 frag;
uniform sampler2D tex; uniform vec2 texSize; uniform float amount;
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
void main(){
  vec2 px = 1.0/texSize;
  vec3 c  = texture(tex, uv).rgb;
  vec3 n  = texture(tex, uv+vec2(0.0,-px.y)).rgb;
  vec3 s  = texture(tex, uv+vec2(0.0, px.y)).rgb;
  vec3 e  = texture(tex, uv+vec2( px.x,0.0)).rgb;
  vec3 w  = texture(tex, uv+vec2(-px.x,0.0)).rgb;
  // contrast-adaptive: reduce sharpen where local contrast (= likely artifacts) is high
  float mn = min(luma(c), min(min(luma(n),luma(s)), min(luma(e),luma(w))));
  float mx = max(luma(c), max(max(luma(n),luma(s)), max(luma(e),luma(w))));
  float contrast = mx - mn;
  float w2 = amount * (1.0 - smoothstep(0.15, 0.6, contrast));
  vec3 sharp = c*(1.0+4.0*w2) - (n+s+e+w)*w2;
  frag = vec4(clamp(sharp,0.0,1.0), 1.0);
}`




function mitchellParams(boost: number): { B: number; C: number } {
  const t = Math.min(1, Math.max(0, boost / 5))
  const C = t * 0.5
  return { B: 1 - 2 * C, C }
}

export class Upscaler {
  private canvas: HTMLCanvasElement | null = null
  private gl: WebGL2RenderingContext | null = null
  private progClean: WebGLProgram | null = null
  private progUp: WebGLProgram | null = null
  private progSharp: WebGLProgram | null = null
  private progBlit: WebGLProgram | null = null
  private videoTex: WebGLTexture | null = null
  private cleanTex: WebGLTexture | null = null
  private interTex: WebGLTexture | null = null
  private fbo: WebGLFramebuffer | null = null
  private running = false
  private rvfcId = 0
  private ema = 20
  private interW = 0
  private interH = 0
  private cleanW = 0
  private cleanH = 0
  private uCleanSize: WebGLUniformLocation | null = null
  private uCleanDeblock: WebGLUniformLocation | null = null
  private uCleanDering: WebGLUniformLocation | null = null
  private uUpSize: WebGLUniformLocation | null = null
  private uUpB: WebGLUniformLocation | null = null
  private uUpC: WebGLUniformLocation | null = null
  private uSharpSize: WebGLUniformLocation | null = null
  private uSharpAmount: WebGLUniformLocation | null = null

  attach(video: HTMLVideoElement): void {
    engine.video = video
    this.apply()
  }


  apply(): void {
    const enhancer = (engine.settings.videoEnhancer as string) ?? 'xfly'
    if (enhancer === 'vsr') {
      this.stop()
      return
    }

    if (engine.video) this.setup()
    this.start()
  }

  feedBitrate(mbps: number): void {
    if (mbps > 0) this.ema = this.ema * 0.8 + mbps * 0.2
  }

  private setup(): void {
    if (this.canvas) return
    const canvas = document.createElement('canvas')
    canvas.id = 'xfly-clarity'
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%',
      objectFit: 'contain', zIndex: '2', pointerEvents: 'none', background: '#000',
      display: 'none',
    } as CSSStyleDeclaration)
    document.body.appendChild(canvas)
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false })
    if (!gl) { log('warn', 'WebGL2 unavailable — clarity boost off'); return }
    this.canvas = canvas
    this.gl = gl


    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    this.progClean = this.program(VERT, FRAG_CLEAN)
    this.progUp = this.program(VERT, FRAG_UPSCALE)
    this.progSharp = this.program(VERT, FRAG_SHARPEN)
    this.progBlit = this.program(VERT, FRAG_BLIT)
    this.uCleanSize = gl.getUniformLocation(this.progClean!, 'texSize')
    this.uCleanDeblock = gl.getUniformLocation(this.progClean!, 'deblockAmt')
    this.uCleanDering = gl.getUniformLocation(this.progClean!, 'deringAmt')
    this.uUpSize = gl.getUniformLocation(this.progUp!, 'texSize')
    this.uUpB = gl.getUniformLocation(this.progUp!, 'paramB')
    this.uUpC = gl.getUniformLocation(this.progUp!, 'paramC')
    this.uSharpSize = gl.getUniformLocation(this.progSharp!, 'texSize')
    this.uSharpAmount = gl.getUniformLocation(this.progSharp!, 'amount')
    this.videoTex = this.texture()
    this.cleanTex = this.texture()
    this.interTex = this.texture()
    this.fbo = gl.createFramebuffer()
  }

  private start(): void {
    if (this.running || !this.gl || !engine.video) return

    if (this.canvas) this.canvas.style.display = 'block'
    this.running = true
    const video = engine.video
    const tick = () => {
      if (!this.running) return
      this.render(video)
      this.rvfcId = (video as any).requestVideoFrameCallback(tick)
    }
    if ((video as any).requestVideoFrameCallback) this.rvfcId = (video as any).requestVideoFrameCallback(tick)
    else this.rvfcLoopFallback(video)
  }

  private rvfcLoopFallback(video: HTMLVideoElement): void {
    const loop = () => { if (!this.running) return; this.render(video); requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
  }

  private stop(): void {
    this.running = false
    if (this.canvas) this.canvas.style.display = 'none'
  }

  private render(video: HTMLVideoElement): void {
    const gl = this.gl
    const canvas = this.canvas
    if (!gl || !canvas || !video.videoWidth) return
    const vw = video.videoWidth
    const vh = video.videoHeight




    const dpr = window.devicePixelRatio || 1
    const boxW = Math.max(1, Math.round(window.innerWidth * dpr))
    const boxH = Math.max(1, Math.round(window.innerHeight * dpr))
    const scale = Math.min(3, Math.max(1, Math.min(boxW / vw, boxH / vh)))
    const dispW = Math.round(vw * scale)
    const dispH = Math.round(vh * scale)
    if (canvas.width !== dispW || canvas.height !== dispH) {
      canvas.width = dispW
      canvas.height = dispH
    }


    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)



    if ((engine.settings.videoEnhancer as string) === 'off') {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, dispW, dispH)
      gl.useProgram(this.progBlit)
      gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      return
    }



    const deblock = 0.2 * (engine.settings.deblock ?? 0)
    const dering = 0.2 * (engine.settings.dering ?? 0)
    let source = this.videoTex
    if (deblock > 0 || dering > 0) {
      if (this.cleanW !== vw || this.cleanH !== vh) {
        gl.bindTexture(gl.TEXTURE_2D, this.cleanTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, vw, vh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        this.cleanW = vw
        this.cleanH = vh
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.cleanTex, 0)
      gl.viewport(0, 0, vw, vh)
      gl.useProgram(this.progClean)
      gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
      gl.uniform2f(this.uCleanSize, vw, vh)
      gl.uniform1f(this.uCleanDeblock, deblock)
      gl.uniform1f(this.uCleanDering, dering)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      source = this.cleanTex
    }




    if (this.interW !== dispW || this.interH !== dispH) {
      gl.bindTexture(gl.TEXTURE_2D, this.interTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, dispW, dispH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      this.interW = dispW
      this.interH = dispH
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.interTex, 0)
    gl.viewport(0, 0, dispW, dispH)
    gl.useProgram(this.progUp)
    gl.bindTexture(gl.TEXTURE_2D, source)
    gl.uniform2f(this.uUpSize, vw, vh)


    const mn = mitchellParams((engine.settings.clarityBoost as number) ?? 1)
    gl.uniform1f(this.uUpB, mn.B)
    gl.uniform1f(this.uUpC, mn.C)
    gl.drawArrays(gl.TRIANGLES, 0, 3)


    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, dispW, dispH)
    gl.useProgram(this.progSharp)
    gl.bindTexture(gl.TEXTURE_2D, this.interTex)
    gl.uniform2f(this.uSharpSize, dispW, dispH)

    const base = 0.08 * (engine.settings.claritySharpen ?? 2)
    const factor = engine.settings.clarityAdaptive === false ? 1 : Math.min(1, Math.max(0.15, this.ema / 15))
    gl.uniform1f(this.uSharpAmount, base * factor)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private texture(): WebGLTexture {
    const gl = this.gl!
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl!
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) log('error', 'shader: ' + gl.getShaderInfoLog(s))
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    return p
  }
}

export const upscaler = new Upscaler()
