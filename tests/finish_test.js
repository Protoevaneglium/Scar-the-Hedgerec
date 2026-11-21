'use strict';
const assert=require('assert');
const {Terrain,Player,STATE}=require('../public/sonic-engine');
require('../public/levels/zone1_act2');require('../public/levels/zone2_act1');
require('../public/levels/kitt_boss');require('../public/levels/zone1_act3');
console.log('\nSignpost completion');
{
    const terrain=new Terrain('palmtree');
    assert(Math.abs(terrain.mainFloor.f(760)-742)<.01,'the cavern floor must meet its springs and loop entrance');
    assert(Math.abs(terrain.mainFloor.f(1660)-terrain.greenSlide.f(1660))<.01,'the two opening routes must reconnect at the same height');
    for(const loop of terrain.loops)assert(Math.abs(terrain.mainFloor.f(loop.cx)-loop.cy-loop.r)<.01,'loops must be tangent to their floor');
    assert(Math.abs(terrain.goalPost.y-terrain.mainFloor.f(terrain.goalPost.x))<.01,'the final signpost must stand on the finish deck');
    const monitor=terrain.monitors.find(m=>m.x===4720);
    const arch=terrain.floors.find(f=>f.name==='giant dome arch crest');
    assert(Math.abs(monitor.y-arch.f(monitor.x))<.01,'the crest monitor must stand on the upper road');
}
for(const stage of ['palmtree','z1_act2','z2_act1'])for(const hz of [30,60,144]){
    const terrain=new Terrain(stage),player=new Player(terrain);
    const goal=terrain.goalPost;
    player.place(goal.x-50,0,goal.y);player.curl();player.state=STATE.ROLLING;
    player.gsp=player.xsp=16;
    for(let i=0;i<hz*6;i++) {
        const jump=goal.spinning && i%20===0;
        player.update({right:true,jumpPressed:jump,jumpHeld:jump},1/hz);
    }
    assert(goal.cleared,`${stage} at ${hz} Hz must finish the signpost animation`);
    assert.strictEqual(player.lives,3,`${stage} at ${hz} Hz must not lose a life while finishing`);
    assert(player.x<terrain.endX&&player.y<terrain.deathY,'holding controls must not escape the finish area');
    terrain.hurtPlayer(player,player.x+10);
    assert.strictEqual(player.lives,3);assert.notStrictEqual(player.state,STATE.DYING);
}
console.log('  ✓ every normal act completes safely at 30/60/144 Hz while Run and Jump are held');

console.log('\nDamage and rescue protection');
for (const stage of ['palmtree', 'z1_act2', 'z1_act3', 'z2_act1']) {
    const terrain = new Terrain(stage), player = new Player(terrain);
    player.rings = 10;
    terrain.hurtPlayer(player, player.x + 10);
    assert.strictEqual(player.rings, 0);
    assert.strictEqual(player.state, STATE.AIRBORNE);
    terrain.hurtPlayer(player, player.x + 10);
    assert.strictEqual(player.state, STATE.AIRBORNE,
        `${stage}: a second damage source must respect the recovery window`);
    assert.strictEqual(terrain.scatteredRings.length, 10, 'protected hits must not scatter rings twice');
    player.invulnTimer = 0;
    terrain.hurtPlayer(player, player.x + 10);
    assert.strictEqual(player.state, STATE.DYING, 'damage must resume once protection expires');
    player.shield = true;
    terrain.hurtPlayer(player, player.x + 10);
    assert.strictEqual(player.state, STATE.DYING, 'damage must never replace the death animation with knockback');
}
for (const hz of [30, 60, 144]) {
    const terrain = new Terrain('z1_act3'), player = new Player(terrain);
    terrain.boss.defeated = true;
    const cap = terrain.capsule;
    player.x = cap.x; player.y = cap.y - 130;
    player.state = STATE.AIRBORNE; player.curled = true;
    player.xsp = player.gsp = 0; player.ysp = 2;
    let opened = false;
    for (let i = 0; i < hz * 6; i++) {
        player.update({}, 1 / hz);
        if (cap.opened) {
            opened = true;
            terrain.hurtPlayer(player, player.x + 10);
            assert.notStrictEqual(player.state, STATE.DYING, 'hazards must not interrupt a won capsule rescue');
        }
        if (cap.cleared) break;
    }
    assert(opened && cap.cleared && cap.releasedCount === 12,
        `rescue under repeated hazard contact must finish at ${hz} Hz`);
    assert.strictEqual(player.lives, 3);
}
console.log('  ✓ overlapping damage respects recovery and death; capsule rescues finish safely at 30/60/144 Hz');
