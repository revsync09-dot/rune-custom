import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";

type Ctx = SKRSContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function drawAvatar(ctx: Ctx, url: string, x: number, y: number, size: number) {
  try {
    const image = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, x, y, size, size);
    ctx.restore();
  } catch {
    ctx.fillStyle = "#2b3145";
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function wrapText(ctx: Ctx, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth) {
      if (line) ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
      continue;
    }
    line = testLine;
  }
  if (line) ctx.fillText(line, x, currentY);
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
  const canvas = createCanvas(980, 520);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 980, 520);
  gradient.addColorStop(0, "#151826");
  gradient.addColorStop(1, "#222b47");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  roundRect(ctx, 30, 30, 920, 460, 28);
  ctx.fillStyle = "#0b0f19cc";
  ctx.fill();

  ctx.fillStyle = "#f3f7ff";
  ctx.font = "bold 42px Sans";
  ctx.fillText("Rune Helper Vouch", 56, 86);

  ctx.fillStyle = "#93a2c7";
  ctx.font = "24px Sans";
  ctx.fillText(data.gameLabel, 56, 122);

  await drawAvatar(ctx, data.helperAvatarUrl, 56, 156, 116);
  await drawAvatar(ctx, data.clientAvatarUrl, 190, 176, 72);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Sans";
  ctx.fillText(data.helperTag, 190, 212);
  ctx.fillStyle = "#9eb0d7";
  ctx.font = "22px Sans";
  ctx.fillText(`Vouched by ${data.clientTag}`, 190, 246);

  ctx.fillStyle = "#ffd75e";
  ctx.font = "bold 34px Sans";
  ctx.fillText("★".repeat(data.rating), 56, 324);

  roundRect(ctx, 56, 348, 868, 98, 18);
  ctx.fillStyle = "#141c30";
  ctx.fill();
  ctx.fillStyle = "#edf3ff";
  ctx.font = "22px Sans";
  wrapText(ctx, data.message, 78, 384, 820, 30);

  const stats = [
    `Total Vouches: ${data.stats.total}`,
    `Average: ${data.stats.average.toFixed(2)}`,
    `5★ Rate: ${data.stats.fiveStarRate.toFixed(1)}%`,
    `Top Game: ${data.stats.topGame}`,
  ];
  ctx.fillStyle = "#7c8fb9";
  ctx.font = "20px Sans";
  stats.forEach((line, index) => ctx.fillText(line, 56 + index * 220, 476));

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
  const canvas = createCanvas(860, 440);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 860, 440);
  gradient.addColorStop(0, "#10192c");
  gradient.addColorStop(1, "#243761");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 860, 440);

  roundRect(ctx, 28, 28, 804, 384, 26);
  ctx.fillStyle = "#0a1020d8";
  ctx.fill();

  await drawAvatar(ctx, data.avatarUrl, 56, 70, 132);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px Sans";
  ctx.fillText(data.helperTag, 214, 112);
  ctx.fillStyle = "#85a2e6";
  ctx.font = "24px Sans";
  ctx.fillText(data.rankLabel, 214, 148);
  ctx.fillText(`Leaderboard Rank: #${data.rank}`, 214, 184);

  const stats = [
    ["Total Vouches", String(data.total)],
    ["Average Rating", data.average.toFixed(2)],
    ["5★ Rate", `${data.fiveStarRate.toFixed(1)}%`],
    ["Top Game", data.topGame],
  ] as const;

  stats.forEach(([label, value], index) => {
    const x = 56 + (index % 2) * 370;
    const y = 246 + Math.floor(index / 2) * 90;
    roundRect(ctx, x, y, 320, 68, 18);
    ctx.fillStyle = "#131e36";
    ctx.fill();
    ctx.fillStyle = "#87a1d8";
    ctx.font = "20px Sans";
    ctx.fillText(label, x + 18, y + 28);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px Sans";
    ctx.fillText(value, x + 18, y + 54);
  });

  return Buffer.from(await canvas.encode("png"));
}

export async function buildLeaderboardCardWithAvatars(data: {
  guildName: string;
  entries: Array<{ helperTag: string; avatarUrl?: string | null; rankLabel: string; total: number; average: number; fiveStarRate: number; topGame: string }>;
}) {
  const rowHeight = 92;
  const canvas = createCanvas(980, 120 + data.entries.length * rowHeight);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 980, canvas.height);
  gradient.addColorStop(0, "#111827");
  gradient.addColorStop(1, "#1d355d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px Sans";
  ctx.fillText(`${data.guildName} Helper Leaderboard`, 34, 58);
  ctx.fillStyle = "#90a4d6";
  ctx.font = "22px Sans";
  ctx.fillText("Sorted by average rating, then total vouches.", 34, 92);

  for (const [index, entry] of data.entries.entries()) {
    const y = 116 + index * rowHeight;
    roundRect(ctx, 24, y, 932, 74, 20);
    ctx.fillStyle = index === 0 ? "#1f3157" : "#0c1325cc";
    ctx.fill();
    if (entry.avatarUrl) await drawAvatar(ctx, entry.avatarUrl, 42, y + 11, 52);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Sans";
    ctx.fillText(`#${index + 1} ${entry.helperTag}`, 112, y + 32);
    ctx.fillStyle = "#8ea5d8";
    ctx.font = "19px Sans";
    ctx.fillText(`${entry.rankLabel} • ${entry.topGame}`, 112, y + 58);
    ctx.fillText(`Avg ${entry.average.toFixed(2)} • ${entry.total} vouches • ${entry.fiveStarRate.toFixed(1)}% 5★`, 540, y + 46);
  }

  return Buffer.from(await canvas.encode("png"));
}
