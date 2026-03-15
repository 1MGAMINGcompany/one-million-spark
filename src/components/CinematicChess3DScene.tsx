/**
 * CinematicChess3DScene – polished Three.js cinematic move animation.
 *
 * Upgrades over v1:
 *   - Lathe-geometry piece silhouettes (recognizable chess profiles)
 *   - Shadows + rim light for depth
 *   - Fade-in/out container transition
 *   - Dramatic camera arc (~15° orbit + push-in)
 *   - Gold board edge trim
 *
 * pointer-events: none – never blocks interaction.
 */

import { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CinematicEvent } from "@/lib/buildCinematicEvent";
import type { CinematicTier } from "@/hooks/useCinematicMode";

// ─── Constants ────────────────────────────────────────────────────────────────

const BOARD_SIZE = 4;
const SQ = BOARD_SIZE / 8;
const HALF = BOARD_SIZE / 2;

const LIGHT_SQ = new THREE.Color("hsl(38, 40%, 72%)");
const DARK_SQ = new THREE.Color("hsl(28, 30%, 38%)");
const WHITE_PIECE = new THREE.Color("hsl(45, 80%, 90%)");
const BLACK_PIECE = new THREE.Color("hsl(220, 15%, 18%)");
const CAPTURE_FLASH = new THREE.Color("hsl(0, 70%, 55%)");
const MATE_FLASH = new THREE.Color("hsl(45, 93%, 54%)");
const GOLD_TRIM = new THREE.Color("hsl(42, 70%, 45%)");

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

// ─── Lathe Profile Helpers ────────────────────────────────────────────────────

function makeLathe(points: [number, number][], segments = 16): THREE.LatheGeometry {
  const pts = points.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, segments);
}

