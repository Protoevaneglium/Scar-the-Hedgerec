'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const E = require('../public/sonic-engine');
require('../public/levels/zone3_act1');
const Art = require('../public/levels/zone3_act1_art');
const { createGameHarness } = require('./helpers/game_harness');
const test = (name, run) => { run(); console.log('  PASS ' + name); };
const fixture = () => { const t = new E.Terrain('z3_act1'); return { t, p: new E.Player(t) }; };
function run(p, hz, seconds, controls = () => ({right:true}), stop = () => false) {
    for(let i=0;i<seconds*hz;i++) { p.update(controls(i,p),1/hz); if(stop(p))return i/hz; }
    return null;
}
const goal = t => !!(t.goalPost.spinning || t.goalPost.cleared);
console.log('\nZone 3 Act 1 — Mirage Aqueduct');
test('the normal-act foundation includes every baseline object, distinct music, and real layered routes', () => {
    const {t}=fixture(),z=t.z3a1;
    assert.strictEqual(t.levelDef.zone,3);assert.strictEqual(t.levelDef.act,1);
    assert.strictEqual(t.levelDef.spritePresentation,'volume');assert(t.goalPost&&!t.capsule);
    assert.strictEqual(z.roads.length,3);assert.strictEqual(t.loops.length,3);
    assert(t.endX>=15000&&t.checkpoints.length>=6);
    for(const key of ['monitors','starPosts','springs','platforms','speedBoosters','dashRings','bouncePoles',
        'spinners','swingPlatforms','breakableWalls','rocks','breakableFloors','trapDoors','houdiniGroups','enemies','timePosts'])assert(t[key].length,key);
    assert(t.bigRing&&t.rings.length>200);
    assert(fs.existsSync(path.join(__dirname,'../public',t.levelDef.bgm)));
    assert.notStrictEqual(t.levelDef.bgm,'assets/marble_canopy_act1.wav');
    for(const s of z.roads)for(let x=s.x0;x<=s.x1;x+=40)assert(z.main.f(x)>s.f(x)+70,'missed jumps need a lower catch route');
});
test('a real input route visits all three aqueducts and both sky-loop layers at 30/60/144 Hz', () => {
    for(const hz of [30,60,144]){
        const {t,p}=fixture(),visited=new Set();let deaths=0,jets=0,slides=0;
        p.events.deathStart=()=>deaths++;p.events.waterJet=()=>jets++;p.events.waterSlide=()=>slides++;
        const elapsed=run(p,hz,60,()=>({right:true}),()=>{visited.add(p.groundSurface);return goal(t);});
        assert(elapsed!==null,`${hz}: stuck at ${p.x},${p.y}`);assert.strictEqual(deaths,0);
        for(const s of t.z3a1.roads)assert(visited.has(s),`${hz}: missed ${s.name}`);
        const loop=t.loops[1];assert(visited.has(loop.arc0)&&visited.has(loop.arc1));
        assert(jets>=2&&slides>=2&&p.rings>0);
    }
});
test('each elevated route, checkpoint and lower-route retry reconnects to the signpost', () => {
    for(const hz of [30,60,144])for(const label of ['upperA','upperB','upperC','reward',...Array.from({length:6},(_,i)=>i)]){
        const {t,p}=fixture();let deaths=0;p.events.deathStart=()=>deaths++;
        if(typeof label==='number'){
            const cp=t.checkpoints[label];t.activeCheckpoint={x:cp.x,y:cp.y};p.respawn();
            assert(Math.abs(p.y+p.radii.height-cp.y)<4,cp.name);
        } else {const s=t.z3a1[label];p.place(s.x0+80,0,s.f(s.x0+80));}
        const elapsed=run(p,hz,70,()=>({right:true}),()=>goal(t));
        assert(elapsed!==null,`${hz}/${label}: stopped at ${p.x},${p.y}`);assert.strictEqual(deaths,0);
    }
});
test('every water jet reaches its intended aqueduct and cannot trap the player in repeated launches',()=>{
    for(const hz of [30,60,144])for(let index=0;index<3;index++){
        const {t,p}=fixture(),j=t.z3a1.jets[index];let jets=0;p.events.waterJet=()=>jets++;
        p.place(j.x-50,0,t.z3a1.main.f(j.x-50));p.gsp=p.xsp=7.5;
        const elapsed=run(p,hz,8,()=>({right:true}),()=>p.groundSurface===t.z3a1.roads[index]);
        assert(elapsed!==null,`${hz}/jet${index}: missed landing ${p.x},${p.y}`);assert.strictEqual(jets,1);
    }
});
test('the crown spring lands on the treasury, and the collapsing bridge has a safe recovery floor',()=>{
    for(const hz of [30,60,144]){
        const {t,p}=fixture(),spring=t.springs[0];p.place(spring.x,0,spring.y);
        assert(run(p,hz,5,()=>({}),()=>p.groundSurface===t.z3a1.reward)!==null,'treasury spring');
        const floor=t.breakableFloors[0];p.place(floor.x+floor.w/2,0,floor.y);
        assert(run(p,hz,8,()=>({}),()=>p.groundSurface===t.z3a1.upperB)!==null,'collapsing bridge aqueduct recovery');
        assert(p.y+p.radii.height>floor.y+60,'the bridge must open and cause a real fall');
        assert(p.lives>=3);
    }
});
test('water currents can be escaped leftward or by jumping, without changing standard gravity',()=>{
    for(const hz of [30,60,144]){
        const {t,p}=fixture();p.place(3000,0,720);p.gsp=5;
        run(p,hz,2,()=>({left:true}));assert(p.gsp<0,'current must not defeat braking input');
        p.place(3000,0,720);p.update({jumpPressed:true,jumpHeld:true},1/hz);
        assert(!p.grounded&&p.ysp<0);
        const before=p.ysp;p.update({jumpHeld:true},1/hz);
        assert(!t.z3a1.current,'airborne Scar leaves the current at the next object update');
        assert(Math.abs(p.ysp-before-E.PHYS.GRV*60/hz)<1e-6,'shared jump gravity');
    }
});
test('sky palettes vary with progress, gameplay time and time era; repeated resets restore mechanics',()=>{
    assert.notDeepStrictEqual(Art.skyColors(0,0,'good_future'),Art.skyColors(.7,0,'good_future'));
    assert.notDeepStrictEqual(Art.skyColors(.3,0,'good_future'),Art.skyColors(.3,5000,'good_future'));
    assert.notDeepStrictEqual(Art.skyColors(.3,0,'past'),Art.skyColors(.3,0,'present'));
    const {t}=fixture(),counts=[t.surfaces.length,t.rings.length];
    for(let i=0;i<20;i++){t.z3a1.jets[0].cooldown=90;t.z3a1.current=true;t.resetObjects();
        assert.deepStrictEqual([t.surfaces.length,t.rings.length],counts);
        assert(t.z3a1.jets.every(j=>j.cooldown===0)&&!t.z3a1.current);}
});
test('masonry uses one bounded texture across every checkpoint and repeated act loads',()=>{
    const h=createGameHarness({stage:'z3_act1'}),g=h.game;
    try{
        g.render();
        const tiles=()=>h.canvases.filter(({canvas})=>canvas.width===200&&canvas.height===400);
        assert.strictEqual(tiles().length,1);
        for(let pass=0;pass<3;pass++){
            g.loadStage('z3_act1',{skipTitleCard:true,skipFade:true});
            const allocated=h.canvases.length;
            for(let cp=0;cp<g.terrain.checkpoints.length;cp++){
                g.gotoCheckpoint(cp);g.render();let fills=0;const original=h.ctx.fillRect;
                h.ctx.fillRect=(...args)=>{fills++;original(...args);};
                try{h.sandbox.MirageAqueductArt.drawTerrain(h.ctx,g);}finally{h.ctx.fillRect=original;}
                assert(fills<=g.terrain.floors.length,'visible masonry must use one cached fill per road');
            }
            assert.strictEqual(h.canvases.length,allocated);
        }
        assert.strictEqual(tiles().length,1);
        assert.strictEqual(h.canvasStats().invalid,0);
    }finally{h.dispose();}
});
test('Zone 2 capsule completion leads to the new act, with carryover and a recoverable saved checkpoint',()=>{
    const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))};
    const h=createGameHarness({stage:'z2_act3',storage}),g=h.game;
    try{
        assert.strictEqual(g.getNextCampaignStage(),'z3_act1');
        g.titleCard=null;g.fadeAlpha=0;g.stageTime=95;
        g.player.score=12500;g.player.lives=5;g.player.shield=true;g.player.rings=22;
        g.terrain.boss.defeated=true;g.terrain.boss.active=true;g.terrain.boss.hp=0;
        g.terrain.boss.members.forEach(m=>{m.defeated=true;m.hp=0;m.state='defeated';});
        const cap=g.terrain.capsule;
        g.player.x=cap.x;g.player.y=cap.y-90;g.player.state=E.STATE.AIRBORNE;g.player.ysp=4;
        for(let i=0;i<1000&&g.stageName!=='z3_act1';i++)h.frame();
        assert.strictEqual(g.stageName,'z3_act1');assert(g.player.score>=14700);
        assert.strictEqual(g.player.lives,5);assert.strictEqual(g.player.shield,true);assert.strictEqual(g.player.rings,0);
        g.gotoCheckpoint(3);h.dispatchWindow('pagehide');
        const fresh=createGameHarness({search:'?nointro',storage});
        try{assert.strictEqual(fresh.game.stageName,'z3_act1');assert.strictEqual(fresh.game.cpIndex,3);fresh.frame();}
        finally{fresh.dispose();}
    }finally{h.dispose();}
});
