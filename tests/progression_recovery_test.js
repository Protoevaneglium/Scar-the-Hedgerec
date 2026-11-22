'use strict';
const assert = require('assert');
const { createGameHarness } = require('./helpers/game_harness');
function storage() { const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}; }
function test(label, run) { run();console.log('  PASS '+label); }
console.log('\nProgression and interrupted-session recovery');

test('every act restores a safe saved checkpoint, lives, score and shield after a fresh page',()=>{
    const sample=createGameHarness(), stages=Array.from(sample.game.getCampaignStages());sample.dispose();
    for(const stage of stages) {
        const saved=storage(), first=createGameHarness({stage,storage:saved});
        let index;
        try {
            const g=first.game;index=Math.min(2,g.terrain.checkpoints.length-1);g.gotoCheckpoint(index);
            Object.assign(g.player,{score:12345,lives:5,shield:true,rings:37,invincTimer:900});
            first.sandbox.sonicGame=g;first.sandbox.ScarHost.pause();
        } finally {first.dispose();}
        const next=createGameHarness({search:'?nointro',storage:saved});
        try {
            const g=next.game,p=g.player,cp=g.terrain.checkpoints[index];
            assert.strictEqual(g.stageName,stage);assert.strictEqual(g.cpIndex,index);
            assert.strictEqual(p.x,cp.x);assert(p.grounded && Math.abs(p.y+p.radii.height-cp.y)<4);
            assert.deepStrictEqual([p.score,p.lives,p.shield,p.rings,p.invincTimer||0],[12345,5,true,0,0]);
            assert(p.invulnTimer>=120);assert(g.titleCard && !g.paused);
        } finally {next.dispose();}
    }
});

test('real checkpoint activation saves without needing an orderly app shutdown',()=>{
    const saved=storage(),h=createGameHarness({stage:'z2_act2',storage:saved});
    let expected;
    try {
        const g=h.game,post=g.terrain.starPosts[2];g.player.place(post.x,0,post.y);
        g.player.update({},1/60);assert(post.active);expected=g.cpIndex;assert(expected>0);
    } finally {h.dispose();}
    const r=createGameHarness({search:'?nointro',storage:saved});
    try {assert.strictEqual(r.game.stageName,'z2_act2');assert.strictEqual(r.game.cpIndex,expected);}
    finally {r.dispose();}
});

test('a restart during the Act 2 sign or tally enters Act 3 and banks each bonus once',()=>{
    for(const phase of ['sign','tally']) {
        const saved=storage(),h=createGameHarness({stage:'z2_act2',storage:saved});let expected;
        try {
            const g=h.game,p=g.player,t=g.terrain;g.stageTime=95;p.score=9100;p.lives=6;p.shield=true;p.rings=17;
            t.z2a2.reunion.met=true;t.z2a2.reunion.timer=0;t.goalPost.locked=false;
            p.place(t.goalPost.x+1,0,t.goalPost.y);p.update({},1/60);assert(t.goalPost.spinning);
            expected=p.score+g.computeTimeBonus(g.stageTime)+p.rings*100;
            if(phase==='tally') {t.goalPost.spinTimer=1;p.update({},1/60);g.updateActClear(1,true);for(let i=0;i<10;i++)g.updateActClear(1,false);h.dispatchWindow('pagehide');}
        } finally {h.dispose();}
        for(let restart=0;restart<2;restart++) {
            const r=createGameHarness({search:'?nointro',storage:saved});
            try {const g=r.game;assert.strictEqual(g.stageName,'z2_act3');assert.strictEqual(g.cpIndex,0);assert.deepStrictEqual([g.player.score,g.player.lives,g.player.shield,g.player.rings],[expected,6,true,0]);assert(g.terrain.boss && g.terrain.capsule.lockedUntilBoss);}
            finally {r.dispose();}
        }
    }
});

test('pending death and game over keep the current act without refunding a lost life',()=>{
    for(const lives of [1,3]) {
        const saved=storage(),h=createGameHarness({stage:'z2_act2',storage:saved});
        try {h.game.gotoCheckpoint(2);h.game.player.lives=lives;h.game.player.die();h.dispatchWindow('pagehide');}
        finally {h.dispose();}
        const r=createGameHarness({search:'?nointro',storage:saved});
        try {assert.strictEqual(r.game.stageName,'z2_act2');assert.strictEqual(r.game.player.lives,lives===1?3:2);assert.strictEqual(r.game.cpIndex,lives===1?0:2);assert(!r.game.player.gameOver);}
        finally {r.dispose();}
    }
});

test('v0.0.1 visited stages migrate, while explicit stage URLs still choose a fresh act',()=>{
    const saved=storage();saved.setItem('scar_unlocked_stages',JSON.stringify(['palmtree','z1_act2','z2_act2','test','removed-stage']));
    const h=createGameHarness({search:'?nointro',storage:saved});
    try {assert.strictEqual(h.game.stageName,'z2_act2');assert.strictEqual(h.game.cpIndex,0);}finally {h.dispose();}
    const direct=createGameHarness({stage:'z1_act3',storage:saved});
    try {assert.strictEqual(direct.game.stageName,'z1_act3');assert.strictEqual(direct.game.cpIndex,0);}finally {direct.dispose();}
});

test('corrupt saves and denied storage cannot stop startup or checkpoints',()=>{
    const valid={version:1,stage:'z2_act2',checkpoint:2,score:50,lives:3,shield:false};
    for(const value of ['invalid','null','x'.repeat(2048),...[
        {stage:'test'},{stage:'missing'},{version:9},{checkpoint:-1},{checkpoint:1.5},
        {score:-1},{score:1e30},{lives:0},{lives:1.5},{shield:'true'},
    ].map(change=>JSON.stringify({...valid,...change}))]) {
        const saved=storage();saved.setItem('scar_continue_v1:campaign',value);
        const h=createGameHarness({search:'?nointro',storage:saved});
        try {assert.strictEqual(h.game.stageName,'palmtree');assert(Number.isFinite(h.game.player.x));}
        finally {h.dispose();}
    }
    const denied={getItem(){throw Error('Storage denied');},setItem(){throw Error('Quota exceeded');}};
    const h=createGameHarness({search:'?nointro',storage:denied});
    try {assert.doesNotThrow(()=>{h.game.gotoCheckpoint(1);h.game.setPaused(true);h.dispatchWindow('pagehide');});}
    finally {h.dispose();}
});

test('legacy canvas without roundRect renders the entire Starlight Resort route',()=>{
    const h=createGameHarness({stage:'z1_act2'}),g=h.game;h.ctx.roundRect=undefined;
    try {
        for(let cp=0;cp<g.terrain.checkpoints.length;cp++)for(const era of ['good_future','present','past']) {
            g.gotoCheckpoint(cp);g.terrain.timeEra=era;assert.doesNotThrow(()=>g.render());
        }
        for(const loop of g.terrain.loops) {g.camX=loop.cx-g.W/2;g.camY=loop.cy-g.H/2;assert.doesNotThrow(()=>g.render());}
        assert.strictEqual(h.canvasStats().invalid,0);assert.deepStrictEqual(h.canvasStats().unbalanced,[]);
    } finally {h.dispose();}
});
