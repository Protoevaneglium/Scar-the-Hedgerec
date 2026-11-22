/** Sanctuary Duet scenery and native, owner-supplied crocodile/crawfish sprites. */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SanctuaryDuetArt = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';
    const TAU = Math.PI * 2, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const mod = (n, d) => ((n % d) + d) % d;
    const source = 'assets/duo_boss.png';
    // Native atlas rectangles, checked against duo_boss_sources/manifest.json.
    const frames = Object.freeze(Object.fromEntries(Object.entries({
        croc_idle1: [2, 2, 58, 70], croc_idle2: [64, 2, 61, 70], croc_warn: [129, 2, 59, 69],
        croc_sing1: [192, 2, 57, 74], croc_sing2: [253, 2, 57, 82], note: [314, 2, 8, 7],
        craw_idle1: [326, 2, 66, 64], craw_idle2: [396, 2, 66, 63],
        craw_warn1: [466, 2, 66, 64], craw_warn2: [536, 2, 66, 68], craw_attack: [606, 2, 67, 43],
        claw1: [677, 2, 49, 28], claw2: [730, 2, 51, 30],
    }).map(([key, r]) => [key, Object.freeze({ sx: r[0], sy: r[1], w: r[2], h: r[3] })])));
    let sheet = null, ready = false, failed = false;
    if (root && typeof root.Image === 'function') {
        sheet = new root.Image();
        sheet.onload = () => { ready = true; failed = false; };
        sheet.onerror = () => { ready = false; failed = true; };
        sheet.src = source;
    }
    function getBossFrame(member, clock = 0) {
        const m = member || {}, t = Number.isFinite(m.stateAge) ? m.stateAge : clock;
        const alt = Math.floor(Math.max(0, t) / 14) % 2;
        if (m.id === 'crocodile' || m.species === 'crocodile') {
            if (m.state === 'attack') return alt ? 'croc_sing2' : 'croc_sing1';
            if (m.state === 'warn') return 'croc_warn';
            return alt ? 'croc_idle2' : 'croc_idle1';
        }
        if (m.state === 'warn') return alt ? 'craw_warn2' : 'craw_warn1';
        if (m.state === 'attack' || m.state === 'recover') return 'craw_attack';
        return alt ? 'craw_idle2' : 'craw_idle1';
    }
    function getProjectileFrame(projectile, clock = 0) {
        if (projectile.kind === 'note') return 'note';
        return Math.floor(Math.max(0, Number.isFinite(projectile.age) ? projectile.age : clock) / 7) % 2 ? 'claw2' : 'claw1';
    }
    function poly(c, p, fill) {
        c.fillStyle = fill; c.beginPath(); c.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
        c.closePath(); c.fill();
    }
    function line(c, p, color, width = 2) {
        c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
        c.stroke();
    }
    function circle(c, x, y, r, fill) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    function marker(c, x, y) {
        c.save(); c.fillStyle = '#18213a'; c.fillRect(x - 14, y - 14, 28, 28);
        c.strokeStyle = '#ffdd74'; c.lineWidth = 2; c.strokeRect(x - 14, y - 14, 28, 28);
        c.fillStyle = '#fff0b4'; c.font = 'bold 20px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('!', x, y); c.restore();
    }
    function sprite(c, key, x, y, scale, facing = 1, grounded = false) {
        if (!ready || !sheet) { marker(c, x, grounded ? y - 65 : y); return false; }
        const f = frames[key];
        c.save(); c.imageSmoothingEnabled = false;
        c.translate(Math.round(x), Math.round(y)); c.scale(facing * scale, scale);
        c.drawImage(sheet, f.sx, f.sy, f.w, f.h, -f.w / 2, grounded ? -f.h : -f.h / 2, f.w, f.h);
        c.restore(); return true;
    }
    function cloud(c, x, y, w, color) {
        c.fillStyle = color; c.fillRect(x, y + 9, w, 15); c.fillRect(x + w * .12, y, w * .72, 24);
        c.fillRect(x + w * .35, y - 8, w * .35, 35);
    }
    function column(c, x, top, bottom, w = 30) {
        if (!(bottom > top)) return;
        c.fillStyle = '#8f8157'; c.fillRect(x, top, w, bottom - top);
        c.fillStyle = '#ead59a'; c.fillRect(x + 3, top, w - 6, bottom - top);
        c.fillStyle = '#fff3c2'; c.fillRect(x + 6, top, 5, bottom - top);
        c.fillStyle = '#c9b47b'; c.fillRect(x + w - 9, top, 5, bottom - top);
        for (let y = top + 28; y < bottom - 12; y += 40) { c.fillStyle = '#9d885f'; c.fillRect(x + 2, y, w - 4, 3); }
        for (const y of [top, bottom - 9]) {
            c.fillStyle = '#b6985f'; c.fillRect(x - 6, y, w + 12, 9);
            c.fillStyle = '#fff1b5'; c.fillRect(x - 6, y, w + 12, 3);
        }
    }
    function temple(c, x, y, scale = 1) {
        c.save(); c.translate(x, y); c.scale(scale, scale);
        c.fillStyle = '#725a88'; c.fillRect(-92, -95, 184, 95);
        poly(c, [[-116, -100], [0, -153], [116, -100]], '#b6a17a');
        poly(c, [[-102, -103], [0, -143], [102, -103]], '#ffedb0');
        line(c, [[-110, -100], [110, -100]], '#bf9c60', 5);
        c.fillStyle = '#473c65'; c.fillRect(-30, -77, 60, 77);
        for (const dx of [-90, -56, 36, 70]) column(c, dx, -92, 0, 20);
        c.fillStyle = '#e4c985'; c.fillRect(-110, -7, 220, 7);
        c.fillStyle = '#91ad5a'; c.fillRect(-115, 0, 230, 5);
        c.restore();
    }
    function island(c, x, y, width, depth, color) {
        poly(c, [[x, y], [x + width, y], [x + width * .9, y + depth * .44],
            [x + width * .69, y + depth * .57], [x + width * .59, y + depth],
            [x + width * .44, y + depth * .65], [x + width * .23, y + depth * .8], [x + width * .08, y + depth * .36]], color);
        c.fillStyle = '#d9c39a'; c.fillRect(x, y - 6, width, 9);
        c.fillStyle = '#a9bd6c'; c.fillRect(x, y - 9, width, 4);
    }
    function road(c, surf, g, main) {
        if (!surf) return;
        const x0 = Math.max(surf.x0, g.view.x0 - 10), x1 = Math.min(surf.x1, g.view.x1 + 10);
        if (!(x1 > x0)) return;
        const y = surf.f(x0), depth = surf.thickness || 30;
        c.fillStyle = '#514064'; c.fillRect(x0, y + 4, x1 - x0, depth - 4);
        c.fillStyle = '#9879a6'; c.fillRect(x0, y + 10, x1 - x0, depth - 16);
        for (let row = 0; 13 + row * 25 < depth - 5; row++) {
            const yy = y + 13 + row * 25, offset = row % 2 ? 32 : 0;
            line(c, [[x0, yy], [x1, yy]], '#5f4a76', 2);
            for (let x = Math.floor(x0 / 64) * 64 - offset; x < x1; x += 64) {
                if (x > x0) line(c, [[x, yy], [x, Math.min(y + depth - 5, yy + 25)]], '#5f4a76', 2);
                if (x > x0 + 8 && x + 24 < x1 && row % 3 === 0) line(c, [[x + 6, yy + 5], [x + 6, yy + 14], [x + 23, yy + 14]], '#c6a1c6', 2);
            }
        }
        c.fillStyle = '#d9c086'; c.fillRect(x0, y, x1 - x0, 11);
        c.fillStyle = '#f9e5ab'; c.fillRect(x0, y, x1 - x0, 3);
        c.fillStyle = '#5c7843'; c.fillRect(x0, y - 4, x1 - x0, 5);
        c.fillStyle = '#bad174'; c.fillRect(x0, y - 5, x1 - x0, 2);
        if (main) {
            for (let x = Math.floor(x0 / 96) * 96; x < x1; x += 96) {
                if (x + 96 < x0) continue;
                poly(c, [[Math.max(x0, x), y + depth - 2], [Math.min(x1, x + 96), y + depth - 2],
                    [Math.min(x1, x + 63), y + depth + 31], [Math.max(x0, x + 21), y + depth + 9]], '#544365');
            }
            for (let x = Math.ceil(x0 / 176) * 176; x < x1; x += 176) {
                line(c, [[x, y + 6], [x + 4, y + 36], [x - 2, y + 55]], '#537347', 3);
                poly(c, [[x + 2, y + 22], [x + 14, y + 18], [x + 7, y + 34]], '#90ad56');
            }
        }
    }
    function shell(c, m, t) {
        if (!m.shell || m.hp <= 0) return;
        c.save(); c.translate(m.x, m.y - 69);
        c.strokeStyle = m.state === 'warn' ? '#ffba65' : '#a5f0ef'; c.lineWidth = 3;
        c.globalAlpha = .7 + Math.sin(t * .08) * .12;
        // Six separate arcs expose the readable armor boundary without hiding sprites.
        for (let i = 0; i < 6; i++) {
            c.beginPath(); c.ellipse(0, 0, 72, 83, 0, i * TAU / 6 + .045, (i + 1) * TAU / 6 - .045); c.stroke();
            const a = (i + .5) * TAU / 6;
            poly(c, [[Math.cos(a) * 76, Math.sin(a) * 87], [Math.cos(a + .055) * 70, Math.sin(a + .055) * 80],
                [Math.cos(a - .055) * 70, Math.sin(a - .055) * 80]], '#e9ffdb');
        }
        c.restore();
    }
    const art = {
        source, frames, getBossFrame, getProjectileFrame,
        get loaded() { return ready; }, get failed() { return failed; },
        drawBackground(c, g) {
            const sky = c.createLinearGradient(0, 0, 0, g.H);
            sky.addColorStop(0, '#4c60ae'); sky.addColorStop(.52, '#ba90b9'); sky.addColorStop(1, '#ffe6bd');
            c.fillStyle = sky; c.fillRect(0, 0, g.W, g.H);
            const sx = g.W * .77 - g.camX * .008, sy = g.H * .24;
            circle(c, sx, sy, 52, '#e9bcaf'); circle(c, sx, sy, 38, '#ffedbe');
            for (let layer = 0; layer < 3; layer++) {
                const span = 420 + layer * 140, par = .035 + layer * .035;
                for (let i = -1; i < g.W / span + 2; i++) {
                    const id = i + Math.floor(g.camX * par / span), x = i * span - mod(g.camX * par, span);
                    const y = g.H * (.37 + layer * .17) + mod(id * 43, 35);
                    c.save(); c.globalAlpha = .3 + layer * .14;
                    island(c, x, y, 205 + layer * 34, 95 + layer * 20, '#806d99');
                    temple(c, x + 105, y - 8, .45 + layer * .12); c.restore();
                }
            }
            for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 5; i++) {
                const x = mod(i * 251 - g.camX * (.025 + .02 * layer) + g.terrain.clock * .04, g.W + 300) - 150;
                cloud(c, x, g.H * (.23 + layer * .31) + mod(i * 29, 42), 120 + layer * 65,
                    ['#edc3ce', '#ffe4d0', '#fff2d8'][layer]);
            }
        },
        drawBack(c, g) {
            for (const x of [180, 780, 1120, 1720, 2320, 2670]) {
                if (x < g.view.x0 - 140 || x > g.view.x1 + 140) continue;
                temple(c, x, 560, x > 1000 && x < 2500 ? 1.25 : .85);
            }
            for (const x of [1020, 2420]) {
                column(c, x - 18, 260, 560, 36);
                c.fillStyle = '#826b9a'; c.fillRect(x - 41, 244, 82, 16);
                c.fillStyle = '#f4d997'; c.fillRect(x - 45, 240, 90, 5);
                poly(c, [[x - 30, 238], [x, 221], [x + 30, 238]], '#ead399');
            }
            const boss = g.terrain.boss;
            if (boss?.active && !boss.defeated) for (const x of [boss.left, boss.right]) {
                c.save(); c.globalAlpha = .5; c.fillStyle = '#92f5ea'; c.fillRect(x - 3, 275, 6, 285);
                for (let y = 290; y < 550; y += 26) line(c, [[x - 13, y], [x + 13, y + 13], [x - 13, y + 26]], '#d6ffe7', 2);
                c.restore();
            }
        },
        drawTerrain(c, g) {
            const z = g.terrain.z2a3;
            road(c, z.mainSurf, g, true); road(c, z.balcony, g, false);
            for (const ledge of z.ledges) road(c, ledge, g, false);
        },
        drawLoops(c, g) {
            for (const l of g.terrain.loops) {
                c.strokeStyle = '#6b537e'; c.lineWidth = 30; c.beginPath(); c.arc(l.cx, l.cy, l.r + 12, 0, TAU); c.stroke();
                c.strokeStyle = '#ceb288'; c.lineWidth = 12; c.stroke();
                c.strokeStyle = '#b8d476'; c.lineWidth = 4; c.beginPath(); c.arc(l.cx, l.cy, l.r - 2, 0, TAU); c.stroke();
                for (let i = 0; i < 20; i++) {
                    const a = i * TAU / 20;
                    line(c, [[l.cx + Math.cos(a) * (l.r + 6), l.cy + Math.sin(a) * (l.r + 6)],
                        [l.cx + Math.cos(a) * (l.r + 20), l.cy + Math.sin(a) * (l.r + 20)]], '#82678c', 2);
                }
            }
        },
        drawPlatform(c, p) {
            const w = p.w || 64; c.fillStyle = '#806b91'; c.fillRect(p.x - w / 2, p.y + 4, w, 19);
            c.fillStyle = '#efd99d'; c.fillRect(p.x - w / 2, p.y, w, 7);
            c.fillStyle = '#b7cf72'; c.fillRect(p.x - w / 2, p.y - 3, w, 3);
            c.fillStyle = '#bda56b'; for (let dx = -w / 2 + 7; dx < w / 2 - 5; dx += 15) c.fillRect(p.x + dx, p.y + 12, 6, 7);
        },
        drawFront(c, g) {
            const n = g.terrain.boss?.ally;
            if (!n) return;
            root.RosieArt?.draw?.(c, n.actorX, n.actorY, g.terrain.clock, n);
            c.save(); c.textAlign = 'center'; c.font = 'bold 10px monospace';
            c.fillStyle = '#fff4d0'; c.strokeStyle = '#44334f'; c.lineWidth = 3;
            c.strokeText('ROSIE', n.actorX, n.actorY - 56); c.fillText('ROSIE', n.actorX, n.actorY - 56);
            if (n.message && n.messageTimer > 0 && !n.conversation?.active) {
                const width = Math.min(290, c.measureText(n.message).width + 20);
                const x = clamp(n.actorX, g.camX + width / 2 + 8, g.camX + g.W - width / 2 - 8), top = n.actorY - 94;
                c.fillStyle = '#453753'; c.fillRect(x - width / 2 - 2, top - 2, width + 4, 28);
                c.fillStyle = '#fff1cd'; c.fillRect(x - width / 2, top, width, 24);
                poly(c, [[x - 5, top + 23], [x + 5, top + 23], [n.actorX, top + 31]], '#fff1cd');
                c.fillStyle = '#4b375d'; c.fillText(n.message, x, top + 16, width - 12);
            }
            c.restore();
        },
        drawForeground(c, g) {
            const n = g.terrain.boss?.ally;
            if (!n || n.state !== 'hug' || !(n.heartTimer > 0)) return;
            root.RosieArt?.drawHugArm?.(c, n.actorX, n.actorY, n);
            const t = g.terrain.clock;
            for (let i = 0; i < 3; i++) {
                const rise = mod(t * .7 + i * 17, 54), x = n.actorX + Math.sin(t * .06 + i) * 13, y = n.actorY - 51 - rise;
                poly(c, [[x, y + 5], [x - 6, y - 1], [x - 6, y - 5], [x - 2, y - 7], [x, y - 4],
                    [x + 2, y - 7], [x + 6, y - 5], [x + 6, y - 1]], '#ff9bc8');
            }
        },
        drawBoss(c, b, g) {
            const t = b.age || 0;
            for (const m of b.members || []) {
                if (m.hp <= 0 && t - (m.defeatAge || 0) > 80) continue;
                shell(c, m, t);
                c.save();
                if (m.hp <= 0) c.globalAlpha = clamp(1 - (t - (m.defeatAge || 0)) / 80, 0, 1);
                else if (m.flashTimer > 0 && Math.floor(m.flashTimer / 3) % 2) c.globalAlpha = .45;
                sprite(c, getBossFrame(m, t), m.x, m.y, 2, (m.facing || -1) * (m.id === 'crawfish' ? -1 : 1), true);
                c.restore();
                if (m.hp > 0 && (m.state === 'warn' || !m.shell)) {
                    c.save(); c.textAlign = 'center'; c.font = 'bold 11px monospace'; c.lineWidth = 3; c.strokeStyle = '#49324e';
                    const text = !m.shell ? 'OPEN · SPIN HIT!' : m.id === 'crocodile' ? 'NOTE VOLLEY!' : 'CLAWS · JUMP!';
                    const y = m.y - 176; c.strokeText(text, m.x, y); c.fillStyle = !m.shell ? '#d7ffac' : '#ffe19d'; c.fillText(text, m.x, y);
                    c.restore();
                }
            }
            for (const p of b.projectiles || []) {
                if (p.kind === 'note') {
                    circle(c, p.x, p.y, 13, 'rgba(255,226,144,.16)');
                    sprite(c, getProjectileFrame(p, t), p.x, p.y, 3, 1);
                } else {
                    c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p.vy || 0, p.vx || 1) + Math.PI);
                    sprite(c, getProjectileFrame(p, t), 0, 0, .9, 1); c.restore();
                }
            }
            for (const e of b.effects || []) {
                c.save(); c.globalAlpha = clamp(e.life / (e.maxLife || 26), 0, 1); c.fillStyle = e.color || '#fff3b3';
                const r = e.r || 2; c.fillRect(e.x - r, e.y - r, r * 2, r * 2); c.restore();
            }
        },
        drawHUD(c, g) {
            const b = g.terrain.boss;
            if (!b || (!b.active && !b.defeated)) return;
            const width = Math.min(520, g.W - 36), x0 = (g.W - width) / 2, y = g.H - 78;
            c.save(); c.fillStyle = 'rgba(31,30,56,.9)'; c.fillRect(x0 - 9, y - 8, width + 18, 59);
            for (let i = 0; i < b.members.length; i++) {
                const m = b.members[i], x = x0 + i * (width / 2 + 4), w = width / 2 - 8;
                c.font = 'bold 10px monospace'; c.textAlign = 'left'; c.fillStyle = '#fff1cf';
                c.fillText(m.id === 'crocodile' ? 'CROCODILE' : 'CRAWFISH', x, y + 2);
                c.textAlign = 'right'; c.fillStyle = m.hp <= 0 ? '#c5c3d1' : !m.shell ? '#d5ffa0' : '#a8f2ef';
                c.fillText(m.hp <= 0 ? 'DEFEATED' : !m.shell ? 'OPEN' : 'ARMORED', x + w, y + 2);
                c.fillStyle = '#4d405d'; c.fillRect(x, y + 8, w, 7);
                c.fillStyle = i ? '#e9a0c0' : '#b9dc82'; c.fillRect(x, y + 8, w * clamp(m.hp / m.maxHP, 0, 1), 7);
            }
            const n = b.ally, cool = Math.max(0, n?.assistCooldown || 0), busy = !!n?.assistPhase;
            c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillStyle = '#ffe5b0';
            const assistKey = g.input?.gamepadConnected ? 'X' : 'C';
            const label = b.defeated ? 'TEAM VICTORY · FREE THE ANIMALS →' : busy ? 'ROSIE IS CRACKING THE ARMOR!' : cool > 0 ? 'TAG ASSIST RECHARGING' : assistKey + ' · TAG ASSIST';
            c.fillText(label, g.W / 2, y + 31);
            if (!b.defeated) {
                c.fillStyle = '#51445f'; c.fillRect(x0 + 80, y + 38, width - 160, 4);
                c.fillStyle = busy ? '#ffa3ce' : '#b9f0d3'; c.fillRect(x0 + 80, y + 38, (width - 160) * clamp(1 - cool / 150, 0, 1), 4);
            }
            c.restore();
        },
    };
    return art;
});
