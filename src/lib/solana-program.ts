import { 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  Connection
} from "@solana/web3.js";
import { getSolanaEndpoint } from "./solana-config";

// ============================================
// CONFIGURATION - FILL IN AFTER DEPLOYMENT
// ============================================

// TODO: Replace with deployed program ID
export const PROGRAM_ID = new PublicKey("11111111111111111111111111111111"); // Placeholder

// Result Authority - signs winner settlement transactions
export const RESULT_AUTHORITY = new PublicKey("11111111111111111111111111111111"); // TODO: Set after deployment

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
  entryFee: number; // in lamports
  maxPlayers: number;
  turnTimeSec: number;
  isPrivate: boolean;
  status: RoomStatus;
  players: PublicKey[];
  winner: PublicKey | null;
  createdAt: number;
  bump: number;
}

export interface RoomDisplay {
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

export function getRoomPDA(roomId: number): [PublicKey, number] {
  const roomIdBuffer = Buffer.alloc(8);
  roomIdBuffer.writeBigUInt64LE(BigInt(roomId));
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from("room"), roomIdBuffer],
    PROGRAM_ID
  );
}

export function getVaultPDA(roomId: number): [PublicKey, number] {
  const roomIdBuffer = Buffer.alloc(8);
  roomIdBuffer.writeBigUInt64LE(BigInt(roomId));
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), roomIdBuffer],
    PROGRAM_ID
  );
}

export function getGlobalStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    PROGRAM_ID
  );
}

// ============================================
// ACCOUNT PARSING
// ============================================

const GAME_TYPE_NAMES: Record<number, string> = {
  1: "Chess",
  2: "Dominos",
  3: "Backgammon",
  4: "Checkers",
  5: "Ludo",
};

const STATUS_NAMES: Record<number, string> = {
  0: "Open",
  1: "In Progress",
  2: "Completed",
  3: "Cancelled",
};

export function parseRoomAccount(data: Buffer): RoomAccount | null {
  try {
    // Skip 8-byte discriminator
    let offset = 8;
    
    // room_id: u64
    const roomId = Number(data.readBigUInt64LE(offset));
    offset += 8;
    
    // creator: Pubkey (32 bytes)
    const creator = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    
    // game_type: u8
    const gameType = data.readUInt8(offset) as GameType;
    offset += 1;
    
    // entry_fee: u64
    const entryFee = Number(data.readBigUInt64LE(offset));
    offset += 8;
    
    // max_players: u8
    const maxPlayers = data.readUInt8(offset);
    offset += 1;
    
    // turn_time_sec: u16
    const turnTimeSec = data.readUInt16LE(offset);
    offset += 2;
    
    // is_private: bool
    const isPrivate = data.readUInt8(offset) === 1;
    offset += 1;
    
    // status: u8
    const status = data.readUInt8(offset) as RoomStatus;
    offset += 1;
    
    // players: Vec<Pubkey> - length prefix (4 bytes) + pubkeys
    const playersLen = data.readUInt32LE(offset);
    offset += 4;
    const players: PublicKey[] = [];
    for (let i = 0; i < playersLen; i++) {
      players.push(new PublicKey(data.subarray(offset, offset + 32)));
      offset += 32;
    }
    
    // winner: Option<Pubkey> - 1 byte discriminant + 32 bytes if Some
    const hasWinner = data.readUInt8(offset) === 1;
    offset += 1;
    const winner = hasWinner ? new PublicKey(data.subarray(offset, offset + 32)) : null;
    if (hasWinner) offset += 32;
    
    // created_at: i64
    const createdAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    
    // bump: u8
    const bump = data.readUInt8(offset);
    
    return {
      roomId,
      creator,
      gameType,
      entryFee,
      maxPlayers,
      turnTimeSec,
      isPrivate,
      status,
      players,
      winner,
      createdAt,
      bump,
    };
  } catch (err) {
    console.error("Failed to parse room account:", err);
    return null;
  }
}

export function roomToDisplay(room: RoomAccount): RoomDisplay {
  const entryFeeSol = room.entryFee / LAMPORTS_PER_SOL;
  const prizePoolSol = entryFeeSol * room.players.length;
  
  return {
    roomId: room.roomId,
    creator: room.creator.toBase58(),
    gameType: room.gameType,
    gameTypeName: GAME_TYPE_NAMES[room.gameType] || "Unknown",
    entryFeeSol,
    maxPlayers: room.maxPlayers,
    turnTimeSec: room.turnTimeSec,
    isPrivate: room.isPrivate,
    status: room.status,
    statusName: STATUS_NAMES[room.status] || "Unknown",
    players: room.players.map(p => p.toBase58()),
    playerCount: room.players.length,
    winner: room.winner?.toBase58() || null,
    createdAt: new Date(room.createdAt * 1000),
    prizePoolSol,
  };
}

// ============================================
// TRANSACTION BUILDERS
// ============================================

/**
 * Build createRoom transaction
 * @param creator - Room creator's public key
 * @param roomId - Unique room ID (fetch from global state or generate)
 * @param gameType - Game type enum value
 * @param entryFeeSol - Entry fee in SOL
 * @param maxPlayers - Maximum players (2-4)
 * @param turnTimeSec - Turn time in seconds (0 = unlimited)
 * @param isPrivate - Whether room is private
 */
