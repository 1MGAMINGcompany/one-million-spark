import { 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  Connection
} from "@solana/web3.js";
import bs58 from "bs58";
import { getSolanaEndpoint } from "./solana-config";

// ============================================
// CONFIGURATION - MAINNET PRODUCTION
// ============================================

// Mainnet deployed program ID
export const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

// Platform fee recipient (5% of prize pool)
export const FEE_RECIPIENT = new PublicKey("3bcV9vtxeiHsXgNx4qvQbS4ZL4cMUnAg2tF3DZjtmGUj");

// Platform fee percentage (5%)
export const PLATFORM_FEE_BPS = 500; // 5% = 500 basis points

// ============================================
// TYPES
// ============================================

export enum RoomStatus {
  Created = 0,
  Started = 1,
  Completed = 2,
  Cancelled = 3,
}

/**
 * Check if a room status indicates it's open for joining
 * On-chain status=1 appears to be the "open/joinable" state
 * We treat both 0 and 1 as joinable to be safe
 */
export function isOpenStatus(status: number): boolean {
  return status === 0 || status === 1;
}

export enum GameType {
  Chess = 1,
  Dominos = 2,
  Backgammon = 3,
  Checkers = 4,
  Ludo = 5,
}

export interface RoomAccount {
  roomId: number;
  creator: PublicKey;
  gameType: GameType;
  entryFee: number; // stake_lamports on-chain, in lamports
  maxPlayers: number;
  playerCount: number; // on-chain: player_count
  status: RoomStatus;
  players: PublicKey[];
  winner: PublicKey | null;
  // Client-side only (not on-chain):
  turnTimeSec: number;
  isPrivate: boolean;
  createdAt: number;
  bump: number;
}

export interface RoomDisplay {
  pda: string; // Room PDA address - use this for navigation/fetching
  roomId: number;
  creator: string;
  gameType: GameType;
  gameTypeName: string;
  entryFeeSol: number;
  maxPlayers: number;
  turnTimeSec: number;
  isPrivate: boolean;
  status: RoomStatus;
  statusName: string;
  players: string[];
  playerCount: number;
  winner: string | null;
  createdAt: Date;
  prizePoolSol: number;
}

// ============================================
// PDA DERIVATION
// ============================================

export function getRoomPDA(creator: PublicKey, roomId: number): [PublicKey, number] {
  const roomIdBuffer = Buffer.alloc(8);
  roomIdBuffer.writeBigUInt64LE(BigInt(roomId));
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from("room"), creator.toBuffer(), roomIdBuffer],
    PROGRAM_ID
  );
}

export function getVaultPDA(roomPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), roomPda.toBuffer()],
    PROGRAM_ID
  );
}

export function getGlobalStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    PROGRAM_ID
  );
}

export function getConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );
}

// Config account structure
export interface ConfigAccount {
  authority: PublicKey;
  verifier: PublicKey; // Result settlement authority
  feeRecipient: PublicKey;
  feeBps: number;
  bump: number;
}

// Parse config account from on-chain data
export function parseConfigAccount(data: Buffer): ConfigAccount | null {
  try {
    // Skip 8-byte discriminator
    let offset = 8;
    
    // authority: Pubkey (32 bytes)
    const authority = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    
    // verifier: Pubkey (32 bytes)
    const verifier = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    
    // fee_recipient: Pubkey (32 bytes)
    const feeRecipient = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    
    // fee_bps: u16
    const feeBps = data.readUInt16LE(offset);
    offset += 2;
    
    // bump: u8
    const bump = data.readUInt8(offset);
    
    return {
      authority,
      verifier,
      feeRecipient,
      feeBps,
      bump,
    };
  } catch (err) {
    console.error("Failed to parse config account:", err);
    return null;
  }
}

