// Landmarks drawn with plain canvas shapes (no images, no copyrighted artwork).
// Each painter gets (g, geo, time) and draws behind the players, between sky and ground.

const poly = (g, pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };
const rect = (g, x, y, w, h, fill) => { g.fillStyle = fill; g.fillRect(x, y, w, h); };

function skyline(g, { w, groundY, s }, color, seed = 1, maxH = 70) {
  g.fillStyle = color;
  let x = 0, i = 0;
  while (x < w) {
    const bw = (26 + ((i * 37 + seed * 13) % 30)) * s;
    const bh = (22 + ((i * 53 + seed * 7) % maxH)) * s;
    g.fillRect(x, groundY - bh, bw - 3 * s, bh);
    x += bw; i++;
  }
}

export const LANDMARKS = {
  // ——— Pro arena: Almaty, the Zailiysky Alatau ———
  alatau(g, geo) {
    const { w, groundY, s } = geo;
    const peaks = [[0.08, 150, 150], [0.3, 215, 190], [0.55, 175, 170], [0.8, 240, 210], [1.02, 160, 150]];
    peaks.forEach(([fx, hh, ww], i) => {
      const x = w * fx, top = groundY - hh * s;
      poly(g, [[x - ww * s, groundY], [x, top], [x + ww * s, groundY]], i % 2 ? '#6d86a0' : '#7c94ad');
      poly(g, [[x - 42 * s, top + 44 * s], [x, top], [x + 42 * s, top + 44 * s], [x + 20 * s, top + 36 * s], [x, top + 48 * s], [x - 18 * s, top + 34 * s]], '#f5f8fb');
    });
    // spruce forest at the foot
    g.fillStyle = '#3f5f4a';
    for (let x = 0; x < w; x += 16 * s) { const h = (18 + ((x / s) % 5) * 4) * s; g.beginPath(); g.moveTo(x - 7 * s, groundY); g.lineTo(x, groundY - h); g.lineTo(x + 7 * s, groundY); g.fill(); }
  },

  // ——— Pro arena: Astana, Bayterek ———
  bayterek(g, geo) {
    const { w, groundY, s } = geo;
    skyline(g, geo, 'rgba(120,150,180,.35)', 3, 90);
    const x = w * 0.78, base = groundY, top = groundY - 215 * s;
    // white lattice trunk fanning out into a crown
    g.strokeStyle = '#f4f7fb'; g.lineWidth = 3 * s; g.lineCap = 'round';
    for (let k = -4; k <= 4; k++) {
      g.beginPath(); g.moveTo(x + k * 2.2 * s, base);
      g.bezierCurveTo(x + k * 2 * s, base - 120 * s, x + k * 1 * s, top + 70 * s, x + k * 9 * s, top + 10 * s);
      g.stroke();
    }
    g.strokeStyle = 'rgba(160,180,200,.8)'; g.lineWidth = 1.2 * s;
    for (let y = base - 20 * s; y > top + 60 * s; y -= 14 * s) { g.beginPath(); g.moveTo(x - 9 * s, y); g.lineTo(x + 9 * s, y - 7 * s); g.stroke(); }
    // golden sphere
    const gr = g.createRadialGradient(x - 6 * s, top - 6 * s, 3 * s, x, top, 26 * s);
    gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#f0bf3a'); gr.addColorStop(1, '#b07d10');
    g.fillStyle = gr; g.beginPath(); g.arc(x, top, 24 * s, 0, 7); g.fill();
  },

  // ——— Journey cities ———
  'city-astana'(g, geo) {
    const { w, groundY, s } = geo;
    skyline(g, geo, 'rgba(90,120,150,.3)', 5, 80);
    // Khan Shatyr: tilted transparent tent
    const x = w * 0.76, b = groundY, h = 190 * s, r = 90 * s;
    const grd = g.createLinearGradient(x - r, b, x + r, b - h);
    grd.addColorStop(0, 'rgba(210,225,235,.95)'); grd.addColorStop(1, 'rgba(160,190,210,.95)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(x - r, b);
    g.quadraticCurveTo(x - r * 0.25, b - h * 0.5, x + 18 * s, b - h);
    g.quadraticCurveTo(x + r * 0.35, b - h * 0.45, x + r, b); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.2 * s;
    for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x - r + k * r / 3, b); g.lineTo(x + 18 * s, b - h); g.stroke(); }
    rect(g, x + 14 * s, b - h - 30 * s, 4 * s, 32 * s, '#e0e6ea');
  },
  'city-karaganda'(g, geo) {
    const { w, groundY, s } = geo;
    // spoil heaps (terrikons)
    [[0.14, 120, 150], [0.33, 80, 110], [0.86, 140, 170]].forEach(([fx, hh, ww]) => poly(g, [[w * fx - ww * s, groundY], [w * fx, groundY - hh * s], [w * fx + ww * s, groundY]], '#4d4a45'));
    // mine headframe with wheel
    const x = w * 0.64, b = groundY, top = b - 150 * s;
    g.strokeStyle = '#2f2c28'; g.lineWidth = 5 * s;
    g.beginPath(); g.moveTo(x - 28 * s, b); g.lineTo(x, top); g.lineTo(x + 28 * s, b); g.moveTo(x, top); g.lineTo(x + 50 * s, b); g.stroke();
    g.lineWidth = 2 * s; for (let y = b - 25 * s; y > top + 20 * s; y -= 22 * s) { g.beginPath(); g.moveTo(x - 20 * s * (y - top) / (b - top), y); g.lineTo(x + 20 * s * (y - top) / (b - top), y); g.stroke(); }
    g.lineWidth = 4 * s; g.beginPath(); g.arc(x, top, 16 * s, 0, 7); g.stroke();
    rect(g, x - 70 * s, b - 45 * s, 40 * s, 45 * s, '#6d5a48');
  },
  'city-balkhash'(g, geo) {
    const { w, groundY, s } = geo;
    const y = groundY - 26 * s;
    const lake = g.createLinearGradient(0, 0, w, 0);
    lake.addColorStop(0, '#7fc3d6'); lake.addColorStop(0.48, '#8fd0da'); lake.addColorStop(0.52, '#4f9fb8'); lake.addColorStop(1, '#3f86a3');
    g.fillStyle = lake; g.fillRect(0, y, w, 26 * s);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5 * s;
    for (let x = 10; x < w; x += 46 * s) { g.beginPath(); g.moveTo(x, y + 9 * s); g.lineTo(x + 14 * s, y + 9 * s); g.stroke(); }
    g.strokeStyle = '#7c7440'; g.lineWidth = 2 * s;
    for (let i = 0; i < 30; i++) { const x = (i * 67) % w; g.beginPath(); g.moveTo(x, groundY); g.lineTo(x + 3 * s, groundY - (14 + (i % 4) * 5) * s); g.stroke(); }
  },
  'city-almaty'(g, geo) {
    const { w, groundY, s } = geo;
    poly(g, [[w * 0.45, groundY], [w * 0.72, groundY - 70 * s], [w * 1.05, groundY]], '#7f9a5c');
    // Kok-Tobe TV tower: tall lattice mast
    const x = w * 0.74, b = groundY - 66 * s, top = b - 190 * s;
    g.strokeStyle = '#8e99a3'; g.lineWidth = 2.6 * s;
    g.beginPath(); g.moveTo(x - 14 * s, b); g.lineTo(x - 2 * s, top); g.moveTo(x + 14 * s, b); g.lineTo(x + 2 * s, top); g.stroke();
    for (let y = b; y > top + 10 * s; y -= 12 * s) { const k = (y - top) / (b - top); g.beginPath(); g.moveTo(x - 14 * s * k, y); g.lineTo(x + 14 * s * k, y - 12 * s); g.stroke(); }
    rect(g, x - 1.5 * s, top - 30 * s, 3 * s, 30 * s, '#e05b4b');
    // apple trees
    [0.1, 0.2, 0.3, 0.88, 0.96].forEach((fx, i) => {
      const tx = w * fx, ty = groundY - 26 * s;
      rect(g, tx - 2 * s, ty, 4 * s, 26 * s, '#6b4a2c');
      g.fillStyle = '#5f8a3e'; g.beginPath(); g.arc(tx, ty - 6 * s, 20 * s, 0, 7); g.fill();
      g.fillStyle = '#d23b2f'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(tx + Math.cos(k * 1.7 + i) * 12 * s, ty - 6 * s + Math.sin(k * 2.3 + i) * 11 * s, 3 * s, 0, 7); g.fill(); }
    });
  },
  'city-taraz'(g, geo) {
    const { w, groundY, s } = geo;
    const x = w * 0.77, b = groundY, bw = 80 * s, bh = 90 * s;
    rect(g, x - bw / 2, b - bh, bw, bh, '#c9905a');
    // brick lace: small diamond grid
    g.strokeStyle = '#9b6a3c'; g.lineWidth = 1.3 * s;
    for (let yy = b - bh + 8 * s; yy < b - 6 * s; yy += 10 * s) for (let xx = x - bw / 2 + 6 * s; xx < x + bw / 2 - 4 * s; xx += 10 * s) {
      g.beginPath(); g.moveTo(xx, yy - 4 * s); g.lineTo(xx + 4 * s, yy); g.lineTo(xx, yy + 4 * s); g.lineTo(xx - 4 * s, yy); g.closePath(); g.stroke();
    }
    g.fillStyle = '#b77f4b'; g.beginPath(); g.moveTo(x - 30 * s, b - bh); g.quadraticCurveTo(x, b - bh - 55 * s, x + 30 * s, b - bh); g.fill();
    g.fillStyle = '#5a3a20'; g.beginPath(); g.moveTo(x - 12 * s, b); g.lineTo(x - 12 * s, b - 38 * s); g.quadraticCurveTo(x, b - 55 * s, x + 12 * s, b - 38 * s); g.lineTo(x + 12 * s, b); g.fill();
    [0.12, 0.2].forEach((fx) => { rect(g, w * fx - 2 * s, groundY - 90 * s, 4 * s, 90 * s, '#7b5a34'); g.fillStyle = '#6f8f4a'; g.beginPath(); g.ellipse(w * fx, groundY - 95 * s, 12 * s, 30 * s, 0, 0, 7); g.fill(); });
  },
  'city-turkestan'(g, geo) {
    const { w, groundY, s } = geo;
    const x = w * 0.74, b = groundY;
    rect(g, x - 110 * s, b - 80 * s, 220 * s, 80 * s, '#d8b98a');
    // big turquoise ribbed dome
    const dg = g.createLinearGradient(x + 20 * s, 0, x + 110 * s, 0); dg.addColorStop(0, '#2aa5b5'); dg.addColorStop(1, '#1b7a88');
    g.fillStyle = dg; g.beginPath(); g.ellipse(x + 55 * s, b - 80 * s, 42 * s, 55 * s, 0, Math.PI, 0); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5 * s;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x + 55 * s + k * 12 * s, b - 80 * s); g.quadraticCurveTo(x + 55 * s + k * 6 * s, b - 120 * s, x + 55 * s, b - 135 * s); g.stroke(); }
    // tall portal (peshtak) with pointed arch
    rect(g, x - 100 * s, b - 150 * s, 110 * s, 150 * s, '#caa476');
    g.fillStyle = '#7b5634'; g.beginPath(); g.moveTo(x - 75 * s, b); g.lineTo(x - 75 * s, b - 95 * s); g.quadraticCurveTo(x - 45 * s, b - 140 * s, x - 15 * s, b - 95 * s); g.lineTo(x - 15 * s, b); g.fill();
    rect(g, x - 104 * s, b - 150 * s, 8 * s, 150 * s, '#b58e5e'); rect(g, x + 6 * s, b - 150 * s, 8 * s, 150 * s, '#b58e5e');
  },
  'city-baikonur'(g, geo) {
    const { w, groundY, s } = geo;
    const x = w * 0.78, b = groundY;
    // gantry
    g.strokeStyle = '#8d3b2b'; g.lineWidth = 3 * s;
    g.beginPath(); g.moveTo(x - 40 * s, b); g.lineTo(x - 40 * s, b - 170 * s); g.moveTo(x - 28 * s, b); g.lineTo(x - 28 * s, b - 170 * s); g.stroke();
    for (let y = b; y > b - 170 * s; y -= 16 * s) { g.beginPath(); g.moveTo(x - 40 * s, y); g.lineTo(x - 28 * s, y - 16 * s); g.stroke(); }
    // rocket: core + boosters
    rect(g, x - 9 * s, b - 185 * s, 18 * s, 165 * s, '#f2f2ee');
    poly(g, [[x - 9 * s, b - 185 * s], [x, b - 215 * s], [x + 9 * s, b - 185 * s]], '#e2e2dc');
    [-1, 1].forEach((d) => { poly(g, [[x + d * 9 * s, b - 20 * s], [x + d * 9 * s, b - 90 * s], [x + d * 20 * s, b - 70 * s], [x + d * 20 * s, b - 20 * s]], '#dcdcd4'); });
    rect(g, x - 9 * s, b - 120 * s, 18 * s, 6 * s, '#c9463a');
    rect(g, x - 60 * s, b - 20 * s, 120 * s, 20 * s, '#7d7a70');
  },
  'city-aralsk'(g, geo) {
    const { w, groundY, s } = geo;
    // cracked dry seabed
    g.strokeStyle = 'rgba(120,90,50,.35)'; g.lineWidth = 1 * s;
    for (let i = 0; i < 26; i++) { const x = (i * 83) % w, y = groundY - 10 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12 * s, y - 4 * s); g.lineTo(x + 20 * s, y + 2 * s); g.stroke(); }
    // rusty ships stranded on sand
    [[0.72, 1], [0.9, 0.7], [0.14, 0.8]].forEach(([fx, k]) => {
      const x = w * fx, b = groundY - 4 * s, L = 120 * s * k, H = 34 * s * k;
      g.save(); g.translate(x, b); g.rotate(-0.06);
      poly(g, [[-L / 2, -H], [L / 2, -H], [L / 2 - 16 * s * k, 0], [-L / 2 + 10 * s * k, 0]], '#8a4b2b');
      rect(g, -L / 2, -H, L, 4 * s, '#6a3720');
      rect(g, -10 * s * k, -H - 22 * s * k, 30 * s * k, 22 * s * k, '#9b5a36');
      rect(g, 6 * s * k, -H - 40 * s * k, 6 * s * k, 20 * s * k, '#5d3a24');
      g.restore();
    });
    // a camel walking by
    const cx = w * 0.42, cy = groundY - 6 * s; g.fillStyle = '#9a7648';
    g.beginPath(); g.ellipse(cx, cy - 22 * s, 18 * s, 9 * s, 0, 0, 7); g.fill();
    g.beginPath(); g.arc(cx - 4 * s, cy - 30 * s, 7 * s, Math.PI, 0); g.fill();
    rect(g, cx + 14 * s, cy - 40 * s, 4 * s, 18 * s, '#9a7648'); rect(g, cx + 14 * s, cy - 42 * s, 9 * s, 5 * s, '#9a7648');
    [-12, -4, 6, 12].forEach((d) => rect(g, cx + d * s, cy - 16 * s, 3 * s, 16 * s, '#8a6a40'));
  },
  'city-atyrau'(g, geo) {
    const { w, groundY, s } = geo;
    const y = groundY - 22 * s;
    rect(g, 0, y, w, 22 * s, '#5b8fa8');
    // arched bridge across the Ural
    const x0 = w * 0.5, x1 = w * 1.02, deck = y - 26 * s;
    rect(g, x0, deck, x1 - x0, 6 * s, '#e7e2d6');
    g.strokeStyle = '#e7e2d6'; g.lineWidth = 4 * s;
    for (let x = x0; x < x1; x += 70 * s) { g.beginPath(); g.moveTo(x, deck + 6 * s); g.quadraticCurveTo(x + 35 * s, deck - 40 * s, x + 70 * s, deck + 6 * s); g.stroke(); }
    g.lineWidth = 1.5 * s; for (let x = x0; x < x1; x += 10 * s) { g.beginPath(); g.moveTo(x, deck); g.lineTo(x, deck - 18 * s * Math.abs(Math.sin(((x - x0) / (70 * s)) * Math.PI))); g.stroke(); }
    // Europe | Asia signpost
    const sx = w * 0.62; rect(g, sx, deck - 60 * s, 3 * s, 34 * s, '#3b3b3b');
    rect(g, sx - 34 * s, deck - 66 * s, 68 * s, 14 * s, '#1f4f8f');
    g.fillStyle = '#fff'; g.font = `700 ${Math.round(8 * s)}px Manrope, sans-serif`; g.textAlign = 'center'; g.fillText('EUROPE | ASIA', sx + 1 * s, deck - 56 * s);
  },
  'city-aktau'(g, geo) {
    const { w, groundY, s } = geo;
    const sea = g.createLinearGradient(0, groundY - 70 * s, 0, groundY);
    sea.addColorStop(0, '#2f7fa8'); sea.addColorStop(1, '#5fb1cf');
    g.fillStyle = sea; g.fillRect(0, groundY - 60 * s, w, 60 * s);
    // white chalk mesas
    poly(g, [[w * 0.58, groundY], [w * 0.6, groundY - 120 * s], [w * 0.7, groundY - 124 * s], [w * 0.73, groundY - 80 * s], [w * 0.8, groundY - 86 * s], [w * 0.84, groundY]], '#f1ece0');
    poly(g, [[w * 0.8, groundY], [w * 0.83, groundY - 150 * s], [w * 0.97, groundY - 146 * s], [w * 1.02, groundY]], '#e9e1cf');
    g.strokeStyle = 'rgba(200,120,80,.35)'; g.lineWidth = 3 * s;
    for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(w * 0.83, groundY - (150 - k * 26) * s); g.lineTo(w * 0.99, groundY - (146 - k * 26) * s); g.stroke(); }
  }
};

