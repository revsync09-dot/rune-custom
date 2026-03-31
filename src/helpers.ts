import {
  AnnouncementChannel,
  ChannelType,
  DiscordAPIError,
  Guild,
  GuildBasedChannel,
  GuildEmoji,
  GuildMember,
  TextChannel,
} from "discord.js";
import { env, GAME_LABEL } from "./config.js";
import {
  CLOSE_TICKET_ROLE_IDS,
  CARRY_GAMES,
  CUSTOM_EMOJI_REGEX,
  FULL_ACCESS_ROLE_IDS,
  GUILD_GAME_OVERRIDES,
  OWNER_IDS,
  RUNE_BULLET_EMOJI_ID,
  RUNE_GUILD_ID,
  RUNE_SELECT_EMOJI_ID,
  SNOWFLAKE_REGEX,
  VOUCH_COOLDOWN_HOURS,
} from "./constants.js";
import type { CarryTicketRow, GameKey, TicketViewModel } from "./types.js";

export function normalizeSnowflake(value: unknown): string | null {
  if (!value) return null;
  const extracted = String(value).trim().replace(/[<@&#>]/g, "");
  if (!SNOWFLAKE_REGEX.test(extracted)) return null;
  try {
    if (BigInt(extracted) > BigInt("9223372036854775807")) return null;
  } catch {
    return null;
  }
  return extracted;
}

export function isOwner(userId: string): boolean {
  return OWNER_IDS.has(String(userId));
}

export function isBooster(member: GuildMember | null): boolean {
  if (!member) return false;
  const roleId = normalizeSnowflake(env().boosterRoleId);
  if (roleId && member.roles.cache.has(roleId)) return true;
  return member.premiumSince !== null;
}

export function isStaff(member: GuildMember | null): boolean {
  if (!member) return false;
  const cfg = env();
  const roleId = normalizeSnowflake(cfg.staffRoleId);
  if (roleId && member.roles.cache.has(roleId)) return true;
  for (const extraRoleId of FULL_ACCESS_ROLE_IDS) {
    if (member.roles.cache.has(extraRoleId)) return true;
  }
  return false;
}

export function canCloseAnyTicket(member: GuildMember | null): boolean {
  if (!member) return false;
  if (isStaff(member)) return true;
  for (const roleId of CLOSE_TICKET_ROLE_IDS) {
    if (member.roles.cache.has(roleId)) return true;
  }
  return false;
}

export function canUseAdminCommands(member: GuildMember | null): boolean {
  if (!member) return false;
  if (isOwner(member.id)) return true;
  if (member.permissions.has("Administrator")) return true;
  return canCloseAnyTicket(member);
}

export function getEnabledGames(guild: Guild | null): GameKey[] {
  const guildId = guild?.id ?? "";
  const allowed = GUILD_GAME_OVERRIDES[guildId];
  if (!allowed) return CARRY_GAMES.map((item) => item[1]);
  return CARRY_GAMES.map((item) => item[1]).filter((key) => allowed.includes(key));
}

export function getGameOptionKeys(guild: Guild | null) {
  const emojiMap: Record<GameKey, keyof ReturnType<typeof env>["emojis"]> = {
    ALS: "serviceAls",
    AG: "serviceAg",
    AC: "serviceAc",
    UTD: "serviceUtd",
    AV: "serviceAv",
    AO: "serviceAo",
    BL: "serviceBl",
    SP: "serviceSp",
  };
  return CARRY_GAMES.filter((item) => getEnabledGames(guild).includes(item[1])).map(([label, value, description]) => ({
    label,
    value,
    description,
    emojiKey: emojiMap[value],
  }));
}

export function findGameRoleInGuild(guild: Guild | null, gameKey: GameKey) {
  if (!guild) return null;
  const configuredRoleId = normalizeSnowflake(env().helperRoles[gameKey]);
  if (configuredRoleId) {
    const configured = guild.roles.cache.get(configuredRoleId);
    if (configured) return configured;
  }
  const keywords: Record<GameKey, string[]> = {
    ALS: ["als", "anime last stand", "last stand"],
    AG: ["ag", "anime guardians", "guardians"],
    AC: ["ac", "anime crusaders", "crusaders"],
    UTD: ["utd", "universal tower defense", "tower defense"],
    AV: ["av", "anime vanguards", "vanguards"],
    AO: ["ao", "anime overload", "overload"],
    BL: ["bl", "bizarre lineage", "lineage"],
    SP: ["sp", "sailor piece", "sailorpiece"],
  };
  return guild.roles.cache.find((role) => keywords[gameKey].some((keyword) => role.name.toLowerCase().includes(keyword))) ?? null;
}

export function isHelperForGame(member: GuildMember | null, gameKey: GameKey): boolean {
  if (!member) return false;
  const helperRole = findGameRoleInGuild(member.guild, gameKey);
  if (helperRole && member.roles.cache.has(helperRole.id)) return true;
  const cfg = env();
  const roleIds = [normalizeSnowflake(cfg.helperRoles[gameKey]), normalizeSnowflake(cfg.staffRoleId)].filter(Boolean) as string[];
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

export function helperRoleMention(gameKey: GameKey): string {
  const cfg = env();
  let roleId = normalizeSnowflake(cfg.helperRoles[gameKey]) ?? normalizeSnowflake(cfg.staffRoleId);
  if (!roleId) {
    roleId = [...FULL_ACCESS_ROLE_IDS][0] ?? null;
  }
  return roleId ? `<@&${roleId}>` : "@staff";
}

export function ticketCategoryId(gameKey: GameKey): string | null {
  const cfg = env();
  return normalizeSnowflake(cfg.ticketCategories[gameKey]) ?? normalizeSnowflake(cfg.defaultTicketCategoryId);
}

export function extractTicketMeta(topic: string | null | undefined): { ownerId?: string; gameKey?: GameKey } {
  if (!topic) return {};
  const parts = topic.split(":");
  if (parts.length !== 3 || parts[0] !== "carry") return {};
  return { ownerId: parts[1], gameKey: parts[2] as GameKey };
}

export function isTicketChannel(channel: GuildBasedChannel | null): boolean {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  const topic = channel.topic ?? "";
  if (extractTicketMeta(topic).ownerId) return true;
  const name = channel.name.toLowerCase();
  return name.startsWith("carry-") || name.startsWith("carry-request-") || name.startsWith("ticket-");
}

export function ticketFromDbRow(row: CarryTicketRow | null): TicketViewModel | null {
  if (!row) return null;
  const created = row.created_at ? Date.parse(row.created_at) : Date.now();
  return {
    userId: row.user_id,
    gameKey: row.game_key,
    gameLabel: row.game_label ?? GAME_LABEL[row.game_key] ?? row.game_key,
    ign: row.ign ?? "Unknown",
    request: row.request ?? "No request details.",
    createdAtMs: Number.isFinite(created) ? created : Date.now(),
    ticketNum: row.ticket_num ?? 0,
    claimedBy: row.claimed_by ?? null,
    claimedAt: row.claimed_at ?? null,
    firstHelperResponseAt: row.first_helper_response_at ?? null,
    reminderSentAt: row.reminder_sent_at ?? null,
    vouched: Boolean(row.vouched),
    msgId: row.msg_id ?? null,
    closedAt: row.closed_at ?? null,
    closedBy: row.closed_by ?? null,
    vouchRequestedAt: row.vouch_requested_at ?? null,
  };
}

export function utcNow() {
  return new Date();
}

export function parseUtc(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours) return `${hours}h ${remMinutes}m ${remSeconds}s`;
  if (minutes) return `${minutes}m ${remSeconds}s`;
  return `${remSeconds}s`;
}

export function getVouchCooldownState(lastVouchAt: string | null) {
  const createdAt = parseUtc(lastVouchAt);
  if (!createdAt) return null;
  const endsAt = new Date(createdAt.getTime() + VOUCH_COOLDOWN_HOURS * 3_600_000);
  const remainingSeconds = Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000));
  return {
    createdAt,
    endsAt,
    active: remainingSeconds > 0,
    remainingSeconds,
    cooldownHours: VOUCH_COOLDOWN_HOURS,
  };
}

