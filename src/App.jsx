import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const MODES = {
  standby: { speed: 0.28, energy: 0.34, colors: ["#173d55", "#42d6e7", "#e7fbff"] },
  listening: { speed: 0.58, energy: 0.68, colors: ["#145468", "#4ff0eb", "#f3ffff"] },
  thinking: { speed: 0.82, energy: 0.92, colors: ["#352c76", "#9a87ff", "#f1ebff"] },
  speaking: { speed: 0.68, energy: 0.8, colors: ["#1d4778", "#69baff", "#eff8ff"] },
};

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vViewPosition = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const heartShader = `
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  void main() {
    vec3 p = normalize(vPosition);
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float a = atan(p.y, p.x);
    float spiral = sin(a * 3.0 - p.z * 9.0 - uTime * 0.55 + sin(p.y * 8.0 + uTime * 0.25));
    float filament = pow(1.0 - abs(spiral), 16.0);
    float bands = pow(1.0 - abs(sin(a * 8.0 + p.z * 14.0 + uTime * 0.25)), 22.0);
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0);
    float depth = 0.5 + 0.5 * sin(p.x * 5.0 + p.y * 4.0 - p.z * 6.0 + uTime * 0.2);
    vec3 col = mix(uA, uB, depth * 0.55 + 0.2);
    col += uC * (filament * 1.1 + bands * 0.42 + rim * 0.34);
    col *= 0.5 + uEnergy * 0.8;
    gl_FragColor = vec4(col, 0.96);
  }
`;

function makeBladeGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0.24, -0.06);
  shape.bezierCurveTo(0.42, -0.43, 1.02, -0.63, 1.48, -0.35);
  shape.bezierCurveTo(1.4, -0.02, 1.13, 0.38, 0.75, 0.5);
  shape.bezierCurveTo(0.91, 0.2, 0.83, -0.02, 0.56, -0.14);
  shape.bezierCurveTo(0.42, -0.2, 0.31, -0.16, 0.24, -0.06);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.11,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 5,
    bevelThickness: 0.055,
    bevelSize: 0.045,
    curveSegments: 36,
  });
  geometry.translate(0, 0, -0.055);
  geometry.computeVertexNormals();
  return geometry;
}

function makeBladeRim() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.33, -0.12, 0.18),
    new THREE.Vector3(0.57, -0.38, 0.18),
    new THREE.Vector3(0.99, -0.49, 0.18),
    new THREE.Vector3(1.39, -0.31, 0.18),
  ]);
  return new THREE.TubeGeometry(curve, 48, 0.0065, 6, false);
}

