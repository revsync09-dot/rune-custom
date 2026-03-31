import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type APIMessageTopLevelComponent,
} from "discord.js";
import {
  CARRY_PANEL_SELECT,
  DEFAULT_CARRY_PANEL_IMAGE,
  GAME_LABEL,
  TICKET_CLAIM,
  TICKET_CLOSE_BTN,
  TICKET_UNCLAIM,
  TICKET_VOUCH_BTN,
  VOUCH_BUTTON,
} from "./constants.js";
import type { GameKey, TicketViewModel } from "./types.js";

const RUNE_FOOTER = "Rune only for you | Developed by Red_thz";

export function createV2Message(components: APIMessageTopLevelComponent[] | ContainerBuilder[]) {
  return { flags: MessageFlags.IsComponentsV2 as any, components } as any;
}

export function buildCarryPanel(
  options: Array<{ label: string; value: GameKey; description: string; emoji?: { id?: string; name?: string; animated?: boolean } | null }>,
  guildName: string,
  bullet: string,
  supportedGamesText: string,
  runeMode: boolean,
  menuInfoRef?: string,
) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(CARRY_PANEL_SELECT)
    .setPlaceholder("Select your game...")
    .addOptions(
      options.map((option) => ({
        label: option.label,
        value: option.value,
        description: option.description,
        emoji: option.emoji ?? undefined,
      })),
    );

  const container = new ContainerBuilder().setAccentColor(0x6c4dff);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      runeMode
        ? [
            "# Runes Carry Tickets",
            `${bullet} Welcome to Rune's carry system.`,
            `${bullet} Please look in ${menuInfoRef ?? "#menu-info"} for our carrier menu.`,
            `${bullet} Click the dropdown below to get started!`,
            "",
            "**Support Games**",
            supportedGamesText,
            "",
            `*${RUNE_FOOTER}*`,
          ].join("\n")
        : [
            `# ${guildName.toUpperCase()} | Carry Requests`,
            "Welcome to our carry service!",
            `${bullet} **FREE SERVICE** - We help you complete 5 runs per ticket`,
            `${bullet} **QUICK SUPPORT** - Get matched with skilled helpers instantly`,
            "",
            "Click the dropdown below to create your carry request.",
            "",
            "**Supported Games**",
            supportedGamesText,
            "",
            `*${RUNE_FOOTER}*`,
          ].join("\n"),
    ),
  );
  container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(DEFAULT_CARRY_PANEL_IMAGE)));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  return createV2Message([container]);
}

export function buildVouchPanel(guildName: string) {
  const button = new ButtonBuilder().setCustomId(VOUCH_BUTTON).setLabel("Create Vouch").setStyle(ButtonStyle.Success);
  const container = new ContainerBuilder().setAccentColor(0xff5f7e);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `# ${guildName} Vouch System`,
        "Drop your feedback after a carry and get featured in our vouch feed.",
        "Press the button below, fill out the form, and your vouch card is generated instantly.",
        `*${RUNE_FOOTER}*`,
      ].join("\n\n"),
    ),
  );
  container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button));
  return createV2Message([container]);
}

export function buildTicketMessage(ticket: TicketViewModel) {
  const claimed = ticket.claimedBy;
  const status = ticket.vouched ? "Processed / Vouched" : claimed ? `Claimed by <@${claimed}>` : "Waiting for Helper";
  const ts = Math.floor(ticket.createdAtMs / 1000);
  const container = new ContainerBuilder().setAccentColor(claimed ? 0xfaa61a : 0x5865f2);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `# Carry Request Details - #${String(ticket.ticketNum).padStart(4, "0")}`,
        `**IGN:** \`${ticket.ign}\``,
        `**Service:** **${ticket.gameLabel}**`,
        `**Status:** ${status}`,
        `**Requested By:** <@${ticket.userId}>`,
        `**Claimed By:** ${claimed ? `<@${claimed}>` : "`Nobody yet`"}`,
        `**Created:** <t:${ts}:R>`,
        "",
        "**Request:**",
        ticket.request,
        "",
        `*${RUNE_FOOTER}*`,
      ].join("\n"),
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("Use the buttons below to manage this ticket."))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL("https://cdn.discordapp.com/emojis/1474275400925450492.png?size=96")),
  );
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(TICKET_CLAIM).setLabel("Claim Ticket").setStyle(ButtonStyle.Success).setEmoji("✅").setDisabled(Boolean(claimed) || ticket.vouched),
      new ButtonBuilder().setCustomId(TICKET_UNCLAIM).setLabel("Unclaim").setStyle(ButtonStyle.Secondary).setEmoji("↩️").setDisabled(!claimed || ticket.vouched),
      new ButtonBuilder().setCustomId(TICKET_VOUCH_BTN).setLabel("Submit Vouch").setStyle(ButtonStyle.Primary).setEmoji("⭐").setDisabled(!claimed || ticket.vouched),
      new ButtonBuilder().setCustomId(TICKET_CLOSE_BTN).setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒"),
    ),
  );
  return createV2Message([container]);
}

export function buildHighlightMessage(helperMention: string, clientLabel: string, gameLabel: string, rating: number, guildName: string, jumpUrl: string, awardedByStaff: boolean) {
  const container = new ContainerBuilder().setAccentColor(0xfacc15);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `# ${(guildName || "Lucent").toUpperCase()} Helper Highlight`,
        `Outstanding helper performance recognized with **${rating}/5**.`,
        `**Helper:** ${helperMention}`,
        `**Client:** ${clientLabel}`,
        `**Service:** **${gameLabel}**`,
        `**Type:** ${awardedByStaff ? "Staff Awarded" : "Community Vouch"}`,
        "",
        `*${RUNE_FOOTER}*`,
      ].join("\n"),
    ),
  );
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel("Open Vouch").setStyle(ButtonStyle.Link).setURL(jumpUrl),
    ),
  );
  return createV2Message([container]);
}

export function buildSupportedGamesText(keys: GameKey[]): string {
  return keys.map((key) => `• **${GAME_LABEL[key]}**`).join("\n");
}

export function buildNotice(title: string, description: string, accentColor = 0x5865f2) {
  const container = new ContainerBuilder().setAccentColor(accentColor);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([`# ${title}`, description, `*${RUNE_FOOTER}*`].join("\n\n")),
  );
  return createV2Message([container]);
}
