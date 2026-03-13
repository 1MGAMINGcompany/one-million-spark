use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

// ============================================================
// CONSTANTS
// ============================================================

const MAX_PLAYERS: usize = 4;
const DEFAULT_FEE_BPS: u16 = 500; // 5%

// Prediction event status codes
const PRED_STATUS_OPEN: u8 = 0;
const PRED_STATUS_LOCKED: u8 = 1;
const PRED_STATUS_LIVE: u8 = 2;
const PRED_STATUS_RESOLVED: u8 = 3;
const PRED_STATUS_SETTLED: u8 = 4;
const PRED_STATUS_DRAW: u8 = 5;

// Prediction side codes
const SIDE_A: u8 = 0;
const SIDE_B: u8 = 1;

#[program]
pub mod one_million_gaming {
    use super::*;

    // ========================================================
    // EXISTING GAME INSTRUCTIONS — UNCHANGED
    // ========================================================

    /// Initialize the global config PDA.
    /// Can only be called once (PDA init).
    pub fn init_config(
        ctx: Context<InitConfig>,
        fee_recipient: Pubkey,
        verifier: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.fee_recipient = fee_recipient;
        config.fee_bps = DEFAULT_FEE_BPS;
        config.verifier = verifier;
        Ok(())
    }

    /// Create a new game room.
    pub fn create_room(
        ctx: Context<CreateRoom>,
        room_id: u64,
        game_type: u8,
        max_players: u8,
        stake_lamports: u64,
    ) -> Result<()> {
        require!(
            max_players >= 2 && max_players <= 4,
            GameError::BadMaxPlayers
        );
        require!(stake_lamports > 0, GameError::BadStake);

        let room = &mut ctx.accounts.room;
        room.room_id = room_id;
        room.creator = ctx.accounts.creator.key();
        room.game_type = game_type;
        room.max_players = max_players;
        room.player_count = 1;
        room.status = 1; // Open
        room.stake_lamports = stake_lamports;
        room.winner = Pubkey::default();
        room.players = [Pubkey::default(); MAX_PLAYERS];
        room.players[0] = ctx.accounts.creator.key();

        // Transfer stake to vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            stake_lamports,
        )?;

