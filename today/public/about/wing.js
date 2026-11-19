// Refract the original artwork in its own coordinate space, including the phone crop.
const vertex = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform sampler2D artwork;
  uniform vec2 size;
  uniform vec2 crop;
  uniform vec3 interaction;
  uniform float ambientLight;
  uniform float time;

  void main() {
    vec2 point = gl_FragCoord.xy / size;
    point.y = 1.0 - point.y;
    vec2 uv = point * crop + (1.0 - crop) * vec2(0.55, 0.52);
    vec2 spine = vec2(0.85, -0.5268);
    vec2 normal = vec2(0.5268, 0.85);
    float along = dot(uv - 0.5, spine) + 0.5;
    float across = dot(uv - 0.5, normal);
    float tip = (along - 0.5) * 2.0;

    // Distances are measured in screen space so the lens stays round in the phone crop.
    vec2 lens = (point - interaction.xy) * size / max(size.x, size.y);
    float proximity = exp(-18.0 * dot(lens, lens));
    float pressure = interaction.z * proximity;
    float lift = sin(time * 0.39 + along * 2.8);
    float twist = sin(time * 0.57 - along * 4.7);
    vec2 bent = uv + normal * (lift * 0.020 + tip * twist * 0.033
      + across * sin(time * 0.32) * 0.10 - pressure * (0.025 + dot(lens, normal) * 0.09))
      + spine * (twist * 0.013 - pressure * dot(lens, spine) * 0.12);

    vec3 glass = texture2D(artwork, bent).rgb;
    float glint = along - 0.5 - sin(time * 0.53) * 0.31 + across * 0.28;
    float beam = exp(-44.0 * glint * glint);
    float detail = smoothstep(0.18, 0.83, max(glass.r, max(glass.g, glass.b)));
    float interference = 0.72 + 0.28 * sin(24.0 * across - time * 0.74 + along * 5.0);

    // A narrow caustic sits inside the broader light pulled across the glass.
    float edge = dot(lens, normal) + 0.04;
    float caustic = pressure * exp(-120.0 * edge * edge);
    vec2 split = normal * detail * (beam * 0.0026 + caustic * 0.0035);
    glass.r = texture2D(artwork, bent + split).r;
    glass.b = texture2D(artwork, bent - split).b;

    float intensity = 0.38 + ambientLight * 0.43;
    glass *= 0.97 + 0.06 * lift;
    glass += (1.0 - glass) * intensity * detail * (beam * interference * 0.52 + pressure * 0.45 + caustic * 0.62);
    gl_FragColor = vec4(glass, 1.0);
  }
