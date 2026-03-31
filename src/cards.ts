import { GlobalFonts, createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";

type Ctx = SKRSContext2D;

let fontsRegistered = false;
const RUNE_FOOTER = "Rune only for you | Developed by Red_thz";

function registerCanvasFonts() {
  if (fontsRegistered) return;
  const cwd = process.cwd();
  GlobalFonts.registerFromPath(path.join(cwd, "node_modules", "@fontsource", "space-grotesk", "files", "space-grotesk-latin-700-normal.woff"), "Space Grotesk");
  GlobalFonts.registerFromPath(path.join(cwd, "node_modules", "@fontsource", "space-grotesk", "files", "space-grotesk-latin-400-normal.woff"), "Space Grotesk Regular");
  GlobalFonts.registerFromPath(path.join(cwd, "node_modules", "@fontsource", "inter", "files", "inter-latin-400-normal.woff"), "Inter");
  GlobalFonts.registerFromPath(path.join(cwd, "node_modules", "@fontsource", "inter", "files", "inter-latin-700-normal.woff"), "Inter Bold");
  fontsRegistered = true;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function wrapText(ctx: Ctx, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 4) {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;
  let lines = 0;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth) {
      if (line) ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
      lines += 1;
      if (lines >= maxLines - 1) break;
      continue;
    }
    line = testLine;
  }
  if (line) ctx.fillText(line, x, currentY);
}

async function drawAvatar(ctx: Ctx, url: string, x: number, y: number, size: number, ringColor = "#68d5ff") {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 + 5, 0, Math.PI * 2);
  ctx.fillStyle = ringColor;
  ctx.fill();
  try {
    const image = await loadImage(url);
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, x, y, size, size);
  } catch {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#232a3e";
    ctx.fill();
  }
  ctx.restore();
}

function drawMetricCard(ctx: Ctx, x: number, y: number, w: number, h: number, label: string, value: string, accent = "#68d5ff") {
  fillRoundedRect(ctx, x, y, w, h, 20, "#101728");
  ctx.fillStyle = accent;
  ctx.font = '400 18px "Inter"';
  ctx.fillText(label, x + 18, y + 28);
  ctx.fillStyle = "#f5f7ff";
  ctx.font = '700 28px "Space Grotesk"';
  ctx.fillText(value, x + 18, y + 62);
}

