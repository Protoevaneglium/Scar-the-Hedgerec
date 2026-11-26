'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const E=require('../public/sonic-engine');
require('../public/levels/zone3_act1');require('../public/levels/zone3_act2');
const Art=require('../public/levels/zone3_act2_art');
const {createGameHarness}=require('./helpers/game_harness');
const test=(name,fn)=>{fn();console.log('  PASS '+name);};
const fixture=()=>{const t=new E.Terrain('z3_act2');return {t,p:new E.Player(t)};};
function isolated(){
    const {t,p}=fixture();
    for(const key of ['enemies','spikeClusters','springs','monitors','rings','speedBoosters','dashRings','airVents'])t[key]=[];
    t.waterZones.forEach(w=>w.current=0);p.place(3200,0,920);return {t,p};
}
function run(p,hz,seconds,controls=()=>({right:true}),stop=()=>false){
    for(let i=0;i<seconds*hz;i++){p.update(controls(i,p),1/hz);if(stop(p))return i/hz;}return null;
}
const goal=t=>t.goalPost.spinning||t.goalPost.cleared;
console.log('\nZone 3 Act 2 — Neon Labyrinth and shared water physics');
test('a longer original act mixes four reservoirs, dry loops, three tiers, shared objects and original music',()=>{
    const {t}=fixture(),z=t.z3a2;
    assert.strictEqual(t.levelDef.zone,3);assert.strictEqual(t.levelDef.act,2);
    assert.strictEqual(t.levelDef.spritePresentation,'volume');assert(t.goalPost&&!t.capsule);
    assert(t.endX>=new E.Terrain('z3_act1').endX*1.2);assert.strictEqual(z.main.x1,t.endX);
    assert.strictEqual(z.pools.length,4);assert.strictEqual(z.roads.length,4);assert.strictEqual(z.galleries.length,4);
    assert.strictEqual(t.loops.length,3);assert(t.checkpoints.length===7&&t.airVents.length===8);
    for(const road of z.roads)for(let x=road.x0;x<road.x1;x+=40)assert(z.main.f(x)>road.f(x)+80,'safe lower recovery');
    for(const cp of t.checkpoints){const {p}=fixture();p.place(cp.x,0,cp.y);assert(!p.inWater,'dry recovery checkpoints');assert(Math.abs(p.y+p.radii.height-cp.y)<3);}
    assert(t.rings.length>350&&t.bigRing);
    const music=fs.readFileSync(path.join(__dirname,'../public',t.levelDef.bgm));
    assert.strictEqual(music.toString('ascii',0,4),'RIFF');assert(music.length>1000000);
});
test('running, underwater strokes and surface back-swimming all reconnect to the finish at 30/60/144 Hz',()=>{
    for(const hz of [30,60,144])for(const route of ['running','strokes','back-swim']){
        const {t,p}=fixture();let deaths=0,swims=0,floats=0;const visited=new Set();
        p.events.deathStart=()=>deaths++;p.events.swimStroke=()=>swims++;
        const elapsed=run(p,hz,130,i=>{
            const jump=route==='strokes'&&p.inWater&&i%Math.round(hz*.28)===0;
            if(p.surfaceSwimming)floats++;
            return {right:true,down:route==='back-swim',jumpPressed:jump,jumpHeld:jump};
        },()=>{visited.add(p.groundSurface);return goal(t);});
        assert(elapsed!==null,`${hz}/${route}: ${p.x},${p.y}`);assert.strictEqual(deaths,0);
        if(route==='strokes')assert(swims>10);if(route==='back-swim')assert(floats>hz);
        if(route==='running'){
            for(const road of t.z3a2.roads)assert(visited.has(road),`${hz}: crown ${road.name}`);
            for(const loop of t.loops)assert(visited.has(loop.arc0)&&visited.has(loop.arc1),`${hz}: both layers of ${loop.name}`);
        }
    }
});
test('all checkpoints, crown routes, submerged galleries, low-speed retries and bridge falls are recoverable',()=>{
    for(const hz of [30,60,144]){
        const {t}=fixture();
        const starts=[...t.checkpoints,...t.z3a2.roads.map(s=>({x:s.x0+80,y:s.f(s.x0+80)})),
            ...t.z3a2.galleries.map(s=>({x:s.x0+400,y:s.f(s.x0+400)})),{x:13090,y:80},{x:14400,y:340}];
        for(const start of starts){
            const {t,p}=fixture();p.place(start.x,0,start.y);let deaths=0;p.events.deathStart=()=>deaths++;
            assert(run(p,hz,130,i=>{
                const stroke=p.inWater&&i%Math.round(hz*.2)===0;
                return {right:true,jumpPressed:stroke,jumpHeld:stroke};
            },()=>goal(t))!==null,`${hz}: recovery ${start.x}, stopped ${p.x},${p.y}`);
            assert.strictEqual(deaths,0,`${hz}/${start.x}`);
        }
    }
});
test('submerged acceleration, jump, gravity, variable height and entry/exit momentum use the shared water constants',()=>{
    for(const hz of [30,60,144]){
        const {p}=isolated();assert(p.inWater);
        run(p,hz,.5,()=>({right:true}));assert(Math.abs(p.gsp-E.WATER_PHYS.ACC*30)<1e-6);
        p.place(3200,0,920);p.update({jumpPressed:true,jumpHeld:true},1/hz);
        assert(p.ysp<0&&p.ysp>=-3.5&&p.curled);
        const before=p.ysp;p.update({jumpHeld:true},1/hz);
        assert(Math.abs(p.ysp-before-E.WATER_PHYS.GRV*60/hz)<1e-6);
        p.update({},1/hz);assert(p.ysp>=-2);
        p.x=3200;p.y=610;p.state=E.STATE.AIRBORNE;p.curled=false;p.inWater=false;p.xsp=8;p.ysp=8;
        p.y=630;p.dropDashReady=p.dropDashCharging=true;p.dropDashCharge=20;
        p.syncWater({},0,false,false);assert(p.inWater);assert.strictEqual(p.xsp,4);assert.strictEqual(p.ysp,2);
        assert(!p.dropDashReady&&!p.dropDashCharging&&!p.dropDashCharge,'entering water cancels an old dry Drop Dash');
        p.y=610;p.ysp=-2;p.syncWater({},0,false,false);assert(!p.inWater);assert.strictEqual(p.ysp,-4);
        // Existing decorative water remains shallow and uses the dry constants.
        const old=new E.Terrain('z3_act1'),dry=new E.Player(old);dry.place(3000,0,720);assert(!dry.inWater);
    }
});
test('one held jump cannot escape a deep pool; fresh repeat presses can reach air before drowning',()=>{
    for(const hz of [30,60,144]){
        const single=isolated();single.p.y=840;single.p.state=E.STATE.AIRBORNE;single.p.ysp=0;
        run(single.p,hz,3,i=>({jumpHeld:true,jumpPressed:i===0}));assert(single.p.inWater,'holding does not auto-stroke');
        const {p}=isolated();p.y=840;p.state=E.STATE.AIRBORNE;p.ysp=0;p.airRemaining=6*60;let strokes=0;
        p.events.swimStroke=()=>strokes++;
        const elapsed=run(p,hz,6,i=>{const edge=i%Math.round(hz*.18)===0;return {jumpHeld:edge,jumpPressed:edge};},p=>!p.inWater);
        assert(elapsed!==null&&strokes>1&&!p.gameOver&&p.state!==E.STATE.DYING,`${hz}: repeated escape`);
        assert.strictEqual(p.airRemaining,E.AIR_FRAMES);assert(!p.dropDashCharging&&!p.dropDashReady);
        const vy=p.ysp;p.update({jumpPressed:true,jumpHeld:true},1/hz);
        assert(p.ysp>vy,'a dry-air press does not grant another swim jump');
    }
});
test('S/Down above water floats on Scar’s back, keeps his head in air, and supports release/jump/shore exit',()=>{
    for(const hz of [30,60,144]){
        const {p}=isolated();p.y=654;p.state=E.STATE.AIRBORNE;p.airRemaining=120;
        p.update({down:true},1/hz);assert(!p.surfaceSwimming&&p.inWater&&p.airRemaining<120,'Down below the surface cannot refill breath');
        p.y=600;p.ysp=2;p.inWater=false;p.airRemaining=60;
        run(p,hz,2,()=>({down:true,right:true}));assert(p.surfaceSwimming&&!p.inWater&&!p.curled);
        assert(Math.abs(p.y-614)<2&&p.x>3200);assert.strictEqual(p.airRemaining,E.AIR_FRAMES);
        p.update({down:true,jumpPressed:true,jumpHeld:true},1/hz);assert(!p.surfaceSwimming&&p.ysp<-5);
        p.place(3200,0,920);p.y=614;p.state=E.STATE.AIRBORNE;p.inWater=false;
        p.update({down:true},1/hz);assert(p.surfaceSwimming);run(p,hz,2,()=>({}));assert(p.inWater&&!p.surfaceSwimming);
        // Surface control never activates on dry ground.
        p.place(440,0,520);p.update({down:true},1/hz);assert(!p.surfaceSwimming&&p.grounded);
    }
});
test('air bubbles and surfacing restore breath; drowning ignores shields and resets at dry checkpoints',()=>{
    for(const hz of [30,60,144]){
        const {t,p}=isolated();p.airRemaining=60;t.airVents=[{x:p.x,y:p.y,bubbleY:p.y,cooldown:0}];
        let gulps=0;p.events.airBubble=()=>gulps++;p.update({},1/hz);
        assert(gulps===1&&p.airRemaining>E.AIR_FRAMES-3);
        t.airVents=[];p.shield=true;p.invincTimer=99999;p.airRemaining=2*60;let warnings=0;
        p.events.drowningWarning=()=>warnings++;
        assert(run(p,hz,3,()=>({}),p=>p.state===E.STATE.DYING)!==null);assert(warnings>0);
        assert.strictEqual(p.deathReason,'DROWNED');assert(!p.surfaceSwimming&&!p.inWater);
        t.activeCheckpoint={x:4440,y:520};run(p,hz,4,()=>({}),p=>p.grounded);
        assert.strictEqual(p.lives,2);assert(!p.inWater&&!p.surfaceSwimming);assert.strictEqual(p.airRemaining,E.AIR_FRAMES);
    }
});
test('currents can be reversed and all water placements reset without growing surfaces or bubbles',()=>{
    for(const hz of [30,60,144]){
        const {p}=fixture();p.place(3450,0,920);p.gsp=2;
        run(p,hz,3,()=>({left:true}));assert(p.gsp<0,'current must allow braking/reversal');
    }
    const {t}=fixture(),count=[t.surfaces.length,t.rings.length,t.airVents.length];
    for(let i=0;i<20;i++){t.airVents[0].cooldown=100;t.resetObjects();assert.deepStrictEqual([t.surfaces.length,t.rings.length,t.airVents.length],count);assert(t.airVents.every(b=>!b.cooldown&&b.bubbleY===b.y));}
    assert.notDeepStrictEqual(Art.skyColors(0,0,'good_future'),Art.skyColors(.8,4000,'present'));
});
test('the real crown spring reaches the treasury, and its giant ring uses the shared reward',()=>{
    for(const hz of [30,60,144]){
        const {t,p}=fixture(),s=t.springs[3];p.place(s.x,0,s.y);
        assert(run(p,hz,5,()=>({}),p=>p.groundSurface===t.z3a2.treasury)!==null,`${hz}: treasury spring`);
        const score=p.score,rings=p.rings;
        assert(run(p,hz,4,()=>({right:true}),()=>t.bigRing.collected)!==null,`${hz}: giant ring reachable`);
        assert(p.score>=score+10000&&p.rings>=rings+50);
    }
});
test('the real Act 1 sign/tally transitions to Act 2 and saved checkpoints recover with carryover',()=>{
    const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))};
    const h=createGameHarness({stage:'z3_act1',storage}),g=h.game;
    try{
        assert.strictEqual(g.getNextCampaignStage(),'z3_act2');g.titleCard=null;g.fadeAlpha=0;
        g.player.score=20000;g.player.lives=6;g.player.shield=true;g.player.rings=25;g.stageTime=75;
        const sign=g.terrain.goalPost;g.player.place(sign.x-5,0,sign.y);g.player.gsp=6;
        g.player.update({right:true},1/60);g.player.update({right:true},1/60);assert(sign.spinning);
        for(let i=0;i<1400&&g.stageName!=='z3_act2';i++)h.frame();
        assert.strictEqual(g.stageName,'z3_act2');assert(g.titleCard&&g.player.score>20000);
        assert.strictEqual(g.player.lives,6);assert(g.player.shield);assert.strictEqual(g.player.rings,0);assert.strictEqual(g.stageTime,0);
        g.gotoCheckpoint(5);h.dispatchWindow('pagehide');
        const fresh=createGameHarness({search:'?nointro',storage});
        try{assert.strictEqual(fresh.game.stageName,'z3_act2');assert.strictEqual(fresh.game.cpIndex,5);assert(!fresh.game.player.inWater);fresh.frame();}finally{fresh.dispose();}
    }finally{h.dispose();}
});
test('shared water drawing, floating animation and warnings render with missing/delayed assets and pause freezes oxygen',()=>{
    for(const mode of ['complete','missing','delayed']){
        const h=createGameHarness({stage:'z3_act2',deferImages:mode==='delayed',failImages:mode==='missing'?['assets/scar_sheet.png','assets/models/sprite_models.png','assets/common_objects.png']:[]}),g=h.game;
        try{
            g.titleCard=null;g.fadeAlpha=0;
            for(let cp=0;cp<g.terrain.checkpoints.length;cp++){g.gotoCheckpoint(cp);for(const era of ['past','present','good_future']){g.terrain.timeEra=era;g.render();}}
            g.player.place(3200,0,920);g.player.airRemaining=120;g.render();
            g.setPaused(true);const air=g.player.airRemaining;for(let i=0;i<60;i++)h.frame();assert.strictEqual(g.player.airRemaining,air);g.setPaused(false);
            g.player.y=614;g.player.state=E.STATE.AIRBORNE;g.player.syncWater({down:true},1,false);g.render();
            if(mode==='delayed')h.flushImages();g.render();
            const stats=h.canvasStats();assert(!stats.invalid&&!stats.restoreUnderflow&&!stats.unbalanced.length);
        }finally{h.dispose();}
    }
});
test('water events use their shared splash, stroke, air and warning sound handlers',()=>{
    const h=createGameHarness({stage:'z3_act2'});
    try{
        for(const name of ['waterSplash','swimStroke','airBubble','drowningWarning']){
            let calls=0;h.audio[name]=()=>calls++;h.game.player.emit(name);assert.strictEqual(calls,1,name);
        }
    }finally{h.dispose();}
});
