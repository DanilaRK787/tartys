// Canvas renderer. Reads a snapshot, never changes game state.
import { RULES } from '/shared/engine.js';
import { THEMES, LANDMARKS, OUTFIT_STYLE } from './scenery.js';
export { THEMES, OUTFIT_STYLE };
// Narxoz University logo for the Campus arena (supplied by the author for the Narxoz Incubator prototype)
const CAMPUS_LOGO = typeof Image !== 'undefined' ? Object.assign(new Image(), { src: '/img/narxoz-logo.png' }) : {};

export const SKINS = {
  classic: { shirt: null, rope: ['#c9a25a', '#8b6a35'], label: 'skinClassic', pro: false },
  steppe: { shirt: '#6f8f5a', rope: ['#a9b77a', '#6b7a43'], label: 'skinSteppe', pro: false },
  gold: { shirt: '#d9a520', rope: ['#f3cf5a', '#a87b12'], label: 'skinGold', pro: true, glow: '#ffd76a' },
  aurora: { shirt: '#3aa7a0', rope: ['#6fe0d0', '#7a5cd6'], label: 'skinAurora', pro: true, glow: '#8ef0e4', gradient: true },
  ornament: { shirt: '#b8322a', rope: ['#e9d6a8', '#b8322a'], label: 'skinOrnament', pro: true, pattern: true },
  campus: { shirt: '#1f3c7a', rope: ['#e8edf7', '#1f3c7a'], label: 'skinCampus', pro: true, stripes: true }
};
const SIDE_COLORS = ['#e2b43a', '#e0603f'];

export class Arena {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.fx = []; this.particles = []; this.shake = 0; this.time = 0;
    this.poses = new Map();
    this.stars = Array.from({ length: 60 }, () => [Math.random(), Math.random() * 0.45, Math.random()]);
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(280, r.width); this.h = Math.max(160, r.height);
    this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  geometry() {
    const w = this.w, h = this.h;
    const narrow = w < 560;
    const s = narrow ? Math.min(h / 300, w / 430) : Math.min(h / 360, w / 640) * 1.05;
    const cx = w / 2;
    const L = Math.min(w * 0.3, 260 * s + w * 0.08);
    return { w, h, s, cx, L, narrow, groundY: h * 0.8, ropeY: h * 0.8 - 58 * s };
  }

  markerX(pos) { const { cx, L } = this.geometry(); return cx + (pos / RULES.WIN) * L; }

  effect(kind, side, text, color) {
    const { cx, L, ropeY } = this.geometry();
    const x = side == null ? cx : cx + (side === 0 ? -1 : 1) * L * 0.55;
    this.fx.push({ kind, text, color: color || (side == null ? '#fff' : SIDE_COLORS[side]), x, y: ropeY - 90, life: 1400, age: 0 });
    if (!this.reduced && (kind === 'perfect' || kind === 'synced')) this.shake = 9;
    else if (!this.reduced && kind === 'burst') this.shake = 4;
    const mx = this.lastMarker ?? cx;
    const n = kind === 'perfect' ? 26 : kind === 'slip' ? 14 : 12;
    for (let i = 0; i < n; i++) this.particles.push({ x: mx + (Math.random() - 0.5) * 30, y: this.geometry().groundY - 4, vx: (Math.random() - 0.5) * 3.2, vy: -Math.random() * 3 - 0.5, life: 700 + Math.random() * 500, age: 0, c: kind === 'slip' ? '#8d7d5d' : '#d8c08a' });
  }

