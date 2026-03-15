/**
 * CinematicChess3DScene – Seamless 2D→3D→2D chess cinematic.
 *
 * Camera starts top-down (matching 2D board), swoops to dramatic angle,
 * piece moves, camera returns to top-down. All pieces rendered.
 *
 * CRITICAL: No React state updates during animation — all animation
 * is driven by refs and imperative Three.js mutations to avoid
 * re-renders and material flashing.
 *
 * pointer-events: none – never blocks interaction.
 */

import { useRef, useMemo, useEffect, useCallback } from "react";
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
// 0.00–0.20: Camera swoops from top-down to dramatic
// 0.20–0.75: Piece moves
// 0.75–1.00: Camera returns to top-down

function getPhase(progress: number) {
  if (progress < 0.20) return { phase: "swoop-in" as const, t: progress / 0.20 };
  if (progress < 0.75) return { phase: "move" as const, t: (progress - 0.20) / 0.55 };
  return { phase: "swoop-out" as const, t: (progress - 0.75) / 0.25 };
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
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {squares.map((s, i) => (
          <mesh key={i} geometry={geo} position={[s.x, s.z, 0]} receiveShadow material={s.dark ? darkMat : lightMat} />
        ))}
      </group>
      <mesh position={[0, -0.04, 0]}>
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

function MovingPiece({ piece, color, fromPos, toPos, isCapture, lite, progressRef }: {
  piece: string; color: "white" | "black";
  fromPos: [number, number]; toPos: [number, number];
  isCapture: boolean; lite: boolean;
  progressRef: React.MutableRefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const srcHighlightRef = useRef<THREE.Mesh>(null);
  const dstHighlightRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => getCachedGeo(piece, lite), [piece, lite]);
  const mat = useMemo(() => getCachedMat(color, lite), [color, lite]);

  useFrame(() => {
    const progress = progressRef.current;
    const { phase, t } = getPhase(progress);
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

      {/* Source highlight */}
      <mesh ref={srcHighlightRef} position={[fromPos[0], 0.005, fromPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial color="#ffd700" transparent opacity={0.35} />
      </mesh>

      {/* Destination highlight */}
      <mesh ref={dstHighlightRef} position={[toPos[0], 0.005, toPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial color={isCapture ? "#ff3333" : "#ffd700"} transparent opacity={0} />
      </mesh>
    </>
  );
}

// ─── Lighting (imperative intensity updates — no conditional mount/unmount) ───

function SceneLighting({ lite, progressRef }: { lite: boolean; progressRef: React.MutableRefObject<number> }) {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  const rimRef = useRef<THREE.PointLight>(null);

  useFrame(() => {
    const progress = progressRef.current;
    const { phase, t } = getPhase(progress);
    const swoopFactor = phase === "swoop-in"
      ? easeInOutCubic(t)
      : phase === "move" ? 1
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

// ─── Camera Rig (imperative — reads progressRef) ──────────────────────────────

const TOP_DOWN_POS = new THREE.Vector3(0, 6.5, 0.01);
const TOP_DOWN_LOOK = new THREE.Vector3(0, 0, 0);

function CameraRig({ fromPos, toPos, progressRef }: {
  fromPos: [number, number]; toPos: [number, number];
  progressRef: React.MutableRefObject<number>;
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

    camera.position.copy(TOP_DOWN_POS);
    camera.lookAt(TOP_DOWN_LOOK);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }
  }, [camera, fromPos, toPos]);

  useFrame(() => {
    const progress = progressRef.current;
    const { phase, t } = getPhase(progress);
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
      tmpPos.current.lerpVectors(dramaticPos.current, TOP_DOWN_POS, et);
      tmpLook.current.lerpVectors(dramaticLook.current, TOP_DOWN_LOOK, et);
    }

    camera.position.copy(tmpPos.current);
    camera.lookAt(tmpLook.current);
  });

  return null;
}

// ─── Animation Driver (single useFrame, no setState) ──────────────────────────

function AnimationDriver({ duration, onComplete, progressRef }: {
  duration: number; onComplete: () => void;
  progressRef: React.MutableRefObject<number>;
}) {
  const startTime = useRef(Date.now());
  const completed = useRef(false);

  useFrame(() => {
    const p = Math.min((Date.now() - startTime.current) / duration, 1);
    progressRef.current = p;
    if (p >= 1 && !completed.current) {
      completed.current = true;
      setTimeout(onComplete, 50);
    }
  });

  return null;
}

// ─── Scene Content ────────────────────────────────────────────────────────────

interface SceneProps {
  event: CinematicEvent; duration: number; boardFlipped: boolean;
  onComplete: () => void; lite: boolean;
}

function SceneContent({ event, duration, boardFlipped, onComplete, lite }: SceneProps) {
  const progressRef = useRef(0);
  const fromPos = useMemo(() => squareToWorld(event.from, boardFlipped), [event.from, boardFlipped]);
  const toPos = useMemo(() => squareToWorld(event.to, boardFlipped), [event.to, boardFlipped]);

  // Pre-compute static pieces once (exclude piece at destination — that's the moving piece)
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
      <AnimationDriver duration={duration} onComplete={onComplete} progressRef={progressRef} />
      <SceneLighting lite={lite} progressRef={progressRef} />
      <BoardPlane lite={lite} />

      {/* Static pieces — rendered once, never update */}
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

      {/* Moving piece — updates position imperatively via progressRef */}
      <MovingPiece
        piece={event.piece}
        color={event.color}
        fromPos={fromPos}
        toPos={toPos}
        isCapture={event.isCapture}
        lite={lite}
        progressRef={progressRef}
      />

      <CameraRig fromPos={fromPos} toPos={toPos} progressRef={progressRef} />
    </>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

interface CinematicChess3DSceneProps {
  event: CinematicEvent; duration: number; boardFlipped: boolean;
  onComplete: () => void; onError: () => void; tier: CinematicTier;
}

export default function CinematicChess3DScene({ event, duration, boardFlipped, onComplete, onError, tier }: CinematicChess3DSceneProps) {
  const lite = tier === "3d-lite";
  const containerRef = useRef<HTMLDivElement>(null);
  const fadeIn = useRef(false);

  // Fade in after canvas is ready (requestAnimationFrame ensures paint)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.style.opacity = "1";
          fadeIn.current = true;
        }
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Fade out before complete — all imperative, no setState
  const handleComplete = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.style.opacity = "0";
    }
    setTimeout(onComplete, 300);
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-40 rounded-lg overflow-hidden"
      style={{
        opacity: 0,
        transition: "opacity 300ms ease-in-out",
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
        <SceneContent event={event} duration={duration} boardFlipped={boardFlipped} onComplete={handleComplete} lite={lite} />
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