        Ok(())
    }

    /// Join an existing game room.
    pub fn join_room(ctx: Context<JoinRoom>) -> Result<()> {
        let room = &mut ctx.accounts.room;
        require!(room.status == 1, GameError::RoomNotOpen);
        require!(
            room.player_count < room.max_players,
            GameError::RoomFull
        );

        let player_key = ctx.accounts.player.key();
        for i in 0..room.player_count as usize {
            require!(room.players[i] != player_key, GameError::AlreadyJoined);
        }

        room.players[room.player_count as usize] = player_key;
        room.player_count += 1;

        // Transfer stake to vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            room.stake_lamports,
        )?;

        // Auto-start when full
        if room.player_count == room.max_players {
            room.status = 2; // Started
        }

        Ok(())
    }

    /// Cancel rules:
    /// - Only creator can cancel
    /// - Only when OPEN
    /// - Only when player_count == 1
    /// - Refund stake by closing vault to creator (returns ALL lamports in vault)
    /// - Close room + vault (removes from lists and returns rent)
    pub fn cancel_room(ctx: Context<CancelRoom>) -> Result<()> {
        let room = &ctx.accounts.room;
        require!(room.status == 1, GameError::RoomNotOpen);
        require!(room.player_count == 1, GameError::CannotCancelAfterJoin);

        // Vault lamports are returned via close = creator in the account constraint
        Ok(())
    }

    /// Trusted verifier settles the game and pays out immediately
    pub fn submit_result(ctx: Context<SubmitResult>, winner: Pubkey) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let config = &ctx.accounts.config;

        // Verify the signer is the authorized verifier
        require!(
            ctx.accounts.verifier.key() == config.verifier,
            GameError::UnauthorizedVerifier
        );

        // Must be Started (status == 2)
        require!(room.status == 2, GameError::GameNotStarted);

        // Verify winner is one of the players
        let mut valid_winner = false;
        for i in 0..room.player_count as usize {
            if room.players[i] == winner {
                valid_winner = true;
                break;
            }
        }
        require!(valid_winner, GameError::BadWinner);

        // Verify winner account matches
        require!(
            ctx.accounts.winner.key() == winner,
            GameError::WinnerAccountMismatch
        );

        // Verify fee recipient
        require!(
            ctx.accounts.fee_recipient.key() == config.fee_recipient,
            GameError::BadFeeRecipient
        );

        // Calculate payouts
        let total_pot = room
            .stake_lamports
            .checked_mul(room.player_count as u64)
            .ok_or(GameError::MathOverflow)?;

        let fee_amount = total_pot
            .checked_mul(config.fee_bps as u64)
            .ok_or(GameError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(GameError::MathOverflow)?;

        let winner_payout = total_pot
            .checked_sub(fee_amount)
            .ok_or(GameError::MathOverflow)?;

        // Check vault balance
        let vault_balance = ctx.accounts.vault.to_account_info().lamports();
        require!(
            vault_balance >= total_pot,
            GameError::InsufficientVault
        );

        // Transfer from vault (PDA signer)
        let room_key = room.key();
        let vault_seeds = &[b"vault" as &[u8], room_key.as_ref()];
        let (_, vault_bump) = Pubkey::find_program_address(vault_seeds, ctx.program_id);
        let signer_seeds = &[b"vault" as &[u8], room_key.as_ref(), &[vault_bump]];

        // Pay winner
        let vault_info = ctx.accounts.vault.to_account_info();
        **vault_info.try_borrow_mut_lamports()? -= winner_payout;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += winner_payout;

        // Pay fee
        if fee_amount > 0 {
            **vault_info.try_borrow_mut_lamports()? -= fee_amount;
            **ctx
                .accounts
                .fee_recipient
                .to_account_info()
                .try_borrow_mut_lamports()? += fee_amount;
        }

        // Mark room finished
        room.status = 3; // Finished
        room.winner = winner;

        Ok(())
    }

    /// Close a finished room (reclaim rent to creator).
    pub fn close_room(ctx: Context<CloseRoom>) -> Result<()> {
        // Room must be Finished (status == 3) — enforced by constraint
        Ok(())
    }

    /// Admin-only instruction to close orphan vault PDAs where the room account no longer exists.
    /// This refunds the vault's lamports to the original room creator.
    /// Only config.authority or config.verifier can call this instruction.
    /// The caller must derive the correct vault PDA from (creator, room_id) and pass it.
    pub fn sweep_orphan_vault(ctx: Context<SweepOrphanVault>, room_id: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer_key = ctx.accounts.signer.key();

        require!(
            signer_key == config.authority || signer_key == config.verifier,
            GameError::UnauthorizedSweeper
        );

        // Derive expected vault PDA to validate
        let room_id_bytes = room_id.to_le_bytes();
        let creator_key = ctx.accounts.creator.key();
        let room_seeds = &[b"room" as &[u8], creator_key.as_ref(), room_id_bytes.as_ref()];
        let (room_pda, _) = Pubkey::find_program_address(room_seeds, ctx.program_id);

        let vault_seeds = &[b"vault" as &[u8], room_pda.as_ref()];
        let (expected_vault, _) = Pubkey::find_program_address(vault_seeds, ctx.program_id);

        require!(
            ctx.accounts.vault.key() == expected_vault,
            GameError::InvalidVaultPda
        );

        // Transfer all vault lamports to creator
        let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
        **ctx
            .accounts
            .vault
            .to_account_info()
            .try_borrow_mut_lamports()? -= vault_lamports;
        **ctx
            .accounts
            .creator
            .to_account_info()
            .try_borrow_mut_lamports()? += vault_lamports;

        Ok(())
    }

    // ========================================================
    // NEW: CONFIG UPDATE INSTRUCTIONS
    // ========================================================

    /// Update the fee recipient. Only config.authority can call.
    pub fn set_fee_recipient(ctx: Context<UpdateConfig>, new_fee_recipient: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(
            ctx.accounts.authority.key() == config.authority,
            GameError::UnauthorizedAuthority
        );
        config.fee_recipient = new_fee_recipient;
        Ok(())
    }

    /// Update the verifier. Only config.authority can call.
    pub fn set_verifier(ctx: Context<UpdateConfig>, new_verifier: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(
            ctx.accounts.authority.key() == config.authority,
            GameError::UnauthorizedAuthority
        );
        config.verifier = new_verifier;
        Ok(())
    }

    /// Transfer config authority to a new wallet. Only current authority can call.
    pub fn set_authority(ctx: Context<UpdateConfig>, new_authority: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(
            ctx.accounts.authority.key() == config.authority,
            GameError::UnauthorizedAuthority
        );
        config.authority = new_authority;
        Ok(())
    }

    // ========================================================
    // NEW: PREDICTION SYSTEM
    // ========================================================

    /// Create a new prediction event. Only config.authority or config.verifier can call.
    pub fn create_prediction_event(
        ctx: Context<CreatePredictionEvent>,
        event_id: u64,
        fighter_a: Pubkey,
        fighter_b: Pubkey,
        auto_resolve: bool,
        manual_only: bool,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer_key = ctx.accounts.creator.key();
        require!(
            signer_key == config.authority || signer_key == config.verifier,
            GameError::UnauthorizedPredictionAdmin
        );

        let event = &mut ctx.accounts.prediction_event;
        event.event_id = event_id;
        event.creator = signer_key;
        event.status = PRED_STATUS_OPEN;
        event.fighter_a = fighter_a;
        event.fighter_b = fighter_b;
        event.winner = Pubkey::default();
        event.total_pool = 0;
        event.pool_a = 0;
        event.pool_b = 0;
        event.auto_resolve = auto_resolve;
        event.manual_only = manual_only;
        event.bump = ctx.bumps.prediction_event;

        Ok(())
    }

    /// Lock predictions — no more entries allowed. Authority or verifier.
    pub fn lock_prediction_event(ctx: Context<ManagePredictionEvent>) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer_key = ctx.accounts.signer.key();
        require!(
            signer_key == config.authority || signer_key == config.verifier,
            GameError::UnauthorizedPredictionAdmin
        );

        let event = &mut ctx.accounts.prediction_event;
        require!(
            event.status == PRED_STATUS_OPEN,
            GameError::PredictionInvalidTransition
        );
        event.status = PRED_STATUS_LOCKED;
        Ok(())
    }

    /// Mark event as live. Authority or verifier.
    pub fn mark_event_live(ctx: Context<ManagePredictionEvent>) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer_key = ctx.accounts.signer.key();
        require!(
            signer_key == config.authority || signer_key == config.verifier,
            GameError::UnauthorizedPredictionAdmin
        );

        let event = &mut ctx.accounts.prediction_event;
        require!(
            event.status == PRED_STATUS_LOCKED,
            GameError::PredictionInvalidTransition
        );
        event.status = PRED_STATUS_LIVE;
        Ok(())
    }

    /// Submit a prediction (place an entry). Only when event is Open.
    pub fn submit_prediction(
        ctx: Context<SubmitPrediction>,
        side: u8,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, GameError::BadStake);
        require!(
            side == SIDE_A || side == SIDE_B,
            GameError::PredictionInvalidSide
        );

        let event = &mut ctx.accounts.prediction_event;
        require!(
            event.status == PRED_STATUS_OPEN,
            GameError::PredictionNotOpen
        );

        // Transfer SOL to prediction pool vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.prediction_pool.to_account_info(),
                },
            ),
            amount,
        )?;

        // Update pool totals
        event.total_pool = event
            .total_pool
            .checked_add(amount)
            .ok_or(GameError::MathOverflow)?;
        if side == SIDE_A {
            event.pool_a = event
                .pool_a
                .checked_add(amount)
                .ok_or(GameError::MathOverflow)?;
        } else {
            event.pool_b = event
                .pool_b
                .checked_add(amount)
                .ok_or(GameError::MathOverflow)?;
        }

        // Create entry
        let entry = &mut ctx.accounts.prediction_entry;
        entry.user = ctx.accounts.user.key();
        entry.event_id = event.event_id;
        entry.side = side;
        entry.amount = amount;
        entry.claimed = false;
        entry.bump = ctx.bumps.prediction_entry;

        Ok(())
    }

    /// Declare the winner. Only verifier or authority. Event must be Live.
    pub fn declare_winner(
        ctx: Context<ManagePredictionEvent>,
        winner: Pubkey,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer_key = ctx.accounts.signer.key();
        require!(
            signer_key == config.authority || signer_key == config.verifier,
            GameError::UnauthorizedPredictionAdmin
        );

        let event = &mut ctx.accounts.prediction_event;
        require!(
            event.status == PRED_STATUS_LIVE,
            GameError::PredictionInvalidTransition
        );
        require!(
            winner == event.fighter_a || winner == event.fighter_b,
            GameError::PredictionInvalidWinner
        );

        event.winner = winner;
        event.status = PRED_STATUS_RESOLVED;
        Ok(())
    }

    /// Declare a draw. Only verifier or authority. Event must be Live.
    pub fn declare_draw(ctx: Context<ManagePredictionEvent>) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer_key = ctx.accounts.signer.key();
        require!(
            signer_key == config.authority || signer_key == config.verifier,
            GameError::UnauthorizedPredictionAdmin
        );

        let event = &mut ctx.accounts.prediction_event;
        require!(
            event.status == PRED_STATUS_LIVE,
            GameError::PredictionInvalidTransition
        );

        event.status = PRED_STATUS_DRAW;
        event.winner = Pubkey::default();
        Ok(())
    }

    /// Confirm the result (after declare_winner). Moves Resolved → Settled.
    /// Only authority or verifier.
    pub fn confirm_result(ctx: Context<ManagePredictionEvent>) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer_key = ctx.accounts.signer.key();
        require!(
            signer_key == config.authority || signer_key == config.verifier,
            GameError::UnauthorizedPredictionAdmin
        );

        let event = &mut ctx.accounts.prediction_event;
        require!(
            event.status == PRED_STATUS_RESOLVED,
            GameError::PredictionInvalidTransition
        );

        event.status = PRED_STATUS_SETTLED;
        Ok(())
    }

    /// Settle the event (alias for confirm if already resolved). Kept for API parity.
    pub fn settle_event(ctx: Context<ManagePredictionEvent>) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer_key = ctx.accounts.signer.key();
        require!(
            signer_key == config.authority || signer_key == config.verifier,
            GameError::UnauthorizedPredictionAdmin
        );

        let event = &mut ctx.accounts.prediction_event;
        require!(
            event.status == PRED_STATUS_RESOLVED,
            GameError::PredictionInvalidTransition
        );

        event.status = PRED_STATUS_SETTLED;
        Ok(())
    }

    /// Claim prediction reward. User calls this after event is Settled.
    /// Pays (user_amount / winning_pool) * total_pool minus platform fee.
    pub fn claim_prediction_reward(ctx: Context<ClaimPredictionReward>) -> Result<()> {
        let event = &ctx.accounts.prediction_event;
        let entry = &mut ctx.accounts.prediction_entry;
        let config = &ctx.accounts.config;

        // Must be settled
        require!(
            event.status == PRED_STATUS_SETTLED,
            GameError::PredictionNotSettled
        );

        // Must not be claimed already
        require!(!entry.claimed, GameError::PredictionAlreadyClaimed);

        // Must be on the winning side
        let winning_side = if event.winner == event.fighter_a {
            SIDE_A
        } else if event.winner == event.fighter_b {
            SIDE_B
        } else {
            return Err(GameError::PredictionInvalidWinner.into());
        };
        require!(
            entry.side == winning_side,
            GameError::PredictionWrongSide
        );

        // Calculate reward
        let winning_pool = if winning_side == SIDE_A {
            event.pool_a
        } else {
            event.pool_b
        };
        require!(winning_pool > 0, GameError::PredictionEmptyPool);

        // user_reward = (entry.amount * total_pool) / winning_pool
        let gross_reward = (entry.amount as u128)
            .checked_mul(event.total_pool as u128)
            .ok_or(GameError::MathOverflow)?
            .checked_div(winning_pool as u128)
            .ok_or(GameError::MathOverflow)? as u64;

        // Platform fee
        let fee_amount = gross_reward
            .checked_mul(config.fee_bps as u64)
            .ok_or(GameError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(GameError::MathOverflow)?;

        let net_reward = gross_reward
            .checked_sub(fee_amount)
            .ok_or(GameError::MathOverflow)?;

        // Check vault balance
        let vault_balance = ctx.accounts.prediction_pool.to_account_info().lamports();
        require!(
            vault_balance >= gross_reward,
            GameError::InsufficientVault
        );

        // Pay user from pool vault
        let pool_info = ctx.accounts.prediction_pool.to_account_info();
        **pool_info.try_borrow_mut_lamports()? -= net_reward;
        **ctx
            .accounts
            .user
            .to_account_info()
            .try_borrow_mut_lamports()? += net_reward;

        // Pay fee
        if fee_amount > 0 {
            **pool_info.try_borrow_mut_lamports()? -= fee_amount;
            **ctx
                .accounts
                .fee_recipient
                .to_account_info()
                .try_borrow_mut_lamports()? += fee_amount;
        }

        // Mark claimed
        entry.claimed = true;

        Ok(())
    }

    /// Refund a prediction entry when event is a Draw.
    /// Returns the full entry amount to the user (no fee on draws).
    pub fn refund_draw_predictions(ctx: Context<RefundDrawPrediction>) -> Result<()> {
        let event = &ctx.accounts.prediction_event;
        let entry = &mut ctx.accounts.prediction_entry;

        // Must be Draw status
        require!(
            event.status == PRED_STATUS_DRAW,
            GameError::PredictionNotDraw
        );

        // Must not already be claimed/refunded
        require!(!entry.claimed, GameError::PredictionAlreadyClaimed);

        let refund_amount = entry.amount;

        // Check vault balance
        let vault_balance = ctx.accounts.prediction_pool.to_account_info().lamports();
        require!(
            vault_balance >= refund_amount,
            GameError::InsufficientVault
        );

        // Refund from pool vault to user
        let pool_info = ctx.accounts.prediction_pool.to_account_info();
        **pool_info.try_borrow_mut_lamports()? -= refund_amount;
        **ctx
            .accounts
            .user
            .to_account_info()
            .try_borrow_mut_lamports()? += refund_amount;

        // Mark as claimed (refunded)
        entry.claimed = true;

        Ok(())
    }
}

