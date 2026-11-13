import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const MODES = {
  standby: {
    label: "STANDING BY",
    detail: "Present. Observing.",
    color: "violet",
    speed: 1,
    energy: 0.48,
    palette: ["#4b85e8", "#55dfff", "#dff8ff"],
  },
  listening: {
    label: "LISTENING",
    detail: "Audio input visualisation",
    color: "cyan",
    speed: 1.35,
    energy: 0.78,
    palette: ["#37c8f0", "#4f9dff", "#e1fbff"],
  },
  thinking: {
    label: "PROCESSING",
    detail: "Reasoning state visualisation",
    color: "violet",
    speed: 1.8,
    energy: 1,
    palette: ["#7168e8", "#42bfff", "#eeeaff"],
  },
  speaking: {
    label: "RESPONDING",
    detail: "Voice output visualisation",
    color: "blue",
    speed: 1.5,
    energy: 0.86,
    palette: ["#4e91f0", "#69dfff", "#e3f6ff"],
  },
};

const vertexShader = `
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;

void main() {
  float swell =
    sin(position.x * 4.7 + uTime * 0.22) *
    sin(position.y * 5.1 - uTime * 0.18) *
    sin(position.z * 4.4 + uTime * 0.20);
  float ripple = sin(position.x * 10.0 - uTime * 0.35 + sin(position.y * 7.0)) * 0.002;
  vec3 displaced = position + normal * (swell * 0.012 + ripple);
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vPosition = displaced;
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.53;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.02;
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.7);
    vec3 p = vPosition;
    float cloudA = fbm(p * 3.4 + vec3(0.0, uTime * 0.10, uTime * 0.075));
    float cloudB = fbm(p * 5.8 - vec3(uTime * 0.085, uTime * 0.035, uTime * 0.12));
    vec3 warped = p * 3.2 + vec3(cloudB * 0.9, cloudA * 0.75, cloudA * 0.55);
    float current = sin((warped.x + warped.y * 0.76 - warped.z * 0.48) * 7.7 + cloudA * 5.0 - uTime * 0.72);
    float veins = pow(max(0.0, current * 0.5 + 0.5), 13.0);
    float fineVeins = pow(1.0 - abs(sin((warped.y + warped.z * 0.7) * 11.0 - cloudB * 5.5 + uTime * 0.38)), 10.0);
    float cloudMask = smoothstep(0.20, 0.78, cloudA * 0.62 + cloudB * 0.48);
    vec3 deep = vec3(0.012, 0.016, 0.038);
    vec3 color = mix(uColorA, uColorB, smoothstep(0.22, 0.78, cloudB));
    color = mix(deep, color, 0.30 + cloudMask * 0.72);
    color = mix(color, uColorC, veins * 0.5 + fineVeins * 0.16);
    vec3 lightDir = normalize(vec3(-0.48, 0.62, 0.88));
    float diffuse = max(dot(n, lightDir), 0.0);
    float specular = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 36.0);
    float innerGlow = smoothstep(0.28, 0.92, cloudA * 0.58 + cloudB * 0.56);
    color *= 0.42 + diffuse * 0.38 + innerGlow * 0.34;
    color += uColorB * fresnel * (0.48 + uEnergy * 0.34);
    color += uColorC * (veins * 0.48 + fineVeins * 0.13 + specular * 0.34);
    color += uColorA * pow(fresnel, 1.7) * 0.22;
    float alpha = 0.78 + fresnel * 0.18 + veins * 0.04;
    gl_FragColor = vec4(color, alpha);
  }
`;

