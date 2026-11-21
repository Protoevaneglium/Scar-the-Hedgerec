/** Original Canvas scenery for Molten Sanctuary: cloud temples over ancient magma galleries. */
(function (root) {
    'use strict';
    const TAU = Math.PI * 2;
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const mod = (n, d) => ((n % d) + d) % d;
    const IVORY = '#f9e3a0', LIME = '#a5c653', GOLD = '#d9aa45';

    function poly(c, points, fill) {
        if (!points.length) return;
        c.fillStyle = fill; c.beginPath(); c.moveTo(...points[0]);
        for (let i = 1; i < points.length; i++) c.lineTo(...points[i]);
        c.closePath(); c.fill();
    }
    function line(c, points, stroke, width = 2) {
        if (!points.length) return;
        c.strokeStyle = stroke; c.lineWidth = width;
        c.beginPath(); c.moveTo(...points[0]);
        for (let i = 1; i < points.length; i++) c.lineTo(...points[i]);
        c.stroke();
    }
    function circle(c, x, y, radius, fill) {
        c.fillStyle = fill; c.beginPath(); c.arc(x, y, radius, 0, TAU); c.fill();
    }
    function moss(c, x, y, width, clock = 0) {
        c.fillStyle = '#455d35'; c.fillRect(x, y, width, 5);
        c.fillStyle = '#a4cd55'; c.fillRect(x, y - 3, width, 5);
        c.fillStyle = '#d5e78b'; c.fillRect(x, y - 4, width, 2);
        for (let dx = 7; dx < width; dx += 19) {
            const length = 6 + mod(Math.floor(x + dx) * 7, 12);
            c.fillStyle = '#587a39'; c.fillRect(x + dx, y + 3, 3, length);
            c.fillStyle = '#90b348'; c.fillRect(x + dx + 2, y + length, 5, 3);
        }
    }
    function column(c, x, top, bottom, width = 28, violet = false) {
        if (bottom <= top) return;
        const colors = violet
            ? ['#463758', '#83688d', '#c39bb3', '#745a81', '#3d3155']
            : ['#827a48', '#c9bc75', '#fff4b9', '#e3d296', '#92814b'];
        c.fillStyle = colors[0]; c.fillRect(x, top, width, bottom - top);
        c.fillStyle = colors[1]; c.fillRect(x + 3, top, width - 6, bottom - top);
        c.fillStyle = colors[2]; c.fillRect(x + 6, top, Math.max(3, width * .22), bottom - top);
        c.fillStyle = colors[3]; c.fillRect(x + width * .58, top, width * .25, bottom - top);
        for (let y = Math.ceil(top / 42) * 42; y < bottom; y += 42) {
            c.fillStyle = colors[4]; c.fillRect(x + 2, y, width - 4, 3);
            c.fillStyle = colors[2]; c.fillRect(x + 3, y + 3, width - 6, 1);
        }
        c.fillStyle = colors[4]; c.fillRect(x - 6, top, width + 12, 9);
        c.fillStyle = colors[2]; c.fillRect(x - 6, top, width + 12, 3);
        c.fillStyle = colors[1]; c.fillRect(x - 4, bottom - 12, width + 8, 12);
        c.fillStyle = colors[2]; c.fillRect(x - 6, bottom - 3, width + 12, 3);
    }
    function arch(c, x, y, width, height, violet = false) {
        const stone = violet ? '#a786af' : '#f1df99';
        const shade = violet ? '#4b3b65' : '#a39153';
        const span = width - 26;
        column(c, x, y + span / 2, y + height, 24, violet);
        column(c, x + width - 24, y + span / 2, y + height, 24, violet);
        c.strokeStyle = shade; c.lineWidth = 24;
        c.beginPath(); c.arc(x + width / 2, y + span / 2 + 2, span / 2, Math.PI, TAU); c.stroke();
        c.strokeStyle = stone; c.lineWidth = 17; c.stroke();
        for (let i = 0; i <= 7; i++) {
            const a = Math.PI + i * Math.PI / 7, cx = x + width / 2, cy = y + span / 2 + 2;
            line(c, [[cx + Math.cos(a) * (span / 2 - 8), cy + Math.sin(a) * (span / 2 - 8)],
                [cx + Math.cos(a) * (span / 2 + 11), cy + Math.sin(a) * (span / 2 + 11)]], shade, 2);
        }
        moss(c, x - 7, y + span / 2 - 4, 38);
        moss(c, x + width - 30, y + span / 2 - 4, 38);
    }
    function temple(c, x, floorY, scale = 1, violet = false) {
        c.save(); c.translate(x, floorY); c.scale(scale, scale);
        const face = violet ? '#846c9a' : '#f1dc91';
        const shade = violet ? '#503f6b' : '#b4a36b';
        c.fillStyle = shade; c.fillRect(-113, -115, 226, 112);
        c.fillStyle = face; c.fillRect(-108, -111, 216, 18);
        poly(c, [[-135, -118], [0, -176], [135, -118]], shade);
        poly(c, [[-122, -122], [0, -165], [122, -122]], face);
        line(c, [[-125, -121], [0, -169], [125, -121]], violet ? '#c8a5bf' : '#fff0b2', 4);
        c.fillStyle = '#403550'; c.fillRect(-24, -82, 48, 79);
        for (const dx of [-96, -56, 37, 77]) column(c, dx, -95, -4, 19, violet);
        c.fillStyle = face; c.fillRect(-123, -10, 246, 9);
        c.fillStyle = shade; c.fillRect(-133, -1, 266, 7);
        c.fillStyle = GOLD; c.fillRect(-12, -145, 24, 10);
        poly(c, [[-9, -148], [0, -156], [9, -148], [0, -140]], '#fff6bd');
        moss(c, -131, 6, 262);
        c.restore();
    }
    function cloud(c, x, y, width, fill) {
        c.fillStyle = fill;
        const unit = width / 9;
        c.fillRect(x, y + unit, width, unit * 1.2);
        c.fillRect(x + unit, y, width - unit * 2, unit * 2.7);
        c.fillRect(x + unit * 2.7, y - unit * .65, width - unit * 5.4, unit * 3.4);
    }
    function visible(v, x, margin = 80) { return x > v.x0 - margin && x < v.x1 + margin; }
    function road(c, surf, g, main) {
        const v = g.view, x0 = Math.max(surf.x0, v.x0 - 12), x1 = Math.min(surf.x1, v.x1 + 12);
        if (!(x1 > x0)) return;
        const z = g.terrain.z2a2, points = [];
        for (let x = x0; x < x1; x += 10) points.push([x, surf.f(x)]);
        points.push([x1, surf.f(x1)]);
        const minY = Math.min(...points.map(p => p[1]));
        const maxY = Math.max(...points.map(p => p[1]));
        const thickness = main ? Math.max(460, v.y1 - minY + 20) : (surf.thickness || 64);
        const body = points.concat(points.slice().reverse().map(p => [p[0], p[1] + thickness]));
        const sky = !main || minY < 310 || (x0 + x1) / 2 > 12300;
        const face = sky ? ['#f8e4a5', '#ecd08d', '#d3b676', '#f6dfa0'] : ['#8f71a0', '#7a5c92', '#9c80a8', '#86699a'];
        poly(c, body, sky ? '#a48c57' : '#483958');
        c.save(); c.beginPath(); c.moveTo(...body[0]);
        for (let i = 1; i < body.length; i++) c.lineTo(...body[i]);
        c.closePath(); c.clip();
        const rowHeight = sky ? 34 : 32, blockW = sky ? 68 : 56;
        const endY = Math.min(v.y1 + rowHeight, maxY + thickness);
        for (let row = Math.floor(Math.max(v.y0, minY) / rowHeight); row * rowHeight < endY; row++) {
            for (let x = Math.floor(x0 / blockW) * blockW - mod(row, 2) * blockW / 2; x < x1; x += blockW) {
                const y = row * rowHeight, n = mod(Math.floor(x / blockW) * 7 + row * 13, 4);
                c.fillStyle = face[n]; c.fillRect(x + 2, y + 2, blockW - 3, rowHeight - 3);
                c.fillStyle = sky ? '#fff2c2' : '#b194bc'; c.fillRect(x + 3, y + 3, blockW - 5, 2);
                c.fillRect(x + 3, y + 5, 2, rowHeight - 8);
                c.fillStyle = sky ? '#c9ac6f' : '#634c7b'; c.fillRect(x + blockW - 4, y + 5, 2, rowHeight - 7);
                if (n === 1) line(c, [[x + 17, y + 10], [x + blockW - 13, y + 10], [x + blockW - 13, y + 23], [x + 24, y + 23]], sky ? '#d0b26d' : '#79608d', 2);
            }
        }
        // Fluted piers visually support the floating sanctuary fragments.
        if (!main) for (let x = Math.ceil(x0 / 160) * 160; x < x1; x += 160) {
            const y = surf.f(x);
            column(c, x - 14, y + 18, y + thickness + 3, 28, false);
        }
        c.restore();
        line(c, points.map(p => [p[0], p[1] + 9]), sky ? '#9f8748' : '#4d385e', 8);
        line(c, points.map(p => [p[0], p[1] + 5]), sky ? '#fff0b5' : '#d4adc3', 3);
        line(c, points, '#476035', 8);
        line(c, points.map(p => [p[0], p[1] - 2]), '#b1d157', 4);
        line(c, points.map(p => [p[0], p[1] - 4]), '#e0ed9a', 1);
        if (!main) for (let x = Math.ceil(x0 / 49) * 49; x < x1; x += 49) {
            const y = surf.f(x) + thickness;
            line(c, [[x, y - 2], [x + 2, y + 13], [x - 2, y + 26]], '#537139', 2);
            poly(c, [[x, y + 9], [x + 10, y + 7], [x + 5, y + 16]], '#8ba64e');
        }
        // Smooth slides use gold ribs instead of a dangerous-looking spike outline.
        for (const slide of z.slides || []) {
            if (slide.x1 < x0 || slide.x0 > x1) continue;
            const pts = points.filter(p => p[0] >= slide.x0 && p[0] <= slide.x1);
            if (pts.length < 2) continue;
            line(c, pts.map(p => [p[0], p[1] + 3]), '#f8de70', 6);
            line(c, pts.map(p => [p[0], p[1] - 1]), '#fff6bd', 2);
        }
    }
    function lava(c, zone, g) {
        const v = g.view, z = g.terrain.z2a2, t = g.terrain.clock;
        const x0 = Math.max(zone.x0, v.x0), x1 = Math.min(zone.x1, v.x1);
        const y = zone.surfaceY !== undefined ? zone.surfaceY : zone.y0;
        const bottom = Math.min(zone.y1 !== undefined ? zone.y1 : y + 160, v.y1 + 20);
        if (x1 <= x0 || y > v.y1 || bottom < v.y0) return;
        const active = !!z.lavaActive;
        c.fillStyle = active ? '#bd3046' : '#603647'; c.fillRect(x0, y, x1 - x0, bottom - y);
        c.fillStyle = active ? '#f45d2b' : '#92513f'; c.fillRect(x0, y, x1 - x0, Math.min(43, bottom - y));
        c.fillStyle = active ? '#ffa337' : '#b97745'; c.fillRect(x0, y, x1 - x0, 9);
        c.fillStyle = active ? '#ffe274' : '#d3a25e'; c.fillRect(x0, y, x1 - x0, 3);
        for (let x = Math.floor(x0 / 56) * 56; x < x1; x += 56) {
            const phase = t * (active ? .045 : .014) + x * .02;
            const dx = Math.sin(phase) * 8;
            line(c, [[x + dx, y + 4], [x + 15 + dx, y + 1], [x + 30 + dx, y + 5], [x + 45 + dx, y + 2]], active ? '#fff0a3' : '#5a3949', 3);
            const depth = 22 + mod(x, 37);
            if (y + depth < bottom) {
                c.fillStyle = active ? '#fc8b37' : '#744353';
                c.fillRect(x + 7 + dx, y + depth, 25, 4);
                c.fillStyle = active ? '#e6472e' : '#3c3145'; c.fillRect(x + 20 - dx, y + depth + 9, 30, 5);
            }
            if (active && Math.sin(phase * .7) > .75) {
                c.fillStyle = '#ffbf48'; c.fillRect(x + 23, y - 5, 5, 5);
                c.fillStyle = '#fff3b0'; c.fillRect(x + 24, y - 6, 3, 2);
            }
        }
    }
    function sign(c, x, y, title, detail) {
        line(c, [[x, y + 3], [x, y - 64]], '#a38b58', 6);
        c.fillStyle = '#4f3d62'; c.fillRect(x - 74, y - 95, 148, 37);
        c.fillStyle = '#e3ca83'; c.fillRect(x - 76, y - 96, 152, 3);
        c.fillRect(x - 76, y - 59, 152, 3);
        c.textAlign = 'center'; c.font = 'bold 10px monospace'; c.fillStyle = '#fff3c4';
        c.fillText(title, x, y - 80);
        c.font = '8px monospace'; c.fillStyle = '#c9e08f'; c.fillText(detail || '', x, y - 67);
    }

    const art = {
        drawBackground(c, g) {
            const W = g.W, H = g.H, t = g.terrain.clock, progress = clamp(g.player.x / g.terrain.endX, 0, 1);
            const era = g.terrain.timeEra, hot = g.terrain.z2a2.lavaActive;
            const sky = c.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0, era === 'past' ? '#6c456d' : '#cb638e');
            sky.addColorStop(.48, era === 'past' ? '#e78c87' : '#ed94a2');
            sky.addColorStop(1, '#ffe1b0'); c.fillStyle = sky; c.fillRect(0, 0, W, H);
            const sunX = W * .77 - g.camX * .006, sunY = H * .25 - g.camY * .015;
            circle(c, sunX, sunY, 56, '#f6bb9e');
            circle(c, sunX, sunY, 43, '#ffdcad');
            circle(c, sunX, sunY, 32, '#fff0bd');
            for (let layer = 0; layer < 3; layer++) {
                const par = [.035, .065, .13][layer], span = [610, 760, 940][layer];
                const offset = Math.floor(g.camX * par / span);
                for (let i = -1; i < W / span + 2; i++) {
                    const id = i + offset;
                    const x = i * span - mod(g.camX * par, span) + 150;
                    const y = H * (.39 + layer * .125) + mod(id * 41, 57) - g.camY * .035;
                    c.save(); c.globalAlpha = [.30, .46, .73][layer];
                    const width = 190 + mod(id * 19, 115), height = 84 + mod(id * 27, 85);
                    poly(c, [[x - width / 2, y], [x + width / 2, y], [x + width * .34, y + height * .6], [x + width * .08, y + height], [x - width * .2, y + height * .75]], '#8e717c');
                    c.fillStyle = '#d4b68a'; c.fillRect(x - width / 2, y - 6, width, 12);
                    c.fillStyle = '#a3af60'; c.fillRect(x - width / 2, y - 8, width, 5);
                    temple(c, x, y - 9, .45 + layer * .12);
                    if (id % 2 === 0) column(c, x + width * .31, y + 11, y + height * .67, 16);
                    c.restore();
                }
            }
            // Three cloud strata move at different rates, in squared Genesis-style silhouettes.
            for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 6; i++) {
                const span = W + 340, x = mod(i * 263 - g.camX * (.035 + layer * .021) + t * (.035 + layer * .018), span) - 170;
                const y = H * (.19 + layer * .28) + mod(i * 37, 45) - g.camY * .018;
                cloud(c, x, y, 105 + layer * 75, ['#f5b6b7', '#ffe0ca', '#fff0d8'][layer]);
            }
            c.fillStyle = 'rgba(255,232,206,.32)'; c.fillRect(0, H * .81, W, H * .19);
            if (hot && progress > .15) {
                const haze = c.createLinearGradient(0, H * .65, 0, H);
                haze.addColorStop(0, 'rgba(255,125,75,0)'); haze.addColorStop(1, 'rgba(255,114,66,.16)');
                c.fillStyle = haze; c.fillRect(0, H * .65, W, H * .35);
            }
        },
        drawBack(c, g) {
            const z = g.terrain.z2a2, v = g.view, t = g.terrain.clock;
            for (const f of z.upperRoads || []) {
                if (f.x1 < v.x0 - 170 || f.x0 > v.x1 + 170) continue;
                for (let x = f.x0 + 80; x < f.x1 - 100; x += 310) {
                    if (!visible(v, x, 200)) continue;
                    const y = f.f(x);
                    arch(c, x - 55, y + 30, 200, Math.min(340, Math.max(150, z.mainSurf.f(x) - y + 40)));
                }
                for (let x = f.x0 + 165; x < f.x1 - 120; x += 720) {
                    if (!visible(v, x, 200)) continue;
                    if (g.terrain.loops.some(L => Math.abs(L.cx - x) < L.r + 160)) continue;
                    temple(c, x, f.f(x), .7);
                }
            }
            for (const zone of z.lavaZones || []) {
                if (zone.x1 < v.x0 || zone.x0 > v.x1) continue;
                const top = Math.min(zone.y0 !== undefined ? zone.y0 : zone.surfaceY - 120, zone.surfaceY - 80);
                for (let x = Math.ceil(zone.x0 / 290) * 290; x < zone.x1; x += 290) {
                    if (!visible(v, x, 150)) continue;
                    arch(c, x - 45, top - 110, 190, 275, true);
                    c.fillStyle = z.lavaActive ? '#ffad50' : '#c9965a'; c.fillRect(x + 41, top - 44, 13, 22);
                    c.fillStyle = '#ffe3a1'; c.fillRect(x + 44, top - 48, 7, 13);
                }
            }
            for (const shaft of z.shafts || []) {
                if (shaft.x1 < v.x0 || shaft.x0 > v.x1) continue;
                column(c, shaft.x0 - 29, shaft.top - 30, shaft.bottom, 29);
                column(c, shaft.x1, shaft.top - 30, shaft.bottom, 29);
            }
            const end = z.reunion;
            if (end && visible(v, end.x, 300)) {
                temple(c, end.x + 95, end.y, 1.2);
                arch(c, end.x - 200, end.y - 200, 155, 200);
                c.save(); c.globalAlpha = .2 + Math.sin(t * .02) * .05;
                const glow = c.createRadialGradient(end.x, end.y - 40, 5, end.x, end.y - 40, 120);
                glow.addColorStop(0, '#fff5bd'); glow.addColorStop(1, 'rgba(255,245,189,0)');
                c.fillStyle = glow; c.fillRect(end.x - 120, end.y - 160, 240, 240); c.restore();
            }
        },
        drawLoops(c, g) {
            for (const L of g.terrain.loops) {
                if (!visible(g.view, L.cx, L.r + 45)) continue;
                const sky = L.cy < 350;
                c.strokeStyle = sky ? '#aa9254' : '#493857'; c.lineWidth = 31;
                c.beginPath(); c.arc(L.cx + 7, L.cy + 4, L.r + 14, 0, TAU); c.stroke();
                c.strokeStyle = sky ? '#f4df9b' : '#9a77a5'; c.lineWidth = 25;
                c.beginPath(); c.arc(L.cx, L.cy, L.r + 13, 0, TAU); c.stroke();
                for (let i = 0; i < 24; i++) {
                    const a = TAU * i / 24;
                    line(c, [[L.cx + Math.cos(a) * (L.r + 2), L.cy + Math.sin(a) * (L.r + 2)],
                        [L.cx + Math.cos(a) * (L.r + 25), L.cy + Math.sin(a) * (L.r + 25)]], sky ? '#b59b5c' : '#5d446e', 2);
                }
                c.strokeStyle = '#71913e'; c.lineWidth = 7;
                c.beginPath(); c.arc(L.cx, L.cy, L.r + 2, 0, TAU); c.stroke();
                c.strokeStyle = '#e2e99b'; c.lineWidth = 2; c.stroke();
                c.strokeStyle = '#ffe7a0'; c.lineWidth = 2;
                c.beginPath(); c.arc(L.cx, L.cy, L.r + 27, 0, TAU); c.stroke();
            }
        },
        drawTerrain(c, g) {
            const z = g.terrain.z2a2;
            road(c, z.mainSurf, g, true);
            for (const floor of g.terrain.floors) if (floor !== z.mainSurf) road(c, floor, g, false);
            for (const zone of z.lavaZones || []) lava(c, zone, g);
        },
        drawPlatform(c, p) {
            const w = p.w || 64;
            c.fillStyle = '#88723f'; c.fillRect(p.x - w / 2, p.y + 3, w, 18);
            c.fillStyle = IVORY; c.fillRect(p.x - w / 2, p.y, w, 8);
            c.fillStyle = '#fff3c0'; c.fillRect(p.x - w / 2, p.y, w, 2);
            c.fillStyle = '#b9ce68'; c.fillRect(p.x - w / 2, p.y - 4, w, 4);
            c.fillStyle = '#cfb35c';
            for (let x = p.x - w / 2 + 7; x < p.x + w / 2 - 5; x += 14) c.fillRect(x, p.y + 10, 6, 6);
        },
        drawFront(c, g) {
            const z = g.terrain.z2a2, v = g.view, t = g.terrain.clock;
            for (const slide of z.slides || []) {
                const x = slide.x0 + 35;
                if (!visible(v, x)) continue;
                const isMain = [600, 5100, 9800].includes(slide.x0);
                const floor = slide.surface || (!isMain && (z.upperRoads || []).find(f => x >= f.x0 && x <= f.x1)) || z.mainSurf;
                const y = floor.f(x);
                sign(c, x, y, 'MARBLE SLIDE', 'ROLL + HOLD RIGHT');
            }
            for (const zone of z.lavaZones || []) {
                const x = zone.x0 - 70;
                if (!visible(v, x)) continue;
                sign(c, x, z.mainSurf.f(x), z.lavaActive ? 'LAVA ACTIVE' : 'DORMANT MAGMA', 'TAKE THE HIGH ROAD');
            }
            for (const vent of z.vents || []) {
                if (!visible(v, vent.x)) continue;
                c.fillStyle = '#413349'; c.fillRect(vent.x - 36, vent.y - 5, 72, 12);
                c.fillStyle = '#b7b58c'; c.fillRect(vent.x - 39, vent.y - 7, 78, 4);
                for (let i = -2; i <= 2; i++) {
                    c.fillStyle = '#60afac'; c.fillRect(vent.x + i * 12 - 3, vent.y - 7, 6, 6);
                }
                if (vent.active) {
                    c.save();
                    const stream = c.createLinearGradient(0, vent.y - 240, 0, vent.y);
                    stream.addColorStop(0, 'rgba(154,255,237,0)');
                    stream.addColorStop(1, 'rgba(154,255,237,.24)');
                    c.fillStyle = stream; c.fillRect(vent.x - 35, vent.y - 240, 70, 234);
                    for (let j = 0; j < 7; j++) {
                        const yy = vent.y - 12 - mod(j * 39 + t * 2.7, 230);
                        const dx = Math.sin(t * .025 + j) * 8;
                        c.globalAlpha = .2 + .4 * (1 - (vent.y - yy) / 240);
                        line(c, [[vent.x - 19 + dx, yy + 6], [vent.x + dx, yy - 4], [vent.x + 19 + dx, yy + 6]], '#b7ffe7', 3);
                    }
                    c.restore();
                }
            }
            for (let x = Math.ceil(v.x0 / 250) * 250; x < v.x1; x += 250) {
                if (x < 20 || x > g.terrain.endX - 20) continue;
                const y = z.mainSurf.f(x) + 18;
                if ((z.lavaZones || []).some(a => x > a.x0 && x < a.x1)) continue;
                line(c, [[x, y], [x + 2, y + 15], [x - 3, y + 30]], '#52743b', 3);
                poly(c, [[x, y + 8], [x + 12, y + 5], [x + 6, y + 17]], '#a3bd58');
            }
            const end = z.reunion;
            if (end && visible(v, end.actorX === undefined ? end.x : end.actorX, 200)) {
                const actorX = end.actorX === undefined ? end.x : end.actorX;
                const actorY = end.actorY === undefined ? end.y : end.actorY;
                if (root.RosieArt && root.RosieArt.draw) root.RosieArt.draw(c, actorX, actorY, t, end);
                if (!end.met) {
                    c.textAlign = 'center'; c.font = 'bold 10px monospace';
                    c.lineWidth = 3; c.strokeStyle = '#4b3c60'; c.strokeText('ROSIE', actorX, actorY - 60);
                    c.fillStyle = '#fff0d2'; c.fillText('ROSIE', actorX, actorY - 60);
                    poly(c, [[actorX - 5, actorY - 52], [actorX + 5, actorY - 52], [actorX, actorY - 46]], '#ffd06e');
                }
                if (end.reactionTimer > 0 || end.timer > 0) {
                    const age = end.reactionTimer || end.timer;
                    for (let i = 0; i < 3; i++) {
                        const a = t * .035 + i * TAU / 5;
                        const x = actorX + Math.cos(a) * (30 + mod(age, 40) * .3);
                        const y = actorY - 28 + Math.sin(a) * 22 - Math.min(age, 150) * .15;
                        poly(c, [[x, y - 5], [x + 2, y - 1], [x + 6, y], [x + 2, y + 2], [x, y + 6], [x - 2, y + 2], [x - 6, y], [x - 2, y - 1]], '#fff4b7');
                    }
                }
                if (end.messageTimer > 0 && end.message && !end.conversation?.active) {
                    c.save(); c.font = 'bold 10px monospace'; c.textAlign = 'center';
                    const width = Math.min(240, c.measureText(end.message).width + 22);
                    const center = clamp(actorX, g.camX + width / 2 + 12, g.camX + g.W - width / 2 - 12);
                    const top = actorY - 82;
                    c.fillStyle = '#392b4c'; c.fillRect(center - width / 2 - 2, top - 2, width + 4, 28);
                    c.fillStyle = '#fff0cf'; c.fillRect(center - width / 2, top, width, 24);
                    poly(c, [[center - 5, top + 23], [center + 5, top + 23], [actorX, top + 31]], '#fff0cf');
                    c.fillStyle = '#4b3155'; c.fillText(end.message, center, top + 16, width - 12); c.restore();
                }
                if (end.canTalk && !end.conversation?.active && (!g.canTalkToRosie || g.canTalkToRosie())) {
                    c.save(); c.font = 'bold 9px monospace'; c.textAlign = 'center';
                    c.fillStyle = '#392b4c'; c.fillRect(actorX - 37, actorY + 9, 74, 17);
                    c.fillStyle = '#fff0cf'; c.fillText(g.input?.gamepadConnected ? 'X · TALK' : 'C · TALK', actorX, actorY + 21); c.restore();
                }
            }
        },
        drawForeground(c, g) {
            const z = g.terrain.z2a2, t = g.terrain.clock, v = g.view;
            const end = z.reunion;
            if (end?.state === 'hug' && end.heartTimer > 0 && visible(v, end.actorX, 160)) {
                root.RosieArt?.drawHugArm?.(c, end.actorX, end.actorY, end);
                c.save();
                for (let i = 0; i < 3; i++) {
                    const phase = mod(end.heartTimer + i * 22, 66);
                    const x = end.actorX + (i - 1) * 12 + Math.sin(phase * .12 + i) * 4;
                    const y = end.actorY - 52 - phase * .65;
                    c.globalAlpha = Math.min(1, phase / 8, (66 - phase) / 14);
                    poly(c, [[x - 6, y - 3], [x - 3, y - 5], [x, y - 2], [x + 3, y - 5],
                        [x + 6, y - 3], [x + 6, y], [x, y + 6], [x - 6, y]], '#ff8dbd');
                    c.fillStyle = '#ffe1ec'; c.fillRect(x - 4, y - 3, 2, 2);
                }
                c.restore();
            }
            c.save();
            for (let i = 0; i < 14; i++) {
                const x = v.x0 + mod(i * 137 + t * .3, v.x1 - v.x0);
                const y = v.y0 + mod(i * 83 - t * .25, v.y1 - v.y0);
                c.globalAlpha = .25 + Math.sin(t * .04 + i) * .15;
                c.fillStyle = z.lavaActive && g.player.y > 350 ? '#ffcf74' : '#fff4c5';
                c.fillRect(x, y, i % 3 === 0 ? 3 : 2, i % 3 === 0 ? 3 : 2);
            }
            c.restore();
        },
        drawHUD(c, g) {
            const z = g.terrain.z2a2;
            if (!z || g.player.gameOver || g.actClear || (z.reunion && z.reunion.met)) return;
            const remaining = Math.max(0, Math.ceil(((z.ignitionFrames || 900) - (z.lavaAge || 0)) / 60));
            const urgent = !z.lavaActive && remaining <= 5;
            const x = g.W / 2 - 147, y = 91;
            c.save(); c.fillStyle = '#432e4f';
            poly(c, [[x + 9, y], [x + 294, y], [x + 285, y + 35], [x, y + 35]], '#432e4f');
            c.fillStyle = z.lavaActive ? '#ff8246' : urgent ? '#ffc160' : '#ead294';
            c.fillRect(x + 8, y + 31, 276, 3);
            c.textAlign = 'center'; c.font = 'bold 12px monospace';
            c.fillStyle = urgent && Math.floor(g.terrain.clock / 15) % 2 ? '#ff8e65' : '#fff0c0';
            c.fillText(z.lavaActive ? 'LAVA ACTIVE  —  STAY HIGH' : `LAVA IGNITES IN ${String(remaining).padStart(2, '0')}s`, g.W / 2, y + 16);
            c.font = '8px monospace'; c.fillStyle = '#d4caac';
            c.fillText(z.lavaActive ? 'GREEN MARBLE AND SKY ROUTES ARE SAFE' : 'FIND HIGH GROUND BEFORE THE ERUPTION', g.W / 2, y + 27);
            c.restore();
        },
    };
    root.MarbleSkyArt = art;
    if (typeof module === 'object' && module.exports) module.exports = art;
})(typeof window !== 'undefined' ? window : globalThis);
