/**
 * CinematicChess3DScene – Seamless 2D→3D→2D chess cinematic.
 *
 * Camera starts top-down (matching 2D board), swoops to dramatic angle,
 * piece moves, camera returns to top-down. All pieces rendered.
 *
 * Supports persistent mode: stays in 3D across multiple moves.
 * When a new event arrives while already in 3D, the piece move plays
 * without swoop-in (camera stays dramatic). Swoop-out only plays
 * on dismiss.
 *
 * CRITICAL: No React state updates during animation — all animation
 * is driven by refs and imperative Three.js mutations to avoid
 * re-renders and material flashing.
 *
 * pointer-events: none – never blocks interaction.
 */

import { useRef, useMemo, useEffect, useCallback, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CinematicEvent, BoardPiece } from "@/lib/buildCinematicEvent";
import type { CinematicTier } from "@/hooks/useCinematicMode";

// ─── Constants ────────────────────────────────────────────────────────────────

const BOARD_SIZE = 4;
const SQ = BOARD_SIZE / 8;
const HALF = BOARD_SIZE / 2;
const PIECE_SCALE = 1.4;

const LIGHT_SQ = new THREE.Color("hsl(38, 45%, 75%)");
const DARK_SQ = new THREE.Color("hsl(25, 35%, 32%)");
const GOLD_TRIM = new THREE.Color("hsl(42, 75%, 50%)");

function squareToWorld(sq: string, flipped: boolean): [number, number] {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10) - 1;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  return [-HALF + SQ * col + SQ / 2, -HALF + SQ * row + SQ / 2];
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ─── Animation Phase Helper ───────────────────────────────────────────────────
// When NOT persistent (first entry): 0.00–0.15 swoop-in, 0.15–0.60 move, 0.60–1.00 swoop-out
// When persistent (already in 3D):   0.00–0.70 move, 0.70–1.00 hold (no swoop)
// Dismiss: separate swoop-out animation

type AnimPhase = "swoop-in" | "move" | "hold" | "swoop-out";

function getPhase(progress: number, isFirstEntry: boolean): { phase: AnimPhase; t: number } {
  if (isFirstEntry) {
    // First entry: swoop in → move → hold at dramatic angle
    if (progress < 0.15) return { phase: "swoop-in", t: progress / 0.15 };
    if (progress < 0.75) return { phase: "move", t: (progress - 0.15) / 0.60 };
    return { phase: "hold", t: 1 };
  }
  // Subsequent moves (already in 3D): just move the piece
  if (progress < 0.80) return { phase: "move", t: progress / 0.80 };
  return { phase: "hold", t: 1 };
}

// ─── Lathe Profiles ───────────────────────────────────────────────────────────

const PIECE_PROFILES: Record<string, [number, number][]> = {
  pawn: [
    [0, 0], [0.12, 0], [0.13, 0.02], [0.1, 0.04],
    [0.06, 0.12], [0.05, 0.18], [0.07, 0.22], [0.06, 0.28], [0, 0.3],
  ],
  rook: [
    [0, 0], [0.14, 0], [0.15, 0.02], [0.12, 0.05],
    [0.08, 0.15], [0.08, 0.30], [0.12, 0.32], [0.12, 0.40],
    [0.09, 0.40], [0.09, 0.38], [0.06, 0.38], [0.06, 0.40], [0, 0.40],
  ],
  knight: [
    [0, 0], [0.13, 0], [0.14, 0.02], [0.1, 0.05],
    [0.07, 0.12], [0.06, 0.20], [0.08, 0.25], [0.1, 0.32],
    [0.08, 0.38], [0.04, 0.42], [0, 0.44],
  ],
  bishop: [
    [0, 0], [0.13, 0], [0.14, 0.02], [0.1, 0.05],
    [0.06, 0.15], [0.05, 0.28], [0.07, 0.33], [0.06, 0.40],
    [0.03, 0.44], [0, 0.47],
  ],
  queen: [
    [0, 0], [0.14, 0], [0.15, 0.02], [0.11, 0.06],
    [0.07, 0.18], [0.06, 0.32], [0.09, 0.36], [0.1, 0.42],
    [0.07, 0.48], [0.04, 0.52], [0, 0.55],
  ],
  king: [
    [0, 0], [0.14, 0], [0.15, 0.02], [0.11, 0.06],
    [0.07, 0.20], [0.06, 0.36], [0.09, 0.40], [0.1, 0.46],
    [0.08, 0.50], [0.04, 0.54], [0.02, 0.56], [0, 0.58],
  ],
};

