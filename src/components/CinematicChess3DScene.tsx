/**
 * CinematicChess3DScene – lightweight Three.js cinematic move animation.
 *
 * Renders a flat board with alternating squares and a simple proxy piece
 * that animates from source to destination square. Self-contained scene
 * that mounts/unmounts with the cinematic event lifecycle.
 *
 * pointer-events: none – never blocks interaction.
 */

import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CinematicEvent } from "@/lib/buildCinematicEvent";

// ─── Constants ────────────────────────────────────────────────────────────────

const BOARD_SIZE = 4; // world units (board spans -2 to +2)
const SQ = BOARD_SIZE / 8; // 0.5 per square
const HALF = BOARD_SIZE / 2;

const LIGHT_SQ = new THREE.Color("hsl(38, 40%, 72%)");
const DARK_SQ = new THREE.Color("hsl(28, 30%, 38%)");
const WHITE_PIECE = new THREE.Color("hsl(45, 80%, 85%)");
const BLACK_PIECE = new THREE.Color("hsl(220, 15%, 22%)");
const CAPTURE_FLASH = new THREE.Color("hsl(0, 70%, 55%)");
const MATE_FLASH = new THREE.Color("hsl(45, 93%, 54%)");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function squareToWorld(
  sq: string,
  flipped: boolean,
): [number, number] {
  const file = sq.charCodeAt(0) - 97; // a=0 … h=7
  const rank = parseInt(sq[1], 10) - 1; // 1=0 … 8=7
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  const x = -HALF + SQ * col + SQ / 2;
  const z = -HALF + SQ * row + SQ / 2;
  return [x, z];
}

// ─── Board Mesh ───────────────────────────────────────────────────────────────

function BoardPlane() {
  const geo = useMemo(() => new THREE.PlaneGeometry(SQ, SQ), []);

  const squares = useMemo(() => {
    const result: { x: number; z: number; dark: boolean }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        result.push({
          x: -HALF + SQ * c + SQ / 2,
          z: -HALF + SQ * r + SQ / 2,
          dark: (r + c) % 2 === 1,
        });
      }
    }
    return result;
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      {squares.map((sq, i) => (
        <mesh key={i} geometry={geo} position={[sq.x, sq.z, 0]}>
          <meshStandardMaterial color={sq.dark ? DARK_SQ : LIGHT_SQ} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Piece Proxy ──────────────────────────────────────────────────────────────

interface PieceProxyProps {
  piece: string;
  color: "white" | "black";
  fromPos: [number, number];
  toPos: [number, number];
  isCapture: boolean;
  isMate: boolean;
  progress: number; // 0→1
}

function PieceProxy({ piece, color, fromPos, toPos, isCapture, isMate, progress }: PieceProxyProps) {
  const meshRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);

  const pieceColor = color === "white" ? WHITE_PIECE : BLACK_PIECE;

  // Smooth easing
  const t = easeInOutCubic(Math.min(progress, 1));

  const x = fromPos[0] + (toPos[0] - fromPos[0]) * t;
  const z = fromPos[1] + (toPos[1] - fromPos[1]) * t;

  // Subtle arc: lift piece during middle of animation
  const arcY = Math.sin(t * Math.PI) * 0.3;

  // Capture / mate flash
  const showFlash = (isCapture || isMate) && progress > 0.6;
  const flashOpacity = showFlash ? Math.max(0, 1 - (progress - 0.6) / 0.4) * 0.8 : 0;

  return (
    <>
      <group ref={meshRef} position={[x, arcY, z]}>
        <PieceShape piece={piece} color={pieceColor} />
      </group>

      {/* Capture / mate impact flash at destination */}
      {showFlash && (
        <mesh ref={flashRef} position={[toPos[0], 0.02, toPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[SQ * 0.8, 16]} />
          <meshBasicMaterial
            color={isMate ? MATE_FLASH : CAPTURE_FLASH}
            transparent
            opacity={flashOpacity}
          />
        </mesh>
      )}
    </>
  );
}

// ─── Piece Shape Factory ──────────────────────────────────────────────────────

function PieceShape({ piece, color }: { piece: string; color: THREE.Color }) {
  const mat = useMemo(() => (
    <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
  ), [color]);

  switch (piece) {
    case "pawn":
      return (
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 0.3, 12]} />
          {mat}
        </mesh>
      );
    case "rook":
      return (
        <group>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.22, 0.4, 0.22]} />
            {mat}
          </mesh>
          {/* Battlements */}
          <mesh position={[0, 0.42, 0]}>
            <boxGeometry args={[0.26, 0.06, 0.26]} />
            {mat}
          </mesh>
        </group>
      );
    case "knight":
      return (
        <group>
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[0.18, 0.36, 0.18]} />
            {mat}
          </mesh>
          {/* Head accent */}
          <mesh position={[0.06, 0.38, 0]}>
            <boxGeometry args={[0.14, 0.12, 0.14]} />
            {mat}
          </mesh>
        </group>
      );
    case "bishop":
      return (
        <group>
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.06, 0.12, 0.44, 12]} />
            {mat}
          </mesh>
          {/* Top point */}
          <mesh position={[0, 0.46, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            {mat}
          </mesh>
        </group>
      );
    case "queen":
      return (
        <group>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.07, 0.13, 0.5, 12]} />
            {mat}
          </mesh>
          {/* Crown */}
          <mesh position={[0, 0.52, 0]}>
            <sphereGeometry args={[0.08, 10, 10]} />
            {mat}
          </mesh>
        </group>
      );
    case "king":
      return (
        <group>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.08, 0.14, 0.56, 12]} />
            {mat}
          </mesh>
          {/* Cross top - vertical */}
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[0.04, 0.14, 0.04]} />
            {mat}
          </mesh>
          {/* Cross top - horizontal */}
          <mesh position={[0, 0.62, 0]}>
            <boxGeometry args={[0.12, 0.04, 0.04]} />
            {mat}
          </mesh>
        </group>
      );
    default:
      return (
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 0.3, 12]} />
          {mat}
        </mesh>
      );
  }
}

