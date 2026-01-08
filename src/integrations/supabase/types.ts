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
      game_moves: {
        Row: {
          created_at: string
          move_data: Json
          move_hash: string
          prev_hash: string
          room_pda: string
          turn_number: number
          wallet: string
        }
        Insert: {
          created_at?: string
          move_data: Json
          move_hash: string
          prev_hash: string
          room_pda: string
          turn_number: number
          wallet: string
        }
        Update: {
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
          game_state: Json
          game_type: string
          mode: string
          p1_acceptance_tx: string | null
          p1_ready: boolean
          p2_acceptance_tx: string | null
          p2_ready: boolean
          player1_wallet: string
          player2_wallet: string | null
          room_pda: string
          start_roll: Json | null
          start_roll_finalized: boolean | null
          start_roll_seed: string | null
          starting_player_wallet: string | null
          status: string
          turn_time_seconds: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_turn_wallet?: string | null
          game_state?: Json
          game_type: string
          mode?: string
          p1_acceptance_tx?: string | null
          p1_ready?: boolean
          p2_acceptance_tx?: string | null
          p2_ready?: boolean
          player1_wallet: string
          player2_wallet?: string | null
          room_pda: string
          start_roll?: Json | null
          start_roll_finalized?: boolean | null
          start_roll_seed?: string | null
          starting_player_wallet?: string | null
          status?: string
          turn_time_seconds?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_turn_wallet?: string | null
          game_state?: Json
          game_type?: string
          mode?: string
          p1_acceptance_tx?: string | null
          p1_ready?: boolean
          p2_acceptance_tx?: string | null
          p2_ready?: boolean
          player1_wallet?: string
          player2_wallet?: string | null
          room_pda?: string
          start_roll?: Json | null
          start_roll_finalized?: boolean | null
          start_roll_seed?: string | null
          starting_player_wallet?: string | null
          status?: string
          turn_time_seconds?: number
          updated_at?: string
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
      compute_start_roll: { Args: { p_room_pda: string }; Returns: Json }
      ensure_game_session: {
        Args: {
          p_game_type: string
          p_mode?: string
          p_player1_wallet: string
          p_player2_wallet: string
          p_room_pda: string
        }
        Returns: undefined
      }
      finish_game_session: {
        Args: { p_caller_wallet?: string; p_room_pda: string }
        Returns: undefined
      }
      issue_nonce: {
        Args: { p_room_pda: string; p_rules_hash: string; p_wallet: string }
        Returns: string
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