// ─── Global Material & Geometry Cache (never recreated) ───────────────────────

const _geoCache = new Map<string, THREE.LatheGeometry>();
const _matCache = new Map<string, THREE.Material>();

function getCachedGeo(piece: string, lite: boolean): THREE.LatheGeometry {
  const key = `${piece}-${lite ? "l" : "f"}`;
  let g = _geoCache.get(key);
  if (!g) {
    const profile = PIECE_PROFILES[piece] ?? PIECE_PROFILES.pawn;
    const pts = profile.map(([x, y]) => new THREE.Vector2(x * PIECE_SCALE, y * PIECE_SCALE));
    g = new THREE.LatheGeometry(pts, lite ? 10 : 16);
    _geoCache.set(key, g);
  }
  return g;
}

function getCachedMat(color: "white" | "black", lite: boolean): THREE.Material {
  const key = `${color}-${lite ? "l" : "f"}`;
  let m = _matCache.get(key);
  if (!m) {
    if (color === "white") {
      m = lite
        ? new THREE.MeshStandardMaterial({ color: "#f0e6d3", roughness: 0.3, metalness: 0.05 })
        : new THREE.MeshPhysicalMaterial({
            color: "#f5ead8", roughness: 0.15, metalness: 0.02,
            clearcoat: 1.0, clearcoatRoughness: 0.08,
          });
    } else {
      m = lite
        ? new THREE.MeshStandardMaterial({ color: "#1a1a22", roughness: 0.25, metalness: 0.4 })
        : new THREE.MeshPhysicalMaterial({
            color: "#141418", roughness: 0.12, metalness: 0.6,
            clearcoat: 0.9, clearcoatRoughness: 0.05,
          });
    }
    _matCache.set(key, m);
  }
  return m;
}

// ─── Board (static — never re-renders) ────────────────────────────────────────

