import {
  AttachmentBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  DiscordAPIError,
  GatewayIntentBits,
  Guild,
  GuildMember,
  Message,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  type CacheType,
  type ChatInputApplicationCommandData,
  type GuildTextBasedChannel,
  type Interaction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { env, GAME_LABEL, getHelperRank, missingEnvKeys } from "./config.js";
import {
  CARRY_MODAL,
  CARRY_PANEL_SELECT,
  CLAIM_RESPONSE_REMINDER_MINUTES,
  DAILY_MESSAGE_TARGET,
  RUNE_GUILD_ID,
  RUNE_MENU_INFO_CHANNEL_ID,
  TICKET_CLAIM,
  TICKET_CLOSE_BTN,
  TICKET_UNCLAIM,
  TICKET_VOUCH_BTN,
  UNANSWERED_TICKET_CLOSE_MINUTES,
  VOUCH_BUTTON,
  VOUCH_COOLDOWN_HOURS,
  VOUCH_MODAL,
  VOUCH_REMINDER_HOURS,
} from "./constants.js";
import * as db from "./db.js";
import {
  canCloseAnyTicket,
  canUseAdminCommands,
  extractTicketMeta,
  findGameRoleInGuild,
  findTicketCategory,
  formatDuration,
  getCarryEmojis,
  getConfiguredTextChannel,
  getEnabledGames,
  getGameOptionKeys,
  getVouchCooldownState,
  helperRoleMention,
  isBooster,
  isHelperForGame,
  isOwner,
  isStaff,
  isTicketChannel,
  normalizeSnowflake,
  resolveGuildChannel,
  ticketCategoryId,
  ticketFromDbRow,
} from "./helpers.js";
import { buildHelperProfileCard, buildHelperSnapshotCard, buildLeaderboardCardWithAvatars, buildVouchCard } from "./cards.js";
import { buildCarryPanel, buildHighlightMessage, buildNotice, buildSupportedGamesText, buildTicketMessage, buildVouchPanel } from "./ui.js";
import type { CarryTicketRow, GameKey, TicketViewModel } from "./types.js";

const cfg = env();
const userSelectedGame = new Map<string, GameKey>();
const ticketState = new Map<string, TicketViewModel>();
const cooldownReminders = new Map<string, { guildId: string; userId: string; channelId?: string | null; endsAt: Date }>();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const commands = [
  new SlashCommandBuilder().setName("setup-carry-panel").setDescription("Post the Carry Requests panel").addChannelOption((opt) => opt.setName("channel").setDescription("Target channel").setRequired(true)),
  new SlashCommandBuilder().setName("setup-vouch-panel").setDescription("Post the vouch panel").addChannelOption((opt) => opt.setName("channel").setDescription("Target channel").setRequired(true)),
  new SlashCommandBuilder().setName("close-ticket").setDescription("Close the current carry request"),
  new SlashCommandBuilder().setName("transfer-ticket").setDescription("Transfer the current ticket to another helper").addUserOption((opt) => opt.setName("helper").setDescription("Helper who should receive this ticket").setRequired(true)),
  new SlashCommandBuilder().setName("cooldown-status").setDescription("Show current carry cooldown status").addUserOption((opt) => opt.setName("user").setDescription("User to check").setRequired(false)),
  new SlashCommandBuilder().setName("ticket-blacklist").setDescription("Block a user from opening carry tickets").addUserOption((opt) => opt.setName("user").setDescription("User to blacklist").setRequired(true)).addStringOption((opt) => opt.setName("reason").setDescription("Reason for the blacklist").setRequired(true)),
  new SlashCommandBuilder().setName("ticket-unblacklist").setDescription("Remove a user from the carry ticket blacklist").addUserOption((opt) => opt.setName("user").setDescription("User to unblacklist").setRequired(true)),
  new SlashCommandBuilder().setName("helper-stats").setDescription("Show helper profile stats card").addUserOption((opt) => opt.setName("helper").setDescription("Helper user").setRequired(true)),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Show helper leaderboard card").addIntegerOption((opt) => opt.setName("limit").setDescription("How many helpers to show (max 10)").setRequired(false)),
  new SlashCommandBuilder().setName("recent-vouches").setDescription("Show recent vouches").addUserOption((opt) => opt.setName("helper").setDescription("Optional helper filter").setRequired(false)).addIntegerOption((opt) => opt.setName("limit").setDescription("How many vouches to show").setRequired(false).setMinValue(1).setMaxValue(10)),
  new SlashCommandBuilder().setName("vouch-games").setDescription("Show a helper's vouch breakdown by game").addUserOption((opt) => opt.setName("helper").setDescription("Helper user").setRequired(true)),
  new SlashCommandBuilder().setName("daily-messages").setDescription("Show today's message count").addUserOption((opt) => opt.setName("user").setDescription("User to check").setRequired(false)),
  new SlashCommandBuilder().setName("vouch_give").setDescription("Staff/Admin: manually award a vouch to a helper").addUserOption((opt) => opt.setName("helper").setDescription("Helper who should receive the vouch").setRequired(true)).addStringOption((opt) => opt.setName("game").setDescription("Service key").setRequired(true)).addIntegerOption((opt) => opt.setName("rating").setDescription("Rating from 1 to 5").setRequired(true).setMinValue(1).setMaxValue(5)).addStringOption((opt) => opt.setName("message").setDescription("Feedback text").setRequired(true).setMinLength(15).setMaxLength(500)),
  new SlashCommandBuilder().setName("get-carry-emoji-env").setDescription("Get .env lines for carry panel custom emojis"),
  new SlashCommandBuilder().setName("cleanup-all-tickets").setDescription("Delete all active ticket channels in the server"),
  new SlashCommandBuilder().setName("purge_all_tickets").setDescription("Delete all ticket channels (open and old)"),
  new SlashCommandBuilder().setName("purge_name_ticket").setDescription("Delete a selected ticket channel").addChannelOption((opt) => opt.setName("channel").setDescription("Ticket channel").setRequired(true)),
  new SlashCommandBuilder().setName("user_ticket_remove").setDescription("Delete your own ticket channel").addChannelOption((opt) => opt.setName("channel").setDescription("Optional ticket channel").setRequired(false)),
  new SlashCommandBuilder().setName("reset-daily-messages").setDescription("Reset all daily message statistics (Admin only)"),
].map((command) => command.toJSON() as ChatInputApplicationCommandData);

function noticePayload(title: string, description: string, accentColor = 0x5865f2) {
  return buildNotice(title, description, accentColor);
}

async function sendNotice(target: { send: (options: any) => Promise<any> }, title: string, description: string, accentColor = 0x5865f2, extra: Record<string, unknown> = {}) {
  return target.send({ ...(noticePayload(title, description, accentColor) as any), ...extra });
}

function formatVouchTime(value: string | null | undefined) {
  if (!value) return "unknown";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "unknown";
  return `<t:${Math.floor(parsed / 1000)}:R>`;
}

async function getHelperSnapshotData(guildId: string, helperId: string) {
  const [stats, breakdown, recent] = await Promise.all([
    db.getHelperStats(guildId, helperId).catch(() => ({ total: 0, average: 0, fiveStarRate: 0, topGame: "N/A" })),
    db.getHelperGameBreakdown(guildId, helperId).catch(() => []),
    db.getRecentVouches(guildId, 3, helperId).catch(() => []),
  ]);
  const helperUser = await client.users.fetch(helperId).catch(() => null);
  return {
    helperTag: helperUser?.username ?? `Unknown (${helperId})`,
    avatarUrl: helperUser?.displayAvatarURL({ extension: "png", size: 256 }) ?? "",
    total: stats.total,
    average: stats.average,
    fiveStarRate: stats.fiveStarRate,
    topGame: stats.topGame,
    breakdown,
    recent: recent.map((row) => ({
      rating: row.rating,
      message: row.message,
      createdAt: row.created_at,
    })),
  };
}

async function sendHelperSnapshotDm(userId: string, guildId: string, helperId: string) {
  const [user, snapshot] = await Promise.all([
    client.users.fetch(userId).catch(() => null),
    getHelperSnapshotData(guildId, helperId),
  ]);
  if (!user) return false;
  const imageBuffer = await buildHelperSnapshotCard(snapshot);
  await user.send({ files: [new AttachmentBuilder(imageBuffer, { name: `helper-snapshot-${helperId}.png` })] }).catch(() => null);
  return true;
}

async function replyNotice(interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | Interaction<CacheType>, title: string, description: string, accentColor = 0x5865f2, ephemeral = true) {
  const payload = { ...noticePayload(title, description, accentColor), ephemeral } as any;
  try {
    if ("reply" in interaction && interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply(payload);
      return;
    }
    if ("editReply" in interaction && interaction.deferred) {
      await interaction.editReply(noticePayload(title, description, accentColor) as any);
      return;
    }
    if ("followUp" in interaction && (interaction.replied || interaction.deferred)) {
      await interaction.followUp(payload);
    }
  } catch (error) {
    if (error instanceof DiscordAPIError && (error.code === 40060 || error.code === 10062)) {
      return;
    }
    throw error;
  }
}

function parseGameKey(raw: string): GameKey | null {
  const value = raw.trim().toUpperCase() as GameKey;
  return value in GAME_LABEL ? value : null;
}

function scheduleCooldownReminder(guildId: string, userId: string, endsAt: Date, channelId?: string | null) {
  cooldownReminders.set(String(userId), { guildId: String(guildId), userId: String(userId), channelId, endsAt });
}

function clearCooldownReminder(userId: string) {
  cooldownReminders.delete(String(userId));
}

async function fetchTicket(channelId: string | null | undefined): Promise<TicketViewModel | null> {
  if (!channelId) return null;
  const cached = ticketState.get(channelId);
  if (cached) return cached;
  const row = await db.getTicketByChannelId(channelId).catch(() => null);
  const ticket = ticketFromDbRow(row);
  if (ticket) ticketState.set(channelId, ticket);
  return ticket;
}

async function getTicketOwnerId(channel: GuildTextBasedChannel | null): Promise<{ ownerId: string | null; ticket: TicketViewModel | null }> {
  if (!channel || channel.type !== ChannelType.GuildText) return { ownerId: null, ticket: null };
  const ticket = await fetchTicket(channel.id);
  if (ticket?.userId) return { ownerId: ticket.userId, ticket };
  const meta = extractTicketMeta(channel.topic ?? "");
  return { ownerId: meta.ownerId ?? null, ticket };
}

function canCloseTicket(member: GuildMember | null, actorId: string, ownerId: string | null, ticket: TicketViewModel | null) {
  if (actorId === ownerId) return true;
  if (canCloseAnyTicket(member)) return true;
  if (ticket && isHelperForGame(member, ticket.gameKey)) return true;
  return false;
}

async function reconcileOpenTicketRecord(guild: Guild, ticketRow: CarryTicketRow | null, closedBy: string) {
  if (!ticketRow?.channel_id) return ticketRow;
  const channel = await resolveGuildChannel(guild, ticketRow.channel_id);
  if (channel) return ticketRow;
  await db.closeTicket(ticketRow.channel_id, closedBy).catch((error) => console.error("[ticket] Failed to auto-close missing channel", error));
  ticketState.delete(ticketRow.channel_id);
  return null;
}

async function getTicketGateState(guild: Guild, userId: string, member: GuildMember | null) {
  const openTicket = await db.getOpenTicketForUser(guild.id, userId).then((row) => reconcileOpenTicketRecord(guild, row, "system:missing-channel")).catch(() => null);
  const blacklist = await db.getTicketBlacklistEntry(guild.id, userId).catch(() => null);
  const lastVouch = await db.getLastVouchTime(guild.id, userId).catch(() => null);
  const cooldown = getVouchCooldownState(lastVouch);
  return { openTicket, blacklist, cooldown, booster: isBooster(member) };
}

async function sendLog(guild: Guild, text: string) {
  const channel = await getConfiguredTextChannel(guild, cfg.logChannelId, ["log", "bot-log", "system-log"]);
  if (!channel) return;
  await sendNotice(channel, "System Log", text, 0x7a92ff).catch(() => undefined);
}

async function closeTicketAndNotify(channel: TextChannel, guild: Guild, closedBy: string, actorId: string) {
  const ticket = await fetchTicket(channel.id);
  const shouldRequestVouch = Boolean(ticket && ticket.claimedBy && !ticket.vouched);
  const ticketOwnerId = ticket?.userId ?? null;
  const ticketNum = ticket?.ticketNum ?? null;
  await db.closeTicket(channel.id, closedBy);
  if (shouldRequestVouch && ticketOwnerId) {
    await db.markVouchFollowupRequested(channel.id).catch((error) => console.error("[vouch] followup request error", error));
    await sendPendingVouchDm(ticketOwnerId, ticketNum, undefined);
  }
  ticketState.delete(channel.id);
  await sendLog(guild, `Carry request closed: <#${channel.id}> by <@${actorId}>`);
}

async function sendPendingVouchDm(userId: string, ticketNum: number | null, hoursElapsed?: number) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return false;
  const ticketLabel = ticketNum !== null ? `#${String(ticketNum).padStart(4, "0")}` : "your closed ticket";
  const reminderLine = hoursElapsed !== undefined ? `\nReminder: it has been about ${hoursElapsed} hour(s) without a vouch.` : "";
  await sendNotice(user, "Pending Vouch", `Your Rune ticket ${ticketLabel} was closed without a vouch.${reminderLine}\nPlease submit your vouch for the helper as soon as possible.`, 0xfaa61a).catch(() => null);
  return true;
}