function drawBackground(ctx: Ctx, width: number, height: number, colors: [string, string]) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(width - 120, 110, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(120, height - 80, 140, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export async function buildVouchCard(data: {
  clientTag: string;
  helperTag: string;
  helperAvatarUrl: string;
  clientAvatarUrl: string;
  gameLabel: string;
  rating: number;
  message: string;
  stats: { total: number; average: number; fiveStarRate: number; topGame: string };
}) {
  registerCanvasFonts();
  const canvas = createCanvas(1180, 640);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, canvas.width, canvas.height, ["#09111f", "#153457"]);
  fillRoundedRect(ctx, 28, 28, 1124, 584, 30, "#07101ccc");

  ctx.fillStyle = "#d7e8ff";
  ctx.font = '700 22px "Space Grotesk"';
  ctx.fillText("RUNE VOUCH SYSTEM", 56, 68);
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 48px "Space Grotesk"';
  ctx.fillText("Helper Performance Review", 56, 118);

  fillRoundedRect(ctx, 56, 148, 150, 38, 18, "#142642");
  ctx.fillStyle = "#7ce7ff";
  ctx.font = '700 20px "Space Grotesk"';
  ctx.fillText(data.gameLabel, 74, 174);

  await drawAvatar(ctx, data.helperAvatarUrl, 62, 218, 134, "#69d6ff");
  await drawAvatar(ctx, data.clientAvatarUrl, 224, 246, 82, "#f7af63");

  ctx.fillStyle = "#ffffff";
  ctx.font = '700 38px "Space Grotesk"';
  ctx.fillText(data.helperTag, 330, 262);
  ctx.fillStyle = "#9dc0e8";
  ctx.font = '400 24px "Inter"';
  ctx.fillText(`reviewed by ${data.clientTag}`, 330, 298);

  fillRoundedRect(ctx, 330, 324, 170, 82, 24, "#12233b");
  ctx.fillStyle = "#ffcf5a";
  ctx.font = '700 34px "Space Grotesk"';
  ctx.fillText(`${data.rating}/5`, 352, 358);
  ctx.fillStyle = "#98b2d8";
  ctx.font = '400 20px "Inter"';
  ctx.fillText("vouch rating", 352, 386);

  fillRoundedRect(ctx, 528, 324, 220, 82, 24, "#12233b");
  ctx.fillStyle = "#79f0af";
  ctx.font = '700 34px "Space Grotesk"';
  ctx.fillText(`${data.stats.average.toFixed(2)}`, 550, 358);
  ctx.fillStyle = "#98b2d8";
  ctx.font = '400 20px "Inter"';
  ctx.fillText("overall average", 550, 386);

  fillRoundedRect(ctx, 776, 324, 252, 82, 24, "#12233b");
  ctx.fillStyle = "#ff8f8f";
  ctx.font = '700 34px "Space Grotesk"';
  ctx.fillText(`${data.stats.fiveStarRate.toFixed(1)}%`, 798, 358);
  ctx.fillStyle = "#98b2d8";
  ctx.font = '400 20px "Inter"';
  ctx.fillText("five-star rate", 798, 386);

  fillRoundedRect(ctx, 56, 438, 1072, 124, 24, "#0d1829");
  ctx.fillStyle = "#6edcff";
  ctx.font = '700 20px "Space Grotesk"';
  ctx.fillText("Client feedback", 82, 474);
  ctx.fillStyle = "#f4f8ff";
  ctx.font = '400 24px "Inter"';
  wrapText(ctx, data.message, 82, 516, 1018, 30, 4);

  fillRoundedRect(ctx, 876, 168, 252, 156, 24, "#101728");
  ctx.fillStyle = "#69d6ff";
  ctx.font = '400 18px "Inter"';
  ctx.fillText("Total vouches", 896, 194);
  ctx.fillStyle = "#f5f7ff";
  ctx.font = '700 24px "Space Grotesk"';
  ctx.fillText(String(data.stats.total), 896, 232);
  ctx.fillStyle = "#98b2d8";
  ctx.font = '400 18px "Inter"';
  ctx.fillText(`Top game: ${data.stats.topGame}`, 896, 268);
  ctx.fillText("Trusted helper profile", 896, 296);

  ctx.fillStyle = "#86a6ce";
  ctx.font = '400 16px "Inter"';
  ctx.fillText(RUNE_FOOTER, 56, 592);

  return Buffer.from(await canvas.encode("png"));
}

export async function buildHelperProfileCard(data: {
  helperTag: string;
  avatarUrl: string;
  rankLabel: string;
  rank: string | number;
  total: number;
  average: number;
  fiveStarRate: number;
  topGame: string;
}) {
  registerCanvasFonts();
  const canvas = createCanvas(980, 520);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, canvas.width, canvas.height, ["#0c1422", "#213965"]);
  fillRoundedRect(ctx, 28, 28, 924, 464, 30, "#08101bcc");

  ctx.fillStyle = "#d8ebff";
  ctx.font = '700 20px "Space Grotesk"';
  ctx.fillText("HELPER PROFILE", 50, 64);
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 44px "Space Grotesk"';
  ctx.fillText(data.helperTag, 50, 114);

  await drawAvatar(ctx, data.avatarUrl, 54, 150, 130, "#7ce7ff");
  fillRoundedRect(ctx, 212, 154, 232, 54, 22, "#13223c");
  ctx.fillStyle = "#7ce7ff";
  ctx.font = '700 24px "Space Grotesk"';
  ctx.fillText(data.rankLabel, 232, 188);

  fillRoundedRect(ctx, 212, 222, 232, 54, 22, "#13223c");
  ctx.fillStyle = "#f5f7ff";
  ctx.font = '700 22px "Space Grotesk"';
  ctx.fillText(`Leaderboard #${data.rank}`, 232, 256);

  drawMetricCard(ctx, 484, 150, 196, 108, "Total vouches", String(data.total));
  drawMetricCard(ctx, 700, 150, 196, 108, "Average", data.average.toFixed(2), "#7cf0b5");
  drawMetricCard(ctx, 484, 282, 196, 108, "Five-star rate", `${data.fiveStarRate.toFixed(1)}%`, "#ff9d76");
  drawMetricCard(ctx, 700, 282, 196, 108, "Top game", data.topGame, "#f6cf69");

  fillRoundedRect(ctx, 50, 320, 394, 116, 24, "#0f1829");
  ctx.fillStyle = "#94b8df";
  ctx.font = '400 20px "Inter"';
  ctx.fillText("Profile summary", 72, 354);
  ctx.fillStyle = "#f5f7ff";
  ctx.font = '400 24px "Inter"';
  ctx.fillText(`${data.helperTag} is ranked ${data.rankLabel}`, 72, 390);
  ctx.fillText(`with ${data.total} total vouches recorded.`, 72, 422);
  ctx.fillStyle = "#86a6ce";
  ctx.font = '400 16px "Inter"';
  ctx.fillText(RUNE_FOOTER, 50, 470);

  return Buffer.from(await canvas.encode("png"));
}

