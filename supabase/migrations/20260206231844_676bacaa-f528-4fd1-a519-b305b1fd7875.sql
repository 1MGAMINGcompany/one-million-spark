-- Update record_match_result to accept 'private' mode
-- Private rooms use ranked enforcement (stake, rules, forfeit) but skip ELO updates

CREATE OR REPLACE FUNCTION public.record_match_result(
  p_room_pda text,
  p_finalize_tx text,
  p_winner_wallet text,
  p_game_type text,
  p_max_players int,
  p_stake_lamports bigint,
  p_mode text,
  p_players text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_pot_sol numeric;
  v_fee_sol numeric;
  v_payout_sol numeric;
  v_k int := 32;
  v_winner_rating int;
  v_loser_rating int;
  v_expected numeric;
  v_new_winner int;
  v_new_loser int;
  v_a text;
  v_b text;
begin
  -- basic checks
  if p_finalize_tx is null or length(p_finalize_tx) < 20 then
    raise exception 'bad finalize_tx';
  end if;

  -- Accept 'private' mode (same enforcement as ranked, but no ELO)
  if p_mode not in ('casual','ranked','private') then
    raise exception 'bad mode';
  end if;

  if array_length(p_players, 1) is null or array_length(p_players, 1) < 2 then
    raise exception 'bad players';
  end if;

  -- winner must be in players
  if not (p_winner_wallet = any(p_players)) then
    raise exception 'winner not in players';
  end if;

  -- replay protection: finalize_tx can only be used once
  insert into finalize_receipts(finalize_tx, room_pda)
  values (p_finalize_tx, p_room_pda)
  on conflict (room_pda) do nothing;

  -- pot math (convert lamports to SOL)
  v_pot_sol := (p_stake_lamports::numeric * p_max_players::numeric) / 1000000000;
  v_fee_sol := v_pot_sol * 0.05;
  v_payout_sol := v_pot_sol - v_fee_sol;

  -- === Update player_profiles (winner + losers) ===
  -- winner (do NOT include win_rate - it's a generated column)
  insert into player_profiles(wallet, games_played, wins, losses, total_sol_won, biggest_pot_won, current_streak, longest_streak, favorite_game, last_game_at, created_at, updated_at)
  values (p_winner_wallet, 0, 0, 0, 0, 0, 0, 0, null, now(), now(), now())
  on conflict (wallet) do nothing;

  update player_profiles
  set games_played = games_played + 1,
      wins = wins + 1,
      current_streak = current_streak + 1,
      longest_streak = greatest(longest_streak, current_streak + 1),
      total_sol_won = total_sol_won + v_payout_sol,
      biggest_pot_won = greatest(biggest_pot_won, v_pot_sol),
      last_game_at = now(),
      updated_at = now()
  where wallet = p_winner_wallet;

  -- losers (do NOT include win_rate - it's a generated column)
  foreach v_a in array p_players loop
    if v_a <> p_winner_wallet then
      insert into player_profiles(wallet, games_played, wins, losses, total_sol_won, biggest_pot_won, current_streak, longest_streak, favorite_game, last_game_at, created_at, updated_at)
      values (v_a, 0, 0, 0, 0, 0, 0, 0, null, now(), now(), now())
      on conflict (wallet) do nothing;

      update player_profiles
      set games_played = games_played + 1,
          losses = losses + 1,
          current_streak = 0,
          last_game_at = now(),
          updated_at = now()
      where wallet = v_a;
    end if;
  end loop;

  -- win_rate is a generated column - no need to update it manually

  -- === Record match row (minimal) ===
  insert into matches(room_pda, origin_room_pda, is_rematch, game_type, max_players, stake_lamports, created_at, creator_wallet, winner_wallet, status, finalized_at)
  values (p_room_pda, null, false, p_game_type, p_max_players, p_stake_lamports, now(), p_players[1], p_winner_wallet, 'finalized', now())
  on conflict (room_pda) do nothing;

  -- === Ranked-only ELO (2-player for now) ===
  -- NOTE: 'private' mode uses same enforcement as ranked but SKIPS ELO updates
  if p_mode = 'ranked' and array_length(p_players,1) = 2 then
    v_a := p_players[1];
    v_b := p_players[2];

    -- ensure ratings exist
    insert into ratings(wallet, game_type) values (v_a, p_game_type) on conflict do nothing;
    insert into ratings(wallet, game_type) values (v_b, p_game_type) on conflict do nothing;

    select rating into v_winner_rating from ratings where wallet = p_winner_wallet and game_type = p_game_type;

    -- identify loser
    if p_winner_wallet = v_a then
      select rating into v_loser_rating from ratings where wallet = v_b and game_type = p_game_type;
    else
      select rating into v_loser_rating from ratings where wallet = v_a and game_type = p_game_type;
    end if;

    -- expected score for winner (Elo)
    v_expected := 1.0 / (1.0 + power(10.0, ((v_loser_rating - v_winner_rating)::numeric / 400.0)));

    v_new_winner := round(v_winner_rating + v_k * (1 - v_expected));
    v_new_loser  := round(v_loser_rating  + v_k * (0 - (1 - v_expected)));

    -- update winner
    update ratings
    set rating = v_new_winner,
        games = games + 1,
        wins = wins + 1,
        updated_at = now()
    where wallet = p_winner_wallet and game_type = p_game_type;

    -- update loser
    if p_winner_wallet = v_a then
      update ratings
      set rating = v_new_loser,
          games = games + 1,
          losses = losses + 1,
          updated_at = now()
      where wallet = v_b and game_type = p_game_type;
    else
      update ratings
      set rating = v_new_loser,
          games = games + 1,
          losses = losses + 1,
          updated_at = now()
      where wallet = v_a and game_type = p_game_type;
    end if;
  end if;

end;
$$;