async function updateTicketMessage(channel: TextChannel, ticket: TicketViewModel) {
  if (!ticket.msgId) return;
  const msg = await channel.messages.fetch(ticket.msgId).catch(() => null);
  if (!msg) return;
  await msg.edit(buildTicketMessage(ticket)).catch((error) => console.error("[ticket] edit failed", error));
}

async function createManualVouchPost(interaction: ChatInputCommandInteraction, helper: GuildMember, gameRaw: string, rating: number, message: string) {
  const gameKey = parseGameKey(gameRaw);
  if (!gameKey) throw new Error("Service must be one of: ALS, AG, AC, UTD, AV, AO, BL, SP.");
  if (rating < 1 || rating > 5) throw new Error("Rating must be a whole number between 1 and 5.");

  const baseStats = await db.getHelperStats(interaction.guildId!, helper.id).catch(() => ({ total: 0, average: 0, fiveStarRate: 0, topGame: gameKey }));
  const nextTotal = baseStats.total + 1;
  const nextAvg = Math.round((((baseStats.average * (nextTotal - 1)) + rating) / nextTotal) * 100) / 100;
  const nextFive = Math.round((baseStats.fiveStarRate / 100) * (nextTotal - 1)) + (rating === 5 ? 1 : 0);
  const nextFiveRate = Math.round((nextFive / nextTotal) * 1000) / 10;
  const imageBuffer = await buildVouchCard({
    clientTag: `Staff Awarded by ${interaction.user.username}`,
    helperTag: helper.user.username,
    helperAvatarUrl: helper.displayAvatarURL({ extension: "png", size: 256 }),
    clientAvatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 256 }),
    gameLabel: GAME_LABEL[gameKey],
    rating,
    message,
    stats: {
      total: nextTotal,
      average: nextAvg,
      fiveStarRate: nextFiveRate,
      topGame: baseStats.topGame === "N/A" ? gameKey : baseStats.topGame,
    },
  });

  const targetChannel = await getConfiguredTextChannel(interaction.guild!, cfg.vouchChannelId, ["vouch", "vouches", "feedback"]);
  if (!targetChannel) throw new Error("Vouch channel is not configured correctly or does not exist.");
  const filename = `vouch-manual-${helper.id}-${Math.floor(Date.now() / 1000)}.png`;
  const sent = await targetChannel.send({ files: [new AttachmentBuilder(imageBuffer, { name: filename })] });
  if (rating === 5) {
    const highlightChannel = await getConfiguredTextChannel(interaction.guild!, cfg.highlightChannelId, ["highlight", "highlights"]);
    if (highlightChannel) {
      await highlightChannel.send({
        ...buildHighlightMessage(helper.toString(), `Staff: <@${interaction.user.id}>`, GAME_LABEL[gameKey], rating, interaction.guild!.name, sent.url, true),
        files: [new AttachmentBuilder(imageBuffer, { name: filename })],
      }).catch((error: unknown) => console.error("[highlight] manual post failed", error));
    }
  }
  await db.createVouch({
    guild_id: interaction.guildId!,
    user_id: interaction.user.id,
    helper_user_id: helper.id,
    game_key: gameKey,
    rating,
    message: `[STAFF AWARDED] ${message}`,
    message_id: sent.id,
    channel_id: targetChannel.id,
    created_at: new Date().toISOString(),
  }).catch((error) => console.error("[vouch] manual save failed", error));
  return { targetChannel, gameLabel: GAME_LABEL[gameKey] };
}

