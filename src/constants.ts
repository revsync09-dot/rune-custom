import type { GameKey } from "./types.js";

export const CARRY_PANEL_SELECT = "carry:game-select";
export const CARRY_MODAL = "carry:ticket-modal";
export const TICKET_CLAIM = "ticket:claim";
export const TICKET_UNCLAIM = "ticket:unclaim";
export const TICKET_VOUCH_BTN = "ticket:vouch-btn";
export const TICKET_CLOSE_BTN = "ticket:close-btn";
export const VOUCH_BUTTON = "vouch:create";
export const VOUCH_MODAL = "vouch:modal";
export const SNOWFLAKE_REGEX = /^\d{17,20}$/;
export const CUSTOM_EMOJI_REGEX = /^<a?:(\w+):(\d{17,20})>$/;

export const OWNER_IDS = new Set(["795466540140986368"]);
export const CLOSE_TICKET_ROLE_IDS = new Set([
  "1426022588097757255",
  "1441256300578213889",
  "760194150452035595",
  "765924526512537630",
]);
export const FULL_ACCESS_ROLE_IDS = new Set(["765924526512537630"]);

export const DAILY_MESSAGE_TARGET = 30;
export const CLAIM_RESPONSE_REMINDER_MINUTES = 10;
export const UNANSWERED_TICKET_CLOSE_MINUTES = 30;
export const VOUCH_COOLDOWN_HOURS = 5;
export const VOUCH_REMINDER_HOURS = [1, 3] as const;

export const RUNE_GUILD_ID = "1473028571932135638";
export const RUNE_BULLET_EMOJI_ID = "1473126023158567074";
export const RUNE_SELECT_EMOJI_ID = "1474275400925450492";
export const RUNE_MENU_INFO_CHANNEL_ID = "1473153905956487320";
export const DEFAULT_CARRY_PANEL_IMAGE =
  "https://media.discordapp.net/attachments/1473030218074689630/1488189876749996032/Diseno_sin_titulo_4.gif?ex=69cbe053&is=69ca8ed3&hm=be606b7571ca0b67178572e3785afee79c9a39884759efbd5b31a23a66996edc&=&width=916&height=515";

export const GAME_LABEL: Record<GameKey, string> = {
  ALS: "Anime Last Stand (ALS)",
  AG: "Anime Guardians (AG)",
  AC: "Anime Crusaders (AC)",
  UTD: "Universal Tower Defense (UTD)",
  AV: "Anime Vanguards (AV)",
  AO: "Anime Overload (AO)",
  BL: "Bizarre Lineage (BL)",
  SP: "Sailor Piece (SP)",
};

export const HELPER_RANK_TIERS: ReadonlyArray<readonly [number, string]> = [
  [100, "Meister"],
  [50, "Experte"],
  [30, "Senior Helper"],
  [15, "Helper"],
  [5, "Junior Helper"],
  [0, "Noob Helper"],
];

export const CARRY_GAMES: ReadonlyArray<readonly [string, GameKey, string]> = [
  ["Anime Last Stand (ALS)", "ALS", "Request help for Anime Last Stand runs."],
  ["Anime Guardians (AG)", "AG", "Request support for Anime Guardians runs."],
  ["Anime Crusaders (AC)", "AC", "Request support for Anime Crusaders runs."],
  ["Universal Tower Defense (UTD)", "UTD", "Request support for Universal Tower Defense runs."],
  ["Anime Vanguards (AV)", "AV", "Request support for Anime Vanguards runs."],
  ["Anime Overload (AO)", "AO", "Request support for Anime Overload runs."],
  ["Bizarre Lineage (BL)", "BL", "Request support for Bizarre Lineage (JoJo-style Roblox RPG)."],
  ["Sailor Piece (SP)", "SP", "Request support for Sailor Piece runs."],
];

export const GUILD_GAME_OVERRIDES: Record<string, GameKey[]> = {
  [RUNE_GUILD_ID]: ["SP", "AC", "ALS", "AV", "AO"],
};
