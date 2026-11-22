'use strict';
const assert = require('assert');
const { createGameHarness } = require('./helpers/game_harness');
function test(name, run) { run(); console.log('  PASS ' + name); }
function snapshot(g) { return JSON.stringify({ stage: g.stageName, time: g.stageTime, clock: g.terrain.clock,
    player: [g.player.x, g.player.y, g.player.state, g.player.deathTimer, g.player.score, g.player.rings, g.player.lives],
    boss: g.terrain.boss, clear: g.actClear }); }
console.log('\nAndroid host lifecycle adversarial checks');
test('repeated native pause/resume freezes every act and requires an explicit fresh resume', () => {
    const h = createGameHarness();
    try {
        h.sandbox.sonicGame = h.game;
        for (const stage of h.game.getCampaignStages()) {
            const g = h.game; g.loadStage(stage, { skipTitleCard: true, skipFade: true });
            for (const phase of ['running', 'dying', 'finishing']) {
                g.resetCurrentStage(); g.titleCard = null; g.fadeAlpha = 0;
                if (phase === 'dying') g.player.die();
                if (phase === 'finishing') { if (g.terrain.goalPost) g.terrain.goalPost.cleared = true; else g.terrain.capsule.cleared = true; h.frame(); }
                g.render(); // Synchronize derived dialogue context before testing suspension.
                g.input.press('right', true, 'key:ArrowRight'); g.input.press('jump', true, 'key:Space');
                g.input.actions.push({ type: 'reset' });
                h.sandbox.ScarHost.pause();
                assert(g.paused && !g.input.jumpHeld && !g.input.right && !g.input.actions.length);
                const before = snapshot(g);
                for (let n = 0; n < 12; n++) {
                    h.sandbox.ScarHost.pause(); h.sandbox.ScarHost.resume(); h.frame(n % 2 ? 1000 : 1000 / 144);
                    assert.strictEqual(snapshot(g), before, `${stage}/${phase}: no background progress or stale reset`);
                }
                h.dispatchWindow('keydown', { code: 'Space', repeat: true }); h.frame();
                assert(g.paused && !g.input.jumpHeld, 'an old keyboard repeat cannot resume or jump');
                h.dispatchWindow('keyup', { code: 'Space' });
                h.elements.get('btn-resume').dispatch('click');
                h.frame(1000 / 60);
                assert(!g.paused && h.scheduledFrames.size === 1 && Number.isFinite(g.player.x));
            }
        }
    } finally { h.dispose(); }
});
test('Android Back closes a conversation, pauses once, then requests exit without disabling controller focus', () => {
    const h = createGameHarness({ stage: 'z2_act2' }), g = h.game;
    try {
        h.sandbox.sonicGame = g; g.titleCard = null; g.fadeAlpha = 0;
        g.player.place(13860, 0, 560); g.player.invulnTimer = 0;
        const n = g.terrain.z2a2.reunion;
        Object.assign(n, { met: true, noticed: true, actorX: 13920, actorY: 560, grounded: true, timer: 0 });
        g.handleRosieConversation('talk'); assert(g.rosieConversationView().open);
        assert.strictEqual(h.sandbox.ScarHost.back(), false); assert(!g.rosieConversationView().open && !g.paused);
        assert.strictEqual(h.sandbox.ScarHost.back(), false); assert(g.paused && g.input.gamepadFocused);
        assert.strictEqual(h.sandbox.ScarHost.back(), true); assert(g.input.gamepadFocused);
        h.elements.get('btn-resume').dispatch('click'); h.frame();
        assert(!g.paused && h.scheduledFrames.size === 1);
    } finally { h.dispose(); }
});
test('duplicate background callbacks preserve an interrupted intro without skipping its Start gate', () => {
    const h = createGameHarness();
    try {
        h.sandbox.INTRO_ACTIVE = true; h.sandbox.sonicGame = null;
        const video = h.sandbox.document.getElementById('intro-video'); video.paused = false;
        h.sandbox.document.querySelectorAll = () => [video];
        h.sandbox.ScarHost.pause(); h.sandbox.ScarHost.pause(); assert(video.paused);
        h.sandbox.ScarHost.resume(); assert(!video.paused && h.sandbox.INTRO_ACTIVE);
        video.paused = true; h.sandbox.ScarHost.pause(); h.sandbox.ScarHost.resume();
        assert(video.paused, 'a held title or deliberately paused intro cannot autoplay after resume');
    } finally { h.dispose(); }
});
test('focus, autoplay callbacks, audio toggles and input cannot restart paused music or effects', () => {
    const h = createGameHarness();
    try {
        h.game.setPaused(true);
        for (let n = 0; n < 20; n++) {
            h.audio.unlock(); h.audio.playBGM(); h.audio.restartBGM(); h.audio.enabled = false; h.audio.enabled = true;
            h.dispatchWindow('focus'); h.dispatchWindow('pointerdown');
            h.audio.bgm.dispatch('canplay'); h.audio.bgm.dispatch('ended');
            h.audio.playWav('jump'); h.audio.scarVoice('alright', { force: true });
            assert(h.audio.bgm.paused && h.audio.fallbackVoices.every(v => v.paused));
            assert.strictEqual(h.audio.activeSources.size, 0);
            assert(!h.audio.scarVoiceMedia || h.audio.scarVoiceMedia.paused);
        }
        assert(h.audio.enabled, 'pausing must preserve the selected Audio ON preference');
        let resumes = 0;
        h.audio.ctx = { state: 'suspended', resume() { this.state = 'running'; resumes++; return Promise.resolve(); } };
        h.game.setPaused(false); assert(!h.audio.bgm.paused);
        assert.strictEqual(resumes, 1, 'Resume must restore an OS-suspended effects context without needing a second tap');
    } finally { h.dispose(); }
});
