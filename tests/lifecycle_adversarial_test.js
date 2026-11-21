/** Fault injection and seeded interruption tests for the shipped browser runtime. */
'use strict';
const assert = require('assert');
const { createGameHarness } = require('./helpers/game_harness');
const stages = ['palmtree', 'z1_act2', 'z1_act3', 'z2_act1', 'z2_act2', 'test'];
function test(label, fn) { fn(); console.log(`  ✓ ${label}`); }
function at(h, timestamp) {
    const [id, callback] = h.scheduledFrames.entries().next().value;
    h.scheduledFrames.delete(id); callback(timestamp);
    assert.strictEqual(h.scheduledFrames.size, 1, 'exactly one animation callback must remain scheduled');
}
function healthy(h) {
    const g = h.game, p = g.player;
    for (const [name, value] of Object.entries({ x:p.x,y:p.y,xsp:p.xsp,ysp:p.ysp,gsp:p.gsp,
        angle:p.angle,camX:g.camX,camY:g.camY,time:g.stageTime,fade:g.fadeAlpha })) {
        assert(Number.isFinite(value), `${g.stageName}: ${name} must remain finite`);
    }
    assert(g.fadeAlpha >= 0 && g.fadeAlpha <= 1);
    assert(p.lives >= 0 && p.rings >= 0 && p.score >= 0);
    assert.strictEqual(h.scheduledFrames.size, 1);
}
console.log('\nAdversarial browser lifecycle');

test('denied audio initialization and broken media playback cannot disable game controls', () => {
    const h = createGameHarness({ audioContext: class { constructor() { throw new Error('Audio denied'); } } });
    try {
        assert.doesNotThrow(() => h.dispatchWindow('keydown', { code:'ArrowRight' }));
        assert(h.game.input.right, 'input must still register when constructing audio is denied');
        const bgm = h.elements.get('bgm');
        bgm.setAttribute('src', 'assets/level1.mp3'); bgm.paused = true;
        bgm.play = () => { throw new Error('Media unavailable'); };
        assert.doesNotThrow(() => h.audio.playBGM());
        h.sandbox.Audio = function () { throw new Error('Audio disabled'); };
        assert.strictEqual(h.audio.playWav('jump'), false);
        h.audio.ctx = { createOscillator() { throw new Error('Context interrupted'); },
            createBuffer() { throw new Error('Context interrupted'); } };
        assert.doesNotThrow(() => h.audio.tone('sine',440,660,.1));
        assert.doesNotThrow(() => h.audio.noise(.1,440));
        h.frame(); healthy(h);
    } finally { h.dispose(); }
});

test('pending and failed sound decodes do not multiply on every keyboard event', () => {
    const h = createGameHarness(), pending = new Map(), counts = new Map();
    try {
        h.audio.sfxData = { jump:new ArrayBuffer(8), ring:new ArrayBuffer(8) };
        h.audio.ctx = { state:'running',decodeAudioData(data,done,fail) {
            const key = pending.size ? 'ring' : 'jump';
            counts.set(key,(counts.get(key)||0)+1); pending.set(key,{done,fail});
        } };
        for (let i=0;i<100;i++) h.audio.unlock();
        assert.strictEqual([...counts.values()].reduce((a,b)=>a+b,0),2,
            'only one decode per sound may be pending');
        pending.get('jump').done({}); pending.get('ring').fail();
        for (let i=0;i<100;i++) h.audio.unlock();
        assert.strictEqual([...counts.values()].reduce((a,b)=>a+b,0),2,
            'a failed decode must fall back rather than retrying on every input');
    } finally { h.dispose(); }
});

test('a stalled sound download cannot prevent unrelated sound files from loading', () => {
    const h=createGameHarness(), requested=[];
    try {
        h.sandbox.fetch=url=>{
            requested.push(url);
            if(url.endsWith('jump.wav'))return new Promise(()=>{});
            return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))});
        };
        const audio=new h.classes.RetroAudio();
        assert.strictEqual(requested.length,Object.keys(audio.sfxFiles).length,
            'sound downloads must start independently when one request never resolves');
    } finally {h.dispose();}
});

test('fallback sound voices and Web Audio nodes stay bounded and stop on mute', () => {
    const h = createGameHarness(); let made=0;
    try {
        h.sandbox.Audio = function () { made++; this.paused=false; this.ended=false;
            this.pause=()=>{this.paused=true;}; this.play=()=>{this.paused=false;}; };
        for(let i=0;i<250;i++) assert(h.audio.playWav('ring'));
        assert(made<=8 && h.audio.fallbackVoices.length<=8, 'fallback playback must reuse a bounded voice pool');
        const sources=[];
        function node() { return { connect(){},disconnect(){this.disconnected=true;},
            start(){},stop(){this.stopped=true; if(this.onended)this.onended();}, gain:{value:0} }; }
        h.audio.ctx = { destination:{},createBufferSource(){const n=node();sources.push(n);return n;},createGain:node };
        h.audio.buffers.ring={};
        for(let i=0;i<250;i++) h.audio.playWav('ring');
        assert(h.audio.activeSources.size<=48, 'overlapping effects must not grow without a limit');
        h.audio.enabled=false;
        assert.strictEqual(h.audio.activeSources.size,0);
        assert(sources.every(source=>source.stopped&&source.disconnected));
        assert(h.audio.fallbackVoices.every(voice=>voice.paused));
    } finally {h.dispose();}
});

