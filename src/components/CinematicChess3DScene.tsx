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
import { getSkinById, type ChessSkin, type MaterialConfig } from "@/lib/chessSkins";
import { useChessGLB } from "@/hooks/useChessGLB";

// ─── Constants ────────────────────────────────────────────────────────────────

const BOARD_SIZE = 4;
const SQ = BOARD_SIZE / 8;
const HALF = BOARD_SIZE / 2;
const PIECE_SCALE = 1.4;



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
// Static camera — no swoop. Just: move (0–0.85) → hold (0.85–1.0)

type AnimPhase = "move" | "hold";

function getPhase(progress: number, _isFirstEntry: boolean): { phase: AnimPhase; t: number } {
  if (progress < 0.85) return { phase: "move", t: progress / 0.85 };
  return { phase: "hold", t: 1 };
}

// ─── Skin-Keyed Material & Geometry Cache ─────────────────────────────────────

const _geoCache = new Map<string, THREE.LatheGeometry>();

function getCachedLatheGeo(piece: string, lite: boolean, skin: ChessSkin): THREE.LatheGeometry {
  const key = `${skin.id}-${piece}-${lite ? "l" : "f"}`;
  let g = _geoCache.get(key);
  if (!g) {
    const profile = skin.profiles[piece] ?? skin.profiles.pawn;
    const pts = profile.map(([x, y]) => new THREE.Vector2(x * PIECE_SCALE, y * PIECE_SCALE));
    g = new THREE.LatheGeometry(pts, lite ? 10 : 16);
    _geoCache.set(key, g);
  }
  return g;
}

const _matCache = new Map<string, THREE.Material>();

function buildMaterial(config: MaterialConfig, lite: boolean): THREE.Material {
  if (lite) {
    return new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: config.metalness,
      ...(config.emissive ? { emissive: config.emissive, emissiveIntensity: config.emissiveIntensity ?? 0 } : {}),
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: config.color,
    roughness: config.roughness,
    metalness: config.metalness,
    clearcoat: config.clearcoat ?? 0,
    clearcoatRoughness: config.clearcoatRoughness ?? 0,
    ...(config.emissive ? { emissive: config.emissive, emissiveIntensity: config.emissiveIntensity ?? 0 } : {}),
  });
}

function getCachedMat(color: "white" | "black", lite: boolean, skin: ChessSkin): THREE.Material {
  const key = `${skin.id}-${color}-${lite ? "l" : "f"}`;
  let m = _matCache.get(key);
  if (!m) {
    const config = color === "white" ? skin.whiteMat : skin.blackMat;
    m = buildMaterial(config, lite);
    _matCache.set(key, m);
  }
  return m;
}



// ─── Board (static — never re-renders) ────────────────────────────────────────