export async function buildLeaderboardCardWithAvatars(data: {
  guildName: string;
  entries: Array<{ helperTag: string; avatarUrl?: string | null; rankLabel: string; total: number; average: number; fiveStarRate: number; topGame: string }>;
}) {
  registerCanvasFonts();
  const rowHeight = 98;
  const canvas = createCanvas(1120, 138 + data.entries.length * rowHeight);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, canvas.width, canvas.height, ["#09111f", "#20375b"]);

  ctx.fillStyle = "#ffffff";
  ctx.font = '700 42px "Space Grotesk"';
  ctx.fillText(`${data.guildName} Leaderboard`, 34, 58);
  ctx.fillStyle = "#9fbce4";
  ctx.font = '400 22px "Inter"';
  ctx.fillText("Top helpers ranked by average rating and consistency.", 34, 94);

  for (const [index, entry] of data.entries.entries()) {
    const y = 122 + index * rowHeight;
    fillRoundedRect(ctx, 24, y, 1072, 80, 24, index === 0 ? "#162846" : "#0a1220cc");
    if (entry.avatarUrl) await drawAvatar(ctx, entry.avatarUrl, 42, y + 10, 58, index === 0 ? "#f6cf69" : "#68d5ff");
    ctx.fillStyle = "#ffffff";
    ctx.font = '700 28px "Space Grotesk"';
    ctx.fillText(`#${index + 1} ${entry.helperTag}`, 122, y + 34);
    ctx.fillStyle = "#8ea7cf";
    ctx.font = '400 18px "Inter"';
    ctx.fillText(`${entry.rankLabel} | ${entry.topGame}`, 122, y + 60);
    ctx.fillText(`Avg ${entry.average.toFixed(2)} | ${entry.total} vouches | ${entry.fiveStarRate.toFixed(1)}% 5-star`, 660, y + 46);
  }

  ctx.fillStyle = "#86a6ce";
  ctx.font = '400 16px "Inter"';
  ctx.fillText(RUNE_FOOTER, 34, canvas.height - 22);

  return Buffer.from(await canvas.encode("png"));
}