  draw(view, dt, opts = {}) {
    this.time += dt;
    const g = this.g, geo = this.geometry();
    const th = THEMES[opts.theme] || THEMES.steppe;
    const skins = (opts.skins || ['classic', 'classic']).map((k) => SKINS[k] || SKINS.classic);
    this.outfits = (opts.outfits || ['team', 'team']).map((k) => OUTFIT_STYLE[k] || null);
    g.save();
    g.clearRect(0, 0, geo.w, geo.h);
    if (this.shake > 0.2) { g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake); this.shake *= 0.86; }
    if (opts.zoom) { g.translate(geo.w / 2, geo.h / 2); g.scale(opts.zoom.k, opts.zoom.k); g.translate(-opts.zoom.x, -opts.zoom.y); } // close-up for shop slides
    this.background(th, geo);
    this.lines(th, geo, view);
    const mx = this.markerX(view.pos || 0);
    this.lastMarker = mx;
    this.rope(geo, mx, skins, view);
    this.teams(geo, mx, view, skins, th);
    this.marker(geo, mx, view);
    this.updateParticles(dt, g);
    this.drawFx(dt, g, geo);
    g.restore();
  }

  background(th, { w, h, s, groundY }) {
    const g = this.g;
    const sky = g.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
    g.fillStyle = sky; g.fillRect(0, 0, w, groundY);
    if (th.stars) { g.fillStyle = '#fff'; for (const [x, y, a] of this.stars) { g.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(this.time / 900 + a * 9)); g.fillRect(x * w, y * h, 1.6, 1.6); } g.globalAlpha = 1; }
    if (th.sun) { g.fillStyle = th.sun; g.globalAlpha = th.stars ? 0.9 : 0.7; g.beginPath(); g.arc(w * 0.78, h * 0.2, 26 * s, 0, 7); g.fill(); g.globalAlpha = 1; }
    if (th.building) {
      g.fillStyle = th.far;
      const bw = w * 0.9, bx = w * 0.05, by = groundY - 150 * s;
      g.fillRect(bx, by, bw, 150 * s);
      // university sign on the roof (logo image; drawn once it has loaded)
      if (CAMPUS_LOGO.complete && CAMPUS_LOGO.naturalWidth) {
        const lw = Math.min(bw * 0.42, 230 * s), lh = lw * (CAMPUS_LOGO.naturalHeight / CAMPUS_LOGO.naturalWidth);
        const lx = w / 2 - lw / 2, ly = by - lh - 10 * s;
        g.fillStyle = '#6b3a2c'; g.fillRect(lx + lw * 0.2, ly + lh, 4 * s, 10 * s); g.fillRect(lx + lw * 0.8 - 4 * s, ly + lh, 4 * s, 10 * s); // posts
        g.fillStyle = '#ffffff'; g.fillRect(lx - 6 * s, ly - 5 * s, lw + 12 * s, lh + 10 * s);
        g.strokeStyle = '#d9d2c5'; g.lineWidth = 1.5 * s; g.strokeRect(lx - 6 * s, ly - 5 * s, lw + 12 * s, lh + 10 * s);
        g.drawImage(CAMPUS_LOGO, lx, ly, lw, lh);
      }
      g.fillStyle = 'rgba(255,240,220,.55)';
      for (let x = bx + 18 * s; x < bx + bw - 30 * s; x += 46 * s) for (let y = by + 18 * s; y < groundY - 40 * s; y += 38 * s) g.fillRect(x, y, 22 * s, 20 * s);
    } else if (!th.flat) {
      this.hills(th.far, groundY - (th.low ? 40 : 70) * s, (th.low ? 40 : 70) * s, 0.004, 1.3, th.snow);
      this.hills(th.near, groundY - (th.low ? 18 : 30) * s, (th.low ? 22 : 40) * s, 0.007, 4.1, false);
    }
    if (th.landmark && LANDMARKS[th.landmark]) {
      // landmarks are ~250 units tall: shrink them on short canvases so nothing is cut off
      const geo = this.geometry(); const lg = { ...geo, s: Math.min(geo.s, (geo.groundY - 8) / 250) };
      g.save(); LANDMARKS[th.landmark](g, lg, this.time); g.restore();
    }
    const gr = g.createLinearGradient(0, groundY, 0, h);
    gr.addColorStop(0, th.ground[0]); gr.addColorStop(1, th.ground[1]);
    g.fillStyle = gr; g.fillRect(0, groundY - 1, w, h - groundY + 1);
    g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const x = (i * 97.3) % w, y = groundY + 8 + ((i * 37) % Math.max(10, h - groundY - 10)); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y - 6); g.stroke(); }
  }

  hills(color, base, amp, freq, seed, snow) {
    const g = this.g, w = this.w;
    g.fillStyle = color; g.beginPath(); g.moveTo(0, base + amp);
    const pts = [];
    for (let x = 0; x <= w + 10; x += 10) {
      const y = base + amp * 0.5 - amp * 0.5 * (Math.sin(x * freq + seed) * 0.6 + Math.sin(x * freq * 2.7 + seed * 2) * 0.4) * (snow ? 1.6 : 1);
      pts.push([x, y]); g.lineTo(x, y);
    }
    g.lineTo(w, base + amp * 2); g.lineTo(0, base + amp * 2); g.closePath(); g.fill();
    if (snow) {
      g.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i]; if (y < pts[i - 1][1] && y < pts[i + 1][1] && y < base) { g.beginPath(); g.moveTo(x - 14, y + 10); g.lineTo(x, y); g.lineTo(x + 14, y + 10); g.closePath(); g.fill(); } }
    }
  }

  lines(th, { cx, L, groundY, h, s }, view) {
    const g = this.g;
    // centre draw zone
    const dz = (RULES.DRAW_ZONE / RULES.WIN) * L;
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(cx - dz, groundY, dz * 2, h - groundY);
    g.setLineDash([8 * s, 7 * s]); g.strokeStyle = th.chalk; g.lineWidth = 2 * s;
    g.beginPath(); g.moveTo(cx, groundY + 2); g.lineTo(cx, h); g.stroke(); g.setLineDash([]);
    // finish lines
    [[-1, 0], [1, 1]].forEach(([dir, side]) => {
      const x = cx + dir * L;
      g.strokeStyle = SIDE_COLORS[side]; g.lineWidth = 5 * s;
      g.beginPath(); g.moveTo(x, groundY + 2); g.lineTo(x, h); g.stroke();
      // flag pole
      g.strokeStyle = th.ink; g.lineWidth = 2 * s;
      g.beginPath(); g.moveTo(x, groundY + 4); g.lineTo(x, groundY - 118 * s); g.stroke();
      g.fillStyle = SIDE_COLORS[side];
      const wave = Math.sin(this.time / 260 + side) * 3 * s;
      g.beginPath(); g.moveTo(x, groundY - 118 * s); g.lineTo(x - dir * 30 * s, groundY - 110 * s + wave); g.lineTo(x, groundY - 100 * s); g.closePath(); g.fill();
    });
    // danger glow when close to a line
    const p = view.pos || 0;
    if (Math.abs(p) > 70 && view.phase === 'play') {
      const side = p < 0 ? 0 : 1; const x = cx + (p < 0 ? -L : L);
      g.fillStyle = SIDE_COLORS[side]; g.globalAlpha = 0.12 + 0.1 * Math.sin(this.time / 90);
      g.fillRect(x - 30 * s, groundY - 140 * s, 60 * s, 140 * s + (h - groundY)); g.globalAlpha = 1;
    }
  }

  rope(geo, mx, skins, view) {
    const g = this.g, { w, ropeY, s } = geo;
    const tension = Math.min(1, Math.abs(view.vel || 0) / 12);
    const sag = (6 - tension * 5) * s;
    const seg = (x0, x1, skin) => {
      g.lineCap = 'round';
      g.lineWidth = 7 * s; g.strokeStyle = skin.rope[1];
      if (skin.gradient) { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, skin.rope[0]); gr.addColorStop(1, skin.rope[1]); g.strokeStyle = gr; }
      if (skin.glow) { g.shadowColor = skin.glow; g.shadowBlur = 10 * s; }
      g.beginPath(); g.moveTo(x0, ropeY); g.quadraticCurveTo((x0 + x1) / 2, ropeY + sag, x1, ropeY); g.stroke();
      g.shadowBlur = 0;
      // twist pattern
      g.lineWidth = 2 * s; g.strokeStyle = skin.rope[0];
      const step = (skin.pattern ? 16 : 9) * s;
      for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x += step) {
        const tt = (x - x0) / (x1 - x0 || 1); const y = ropeY + sag * 4 * tt * (1 - tt);
        g.beginPath();
        if (skin.pattern) { g.moveTo(x - 4 * s, y); g.lineTo(x, y - 4 * s); g.lineTo(x + 4 * s, y); g.lineTo(x, y + 4 * s); g.closePath(); g.stroke(); }
        else if (skin.stripes) { g.moveTo(x, y - 3 * s); g.lineTo(x, y + 3 * s); g.stroke(); }
        else { g.moveTo(x - 3 * s, y - 3 * s); g.lineTo(x + 3 * s, y + 3 * s); g.stroke(); }
      }
    };
    seg(-10, mx, skins[0]); seg(mx, w + 10, skins[1]);
  }

  marker(geo, mx, view) {
    const g = this.g, { ropeY, s } = geo;
    g.fillStyle = '#c8322b';
    const flap = Math.sin(this.time / 120) * 4 * s;
    g.beginPath(); g.moveTo(mx - 7 * s, ropeY); g.lineTo(mx + 7 * s, ropeY); g.lineTo(mx + 4 * s + flap, ropeY + 34 * s); g.lineTo(mx - 4 * s + flap, ropeY + 34 * s); g.closePath(); g.fill();
    g.fillStyle = '#fff4dc'; g.beginPath(); g.arc(mx, ropeY, 6 * s, 0, 7); g.fill();
    g.strokeStyle = '#c8322b'; g.lineWidth = 2.5 * s; g.stroke();
  }

  teams(geo, mx, view, skins, th) {
    const players = view.players || [];
    for (const side of [0, 1]) {
      const team = players.filter((p) => p.side === side);
      if (!team.length) continue;
      const dir = side === 0 ? -1 : 1;
      const count = geo.narrow ? 2 : team.length === 1 ? 3 : 4;
      for (let i = 0; i < count; i++) {
        const p = team[i % team.length];
        const x = mx + dir * (70 + i * 58) * geo.s;
        const outfit = this.outfits?.[side];
        const shirt = outfit ? outfit.body : skins[side].shirt || SIDE_COLORS[side];
        this.figure(geo, x, dir, p, shirt, th, i, team.length > 1 && i < team.length, outfit);
      }
    }
  }

  figure(geo, x, dir, p, shirt, th, i, lead, outfit) {
    const g = this.g, { groundY, ropeY, s } = geo;
    const key = p.id + ':' + i;
    const ex = p.ex > 0;
    let target = p.hold ? 0.62 : 0.2;
    if (p.wind) target = 0.95;
    if (ex) target = -0.25 + Math.sin(this.time / 70 + i) * 0.12;
    const prev = this.poses.get(key) ?? 0.2;
    const lean = prev + (target - prev) * 0.22;
    this.poses.set(key, lean);
    const tired = Math.max(0, 1 - (p.st ?? 100) / 100);
    const bob = p.hold ? Math.sin(this.time / 90 + i * 1.7) * 1.5 * s : 0;
    const hip = { x: x + dir * lean * 10 * s, y: groundY - 34 * s + bob };
    const angle = lean * 0.75; // radians from vertical, leaning away from rope (dir)
    const bodyLen = 34 * s;
    const neck = { x: hip.x + dir * Math.sin(angle) * bodyLen, y: hip.y - Math.cos(angle) * bodyLen };
    const head = { x: neck.x + dir * Math.sin(angle) * 9 * s, y: neck.y - Math.cos(angle) * 9 * s };
    const hand = { x: x - dir * 16 * s, y: ropeY };
    const alpha = ex ? 0.55 : 1;
    g.globalAlpha = alpha;
    g.lineCap = 'round'; g.lineJoin = 'round';
    // legs
    g.strokeStyle = th.ink; g.lineWidth = 5 * s;
    const footBack = { x: hip.x + dir * (10 + lean * 16) * s, y: groundY };
    const footFront = { x: hip.x - dir * (12 + lean * 6) * s, y: groundY };
    g.beginPath(); g.moveTo(footBack.x, footBack.y); g.lineTo(hip.x, hip.y); g.lineTo(footFront.x, footFront.y); g.stroke();
    // body
    if (outfit && !ex) this.outfitDetails(g, outfit, hip, neck, s, dir);
    else { g.strokeStyle = ex ? '#8a8a80' : shirt; g.lineWidth = 11 * s; g.beginPath(); g.moveTo(hip.x, hip.y); g.lineTo(neck.x, neck.y); g.stroke(); }
    // arms to rope
    g.strokeStyle = th.ink; g.lineWidth = 4 * s;
    g.beginPath(); g.moveTo(neck.x, neck.y + 4 * s); g.lineTo(hand.x, hand.y); g.stroke();
    // head
    g.fillStyle = '#e7c09a'; g.beginPath(); g.arc(head.x, head.y, 8 * s, 0, 7); g.fill();
    g.fillStyle = th.ink; g.beginPath(); g.arc(head.x, head.y - 3 * s, 8 * s, Math.PI, 0); g.fill();
    if (outfit?.kind === 'chapan') { // white kalpak with a dark brim
      g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(head.x - 8 * s, head.y - 5 * s); g.quadraticCurveTo(head.x - 3 * s, head.y - 16 * s, head.x + dir * 3 * s, head.y - 23 * s); g.quadraticCurveTo(head.x + 4 * s, head.y - 14 * s, head.x + 8 * s, head.y - 5 * s); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 0.7 * s; g.stroke();
      g.fillStyle = '#2a2a2a'; g.fillRect(head.x - 8.5 * s, head.y - 7.5 * s, 17 * s, 3.2 * s);          // black brim
      g.strokeStyle = '#e2b43a'; g.lineWidth = 0.7 * s; g.beginPath();                                        // gold zigzag on the brim
      for (let k = -7; k <= 7; k += 2) { g.lineTo(head.x + k * s, head.y - 6.9 * s); g.lineTo(head.x + (k + 1) * s, head.y - 5.2 * s); } g.stroke();
      g.fillStyle = '#c8322b'; g.beginPath(); g.arc(head.x + dir * 3 * s, head.y - 23 * s, 1.4 * s, 0, 7); g.fill(); // tassel
    }
    if (outfit?.kind === 'sport') { g.strokeStyle = outfit.accent; g.lineWidth = 2.5 * s; g.beginPath(); g.arc(head.x, head.y - 1 * s, 8 * s, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }
    // effort marks
    if (p.hold && tired > 0.55 && !ex) { g.fillStyle = '#7fb6e6'; g.beginPath(); g.arc(head.x - dir * 10 * s, head.y - 6 * s + (this.time / 8 % 10) * 0.4 * s, 2.2 * s, 0, 7); g.fill(); }
    if (p.wind) { g.strokeStyle = shirt; g.globalAlpha = 0.6; g.lineWidth = 2 * s; g.beginPath(); g.arc(neck.x, neck.y, 20 * s, 0, 7); g.stroke(); }
    if (lead) { g.fillStyle = shirt; g.globalAlpha = 1; g.beginPath(); g.moveTo(head.x, head.y - 20 * s); g.lineTo(head.x - 5 * s, head.y - 28 * s); g.lineTo(head.x + 5 * s, head.y - 28 * s); g.closePath(); g.fill(); }
    g.globalAlpha = 1;
    if (p.hold && Math.random() < 0.08 && !this.reduced) this.particles.push({ x: footFront.x, y: groundY - 2, vx: dir * (0.5 + Math.random()), vy: -Math.random() * 1.2, life: 500, age: 0, c: '#cdb67f' });
  }

  /**
   * Detailed outfits. The torso is redrawn as a shape in its own coordinates:
   * origin at the hip, y goes up the body (negative), x across it; so details stay on the body when it leans.
   */
  outfitDetails(g, o, hip, neck, s, dir) {
    const dx = neck.x - hip.x, dy = neck.y - hip.y, len = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx) + Math.PI / 2;
    const W = (o.kind === 'chapan' ? 16 : 13) * s, H = len + 3 * s;
    g.save();
    g.translate(hip.x, hip.y); g.rotate(ang);
    if (dir > 0) g.scale(-1, 1); // mirror for the right team so the front stays at the front
    const torso = () => { g.beginPath(); g.moveTo(-W / 2, 2 * s); g.lineTo(-W / 2 + 1 * s, -H + 3 * s); g.quadraticCurveTo(0, -H - 1 * s, W / 2 - 1 * s, -H + 3 * s); g.lineTo(W / 2, 2 * s); g.closePath(); };
    g.fillStyle = o.body; torso(); g.fill();
    g.save(); torso(); g.clip();
    const gold = o.accent;
    if (o.kind === 'flag') {
      // sky-blue shirt: national ornament band on the left edge, 32-ray sun and a steppe eagle on the chest
      g.fillStyle = gold; g.fillRect(-W / 2, -H, 3 * s, H + 3 * s);
      g.fillStyle = o.body;
      for (let y = -H + 2 * s; y < 0; y += 4.2 * s) { g.beginPath(); g.moveTo(-W / 2 + 1.5 * s, y); g.lineTo(-W / 2 + 2.6 * s, y + 1.4 * s); g.lineTo(-W / 2 + 1.5 * s, y + 2.8 * s); g.lineTo(-W / 2 + 0.4 * s, y + 1.4 * s); g.closePath(); g.fill(); }
      const cx = 1.5 * s, cy = -H * 0.66;
      g.strokeStyle = gold; g.lineWidth = 0.7 * s;
      for (let i = 0; i < 16; i++) { const a2 = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a2) * 2.6 * s, cy + Math.sin(a2) * 2.6 * s); g.lineTo(cx + Math.cos(a2) * 3.9 * s, cy + Math.sin(a2) * 3.9 * s); g.stroke(); }
      g.fillStyle = gold; g.beginPath(); g.arc(cx, cy, 2.2 * s, 0, 7); g.fill();
      // eagle: two swept wings under the sun
      g.beginPath(); g.moveTo(cx - 5 * s, cy + 5.5 * s); g.quadraticCurveTo(cx - 1.5 * s, cy + 3 * s, cx, cy + 5 * s); g.quadraticCurveTo(cx + 1.5 * s, cy + 3 * s, cx + 5 * s, cy + 5.5 * s);
      g.quadraticCurveTo(cx + 2 * s, cy + 5 * s, cx, cy + 7 * s); g.quadraticCurveTo(cx - 2 * s, cy + 5 * s, cx - 5 * s, cy + 5.5 * s); g.fill();
    } else if (o.kind === 'chapan') {
      // burgundy velvet chapan: gold edging, open front, "koshkar muiz" (ram's horn) ornaments, belt with a buckle
      g.strokeStyle = gold; g.lineWidth = 1.4 * s;
      g.beginPath(); g.moveTo(1 * s, -H); g.lineTo(0, 2 * s); g.stroke();                       // front opening
      g.lineWidth = 1.8 * s; g.beginPath(); g.moveTo(-W / 2, 0.5 * s); g.lineTo(W / 2, 0.5 * s); g.stroke(); // hem edging
      g.beginPath(); g.moveTo(-W / 2 + 0.8 * s, 0); g.lineTo(-W / 2 + 1.6 * s, -H); g.stroke();
      const horn = (x, y, k) => { // ram's horn curl: two mirrored spirals
        g.lineWidth = 0.9 * s; g.beginPath();
        g.moveTo(x, y); g.bezierCurveTo(x - 2.2 * k, y - 0.2 * k, x - 2.4 * k, y - 2.4 * k, x - 1 * k, y - 2.4 * k); g.quadraticCurveTo(x - 0.2 * k, y - 2.2 * k, x - 0.6 * k, y - 1.4 * k);
        g.moveTo(x, y); g.bezierCurveTo(x + 2.2 * k, y - 0.2 * k, x + 2.4 * k, y - 2.4 * k, x + 1 * k, y - 2.4 * k); g.quadraticCurveTo(x + 0.2 * k, y - 2.2 * k, x + 0.6 * k, y - 1.4 * k);
        g.stroke();
      };
      horn(-3.8 * s, -3 * s, s); horn(4 * s, -3 * s, s);         // along the hem
      horn(-3.6 * s, -H * 0.72, 0.9 * s); horn(4 * s, -H * 0.72, 0.9 * s); // on the chest
      g.fillStyle = '#2a1414'; g.fillRect(-W / 2, -H * 0.38, W, 3 * s);   // belt
      g.fillStyle = gold; g.fillRect(-1.4 * s, -H * 0.38 - 0.4 * s, 3.4 * s, 3.8 * s);
    } else if (o.kind === 'sport') {
      // white jersey: side stripes, coloured collar, number
      g.fillStyle = gold; g.fillRect(-W / 2 + 1 * s, -H, 1.6 * s, H + 3 * s); g.fillRect(W / 2 - 2.6 * s, -H, 1.6 * s, H + 3 * s);
      g.fillRect(-W / 2, -H, W, 2.2 * s);
      g.font = `900 ${Math.round(7.5 * s)}px Manrope, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = gold; g.fillText('7', 0.5 * s, -H * 0.55);
    } else if (o.kind === 'student') {
      // navy hoodie: kangaroo pocket, drawstrings, small crest
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.9 * s;
      g.beginPath(); g.moveTo(-4 * s, -3 * s); g.lineTo(-3 * s, -9 * s); g.lineTo(3 * s, -9 * s); g.lineTo(4 * s, -3 * s); g.stroke();
      g.strokeStyle = o.accent; g.lineWidth = 0.8 * s;
      g.beginPath(); g.moveTo(-1.5 * s, -H + 2 * s); g.lineTo(-1.8 * s, -H + 8 * s); g.moveTo(1.5 * s, -H + 2 * s); g.lineTo(1.8 * s, -H + 8 * s); g.stroke();
      g.fillStyle = o.accent; g.beginPath(); g.moveTo(2 * s, -H * 0.62); g.lineTo(5 * s, -H * 0.62); g.lineTo(5 * s, -H * 0.62 + 3 * s); g.lineTo(3.5 * s, -H * 0.62 + 4.2 * s); g.lineTo(2 * s, -H * 0.62 + 3 * s); g.closePath(); g.fill();
    }
    g.restore(); // unclip
    // outline so the shape reads at small sizes
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 0.8 * s; torso(); g.stroke();
    if (o.kind === 'student') { g.fillStyle = o.body; g.beginPath(); g.ellipse(0, -H + 1 * s, 6 * s, 3.2 * s, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.28)'; g.stroke(); } // hood
    g.restore();
  }

  updateParticles(dt, g) {
    for (const p of this.particles) { p.age += dt; p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy += 0.12 * dt / 16; }
    this.particles = this.particles.filter((p) => p.age < p.life).slice(-160);
    for (const p of this.particles) { g.globalAlpha = 1 - p.age / p.life; g.fillStyle = p.c; g.fillRect(p.x, p.y, 3, 3); }
    g.globalAlpha = 1;
  }

  drawFx(dt, g, { s }) {
    for (const f of this.fx) {
      f.age += dt;
      const k = f.age / f.life;
      g.globalAlpha = Math.max(0, 1 - k * k);
      g.font = `800 ${Math.round((f.kind === 'perfect' || f.kind === 'synced' ? 22 : 16) * s)}px Manrope, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 4 * s; g.strokeStyle = 'rgba(20,20,20,.55)';
      const y = f.y - k * 30 * s;
      const half = g.measureText(f.text).width / 2 + 6;
      const x = Math.max(half, Math.min(this.w - half, f.x)); // keep popups inside narrow screens
      g.strokeText(f.text, x, y); g.fillStyle = f.color; g.fillText(f.text, x, y);
    }
    g.globalAlpha = 1;
    this.fx = this.fx.filter((f) => f.age < f.life);
  }
}

