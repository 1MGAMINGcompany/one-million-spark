/**
 * CinematicChess3DScene – lightweight Three.js cinematic move animation.
 *
 * Supports two quality tiers:
 *   "3d-full"  – full camera motion, arc, effects (~1100ms)
 *   "3d-lite"  – reduced camera, lower arc, fewer effects (~700ms)
 *
 * pointer-events: none – never blocks interaction.
 */

import { useRef, useMemo, useEffect, useState } from "react";
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
const WHITE_PIECE = new THREE.Color("hsl(45, 80%, 85%)");
const BLACK_PIECE = new THREE.Color("hsl(220, 15%, 22%)");
const CAPTURE_FLASH = new THREE.Color("hsl(0, 70%, 55%)");
const MATE_FLASH = new THREE.Color("hsl(45, 93%, 54%)");

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

// ─── Board ────────────────────────────────────────────────────────────────────

function BoardPlane() {
  const geo = useMemo(() => new THREE.PlaneGeometry(SQ, SQ), []);
  const squares = useMemo(() => {
    const r: { x: number; z: number; dark: boolean }[] = [];
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++)
        r.push({ x: -HALF + SQ * col + SQ / 2, z: -HALF + SQ * row + SQ / 2, dark: (row + col) % 2 === 1 });
    return r;
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {squares.map((s, i) => (
        <mesh key={i} geometry={geo} position={[s.x, s.z, 0]}>
          <meshStandardMaterial color={s.dark ? DARK_SQ : LIGHT_SQ} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Piece Shape Factory ──────────────────────────────────────────────────────

function PieceShape({ piece, color }: { piece: string; color: THREE.Color }) {
  const mat = useMemo(() => <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />, [color]);
  switch (piece) {
    case "pawn": return <mesh position={[0,0.15,0]}><cylinderGeometry args={[0.08,0.12,0.3,12]}/>{mat}</mesh>;
    case "rook": return <group><mesh position={[0,0.2,0]}><boxGeometry args={[0.22,0.4,0.22]}/>{mat}</mesh><mesh position={[0,0.42,0]}><boxGeometry args={[0.26,0.06,0.26]}/>{mat}</mesh></group>;
    case "knight": return <group><mesh position={[0,0.18,0]}><boxGeometry args={[0.18,0.36,0.18]}/>{mat}</mesh><mesh position={[0.06,0.38,0]}><boxGeometry args={[0.14,0.12,0.14]}/>{mat}</mesh></group>;
    case "bishop": return <group><mesh position={[0,0.22,0]}><cylinderGeometry args={[0.06,0.12,0.44,12]}/>{mat}</mesh><mesh position={[0,0.46,0]}><sphereGeometry args={[0.05,8,8]}/>{mat}</mesh></group>;
    case "queen": return <group><mesh position={[0,0.25,0]}><cylinderGeometry args={[0.07,0.13,0.5,12]}/>{mat}</mesh><mesh position={[0,0.52,0]}><sphereGeometry args={[0.08,10,10]}/>{mat}</mesh></group>;
    case "king": return <group><mesh position={[0,0.28,0]}><cylinderGeometry args={[0.08,0.14,0.56,12]}/>{mat}</mesh><mesh position={[0,0.6,0]}><boxGeometry args={[0.04,0.14,0.04]}/>{mat}</mesh><mesh position={[0,0.62,0]}><boxGeometry args={[0.12,0.04,0.04]}/>{mat}</mesh></group>;
    default: return <mesh position={[0,0.15,0]}><cylinderGeometry args={[0.08,0.12,0.3,12]}/>{mat}</mesh>;
  }
}

// ─── Piece Proxy ──────────────────────────────────────────────────────────────

interface PieceProxyProps {
  piece: string; color: "white"|"black";
  fromPos: [number,number]; toPos: [number,number];
  isCapture: boolean; isMate: boolean;
  progress: number; lite: boolean;
}

function PieceProxy({ piece, color, fromPos, toPos, isCapture, isMate, progress, lite }: PieceProxyProps) {
  const pieceColor = color === "white" ? WHITE_PIECE : BLACK_PIECE;
  const t = easeInOutCubic(Math.min(progress, 1));
  const x = fromPos[0] + (toPos[0] - fromPos[0]) * t;
  const z = fromPos[1] + (toPos[1] - fromPos[1]) * t;
  const arcY = Math.sin(t * Math.PI) * (lite ? 0.15 : 0.3);

  const showFlash = (isCapture || isMate) && progress > 0.6;
  const flashOpacity = showFlash ? Math.max(0, 1 - (progress - 0.6) / 0.4) * (lite ? 0.5 : 0.8) : 0;

  return (
    <>
      <group position={[x, arcY, z]}>
        <PieceShape piece={piece} color={pieceColor} />
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

// ─── Camera ───────────────────────────────────────────────────────────────────

function CameraRig({ fromPos, toPos, progress, lite }: { fromPos: [number,number]; toPos: [number,number]; progress: number; lite: boolean }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 4.5, 3.5);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame(() => {
    if (lite) {
      // Minimal camera — almost static, tiny push-in
      const t = easeInOutCubic(Math.min(progress, 1));
      camera.position.set(0, 4.5, 3.5 - t * 0.15);
      camera.lookAt(0, 0, 0);
      return;
    }

    const t = easeInOutCubic(Math.min(progress, 1));
    const midX = (fromPos[0] + toPos[0]) / 2;
    const midZ = (fromPos[1] + toPos[1]) / 2;
    const orbitAngle = THREE.MathUtils.lerp(-0.08, 0.08, t);
    camera.position.set(
      midX * 0.15 + Math.sin(orbitAngle) * 0.3,
      4.5 - t * 0.3,
      3.5 - t * 0.4 + Math.cos(orbitAngle) * 0.1,
    );
    camera.lookAt(midX * 0.3, 0, midZ * 0.3);
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
      <ambientLight intensity={lite ? 0.7 : 0.6} />
      <directionalLight position={[3, 5, 2]} intensity={lite ? 0.6 : 0.8} />
      <BoardPlane />
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

  return (
    <div className="absolute inset-0 pointer-events-none z-40 rounded-lg overflow-hidden">
      <Canvas
        gl={{ antialias: !lite, alpha: true, powerPreference: lite ? "low-power" : "default" }}
        dpr={lite ? [1, 1] : [1, 1.5]}
        style={{ background: "transparent" }}
        onCreated={({ gl }) => { if (!gl.getContext()) onError(); }}
        fallback={null}
      >
        <SceneContent event={event} duration={duration} boardFlipped={boardFlipped} onComplete={onComplete} lite={lite} />
      </Canvas>

      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 backdrop-blur-sm">
        <span className="text-xs font-mono text-primary font-bold">{event.san}</span>
      </div>
    </div>
  );
}