// ============================================================
// ACCOUNTS — EXISTING GAME SYSTEM (UNCHANGED)
// ============================================================

#[account]
pub struct Config {
    pub authority: Pubkey,     // 32
    pub fee_recipient: Pubkey, // 32
    pub fee_bps: u16,          // 2
    pub verifier: Pubkey,      // 32
}

#[account]
pub struct Room {
    pub room_id: u64,                   // 8
    pub creator: Pubkey,                // 32
    pub game_type: u8,                  // 1
    pub max_players: u8,                // 1
    pub player_count: u8,               // 1
    pub status: u8,                     // 1
    pub stake_lamports: u64,            // 8
    pub winner: Pubkey,                 // 32
    pub players: [Pubkey; MAX_PLAYERS], // 128
}

#[account]
pub struct Vault {}

// ============================================================
// ACCOUNTS — PREDICTION SYSTEM (NEW)
// ============================================================

#[account]
pub struct PredictionEvent {
    pub event_id: u64,       // 8
    pub creator: Pubkey,     // 32
    pub status: u8,          // 1
    pub fighter_a: Pubkey,   // 32
    pub fighter_b: Pubkey,   // 32
    pub winner: Pubkey,      // 32
    pub total_pool: u64,     // 8
    pub pool_a: u64,         // 8
    pub pool_b: u64,         // 8
    pub auto_resolve: bool,  // 1
    pub manual_only: bool,   // 1
    pub bump: u8,            // 1
}
// Space: 8 (discriminator) + 8 + 32 + 1 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1 = 172

