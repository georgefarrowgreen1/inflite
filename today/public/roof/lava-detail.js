import { pigments, radii } from "./lava-field.js";

// The same continuous field as the Canvas2D renderer, evaluated at desktop display resolution.
const fragment = `
  precision highp float;
  uniform vec2 resolution;
  uniform float aspect;
  uniform vec3 pools[${radii.length}];
  uniform float weights[${radii.length}];
  uniform vec3 ink[7];

  void main() {
    vec2 point = gl_FragCoord.xy / resolution;
    point.y = 1.0 - point.y;
    vec2 axes = 0.77 * vec2(max(1.0, aspect), max(1.0, 1.0 / aspect));
    float field = 0.0;
    vec2 normal = vec2(0.0);
    for (int i = 0; i < ${radii.length}; i++) {
      vec2 delta = (point - pools[i].xy) * axes;
      delta.y /= pools[i].z;
      float distance = dot(delta, delta) + 0.002;
      float mass = weights[i] / distance;
      field += mass;
      normal -= delta * vec2(1.0, 1.0 / pools[i].z) * mass / distance;
    }

    float level = field - 1.65;
    float inside = 1.0 / (1.0 + exp(-level * 21.0));
    float rim = exp(-abs(level) * 5.8);
    float light = max(0.0, dot(normal, vec2(0.51, 0.86)) / max(length(normal), 0.00001));
    float hot = clamp((1.0 - point.x) * 0.58 + point.y * 0.32 + 0.22 * cos(point.y * 5.0 + 0.36), 0.0, 1.0);
    vec3 colour = ink[0] + min(1.0, field * 0.42) * ink[1]
      + inside * (ink[2] + hot * ink[3] + ink[4] / (1.0 + max(0.0, level) * 0.85))
      + rim * (0.2 + 0.8 * light) * (ink[5] + hot * ink[6]);

    // A stable sub-pixel dither keeps subtle dark gradients from banding.
    float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
    gl_FragColor = vec4((colour + dither) / 255.0, 1.0);
  }
`;

const vertex = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

export function createDetailedLava() {
  const canvas = document.createElement("canvas");
  canvas.className = "lava-detail";
  const gl = canvas.getContext("webgl", {
    alpha: false, antialias: false, depth: false, powerPreference: "low-power",
    failIfMajorPerformanceCaveat: true
  });
  if (!gl) return null;

  const program = gl.createProgram();
  if (!program) return null;
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    if (!shader) return null;
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
  const resolution = gl.getUniformLocation(program, "resolution");
  const aspect = gl.getUniformLocation(program, "aspect");
  const points = gl.getUniformLocation(program, "pools[0]");
  const ink = gl.getUniformLocation(program, "ink[0]");
  gl.uniform1fv(gl.getUniformLocation(program, "weights[0]"), radii.map(r => r * r));
  const centres = new Float32Array(radii.length * 3);
  const [maxWidth, maxHeight] = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  let previousColour;

  canvas.addEventListener("webglcontextlost", () => { canvas.hidden = true; });
  return {
    canvas,
    available: () => !gl.isContextLost(),
    paint(width, height, pools, colour, fieldAspect) {
      // Keep the same pixel budget for landscape, portrait and ultrawide screens.
      const scale = Math.min(devicePixelRatio, Math.sqrt(3840 * 2160 / (width * height)),
        maxWidth / width, maxHeight / height);
      const w = Math.max(1, Math.floor(width * scale)), h = Math.max(1, Math.floor(height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      if (colour !== previousColour) {
        const p = pigments[colour];
        gl.uniform3fv(ink, [...p.base, ...p.haze, ...p.pool, ...p.warmth, ...p.depth, ...p.rim, ...p.glint]);
        previousColour = colour;
      }
      for (let i = 0; i < pools.length; i++) {
        centres[i * 3] = pools[i].x;
        centres[i * 3 + 1] = pools[i].y;
        centres[i * 3 + 2] = pools[i].stretch;
      }
      gl.uniform2f(resolution, w, h);
      gl.uniform1f(aspect, fieldAspect);
      gl.uniform3fv(points, centres);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}