const coreFragmentShader = `
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z
    );
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 3; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.48;
    }
    return value;
  }
  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    vec3 p = vPosition * 4.4;
    float flow = fbm(p + vec3(0.0, -uTime * 0.18, uTime * 0.12));
    float flow2 = fbm(p * 1.7 + vec3(uTime * 0.13, 0.0, -uTime * 0.16));
    float filaments = pow(max(0.0, sin((p.x + p.y * 0.8 - p.z * 0.65) * 5.2 + flow * 7.0 - uTime * 1.1)), 8.0);
    float folds = pow(1.0 - abs(sin((p.z + p.x * 0.4) * 4.2 + flow2 * 6.0 + uTime * 0.48)), 7.0);
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.1);
    float heart = 0.18 + flow * 0.5 + flow2 * 0.36;
    vec3 color = mix(uColorA, uColorB, smoothstep(0.28, 0.76, flow2));
    color = mix(color, uColorC, filaments * 0.55 + folds * 0.18);
    color *= 0.42 + heart * 0.68;
    color += uColorB * (rim * 0.65 + uEnergy * 0.1);
    color += uColorC * (filaments * 0.42 + folds * 0.12);
    float alpha = 0.22 + flow * 0.24 + filaments * 0.18 + rim * 0.22;
    gl_FragColor = vec4(color, alpha);
  }
`;
function makeOrbScene(host, modeRef) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 7.05);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  host.appendChild(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);

  const orbGeometry = new THREE.SphereGeometry(1.38, 160, 160);
  const orbMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0.48 },
      uColorA: { value: new THREE.Color("#a78bfa") },
      uColorB: { value: new THREE.Color("#65d8f2") },
      uColorC: { value: new THREE.Color("#e4d9ff") },
    },
  });
  orbMaterial.transparent = true;
  orbMaterial.depthWrite = false;
  const orb = new THREE.Mesh(orbGeometry, orbMaterial);
  root.add(orb);

  const coreMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: coreFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0.48 },
      uColorA: { value: new THREE.Color("#947dff") },
      uColorB: { value: new THREE.Color("#53d8f2") },
      uColorC: { value: new THREE.Color("#e8f6ff") },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.82, 128, 128), coreMaterial);
  core.renderOrder = 2;
  root.add(core);

  const facetSource = new THREE.IcosahedronGeometry(1.08, 2);
  const facetEdges = new THREE.EdgesGeometry(facetSource, 8);
  facetSource.dispose();

  const facetMaterial = new THREE.LineBasicMaterial({
    color: "#8adfff",
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const innerShell = new THREE.LineSegments(facetEdges, facetMaterial);
  root.add(innerShell);

  const nodePositions = [];
  const nodeCount = 42;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < nodeCount; i++) {
    const y = 1 - (i / (nodeCount - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    nodePositions.push(
      Math.cos(theta) * radius * 1.085,
      y * 1.085,
      Math.sin(theta) * radius * 1.085
    );
  }
  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(nodePositions, 3));
  const nodeMaterial = new THREE.PointsMaterial({
    color: "#d5f5ff",
    size: 0.026,
    transparent: true,
    opacity: 0.76,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const facetNodes = new THREE.Points(nodeGeometry, nodeMaterial);
  root.add(facetNodes);

  const fiberGroup = new THREE.Group();
  const fiberMaterial = new THREE.MeshBasicMaterial({
    color: "#65dfff",
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const fiberCount = 26;
  for (let i = 0; i < fiberCount; i++) {
    const y = 1 - ((i + 0.5) / fiberCount) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i + 0.3;
    const direction = new THREE.Vector3(
      Math.cos(theta) * radius,
      y,
      Math.sin(theta) * radius
    ).normalize();
    const tangent = new THREE.Vector3(-direction.z, 0, direction.x);
    if (tangent.lengthSq() < 0.001) tangent.set(1, 0, 0);
    tangent.normalize();
    const bend = Math.sin(i * 7.31) * 0.105;
    const points = [
      direction.clone().multiplyScalar(0.48),
      direction.clone().multiplyScalar(0.66).addScaledVector(tangent, bend),
      direction.clone().multiplyScalar(0.91).addScaledVector(tangent, -bend * 0.72),
      direction.clone().multiplyScalar(1.075),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const fiberGeometry = new THREE.TubeGeometry(curve, 28, 0.0032, 5, false);
    const fiber = new THREE.Mesh(fiberGeometry, fiberMaterial);
    fiberGroup.add(fiber);
  }
  root.add(fiberGroup);

  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(1.56, 80, 80),
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color("#8e83ff") },
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec3 vNormal;
        void main() {
          float glow = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 3.0);
          gl_FragColor = vec4(uColor, glow * 0.22);
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  root.add(aura);

  const ringMaterial = (color, opacity) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

  const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.82, 0.008, 8, 260, Math.PI * 1.72), ringMaterial("#79cfff", 0.48));
  ringA.rotation.set(1.14, 0.18, 0.2);
  root.add(ringA);

  const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.02, 0.0045, 8, 260, Math.PI * 1.38), ringMaterial("#66e5ff", 0.34));
  ringB.rotation.set(0.42, 1.02, -0.38);
  root.add(ringB);

  const ringC = new THREE.Mesh(new THREE.TorusGeometry(1.68, 0.003, 8, 260, Math.PI * 1.55), ringMaterial("#c8eaff", 0.25));
  ringC.rotation.set(1.55, -0.64, 0.9);
  root.add(ringC);

  const orbitPoints = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(i === 0 ? 0.034 : 0.019, 16, 16),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 1 ? "#8cecff" : "#d5ccff",
        transparent: true,
        opacity: 0.94,
      })
    );
    root.add(dot);
    orbitPoints.push({ mesh: dot, angle, radius: 1.93 + i * 0.045, speed: 0.18 + i * 0.055, tilt: i * 0.62 });
  }

  const particleCount = 680;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleSizes = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    const radius = 1.48 + Math.random() * 1.05;
    const theta = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const planar = Math.sqrt(1 - z * z);
    particlePositions[i * 3] = radius * planar * Math.cos(theta);
    particlePositions[i * 3 + 1] = radius * planar * Math.sin(theta);
    particlePositions[i * 3 + 2] = radius * z;
    particleSizes[i] = 0.5 + Math.random() * 1.4;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute("size", new THREE.BufferAttribute(particleSizes, 1));
  const particleMaterial = new THREE.PointsMaterial({
    color: "#b8b5ff",
    size: 0.012,
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  root.add(particles);

  const starsCount = 110;
  const starPositions = new Float32Array(starsCount * 3);
  for (let i = 0; i < starsCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 12;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 8;
    starPositions[i * 3 + 2] = -2 - Math.random() * 5;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: "#c5c5f5",
      size: 0.009,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  scene.add(stars);

  const pointer = { x: 0, y: 0 };
  const onPointerMove = (event) => {
    const rect = host.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  host.addEventListener("pointermove", onPointerMove);

  const resizeObserver = new ResizeObserver(() => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  resizeObserver.observe(host);

  const clock = new THREE.Clock();
  let frameId = 0;
  let disposed = false;

  const animate = () => {
    if (disposed) return;
    frameId = requestAnimationFrame(animate);

    const time = clock.getElapsedTime();
    const activeMode = MODES[modeRef.current] || MODES.standby;
    const pulse = 1 + Math.sin(time * activeMode.speed * 1.5) * 0.012 * activeMode.energy;

    orbMaterial.uniforms.uTime.value = time * activeMode.speed;
    coreMaterial.uniforms.uTime.value = time * activeMode.speed * 0.82;
    orbMaterial.uniforms.uEnergy.value = THREE.MathUtils.lerp(
      orbMaterial.uniforms.uEnergy.value,
      activeMode.energy,
      0.035
    );
    coreMaterial.uniforms.uEnergy.value = THREE.MathUtils.lerp(
      coreMaterial.uniforms.uEnergy.value,
      activeMode.energy,
      0.04
    );

    const targetColors = activeMode.palette.map((hex) => new THREE.Color(hex));
    ["uColorA", "uColorB", "uColorC"].forEach((key, index) => {
      orbMaterial.uniforms[key].value.lerp(targetColors[index], 0.035);
      coreMaterial.uniforms[key].value.lerp(targetColors[index], 0.035);
    });

    root.scale.setScalar(pulse);
    core.rotation.y = -time * 0.11;
    core.rotation.x = Math.sin(time * 0.16) * 0.12;
    core.scale.setScalar(1 + Math.sin(time * 1.1) * 0.018 * activeMode.energy);
    root.rotation.y += 0.0018 * activeMode.speed;
    root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, pointer.y * 0.075, 0.025);
    root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, -pointer.x * 0.045, 0.025);

    ringA.rotation.z += 0.0018 * activeMode.speed;
    ringB.rotation.x -= 0.0011 * activeMode.speed;
    ringC.rotation.y += 0.0012 * activeMode.speed;
    innerShell.rotation.y -= 0.0019 * activeMode.speed;
    innerShell.rotation.x = Math.sin(time * 0.18) * 0.12;
    facetNodes.rotation.copy(innerShell.rotation);
    fiberGroup.rotation.y += 0.0012 * activeMode.speed;
    fiberGroup.rotation.z = Math.sin(time * 0.14) * 0.045;
    facetMaterial.opacity = 0.19 + Math.sin(time * 1.1) * 0.035 * activeMode.energy;
    fiberMaterial.opacity = 0.17 + Math.sin(time * 1.45 + 0.8) * 0.07 * activeMode.energy;
    particles.rotation.y -= 0.00035 * activeMode.speed;
    particles.rotation.x = Math.sin(time * 0.12) * 0.06;

    orbitPoints.forEach(({ mesh, angle, radius, speed, tilt }, index) => {
      const a = angle + time * speed * activeMode.speed;
      mesh.position.set(
        Math.cos(a) * radius,
        Math.sin(a * 1.1 + tilt) * 0.28,
        Math.sin(a) * radius * 0.42
      );
      mesh.scale.setScalar(index === 0 ? 1 + Math.sin(time * 2) * 0.12 : 1);
    });

    renderer.render(scene, camera);
  };
  animate();

  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    host.removeEventListener("pointermove", onPointerMove);
    orbGeometry.dispose();
    orbMaterial.dispose();
    core.geometry.dispose();
    coreMaterial.dispose();
    innerShell.geometry.dispose();
    facetMaterial.dispose();
    nodeGeometry.dispose();
    nodeMaterial.dispose();
    fiberGroup.children.forEach((fiber) => fiber.geometry.dispose());
    fiberMaterial.dispose();
    aura.geometry.dispose();
    aura.material.dispose();
    [ringA, ringB, ringC].forEach((ring) => {
      ring.geometry.dispose();
      ring.material.dispose();
    });
    orbitPoints.forEach(({ mesh }) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    particleGeometry.dispose();
    particleMaterial.dispose();
    starGeometry.dispose();
    stars.material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

export default function App() {
  const [mode, setMode] = useState("standby");
  const orbStage = useRef(null);
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!orbStage.current) return undefined;
    return makeOrbScene(orbStage.current, modeRef);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const shortcuts = {
        "1": "standby",
        "2": "listening",
        "3": "thinking",
        "4": "speaking",
        Escape: "standby",
      };
      if (shortcuts[event.key]) setMode(shortcuts[event.key]);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className={"app mode-" + mode} aria-label="PARALLAX">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="orb-halo" />
      <div className="orb-stage" ref={orbStage} />
    </main>
  );
}