function BoardPlane({ lite, skin }: { lite: boolean; skin: ChessSkin }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(SQ, SQ), []);
  const squares = useMemo(() => {
    const r: { x: number; z: number; dark: boolean }[] = [];
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++)
        r.push({ x: -HALF + SQ * col + SQ / 2, z: -HALF + SQ * row + SQ / 2, dark: (row + col) % 2 === 1 });
    return r;
  }, []);

  const LIGHT_SQ = useMemo(() => new THREE.Color(skin.boardLight), [skin.boardLight]);
  const DARK_SQ = useMemo(() => new THREE.Color(skin.boardDark), [skin.boardDark]);
  const TRIM_COLOR = useMemo(() => new THREE.Color(skin.boardTrim), [skin.boardTrim]);
  const baseColor = skin.boardBase || "#191920";

  const lightMat = useMemo(() => lite
    ? new THREE.MeshStandardMaterial({ color: LIGHT_SQ, roughness: 0.5 })
    : new THREE.MeshPhysicalMaterial({ color: LIGHT_SQ, roughness: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  [lite, LIGHT_SQ]);

  const darkMat = useMemo(() => lite
    ? new THREE.MeshStandardMaterial({ color: DARK_SQ, roughness: 0.5 })
    : new THREE.MeshPhysicalMaterial({ color: DARK_SQ, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
  [lite, DARK_SQ]);

  const trimMat = useMemo(() => lite
    ? new THREE.MeshStandardMaterial({ color: TRIM_COLOR, roughness: 0.3, metalness: 0.8 })
    : new THREE.MeshPhysicalMaterial({ color: TRIM_COLOR, roughness: 0.15, metalness: 0.9, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
  [lite, TRIM_COLOR]);

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
        <meshStandardMaterial color={baseColor} roughness={0.8} />
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

type GetGeoFn = (piece: string, color: "white" | "black") => THREE.BufferGeometry;

function StaticPiece({ piece, color, x, z, lite, skin, getGeo }: {
  piece: string; color: "white" | "black"; x: number; z: number; lite: boolean; skin: ChessSkin; getGeo: GetGeoFn;
}) {
  const geo = useMemo(() => getGeo(piece, color), [piece, color, getGeo]);
  const mat = useMemo(() => getCachedMat(color, lite, skin), [color, lite, skin]);
  const useGLB = !!skin.glbPath;

  return (
    <group position={[x, 0, z]}>
      <mesh geometry={geo} castShadow material={mat} />
      {!useGLB && piece === "king" && (
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

function MovingPiece({ piece, color, fromPos, toPos, isCapture, lite, progressRef, isFirstEntryRef, skin, getGeo }: {
  piece: string; color: "white" | "black";
  fromPos: [number, number]; toPos: [number, number];
  isCapture: boolean; lite: boolean;
  progressRef: React.MutableRefObject<number>;
  isFirstEntryRef: React.MutableRefObject<boolean>;
  skin: ChessSkin;
  getGeo: GetGeoFn;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const srcHighlightRef = useRef<THREE.Mesh>(null);
  const dstHighlightRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => getGeo(piece, color), [piece, color, getGeo]);
  const mat = useMemo(() => getCachedMat(color, lite, skin), [color, lite, skin]);
  const useGLBModel = !!skin.glbPath;

  useFrame(() => {
    const progress = progressRef.current;
    const { phase, t } = getPhase(progress, isFirstEntryRef.current);
    const moveT = phase === "move" ? easeInOutCubic(t) : 1;

    const x = fromPos[0] + (toPos[0] - fromPos[0]) * moveT;
    const z = fromPos[1] + (toPos[1] - fromPos[1]) * moveT;
    const arcHeight = isCapture ? 0.15 : 0.3;
    const arcY = Math.sin(moveT * Math.PI) * arcHeight;

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
        {!useGLBModel && piece === "king" && (
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

// ─── VictimPiece (captured piece stays visible, shakes, then crushes) ─────────

function VictimPiece({ piece, color, position, lite, progressRef, isFirstEntryRef, skin, getGeo }: {
  piece: string; color: "white" | "black";
  position: [number, number]; lite: boolean;
  progressRef: React.MutableRefObject<number>;
  isFirstEntryRef: React.MutableRefObject<boolean>;
  skin: ChessSkin;
  getGeo: GetGeoFn;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const geo = useMemo(() => getGeo(piece, color), [piece, color, getGeo]);
  const mat = useMemo(() => getCachedMat(color, lite, skin), [color, lite, skin]);
  const useGLBModel = !!skin.glbPath;

  useFrame(() => {
    if (!groupRef.current) return;
    const progress = progressRef.current;
    const { phase, t } = getPhase(progress, isFirstEntryRef.current);
    const moveT = phase === "move" ? easeInOutCubic(t) : 1;

    if (moveT < 0.65) {
      groupRef.current.position.set(position[0], 0, position[1]);
      groupRef.current.scale.set(1, 1, 1);
      groupRef.current.rotation.set(0, 0, 0);
    } else if (moveT < 0.85) {
      const shakeT = (moveT - 0.65) / 0.2;
      const intensity = shakeT * 0.06;
      groupRef.current.position.set(
        position[0] + (Math.random() - 0.5) * intensity,
        0,
        position[1] + (Math.random() - 0.5) * intensity
      );
      groupRef.current.rotation.set(
        (Math.random() - 0.5) * shakeT * 0.15,
        0,
        (Math.random() - 0.5) * shakeT * 0.15
      );
      const crushScale = 1 - shakeT * 0.3;
      groupRef.current.scale.set(crushScale, crushScale, crushScale);
    } else {
      const crushT = Math.min((moveT - 0.85) / 0.1, 1);
      const s = Math.max(0, (1 - 0.3) * (1 - crushT));
      groupRef.current.scale.set(s, s * 0.3, s);
      groupRef.current.position.set(position[0], 0, position[1]);
    }
  });

  return (
    <group ref={groupRef} position={[position[0], 0, position[1]]}>
      <mesh geometry={geo} castShadow material={mat} />
      {!useGLBModel && piece === "king" && (
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

// ─── Gold Capture Explosion (Enhanced) ────────────────────────────────────────

function CaptureExplosion({ position, progressRef, isFirstEntryRef }: {
  position: [number, number];
  progressRef: React.MutableRefObject<number>;
  isFirstEntryRef: React.MutableRefObject<boolean>;
}) {
  const COUNT = 120;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particleData = useMemo(() => {
    return Array.from({ length: COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const elevation = Math.random() * Math.PI * 0.7 - 0.1;
      const speed = 2.0 + Math.random() * 4.0;
      return {
        vx: Math.cos(angle) * Math.cos(elevation) * speed,
        vy: Math.sin(elevation) * speed + 2.0,
        vz: Math.sin(angle) * Math.cos(elevation) * speed,
        rotSpeed: (Math.random() - 0.5) * 12,
        scale: 0.02 + Math.random() * 0.04,
        colorIdx: Math.floor(Math.random() * GOLD_PARTICLE_COLORS.length),
      };
    });
  }, []);

  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#FFD700",
    metalness: 0.95,
    roughness: 0.05,
    emissive: "#FFD700",
    emissiveIntensity: 0.6,
  }), []);

  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#FFD700",
    transparent: true,
    opacity: 0,
  }), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const color = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      color.copy(GOLD_PARTICLE_COLORS[particleData[i].colorIdx]);
      meshRef.current.setColorAt(i, color);
    }
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [particleData]);

  useFrame(() => {
    if (!meshRef.current) return;

    const progress = progressRef.current;
    const { phase, t } = getPhase(progress, isFirstEntryRef.current);
    const moveT = phase === "move" ? t : 1;
    const explosionTrigger = 0.80;

    // Gold flash
    if (flashRef.current) {
      if (moveT >= explosionTrigger) {
        const flashT = Math.min((moveT - explosionTrigger) / 0.12, 1);
        const flashScale = flashT * 0.6;
        flashRef.current.scale.set(flashScale, flashScale, flashScale);
        (flashRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - flashT));
        flashRef.current.visible = true;
      } else {
        flashRef.current.visible = false;
      }
    }

    if (moveT < explosionTrigger) {
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
    const gravity = 3.5;

    for (let i = 0; i < COUNT; i++) {
      const p = particleData[i];
      const time = explosionT * 1.5;
      const x = position[0] + p.vx * time;
      const y = p.vy * time - 0.5 * gravity * time * time;
      const z = position[1] + p.vz * time;
      const fadeOut = Math.max(0, 1 - explosionT * 0.85);
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
    <>
      <instancedMesh ref={meshRef} args={[geo, mat, COUNT]} frustumCulled={false} />
      <mesh ref={flashRef} position={[position[0], 0.2, position[1]]} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <primitive object={flashMat} attach="material" />
      </mesh>
    </>
  );
}



function SceneLighting({ lite }: {
  lite: boolean;
}) {
  return (
    <>
      <ambientLight intensity={0.4} color="#f5f0e8" />
      <directionalLight
        position={[3, 5, 2]}
        intensity={1.2}
        color="#f0dcc0"
        castShadow={!lite}
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <directionalLight position={[-3, 2, 1]} intensity={0.35} color="#a0b8d0" />
      {!lite && (
        <pointLight position={[0, 1.5, -3]} intensity={1.2} color="#d4a030" distance={8} decay={2} />
      )}
      <directionalLight position={[0, -1, 2]} intensity={0.15} color="#7080a0" />
    </>
  );
}

// ─── Camera Rig ───────────────────────────────────────────────────────────────

// Fixed elevated perspective — no camera movement at all
const FIXED_CAM_POS = new THREE.Vector3(0, 3.2, 4.2);
const FIXED_CAM_LOOK = new THREE.Vector3(0, 0, 0);

function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.copy(FIXED_CAM_POS);
    camera.lookAt(FIXED_CAM_LOOK);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame(() => {
    camera.position.copy(FIXED_CAM_POS);
    camera.lookAt(FIXED_CAM_LOOK);
  });

  return null;
}

// ─── Animation Driver ─────────────────────────────────────────────────────────

function AnimationDriver({ duration, onMoveComplete, progressRef, eventKey }: {
  duration: number; onMoveComplete: () => void;
  progressRef: React.MutableRefObject<number>;
  eventKey: string;
}) {
  const startTime = useRef(Date.now());
  const completed = useRef(false);

  // Reset on new event (eventKey changes per move)
  useEffect(() => {
    startTime.current = Date.now();
    completed.current = false;
    progressRef.current = 0;
  }, [eventKey]);

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
  skin: ChessSkin;
}

function SceneContent({ event, duration, boardFlipped, onComplete, onMoveComplete, lite, isFirstEntry, isDismissing, skin }: SceneProps) {
  const progressRef = useRef(0);
  const isFirstEntryRef = useRef(isFirstEntry);
  const dismissProgressRef = useRef(0);

  // GLB geometry loader — always called (React hooks must be unconditional)
  const { getGLBGeo } = useChessGLB();

  // Unified geometry resolver: GLB first (if skin has glbPath), then lathe fallback
  const getGeo: GetGeoFn = useCallback((piece: string, color: "white" | "black") => {
    if (skin.glbPath) {
      const heightMap: Record<string, number> = { pawn: 0.55, rook: 0.65, knight: 0.7, bishop: 0.75, queen: 0.9, king: 1.0 };
      const targetH = (heightMap[piece] ?? 0.55) * PIECE_SCALE;
      const glbGeo = getGLBGeo(piece, color, targetH);
      if (glbGeo) return glbGeo;
    }
    return getCachedLatheGeo(piece, lite, skin);
  }, [getGLBGeo, lite, skin]);

  // Keep refs in sync without re-renders
  useEffect(() => { isFirstEntryRef.current = isFirstEntry; }, [isFirstEntry]);
  useEffect(() => {
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
      <AnimationDriver duration={duration} onMoveComplete={onMoveComplete} progressRef={progressRef} eventKey={`${event.from}-${event.to}-${event.san}`} />
      {isDismissing && (
        <DismissDriver duration={800} onComplete={onComplete} dismissProgressRef={dismissProgressRef} />
      )}
      <SceneLighting lite={lite} />
      <BoardPlane lite={lite} skin={skin} />

      {staticPieces.map(p => (
        <StaticPiece
          key={p.square}
          piece={p.piece}
          color={p.color}
          x={p.pos[0]}
          z={p.pos[1]}
          lite={lite}
          skin={skin}
          getGeo={getGeo}
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
        skin={skin}
        getGeo={getGeo}
      />

      {event.isCapture && event.capturedPiece && event.capturedColor && (
        <VictimPiece
          piece={event.capturedPiece}
          color={event.capturedColor}
          position={toPos}
          lite={lite}
          progressRef={progressRef}
          isFirstEntryRef={isFirstEntryRef}
          skin={skin}
          getGeo={getGeo}
        />
      )}

      {event.isCapture && (
        <CaptureExplosion
          position={toPos}
          progressRef={progressRef}
          isFirstEntryRef={isFirstEntryRef}
        />
      )}

      <CameraRig />
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
  skinId?: string;
}

export default function CinematicChess3DScene({
  event, duration, boardFlipped, onComplete, onMoveComplete, onError, tier,
  isFirstEntry, isDismissing, skinId = "classic",
}: CinematicChess3DSceneProps) {
  const lite = tier === "3d-lite";
  const containerRef = useRef<HTMLDivElement>(null);
  const skin = useMemo(() => getSkinById(skinId), [skinId]);

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
          skin={skin}
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
