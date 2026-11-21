/** Real browser audio/channel behavior and the shipped Rosie hug event. */
'use strict';
const assert = require('assert');
const { createGameHarness } = require('./helpers/game_harness');
const CUES = { yeah: 'scarYeah', alright: 'scarAlright', yes: 'scarYes', outtaHere: 'scarOuttaHere' };
const FILES = { yeah: 'scar_yeah.wav', alright: 'scar_alright.wav', yes: 'scar_yes.wav', outtaHere: 'scar_outta_here.wav' };
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function rig(stage = 'palmtree') {
    const h = createGameHarness({ stage });
    const r = { h, time: 10000, sources: [], gains: [], media: [], failure: null, delayedEnd: false };
    h.sandbox.performance.now = () => r.time;
    function node(kind) {
        const n = { kind, disconnected: 0, stopped: 0, started: 0, gain: { value: 0 },
            connect() { if (r.failure === `${kind}Connect`) throw new Error('Device disconnected'); },
            disconnect() { this.disconnected++; },
            start() { if (r.failure === 'start') throw new Error('Playback unavailable'); this.started++; },
            stop() { this.stopped++; if (!r.delayedEnd && this.onended) this.onended(); },
        };
        (kind === 'source' ? r.sources : r.gains).push(n);
        return n;
    }
    r.context = { state: 'running', destination: {},
        createBufferSource() { if (r.failure === 'source') throw new Error('Audio access denied'); return node('source'); },
        createGain() { if (r.failure === 'gain') throw new Error('Gain unavailable'); return node('gain'); },
    };
    h.audio.ctx = r.context;
    for (const [cue, key] of Object.entries(CUES)) h.audio.buffers[key] = { cue };
    h.sandbox.Audio = function () {
        if (r.failure === 'mediaConstructor') throw new Error('Media access denied');
        this.paused = true; this.ended = false; this.currentTime = 0; this.plays = 0;
        this.pause = () => { this.paused = true; };
        this.play = () => {
            this.plays++;
            if (r.failure === 'mediaPlay') throw new Error('Media playback denied');
            this.paused = false;
            return r.failure === 'mediaRejected' ? Promise.reject(new Error('Autoplay denied')) : Promise.resolve();
        };
        r.media.push(this);
    };
    return r;
}

test('only supplied voice cues play, with one 2.5-second generic cooldown', () => {
    const r = rig(), a = r.h.audio;
    try {
        for (const cue of [null, undefined, '', 'YES', '__proto__', 'constructor', 'toString', Symbol('yes'), new String('yes')]) {
            assert.strictEqual(a.scarVoice(cue), false);
        }
        assert.strictEqual(r.sources.length, 0);
        assert.strictEqual(r.media.length, 0);
        assert.strictEqual(a.lastScarVoiceTime, -Infinity);
        for (const [cue, key] of Object.entries(CUES)) {
            assert.ok(a.sfxFiles[key].endsWith(FILES[cue]));
            assert.strictEqual(a.scarVoice(cue), true);
            assert.strictEqual(r.sources.at(-1).buffer.cue, cue);
            const count = r.sources.length;
            assert.strictEqual(a.scarVoice('yes'), false);
            r.time += 2499;
            assert.strictEqual(a.scarVoice('yeah'), false);
            assert.strictEqual(r.sources.length, count);
            r.time++;
        }
        assert.strictEqual(a.activeSources.size, 1);
    } finally { r.h.dispose(); }
});