// Fetch config from on-chain (contains verifier/result authority)
export async function fetchConfig(connection: Connection): Promise<ConfigAccount | null> {
  try {
    const [configPda] = getConfigPDA();
    const accountInfo = await connection.getAccountInfo(configPda);
    
    if (!accountInfo) {
      console.log("Config PDA not initialized");
      return null;
    }
    
    return parseConfigAccount(accountInfo.data as Buffer);
  } catch (err) {
    console.error("Failed to fetch config:", err);
    return null;
  }
}

// Get result authority (verifier) from on-chain config
export async function getResultAuthority(connection: Connection): Promise<PublicKey | null> {
  const config = await fetchConfig(connection);
  return config?.verifier || null;
}

// ============================================
// ACCOUNT PARSING
// ============================================

export const GAME_TYPE_NAMES: Record<number, string> = {
  1: "Chess",
  2: "Dominos",
  3: "Backgammon",
  4: "Checkers",
  5: "Ludo",
};

export const STATUS_NAMES: Record<number, string> = {
  0: "Open",
  1: "In Progress",
  2: "Completed",
  3: "Cancelled",
};

export function parseRoomAccount(data: Buffer): RoomAccount | null {
  try {
    // On-chain Room struct layout (from IDL):
    // - room_id: u64
    // - creator: pubkey (32)
    // - game_type: u8
    // - max_players: u8
    // - player_count: u8
    // - status: u8
    // - stake_lamports: u64
    // - winner: pubkey (32)
    // - players: [pubkey; 4] (128 bytes fixed array)
    
    let offset = 8; // Skip 8-byte discriminator
    
    // room_id: u64
    const roomId = Number(data.readBigUInt64LE(offset));
    offset += 8;
    
    // creator: Pubkey (32 bytes)
    const creator = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    
    // game_type: u8
    const gameType = data.readUInt8(offset) as GameType;
    offset += 1;
    
    // max_players: u8
    const maxPlayers = data.readUInt8(offset);
    offset += 1;
    
    // player_count: u8
    const playerCount = data.readUInt8(offset);
    offset += 1;
    
    // status: u8
    const status = data.readUInt8(offset) as RoomStatus;
    offset += 1;
    
    // stake_lamports: u64
    const entryFee = Number(data.readBigUInt64LE(offset));
    offset += 8;
    
    // winner: pubkey (32 bytes) - always present, check for all zeros
    const winnerBytes = data.subarray(offset, offset + 32);
    const winner = winnerBytes.every(b => b === 0) ? null : new PublicKey(winnerBytes);
    offset += 32;
    
    // players: [pubkey; 4] - fixed array, use player_count to know how many are valid
    const players: PublicKey[] = [];
    for (let i = 0; i < playerCount; i++) {
      const playerBytes = data.subarray(offset + (i * 32), offset + ((i + 1) * 32));
      // Skip zero pubkeys
      if (!playerBytes.every(b => b === 0)) {
        players.push(new PublicKey(playerBytes));
      }
    }
    
    return {
      roomId,
      creator,
      gameType,
      entryFee,
      maxPlayers,
      playerCount,
      status,
      players,
      winner,
      // Client-side defaults (not on-chain):
      turnTimeSec: 0,
      isPrivate: false,
      createdAt: 0,
      bump: 0,
    };
  } catch (err) {
    console.error("Failed to parse room account:", err);
    return null;
  }
}

export function roomToDisplay(room: RoomAccount, pda: PublicKey): RoomDisplay {
  const entryFeeSol = room.entryFee / LAMPORTS_PER_SOL;
  const prizePoolSol = entryFeeSol * room.playerCount;
  
  return {
    pda: pda.toBase58(),
    roomId: room.roomId,
    creator: room.creator.toBase58(),
    gameType: room.gameType,
    gameTypeName: GAME_TYPE_NAMES[room.gameType] || "Unknown",
    entryFeeSol,
    maxPlayers: room.maxPlayers,
    turnTimeSec: room.turnTimeSec,
    isPrivate: room.isPrivate, // Always false since not on-chain
    status: room.status,
    statusName: STATUS_NAMES[room.status] || "Unknown",
    players: room.players.map(p => p.toBase58()),
    playerCount: room.playerCount,
    winner: room.winner?.toBase58() || null,
    createdAt: new Date(room.createdAt * 1000),
    prizePoolSol,
  };
}