#[account]
pub struct PredictionPool {}
// Just holds SOL, no data fields

#[account]
pub struct PredictionEntry {
    pub user: Pubkey,     // 32
    pub event_id: u64,    // 8
    pub side: u8,         // 1
    pub amount: u64,      // 8
    pub claimed: bool,    // 1
    pub bump: u8,         // 1
}
// Space: 8 (discriminator) + 32 + 8 + 1 + 8 + 1 + 1 = 59

// ============================================================
// CONTEXT STRUCTS — EXISTING (UNCHANGED)
// ============================================================

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 2 + 32,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct CreateRoom<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + 8 + 32 + 1 + 1 + 1 + 1 + 8 + 32 + (32 * 4),
        seeds = [b"room", creator.key().as_ref(), &room_id.to_le_bytes()],
        bump
    )]
    pub room: Account<'info, Room>,
    #[account(
        init,
        payer = creator,
        space = 8,
        seeds = [b"vault", room.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinRoom<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [b"room", room.creator.as_ref(), &room.room_id.to_le_bytes()],
        bump
    )]
    pub room: Account<'info, Room>,
    #[account(
        mut,
        seeds = [b"vault", room.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelRoom<'info> {
    #[account(
        mut,
        constraint = room.creator == creator.key() @ GameError::OnlyCreator
    )]
    pub creator: Signer<'info>,
    #[account(
        mut,
        close = creator,
        seeds = [b"room", creator.key().as_ref(), &room.room_id.to_le_bytes()],
        bump
    )]
    pub room: Account<'info, Room>,
    #[account(
        mut,
        close = creator,
        seeds = [b"vault", room.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitResult<'info> {
    pub verifier: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"room", room.creator.as_ref(), &room.room_id.to_le_bytes()],
        bump
    )]
    pub room: Account<'info, Room>,
    #[account(
        mut,
        seeds = [b"vault", room.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    /// CHECK: winner receives lamports
    #[account(mut)]
    pub winner: AccountInfo<'info>,
    /// CHECK: fee_recipient receives lamports
    #[account(mut)]
    pub fee_recipient: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CloseRoom<'info> {
    #[account(
        mut,
        constraint = room.creator == creator.key() @ GameError::OnlyCreator
    )]
    pub creator: Signer<'info>,
    #[account(
        mut,
        close = creator,
        constraint = room.status == 3 @ GameError::GameNotFinished,
        seeds = [b"room", creator.key().as_ref(), &room.room_id.to_le_bytes()],
        bump
    )]
    pub room: Account<'info, Room>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(room_id: u64)]
