export type GameKey = "ALS" | "AG" | "AC" | "UTD" | "AV" | "AO" | "BL" | "SP";

export interface CarryTicketRow {
  guild_id: string;
  channel_id: string;
  user_id: string;
  game_key: GameKey;
  game_label?: string | null;
  ign?: string | null;
  request?: string | null;
  ticket_num?: number | null;
  msg_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  claimed_by?: string | null;
  claimed_at?: string | null;
  vouched?: boolean | null;
  first_helper_response_at?: string | null;
  reminder_sent_at?: string | null;
  vouch_requested_at?: string | null;
  vouch_dm_1h_at?: string | null;
  vouch_dm_3h_at?: string | null;
}

export interface TicketViewModel {
  userId: string;
  gameKey: GameKey;
  gameLabel: string;
  ign: string;
  request: string;
  createdAtMs: number;
  ticketNum: number;
  claimedBy: string | null;
  claimedAt: string | null;
  firstHelperResponseAt: string | null;
  reminderSentAt: string | null;
  vouched: boolean;
  msgId: string | null;
  closedAt: string | null;
  closedBy: string | null;
  vouchRequestedAt: string | null;
}

export interface VouchStats {
  total: number;
  average: number;
  fiveStarRate: number;
  topGame: string;
}

export interface LeaderboardEntry extends VouchStats {
  helperId: string;
}

export interface BlacklistEntry {
  guild_id: string;
  user_id: string;
  reason?: string | null;
  created_by?: string | null;
  created_at?: string | null;
}