// Profiles: [radius, height] pairs defining half-silhouette
const PIECE_PROFILES: Record<string, { points: [number, number][]; segs?: number }> = {
  pawn: {
    points: [
      [0, 0], [0.12, 0], [0.13, 0.02], [0.1, 0.04], // base
      [0.06, 0.12], [0.05, 0.18], // stem
      [0.07, 0.22], [0.06, 0.28], [0, 0.3], // head sphere-ish
    ],
  },
  rook: {
    points: [
      [0, 0], [0.14, 0], [0.15, 0.02], [0.12, 0.05], // base
      [0.08, 0.15], [0.08, 0.30], // stem
      [0.12, 0.32], [0.12, 0.40], // battlements wide
      [0.09, 0.40], [0.09, 0.38], [0.06, 0.38], [0.06, 0.40], // crenellation
      [0, 0.40],
    ],
  },
  knight: {
    points: [
      [0, 0], [0.13, 0], [0.14, 0.02], [0.1, 0.05], // base
      [0.07, 0.12], [0.06, 0.20], // stem
      [0.08, 0.25], [0.1, 0.32], [0.08, 0.38], // head bulk
      [0.04, 0.42], [0, 0.44], // muzzle taper
    ],
  },
  bishop: {
    points: [
      [0, 0], [0.13, 0], [0.14, 0.02], [0.1, 0.05], // base
      [0.06, 0.15], [0.05, 0.28], // stem
      [0.07, 0.33], [0.06, 0.40], [0.03, 0.44], // mitre
      [0, 0.47], // tip
    ],
  },
  queen: {
    points: [
      [0, 0], [0.14, 0], [0.15, 0.02], [0.11, 0.06], // base
      [0.07, 0.18], [0.06, 0.32], // stem
      [0.09, 0.36], [0.1, 0.42], [0.07, 0.48], // crown
      [0.04, 0.52], [0, 0.55], // orb
    ],
  },
  king: {
    points: [
      [0, 0], [0.14, 0], [0.15, 0.02], [0.11, 0.06], // base
      [0.07, 0.20], [0.06, 0.36], // stem
      [0.09, 0.40], [0.1, 0.46], [0.08, 0.50], // crown
      [0.04, 0.54], [0.02, 0.56], // taper
      [0, 0.58], // cross will be separate
    ],
  },
};

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

  return (
    <group>
      {/* Board squares */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {squares.map((s, i) => (
          <mesh key={i} geometry={geo} position={[s.x, s.z, 0]} receiveShadow>
            <meshStandardMaterial color={s.dark ? DARK_SQ : LIGHT_SQ} roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* Gold edge trim — 4 bars around board */}
      {!lite && <BoardEdgeTrim />}
    </group>
  );
}

function BoardEdgeTrim() {
  const trimThickness = 0.04;
  const trimHeight = 0.06;
  const totalSize = BOARD_SIZE + trimThickness * 2;
  const mat = useMemo(
    () => <meshStandardMaterial color={GOLD_TRIM} roughness={0.3} metalness={0.7} />,
    [],
  );

  return (
    <group>
      {/* Top */}
      <mesh position={[0, trimHeight / 2, -HALF - trimThickness / 2]}>
        <boxGeometry args={[totalSize, trimHeight, trimThickness]} />
        {mat}
      </mesh>
      {/* Bottom */}
      <mesh position={[0, trimHeight / 2, HALF + trimThickness / 2]}>
        <boxGeometry args={[totalSize, trimHeight, trimThickness]} />
        {mat}
      </mesh>
      {/* Left */}
      <mesh position={[-HALF - trimThickness / 2, trimHeight / 2, 0]}>
        <boxGeometry args={[trimThickness, trimHeight, BOARD_SIZE]} />
        {mat}
      </mesh>
      {/* Right */}
      <mesh position={[HALF + trimThickness / 2, trimHeight / 2, 0]}>
        <boxGeometry args={[trimThickness, trimHeight, BOARD_SIZE]} />
        {mat}
      </mesh>
    </group>
  );
}

// ─── Piece Shape Factory (Lathe) ──────────────────────────────────────────────

function PieceShape({ piece, color, lite }: { piece: string; color: THREE.Color; lite: boolean }) {
  const geo = useMemo(() => {
    const profile = PIECE_PROFILES[piece] ?? PIECE_PROFILES.pawn;
    return makeLathe(profile.points, lite ? 10 : (profile.segs ?? 16));
  }, [piece, lite]);

  return (
    <group>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.25} />
      </mesh>
      {/* King cross (extra geometry) */}
      {piece === "king" && (
        <group position={[0, 0.58, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.03, 0.1, 0.03]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.25} />
          </mesh>
          <mesh position={[0, 0.03, 0]} castShadow>
            <boxGeometry args={[0.08, 0.03, 0.03]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.25} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ─── Piece Proxy ──────────────────────────────────────────────────────────────

interface PieceProxyProps {
  piece: string; color: "white" | "black";
  fromPos: [number, number]; toPos: [number, number];
  isCapture: boolean; isMate: boolean;
  progress: number; lite: boolean;
}

function PieceProxy({ piece, color, fromPos, toPos, isCapture, isMate, progress, lite }: PieceProxyProps) {
  const pieceColor = color === "white" ? WHITE_PIECE : BLACK_PIECE;
  const t = easeInOutCubic(Math.min(progress, 1));
  const x = fromPos[0] + (toPos[0] - fromPos[0]) * t;
  const z = fromPos[1] + (toPos[1] - fromPos[1]) * t;
  const arcY = Math.sin(t * Math.PI) * (lite ? 0.18 : 0.35);

  const showFlash = (isCapture || isMate) && progress > 0.6;
  const flashOpacity = showFlash ? Math.max(0, 1 - (progress - 0.6) / 0.4) * (lite ? 0.5 : 0.8) : 0;

  return (
    <>
      <group position={[x, arcY, z]}>
        <PieceShape piece={piece} color={pieceColor} lite={lite} />
      </group>
      {showFlash && (
        <mesh position={[toPos[0], 0.02, toPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[SQ * (lite ? 0.6 : 0.8), lite ? 8 : 16]} />
          <meshBasicMaterial color={isMate ? MATE_FLASH : CAPTURE_FLASH} transparent opacity={flashOpacity} />
        </mesh>
      )}
    </>
  );
}

// ─── Lighting ─────────────────────────────────────────────────────────────────

function SceneLighting({ lite }: { lite: boolean }) {
  return (
    <>
      <ambientLight intensity={lite ? 0.5 : 0.35} />
      {/* Main key light — casts shadows */}
      <directionalLight
        position={[3, 6, 2]}
        intensity={lite ? 0.7 : 0.9}
        castShadow={!lite}
        shadow-mapSize-width={lite ? 0 : 512}
        shadow-mapSize-height={lite ? 0 : 512}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.002}
      />
      {/* Fill light from opposite side */}
      <directionalLight position={[-2, 3, -1]} intensity={0.2} />
      {/* Rim / accent light — gold-tinted from behind */}
      {!lite && (
        <pointLight
          position={[0, 2, -3.5]}
          intensity={0.6}
          color="hsl(42, 80%, 55%)"
          distance={8}
          decay={2}
        />
      )}
    </>
  );
}

// ─── Camera ───────────────────────────────────────────────────────────────────

function CameraRig({ fromPos, toPos, progress, lite }: { fromPos: [number, number]; toPos: [number, number]; progress: number; lite: boolean }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 4.5, 3.5);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame(() => {
    const t = easeInOutCubic(Math.min(progress, 1));

    if (lite) {
      // Lite: gentle push-in toward destination
      const pushX = toPos[0] * 0.08 * t;
      const pushZ = toPos[1] * 0.08 * t;
      camera.position.set(pushX, 4.5 - t * 0.15, 3.5 - t * 0.2);
      camera.lookAt(pushX * 0.5, 0, pushZ * 0.5);
      return;
    }

    // Full: dramatic orbit arc (~15°) + push toward destination
    const midX = (fromPos[0] + toPos[0]) / 2;
    const midZ = (fromPos[1] + toPos[1]) / 2;
    const orbitAngle = THREE.MathUtils.lerp(-0.26, 0.26, t); // ~15° total swing
    const pushIn = t * 0.6;

    camera.position.set(
      midX * 0.2 + Math.sin(orbitAngle) * 0.8,
      4.5 - pushIn * 0.5,
      3.5 - pushIn + Math.cos(orbitAngle) * 0.15,
    );
    camera.lookAt(
      midX * 0.4 + (toPos[0] - midX) * t * 0.3,
      0,
      midZ * 0.4 + (toPos[1] - midZ) * t * 0.3,
    );
  });

  return null;
}

// ─── Scene Content ────────────────────────────────────────────────────────────

interface SceneProps {
  event: CinematicEvent; duration: number; boardFlipped: boolean; onComplete: () => void; lite: boolean;
}

function SceneContent({ event, duration, boardFlipped, onComplete, lite }: SceneProps) {
  const [progress, setProgress] = useState(0);
  const startTime = useRef(Date.now());
  const completed = useRef(false);

  const fromPos = useMemo(() => squareToWorld(event.from, boardFlipped), [event.from, boardFlipped]);
  const toPos = useMemo(() => squareToWorld(event.to, boardFlipped), [event.to, boardFlipped]);

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
      <SceneLighting lite={lite} />
      <BoardPlane lite={lite} />
      <PieceProxy piece={event.piece} color={event.color} fromPos={fromPos} toPos={toPos} isCapture={event.isCapture} isMate={event.isMate} progress={progress} lite={lite} />

      {/* Source highlight */}
      <mesh position={[fromPos[0], 0.01, fromPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial color="hsl(45, 93%, 54%)" transparent opacity={0.25 * (1 - progress)} />
      </mesh>

      {/* Destination highlight */}
      <mesh position={[toPos[0], 0.01, toPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial color={event.isCapture ? "hsl(0, 70%, 50%)" : "hsl(45, 93%, 54%)"} transparent opacity={0.35 * progress} />
      </mesh>

      <CameraRig fromPos={fromPos} toPos={toPos} progress={progress} lite={lite} />
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
  const [opacity, setOpacity] = useState(0);

  // Fade in on mount
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
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-40 rounded-lg overflow-hidden"
      style={{
        opacity,
        transition: "opacity 180ms ease-in-out",
      }}
    >
      <Canvas
        shadows={!lite}
        gl={{ antialias: !lite, alpha: false, powerPreference: lite ? "low-power" : "default" }}
        dpr={lite ? [1, 1] : [1, 1.5]}
        style={{ background: "hsl(220, 15%, 8%)" }}
        onCreated={({ gl }) => { if (!gl.getContext()) onError(); }}
        fallback={null}
      >
        <SceneContent event={event} duration={duration} boardFlipped={boardFlipped} onComplete={handleComplete} lite={lite} />
      </Canvas>

      {/* SAN badge — slightly larger and more prominent */}
      <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-md bg-black/70 backdrop-blur-sm border border-primary/20">
        <span className="text-sm font-mono text-primary font-bold tracking-wider">{event.san}</span>
      </div>
    </div>
  );
}
