/**
 * ============================================================================
 * LEVEL 2 — ZONE 1 ACT 2: STARLIGHT RESORT (z1_act2)
 * ============================================================================
 * Connected automatically right after Level 1 ('palmtree') in the 3-Act Zone
 * progression:
 *   Act 1 ('palmtree') -> Act 2 ('z1_act2') -> Act 3 Boss Act ('z1_act3')
 *
 * DESIGN BLUEPRINT:
 *   1. Pacing & Layout: Inspired by Sonic the Hedgehog 2's Emerald Hill Act 2 —
 *      high-speed, momentum-driven, minimal stop-and-go platforming:
 *        - Rolling launch crests & twin Plasma Cascade speed bridges
 *        - Grand Downhill Starlight Slide into back-to-back Lower Twin 360° Loops
 *        - Split Upper / Lower Expressway:
 *            * UPPER: Starlight Coaster Highway with Upper Twin 360° Loops +
 *              3-Wave Corkscrew Roller-Coaster Skyway Bridge + Upper Loop #5 +
 *              Finale Sky Island (Giant Special Ring & Scar 1-UP)
 *            * LOWER: High-speed Waterfall Pillars Expressway & Finale Arch Bridge
 *        - Full-throttle Holo-Palm Colonnade Sprint to the Goal Signpost!
 *   2. Color Palette & 2.5D/3D Visual Infusion (Fixed to 2D Gameplay Plane):
 *      Fuses Level 1's cyber-starlight sky with Sonic Colors (Tropical Resort /
 *      Starlight Carnival) — 3D sphere-shaded ringed planets, Orbital Tether
 *      Elevator laser beam, 3D dual-rim rotating Starlight Ferris Wheel,
 *      2.5D extruded top road decks, 3D faceted sapphire-violet prism cliffs,
 *      3D cylindrical plasma waterfalls, and 3D dual-rim tubular 360° loops,
 *      all strictly locked to our classic 2D side-scrolling gameplay plane.
 *   3. Game Objects: Uses our Common Game Objects sheet (common_objects.png).
 *      Enemies intentionally left empty ([]) for the next owner design phase.
 * ============================================================================
 */