export async function buildHelperSnapshotCard(data: {
  helperTag: string;
  avatarUrl: string;
  total: number;
  average: number;
  fiveStarRate: number;
  topGame: string;
  breakdown: Array<{ gameKey: string; total: number; average: number; fiveStarRate: number }>;
  recent: Array<{ rating: number; message: string; createdAt?: string | null }>;
}) {
  registerCanvasFonts();
  const canvas = createCanvas(1180, 720);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, canvas.width, canvas.height, ["#09111f", "#1d355d"]);
  fillRoundedRect(ctx, 28, 28, 1124, 664, 30, "#07101ccc");

  ctx.fillStyle = "#d7e8ff";
  ctx.font = '700 22px "Space Grotesk"';
  ctx.fillText("HELPER SNAPSHOT", 54, 64);
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 46px "Space Grotesk"';
  ctx.fillText(data.helperTag, 54, 112);

  await drawAvatar(ctx, data.avatarUrl, 60, 146, 124, "#69d6ff");
  drawMetricCard(ctx, 224, 148, 190, 104, "Total vouches", String(data.total));
  drawMetricCard(ctx, 434, 148, 190, 104, "Average", data.average.toFixed(2), "#7cf0b5");
  drawMetricCard(ctx, 644, 148, 214, 104, "Five-star rate", `${data.fiveStarRate.toFixed(1)}%`, "#ff9d76");
  drawMetricCard(ctx, 878, 148, 228, 104, "Top game", data.topGame, "#f6cf69");

  fillRoundedRect(ctx, 54, 286, 504, 360, 24, "#0d1829");
  ctx.fillStyle = "#7ce7ff";
  ctx.font = '700 22px "Space Grotesk"';
  ctx.fillText("Game Breakdown", 80, 324);
  const breakdown = data.breakdown.length > 0
    ? data.breakdown.slice(0, 5)
    : [{ gameKey: "N/A", total: 0, average: 0, fiveStarRate: 0 }];
  breakdown.forEach((entry, index) => {
    const y = 366 + index * 54;
    fillRoundedRect(ctx, 76, y, 460, 42, 16, "#13223c");
    ctx.fillStyle = "#f5f7ff";
    ctx.font = '700 18px "Space Grotesk"';
    ctx.fillText(entry.gameKey, 94, y + 27);
    ctx.fillStyle = "#9fbce4";
    ctx.font = '400 16px "Inter"';
    ctx.fillText(`${entry.total} vouches | avg ${entry.average.toFixed(2)} | ${entry.fiveStarRate.toFixed(1)}% 5-star`, 180, y + 27);
  });

  fillRoundedRect(ctx, 592, 286, 534, 360, 24, "#0d1829");
  ctx.fillStyle = "#7ce7ff";
  ctx.font = '700 22px "Space Grotesk"';
  ctx.fillText("Recent Vouches", 618, 324);
  const recent = data.recent.length > 0
    ? data.recent.slice(0, 3)
    : [{ rating: 0, message: "No recent vouches yet.", createdAt: null }];
  recent.forEach((entry, index) => {
    const y = 356 + index * 96;
    fillRoundedRect(ctx, 614, y, 488, 78, 18, "#13223c");
    ctx.fillStyle = entry.rating >= 5 ? "#ffd166" : "#f5f7ff";
    ctx.font = '700 18px "Space Grotesk"';
    ctx.fillText(entry.rating > 0 ? `${entry.rating}/5` : "No data", 636, y + 28);
    ctx.fillStyle = "#8ea7cf";
    ctx.font = '400 15px "Inter"';
    if (entry.createdAt) {
      const parsed = Date.parse(entry.createdAt);
      const stamp = Number.isNaN(parsed) ? "unknown time" : new Date(parsed).toLocaleDateString("en-US");
      ctx.fillText(stamp, 694, y + 28);
    }
    ctx.fillStyle = "#f5f7ff";
    ctx.font = '400 18px "Inter"';
    const snippet = entry.message.length > 105 ? `${entry.message.slice(0, 102)}...` : entry.message;
    wrapText(ctx, snippet, 636, y + 56, 442, 22, 2);
  });

  ctx.fillStyle = "#86a6ce";
  ctx.font = '400 16px "Inter"';
  ctx.fillText(RUNE_FOOTER, 54, 676);

  return Buffer.from(await canvas.encode("png"));
}
