(() => {
  'use strict';
  const host = document.querySelector('.logo-sculpture');
  if (!host) return;
  const settingsButton = document.querySelector('#settings-toggle');
  const toolbox = document.querySelector('#logo-toolbox');
  const furToggle = document.querySelector('#fur-enabled');
  const lengthInput = document.querySelector('#fur-length');
  const thicknessInput = document.querySelector('#fur-thickness');
  // Keep the existing useful range, with the normal setting at the visible midpoint.
  function hairScale(value, key) {
    const scale = value <= 5 ? 0.4 + (value - 1) * 0.15 : 1 + (value - 5) * 0.2;
    return scale * (key === 'thickness' ? 1.2 : 0.8);
  }
  const settings = {
    length: hairScale(Number(lengthInput.value), 'length'),
    thickness: hairScale(Number(thicknessInput.value), 'thickness'),
  };
  function syncControls() {
    furToggle.disabled = !ready;
    lengthInput.disabled = thicknessInput.disabled = !ready || material.target === 0;
  }
  function closeToolbox() {
    toolbox.hidden = true;
    settingsButton.setAttribute('aria-expanded', 'false');
  }
  settingsButton.addEventListener('click', () => {
    toolbox.hidden = !toolbox.hidden;
    settingsButton.setAttribute('aria-expanded', String(!toolbox.hidden));
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !toolbox.hidden) {
      closeToolbox();
      settingsButton.focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!toolbox.hidden && !event.target.closest('.logo-settings')) {
      const containedFocus = toolbox.contains(document.activeElement);
      closeToolbox();
      if (containedFocus) settingsButton.focus();
    }
  });
  const canvas = host.querySelector('canvas');
  const image = host.querySelector('img');
  const jellyImage = new Image();
  jellyImage.src = new URL('logo.webp', document.currentScript.src).href;
  const material = { value: 1, from: 1, target: 1, started: 0, changing: false };
  const transitionDuration = 1000;
  // Share hue while retaining each material's texture and highlight intensity.
  const yellowPalette = `
    vec3 unifyYellow(vec3 color) {
      float high = max(color.r, max(color.g, color.b));
      float low = min(color.r, min(color.g, color.b));
      return vec3(high, high - (high - low) * 0.20, low);
    }
  `;
  function advanceMaterial(now) {
    if (!material.changing) return;
    const progress = Math.min(1, Math.max(0, (now - material.started) / transitionDuration));
    const eased = progress * progress * (3 - 2 * progress);
    material.value = material.from + (material.target - material.from) * eased;
    if (progress === 1) material.changing = false;
  }
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return;
  const instancing = gl.getExtension('ANGLE_instanced_arrays');
  if (!instancing) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0.5, y: 0.5, oldX: 0.5, oldY: 0.5, active: false };
  const body = { x: 0.5, y: 0.5, amount: 0, velocity: 0 };
  // Both the coat and the live fibers use this deformation, keeping roots attached.
  const deformation = `
    uniform vec3 squish;
    uniform mediump float growth;
    vec4 deform(vec2 uv) {
      vec2 delta = uv - squish.xy;
      float influence = exp(-dot(delta, delta) / 0.055) * squish.z;
      vec2 p = uv - 0.5 + delta * influence * 0.05;
      float z = -influence * 0.025;
      vec2 tilt = (squish.xy - 0.5) * squish.z * 0.05;
      float cy = cos(tilt.x), sy = sin(tilt.x);
      float cx = cos(tilt.y), sx = sin(tilt.y);
      vec3 rotated = vec3(p.x * cy + z * sy, p.y, z * cy - p.x * sy);
      rotated = vec3(rotated.x, rotated.y * cx - rotated.z * sx,
        rotated.y * sx + rotated.z * cx);
      float perspective = 2.8 / (2.8 - rotated.z);
      return vec4(rotated.x * 2.0 * perspective, -rotated.y * 2.0 * perspective, 0.0, 1.0);
    }
  `;
  let baseVertexCount = 0;
  let frame = 0, last = 0, visible = true, ready = false;
  let base, fur, baseBuffer, strandBuffer, rootBuffer, bendBuffer, bends;
  let nodes = [];

  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
    return result;
  }
  function program(vertex, fragment) {
    const result = gl.createProgram();
    const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(result, vs);
    gl.attachShader(result, fs);
    gl.linkProgram(result);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(result));
    return result;
  }
  function buffer(data, usage) {
    const result = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, result);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    return result;
  }
  function initialize() {
    try {
      base = program(`
        attribute vec2 position;
        varying vec2 uv;
        ${deformation}
        void main() {
          uv = vec2(position.x + 0.5, 0.5 - position.y);
          gl_Position = deform(uv);
        }
      `, `
        precision mediump float;
        uniform sampler2D logo;
        uniform sampler2D jelly;
        uniform mediump float growth;
        varying vec2 uv;
        ${yellowPalette}
        void main() {
          vec4 coat = texture2D(logo, uv);
          vec2 jellyUV = (uv - 0.5) / vec2(0.77, 0.82) + 0.5;
          vec4 smoothCoat = texture2D(jelly, clamp(jellyUV, 0.0, 1.0));
          if (jellyUV.x < 0.0 || jellyUV.y < 0.0 || jellyUV.x > 1.0 || jellyUV.y > 1.0) smoothCoat = vec4(0.0);
          coat.rgb = unifyYellow(coat.rgb);
          smoothCoat.rgb = unifyYellow(smoothCoat.rgb);
          // Blend the undercoat in premultiplied alpha as actual strands grow above it.
          gl_FragColor = mix(vec4(smoothCoat.rgb * smoothCoat.a, smoothCoat.a),
            vec4(coat.rgb * coat.a, coat.a), growth);
        }
      `);
      fur = program(`
        attribute vec2 strand; // distance along hair and ribbon side
        attribute vec4 root;   // fixed UV root and groom direction/length
        attribute vec4 tint;   // sampled coat color and strand variation
        attribute vec2 bend;   // independently simulated tip deflection
        uniform float hairLengthScale;
        uniform float hairThicknessScale;
        varying vec4 color;
        ${deformation}
        ${yellowPalette}
        void main() {
          float t = strand.x;
          float hairLength = length(root.zw) * hairLengthScale;
          vec2 tipDirection = root.zw + bend;
          vec2 tip = tipDirection / max(length(tipDirection), 0.0001) * hairLength;
          vec2 control = root.zw * 0.45 * hairLengthScale;
          vec2 curve = 2.0 * (1.0 - t) * t * control + t * t * tip;
          vec2 tangent = 2.0 * (1.0 - t) * control + 2.0 * t * (tip - control);
          vec2 normal = normalize(vec2(-tangent.y, tangent.x) + vec2(0.000001));
          // Keep substantial width at the tips for a thick, plush coat.
          float width = (0.00115 + tint.a * 0.00045) * (1.0 - t * 0.70) * hairThicknessScale;
          vec2 p = root.xy + (curve + normal * strand.y * width) * growth;
          gl_Position = deform(p);
          vec3 shade = tint.rgb * (0.73 + t * 0.27);
          shade = mix(shade, vec3(1.0, 0.94, 0.48), t * t * (0.2 + tint.a * 0.22));
          float alpha = (0.4 + t * 0.5) * (0.75 + tint.a * 0.25);
          shade = unifyYellow(shade);
          alpha *= smoothstep(0.0, 0.12, growth);
          color = vec4(shade * alpha, alpha);
        }
      `, `
        precision mediump float;
        varying vec4 color;
        void main() { gl_FragColor = color; }
      `);
      const surface = [];
      const divisions = 48;
      for (let y = 0; y < divisions; y++) {
        for (let x = 0; x < divisions; x++) {
          const a = x / divisions - 0.5, b = y / divisions - 0.5;
          const c = (x + 1) / divisions - 0.5, d = (y + 1) / divisions - 0.5;
          surface.push(a,b, c,b, a,d, a,d, c,b, c,d);
        }
      }
      baseVertexCount = surface.length / 2;
      baseBuffer = buffer(new Float32Array(surface), gl.STATIC_DRAW);
      const segments = [];
      for (let i = 0; i < 6; i++) {
        const a = i / 6, b = (i + 1) / 6;
        segments.push(a,-1, b,-1, a,1, a,1, b,-1, b,1);
      }
      strandBuffer = buffer(new Float32Array(segments), gl.STATIC_DRAW);

      // Read the coat's directional texture to groom the live fibers along it.
      const size = 512;
      const source = document.createElement('canvas');
      source.width = source.height = size;
      const ctx = source.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw Error('Image sampling unavailable');
      ctx.drawImage(image, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      const luma = (x, y) => pixels[(y * size + x) * 4 + 1];
      const alpha = (x, y) => pixels[(y * size + x) * 4 + 3] / 255;
      let seed = 42;
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const roots = [];
      nodes = [];
      const count = matchMedia('(max-width: 600px)').matches ? 12000 : 20000;
      for (let attempt = 0; nodes.length < count && attempt < count * 6; attempt++) {
        const x = 4 + Math.floor(random() * (size - 8)), y = 4 + Math.floor(random() * (size - 8));
        if (alpha(x, y) < 0.96) continue;
        let xx = 0, yy = 0, xy = 0;
        for (let oy = -2; oy <= 2; oy++) {
          for (let ox = -2; ox <= 2; ox++) {
            const gx = luma(x + ox + 1, y + oy) - luma(x + ox - 1, y + oy);
            const gy = luma(x + ox, y + oy + 1) - luma(x + ox, y + oy - 1);
            xx += gx * gx; yy += gy * gy; xy += gx * gy;
          }
        }
        const angle = 0.5 * Math.atan2(2 * xy, xx - yy) + Math.PI / 2;
        let dx = Math.cos(angle), dy = Math.sin(angle);
        if (dy < 0) { dx = -dx; dy = -dy; }
        const edgeX = alpha(x - 3, y) - alpha(x + 3, y);
        const edgeY = alpha(x, y - 3) - alpha(x, y + 3);
        if (Math.hypot(edgeX, edgeY) > 0.1) {
          const length = Math.hypot(edgeX, edgeY);
          dx = edgeX / length; dy = edgeY / length;
        }
        const length = 0.022 + random() * 0.026;
        const u = (x + random()) / size, v = (y + random()) / size;
        const index = (y * size + x) * 4;
        roots.push(u, v, dx * length, dy * length,
          pixels[index] / 255, pixels[index + 1] / 255, pixels[index + 2] / 255, random());
        nodes.push({ x: u, y: v, length, gx: 0, gy: 0, bx: 0, by: 0, vx: 0, vy: 0 });
      }
      rootBuffer = buffer(new Float32Array(roots), gl.STATIC_DRAW);
      bends = new Float32Array(nodes.length * 2);
      bendBuffer = buffer(bends, gl.DYNAMIC_DRAW);
      for (const [unit, sourceImage] of [[0, image], [1, jellyImage]]) {
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceImage);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      ready = true;
      resize();
      host.classList.add('ready');
      host.disabled = false;
      syncControls();
      start();
    } catch (error) {
      console.warn('Live fur unavailable; using the fluffy image.', error);
    }
  }
  function attribute(p, name, buffer, count, stride, offset, divisor) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const location = gl.getAttribLocation(p, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, count, gl.FLOAT, false, stride, offset);
    instancing.vertexAttribDivisorANGLE(location, divisor);
  }
  function draw() {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (let i = 0; i < 4; i++) {
      gl.disableVertexAttribArray(i);
      instancing.vertexAttribDivisorANGLE(i, 0);
    }
    gl.useProgram(base);
    gl.uniform3f(gl.getUniformLocation(base, 'squish'), body.x, body.y, body.amount);
    attribute(base, 'position', baseBuffer, 2, 8, 0, 0);
    gl.uniform1i(gl.getUniformLocation(base, 'logo'), 0);
    gl.uniform1i(gl.getUniformLocation(base, 'jelly'), 1);
    gl.uniform1f(gl.getUniformLocation(base, 'growth'), material.value);
    gl.drawArrays(gl.TRIANGLES, 0, baseVertexCount);
    gl.useProgram(fur);
    gl.uniform1f(gl.getUniformLocation(fur, 'hairLengthScale'), settings.length);
    gl.uniform1f(gl.getUniformLocation(fur, 'hairThicknessScale'), settings.thickness);
    gl.uniform1f(gl.getUniformLocation(fur, 'growth'), material.value);
    gl.uniform3f(gl.getUniformLocation(fur, 'squish'), body.x, body.y, body.amount);
    attribute(fur, 'strand', strandBuffer, 2, 8, 0, 0);
    attribute(fur, 'root', rootBuffer, 4, 32, 0, 1);
    attribute(fur, 'tint', rootBuffer, 4, 32, 16, 1);
    attribute(fur, 'bend', bendBuffer, 2, 8, 0, 1);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, bends);
    instancing.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 36, nodes.length);
  }
  function simulate(dt) {
    const ease = 1 - Math.exp(-dt * 12);
    body.x += (pointer.x - body.x) * ease;
    body.y += (pointer.y - body.y) * ease;
    const substeps = Math.ceil(dt * 120), step = dt / substeps;
    for (let i = 0; i < substeps; i++) {
      body.velocity += ((Number(pointer.active) - body.amount) * 85 - body.velocity * 8) * step;
      body.amount += body.velocity * step;
    }
    const dx = pointer.active ? pointer.x - pointer.oldX : 0;
    const dy = pointer.active ? pointer.y - pointer.oldY : 0;
    const strokeLength = dx * dx + dy * dy;
    const decay = Math.exp(-dt * 1.3);
    let moving = pointer.active || Math.abs(body.amount) + Math.abs(body.velocity) > 0.0001;
    nodes.forEach((node, i) => {
      if (strokeLength > 0.0000001) {
        // Swept brush segment prevents quick strokes from skipping fibers.
        const t = Math.max(0, Math.min(1, ((node.x - pointer.oldX) * dx + (node.y - pointer.oldY) * dy) / strokeLength));
        const rx = node.x - pointer.oldX - t * dx, ry = node.y - pointer.oldY - t * dy;
        const influence = Math.exp(-(rx * rx + ry * ry) / 0.005) * material.value;
        node.gx += dx * influence * 3.5;
        node.gy += dy * influence * 3.5;
        const amount = Math.hypot(node.gx, node.gy);
        const limit = node.length * 2.5;
        if (amount > limit) { node.gx *= limit / amount; node.gy *= limit / amount; }
      }
      node.gx *= decay; node.gy *= decay;
      const steps = Math.ceil(dt * 120), step = dt / steps;
      for (let s = 0; s < steps; s++) {
        node.vx += ((node.gx - node.bx) * 140 - node.vx * 14) * step;
        node.vy += ((node.gy - node.by) * 140 - node.vy * 14) * step;
        node.bx += node.vx * step; node.by += node.vy * step;
      }
      bends[i * 2] = node.bx;
      bends[i * 2 + 1] = node.by;
      if (Math.abs(node.bx) + Math.abs(node.by) + Math.abs(node.vx) + Math.abs(node.vy) > 0.0001) moving = true;
    });
    pointer.oldX = pointer.x; pointer.oldY = pointer.y;
    return moving;
  }
  function tick(now) {
    frame = 0;
    const dt = last ? Math.max(0.001, Math.min((now - last) / 1000, 0.035)) : 1 / 60;
    last = now;
    advanceMaterial(now);
    const moving = simulate(dt);
    draw();
    if (visible && !document.hidden && !reduced.matches && (moving || material.changing)) frame = requestAnimationFrame(tick);
  }
  function start() {
    cancelAnimationFrame(frame);
    frame = 0; last = 0;
    if (!ready) return;
    if (reduced.matches) {
      material.value = material.target;
      material.changing = false;
      nodes.forEach(n => { n.gx = n.gy = n.bx = n.by = n.vx = n.vy = 0; });
      bends.fill(0);
      body.amount = body.velocity = 0;
      draw();
    } else if (visible && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function resize() {
    const size = Math.round(host.clientWidth * Math.min(devicePixelRatio || 1, 2));
    canvas.width = canvas.height = size;
    gl.viewport(0, 0, size, size);
    if (ready) draw();
  }
  function setMaterial(target) {
    if (!ready || material.target === target) return;
    const now = performance.now();
    advanceMaterial(now);
    material.from = material.value;
    material.target = target;
    material.started = now;
    material.changing = true;
    host.setAttribute('aria-pressed', String(target === 1));
    furToggle.checked = target === 1;
    syncControls();
    start();
  }
  host.addEventListener('click', () => setMaterial(material.target === 1 ? 0 : 1));
  furToggle.addEventListener('change', () => setMaterial(Number(furToggle.checked)));
  for (const [input, key] of [[lengthInput, 'length'], [thicknessInput, 'thickness']]) {
    input.addEventListener('input', () => {
      settings[key] = hairScale(Number(input.value), key);
      document.querySelector(`#fur-${key}-value`).value = input.value;
      if (ready) draw();
    });
  }
  host.addEventListener('pointermove', event => {
    const bounds = host.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left) / bounds.width;
    pointer.y = (event.clientY - bounds.top) / bounds.height;
    if (!pointer.active) { pointer.oldX = pointer.x; pointer.oldY = pointer.y; }
    pointer.active = true;
    if (!frame) start();
  });
  const reset = () => {
    pointer.active = false;
    if (!frame) start();
  };
  host.addEventListener('pointerleave', reset);
  host.addEventListener('pointercancel', reset);
  host.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') reset(); });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); ready = false; host.disabled = true; cancelAnimationFrame(frame);
    syncControls();
    host.classList.remove('ready');
  });
  canvas.addEventListener('webglcontextrestored', initialize);
  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; start(); }).observe(host);
  document.addEventListener('visibilitychange', start);
  reduced.addEventListener('change', start);
  function loaded(source) {
    return new Promise((resolve, reject) => {
      if (source.complete && source.naturalWidth) { resolve(); return; }
      source.addEventListener('load', resolve, { once: true });
      source.addEventListener('error', reject, { once: true });
    });
  }
  Promise.all([loaded(image), loaded(jellyImage)]).then(initialize).catch(() => {
    console.warn('Logo textures unavailable; retaining the static logo.');
  });
})();