// ─── Camera Controller ────────────────────────────────────────────────────────

function CameraRig({ fromPos, toPos, progress }: { fromPos: [number, number]; toPos: [number, number]; progress: number }) {
  const { camera } = useThree();

  useEffect(() => {
    // Initial camera position — angled view
    camera.position.set(0, 4.5, 3.5);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame(() => {
    const t = easeInOutCubic(Math.min(progress, 1));

    // Subtle push-in toward the action center
    const midX = (fromPos[0] + toPos[0]) / 2;
    const midZ = (fromPos[1] + toPos[1]) / 2;

    // Gentle orbit: start slightly left, end slightly right
    const orbitAngle = THREE.MathUtils.lerp(-0.08, 0.08, t);

    const baseX = midX * 0.15;
    const baseZ = 3.5 - t * 0.4; // subtle push-in

    camera.position.set(
      baseX + Math.sin(orbitAngle) * 0.3,
      4.5 - t * 0.3,
      baseZ + Math.cos(orbitAngle) * 0.1,
    );
    camera.lookAt(midX * 0.3, 0, midZ * 0.3);
  });

  return null;
}

// ─── Scene Orchestrator ───────────────────────────────────────────────────────

interface SceneProps {
  event: CinematicEvent;
  duration: number;
  boardFlipped: boolean;
  onComplete: () => void;
}

function SceneContent({ event, duration, boardFlipped, onComplete }: SceneProps) {
  const [progress, setProgress] = useState(0);
  const startTime = useRef(Date.now());
  const completed = useRef(false);

  const fromPos = useMemo(() => squareToWorld(event.from, boardFlipped), [event.from, boardFlipped]);
  const toPos = useMemo(() => squareToWorld(event.to, boardFlipped), [event.to, boardFlipped]);

  useFrame(() => {
    const elapsed = Date.now() - startTime.current;
    const p = Math.min(elapsed / duration, 1);
    setProgress(p);

    if (p >= 1 && !completed.current) {
      completed.current = true;
      // Small delay before unmount for final frame
      setTimeout(onComplete, 50);
    }
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={0.8} />

      <BoardPlane />

      <PieceProxy
        piece={event.piece}
        color={event.color}
        fromPos={fromPos}
        toPos={toPos}
        isCapture={event.isCapture}
        isMate={event.isMate}
        progress={progress}
      />

      {/* Source square highlight */}
      <mesh position={[fromPos[0], 0.01, fromPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial color="hsl(45, 93%, 54%)" transparent opacity={0.25 * (1 - progress)} />
      </mesh>

      {/* Destination square highlight */}
      <mesh position={[toPos[0], 0.01, toPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial
          color={event.isCapture ? "hsl(0, 70%, 50%)" : "hsl(45, 93%, 54%)"}
          transparent
          opacity={0.35 * progress}
        />
      </mesh>

      <CameraRig fromPos={fromPos} toPos={toPos} progress={progress} />
    </>
  );
}

// ─── Easing ───────────────────────────────────────────────────────────────────

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ─── Exported Component ───────────────────────────────────────────────────────

interface CinematicChess3DSceneProps {
  event: CinematicEvent;
  duration: number;
  boardFlipped: boolean;
  onComplete: () => void;
  onError: () => void;
}

export default function CinematicChess3DScene({
  event,
  duration,
  boardFlipped,
  onComplete,
  onError,
}: CinematicChess3DSceneProps) {
  return (
    <div className="absolute inset-0 pointer-events-none z-40 rounded-lg overflow-hidden">
      <Canvas
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        dpr={[1, 1.5]}
        style={{ background: "transparent" }}
        onCreated={({ gl }) => {
          // Verify WebGL context is valid
          if (!gl.getContext()) {
            onError();
          }
        }}
        fallback={null}
      >
        <SceneContent
          event={event}
          duration={duration}
          boardFlipped={boardFlipped}
          onComplete={onComplete}
        />
      </Canvas>

      {/* SAN label overlay */}
      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 backdrop-blur-sm">
        <span className="text-xs font-mono text-primary font-bold">
          {event.san}
        </span>
      </div>
    </div>
  );
}
