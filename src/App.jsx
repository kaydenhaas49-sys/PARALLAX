import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Volume2, VolumeX } from "lucide-react";
import { synthesizeSpeech } from "./voice.js";

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


function makeBladeEngravings() {
  const paths = [
    [
      new THREE.Vector3(0.36, -0.07, 0.119),
      new THREE.Vector3(0.62, -0.28, 0.119),
      new THREE.Vector3(0.98, -0.36, 0.119),
      new THREE.Vector3(1.29, -0.29, 0.119),
    ],
    [
      new THREE.Vector3(0.52, 0.02, 0.119),
      new THREE.Vector3(0.77, 0.13, 0.119),
      new THREE.Vector3(1.03, 0.12, 0.119),
    ],
  ];
  return paths.map((points, index) => new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    36,
    index === 0 ? 0.004 : 0.0028,
    5,
    false
  ));
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
  const engravingGeometries = makeBladeEngravings();
  const engravingMaterial = new THREE.MeshBasicMaterial({
    color: "#83dbe9",
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const fastenerGeometry = new THREE.SphereGeometry(0.018, 16, 16);
  const fastenerMaterial = new THREE.MeshStandardMaterial({
    color: "#7895a2",
    metalness: 0.95,
    roughness: 0.22,
  });
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
    engravingGeometries.forEach((geometry) => {
      holder.add(new THREE.Mesh(geometry, engravingMaterial));
    });
    const fastenerA = new THREE.Mesh(fastenerGeometry, fastenerMaterial);
    fastenerA.position.set(0.47, -0.12, 0.13);
    const fastenerB = new THREE.Mesh(fastenerGeometry, fastenerMaterial);
    fastenerB.position.set(1.17, -0.27, 0.13);
    holder.add(fastenerA, fastenerB);
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

  // Concentric aperture rings make the central eye feel like a precision instrument.
  const apertureOuterMaterial = new THREE.MeshBasicMaterial({
    color: "#6edff0",
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const apertureInnerMaterial = new THREE.MeshBasicMaterial({
    color: "#d8faff",
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const apertureOuter = new THREE.Mesh(
    new THREE.TorusGeometry(0.365, 0.006, 8, 160),
    apertureOuterMaterial
  );
  apertureOuter.position.z = 0.59;
  root.add(apertureOuter);
  const apertureInner = new THREE.Mesh(
    new THREE.TorusGeometry(0.235, 0.004, 8, 144),
    apertureInnerMaterial
  );
  apertureInner.position.z = 0.69;
  root.add(apertureInner);
  const apertureTicks = new THREE.Group();
  root.add(apertureTicks);
  const tickGeometry = new THREE.BoxGeometry(0.035, 0.004, 0.004);
  const tickMaterial = new THREE.MeshBasicMaterial({
    color: "#9deefa",
    transparent: true,
    opacity: 0.56,
    blending: THREE.AdditiveBlending,
  });
  for (let i = 0; i < 8; i++) {
    const tick = new THREE.Mesh(tickGeometry, tickMaterial);
    const angle = (i / 8) * Math.PI * 2;
    tick.position.set(Math.cos(angle) * 0.405, Math.sin(angle) * 0.405, 0.61);
    tick.rotation.z = angle;
    apertureTicks.add(tick);
  }

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

  // Track the cursor across the whole window so the orb can physically follow it.
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, activity: 0 };
  const onPointerMove = (event) => {
    pointer.x = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    pointer.y = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    pointer.vx = THREE.MathUtils.clamp(event.movementX / 34, -1, 1);
    pointer.vy = THREE.MathUtils.clamp(event.movementY / 34, -1, 1);
    pointer.activity = Math.min(1, Math.hypot(pointer.vx, pointer.vy));
  };
  const onPointerLeave = () => {
    pointer.x = 0;
    pointer.y = 0;
    pointer.vx = 0;
    pointer.vy = 0;
    pointer.activity = 0;
  };
  window.addEventListener("pointermove", onPointerMove);
  document.documentElement.addEventListener("pointerleave", onPointerLeave);

  const resizeObserver = new ResizeObserver(() => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  resizeObserver.observe(host);

  const clock = new THREE.Clock();
  let smoothActivity = 0;
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
    heartMaterial.uniforms.uEnergy.value = THREE.MathUtils.lerp(
      heartMaterial.uniforms.uEnergy.value,
      energy + pointer.activity * 0.18,
      0.04
    );
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

    // Smooth mouse activity so quick pointer events never jerk the mechanism.
    smoothActivity = THREE.MathUtils.lerp(smoothActivity, pointer.activity, 0.055);
    const cursorActivity = smoothActivity;
    pointer.vx *= 0.88;
    pointer.vy *= 0.88;
    pointer.activity *= 0.84;
    // Keep the turbine's rotation constant; cursor movement should not change its speed.
    rotor.rotation.z = time * 0.135;
    rotor.rotation.y = Math.sin(time * 0.19) * 0.055 + pointer.x * 0.035;
    rotor.rotation.x = Math.cos(time * 0.17) * 0.035 + pointer.y * 0.025;
    bladeHolders.forEach((holder, i) => {
      holder.rotation.x = Math.sin(time * 0.42 + i * 2.1) * 0.018;
      holder.rotation.y = Math.cos(time * 0.36 + i * 2.1) * 0.014;
    });
    apertureOuter.rotation.z = time * 0.055 * mode.speed;
    apertureInner.rotation.z = -time * 0.085 * mode.speed;
    apertureTicks.rotation.z = time * 0.025 * mode.speed;
    apertureOuterMaterial.opacity = 0.3 + energy * 0.16;
    apertureInnerMaterial.opacity = 0.58 + energy * 0.18;
    bladeHolders.forEach((holder, i) => {
      holder.rotation.z = (i / 3) * Math.PI * 2;
      holder.position.z = Math.sin(time * 0.5 + i * 2.1) * 0.018;
    });
    // Smoothly drift toward the cursor, with enough restraint to keep the orb framed.
    root.position.x = THREE.MathUtils.lerp(root.position.x, pointer.x * 0.62, 0.022);
    root.position.y = THREE.MathUtils.lerp(root.position.y, -pointer.y * 0.5, 0.022);
    root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, pointer.x * 0.16, 0.022);
    root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, -pointer.y * 0.12, 0.022);
    root.scale.setScalar(
      1 + Math.sin(time * 1.1 * mode.speed) * 0.008 * energy + cursorActivity * 0.012
    );

    // The eye tracks the cursor independently, while movement gives the core a quick response.
    const eyeX = pointer.x * 0.075;
    const eyeY = -pointer.y * 0.075;
    pupil.position.x = THREE.MathUtils.lerp(pupil.position.x, eyeX, 0.12);
    pupil.position.y = THREE.MathUtils.lerp(pupil.position.y, eyeY, 0.12);
    pupilHalo.position.x = THREE.MathUtils.lerp(pupilHalo.position.x, eyeX * 0.72, 0.1);
    pupilHalo.position.y = THREE.MathUtils.lerp(pupilHalo.position.y, eyeY * 0.72, 0.1);
    heart.position.x = THREE.MathUtils.lerp(heart.position.x, eyeX * 0.42, 0.08);
    heart.position.y = THREE.MathUtils.lerp(heart.position.y, eyeY * 0.42, 0.08);
    pupilHalo.material.opacity = 0.12 + cursorActivity * 0.12;

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

    keyLight.intensity = 42 + energy * 16 + cursorActivity * 18;
    coolRim.intensity = 28 + energy * 8 + cursorActivity * 12;
    renderer.render(scene, camera);
  };
  animate();

  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);

    halo.geometry.dispose();
    halo.material.dispose();
    bladeGeometry.dispose();
    rimGeometry.dispose();
    engravingGeometries.forEach((geometry) => geometry.dispose());
    engravingMaterial.dispose();
    fastenerGeometry.dispose();
    fastenerMaterial.dispose();
    bladeMaterials.forEach((material) => material.dispose());
    rimMaterials.forEach((material) => material.dispose());
    lens.geometry.dispose();
    lens.material.dispose();
    lensRim.geometry.dispose();
    lensRim.material.dispose();
    apertureOuter.geometry.dispose();
    apertureOuterMaterial.dispose();
    apertureInner.geometry.dispose();
    apertureInnerMaterial.dispose();
    apertureTicks.children.forEach((tick) => tick.geometry.dispose());
    tickGeometry.dispose();
    tickMaterial.dispose();
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
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [connection, setConnection] = useState({ status: "connecting", model: "" });
  const [model, setModel] = useState("glm");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceStatus, setVoiceStatus] = useState("unknown");
  const orbStage = useRef(null);
  const speakingTimer = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const speechRequestRef = useRef(0);
  const voiceEnabledRef = useRef(true);
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    let active = true;
    const connectToGLM = async () => {
      try {
        const response = await fetch("/api/glm/models");
        if (!response.ok) throw new Error("GLM model endpoint returned " + response.status);
        const payload = await response.json();
        const availableModel =
          payload.data?.[0]?.id ||
          payload.models?.[0]?.name ||
          payload.models?.[0]?.model ||
          "glm";
        if (!active) return;
        setModel(availableModel);
        setConnection({ status: "online", model: availableModel });
      } catch {
        if (!active) return;
        setConnection({ status: "offline", model: "" });
      }
    };
    connectToGLM();
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (speakingTimer.current) window.clearTimeout(speakingTimer.current);
    if (audioRef.current) audioRef.current.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  const clearSpeech = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  };

  const stopSpeech = () => {
    speechRequestRef.current += 1;
    if (speakingTimer.current) {
      window.clearTimeout(speakingTimer.current);
      speakingTimer.current = null;
    }
    clearSpeech();
  };

  const speakAssistant = async (answer) => {
    if (!voiceEnabledRef.current) return;
    const requestId = ++speechRequestRef.current;
    setVoiceStatus("loading");
    try {
      const audioUrl = await synthesizeSpeech(answer);
      if (!voiceEnabledRef.current || requestId !== speechRequestRef.current) {
        URL.revokeObjectURL(audioUrl);
        return;
      }

      clearSpeech();
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;
      audio.onended = () => {
        clearSpeech();
        setMode((current) => current === "speaking" ? "standby" : current);
      };
      audio.onerror = () => {
        clearSpeech();
        setVoiceStatus("offline");
        setMode((current) => current === "speaking" ? "standby" : current);
      };

      await audio.play();
      setVoiceStatus("ready");
      setMode("speaking");
    } catch {
      clearSpeech();
      setVoiceStatus("offline");
      setMode((current) => current === "thinking" ? "standby" : current);
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    stopSpeech();

    const userMessage = { id: Date.now(), role: "user", content: text };
    const conversation = [...messages, userMessage];
    setMessages(conversation);
    setDraft("");
    setIsSending(true);
    setMode("thinking");

    try {
      const response = await fetch("/api/glm/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "You are PARALLAX, a capable, thoughtful local AI assistant and the user's sharp-witted onboard teammate. Be clear, useful, natural, and conversational. Sound relaxed, direct, quick-thinking, and confident; use dry humour, cheeky bluntness, and occasional mild-to-moderate swearing only when it fits naturally. Do not sound like a corporate helpdesk or formal presenter. Keep ordinary answers concise. When the user signals urgency, prioritize essential information and respond in short, direct sentences without panic or unnecessary explanation. Explain technical work step by step when asked, and never claim to have performed actions on the user's computer unless a connected tool actually did so."
            },
            ...conversation.slice(-14).map(({ role, content }) => ({ role, content }))
          ],
          temperature: 0.7,
          max_tokens: 1200,
          stream: false
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message || payload.message || ("GLM request failed (" + response.status + ")"));
      }
      const rawContent = payload.choices?.[0]?.message?.content;
      const answer = Array.isArray(rawContent)
        ? rawContent.map((part) => typeof part === "string" ? part : (part.text || part.content || "")).join("")
        : rawContent;
      if (typeof answer !== "string" || !answer.trim()) {
        throw new Error("GLM returned an empty response.");
      }

      setMessages((current) => [...current, { id: Date.now() + 1, role: "assistant", content: answer.trim() }]);
      if (voiceEnabledRef.current) {
        void speakAssistant(answer.trim());
      } else {
        setMode("speaking");
        if (speakingTimer.current) window.clearTimeout(speakingTimer.current);
        speakingTimer.current = window.setTimeout(() => {
          setMode((current) => current === "speaking" ? "standby" : current);
        }, 4200);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown connection error.";
      setMessages((current) => [...current, {
        id: Date.now() + 1,
        role: "assistant",
        content: "I couldn't complete that request. " + message + " Check that your GLM server is running at 127.0.0.1:8080."
      }]);
      setMode("standby");
    } finally {
      setIsSending(false);
    }
  };

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

      <section className="assistant-console" aria-label="Talk to PARALLAX">
        {messages.length > 0 && (
          <div className="conversation" aria-live="polite" aria-relevant="additions">
            {messages.slice(-5).map((message) => (
              <div className={"chat-message " + message.role} key={message.id}>
                <span className="message-role">{message.role === "user" ? "YOU" : "PARALLAX"}</span>
                <p>{message.content}</p>
              </div>
            ))}
            <div className="conversation-end" />
          </div>
        )}
        <form className="composer" onSubmit={sendMessage}>
          <div className="composer-meta">
            <span className={"connection-dot " + connection.status} />
            <span>
              {connection.status === "online"
                ? "GLM CONNECTED · " + model
                : connection.status === "connecting"
                  ? "CONNECTING TO GLM"
                  : "GLM OFFLINE · CHECK LOCAL SERVER"}
            </span>
          </div>
          <div className="composer-input-row">
            <input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (!isSending) setMode(event.target.value.trim() ? "listening" : "standby");
              }}
              onFocus={() => { if (draft.trim() && !isSending) setMode("listening"); }}
              placeholder="Message PARALLAX..."
              aria-label="Message PARALLAX"
              autoComplete="off"
            />
            <button
              type="button"
              className={"voice-toggle " + (voiceEnabled ? "enabled" : "muted")}
              aria-label={voiceEnabled ? "Mute PARALLAX voice" : "Enable PARALLAX voice"}
              title={voiceStatus === "offline"
                ? "Local voice engine offline — start npm run voice"
                : voiceEnabled ? "Mute PARALLAX voice" : "Enable PARALLAX voice"}
              onClick={() => {
                const next = !voiceEnabledRef.current;
                voiceEnabledRef.current = next;
                setVoiceEnabled(next);
                if (!next) {
                  stopSpeech();
                  setMode("standby");
                }
              }}
            >
              {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button type="submit" aria-label="Send message" disabled={!draft.trim() || isSending}>
              {isSending ? <span className="send-spinner" /> : "↑"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