function makeVouchModal(helperId?: string | null, gameKey?: GameKey | null) {
  const modal = new ModalBuilder().setCustomId([VOUCH_MODAL, helperId ?? "", gameKey ?? ""].join(":")).setTitle("Create Vouch");
  const components = [];
  if (!helperId) {
    components.push({ type: 1 as const, components: [new TextInputBuilder().setCustomId("helper").setLabel("Helper user ID or mention").setRequired(true).setStyle(TextInputStyle.Short).toJSON()] });
  }
  if (!gameKey) {
    components.push({ type: 1 as const, components: [new TextInputBuilder().setCustomId("game").setLabel("Service (ALS, AG, AC, UTD, AV, AO, BL, SP)").setRequired(true).setStyle(TextInputStyle.Short).toJSON()] });
  }
  components.push({ type: 1 as const, components: [new TextInputBuilder().setCustomId("rating").setLabel("Rating from 1 to 5").setRequired(true).setStyle(TextInputStyle.Short).toJSON()] });
  components.push({ type: 1 as const, components: [new TextInputBuilder().setCustomId("message").setLabel("Your feedback").setRequired(true).setMinLength(15).setMaxLength(500).setStyle(TextInputStyle.Paragraph).toJSON()] });
  modal.addComponents(...components);
  return modal;
}

async function handleCarrySelect(interaction: StringSelectMenuInteraction) {
  const gameKey = parseGameKey(interaction.values[0] ?? "");
  if (!interaction.guild || !gameKey) {
    await replyNotice(interaction, "Invalid Service", "Invalid service selection.", 0xff0000);
    return;
  }
  userSelectedGame.set(interaction.user.id, gameKey);
  const modal = new ModalBuilder().setCustomId(CARRY_MODAL).setTitle("Carry Request Details");
  modal.addComponents(
    { type: 1, components: [new TextInputBuilder().setCustomId("ign").setLabel("Your In-Game Username").setRequired(true).setMaxLength(32).setStyle(TextInputStyle.Short).toJSON()] },
    { type: 1, components: [new TextInputBuilder().setCustomId("request").setLabel("What do you need help with?").setRequired(true).setMinLength(10).setMaxLength(600).setStyle(TextInputStyle.Paragraph).toJSON()] },
  );
  await interaction.showModal(modal);
}