// ============================================
// INSTRUCTION BUILDERS (for VersionedTransaction)
// ============================================

/**
 * Build createRoom instruction (for VersionedTransaction - MWA compatible)
 */
export function buildCreateRoomIx(
  creator: PublicKey,
  roomId: number,
  gameType: GameType,
  entryFeeSol: number,
  maxPlayers: number
): TransactionInstruction {
  const [roomPda] = getRoomPDA(creator, roomId);
  const [vaultPda] = getVaultPDA(roomPda);
  
  const stakeLamports = BigInt(Math.floor(entryFeeSol * LAMPORTS_PER_SOL));
  
  // Anchor discriminator for "create_room" instruction from IDL
  const discriminator = Buffer.from([130, 166, 32, 2, 247, 120, 178, 53]);
  
  // Args: room_id (u64), game_type (u8), max_players (u8), stake_lamports (u64)
  const data = Buffer.alloc(8 + 8 + 1 + 1 + 8);
  let offset = 0;
  
  // Discriminator
  discriminator.copy(data, offset);
  offset += 8;
  
  // room_id: u64
  data.writeBigUInt64LE(BigInt(roomId), offset);
  offset += 8;
  
  // game_type: u8
  data.writeUInt8(gameType, offset);
  offset += 1;
  
  // max_players: u8
  data.writeUInt8(maxPlayers, offset);
  offset += 1;
  
  // stake_lamports: u64
  data.writeBigUInt64LE(stakeLamports, offset);
  
  return new TransactionInstruction({
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: roomPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
}

/**
 * Build joinRoom instruction (for VersionedTransaction - MWA compatible)
 */
export function buildJoinRoomIx(
  player: PublicKey,
  roomCreator: PublicKey,
  roomId: number
): TransactionInstruction {
  const [roomPda] = getRoomPDA(roomCreator, roomId);
  const [vaultPda] = getVaultPDA(roomPda);
  
  // Anchor discriminator for "join_room" instruction from IDL (no args)
  const discriminator = Buffer.from([95, 232, 188, 81, 124, 130, 78, 139]);
  
  // No args for join_room, just the discriminator
  const data = Buffer.from(discriminator);
  
  return new TransactionInstruction({
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: roomPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
}

/**
 * Build cancelRoom instruction (for VersionedTransaction - MWA compatible)
 */
export function buildCancelRoomIx(
  creator: PublicKey,
  roomId: number
): TransactionInstruction {
  const [roomPda] = getRoomPDA(creator, roomId);
  const [vaultPda] = getVaultPDA(roomPda);
  
  // Anchor discriminator for "cancel_room" - placeholder, update when deployed
  const discriminator = Buffer.from([0x4d, 0x6c, 0x4c, 0x6c, 0x4c, 0x6c, 0x4c, 0x6c]);
  const data = Buffer.from(discriminator);
  
  return new TransactionInstruction({
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: roomPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
}

/**
 * Build pingRoom instruction (for VersionedTransaction - MWA compatible)
 */
export function buildPingRoomIx(
  creator: PublicKey,
  roomId: number
): TransactionInstruction {
  const [roomPda] = getRoomPDA(creator, roomId);
  
  // Anchor discriminator for "ping_room" - placeholder, update when deployed
  const discriminator = Buffer.from([0x8d, 0xac, 0x8c, 0xac, 0x8c, 0xac, 0x8c, 0xac]);
  const data = Buffer.from(discriminator);
  
  return new TransactionInstruction({
    keys: [
      { pubkey: creator, isSigner: true, isWritable: false },
      { pubkey: roomPda, isSigner: false, isWritable: true },
    ],
    programId: PROGRAM_ID,
    data,
  });
}

// ============================================
// LEGACY TRANSACTION BUILDERS (for desktop fallback)
// ============================================

/**
 * Build createRoom transaction (legacy format)
 */
export async function buildCreateRoomTx(
  creator: PublicKey,
  roomId: number,
  gameType: GameType,
  entryFeeSol: number,
  maxPlayers: number
): Promise<Transaction> {
  const instruction = buildCreateRoomIx(creator, roomId, gameType, entryFeeSol, maxPlayers);
  const tx = new Transaction().add(instruction);
  return tx;
}

/**
 * Build joinRoom transaction (legacy format)
 */
export async function buildJoinRoomTx(
  player: PublicKey,
  roomCreator: PublicKey,
  roomId: number
): Promise<Transaction> {
  const instruction = buildJoinRoomIx(player, roomCreator, roomId);
  const tx = new Transaction().add(instruction);
  return tx;
}

/**
 * Build submitResult transaction (verifier-signed)
 * @param verifier - Verifier public key (must sign)
 * @param roomCreator - Room creator's public key (for PDA)
 * @param roomId - Room ID
 * @param winner - Winner's public key
 * @param feeRecipient - Fee recipient public key
 */
export async function buildSettleTx(
  verifier: PublicKey,
  roomCreator: PublicKey,
  roomId: number,
  winner: PublicKey,
  feeRecipient: PublicKey
): Promise<Transaction> {
  const [roomPda] = getRoomPDA(roomCreator, roomId);
  const [vaultPda] = getVaultPDA(roomPda);
  const [configPda] = getConfigPDA();
  
  // Anchor discriminator for "submit_result" instruction from IDL
  const discriminator = Buffer.from([240, 42, 89, 180, 10, 239, 9, 214]);
  
  // Args: winner (pubkey)
  const data = Buffer.alloc(8 + 32);
  discriminator.copy(data, 0);
  winner.toBuffer().copy(data, 8);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: verifier, isSigner: true, isWritable: false },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: roomPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: winner, isSigner: false, isWritable: true },
      { pubkey: feeRecipient, isSigner: false, isWritable: true },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  const tx = new Transaction().add(instruction);
  return tx;
}

/**
 * Build cancelRoom transaction (creator only)
 * Note: cancel_room instruction is not in the current IDL
 * This is a placeholder - implement when instruction is added to program
 * @param creator - Room creator's public key
 * @param roomId - Room ID to cancel
 */
export async function buildCancelRoomTx(
  creator: PublicKey,
  roomId: number
): Promise<Transaction> {
  const [roomPda] = getRoomPDA(creator, roomId);
  const [vaultPda] = getVaultPDA(roomPda);
  
  // Note: cancel_room is not in the current IDL
  // Using a placeholder discriminator - update when instruction is deployed
  const discriminator = Buffer.from([0x4d, 0x6c, 0x4c, 0x6c, 0x4c, 0x6c, 0x4c, 0x6c]);
  
  const data = Buffer.alloc(8);
  discriminator.copy(data, 0);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: roomPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  const tx = new Transaction().add(instruction);
  return tx;
}

/**
 * Build pingRoom transaction (creator presence heartbeat)
 * Note: ping_room instruction is not in the current IDL
 * This is a placeholder - implement when instruction is added to program
 * @param creator - Room creator's public key
 * @param roomId - Room ID to ping
 */
export async function buildPingRoomTx(
  creator: PublicKey,
  roomId: number
): Promise<Transaction> {
  const [roomPda] = getRoomPDA(creator, roomId);
  
  // Note: ping_room is not in the current IDL
  // Using a placeholder discriminator - update when instruction is deployed
  const discriminator = Buffer.from([0x8d, 0xac, 0x8c, 0xac, 0x8c, 0xac, 0x8c, 0xac]);
  
  const data = Buffer.alloc(8);
  discriminator.copy(data, 0);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: creator, isSigner: true, isWritable: false },
      { pubkey: roomPda, isSigner: false, isWritable: true },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  const tx = new Transaction().add(instruction);
  return tx;
}

/**
 * Build cancelRoomIfAbandoned transaction (anyone can call if creator timed out)
 * Note: cancel_room_if_abandoned instruction is not in the current IDL
 * This is a placeholder - implement when instruction is added to program
 * @param caller - Anyone's public key
 * @param roomCreator - Room creator's public key (for PDA)
 * @param roomId - Room ID to cancel
 * @param players - Array of player pubkeys to refund
 */
export async function buildCancelAbandonedRoomTx(
  caller: PublicKey,
  roomCreator: PublicKey,
  roomId: number,
  players: PublicKey[]
): Promise<Transaction> {
  const [roomPda] = getRoomPDA(roomCreator, roomId);
  const [vaultPda] = getVaultPDA(roomPda);
  
  // Note: cancel_room_if_abandoned is not in the current IDL
  // Using a placeholder discriminator - update when instruction is deployed
  const discriminator = Buffer.from([0x9d, 0xbc, 0x9c, 0xbc, 0x9c, 0xbc, 0x9c, 0xbc]);
  
  const data = Buffer.alloc(8);
  discriminator.copy(data, 0);
  
  // Build account keys: caller, room, vault, system_program, then all players for refunds
  const keys = [
    { pubkey: caller, isSigner: true, isWritable: true },
    { pubkey: roomPda, isSigner: false, isWritable: true },
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  
  // Add player accounts for refunds
  for (const player of players) {
    keys.push({ pubkey: player, isSigner: false, isWritable: true });
  }
  
  const instruction = new TransactionInstruction({
    keys,
    programId: PROGRAM_ID,
    data,
  });
  
  const tx = new Transaction().add(instruction);
  return tx;
}

// ============================================
// ROOM FETCHING
// ============================================

/**
 * Fetch all rooms from the program
 */
export async function fetchAllRooms(connection: Connection): Promise<RoomDisplay[]> {
  // Room account discriminator from IDL: [156, 199, 67, 27, 222, 23, 185, 94]
  const discriminator = Buffer.from([156, 199, 67, 27, 222, 23, 185, 94]);
  
  console.log("[fetchAllRooms] Starting fetch:", {
    rpc: connection.rpcEndpoint,
    programId: PROGRAM_ID.toBase58(),
    discriminator: bs58.encode(discriminator),
  });
  
  // Let errors propagate to caller - don't swallow them
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(discriminator),
        },
      },
    ],
  });
  
  console.log(`[fetchAllRooms] getProgramAccounts returned ${accounts.length} account(s)`);
  
  const rooms: RoomDisplay[] = [];
  for (const { pubkey, account } of accounts) {
    const parsed = parseRoomAccount(account.data as Buffer);
    if (parsed) {
      console.log(`[fetchAllRooms] Parsed room #${parsed.roomId}: status=${parsed.status}, players=${parsed.playerCount}/${parsed.maxPlayers}, pda=${pubkey.toBase58()}`);
      rooms.push(roomToDisplay(parsed, pubkey));
    } else {
      console.warn(`[fetchAllRooms] Failed to parse account: ${pubkey.toBase58()}`);
    }
  }
  
  console.log(`[fetchAllRooms] Returning ${rooms.length} valid room(s)`);
  return rooms;
}