test('hug acceptance bypasses cooldown and alternates only accepted yes/yeah calls', () => {
    const r = rig(), a = r.h.audio;
    try {
        assert.strictEqual(a.scarVoice('outtaHere'), true);
        const ordinary = r.sources.at(-1);
        assert.strictEqual(a.scarHug(), true);
        assert.strictEqual(r.sources.at(-1).buffer.cue, 'yes');
        assert(ordinary.stopped && ordinary.disconnected);
        a.enabled = false;
        assert.strictEqual(a.scarHug(), false);
        a.enabled = true;
        assert.strictEqual(a.scarHug(), true);
        assert.strictEqual(r.sources.at(-1).buffer.cue, 'yeah', 'muted attempts must not consume the alternation');
        assert.strictEqual(a.scarVoice('alright'), false, 'the accepted hug starts the ordinary voice cooldown');
        assert.strictEqual(a.scarHug(), true);
        assert.strictEqual(r.sources.at(-1).buffer.cue, 'yes');
        assert.strictEqual(a.activeSources.size, 1);
    } finally { r.h.dispose(); }
});

test('replaced and ended WebAudio voices disconnect without interrupting unrelated effects', () => {
    const r = rig(), a = r.h.audio;
    try {
        a.buffers.ring = { cue: 'ring' };
        assert.strictEqual(a.playWav('ring'), true);
        const ring = r.sources.at(-1);
        r.delayedEnd = true;
        for (let i = 0; i < 1000; i++) {
            assert.strictEqual(a.scarVoice(i % 2 ? 'yeah' : 'yes', { force: true }), true);
            assert.strictEqual(a.activeSources.size, 2, 'one effect and one voice must remain live');
        }
        assert(!ring.stopped && !ring.disconnected, 'voice replacement must preserve other effects');
        assert(r.sources.slice(1, -1).every(source => source.stopped && source.disconnected));
        assert(r.gains.slice(1, -1).every(gain => gain.disconnected));
        const current = a.scarVoiceEffect, voice = r.sources.at(-1), gain = r.gains.at(-1);
        r.sources[1].onended();
        assert.strictEqual(a.scarVoiceEffect, current, 'a stale end event cannot clear the replacement voice');
        voice.onended();
        assert.strictEqual(a.scarVoiceEffect, null);
        assert.strictEqual(a.activeSources.size, 1);
        assert(voice.disconnected && gain.disconnected);
        a.enabled = false;
        assert.strictEqual(a.activeSources.size, 0);
        assert(ring.stopped && ring.disconnected);
    } finally { r.h.dispose(); }
});

test('the general effect cap and mute release the dedicated voice as well', () => {
    const r = rig(), a = r.h.audio;
    try {
        a.scarHug();
        const voice = r.sources.at(-1);
        a.buffers.ring = { cue: 'ring' };
        for (let i = 0; i < 80; i++) a.playWav('ring');
        assert.strictEqual(a.scarVoiceEffect, null, 'evicting the oldest effect must clear a matching voice reference');
        assert(voice.stopped && voice.disconnected);
        a.scarHug();
        assert(a.activeSources.size <= 48);
        a.enabled = false;
        assert.strictEqual(a.scarVoiceEffect, null);
        assert.strictEqual(a.activeSources.size, 0);
        assert(r.sources.every(source => source.stopped && source.disconnected));
        assert(r.gains.every(gain => gain.disconnected));
    } finally { r.h.dispose(); }
});

test('fallback speech reuses one independent media voice and stops on mute or a decoded replacement', () => {
    const r = rig(), a = r.h.audio;
    try {
        a.ctx = null;
        for (let i = 0; i < 1000; i++) assert.strictEqual(a.scarVoice('alright', { force: true }), true);
        assert.strictEqual(r.media.length, 1, 'fallback speech must reuse a single media element');
        const voice = r.media[0];
        assert.strictEqual(voice.src, 'assets/sfx/scar_alright.wav');
        assert.strictEqual(a.fallbackVoices.length, 0, 'speech must not consume the ordinary sound pool');
        for (let i = 0; i < 20; i++) a.playWav('ring');
        assert(a.fallbackVoices.length <= 8);
        assert(r.media.length <= 9);
        a.enabled = false;
        assert(voice.paused && voice.currentTime === 0);
        assert(a.fallbackVoices.every(media => media.paused));
        const played = voice.plays;
        assert.strictEqual(a.scarVoice('yes', { force: true }), false);
        a.enabled = true;
        assert.strictEqual(voice.plays, played, 'unmuting must not replay old speech');
        a.ctx = r.context;
        assert.strictEqual(a.scarHug(), true);
        assert(voice.paused && voice.currentTime === 0, 'late decoded audio must replace, not overlap, the fallback voice');
        assert.strictEqual(r.media.length, 9);
        assert.strictEqual(a.activeSources.size, 1);
    } finally { r.h.dispose(); }
});