async function handleCarryModal(interaction: Interaction<CacheType>) {
  if (!interaction.isModalSubmit() || interaction.customId !== CARRY_MODAL || !interaction.guild) return false;
  const gameKey = userSelectedGame.get(interaction.user.id);
  userSelectedGame.delete(interaction.user.id);
  if (!gameKey) {
    await replyNotice(interaction, "Session Expired", "Please select a service again.", 0xff0000);
    return true;
  }
  await interaction.deferReply({ ephemeral: true });
  const member = interaction.member instanceof GuildMember ? interaction.member : null;
  if (!isOwner(interaction.user.id)) {
    const gate = await getTicketGateState(interaction.guild, interaction.user.id, member);
    if (gate.blacklist) {
      await interaction.editReply(noticePayload("Ticket Blacklisted", `You are blacklisted from opening carry tickets.\nReason: \`${gate.blacklist.reason ?? "No reason provided."}\``, 0xff0000) as any);
      return true;
    }
    if (gate.openTicket && !gate.booster) {
      await interaction.editReply(noticePayload("Open Ticket Exists", `You already have an open carry request in <#${gate.openTicket.channel_id}>. Close that ticket first or continue there.`, 0xfee75c) as any);
      return true;
    }
    if (gate.cooldown?.active) {
      scheduleCooldownReminder(interaction.guild.id, interaction.user.id, gate.cooldown.endsAt, interaction.channelId);
      await interaction.editReply(noticePayload("Cooldown Active", `You are still on cooldown for **${formatDuration(gate.cooldown.remainingSeconds)}**.\nCooldown ends: <t:${Math.floor(gate.cooldown.endsAt.getTime() / 1000)}:R>\nRule: submit a vouch, then wait **${VOUCH_COOLDOWN_HOURS} hours**.`, 0xfee75c) as any);
      return true;
    }
  }

  const ign = interaction.fields.getTextInputValue("ign").trim();
  const requestText = interaction.fields.getTextInputValue("request").trim();
  const staffRoleId = normalizeSnowflake(cfg.staffRoleId);
  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18) || "user";
  const ticketNum = await db.getNextTicketNumber(interaction.guild.id).catch(() => 1);
  const channelName = `carry-${gameKey.toLowerCase()}-${String(ticketNum).padStart(4, "0")}-${safeName}`;

  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (staffRoleId) overwrites.push({ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  const helperRole = findGameRoleInGuild(interaction.guild, gameKey);
  if (helperRole && helperRole.id !== staffRoleId) {
    overwrites.push({ id: helperRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  // Force-refresh channels cache so the category is resolvable
  await interaction.guild.channels.fetch().catch(() => undefined);

  const configuredCategoryId = ticketCategoryId(gameKey);
  const category = await findTicketCategory(interaction.guild, gameKey);
  if (configuredCategoryId) {
    console.log(`[ticket] using configured category ${configuredCategoryId} for ${gameKey} in guild ${interaction.guild.id}`);
  } else {
    console.error(`[ticket] no configured category found for ${gameKey} in guild ${interaction.guild.id}`);
  }
  if (configuredCategoryId && !category) {
    console.error(`[ticket] configured category ${configuredCategoryId} for ${gameKey} was not resolved via fetch/cache`);
  }
  const createdChannel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    topic: `carry:${interaction.user.id}:${gameKey}`,
    parent: category ?? configuredCategoryId ?? undefined,
    permissionOverwrites: overwrites,
  }).catch(async (error) => {
    await interaction.editReply(noticePayload("Ticket Creation Failed", `Failed to create the ticket channel: ${error}`, 0xff0000) as any);
    return null;
  });
  if (!(createdChannel instanceof TextChannel)) return true;
  if (configuredCategoryId && createdChannel.parentId !== configuredCategoryId) {
    await createdChannel.setParent(configuredCategoryId, { lockPermissions: false }).catch((error) => console.error(`[ticket] failed to move channel ${createdChannel.id} to category ${configuredCategoryId}`, error));
  }
  if (configuredCategoryId) {
    console.log(`[ticket] channel ${createdChannel.id} assigned to category ${configuredCategoryId} for ${gameKey}`);
  }

  const ticket: TicketViewModel = {
    userId: interaction.user.id,
    gameKey,
    gameLabel: GAME_LABEL[gameKey],
    ign,
    request: requestText,
    createdAtMs: Date.now(),
    ticketNum,
    claimedBy: null,
    claimedAt: null,
    firstHelperResponseAt: null,
    reminderSentAt: null,
    vouched: false,
    msgId: null,
    closedAt: null,
    closedBy: null,
    vouchRequestedAt: null,
  };

  const helperPing = helperRole?.toString() ?? helperRoleMention(gameKey);
  await sendNotice(createdChannel, "New Carry Request", `${helperPing} <@${interaction.user.id}>`, 0x6c4dff);
  const msg = await createdChannel.send(buildTicketMessage(ticket));
  ticket.msgId = msg.id;
  ticketState.set(createdChannel.id, ticket);
  await db.createTicket({
    guild_id: interaction.guild.id,
    channel_id: createdChannel.id,
    user_id: interaction.user.id,
    game_key: gameKey,
    game_label: GAME_LABEL[gameKey],
    ign,
    request: requestText,
    ticket_num: ticketNum,
    msg_id: msg.id,
    status: "open",
    created_at: new Date().toISOString(),
  }).catch((error) => console.error("[db] Failed to save ticket", error));
  await interaction.editReply(noticePayload("Carry Request Ready", `Your carry request is ready: ${createdChannel.toString()}`, 0x4ade80) as any);
  await sendLog(interaction.guild, `Carry request opened: ${createdChannel.toString()} by <@${interaction.user.id}> for ${GAME_LABEL[gameKey]}`);
  return true;
}

async function handleVouchModal(interaction: Interaction<CacheType>) {
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith(VOUCH_MODAL) || !interaction.guild) return false;
  await interaction.deferReply({ ephemeral: true });
  const parts = interaction.customId.split(":");
  const forcedHelperId = parts[2] || null;
  const forcedGameKey = parseGameKey(parts[3] ?? "");
  const helperId = (forcedHelperId ?? interaction.fields.getTextInputValue("helper").replace(/\D/g, "")).trim();
  const gameKey = forcedGameKey ?? parseGameKey(interaction.fields.getTextInputValue("game"));
  const rating = Number(interaction.fields.getTextInputValue("rating"));
  const message = interaction.fields.getTextInputValue("message").trim();

  if (!helperId) {
    await interaction.editReply(noticePayload("Invalid Helper", "Enter a valid helper mention or ID.", 0xff0000) as any);
    return true;
  }
  if (!gameKey) {
    await interaction.editReply(noticePayload("Invalid Service", "Service must be one of: ALS, AG, AC, UTD, AV, AO, BL, SP.", 0xff0000) as any);
    return true;
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    await interaction.editReply(noticePayload("Invalid Rating", "Rating must be a whole number between 1 and 5.", 0xff0000) as any);
    return true;
  }
  const helperUser = await client.users.fetch(helperId).catch(() => null);
  if (!helperUser) {
    await interaction.editReply(noticePayload("Helper Not Found", "I could not find that helper user.", 0xff0000) as any);
    return true;
  }

  const pendingClosedTicket = await db.getLatestUnvouchedClosedTicket(interaction.guild.id, interaction.user.id).catch(() => null);
  const baseStats = await db.getHelperStats(interaction.guild.id, helperId).catch(() => ({ total: 0, average: 0, fiveStarRate: 0, topGame: gameKey }));
  const nextTotal = baseStats.total + 1;
  const nextAvg = Math.round((((baseStats.average * (nextTotal - 1)) + rating) / nextTotal) * 100) / 100;
  const nextFive = Math.round((baseStats.fiveStarRate / 100) * (nextTotal - 1)) + (rating === 5 ? 1 : 0);
  const nextFiveRate = Math.round((nextFive / nextTotal) * 1000) / 10;
  const imageBuffer = await buildVouchCard({
    clientTag: interaction.user.username,
    helperTag: helperUser.username,
    helperAvatarUrl: helperUser.displayAvatarURL({ extension: "png", size: 256 }),
    clientAvatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 256 }),
    gameLabel: GAME_LABEL[gameKey],
    rating,
    message,
    stats: {
      total: nextTotal,
      average: nextAvg,
      fiveStarRate: nextFiveRate,
      topGame: baseStats.topGame === "N/A" ? gameKey : baseStats.topGame,
    },
  });

  const targetChannel = await getConfiguredTextChannel(interaction.guild, cfg.vouchChannelId, ["vouch", "vouches", "feedback"]);
  if (!targetChannel) {
    await interaction.editReply(noticePayload("Vouch Channel Missing", "Vouch channel is not configured correctly or does not exist.", 0xff0000) as any);
    return true;
  }
  const filename = `vouch-${interaction.user.id}-${Math.floor(Date.now() / 1000)}.png`;
  const sent = await targetChannel.send({ files: [new AttachmentBuilder(imageBuffer, { name: filename })] });

  if (rating === 5) {
    const highlightChannel = await getConfiguredTextChannel(interaction.guild, cfg.highlightChannelId, ["highlight", "highlights"]);
    if (highlightChannel) {
      await highlightChannel.send({
        ...buildHighlightMessage(`<@${helperId}>`, `<@${interaction.user.id}>`, GAME_LABEL[gameKey], rating, interaction.guild.name, sent.url, false),
        files: [new AttachmentBuilder(imageBuffer, { name: filename })],
      }).catch((error: unknown) => console.error("[highlight] failed", error));
    }
  }

  const currentTicket = interaction.channel?.isTextBased() ? await fetchTicket(interaction.channelId) : null;
  const matchedPendingTicket = currentTicket && !currentTicket.vouched ? currentTicket : ticketFromDbRow(pendingClosedTicket);
  await db.createVouch({
    guild_id: interaction.guild.id,
    user_id: interaction.user.id,
    helper_user_id: helperId,
    game_key: gameKey,
    rating,
    message,
    message_id: sent.id,
    channel_id: targetChannel.id,
    created_at: new Date().toISOString(),
  }).catch((error) => console.error("[vouch] save failed", error));

  const ticketChannelId = currentTicket ? interaction.channelId : pendingClosedTicket?.channel_id;
  if (matchedPendingTicket && ticketChannelId) {
    matchedPendingTicket.vouched = true;
    if (interaction.channel instanceof TextChannel && currentTicket) {
      ticketState.set(interaction.channel.id, matchedPendingTicket);
      await updateTicketMessage(interaction.channel, matchedPendingTicket);
    }
    await db.markTicketVouched(ticketChannelId).catch((error) => console.error("[vouch] mark ticket failed", error));
    scheduleCooldownReminder(interaction.guild.id, interaction.user.id, new Date(Date.now() + VOUCH_COOLDOWN_HOURS * 3_600_000), ticketChannelId);
  }

  const inTicket = interaction.channel instanceof TextChannel && Boolean(extractTicketMeta(interaction.channel.topic ?? "").ownerId);
  await sendHelperSnapshotDm(interaction.user.id, interaction.guild.id, helperId);
  await interaction.deleteReply().catch(() => undefined);
  if (inTicket && interaction.channel instanceof TextChannel) {
    setTimeout(() => {
      interaction.channel?.delete("Carry request completed & vouched").catch(() => undefined);
      if (interaction.channelId) ticketState.delete(interaction.channelId);
    }, 5000);
  }
  return true;
}

