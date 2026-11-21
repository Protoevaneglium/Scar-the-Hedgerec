'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const D = require('../public/levels/rosie_dialogue');

let passed = 0;
function test(name, run) {
    run();
    passed++;
    console.log(`PASS ${name}`);
}
function pick(state, index, expectedNode) {
    const before = D.view(state);
    assert.strictEqual(D.choose(state, index, before.revision), true);
    const after = D.view(state);
    if (expectedNode !== undefined) assert.strictEqual(after.nodeId, expectedNode);
    return after;
}
function pathTo(target) {
    const queue = [['arrival', []], ['returning', []], ['low_rings', []], ['hug_greeting', []]];
    const seen = new Set();
    while (queue.length) {
        const [id, steps] = queue.shift();
        if (id === target) return steps;
        if (seen.has(id)) continue;
        seen.add(id);
        D.nodes[id].choices.forEach((item, index) => {
            if (item.next !== null) queue.push([item.next, steps.concat(index)]);
        });
    }
    return null;
}

test('the local database has reachable branches and a way out of every conversation', () => {
    assert.ok(Object.keys(D.nodes).length >= 20);
    for (const [id, node] of Object.entries(D.nodes)) {
        assert.ok(pathTo(id), `${id} is unreachable`);
        assert.ok(node.choices.length >= 2 && node.choices.length <= 3, id);
        assert.ok(Object.isFrozen(node) && Object.isFrozen(node.choices));
        const queue = [id], seen = new Set();
        let canSayGoodbye = false;
        while (queue.length && !canSayGoodbye) {
            const current = queue.shift();
            if (seen.has(current)) continue;
            seen.add(current);
            for (const item of D.nodes[current].choices) {
                assert.strictEqual(typeof item.label, 'string');
                assert.ok(item.label.length > 0 && item.label.length <= 90);
                if (item.next === null) canSayGoodbye = true;
                else {
                    assert.ok(Object.prototype.hasOwnProperty.call(D.nodes, item.next), `${current}: ${item.next}`);
                    queue.push(item.next);
                }
            }
        }
        assert.ok(canSayGoodbye, `${id} has no goodbye route`);
    }
});

test('a conversation branches coherently and recalls route, pace, race and hug choices', () => {
    const state = D.create();
    assert.strictEqual(state.memory.hugPreference, 'unknown');
    assert.strictEqual(D.start(state, { rings: 12 }).nodeId, 'arrival');
    pick(state, 0, 'story');
    pick(state, 1, 'care');
    pick(state, 0, 'together');
    pick(state, 1, 'hug_check');
    pick(state, 2, 'hug_space');
    assert.strictEqual(state.memory.hugPreference, 'space');
    pick(state, 0, 'sky_route');
    pick(state, 1, 'speed');
    pick(state, 0, 'race_yes');
    assert.strictEqual(state.memory.racePlan, 'yes');
    assert.strictEqual(state.memory.adventurePreference, 'speed');
    pick(state, 2, null);
    assert.strictEqual(D.view(state).open, false);
    const returning = D.start(state, { rings: 12 });
    assert.strictEqual(returning.nodeId, 'returning');
    assert.match(returning.text, /skyways/);
    const plan = pick(state, 0, 'plan');
    assert.match(plan.text, /sky roads/);
    assert.match(plan.text, /friendly race/);
    pick(state, 0, 'explore');
    pick(state, 1, 'plan_summary');
    assert.strictEqual(state.memory.routePreference, 'lower');
    assert.strictEqual(state.memory.adventurePreference, 'explore');
    assert.match(D.view(state).text, /lower marble ruins/);
    assert.match(D.view(state).text, /secrets and ring trails/);
    D.close(state);
    assert.match(D.start(state, { rings: 12 }).text, /lower ruins/);
    assert.strictEqual(state.memory.hugPreference, 'space');
    assert.strictEqual(state.memory.visits, 3);
});

test('greetings and lava advice use sanitized contextual snapshots', () => {
    const state = D.create(), source = { rings: 2.9, lavaActive: true, huggedRecently: false };
    assert.strictEqual(D.start(state, source).nodeId, 'low_rings');
    assert.match(D.view(state).text, /few rings/);
    assert.strictEqual(state.context.rings, 2);
    source.rings = 50; source.lavaActive = false;
    assert.strictEqual(state.context.rings, 2);
    assert.strictEqual(state.context.lavaActive, true);
    const before = JSON.stringify(state);
    D.start(state, { rings: 0, lavaActive: false, huggedRecently: true });
    assert.strictEqual(JSON.stringify(state), before, 'repeated starts must not restart or rewrite an active conversation');
    D.close(state);
    assert.match(D.start(state, { rings: 0 }).text, /out of rings/);
    D.close(state);
    assert.strictEqual(D.start(state, { rings: 0, huggedRecently: true }).nodeId, 'hug_greeting');
    pick(state, 0, 'hug_welcome');
    assert.strictEqual(state.memory.hugPreference, 'welcome');
    D.close(state);

    // Reach the same lava branch under both snapshots, rather than forcing its node id.
    for (const lavaActive of [false, true]) {
        D.start(state, { rings: 10, lavaActive });
        pick(state, 0, 'plan');
        pick(state, 0, 'explore');
        pick(state, 1, 'plan_summary');
        pick(state, 1, 'route');
        pick(state, 1, 'lower_route');
        const lava = pick(state, 0, 'lava');
        assert.match(lava.text, lavaActive ? /already active/ : /fifteen seconds of active play/);
        D.close(state);
    }
    const missing = D.create();
    assert.strictEqual(D.start(missing).nodeId, 'arrival', 'missing ring data must not invent an empty ring count');
});

