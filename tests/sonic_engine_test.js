/**
 * Headless tests for public/sonic-engine.js
 * Run:  node tests/sonic_engine_test.js
 */
'use strict';
const E = require('../public/sonic-engine.js');
const { PHYS, STATE, Terrain, Player, toDeg, getQuadrantMode, landingGroundSpeed, DEG } = E;

let failures = 0;
function test(name, fn) {
    try { fn(); console.log('  \u2713 ' + name); }
    catch (e) { failures++; console.log('  \u2717 ' + name + '\n      ' + (e && e.message)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function near(a, b, eps, msg) { assert(Math.abs(a - b) <= eps, `${msg}: got ${a}, expected ${b} ±${eps}`); }

/**
 * Drive a player at `hz` for `seconds`. script(frame60, player) -> { left, right, down, jump }.
 * observe(player, frame60) is called after every update; return true to stop early.
 */
function sim(player, seconds, hz, script, observe) {
    const dt = 1 / hz, n = Math.round(seconds * hz);
    let prevJump = false;
    for (let i = 0; i < n; i++) {
        const f = i * 60 / hz;
        const k = script(f, player) || {};
        const jump = !!k.jump;
        player.update({ left: !!k.left, right: !!k.right, down: !!k.down, jumpHeld: jump, jumpPressed: jump && !prevJump }, dt);
        prevJump = jump;
        if (observe && observe(player, f)) return f;
    }
    return null;
}

const terrain = new Terrain();
const spinDashThenRight = (f) => {
    if (f < 10) return { down: true };
    if (f < 45) { const k = Math.floor(f); return { down: true, jump: (k >= 12 && k < 14) || (k >= 20 && k < 22) || (k >= 28 && k < 30) || (k >= 36 && k < 38) }; }
    return { right: true };
};

console.log('\nSpec constants & tables');
test('core constants match spec', () => {
    const exp = { ACC: 0.046875, DEC: 0.5, FRC: 0.046875, TOP: 6, ROLL_FRC: 0.0234375, ROLL_DEC: 0.125,
        AIR_ACC: 0.09375, GRV: 0.21875, JMP: 6.5, JMP_RELEASE_CAP: -4, SLP_NORMAL: 0.125,
        SLP_ROLL_UP: 0.078125, SLP_ROLL_DOWN: 0.3125, FALL_THRESHOLD: 2.5, MAX_SPEED: 16 };
    for (const k in exp) assert(PHYS[k] === exp[k], `${k} = ${PHYS[k]}`);
    assert(E.HITBOX.STAND.width === 9 && E.HITBOX.STAND.height === 19 && E.HITBOX.STAND.push === 10, 'stand hitbox');
    assert(E.HITBOX.ROLL.width === 7 && E.HITBOX.ROLL.height === 14 && E.HITBOX.ROLL.push === 10, 'roll hitbox');
});
test('quadrant mode boundaries', () => {
    const cases = [[0, 0], [44.9, 0], [45, 1], [134.9, 1], [135, 2], [225, 2], [225.1, 3], [314.9, 3], [315, 0], [359.9, 0]];
    for (const [d, m] of cases) assert(getQuadrantMode(d * DEG) === m, `${d}° -> ${getQuadrantMode(d * DEG)}, want ${m}`);
});
test('landing momentum table', () => {
    near(landingGroundSpeed(4, 6, 10 * DEG), 4, 1e-9, 'shallow');
    near(landingGroundSpeed(2, 6, 320 * DEG), 3, 1e-9, 'half-steep downhill-right');
    near(landingGroundSpeed(2, 6, 30 * DEG), -3, 1e-9, 'half-steep downhill-left');
    near(landingGroundSpeed(7, 6, 320 * DEG), 7, 1e-9, 'half-steep |Xsp| > Ysp');
    near(landingGroundSpeed(2, 6, 300 * DEG), 6, 1e-9, 'steep downhill-right');
    near(landingGroundSpeed(-2, 6, 60 * DEG), -6, 1e-9, 'steep downhill-left');
});

console.log('\nTerrain');
test('surface normals are continuous (no seams) along the whole floor', () => {
    let maxJump = 0, at = 0;
    for (const s of terrain.floors.concat(terrain.ceilings)) {
        let prev = null;
        for (let x = s.x0; x <= s.x1; x += 1) {
            const n = s.normalAt(x), a = Math.atan2(-n.x, -n.y) / DEG;
            const step = prev === null ? 0 : Math.abs(((a - prev + 540) % 360) - 180);
            if (step > maxJump) { maxJump = step; at = x; }
            prev = a;
        }
    }
    assert(maxJump < 1.0, `max angle step per px = ${maxJump.toFixed(3)}° at x=${at}`);
});
test('course hits the required slope angles', () => {
    const f = terrain.mainFloor;
    const maxDeg = (x0, x1) => { let m = 0; for (let x = x0; x <= x1; x += 0.5) m = Math.max(m, Math.abs(Math.atan(f.df(x)) / DEG)); return m; };
    near(maxDeg(1000, 1400), 25, 0.05, 'hill 1'); near(maxDeg(2600, 3000), 40, 0.05, 'last hill');
    near(maxDeg(3150, 3570), 60, 0.05, 'valley drop');
    near(maxDeg(5280, terrain.lip.x), 45, 0.05, 'launch ramp');
});
test('getSurfaceAt returns continuous loop normals on both layers', () => {
    const L = terrain.loop;
    const s0 = terrain.raycast(L.cx + 50, L.cy, 1, 0, 200, 0);
    assert(s0 && Math.abs(toDeg(s0.angle) - 90) < 1e-6, 'layer 0 right wall = 90°');
    const s1 = terrain.raycast(L.cx - 50, L.cy, -1, 0, 200, 1);
    assert(s1 && Math.abs(toDeg(s1.angle) - 270) < 1e-6, 'layer 1 left wall = 270°');
    assert(!terrain.raycast(L.cx - 50, L.cy, -1, 0, 200, 0), 'left wall is not solid on layer 0');
    assert(!terrain.raycast(L.cx + 50, L.cy, 1, 0, 200, 1), 'right wall is not solid on layer 1');
    const g = terrain.getSurfaceAt(500, 0, 0);
    assert(g && g.y === 600 && g.angleDeg === 0, 'runway surface');
});

console.log('\nGround movement');
test('flat run reaches exactly TOP and stops adding ACC', () => {
    const p = new Player(terrain);
    sim(p, 4, 60, () => ({ right: true }));
    assert(p.gsp === PHYS.TOP, `gsp=${p.gsp}`);
    assert(p.state === STATE.RUNNING, p.state);
});
test('skid: DEC snaps to -0.5 when crossing zero', () => {
    const p = new Player(terrain); p.gsp = 0.3; p.state = STATE.RUNNING;
    sim(p, 1 / 60, 60, () => ({ left: true }));
    near(p.gsp, -0.5, 1e-9, 'gsp');
});
test('roll entry requires |gsp| >= 1 and applies +5px curl offset', () => {
    const p = new Player(terrain); p.gsp = 0.9; p.state = STATE.RUNNING;
    const y0 = p.y;
    sim(p, 1 / 60, 60, () => ({ down: true }));
    assert(p.state !== STATE.ROLLING, 'rolled below 1.0');
    const q = new Player(terrain); q.gsp = 3; q.state = STATE.RUNNING;
    sim(q, 1 / 60, 60, () => ({ down: true }));
    assert(q.state === STATE.ROLLING && q.curled, 'should roll');
    near(q.y, y0 + 5, 1e-6, 'curl offset');
});
test('spin dash: launch = 8 + floor(rev)/2, enters ROLLING', () => {
    const p = new Player(terrain);
    let launched = null;
    p.events.spindashRelease = (v) => { launched = v; };
    sim(p, 46 / 60, 60, spinDashThenRight);
    assert(launched !== null, 'no launch');
    assert(launched >= 8 && launched <= 12, `launch ${launched}`);
    assert(p.state === STATE.ROLLING, p.state);
    near(p.y, 600 - 14, 1e-6, 'rolling centre height');
});
test('rolling: cannot accelerate, uncurls below 0.5 (-5px)', () => {
    const p = new Player(terrain); p.gsp = 2; p.state = STATE.RUNNING;
    sim(p, 1 / 60, 60, () => ({ down: true }));
    const g0 = p.gsp;
    sim(p, 10 / 60, 60, () => ({ right: true }));
    assert(p.gsp < g0, 'rolling gained speed from input');
    sim(p, 6, 60, () => ({}));
    assert(p.state === STATE.STANDING && !p.curled, p.state);
    near(p.y, 600 - 19, 1e-6, 'standing centre height');
});

console.log('\nAir');
test('full jump peak ≈ 96px, short hop capped by -4 release', () => {
    const peak = (holdFrames) => {
        const p = new Player(terrain); const y0 = p.y; let minY = y0;
        sim(p, 2, 60, (f) => ({ jump: f < holdFrames }), (pl) => { minY = Math.min(minY, pl.y); });
        return (y0 + 5) - minY; // +5: jump curl offset
    };
    const full = peak(120), hop = peak(1);
    assert(full > 90 && full < 105, `full jump ${full.toFixed(1)}`);
    assert(hop > 30 && hop < 45, `short hop ${hop.toFixed(1)}`);
});
test('landing from a jump returns to RUNNING/STANDING with standing hitbox', () => {
    const p = new Player(terrain);
    sim(p, 2, 60, (f) => ({ jump: f < 2 }));
    assert(p.grounded && !p.curled && p.state === STATE.STANDING, p.state);
    near(p.y, 581, 1e-6, 'y');
});
test('landing on the 60° slope converts Ysp into gsp (steep rule)', () => {
    const p = new Player(terrain);
    const x = 3360, sy = terrain.mainFloor.f(x);
    p.x = x; p.y = sy - 60; p.state = STATE.AIRBORNE; p.xsp = 0; p.ysp = 4; p.curled = true;
    let info = null; p.events.land = (d) => { info = d; };
    sim(p, 1, 60, () => ({}), () => info);
    assert(info, 'never landed');
    assert(info.angleDeg > 295 && info.angleDeg < 305, `angle ${info.angleDeg}`);
    near(info.gsp, info.ysp, 1e-9, 'gsp = Ysp * -sign(sin)');
});

console.log('\nLoop');
function loopRun(gsp, hz = 60) {
    const p = new Player(terrain);
    p.place(3650); p.gsp = gsp; p.state = STATE.RUNNING;
    const modes = new Set(), layers = [p.layer]; let air = false, detach = null, minY = Infinity;
    p.events.detach = (d) => { detach = d; };
    sim(p, 4, hz, () => ({ right: true }), (pl) => {
        if (pl.x > 3850 && pl.x < 4150) { modes.add(pl.mode); if (!pl.grounded) air = true; minY = Math.min(minY, pl.y); }
        if (layers[layers.length - 1] !== pl.layer) layers.push(pl.layer);
    });
    return { p, modes, layers, air, detach, minY };
}
test('loop at gsp 10: all 4 modes, layer 0→1, never airborne, exits right', () => {
    const r = loopRun(10);
    assert(r.modes.size === 4, `modes ${[...r.modes]}`);
    assert(!r.air, 'went airborne inside the loop');
    assert(r.layers.join() === '0,1', `layers ${r.layers}`);
    assert(r.p.x > terrain.gates.exitX && r.p.grounded, `x=${r.p.x.toFixed(1)}`);
    assert(r.minY < terrain.loop.cy - 100, 'never reached the top');
});
test('loop at gsp 10 also works at 144 Hz and 30 Hz', () => {
    for (const hz of [144, 30]) {
        const r = loopRun(10, hz);
        assert(r.modes.size === 4 && !r.air && r.p.x > terrain.gates.exitX, `${hz} Hz failed`);
    }
});
test('slow loop entry slips: detaches at 70–290° and sets 30-frame control lock', () => {
    const p = new Player(terrain);
    p.place(3650); p.gsp = 9; p.state = STATE.RUNNING;
    let detach = null, lock = 0;
    p.events.detach = (d, pl) => { detach = d; lock = pl.controlLock; };
    sim(p, 5, 60, () => ({}), () => detach !== null);
    assert(detach !== null, 'never detached');
    assert(detach >= 70 && detach <= 290, `detach angle ${detach}`);
    assert(lock === 30, `lock ${lock}`);
});
test('reverse traversal: apex flips to layer 0 when gsp < 0', () => {
    const p = new Player(terrain);
    p.place(4300); p.layer = 1; p.gsp = -10; p.state = STATE.RUNNING; p.facing = -1;
    const layers = [p.layer]; let air = false;
    sim(p, 3, 60, () => ({ left: true }), (pl) => {
        if (layers[layers.length - 1] !== pl.layer) layers.push(pl.layer);
        if (pl.x > 3850 && pl.x < 4150 && !pl.grounded) air = true;
    });
    assert(!air, 'airborne in reverse loop');
    assert(layers.join() === '1,0', `layers ${layers}`);
    assert(p.x < terrain.gates.entryX, `x=${p.x.toFixed(1)}`);
});

console.log('\nFull course');
function courseRun(script, hz) {
    const p = new Player(terrain);
    let deaths = 0; p.events.death = () => deaths++;
    const goal = terrain.gap.x1 + 100;
    const t = sim(p, 60, hz, script, (pl) => pl.x > goal && pl.grounded);
    return { t, deaths, p };
}
test('spin dash + hold right clears hills, drop, loop, tunnel and the gap', () => {
    const r = courseRun(spinDashThenRight, 60);
    assert(r.t !== null && r.deaths === 0, `t=${r.t} deaths=${r.deaths} x=${r.p.x.toFixed(0)}`);
    console.log(`      (reached plateau in ${(r.t / 60).toFixed(2)}s)`);
});
test('plain running (hold right) also completes the course', () => {
    const r = courseRun(() => ({ right: true }), 60);
    assert(r.t !== null && r.deaths === 0, `t=${r.t} deaths=${r.deaths} x=${r.p.x.toFixed(0)} state=${r.p.state}`);
    console.log(`      (reached plateau in ${(r.t / 60).toFixed(2)}s)`);
});
test('refresh-rate independence: 30 / 60 / 144 Hz finish within 2% of each other', () => {
    const times = [30, 60, 144].map((hz) => courseRun(() => ({ right: true }), hz).t);
    assert(times.every((t) => t !== null), `times ${times}`);
    const lo = Math.min(...times), hi = Math.max(...times);
    assert((hi - lo) / lo < 0.02, `times(frames) ${times.map((t) => t.toFixed(1))}`);
    console.log(`      (frames: ${times.map((t) => t.toFixed(1)).join(' / ')})`);
});

console.log('\nPalmtree Panic Zone Act 1 (Sonic CD)');
test('Palmtree Panic course builds multi-tiered floors, 2 loops, and all Good Future objects', () => {
    const pt = new Terrain('palmtree');
    assert(pt.loops.length === 2, `loops=${pt.loops.length}`);
    assert(pt.platforms.length > 0 && pt.swingPlatforms.length > 0, 'platforms & swingPlatforms');
    assert(pt.bouncePoles.length > 0 && pt.spinners.length > 0, 'bouncePoles & spinners');
    assert(pt.houdiniGroups.length > 0 && pt.breakableWalls.length > 0, 'houdiniGroups & breakableWalls');
    assert(pt.breakableFloors.length > 0 && pt.trapDoors.length > 0 && pt.rocks.length > 0, 'floors, trapDoors, rocks');
    assert(pt.rings.length > 100 && pt.enemies.length > 5 && pt.goalPost, 'rings, badniks, goalPost');
    assert(E.PALMTREE_SPRITES && E.PALMTREE_SPRITES.poleStraight.w === 32, 'PALMTREE_SPRITES atlas');
});
test('Bounce Pole bends and launches Sonic high into the air', () => {
    const pt = new Terrain('palmtree');
    const p = new Player(pt);
    const bp = pt.bouncePoles[0];
    p.x = bp.x; p.y = bp.y - 20; p.state = STATE.AIRBORNE; p.ysp = 3;
    sim(p, 2 / 60, 60, () => ({}));
    assert(bp.state === 'down' || bp.state === 'up', `pole state=${bp.state}`);
    assert(p.ysp < -10 && p.curled && p.state === STATE.AIRBORNE, `ysp=${p.ysp}`);
});
test('Breakable Wall shatters when rolled through without stopping Sonic', () => {
    const pt = new Terrain('palmtree');
    const p = new Player(pt);
    const wall = pt.breakableWalls[0];
    p.place(wall.x - 45, 0, wall.y);
    p.curl(); p.state = STATE.ROLLING; p.gsp = 8;
    sim(p, 15 / 60, 60, () => ({ right: true }));
    assert(wall.broken && !wall.leftSurf.enabled, 'wall should be shattered');
    assert(p.x > wall.x && p.gsp > 6, `Sonic blasted through: x=${p.x.toFixed(1)} gsp=${p.gsp.toFixed(2)}`);
});
test('Breakable Floor collapses into 16x16 tiles after standing on it', () => {
    const pt = new Terrain('palmtree');
    const p = new Player(pt);
    const bf = pt.breakableFloors[0];
    p.place(bf.x + 32, 0, bf.y);
    assert(!bf.broken && p.groundSurface === bf.surface, 'standing on breakable floor');
    sim(p, 30 / 60, 60, () => ({}));
    assert(bf.broken && !bf.surface.enabled, 'breakable floor collapsed');
    assert(pt.debris.some((d) => d.kind === 'floorTile'), 'spawned 16x16 floor tile debris');
});
test('Full Palmtree Panic Act 1 run reaches and spins the Goal Signpost', () => {
    const pt = new Terrain('palmtree');
    const p = new Player(pt);
    let deaths = 0; p.events.death = () => deaths++;
    const f = sim(p, 40, 60, spinDashThenRight, () => pt.goalPost.spinning || pt.goalPost.cleared);
    assert(f !== null && deaths === 0, `f=${f} deaths=${deaths} x=${p.x.toFixed(0)}`);
    assert(p.rings > 10 && p.score > 1000, `rings=${p.rings} score=${p.score}`);
    console.log(`      (cleared Palmtree Panic Act 1 in ${(f / 60).toFixed(2)}s with ${p.rings} rings, score ${p.score})`);
});

console.log('\nModular Level Core Template & 3-Act Zone Architecture');
test('Blank Level Core Template registers and runs Scar through Shield TV, 1-Up TV, rings, checkpoint, and Goal Post', () => {
    require('../templates/level_template.js');
    assert(Terrain.LEVELS.template, 'template level registered');
    const lt = new Terrain('template');
    const p = new Player(lt);
    assert(p.lives === 3, `initial lives=${p.lives}`);
    assert(lt.monitors.length === 2 && lt.springs.length === 1 && lt.starPosts.length === 1 && lt.goalPost, 'common objects loaded');
    const f = sim(p, 15, 60, spinDashThenRight, () => lt.goalPost.spinning || lt.goalPost.cleared);
    assert(f !== null && p.shield === true && p.lives === 4 && lt.starPosts[0].active, `cleared template in f=${f}, shield=${p.shield}, lives=${p.lives}`);
});

test('Classic Lives System grants 1-Up every 100 rings and triggers GAME OVER / TIME OVER at 0 lives', () => {
    const lt = new Terrain('template');
    let oneUps = 0, gameOverReason = null;
    const p = new Player(lt, {
        oneUp: () => oneUps++,
        gameOver: (reason) => { gameOverReason = reason; },
    });
    assert(p.lives === 3 && !p.gameOver, 'starts with 3 lives');
    p.addRings(99);
    assert(p.lives === 3 && oneUps === 0, '99 rings not yet 1-Up');
    p.addRings(1);
    assert(p.lives === 4 && oneUps === 1, '100 rings grants +1 life');
    p.addRings(100);
    assert(p.lives === 5 && oneUps === 2, '200 rings grants second +1 life');

    // Lose 4 lives -> still alive at 1 life
    p.loseLife('GAME OVER');
    p.loseLife('GAME OVER');
    p.loseLife('GAME OVER');
    p.loseLife('GAME OVER');
    assert(p.lives === 1 && !p.gameOver, `lives=${p.lives} gameOver=${p.gameOver}`);

    // Final life lost via TIME OVER -> triggers gameOver
    p.loseLife('TIME OVER');
    assert(p.lives === 0 && p.gameOver === true && gameOverReason === 'TIME OVER', `gameOver=${p.gameOver} reason=${gameOverReason}`);
});

test('Zone 1 Act 2 and Act 3 (Boss Act Animal Capsule) register and complete 3-Act Zone progression', () => {
    require('../public/levels/zone1_act2.js');
    require('../public/levels/zone1_act3.js');
    require('../templates/boss_act_template.js');
    assert(Terrain.LEVELS.z1_act2 && Terrain.LEVELS.z1_act3 && Terrain.LEVELS.boss_template, 'Act 2, Act 3 & Boss Template registered');
    assert(Terrain.LEVELS.z1_act2.act === 2 && !Terrain.LEVELS.z1_act2.isBossAct, 'Act 2 metadata');
    assert(Terrain.LEVELS.z1_act3.act === 3 && Terrain.LEVELS.z1_act3.isBossAct === true, 'Act 3 Boss metadata');

    // Run Act 2 through Goal Post
    const t2 = new Terrain('z1_act2');
    const p2 = new Player(t2);
    const f2 = sim(p2, 15, 60, spinDashThenRight, () => t2.goalPost.spinning || t2.goalPost.cleared);
    assert(f2 !== null && p2.lives === 4, `cleared z1_act2 in f=${f2}, lives=${p2.lives}`);

    // Drop Scar onto Act 3's Animal Capsule plunger button and verify it opens & clears!
    const t3 = new Terrain('z1_act3');
    const p3 = new Player(t3);
    assert(t3.goalPost === null && t3.capsule && !t3.capsule.opened, 'Act 3 uses Animal Capsule instead of Goal Post');
    p3.x = t3.capsule.x;
    p3.y = t3.capsule.y - 110;
    p3.state = STATE.AIRBORNE;
    p3.curl();
    const f3 = sim(p3, 5, 60, () => ({}), () => t3.capsule.cleared);
    assert(f3 !== null && t3.capsule.opened && t3.capsule.cleared, `opened & cleared Act 3 Animal Capsule in f=${f3}`);
});

console.log(failures ? `\n${failures} FAILED\n` : '\nAll tests passed\n');
process.exit(failures ? 1 : 0);

