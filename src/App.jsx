import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const MODES = {
  standby: { speed: 0.34, energy: 0.34, palette: ["#24527b", "#58d9ed", "#e8fbff"] },
  listening: { speed: 0.72, energy: 0.72, palette: ["#176d83", "#4ce8ef", "#efffff"] },
  thinking: { speed: 0.96, energy: 0.94, palette: ["#453b91", "#8d8aff", "#f0eaff"] },
  speaking: { speed: 0.82, energy: 0.82, palette: ["#24528d", "#65bfff", "#f0faff"] },
};

const shellVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const shellFragmentShader = `
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float facing = abs(dot(n, viewDir));
    float rim = pow(1.0 - facing, 2.2);
    float scan = pow(1.0 - abs(sin(vPosition.y * 8.0 + vPosition.x * 3.0 - uTime * 0.32)), 18.0);
    float pulse = 0.5 + 0.5 * sin(vPosition.x * 3.0 - vPosition.z * 2.0 + uTime * 0.45);
    vec3 tint = mix(uColorA, uColorB, smoothstep(0.12, 0.92, pulse));
    vec3 color = tint * (0.22 + rim * 0.9 + scan * 1.4);
    color += uColorC * (rim * 0.35 + scan * 0.9);
    float alpha = 0.035 + rim * (0.13 + uEnergy * 0.08) + scan * 0.15;
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
  float field(vec3 p) {
    return sin(p.x * 4.1 + sin(p.y * 3.0 + uTime * 0.24)) * cos(p.z * 3.7 - uTime * 0.2);
  }
  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    vec3 p = normalize(vPosition);
    float angle = atan(p.y, p.x);
    float spiral = sin(angle * 5.0 + p.z * 8.0 - uTime * 0.38 + field(p * 3.0));
    float contour = pow(1.0 - abs(spiral), 13.0);
    float sweep = pow(1.0 - abs(sin(p.z * 17.0 + angle * 2.0 + uTime * 0.28)), 18.0);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.4);
    float depth = 0.5 + 0.5 * field(p * 4.0);
    vec3 color = mix(vec3(0.003, 0.009, 0.021), uColorA, depth * 0.28);
    color += uColorB * (fresnel * 0.68 + contour * 0.82 + sweep * 0.32);
    color += uColorC * (contour * 0.58 + sweep * 0.22);
    color *= 0.82 + uEnergy * 0.25;
    gl_FragColor = vec4(color, 0.34 + fresnel * 0.26 + contour * 0.18 + sweep * 0.1);
  }
`;

const heartFragmentShader = `
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    vec3 p = normalize(vPosition);
    float a = atan(p.y, p.x);
    float bands = pow(1.0 - abs(sin(a * 7.0 + p.z * 10.0 - uTime * 0.7)), 12.0);
    float currents = pow(1.0 - abs(sin(p.x * 17.0 + p.y * 13.0 - p.z * 8.0 + uTime * 0.45)), 15.0);
    float halo = pow(1.0 - max(dot(n, viewDir), 0.0), 1.7);
    float wave = 0.5 + 0.5 * sin(a * 2.0 - uTime * 0.32 + p.z * 4.0);
    vec3 color = mix(uColorA, uColorB, wave);
    color = mix(color, uColorC, bands * 0.55 + currents * 0.42);
    color += uColorC * (halo * 0.72 + bands * 0.45 + currents * 0.4);
    color *= 0.62 + uEnergy * 0.62;
    gl_FragColor = vec4(color, 0.92);
  }
`;

