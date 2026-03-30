import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./config.js";
import type { BlacklistEntry, CarryTicketRow, LeaderboardEntry, VouchStats } from "./types.js";

let supabaseClient: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (supabaseClient) return supabaseClient;
  const cfg = env();
  supabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

export async function createTicket(payload: CarryTicketRow): Promise<void> {
  const { error } = await client().from("carry_tickets").insert({ ...payload, claimed_by: payload.claimed_by ?? null });
  if (error) throw error;
}

export async function getTicketByChannelId(channelId: string): Promise<CarryTicketRow | null> {
  const { data, error } = await client()
    .from("carry_tickets")
    .select("*")
    .eq("channel_id", channelId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle<CarryTicketRow>();
  if (error) throw error;
  return data;
}

export async function updateTicketClaimed(channelId: string, claimedByUserId: string): Promise<void> {
  const { error } = await client()
    .from("carry_tickets")
    .update({
      claimed_by: claimedByUserId,
      claimed_at: new Date().toISOString(),
      first_helper_response_at: null,
      reminder_sent_at: null,
    })
    .eq("channel_id", channelId)
    .eq("status", "open");
  if (error) throw error;
}

export async function unclaimTicket(channelId: string): Promise<void> {
  const { error } = await client()
    .from("carry_tickets")
    .update({
      claimed_by: null,
      claimed_at: null,
      first_helper_response_at: null,
      reminder_sent_at: null,
    })
    .eq("channel_id", channelId)
    .eq("status", "open");
  if (error) throw error;
}

export async function closeTicket(channelId: string, closedBy: string): Promise<void> {
  const { error } = await client()
    .from("carry_tickets")
    .update({
      status: "closed",
      closed_by: closedBy,
      closed_at: new Date().toISOString(),
    })
    .eq("channel_id", channelId)
    .eq("status", "open");
  if (error) throw error;
}

export async function markTicketVouched(channelId: string): Promise<void> {
  const { error } = await client()
    .from("carry_tickets")
    .update({
      vouched: true,
      vouch_requested_at: new Date().toISOString(),
    })
    .eq("channel_id", channelId);
  if (error) throw error;
}

export async function getUnansweredOpenTickets(minutes: number): Promise<CarryTicketRow[]> {
  const cutoff = Date.now() - minutes * 60_000;
  const { data, error } = await client()
    .from("carry_tickets")
    .select("guild_id, channel_id, user_id, game_key, created_at, claimed_by, claimed_at, first_helper_response_at")
    .eq("status", "open");
  if (error) throw error;
  return ((data ?? []) as CarryTicketRow[]).filter((row) => {
    const createdAt = row.created_at ? Date.parse(row.created_at) : Number.NaN;
    const claimedAt = row.claimed_at ? Date.parse(row.claimed_at) : Number.NaN;
    if (!row.claimed_by) return Number.isFinite(createdAt) && createdAt <= cutoff;
    if (row.first_helper_response_at) return false;
    const reference = Number.isFinite(claimedAt) ? claimedAt : createdAt;
    return Number.isFinite(reference) && reference <= cutoff;
  });
}

export async function getClaimedTicketsNeedingReminder(minutes: number): Promise<CarryTicketRow[]> {
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data, error } = await client()
    .from("carry_tickets")
    .select("guild_id, channel_id, user_id, game_key, claimed_by, claimed_at")
    .eq("status", "open")
    .not("claimed_by", "is", null)
    .is("first_helper_response_at", null)
    .is("reminder_sent_at", null)
    .lt("claimed_at", cutoff);
  if (error) throw error;
  return (data ?? []) as CarryTicketRow[];
}

export async function markTicketReminderSent(channelId: string): Promise<void> {
  const { error } = await client()
    .from("carry_tickets")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("status", "open");
  if (error) throw error;
}