test('asking for space, waiting for consent, and changing your mind are remembered', () => {
    const state = D.create();
    D.start(state, { huggedRecently: true });
    pick(state, 1, 'hug_space');
    assert.strictEqual(state.memory.hugPreference, 'space');
    pick(state, 1, 'hug_check');
    pick(state, 1, 'hug_ask');
    assert.strictEqual(state.memory.hugPreference, 'ask');
    assert.match(D.view(state).text, /No surprise hugs/);
    D.close(state);
    const restored = D.create(JSON.parse(JSON.stringify(state)));
    assert.strictEqual(restored.active, false);
    assert.strictEqual(restored.memory.hugPreference, 'ask');
    D.start(restored, { rings: 10, huggedRecently: true });
    pick(restored, 0, 'hug_welcome');
    assert.strictEqual(restored.memory.hugPreference, 'welcome');
});

test('stale clicks, held-key retries and invalid choices cannot advance the next node', () => {
    const state = D.create();
    const first = D.start(state, { rings: 10 });
    assert.strictEqual(D.choose(state, 0, first.revision), true);
    const after = JSON.stringify(state);
    assert.strictEqual(D.choose(state, 0, first.revision), false, 'duplicate callback must not pick a reply on the next node');
    for (const index of [-1, 3, 1000, 0.5, NaN, Infinity, '0', null, {}, Symbol('choice')]) {
        assert.strictEqual(D.choose(state, index, D.view(state).revision), false);
        assert.strictEqual(JSON.stringify(state), after);
    }
    for (const revision of [-1, 0.5, NaN, Infinity, '2', null, Symbol('revision')]) {
        assert.strictEqual(D.choose(state, 0, revision), false);
        assert.strictEqual(JSON.stringify(state), after);
    }
    assert.strictEqual(D.close(state), true);
    const closed = JSON.stringify(state);
    assert.strictEqual(D.close(state), false);
    assert.strictEqual(D.choose(state, 0), false);
    assert.strictEqual(JSON.stringify(state), closed);
    D.start(state, { rings: 10 });
    assert.strictEqual(D.choose(state, 0, first.revision), false, 'an earlier session button must stay stale');
});

test('serialized memory is bounded, copied and validated when restored', () => {
    const dirty = { memory: { visits: 100000, lastTopic: '__proto__', routePreference: 'teleport', adventurePreference: 'speed',
        racePlan: 'later', hugPreference: 'ask', topicVisits: { route: 90000, care: Infinity, plans: -1, rings: 2 },
        hugeHistory: new Array(10000).fill('not saved') }, context: { rings: -3 }, active: true, nodeId: 'route' };
    const state = D.create(JSON.parse(JSON.stringify(dirty)));
    assert.strictEqual(state.active, false);
    assert.strictEqual(state.nodeId, null);
    assert.strictEqual(state.memory.visits, 999);
    assert.strictEqual(state.memory.routePreference, 'unknown');
    assert.strictEqual(state.memory.topicVisits.route, 999);
    assert.strictEqual(state.memory.topicVisits.care, 0);
    assert.strictEqual(state.memory.topicVisits.plans, 0);
    assert.strictEqual(state.memory.racePlan, 'later');
    assert.strictEqual(state.memory.hugPreference, 'ask');
    assert.strictEqual(state.memory.hugeHistory, undefined);
    assert.ok(JSON.stringify(state).length < 1000);
    dirty.memory.racePlan = 'yes';
    assert.strictEqual(state.memory.racePlan, 'later');
    D.start(state, { rings: 10 });
    assert.match(pick(state, 0, 'plan').text, /saved the race idea for later/);
    const view = D.view(state);
    view.choices[0].label = 'corrupt';
    view.choices.length = 0;
    view.memory.hugPreference = 'welcome';
    view.memory.topicVisits.plans = 999;
    const fresh = D.view(state);
    assert.strictEqual(fresh.choices.length, 3);
    assert.notStrictEqual(fresh.choices[0].label, 'corrupt');
    assert.strictEqual(state.memory.hugPreference, 'ask');
    assert.notStrictEqual(state.memory.topicVisits.plans, 999);
});