async function handleButton(interaction: Interaction<CacheType>) {
  if (!interaction.isButton() || !interaction.guild || !(interaction.channel instanceof TextChannel)) return false;
  if (interaction.customId === VOUCH_BUTTON) {
    await interaction.showModal(makeVouchModal());
    return true;
  }
  const ticket = await fetchTicket(interaction.channelId);
  const member = interaction.member instanceof GuildMember ? interaction.member : null;

  if (interaction.customId === TICKET_CLAIM) {
    if (!ticket) {
      await replyNotice(interaction, "Ticket Missing", "Carry data missing.", 0xff0000);
      return true;
    }
    if (ticket.claimedBy) {
      await replyNotice(interaction, "Already Claimed", `Already claimed by <@${ticket.claimedBy}>.`, 0xfee75c);
      return true;
    }
    if (!isHelperForGame(member, ticket.gameKey)) {
      await replyNotice(interaction, "Not Allowed", "You are not a helper for this game.", 0xff0000);
      return true;
    }
    ticket.claimedBy = interaction.user.id;
    ticket.claimedAt = new Date().toISOString();
    ticketState.set(interaction.channelId, ticket);
    await db.updateTicketClaimed(interaction.channelId, interaction.user.id);
    await updateTicketMessage(interaction.channel, ticket);
    await sendHelperSnapshotDm(ticket.userId, interaction.guild.id, interaction.user.id);
    await replyNotice(interaction, "Ticket Claimed", `Ticket claimed by ${interaction.user.toString()}.`, 0x4ade80);
    await sendLog(interaction.guild, `Claimed: <#${interaction.channelId}> by ${interaction.user.toString()}`);
    return true;
  }

  if (interaction.customId === TICKET_UNCLAIM) {
    if (!ticket?.claimedBy) {
      await replyNotice(interaction, "Not Claimed", "Not claimed.", 0xff0000);
      return true;
    }
    if (interaction.user.id !== ticket.claimedBy && !isStaff(member)) {
      await replyNotice(interaction, "Not Allowed", "Only the helper or staff can unclaim.", 0xff0000);
      return true;
    }
    ticket.claimedBy = null;
    ticket.claimedAt = null;
    ticketState.set(interaction.channelId, ticket);
    await db.unclaimTicket(interaction.channelId);
    await updateTicketMessage(interaction.channel, ticket);
    await replyNotice(interaction, "Ticket Unclaimed", `Ticket unclaimed by ${interaction.user.toString()}.`, 0x4ade80);
    return true;
  }

  if (interaction.customId === TICKET_VOUCH_BTN) {
    if (!ticket?.claimedBy) {
      await replyNotice(interaction, "Claim Required", "Claim required for vouch.", 0xff0000);
      return true;
    }
    if (interaction.user.id !== ticket.userId) {
      await replyNotice(interaction, "Not Allowed", "Only the customer can vouch.", 0xff0000);
      return true;
    }
    await interaction.showModal(makeVouchModal(ticket.claimedBy, ticket.gameKey));
    return true;
  }

  if (interaction.customId === TICKET_CLOSE_BTN) {
    const ownerId = ticket?.userId ?? extractTicketMeta(interaction.channel.topic ?? "").ownerId ?? null;
    if (!ownerId && !isTicketChannel(interaction.channel)) {
      await replyNotice(interaction, "Invalid Channel", "This command only works in ticket channels.", 0xff0000);
      return true;
    }
    if (!canCloseTicket(member, interaction.user.id, ownerId, ticket)) {
      await replyNotice(interaction, "Permission Denied", "You do not have permission to close this ticket.", 0xff0000);
      return true;
    }
    await closeTicketAndNotify(interaction.channel, interaction.guild, interaction.user.id, interaction.user.id).catch(async (error) => {
      await replyNotice(interaction, "Close Failed", `Failed to close ticket: ${error}`, 0xff0000);
    });
    if (!interaction.replied) {
      await replyNotice(interaction, "Ticket Closed", "Ticket closed. This channel will be deleted in 3 seconds.", 0x4ade80);
      setTimeout(() => interaction.channel?.delete("Ticket closed").catch(() => undefined), 3000);
    }
    return true;
  }
  return false;
}

async function syncCommands() {
  const rest = new REST({ version: "10" }).setToken(cfg.token);
  await rest.put(Routes.applicationCommands(cfg.clientId), { body: commands });
  for (const guild of client.guilds.cache.values()) {
    await rest.put(Routes.applicationGuildCommands(cfg.clientId, guild.id), { body: commands });
  }
}

async function setupCarryPanel(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel("channel", true);
      if (!(channel instanceof TextChannel)) {
        await replyNotice(interaction, "Invalid Channel", "Target must be a text channel.", 0xff0000);
        return;
      }
  await interaction.deferReply({ ephemeral: true });
  const emojis = await getCarryEmojis(interaction.guild);
  const options = getGameOptionKeys(interaction.guild).map((item) => {
    const optionEmoji = emojis.get(item.emojiKey)?.option;
    return {
      label: item.label,
      value: item.value,
      description: item.description,
      emoji: optionEmoji ? { id: optionEmoji.id, name: optionEmoji.name ?? undefined, animated: optionEmoji.animated } : undefined,
    };
  });
  const bullet = emojis.get("bullet")?.embed ?? "•";
  const supportedGames = buildSupportedGamesText(getEnabledGames(interaction.guild));
  const menuInfoRef = interaction.guildId === RUNE_GUILD_ID ? `<#${RUNE_MENU_INFO_CHANNEL_ID}>` : undefined;
  await channel.send(buildCarryPanel(options, interaction.guild!.name, bullet, supportedGames, interaction.guildId === RUNE_GUILD_ID, menuInfoRef));
  await interaction.editReply(buildNotice("Carry Panel Posted", `${interaction.guild!.name} carry panel posted in ${channel.toString()}.`, 0x4ade80));
}

