import "dotenv/config";
import { HELPER_RANK_TIERS, GAME_LABEL } from "./constants.js";

export function env() {
  return {
    token: process.env.DISCORD_TOKEN ?? "",
    clientId: process.env.DISCORD_CLIENT_ID ?? "",
    guildId: process.env.DISCORD_GUILD_ID ?? "",
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    staffRoleId: process.env.CARRY_STAFF_ROLE_ID ?? "",
    boosterRoleId: process.env.BOOSTER_ROLE_ID ?? "",
    logChannelId: process.env.LOG_CHANNEL_ID ?? "",
    vouchChannelId: process.env.VOUCH_CHANNEL_ID ?? "",
    highlightChannelId: process.env.HIGHLIGHT_CHANNEL_ID ?? "",
    defaultTicketCategoryId: process.env.DEFAULT_TICKET_CATEGORY_ID ?? "",
    ticketCategories: {
      ALS: process.env.TICKET_CATEGORY_ALS_ID ?? process.env.TICKET_CATEGORY_RAIDS_ID ?? "",
      AG: process.env.TICKET_CATEGORY_AG_ID ?? process.env.TICKET_CATEGORY_RACEV4_ID ?? "",
      AC: process.env.TICKET_CATEGORY_AC_ID ?? process.env.TICKET_CATEGORY_LEVI_ID ?? "",
      UTD: process.env.TICKET_CATEGORY_UTD_ID ?? process.env.TICKET_CATEGORY_AWAKEN_ID ?? "",
      AV: process.env.TICKET_CATEGORY_AV_ID ?? "",
      AO: process.env.TICKET_CATEGORY_AO_ID ?? "",
      BL: process.env.TICKET_CATEGORY_BL_ID ?? "",
      SP: process.env.TICKET_CATEGORY_SP_ID ?? "",
    },
    helperRoles: {
      ALS: process.env.HELPER_ROLE_ALS_ID ?? process.env.HELPER_ROLE_RAIDS_ID ?? "",
      AG: process.env.HELPER_ROLE_AG_ID ?? process.env.HELPER_ROLE_RACEV4_ID ?? "",
      AC: process.env.HELPER_ROLE_AC_ID ?? process.env.HELPER_ROLE_LEVI_ID ?? "",
      UTD: process.env.HELPER_ROLE_UTD_ID ?? process.env.HELPER_ROLE_AWAKEN_ID ?? "",
      AV: process.env.HELPER_ROLE_AV_ID ?? "",
      AO: process.env.HELPER_ROLE_AO_ID ?? "",
      BL: process.env.HELPER_ROLE_BL_ID ?? "",
      SP: process.env.HELPER_ROLE_SP_ID ?? "",
    },
    emojis: {
      bullet: (process.env.EMOJI_BULLET ?? process.env.EMOJI_BULLET_ID ?? "").trim(),
      serviceAls: (process.env.EMOJI_SERVICE_ALS ?? process.env.EMOJI_SERVICE_ALS_ID ?? process.env.EMOJI_SERVICE_RAIDS_ID ?? "").trim(),
      serviceAg: (process.env.EMOJI_SERVICE_AG ?? process.env.EMOJI_SERVICE_AG_ID ?? process.env.EMOJI_SERVICE_RACEV4_ID ?? "").trim(),
      serviceAc: (process.env.EMOJI_SERVICE_AC ?? process.env.EMOJI_SERVICE_AC_ID ?? process.env.EMOJI_SERVICE_LEVI_ID ?? "").trim(),
      serviceUtd: (process.env.EMOJI_SERVICE_UTD ?? process.env.EMOJI_SERVICE_UTD_ID ?? "").trim(),
      serviceAv: (process.env.EMOJI_SERVICE_AV ?? process.env.EMOJI_SERVICE_AV_ID ?? "").trim(),
      serviceAo: (process.env.EMOJI_SERVICE_AO ?? process.env.EMOJI_SERVICE_AO_ID ?? "").trim(),
      serviceBl: (process.env.EMOJI_SERVICE_BL ?? process.env.EMOJI_SERVICE_BL_ID ?? "").trim(),
      serviceSp: (process.env.EMOJI_SERVICE_SP ?? process.env.EMOJI_SERVICE_SP_ID ?? "").trim(),
    },
  };
}

export function missingEnvKeys(): string[] {
  const cfg = env();
  const required: Array<[string, string]> = [
    ["DISCORD_TOKEN", cfg.token],
    ["DISCORD_CLIENT_ID", cfg.clientId],
    ["SUPABASE_URL", cfg.supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", cfg.supabaseKey],
  ];
  return required.filter(([, value]) => !value).map(([key]) => key);
}

export function getHelperRank(totalVouches: number): string {
  for (const [minVal, label] of HELPER_RANK_TIERS) {
    if (totalVouches >= minVal) return label;
  }
  return "Noob Helper";
}

export { GAME_LABEL };