(function (root) {
    'use strict';
    let SonicEngine = root.SonicEngine || null;
    if (!SonicEngine && typeof require === 'function') {
        try { SonicEngine = require('../sonic-engine.js'); } catch (_) {}
    }
    if (!SonicEngine || !SonicEngine.Terrain) return;

    const TAU = Math.PI * 2;
    // Unified 2.5D oblique 3D extrusion vector (pixels right / pixels up into background depth)
    const EX_X = 13;
    const EX_Y = -11;

    /** Smooth C1-continuous elevation transition of delta-Y `dy` across horizontal `len` (0 slope at both ends). */
    function stepY(path, len, dy) {
        const half = len * 0.5;
        const slope = (2 * dy) / len;
        return path.ease(half, 0, slope).ease(half, slope, 0);
    }

    // Scenery registries built alongside terrain
    const PLASMA_WATERFALLS = [
        { x: 850,  w: 260, y0: 460, y1: 960 }, // Cascade Bridge #1
        { x: 1630, w: 260, y0: 460, y1: 960 }, // Cascade Bridge #2
        { x: 2740, w: 340, y0: 420, y1: 980 }, // Grand Downhill Canyon Cascade
        { x: 5060, w: 260, y0: 340, y1: 980 }, // Route-Split Starlight Cascade
        { x: 7040, w: 145, y0: 520, y1: 980 }, // Triple Pillar Waterfall A
        { x: 7305, w: 145, y0: 520, y1: 980 }, // Triple Pillar Waterfall B
        { x: 7570, w: 145, y0: 520, y1: 980 }, // Triple Pillar Waterfall C
    ];

    const COASTER_PYLONS = [
        { x: 5300, yTop: 340, yBot: 960 },
        { x: 5820, yTop: 340, yBot: 960 },
        { x: 6540, yTop: 410, yBot: 960 },
        { x: 6970, yTop: 365, yBot: 960 },
        { x: 7390, yTop: 365, yBot: 960 },
        { x: 7810, yTop: 365, yBot: 960 },
        { x: 8340, yTop: 410, yBot: 960 },
    ];

    let cachedPrismPattern = null;
    let cachedPrismCtx = null;

    /** Lazily generates a 64x64 3D-bevelled Sapphire & Violet Prism Cliff pattern (Sonic Colors style). */
    function getPrismPattern(ctx) {
        if (cachedPrismPattern && cachedPrismCtx === ctx) return cachedPrismPattern;
        if (typeof document === 'undefined') return '#1c1858';
        const cv = document.createElement('canvas');
        cv.width = 64;
        cv.height = 64;
        const g = cv.getContext('2d');

        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) {
                const x = col * 32;
                const y = row * 32;
                const alt = (row + col) % 2 === 0;

                // Base 3D block face
                const faceGrad = g.createLinearGradient(x, y, x + 32, y + 32);
                if (alt) {
                    faceGrad.addColorStop(0, '#2a3798');
                    faceGrad.addColorStop(1, '#171d5c');
                } else {
                    faceGrad.addColorStop(0, '#3e238c');
                    faceGrad.addColorStop(1, '#201152');
                }
                g.fillStyle = faceGrad;
                g.fillRect(x, y, 32, 32);

                // Top & left sunlit 3D bevel facets
                g.fillStyle = alt ? 'rgba(96, 180, 255, 0.34)' : 'rgba(195, 110, 255, 0.30)';
                g.beginPath();
                g.moveTo(x, y);
                g.lineTo(x + 32, y);
                g.lineTo(x + 27, y + 5);
                g.lineTo(x + 5, y + 5);
                g.lineTo(x + 5, y + 27);
                g.lineTo(x, y + 32);
                g.closePath();
                g.fill();

                // Bottom & right deep 3D shadow facets
                g.fillStyle = 'rgba(7, 5, 26, 0.58)';
                g.beginPath();
                g.moveTo(x + 32, y);
                g.lineTo(x + 32, y + 32);
                g.lineTo(x, y + 32);
                g.lineTo(x + 5, y + 27);
                g.lineTo(x + 27, y + 27);
                g.lineTo(x + 27, y + 5);
                g.closePath();
                g.fill();

                // Inner raised prism diamond facet
                g.fillStyle = alt ? 'rgba(0, 238, 255, 0.10)' : 'rgba(255, 46, 164, 0.10)';
                g.beginPath();
                g.moveTo(x + 16, y + 7);
                g.lineTo(x + 25, y + 16);
                g.lineTo(x + 16, y + 25);
                g.lineTo(x + 7, y + 16);
                g.closePath();
                g.fill();

                // Glowing micro-node in block corner
                g.fillStyle = alt ? 'rgba(0, 246, 255, 0.55)' : 'rgba(255, 56, 172, 0.55)';
                g.fillRect(x + 15, y + 15, 2, 2);
            }
        }

        cachedPrismCtx = ctx;
        cachedPrismPattern = ctx.createPattern(cv, 'repeat');
        return cachedPrismPattern;
    }

    /** Helper: checks whether x lies inside any suspended tubular coaster-bridge span on a surface. */
    function isCoasterSpan(surf, x) {
        if (!surf.coasterSpans) return false;
        for (let i = 0; i < surf.coasterSpans.length; i++) {
            const sp = surf.coasterSpans[i];
            if (x >= sp[0] && x <= sp[1]) return true;
        }
        return false;
    }

    /** Renders a 3D-shaded Starlight Holo-Palm (chrome-violet cylindrical trunk + glowing Sonic Colors fronds). */
    function drawHoloPalm(ctx, x, y, scale, swayClock) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        const sway = Math.sin(swayClock * 0.03 + x * 0.01) * 2.5;

        // 3D base anchor ring on the 2.5D road deck
        ctx.fillStyle = '#120d38';
        ctx.beginPath();
        ctx.ellipse(2, -1, 13, 4.5, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#00f6ff';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // 3D cylindrical segmented chrome-violet trunk
        let topX = 0;
        let topY = -98;
        for (let i = 0; i < 8; i++) {
            const t = i / 7;
            const ty = -i * 12.5 - 6;
            const ox = Math.sin(i * 0.34) * 5 + sway * t * t;
            const wBot = 7.8 - i * 0.32;
            const wTop = 6.8 - i * 0.32;

            const cyl = ctx.createLinearGradient(ox - wBot, ty, ox + wBot, ty);
            cyl.addColorStop(0, '#a894ff');   // Left sunlit 3D specular rim
            cyl.addColorStop(0.28, '#5a3ec8'); // Lit cylinder body
            cyl.addColorStop(0.72, '#281668'); // Core cylinder shadow
            cyl.addColorStop(1, '#00b8e6');   // Subtle cyan bounce-light rim

            ctx.fillStyle = cyl;
            ctx.beginPath();
            ctx.moveTo(ox - wBot, ty + 6.5);
            ctx.lineTo(ox + wBot, ty + 6.5);
            ctx.lineTo(ox + wTop, ty - 6.5);
            ctx.lineTo(ox - wTop, ty - 6.5);
            ctx.closePath();
            ctx.fill();

            // Glowing neon cyan/magenta ring seam between 3D trunk cylinders
            ctx.fillStyle = (i % 2 === 0) ? '#00f6ff' : '#ff2a9d';
            ctx.fillRect(ox - wTop + 0.5, ty - 6.5, (wTop - 0.5) * 2, 1.7);

            if (i === 7) {
                topX = ox;
                topY = ty - 7;
            }
        }

        // Back-depth 3D fronds (receding hot-magenta Sonic Colors crown)
        for (const a of [-1.05, -0.45, 0.45, 1.05]) {
            ctx.save();
            ctx.translate(topX + 4, topY - 4);
            ctx.rotate(a * 0.68);
            const fg = ctx.createLinearGradient(-24, -5, 24, 5);
            fg.addColorStop(0, '#ff2a9d');
            fg.addColorStop(0.5, '#ff7ad1');
            fg.addColorStop(1, '#7a1278');
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.ellipse(Math.sin(a) * 16, 2, 23, 5.2, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
        }

        // Mid-layer 3D electric cyan fronds
        for (const a of [-1.22, -0.64, 0, 0.64, 1.22]) {
            ctx.save();
            ctx.translate(topX, topY);
            ctx.rotate(a * 0.76);
            const fg = ctx.createLinearGradient(0, -6, 0, 6);
            fg.addColorStop(0, '#c8ffff');
            fg.addColorStop(0.45, '#00e5ff');
            fg.addColorStop(1, '#0d4ea6');
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.ellipse(Math.sin(a) * 19, 3, 27, 6.2, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
        }

        // Front-highlight mint-lime neon fronds
        for (const a of [-0.82, 0, 0.82]) {
            ctx.save();
            ctx.translate(topX - 1, topY + 2);
            ctx.rotate(a * 0.82);
            const fg = ctx.createLinearGradient(0, -5, 0, 5);
            fg.addColorStop(0, '#eafff5');
            fg.addColorStop(0.5, '#3dffb8');
            fg.addColorStop(1, '#008c7a');
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.ellipse(Math.sin(a) * 17, 3, 22, 4.6, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
        }

        // 3D sphere-shaded luminous gold Sonic Colors star-orbs (coconuts)
        for (const dx of [-5, 4]) {
            const og = ctx.createRadialGradient(topX + dx - 1.5, topY + 2.5, 0.5, topX + dx, topY + 4, 5);
            og.addColorStop(0, '#ffffff');
            og.addColorStop(0.45, '#ffe640');
            og.addColorStop(1, '#cc6a00');
            ctx.fillStyle = og;
            ctx.beginPath();
            ctx.arc(topX + dx, topY + 4, 4.6, 0, TAU);
            ctx.fill();
        }

        ctx.restore();
    }

    /** Renders a suspended 2.5D/3D Dual-Rail Tubular Neon Coaster Bridge span [xA, xB] on `surf`. */
    function drawCoasterBridgeSpan(ctx, surf, xA, xB, clock) {
        if (xB <= xA) return;
        const step = 6;
        const pts = [];
        for (let x = xA; ; x += step) {
            const xx = x >= xB ? xB : x;
            pts.push({ x: xx, y: surf.f(xx) });
            if (xx >= xB) break;
        }
        if (pts.length < 2) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 1. Receding 3D back rail (offset by EX_X, EX_Y)
        ctx.strokeStyle = '#1d165e';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(pts[0].x + EX_X, pts[0].y + EX_Y + 5);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + EX_X, pts[i].y + EX_Y + 5);
        ctx.stroke();

        ctx.strokeStyle = '#ff2a9d';
        ctx.lineWidth = 4;
        ctx.stroke();

        // 2. 2.5D translucent energy road deck connecting front rail to back rail
        ctx.fillStyle = 'rgba(16, 128, 235, 0.42)';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x + EX_X, pts[i].y + EX_Y);
        ctx.closePath();
        ctx.fill();

        // 3. Diagonal 3D cross-ties & lower truss chord
        ctx.strokeStyle = '#0e1748';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y + 18);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y + 18);
        ctx.stroke();

        ctx.strokeStyle = '#00b8e6';
        ctx.lineWidth = 2.2;
        for (let i = 0; i < pts.length; i += 3) {
            const p = pts[i];
            ctx.beginPath();
            // 3D cross-tie back into Z-depth
            ctx.moveTo(p.x, p.y + 2);
            ctx.lineTo(p.x + EX_X, p.y + EX_Y + 2);
            // Vertical & diagonal truss struts
            ctx.moveTo(p.x, p.y + 3);
            ctx.lineTo(p.x, p.y + 18);
            if (i + 3 < pts.length) {
                ctx.lineTo(pts[i + 3].x, pts[i + 3].y + 3);
            }
            ctx.stroke();
        }

        // 4. Front 3D cylindrical coaster tube (shadow -> cobalt body -> electric cyan -> specular white core)
        const layers = [
            { dy: 7, w: 13, color: '#090724' },
            { dy: 5, w: 11, color: '#27207a' },
            { dy: 3, w: 7,  color: '#00d8ff' },
            { dy: 1.5, w: 3, color: '#e8ffff' },
        ];
        for (const L of layers) {
            ctx.strokeStyle = L.color;
            ctx.lineWidth = L.w;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y + L.dy);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y + L.dy);
            ctx.stroke();
        }

        // 5. Chasing luminous gold/magenta coaster lights along the bridge
        const pulse = Math.floor(clock / 4);
        for (let i = 1; i < pts.length; i += 4) {
            const lit = ((i + pulse) % 8) < 4;
            ctx.fillStyle = lit ? '#ffe640' : '#ff2a9d';
            ctx.beginPath();
            ctx.arc(pts[i].x, pts[i].y + 6, 2.6, 0, TAU);
            ctx.fill();
        }

        ctx.restore();
    }

    /** Renders a 2.5D/3D-extruded road deck & 3D faceted sapphire-violet prism cliff block for [xA, xB]. */
    function drawPrismCliffSpan(ctx, surf, xA, xB, view, isMainFloor, prismPat) {
        if (xB <= xA) return;
        const step = 6;
        const pts = [];
        for (let x = xA; ; x += step) {
            const xx = x >= xB ? xB : x;
            pts.push({ x: xx, y: surf.f(xx) });
            if (xx >= xB) break;
        }
        if (pts.length < 2) return;

        const shelfThickness = surf.thickness || 86;
        const bottomAt = (p) => isMainFloor ? (view.y1 + 140) : (p.y + shelfThickness);

        ctx.save();

        // 1. 3D Extruded Right End-Cap Wall (visible on floating islands & right boundaries!)
        if (!isMainFloor && xB >= surf.x1 - 2) {
            const pEnd = pts[pts.length - 1];
            const yTop = pEnd.y;
            const yBot = bottomAt(pEnd);
            const sideGrad = ctx.createLinearGradient(pEnd.x, yTop, pEnd.x + EX_X, yBot);
            sideGrad.addColorStop(0, '#161147');
            sideGrad.addColorStop(1, '#080520');
            ctx.fillStyle = sideGrad;
            ctx.beginPath();
            ctx.moveTo(pEnd.x, yTop);
            ctx.lineTo(pEnd.x + EX_X, yTop + EX_Y);
            ctx.lineTo(pEnd.x + EX_X, yBot + EX_Y - 10);
            ctx.lineTo(pEnd.x, yBot);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 230, 255, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // 2. 2.5D Receding Top Road Deck ((x, y) -> (x + EX_X, y + EX_Y))
        //    Scar's 2D feet run along (x, y), while the 3D road deck recedes behind him!
        let minTopY = Infinity;
        let maxTopY = -Infinity;
        for (let i = 0; i < pts.length; i++) {
            if (pts[i].y < minTopY) minTopY = pts[i].y;
            if (pts[i].y > maxTopY) maxTopY = pts[i].y;
        }
        const deckGrad = ctx.createLinearGradient(0, minTopY + EX_Y - 4, 0, maxTopY + 4);
        deckGrad.addColorStop(0, '#2a166e');    // Back curb violet
        deckGrad.addColorStop(0.45, '#1358c4'); // Mid 3D road cobalt
        deckGrad.addColorStop(1, '#00e5ff');    // Front sunlit cyan lip
        ctx.fillStyle = deckGrad;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x + EX_X, pts[i].y + EX_Y);
        ctx.closePath();
        ctx.fill();

        // Back 3D neon guard-rail along (x + EX_X, y + EX_Y)
        ctx.strokeStyle = '#ff2a9d';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(pts[0].x + EX_X, pts[0].y + EX_Y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + EX_X, pts[i].y + EX_Y);
        ctx.stroke();

        // Glowing center lane dashes down the middle of the 2.5D road deck
        ctx.save();
        ctx.strokeStyle = '#ffe640';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([12, 14]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x + EX_X * 0.5, pts[0].y + EX_Y * 0.5);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + EX_X * 0.5, pts[i].y + EX_Y * 0.5);
        ctx.stroke();
        ctx.restore();

        // 3. Main 3D Faceted Sapphire-Violet Prism Cliff Body
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (isMainFloor) {
            const yBot = view.y1 + 140;
            ctx.lineTo(pts[pts.length - 1].x, yBot);
            ctx.lineTo(pts[0].x, yBot);
        } else {
            // Sculpted bevelled 3D crystal underside on floating shelves
            for (let i = pts.length - 1; i >= 0; i--) {
                const taper = (i === 0 || i === pts.length - 1) ? -14 : (Math.sin(pts[i].x * 0.035) * 8);
                ctx.lineTo(pts[i].x, bottomAt(pts[i]) + taper);
            }
        }
        ctx.closePath();
        ctx.fillStyle = prismPat;
        ctx.fill();

        // 3D Ambient-Occlusion Overhang Shadow directly beneath the front road lip
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(6, 4, 24, 0.72)';
        ctx.lineWidth = 22;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y + 11);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y + 11);
        ctx.stroke();

        // Bottom crystal bevel highlight on floating shelves
        if (!isMainFloor) {
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let i = 0; i < pts.length; i++) {
                const taper = (i === 0 || i === pts.length - 1) ? -14 : (Math.sin(pts[i].x * 0.035) * 8);
                const yy = bottomAt(pts[i]) + taper;
                if (i === 0) ctx.moveTo(pts[i].x, yy);
                else ctx.lineTo(pts[i].x, yy);
            }
            ctx.stroke();
        }
        ctx.restore();

        // 4. Front 3D Cylindrical Neon Trim Lip along (x, y)
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const lipLayers = [
            { dy: 8.5, w: 6,   color: '#090726' }, // Deep drop shadow
            { dy: 5.5, w: 6.5, color: '#0088e8' }, // Lower cobalt-cyan bevel
            { dy: 2.8, w: 4.5, color: '#3dffb8' }, // Bright Sonic Colors mint-cyan trim
            { dy: 0.8, w: 2.0, color: '#f0ffff' }, // Crisp top specular edge
        ];
        for (const L of lipLayers) {
            ctx.strokeStyle = L.color;
            ctx.lineWidth = L.w;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y + L.dy);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y + L.dy);
            ctx.stroke();
        }

        ctx.restore();
    }

    /** Renders a full surface by splitting any `coasterSpans` vs solid 3D prism cliff spans inside `view`. */
    function drawSurface25D(ctx, surf, view, isMainFloor, prismPat, clock) {
        const vx0 = Math.max(surf.x0, view.x0 - 30);
        const vx1 = Math.min(surf.x1, view.x1 + 30);
        if (vx1 <= vx0) return;

        const spans = surf.coasterSpans || [];
        if (!spans.length) {
            drawPrismCliffSpan(ctx, surf, vx0, vx1, view, isMainFloor, prismPat);
            return;
        }

        // Partition [vx0, vx1] around coaster bridge intervals
        let cursor = vx0;
        for (let i = 0; i < spans.length; i++) {
            const c0 = Math.max(vx0, spans[i][0]);
            const c1 = Math.min(vx1, spans[i][1]);
            if (c1 <= c0) continue;
            if (c0 > cursor) {
                drawPrismCliffSpan(ctx, surf, cursor, c0, view, isMainFloor, prismPat);
            }
            drawCoasterBridgeSpan(ctx, surf, c0, c1, clock);
            cursor = c1;
        }
        if (cursor < vx1) {
            drawPrismCliffSpan(ctx, surf, cursor, vx1, view, isMainFloor, prismPat);
        }
    }

    SonicEngine.Terrain.registerLevel('z1_act2', {
        title: 'Starlight Resort Act 2',
        zone: 1,
        zoneName: 'STARLIGHT RESORT',
        act: 2,
        isBossAct: false,
        bgm: 'assets/level1.mp3',
        startX: 0,
        endX: 11400,
        deathY: 1040,
        cameraMinY: -220,
        cameraMaxY: 460,

        theme: {
            skyTop:        '#06071c',
            skyMid:        '#142c7e',
            skyBottom:     '#00c4ff',
            groundA:       '#2a3798',
            groundB:       '#201152',
            loopA:         '#00e5ff',
            loopB:         '#ff2a9d',
            trimColor:     '#00d8ff',
            trimHighlight: '#3dffb8',
        },

        // ====================================================================
        // 1. HIGH-SPEED EMERALD HILL ACT 2 INSPIRED TERRAIN (11,400px)
        // ====================================================================
        buildTerrain(b, terrain) {
            // A. CONTINUOUS LOWER / MAIN EXPRESSWAY (x = 0 -> 11400, zero cheap death pits!)
            const main = b.path(0, 460);
            main.flat(420);                  // 0..420     : Starlight Launch Strip (y = 460)
            main.bump(380, 18, +1);          // 420..800   : Rolling Crest #1
            main.flat(360);                  // 800..1160  : Plasma Cascade Bridge #1 (y = 460)
            main.bump(420, 20, +1);          // 1160..1580 : Rolling Crest #2
            main.flat(360);                  // 1580..1940 : Plasma Cascade Bridge #2 (y = 460)
            main.bump(420, 22, +1);          // 1940..2360 : Launch Crest #3
            stepY(main, 1100, +120);         // 2360..3460 : Grand Downhill Starlight Slide (y: 460 -> 580)
            main.flat(620);                  // 3460..4080 : Lower Twin Loop #1 Runway (y = 580)
            stepY(main, 280, +80);           // 4080..4360 : Steep Twin-Loop Acceleration Ramp (y: 580 -> 660)
            main.flat(600);                  // 4360..4960 : Lower Twin Loop #2 Runway (y = 660)
            main.bump(500, 18, -1);          // 4960..5460 : Waterfall Basin Bowl (y = 660)
            stepY(main, 700, -40);           // 5460..6160 : Rising Expressway Ramp (y: 660 -> 620)
            main.bump(800, 22, +1);          // 6160..6960 : Sweeping Lower Speed Hill
            main.flat(840);                  // 6960..7800 : Triple Plasma-Waterfall Pillars Bridge (y = 620)
            stepY(main, 425, +36);           // 7800..8225 : Post-Waterfall Dip (y: 620 -> 656)
            stepY(main, 425, -56);           // 8225..8650 : Expressway Launch Climb (y: 656 -> 600)
            main.bump(800, 24, +1);          // 8650..9450 : Finale Tubular Coaster Arch Bridge (base y = 600)
            main.flat(1950);                 // 9450..11400: Full-Throttle Holo-Palm Sprint (y = 600)

            const mainSurf = b.addFloor(main, { name: 'starlight main expressway' });
            // Render the Finale Arch Bridge (8650..9450) & Cascade Bridges as 3D tubular coaster bridges!
            mainSurf.coasterSpans = [
                [840, 1120],
                [1620, 1900],
                [8650, 9450],
            ];

            // B. BACK-TO-BACK DESCENDING LOWER TWIN 360° LOOPS (#1 & #2)
            b.addLoop(3800, 580 - 124, 124, 'Lower Twin Loop #1');
            b.addLoop(4620, 660 - 124, 124, 'Lower Twin Loop #2');

            // C. ELEVATED OVERLOOKS & UPPER ROUTE LAUNCH LEDGE
            const overlookA = b.addShelf(
                b.path(830, 364).bump(300, 12, +1),
                { name: 'cascade overlook A', tier: 'mid' }
            );
            overlookA.thickness = 46;

            const overlookB = b.addShelf(
                b.path(1610, 364).bump(300, 12, +1),
                { name: 'cascade overlook B', tier: 'mid' }
            );
            overlookB.thickness = 46;

            const skyLoopA = b.addShelf(
                b.path(3580, 280).flat(340),
                { name: 'twin-loop sky island A', tier: 'high' }
            );
            skyLoopA.thickness = 54;

            const skyLoopB = b.addShelf(
                b.path(4220, 350).flat(340),
                { name: 'twin-loop sky island B', tier: 'high' }
            );
            skyLoopB.thickness = 54;

            // Optional jump-on ledge right after Lower Loop #2 with Red Spring up to the Starlight Coaster!
            const upperLaunchLedge = b.addShelf(
                b.path(4850, 582).flat(250),
                { name: 'upper coaster launch ledge', tier: 'mid' }
            );
            upperLaunchLedge.thickness = 44;

            // D. THE UPPER STARLIGHT COASTER HIGHWAY (x = 5120 -> 8880, 3,760px continuous C1 coaster!)
            const coaster = b.path(5120, 340);
            coaster.flat(920);               // 5120..6040 : Upper Twin Loop #3 Runway (y = 340)
            stepY(coaster, 260, +70);        // 6040..6300 : Twin-Loop Downhill Ramp (y: 340 -> 410)
            coaster.flat(460);               // 6300..6760 : Upper Twin Loop #4 Runway (y = 410)
            coaster.bump(420, 23, +1)        // 6760..8020 : Iconic 3-Wave Corkscrew Roller-Coaster Skyway!
                   .bump(420, 23, +1)
                   .bump(420, 23, +1);
            coaster.flat(580);               // 8020..8600 : Upper Loop #5 Runway (y = 410)
            coaster.ease(160, 0, -0.45)      // 8600..8860 : Upward Coaster Ski-Jump Launch Lip (y: 410 -> 329)
                   .line(100, -0.45);

            const coasterSurf = b.addShelf(coaster, { name: 'upper starlight coaster highway', tier: 'high' });
            coasterSurf.thickness = 92;
            coasterSurf.coasterSpans = [[6760, 8020]];

            // Upper 360° Holo-Coaster Loops (#3, #4, #5)
            b.addLoop(5820, 340 - 112, 112, 'Upper Twin Loop #3');
            b.addLoop(6540, 410 - 112, 112, 'Upper Twin Loop #4');
            b.addLoop(8340, 410 - 112, 112, 'Upper Coaster Loop #5');

            // E. FINALE SKY ISLAND (Giant Special Ring + Scar 1-UP) & STEP-DOWN ISLAND
            const finaleIsland = b.addShelf(
                b.path(8980, 340).flat(460),
                { name: 'finale starlight sky island', tier: 'high' }
            );
            finaleIsland.thickness = 64;

            const stepIsland = b.addShelf(
                b.path(9480, 465).flat(240),
                { name: 'finale step-down island', tier: 'mid' }
            );
            stepIsland.thickness = 48;

            // Save surface references on terrain so objects & holo-palms snap pixel-flush to curves
            terrain.z2 = {
                mainSurf,
                overlookA,
                overlookB,
                skyLoopA,
                skyLoopB,
                upperLaunchLedge,
                coasterSurf,
                finaleIsland,
                stepIsland,
            };

            // Precompute 3D Holo-Palm coordinates flush on their exact surfaces
            const palms = [];
            const addPalm = (surf, x, scale) => palms.push({ x, y: surf.f(x), scale });
            // Opening hills & overlooks
            addPalm(mainSurf, 85, 1.12);
            addPalm(mainSurf, 230, 0.96);
            addPalm(mainSurf, 610, 1.05);
            addPalm(mainSurf, 1370, 1.08);
            addPalm(mainSurf, 2150, 1.02);
            addPalm(mainSurf, 2600, 0.95);
            addPalm(mainSurf, 3510, 1.04);
            // Upper coaster & sky islands
            addPalm(skyLoopA, 3660, 0.92);
            addPalm(coasterSurf, 5260, 1.08);
            addPalm(coasterSurf, 5480, 0.95);
            addPalm(coasterSurf, 8100, 1.0);
            addPalm(finaleIsland, 9020, 1.08);
            addPalm(finaleIsland, 9360, 1.04);
            // Lower expressway accents
            addPalm(mainSurf, 6560, 1.06);
            addPalm(mainSurf, 8560, 0.98);
            // Iconic Emerald Hill Act 2 dense Finish-Line Palm Colonnade (9560..11240)!
            for (let px = 9560, idx = 0; px <= 11240; px += 120, idx++) {
                addPalm(mainSurf, px, (idx % 2 === 0) ? 1.16 : 0.98);
            }
            terrain.z2Palms = palms;
        },

        // Fast-travel debug/toolbar checkpoints across both routes
        checkpoints: [
            { name: '1. Starlight Launch',      x: 120,  y: 460 },
            { name: '2. Grand Downhill Slide',  x: 2380, y: 460 },
            { name: '3. Lower Twin Loops',      x: 3500, y: 580 },
            { name: '4. Upper Coaster Loops',   x: 5360, y: 340 },
            { name: '5. Corkscrew Skyway',      x: 6740, y: 410 },
            { name: '6. Holo-Palm Straightaway', x: 9540, y: 600 },
        ],

        // ====================================================================
        // 2. COMMON GAME OBJECTS (from public/assets/common_objects.png)
        // ====================================================================
        objects(terrain) {
            const z = terrain.z2;
            const mf = z.mainSurf;
            const cs = z.coasterSurf;

            return {
                // TV Item Monitors ('rings', 'shield', 'shoes', 'invinc', Scar '1up')
                monitors: [
                    { x: 290,  y: mf.f(290),             item: 'shield' },
                    { x: 980,  y: z.overlookA.f(980),    item: 'shoes'  },
                    { x: 1760, y: z.overlookB.f(1760),   item: 'rings'  },
                    { x: 3750, y: z.skyLoopA.f(3750),    item: 'invinc' },
                    { x: 4380, y: z.skyLoopB.f(4380),    item: 'rings'  },
                    { x: 5220, y: mf.f(5220),            item: 'shoes'  },
                    { x: 5400, y: cs.f(5400),            item: 'shield' },
                    { x: 7400, y: mf.f(7400),            item: 'rings'  },
                    { x: 9310, y: z.finaleIsland.f(9310), item: '1up'   },
                    { x: 9600, y: z.stepIsland.f(9600),  item: 'rings'  },
                    { x: 9820, y: mf.f(9820),            item: 'shoes'  },
                ],

                // Classic Checkpoint Star Posts
                starPosts: [
                    { x: 2340, y: mf.f(2340) },
                    { x: 4920, y: mf.f(4920) },
                    { x: 5320, y: cs.f(5320) },
                    { x: 8060, y: cs.f(8060) },
                    { x: 9520, y: mf.f(9520) },
                ],

                // Red & Yellow Springs (placed on optional launch points so main-route speed flow stays unbroken!)
                springs: [
                    { x: 760,  y: mf.f(760) + 2,                 color: 'yellow', power: -10.6 },
                    { x: 3490, y: z.skyLoopA.f(3580) + 300,      color: 'red',    power: -13.6 },
                    { x: 4510, y: z.skyLoopB.f(4510),            color: 'yellow', power: -11.2 },
                    { x: 5055, y: z.upperLaunchLedge.f(5055),    color: 'red',    power: -13.1 },
                ].filter((_, idx) => idx !== 1), // Keep 3490 lower-loop entry runway 100% clear for pure speed!

                // Ground Speed Boosters before all 5 Loops, Corkscrew Waves & Finale Sprint
                speedBoosters: [
                    { x: 840,  y: mf.f(840),   boost: 11.6 },
                    { x: 2400, y: mf.f(2400),  boost: 12.0 },
                    { x: 3560, y: mf.f(3560),  boost: 12.4 }, // Launches through Lower Loop #1
                    { x: 4390, y: mf.f(4390),  boost: 12.4 }, // Launches through Lower Loop #2
                    { x: 5580, y: cs.f(5580),  boost: 12.2 }, // Launches through Upper Loop #3
                    { x: 6330, y: cs.f(6330),  boost: 12.4 }, // Launches through Upper Loop #4 & Corkscrew
                    { x: 7000, y: mf.f(7000),  boost: 12.0 }, // Lower Triple-Waterfall sprint
                    { x: 8090, y: cs.f(8090),  boost: 12.4 }, // Launches through Upper Loop #5
                    { x: 9640, y: mf.f(9640),  boost: 13.0 }, // Lower Finale entry booster
                    { x: 9995, y: mf.f(9995),  boost: 13.0 }, // Full-throttle Holo-Palm Colonnade Finale!
                ],

                // Sonic Colors Starlight Aerial Dash Rings (rocket Scar onto sky overlooks & coaster shortcuts when jumped into!)
                dashRings: [
                    { x: 795,  y: 382, angleDeg: -16, boost: 12.6 }, // Launches onto Overlook A (Speed Shoes TV!)
                    { x: 1575, y: 382, angleDeg: -16, boost: 12.6 }, // Launches onto Overlook B (Rings TV!)
                    { x: 4070, y: 310, angleDeg: -12, boost: 12.8 }, // Bridges Sky Island A -> Sky Island B
                    { x: 6820, y: 205, angleDeg: -8,  boost: 12.8 }, // High aerial boost when jumping above the Corkscrew Skyway!
                ],

                // Level 1 Springy Bounce Poles (optional vertical shortcuts to sky islands)
                bouncePoles: [
                    { x: 1545, y: mf.f(1545) - 24, dir: 1, power: -11.8 },
                    { x: 3515, y: mf.f(3515) - 28, dir: 1, power: -12.4 },
                ],

                // Level 1 Pinball Spinners (airborne bumper cluster above the Grand Downhill Canyon Cascade)
                spinners: [
                    { x: 2850, y: 340, variant: 'silver' },
                    { x: 2910, y: 315, variant: 'dark'   },
                    { x: 2970, y: 340, variant: 'silver' },
                ],

                // Level 1 Shimmering Water/Plasma Surface Basins (kick up 16-bit splash plumes at high speed!)
                waterZones: [
                    { x0: 4960, x1: 5460, y: 660 },
                    { x0: 6980, x1: 7780, y: 670 },
                ],

                // Sparing hazards tucked on back corners of optional sky ledges (zero cheap highway roadblocks)
                spikeClusters: [
                    { x: 3605, y: z.skyLoopA.f(3605) },
                    { x: 9505, y: z.stepIsland.f(9505) },
                ],

                platforms: [
                    // Hovering Sonic Colors shuttle platform bridging Twin-Loop Sky Islands -> Upper Coaster!
                    { x: 4840, y: 345, w: 64, large: true, ampX: 110, ampY: 0, speed: 0.032, phase: 0 },
                ],

                // Giant Special Ring reward on the Finale Starlight Sky Island (+50 Rings & +10,000 pts)
                bigRing: { x: 9150, y: z.finaleIsland.f(9150) - 44 },

                // Classic Spinning Goal Signpost at the end of the Holo-Palm Straightaway
                goalPost: { x: 10950, y: mf.f(10950) },

                // 28 Sonic the Hedgehog 2 Badniks across all routes (Lower Expressway, Waterfalls, Sky Islands, Upper Coaster & Finale)
                enemies: [
                    // 1. Opening Runway & Overlook A (Coconuts near Holo-Palm, Buzzer wasp, Masher in Waterfall #1, Sping on Overlook A)
                    { kind: 'crab', type: 'coconuts', x: 360,  y: mf.f(360),          minX: 320,  maxX: 430,  vx: 0.85 },
                    { kind: 'buzz', type: 'buzzer',   x: 620,  y: 385,                baseX: 620, baseY: 385, phase: 0.2 },
                    { kind: 'buzz', type: 'masher',   x: 980,  y: 525,                baseX: 980, baseY: 525, leapHeight: 86, phase: 0.4 },
                    { kind: 'crab', type: 'sping',    x: 1010, y: z.overlookA.f(1010), minX: 880, maxX: 1085, vx: 1.15 },

                    // 2. Second Crest & Cascade Bridge #2 (Grounder, Buzzer, Masher in Waterfall #2, Shellcracker on Overlook B, Crawl in Valley)
                    { kind: 'crab', type: 'grounder', x: 1320, y: mf.f(1320),         minX: 1200, maxX: 1460, vx: 1.05 },
                    { kind: 'buzz', type: 'buzzer',   x: 1520, y: 380,                baseX: 1520, baseY: 380, phase: 1.3 },
                    { kind: 'buzz', type: 'masher',   x: 1760, y: 525,                baseX: 1760, baseY: 525, leapHeight: 86, phase: 1.9 },
                    { kind: 'crab', type: 'shell',    x: 1790, y: z.overlookB.f(1790), minX: 1660, maxX: 1870, vx: 0.95 },
                    { kind: 'crab', type: 'crawl',    x: 2120, y: mf.f(2120),         minX: 1980, maxX: 2260, vx: 1.10 },

                    // 3. Grand Downhill Starlight Slide & Canyon Cascade (Balkiry jet swoop, Masher in Canyon Waterfall, Sping at bottom)
                    { kind: 'buzz', type: 'balkiry',  x: 2680, y: 385,                baseX: 2680, baseY: 385, span: 95, phase: 0.6 },
                    { kind: 'buzz', type: 'masher',   x: 2910, y: 560,                baseX: 2910, baseY: 560, leapHeight: 92, phase: 0.8 },
                    { kind: 'crab', type: 'sping',    x: 3340, y: mf.f(3340),         minX: 3220, maxX: 3460, vx: 1.25 },

                    // 4. Twin-Loop Sky Islands & Connector (Octus on Sky Island A, Slicer between Twin Loops, Asteron on Sky Island B)
                    { kind: 'crab', type: 'octus',    x: 3820, y: z.skyLoopA.f(3820), minX: 3680, maxX: 3930, vx: 0.90 },
                    { kind: 'crab', type: 'slicer',   x: 4160, y: mf.f(4160),         minX: 4080, maxX: 4280, vx: 1.15 },
                    { kind: 'buzz', type: 'asteron',  x: 4340, y: 270,                baseX: 4340, baseY: 270, phase: 1.1 },

                    // 5. Route-Split Starlight Cascade & Lower Expressway (Masher in Waterfall #4, Shellcracker, Crawl, Mashers in Triple Waterfalls, Slicer)
                    { kind: 'buzz', type: 'masher',   x: 5190, y: 650,                baseX: 5190, baseY: 650, leapHeight: 88, phase: 2.1 },
                    { kind: 'crab', type: 'shell',    x: 5760, y: mf.f(5760),         minX: 5600, maxX: 5940, vx: 1.05 },
                    { kind: 'crab', type: 'crawl',    x: 6480, y: mf.f(6480),         minX: 6320, maxX: 6680, vx: 1.15 },
                    { kind: 'buzz', type: 'masher',   x: 7112, y: 660,                baseX: 7112, baseY: 660, leapHeight: 84, phase: 0.5 },
                    { kind: 'crab', type: 'grounder', x: 7440, y: mf.f(7440),         minX: 7260, maxX: 7540, vx: 1.15 },
                    { kind: 'buzz', type: 'masher',   x: 7642, y: 660,                baseX: 7642, baseY: 660, leapHeight: 84, phase: 2.4 },
                    { kind: 'crab', type: 'slicer',   x: 8840, y: mf.f(8840),         minX: 8680, maxX: 9020, vx: 1.20 },

                    // 6. Upper Starlight Coaster & 3-Wave Corkscrew Skyway (Buzzer, Balkiry, Nebula, Turtloid, Chop patrolling overhead)
                    { kind: 'buzz', type: 'buzzer',   x: 5230, y: 268,                baseX: 5230, baseY: 268, phase: 0.9 },
                    { kind: 'buzz', type: 'balkiry',  x: 6140, y: 260,                baseX: 6140, baseY: 260, span: 90, phase: 1.7 },
                    { kind: 'buzz', type: 'nebula',   x: 7020, y: 210,                baseX: 7020, baseY: 210, phase: 0.3 },
                    { kind: 'buzz', type: 'turtloid', x: 7580, y: 210,                baseX: 7580, baseY: 210, phase: 1.5 },
                    { kind: 'buzz', type: 'chop',     x: 8680, y: 270,                baseX: 8680, baseY: 270, phase: 2.0 },

                    // 7. Finale Holo-Palm Colonnade Straightaway (Coconuts & Crawl guarding the final sprint!)
                    { kind: 'crab', type: 'coconuts', x: 10140, y: mf.f(10140),       minX: 10060, maxX: 10240, vx: 1.0 },
                    { kind: 'crab', type: 'crawl',    x: 10520, y: mf.f(10520),       minX: 10380, maxX: 10680, vx: 1.2 },
                ],
            };
        },

        // Generous high-speed Ring trails guiding momentum across every slope, coaster wave & 360° loop!
        setupObjects(rings, terrain) {
            const z = terrain.z2;
            const mf = z.mainSurf;
            const cs = z.coasterSurf;

            // Opening hills & Cascade Bridges
            rings.addSurfaceRings(mf, 450, 44, 7, 20);
            rings.addSurfaceRings(z.overlookA, 870, 38, 6, 20);
            rings.addSurfaceRings(mf, 1210, 44, 7, 20);
            rings.addSurfaceRings(z.overlookB, 1650, 38, 6, 20);
            rings.addSurfaceRings(mf, 1990, 44, 7, 20);

            // Grand Downhill Starlight Slide (18-ring continuous acceleration ribbon!)
            rings.addSurfaceRings(mf, 2450, 52, 18, 20);

            // All 5 360° Holo-Coaster Loops filled with 12-ring circles
            for (const lp of terrain.loops) {
                rings.addLoopRings(lp, 12);
            }

            // Twin-Loop Downhill Connector + Upper Launch Ledge guide arc
            rings.addSurfaceRings(mf, 4110, 42, 5, 20);
            rings.addRingLine(4875, 558, 36, 0, 4);
            // Vertical ring beacon rising from the Upper Coaster Red Spring up onto x = 5160!
            rings.addRingLine(5065, 520, 14, -36, 5);

            // Sky islands above the Twin Loops
            rings.addRingLine(3650, 254, 36, 0, 6);
            rings.addRingLine(4270, 324, 36, 0, 5);

            // Upper Starlight Coaster Highway & 3-Wave Corkscrew Skyway Bridge (26-ring coaster ribbon!)
            rings.addSurfaceRings(cs, 5180, 44, 8, 20);
            rings.addSurfaceRings(cs, 6070, 42, 5, 20);
            rings.addSurfaceRings(cs, 6790, 48, 25, 22);
            rings.addSurfaceRings(cs, 8620, 42, 6, 22);

            // Lower Expressway & Triple Plasma-Waterfall Pillars Bridge
            rings.addSurfaceRings(mf, 5520, 54, 11, 20);
            rings.addSurfaceRings(mf, 6220, 56, 12, 20);
            rings.addSurfaceRings(mf, 7040, 46, 16, 20);
            rings.addSurfaceRings(mf, 8690, 54, 13, 22);

            // Full-Throttle Holo-Palm Colonnade Finale Sprint (20-ring victory lane!)
            rings.addSurfaceRings(mf, 9900, 46, 20, 20);
        },

        // ====================================================================
        // SONIC THE HEDGEHOG 2 BADNIKS SPRITE SHEET & ANIMATION ATLAS
        // ====================================================================
        enemySheet: 'assets/enemies_act2.png',
        enemyFrames: {
            buzzer_1:   { sx: 2,    sy: 2, w: 40, h: 14, ax: 20, ay: 7  },
            buzzer_2:   { sx: 46,   sy: 2, w: 40, h: 14, ax: 20, ay: 7  },
            buzzer_3:   { sx: 90,   sy: 2, w: 40, h: 14, ax: 20, ay: 7  },
            buzzer_aim: { sx: 134,  sy: 2, w: 33, h: 26, ax: 17, ay: 13 },
            masher_1:   { sx: 171,  sy: 2, w: 20, h: 27, ax: 10, ay: 14 },
            masher_2:   { sx: 195,  sy: 2, w: 26, h: 27, ax: 13, ay: 14 },
            coconuts_1: { sx: 225,  sy: 2, w: 22, h: 37, ax: 11, ay: 37 },
            coconuts_2: { sx: 251,  sy: 2, w: 22, h: 37, ax: 11, ay: 37 },
            coconuts_3: { sx: 277,  sy: 2, w: 26, h: 39, ax: 13, ay: 39 },
            coconuts_4: { sx: 307,  sy: 2, w: 27, h: 40, ax: 14, ay: 40 },
            sping_1:    { sx: 338,  sy: 2, w: 40, h: 20, ax: 20, ay: 20 },
            sping_2:    { sx: 382,  sy: 2, w: 36, h: 19, ax: 18, ay: 19 },
            sping_3:    { sx: 422,  sy: 2, w: 40, h: 20, ax: 20, ay: 20 },
            sping_4:    { sx: 466,  sy: 2, w: 39, h: 20, ax: 20, ay: 20 },
            grounder_1: { sx: 509,  sy: 2, w: 27, h: 30, ax: 14, ay: 30 },
            grounder_2: { sx: 540,  sy: 2, w: 27, h: 33, ax: 14, ay: 33 },
            grounder_3: { sx: 571,  sy: 2, w: 27, h: 33, ax: 14, ay: 33 },
            grounder_4: { sx: 602,  sy: 2, w: 27, h: 33, ax: 14, ay: 33 },
            crawl_1:    { sx: 633,  sy: 2, w: 39, h: 27, ax: 20, ay: 27 },
            crawl_2:    { sx: 676,  sy: 2, w: 53, h: 27, ax: 27, ay: 27 },
            crawl_3:    { sx: 733,  sy: 2, w: 34, h: 27, ax: 17, ay: 27 },
            crawl_4:    { sx: 771,  sy: 2, w: 40, h: 27, ax: 20, ay: 27 },
            shell_1:    { sx: 815,  sy: 2, w: 39, h: 20, ax: 20, ay: 20 },
            shell_2:    { sx: 858,  sy: 2, w: 47, h: 26, ax: 24, ay: 26 },
            shell_3:    { sx: 909,  sy: 2, w: 47, h: 27, ax: 24, ay: 27 },
            shell_4:    { sx: 960,  sy: 2, w: 47, h: 27, ax: 24, ay: 27 },
            slicer_1:   { sx: 1011, sy: 2, w: 27, h: 27, ax: 14, ay: 27 },
            slicer_2:   { sx: 1042, sy: 2, w: 27, h: 27, ax: 14, ay: 27 },
            slicer_3:   { sx: 1073, sy: 2, w: 27, h: 27, ax: 14, ay: 27 },
            slicer_4:   { sx: 1104, sy: 2, w: 40, h: 27, ax: 20, ay: 27 },
            octus_1:    { sx: 1148, sy: 2, w: 36, h: 22, ax: 18, ay: 22 },
            octus_2:    { sx: 1188, sy: 2, w: 34, h: 22, ax: 17, ay: 22 },
            octus_3:    { sx: 1226, sy: 2, w: 35, h: 22, ax: 18, ay: 22 },
            balkiry_1:  { sx: 1265, sy: 2, w: 60, h: 21, ax: 30, ay: 11 },
            balkiry_2:  { sx: 1329, sy: 2, w: 58, h: 29, ax: 29, ay: 15 },
            balkiry_3:  { sx: 1391, sy: 2, w: 60, h: 27, ax: 30, ay: 14 },
            nebula_1:   { sx: 1455, sy: 2, w: 41, h: 34, ax: 21, ay: 17 },
            nebula_2:   { sx: 1500, sy: 2, w: 27, h: 34, ax: 14, ay: 17 },
            nebula_3:   { sx: 1531, sy: 2, w: 27, h: 34, ax: 14, ay: 17 },
            nebula_4:   { sx: 1562, sy: 2, w: 27, h: 34, ax: 14, ay: 17 },
            chop_1:     { sx: 1593, sy: 2, w: 26, h: 20, ax: 13, ay: 10 },
            chop_2:     { sx: 1623, sy: 2, w: 26, h: 20, ax: 13, ay: 10 },
            asteron_1:  { sx: 1653, sy: 2, w: 27, h: 26, ax: 14, ay: 13 },
            asteron_2:  { sx: 1684, sy: 2, w: 27, h: 26, ax: 14, ay: 13 },
            turtloid_1: { sx: 1715, sy: 2, w: 47, h: 26, ax: 24, ay: 26 },
            turtloid_2: { sx: 1766, sy: 2, w: 47, h: 26, ax: 24, ay: 26 },
        },

        drawEnemy(ctx, en, info) {
            const { idx, clock, player, sheet, frames } = info;
            if (!sheet) {
                const x = en.x, y = en.kind === 'crab' ? en.y - 12 : en.y;
                ctx.fillStyle = en.kind === 'crab' ? '#ff2a85' : '#00e5ff';
                ctx.beginPath(); ctx.ellipse(x, y, 14, 10, 0, 0, TAU); ctx.fill();
                return;
            }
            const t = en.type || 'buzzer';
            const dist = Math.hypot((player ? player.x : 0) - en.x, (player ? player.y : 0) - en.y);
            let key = 'buzzer_1';

            if (t === 'buzzer') {
                if (dist < 165 && player && player.y > en.y) {
                    key = 'buzzer_aim';
                } else {
                    const seq = ['buzzer_1', 'buzzer_2', 'buzzer_3', 'buzzer_2'];
                    key = seq[Math.floor(clock * 0.34 + idx) % 4];
                }
            } else if (t === 'masher') {
                // Opens jaws wide while leaping up, snaps shut on descent
                const velPhase = Math.cos(clock * 0.055 + (en.phase || 0));
                key = (velPhase > -0.15 && Math.floor(clock * 0.28) % 2 === 0) ? 'masher_2' : 'masher_1';
            } else if (t === 'coconuts') {
                if (dist < 175) {
                    key = (Math.floor(clock * 0.2) % 2 === 0) ? 'coconuts_3' : 'coconuts_4';
                } else {
                    key = (Math.floor(clock * 0.16 + idx) % 2 === 0) ? 'coconuts_1' : 'coconuts_2';
                }
            } else if (t === 'sping') {
                const seq = ['sping_1', 'sping_2', 'sping_3', 'sping_4'];
                key = seq[Math.floor(clock * 0.22 + idx) % 4];
            } else if (t === 'grounder') {
                const seq = ['grounder_1', 'grounder_2', 'grounder_3', 'grounder_4'];
                key = seq[Math.floor(clock * 0.20 + idx) % 4];
            } else if (t === 'crawl') {
                const nearTurn = (en.minX !== undefined && (en.x - en.minX < 20 || en.maxX - en.x < 20));
                if (nearTurn || dist < 110) {
                    key = 'crawl_2';
                } else {
                    const seq = ['crawl_1', 'crawl_3', 'crawl_4', 'crawl_3'];
                    key = seq[Math.floor(clock * 0.18 + idx) % 4];
                }
            } else if (t === 'shell') {
                if (dist < 140) {
                    key = (Math.floor(clock * 0.22) % 2 === 0) ? 'shell_3' : 'shell_4';
                } else {
                    key = (Math.floor(clock * 0.18 + idx) % 2 === 0) ? 'shell_1' : 'shell_2';
                }
            } else if (t === 'slicer') {
                if (dist < 150) {
                    key = 'slicer_4';
                } else {
                    const seq = ['slicer_1', 'slicer_2', 'slicer_3', 'slicer_2'];
                    key = seq[Math.floor(clock * 0.20 + idx) % 4];
                }
            } else if (t === 'octus') {
                const seq = ['octus_1', 'octus_2', 'octus_3', 'octus_2'];
                key = seq[Math.floor(clock * 0.18 + idx) % 4];
            } else if (t === 'balkiry') {
                const seq = ['balkiry_1', 'balkiry_2', 'balkiry_3', 'balkiry_2'];
                key = seq[Math.floor(clock * 0.35 + idx) % 4];
            } else if (t === 'nebula') {
                const seq = ['nebula_1', 'nebula_2', 'nebula_3', 'nebula_4'];
                key = seq[Math.floor(clock * 0.22 + idx) % 4];
            } else if (t === 'chop') {
                key = (Math.floor(clock * 0.26 + idx) % 2 === 0) ? 'chop_1' : 'chop_2';
            } else if (t === 'asteron') {
                key = (Math.floor(clock * 0.2 + idx) % 2 === 0) ? 'asteron_1' : 'asteron_2';
            } else if (t === 'turtloid') {
                key = (Math.floor(clock * 0.22 + idx) % 2 === 0) ? 'turtloid_1' : 'turtloid_2';
            }

            const frame = frames[key] || frames.buzzer_1;
            // All sprites in enemies_act2.png natively face LEFT; flip horizontally when moving right or facing Scar on the right
            let movingRight = false;
            if (en.kind === 'crab') movingRight = en.vx > 0;
            else if (t === 'balkiry') movingRight = Math.cos(clock * 0.05 + (en.phase || 0)) > 0;
            else movingRight = player ? (player.x > en.x) : false;
            const flipX = movingRight ? -1 : 1;

            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.translate(Math.round(en.x), Math.round(en.y));
            ctx.scale(flipX, 1);
            ctx.drawImage(sheet, frame.sx, frame.sy, frame.w, frame.h, -frame.ax, -frame.ay, frame.w, frame.h);
            ctx.restore();
        },

        // ====================================================================
        // 3. 2.5D / 3D-SHADED SONIC COLORS × LEVEL 1 STARLIGHT RENDERERS
        // ====================================================================
        drawBackground(ctx, game) {
            const W = game.W;
            const H = game.H;
            const t = (game.terrain.clock || 0);
            const camX = game.camX || 0;
            const camY = game.camY || 0;

            ctx.save();

            // 1. Level 1 Cyber-Starlight Sky fused with Sonic Colors cosmic royal cobalt & horizon aurora
            const sky = ctx.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0.00, '#050618');
            sky.addColorStop(0.32, '#101a52');
            sky.addColorStop(0.66, '#1840a0');
            sky.addColorStop(0.88, '#1686d8');
            sky.addColorStop(1.00, '#3df5ff');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, H);

            // Soft Sonic Colors magenta-violet nebula ribbon across mid-sky
            const neb = ctx.createRadialGradient(W * 0.62, H * 0.34, 20, W * 0.62, H * 0.38, W * 0.6);
            neb.addColorStop(0, 'rgba(255, 42, 157, 0.28)');
            neb.addColorStop(0.5, 'rgba(130, 56, 255, 0.16)');
            neb.addColorStop(1, 'rgba(16, 26, 82, 0)');
            ctx.fillStyle = neb;
            ctx.fillRect(0, 0, W, H);

            // 2. Twinkling multi-depth cyber starfield
            for (let i = 0; i < 68; i++) {
                const depth = (i % 3 === 0) ? 0.05 : 0.025;
                const sx = (((i * 173.7) - camX * depth) % W + W) % W;
                const sy = ((i * 89.3) % (H * 0.72));
                const twinkle = 0.45 + 0.55 * Math.sin(t * 0.06 + i * 1.9);
                ctx.fillStyle = (i % 7 === 0)
                    ? `rgba(255, 230, 64, ${twinkle.toFixed(2)})`
                    : (i % 5 === 0)
                        ? `rgba(255, 92, 190, ${twinkle.toFixed(2)})`
                        : `rgba(215, 248, 255, ${twinkle.toFixed(2)})`;
                const sz = (i % 6 === 0) ? 2.4 : 1.5;
                ctx.fillRect(sx, sy, sz, sz);
            }

            // 3. Sweeping Sonic Colors Amusement-Park Searchlights
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let b = 0; b < 3; b++) {
                const bx = ((b * 360 + 180 - camX * 0.06) % (W + 220) + (W + 220)) % (W + 220) - 110;
                const ang = Math.sin(t * 0.018 + b * 2.1) * 0.34;
                ctx.save();
                ctx.translate(bx, H * 0.86);
                ctx.rotate(ang);
                const beam = ctx.createLinearGradient(0, 0, 0, -H * 0.85);
                beam.addColorStop(0, b % 2 === 0 ? 'rgba(0, 246, 255, 0.16)' : 'rgba(255, 42, 157, 0.14)');
                beam.addColorStop(1, 'rgba(0, 246, 255, 0)');
                ctx.fillStyle = beam;
                ctx.beginPath();
                ctx.moveTo(-8, 0);
                ctx.lineTo(-68, -H * 0.85);
                ctx.lineTo(68, -H * 0.85);
                ctx.lineTo(8, 0);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            ctx.restore();

            // 4. 3D Sphere-Shaded Ringed Planet (Sonic Colors Planet Wisp / Tropical Resort sky)
            const px = W * 0.76 - (camX * 0.018) % 260;
            const py = H * 0.23 - camY * 0.03;
            const pr = 58;

            // Back half of 3D planetary ring
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(-0.28);
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.42)';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.ellipse(0, 0, pr * 1.95, pr * 0.44, 0, Math.PI, TAU);
            ctx.stroke();
            ctx.restore();

            // 3D lit planet sphere
            const pGrad = ctx.createRadialGradient(px - pr * 0.36, py - pr * 0.34, pr * 0.1, px, py, pr);
            pGrad.addColorStop(0, '#c8ffff');
            pGrad.addColorStop(0.28, '#00d8ff');
            pGrad.addColorStop(0.65, '#4b2cc2');
            pGrad.addColorStop(1, '#100938');
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, TAU);
            ctx.fill();

            // Front half of 3D planetary ring wrapping across the sphere
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(-0.28);
            ctx.strokeStyle = 'rgba(255, 230, 64, 0.72)';
            ctx.lineWidth = 6.5;
            ctx.beginPath();
            ctx.ellipse(0, 0, pr * 1.95, pr * 0.44, 0, 0, Math.PI);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 42, 157, 0.55)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(0, 0, pr * 1.72, pr * 0.37, 0, 0, Math.PI);
            ctx.stroke();
            ctx.restore();

            // Secondary 3D Magenta-Gold Moon
            const mx = W * 0.22 - (camX * 0.012) % 180;
            const my = H * 0.18 - camY * 0.02;
            const mGrad = ctx.createRadialGradient(mx - 8, my - 8, 2, mx, my, 24);
            mGrad.addColorStop(0, '#fff7b0');
            mGrad.addColorStop(0.4, '#ff4eb8');
            mGrad.addColorStop(1, '#2a0d5e');
            ctx.fillStyle = mGrad;
            ctx.beginPath();
            ctx.arc(mx, my, 24, 0, TAU);
            ctx.fill();

            // 5. Sonic Colors Orbital Tether Elevator Column in deep parallax
            const elX = ((W * 0.46 - camX * 0.04) % (W + 300) + (W + 300)) % (W + 300) - 150;
            const elGrad = ctx.createLinearGradient(elX - 18, 0, elX + 18, 0);
            elGrad.addColorStop(0, 'rgba(0, 246, 255, 0)');
            elGrad.addColorStop(0.35, 'rgba(0, 216, 255, 0.35)');
            elGrad.addColorStop(0.5, 'rgba(240, 255, 255, 0.85)');
            elGrad.addColorStop(0.65, 'rgba(255, 42, 157, 0.35)');
            elGrad.addColorStop(1, 'rgba(0, 246, 255, 0)');
            ctx.fillStyle = elGrad;
            ctx.fillRect(elX - 18, 0, 36, H * 0.82);

            // Ascending 3D elevator ring-pod on the orbital tether
            const podY = H * 0.8 - ((t * 1.2) % (H * 0.78));
            ctx.strokeStyle = '#ffe640';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(elX, podY, 16, 5, 0, 0, TAU);
            ctx.stroke();

            // 6. 3D Dual-Rim Rotating Starlight Ferris Wheel & Distant Coaster Viaducts
            const fwX = ((W * 0.82 - camX * 0.09) % (W + 420) + (W + 420)) % (W + 420) - 210;
            const fwY = H * 0.63 - camY * 0.06;
            const fwR = 88;
            const rot = t * 0.008;

            // Ferris wheel A-frame 3D support legs
            ctx.strokeStyle = '#1b1a5a';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(fwX - 48, H * 0.84); ctx.lineTo(fwX + 8, fwY - 6);
            ctx.lineTo(fwX + 64, H * 0.84);
            ctx.stroke();

            // Receding back 3D rim (+8, -6)
            ctx.strokeStyle = 'rgba(130, 80, 255, 0.55)';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(fwX + 8, fwY - 6, fwR, 0, TAU);
            ctx.stroke();

            // 3D spokes + rim cross-bars + glowing gondola capsules
            for (let s = 0; s < 12; s++) {
                const a = rot + (s / 12) * TAU;
                const rx = Math.cos(a) * fwR;
                const ry = Math.sin(a) * fwR;
                ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(fwX, fwY);
                ctx.lineTo(fwX + rx, fwY + ry);
                ctx.lineTo(fwX + 8 + rx, fwY - 6 + ry);
                ctx.stroke();

                ctx.fillStyle = (s % 3 === 0) ? '#ffe640' : (s % 2 === 0 ? '#ff2a9d' : '#00f6ff');
                ctx.beginPath();
                ctx.arc(fwX + rx, fwY + ry, 4.2, 0, TAU);
                ctx.fill();
            }

            // Front 3D neon rim
            ctx.strokeStyle = '#00f6ff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(fwX, fwY, fwR, 0, TAU);
            ctx.stroke();
            ctx.strokeStyle = '#ff2a9d';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(fwX, fwY, fwR * 0.68, 0, TAU);
            ctx.stroke();

            // 7. 3D Receding Starlight Resort Horizon Deck / Cyber Grid (bottom 18% of sky)
            const hzY = Math.round(H * 0.82);
            const seaGrad = ctx.createLinearGradient(0, hzY, 0, H);
            seaGrad.addColorStop(0, '#0c1c64');
            seaGrad.addColorStop(0.35, '#121048');
            seaGrad.addColorStop(1, '#06051c');
            ctx.fillStyle = seaGrad;
            ctx.fillRect(0, hzY, W, H - hzY);

            // Glowing horizon neon rim
            ctx.fillStyle = '#00f6ff';
            ctx.fillRect(0, hzY, W, 2.5);

            // Perspective radial grid lines scrolling subtly with camera X
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, hzY, W, H - hzY);
            ctx.clip();

            ctx.strokeStyle = 'rgba(0, 238, 255, 0.26)';
            ctx.lineWidth = 1.2;
            const gridSpacing = 56;
            const scroll = (camX * 0.22) % gridSpacing;
            const vanishX = W * 0.5;
            for (let gx = -W; gx <= W * 2; gx += gridSpacing) {
                const topX = vanishX + (gx - scroll - vanishX) * 0.28;
                const botX = vanishX + (gx - scroll - vanishX) * 1.45;
                ctx.beginPath();
                ctx.moveTo(topX, hzY);
                ctx.lineTo(botX, H);
                ctx.stroke();
            }
            for (let r = 1; r <= 5; r++) {
                const f = Math.pow(r / 5, 1.7);
                const gy = hzY + f * (H - hzY);
                ctx.strokeStyle = (r % 2 === 0) ? 'rgba(255, 42, 157, 0.25)' : 'rgba(0, 238, 255, 0.25)';
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.lineTo(W, gy);
                ctx.stroke();
            }
            ctx.restore();

            ctx.restore();
        },

        drawBack(ctx, game) {
            const view = game.view;
            const t = game.terrain.clock || 0;

            // 1. 3D Cylindrical Support Pylons under the Upper Starlight Coaster Highway
            for (const py of COASTER_PYLONS) {
                if (py.x + 40 < view.x0 || py.x - 40 > view.x1) continue;
                const cyl = ctx.createLinearGradient(py.x - 14, 0, py.x + 14, 0);
                cyl.addColorStop(0, '#0b0a2a');
                cyl.addColorStop(0.28, '#3f4cc0');
                cyl.addColorStop(0.5, '#8ee8ff');
                cyl.addColorStop(0.8, '#1b1656');
                cyl.addColorStop(1, '#080620');
                ctx.fillStyle = cyl;
                ctx.fillRect(py.x - 14, py.yTop, 28, py.yBot - py.yTop);

                // Glowing horizontal Sonic Colors collar rings on the 3D pylon
                for (let ry = py.yTop + 44; ry < py.yBot; ry += 72) {
                    ctx.fillStyle = '#ff2a9d';
                    ctx.fillRect(py.x - 16, ry, 32, 4);
                    ctx.fillStyle = '#00f6ff';
                    ctx.fillRect(py.x - 16, ry + 4, 32, 2.5);
                }
            }

            // 2. 3D Cylindrical Neon Plasma Waterfalls (Emerald Hill Act 2 waterfall bridges & triple pillars!)
            for (const wf of PLASMA_WATERFALLS) {
                if (wf.x + wf.w < view.x0 - 30 || wf.x > view.x1 + 30) continue;

                // Horizontal 3D cylinder shading across the waterfall column
                const wg = ctx.createLinearGradient(wf.x, 0, wf.x + wf.w, 0);
                wg.addColorStop(0.00, 'rgba(18, 22, 92, 0.85)');
                wg.addColorStop(0.14, 'rgba(0, 148, 255, 0.88)');
                wg.addColorStop(0.38, 'rgba(0, 246, 255, 0.94)');
                wg.addColorStop(0.52, 'rgba(235, 255, 255, 0.96)');
                wg.addColorStop(0.76, 'rgba(0, 210, 255, 0.90)');
                wg.addColorStop(0.92, 'rgba(255, 42, 157, 0.78)');
                wg.addColorStop(1.00, 'rgba(18, 12, 74, 0.85)');
                ctx.fillStyle = wg;
                ctx.fillRect(wf.x, wf.y0, wf.w, wf.y1 - wf.y0);

                // Scrolling vertical plasma light ribbons
                ctx.save();
                ctx.beginPath();
                ctx.rect(wf.x, wf.y0, wf.w, wf.y1 - wf.y0);
                ctx.clip();

                const flow = (t * 5.2) % 64;
                for (let sx = wf.x + 12; sx < wf.x + wf.w - 8; sx += 22) {
                    ctx.fillStyle = ((sx / 22) | 0) % 2 === 0
                        ? 'rgba(255, 255, 255, 0.38)'
                        : 'rgba(61, 255, 184, 0.30)';
                    for (let sy = wf.y0 - 64 + flow; sy < wf.y1; sy += 64) {
                        ctx.fillRect(sx, sy, 5, 34);
                    }
                }
                ctx.restore();

                // 3D glowing crest foam ring at top of waterfall
                const foamPulse = 1 + 0.14 * Math.sin(t * 0.14 + wf.x);
                ctx.fillStyle = 'rgba(225, 255, 255, 0.85)';
                ctx.beginPath();
                ctx.ellipse(wf.x + wf.w * 0.5, wf.y0 + 3, wf.w * 0.52, 7 * foamPulse, 0, 0, TAU);
                ctx.fill();
            }

            // 3. 3D-Shaded Starlight Holo-Palms across hills, sky islands & Finale Colonnade
            const palms = game.terrain.z2Palms || [];
            for (let i = 0; i < palms.length; i++) {
                const pt = palms[i];
                if (pt.x + 95 < view.x0 || pt.x - 95 > view.x1) continue;
                drawHoloPalm(ctx, pt.x, pt.y, pt.scale, t);
            }
        },

        drawLoops(ctx, game) {
            const view = game.view;
            const t = game.terrain.clock || 0;
            const ringWidth = 28;

            for (const L of game.terrain.loops) {
                const outer = L.r + ringWidth;
                if (L.cx + outer + 30 < view.x0 || L.cx - outer - 30 > view.x1) continue;

                const midR = L.r + ringWidth * 0.45;
                const bx = L.cx + EX_X;
                const by = L.cy + EX_Y;

                ctx.save();

                // 1. Receding 2.5D/3D Back Arch Ring (offset into Z-depth by EX_X, EX_Y)
                ctx.strokeStyle = '#140f46';
                ctx.lineWidth = ringWidth * 0.88;
                ctx.beginPath();
                ctx.arc(bx, by, midR, 0, TAU);
                ctx.stroke();

                ctx.strokeStyle = '#8c3dff';
                ctx.lineWidth = 4.5;
                ctx.beginPath();
                ctx.arc(bx, by, midR + ringWidth * 0.34, 0, TAU);
                ctx.stroke();

                // 2. Radial 3D Perspective Struts connecting Front Ring to Back Ring around 360°
                for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * TAU;
                    const c = Math.cos(a);
                    const s = Math.sin(a);
                    ctx.strokeStyle = (i % 2 === 0) ? '#00c8ff' : '#ff2a9d';
                    ctx.lineWidth = 2.6;
                    ctx.beginPath();
                    ctx.moveTo(L.cx + c * midR, L.cy + s * midR);
                    ctx.lineTo(bx + c * midR, by + s * midR);
                    ctx.stroke();
                }

                // 3. Front 3D Cylindrical Coaster Loop Tube
                // Outer dark casing
                ctx.strokeStyle = '#090726';
                ctx.lineWidth = ringWidth + 4;
                ctx.beginPath();
                ctx.arc(L.cx, L.cy, midR, 0, TAU);
                ctx.stroke();

                // Sapphire-violet 3D cylinder body
                const tubeGrad = ctx.createLinearGradient(L.cx - outer, L.cy - outer, L.cx + outer, L.cy + outer);
                tubeGrad.addColorStop(0, '#4458d8');
                tubeGrad.addColorStop(0.5, '#26186e');
                tubeGrad.addColorStop(1, '#140d44');
                ctx.strokeStyle = tubeGrad;
                ctx.lineWidth = ringWidth - 2;
                ctx.beginPath();
                ctx.arc(L.cx, L.cy, midR, 0, TAU);
                ctx.stroke();

                // Outer hot-magenta neon rim
                ctx.strokeStyle = '#ff2a9d';
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(L.cx, L.cy, L.r + ringWidth - 2, 0, TAU);
                ctx.stroke();

                // Inner electric-cyan + specular white running surface (exact 2D collision circle L.r!)
                ctx.strokeStyle = '#00f6ff';
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(L.cx, L.cy, L.r + 2.5, 0, TAU);
                ctx.stroke();

                ctx.strokeStyle = '#ebffff';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.arc(L.cx, L.cy, L.r + 0.8, 0, TAU);
                ctx.stroke();

                // 4. Animated Chasing Sonic Colors Speed Chevrons around the 3D Tube
                const spin = t * 0.045;
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * TAU - spin;
                    const px = L.cx + Math.cos(a) * midR;
                    const py = L.cy + Math.sin(a) * midR;
                    ctx.fillStyle = (i % 2 === 0) ? '#ffe640' : '#3dffb8';
                    ctx.beginPath();
                    ctx.arc(px, py, 3.6, 0, TAU);
                    ctx.fill();
                }

                // 5. 3D Base Anchor Pedestals at y = L.cy + L.r
                const baseY = L.cy + L.r;
                for (const side of [-1, 1]) {
                    const ax = L.cx + side * (L.r * 0.72);
                    const ped = ctx.createLinearGradient(ax - 18, baseY - 12, ax + 18, baseY + 6);
                    ped.addColorStop(0, '#5468e8');
                    ped.addColorStop(1, '#140e46');
                    ctx.fillStyle = ped;
                    ctx.beginPath();
                    ctx.roundRect(ax - 18, baseY - 10, 36, 14, 4);
                    ctx.fill();
                    ctx.strokeStyle = '#00f6ff';
                    ctx.lineWidth = 1.6;
                    ctx.stroke();
                }

                ctx.restore();
            }
        },

        drawTerrain(ctx, game) {
            const view = game.view;
            const t = game.terrain.clock || 0;
            const prismPat = getPrismPattern(ctx);
            const mainFloor = game.terrain.mainFloor;

            // Draw main expressway first, then elevated 2.5D/3D shelves & coaster highway
            if (mainFloor) {
                drawSurface25D(ctx, mainFloor, view, true, prismPat, t);
            }
            for (const f of game.terrain.floors) {
                if (f === mainFloor) continue;
                drawSurface25D(ctx, f, view, false, prismPat, t);
            }
        },

        drawForeground(ctx, game) {
            const view = game.view;
            const t = game.terrain.clock || 0;
            const mainFloor = game.terrain.mainFloor;

            ctx.save();

            // 1. Subtle translucent 2.5D front-curb neon sheen in foreground plane
            if (mainFloor) {
                const x0 = Math.max(mainFloor.x0, view.x0);
                const x1 = Math.min(mainFloor.x1, view.x1);
                if (x1 > x0) {
                    ctx.strokeStyle = 'rgba(0, 246, 255, 0.18)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    let penDown = false;
                    for (let x = x0; x <= x1; x += 12) {
                        if (isCoasterSpan(mainFloor, x)) {
                            penDown = false;
                            continue;
                        }
                        const y = mainFloor.f(x) + 3;
                        if (!penDown) { ctx.moveTo(x, y); penDown = true; }
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                }
            }

            // 2. Drifting Sonic Colors foreground Wisp-light motes (cyan / magenta / gold)
            for (let i = 0; i < 14; i++) {
                const span = view.x1 - view.x0;
                const wx = view.x0 + (((i * 211 + t * 0.9) % span + span) % span);
                const wy = view.y0 + 70 + ((i * 97 + Math.sin(t * 0.04 + i) * 28) % 360);
                const alpha = 0.25 + 0.3 * Math.sin(t * 0.08 + i * 1.4);
                ctx.fillStyle = (i % 3 === 0)
                    ? `rgba(0, 246, 255, ${alpha.toFixed(2)})`
                    : (i % 3 === 1)
                        ? `rgba(255, 42, 157, ${alpha.toFixed(2)})`
                        : `rgba(255, 230, 64, ${alpha.toFixed(2)})`;
                ctx.beginPath();
                ctx.arc(wx, wy, (i % 2 === 0) ? 2.4 : 1.7, 0, TAU);
                ctx.fill();
            }

            ctx.restore();
        },

        drawRadar(ctx, game) {
            const T = game.terrain;
            const z = T.z2;
            if (!z) return;

            const rx = 18;
            const ry = game.H - 96;
            const rw = 216;
            const rh = 54;
            const sx = (x) => rx + 8 + (x / T.endX) * (rw - 16);
            const sy = (y) => ry + 8 + ((y - 110) / 640) * (rh - 14);

            ctx.save();
            ctx.fillStyle = 'rgba(8, 10, 36, 0.78)';
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, 6);
            ctx.fill();
            ctx.stroke();

            ctx.font = 'bold 9px Courier New';
            ctx.fillStyle = '#8ef6ff';
            ctx.textAlign = 'left';
            ctx.fillText('STARLIGHT RESORT · ACT 2', rx + 8, ry + 11);

            // Lower Expressway trace
            ctx.strokeStyle = '#3dffb8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = 0; x <= T.endX; x += 150) {
                const px = sx(x), py = sy(z.mainSurf.f(x));
                if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();

            // Upper Starlight Coaster trace
            ctx.strokeStyle = '#ff2a9d';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = z.coasterSurf.x0; x <= z.coasterSurf.x1; x += 120) {
                const px = sx(x), py = sy(z.coasterSurf.f(x));
                if (x === z.coasterSurf.x0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();

            // 5 Holo-Loops on radar
            ctx.strokeStyle = '#ffe640';
            ctx.lineWidth = 1.2;
            for (const lp of T.loops) {
                ctx.beginPath();
                ctx.arc(sx(lp.cx), sy(lp.cy), Math.max(3.2, (lp.r / T.endX) * rw * 2.2), 0, TAU);
                ctx.stroke();
            }

            // Goal Post marker
            if (T.goalPost) {
                ctx.fillStyle = '#ffe640';
                ctx.fillRect(sx(T.goalPost.x) - 1.5, sy(T.goalPost.y) - 6, 3, 6);
            }

            // Blinking Scar dot
            const p = game.player;
            if (Math.floor((T.clock || 0) / 6) % 2 === 0) {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(sx(p.x), sy(p.y), 3, 0, TAU);
                ctx.fill();
            }

            ctx.restore();
        },
    });
})(typeof window !== 'undefined' ? window : globalThis);