test('partial WebAudio failures clean every allocated node before the fallback', () => {
    for (const failure of ['source', 'gain', 'sourceConnect', 'gainConnect', 'start']) {
        const r = rig(), a = r.h.audio;
        try {
            r.failure = failure;
            assert.doesNotThrow(() => assert.strictEqual(a.scarHug(), true));
            assert.strictEqual(a.scarVoiceEffect, null, failure);
            assert.strictEqual(a.activeSources.size, 0, failure);
            assert(r.sources.every(source => source.disconnected), `${failure}: source leaked`);
            assert(r.gains.every(gain => gain.disconnected), `${failure}: gain leaked`);
            assert.strictEqual(r.media.length, 1);
            assert.strictEqual(r.media[0].plays, 1);
        } finally { r.h.dispose(); }
    }
});

test('suspended and interrupted contexts cannot queue speech for a later resume', () => {
    for (const state of ['suspended', 'interrupted', 'closed']) {
        const r = rig(), a = r.h.audio;
        try {
            r.context.state = state;
            assert.strictEqual(a.scarHug(), true);
            assert.strictEqual(r.sources.length, 0, `${state}: a decoded source must not wait in the audio timeline`);
            assert.strictEqual(r.media.length, 1);
            assert.strictEqual(r.media[0].src, 'assets/sfx/scar_yes.wav');
            assert.strictEqual(r.media[0].plays, 1);
            r.context.state = 'running';
            a.unlock();
            assert.strictEqual(r.sources.length, 0, 'resuming audio must not release an old voice cue');
            assert.strictEqual(r.media[0].plays, 1);
            assert.strictEqual(a.scarVoice('alright'), false, 'a resume must not bypass ordinary cooldown');
            assert.strictEqual(a.scarHug(), true);
            assert.strictEqual(r.sources.length, 1, 'only a new accepted event may start decoded speech');
            assert.strictEqual(r.sources[0].buffer.cue, 'yeah');
            assert(r.media[0].paused);
        } finally { r.h.dispose(); }
    }
});

test('unavailable media and denied audio are harmless, with no deferred speech replay', async () => {
    for (const failure of ['mediaConstructor', 'mediaPlay', 'mediaRejected']) {
        const r = rig(), a = r.h.audio;
        try {
            a.ctx = null; r.failure = failure;
            assert.doesNotThrow(() => assert.strictEqual(a.scarHug(), failure === 'mediaRejected'));
            await Promise.resolve();
            assert.strictEqual(a.activeSources.size, 0);
            assert.strictEqual(a.scarVoiceEffect, null);
            assert(r.media.length <= 1);
            a.enabled = false;
            assert(r.media.every(media => media.paused));
            const attempts = r.media[0]?.plays || 0;
            a.enabled = true;
            assert.strictEqual(r.media[0]?.plays || 0, attempts);
        } finally { r.h.dispose(); }
    }
    const h = createGameHarness({ audioContext: class { constructor() { throw new Error('Denied'); } } });
    try {
        h.sandbox.Audio = undefined;
        assert.doesNotThrow(() => h.audio.unlock());
        assert.strictEqual(h.audio.scarVoice('yes'), false);
        assert.strictEqual(h.audio.scarHug(), false);
        h.frame();
        assert.strictEqual(h.scheduledFrames.size, 1);
    } finally { h.dispose(); }
});