test('corrupt states fail closed and revision counters remain finite at rollover', () => {
    for (const invalid of [null, undefined, false, 1, 'dialogue', [], Symbol('state')]) {
        assert.strictEqual(D.view(invalid).open, false);
        assert.strictEqual(D.start(invalid).open, false);
        assert.strictEqual(D.choose(invalid, 0), false);
        assert.strictEqual(D.close(invalid), false);
    }
    const corrupt = { active: true, nodeId: '__proto__', revision: Infinity, session: -1,
        context: { rings: Infinity, lavaActive: 'yes' }, memory: { visits: NaN }, lastChoice: { nodeId: 'constructor' } };
    assert.strictEqual(D.view(corrupt).open, false);
    assert.strictEqual(corrupt.revision, 0);
    assert.strictEqual(corrupt.session, 0);
    assert.strictEqual(corrupt.context.rings, null);
    assert.strictEqual(corrupt.context.lavaActive, false);
    assert.strictEqual(corrupt.lastChoice, null);
    const state = D.create();
    state.revision = D.MAX_TOKEN; state.session = D.MAX_TOKEN;
    const first = D.start(state, { rings: -10, lavaActive: true });
    assert.strictEqual(first.revision, 0);
    assert.strictEqual(first.session, 0);
    assert.strictEqual(first.nodeId, 'low_rings');
    assert.strictEqual(D.choose(state, 0, D.MAX_TOKEN), false);
    assert.strictEqual(D.choose(state, 0, first.revision), true);
    assert.strictEqual(state.revision, 1);
});

test('all reply branches execute safely and produce compact, independent views', () => {
    for (const [id, node] of Object.entries(D.nodes)) {
        for (const lavaActive of [false, true]) {
            for (let index = 0; index < node.choices.length; index++) {
                const state = D.create();
                state.active = true; state.nodeId = id;
                state.context = { rings: 3, lavaActive, huggedRecently: false };
                const view = D.view(state);
                assert.ok(view.text.length > 15 && view.text.length < 420, id);
                assert.deepStrictEqual(view.choices.map(item => item.index), Array.from({ length: node.choices.length }, (_, index) => index));
                const previousRevision = view.revision;
                assert.strictEqual(D.choose(state, index, previousRevision), true, `${id}:${index}`);
                assert.strictEqual(D.view(state).nodeId, node.choices[index].next);
                assert.strictEqual(state.lastChoice.nodeId, id);
                assert.strictEqual(D.choose(state, index, previousRevision), false, `${id}:${index} stale callback`);
            }
        }
    }
});

test('seeded adversarial conversations stay finite without growing a transcript', () => {
    let seed = 0x5ca77;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let state = D.create(), previousRevision = -1;
    for (let frame = 0; frame < 30000; frame++) {
        const view = D.view(state), action = random();
        if (!view.open) D.start(state, { rings: Math.floor(random() * 30), lavaActive: random() < 0.5, huggedRecently: random() < 0.1 });
        else if (action < 0.08) D.close(state);
        else if (action < 0.16) {
            const before = JSON.stringify(state);
            D.start(state, { rings: 0 });
            assert.strictEqual(JSON.stringify(state), before);
        } else if (action < 0.24 && previousRevision !== view.revision) {
            const before = JSON.stringify(state);
            assert.strictEqual(D.choose(state, 0, previousRevision), false);
            assert.strictEqual(JSON.stringify(state), before);
        } else {
            previousRevision = view.revision;
            pick(state, Math.floor(random() * view.choices.length));
        }
        if (frame % 311 === 0) state = D.create(JSON.parse(JSON.stringify(state)));
        assert.ok(Number.isSafeInteger(state.revision) && state.revision >= 0);
        assert.ok(Number.isSafeInteger(state.session) && state.session >= 0);
        assert.ok(state.memory.visits >= 0 && state.memory.visits <= 999);
        assert.ok(Object.values(state.memory.topicVisits).every(count => Number.isSafeInteger(count) && count >= 0 && count <= 999));
        assert.ok(JSON.stringify(state).length < 1200, 'conversation history must remain bounded');
    }
});

test('the same database loads directly in a browser without Node or network APIs', () => {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/levels/rosie_dialogue.js'), 'utf8'), sandbox);
    const browser = sandbox.window.RosieDialogue;
    assert.strictEqual(typeof browser.create, 'function');
    const state = browser.create();
    assert.strictEqual(browser.start(state, { rings: 10 }).speaker, 'Rosie');
    assert.strictEqual(browser.choose(state, 1, browser.view(state).revision), true);
    assert.strictEqual(browser.view(state).nodeId, 'sanctuary');
    assert.strictEqual(browser.close(state), true);
});

console.log(`Rosie dialogue: ${passed} groups passed; ${Object.keys(D.nodes).length} nodes and 30,000 adversarial actions.`);