pub struct SweepOrphanVault<'info> {
    /// Must be config.authority or config.verifier
    pub signer: Signer<'info>,
    /// Program config PDA
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    /// The original room creator who will receive the vault lamports
    /// CHECK: receives lamports
    #[account(mut)]
    pub creator: AccountInfo<'info>,
    /// The orphan vault to close - must match derived PDA from (creator, room_id)
    /// CHECK: validated in instruction body
    #[account(mut)]
    pub vault: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

// ============================================================
// CONTEXT STRUCTS — CONFIG UPDATES (NEW)
// ============================================================

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}

// ============================================================
// CONTEXT STRUCTS — PREDICTION SYSTEM (NEW)
// ============================================================

#[derive(Accounts)]
#[instruction(event_id: u64)]
pub struct CreatePredictionEvent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = creator,
        space = 8 + 8 + 32 + 1 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1,
        seeds = [b"pred_event", &event_id.to_le_bytes()],
        bump
    )]
    pub prediction_event: Account<'info, PredictionEvent>,
    #[account(
        init,
        payer = creator,
        space = 8,
        seeds = [b"pred_pool", &event_id.to_le_bytes()],
        bump
    )]
    pub prediction_pool: Account<'info, PredictionPool>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManagePredictionEvent<'info> {
    pub signer: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"pred_event", &prediction_event.event_id.to_le_bytes()],
        bump = prediction_event.bump
    )]
    pub prediction_event: Account<'info, PredictionEvent>,
}