/**
 * Fetch rooms created by a specific creator using memcmp filter
 * More efficient than fetching all rooms and filtering in JS
 * 
 * Room account layout:
 * - Offset 0: 8-byte discriminator
 * - Offset 8: 8-byte room_id (u64)
 * - Offset 16: 32-byte creator pubkey
 */
export async function fetchRoomsByCreator(
  connection: Connection,
  creator: PublicKey
): Promise<RoomDisplay[]> {
  try {
    const discriminator = Buffer.from([156, 199, 67, 27, 222, 23, 185, 94]);
    
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        // Filter by discriminator at offset 0
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(discriminator),
          },
        },
        // Filter by creator pubkey at offset 16 (8-byte discriminator + 8-byte room_id)
        {
          memcmp: {
            offset: 16,
            bytes: creator.toBase58(),
          },
        },
      ],
    });
    
    const rooms: RoomDisplay[] = [];
    for (const { pubkey, account } of accounts) {
      const parsed = parseRoomAccount(account.data as Buffer);
      if (parsed) {
        rooms.push(roomToDisplay(parsed, pubkey));
      }
    }
    
    return rooms;
  } catch (err) {
    console.error("Failed to fetch rooms by creator:", err);
    return [];
  }
}

/**
 * Fetch next room ID for a specific creator
 * Finds max roomId among creator's existing rooms and returns max + 1
 * Falls back to timestamp if RPC fails to ensure uniqueness
 */
