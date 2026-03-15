/**
 * CinematicChess3DScene – HD cinematic chess move animation.
 *
 * Visual overhaul v3:
 *   - Low dramatic camera angle (player's-eye view)
 *   - MeshPhysicalMaterial with clearcoat (marble white, obsidian black)
 *   - 1.8x piece scale — pieces fill the frame
 *   - Cinematic three-point lighting with colored fills
 *   - Ghost trail behind moving pieces
 *   - Capture impact particle burst
 *   - Atmospheric radial background + vignette
 *   - Board pedestal + reflective floor
 *   - Gold edge trim with high metalness
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
const PIECE_SCALE = 1.8;

const LIGHT_SQ = new THREE.Color("hsl(38, 45%, 75%)");
const DARK_SQ = new THREE.Color("hsl(25, 35%, 32%)");
const GOLD_TRIM = new THREE.Color("hsl(42, 75%, 50%)");
const PEDESTAL_COLOR = new THREE.Color("hsl(220, 12%, 10%)");

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

function makeLathe(points: [number, number][], segments = 20): THREE.LatheGeometry {
  const pts = points.map(([x, y]) => new THREE.Vector2(x * PIECE_SCALE, y * PIECE_SCALE));
  return new THREE.LatheGeometry(pts, segments);
}

const PIECE_PROFILES: Record<string, { points: [number, number][]; segs?: number }> = {
  pawn: {
    points: [
      [0, 0], [0.12, 0], [0.13, 0.02], [0.1, 0.04],
      [0.06, 0.12], [0.05, 0.18],
      [0.07, 0.22], [0.06, 0.28], [0, 0.3],
    ],
  },
  rook: {
    points: [
      [0, 0], [0.14, 0], [0.15, 0.02], [0.12, 0.05],
      [0.08, 0.15], [0.08, 0.30],
      [0.12, 0.32], [0.12, 0.40],
      [0.09, 0.40], [0.09, 0.38], [0.06, 0.38], [0.06, 0.40],
      [0, 0.40],
    ],
  },
  knight: {
    points: [
      [0, 0], [0.13, 0], [0.14, 0.02], [0.1, 0.05],
      [0.07, 0.12], [0.06, 0.20],
      [0.08, 0.25], [0.1, 0.32], [0.08, 0.38],
      [0.04, 0.42], [0, 0.44],
    ],
  },
  bishop: {
    points: [
      [0, 0], [0.13, 0], [0.14, 0.02], [0.1, 0.05],
      [0.06, 0.15], [0.05, 0.28],
      [0.07, 0.33], [0.06, 0.40], [0.03, 0.44],
      [0, 0.47],
    ],
  },
  queen: {
    points: [
      [0, 0], [0.14, 0], [0.15, 0.02], [0.11, 0.06],
      [0.07, 0.18], [0.06, 0.32],
      [0.09, 0.36], [0.1, 0.42], [0.07, 0.48],
      [0.04, 0.52], [0, 0.55],
    ],
  },
  king: {
    points: [
      [0, 0], [0.14, 0], [0.15, 0.02], [0.11, 0.06],
      [0.07, 0.20], [0.06, 0.36],
      [0.09, 0.40], [0.1, 0.46], [0.08, 0.50],
      [0.04, 0.54], [0.02, 0.56],
      [0, 0.58],
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

  const lightMat = useMemo(() => lite
    ? new THREE.MeshStandardMaterial({ color: LIGHT_SQ, roughness: 0.5 })
    : new THREE.MeshPhysicalMaterial({ color: LIGHT_SQ, roughness: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  [lite]);

  const darkMat = useMemo(() => lite
    ? new THREE.MeshStandardMaterial({ color: DARK_SQ, roughness: 0.5 })
    : new THREE.MeshPhysicalMaterial({ color: DARK_SQ, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
  [lite]);

  return (
    <group>
      {/* Board squares */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {squares.map((s, i) => (
          <mesh key={i} geometry={geo} position={[s.x, s.z, 0]} receiveShadow material={s.dark ? darkMat : lightMat} />
        ))}
      </group>

      {/* Pedestal under board */}
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[BOARD_SIZE + 0.15, 0.12, BOARD_SIZE + 0.15]} />
        <meshStandardMaterial color={PEDESTAL_COLOR} roughness={0.8} />
      </mesh>

      {/* Gold edge trim */}
      <BoardEdgeTrim lite={lite} />

      {/* Reflective floor (full tier only) */}
      {!lite && (
        <mesh position={[0, -0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8, 8]} />
          <meshStandardMaterial color="hsl(220, 10%, 6%)" roughness={0.9} transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

function BoardEdgeTrim({ lite }: { lite: boolean }) {
  const trimThickness = 0.05;
  const trimHeight = 0.08;
  const totalSize = BOARD_SIZE + trimThickness * 2;

  const mat = useMemo(() => lite
    ? new THREE.MeshStandardMaterial({ color: GOLD_TRIM, roughness: 0.3, metalness: 0.8 })
    : new THREE.MeshPhysicalMaterial({ color: GOLD_TRIM, roughness: 0.15, metalness: 0.9, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
  [lite]);

  return (
    <group>
      <mesh position={[0, trimHeight / 2, -HALF - trimThickness / 2]} material={mat}>
        <boxGeometry args={[totalSize, trimHeight, trimThickness]} />
      </mesh>
      <mesh position={[0, trimHeight / 2, HALF + trimThickness / 2]} material={mat}>
        <boxGeometry args={[totalSize, trimHeight, trimThickness]} />
      </mesh>
      <mesh position={[-HALF - trimThickness / 2, trimHeight / 2, 0]} material={mat}>
        <boxGeometry args={[trimThickness, trimHeight, BOARD_SIZE]} />
      </mesh>
      <mesh position={[HALF + trimThickness / 2, trimHeight / 2, 0]} material={mat}>
        <boxGeometry args={[trimThickness, trimHeight, BOARD_SIZE]} />
      </mesh>
    </group>
  );
}

// ─── Piece Shape (Lathe + Premium Materials) ──────────────────────────────────

function PieceShape({ piece, color, lite }: { piece: string; color: "white" | "black"; lite: boolean }) {
  const geo = useMemo(() => {
    const profile = PIECE_PROFILES[piece] ?? PIECE_PROFILES.pawn;
    return makeLathe(profile.points, lite ? 12 : (profile.segs ?? 20));
  }, [piece, lite]);

  const mat = useMemo(() => {
    if (color === "white") {
      return lite
        ? new THREE.MeshStandardMaterial({ color: "#f0e6d3", roughness: 0.3, metalness: 0.05 })
        : new THREE.MeshPhysicalMaterial({
            color: "#f5ead8",
            roughness: 0.15,
            metalness: 0.02,
            clearcoat: 1.0,
            clearcoatRoughness: 0.08,
            reflectivity: 0.8,
          });
    } else {
      return lite
        ? new THREE.MeshStandardMaterial({ color: "#1a1a22", roughness: 0.25, metalness: 0.4 })
        : new THREE.MeshPhysicalMaterial({
            color: "#141418",
            roughness: 0.12,
            metalness: 0.6,
            clearcoat: 0.9,
            clearcoatRoughness: 0.05,
            reflectivity: 1.0,
          });
    }
  }, [color, lite]);

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

// ─── Ghost Trail ──────────────────────────────────────────────────────────────

function GhostTrail({ piece, color, positions, lite }: {
  piece: string; color: "white" | "black";
  positions: [number, number, number][];
  lite: boolean;
}) {
  if (lite || positions.length === 0) return null;

  const opacities = [0.25, 0.12, 0.05];

  return (
    <>
      {positions.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh>
            <sphereGeometry args={[0.12 * PIECE_SCALE, 8, 6]} />
            <meshBasicMaterial
              color={color === "white" ? "#f5ead8" : "#2a2a35"}
              transparent
              opacity={opacities[i] ?? 0.03}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ─── Capture Particle Burst ───────────────────────────────────────────────────

function CaptureParticles({ position, isMate, progress, lite }: {
  position: [number, number]; isMate: boolean; progress: number; lite: boolean;
}) {
  if (lite) return null;

  const burstProgress = Math.max(0, (progress - 0.7) / 0.3);
  if (burstProgress <= 0) return null;

  const particleCount = isMate ? 12 : 8;
  const baseColor = isMate ? "#ffd700" : "#ff4444";
  const scale = easeInOutCubic(burstProgress) * 1.5;
  const opacity = 1 - burstProgress;

  return (
    <group position={[position[0], 0.15, position[1]]}>
      {Array.from({ length: particleCount }).map((_, i) => {
        const angle = (i / particleCount) * Math.PI * 2;
        const radius = scale * 0.4;
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius,
              Math.sin(burstProgress * Math.PI) * 0.3,
              Math.sin(angle) * radius,
            ]}
          >
            <sphereGeometry args={[0.03 * (1 + (isMate ? 0.5 : 0)), 6, 4]} />
            <meshBasicMaterial color={baseColor} transparent opacity={opacity * 0.8} />
          </mesh>
        );
      })}
      {/* Impact ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[scale * 0.15, scale * 0.25, 24]} />
        <meshBasicMaterial color={baseColor} transparent opacity={opacity * 0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── Impact Light ─────────────────────────────────────────────────────────────

function ImpactLight({ position, isMate, progress }: {
  position: [number, number]; isMate: boolean; progress: number;
}) {
  const burstProgress = Math.max(0, (progress - 0.65) / 0.35);
  if (burstProgress <= 0) return null;

  const intensity = (1 - burstProgress) * 3;

  return (
    <pointLight
      position={[position[0], 0.5, position[1]]}
      intensity={intensity}
      color={isMate ? "#ffd700" : "#ff3333"}
      distance={3}
      decay={2}
    />
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
  const t = easeInOutCubic(Math.min(progress, 1));
  const x = fromPos[0] + (toPos[0] - fromPos[0]) * t;
  const z = fromPos[1] + (toPos[1] - fromPos[1]) * t;
  const arcY = Math.sin(t * Math.PI) * (lite ? 0.25 : 0.5);

  // Ghost trail positions (3 trailing copies at previous positions)
  const ghostPositions = useMemo(() => {
    const ghosts: [number, number, number][] = [];
    const trailOffsets = [0.08, 0.18, 0.3];
    for (const offset of trailOffsets) {
      const gt = Math.max(0, t - offset);
      const gx = fromPos[0] + (toPos[0] - fromPos[0]) * gt;
      const gz = fromPos[1] + (toPos[1] - fromPos[1]) * gt;
      const gy = Math.sin(gt * Math.PI) * 0.5;
      ghosts.push([gx, gy, gz]);
    }
    return ghosts;
  }, [t, fromPos, toPos]);

  return (
    <>
      <group position={[x, arcY, z]}>
        <PieceShape piece={piece} color={color} lite={lite} />
      </group>

      {/* Ghost trail */}
      {progress > 0.05 && progress < 0.9 && (
        <GhostTrail piece={piece} color={color} positions={ghostPositions} lite={lite} />
      )}

      {/* Capture / mate effects */}
      {(isCapture || isMate) && (
        <>
          <CaptureParticles position={toPos} isMate={isMate} progress={progress} lite={lite} />
          {!lite && <ImpactLight position={toPos} isMate={isMate} progress={progress} />}
        </>
      )}

      {/* Source highlight glow */}
      <mesh position={[fromPos[0], 0.01, fromPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial color="#ffd700" transparent opacity={0.3 * (1 - progress)} />
      </mesh>

      {/* Destination highlight glow */}
      <mesh position={[toPos[0], 0.01, toPos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SQ * 0.95, SQ * 0.95]} />
        <meshBasicMaterial
          color={isCapture ? "#ff3333" : "#ffd700"}
          transparent
          opacity={0.4 * progress}
        />
      </mesh>
    </>
  );
}

// ─── Cinematic Lighting ───────────────────────────────────────────────────────

function SceneLighting({ lite }: { lite: boolean }) {
  return (
    <>
      <ambientLight intensity={lite ? 0.5 : 0.4} color="hsl(40, 30%, 95%)" />

      {/* Key light — warm, from upper-right, casts shadows */}
      <directionalLight
        position={[3, 5, 2]}
        intensity={lite ? 0.8 : 1.2}
        color="hsl(35, 60%, 90%)"
        castShadow={!lite}
        shadow-mapSize-width={lite ? 0 : 1024}
        shadow-mapSize-height={lite ? 0 : 1024}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.001}
      />

      {/* Fill light — cool blue from left for cinematic color contrast */}
      <directionalLight
        position={[-3, 2, 1]}
        intensity={lite ? 0.2 : 0.4}
        color="hsl(210, 50%, 75%)"
      />

      {/* Rim / backlight — strong gold for silhouette glow */}
      {!lite && (
        <pointLight
          position={[0, 1.5, -3]}
          intensity={1.2}
          color="hsl(42, 85%, 55%)"
          distance={8}
          decay={2}
        />
      )}

      {/* Bottom fill — subtle so dark pieces stay readable */}
      <directionalLight position={[0, -1, 2]} intensity={0.15} color="hsl(220, 20%, 60%)" />
    </>
  );
}

// ─── Camera ───────────────────────────────────────────────────────────────────

function CameraRig({ fromPos, toPos, progress, lite }: {
  fromPos: [number, number]; toPos: [number, number]; progress: number; lite: boolean;
}) {
  const { camera } = useThree();

  useEffect(() => {
    // Start position: low angle, player's-eye view
    camera.position.set(0, 1.4, 3.0);
    camera.lookAt(0, 0, 0);
    if ('fov' in camera && camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame(() => {
    const t = easeInOutCubic(Math.min(progress, 1));
    const midX = (fromPos[0] + toPos[0]) / 2;
    const midZ = (fromPos[1] + toPos[1]) / 2;

    if (lite) {
      // Lite: gentle push toward destination, low angle
      const pushX = toPos[0] * 0.12 * t;
      const pushZ = toPos[1] * 0.06 * t;
      camera.position.set(pushX, 1.3 - t * 0.1, 3.0 - t * 0.3);
      camera.lookAt(pushX * 0.5, 0.1, pushZ * 0.5);
      return;
    }

    // Full: dramatic orbit sweep + push-in toward destination
    const orbitAngle = THREE.MathUtils.lerp(-0.3, 0.3, t); // ~17° sweep
    const pushIn = t * 0.8;

    camera.position.set(
      midX * 0.3 + Math.sin(orbitAngle) * 1.0,
      1.4 - pushIn * 0.3,
      3.0 - pushIn * 0.6 + Math.cos(orbitAngle) * 0.2,
    );

    // Look slightly ahead of the piece toward destination
    camera.lookAt(
      midX * 0.4 + (toPos[0] - midX) * t * 0.5,
      0.15,
      midZ * 0.4 + (toPos[1] - midZ) * t * 0.4,
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
      <PieceProxy
        piece={event.piece} color={event.color}
        fromPos={fromPos} toPos={toPos}
        isCapture={event.isCapture} isMate={event.isMate}
        progress={progress} lite={lite}
      />
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
    setTimeout(onComplete, 220);
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-40 rounded-lg overflow-hidden"
      style={{
        opacity,
        transition: "opacity 220ms ease-in-out",
      }}
    >
      {/* Atmospheric background gradient */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse at 50% 60%, hsl(30, 15%, 12%) 0%, hsl(220, 15%, 5%) 70%, hsl(220, 20%, 2%) 100%)",
        }}
      />

      <Canvas
        shadows={!lite}
        gl={{ antialias: !lite, alpha: true, powerPreference: lite ? "low-power" : "high-performance" }}
        dpr={lite ? [1, 1] : [1, 2]}
        camera={{ fov: 50, near: 0.1, far: 50 }}
        style={{ position: "relative", zIndex: 1 }}
        onCreated={({ gl }) => { if (!gl.getContext()) onError(); }}
        fallback={null}
      >
        <SceneContent event={event} duration={duration} boardFlipped={boardFlipped} onComplete={handleComplete} lite={lite} />
      </Canvas>

      {/* Vignette overlay */}
      {!lite && (
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)",
          }}
        />
      )}

      {/* SAN badge — premium look */}
      <div className="absolute bottom-4 right-4 z-20 px-4 py-2 rounded-lg bg-black/80 backdrop-blur-md border border-yellow-500/30 shadow-lg shadow-yellow-500/10">
        <span className="text-base font-mono font-bold tracking-widest" style={{ color: "#ffd700" }}>
          {event.san}
        </span>
      </div>

      {/* Piece name badge */}
      <div className="absolute bottom-4 left-4 z-20 px-3 py-1.5 rounded-md bg-black/60 backdrop-blur-sm">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
          {event.color} {event.piece}
        </span>
      </div>
    </div>
  );
}
