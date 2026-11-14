/* =====================================================================
   Vervette Brush — réplica exacta del motor (ingeniería inversa)
   Port fiel de Vervette Fluid Sandbox v1.6 (taron.de) a un módulo propio.
   Los GLSL están verbatim en glsl/*.frag|vert (extracted de los strings
   ofuscados del original). La secuencia de frames replica update().
   ===================================================================== */
(function (global) {
  'use strict';

  function createEngine(canvas, SHADERS, opts) {
    opts = opts || {};

    // ---------- estado / parámetros (defaults = los del sitio en vivo) ----------
    const P = {
      brushSize: 100 / canvas.width,
      brushSoft: 0.5,
      brushOpacity: 1.0,
      brushMatAdd: 0.5,
      noiseScale: 72.25,       // valor ya mapeado (slider 15)
      noiseIterations: 2.5,    // 1 + slider*0.1
      noiseContrast: 0.75,
      noiseBrightness: 0.2,
      isNoiseInverted: true,
      isTexture: true,
      isSizeDynamic: true,
      fluidSpeed: 0.668740304976422,
      fluidSpeedMul: 1,      // cuánto avanza el fluido por frame (1 = como antes, 3 = 300 en el slider)
      fluidCurl: 0.02,
      fluidIterations: 1.76,
      fluidSlip: 0.5,
      fluidSmudge: 1.0,
      isFluid: true,
      isDrying: true,
      isAdditive: false,
      isReplace: false,
      isSpeedSize: false,
      grano: 0,
      granoEscala: 20,
      fluidLife: 0.5,
      fluidLive: false,   // el pincel suma velocidad al fluido (no lo pisa) cuando esta en true
      isPudMode: false,
      isAutoStop: false,
      isLighting: true,
      isImageLighting: false,
      isImageMaterial: false,     // MATERIAL IMAGE (nuestro: materia del cuadro)
      isImageRefraction: false,   // REFRACTION IMAGE (nuestro: la pintura refracta)
      refrStrength: 3.2,
      isBackground: false,        // VER IMAGEN: el cuadro se ve de fondo
      bumpHeight: 0.625,
      bumpImgHeight: 0.0,
      glossiness: 0.75,
      camHeight: 0.75,
      sourceRatio: 1.0,
      lightPos: { x: -0.35, y: 4.2, z: -4.5 },
      paintMode: 0,
      isDither: true,
      isShowCursor: false,
      bristle: 0,               // 0 = pincel original, 1 = cerda orientada
      noiseStretch: 1,          // anisotropía de la cerda a lo largo del trazo
      Col: [0, 0, 0],
      isFirstDown: true,
      isShiftDown: false
    };

    // setters equivalentes a los sliders del original
    const S = {
      setBrushSize: v => { P.brushSize = v / canvas.width; },
      setBrushSoft: v => { P.brushSoft = v * 0.01; },
      setBrushOpacity: v => { P.brushOpacity = v / 255; },
      setBrushMatAdd: v => { P.brushMatAdd = v * 0.01; },
      setNoiseScale: v => {
        P.noiseIterations = 1 + v * 0.1;
        let t = 1 - v * 0.01; t *= t; t = 1 - t;
        P.noiseScale = 100 - t * 100;
      },
      setNoiseContrast: v => { P.noiseContrast = v * 0.01; },
      setNoiseBrightness: v => { P.noiseBrightness = v * 0.01; },
      setFluidSpeed: v => {
        // el slider va 0..110: hasta 100 es el rango de siempre y el resto
        // acelera el ADVENCTO (no la disipación, que no puede pasar de 1)
        // hasta 100 queda igual que siempre (1x); de 100 a 110 llega a 1.1x
        P.fluidSpeedMul = (v <= 100) ? 1 : Math.min(3, v / 100);
        P.fluidSpeed = Math.min(1, Math.pow(Math.max(0.0001, v * 0.01), 0.25));
        let c = v * 0.01; c *= c;
        P.fluidIterations = 1 + c * 19;
        P.fluidCurl = c * 0.5;
      },
      setFluidSmudge: v => { P.fluidSmudge = v * 0.01; },
      setFluidSlip: v => { P.fluidSlip = 1 - v * 0.01; },
      setCamHeight: v => { P.camHeight = v * 0.01 * (v * 0.01) * 3; },
      setGlossiness: v => { P.glossiness = v * 0.01; },
      setBumpHeight: v => {
        let b = 1 - v * 0.01;
        P.bumpHeight = 10 * Math.pow(b, 4);
      }
    };

    // ---------- contexto GL ----------
    function path(tag) { return gl.getShaderInfoLog(tag); }
    const attrs = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: true };
    let gl = canvas.getContext('webgl2', attrs);
    const isWebGL2 = !!gl;
    if (!isWebGL2) gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('No GL context');

    let halfFloat, supportLinearFiltering;
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : 0;
    function getSupportedFormat(internalFormat, format, type) {
      if (!supportRenderTextureFormat(internalFormat, format, type)) {
        switch (internalFormat) {
          case gl.R16F: return getSupportedFormat(gl.RG16F, gl.RG, type);
          case gl.RG16F: return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
          default: return null;
        }
      }
      return { internalFormat, format };
    }
    function supportRenderTextureFormat(internalFormat, format, type) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }
    const formatRGBA = getSupportedFormat(gl.RGBA16F, gl.RGBA, halfFloatTexType);
    const formatRG = getSupportedFormat(gl.RG16F, gl.RG, halfFloatTexType);
    const formatR = getSupportedFormat(gl.R16F, gl.RED, halfFloatTexType);
    const ext = { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering };

    // ---------- shaders ----------
    function compileShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    class GLProgram {
      constructor(vs, fs, name) {
        this.name = name;
        this.uniforms = {};
        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.bindAttribLocation(this.program, 0, 'aPosition');
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(name + ': ' + gl.getProgramInfoLog(this.program));
        const n = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) {
          const nm = gl.getActiveUniform(this.program, i).name;
          this.uniforms[nm] = gl.getUniformLocation(this.program, nm);
        }
      }
      bind() { gl.useProgram(this.program); }
    }

    const baseVertexShader = compileShader(gl.VERTEX_SHADER, SHADERS.base);
    const P_ = {
      clear: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.clear), 'clear'),
      display: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.display), 'display'),
      displayLight: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.display_light), 'displayLight'),
      displayImg: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.display_img), 'displayImg'),
      paint: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.paint), 'paint'),
      paintVec: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.paint_vec), 'paintVec'),
      advection: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, supportLinearFiltering ? SHADERS.advection : SHADERS.advection_manual), 'advection'),
      divergence: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.divergence), 'divergence'),
      pressure: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.pressure), 'pressure'),
      gradientSubtract: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.gradient_subtract), 'gradientSubtract'),
      gradientDry: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.gradient_dry), 'gradientDry'),
      // corriente: advecta la densidad con una corriente procedural que sigue al pincel
      corriente: new GLProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, SHADERS.corriente), 'corriente')
    };

    // ---------- buffers ----------
    let textureWidth, textureHeight, density, velocity, divergence, pressure;
    let dirty = true;

    function createFBO(unit, w, h, internalFormat, format, type, param) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return [texture, fbo, unit];
    }
    function createDoubleFBO(unit, w, h, internalFormat, format, type, param) {
      let a = createFBO(unit, w, h, internalFormat, format, type, param);
      let b = createFBO(unit + 1, w, h, internalFormat, format, type, param);
      return {
        get read() { return a; },
        get write() { return b; },
        swap() { const t = a; a = b; b = t; }
      };
    }
    // ---------- imagenes (MATERIAL / REFRACTION) ----------
    let matTex = null, refrTex = null, blankTex = null, bgTex = null;
    const bgFit = { x: 1, y: 1 };
    function texBlanca() {
      if (blankTex) return blankTex;
      blankTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, blankTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      return blankTex;
    }
    // ---- texturas de los pinceles de imagen (cache por id) ----
    // Las imagenes llegan de 200x200 desde el servidor: se suben una vez a la GPU
    // y cada pincelada solo elige cual usar.
    const imgTexCache = new Map();

    function texDeImagen(img) {
      const t = gl.createTexture();
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.activeTexture(gl.TEXTURE0 + 8);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      return t;
    }

    // fondo de referencia (VER IMAGEN): la imagen cubre el lienzo como background-size:cover
    function setFondo(img, iw, ih) {
      if (bgTex) { gl.deleteTexture(bgTex); bgTex = null; }
      bgTex = img ? texDeImagen(img) : null;
      P.isBackground = !!img;
      if (img && iw && ih) {
        const ac = canvas.width / canvas.height, ai = iw / ih;
        if (ac > ai) { bgFit.x = 1; bgFit.y = ai / ac; }
        else { bgFit.x = ac / ai; bgFit.y = 1; }
      }
    }

    function initFramebuffers() {
      textureWidth = gl.drawingBufferWidth;
      textureHeight = gl.drawingBufferHeight;
      const f = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
      density = createDoubleFBO(2, textureWidth, textureHeight, ext.formatRGBA.internalFormat, ext.formatRGBA.format, ext.halfFloatTexType, f);
      velocity = createDoubleFBO(0, textureWidth, textureHeight, ext.formatRG.internalFormat, ext.formatRG.format, ext.halfFloatTexType, f);
      divergence = createFBO(4, textureWidth, textureHeight, ext.formatR.internalFormat, ext.formatR.format, ext.halfFloatTexType, gl.NEAREST);
      pressure = createDoubleFBO(6, textureWidth, textureHeight, ext.formatR.internalFormat, ext.formatR.format, ext.halfFloatTexType, gl.NEAREST);
    }
    function deleteBuffers() {
      [density.read, density.write, velocity.read, velocity.write, pressure.read, pressure.write].forEach(t => {
        gl.deleteFramebuffer(t[1]); gl.deleteTexture(t[0]);
      });
      gl.deleteFramebuffer(divergence[1]); gl.deleteTexture(divergence[0]);
    }

    // ---------- quad ----------
    const fullArrayBuffer = gl.createBuffer();
    const fullElementBuffer = gl.createBuffer();
    (function createFullFrame() {
      gl.bindBuffer(gl.ARRAY_BUFFER, fullArrayBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, fullElementBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
      gl.enableVertexAttribArray(0);
    })();
    function blit(target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
    function copyBlit(src, dst) {
      if (isWebGL2) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src[1]);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst[1]);
        gl.blitFramebuffer(0, 0, textureWidth, textureHeight, 0, 0, textureWidth, textureHeight, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      } else {
        P_.clear.bind();
        gl.uniform1i(P_.clear.uniforms.uTexture, src[2]);
        gl.uniform1f(P_.clear.uniforms.value, 1.0);
        blit(dst[1]);
      }
    }
    function clearBuffer(fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.write[1]);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      fbo.swap();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.write[1]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    initFramebuffers();

    // ---------- tips ----------
    function brushTipStruct() {
      this.id = -1; this.x = 0; this.y = 0; this.dx = 0; this.dy = 0;
      this.path = []; this.down = false; this.moved = false;
      this.color = [30, 0, 300]; this.speed = 0; this.filter = 0; this.load = 1;
      this.rad = 0; this.soft = 0; this.axis = null; this.origin = null; this.seed = null; this.opac = 0;
      this.remoto = false;   // pincelada que llega por socket (alimenta la corriente remota)
      this.est = null;       // estilo del pincel que la pintó: cerda, veta, ruido, punta
    }
    const brushTips = [new brushTipStruct()];
    let paintStack = [];
    let hasPainted = false;

    // ---------- cerda orientada (Van Gogh) ----------
    // uBristle = 0 -> camino original exacto (la réplica sigue siendo 1:1)
    function setBristle(prog, axis, origin, seed, bristle, stretch) {
      const u = prog.uniforms;
      gl.uniform1f(u.uBristle, bristle > 0 ? 1 : 0);
      gl.uniform2f(u.uNoiseAxis, axis.x, axis.y);
      gl.uniform2f(u.uNoiseOrigin, origin.x, origin.y);
      gl.uniform2f(u.uNoiseSeed, seed[0], seed[1]);
      gl.uniform1f(u.uNoiseStretch, stretch > 1 ? stretch : 1);
    }

    // ---------- radio efectivo ----------
    // Un solo lugar donde se decide el radio del pincel: lo usa paint() y lo usa
    // el cliente para MANDAR el radio exacto de cada huella (si manda el tamaño
    // pelado, el que recibe ve un trazo de ancho constante y no el de acá).
    function radioDe(tip, speedN) {
      if (tip.rad > 0) return tip.rad / canvas.height;
      if (P.isSpeedSize)
        // pincel "tamaño por velocidad": lento = fino (15% del tamaño), rápido = tamaño pleno
        return Math.max(1 / canvas.height, P.brushSize * (0.10 + 0.95 * speedN));
      if (P.isSizeDynamic) return Math.max(1 / canvas.height, speedN * P.brushSize);
      return P.brushSize;
    }
    function speedNDe(tip) {
      let s = Math.min(1, tip.speed);
      if (P.isSpeedSize) s = Math.min(1, s * 2.2);   // el pincel por velocidad responde mas
      return s;
    }

    // ---------- PAINT (idéntico a paint() del original) ----------
    function paint(tip) {
      let x = tip.x, y = tip.y, dx = tip.dx, dy = tip.dy;
      tip.path.length > 2 && tip.path.shift();
      let color = tip.color;                    // [r,g,b] 0..1

      let point = { x: x / canvas.width, y: 1 - y / canvas.height };
      let movecNorm = { x: 0, y: -1 };
      const aspect = canvas.width / canvas.height;
      let moLen = 0, speedN = 0;

      if (!P.isFirstDown) {
        let sq = dx * dx + dy * dy;
        if (sq > 0) {
          let len = Math.sqrt(sq);
          movecNorm = { x: dx / len, y: -dy / len };
          moLen = len / canvas.height;
          tip.filter += len * 0.002;
          speedN = speedNDe(tip);
        }
      }
      const radius = radioDe(tip, speedN);
      const axis = tip.axis || { x: 1, y: 0 };
      const origin = tip.origin || { x: 0, y: 0 };
      const seed = tip.seed || [0, 0];
      // ESTILO de ESTA pincelada: viene del pincel del que la pintó (tip.est). Si no viene
      // (cliente viejo) manda el panel de este cliente.
      // TODO lo que paint() lee del panel viaja acá: si algo queda afuera, el mismo
      // trazo se ve distinto en cada pantalla. Lo único que NO viaja son los fluidos
      // y la luz, que son parámetros GLOBALES de la sala (valen para todos).
      const est = tip.est || null;
      // PINCEL DE IMAGEN: si la pincelada trae imagen (est.im) y la textura esta
      // cargada, el sello se pinta con esa imagen. Si no esta, sigue procedural.
      let imgTex = null;
      if (est && est.im) imgTex = imgTexCache.get(String(est.im)) || null;
      const en = (k, def) => (est && typeof est[k] === 'number' && isFinite(est[k])) ? est[k] : def;
      const bo = (k, def) => (est && typeof est[k] === 'number') ? !!est[k] : def;
      const bristleV = en('br', P.bristle);
      const stretchV = en('st', P.noiseStretch);
      const granoV = en('g', P.grano || 0);
      const granoEscV = en('ge', P.granoEscala || 20);
      const noiseScaleV = en('ns', P.isTexture ? P.noiseScale : 100);
      const noiseContrastV = en('nc', P.noiseContrast);
      const noiseBrightnessV = en('nb', P.noiseBrightness);
      const invertedV = bo('ni', P.isNoiseInverted);
      const iterationsV = Math.round(en('it', P.noiseIterations));
      const matAddV = en('ma', P.brushMatAdd);
      const paintModeV = Math.round(en('pm', P.paintMode));
      const replaceV = bo('rp', P.isReplace);
      const additiveV = bo('ad', P.isAdditive);
      const opacV = en('op', P.brushOpacity) * (tip.opac > 0 ? tip.opac : 1);
      const softV = en('so', (tip.soft > 0 ? tip.soft : P.brushSoft));
      const softness = softV * radius;

      if (!P.isShiftDown) {
        gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
        P_.paint.bind();
        gl.uniform1f(P_.paint.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform2f(P_.paint.uniforms.point, point.x, point.y);
        gl.uniform2f(P_.paint.uniforms.movec, dx / canvas.width, -dy / canvas.height);
        gl.uniform2f(P_.paint.uniforms.movecNorm, movecNorm.x, movecNorm.y);
        gl.uniform1f(P_.paint.uniforms.moLen, moLen);
        gl.uniform1i(P_.paint.uniforms.isFirst, (P.isFirstDown || P.paintMode == 0) ? 1 : 0);
        gl.uniform1f(P_.paint.uniforms.uReplace, replaceV ? 1 : 0);
        gl.uniform1f(P_.paint.uniforms.uGrano, granoV);
        gl.uniform1f(P_.paint.uniforms.uGranoEscala, granoEscV);
        gl.uniform1f(P_.paint.uniforms.softness, softness);
        gl.uniform1f(P_.paint.uniforms.radius, radius);
        gl.uniform1f(P_.paint.uniforms.brushOpacity, opacV);
        gl.uniform2f(P_.paint.uniforms.noiseOffset, noiseOffset.x, noiseOffset.y);
        gl.uniform1f(P_.paint.uniforms.noiseScale, noiseScaleV);
        gl.uniform1f(P_.paint.uniforms.noiseContrast, noiseContrastV);
        gl.uniform1f(P_.paint.uniforms.noiseBrightness, noiseBrightnessV);
        gl.uniform1i(P_.paint.uniforms.inverted, invertedV ? 1 : 0);
        gl.uniform1f(P_.paint.uniforms.brushMatAdd, matAddV);
        gl.uniform1i(P_.paint.uniforms.iterations, iterationsV);
        gl.uniform1i(P_.paint.uniforms.uTarget, density.read[2]);
        if (imgTex) {
          gl.activeTexture(gl.TEXTURE0 + 9);
          gl.bindTexture(gl.TEXTURE_2D, imgTex);
          gl.uniform1i(P_.paint.uniforms.uBrushImg, 9);
        }
        gl.uniform1f(P_.paint.uniforms.uUseImg, imgTex ? 1 : 0);
        if (imgTex) {
          const aspCli = (canvas.clientHeight > 0) ? (canvas.clientWidth / canvas.clientHeight) : aspect;
          gl.uniform1f(P_.paint.uniforms.uImgClientAspect, aspCli);
        }
        gl.uniform3f(P_.paint.uniforms.color, color[0], color[1], color[2]);
        gl.uniform1i(P_.paint.uniforms.paintMode, paintModeV);
        setBristle(P_.paint, axis, origin, seed, bristleV, stretchV);
        blit(density.write[1]);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        if (P.isFluid) {
          dx *= P.fluidSlip; dy *= P.fluidSlip;
          P_.paintVec.bind();
          gl.uniform1f(P_.paintVec.uniforms.aspectRatio, aspect);
          gl.uniform2f(P_.paintVec.uniforms.point, point.x, point.y);
          gl.uniform2f(P_.paintVec.uniforms.movec, dx / canvas.width, -dy / canvas.height);
          gl.uniform2f(P_.paintVec.uniforms.movecNorm, movecNorm.x, movecNorm.y);
          gl.uniform1f(P_.paintVec.uniforms.moLen, moLen);
          gl.uniform1f(P_.paintVec.uniforms.softness, softness);
          gl.uniform1f(P_.paintVec.uniforms.radius, radius);
          gl.uniform2f(P_.paintVec.uniforms.noiseOffset, noiseOffset.x, noiseOffset.y);
          gl.uniform1f(P_.paintVec.uniforms.noiseScale, noiseScaleV);
          gl.uniform1f(P_.paintVec.uniforms.noiseContrast, noiseContrastV);
          gl.uniform1i(P_.paintVec.uniforms.inverted, invertedV ? 1 : 0);
          gl.uniform1i(P_.paintVec.uniforms.uTarget, velocity.read[2]);
          gl.uniform1f(P_.paintVec.uniforms.noiseBrightness, noiseBrightnessV);
          gl.uniform1i(P_.paintVec.uniforms.iterations, iterationsV);
          gl.uniform1i(P_.paintVec.uniforms.isAdditive, additiveV ? 1 : 0);
          gl.uniform3f(P_.paintVec.uniforms.color, dx, -dy, 1);
          setBristle(P_.paintVec, axis, origin, seed, bristleV, stretchV);
          blit(velocity.write[1]);
        }

        // la mano arrastra liquido: esto alimenta la corriente
        if (P.fluidLive && !additiveV) {
          // La corriente se alimenta del MOVIMIENTO REAL de la mano, no del hecho de pintar.
          // Ojo: un mouse apoyado manda pointermove de 1-2 px (temblor) y con un umbral binario
          // eso recargaba la energia a full y el remolino no se apagaba nunca. Por eso el
          // objetivo es proporcional a la velocidad y hay zona muerta (~3 px por evento).
          // Tres casos:
          //  a) pincelada del AUTOPINTADO (tip.auto): la corriente va a pleno y la mueve el
          //     avance de la propia pincelada -> el ruido se mezcla aunque nadie toque el mouse.
          //  b) mano real: manda la velocidad de la mano (tip.hand).
          //  c) mano quieta (dwell): tip.hand ~ 0 -> la corriente se apaga y no queda girando.
          // Las pinceladas que llegan por socket alimentan SU corriente (fuente 1): traen la
          // velocidad de la mano del que pinta, no la mía (si no, se veían como sellos).
          const cor = corrientes[tip.remoto ? 1 : 0];
          const esAuto = tip.auto === true;
          const velMano = esAuto
            ? 99
            : ((typeof tip.hand === 'number') ? tip.hand : Math.hypot(dx, dy));
          // 0.65: mezcla clara pero sin borrar el grano de la capa de ruido
          const objetivo = esAuto ? 0.65 : Math.min(1, Math.max(0, (velMano - 3) / 9));
          cor.energia = Math.max(cor.energia * 0.90, objetivo);
          if (cor.energia > 0.03) cor.activa = true;
          else { cor.energia = 0; cor.activa = false; }
          cor.x = point.x;
          cor.y = point.y;
          // la corriente trabaja sobre la zona del pincel, no sobre media pantalla
          cor.r = radius * 2.2;
          // desplazamiento por frame MUY chico (una pincelada no se desarma):
          // 30 px de mano por frame -> ~1.5 px de arrastre
          cor.vx = (dx / canvas.width) * 0.05;
          cor.vy = (-dy / canvas.height) * 0.05;
        }
        P.isFirstDown = false; hasPainted = true;
      }
    }

    const noiseOffset = { x: 0, y: 0 };

    // ---------- STEPS del frame (idénticos a update()) ----------
    // ---------- CORRIENTE (fluido vivo) ----------
    // El buffer de velocidad del motor queda en cero en esta integración, así que el
    // fluido no corre. La corriente es un pase propio: mueve la densidad con la
    // velocidad del pincel + un remolino a su alrededor, sin depender de ese buffer.
    // DOS FUENTES: una para mi mano y otra para las pinceladas que llegan por socket.
    // Con una sola, cada pincelada remota arrastraba el remolino a su posición y el
    // fluido saltaba entre los dos que pintan (se veía cortado). Cada una tiene su
    // punto, su energía y su inercia: dos personas pintando arrastran en su zona.
    const corrientes = [
      { x: 0.5, y: 0.5, vx: 0, vy: 0, r: 0, t: 0, energia: 0, activa: false },  // [0] mi mano
      { x: 0.5, y: 0.5, vx: 0, vy: 0, r: 0, t: 0, energia: 0, activa: false }   // [1] remoto
    ];
    const corriente = corrientes[0];   // compat: lo que había antes era la de la mano
    function stepCorriente(dt) {
      if (!P.fluidLive || !P.isFluid) return;
      for (const cor of corrientes) {
        if (!cor.activa) continue;
        P_.corriente.bind();
        gl.uniform1i(P_.corriente.uniforms.uTexture, density.read[2]);
        gl.uniform1f(P_.corriente.uniforms.uAspect, canvas.width / canvas.height);
        gl.uniform2f(P_.corriente.uniforms.uPos, cor.x, cor.y);
        // TODO se escala por la energia: si la mano se va, el remolino se desarma solo
        const e = cor.energia;
        gl.uniform2f(P_.corriente.uniforms.uVel, cor.vx * e, cor.vy * e);
        gl.uniform1f(P_.corriente.uniforms.uRadio, Math.max(0.012, cor.r));
        // veta: fraccion del arrastre (0.35). Con esto la pintura se estira siguiendo la
        // mano pero no gira alrededor del pincel (el remolino gigante que se veía al final)
        gl.uniform1f(P_.corriente.uniforms.uCurva, 0.35);
        blit(density.write[1]);
        density.swap();
        // inercia: al soltar la mano la corriente sigue un instante y se apaga.
        // (antes el remolino no decaia nunca y el ultimo punto quedaba girando para siempre)
        // VIDA: cuanto dura la corriente despues de soltar (0.86 = se apaga rapido, 0.995 = larga)
        cor.energia *= (0.86 + (P.fluidLife === undefined ? 0.5 : P.fluidLife) * 0.135);
        cor.vx *= 0.96; cor.vy *= 0.96;
        cor.t += dt * 0.016;
        if (cor.energia < 0.02) { cor.energia = 0; cor.activa = false; }
      }
    }

    function stepFluidAdvect(dt) {
      if (!(P.isFluid && !P.isPudMode)) return;
      const tx = { x: 1 / textureWidth, y: 1 / textureHeight };
      const sq = tx.x * tx.x + tx.y * tx.y;
      P_.advection.bind();
      const dtV = dt * (P.fluidSpeedMul || 1);
      gl.uniform2f(P_.advection.uniforms.texelSize, dtV * tx.x, dtV * tx.y);
      gl.uniform1f(P_.advection.uniforms.texelSqr, sq);
      gl.uniform1i(P_.advection.uniforms.uVelocity, velocity.read[2]);
      gl.uniform1i(P_.advection.uniforms.uSource, density.read[2]);
      gl.uniform1f(P_.advection.uniforms.dissipation, 1.0);
      gl.uniform1f(P_.advection.uniforms.smudge, supportLinearFiltering ? P.fluidSmudge : 0.5 * P.fluidSmudge);
      blit(density.write[1]);
      gl.uniform1i(P_.advection.uniforms.uVelocity, velocity.read[2]);
      gl.uniform1i(P_.advection.uniforms.uSource, velocity.read[2]);
      gl.uniform1f(P_.advection.uniforms.dissipation, P.fluidSpeed);
      gl.uniform1f(P_.advection.uniforms.smudge, 0.0);
      blit(velocity.write[1]);
    }

    function stepProject() {
      if (!P.isFluid) return;
      const tx = { x: 1 / textureWidth, y: 1 / textureHeight };
      P_.divergence.bind();
      gl.uniform2f(P_.divergence.uniforms.texelSize, tx.x, tx.y);
      gl.uniform1i(P_.divergence.uniforms.uVelocity, velocity.read[2]);
      gl.uniform1f(P_.divergence.uniforms.power, P.fluidCurl);
      blit(divergence[1]);

      P_.clear.bind();
      let tid = pressure.read[2];
      gl.activeTexture(gl.TEXTURE0 + tid);
      gl.bindTexture(gl.TEXTURE_2D, pressure.read[0]);
      gl.uniform1i(P_.clear.uniforms.uTexture, tid);
      gl.uniform1f(P_.clear.uniforms.value, 2 * P.fluidCurl);
      blit(pressure.write[1]);
      pressure.swap();

      if (!P.isPudMode) {
        P_.pressure.bind();
        gl.uniform2f(P_.pressure.uniforms.texelSize, tx.x, tx.y);
        gl.uniform1i(P_.pressure.uniforms.uDivergence, divergence[2]);
        tid = pressure.read[2];
        gl.uniform1i(P_.pressure.uniforms.uPressure, tid);
        gl.activeTexture(gl.TEXTURE0 + tid);
        // OJO: el original usa el float tal cual en la condición del for
        // (fluidIterations = 1.76 -> corre 2 iteraciones). No truncar.
        for (let i = 0; i < P.fluidIterations; i++) {
          gl.bindTexture(gl.TEXTURE_2D, pressure.read[0]);
          blit(pressure.write[1]);
          pressure.swap();
        }
        if (P.isDrying) {
          P_.gradientDry.bind();
          gl.uniform2f(P_.gradientDry.uniforms.texelSize, tx.x, tx.y);
          gl.uniform1i(P_.gradientDry.uniforms.uPressure, pressure.read[2]);
          gl.uniform1i(P_.gradientDry.uniforms.uVelocity, velocity.read[2]);
          gl.uniform1i(P_.gradientDry.uniforms.uPaint, density.read[2]);
          blit(velocity.write[1]);
        } else {
          P_.gradientSubtract.bind();
          gl.uniform2f(P_.gradientSubtract.uniforms.texelSize, tx.x, tx.y);
          gl.uniform1i(P_.gradientSubtract.uniforms.uPressure, pressure.read[2]);
          gl.uniform1i(P_.gradientSubtract.uniforms.uVelocity, velocity.read[2]);
          blit(velocity.write[1]);
        }
        velocity.swap();
      }
    }

    function displayRender(texel, mouse, aspect, showCursor) {
      const cursorWidth = 1 - 5 * texel.x / P.brushSize;
      if (P.isLighting) {
        if (P.isImageLighting) {
          P_.displayImg.bind();
          gl.uniform2f(P_.displayImg.uniforms.texelSize, texel.x, texel.y);
          gl.uniform1i(P_.displayImg.uniforms.isShowCursor, showCursor ? 1 : 0);
          gl.activeTexture(gl.TEXTURE0 + 10);
          gl.bindTexture(gl.TEXTURE_2D, bgTex || texBlanca());
          gl.uniform1i(P_.displayImg.uniforms.uBgTexture, 10);
          gl.uniform1i(P_.displayImg.uniforms.isUseBg, (P.isBackground && bgTex) ? 1 : 0);
          gl.uniform2f(P_.displayImg.uniforms.bgFit, bgFit.x, bgFit.y);
          gl.uniform3f(P_.displayImg.uniforms.mousePos, mouse.x, mouse.y, P.brushSize);
          gl.uniform1f(P_.displayImg.uniforms.cursorWidth, cursorWidth);
          gl.uniform1f(P_.displayImg.uniforms.bumpHeight, P.bumpImgHeight);
          gl.uniform1f(P_.displayImg.uniforms.aspectRatio, aspect);
          gl.uniform1f(P_.displayImg.uniforms.camHeight, P.camHeight);
          gl.uniform1i(P_.displayImg.uniforms.isDither, P.isDither ? 1 : 0);
          gl.uniform1i(P_.displayImg.uniforms.uTexture, density.read[2]);
          // sin textura de luz propia en la réplica
          gl.uniform1i(P_.displayImg.uniforms.uLightTexture, density.read[2]);
          // MATERIAL / REFRACTION IMAGE (unidades 8 y 9)
          gl.activeTexture(gl.TEXTURE0 + 8);
          gl.bindTexture(gl.TEXTURE_2D, matTex || texBlanca());
          gl.uniform1i(P_.displayImg.uniforms.uMatTexture, 8);
          gl.uniform1i(P_.displayImg.uniforms.isUseMaterial, (P.isImageMaterial && matTex) ? 1 : 0);
          gl.activeTexture(gl.TEXTURE0 + 9);
          gl.bindTexture(gl.TEXTURE_2D, refrTex || texBlanca());
          gl.uniform1i(P_.displayImg.uniforms.uRefrTexture, 9);
          gl.uniform1i(P_.displayImg.uniforms.isUseRefraction, (P.isImageRefraction && refrTex) ? 1 : 0);
          if (P_.displayImg.uniforms.refrStrength) gl.uniform1f(P_.displayImg.uniforms.refrStrength, P.refrStrength);
          if (P_.displayImg.uniforms.sourceRatio) gl.uniform1f(P_.displayImg.uniforms.sourceRatio, 1.0);
        } else {
          P_.displayLight.bind();
          gl.uniform2f(P_.displayLight.uniforms.texelSize, texel.x, texel.y);
          gl.uniform1i(P_.displayLight.uniforms.isShowCursor, showCursor ? 1 : 0);
          gl.activeTexture(gl.TEXTURE0 + 10);
          gl.bindTexture(gl.TEXTURE_2D, bgTex || texBlanca());
          gl.uniform1i(P_.displayLight.uniforms.uBgTexture, 10);
          gl.uniform1i(P_.displayLight.uniforms.isUseBg, (P.isBackground && bgTex) ? 1 : 0);
          gl.uniform2f(P_.displayLight.uniforms.bgFit, bgFit.x, bgFit.y);
          gl.uniform3f(P_.displayLight.uniforms.mousePos, mouse.x, mouse.y, P.brushSize);
          gl.uniform1f(P_.displayLight.uniforms.cursorWidth, cursorWidth);
          gl.uniform1f(P_.displayLight.uniforms.bumpHeight, P.bumpHeight);
          gl.uniform1f(P_.displayLight.uniforms.aspectRatio, aspect);
          gl.uniform1f(P_.displayLight.uniforms.glossiness, P.glossiness);
          let ld = [0.5, 0.5, 0.2];
          let l = Math.sqrt(ld[0] * ld[0] + ld[1] * ld[1] + ld[2] * ld[2]);
          gl.uniform3f(P_.displayLight.uniforms.lightDir, ld[0] / l, ld[1] / l, ld[2] / l);
          gl.uniform3f(P_.displayLight.uniforms.lightPos, P.lightPos.x, P.lightPos.y, P.lightPos.z);
          gl.uniform1i(P_.displayLight.uniforms.isDither, P.isDither ? 1 : 0);
          gl.uniform1i(P_.displayLight.uniforms.uTexture, density.read[2]);
        }
      } else {
        P_.display.bind();
        gl.uniform2f(P_.display.uniforms.texelSize, texel.x, texel.y);
        gl.uniform1i(P_.display.uniforms.isShowCursor, showCursor ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0 + 10);
        gl.bindTexture(gl.TEXTURE_2D, bgTex || texBlanca());
        gl.uniform1i(P_.display.uniforms.uBgTexture, 10);
        gl.uniform1i(P_.display.uniforms.isUseBg, (P.isBackground && bgTex) ? 1 : 0);
        gl.uniform2f(P_.display.uniforms.bgFit, bgFit.x, bgFit.y);
        gl.uniform3f(P_.display.uniforms.mousePos, mouse.x, mouse.y, P.brushSize);
        gl.uniform1f(P_.display.uniforms.cursorWidth, cursorWidth);
        gl.uniform1f(P_.display.uniforms.aspectRatio, aspect);
        gl.uniform1i(P_.display.uniforms.isDither, P.isDither ? 1 : 0);
        gl.uniform1i(P_.display.uniforms.uTexture, density.read[2]);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      blit(null);
    }

    // un frame completo. dt en "frames" (1.0 = 16.6ms, el tope del original)
    function frame(tips, dt) {
      dt = (dt === undefined) ? 1.0 : dt;
      gl.viewport(0, 0, textureWidth, textureHeight);
      gl.enable(gl.BLEND);
      density.swap(); if (P.isFluid) velocity.swap();
      const tip = brushTips[0];
      // MULTIDIBUJO: una pincelada remota trae SU color. El tip es uno solo y se
      // reusa, asi que hay que devolverle el color local al terminar el lote
      // (si no, el color del otro se le "pega" al pincel de este cliente).
      const colorPropio = tip.color;
      // LO MISMO CON LA GEOMETRÍA DEL PUNTERO: `brushTips[0]` es el objeto donde
      // estudio.js guarda MI puntero (tip.x/y/dx/dy los escribe su pointermove).
      // Una pincelada remota lo deja apuntando a la posición del OTRO cliente, y
      // entonces el próximo movimiento mío calcula dx contra ese punto: la cápsula
      // del pincel se dibuja larguísima y el fluido arrastra un brochazo entre los
      // dos punteros (el "línea entre los 2 clientes"). Se guarda y se devuelve.
      const ptr = { x: tip.x, y: tip.y, dx: tip.dx, dy: tip.dy, first: P.isFirstDown };
      if (tips && tips.length) {
        // Un pase de pintura escribe un DELTA sobre el buffer de destino y lo
        // calcula leyendo el buffer de lectura. Con un solo tip el original
        // funciona porque destino y lectura son el mismo cuadro (salvo un
        // advect); con VARIOS tips hay que copiar el resultado anterior al
        // destino y ping-pongear, si no cada trazo se calcula contra una base
        // vieja y la masa/el color se disparan.
        const multi = tips.length > 1;
        for (const t of tips) {
          tip.x = t.x; tip.y = t.y; tip.dx = t.dx; tip.dy = t.dy;
          tip.hand = t.hand;
          tip.auto = t.auto === true;   // pincelada del autopintado: la corriente va a pleno
          tip.remoto = t.remoto === true;   // llegó por socket: usa la corriente remota
          tip.est = t.est || null;          // estilo del pincel que la pintó
          tip.rad = t.rad; tip.soft = t.soft; tip.axis = t.axis;
          tip.origin = t.origin; tip.seed = t.seed; tip.opac = t.opac;
          if (t.color) tip.color = t.color;
          P.isFirstDown = !!t.first;
          if (multi) {
            copyBlit(density.read, density.write);
            if (P.isFluid) copyBlit(velocity.read, velocity.write);
          }
          paint(tip);
          if (multi) { density.swap(); if (P.isFluid) velocity.swap(); }
          tip.moved = false;
        }
        tip.filter += (tip.filter - tip.speed) * 0.1;
        tip.speed += tip.filter * 0.5;
        tip.filter *= 0.5;
        if (!multi) { density.swap(); if (P.isFluid) velocity.swap(); }
        // devolver MI puntero: el lote pudo terminar en una pincelada remota
        tip.x = ptr.x; tip.y = ptr.y; tip.dx = ptr.dx; tip.dy = ptr.dy;
        P.isFirstDown = ptr.first;
      } else {
        density.swap(); if (P.isFluid) velocity.swap();
      }
      tip.color = colorPropio;   // el pincel local sigue con SU color
      gl.disable(gl.BLEND);
      if (!P.isFluid || P.isPudMode) { copyBlit(density.read, density.write); density.swap(); }
      stepFluidAdvect(dt);
      density.swap(); if (P.isFluid) velocity.swap();
      // la corriente va DESPUÉS del advect y del swap: lee el buffer ya advectado y
      // escribe el suyo, así el pase de fluido del motor no la pisa
      stepCorriente(dt);
      stepProject();
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      displayRender({ x: 1 / textureWidth, y: 1 / textureHeight }, { x: 0.5, y: 0.5 }, canvas.width / canvas.height, P.isShowCursor);
      dirty = false;
    }

    function stepFluidFrames(n, dt) { for (let i = 0; i < n; i++) frame(null, dt); }

    function clearAll() {
      clearBuffer(density); clearBuffer(velocity); clearBuffer(pressure);
      gl.bindFramebuffer(gl.FRAMEBUFFER, divergence[1]);
      gl.viewport(0, 0, textureWidth, textureHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      P.isFirstDown = true;
      brushTips[0].speed = 0; brushTips[0].filter = 0;
    }

    // ---------- API ----------
    return {
      P, S, gl, paint, paintTips: brushTips, clearAll, frame, stepFluidFrames, clearBuffer,
      get density() { return density; },
      get velocity() { return velocity; },
      programs: P_,
      color(r, g, b) { brushTips[0].color = [r, g, b]; P.Col = [r, g, b]; },
      setBackgroundImage(img, iw, ih) { setFondo(img, iw, ih); return P.isBackground; },
      setMaterialImage(img) {
        if (matTex) { gl.deleteTexture(matTex); matTex = null; }
        matTex = img ? texDeImagen(img) : null;
        P.isImageMaterial = !!img;
        P.isImageLighting = !!(matTex || refrTex);
        return P.isImageMaterial;
      },
      setRefractionImage(img) {
        if (refrTex) { gl.deleteTexture(refrTex); refrTex = null; }
        refrTex = img ? texDeImagen(img) : null;
        P.isImageRefraction = !!img;
        P.isImageLighting = !!(matTex || refrTex);
        return P.isImageRefraction;
      },
      setNoiseOffset(x, y) { noiseOffset.x = x; noiseOffset.y = y; },
      resize() {
        if (canvas.width === gl.drawingBufferWidth && canvas.height === gl.drawingBufferHeight && !dirty) return;
        deleteBuffers(); initFramebuffers(); dirty = false;
      },
      png() { return canvas.toDataURL('image/png'); },
      // radio EFECTIVO del pincel en este instante, en px del lienzo: incluye
      // TAMAÑO POR VEL. y el tamaño dinámico. Es el número que tiene que viajar
      // por socket para que el otro cliente pinte la huella del mismo grosor.
      // ---- PINCEL DE IMAGEN ----
      // Registra (o reemplaza) la textura de un pincel de imagen por id.
      setImagenPincel(id, img) {
        const clave = String(id);
        const vieja = imgTexCache.get(clave);
        if (vieja) { try { gl.deleteTexture(vieja); } catch (e) { } }
        const t = texDeImagen(img);
        imgTexCache.set(clave, t);
        return true;
      },
      tieneImagenPincel(id) { return imgTexCache.has(String(id)); },
      imagenesPincel() { return Array.from(imgTexCache.keys()); },

      radioActual() {
        const t = brushTips[0];
        return radioDe(t, P.isFirstDown ? 0 : speedNDe(t)) * canvas.height;
      },
      corriente,   // expuesto para depurar el fluido vivo (fuente 0 = la mano)
      corrientes,  // [0] mano · [1] pinceladas que llegan por socket
      brushTip: () => brushTips[0],
      // trazo determinístico: idéntico al driver de referencia
      stroke(x0, y0, x1, y1, steps, o) {
        o = o || {};
        const gap = o.gap || 1, dt = o.dt === undefined ? 1.0 : o.dt;
        let px = x0, py = y0;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
          frame([{ x: x, y: y, dx: x - px, dy: y - py, first: i === 1 && !o.continueStroke }], dt);
          px = x; py = y;
          for (let g = 1; g < gap; g++) frame(null, dt);
        }
        const settle = o.settle === undefined ? 0 : o.settle;
        for (let g = 0; g < settle; g++) frame(null, dt);
      }
    };
  }

  global.VervetteBrush = { createEngine };
})(typeof window !== 'undefined' ? window : globalThis);
