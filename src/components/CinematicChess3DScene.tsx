/**
 * CinematicChess3DScene – Seamless 2D→3D→2D chess cinematic.
 *
 * The camera starts top-down (matching the 2D board view), swoops down
 * to a dramatic low angle while the piece moves, then pulls back to
 * top-down before fading out — creating a seamless transition.
 *
 * All pieces from the actual game state are rendered on the board.
 *
 * pointer-events: none – never blocks interaction.
 */

import { useRef, useMemo, useEffect, useState, useCallback } from "react";
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

// ─── Animation Phases ─────────────────────────────────────────────────────────
// 0.00–0.20: Camera swoops from top-down to dramatic angle
// 0.20–0.75: Piece moves
// 0.75–1.00: Camera returns to top-down

function getPhase(progress: number) {
  if (progress < 0.20) return { phase: "swoop-in" as const, t: progress / 0.20 };
  if (progress < 0.75) return { phase: "move" as const, t: (progress - 0.20) / 0.55 };
  return { phase: "swoop-out" as const, t: (progress - 0.75) / 0.25 };
}

// ─── Lathe Profile Helpers ────────────────────────────────────────────────────

function makeLathe(points: [number, number][], segments = 16): THREE.LatheGeometry {
  const pts = points.map(([x, y]) => new THREE.Vector2(x * PIECE_SCALE, y * PIECE_SCALE));
  return new THREE.LatheGeometry(pts, segments);
}

const PIECE_PROFILES: Record<string, [number, number][]> = {
  pawn: [
    [0, 0], [0.12, 0], [0.13, 0.02], [0.1, 0.04],
    [0.06, 0.12], [0.05, 0.18],
    [0.07, 0.22], [0.06, 0.28], [0, 0.3],
  ],
  rook: [
    [0, 0], [0.14, 0], [0.15, 0.02], [0.12, 0.05],
    [0.08, 0.15], [0.08, 0.30],
    [0.12, 0.32], [0.12, 0.40],
    [0.09, 0.40], [0.09, 0.38], [0.06, 0.38], [0.06, 0.40],
    [0, 0.40],
  ],
  knight: [
    [0, 0], [0.13, 0], [0.14, 0.02], [0.1, 0.05],
    [0.07, 0.12], [0.06, 0.20],
    [0.08, 0.25], [0.1, 0.32], [0.08, 0.38],
    [0.04, 0.42], [0, 0.44],
  ],
  bishop: [
    [0, 0], [0.13, 0], [0.14, 0.02], [0.1, 0.05],
    [0.06, 0.15], [0.05, 0.28],
    [0.07, 0.33], [0.06, 0.40], [0.03, 0.44],
    [0, 0.47],
  ],
  queen: [
    [0, 0], [0.14, 0], [0.15, 0.02], [0.11, 0.06],
    [0.07, 0.18], [0.06, 0.32],
    [0.09, 0.36], [0.1, 0.42], [0.07, 0.48],
    [0.04, 0.52], [0, 0.55],
  ],
  king: [
    [0, 0], [0.14, 0], [0.15, 0.02], [0.11, 0.06],
    [0.07, 0.20], [0.06, 0.36],
    [0.09, 0.40], [0.1, 0.46], [0.08, 0.50],
    [0.04, 0.54], [0.02, 0.56],
    [0, 0.58],
  ],
};

// ─── Cached Geometries & Materials ────────────────────────────────────────────

const geoCache = new Map<string, THREE.LatheGeometry>();
function getGeo(piece: string, lite: boolean): THREE.LatheGeometry {
  const key = `${piece}-${lite}`;
  if (!geoCache.has(key)) {
    const profile = PIECE_PROFILES[piece] ?? PIECE_PROFILES.pawn;
    geoCache.set(key, makeLathe(profile, lite ? 10 : 16));
  }
  return geoCache.get(key)!;
}

function makeMat(color: "white" | "black", lite: boolean): THREE.Material {
  if (color === "white") {
    return lite
      ? new THREE.MeshStandardMaterial({ color: "#f0e6d3", roughness: 0.3, metalness: 0.05 })
      : new THREE.MeshPhysicalMaterial({
          color: "#f5ead8", roughness: 0.15, metalness: 0.02,
          clearcoat: 1.0, clearcoatRoughness: 0.08, reflectivity: 0.8,
        });
  }
  return lite
    ? new THREE.MeshStandardMaterial({ color: "#1a1a22", roughness: 0.25, metalness: 0.4 })
    : new THREE.MeshPhysicalMaterial({
        color: "#141418", roughness: 0.12, metalness: 0.6,
        clearcoat: 0.9, clearcoatRoughness: 0.05, reflectivity: 1.0,
      });
}

// ─── Board ────────────────────────────────────────────────────────────────────

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
      {/* Board squares */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {squares.map((s, i) => (
          <mesh key={i} geometry={geo} position={[s.x, s.z, 0]} receiveShadow material={s.dark ? darkMat : lightMat} />
        ))}
      </group>

      {/* Thin pedestal */}
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[BOARD_SIZE + 0.1, 0.08, BOARD_SIZE + 0.1]} />
        <meshStandardMaterial color="hsl(220, 12%, 10%)" roughness={0.8} />
      </mesh>

      {/* Gold trim */}
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