function makeMaterial(fragmentShader, colors, transparent = true) {
  return new THREE.ShaderMaterial({
    vertexShader: shellVertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0.34 },
      uColorA: { value: new THREE.Color(colors[0]) },
      uColorB: { value: new THREE.Color(colors[1]) },
      uColorC: { value: new THREE.Color(colors[2]) },
    },
    transparent,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: fragmentShader === shellFragmentShader ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function makePlateGeometry() {
  const source = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const attribute = source.getAttribute("position");
  const positions = [];
  for (let i = 0; i < attribute.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(attribute, i);
    const b = new THREE.Vector3().fromBufferAttribute(attribute, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(attribute, i + 2);
    const center = a.clone().add(b).add(c).multiplyScalar(1 / 3).normalize();
    [a, b, c].forEach((vertex) => {
      vertex.lerp(center, 0.085).normalize().multiplyScalar(1.48);
      positions.push(vertex.x, vertex.y, vertex.z);
    });
  }
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeStruts() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: "#6bdfee",
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const geometries = [];
  const count = 12;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const angle = goldenAngle * i;
    const direction = new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
    const tangent = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const bend = Math.sin(i * 4.7) * 0.09;
    const curve = new THREE.CatmullRomCurve3([
      direction.clone().multiplyScalar(0.48),
      direction.clone().multiplyScalar(0.76).addScaledVector(tangent, bend),
      direction.clone().multiplyScalar(1.12).addScaledVector(tangent, -bend * 0.5),
      direction.clone().multiplyScalar(1.42),
    ]);
    const geometry = new THREE.TubeGeometry(curve, 24, 0.0035, 5, false);
    geometries.push(geometry);
    group.add(new THREE.Mesh(geometry, material));
  }
  return { group, material, geometries };
}

function makeOrbScene(host, modeRef) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 6.25);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  host.appendChild(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);

  // Broken geodesic armor: separate facets, not a solid globe.
  const platesGeometry = makePlateGeometry();
  const platesMaterial = makeMaterial(shellFragmentShader, MODES.standby.palette);
  const plates = new THREE.Mesh(platesGeometry, platesMaterial);
  root.add(plates);

  const plateEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(platesGeometry, 1),
    new THREE.LineBasicMaterial({
      color: "#8cecf6",
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  root.add(plateEdges);

  // A second wire cage gives the open shell depth.
  const wireSource = new THREE.IcosahedronGeometry(1.03, 1);
  const innerWireGeometry = new THREE.EdgesGeometry(wireSource, 1);
  wireSource.dispose();
  const innerWireMaterial = new THREE.LineBasicMaterial({
    color: "#4a96bd",
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const innerWire = new THREE.LineSegments(innerWireGeometry, innerWireMaterial);
  root.add(innerWire);

  const struts = makeStruts();
  root.add(struts.group);

  // The dark lens carries moving contours; the bright heart sits behind it.
  const coreMaterial = makeMaterial(coreFragmentShader, MODES.standby.palette, true);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.64, 128, 128), coreMaterial);
  root.add(core);

  const heartMaterial = makeMaterial(heartFragmentShader, MODES.standby.palette, true);
  heartMaterial.blending = THREE.AdditiveBlending;
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.34, 96, 96), heartMaterial);
  heart.renderOrder = 3;
  root.add(heart);

  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(1.66, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color("#3a9dbd") },
        uEnergy: { value: 0.34 },
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
        uniform float uEnergy;
        varying vec3 vNormal;
        void main() {
          float glow = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 3.2);
          gl_FragColor = vec4(uColor, glow * (0.095 + uEnergy * 0.055));
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  root.add(aura);

  // Three offset iris tracks orbit the central lens.
  const makeTrack = (radius, tube, arc, color, opacity, rotation) => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 180, arc), material);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    root.add(mesh);
    return mesh;
  };
  const trackA = makeTrack(0.78, 0.006, Math.PI * 1.64, "#e4fbff", 0.72, [1.08, 0.18, 0.18]);
  const trackB = makeTrack(0.96, 0.004, Math.PI * 1.42, "#5ed9ec", 0.5, [0.36, 1.04, -0.5]);
  const trackC = makeTrack(1.13, 0.003, Math.PI * 1.24, "#8b8af4", 0.35, [1.52, -0.62, 0.72]);

  const beacons = [];
  for (let i = 0; i < 4; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: i === 0 ? "#f3ffff" : "#65dff0",
      transparent: true,
      opacity: 0.96,
    });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(i === 0 ? 0.035 : 0.022, 0), material);
    root.add(mesh);
    beacons.push({
      mesh,
      angle: (i / 4) * Math.PI * 2,
      radius: 1.18 + (i % 2) * 0.13,
      speed: 0.12 + i * 0.035,
      phase: i * 1.7,
    });
  }

  // Fine dust is sparse so the silhouette stays clean.
  const dustCount = 260;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const radius = 1.7 + Math.random() * 1.05;
    const theta = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const planar = Math.sqrt(1 - z * z);
    dustPositions[i * 3] = radius * planar * Math.cos(theta);
    dustPositions[i * 3 + 1] = radius * planar * Math.sin(theta);
    dustPositions[i * 3 + 2] = radius * z;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    color: "#a6dce9",
    size: 0.012,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  root.add(dust);

  const backgroundCount = 100;
  const backgroundPositions = new Float32Array(backgroundCount * 3);
  for (let i = 0; i < backgroundCount; i++) {
    backgroundPositions[i * 3] = (Math.random() - 0.5) * 12;
    backgroundPositions[i * 3 + 1] = (Math.random() - 0.5) * 8;
    backgroundPositions[i * 3 + 2] = -2 - Math.random() * 5;
  }
  const backgroundGeometry = new THREE.BufferGeometry();
  backgroundGeometry.setAttribute("position", new THREE.BufferAttribute(backgroundPositions, 3));
  const backgroundMaterial = new THREE.PointsMaterial({
    color: "#8daabf",
    size: 0.008,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const backgroundStars = new THREE.Points(backgroundGeometry, backgroundMaterial);
  scene.add(backgroundStars);

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
  const targetColors = MODES.standby.palette.map((hex) => new THREE.Color(hex));

  const animate = () => {
    if (disposed) return;
    frameId = requestAnimationFrame(animate);

    const time = clock.getElapsedTime();
    const activeMode = MODES[modeRef.current] || MODES.standby;
    const energy = activeMode.energy;
    const pulse = 1 + Math.sin(time * activeMode.speed * 1.7) * 0.009 * energy;

    [platesMaterial, coreMaterial, heartMaterial].forEach((material, index) => {
      material.uniforms.uTime.value = time * activeMode.speed * (index === 2 ? 1.35 : 1);
      material.uniforms.uEnergy.value = THREE.MathUtils.lerp(material.uniforms.uEnergy.value, energy, 0.035);
    });

    activeMode.palette.forEach((hex, index) => {
      targetColors[index].set(hex);
      const key = ["uColorA", "uColorB", "uColorC"][index];
      [platesMaterial, coreMaterial, heartMaterial].forEach((material) => {
        material.uniforms[key].value.lerp(targetColors[index], 0.035);
      });
    });

    root.scale.setScalar(pulse);
    root.rotation.y = time * 0.035 * activeMode.speed + pointer.x * 0.035;
    root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, pointer.y * 0.04, 0.025);
    root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, -pointer.x * 0.025, 0.025);

    plates.rotation.y = -time * 0.025 * activeMode.speed;
    plates.rotation.x = Math.sin(time * 0.13) * 0.025;
    plateEdges.rotation.copy(plates.rotation);
    innerWire.rotation.y = time * 0.052 * activeMode.speed;
    innerWire.rotation.x = -time * 0.019;
    struts.group.rotation.y = -time * 0.018 * activeMode.speed;
    core.rotation.y = -time * 0.08 * activeMode.speed;
    core.rotation.x = Math.sin(time * 0.16) * 0.035;
    heart.rotation.y = time * 0.15 * activeMode.speed;
    heart.rotation.x = Math.sin(time * 0.22) * 0.08;
    heart.scale.setScalar(1 + Math.sin(time * 1.3) * 0.035 * energy);

    trackA.rotation.z += 0.00065 * activeMode.speed;
    trackB.rotation.x -= 0.0005 * activeMode.speed;
    trackC.rotation.y += 0.00042 * activeMode.speed;
    aura.material.uniforms.uEnergy.value = THREE.MathUtils.lerp(aura.material.uniforms.uEnergy.value, energy, 0.04);
    aura.material.uniforms.uColor.value.lerp(targetColors[1], 0.025);
    dust.rotation.y = -time * 0.008;
    dust.rotation.x = Math.sin(time * 0.07) * 0.025;

    beacons.forEach(({ mesh, angle, radius, speed, phase }) => {
      const a = angle + time * speed * activeMode.speed;
      mesh.position.set(
        Math.cos(a) * radius,
        Math.sin(a * 1.17 + phase) * 0.23,
        Math.sin(a) * radius * 0.54
      );
      mesh.rotation.set(time * 0.3, time * 0.5, time * 0.2);
    });

    renderer.render(scene, camera);
  };
  animate();

  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    host.removeEventListener("pointermove", onPointerMove);

    platesGeometry.dispose();
    platesMaterial.dispose();
    plateEdges.geometry.dispose();
    plateEdges.material.dispose();
    innerWireGeometry.dispose();
    innerWireMaterial.dispose();
    struts.geometries.forEach((geometry) => geometry.dispose());
    struts.material.dispose();
    core.geometry.dispose();
    coreMaterial.dispose();
    heart.geometry.dispose();
    heartMaterial.dispose();
    aura.geometry.dispose();
    aura.material.dispose();
    [trackA, trackB, trackC].forEach((track) => {
      track.geometry.dispose();
      track.material.dispose();
    });
    beacons.forEach(({ mesh }) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    dustGeometry.dispose();
    dustMaterial.dispose();
    backgroundGeometry.dispose();
    backgroundMaterial.dispose();
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