test('the real level hug callback speaks once at acceptance and stays quiet throughout the hold', () => {
    for (const decoded of [false, true]) {
        const r = rig('z2_act2'), h = r.h, g = h.game, a = h.audio;
        try {
            if (!decoded) a.ctx = null;
            g.titleCard = null; g.fadeAlpha = 0;
            const n = g.terrain.z2a2.reunion, p = g.player;
            n.met = n.noticed = true;
            p.place(n.x + 60, 0, n.y); p.facing = 1;
            let calls = 0;
            const hug = a.scarHug.bind(a);
            a.scarHug = () => { calls++; return hug(); };
            assert.strictEqual(a.scarVoice('alright'), true);
            for (let i = 0; i < 110 && n.hugPhase !== 'hold'; i++) h.frame();
            assert.strictEqual(n.hugPhase, 'hold');
            assert.strictEqual(calls, 1, 'physical hug acceptance must emit one Scar voice callback');
            if (decoded) assert.strictEqual(r.sources.at(-1).buffer.cue, 'yes');
            else assert.strictEqual(a.scarVoiceMedia.src, 'assets/sfx/scar_yes.wav');
            const spoken = decoded ? r.sources.length : a.scarVoiceMedia.plays;
            for (let i = 0; i < 300; i++) h.frame();
            assert.strictEqual(calls, 1, 'holding and nearby cooldown frames must not repeat the cue');
            assert.strictEqual(decoded ? r.sources.length : a.scarVoiceMedia.plays, spoken,
                'the hold must not allocate or replay speech');
            assert.strictEqual(h.scheduledFrames.size, 1);
        } finally { h.dispose(); }
    }
});

test('earning a life, releasing a real peelout and crossing the goal select the intended recordings', () => {
    for (const decoded of [false, true]) {
        const r = rig(), h = r.h, g = h.game, a = h.audio, p = g.player;
        try {
            if (!decoded) a.ctx = null;
            const currentCue = () => decoded ? r.sources.at(-1).buffer.cue : a.scarVoiceMedia.src;
            const expectedCue = cue => decoded ? cue : `assets/sfx/${FILES[cue]}`;
            g.titleCard = null; g.fadeAlpha = 0;
            const lives = p.lives;
            p.addLife();
            assert.strictEqual(p.lives, lives + 1);
            assert.strictEqual(currentCue(), expectedCue('yes'));
            r.time += 2500;
            h.dispatchWindow('keydown', { code: 'ArrowUp' });
            h.dispatchWindow('keydown', { code: 'Space' });
            h.frame();
            assert.strictEqual(p.state, 'PEELOUT');
            for (let i = 0; i < 15; i++) h.frame();
            h.dispatchWindow('keyup', { code: 'Space' });
            h.dispatchWindow('keyup', { code: 'ArrowUp' });
            h.frame();
            assert.strictEqual(p.state, 'RUNNING');
            assert(Math.abs(p.gsp) >= 8);
            assert.strictEqual(currentCue(), expectedCue('outtaHere'));
            r.time += 2500;
            const goal = g.terrain.goalPost;
            p.place(goal.x + 1, 0, goal.y);
            h.frame();
            assert(goal.spinning || goal.cleared, 'the real goal crossing must run the completion hook');
            assert.strictEqual(currentCue(), expectedCue('alright'));
            const spoken = decoded ? r.sources.length : a.scarVoiceMedia.plays;
            for (let i = 0; i < 20; i++) h.frame();
            assert.strictEqual(decoded ? r.sources.length : a.scarVoiceMedia.plays, spoken, 'a spinning goal must not repeat the voice');
        } finally { h.dispose(); }
    }
});

(async () => {
    console.log('\nScar voice channel');
    for (const { name, run } of tests) { await run(); console.log(`  PASS ${name}`); }
    console.log(`Scar voice: ${tests.length} groups passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
