const fs = require('fs');
const path = require('path');

[16, 48, 128].forEach(size => {
  const r = Math.round(size * 0.2);
  const fs2 = Math.round(size * 0.55);
  const svg = [
    "<svg xmlns='http://www.w3.org/2000/svg' width='" + size + "' height='" + size + "' viewBox='0 0 " + size + " " + size + "'>",
    "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>",
    "<stop offset='0' stop-color='#4f46e5'/>",
    "<stop offset='1' stop-color='#7c3aed'/>",
    "</linearGradient></defs>",
    "<rect width='" + size + "' height='" + size + "' rx='" + r + "' fill='url(#g)'/>",
    "<text x='50%' y='58%' dominant-baseline='middle' text-anchor='middle' font-size='" + fs2 + "' font-family='serif'>H</text>",
    "</svg>"
  ].join('');
  fs.writeFileSync(path.join(__dirname, 'icons', 'icon' + size + '.png'), Buffer.from(svg));
  console.log('wrote icon' + size + '.png');
});
console.log('done');