export async function resolveGuildChannel(guild: Guild | null, channelId: string | null | undefined) {
  if (!guild || !channelId) return null;
  const cached = guild.channels.cache.get(channelId);
  if (cached) return cached;
  try {
    return await guild.channels.fetch(channelId);
  } catch {
    return null;
  }
}

export async function getConfiguredTextChannel(guild: Guild | null, channelIdValue: string, nameKeywords: string[]) {
  if (!guild) return null;
  const channelId = normalizeSnowflake(channelIdValue);
  if (channelId) {
    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildAnnouncement) {
      return channel as TextChannel | AnnouncementChannel;
    }
  }
  return (
    guild.channels.cache.find(
      (channel) =>
        (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) &&
        nameKeywords.some((keyword) => channel.name.toLowerCase().includes(keyword.toLowerCase())),
    ) as TextChannel | AnnouncementChannel | undefined
  ) ?? null;
}

export async function getCarryEmojis(guild: Guild | null) {
  const cfg = env();
  const map = new Map<string, GuildEmoji>();
  if (guild) {
    try {
      const emojis = await guild.emojis.fetch();
      emojis.forEach((emoji) => map.set(emoji.id, emoji));
    } catch (error) {
      if (!(error instanceof DiscordAPIError)) {
        console.error("[emoji] Failed to fetch emojis:", error);
      }
    }
  }

  const result = new Map<string, { embed: string; option: { id?: string; name?: string; animated?: boolean } | GuildEmoji | null }>();
  const keys = [
    ["bullet", cfg.emojis.bullet, "•"],
    ["serviceAls", cfg.emojis.serviceAls, "⚔️"],
    ["serviceAg", cfg.emojis.serviceAg, "🛡️"],
    ["serviceAc", cfg.emojis.serviceAc, "⚡"],
    ["serviceUtd", cfg.emojis.serviceUtd, "🏰"],
    ["serviceAv", cfg.emojis.serviceAv, "🦅"],
    ["serviceAo", cfg.emojis.serviceAo, "🔥"],
    ["serviceBl", cfg.emojis.serviceBl, "⭐"],
    ["serviceSp", cfg.emojis.serviceSp, "🌊"],
  ] as const;

  if (guild?.id === RUNE_GUILD_ID) {
    const runeBullet = map.get(RUNE_BULLET_EMOJI_ID);
    const runeSelect = map.get(RUNE_SELECT_EMOJI_ID);
    result.set("bullet", {
      embed: runeBullet ? String(runeBullet) : `<:emoji:${RUNE_BULLET_EMOJI_ID}>`,
      option: runeBullet ?? { name: "emoji", id: RUNE_BULLET_EMOJI_ID },
    });
    for (const key of ["serviceAls", "serviceAc", "serviceAv", "serviceAo", "serviceSp"]) {
      result.set(key, {
        embed: runeSelect ? String(runeSelect) : `<:emoji:${RUNE_SELECT_EMOJI_ID}>`,
        option: runeSelect ?? { name: "emoji", id: RUNE_SELECT_EMOJI_ID },
      });
    }
  }

  for (const [key, rawValue, fallback] of keys) {
    if (result.has(key)) continue;
    const raw = rawValue.trim();
    if (!raw) {
      result.set(key, { embed: fallback, option: null });
      continue;
    }
    const custom = CUSTOM_EMOJI_REGEX.exec(raw);
    if (custom) {
      result.set(key, {
        embed: raw,
        option: { name: custom[1], id: custom[2], animated: raw.startsWith("<a:") },
      });
      continue;
    }
    const emoji = map.get(raw);
    if (emoji) {
      result.set(key, { embed: String(emoji), option: emoji });
      continue;
    }
    result.set(key, { embed: `<:emoji:${raw}>`, option: { name: "emoji", id: raw } });
  }
  return result;
}
