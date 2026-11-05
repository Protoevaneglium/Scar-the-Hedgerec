/** Kitt Bazooka: deterministic, frame-scaled boss logic and an animated sprite rig. */
(function (root) {
    'use strict';
    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    let atlas = null;
    if (typeof root.Image === 'function') {
        atlas = new root.Image();
        atlas.src = 'assets/kitt_boss_poses.png';
    }
    // The supplied reference was converted into six transparent, equally sized poses.
    const FRAMES = [
        { x: 0, y: 0, w: 512, h: 512, facing: 1, anchorX: 220, anchorY: 480 },
        { x: 512, y: 0, w: 512, h: 512, facing: 1, anchorX: 220, anchorY: 480, muzzleX: 478, muzzleY: 205 },
        { x: 1024, y: 0, w: 512, h: 512, facing: -1, anchorX: 280, anchorY: 480, muzzleX: 48, muzzleY: 195 },
        { x: 0, y: 512, w: 512, h: 512, facing: -1, anchorX: 265, anchorY: 480, muzzleX: 90, muzzleY: 135 },
        { x: 512, y: 512, w: 512, h: 512, facing: 1, anchorX: 250, anchorY: 480 },
        { x: 1024, y: 512, w: 512, h: 512, facing: 1, anchorX: 250, anchorY: 480 },
    ];

    function create(terrain, config) {
        const c = Object.assign({ left: 8000, right: 9400, floorY: 560, triggerX: 8000, spawnX: 9030 }, config);
        return {
            kind: 'kittBazooka', config: c, x: c.spawnX, y: c.floorY,
            left: c.left, right: c.right, floorY: c.floorY, triggerX: c.triggerX,
            hp: 8, maxHP: 8, phase: 1, active: false, defeated: false, hidden: false,
            state: 'dormant', timer: 0, stateAge: 0, age: 0, cycle: 0,
            facing: -1, flashTimer: 0, recoil: 0, muzzleFlash: 0, hitStop: 0,
            projectiles: [], effects: [], nextShot: 0, awaitingRespawn: false,
            ringPickups: [], ringRespawnFrames: 420,
            aimX: c.left + 240, aimY: c.floorY - 30,
        };
    }

    function enter(b, state, duration, player) {
        b.state = state; b.timer = duration; b.stateAge = 0; b.nextShot = 0;
        if (player) {
            b.facing = player.x < b.x ? -1 : 1;
            b.aimX = player.x; b.aimY = player.y;
        }
    }

    function burst(b, x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            const a = i * TAU / count + b.age * 0.07;
            const speed = 1.2 + (i % 3) * 0.7;
            b.effects.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 0.7,
                life: 24 + i % 5, maxLife: 28, color, r: i % 2 ? 3 : 5 });
        }
    }

    function arenaRingPosition(b, slot) {
        if (slot < 6) {
            const side = slot < 3 ? -1 : 1;
            let center = b.x + side * 210;
            // If Kitt backs up to a gate, fit both arcs on his open side.
            if (center - 36 < b.left + 55 || center + 36 > b.right - 55) center = b.x - side * 330;
            center = clamp(center, b.left + 90, b.right - 90);
            return { x: center + (slot % 3 - 1) * 36, y: b.floorY - (slot % 3 === 1 ? 56 : 32) };
        }
        const left = slot < 8, offset = (slot % 2) * 36;
        const x = left
            ? b.left + (b.x < b.left + 250 ? 390 : 60) + offset
            : b.right - (b.x > b.right - 250 ? 390 : 60) - offset;
        return { x, y: b.floorY - 28 };
    }

    function prepareArenaRings(terrain, b) {
        const existing = terrain.rings.filter(r => r.bossRing);
        b.ringPickups = Array.from({ length: 10 }, (_, slot) => {
            const ring = existing[slot] || { bossRing: true };
            Object.assign(ring, arenaRingPosition(b, slot), { collected: false, respawnTimer: null });
            if (!existing[slot]) terrain.rings.push(ring);
            burst(b, ring.x, ring.y, '#ffe38a', 3);
            return ring;
        });
    }

    function replenishArenaRings(b, h) {
        b.ringPickups.forEach((ring, slot) => {
            if (!ring.collected) return;
            if (ring.respawnTimer === null) ring.respawnTimer = b.ringRespawnFrames;
            ring.respawnTimer -= h;
            if (ring.respawnTimer > 0) return;
            Object.assign(ring, arenaRingPosition(b, slot), { collected: false, respawnTimer: null });
            burst(b, ring.x, ring.y, '#ffe38a', 3);
        });
    }

    function gait(b) {
        return b.state === 'stalk' || b.state === 'rush' ? Math.sin(b.age * .24) : Math.sin(b.age * .045) * .25;
    }

    // Anchor every launch to its pose's actual missile tip or bazooka mouth.
    // These coordinates are shared by projectile physics, warning beams and flashes.
    function muzzlePoint(b, kind, shot = 1) {
        const index = kind === 'rocket' ? (b.state === 'rocketWarn' ? 2 : 3) : 1;
        const f = FRAMES[index], scale = 248 / 512;
        const mirror = b.facing === f.facing ? 1 : -1;
        const clawOffset = kind === 'rocket' ? 0 : [-31, 0, 33, 0][shot % 4];
        return {
            x: b.x - b.facing * b.recoil + (f.muzzleX - f.anchorX) * scale * mirror,
            y: b.y - Math.abs(gait(b)) * 4 + (f.muzzleY + clawOffset - f.anchorY) * scale,
        };
    }

    function fire(b, kind, shot, player) {
        const rocket = kind === 'rocket';
        b.recoil = rocket ? 12 : 5; b.muzzleFlash = rocket ? 12 : 6;
        const { x, y } = muzzlePoint(b, kind, shot);
        b.lastMuzzle = { x, y };
        // Aim is locked during the warning, giving the player a fair dodge window.
        let a = Math.atan2(b.aimY - y, b.aimX - x);
        if (!rocket) a += (shot - 1) * 0.10;
        const speed = rocket ? (b.phase === 2 ? 4.4 : 3.8) : (b.phase === 2 ? 6 : 5.2);
        b.projectiles.push({ kind, x, y, px: x, py: y, vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed, speed, r: rocket ? 12 : 7, age: 0, life: 260,
            reflected: false, trail: [], tracking: rocket ? 22 : 0 });
        burst(b, x, y, rocket ? '#ffce53' : '#fff0ab', rocket ? 9 : 4);
        if (player.emit) player.emit('bossAttack', { boss: b, kind });
    }

    function damageBoss(terrain, b, player, x, y) {
        if (b.flashTimer > 0 || b.defeated || !b.active || b.state === 'intro') return false;
        b.hp = Math.max(0, b.hp - 1); b.flashTimer = 65; b.hitStop = 6;
        burst(b, x, y, '#fff3b0', 18);
        if (terrain.debris) terrain.debris.push({ kind: 'explosion', x, y, vx: 0, vy: 0, life: 20, maxLife: 20 });
        if (player.emit) player.emit('bossHit', b);
        if (b.hp <= 0) {
            b.defeated = true; b.projectiles.length = 0;
            enter(b, 'defeat', 180);
            if (player.emit) player.emit('bossDefeat', b);
            player.score = (player.score || 0) + 1500;
            if (terrain.popups) terrain.popups.push({ x: b.x, y: b.y - 180, text: 'KITT DEFEATED! +1500', life: 150 });
        } else {
            b.phase = b.hp <= 4 ? 2 : 1;
            enter(b, 'hurt', 42);
        }
        return true;
    }

    function distanceToSegment(x, y, x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0;
        const den = dx * dx + dy * dy;
        const t = den ? clamp(((x - x0) * dx + (y - y0) * dy) / den, 0, 1) : 0;
        return Math.hypot(x - x0 - dx * t, y - y0 - dy * t);
    }

    function stepProjectiles(terrain, b, player, h) {
        for (let i = b.projectiles.length - 1; i >= 0; i--) {
            const p = b.projectiles[i];
            p.px = p.x; p.py = p.y; p.age += h; p.life -= h;
            if (p.reflected) {
                const a = Math.atan2(b.y - 76 - p.y, b.x - p.x);
                p.vx = Math.cos(a) * 9; p.vy = Math.sin(a) * 9;
            } else if (p.age < p.tracking) {
                const a = Math.atan2(player.y - p.y, player.x - p.x);
                p.vx += (Math.cos(a) * p.speed - p.vx) * 0.028 * h;
                p.vy += (Math.sin(a) * p.speed - p.vy) * 0.028 * h;
            }
            p.x += p.vx * h; p.y += p.vy * h;
            if (Math.floor(p.age) % 3 === 0) {
                p.trail.push({ x: p.x, y: p.y });
                if (p.trail.length > 8) p.trail.shift();
            }
            if (p.reflected && distanceToSegment(b.x, b.y - 76, p.px, p.py, p.x, p.y) < 58) {
                damageBoss(terrain, b, player, p.x, p.y);
                if (b.defeated) return; // Defeat clears the projectile array.
                burst(b, p.x, p.y, '#7bffeb', 8); b.projectiles.splice(i, 1); continue;
            }
            const hit = !p.reflected && distanceToSegment(player.x, player.y, p.px, p.py, p.x, p.y) < p.r + 16;
            if (hit) {
                if (player.curled && !player.hurtPose) {
                    p.reflected = true; p.life = 180; p.tracking = 0;
                    p.x += (b.x > player.x ? 1 : -1) * 18;
                    burst(b, player.x, player.y, '#77fff1', 9);
                    if (player.emit) player.emit('missileReflect', p);
                } else {
                    if (!(player.invulnTimer > 0) && !(player.invincTimer > 0)) terrain.hurtPlayer(player, p.x);
                    burst(b, p.x, p.y, '#ffb644', 8); b.projectiles.splice(i, 1);
                }
                continue;
            }
            if (p.life <= 0 || p.y > b.floorY - p.r || p.y < b.floorY - 580 || p.x < b.left - 120 || p.x > b.right + 120) {
                burst(b, p.x, Math.min(p.y, b.floorY - 10), p.reflected ? '#77fff1' : '#ffae47', 8);
                b.projectiles.splice(i, 1);
            }
        }
    }

    function update(terrain, player, h) {
        let b = terrain.boss;
        if (!b || b.kind !== 'kittBazooka' || !(h > 0)) return;
        b.age += h;
        for (let i = b.effects.length - 1; i >= 0; i--) {
            const e = b.effects[i]; e.life -= h; e.x += e.vx * h; e.y += e.vy * h; e.vy += 0.06 * h;
            if (e.life <= 0) b.effects.splice(i, 1);
        }
        if (player.state === 'DYING' || player.gameOver) { b.awaitingRespawn = !b.defeated; return; }
        // A retry restarts the encounter, including projectiles and health, at the checkpoint.
        if (b.awaitingRespawn && !b.defeated) {
            b = terrain.boss = create(terrain, b.config);
        }
        if (!b.active && player.x >= b.triggerX && !b.defeated) {
            // Stage the entrance within the camera view instead of firing from off screen.
            b.x = clamp(player.x + 310, b.left + 190, b.right - 180);
            b.active = true; enter(b, 'intro', 110, player);
            prepareArenaRings(terrain, b);
            const arenaCheckpoints = (terrain.checkpoints || []).filter(cp => cp.x > b.left + 22 && cp.x < b.right - 22);
            const checkpoint = arenaCheckpoints.reduce((best, cp) => !best
                || Math.abs(cp.x - b.left - 130) < Math.abs(best.x - b.left - 130) ? cp : best, null)
                || { name: 'Kitt Bazooka Arena', x: b.left + 130, y: b.floorY };
            terrain.activeCheckpoint = checkpoint;
            if (player.emit) player.emit('checkpoint', checkpoint);
        }
        if (!b.active) return;
        b.flashTimer = Math.max(0, b.flashTimer - h);
        b.recoil = Math.max(0, b.recoil - h * 0.8);
        b.muzzleFlash = Math.max(0, b.muzzleFlash - h);
        if (b.defeated) {
            b.stateAge += h; b.timer -= h;
            if (Math.floor(b.stateAge / 15) !== Math.floor((b.stateAge - h) / 15) && b.timer > 25) {
                burst(b, b.x + Math.sin(b.stateAge * 2) * 58, b.y - 75 + Math.cos(b.stateAge) * 50, '#ffca5d', 12);
            }
            if (b.stateAge > 90) { b.x += 3.5 * h; b.y -= 1.9 * h; }
            b.hidden = b.timer <= 0;
            return;
        }
        replenishArenaRings(b, h);
        // The arena is closed only once Scar has entered it; defeat releases both gates.
        const px = clamp(player.x, b.left + 22, b.right - 22);
        if (px !== player.x) { player.x = px; player.xsp = 0; player.gsp = 0; }
        if (b.hitStop > 0) { b.hitStop = Math.max(0, b.hitStop - h); return; }
        b.timer -= h; b.stateAge += h;
        if (b.state === 'stalk') {
            b.facing = player.x < b.x ? -1 : 1;
            const desired = clamp(player.x - b.facing * 260, b.left + 160, b.right - 160);
            b.x += clamp(desired - b.x, -2.4 * h, 2.4 * h);
        }
        if (b.state === 'clawFire') {
            const count = b.phase === 2 ? 4 : 3;
            while (b.nextShot < count && b.stateAge >= b.nextShot * 17) fire(b, 'claw', b.nextShot++, player);
        }
        if (b.state === 'rocketFire' && b.nextShot === 0) { fire(b, 'rocket', 0, player); b.nextShot = 1; }
        if (b.state === 'rush') {
            b.x += b.facing * (b.phase === 2 ? 5 : 4) * h;
            b.x = clamp(b.x, b.left + 150, b.right - 150);
        }
        if (b.timer <= 0) {
            const fast = b.phase === 2 ? 0.80 : 1;
            switch (b.state) {
                case 'intro': enter(b, 'stalk', 130, player); break;
                case 'stalk':
                    if (b.cycle % 3 === 2) enter(b, 'rushWarn', 55 * fast, player);
                    else if (b.cycle % 3 === 1) enter(b, 'rocketWarn', 80 * fast, player);
                    else enter(b, 'clawWarn', 58 * fast, player);
                    break;
                case 'clawWarn': enter(b, 'clawFire', 70 * fast); break;
                case 'rocketWarn': enter(b, 'rocketFire', 20); break;
                case 'rushWarn': enter(b, 'rush', 60 * fast); break;
                case 'clawFire': case 'rocketFire': case 'rush':
                    b.cycle++; enter(b, 'reload', b.phase === 2 ? 100 : 135); break;
                case 'hurt': enter(b, 'reload', 90); break;
                default: enter(b, 'stalk', 100 * fast, player); break;
            }
        }
        stepProjectiles(terrain, b, player, h);
        if (b.defeated || player.state === 'DYING') return;
        const dx = player.x - b.x, dy = player.y - (b.y - 73);
        if (Math.abs(dx) < 62 && Math.abs(dy) < 77 && b.state !== 'intro') {
            const attack = (player.curled && !player.hurtPose) || player.invincTimer > 0;
            if (attack) {
                if (damageBoss(terrain, b, player, player.x, player.y)) {
                    player.state = 'AIRBORNE'; player.groundSurface = null;
                    player.ysp = -7.3; player.xsp = (dx < 0 ? -1 : 1) * 5.4;
                    player.jumped = false; player.springTwirl = false;
                }
            } else if (!(player.invulnTimer > 0) && !(player.invincTimer > 0)) terrain.hurtPlayer(player, b.x);
        }
    }

    function ellipse(ctx, x, y, rx, ry, fill, stroke = '#20192d') {
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill();
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    }
    function polygon(ctx, points, fill) {
        ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#20192d'; ctx.lineWidth = 2; ctx.stroke();
    }

    /** A complete articulated fallback keeps the battle readable if the image cannot load. */
    function drawRig(ctx, b) {
        const walk = b.state === 'stalk' || b.state === 'rush' ? Math.sin(b.age * 0.22) : 0;
        ctx.scale(b.facing, 1);
        ctx.strokeStyle = '#74219a'; ctx.lineWidth = 18; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-22, -30); ctx.bezierCurveTo(-112, -40, -110, -95, -65, -80 + Math.sin(b.age * 0.06) * 10); ctx.stroke();
        ctx.strokeStyle = '#261832'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-88, -48); ctx.lineTo(-100, -58); ctx.stroke();
        ellipse(ctx, -28 - walk * 6, -13, 22, 17, '#20212e'); ellipse(ctx, 29 + walk * 6, -12, 26, 17, '#20212e');
        ctx.fillStyle = '#ffc83d'; ctx.fillRect(-46 - walk * 6, -30, 37, 10); ctx.fillRect(9 + walk * 6, -28, 38, 10);
        ellipse(ctx, 0, -70, 53, 62, '#813c9e'); ellipse(ctx, 6, -64, 36, 43, '#ffdaaa');
        polygon(ctx, [[-46, -124], [-18, -98], [-25, -18], [-65, -6], [-49, -62]], '#e9422d');
        polygon(ctx, [[24, -117], [48, -127], [65, -23], [30, -10], [23, -57]], '#cb3229');
        ctx.fillStyle = '#171b23'; ctx.fillRect(-35, -58, 77, 11); ctx.fillStyle = '#fbc438'; ctx.fillRect(-3, -61, 25, 18); ctx.fillStyle = '#20212e'; ctx.fillRect(3, -57, 14, 10);
        ctx.save(); ctx.translate(b.state === 'rocketWarn' ? 33 : 5, b.state === 'rocketWarn' ? -130 : -159);
        ctx.fillStyle = '#778042'; ctx.fillRect(-71, -22, 150, 28); ctx.strokeStyle = '#242132'; ctx.lineWidth = 3; ctx.strokeRect(-71, -22, 150, 28);
        ctx.fillStyle = '#ffc831'; ctx.fillRect(44, -22, 22, 28); ctx.fillStyle = '#292830'; ctx.fillRect(52, -22, 8, 28);
        ellipse(ctx, 80, -8, 10, 20, '#787083'); ellipse(ctx, 83, -8, 6, 14, '#14171d');
        ctx.fillStyle = '#4d5230'; ctx.fillRect(10, -41, 34, 14); ellipse(ctx, 45, -35, 7, 11, '#e83d2d'); ctx.restore();
        ellipse(ctx, 0, -133, 37, 31, '#8438a1');
        polygon(ctx, [[-32, -144], [-35, -181], [-6, -158]], '#a340a4'); polygon(ctx, [[12, -158], [35, -181], [33, -143]], '#a340a4');
        polygon(ctx, [[-28, -150], [-29, -169], [-16, -155]], '#ff8aac'); polygon(ctx, [[19, -155], [30, -169], [28, -149]], '#ff8aac');
        polygon(ctx, [[-31, -136], [-57, -127], [-31, -119], [-46, -110], [-11, -112], [20, -109], [49, -120], [31, -126], [48, -139], [20, -133]], '#ffe0b7');
        ellipse(ctx, -8, -139, 11, 8, '#fff9e9'); ellipse(ctx, 14, -141, 11, 8, '#fff9e9');
        ellipse(ctx, -1, -139, 2.5, 5, '#121620', null); ellipse(ctx, 20, -140, 2.5, 5, '#121620', null);
        polygon(ctx, [[0, -133], [15, -134], [8, -127]], '#e93432');
        ctx.strokeStyle = '#351b2d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-2, -119); ctx.quadraticCurveTo(12, -109, 24, -123); ctx.stroke();
        polygon(ctx, [[-20, -106], [10, -110], [24, -99], [1, -92], [11, -65], [-9, -74], [-17, -93], [-35, -83]], '#ffcf32');
        ctx.save(); ctx.translate(49, -136); ctx.rotate(b.state.includes('claw') ? 0 : Math.sin(b.age * 0.04) * 0.09);
        ellipse(ctx, 8, 3, 26, 16, '#833aa0'); ellipse(ctx, 28, 2, 13, 19, '#ffc839');
        for (let i = 0; i < 3; i++) {
            const yy = -12 + i * 12;
            polygon(ctx, [[33, yy], [62, yy - 2], [76, yy + 3], [62, yy + 8], [33, yy + 8]], '#d5d5e0');
            ctx.fillStyle = '#ed3b2f'; ctx.fillRect(57, yy - 1, 8, 8);
        }
        ctx.restore();
    }

    function poseIndex(b) {
        if (b.defeated) return 5;
        if (b.state === 'hurt') return 4;
        if (b.state === 'rocketFire') return 3;
        if (b.state === 'rocketWarn') return 2;
        if (b.state === 'clawWarn' || b.state === 'clawFire') return 1;
        return 0;
    }

    function drawMissile(ctx, p, clock) {
        for (let i = 0; i < p.trail.length; i++) {
            const t = p.trail[i]; ctx.globalAlpha = (i + 1) / p.trail.length * 0.33;
            ellipse(ctx, t.x, t.y, p.kind === 'rocket' ? 7 : 4, p.kind === 'rocket' ? 7 : 4,
                p.reflected ? '#6affee' : '#ffbc47', null);
        }
        ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
        const s = p.kind === 'rocket' ? 1.6 : 1;
        ctx.scale(s, s);
        polygon(ctx, [[-15, -5], [6, -5], [15, 0], [6, 5], [-15, 5]], p.reflected ? '#c1fff6' : '#dfe4ef');
        ctx.fillStyle = p.reflected ? '#00d9c0' : '#f34331'; ctx.fillRect(1, -5, 7, 10);
        polygon(ctx, [[-12, -5], [-19, -10], [-17, 0], [-19, 10], [-12, 5]], '#625a7c');
        polygon(ctx, [[-17, -3], [-25 - Math.sin(clock) * 4, 0], [-17, 3]], '#ffd448');
        ctx.restore();
    }

    function draw(ctx, b, game) {
        if (!b || b.kind !== 'kittBazooka') return;
        ctx.save();
        if (b.active && !b.defeated) {
            for (const x of [b.left + 5, b.right - 5]) {
                ctx.strokeStyle = 'rgba(255,211,58,.6)'; ctx.lineWidth = 5;
                ctx.setLineDash([14, 9]); ctx.lineDashOffset = -b.age;
                ctx.beginPath(); ctx.moveTo(x, b.floorY); ctx.lineTo(x, b.floorY - 260); ctx.stroke();
                ctx.setLineDash([]);
            }
            if (b.state === 'rocketWarn' || b.state === 'clawWarn') {
                const pulse = 0.35 + 0.3 * Math.sin(b.age * 0.22);
                const muzzle = muzzlePoint(b, b.state === 'rocketWarn' ? 'rocket' : 'claw');
                ctx.strokeStyle = `rgba(255,235,112,${pulse})`; ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]);
                ctx.beginPath(); ctx.moveTo(muzzle.x, muzzle.y); ctx.lineTo(b.aimX, b.aimY); ctx.stroke(); ctx.setLineDash([]);
                ctx.strokeStyle = '#ffe06d'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(b.aimX, b.aimY, 18 + Math.sin(b.age * .16) * 3, 0, TAU); ctx.stroke();
            }
        }
        for (const p of b.projectiles) drawMissile(ctx, p, b.age);
        if (!b.hidden) {
            const step = gait(b);
            ellipse(ctx, b.x, b.floorY + 2, 84, 12, 'rgba(32,15,49,.24)', null);
            ctx.save();
            ctx.translate(b.x - b.facing * b.recoil, b.y - Math.abs(step) * 4);
            if (b.flashTimer > 0 && Math.floor(b.flashTimer / 3) % 2 === 0) ctx.globalAlpha = .40;
            if (b.defeated) ctx.rotate(Math.sin(b.stateAge * .13) * .13);
            if (atlas && atlas.complete && atlas.naturalWidth >= 1536 && atlas.naturalHeight >= 1024) {
                const f = FRAMES[poseIndex(b)];
                ctx.scale(b.facing === f.facing ? 1 : -1, 1);
                // The combat silhouette stays fixed while walk, aim and recoil animate the art.
                ctx.rotate(b.state === 'reload' ? Math.sin(b.age * .10) * .035 : (b.state === 'stalk' || b.state === 'rush' ? step * .018 : 0));
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(atlas, f.x, f.y, f.w, f.h, -f.anchorX * 248 / 512, -f.anchorY * 248 / 512, 248, 248);
            } else drawRig(ctx, b);
            ctx.restore();
            if (b.muzzleFlash > 0 && b.lastMuzzle) {
                const { x, y } = b.lastMuzzle;
                ellipse(ctx, x, y, b.muzzleFlash * 2, b.muzzleFlash, '#fff6a0', null);
            }
            if (b.state === 'reload' && !b.defeated) {
                if (game.ui) game.ui.text(ctx, 'RELOADING — STRIKE!', b.x, b.y - 244, 14, '#79ffe1', 'center');
                else {
                    ctx.font = 'italic bold 14px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#79ffe1';
                    ctx.fillText('RELOADING — STRIKE!', b.x, b.y - 244);
                }
            }
        }
        for (const e of b.effects) {
            ctx.globalAlpha = clamp(e.life / e.maxLife, 0, 1);
            ellipse(ctx, e.x, e.y, e.r, e.r, e.color, null);
        }
        ctx.restore();
    }

    function drawHUD(ctx, b, game) {
        if (!b || !b.active || (b.hidden && b.defeated)) return;
        const width = Math.min(360, game.W - 48), x = (game.W - width) / 2, y = game.H - 76;
        ctx.save();
        const plate = (px, py, w, h, fill) => {
            ctx.beginPath(); ctx.moveTo(px + 8, py); ctx.lineTo(px + w, py);
            ctx.lineTo(px + w - 8, py + h); ctx.lineTo(px, py + h); ctx.closePath();
            ctx.fillStyle = fill; ctx.fill();
        };
        // Keep the arena overhead clear; the compact gauge sits above the control hints.
        plate(x + 2, y + 3, width, 43, 'rgba(0,9,30,.5)');
        plate(x, y, width, 43, 'rgba(5,23,55,.94)');
        plate(x + 3, y, 9, 43, b.phase === 2 ? '#ff725e' : '#19c8f4');
        plate(x + 11, y, width - 11, 2, '#73e9ff');
        ctx.font = 'italic 900 15px Arial, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
        ctx.fillText('KITT BAZOOKA', x + 21, y + 19);
        ctx.font = 'bold 9px Arial, sans-serif'; ctx.textAlign = 'right';
        ctx.fillStyle = b.defeated ? '#79ffe1' : b.phase === 2 ? '#ff9d82' : '#91d6ff';
        ctx.fillText(b.defeated ? 'DEFEATED' : b.phase === 2 ? 'OVERDRIVE' : 'BOSS BATTLE', x + width - 15, y + 17);
        const cellW = (width - 39) / b.maxHP;
        for (let i = 0; i < b.maxHP; i++) {
            const cellX = x + 20 + i * cellW;
            plate(cellX, y + 26, cellW - 3, 10, i < b.hp ? (b.phase === 2 ? '#ff7952' : '#ffcf34') : '#284060');
            if (i < b.hp) plate(cellX + 2, y + 27, cellW - 7, 2, '#fff5c0');
        }
        const hints = {
            intro: 'SPIN TO RETURN MISSILES • JUMP TO STRIKE', stalk: 'KEEP MOVING • WATCH HIS HANDS',
            clawWarn: 'MISSILE CLAWS CHARGING — GET READY', clawFire: 'JUMP OR SPIN TO RETURN MISSILES',
            rocketWarn: 'BAZOOKA LOCKED — MOVE FROM THE TARGET', rocketFire: 'ROCKET AWAY! SPIN TO RETURN IT',
            rushWarn: 'KITT IS ABOUT TO RUSH — JUMP!', rush: 'JUMP OVER KITT',
            reload: 'RELOADING! JUMP INTO KITT TO STRIKE', hurt: 'NICE HIT! KEEP THE PRESSURE ON',
            defeat: 'GATES OPEN • JUMP ON THE CAPSULE SWITCH',
        };
        const hint = hints[b.state];
        if (hint) {
            const danger = ['clawWarn', 'rocketWarn', 'rushWarn'].includes(b.state);
            const opportunity = b.state === 'reload' || b.defeated;
            ctx.font = 'italic bold 10px Arial, sans-serif';
            const hintWidth = Math.min(game.W - 48, Math.max(width, ctx.measureText(hint).width + 36));
            plate((game.W - hintWidth) / 2, y - 25, hintWidth, 20, 'rgba(5,23,55,.9)');
            ctx.textAlign = 'center';
            ctx.fillStyle = opportunity ? '#79ffe1' : danger ? '#ffdf63' : '#e3f6ff';
            ctx.fillText(hint, game.W / 2, y - 11);
        }
        ctx.restore();
    }

    const api = { create, update, draw, drawHUD, frames: FRAMES, muzzlePoint };
    root.KittBoss = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