#[derive(Accounts)]
#[instruction(side: u8, amount: u64)]
pub struct SubmitPrediction<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pred_event", &prediction_event.event_id.to_le_bytes()],
        bump = prediction_event.bump
    )]
    pub prediction_event: Account<'info, PredictionEvent>,
    #[account(
        mut,
        seeds = [b"pred_pool", &prediction_event.event_id.to_le_bytes()],
        bump
    )]
    pub prediction_pool: Account<'info, PredictionPool>,
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 1 + 8 + 1 + 1,
        seeds = [
            b"pred_entry",
            &prediction_event.event_id.to_le_bytes(),
            user.key().as_ref(),
            &side.to_le_bytes(),
        ],
        bump
    )]
    pub prediction_entry: Account<'info, PredictionEntry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPredictionReward<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        seeds = [b"pred_event", &prediction_event.event_id.to_le_bytes()],
        bump = prediction_event.bump
    )]
    pub prediction_event: Account<'info, PredictionEvent>,
    #[account(
        mut,
        seeds = [b"pred_pool", &prediction_event.event_id.to_le_bytes()],
        bump
    )]
    pub prediction_pool: Account<'info, PredictionPool>,
    #[account(
        mut,
        constraint = prediction_entry.user == user.key() @ GameError::PredictionUnauthorized,
        seeds = [
            b"pred_entry",
            &prediction_event.event_id.to_le_bytes(),
            user.key().as_ref(),
            &prediction_entry.side.to_le_bytes(),
        ],
        bump = prediction_entry.bump
    )]
    pub prediction_entry: Account<'info, PredictionEntry>,
    /// CHECK: fee recipient
    #[account(
        mut,
        constraint = fee_recipient.key() == config.fee_recipient @ GameError::BadFeeRecipient
    )]
    pub fee_recipient: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RefundDrawPrediction<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds = [b"pred_event", &prediction_event.event_id.to_le_bytes()],
        bump = prediction_event.bump
    )]
    pub prediction_event: Account<'info, PredictionEvent>,
    #[account(
        mut,
        seeds = [b"pred_pool", &prediction_event.event_id.to_le_bytes()],
        bump
    )]
    pub prediction_pool: Account<'info, PredictionPool>,
    #[account(
        mut,
        constraint = prediction_entry.user == user.key() @ GameError::PredictionUnauthorized,
        seeds = [
            b"pred_entry",
            &prediction_event.event_id.to_le_bytes(),
            user.key().as_ref(),
            &prediction_entry.side.to_le_bytes(),
        ],
        bump = prediction_entry.bump
    )]
    pub prediction_entry: Account<'info, PredictionEntry>,
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum GameError {
    #[msg("max_players must be 2, 3, or 4")]
    BadMaxPlayers,                  // 6000
    #[msg("stake must be > 0")]
    BadStake,                       // 6001
    #[msg("Room is not open")]
    RoomNotOpen,                    // 6002
    #[msg("Room is already full")]
    RoomFull,                       // 6003
    #[msg("Player already joined")]
    AlreadyJoined,                  // 6004
    #[msg("Game is not started")]
    GameNotStarted,                 // 6005
    #[msg("Room is not full yet")]
    RoomNotFull,                    // 6006
    #[msg("Verifier is not authorized")]
    UnauthorizedVerifier,           // 6007
    #[msg("Winner must be one of the players")]
    BadWinner,                      // 6008
    #[msg("Fee recipient does not match config")]
    BadFeeRecipient,                // 6009
    #[msg("Winner account does not match winner pubkey")]
    WinnerAccountMismatch,          // 6010
    #[msg("Math overflow")]
    MathOverflow,                   // 6011
    #[msg("Vault does not have enough SOL")]
    InsufficientVault,              // 6012
    #[msg("Only the room creator can perform this action")]
    OnlyCreator,                    // 6013
    #[msg("Cannot cancel after another player has joined")]
    CannotCancelAfterJoin,          // 6014
    #[msg("Only config.authority or config.verifier can sweep orphan vaults")]
    UnauthorizedSweeper,            // 6015
    #[msg("Vault PDA does not match expected derivation from (creator, room_id)")]
    InvalidVaultPda,                // 6016

    // ── New errors (6017+)

    #[msg("Game is not finished")]
    GameNotFinished,                // 6017
    #[msg("Only config.authority can call this")]
    UnauthorizedAuthority,          // 6018
    #[msg("Only authority or verifier can manage predictions")]
    UnauthorizedPredictionAdmin,    // 6019
    #[msg("Invalid prediction status transition")]
    PredictionInvalidTransition,    // 6020
    #[msg("Invalid prediction side (must be 0 or 1)")]
    PredictionInvalidSide,          // 6021
    #[msg("Predictions are not open")]
    PredictionNotOpen,              // 6022
    #[msg("Invalid winner for this event")]
    PredictionInvalidWinner,        // 6023
    #[msg("Event is not settled yet")]
    PredictionNotSettled,           // 6024
    #[msg("Prediction already claimed")]
    PredictionAlreadyClaimed,       // 6025
    #[msg("Entry is not on the winning side")]
    PredictionWrongSide,            // 6026
    #[msg("Winning pool is empty")]
    PredictionEmptyPool,            // 6027
    #[msg("Unauthorized prediction action")]
    PredictionUnauthorized,         // 6028
    #[msg("Event is not a draw")]
    PredictionNotDraw,              // 6029
}
