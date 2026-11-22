/** Rosie's sanctuary behavior. Animation follows actual movement and player input. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RosieNPC = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    // Match Player.update's 250 ms catch-up ceiling, including standalone users.
    const MAX_CATCHUP_FRAMES = 15;
    function create(x = 13920, y = 560) {
        return { x, y, actorX: x, actorY: y, state: 'idle', facing: -1, animationClock: 0,
            met: false, timer: 0, grounded: true, vy: 0, age: 0, idleAge: 0,
            noticed: false, following: false, makingRoom: false, patrolPhase: null, patrolTarget: x, patrolOrigin: x, patrolPause: 0,
            actionTimer: 0, message: '', messageTimer: 0, reactionTimer: 0,
            talkCooldown: 0, jumpCooldown: 0, reactionCooldown: 0, chatIndex: 0,
            hugPhase: null, hugWait: 0, hugTimer: 0, heartTimer: 0, hugCooldown: 0, hugPlayerX: null,
            previousUp: false, previousJump: false, canTalk: false };
    }
    function say(n, message, duration = 140) { n.message = message; n.messageTimer = duration; }
    function gesture(n, duration = 30) {
        n.actionTimer = duration; n.animationClock = 0; n.patrolPhase = null; n.idleAge = 0;
    }
    function vertical(n, h) {
        if (n.grounded) { n.actorY = n.y; return; }
        n.actorY += n.vy * h;
        n.vy += .24 * h;
        if (n.actorY >= n.y && n.vy >= 0) { n.actorY = n.y; n.vy = 0; n.grounded = true; }
    }
    function move(n, target, speed, h, gap = 0) {
        const delta = target - n.actorX;
        if (Math.abs(delta) <= gap + .01) return 0;
        const dx = Math.sign(delta) * Math.min(speed * h, Math.abs(delta) - gap);
        const previousX = n.actorX;
        n.actorX = clamp(n.actorX + dx, n.x - 360, n.x + 180);
        const moved = n.actorX - previousX;
        if (moved) n.facing = Math.sign(moved);
        return moved;
    }
    function resetAfterRespawn(n) {
        const clean = create(n.x, n.y), met = n.met;
        const conversation = n.conversation;
        if (conversation && typeof conversation === 'object') {
            conversation.active = false; conversation.nodeId = null;
        }
        Object.assign(n, clean, { met, noticed: met });
        if (conversation && typeof conversation === 'object') n.conversation = conversation;
    }
    function cancelHug(n, cooldown = 120) {
        if (n.hugPhase || n.hugWait > 0) n.hugCooldown = Math.max(n.hugCooldown, cooldown);
        n.hugPhase = null; n.hugWait = 0; n.hugTimer = 0; n.heartTimer = 0; n.hugPlayerX = null;
        if (n.state === 'hug') { n.state = 'idle'; n.animationClock = 0; }
    }
    function step(n, p, input, h) {
        const events = { met: false, talk: false, hop: false };
        n.age += h;
        for (const name of ['timer', 'actionTimer', 'messageTimer', 'reactionTimer', 'talkCooldown', 'jumpCooldown', 'reactionCooldown', 'hugCooldown']) {
            n[name] = Math.max(0, n[name] - h);
        }
        const feet = p.y + (p.radii ? p.radii.height : 19);
        const onDeck = Math.abs(feet - n.y) < 130;
        let distance = p.x - n.actorX;
        const upEdge = !!input.upPressed || (!!input.up && !n.previousUp);
        const jumpEdge = !!input.jumpPressed && !n.previousJump;
        const dialogueOpen = !!input.dialogueOpen || !!(n.conversation && n.conversation.active);
        const hugPreference = n.conversation && n.conversation.memory && n.conversation.memory.hugPreference;
        n.previousUp = !!input.up;
        n.previousJump = !!(input.jumpHeld || input.jumpPressed);

        if (!n.noticed && Math.abs(distance) < 500 && Math.abs(feet - n.y) < 250) {
            n.noticed = true; gesture(n, 32); say(n, 'Scar! Over here!');
        }
        if (!n.met && p.x >= n.x - 220 && Math.abs(feet - n.y) < 80) {
            n.met = true; n.timer = 60; gesture(n, 30); say(n, 'You made it, Scar!');
            events.met = true;
        }
        n.canTalk = n.met && Math.abs(distance) <= 90 && Math.abs(feet - n.actorY) < 90 && n.grounded;
        if (!dialogueOpen && n.canTalk && upEdge && !input.jumpHeld && !input.jumpPressed && n.talkCooldown <= 0) {
            const lines = p.rings === 0
                ? ['Keep a ring for the road!', 'We made a good team!', 'Ready for the next adventure?']
                : ['Race you to the sign?', 'Those ruins were shaking!', "I'll stay close.", 'Ready for another adventure?'];
            say(n, lines[n.chatIndex++ % lines.length]);
            gesture(n, 36); n.talkCooldown = 120; n.reactionTimer = 36;
            events.talk = true;
        }
        if (!dialogueOpen && n.met && onDeck && Math.abs(distance) <= 150 && jumpEdge && n.grounded && n.jumpCooldown <= 0) {
            n.vy = -4.2; n.grounded = false; n.jumpCooldown = 100; n.reactionTimer = 40;
            if (n.messageTimer <= 0) say(n, 'Race you!', 95);
            n.patrolPhase = null; events.hop = true;
        }
        const playerSpeed = Math.abs(p.grounded ? p.gsp : p.xsp) || 0;
        if (n.met && onDeck && Math.abs(distance) <= 190 && playerSpeed >= 7 && n.reactionCooldown <= 0) {
            if (n.messageTimer <= 0) say(n, 'Whoa! Nice speed!', 100);
            n.reactionTimer = 28; n.reactionCooldown = 180;
        }

        let dx = 0;
        const playerMoving = playerSpeed > .25 || input.left || input.right;
        const hugTarget = p.x - p.facing * 18;
        const canHug = n.met && n.grounded && p.grounded && p.state === 'STANDING'
            && (p.facing === 1 || p.facing === -1) && Math.sign(distance) === p.facing
            && Math.abs(distance) > 4 && Math.abs(distance) <= 95 && Math.abs(feet - n.y) <= 12
            && playerSpeed <= .25 && Math.abs(p.xsp || 0) <= .25 && !p.hurtPose && !(p.invulnTimer > 0)
            && !p.crouching && !p.lookingUp && !playerMoving && !dialogueOpen
            && hugPreference !== 'ask' && hugPreference !== 'space'
            && !input.up && !input.upPressed && !input.talkPressed && !input.down && !input.jumpHeld && !input.jumpPressed
            && n.actionTimer <= 0 && n.reactionTimer <= 0
            && hugTarget >= n.x - 360 && hugTarget <= n.x + 180
            && (!n.hugPhase || Math.abs(p.x - n.hugPlayerX) <= 1);
        if (!canHug) cancelHug(n);
        else if (!n.hugPhase && n.hugCooldown <= 0) {
            n.hugWait += h;
            if (n.hugWait >= 30) {
                n.hugPhase = 'approach'; n.hugPlayerX = p.x;
                n.patrolPhase = null; n.idleAge = 0;
            }
        }
        if (dialogueOpen) {
            n.following = false; n.makingRoom = false; n.patrolPhase = null; n.idleAge = 0;
        }
        if (playerMoving) { n.patrolPhase = null; n.idleAge = 0; }
        if (!dialogueOpen && n.met && onDeck
            && (n.followAcrossStage || (p.x >= n.x - 450 && p.x <= n.x + 480))) {
            if (Math.abs(distance) > 100) n.following = true;
            if (Math.abs(distance) <= 48) n.following = false;
        } else n.following = false;
        if (!dialogueOpen && n.met && onDeck && Math.abs(distance) < 30) n.makingRoom = true;
        if (Math.abs(distance) >= 42 || !onDeck) n.makingRoom = false;
        if (n.hugPhase) {
            n.following = false; n.makingRoom = false; n.patrolPhase = null; n.idleAge = 0;
            if (n.hugPhase === 'approach') {
                dx = move(n, hugTarget, 1.2, h);
                if (Math.abs(n.actorX - hugTarget) < .01) {
                    n.hugPhase = 'hold'; n.hugTimer = 0; n.heartTimer = 0; events.hug = true;
                }
            }
            if (n.hugPhase === 'hold') {
                n.hugTimer += h; n.heartTimer += h;
                if (n.hugTimer >= 72) cancelHug(n, 480);
            }
        } else if (!dialogueOpen && n.actionTimer <= 0 && n.makingRoom) {
            n.patrolPhase = null; n.idleAge = 0;
            const away = -Math.sign(distance || -n.facing);
            let target = clamp(p.x + away * 42, n.x - 360, n.x + 180);
            // At a temple edge the outward side may have no room. Walk around
            // Scar to the open side rather than staying overlapped forever.
            if (Math.abs(target - p.x) < 40) target = clamp(p.x - away * 42, n.x - 360, n.x + 180);
            dx = move(n, target, 1.4, h);
        } else if (!dialogueOpen && n.actionTimer <= 0 && n.following) {
            n.patrolPhase = null; n.idleAge = 0;
            dx = move(n, clamp(p.x, n.x - 312, n.x + 228), 2.4, h, 48);
        } else if (!dialogueOpen && n.actionTimer <= 0 && n.grounded && !playerMoving) {
            n.idleAge += h;
            if (!n.patrolPhase && n.idleAge >= 240) {
                n.patrolOrigin = n.actorX;
                const direction = onDeck && Math.abs(distance) < 110 ? -Math.sign(distance || -n.facing) : n.facing;
                n.patrolTarget = clamp(n.actorX + direction * 38, n.x - 330, n.x + 150);
                n.patrolPhase = 'out';
            }
            if (n.patrolPhase === 'out') {
                dx = move(n, n.patrolTarget, .65, h);
                if (Math.abs(n.actorX - n.patrolTarget) < 1) { n.patrolPhase = 'pause'; n.patrolPause = 45; }
            } else if (n.patrolPhase === 'pause') {
                n.patrolPause -= h;
                if (n.patrolPause <= 0) n.patrolPhase = 'back';
            } else if (n.patrolPhase === 'back') {
                dx = move(n, n.patrolOrigin, .65, h);
                if (Math.abs(n.actorX - n.patrolOrigin) < 1) { n.patrolPhase = null; n.idleAge = 0; }
            }
        }
        vertical(n, h);
        const state = !n.grounded ? 'hop' : n.hugPhase === 'hold' ? 'hug' : dx ? 'walk' : n.actionTimer > 0 ? 'greet' : 'idle';
        if (state !== n.state) n.animationClock = 0;
        n.state = state;
        n.animationClock += dx ? Math.abs(dx) : h;
        distance = p.x - n.actorX;
        if (!dx && Math.abs(distance) > 3 && onDeck && Math.abs(distance) < 500) n.facing = Math.sign(distance);
        n.canTalk = !dialogueOpen && n.met && Math.abs(distance) <= 90 && Math.abs(feet - n.actorY) < 90 && n.grounded;
        return events;
    }
    function update(n, p, input = {}, h = 1) {
        const events = { met: false, talk: false, hop: false };
        if (!Number.isFinite(h) || h <= 0) return events;
        if (p.gameOver || p.state === 'DYING') { cancelHug(n); return events; }
        const frames = Math.min(h, MAX_CATCHUP_FRAMES);
        const steps = Math.max(1, Math.ceil(frames - 1e-6));
        for (let i = 0; i < steps; i++) {
            const result = step(n, p, i === 0 ? input : { ...input, jumpPressed: false, upPressed: false }, frames / steps);
            for (const name of Object.keys(events)) events[name] = events[name] || result[name];
            if (result.hug) events.hug = true;
        }
        return events;
    }
    function finish(n, h = 1) {
        if (!Number.isFinite(h) || h <= 0) return;
        const frames = Math.min(h, MAX_CATCHUP_FRAMES);
        const steps = Math.max(1, Math.ceil(frames - 1e-6));
        cancelHug(n);
        n.following = false; n.patrolPhase = null; n.actionTimer = 0; n.canTalk = false;
        n.messageTimer = Math.max(0, n.messageTimer - frames); n.reactionTimer = Math.max(0, n.reactionTimer - frames);
        for (let i = 0; i < steps; i++) vertical(n, frames / steps);
        n.state = n.grounded ? 'idle' : 'hop'; n.animationClock += frames;
    }
    return { create, update, resetAfterRespawn, finish, cancelHug };
});
