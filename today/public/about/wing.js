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
  uniform vec2 gesture;
  uniform vec3 jade;
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

    float lift = sin(time * 0.39 + along * 2.8);
    float twist = sin(time * 0.57 - along * 4.7);
    vec2 bent = uv + normal * (lift * 0.022 + tip * twist * 0.038
      + across * sin(time * 0.32) * 0.11 + gesture.y * (0.027 + abs(tip) * 0.03))
      + spine * (twist * 0.015 + gesture.x * 0.023);

    vec3 glass = texture2D(artwork, bent).rgb;
    float glint = along - 0.5 - sin(time * 0.53) * 0.31 - gesture.x * 0.33 + across * 0.28;
    float beam = exp(-44.0 * glint * glint);
    float detail = smoothstep(0.23, 0.88, max(glass.r, max(glass.g, glass.b)));
    float interference = 0.68 + 0.32 * sin(24.0 * across - time * 0.74 + along * 5.0);
    vec2 split = normal * detail * beam * 0.0037;
    glass.r = texture2D(artwork, bent + split).r;
    glass.b = texture2D(artwork, bent - split).b;

    vec3 tint = vec3(0.28, 0.40, 0.18) + jade * vec3(0.25, 0.42, 0.32);
    glass = glass * (0.96 + 0.07 * lift) + tint * detail * beam * interference * 0.54;
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

  const uniform = Object.fromEntries(["size", "crop", "gesture", "jade", "time"]
    .map(name => [name, gl.getUniformLocation(program, name)]));
  return {
    upload(image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    },
    draw(width, height, imageAspect, time, x, y, light) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const aspect = width / height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniform.size, width, height);
      gl.uniform2f(uniform.crop, Math.min(1, aspect / imageAspect), Math.min(1, imageAspect / aspect));
      gl.uniform2f(uniform.gesture, x, y);
      gl.uniform3fv(uniform.jade, light);
      gl.uniform1f(uniform.time, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}

export function animateWing(art) {
  const canvas = art.querySelector("canvas");
  const image = art.querySelector("img");
  let renderer, uploaded, width, height;
  let enabled = false, visible = false, request = 0, previous = 0;
  let time = Math.random() * 35;
  let x = 0, y = 0, targetX = 0, targetY = 0;
  let light = [0.1, 0.34, 0.22];

  function animate(now) {
    request = requestAnimationFrame(animate);
    if (previous && now - previous < 30) return;
    const dt = previous ? Math.min(.06, (now - previous) / 1000) : 0;
    previous = now;
    time += dt;

    if (uploaded !== image.currentSrc) {
      if (!image.complete || !image.naturalWidth) return;
      renderer.upload(image);
      uploaded = image.currentSrc;
    }
    const response = -Math.expm1(-dt * 3.8);
    x += (targetX - x) * response;
    const lift = Math.min(.65, scrollY / Math.max(1, innerHeight));
    y += (targetY - lift - y) * response;

    renderer.draw(width, height, image.naturalWidth / image.naturalHeight, time, x, y, light);
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
    if (!enabled) art.removeAttribute("data-wing-live");
  }

  new ResizeObserver(([entry]) => {
    const rect = entry.contentRect;
    const scale = Math.min(devicePixelRatio, 1.5, 1120 / Math.max(1, rect.width));
    width = Math.round(rect.width * scale);
    height = Math.round(rect.height * scale);
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
  const hero = art.closest(".introduction");
  hero.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse") return;
    targetX = event.clientX / innerWidth - .5;
    targetY = event.clientY / innerHeight - .5;
  }, {passive:true});
  hero.addEventListener("pointerleave", () => { targetX = targetY = 0; });

  return {
    setLighting(value) { light = value; },
    setMotion(value) { enabled = value; sync(); }
  };
}
