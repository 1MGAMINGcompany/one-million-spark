/**
 * useChessGLB — loads chess_board.glb and extracts per-piece BufferGeometry.
 *
 * Exact mesh names from the GLB are used as the primary mapping.
 * Falls back to null (caller should use lathe profiles) if a mesh is missing.
 */

import { useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const GLB_PATH = "/models/chess_board.glb";

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

/** Geometry cache — cloned & normalized, keyed by mesh name */
const _glbGeoCache = new Map<string, THREE.BufferGeometry>();

function normalizeGeometry(geo: THREE.BufferGeometry, targetHeight: number): THREE.BufferGeometry {
  const clone = geo.clone();
  clone.computeBoundingBox();
  const bb = clone.boundingBox!;
  const h = bb.max.y - bb.min.y;
  const scale = h > 0 ? targetHeight / h : 1;

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

  const meshLookup = useMemo(() => {
    const lookup = new Map<string, THREE.Mesh>();

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        lookup.set(child.name, child as THREE.Mesh);
      }
    });

    // Debug log (dev only, once)
    if (!logged.current && import.meta.env.DEV) {
      logged.current = true;
      console.log("[useChessGLB] meshes found:", Array.from(lookup.keys()));
    }

    return lookup;
  }, [scene]);

  /**
   * Get a normalized BufferGeometry for a piece+color.
   * Returns null if the mesh isn't found in the GLB.
   */
  const getGLBGeo = useMemo(() => {
    return (piece: string, color: "white" | "black", targetHeight: number): THREE.BufferGeometry | null => {
      const key = `${piece}_${color}`;
      const meshName = MESH_MAP[key];
      if (!meshName) return null;

      const cacheKey = `${meshName}_${targetHeight}`;
      let cached = _glbGeoCache.get(cacheKey);
      if (cached) return cached;

      const mesh = meshLookup.get(meshName);
      if (!mesh) {
        if (import.meta.env.DEV) {
          console.warn(`[useChessGLB] mesh "${meshName}" not found for ${key}`);
        }
        return null;
      }

      cached = normalizeGeometry(mesh.geometry, targetHeight);
      _glbGeoCache.set(cacheKey, cached);
      return cached;
    };
  }, [meshLookup]);

  return { getGLBGeo };
}

useGLTF.preload(GLB_PATH);
