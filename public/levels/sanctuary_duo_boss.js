/** Sanctuary Duet: armored partners, telegraphed shots and Rosie's real tag assist. */
(function (root, factory) {
    'use strict';
    const E = root.SonicEngine || (typeof require === 'function' ? require('../sonic-engine.js') : null);
    const NPC = root.RosieNPC || (typeof require === 'function' ? require('./rosie_npc.js') : null);
    const api = factory(E, NPC);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SanctuaryDuoBoss = api;
})(typeof window !== 'undefined' ? window : globalThis, function (E, NPC) {
    'use strict';
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const TAU = Math.PI * 2;
    const emit = (player, event, value) => { if (typeof player.emit === 'function') player.emit(event, value); };

    function member(id, x, floorY, delay) {
        return { id, species: id, x, y: floorY, baseX: x, facing: -1, hp: 6, maxHP: 6,
            state: 'guard', stateAge: 0, timer: delay, cycle: 0, shell: true,
            openTimer: 0, flashTimer: 0, openings: 0, nextShot: 0,
            aimX: x - 200, aimY: floorY - 20, reserved: false };
    }
    function create(_terrain, options = {}) {
        const config = { left: 1000, right: 2460, floorY: 560, triggerX: 1000, ...options };
        const ally = NPC.create(config.right, config.floorY);
        Object.assign(ally, { actorX: config.left - 70, met: true, noticed: true, canTalk: false,
            assistCooldown: 0, assistPhase: null, assistTarget: null, assistTimer: 0,
            assistCount: 0, dodgeCooldown: 0, message: "Let's crack those shells together!", messageTimer: 180 });
        return { kind: 'sanctuaryDuo', config, left: config.left, right: config.right, floorY: config.floorY,
            triggerX: config.triggerX, x: (config.left + config.right) / 2, y: config.floorY,
            active: false, defeated: false, hidden: false, hp: 12, maxHP: 12, state: 'dormant',
            age: 0, stateAge: 0, timer: 0, members: [
                member('crocodile', config.left + 420, config.floorY, 75),
                member('crawfish', config.left + 820, config.floorY, 190),
            ], ally, projectiles: [], effects: [], ringPickups: [], queuedAssist: 0,
            autoAssistTimer: 120, previousTalk: false, awaitingRespawn: false, playerRespawnSerial: null,
            previousPlayerX: null, previousPlayerY: null, victoryAwarded: false };
    }
    function say(ally, text, duration = 110) { ally.message = text; ally.messageTimer = duration; }
    function enter(m, state, timer, player) {
        m.state = state; m.stateAge = 0; m.timer = timer; m.nextShot = 0;
        if (player) { m.facing = player.x < m.x ? -1 : 1; m.aimX = player.x; m.aimY = player.y; }
    }
    function burst(b, x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            const angle = i / count * TAU;
            b.effects.push({ x, y, vx: Math.cos(angle) * (1.4 + i % 3 * .5),
                vy: Math.sin(angle) * 1.8 - .8, life: 26, maxLife: 26, r: i % 2 ? 2 : 4, color });
        }
        if (b.effects.length > 128) b.effects.splice(0, b.effects.length - 128);
    }
    function moveAlly(n, target, speed, h, b, gap = 0) {
        const delta = target - n.actorX;
        if (Math.abs(delta) <= gap) return false;
        const dx = Math.sign(delta) * Math.min(speed * h, Math.abs(delta) - gap);
        const lo = b.active ? b.left + 30 : b.left - 90;
        // Enter the combat gate on foot when Rosie starts outside it; clamping
        // must not jump her from the waiting spot to the interior boundary.
        n.actorX = clamp(n.actorX + dx, Math.min(lo, n.actorX), Math.max(b.right - 30, n.actorX));
        n.facing = Math.sign(dx) || n.facing;
        return !!dx;
    }
    function ringPool(terrain, b) {
        // Retry the same collectible objects; neither retries nor refills append a new wave.
        const existing = terrain.rings.filter(r => r.duoRing);
        b.ringPickups = Array.from({ length: 8 }, (_, slot) => {
            const ring = existing[slot] || { duoRing: true };
            const positions = [b.left + 100, b.left + 134, b.left + 530, b.left + 564,
                b.left + 660, b.left + 694, b.right - 90, b.right - 56];
            Object.assign(ring, { x: positions[slot], y: b.floorY - 28,
                collected: false, respawnTimer: null });
            if (!existing[slot]) terrain.rings.push(ring);
            return ring;
        });
        for (const ring of terrain.rings) if (ring.x >= b.left && ring.x <= b.right) ring.collected = false;
    }
    function reset(terrain, b, player) {
        const oldAlly = b.ally, conversation = oldAlly.conversation;
        const fresh = create(terrain, b.config);
        Object.assign(oldAlly, fresh.ally);
        if (conversation) { conversation.active = false; conversation.nodeId = null; oldAlly.conversation = conversation; }
        Object.assign(b, fresh, { ally: oldAlly });
        b.playerRespawnSerial = player.respawnSerial || 0;
    }
    function activate(terrain, b, player) {
        b.active = true; b.state = 'intro'; b.stateAge = 0; b.timer = 100;
        b.playerRespawnSerial = player.respawnSerial || 0;
        b.previousPlayerX = player.x; b.previousPlayerY = player.y;
        ringPool(terrain, b);
        const checkpoint = (terrain.checkpoints || []).find(cp => cp.x >= b.left + 50 && cp.x <= b.left + 200);
        if (checkpoint) { terrain.activeCheckpoint = checkpoint; emit(player, 'checkpoint', checkpoint); }
        say(b.ally, 'I crack the armor. You land the hit!', 170);
        emit(player, 'duoStart', b);
    }
    function fire(b, m, shot, player) {
        const kind = m.id === 'crocodile' ? 'note' : 'claw';
        // Offsets match the packed, feet-anchored source poses at their 2x display scale.
        const x = m.x + m.facing * (kind === 'note' ? 28 : 52), y = m.y - (kind === 'note' ? 82 : 44);
        m.lastMuzzle = { x, y };
        let angle = Math.atan2(m.aimY - y, m.aimX - x);
        if (kind === 'note') angle += (shot - 1) * .16;
        else angle += shot ? .11 : -.11;
        const speed = kind === 'note' ? 3.4 : 4.6;
        b.projectiles.push({ kind, ownerId: m.id, x, y, px: x, py: y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: kind === 'note' ? 8 : 11,
            age: 0, life: kind === 'note' ? 240 : 190, returning: false, spin: shot % 2 ? -1 : 1 });
        if (b.projectiles.length > 24) b.projectiles.splice(0, b.projectiles.length - 24);
        burst(b, x, y, kind === 'note' ? '#ffd773' : '#a5efff', 4);
        emit(player, 'bossAttack', { boss: b, member: m, kind });
    }
    function tickMember(b, m, player, h) {
        m.flashTimer = Math.max(0, m.flashTimer - h);
        if (m.hp <= 0) return;
        m.stateAge += h; m.timer -= h;
        if (m.state === 'guard') {
            m.facing = player.x < m.x ? -1 : 1;
            const targetX = m.baseX + Math.sin((b.age + (m.id === 'crawfish' ? 70 : 0)) * .015) * 28;
            m.x += clamp(targetX - m.x, -.75 * h, .75 * h);
        }
        if (m.state === 'attack') {
            const count = m.id === 'crocodile' ? 3 : 2, spacing = m.id === 'crocodile' ? 18 : 28;
            while (m.nextShot < count && m.stateAge >= m.nextShot * spacing) fire(b, m, m.nextShot++, player);
        }
        if (m.state === 'open') {
            m.openTimer = Math.max(0, m.openTimer - h);
            if (m.openTimer <= 0) { m.shell = true; enter(m, 'guard', 95, player); }
            return;
        }
        if (m.timer > 0 || (m.state === 'recover' && m.reserved)) return;
        switch (m.state) {
            case 'guard': enter(m, 'warn', m.id === 'crocodile' ? 62 : 72, player); break;
            case 'warn': enter(m, 'attack', m.id === 'crocodile' ? 62 : 65); break;
            case 'attack': enter(m, 'recover', 175); break;
            case 'hurt': enter(m, 'guard', 90, player); break;
            default: m.cycle++; enter(m, 'guard', 95, player); break;
        }
    }
    function segmentDistance(x, y, x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0, den = dx * dx + dy * dy;
        const t = den ? clamp(((x - x0) * dx + (y - y0) * dy) / den, 0, 1) : 0;
        return Math.hypot(x - x0 - t * dx, y - y0 - t * dy);
    }
    function projectiles(terrain, b, player, h) {
        const oldX = b.previousPlayerX == null ? player.x : b.previousPlayerX;
        const oldY = b.previousPlayerY == null ? player.y : b.previousPlayerY;
        for (let i = b.projectiles.length - 1; i >= 0; i--) {
            const p = b.projectiles[i];
            p.px = p.x; p.py = p.y; p.age += h; p.life -= h;
            const owner = b.members.find(m => m.id === p.ownerId);
            if (p.kind === 'claw' && p.age >= 65 && owner && owner.hp > 0) {
                p.returning = true;
                const angle = Math.atan2(owner.y - 48 - p.y, owner.x - p.x);
                p.vx = Math.cos(angle) * 5.1; p.vy = Math.sin(angle) * 5.1;
            }
            p.x += p.vx * h; p.y += p.vy * h;
            if (p.returning && segmentDistance(owner.x, owner.y - 48, p.px, p.py, p.x, p.y) < 23) {
                b.projectiles.splice(i, 1); continue;
            }
            // Swept relative motion catches fast dashes as well as fast projectiles.
            const hit = segmentDistance(0, 0, p.px - oldX, p.py - oldY, p.x - player.x, p.y - player.y)
                < p.r + (player.curled ? 12 : 14);
            if (hit) {
                terrain.hurtPlayer(player, p.x);
                burst(b, p.x, p.y, '#ffe5b2', 5); b.projectiles.splice(i, 1);
                if (player.state === E.STATE.DYING || player.gameOver) break;
                continue;
            }
            if (p.life <= 0 || p.x < b.left - 120 || p.x > b.right + 120
                || p.y > b.floorY + 20 || p.y < b.floorY - 600 || (owner && owner.hp <= 0)) b.projectiles.splice(i, 1);
        }
        b.previousPlayerX = player.x; b.previousPlayerY = player.y;
    }
    function startAssist(b, target) {
        const n = b.ally;
        n.assistTarget = target.id; n.assistPhase = 'approach'; n.assistTimer = 240;
        target.reserved = true; target.timer = Math.max(target.timer, 180);
        b.queuedAssist = 0; say(n, 'Cover me!');
    }
    function cancelAssist(b) {
        const n = b.ally, target = b.members.find(m => m.id === n.assistTarget);
        if (target) target.reserved = false;
        n.assistPhase = null; n.assistTarget = null; n.assistTimer = 0;
    }
    function crackArmor(b, m, player) {
        m.reserved = false; m.shell = false; m.openTimer = 120; m.openings++;
        enter(m, 'open', 120);
        b.ally.assistCount++; b.ally.assistCooldown = 150;
        b.ally.assistPhase = 'recover'; b.ally.assistTimer = 45; b.autoAssistTimer = 75;
        say(b.ally, 'NOW, SCAR!', 110);
        burst(b, m.x, m.y - 42, '#ffbee7', 18);
        emit(player, 'duoAssist', { boss: b, member: m, ally: b.ally });
    }
    function allyStep(b, player, h) {
        const n = b.ally;
        const previousX = n.actorX;
        n.age += h; n.messageTimer = Math.max(0, n.messageTimer - h);
        n.assistCooldown = Math.max(0, n.assistCooldown - h);
        n.dodgeCooldown = Math.max(0, n.dodgeCooldown - h);
        b.queuedAssist = Math.max(0, b.queuedAssist - h); b.autoAssistTimer = Math.max(0, b.autoAssistTimer - h);
        n.canTalk = false; n.following = false; n.hugPhase = null;
        if (!n.grounded) {
            n.actorY += n.vy * h; n.vy += .24 * h;
            if (n.actorY >= b.floorY) { n.actorY = b.floorY; n.vy = 0; n.grounded = true; }
        }
        if (n.grounded && n.dodgeCooldown <= 0 && b.projectiles.some(p => Math.abs(p.x - n.actorX) < 85
            && Math.abs(p.y - n.actorY + 25) < 45)) {
            n.grounded = false; n.vy = -4.3; n.dodgeCooldown = 100;
        }
        let moved = false;
        if (n.assistPhase) {
            n.assistTimer -= h;
            const target = b.members.find(m => m.id === n.assistTarget);
            if (!target || target.hp <= 0 || n.assistTimer <= 0) cancelAssist(b);
            else if (n.assistPhase === 'approach') {
                moved = moveAlly(n, target.x - target.facing * 28, 6.5, h, b, 24);
                if (Math.abs(target.x - n.actorX) <= 55) {
                    n.assistPhase = 'strike'; n.assistTimer = 12;
                    if (n.grounded) { n.grounded = false; n.vy = -3.2; }
                    n.facing = Math.sign(target.x - n.actorX) || 1;
                }
            } else if (n.assistPhase === 'strike') {
                if (n.assistTimer <= h + 1e-6) crackArmor(b, target, player);
            } else {
                moved = moveAlly(n, player.x - player.facing * 65, 4.2, h, b, 20);
                if (n.assistTimer <= h + 1e-6) cancelAssist(b);
            }
        }
        if (!n.assistPhase) {
            // A recovery that ends this step may already have moved her once.
            if (!moved) moved = moveAlly(n, player.x - (player.facing || 1) * 65, 4.2, h, b, 22);
            const available = b.members.filter(m => m.hp > 0 && m.state === 'recover' && m.flashTimer <= 0)
                .sort((a, c) => Math.abs(a.x - n.actorX) - Math.abs(c.x - n.actorX));
            if (n.assistCooldown <= 0 && !b.members.some(m => m.openTimer > 0)
                && available.length && (b.queuedAssist > 0 || b.autoAssistTimer <= 0)) startAssist(b, available[0]);
        }
        const state = !n.grounded ? 'hop' : n.assistPhase === 'strike' ? 'greet' : moved ? 'walk' : 'idle';
        if (state !== n.state) n.animationClock = 0;
        n.state = state;
        n.animationClock += moved ? Math.abs(n.actorX - previousX) : h;
        if (!moved && !n.assistPhase) n.facing = player.x < n.actorX ? -1 : 1;
    }
    function bounce(player, m, armor) {
        const direction = player.x < m.x ? -1 : 1;
        player.state = E.STATE.AIRBORNE; player.groundSurface = null;
        player.xsp = direction * (armor ? 4.8 : 3.8); player.ysp = armor ? -5.4 : -6.7;
        player.jumped = false; player.springTwirl = false;
        player.dropDashCharging = false; player.dropDashCharge = 0; player.dropDashReady = false;
        player.x = m.x + direction * 50;
    }
    function hitMember(terrain, b, m, player) {
        if (!b.active || b.state !== 'battle' || m.hp <= 0) return;
        if (Math.abs(player.x - m.x) > 42 + player.radii.width || Math.abs(player.y - (m.y - 67)) > 58 + player.radii.height) return;
        if (player.curled && !player.hurtPose) {
            if (m.shell || m.openTimer <= 0 || m.flashTimer > 0) {
                bounce(player, m, true);
                if (b.ally.messageTimer <= 0) say(b.ally, 'Wait for my shell break!');
                return;
            }
            m.hp = Math.max(0, m.hp - 1); m.shell = true; m.openTimer = 0; m.flashTimer = 65;
            b.hp = b.members.reduce((sum, enemy) => sum + enemy.hp, 0);
            enter(m, m.hp ? 'hurt' : 'defeated', 45);
            if (!m.hp) { m.shell = false; m.defeatAge = b.age; b.projectiles = b.projectiles.filter(p => p.ownerId !== m.id); }
            burst(b, m.x, m.y - 42, '#ffed93', 18);
            bounce(player, m, false); emit(player, 'bossHit', b);
            if (b.hp === 0 && !b.victoryAwarded) {
                b.victoryAwarded = true; b.defeated = true; b.state = 'victory'; b.stateAge = 0;
                b.projectiles.length = 0; cancelAssist(b); nudgeAllyAfterVictory(b);
                player.score = (player.score || 0) + 3000;
                if (terrain.popups) terrain.popups.push({ x: player.x, y: b.floorY - 125, text: 'TEAM VICTORY! +3000', life: 150 });
                emit(player, 'bossDefeat', b);
            }
        } else terrain.hurtPlayer(player, m.x);
    }
    function nudgeAllyAfterVictory(b) {
        // Keep the existing actor position inside the NPC's home range. The level
        // may advance that home as Scar walks to the capsule; victory cannot teleport her.
        b.ally.x = clamp(b.ally.actorX + 180, b.left + 360, b.right);
        b.ally.y = b.floorY; b.ally.assistCooldown = 0;
        b.ally.hugCooldown = 180; say(b.ally, 'We did it! Free the animals!', 150);
    }
    function tickEffects(b, h) {
        for (let i = b.effects.length - 1; i >= 0; i--) {
            const e = b.effects[i]; e.life -= h; e.x += e.vx * h; e.y += e.vy * h; e.vy += .04 * h;
            if (e.life <= 0) b.effects.splice(i, 1);
        }
    }
    function step(terrain, b, player, h, input) {
        if (player.gameOver || player.state === E.STATE.DYING) {
            b.awaitingRespawn = !b.defeated; b.queuedAssist = 0; b.previousTalk = !!input.talkPressed;
            if (b.ally.conversation) b.ally.conversation.active = false;
            return;
        }
        const serial = player.respawnSerial || 0;
        if (!b.defeated && (b.awaitingRespawn || (b.playerRespawnSerial !== null && b.playerRespawnSerial !== serial))) reset(terrain, b, player);
        if (b.defeated) { b.age += h; b.stateAge += h; tickEffects(b, h); return; }
        const talk = !!input.talkPressed;
        if (talk && !b.previousTalk && b.active) {
            if (b.ally.assistCooldown <= 0 && !b.ally.assistPhase) { b.queuedAssist = 300; say(b.ally, 'Ready! Wait for their attack.'); }
            else if (b.ally.messageTimer <= 0) say(b.ally, "I'm getting ready!");
        }
        b.previousTalk = talk;
        if (!b.active && player.x >= b.triggerX) activate(terrain, b, player);
        if (!b.active) {
            b.ally.animationClock += h; b.ally.messageTimer = Math.max(0, b.ally.messageTimer - h);
            b.ally.facing = player.x < b.ally.actorX ? -1 : 1;
            return;
        }
        const x = clamp(player.x, b.left + 22, b.right - 22);
        if (x !== player.x) { player.x = x; player.xsp = player.gsp = 0; }
        b.age += h; b.stateAge += h;
        tickEffects(b, h);
        for (const ring of b.ringPickups) if (ring.collected) {
            if (ring.respawnTimer === null) ring.respawnTimer = 360;
            ring.respawnTimer -= h;
            if (ring.respawnTimer <= 0) { ring.collected = false; ring.respawnTimer = null; }
        }
        if (b.state === 'intro') {
            b.timer -= h;
            const oldX = b.ally.actorX, moved = moveAlly(b.ally, b.left + 85, 2.5, h, b);
            const state = moved ? 'walk' : 'greet';
            if (state !== b.ally.state) b.ally.animationClock = 0;
            b.ally.state = state;
            b.ally.animationClock += moved ? Math.abs(b.ally.actorX - oldX) : h;
            b.ally.messageTimer = Math.max(0, b.ally.messageTimer - h);
            if (b.timer <= 0) { b.state = 'battle'; b.stateAge = 0; }
            return;
        }
        for (const m of b.members) tickMember(b, m, player, h);
        projectiles(terrain, b, player, h);
        if (player.gameOver || player.state === E.STATE.DYING) { b.awaitingRespawn = true; return; }
        allyStep(b, player, h);
        for (const m of b.members) {
            hitMember(terrain, b, m, player);
            if (b.defeated || player.gameOver || player.state === E.STATE.DYING) break;
        }
    }
    function update(terrain, player, h = 1, input = {}) {
        const b = terrain && terrain.boss;
        if (!b || b.kind !== 'sanctuaryDuo' || !Number.isFinite(h) || h <= 0) return;
        const frames = Math.min(15, h), steps = Math.max(1, Math.ceil(frames - 1e-6));
        // Keep a held input latched across internal steps; it cannot re-arm itself.
        for (let i = 0; i < steps; i++) step(terrain, b, player, frames / steps, input || {});
    }
    return { create, update };
});