export async function markHelperResponded(channelId: string): Promise<void> {
  const { error } = await client()
    .from("carry_tickets")
    .update({ first_helper_response_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("status", "open")
    .is("first_helper_response_at", null);
  if (error) throw error;
}

export async function getOpenTicketForUser(guildId: string, userId: string): Promise<CarryTicketRow | null> {
  const { data, error } = await client()
    .from("carry_tickets")
    .select("*")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<CarryTicketRow>();
  if (error) throw error;
  return data;
}

export async function getNextTicketNumber(guildId: string): Promise<number> {
  const { data, error } = await client()
    .from("carry_tickets")
    .select("ticket_num")
    .eq("guild_id", guildId)
    .order("ticket_num", { ascending: false })
    .limit(1)
    .maybeSingle<{ ticket_num: number | null }>();
  if (error) throw error;
  return (data?.ticket_num ?? 0) + 1;
}

export async function createVouch(payload: Record<string, string | number>): Promise<void> {
  const { error } = await client().from("vouches").insert(payload);
  if (error) throw error;
}

export async function getHelperStats(guildId: string, helperUserId: string): Promise<VouchStats> {
  const { data, error } = await client()
    .from("vouches")
    .select("rating, game_key")
    .eq("guild_id", guildId)
    .eq("helper_user_id", helperUserId);
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return { total: 0, average: 0, fiveStarRate: 0, topGame: "N/A" };

  const total = rows.length;
  const ratingSum = rows.reduce((sum, row) => sum + Number(row.rating ?? 0), 0);
  const fiveStars = rows.filter((row) => Number(row.rating ?? 0) === 5).length;
  const gameCount = new Map<string, number>();
  for (const row of rows) {
    const key = String(row.game_key ?? "N/A");
    gameCount.set(key, (gameCount.get(key) ?? 0) + 1);
  }
  const topGame = [...gameCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";
  return {
    total,
    average: Math.round((ratingSum / total) * 100) / 100,
    fiveStarRate: Math.round((fiveStars / total) * 1000) / 10,
    topGame,
  };
}

export async function getLeaderboard(guildId: string, limit = 10): Promise<LeaderboardEntry[]> {
  const { data, error } = await client()
    .from("vouches")
    .select("helper_user_id, rating, game_key")
    .eq("guild_id", guildId);
  if (error) throw error;

  const byHelper = new Map<string, { total: number; ratingSum: number; fiveStars: number; games: Map<string, number> }>();
  for (const row of data ?? []) {
    const helperId = String(row.helper_user_id);
    const item = byHelper.get(helperId) ?? { total: 0, ratingSum: 0, fiveStars: 0, games: new Map<string, number>() };
    item.total += 1;
    item.ratingSum += Number(row.rating ?? 0);
    if (Number(row.rating ?? 0) === 5) item.fiveStars += 1;
    const gameKey = String(row.game_key ?? "N/A");
    item.games.set(gameKey, (item.games.get(gameKey) ?? 0) + 1);
    byHelper.set(helperId, item);
  }

  return [...byHelper.entries()]
    .map(([helperId, item]) => ({
      helperId,
      total: item.total,
      average: Math.round((item.ratingSum / item.total) * 100) / 100,
      fiveStarRate: Math.round((item.fiveStars / item.total) * 1000) / 10,
      topGame: [...item.games.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A",
    }))
    .sort((a, b) => b.average - a.average || b.total - a.total || b.fiveStarRate - a.fiveStarRate)
    .slice(0, Math.max(1, Math.min(limit, 20)));
}

export async function getLastVouchTime(guildId: string, userId: string): Promise<string | null> {
  const { data, error } = await client()
    .from("vouches")
    .select("created_at")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string | null }>();
  if (error) throw error;
  return data?.created_at ?? null;
}

export async function markVouchFollowupRequested(channelId: string): Promise<void> {
  const { error } = await client()
    .from("carry_tickets")
    .update({ vouch_requested_at: new Date().toISOString() })
    .eq("channel_id", channelId);
  if (error) throw error;
}

export async function getPendingVouchFollowups(reminderAfterHours: number, reminderField: "vouch_dm_1h_at" | "vouch_dm_3h_at"): Promise<CarryTicketRow[]> {
  const cutoff = new Date(Date.now() - reminderAfterHours * 3_600_000).toISOString();
  const { data, error } = await client()
    .from("carry_tickets")
    .select("guild_id, channel_id, user_id, game_key, ticket_num, closed_at, claimed_by, vouch_requested_at")
    .eq("status", "closed")
    .eq("vouched", false)
    .not("closed_at", "is", null)
    .not("vouch_requested_at", "is", null)
    .is(reminderField, null)
    .lt("closed_at", cutoff);
  if (error) throw error;
  return (data ?? []) as CarryTicketRow[];
}

export async function markVouchFollowupSent(channelId: string, reminderField: "vouch_dm_1h_at" | "vouch_dm_3h_at"): Promise<void> {
  const { error } = await client()
    .from("carry_tickets")
    .update({ [reminderField]: new Date().toISOString() })
    .eq("channel_id", channelId);
  if (error) throw error;
}

export async function getLatestUnvouchedClosedTicket(guildId: string, userId: string): Promise<CarryTicketRow | null> {
  const { data, error } = await client()
    .from("carry_tickets")
    .select("*")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .eq("status", "closed")
    .eq("vouched", false)
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle<CarryTicketRow>();
  if (error) throw error;
  return data;
}

export async function addTicketBlacklist(guildId: string, userId: string, reason: string, createdBy: string): Promise<void> {
  const { error } = await client()
    .from("ticket_blacklist")
    .upsert({ guild_id: guildId, user_id: userId, reason, created_by: createdBy }, { onConflict: "guild_id,user_id" });
  if (error) throw error;
}

export async function removeTicketBlacklist(guildId: string, userId: string): Promise<void> {
  const { error } = await client().from("ticket_blacklist").delete().eq("guild_id", guildId).eq("user_id", userId);
  if (error) throw error;
}

export async function getTicketBlacklistEntry(guildId: string, userId: string): Promise<BlacklistEntry | null> {
  const { data, error } = await client()
    .from("ticket_blacklist")
    .select("*")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<BlacklistEntry>();
  if (error) throw error;
  return data;
}

export async function incrementDailyMessageCount(guildId: string, userId: string, dayKey: string): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await client()
    .from("daily_message_stats")
    .select("id, message_count")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .eq("day_key", dayKey)
    .limit(1)
    .maybeSingle<{ id: string; message_count: number | null }>();
  if (error) throw error;

  if (data) {
    const nextCount = Number(data.message_count ?? 0) + 1;
    const { error: updateError } = await client()
      .from("daily_message_stats")
      .update({ message_count: nextCount, updated_at: now })
      .eq("id", data.id);
    if (updateError) throw updateError;
    return nextCount;
  }

  const { error: insertError } = await client().from("daily_message_stats").insert({
    guild_id: guildId,
    user_id: userId,
    day_key: dayKey,
    message_count: 1,
    created_at: now,
    updated_at: now,
  });
  if (insertError) throw insertError;
  return 1;
}

export async function getDailyMessageCount(guildId: string, userId: string, dayKey: string): Promise<number> {
  const { data, error } = await client()
    .from("daily_message_stats")
    .select("message_count")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .eq("day_key", dayKey)
    .limit(1)
    .maybeSingle<{ message_count: number | null }>();
  if (error) throw error;
  return Number(data?.message_count ?? 0);
}