export async function fetchNextRoomIdForCreator(
  connection: Connection,
  creator: PublicKey
): Promise<number> {
  try {
    const creatorRooms = await fetchRoomsByCreator(connection, creator);
    
    if (creatorRooms.length === 0) {
      return 1; // First room for this creator
    }
    
    // Find max room ID and add 1
    const maxRoomId = Math.max(...creatorRooms.map(r => r.roomId));
    return maxRoomId + 1;
  } catch (err) {
    console.error("Failed to fetch next room ID for creator:", err);
    // Fallback to timestamp-based ID for uniqueness
    return Math.floor(Date.now() / 1000) % 1000000;
  }
}

/**
 * @deprecated Use fetchNextRoomIdForCreator instead
 * Fetch next room ID from global state
 */
export async function fetchNextRoomId(connection: Connection): Promise<number> {
  try {
    const [globalStatePda] = getGlobalStatePDA();
    const accountInfo = await connection.getAccountInfo(globalStatePda);
    
    if (!accountInfo) {
      console.log("Global state not initialized, defaulting to 1");
      return 1;
    }
    
    // Skip 8-byte discriminator, read next_room_id: u64
    const nextRoomId = Number((accountInfo.data as Buffer).readBigUInt64LE(8));
    return nextRoomId;
  } catch (err) {
    console.error("Failed to fetch next room ID:", err);
    return 1;
  }
}