function BoardPlane({ lite }: { lite: boolean }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(SQ, SQ), []);
  const squares = useMemo(() => {
    const r: { x: number; z: number; dark: boolean }[] = [];
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++)
        r.push({ x: -HALF + SQ * col + SQ / 2, z: -HALF + SQ * row + SQ / 2, dark: (row + col) % 2 === 1 });
    return r;
  }, []);

  const lightMat = useMemo(() => lite
    ? new THREE.MeshStandardMaterial({ color: LIGHT_SQ, roughness: 0.5 })
    : new THREE.MeshPhysicalMaterial({ color: LIGHT_SQ, roughness: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  [lite]);

  const darkMat = useMemo(() => lite
    ? new THREE.MeshStandardMaterial({ color: DARK_SQ, roughness: 0.5 })
    : new THREE.MeshPhysicalMaterial({ color: DARK_SQ, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
  [lite]);

  const trimMat = useMemo(() => lite
    ? new THREE.MeshStandardMaterial({ color: GOLD_TRIM, roughness: 0.3, metalness: 0.8 })
    : new THREE.MeshPhysicalMaterial({ color: GOLD_TRIM, roughness: 0.15, metalness: 0.9, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
  [lite]);

  const trimThickness = 0.04;
  const trimHeight = 0.06;
  const totalSize = BOARD_SIZE + trimThickness * 2;

  return (
    <group>
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        {squares.map((s, i) => (
          <mesh key={i} geometry={geo} position={[s.x, s.z, 0]} receiveShadow material={s.dark ? darkMat : lightMat} />
        ))}
      </group>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[BOARD_SIZE + 0.1, 0.08, BOARD_SIZE + 0.1]} />
        <meshStandardMaterial color="#191920" roughness={0.8} />
      </mesh>
      <mesh position={[0, trimHeight / 2, -HALF - trimThickness / 2]} material={trimMat}>
        <boxGeometry args={[totalSize, trimHeight, trimThickness]} />
      </mesh>
      <mesh position={[0, trimHeight / 2, HALF + trimThickness / 2]} material={trimMat}>
        <boxGeometry args={[totalSize, trimHeight, trimThickness]} />
      </mesh>
      <mesh position={[-HALF - trimThickness / 2, trimHeight / 2, 0]} material={trimMat}>
        <boxGeometry args={[trimThickness, trimHeight, BOARD_SIZE]} />
      </mesh>
      <mesh position={[HALF + trimThickness / 2, trimHeight / 2, 0]} material={trimMat}>
        <boxGeometry args={[trimThickness, trimHeight, BOARD_SIZE]} />
      </mesh>
    </group>
  );
}

// ─── Static Piece (no animation, never re-renders) ────────────────────────────

function StaticPiece({ piece, color, x, z, lite }: {
  piece: string; color: "white" | "black"; x: number; z: number; lite: boolean;
}) {
  const geo = useMemo(() => getCachedGeo(piece, lite), [piece, lite]);
  const mat = useMemo(() => getCachedMat(color, lite), [color, lite]);

  return (
    <group position={[x, 0, z]}>
      <mesh geometry={geo} castShadow material={mat} />
      {piece === "king" && (
        <group position={[0, 0.58 * PIECE_SCALE, 0]}>
          <mesh castShadow material={mat}>
            <boxGeometry args={[0.03 * PIECE_SCALE, 0.1 * PIECE_SCALE, 0.03 * PIECE_SCALE]} />
          </mesh>
          <mesh position={[0, 0.03 * PIECE_SCALE, 0]} castShadow material={mat}>
            <boxGeometry args={[0.08 * PIECE_SCALE, 0.03 * PIECE_SCALE, 0.03 * PIECE_SCALE]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ─── Moving Piece (imperative position via useFrame) ──────────────────────────

function MovingPiece({ piece, color, fromPos, toPos, isCapture, lite, progressRef, isFirstEntryRef }: {
  piece: string; color: "white" | "black";
  fromPos: [number, number]; toPos: [number, number];
  isCapture: boolean; lite: boolean;
  progressRef: React.MutableRefObject<number>;
  isFirstEntryRef: React.MutableRefObject<boolean>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const srcHighlightRef = useRef<THREE.Mesh>(null);
  const dstHighlightRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => getCachedGeo(piece, lite), [piece, lite]);
  const mat = useMemo(() => getCachedMat(color, lite), [color, lite]);

  useFrame(() => {
    const progress = progressRef.current;
    const { phase, t } = getPhase(progress, isFirstEntryRef.current);
    const moveT = phase === "swoop-in" ? 0 : phase === "move" ? easeInOutCubic(t) : 1;

    const x = fromPos[0] + (toPos[0] - fromPos[0]) * moveT;
    const z = fromPos[1] + (toPos[1] - fromPos[1]) * moveT;
    const arcY = Math.sin(moveT * Math.PI) * 0.3;

    if (groupRef.current) {
      groupRef.current.position.set(x, arcY, z);
    }
    if (srcHighlightRef.current) {
      (srcHighlightRef.current.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - moveT);
    }
    if (dstHighlightRef.current) {
      (dstHighlightRef.current.material as THREE.MeshBasicMaterial).opacity = 0.4 * moveT;
    }
  });

  return (
    <>
      <group ref={groupRef} position={[fromPos[0], 0, fromPos[1]]}>
        <mesh geometry={geo} castShadow material={mat} />
        {piece === "king" && (
          <group position={[0, 0.58 * PIECE_SCALE, 0]}>
            <mesh castShadow material={mat}>
              <boxGeometry args={[0.03 * PIECE_SCALE, 0.1 * PIECE_SCALE, 0.03 * PIECE_SCALE]} />
            </mesh>
            <mesh position={[0, 0.03 * PIECE_SCALE, 0]} castShadow material={mat}>
              <boxGeometry args={[0.08 * PIECE_SCALE, 0.03 * PIECE_SCALE, 0.03 * PIECE_SCALE]} />
            </mesh>
          </group>
        )}
      </group>

      <mesh ref={srcHighlightRef} position={[fromPos[0], 0.005, fromPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial color="#ffd700" transparent opacity={0.35} />
      </mesh>

      <mesh ref={dstHighlightRef} position={[toPos[0], 0.005, toPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial color={isCapture ? "#ff3333" : "#ffd700"} transparent opacity={0} />
      </mesh>
    </>
  );
}

// ─── Gold Capture Explosion ───────────────────────────────────────────────────

const GOLD_PARTICLE_COLORS = [
  new THREE.Color("#FFD700"),
  new THREE.Color("#FFC107"),
  new THREE.Color("#FFEB3B"),
  new THREE.Color("#F9A825"),
  new THREE.Color("#FFE082"),
  new THREE.Color("#E6BE8A"),
];

function CaptureExplosion({ position, progressRef, isFirstEntryRef }: {
  position: [number, number];
  progressRef: React.MutableRefObject<number>;
  isFirstEntryRef: React.MutableRefObject<boolean>;
}) {
  const COUNT = 60;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Pre-compute random velocities and properties
  const particleData = useMemo(() => {
    return Array.from({ length: COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const elevation = Math.random() * Math.PI * 0.6 - 0.1;
      const speed = 1.5 + Math.random() * 3;
      return {
        vx: Math.cos(angle) * Math.cos(elevation) * speed,
        vy: Math.sin(elevation) * speed + 1.5,
        vz: Math.sin(angle) * Math.cos(elevation) * speed,
        rotSpeed: (Math.random() - 0.5) * 10,
        scale: 0.015 + Math.random() * 0.035,
        colorIdx: Math.floor(Math.random() * GOLD_PARTICLE_COLORS.length),
      };
    });
  }, []);

  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#FFD700",
    metalness: 0.9,
    roughness: 0.1,
    emissive: "#FFD700",
    emissiveIntensity: 0.3,
  }), []);

  // Set initial colors
  useEffect(() => {
    if (!meshRef.current) return;
    const color = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      color.copy(GOLD_PARTICLE_COLORS[particleData[i].colorIdx]);
      meshRef.current.setColorAt(i, color);
    }
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [particleData]);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;

    const progress = progressRef.current;
    const { phase, t } = getPhase(progress, isFirstEntryRef.current);

    // Explosion starts at 70% of move phase and plays for 0.8 seconds
    const moveT = phase === "swoop-in" ? 0 : phase === "move" ? t : 1;
    const explosionTrigger = 0.7;
    
    if (moveT < explosionTrigger) {
      // Hide all particles before trigger
      for (let i = 0; i < COUNT; i++) {
        dummy.position.set(0, -100, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      return;
    }

    const explosionT = Math.min((moveT - explosionTrigger) / (1 - explosionTrigger), 1);
    const gravity = 4;

    for (let i = 0; i < COUNT; i++) {
      const p = particleData[i];
      const time = explosionT * 1.2; // stretch time a bit for drama
      const x = position[0] + p.vx * time;
      const y = p.vy * time - 0.5 * gravity * time * time;
      const z = position[1] + p.vz * time;
      const fadeOut = Math.max(0, 1 - explosionT * 1.1);
      const s = p.scale * fadeOut;

      dummy.position.set(x, Math.max(0.01, y), z);
      dummy.rotation.set(
        p.rotSpeed * time,
        p.rotSpeed * time * 0.7,
        p.rotSpeed * time * 0.3
      );
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[geo, mat, COUNT]} frustumCulled={false} />
  );
}



function SceneLighting({ lite, progressRef, isFirstEntryRef }: {
  lite: boolean;
  progressRef: React.MutableRefObject<number>;
  isFirstEntryRef: React.MutableRefObject<boolean>;
}) {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  const rimRef = useRef<THREE.PointLight>(null);

  useFrame(() => {
    const progress = progressRef.current;
    const { phase, t } = getPhase(progress, isFirstEntryRef.current);
    const swoopFactor = phase === "swoop-in"
      ? easeInOutCubic(t)
      : (phase === "move" || phase === "hold") ? 1
      : 1 - easeInOutCubic(t);

    if (ambientRef.current) ambientRef.current.intensity = 0.6 - swoopFactor * 0.2;
    if (keyRef.current) keyRef.current.intensity = 0.8 + swoopFactor * 0.4;
    if (fillRef.current) fillRef.current.intensity = swoopFactor * 0.35;
    if (rimRef.current) rimRef.current.intensity = swoopFactor * 1.2;
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.6} color="#f5f0e8" />
      <directionalLight
        ref={keyRef}
        position={[3, 5, 2]}
        intensity={0.8}
        color="#f0dcc0"
        castShadow={!lite}
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <directionalLight ref={fillRef} position={[-3, 2, 1]} intensity={0} color="#a0b8d0" />
      {!lite && (
        <pointLight ref={rimRef} position={[0, 1.5, -3]} intensity={0} color="#d4a030" distance={8} decay={2} />
      )}
      <directionalLight position={[0, -1, 2]} intensity={0.15} color="#7080a0" />
    </>
  );
}

// ─── Camera Rig ───────────────────────────────────────────────────────────────

const TOP_DOWN_POS = new THREE.Vector3(0, 6.5, 0.01);
const TOP_DOWN_LOOK = new THREE.Vector3(0, 0, 0);

function CameraRig({ fromPos, toPos, progressRef, isFirstEntryRef, isDismissingRef, dismissProgressRef }: {
  fromPos: [number, number]; toPos: [number, number];
  progressRef: React.MutableRefObject<number>;
  isFirstEntryRef: React.MutableRefObject<boolean>;
  isDismissingRef: React.MutableRefObject<boolean>;
  dismissProgressRef: React.MutableRefObject<number>;
}) {
  const { camera } = useThree();
  const tmpPos = useRef(new THREE.Vector3());
  const tmpLook = useRef(new THREE.Vector3());
  const dramaticPos = useRef(new THREE.Vector3());
  const dramaticLook = useRef(new THREE.Vector3());

  useEffect(() => {
    const midX = (fromPos[0] + toPos[0]) / 2;
    const midZ = (fromPos[1] + toPos[1]) / 2;
    dramaticPos.current.set(midX * 0.3, 1.6, 3.2);
    dramaticLook.current.set(midX * 0.3, 0.1, midZ * 0.4);

    // Only set camera to top-down on first entry
    if (isFirstEntryRef.current) {
      camera.position.copy(TOP_DOWN_POS);
      camera.lookAt(TOP_DOWN_LOOK);
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }
  }, [camera, fromPos, toPos]);

  useFrame(() => {
    // Handle dismiss swoop-out
    if (isDismissingRef.current) {
      const dt = dismissProgressRef.current;
      const et = easeInOutCubic(dt);
      tmpPos.current.lerpVectors(dramaticPos.current, TOP_DOWN_POS, et);
      tmpLook.current.lerpVectors(dramaticLook.current, TOP_DOWN_LOOK, et);
      camera.position.copy(tmpPos.current);
      camera.lookAt(tmpLook.current);
      return;
    }

    const progress = progressRef.current;
    const { phase, t } = getPhase(progress, isFirstEntryRef.current);
    const et = easeInOutCubic(t);
    const midX = (fromPos[0] + toPos[0]) / 2;
    const midZ = (fromPos[1] + toPos[1]) / 2;

    if (phase === "swoop-in") {
      tmpPos.current.lerpVectors(TOP_DOWN_POS, dramaticPos.current, et);
      tmpLook.current.lerpVectors(TOP_DOWN_LOOK, dramaticLook.current, et);
    } else if (phase === "move") {
      const followT = easeInOutCubic(t);
      tmpPos.current.copy(dramaticPos.current);
      tmpPos.current.x += (toPos[0] - midX) * followT * 0.15;
      tmpLook.current.copy(dramaticLook.current);
      tmpLook.current.x += (toPos[0] - midX) * followT * 0.3;
      tmpLook.current.z += (toPos[1] - midZ) * followT * 0.2;
    } else {
      // "hold" — stay at dramatic position
      tmpPos.current.copy(dramaticPos.current);
      tmpLook.current.copy(dramaticLook.current);
    }

    camera.position.copy(tmpPos.current);
    camera.lookAt(tmpLook.current);
  });

  return null;
}

// ─── Animation Driver ─────────────────────────────────────────────────────────

function AnimationDriver({ duration, onMoveComplete, progressRef }: {
  duration: number; onMoveComplete: () => void;
  progressRef: React.MutableRefObject<number>;
}) {
  const startTime = useRef(Date.now());
  const completed = useRef(false);

  // Reset on new event
  useEffect(() => {
    startTime.current = Date.now();
    completed.current = false;
    progressRef.current = 0;
  }, [duration]);

  useFrame(() => {
    const p = Math.min((Date.now() - startTime.current) / duration, 1);
    progressRef.current = p;
    if (p >= 1 && !completed.current) {
      completed.current = true;
      onMoveComplete();
    }
  });

  return null;
}

// ─── Dismiss Driver (swoop-out) ───────────────────────────────────────────────

function DismissDriver({ duration, onComplete, dismissProgressRef }: {
  duration: number; onComplete: () => void;
  dismissProgressRef: React.MutableRefObject<number>;
}) {
  const startTime = useRef(Date.now());
  const completed = useRef(false);

  useFrame(() => {
    const p = Math.min((Date.now() - startTime.current) / duration, 1);
    dismissProgressRef.current = p;
    if (p >= 1 && !completed.current) {
      completed.current = true;
      setTimeout(onComplete, 50);
    }
  });

  return null;
}

// ─── Scene Content ────────────────────────────────────────────────────────────

interface SceneProps {
  event: CinematicEvent;
  duration: number;
  boardFlipped: boolean;
  onComplete: () => void;
  onMoveComplete: () => void;
  lite: boolean;
  isFirstEntry: boolean;
  isDismissing: boolean;
}

function SceneContent({ event, duration, boardFlipped, onComplete, onMoveComplete, lite, isFirstEntry, isDismissing }: SceneProps) {
  const progressRef = useRef(0);
  const isFirstEntryRef = useRef(isFirstEntry);
  const isDismissingRef = useRef(isDismissing);
  const dismissProgressRef = useRef(0);

  // Keep refs in sync without re-renders
  useEffect(() => { isFirstEntryRef.current = isFirstEntry; }, [isFirstEntry]);
  useEffect(() => {
    isDismissingRef.current = isDismissing;
    if (isDismissing) dismissProgressRef.current = 0;
  }, [isDismissing]);

  const fromPos = useMemo(() => squareToWorld(event.from, boardFlipped), [event.from, boardFlipped]);
  const toPos = useMemo(() => squareToWorld(event.to, boardFlipped), [event.to, boardFlipped]);

  const staticPieces = useMemo(() => {
    const pieces = event.boardPieces ?? [];
    return pieces
      .filter(p => p.square !== event.to)
      .map(p => ({
        ...p,
        pos: squareToWorld(p.square, boardFlipped),
      }));
  }, [event.boardPieces, event.to, boardFlipped]);

  return (
    <>
      <AnimationDriver duration={duration} onMoveComplete={onMoveComplete} progressRef={progressRef} />
      {isDismissing && (
        <DismissDriver duration={800} onComplete={onComplete} dismissProgressRef={dismissProgressRef} />
      )}
      <SceneLighting lite={lite} progressRef={progressRef} isFirstEntryRef={isFirstEntryRef} />
      <BoardPlane lite={lite} />

      {staticPieces.map(p => (
        <StaticPiece
          key={p.square}
          piece={p.piece}
          color={p.color}
          x={p.pos[0]}
          z={p.pos[1]}
          lite={lite}
        />
      ))}

      <MovingPiece
        piece={event.piece}
        color={event.color}
        fromPos={fromPos}
        toPos={toPos}
        isCapture={event.isCapture}
        lite={lite}
        progressRef={progressRef}
        isFirstEntryRef={isFirstEntryRef}
      />

      {event.isCapture && (
        <CaptureExplosion
          position={toPos}
          progressRef={progressRef}
          isFirstEntryRef={isFirstEntryRef}
        />
      )}

        fromPos={fromPos}
        toPos={toPos}
        progressRef={progressRef}
        isFirstEntryRef={isFirstEntryRef}
        isDismissingRef={isDismissingRef}
        dismissProgressRef={dismissProgressRef}
      />
    </>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

interface CinematicChess3DSceneProps {
  event: CinematicEvent;
  duration: number;
  boardFlipped: boolean;
  onComplete: () => void;
  onMoveComplete: () => void;
  onError: () => void;
  tier: CinematicTier;
  isFirstEntry: boolean;
  isDismissing: boolean;
}

export default function CinematicChess3DScene({
  event, duration, boardFlipped, onComplete, onMoveComplete, onError, tier,
  isFirstEntry, isDismissing,
}: CinematicChess3DSceneProps) {
  const lite = tier === "3d-lite";
  const containerRef = useRef<HTMLDivElement>(null);

  // Fade in after canvas is ready
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.style.opacity = "1";
        }
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Fade out when dismissing completes
  const handleComplete = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.style.opacity = "0";
    }
    setTimeout(onComplete, 350);
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-40 rounded-lg overflow-hidden"
      style={{
        opacity: 0,
        transition: "opacity 350ms ease-in-out",
        willChange: "opacity",
      }}
    >
      <Canvas
        shadows={!lite}
        gl={{ antialias: !lite, alpha: true, powerPreference: lite ? "low-power" : "high-performance" }}
        dpr={lite ? [1, 1] : [1, 1.5]}
        camera={{ fov: 45, near: 0.1, far: 50 }}
        style={{ position: "relative", zIndex: 1, background: "transparent" }}
        onCreated={({ gl }) => {
          const ctx = gl.getContext();
          if (!ctx) onError();
        }}
        fallback={null}
      >
        <SceneContent
          event={event}
          duration={duration}
          boardFlipped={boardFlipped}
          onComplete={handleComplete}
          onMoveComplete={onMoveComplete}
          lite={lite}
          isFirstEntry={isFirstEntry}
          isDismissing={isDismissing}
        />
      </Canvas>

      {/* SAN badge */}
      <div className="absolute bottom-3 right-3 z-20 px-3 py-1.5 rounded-lg bg-black/75 backdrop-blur-md border border-primary/30 shadow-lg shadow-primary/10">
        <span className="text-sm font-mono font-bold tracking-widest text-primary">
          {event.san}
        </span>
      </div>
    </div>
  );
}
