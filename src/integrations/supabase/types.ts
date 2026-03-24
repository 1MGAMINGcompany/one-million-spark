export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_game_events: {
        Row: {
          created_at: string
          difficulty: string
          duration_seconds: number | null
          event: string
          game: string
          id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          difficulty: string
          duration_seconds?: number | null
          event: string
          game: string
          id?: string
          session_id: string
        }
        Update: {
          created_at?: string
          difficulty?: string
          duration_seconds?: number | null
          event?: string
          game?: string
          id?: string
          session_id?: string
        }
        Relationships: []
      }
      automation_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_type: string
          max_retries: number
          result_payload: Json | null
          retry_count: number
          scheduled_at: string | null
          started_at: string | null
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type: string
          max_retries?: number
          result_payload?: Json | null
          retry_count?: number
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          target_id: string
          target_type?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          max_retries?: number
          result_payload?: Json | null
          retry_count?: number
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_logs: {
        Row: {
          action: string
          admin_wallet: string | null
          confidence: number | null
          created_at: string
          details: Json | null
          event_id: string | null
          fight_id: string | null
          id: string
          job_id: string | null
          source: string | null
        }
        Insert: {
          action: string
          admin_wallet?: string | null
          confidence?: number | null
          created_at?: string
          details?: Json | null
          event_id?: string | null
          fight_id?: string | null
          id?: string
          job_id?: string | null
          source?: string | null
        }
        Update: {
          action?: string
          admin_wallet?: string | null
          confidence?: number | null
          created_at?: string
          details?: Json | null
          event_id?: string | null
          fight_id?: string | null
          id?: string
          job_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "automation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_errors: {
        Row: {
          build_version: string | null
          created_at: string | null
          debug_events: Json | null
          error_message: string | null
          error_stack: string | null
          id: string
          route: string | null
          user_agent: string | null
          wallet_address: string | null
          wallet_browser: string | null
        }
        Insert: {
          build_version?: string | null
          created_at?: string | null
          debug_events?: Json | null
          error_message?: string | null
          error_stack?: string | null
          id?: string
          route?: string | null
          user_agent?: string | null
          wallet_address?: string | null
          wallet_browser?: string | null
        }
        Update: {
          build_version?: string | null
          created_at?: string | null
          debug_events?: Json | null
          error_message?: string | null
          error_stack?: string | null
          id?: string
          route?: string | null
          user_agent?: string | null
          wallet_address?: string | null
          wallet_browser?: string | null
        }
        Relationships: []
      }
      finalize_receipts: {
        Row: {
          created_at: string
          finalize_tx: string
          room_pda: string
        }
        Insert: {
          created_at?: string
          finalize_tx: string
          room_pda: string
        }
        Update: {
          created_at?: string
          finalize_tx?: string
          room_pda?: string
        }
        Relationships: []
      }
      game_acceptances: {
        Row: {
          created_at: string
          id: string
          nonce: string
          player_wallet: string
          room_pda: string
          rules_hash: string
          session_expires_at: string
          session_token: string
          signature: string
          timestamp_ms: number
        }
        Insert: {
          created_at?: string
          id?: string
          nonce: string
          player_wallet: string
          room_pda: string
          rules_hash: string
          session_expires_at: string
          session_token: string
          signature: string
          timestamp_ms: number
        }
        Update: {
          created_at?: string
          id?: string
          nonce?: string
          player_wallet?: string
          room_pda?: string
          rules_hash?: string
          session_expires_at?: string
          session_token?: string
          signature?: string
          timestamp_ms?: number
        }
        Relationships: []
      }
      game_invites: {
        Row: {
          created_at: string | null
          expires_at: string | null
          game_name: string | null
          game_type: string
          id: string
          max_players: number | null
          mode: string | null
          recipient_wallet: string
          room_pda: string
          sender_wallet: string
          stake_sol: number | null
          status: string | null
          turn_time_seconds: number | null
          winner_payout: number | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          game_name?: string | null
          game_type: string
          id?: string
          max_players?: number | null
          mode?: string | null
          recipient_wallet: string
          room_pda: string
          sender_wallet: string
          stake_sol?: number | null
          status?: string | null
          turn_time_seconds?: number | null
          winner_payout?: number | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          game_name?: string | null
          game_type?: string
          id?: string
          max_players?: number | null
          mode?: string | null
          recipient_wallet?: string
          room_pda?: string
          sender_wallet?: string
          stake_sol?: number | null
          status?: string | null
          turn_time_seconds?: number | null
          winner_payout?: number | null
        }
        Relationships: []
      }
      game_moves: {
        Row: {
          client_move_id: string | null
          created_at: string
          move_data: Json
          move_hash: string
          prev_hash: string
          room_pda: string
          turn_number: number
          wallet: string
        }
        Insert: {
          client_move_id?: string | null
          created_at?: string
          move_data: Json
          move_hash: string
          prev_hash: string
          room_pda: string
          turn_number: number
          wallet: string
        }
        Update: {
          client_move_id?: string | null
          created_at?: string
          move_data?: Json
          move_hash?: string
          prev_hash?: string
          room_pda?: string
          turn_number?: number
          wallet?: string
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          created_at: string
          current_turn_wallet: string | null
          display_names: Json | null
          eliminated_players: string[] | null
          game_over_at: string | null
          game_state: Json
          game_type: string
          max_players: number
          missed_turns: Json | null
          mode: string
          p1_acceptance_tx: string | null
          p1_ready: boolean
          p2_acceptance_tx: string | null
          p2_ready: boolean
          participants: string[]
          player1_wallet: string
          player2_wallet: string | null
          room_pda: string
          start_roll: Json | null
          start_roll_finalized: boolean | null
          start_roll_seed: string | null
          starting_player_wallet: string | null
          status: string
          status_int: number
          turn_started_at: string | null
          turn_time_seconds: number
          updated_at: string
          waiting_started_at: string | null
          winner_wallet: string | null
        }
        Insert: {
          created_at?: string
          current_turn_wallet?: string | null
          display_names?: Json | null
          eliminated_players?: string[] | null
          game_over_at?: string | null
          game_state?: Json
          game_type: string
          max_players?: number
          missed_turns?: Json | null
          mode?: string
          p1_acceptance_tx?: string | null
          p1_ready?: boolean
          p2_acceptance_tx?: string | null
          p2_ready?: boolean
          participants?: string[]
          player1_wallet: string
          player2_wallet?: string | null
          room_pda: string
          start_roll?: Json | null
          start_roll_finalized?: boolean | null
          start_roll_seed?: string | null
          starting_player_wallet?: string | null
          status?: string
          status_int?: number
          turn_started_at?: string | null
          turn_time_seconds?: number
          updated_at?: string
          waiting_started_at?: string | null
          winner_wallet?: string | null
        }
        Update: {
          created_at?: string
          current_turn_wallet?: string | null
          display_names?: Json | null
          eliminated_players?: string[] | null
          game_over_at?: string | null
          game_state?: Json
          game_type?: string
          max_players?: number
          missed_turns?: Json | null
          mode?: string
          p1_acceptance_tx?: string | null
          p1_ready?: boolean
          p2_acceptance_tx?: string | null
          p2_ready?: boolean
          participants?: string[]
          player1_wallet?: string
          player2_wallet?: string | null
          room_pda?: string
          start_roll?: Json | null
          start_roll_finalized?: boolean | null
          start_roll_seed?: string | null
          starting_player_wallet?: string | null
          status?: string
          status_int?: number
          turn_started_at?: string | null
          turn_time_seconds?: number
          updated_at?: string
          waiting_started_at?: string | null
          winner_wallet?: string | null
        }
        Relationships: []
      }
      h2h: {
        Row: {
          a_wins: number
          b_wins: number
          created_at: string
          current_streak: number
          current_streak_owner: string | null
          game_type: string
          id: string
          last_winner: string | null
          player_a_wallet: string
          player_b_wallet: string
          total_games: number
          updated_at: string
        }
        Insert: {
          a_wins?: number
          b_wins?: number
          created_at?: string
          current_streak?: number
          current_streak_owner?: string | null
          game_type: string
          id?: string
          last_winner?: string | null
          player_a_wallet: string
          player_b_wallet: string
          total_games?: number
          updated_at?: string
        }
        Update: {
          a_wins?: number
          b_wins?: number
          created_at?: string
          current_streak?: number
          current_streak_owner?: string | null
          game_type?: string
          id?: string
          last_winner?: string | null
          player_a_wallet?: string
          player_b_wallet?: string
          total_games?: number
          updated_at?: string
        }
        Relationships: []
      }
      leaderboard_cache: {
        Row: {
          category: string
          losses: number
          net_sol: number
          period: string
          rank: number | null
          total_entries: number
          total_sol_played: number
          total_sol_won: number
          updated_at: string
          wallet: string
          win_rate: number | null
          wins: number
        }
        Insert: {
          category: string
          losses?: number
          net_sol?: number
          period?: string
          rank?: number | null
          total_entries?: number
          total_sol_played?: number
          total_sol_won?: number
          updated_at?: string
          wallet: string
          win_rate?: number | null
          wins?: number
        }
        Update: {
          category?: string
          losses?: number
          net_sol?: number
          period?: string
          rank?: number | null
          total_entries?: number
          total_sol_played?: number
          total_sol_won?: number
          updated_at?: string
          wallet?: string
          win_rate?: number | null
          wins?: number
        }
        Relationships: []
      }
      match_share_cards: {
        Row: {
          created_at: string
          fee_lamports: number | null
          finished_at: string | null
          game_type: string
          loser_rank_after: number | null
          loser_rank_before: number | null
          loser_wallet: string | null
          metadata: Json | null
          mode: string
          room_pda: string
          stake_lamports: number
          tx_signature: string | null
          updated_at: string
          win_reason: string
          winner_payout_lamports: number | null
          winner_rank_after: number | null
          winner_rank_before: number | null
          winner_wallet: string | null
        }
        Insert: {
          created_at?: string
          fee_lamports?: number | null
          finished_at?: string | null
          game_type: string
          loser_rank_after?: number | null
          loser_rank_before?: number | null
          loser_wallet?: string | null
          metadata?: Json | null
          mode?: string
          room_pda: string
          stake_lamports?: number
          tx_signature?: string | null
          updated_at?: string
          win_reason?: string
          winner_payout_lamports?: number | null
          winner_rank_after?: number | null
          winner_rank_before?: number | null
          winner_wallet?: string | null
        }
        Update: {
          created_at?: string
          fee_lamports?: number | null
          finished_at?: string | null
          game_type?: string
          loser_rank_after?: number | null
          loser_rank_before?: number | null
          loser_wallet?: string | null
          metadata?: Json | null
          mode?: string
          room_pda?: string
          stake_lamports?: number
          tx_signature?: string | null
          updated_at?: string
          win_reason?: string
          winner_payout_lamports?: number | null
          winner_rank_after?: number | null
          winner_rank_before?: number | null
          winner_wallet?: string | null
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          creator_wallet: string
          finalized_at: string | null
          game_type: string
          id: string
          is_rematch: boolean
          max_players: number
          origin_room_pda: string | null
          room_pda: string
          stake_lamports: number
          status: string
          winner_wallet: string | null
        }
        Insert: {
          created_at?: string
          creator_wallet: string
          finalized_at?: string | null
          game_type: string
          id?: string
          is_rematch?: boolean
          max_players?: number
          origin_room_pda?: string | null
          room_pda: string
          stake_lamports?: number
          status?: string
          winner_wallet?: string | null
        }
        Update: {
          created_at?: string
          creator_wallet?: string
          finalized_at?: string | null
          game_type?: string
          id?: string
          is_rematch?: boolean
          max_players?: number
          origin_room_pda?: string | null
          room_pda?: string
          stake_lamports?: number
          status?: string
          winner_wallet?: string | null
        }
        Relationships: []
      }
      monkey_analytics: {
        Row: {
          context: string | null
          created_at: string
          event: string
          id: string
          lang: string | null
          metadata: string | null
          session_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          event: string
          id?: string
          lang?: string | null
          metadata?: string | null
          session_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          event?: string
          id?: string
          lang?: string | null
          metadata?: string | null
          session_id?: string
        }
        Relationships: []
      }
      operator_events: {
        Row: {
          created_at: string
          event_date: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          operator_id: string
          sport: string | null
          status: string
          team_a: string
          team_b: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_date?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          operator_id: string
          sport?: string | null
          status?: string
          team_a: string
          team_b: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_date?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          operator_id?: string
          sport?: string | null
          status?: string
          team_a?: string
          team_b?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_events_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_settings: {
        Row: {
          allowed_sports: string[] | null
          featured_event_ids: string[] | null
          homepage_layout: string | null
          id: string
          operator_id: string
          show_platform_events: boolean | null
          show_polymarket_events: boolean | null
        }
        Insert: {
          allowed_sports?: string[] | null
          featured_event_ids?: string[] | null
          homepage_layout?: string | null
          id?: string
          operator_id: string
          show_platform_events?: boolean | null
          show_polymarket_events?: boolean | null
        }
        Update: {
          allowed_sports?: string[] | null
          featured_event_ids?: string[] | null
          homepage_layout?: string | null
          id?: string
          operator_id?: string
          show_platform_events?: boolean | null
          show_polymarket_events?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_settings_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: true
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          brand_name: string
          created_at: string
          fee_percent: number
          id: string
          logo_url: string | null
          status: string
          subdomain: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_name: string
          created_at?: string
          fee_percent?: number
          id?: string
          logo_url?: string | null
          status?: string
          subdomain: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_name?: string
          created_at?: string
          fee_percent?: number
          id?: string
          logo_url?: string | null
          status?: string
          subdomain?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      page_visits: {
        Row: {
          entered_at: string
          game: string | null
          id: string
          page: string
          session_id: string
        }
        Insert: {
          entered_at?: string
          game?: string | null
          id?: string
          page: string
          session_id: string
        }
        Update: {
          entered_at?: string
          game?: string | null
          id?: string
          page?: string
          session_id?: string
        }
        Relationships: []
      }
      player_profiles: {
        Row: {
          biggest_pot_won: number
          created_at: string
          current_streak: number
          favorite_game: string | null
          games_played: number
          last_game_at: string | null
          longest_streak: number
          losses: number
          referral_code: string | null
          referral_created_at: string | null
          referral_label: string | null
          referral_percentage: number
          referred_by_code: string | null
          referred_by_wallet: string | null
          total_sol_won: number
          updated_at: string
          wallet: string
          win_rate: number | null
          wins: number
        }
        Insert: {
          biggest_pot_won?: number
          created_at?: string
          current_streak?: number
          favorite_game?: string | null
          games_played?: number
          last_game_at?: string | null
          longest_streak?: number
          losses?: number
          referral_code?: string | null
          referral_created_at?: string | null
          referral_label?: string | null
          referral_percentage?: number
          referred_by_code?: string | null
          referred_by_wallet?: string | null
          total_sol_won?: number
          updated_at?: string
          wallet: string
          win_rate?: number | null
          wins?: number
        }
        Update: {
          biggest_pot_won?: number
          created_at?: string
          current_streak?: number
          favorite_game?: string | null
          games_played?: number
          last_game_at?: string | null
          longest_streak?: number
          losses?: number
          referral_code?: string | null
          referral_created_at?: string | null
          referral_label?: string | null
          referral_percentage?: number
          referred_by_code?: string | null
          referred_by_wallet?: string | null
          total_sol_won?: number
          updated_at?: string
          wallet?: string
          win_rate?: number | null
          wins?: number
        }
        Relationships: []
      }
      player_sessions: {
        Row: {
          created_at: string
          desync_count: number
          last_hash: string | null
          last_move_at: string | null
          last_turn: number
          revoked: boolean
          room_pda: string
          rules_hash: string
          session_token: string
          wallet: string
        }
        Insert: {
          created_at?: string
          desync_count?: number
          last_hash?: string | null
          last_move_at?: string | null
          last_turn?: number
          revoked?: boolean
          room_pda: string
          rules_hash: string
          session_token: string
          wallet: string
        }
        Update: {
          created_at?: string
          desync_count?: number
          last_hash?: string | null
          last_move_at?: string | null
          last_turn?: number
          revoked?: boolean
          room_pda?: string
          rules_hash?: string
          session_token?: string
          wallet?: string
        }
        Relationships: []
      }
      polymarket_sync_state: {
        Row: {
          id: string
          last_cursor: string | null
          last_synced_at: string | null
          markets_synced: number | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          last_cursor?: string | null
          last_synced_at?: string | null
          markets_synced?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          last_cursor?: string | null
          last_synced_at?: string | null
          markets_synced?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      polymarket_user_positions: {
        Row: {
          avg_price: number
          condition_id: string
          created_at: string
          current_value: number
          fight_id: string | null
          id: string
          outcome_index: number
          pm_order_id: string | null
          pm_order_status: string | null
          realized_pnl: number
          size: number
          synced_at: string
          token_id: string | null
          updated_at: string
          wallet: string
        }
        Insert: {
          avg_price?: number
          condition_id: string
          created_at?: string
          current_value?: number
          fight_id?: string | null
          id?: string
          outcome_index?: number
          pm_order_id?: string | null
          pm_order_status?: string | null
          realized_pnl?: number
          size?: number
          synced_at?: string
          token_id?: string | null
          updated_at?: string
          wallet: string
        }
        Update: {
          avg_price?: number
          condition_id?: string
          created_at?: string
          current_value?: number
          fight_id?: string | null
          id?: string
          outcome_index?: number
          pm_order_id?: string | null
          pm_order_status?: string | null
          realized_pnl?: number
          size?: number
          synced_at?: string
          token_id?: string | null
          updated_at?: string
          wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "polymarket_user_positions_fight_id_fkey"
            columns: ["fight_id"]
            isOneToOne: false
            referencedRelation: "prediction_fights"
            referencedColumns: ["id"]
          },
        ]
      }
      polymarket_user_sessions: {
        Row: {
          authenticated_at: string | null
          created_at: string
          ctf_allowance_set: boolean
          expires_at: string | null
          id: string
          pm_api_key: string | null
          pm_api_secret: string | null
          pm_derived_address: string | null
          pm_passphrase: string | null
          pm_trading_key: string | null
          status: string
          updated_at: string
          wallet: string
        }
        Insert: {
          authenticated_at?: string | null
          created_at?: string
          ctf_allowance_set?: boolean
          expires_at?: string | null
          id?: string
          pm_api_key?: string | null
          pm_api_secret?: string | null
          pm_derived_address?: string | null
          pm_passphrase?: string | null
          pm_trading_key?: string | null
          status?: string
          updated_at?: string
          wallet: string
        }
        Update: {
          authenticated_at?: string | null
          created_at?: string
          ctf_allowance_set?: boolean
          expires_at?: string | null
          id?: string
          pm_api_key?: string | null
          pm_api_secret?: string | null
          pm_derived_address?: string | null
          pm_passphrase?: string | null
          pm_trading_key?: string | null
          status?: string
          updated_at?: string
          wallet?: string
        }
        Relationships: []
      }
      prediction_accounts: {
        Row: {
          auth_provider: string | null
          created_at: string
          id: string
          last_active_at: string
          privy_did: string | null
          status: string
          wallet_evm: string | null
          wallet_solana: string | null
        }
        Insert: {
          auth_provider?: string | null
          created_at?: string
          id?: string
          last_active_at?: string
          privy_did?: string | null
          status?: string
          wallet_evm?: string | null
          wallet_solana?: string | null
        }
        Update: {
          auth_provider?: string | null
          created_at?: string
          id?: string
          last_active_at?: string
          privy_did?: string | null
          status?: string
          wallet_evm?: string | null
          wallet_solana?: string | null
        }
        Relationships: []
      }
      prediction_admins: {
        Row: {
          wallet: string
        }
        Insert: {
          wallet: string
        }
        Update: {
          wallet?: string
        }
        Relationships: []
      }
      prediction_entries: {
        Row: {
          amount_lamports: number
          amount_usd: number | null
          claimed: boolean
          created_at: string
          fee_lamports: number
          fee_usd: number | null
          fight_id: string
          fighter_pick: string
          id: string
          polymarket_order_id: string | null
          polymarket_status: string | null
          pool_lamports: number
          pool_usd: number | null
          reward_lamports: number | null
          reward_usd: number | null
          shares: number
          tx_signature: string | null
          wallet: string
        }
        Insert: {
          amount_lamports: number
          amount_usd?: number | null
          claimed?: boolean
          created_at?: string
          fee_lamports: number
          fee_usd?: number | null
          fight_id: string
          fighter_pick: string
          id?: string
          polymarket_order_id?: string | null
          polymarket_status?: string | null
          pool_lamports: number
          pool_usd?: number | null
          reward_lamports?: number | null
          reward_usd?: number | null
          shares: number
          tx_signature?: string | null
          wallet: string
        }
        Update: {
          amount_lamports?: number
          amount_usd?: number | null
          claimed?: boolean
          created_at?: string
          fee_lamports?: number
          fee_usd?: number | null
          fight_id?: string
          fighter_pick?: string
          id?: string
          polymarket_order_id?: string | null
          polymarket_status?: string | null
          pool_lamports?: number
          pool_usd?: number | null
          reward_lamports?: number | null
          reward_usd?: number | null
          shares?: number
          tx_signature?: string | null
          wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_entries_fight_id_fkey"
            columns: ["fight_id"]
            isOneToOne: false
            referencedRelation: "prediction_fights"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_events: {
        Row: {
          admin_approved_at: string | null
          auto_resolve: boolean
          automation_paused: boolean
          automation_status: string
          category: string | null
          created_at: string
          enrichment_notes: string | null
          event_banner_url: string | null
          event_date: string | null
          event_name: string
          featured: boolean
          featured_priority: number
          id: string
          is_test: boolean
          last_automation_check_at: string | null
          league_logo: string | null
          location: string | null
          organization: string | null
          polymarket_event_id: string | null
          polymarket_slug: string | null
          requires_admin_approval: boolean
          result_confidence: number | null
          result_detected_at: string | null
          result_requires_review: boolean
          result_source_payload: Json | null
          review_reason: string | null
          review_required: boolean
          scheduled_live_at: string | null
          scheduled_lock_at: string | null
          settle_job_id: string | null
          source: string
          source_event_id: string | null
          source_provider: string | null
          source_url: string | null
          status: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          admin_approved_at?: string | null
          auto_resolve?: boolean
          automation_paused?: boolean
          automation_status?: string
          category?: string | null
          created_at?: string
          enrichment_notes?: string | null
          event_banner_url?: string | null
          event_date?: string | null
          event_name: string
          featured?: boolean
          featured_priority?: number
          id?: string
          is_test?: boolean
          last_automation_check_at?: string | null
          league_logo?: string | null
          location?: string | null
          organization?: string | null
          polymarket_event_id?: string | null
          polymarket_slug?: string | null
          requires_admin_approval?: boolean
          result_confidence?: number | null
          result_detected_at?: string | null
          result_requires_review?: boolean
          result_source_payload?: Json | null
          review_reason?: string | null
          review_required?: boolean
          scheduled_live_at?: string | null
          scheduled_lock_at?: string | null
          settle_job_id?: string | null
          source?: string
          source_event_id?: string | null
          source_provider?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          admin_approved_at?: string | null
          auto_resolve?: boolean
          automation_paused?: boolean
          automation_status?: string
          category?: string | null
          created_at?: string
          enrichment_notes?: string | null
          event_banner_url?: string | null
          event_date?: string | null
          event_name?: string
          featured?: boolean
          featured_priority?: number
          id?: string
          is_test?: boolean
          last_automation_check_at?: string | null
          league_logo?: string | null
          location?: string | null
          organization?: string | null
          polymarket_event_id?: string | null
          polymarket_slug?: string | null
          requires_admin_approval?: boolean
          result_confidence?: number | null
          result_detected_at?: string | null
          result_requires_review?: boolean
          result_source_payload?: Json | null
          review_reason?: string | null
          review_required?: boolean
          scheduled_live_at?: string | null
          scheduled_lock_at?: string | null
          settle_job_id?: string | null
          source?: string
          source_event_id?: string | null
          source_provider?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_events_settle_job_id_fkey"
            columns: ["settle_job_id"]
            isOneToOne: false
            referencedRelation: "automation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_fight_updates: {
        Row: {
          content: string
          created_at: string | null
          fight_id: string
          id: string
          impact: string | null
          source: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          fight_id: string
          id?: string
          impact?: string | null
          source?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          fight_id?: string
          id?: string
          impact?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_fight_updates_fight_id_fkey"
            columns: ["fight_id"]
            isOneToOne: false
            referencedRelation: "prediction_fights"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_fights: {
        Row: {
          auto_resolve: boolean
          away_logo: string | null
          claims_open_at: string | null
          commission_bps: number
          confirmed_at: string | null
          created_at: string
          enrichment_notes: string | null
          event_banner_url: string | null
          event_id: string | null
          event_name: string
          explainer_card: string | null
          featured: boolean
          featured_priority: number
          fight_class: string | null
          fighter_a_name: string
          fighter_a_photo: string | null
          fighter_a_record: string | null
          fighter_b_name: string
          fighter_b_photo: string | null
          fighter_b_record: string | null
          home_logo: string | null
          id: string
          method: string | null
          polymarket_active: boolean | null
          polymarket_competitive: number | null
          polymarket_condition_id: string | null
          polymarket_end_date: string | null
          polymarket_fee: string | null
          polymarket_last_synced_at: string | null
          polymarket_liquidity: number | null
          polymarket_market_id: string | null
          polymarket_outcome_a_token: string | null
          polymarket_outcome_b_token: string | null
          polymarket_question: string | null
          polymarket_slug: string | null
          polymarket_start_date: string | null
          polymarket_volume_24h: number | null
          polymarket_volume_usd: number | null
          pool_a_lamports: number
          pool_a_usd: number
          pool_b_lamports: number
          pool_b_usd: number
          price_a: number | null
          price_b: number | null
          referee: string | null
          refund_status: string | null
          refunds_completed_at: string | null
          refunds_started_at: string | null
          resolved_at: string | null
          review_reason: string | null
          review_required: boolean
          settled_at: string | null
          shares_a: number
          shares_b: number
          source: string
          stats_json: Json | null
          status: string
          title: string
          trading_allowed: boolean
          updated_at: string
          venue: string | null
          weight_class: string | null
          winner: string | null
        }
        Insert: {
          auto_resolve?: boolean
          away_logo?: string | null
          claims_open_at?: string | null
          commission_bps?: number
          confirmed_at?: string | null
          created_at?: string
          enrichment_notes?: string | null
          event_banner_url?: string | null
          event_id?: string | null
          event_name?: string
          explainer_card?: string | null
          featured?: boolean
          featured_priority?: number
          fight_class?: string | null
          fighter_a_name: string
          fighter_a_photo?: string | null
          fighter_a_record?: string | null
          fighter_b_name: string
          fighter_b_photo?: string | null
          fighter_b_record?: string | null
          home_logo?: string | null
          id?: string
          method?: string | null
          polymarket_active?: boolean | null
          polymarket_competitive?: number | null
          polymarket_condition_id?: string | null
          polymarket_end_date?: string | null
          polymarket_fee?: string | null
          polymarket_last_synced_at?: string | null
          polymarket_liquidity?: number | null
          polymarket_market_id?: string | null
          polymarket_outcome_a_token?: string | null
          polymarket_outcome_b_token?: string | null
          polymarket_question?: string | null
          polymarket_slug?: string | null
          polymarket_start_date?: string | null
          polymarket_volume_24h?: number | null
          polymarket_volume_usd?: number | null
          pool_a_lamports?: number
          pool_a_usd?: number
          pool_b_lamports?: number
          pool_b_usd?: number
          price_a?: number | null
          price_b?: number | null
          referee?: string | null
          refund_status?: string | null
          refunds_completed_at?: string | null
          refunds_started_at?: string | null
          resolved_at?: string | null
          review_reason?: string | null
          review_required?: boolean
          settled_at?: string | null
          shares_a?: number
          shares_b?: number
          source?: string
          stats_json?: Json | null
          status?: string
          title: string
          trading_allowed?: boolean
          updated_at?: string
          venue?: string | null
          weight_class?: string | null
          winner?: string | null
        }
        Update: {
          auto_resolve?: boolean
          away_logo?: string | null
          claims_open_at?: string | null
          commission_bps?: number
          confirmed_at?: string | null
          created_at?: string
          enrichment_notes?: string | null
          event_banner_url?: string | null
          event_id?: string | null
          event_name?: string
          explainer_card?: string | null
          featured?: boolean
          featured_priority?: number
          fight_class?: string | null
          fighter_a_name?: string
          fighter_a_photo?: string | null
          fighter_a_record?: string | null
          fighter_b_name?: string
          fighter_b_photo?: string | null
          fighter_b_record?: string | null
          home_logo?: string | null
          id?: string
          method?: string | null
          polymarket_active?: boolean | null
          polymarket_competitive?: number | null
          polymarket_condition_id?: string | null
          polymarket_end_date?: string | null
          polymarket_fee?: string | null
          polymarket_last_synced_at?: string | null
          polymarket_liquidity?: number | null
          polymarket_market_id?: string | null
          polymarket_outcome_a_token?: string | null
          polymarket_outcome_b_token?: string | null
          polymarket_question?: string | null
          polymarket_slug?: string | null
          polymarket_start_date?: string | null
          polymarket_volume_24h?: number | null
          polymarket_volume_usd?: number | null
          pool_a_lamports?: number
          pool_a_usd?: number
          pool_b_lamports?: number
          pool_b_usd?: number
          price_a?: number | null
          price_b?: number | null
          referee?: string | null
          refund_status?: string | null
          refunds_completed_at?: string | null
          refunds_started_at?: string | null
          resolved_at?: string | null
          review_reason?: string | null
          review_required?: boolean
          settled_at?: string | null
          shares_a?: number
          shares_b?: number
          source?: string
          stats_json?: Json | null
          status?: string
          title?: string
          trading_allowed?: boolean
          updated_at?: string
          venue?: string | null
          weight_class?: string | null
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_fights_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "prediction_events"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_settings: {
        Row: {
          automation_enabled: boolean
          claims_enabled: boolean
          id: string
          predictions_enabled: boolean
          updated_at: string
        }
        Insert: {
          automation_enabled?: boolean
          claims_enabled?: boolean
          id?: string
          predictions_enabled?: boolean
          updated_at?: string
        }
        Update: {
          automation_enabled?: boolean
          claims_enabled?: boolean
          id?: string
          predictions_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      prediction_system_controls: {
        Row: {
          allowed_market_mode: string
          created_at: string
          default_fee_bps: number
          id: string
          max_daily_user_usdc: number
          max_order_usdc: number
          max_slippage_bps: number
          new_orders_enabled: boolean
          predictions_enabled: boolean
          updated_at: string
        }
        Insert: {
          allowed_market_mode?: string
          created_at?: string
          default_fee_bps?: number
          id?: string
          max_daily_user_usdc?: number
          max_order_usdc?: number
          max_slippage_bps?: number
          new_orders_enabled?: boolean
          predictions_enabled?: boolean
          updated_at?: string
        }
        Update: {
          allowed_market_mode?: string
          created_at?: string
          default_fee_bps?: number
          id?: string
          max_daily_user_usdc?: number
          max_order_usdc?: number
          max_slippage_bps?: number
          new_orders_enabled?: boolean
          predictions_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      prediction_trade_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          request_payload_json: Json | null
          response_payload_json: Json | null
          trade_order_id: string | null
          wallet: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          request_payload_json?: Json | null
          response_payload_json?: Json | null
          trade_order_id?: string | null
          wallet?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          request_payload_json?: Json | null
          response_payload_json?: Json | null
          trade_order_id?: string | null
          wallet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_trade_audit_log_trade_order_id_fkey"
            columns: ["trade_order_id"]
            isOneToOne: false
            referencedRelation: "prediction_trade_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_trade_orders: {
        Row: {
          account_id: string | null
          avg_fill_price: number | null
          created_at: string
          error_code: string | null
          error_message: string | null
          expected_price: number | null
          expected_shares: number | null
          fee_bps: number
          fee_tx_hash: string | null
          fee_usdc: number
          fight_id: string
          filled_amount_usdc: number
          filled_shares: number
          finalized_at: string | null
          id: string
          order_type: string
          polymarket_market_id: string | null
          polymarket_order_id: string | null
          prediction_event_id: string | null
          quote_expires_at: string | null
          reconciled_at: string | null
          requested_amount_usdc: number
          side: string
          slippage_bps: number
          status: string
          submitted_at: string | null
          token_id: string | null
          wallet: string
        }
        Insert: {
          account_id?: string | null
          avg_fill_price?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          expected_price?: number | null
          expected_shares?: number | null
          fee_bps?: number
          fee_tx_hash?: string | null
          fee_usdc?: number
          fight_id: string
          filled_amount_usdc?: number
          filled_shares?: number
          finalized_at?: string | null
          id?: string
          order_type?: string
          polymarket_market_id?: string | null
          polymarket_order_id?: string | null
          prediction_event_id?: string | null
          quote_expires_at?: string | null
          reconciled_at?: string | null
          requested_amount_usdc?: number
          side: string
          slippage_bps?: number
          status?: string
          submitted_at?: string | null
          token_id?: string | null
          wallet: string
        }
        Update: {
          account_id?: string | null
          avg_fill_price?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          expected_price?: number | null
          expected_shares?: number | null
          fee_bps?: number
          fee_tx_hash?: string | null
          fee_usdc?: number
          fight_id?: string
          filled_amount_usdc?: number
          filled_shares?: number
          finalized_at?: string | null
          id?: string
          order_type?: string
          polymarket_market_id?: string | null
          polymarket_order_id?: string | null
          prediction_event_id?: string | null
          quote_expires_at?: string | null
          reconciled_at?: string | null
          requested_amount_usdc?: number
          side?: string
          slippage_bps?: number
          status?: string
          submitted_at?: string | null
          token_id?: string | null
          wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_trade_orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "prediction_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_trade_orders_fight_id_fkey"
            columns: ["fight_id"]
            isOneToOne: false
            referencedRelation: "prediction_fights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_trade_orders_prediction_event_id_fkey"
            columns: ["prediction_event_id"]
            isOneToOne: false
            referencedRelation: "prediction_events"
            referencedColumns: ["id"]
          },
        ]
      }
      presence_heartbeats: {
        Row: {
          country: string | null
          device: string | null
          first_seen_at: string | null
          first_seen_date: string | null
          game: string | null
          lang: string | null
          last_seen: string
          page: string | null
          referrer: string | null
          session_id: string
        }
        Insert: {
          country?: string | null
          device?: string | null
          first_seen_at?: string | null
          first_seen_date?: string | null
          game?: string | null
          lang?: string | null
          last_seen?: string
          page?: string | null
          referrer?: string | null
          session_id: string
        }
        Update: {
          country?: string | null
          device?: string | null
          first_seen_at?: string | null
          first_seen_date?: string | null
          game?: string | null
          lang?: string | null
          last_seen?: string
          page?: string | null
          referrer?: string | null
          session_id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          game_type: string
          games: number
          losses: number
          rating: number
          updated_at: string
          wallet: string
          wins: number
        }
        Insert: {
          game_type: string
          games?: number
          losses?: number
          rating?: number
          updated_at?: string
          wallet: string
          wins?: number
        }
        Update: {
          game_type?: string
          games?: number
          losses?: number
          rating?: number
          updated_at?: string
          wallet?: string
          wins?: number
        }
        Relationships: []
      }
      recovery_logs: {
        Row: {
          action: string
          caller_wallet: string
          created_at: string | null
          id: string
          result: string
          room_pda: string
          tx_signature: string | null
        }
        Insert: {
          action: string
          caller_wallet: string
          created_at?: string | null
          id?: string
          result: string
          room_pda: string
          tx_signature?: string | null
        }
        Update: {
          action?: string
          caller_wallet?: string
          created_at?: string | null
          id?: string
          result?: string
          room_pda?: string
          tx_signature?: string | null
        }
        Relationships: []
      }
      referral_abuse_logs: {
        Row: {
          attempted_code: string | null
          created_at: string
          id: string
          metadata: Json | null
          reason: string
          wallet: string
        }
        Insert: {
          attempted_code?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reason: string
          wallet: string
        }
        Update: {
          attempted_code?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reason?: string
          wallet?: string
        }
        Relationships: []
      }
      referral_payout_logs: {
        Row: {
          amount_sol: number
          created_at: string
          id: string
          note: string | null
          paid_at: string
          paid_by_admin_wallet: string
          referral_code: string | null
          referral_wallet: string
          tx_hash: string | null
        }
        Insert: {
          amount_sol: number
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string
          paid_by_admin_wallet: string
          referral_code?: string | null
          referral_wallet: string
          tx_hash?: string | null
        }
        Update: {
          amount_sol?: number
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string
          paid_by_admin_wallet?: string
          referral_code?: string | null
          referral_wallet?: string
          tx_hash?: string | null
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          platform_fee_amount: number
          player_wallet: string
          referral_reward_amount: number
          referrer_wallet: string
          source_id: string
          source_type: string
          status: string
          wager_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          platform_fee_amount?: number
          player_wallet: string
          referral_reward_amount?: number
          referrer_wallet: string
          source_id: string
          source_type: string
          status?: string
          wager_amount?: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          platform_fee_amount?: number
          player_wallet?: string
          referral_reward_amount?: number
          referrer_wallet?: string
          source_id?: string
          source_type?: string
          status?: string
          wager_amount?: number
        }
        Relationships: []
      }
      session_nonces: {
        Row: {
          created_at: string
          expires_at: string
          nonce: string
          room_pda: string
          rules_hash: string
          used: boolean
          wallet: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          nonce: string
          room_pda: string
          rules_hash: string
          used?: boolean
          wallet: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          nonce?: string
          room_pda?: string
          rules_hash?: string
          used?: boolean
          wallet?: string
        }
        Relationships: []
      }
      settlement_logs: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          expected_pot: number | null
          forfeiting_wallet: string | null
          id: string
          player_count: number | null
          room_pda: string
          room_status: number | null
          signature: string | null
          stake_per_player: number | null
          success: boolean
          vault_lamports: number | null
          vault_pda: string | null
          verifier_lamports: number | null
          verifier_pubkey: string | null
          winner_wallet: string | null
        }
        Insert: {
          action?: string
          created_at?: string
          error_message?: string | null
          expected_pot?: number | null
          forfeiting_wallet?: string | null
          id?: string
          player_count?: number | null
          room_pda: string
          room_status?: number | null
          signature?: string | null
          stake_per_player?: number | null
          success?: boolean
          vault_lamports?: number | null
          vault_pda?: string | null
          verifier_lamports?: number | null
          verifier_pubkey?: string | null
          winner_wallet?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          expected_pot?: number | null
          forfeiting_wallet?: string | null
          id?: string
          player_count?: number | null
          room_pda?: string
          room_status?: number | null
          signature?: string | null
          stake_per_player?: number | null
          success?: boolean
          vault_lamports?: number | null
          vault_pda?: string | null
          verifier_lamports?: number | null
          verifier_pubkey?: string | null
          winner_wallet?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      all_participants_accepted: {
        Args: { p_room_pda: string }
        Returns: boolean
      }
      compute_start_roll: { Args: { p_room_pda: string }; Returns: Json }
      ensure_game_session:
        | {
            Args: {
              p_game_type: string
              p_mode?: string
              p_player1_wallet: string
              p_player2_wallet: string
              p_room_pda: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_game_type: string
              p_max_players?: number
              p_mode?: string
              p_participants?: string[]
              p_player1_wallet: string
              p_player2_wallet: string
              p_room_pda: string
            }
            Returns: undefined
          }
      finalize_start_roll: {
        Args: {
          p_room_pda: string
          p_start_roll?: Json
          p_starting_wallet: string
        }
        Returns: boolean
      }
      finish_game_session: {
        Args: {
          p_caller_wallet?: string
          p_room_pda: string
          p_winner_wallet?: string
        }
        Returns: undefined
      }
      issue_nonce: {
        Args: { p_room_pda: string; p_rules_hash: string; p_wallet: string }
        Returns: string
      }
      maybe_activate_game_session: {
        Args: { p_room_pda: string }
        Returns: undefined
      }
      maybe_apply_turn_timeout: { Args: { p_room_pda: string }; Returns: Json }
      maybe_apply_waiting_timeout: {
        Args: { p_room_pda: string }
        Returns: Json
      }
      maybe_finalize_start_state: {
        Args: { p_room_pda: string }
        Returns: undefined
      }
      prediction_update_pool: {
        Args: {
          p_fight_id: string
          p_pool_lamports: number
          p_shares: number
          p_side: string
        }
        Returns: undefined
      }
      prediction_update_pool_usd: {
        Args: {
          p_fight_id: string
          p_pool_usd: number
          p_shares: number
          p_side: string
        }
        Returns: undefined
      }
      rebuild_participants: {
        Args: {
          p_existing_participants: string[]
          p_max_players: number
          p_player1: string
          p_player2: string
        }
        Returns: string[]
      }
      record_acceptance: {
        Args: {
          p_is_creator?: boolean
          p_room_pda: string
          p_rules_hash: string
          p_stake_lamports: number
          p_tx_signature: string
          p_wallet: string
        }
        Returns: Json
      }
      record_match_result: {
        Args: {
          p_finalize_tx: string
          p_game_type: string
          p_max_players: number
          p_mode: string
          p_players: string[]
          p_room_pda: string
          p_stake_lamports: number
          p_winner_wallet: string
        }
        Returns: undefined
      }
      report_desync: {
        Args: { p_room_pda: string; p_session_token: string }
        Returns: undefined
      }
      revoke_session: {
        Args: { p_room_pda: string; p_session_token: string }
        Returns: undefined
      }
      set_player_ready: {
        Args: { p_room_pda: string; p_wallet: string }
        Returns: undefined
      }
      start_session: {
        Args: {
          p_nonce: string
          p_room_pda: string
          p_rules_hash: string
          p_sig_valid: boolean
          p_signature: string
          p_wallet: string
        }
        Returns: string
      }
      submit_game_move: {
        Args: {
          p_client_move_id?: string
          p_move_data: Json
          p_room_pda: string
          p_wallet: string
        }
        Returns: Json
      }
      submit_move: {
        Args: {
          p_move_data: Json
          p_move_hash: string
          p_prev_hash: string
          p_room_pda: string
          p_session_token: string
          p_turn_number: number
        }
        Returns: undefined
      }
      upsert_game_session: {
        Args: {
          p_caller_wallet?: string
          p_current_turn_wallet: string
          p_game_state: Json
          p_game_type: string
          p_mode?: string
          p_player1_wallet: string
          p_player2_wallet: string
          p_room_pda: string
          p_status?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
