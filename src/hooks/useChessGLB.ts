/**
 * useChessGLB — loads chess_board.glb and extracts per-piece BufferGeometry.
 *
 * Uses the GLB board mesh as a scaling reference so pieces are correctly
 * proportioned regardless of the model's native units.
 */

import { useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const GLB_PATH = "/models/chess_board.glb";

/** Our procedural board spans BOARD_SIZE units (–2 to +2) */
const BOARD_SIZE = 4;

/** Name of the board mesh inside the GLB (used as scaling reference) */
const BOARD_MESH_NAME = "chess_board_board1_0";

/** Exact mesh names from the GLB, keyed by "piece_color" */
const MESH_MAP: Record<string, string> = {
  king_white: "king1_pieces_w_0",
  queen_white: "queen1_pieces_w_0",
  rook_white: "rook1_pieces_w_0",
  bishop_white: "bishop1_pieces_w_0",
  knight_white: "knight3_pieces_w_0",
  pawn_white: "pawn1_pieces_w_0",
  king_black: "king2_pieces_b_0",
  queen_black: "queen2_pieces_b_0",
  rook_black: "rook2_pieces_b_0",
  bishop_black: "bishop2_pieces_b_0",
  knight_black: "knight1_pieces_b_0",
  pawn_black: "pawn8_pieces_b_0",
};

/** Geometry cache — cloned & scaled, keyed by mesh name */
const _glbGeoCache = new Map<string, THREE.BufferGeometry>();

function scaleGeometry(geo: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  const clone = geo.clone();
  clone.computeBoundingBox();
  const bb = clone.boundingBox!;

  // Center X/Z, put base at Y=0
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  clone.translate(-cx, -bb.min.y, -cz);
  clone.scale(scale, scale, scale);
  return clone;
}

export function useChessGLB() {
  const { scene } = useGLTF(GLB_PATH);
  const logged = useRef(false);

  const { meshLookup, boardScale } = useMemo(() => {
    const lookup = new Map<string, THREE.Mesh>();
    let bScale = 1;

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        lookup.set(child.name, child as THREE.Mesh);
      }
    });

    // Compute board scale from the board mesh
    const boardMesh = lookup.get(BOARD_MESH_NAME);
    if (boardMesh) {
      const box = new THREE.Box3().setFromBufferAttribute(
        boardMesh.geometry.getAttribute("position") as THREE.BufferAttribute
      );
      const glbBoardWidth = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      if (glbBoardWidth > 0) {
        bScale = BOARD_SIZE / glbBoardWidth;
      }
    }

    // Debug log (dev only, once)
    if (!logged.current && import.meta.env.DEV) {
      logged.current = true;
      console.log("[useChessGLB] meshes found:", Array.from(lookup.keys()));
      console.log("[useChessGLB] boardScale:", bScale);
    }

    return { meshLookup: lookup, boardScale: bScale };
  }, [scene]);

  /**
   * Get a uniformly-scaled BufferGeometry for a piece+color.
   * Returns null if the mesh isn't found in the GLB.
   */
  const getGLBGeo = useMemo(() => {
    return (piece: string, color: "white" | "black"): THREE.BufferGeometry | null => {
      const key = `${piece}_${color}`;
      const meshName = MESH_MAP[key];
      if (!meshName) return null;

      const cacheKey = `${meshName}_${boardScale.toFixed(4)}`;
      let cached = _glbGeoCache.get(cacheKey);
      if (cached) return cached;

      const mesh = meshLookup.get(meshName);
      if (!mesh) {
        if (import.meta.env.DEV) {
          console.warn(`[useChessGLB] mesh "${meshName}" not found for ${key}`);
        }
        return null;
      }

      cached = scaleGeometry(mesh.geometry, boardScale);
      _glbGeoCache.set(cacheKey, cached);
      return cached;
    };
  }, [meshLookup, boardScale]);

  return { getGLBGeo };
}

useGLTF.preload(GLB_PATH);