async function setupVouchPanel(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel("channel", true);
  if (!(channel instanceof TextChannel)) {
    await replyNotice(interaction, "Invalid Channel", "Target must be a text channel.", 0xff0000);
    return;
  }
  await channel.send(buildVouchPanel(interaction.guild!.name));
  await interaction.reply({ ...buildNotice("Vouch Panel Posted", `Vouch panel posted in ${channel.toString()}.`, 0x4ade80), ephemeral: true });
}

async function handleChatCommand(interaction: ChatInputCommandInteraction) {
  const member = interaction.member instanceof GuildMember ? interaction.member : null;
  const adminOnly = new Set([
    "setup-carry-panel",
    "setup-vouch-panel",
    "cleanup-all-tickets",
    "purge_all_tickets",
    "purge_name_ticket",
    "ticket-blacklist",
    "ticket-unblacklist",
    "get-carry-emoji-env",
    "reset-daily-messages",
    "vouch_give",
  ]);
  if (adminOnly.has(interaction.commandName) && !canUseAdminCommands(member)) {
    await replyNotice(interaction, "Permission Denied", "Only admin, owner, or authorized staff can use slash commands.", 0xff0000);
    return;
  }

  switch (interaction.commandName) {
    case "setup-carry-panel":
      await setupCarryPanel(interaction);
      return;
    case "setup-vouch-panel":
      await setupVouchPanel(interaction);
      return;
    case "close-ticket": {
      if (!(interaction.channel instanceof TextChannel)) {
        await replyNotice(interaction, "Invalid Channel", "This command only works in ticket channels.", 0xff0000);
        return;
      }
      const { ownerId, ticket } = await getTicketOwnerId(interaction.channel);
      if (!ownerId && !isTicketChannel(interaction.channel)) {
        await replyNotice(interaction, "Invalid Channel", "This command only works in ticket channels.", 0xff0000);
        return;
      }
      if (!canCloseTicket(member, interaction.user.id, ownerId, ticket)) {
        await replyNotice(interaction, "Permission Denied", "You do not have permission to close this ticket.", 0xff0000);
        return;
      }
      await closeTicketAndNotify(interaction.channel, interaction.guild!, interaction.user.id, interaction.user.id);
      await replyNotice(interaction, "Carry Request Closed", "This channel will be deleted in 3 seconds.", 0x4ade80);
      setTimeout(() => interaction.channel?.delete("Carry request closed").catch(() => undefined), 3000);
      return;
    }
    case "transfer-ticket": {
      if (!(interaction.channel instanceof TextChannel)) {
        await replyNotice(interaction, "Invalid Channel", "This command only works in an active carry ticket.", 0xff0000);
        return;
      }
      const helper = await interaction.guild!.members.fetch(interaction.options.getUser("helper", true).id).catch(() => null);
      const ticket = await fetchTicket(interaction.channelId);
      if (!ticket || !helper) {
        await replyNotice(interaction, "Ticket Missing", "This command only works in an active carry ticket.", 0xff0000);
        return;
      }
      const isCurrentHelper = Boolean(ticket.claimedBy && interaction.user.id === ticket.claimedBy);
      if (!isCurrentHelper && !isStaff(member)) {
        await replyNotice(interaction, "Permission Denied", "Only the claimed helper or staff can transfer this ticket.", 0xff0000);
        return;
      }
      if (helper.user.bot) {
        await replyNotice(interaction, "Invalid Helper", "You cannot transfer a ticket to a bot.", 0xff0000);
        return;
      }
      if (!isHelperForGame(helper, ticket.gameKey)) {
        await replyNotice(interaction, "Invalid Helper", "That member is not a helper for this game.", 0xff0000);
        return;
      }
      ticket.claimedBy = helper.id;
      ticket.claimedAt = new Date().toISOString();
      ticketState.set(interaction.channelId, ticket);
      await db.updateTicketClaimed(interaction.channelId, helper.id);
      await updateTicketMessage(interaction.channel, ticket);
      await sendHelperSnapshotDm(ticket.userId, interaction.guildId!, helper.id);
      await replyNotice(interaction, "Ticket Transferred", `Ticket transferred to ${helper.toString()}.`, 0x4ade80);
      await sendLog(interaction.guild!, `Carry request transferred: <#${interaction.channelId}> to ${helper.toString()}`);
      return;
    }
    case "cooldown-status": {
      const targetUser = interaction.options.getUser("user", false) ?? interaction.user;
      const openTicket = await db.getOpenTicketForUser(interaction.guildId!, targetUser.id).catch(() => null);
      const lastVouch = await db.getLastVouchTime(interaction.guildId!, targetUser.id).catch(() => null);
      const cooldown = getVouchCooldownState(lastVouch);
      const blacklist = await db.getTicketBlacklistEntry(interaction.guildId!, targetUser.id).catch(() => null);
      await interaction.reply({
        ...(noticePayload("Carry Cooldown Status", [
          `Status for <@${targetUser.id}>`,
          `Open Ticket: ${openTicket?.channel_id ? `<#${openTicket.channel_id}>` : "None"}`,
          cooldown?.active ? `Cooldown: Active for ${formatDuration(cooldown.remainingSeconds)}` : "Cooldown: Ready now",
          cooldown?.active ? `Ends: <t:${Math.floor(cooldown.endsAt.getTime() / 1000)}:R>` : "Ends: No active cooldown",
          `Rule: ${VOUCH_COOLDOWN_HOURS} hours after a submitted vouch`,
          `Blacklist: ${blacklist ? `Blocked - ${blacklist.reason ?? "No reason set"}` : "Not blacklisted"}`,
        ].join("\n"), 0x5865f2) as any),
        ephemeral: true,
      });
      return;
    }
    case "ticket-blacklist": {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason", true).trim();
      await db.addTicketBlacklist(interaction.guildId!, user.id, reason, interaction.user.id);
      await replyNotice(interaction, "User Blacklisted", `${user.toString()} can no longer open carry tickets.\nReason: \`${reason}\``, 0xff0000);
      return;
    }
    case "ticket-unblacklist": {
      const user = interaction.options.getUser("user", true);
      const entry = await db.getTicketBlacklistEntry(interaction.guildId!, user.id).catch(() => null);
      await db.removeTicketBlacklist(interaction.guildId!, user.id);
      await replyNotice(interaction, entry ? "User Unblacklisted" : "No Blacklist Entry", entry ? `${user.toString()} can open carry tickets again.` : `${user.toString()} was not blacklisted.`, entry ? 0x4ade80 : 0xfee75c);
      return;
    }
    case "helper-stats": {
      await interaction.deferReply();
      const helper = interaction.options.getUser("helper", true);
      const stats = await db.getHelperStats(interaction.guildId!, helper.id).catch(() => null);
      if (!stats || stats.total === 0) {
        await interaction.editReply(noticePayload("No Stats Found", `No vouches found for ${helper.toString()} yet.`, 0xff0000) as any);
        return;
      }
      const leaderboard = await db.getLeaderboard(interaction.guildId!, 50).catch(() => []);
      const rank = leaderboard.findIndex((entry) => entry.helperId === helper.id) + 1;
      const imageBuffer = await buildHelperProfileCard({
        helperTag: helper.username,
        avatarUrl: helper.displayAvatarURL({ extension: "png", size: 256 }),
        rankLabel: getHelperRank(stats.total),
        rank: rank || "-",
        total: stats.total,
        average: stats.average,
        fiveStarRate: stats.fiveStarRate,
        topGame: stats.topGame,
      });
      await interaction.editReply({ files: [new AttachmentBuilder(imageBuffer, { name: `helper-profile-${helper.id}.png` })] });
      return;
    }
    case "leaderboard": {
      await interaction.deferReply();
      const limitRaw = interaction.options.getInteger("limit", false) ?? 10;
      const limit = limitRaw < 3 || limitRaw > 10 ? 10 : limitRaw;
      const leaderboard = await db.getLeaderboard(interaction.guildId!, limit).catch(() => []);
      if (!leaderboard.length) {
        await interaction.editReply(noticePayload("No Leaderboard Data", "No helper data found yet. Submit vouches first.", 0xff0000) as any);
        return;
      }
      const entries = await Promise.all(
        leaderboard.map(async (item) => {
          const user = await client.users.fetch(item.helperId).catch(() => null);
          return {
            helperTag: user?.username ?? `Unknown (${item.helperId})`,
            avatarUrl: user?.displayAvatarURL({ extension: "png", size: 64 }) ?? null,
            rankLabel: getHelperRank(item.total),
            total: item.total,
            average: item.average,
            fiveStarRate: item.fiveStarRate,
            topGame: item.topGame,
          };
        }),
      );
      const imageBuffer = await buildLeaderboardCardWithAvatars({ guildName: interaction.guild!.name, entries });
      await interaction.editReply({ files: [new AttachmentBuilder(imageBuffer, { name: `leaderboard-${Math.floor(Date.now() / 1000)}.png` })] });
      return;
    }
    case "recent-vouches": {
      const helper = interaction.options.getUser("helper", false);
      const limit = interaction.options.getInteger("limit", false) ?? 5;
      const rows = await db.getRecentVouches(interaction.guildId!, limit, helper?.id).catch(() => []);
      if (!rows.length) {
        await replyNotice(interaction, "No Recent Vouches", helper ? `No recent vouches found for ${helper.toString()}.` : "No recent vouches found.", 0xff0000);
        return;
      }
      const lines = rows.map((row, index) => {
        const snippet = row.message.length > 110 ? `${row.message.slice(0, 107)}...` : row.message;
        return [
          `**${index + 1}.** <@${row.helper_user_id}> | **${row.game_key}** | **${row.rating}/5**`,
          `By: <@${row.user_id}> | ${formatVouchTime(row.created_at)}`,
          snippet,
        ].join("\n");
      });
      await replyNotice(interaction, helper ? `Recent Vouches For ${helper.username}` : "Recent Vouches", lines.join("\n\n"), 0x5865f2);
      return;
    }
    case "vouch-games": {
      const helper = interaction.options.getUser("helper", true);
      const breakdown = await db.getHelperGameBreakdown(interaction.guildId!, helper.id).catch(() => []);
      if (!breakdown.length) {
        await replyNotice(interaction, "No Game Data", `No vouch game breakdown found for ${helper.toString()}.`, 0xff0000);
        return;
      }
      const lines = breakdown.map((entry, index) => `${index + 1}. **${entry.gameKey}** | ${entry.total} vouches | avg ${entry.average.toFixed(2)} | ${entry.fiveStarRate.toFixed(1)}% 5-star`);
      await replyNotice(interaction, `Game Breakdown For ${helper.username}`, lines.join("\n"), 0x5865f2);
      return;
    }
    case "daily-messages": {
      const user = interaction.options.getUser("user", false) ?? interaction.user;
      const dayKey = new Date().toISOString().slice(0, 10);
      const count = await db.getDailyMessageCount(interaction.guildId!, user.id, dayKey).catch(() => 0);
      const remaining = Math.max(0, DAILY_MESSAGE_TARGET - count);
      await replyNotice(interaction, "Daily Message Progress", `Stats for <@${user.id}> today\nCurrent Count: **${count}** / ${DAILY_MESSAGE_TARGET}\nRemaining: **${remaining}**\nDate: \`${dayKey}\``, 0x5865f2);
      return;
    }
    case "vouch_give": {
      const helper = await interaction.guild!.members.fetch(interaction.options.getUser("helper", true).id);
      const game = interaction.options.getString("game", true);
      const rating = interaction.options.getInteger("rating", true);
      const message = interaction.options.getString("message", true).trim();
      if (helper.user.bot) {
        await replyNotice(interaction, "Invalid Helper", "You cannot award a vouch to a bot.", 0xff0000);
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const { targetChannel, gameLabel } = await createManualVouchPost(interaction, helper, game, rating, message);
      await interaction.editReply(noticePayload("Manual Vouch Posted", `Manual vouch posted in ${targetChannel.toString()} for ${helper.toString()} (${gameLabel}, ${rating}/5).`, 0x4ade80) as any);
      return;
    }
    case "get-carry-emoji-env": {
      await interaction.deferReply({ ephemeral: true });
      const emojis = await getCarryEmojis(interaction.guild);
      const lines = [
        `EMOJI_BULLET=${emojis.get("bullet")?.embed ?? ""}`,
        `EMOJI_SERVICE_ALS=${emojis.get("serviceAls")?.embed ?? ""}`,
        `EMOJI_SERVICE_AG=${emojis.get("serviceAg")?.embed ?? ""}`,
        `EMOJI_SERVICE_AC=${emojis.get("serviceAc")?.embed ?? ""}`,
        `EMOJI_SERVICE_UTD=${emojis.get("serviceUtd")?.embed ?? ""}`,
        `EMOJI_SERVICE_AV=${emojis.get("serviceAv")?.embed ?? ""}`,
        `EMOJI_SERVICE_AO=${emojis.get("serviceAo")?.embed ?? ""}`,
        `EMOJI_SERVICE_BL=${emojis.get("serviceBl")?.embed ?? ""}`,
        `EMOJI_SERVICE_SP=${emojis.get("serviceSp")?.embed ?? ""}`,
      ];
      await interaction.editReply(noticePayload("Carry Emoji Env", `\`\`\`env\n${lines.join("\n")}\n\`\`\``, 0x5865f2) as any);
      return;
    }
    case "cleanup-all-tickets": {
      await interaction.deferReply({ ephemeral: true });
      let count = 0;
      for (const channel of interaction.guild!.channels.cache.values()) {
        if (!(channel instanceof TextChannel) || !isTicketChannel(channel)) continue;
        await db.closeTicket(channel.id, interaction.user.id).catch(() => undefined);
        await channel.delete("Mass ticket cleanup").catch(() => undefined);
        ticketState.delete(channel.id);
        count += 1;
      }
      await interaction.editReply(noticePayload("Cleanup Complete", `Successfully deleted \`${count}\` ticket channels.`, 0x4ade80) as any);
      return;
    }
    case "purge_all_tickets": {
      await interaction.deferReply({ ephemeral: true });
      let deleted = 0;
      for (const channel of interaction.guild!.channels.cache.values()) {
        if (!(channel instanceof TextChannel) || !isTicketChannel(channel)) continue;
        await db.closeTicket(channel.id, interaction.user.id).catch(() => undefined);
        await channel.delete(`Ticket purge by ${interaction.user.tag}`).catch(() => undefined);
        ticketState.delete(channel.id);
        deleted += 1;
      }
      await interaction.editReply(noticePayload("Purge Complete", `Purged \`${deleted}\` ticket channels.`, 0x4ade80) as any);
      return;
    }
    case "purge_name_ticket": {
      const channel = interaction.options.getChannel("channel", true);
      if (!(channel instanceof TextChannel) || !isTicketChannel(channel)) {
        await replyNotice(interaction, "Invalid Ticket Channel", "Selected channel is not recognized as a ticket channel.", 0xff0000);
        return;
      }
      await db.closeTicket(channel.id, interaction.user.id).catch(() => undefined);
      await channel.delete(`Ticket purge by ${interaction.user.tag}`).catch((error) => console.error(error));
      ticketState.delete(channel.id);
      await replyNotice(interaction, "Ticket Deleted", "Ticket channel deleted.", 0x4ade80);
      return;
    }
    case "user_ticket_remove": {
      const target = interaction.options.getChannel("channel", false) ?? interaction.channel;
      if (!(target instanceof TextChannel) || !isTicketChannel(target)) {
        await replyNotice(interaction, "Invalid Ticket Channel", "This is not a ticket channel.", 0xff0000);
        return;
      }
      const { ownerId } = await getTicketOwnerId(target);
      const canForce = canCloseAnyTicket(member) || Boolean(member?.permissions.has("Administrator")) || isOwner(interaction.user.id);
      if (interaction.user.id !== ownerId && !canForce) {
        await replyNotice(interaction, "Permission Denied", "You can only delete your own ticket channel.", 0xff0000);
        return;
      }
      await closeTicketAndNotify(target, interaction.guild!, interaction.user.id, interaction.user.id);
      await target.delete(`Ticket removed by ${interaction.user.tag}`);
      await replyNotice(interaction, "Ticket Deleted", "Ticket channel deleted.", 0x4ade80);
      return;
    }
    case "reset-daily-messages":
      await replyNotice(interaction, "Reset Triggered", "Daily message stats reset (logic applied to current day).", 0x4ade80);
      return;
    default:
      await replyNotice(interaction, "Unknown Command", "Unknown command.", 0xff0000);
  }
}

async function runLoops() {
  setInterval(async () => {
    const rows = await db.getUnansweredOpenTickets(UNANSWERED_TICKET_CLOSE_MINUTES).catch((error) => {
      console.error("[cleanup] load failed", error);
      return [];
    });
    for (const row of rows) {
      const guild = row.guild_id ? client.guilds.cache.get(row.guild_id) ?? (await client.guilds.fetch(row.guild_id).catch(() => null)) : null;
      const channel = guild ? await resolveGuildChannel(guild, row.channel_id) : null;
      await db.closeTicket(row.channel_id, "system:auto-expire").catch((error) => console.error("[cleanup] close failed", error));
      ticketState.delete(row.channel_id);
      if (guild) await sendLog(guild, `Carry request auto-closed after ${UNANSWERED_TICKET_CLOSE_MINUTES} minutes without a helper response: <#${row.channel_id}>`);
      if (channel instanceof TextChannel) await channel.delete(`Carry request expired after ${UNANSWERED_TICKET_CLOSE_MINUTES} minutes without a response`).catch(() => undefined);
    }
  }, 5 * 60_000);

  setInterval(async () => {
    const rows = await db.getClaimedTicketsNeedingReminder(CLAIM_RESPONSE_REMINDER_MINUTES).catch((error) => {
      console.error("[reminder] load failed", error);
      return [];
    });
    for (const row of rows) {
      const guild = row.guild_id ? client.guilds.cache.get(row.guild_id) ?? (await client.guilds.fetch(row.guild_id).catch(() => null)) : null;
      const channel = guild ? await resolveGuildChannel(guild, row.channel_id) : null;
      if (!(channel instanceof TextChannel)) {
        await db.closeTicket(row.channel_id, "system:missing-channel").catch(() => undefined);
        ticketState.delete(row.channel_id);
        continue;
      }
      if (!row.claimed_by) continue;
      await sendNotice(channel, "Claim Reminder", `<@${row.claimed_by}> reminder: please answer this carry ticket or unclaim it so someone else can take it.`, 0xfee75c).catch(() => undefined);
      await db.markTicketReminderSent(channel.id).catch(() => undefined);
    }
  }, 5 * 60_000);

  setInterval(async () => {
    const now = Date.now();
    for (const [userId, data] of cooldownReminders.entries()) {
      if (data.endsAt.getTime() > now) continue;
      const user = await client.users.fetch(userId).catch(() => null);
      if (user) await sendNotice(user, "Cooldown Ended", "Your Rune carry cooldown has ended. You can open a new ticket now.", 0x4ade80).catch(() => undefined);
      clearCooldownReminder(userId);
    }
  }, 30_000);

  setInterval(async () => {
    const reminderMap: Array<[number, "vouch_dm_1h_at" | "vouch_dm_3h_at"]> = [
      [VOUCH_REMINDER_HOURS[0], "vouch_dm_1h_at"],
      [VOUCH_REMINDER_HOURS[1], "vouch_dm_3h_at"],
    ];
    for (const [hoursElapsed, fieldName] of reminderMap) {
      const rows = await db.getPendingVouchFollowups(hoursElapsed, fieldName).catch((error) => {
        console.error("[vouch-followup] load failed", error);
        return [];
      });
      for (const row of rows) {
        if (!row.user_id || !row.channel_id) continue;
        const sent = await sendPendingVouchDm(row.user_id, row.ticket_num ?? null, hoursElapsed);
        if (sent) await db.markVouchFollowupSent(row.channel_id, fieldName).catch(() => undefined);
      }
    }
  }, 15 * 60_000);
}

client.once("clientReady", async () => {
  console.log(`[startup] Logged in as ${client.user?.tag}`);
  console.log(`[setup] Invite: https://discord.com/api/oauth2/authorize?client_id=${cfg.clientId}&permissions=8&scope=bot%20applications.commands`);
  await syncCommands().catch((error) => console.error("[setup] command sync failed", error));
  await runLoops();
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === CARRY_PANEL_SELECT) {
      await handleCarrySelect(interaction);
      return;
    }
    if (await handleCarryModal(interaction)) return;
    if (await handleVouchModal(interaction)) return;
    if (await handleButton(interaction)) return;
    if (interaction.isChatInputCommand()) await handleChatCommand(interaction);
  } catch (error) {
    console.error("[interaction] error", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ ...(noticePayload("Interaction Error", "Something went wrong while handling that interaction.", 0xff0000) as any), ephemeral: true }).catch(() => undefined);
    }
  }
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot || !message.guild) return;
  const dayKey = new Date().toISOString().slice(0, 10);
  await db.incrementDailyMessageCount(message.guild.id, message.author.id, dayKey).catch((error) => console.error("[messages] count failed", error));
  if (!(message.channel instanceof TextChannel)) return;
  const meta = extractTicketMeta(message.channel.topic ?? "");
  if (!meta.ownerId) return;
  const ticket = await fetchTicket(message.channel.id);
  if (ticket?.claimedBy && message.author.id === ticket.claimedBy) {
    ticket.firstHelperResponseAt = new Date().toISOString();
    ticketState.set(message.channel.id, ticket);
    await db.markHelperResponded(message.channel.id).catch((error) => console.error("[ticket] helper response failed", error));
  }
});

client.on("channelDelete", async (channel) => {
  if (!(channel instanceof TextChannel)) return;
  const meta = extractTicketMeta(channel.topic ?? "");
  if (!meta.ownerId) return;
  await db.closeTicket(channel.id, "system:channel-deleted").catch((error) => console.error("[ticket] close deleted channel failed", error));
  ticketState.delete(channel.id);
});

async function main() {
  const missing = missingEnvKeys();
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  await client.login(cfg.token);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
