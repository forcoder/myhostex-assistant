/**
 * 生成插件图标 - 运行此脚本生成 PNG 图标
 * node generate-icons.js
 */
const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [16, 48, 128];

sizes.forEach((size) => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // 渐变背景
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#4f46e5");
  grad.addColorStop(1, "#7c3aed");

  // 圆角矩形
  const r = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // 房子图标
  ctx.fillStyle = "#ffffff";
  const hs = size * 0.55;
  const ox = (size - hs) / 2;
  const oy = (size - hs) / 2;

  // 屋顶
  ctx.beginPath();
  ctx.moveTo(ox + hs / 2, oy);
  ctx.lineTo(ox + hs, oy + hs * 0.45);
  ctx.lineTo(ox, oy + hs * 0.45);
  ctx.closePath();
  ctx.fill();

  // 房身
  ctx.fillRect(ox + hs * 0.1, oy + hs * 0.45, hs * 0.8, hs * 0.55);

  // 门
  ctx.fillStyle = grad;
  ctx.fillRect(
    ox + hs * 0.35,
    oy + hs * 0.65,
    hs * 0.3,
    hs * 0.35
  );

  const buf = canvas.toBuffer("image/png");
  const outPath = path.join(__dirname, "icons", `icon${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Generated ${outPath}`);
});
