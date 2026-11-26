'use strict';
const assert=require('assert');
const E=require('../public/sonic-engine');
require('../public/levels/zone3_act2');
const {createGameHarness}=require('./helpers/game_harness');
const test=(name,fn)=>{fn();console.log('  PASS '+name);};
const fixture=()=>{const t=new E.Terrain('z3_act2');return {t,p:new E.Player(t)};};
const controls=(p,i,hz)=>{const jump=p.inWater&&i%Math.round(hz*.24)===0;return {right:true,jumpPressed:jump,jumpHeld:jump};};
const resources=p=>JSON.stringify([p.x,p.y,p.xsp,p.ysp,p.gsp,p.angle,p.state,p.curled,p.rings,p.score,p.lives,
    p.shield,p.invulnTimer,p.invincTimer,p.shoesTimer,p.airRemaining,p.surfaceSwimming,p.dropDashReady,p.dropDashCharging,p.dropDashCharge]);
console.log('\nScar / Rosie shared party and E swapping');
test('Rosie starts as the follower; E toggles identities without changing gameplay state',()=>{
    for(const hz of [30,60,144]){
        const {t,p}=fixture();assert.strictEqual(p.character,'scar');assert.strictEqual(p.companion.character,'rosie');
        assert(p.companion.x<p.x&&p.companion.grounded);
        p.place(3200,0,920);p.update({jumpPressed:true,jumpHeld:true},1/hz);
        p.rings=37;p.score=12340;p.lives=6;p.shield=true;p.invincTimer=780;p.shoesTimer=120;p.airRemaining=148;
        const before=resources(p),npc=[p.companion.x,p.companion.y];
        for(let n=0;n<100;n++){
            assert(p.swapCharacter());assert.strictEqual(p.character,n%2?'scar':'rosie');
            assert.strictEqual(p.companion.character,n%2?'rosie':'scar');assert.strictEqual(resources(p),before);
            assert.deepStrictEqual([p.companion.x,p.companion.y],npc);
        }
        assert(Math.abs(t.clock-60/hz)<1e-12);
    }
});
test('the NPC follows actual dry, upper, loop and underwater routes with bounded history at 30/60/144 Hz',()=>{
    for(const hz of [30,60,144]){
        const {t,p}=fixture();let moving=0,wet=0,air=0,scarNPC=0,rosieNPC=0;
        for(let i=0;i<hz*130;i++){
            if(i%Math.round(hz*3)===0)p.swapCharacter();
            const npc=p.companion,oldX=npc.x,oldY=npc.y;
            p.update(controls(p,i,hz),1/hz);
            if(Math.hypot(npc.x-oldX,npc.y-oldY)>.1)moving++;
            wet+=!!npc.inWater;air+=!npc.grounded;scarNPC+=npc.character==='scar';rosieNPC+=npc.character==='rosie';
            for(const k of ['x','y','angle','visualAngle','ballSpin'])assert(Number.isFinite(npc[k]),`${hz}/${k}`);
            assert(npc.history.length<=128);assert(Math.hypot(p.x-npc.x,p.y-npc.y)<300,'partner stays near the actual path');
            if(t.goalPost.spinning)break;
        }
        assert(t.goalPost.spinning,`${hz}: complete alternating control route`);assert(moving>hz&&wet>hz&&air>hz&&scarNPC&&rosieNPC);
    }
});
test('followers do not advance the world twice or change rings, enemies, rewards, hazards or air',()=>{
    for(const hz of [30,60,144]){
        const a=fixture(),b=fixture();b.p.companion=null;
        for(let i=0;i<hz*20;i++){
            const input={right:true};a.p.update(input,1/hz);b.p.update(input,1/hz);
            assert.strictEqual(resources(a.p),resources(b.p));assert.strictEqual(a.t.clock,b.t.clock);
            assert.strictEqual(a.t.animals.length,b.t.animals.length);
        }
    }
});
test('idle partners settle onto terrain; checkpoints and death retries reunite the pair and preserve the selected character',()=>{
    for(const hz of [30,60,144]){
        const {t,p}=fixture();p.swapCharacter();
        for(let i=0;i<hz;i++)p.update({right:true,jumpPressed:i===Math.round(hz*.5),jumpHeld:i>=hz*.5&&i<hz*.8},1/hz);
        for(let i=0;i<hz*3;i++)p.update({},1/hz);
        assert(p.companion.grounded&&p.companion.state===E.STATE.STANDING);
        assert(Math.abs(p.x-p.companion.x)>25,'idle spacing');
        t.activeCheckpoint=t.checkpoints[3];p.die();assert(!p.swapCharacter());
        for(let i=0;i<hz*4&&p.state===E.STATE.DYING;i++)p.update({},1/hz);
        assert.strictEqual(p.character,'rosie');assert.strictEqual(p.companion.character,'scar');
        assert(Math.abs(p.x-t.activeCheckpoint.x)<4&&Math.abs(p.x-p.companion.x)<=70);
        p.place(t.checkpoints[6].x,0,t.checkpoints[6].y);assert(p.companion.history.length===2);
        t.goalPost.spinning=true;assert(!p.swapCharacter());
    }
});
test('real E key edges, pause, title, death and completion gates prevent unintended swaps',()=>{
    const h=createGameHarness({stage:'z3_act2'}),g=h.game;
    const key=(repeat=false)=>h.dispatchWindow('keydown',{code:'KeyE',repeat,preventDefault(){}});
    const release=()=>h.dispatchWindow('keyup',{code:'KeyE',preventDefault(){}});
    try{
        key();h.frame();assert.strictEqual(g.player.character,'scar','title card blocks swaps');release();
        g.titleCard=null;g.fadeAlpha=0;
        key();h.frame();assert.strictEqual(g.player.character,'rosie');
        for(let i=0;i<50;i++){key(true);h.frame();}assert.strictEqual(g.player.character,'rosie','OS repeats do not toggle');release();
        key();h.frame();assert.strictEqual(g.player.character,'scar');release();
        g.setPaused(true);const before=JSON.stringify(g.player.companion);
        key();for(let i=0;i<20;i++)h.frame();release();assert.strictEqual(g.player.character,'scar');assert.strictEqual(JSON.stringify(g.player.companion),before);
        g.setPaused(false);g.player.die();key();h.frame();release();assert.strictEqual(g.player.character,'scar');
        g.loadStage('z3_act1',{skipTitleCard:true,skipFade:true});key();h.frame();assert(!g.player.companion&&g.player.character==='scar');
    }finally{h.dispose();}
});
test('the partner rides a shared moving lift without hovering at an old platform position',()=>{
    for(const hz of [30,60,144]){
        const {t,p}=fixture(),lift=t.platforms[0];
        p.x=lift.x;p.y=lift.y-p.radii.height;p.groundSurface=lift.surface;p.state=E.STATE.STANDING;
        p.companion.reset(p);
        for(let i=0;i<hz*2;i++){
            p.update({},1/hz);
            assert(Math.abs(p.companion.y+p.companion.radii.height-lift.y)<2,`${hz}: partner lift feet`);
            assert(Math.abs(p.companion.x-lift.x)<lift.w/2);
        }
    }
});
test('saved progress remembers Rosie and renders both original characters, HUD, rolling, surface swim and game over',()=>{
    const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))};
    for(const mode of ['complete','missing','delayed']){
        const h=createGameHarness({stage:'z3_act2',storage,deferImages:mode==='delayed',failImages:mode==='missing'?['assets/rosie.png','assets/scar_sheet.png']:[]}),g=h.game;
        try{
            g.titleCard=null;g.fadeAlpha=0;g.player.swapCharacter();g.gotoCheckpoint(3);g.saveProgress();
            for(const pose of ['idle','jump','roll','swim','dead']){
                g.player.place(3200,0,920);
                if(pose==='jump'){g.player.state=E.STATE.AIRBORNE;g.player.y-=100;}
                if(pose==='roll'){g.player.curl();g.player.state=E.STATE.ROLLING;}
                if(pose==='swim'){g.player.y=614;g.player.state=E.STATE.AIRBORNE;g.player.surfaceSwimming=true;}
                if(pose==='dead'){g.player.state=E.STATE.DYING;g.player.gameOver=true;g.gameOverTimer=200;}
                g.render();
            }
            if(mode==='delayed')h.flushImages();g.render();
            const stats=h.canvasStats();assert(!stats.invalid&&!stats.restoreUnderflow&&!stats.unbalanced.length);
        }finally{h.dispose();}
    }
    const fresh=createGameHarness({search:'?nointro',storage});
    try{assert.strictEqual(fresh.game.stageName,'z3_act2');assert.strictEqual(fresh.game.player.character,'rosie');assert.strictEqual(fresh.game.player.companion.character,'scar');}
    finally{fresh.dispose();}
});