/**
 * Fetch open rooms (status = Created, not full)
 * Note: All rooms are public since there's no is_private field on-chain
 */
export async function fetchOpenPublicRooms(connection: Connection): Promise<RoomDisplay[]> {
  console.log("[fetchOpenPublicRooms] Starting...");
  const allRooms = await fetchAllRooms(connection);
  
  const openRooms = allRooms.filter(room => {
    const isOpen = isOpenStatus(room.status);
    console.log(`[RoomStatus] roomId=${room.roomId}, status=${room.status}, players=${room.playerCount}/${room.maxPlayers}, isOpen=${isOpen}`);
    return isOpen && room.playerCount < room.maxPlayers;
  });
  
  console.log(`[fetchOpenPublicRooms] Filtered to ${openRooms.length} open room(s) from ${allRooms.length} total`);
  return openRooms;
}

/**
 * Fetch a single room by ID and creator
 * Note: This function now requires knowing the creator to derive the PDA
 * For fetching rooms without knowing the creator, use fetchAllRooms and filter
 */
export async function fetchRoomById(connection: Connection, creator: PublicKey, roomId: number): Promise<RoomDisplay | null> {
  try {
    const [roomPda] = getRoomPDA(creator, roomId);
    const accountInfo = await connection.getAccountInfo(roomPda);
    
    if (!accountInfo) return null;
    
    const parsed = parseRoomAccount(accountInfo.data as Buffer);
    if (!parsed) return null;
    
    return roomToDisplay(parsed, roomPda);
  } catch (err) {
    console.error("Failed to fetch room:", err);
    return null;
  }
}

// ============================================
// CONNECTION HELPER
// ============================================

export function getConnection(): Connection {
  return new Connection(getSolanaEndpoint(), "confirmed");
}