function makeOrbScene(host, modeRef) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 5.7);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  host.appendChild(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);

  scene.add(new THREE.AmbientLight(0x7898ad, 0.72));
  const keyLight = new THREE.PointLight(0x4ad9ed, 52, 8, 2);
  keyLight.position.set(-2.8, 2.4, 3.6);
  scene.add(keyLight);
  const coolRim = new THREE.PointLight(0x5965c8, 34, 7, 2);
  coolRim.position.set(2.4, -1.7, -2.0);
  scene.add(coolRim);
  const whiteLight = new THREE.DirectionalLight(0xdaf8ff, 1.8);
  whiteLight.position.set(1.0, 3.0, 4.0);
  scene.add(whiteLight);

  // One thin broken halo frames the silhouette without competing with it.
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: "#4aa9c5",
    transparent: true,
    opacity: 0.36,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.62, 0.006, 8, 220, Math.PI * 1.72),
    haloMaterial
  );
  halo.rotation.set(1.18, 0.22, -0.18);
  root.add(halo);

  // Three substantial crescent blades form a rotating turbine around the center.
  const rotor = new THREE.Group();
  root.add(rotor);
  const bladeGeometry = makeBladeGeometry();
  const rimGeometry = makeBladeRim();
  const bladeMaterials = [
    new THREE.MeshPhysicalMaterial({
      color: "#182b37",
      metalness: 0.88,
      roughness: 0.24,
      clearcoat: 0.92,
      clearcoatRoughness: 0.14,
      emissive: "#071d29",
      emissiveIntensity: 0.62,
    }),
    new THREE.MeshPhysicalMaterial({
      color: "#202a40",
      metalness: 0.9,
      roughness: 0.28,
      clearcoat: 0.85,
      clearcoatRoughness: 0.18,
      emissive: "#0a142c",
      emissiveIntensity: 0.52,
    }),
    new THREE.MeshPhysicalMaterial({
      color: "#172f3a",
      metalness: 0.9,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      emissive: "#08232d",
      emissiveIntensity: 0.58,
    }),
  ];
  const rimMaterials = [
    new THREE.MeshBasicMaterial({ color: "#85efff", transparent: true, opacity: 0.76, blending: THREE.AdditiveBlending }),
    new THREE.MeshBasicMaterial({ color: "#8299ff", transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending }),
    new THREE.MeshBasicMaterial({ color: "#70dff0", transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending }),
  ];
  const bladeHolders = [];
  const rimMeshes = [];
  for (let i = 0; i < 3; i++) {
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.rotation.x = (i - 1) * 0.055;
    holder.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.075;
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterials[i]);
    blade.castShadow = false;
    blade.receiveShadow = false;
    holder.add(blade);
    const rim = new THREE.Mesh(rimGeometry, rimMaterials[i]);
    holder.add(rim);
    rotor.add(holder);
    bladeHolders.push(holder);
    rimMeshes.push(rim);
  }

  // The dark glass lens is forward of the blades, with a bright contained pupil.
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.53, 128, 128),
    new THREE.MeshPhysicalMaterial({
      color: "#050d17",
      metalness: 0.58,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      emissive: "#061b28",
      emissiveIntensity: 0.48,
    })
  );
  lens.position.z = 0.12;
  root.add(lens);

  const lensRimMaterial = new THREE.MeshBasicMaterial({
    color: "#8deeff",
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
  });
  const lensRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.49, 0.009, 10, 180),
    lensRimMaterial
  );
  lensRim.position.z = 0.38;
  root.add(lensRim);

  const heartMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: heartShader,
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0.34 },
      uA: { value: new THREE.Color(MODES.standby.colors[0]) },
      uB: { value: new THREE.Color(MODES.standby.colors[1]) },
      uC: { value: new THREE.Color(MODES.standby.colors[2]) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.285, 96, 96), heartMaterial);
  heart.position.z = 0.52;
  heart.renderOrder = 4;
  root.add(heart);

  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(0.092, 48, 48),
    new THREE.MeshBasicMaterial({ color: "#f2ffff" })
  );
  pupil.position.z = 0.79;
  root.add(pupil);

  const pupilHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 48, 48),
    new THREE.MeshBasicMaterial({
      color: "#58dff2",
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  pupilHalo.position.z = 0.75;
  root.add(pupilHalo);

  // A few tiny orbiting markers give the machine scale; no particle cloud.
  const markers = [];
  for (let i = 0; i < 3; i++) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.024, 0),
      new THREE.MeshBasicMaterial({
        color: i === 1 ? "#a89cff" : "#b8f7ff",
        transparent: true,
        opacity: 0.92,
      })
    );
    root.add(marker);
    markers.push(marker);
  }

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
  const colors = MODES.standby.colors.map((hex) => new THREE.Color(hex));
  const nextColors = MODES.standby.colors.map((hex) => new THREE.Color(hex));
  let frameId = 0;
  let disposed = false;

  const animate = () => {
    if (disposed) return;
    frameId = requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    const mode = MODES[modeRef.current] || MODES.standby;
    const energy = mode.energy;

    heartMaterial.uniforms.uTime.value = time * mode.speed;
    heartMaterial.uniforms.uEnergy.value = THREE.MathUtils.lerp(heartMaterial.uniforms.uEnergy.value, energy, 0.04);
    mode.colors.forEach((hex, i) => {
      nextColors[i].set(hex);
      colors[i].lerp(nextColors[i], 0.035);
    });
    heartMaterial.uniforms.uA.value.copy(colors[0]);
    heartMaterial.uniforms.uB.value.copy(colors[1]);
    heartMaterial.uniforms.uC.value.copy(colors[2]);
    rimMaterials.forEach((material) => material.color.lerp(colors[1], 0.025));
    haloMaterial.color.lerp(colors[0], 0.02);
    lensRimMaterial.color.lerp(colors[2], 0.025);

    rotor.rotation.z = time * 0.075 * mode.speed;
    rotor.rotation.y = Math.sin(time * 0.19) * 0.055 + pointer.x * 0.035;
    rotor.rotation.x = Math.cos(time * 0.17) * 0.035 + pointer.y * 0.025;
    bladeHolders.forEach((holder, i) => {
      holder.rotation.z = (i / 3) * Math.PI * 2;
      holder.position.z = Math.sin(time * 0.5 + i * 2.1) * 0.018;
    });
    root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, pointer.x * 0.12, 0.025);
    root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, -pointer.y * 0.09, 0.025);
    root.scale.setScalar(1 + Math.sin(time * 1.1 * mode.speed) * 0.008 * energy);

    lens.rotation.y = time * 0.045 * mode.speed;
    lens.rotation.x = Math.sin(time * 0.22) * 0.035;
    lensRim.rotation.z = -time * 0.12 * mode.speed;
    heart.rotation.y = -time * 0.18 * mode.speed;
    heart.rotation.x = Math.sin(time * 0.25) * 0.06;
    heart.scale.setScalar(1 + Math.sin(time * 1.8) * 0.035 * energy);
    pupilHalo.scale.setScalar(1 + Math.sin(time * 2.0) * 0.12 * energy);
    halo.rotation.z = time * 0.018 * mode.speed;

    markers.forEach((marker, i) => {
      const angle = time * (0.16 + i * 0.035) + i * (Math.PI * 2 / 3);
      marker.position.set(Math.cos(angle) * 1.58, Math.sin(angle) * 1.58, Math.sin(angle * 1.3) * 0.16);
      marker.rotation.set(time * 0.4, time * 0.6, time * 0.3);
    });

    keyLight.intensity = 42 + energy * 16;
    renderer.render(scene, camera);
  };
  animate();

  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    host.removeEventListener("pointermove", onPointerMove);

    halo.geometry.dispose();
    halo.material.dispose();
    bladeGeometry.dispose();
    rimGeometry.dispose();
    bladeMaterials.forEach((material) => material.dispose());
    rimMaterials.forEach((material) => material.dispose());
    lens.geometry.dispose();
    lens.material.dispose();
    lensRim.geometry.dispose();
    lensRim.material.dispose();
    heart.geometry.dispose();
    heartMaterial.dispose();
    pupil.geometry.dispose();
    pupil.material.dispose();
    pupilHalo.geometry.dispose();
    pupilHalo.material.dispose();
    markers.forEach((marker) => {
      marker.geometry.dispose();
      marker.material.dispose();
    });
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