test('zero, backwards and nonfinite frame times preserve taps and never corrupt game state', () => {
    const h=createGameHarness();
    try {
        h.game.titleCard=null; h.game.fadeAlpha=0;
        const p=h.game.player;
        h.game.input.press('jump',true);h.game.input.press('jump',false);
        for(const timestamp of [0,-100,NaN,Infinity,-Infinity,0]) {
            at(h,timestamp); healthy(h);
            assert(h.game.input.jumpPressed,'a no-time frame must preserve a queued jump');
            assert.strictEqual(h.game.stageTime,0);
        }
        at(h,1000/60);
        assert(p.ysp<0 && p.jumped && !p.grounded,'the next real simulation frame must apply the saved jump');
        assert(!h.game.input.jumpPressed);
        at(h,0);at(h,2*1000/60);healthy(h);
        assert(h.game.stageTime<=2/60+1e-6,'a backwards callback cannot count the same interval twice');
    } finally {h.dispose();}
});

test('checkpoint controls can recover from game over in every stage and normalize bad indexes', () => {
    const h=createGameHarness();
    try {
        for(const stage of stages) {
            h.game.loadStage(stage,{skipTitleCard:true,skipFade:true});
            h.game.player.lives=1; h.game.player.loseLife();
            assert(h.game.player.gameOver);
            h.game.gotoCheckpoint(1);
            assert(!h.game.player.gameOver && h.game.player.lives===3,
                `${stage}: a checkpoint must restore a playable player`);
            const cp=h.game.terrain.checkpoints[h.game.cpIndex];
            assert(Math.abs(h.game.player.x-cp.x)<1);
            for(const index of [Infinity,-Infinity,NaN,'bad',-300,1e20]) {
                assert.doesNotThrow(()=>h.game.gotoCheckpoint(index));
                assert(Number.isInteger(h.game.cpIndex));
            }
            h.frame();healthy(h);
        }
    } finally {h.dispose();}
});

test('hidden callbacks pause the entire world and visible callbacks resume without time catch-up', () => {
    function snapshot(h) {
        const g=h.game,p=g.player;
        return JSON.stringify({stage:g.stageName,time:g.stageTime,clock:g.terrain.clock,
            x:p.x,y:p.y,xsp:p.xsp,ysp:p.ysp,gsp:p.gsp,state:p.state,lives:p.lives,rings:p.rings,score:p.score,
            death:p.deathTimer,over:g.gameOverTimer,clear:g.actClear,title:g.titleCard,fade:g.fadeAlpha,
            camX:g.camX,camY:g.camY,lava:g.terrain.z2a2?.lavaAge,npc:g.terrain.z2a2?.reunion});
    }
    for(const phase of ['playing','dying','gameOver','tally','fadeOut','rosieHop']) {
        const h=createGameHarness({stage:phase==='rosieHop'?'z2_act2':'palmtree'});
        try {
            const g=h.game,p=g.player;
            p.gsp=6;
            if(phase==='dying')p.die();
            if(phase==='gameOver'){p.lives=1;p.loseLife();g.gameOverTimer=145;}
            if(phase==='tally'||phase==='fadeOut'){
                g.terrain.goalPost.cleared=true;g.updateActClear(1,false);
                g.actClear.phase=phase;g.fadeAlpha=phase==='fadeOut'?.5:0;
            }
            if(phase==='rosieHop'){
                const n=g.terrain.z2a2.reunion;
                p.place(n.x-48,0,n.y);p.update({},1/60);
                p.update({jumpPressed:true,jumpHeld:true},1/60);
                assert(n.actorY<n.y&&!n.grounded);
            }
            h.sandbox.document.hidden=true;h.dispatchDocument('visibilitychange');
            const frozen=snapshot(h),draws=h.canvasStats().draws;
            for(let frame=0;frame<10;frame++){h.frame(1000);healthy(h);assert.strictEqual(snapshot(h),frozen,`${phase}: hidden RAF must not advance world state`);}
            assert.strictEqual(h.canvasStats().draws,draws,'a hidden frame must not redraw a paused world');
            h.sandbox.document.hidden=false;h.dispatchDocument('visibilitychange');
            let received;
            const update=p.update.bind(p);
            p.update=(input,dt)=>{received={input,dt};return update(input,dt);};
            const oldX=p.x,oldTime=g.stageTime;
            h.dispatchWindow('keydown',{code:'ArrowUp'});h.dispatchWindow('keyup',{code:'ArrowUp'});
            assert(g.input.upPressed,'a fresh tap after returning must register');
            h.frame(1000/60);healthy(h);
            assert(received&&Math.abs(received.dt-1/60)<1e-6,'the visible frame must exclude the hidden interval');
            if(phase==='playing'){
                assert(received.input.upPressed,'the resumed physics frame must receive the fresh tap');
                assert(p.x>oldX,'momentum should resume after returning');
                assert(Math.abs(g.stageTime-oldTime-1/60)<1e-6);
            }
        } finally {h.dispose();}
    }
});