// Colour palettes per arena/city (sky, far hills, near hills, ground, sun, ink, extras)
export const THEMES = {
  steppe: { sky: ['#f7eed8', '#eed7a4'], far: '#d9c08a', near: '#c2a868', ground: ['#b8a064', '#9d8650'], chalk: 'rgba(255,250,235,.85)', sun: '#f4c66a', ink: '#2c2a22' },
  mountains: { sky: ['#dfeaf2', '#b9cfdf'], flat: true, landmark: 'alatau', ground: ['#9fae84', '#7f9068'], chalk: 'rgba(255,255,255,.85)', sun: '#fff3c4', ink: '#1f2a33' },
  campus: { sky: ['#e8e3da', '#d4cbbd'], far: '#9b5a44', near: '#7d4636', building: true, ground: ['#b9b3a8', '#a19a8e'], chalk: 'rgba(255,255,255,.9)', sun: null, ink: '#2a2622' },
  night: { sky: ['#0e1a2b', '#1c2c45'], far: '#1d2c3d', near: '#243649', stars: true, ground: ['#2f3d33', '#243027'], chalk: 'rgba(220,235,255,.7)', sun: '#e9eef7', ink: '#e9eef7' },
  bayterek: { sky: ['#cfe6f7', '#9cc7e6'], flat: true, landmark: 'bayterek', ground: ['#a8b3a0', '#8c9886'], chalk: 'rgba(255,255,255,.9)', sun: '#fff6cf', ink: '#1f2a33' },
  'city-astana': { sky: ['#dfeef8', '#bcd8ec'], flat: true, landmark: 'city-astana', ground: ['#b7bfb0', '#9aa392'], chalk: 'rgba(255,255,255,.9)', sun: '#fff1c2', ink: '#1f2a33' },
  'city-karaganda': { sky: ['#e3dfd6', '#c9c1b2'], flat: true, landmark: 'city-karaganda', ground: ['#8f8577', '#766c5f'], chalk: 'rgba(255,255,255,.8)', sun: '#f3e2b5', ink: '#23201c' },
  'city-balkhash': { sky: ['#eaf3f2', '#cfe2df'], far: '#c7c0a0', near: '#b9ae84', low: true, landmark: 'city-balkhash', ground: ['#c4b27a', '#a99761'], chalk: 'rgba(255,255,255,.85)', sun: '#fbe7a5', ink: '#2c2a22' },
  'city-almaty': { sky: ['#e6f0f5', '#c6dcea'], far: '#9bb3c4', near: '#8aa37a', low: true, landmark: 'city-almaty', ground: ['#8fae68', '#739252'], chalk: 'rgba(255,255,255,.85)', sun: '#fff0bf', ink: '#1f2a24' },
  'city-taraz': { sky: ['#f7ead0', '#efd2a0'], far: '#d8b27a', near: '#c79e62', low: true, landmark: 'city-taraz', ground: ['#c2a26b', '#a98a55'], chalk: 'rgba(255,250,235,.85)', sun: '#f7c25a', ink: '#2c2218' },
  'city-turkestan': { sky: ['#fbead0', '#f1cf98'], flat: true, landmark: 'city-turkestan', ground: ['#d3b27c', '#b99760'], chalk: 'rgba(255,250,235,.85)', sun: '#f6b64a', ink: '#2c2218' },
  'city-baikonur': { sky: ['#f4e2c2', '#e6c28c'], flat: true, landmark: 'city-baikonur', ground: ['#cfae74', '#b6955d'], chalk: 'rgba(255,250,235,.85)', sun: '#f2a948', ink: '#2c2218' },
  'city-aralsk': { sky: ['#f6e7c8', '#e9cb93'], flat: true, landmark: 'city-aralsk', ground: ['#d9c08c', '#c1a672'], chalk: 'rgba(255,250,235,.85)', sun: '#f5c15a', ink: '#2c2218' },
  'city-atyrau': { sky: ['#e9eef0', '#cbd9df'], flat: true, landmark: 'city-atyrau', ground: ['#b4ad8e', '#999275'], chalk: 'rgba(255,255,255,.85)', sun: '#fbe3a8', ink: '#1f2a24' },
  'city-aktau': { sky: ['#fbe0c4', '#f3b98d'], flat: true, landmark: 'city-aktau', ground: ['#d6c49c', '#bca982'], chalk: 'rgba(255,250,235,.85)', sun: '#f59a5a', ink: '#2c2218' }
};

// Team outfits: body colour + accents. 'team' uses the side colour.
export const OUTFIT_STYLE = {
  team: null,
  flag: { body: '#00a7c8', accent: '#f4c31b', kind: 'flag' },
  chapan: { body: '#7a1f2b', accent: '#e2b43a', kind: 'chapan' },
  sport: { body: '#f4f4f0', accent: '#1f5fbf', kind: 'sport' },
  student: { body: '#1f2e55', accent: '#f4f4f0', kind: 'student' }
};
