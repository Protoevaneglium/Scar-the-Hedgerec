/** Exercise actual rendering with complete, missing and delayed assets at every stage/checkpoint. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createGameHarness } = require('./helpers/game_harness');
const stress = process.argv.includes('--stress');
let frames = 0, views = 0, state = 0x5ca2026;
function random() { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }
function images(dir = 'assets') {
    const base = path.join(__dirname, '../public', dir), result = [];
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        const name = dir + '/' + entry.name;
        if (entry.isDirectory()) result.push(...images(name));
        else if (/\.(png|jpe?g)$/i.test(name)) result.push(name);
    }
    return result;
}
function assertState(h, label) {
    const g = h.game, p = g.player, t = g.terrain;
    for (const [name, value] of Object.entries({ x: p.x, y: p.y, xsp: p.xsp, ysp: p.ysp, gsp: p.gsp,
        angle: p.angle, camX: g.camX, camY: g.camY, stageTime: g.stageTime, score: p.score, rings: p.rings, lives: p.lives })) {
        assert(Number.isFinite(value), `${label}: nonfinite ${name}`);
    }
    assert(p.rings >= 0 && p.lives >= 0 && p.score >= 0, `${label}: negative reward counter`);
    assert.strictEqual(h.scheduledFrames.size, 1, `${label}: the runtime must keep exactly one animation callback`);
    const canvas = h.canvasStats();
    assert(!canvas.invalid && !canvas.restoreUnderflow && !canvas.unbalanced.length,
        `${label}: drawing state leaked: ${JSON.stringify(canvas)}`);
    assert(g.particles.length < 512 && g.scarTrail.length <= 6, `${label}: trail/particle growth`);
    assert(t.animals.length <= 48 && t.debris.length < 4096 && t.popups.length < 1024 && t.splashes.length < 128,
        `${label}: temporary objects grew without bound`);
}
function tick(h, dt = 1000 / 60, label = h.game.stageName) { h.frame(dt); frames++; assertState(h, label); }
console.log('\nAdversarial browser rendering and resource bounds');
for (const mode of ['complete', 'missing', 'delayed']) {
    const h = createGameHarness({ failImages: mode === 'missing' ? images() : [], deferImages: mode === 'delayed' });
    try {
        for (const stage of h.game.getStageOrder()) {
            const g = h.game;
            g.loadStage(stage, { skipTitleCard: true, skipFade: true });
            const surfaceCount = g.terrain.surfaces.length;
            for (let index = 0; index < g.terrain.checkpoints.length; index++) {
                g.gotoCheckpoint(index);
                for (const era of ['good_future', 'present', 'past']) for (const debug of [false, true]) {
                    g.terrain.timeEra = era; g.showDebug = debug;
                    tick(h, [1000 / 144, 1000 / 30, 0, 1000 / 60][views++ % 4], `${mode}/${stage}/checkpoint${index}/${era}`);
                }
                if (mode === 'delayed' && index === 2) h.flushImages();
            }
            g.showDebug = false;
            // Power-up, ball, debris, and high-speed sprite paths use the actual loaded atlases.
            g.resetCurrentStage();
            g.player.invincTimer = 600; g.player.shoesTimer = 600; g.player.shield = true;
            for (const collection of ['enemies', 'monitors', 'springs', 'bouncePoles', 'spinners', 'breakableFloors', 'rocks']) {
                const object = g.terrain[collection][0];
                if (!object || !Number.isFinite(object.x) || !Number.isFinite(object.y)) continue;
                g.player.place(object.x, 0, object.y);
                g.player.curl(); g.player.gsp = g.player.xsp = 10;
                tick(h); tick(h);
            }
            g.resetCurrentStage();
            const input = g.input;
            const budget = stress ? 3000 : 160;
            for (let frame = 0; frame < budget; frame++) {
                if (frame % 17 === 0) {
                    input.press('left', random() < .25); input.press('right', random() < .8);
                    input.press('down', random() < .3); input.press('up', random() < .1);
                }
                if (frame % 13 === 0) input.press('jump', random() < .65);
                if (frame % 71 === 0) g.cycleEra();
                if (frame % 223 === 0) g.gotoCheckpoint(Math.floor(random() * g.terrain.checkpoints.length));
                if (frame % 367 === 0) g.resetCurrentStage();
                if (g.player.gameOver) g.resetCurrentStage(true);
                tick(h, [1000 / 30, 1000 / 144, 1000 / 60, 50, 0, 5, 125][frame % 7], `${mode}/${stage}/seed${state >>> 0}/frame${frame}`);
            }
            for (const key of ['left', 'right', 'up', 'down', 'jump']) input.press(key, false);
            g.resetCurrentStage();
            assert.strictEqual(g.terrain.surfaces.length, surfaceCount, `${stage}: reset leaked collision surfaces`);
            g.player.lives = 1; g.player.die();
            for (let frame = 0; frame < 220; frame++) tick(h, 1000 / 30, `${mode}/${stage}/death${frame}`);
            assert(g.player.gameOver, `${stage}: death sequence must finish even when assets fail`);
            input.actions.push({ type: 'reset' }); tick(h);
            assert(!g.player.gameOver && g.player.lives === 3, `${stage}: reset must recover from game over`);
            if (mode === 'delayed') h.flushImages();
            console.log(`  ✓ ${mode}: ${stage}, all checkpoints/eras, power-ups, jittered controls and game-over recovery`);
        }
    } finally { h.dispose(); }
}
console.log(`  Render adversarial checks passed: ${frames} frames, ${views} checkpoint views; seed 0x5ca2026${stress ? ' (stress)' : ''}.`);