test('manual era changes cancel a primed warp instead of being overwritten on the next tick', () => {
    const h=createGameHarness({stage:'z2_act1'});
    try {
        const T=h.game.terrain,post=T.timePosts.find(item=>item.kind==='PAST');
        post.active=true; T.timeWarpSource=post; T.timeWarpTarget='past'; T.timeWarpCharge=89;
        h.game.cycleEra();
        assert.strictEqual(T.timeEra,'present');
        assert.strictEqual(T.timeWarpTarget,null); assert.strictEqual(T.timeWarpCharge,0);
        assert(!post.active,'the interrupted time post must be available for a later deliberate warp');
        h.game.player.gsp=h.game.player.xsp=10;
        h.frame();
        assert.strictEqual(T.timeEra,'present','the old charge must not undo the manual era selection');
    } finally {h.dispose();}
});

test('late enemy-atlas loads cannot mark a replacement image ready', () => {
    const h=createGameHarness({stage:'z1_act2',deferImages:true});
    try {
        const old=h.game.customEnemySheet;
        h.game.loadStage('z1_act2',{skipTitleCard:true,skipFade:true});
        const current=h.game.customEnemySheet;
        assert.notStrictEqual(old,current);
        h.flushImages(image=>image===old);
        assert(!h.game.customEnemySheetLoaded,'the previous sheet must not enable drawing its unloaded replacement');
        h.game.render();
        h.flushImages(image=>image===current);
        assert(h.game.customEnemySheetLoaded); h.game.render();
    } finally {h.dispose();}
});

test('a real nested drawing failure resets native canvas state before the next frame', () => {
    const h=createGameHarness(); const draw=h.ctx.drawImage;
    let failed=false;
    try {
        h.ctx.drawImage=(source,...args)=>{
            if(source===h.game.scarSheet&&!failed){failed=true;throw new Error('Transient sprite draw failure');}
            return draw(source,...args);
        };
        assert.throws(()=>h.frame(),/Transient sprite draw failure/);
        assert(failed,'the failure must occur inside the actual saved sprite context');
        assert.strictEqual(h.scheduledFrames.size,1);
        assert.strictEqual(h.canvasStats().unbalanced.length,0,
            'the failed frame must not retain its world or sprite transforms');
        h.frame();healthy(h);
        assert.strictEqual(h.canvasStats().unbalanced.length,0);
        assert.strictEqual(h.canvasStats().restoreUnderflow,0);
    } finally {h.ctx.drawImage=draw;h.dispose();}
});

test('seeded stage/death/results/input interruptions preserve a live finite runtime', () => {
    let total=0;
    for(const seed of [0x12345,0x5eed,0xc0ffee,0xfaceb00c]) {
        const h=createGameHarness();let state=seed>>>0,clock=0;
        const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
        const render=h.game.render.bind(h.game);let frame=0;
        h.game.render=()=>{if(frame%40===0)render();};
        try {
            for(frame=0;frame<900;frame++) {
                const g=h.game,p=g.player,T=g.terrain;
                for(const key of ['left','right','up','down','jump']) if(random()<.035)g.input.press(key,random()<.5);
                if(random()<.02)g.input.actions.push({type:'checkpoint',index:Math.floor(random()*15)-4});
                if(random()<.009)g.input.actions.push({type:'reset'});
                if(random()<.008)g.input.actions.push({type:'stage'});
                if(random()<.008)g.input.actions.push({type:'era'});
                if(random()<.007)h.dispatchWindow('blur');
                if(random()<.004){h.sandbox.document.hidden=true;h.dispatchDocument('visibilitychange');h.sandbox.document.hidden=false;}
                if(random()<.007 && !p.gameOver) {p.rings=0;T.hurtPlayer(p,p.x+12);}
                if(random()<.004 && !p.gameOver) {p.lives=1;p.die();}
                if(random()<.004 && T.goalPost) {T.goalPost.spinning=true;T.goalPost.spinTimer=2;}
                const ms=[1000/30,1000/60,1000/144,0,250][Math.floor(random()*5)];
                clock+=ms; at(h,clock);healthy(h);total++;
            }
            const stats=h.canvasStats();
            assert.strictEqual(stats.invalid,0);assert.strictEqual(stats.restoreUnderflow,0);
            assert.strictEqual(stats.unbalanced.length,0,'interrupted renders must balance every canvas save/restore');
        } catch(error) {error.message=`seed=${seed.toString(16)} frame=${frame}: ${error.message}`;throw error;}
        finally {h.dispose();}
    }
    console.log(`      (${total} scheduled frames across four reproducible action seeds)`);
});