// ─── Piece Mesh ───────────────────────────────────────────────────────────────

function PieceMesh({ piece, color, lite }: { piece: string; color: "white" | "black"; lite: boolean }) {
  const geo = useMemo(() => getGeo(piece, lite), [piece, lite]);
  const mat = useMemo(() => makeMat(color, lite), [color, lite]);

  return (
    <group>
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

// ─── Static Board Pieces (all pieces except the moving one) ───────────────────

function StaticPieces({ boardPieces, movingTo, flipped, lite }: {
  boardPieces: BoardPiece[]; movingTo: string; flipped: boolean; lite: boolean;
}) {
  // Exclude the piece at 'to' square since PieceProxy handles the moving piece
  const staticPieces = useMemo(
    () => boardPieces.filter(p => p.square !== movingTo),
    [boardPieces, movingTo],
  );

  return (
    <>
      {staticPieces.map((p) => {
        const [x, z] = squareToWorld(p.square, flipped);
        return (
          <group key={p.square} position={[x, 0, z]}>
            <PieceMesh piece={p.piece} color={p.color} lite={lite} />
          </group>
        );
      })}
    </>
  );
}

// ─── Moving Piece with Highlights ─────────────────────────────────────────────

function MovingPiece({ piece, color, fromPos, toPos, moveProgress, isCapture, lite }: {
  piece: string; color: "white" | "black";
  fromPos: [number, number]; toPos: [number, number];
  moveProgress: number; isCapture: boolean; lite: boolean;
}) {
  const t = easeInOutCubic(Math.min(moveProgress, 1));
  const x = fromPos[0] + (toPos[0] - fromPos[0]) * t;
  const z = fromPos[1] + (toPos[1] - fromPos[1]) * t;
  const arcY = Math.sin(t * Math.PI) * 0.3;

  return (
    <>
      <group position={[x, arcY, z]}>
        <PieceMesh piece={piece} color={color} lite={lite} />
      </group>

      {/* Source highlight */}
      <mesh position={[fromPos[0], 0.005, fromPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial color="#ffd700" transparent opacity={0.35 * (1 - moveProgress)} />
      </mesh>

      {/* Destination highlight */}
      <mesh position={[toPos[0], 0.005, toPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial
          color={isCapture ? "#ff3333" : "#ffd700"}
          transparent opacity={0.4 * moveProgress}
        />
      </mesh>
    </>
  );
}

// ─── Lighting ─────────────────────────────────────────────────────────────────

function SceneLighting({ lite, swoopFactor }: { lite: boolean; swoopFactor: number }) {
  // swoopFactor: 0 = top-down (bright even light), 1 = dramatic angle (cinematic lighting)
  return (
    <>
      {/* Bright ambient for top-down clarity, reduces when dramatic */}
      <ambientLight intensity={0.6 - swoopFactor * 0.2} color="hsl(40, 30%, 95%)" />

      {/* Key light */}
      <directionalLight
        position={[3, 5, 2]}
        intensity={0.8 + swoopFactor * 0.4}
        color="hsl(35, 60%, 90%)"
        castShadow={!lite && swoopFactor > 0.3}
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />

      {/* Cool fill — visible during dramatic phase */}
      <directionalLight
        position={[-3, 2, 1]}
        intensity={swoopFactor * 0.35}
        color="hsl(210, 50%, 75%)"
      />

      {/* Gold rim light — only at dramatic angle */}
      {!lite && swoopFactor > 0.2 && (
        <pointLight
          position={[0, 1.5, -3]}
          intensity={swoopFactor * 1.2}
          color="hsl(42, 85%, 55%)"
          distance={8}
          decay={2}
        />
      )}

      {/* Bottom fill */}
      <directionalLight position={[0, -1, 2]} intensity={0.15} color="hsl(220, 20%, 60%)" />
    </>
  );
}

// ─── Camera Rig: Top-down ↔ Dramatic ──────────────────────────────────────────
//
// Top-down: camera at (0, 6.5, 0) looking straight down — matches 2D board
// Dramatic: camera at low angle looking across the board
//
// swoopIn:  top-down → dramatic   (0.00–0.20)
// move:     dramatic, slight follow (0.20–0.75)
// swoopOut: dramatic → top-down   (0.75–1.00)

const TOP_DOWN_POS = new THREE.Vector3(0, 6.5, 0.01); // tiny z to avoid gimbal lock
const TOP_DOWN_LOOK = new THREE.Vector3(0, 0, 0);

function CameraRig({ fromPos, toPos, progress }: {
  fromPos: [number, number]; toPos: [number, number]; progress: number;
}) {
  const { camera } = useThree();
  const tmpPos = useRef(new THREE.Vector3());
  const tmpLook = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.position.copy(TOP_DOWN_POS);
    camera.lookAt(TOP_DOWN_LOOK);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame(() => {
    const { phase, t } = getPhase(progress);
    const et = easeInOutCubic(t);

    const midX = (fromPos[0] + toPos[0]) / 2;
    const midZ = (fromPos[1] + toPos[1]) / 2;

    // Dramatic camera position — low angle, slightly offset
    const dramaticPos = new THREE.Vector3(
      midX * 0.3,
      1.6,
      3.2,
    );
    const dramaticLook = new THREE.Vector3(midX * 0.3, 0.1, midZ * 0.4);

    if (phase === "swoop-in") {
      // Interpolate top-down → dramatic
      tmpPos.current.lerpVectors(TOP_DOWN_POS, dramaticPos, et);
      tmpLook.current.lerpVectors(TOP_DOWN_LOOK, dramaticLook, et);
    } else if (phase === "move") {
      // Hold at dramatic with slight follow toward destination
      const followT = easeInOutCubic(t);
      tmpPos.current.copy(dramaticPos);
      tmpPos.current.x += (toPos[0] - midX) * followT * 0.15;
      tmpLook.current.copy(dramaticLook);
      tmpLook.current.x += (toPos[0] - midX) * followT * 0.3;
      tmpLook.current.z += (toPos[1] - midZ) * followT * 0.2;
    } else {
      // Interpolate dramatic → top-down
      tmpPos.current.lerpVectors(dramaticPos, TOP_DOWN_POS, et);
      tmpLook.current.lerpVectors(dramaticLook, TOP_DOWN_LOOK, et);
    }

    camera.position.copy(tmpPos.current);
    camera.lookAt(tmpLook.current);
  });

  return null;
}

// ─── Scene Content ────────────────────────────────────────────────────────────

interface SceneProps {
  event: CinematicEvent; duration: number; boardFlipped: boolean;
  onComplete: () => void; lite: boolean;
}

function SceneContent({ event, duration, boardFlipped, onComplete, lite }: SceneProps) {
  const [progress, setProgress] = useState(0);
  const startTime = useRef(Date.now());
  const completed = useRef(false);

  const fromPos = useMemo(() => squareToWorld(event.from, boardFlipped), [event.from, boardFlipped]);
  const toPos = useMemo(() => squareToWorld(event.to, boardFlipped), [event.to, boardFlipped]);

  // Compute the move sub-progress (piece only moves during move phase)
  const { phase } = getPhase(progress);
  const moveProgress = phase === "move" ? getPhase(progress).t : (phase === "swoop-in" ? 0 : 1);

  // Compute swoopFactor for lighting (0=top-down, 1=dramatic)
  const swoopFactor = phase === "swoop-in"
    ? easeInOutCubic(getPhase(progress).t)
    : phase === "move" ? 1
    : 1 - easeInOutCubic(getPhase(progress).t);

  useFrame(() => {
    const p = Math.min((Date.now() - startTime.current) / duration, 1);
    setProgress(p);
    if (p >= 1 && !completed.current) {
      completed.current = true;
      setTimeout(onComplete, 50);
    }
  });

  return (
    <>
      <SceneLighting lite={lite} swoopFactor={swoopFactor} />
      <BoardPlane lite={lite} />
      <StaticPieces
        boardPieces={event.boardPieces ?? []}
        movingTo={event.to}
        flipped={boardFlipped}
        lite={lite}
      />
      <MovingPiece
        piece={event.piece}
        color={event.color}
        fromPos={fromPos}
        toPos={toPos}
        moveProgress={moveProgress}
        isCapture={event.isCapture}
        lite={lite}
      />
      <CameraRig fromPos={fromPos} toPos={toPos} progress={progress} />
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
  const [opacity, setOpacity] = useState(0);

  // Quick fade in
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpacity(1));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Fade out before complete
  const handleComplete = useCallback(() => {
    setOpacity(0);
    setTimeout(onComplete, 180);
  }, [onComplete]);

  return (
    <div
      className="absolute inset-0 pointer-events-none z-40 rounded-lg overflow-hidden"
      style={{
        opacity,
        transition: "opacity 180ms ease-in-out",
      }}
    >
      <Canvas
        shadows={!lite}
        gl={{ antialias: !lite, alpha: true, powerPreference: lite ? "low-power" : "high-performance" }}
        dpr={lite ? [1, 1] : [1, 1.5]}
        camera={{ fov: 45, near: 0.1, far: 50 }}
        style={{ position: "relative", zIndex: 1, background: "transparent" }}
        onCreated={({ gl }) => { if (!gl.getContext()) onError(); }}
        fallback={null}
      >
        <SceneContent event={event} duration={duration} boardFlipped={boardFlipped} onComplete={handleComplete} lite={lite} />
      </Canvas>

      {/* SAN badge */}
      <div className="absolute bottom-3 right-3 z-20 px-3 py-1.5 rounded-lg bg-black/75 backdrop-blur-md border border-yellow-500/30 shadow-lg shadow-yellow-500/10">
        <span className="text-sm font-mono font-bold tracking-widest" style={{ color: "#ffd700" }}>
          {event.san}
        </span>
      </div>
    </div>
  );
}