export async function buildCreateRoomTx(
  creator: PublicKey,
  roomId: number,
  gameType: GameType,
  entryFeeSol: number,
  maxPlayers: number,
  turnTimeSec: number,
  isPrivate: boolean
): Promise<Transaction> {
  const [roomPda] = getRoomPDA(roomId);
  const [vaultPda] = getVaultPDA(roomId);
  const [globalStatePda] = getGlobalStatePDA();
  
  const entryFeeLamports = BigInt(Math.floor(entryFeeSol * LAMPORTS_PER_SOL));
  
  // Anchor discriminator for "create_room" instruction
  // This is sha256("global:create_room")[0..8]
  const discriminator = Buffer.from([0x5d, 0x7c, 0x5c, 0x7c, 0x5c, 0x7c, 0x5c, 0x7c]); // Placeholder
  
  const data = Buffer.alloc(8 + 8 + 1 + 8 + 1 + 2 + 1);
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
  
  // entry_fee: u64
  data.writeBigUInt64LE(entryFeeLamports, offset);
  offset += 8;
  
  // max_players: u8
  data.writeUInt8(maxPlayers, offset);
  offset += 1;
  
  // turn_time_sec: u16
  data.writeUInt16LE(turnTimeSec, offset);
  offset += 2;
  
  // is_private: bool
  data.writeUInt8(isPrivate ? 1 : 0, offset);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: roomPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: globalStatePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  const tx = new Transaction().add(instruction);
  return tx;
}

/**
 * Build joinRoom transaction
 * @param player - Player's public key
 * @param roomId - Room ID to join
 */
export async function buildJoinRoomTx(
  player: PublicKey,
  roomId: number
): Promise<Transaction> {
  const [roomPda] = getRoomPDA(roomId);
  const [vaultPda] = getVaultPDA(roomId);
  
  // Anchor discriminator for "join_room" instruction
  const discriminator = Buffer.from([0x6d, 0x8c, 0x6c, 0x8c, 0x6c, 0x8c, 0x6c, 0x8c]); // Placeholder
  
  const data = Buffer.alloc(8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(BigInt(roomId), 8);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
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
 * Build submitResultAndSettle transaction (authority-signed)
 * @param authority - Result authority public key (must sign)
 * @param roomId - Room ID
 * @param winner - Winner's public key
 */
export async function buildSettleTx(
  authority: PublicKey,
  roomId: number,
  winner: PublicKey
): Promise<Transaction> {
  const [roomPda] = getRoomPDA(roomId);
  const [vaultPda] = getVaultPDA(roomId);
  
  // Anchor discriminator for "submit_result_and_settle" instruction
  const discriminator = Buffer.from([0x7d, 0x9c, 0x7c, 0x9c, 0x7c, 0x9c, 0x7c, 0x9c]); // Placeholder
  
  const data = Buffer.alloc(8 + 8 + 32);
  let offset = 0;
  
  discriminator.copy(data, offset);
  offset += 8;
  
  data.writeBigUInt64LE(BigInt(roomId), offset);
  offset += 8;
  
  winner.toBuffer().copy(data, offset);
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: roomPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: winner, isSigner: false, isWritable: true },
      { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  const tx = new Transaction().add(instruction);
  return tx;
}

/**
 * Build cancelRoom transaction
 * @param creator - Room creator's public key
 * @param roomId - Room ID to cancel
 */
export async function buildCancelRoomTx(
  creator: PublicKey,
  roomId: number
): Promise<Transaction> {
  const [roomPda] = getRoomPDA(roomId);
  const [vaultPda] = getVaultPDA(roomId);
  
  // Anchor discriminator for "cancel_room" instruction
  const discriminator = Buffer.from([0x4d, 0x6c, 0x4c, 0x6c, 0x4c, 0x6c, 0x4c, 0x6c]); // Placeholder
  
  const data = Buffer.alloc(8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(BigInt(roomId), 8);
  
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

// ============================================
// ROOM FETCHING
// ============================================

/**
 * Fetch all rooms from the program
 */
export async function fetchAllRooms(connection: Connection): Promise<RoomDisplay[]> {
  try {
    // Room account discriminator (first 8 bytes of sha256("account:Room"))
    const discriminator = Buffer.from([0x52, 0x6f, 0x6f, 0x6d, 0x41, 0x63, 0x63, 0x74]); // Placeholder
    
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: discriminator.toString("base64"),
          },
        },
      ],
    });
    
    const rooms: RoomDisplay[] = [];
    for (const { account } of accounts) {
      const parsed = parseRoomAccount(account.data as Buffer);
      if (parsed) {
        rooms.push(roomToDisplay(parsed));
      }
    }
    
    return rooms;
  } catch (err) {
    console.error("Failed to fetch rooms:", err);
    return [];
  }
}

/**
 * Fetch public, open rooms only
 */
export async function fetchOpenPublicRooms(connection: Connection): Promise<RoomDisplay[]> {
  const allRooms = await fetchAllRooms(connection);
  return allRooms.filter(
    room => !room.isPrivate && 
            room.status === RoomStatus.Created && 
            room.playerCount < room.maxPlayers
  );
}

/**
 * Fetch a single room by ID
 */
export async function fetchRoomById(connection: Connection, roomId: number): Promise<RoomDisplay | null> {
  try {
    const [roomPda] = getRoomPDA(roomId);
    const accountInfo = await connection.getAccountInfo(roomPda);
    
    if (!accountInfo) return null;
    
    const parsed = parseRoomAccount(accountInfo.data as Buffer);
    if (!parsed) return null;
    
    return roomToDisplay(parsed);
  } catch (err) {
    console.error("Failed to fetch room:", err);
    return null;
  }
}

/**
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

// ============================================
// CONNECTION HELPER
// ============================================

export function getConnection(): Connection {
  return new Connection(getSolanaEndpoint(), "confirmed");
}