/** Static preview for shop / profile cards: draws one frame with a mid-pull pose. */
export function renderPreview(canvas, { theme = 'steppe', outfit = 'team', skin = 'classic', pos = -18, zoom = null } = {}) {
  const a = new Arena(canvas);
  a.reduced = true;
  let z = null;
  if (zoom) {
    const geo = a.geometry(); const mx = a.markerX(pos);
    z = zoom === 'outfit' ? { x: mx - (70 + 58) * geo.s, y: geo.groundY - 48 * geo.s, k: 2.6 } // second person of the left team
      : { x: mx - 40 * geo.s, y: geo.ropeY + 2 * geo.s, k: 3.2 };                             // rope right next to the marker
  }
  const snap = { phase: 'play', pos, vel: -6, players: [
    { id: 'l', side: 0, st: 70, hold: true, ex: 0, wind: false },
    { id: 'r', side: 1, st: 40, hold: false, ex: 0, wind: false }] };
  const paint = () => { for (let i = 0; i < 12; i++) a.draw(snap, 16, { theme, outfits: [outfit, 'team'], skins: [skin, 'classic'], zoom: z }); };
  paint();
  if (theme === 'campus' && !(CAMPUS_LOGO.complete && CAMPUS_LOGO.naturalWidth)) CAMPUS_LOGO.addEventListener?.('load', paint, { once: true });
  return a;
}
