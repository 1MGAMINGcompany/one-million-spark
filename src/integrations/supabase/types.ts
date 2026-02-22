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
      presence_heartbeats: {
        Row: {
          first_seen_date: string | null
          game: string | null
          last_seen: string
          page: string | null
          session_id: string
        }
        Insert: {
          first_seen_date?: string | null
          game?: string | null
          last_seen?: string
          page?: string | null
          session_id: string
        }
        Update: {
          first_seen_date?: string | null
          game?: string | null
          last_seen?: string
          page?: string | null
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