`;

function createRenderer(canvas) {
  const gl = canvas.getContext("webgl", {alpha:false, antialias:false, depth:false});
  if (!gl) return null;

  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  gl.useProgram(program);

  const position = gl.getAttribLocation(program, "position");
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(position);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const uniform = Object.fromEntries(["size", "crop", "interaction", "ambientLight", "time"]
    .map(name => [name, gl.getUniformLocation(program, name)]));
  return {
    upload(image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    },
    draw(width, height, imageAspect, time, x, y, pressure, light) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const aspect = width / height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniform.size, width, height);
      gl.uniform2f(uniform.crop, Math.min(1, aspect / imageAspect), Math.min(1, imageAspect / aspect));
      gl.uniform3f(uniform.interaction, x, y, pressure);
      gl.uniform1f(uniform.ambientLight, light);
      gl.uniform1f(uniform.time, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}

export function animateWing(art) {
  const canvas = art.querySelector("canvas");
  const image = art.querySelector("img");
  let renderer, uploaded, width, height, displayWidth, displayHeight;
  let enabled = false, visible = false, request = 0, previous = 0;
  let time = Math.random() * 35;
  let x = .5, y = .5, targetX = .5, targetY = .5, pressure = 0, targetPressure = 0;
  let pressedPointer;
  let light = .24;

  function animate(now) {
    request = requestAnimationFrame(animate);
    if (previous && now - previous < 15) return;
    const dt = previous ? Math.min(.06, (now - previous) / 1000) : 0;
    previous = now;
    time += dt;

    if (uploaded !== image.currentSrc) {
      if (!image.complete || !image.naturalWidth) return;
      renderer.upload(image);
      uploaded = image.currentSrc;
    }
    const response = -Math.expm1(-dt * 15);
    x += (targetX - x) * response;
    y += (targetY - y) * response;
    pressure += (targetPressure - pressure) * -Math.expm1(-dt * (targetPressure > pressure ? 16 : 5));

    renderer.draw(width, height, image.naturalWidth / image.naturalHeight, time, x, y, pressure, light);
    if (dt && !art.hasAttribute("data-wing-live")) art.dataset.wingLive = "";
  }

  function sync() {
    const active = enabled && visible;
    art.toggleAttribute("data-wing-motion", active);
    if (active && width && height && image.naturalWidth) {
      if (renderer === undefined) renderer = createRenderer(canvas);
      if (renderer && !request) request = requestAnimationFrame(animate);
    } else if (request) {
      cancelAnimationFrame(request);
      request = 0;
      previous = 0;
    }
    // Keep the last frame while offscreen. The original image is the still version.
    if (!active) {
      pressedPointer = undefined;
      targetPressure = pressure = 0;
      if (renderer === null) updateFallback();
    }
    if (!enabled) art.removeAttribute("data-wing-live");
  }

  new ResizeObserver(([entry]) => {
    ({width:displayWidth, height:displayHeight} = entry.contentRect);
    // Give Retina phones native detail and cap the GPU surface on wider screens.
    const scale = Math.min(devicePixelRatio, 3, Math.sqrt(1_650_000 / Math.max(1, displayWidth * displayHeight)));
    width = Math.round(displayWidth * scale);
    height = Math.round(displayHeight * scale);
    sync();
  }).observe(art);
  new IntersectionObserver(([entry]) => {
    visible = entry.intersectionRatio >= .1;
    sync();
  }, {threshold:.1}).observe(art);
  image.addEventListener("load", sync);
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    cancelAnimationFrame(request);
    request = 0;
    previous = 0;
    uploaded = undefined;
    renderer = null;
    art.removeAttribute("data-wing-live");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    renderer = undefined;
    sync();
  });
  function updateFallback() {
    art.style.setProperty("--wing-x", (targetX - .5) * targetPressure * 10 + "px");
    art.style.setProperty("--wing-y", (targetY - .5) * targetPressure * 8 + "px");
  }

  function aim(event, strength) {
    targetX = Math.max(0, Math.min(1, event.offsetX / displayWidth));
    targetY = Math.max(0, Math.min(1, event.offsetY / displayHeight));
    if (pressure < .015 && targetPressure === 0) {
      x = targetX;
      y = targetY;
    }
    targetPressure = strength;
    if (renderer === null) updateFallback();
  }

  function release(event) {
    const leavingHover = event.type === "pointerleave" && event.pointerType === "mouse" && pressedPointer === undefined;
    if (pressedPointer !== event.pointerId && !leavingHover) return;
    pressedPointer = undefined;
    if (event.type === "pointerup" && event.pointerType === "mouse") {
      aim(event, .75);
    } else {
      targetPressure = 0;
      if (renderer === null) updateFallback();
    }
  }

  art.addEventListener("pointerdown", event => {
    if (!enabled || !visible || !displayWidth || !displayHeight || !event.isPrimary || event.button !== 0) return;
    pressedPointer = event.pointerId;
    aim(event, 1);
    pressure = Math.max(pressure, .32);
  }, {passive:true});
  art.addEventListener("pointermove", event => {
    if (!enabled || !visible || !displayWidth || !displayHeight) return;
    if (pressedPointer === event.pointerId) aim(event, 1);
    else if (event.pointerType === "mouse" && pressedPointer === undefined) aim(event, .75);
  }, {passive:true});
  for (const type of ["pointerleave", "pointerup", "pointercancel", "lostpointercapture"]) {
    art.addEventListener(type, release, {passive:true});
  }
  art.addEventListener("contextmenu", event => event.preventDefault());

  return {
    setLightIntensity(value) { light = value; },
    setMotion(value) { enabled = value; sync(); }
  };
}
