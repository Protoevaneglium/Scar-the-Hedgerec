/** Local branching conversations for Rosie. Only the small state object is saved. */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RosieDialogue = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    const MAX_TOKEN = 2147483647;
    const TOPICS = ['route', 'ruins', 'care', 'plans', 'hugs', 'race', 'rings'];
    const ENUMS = {
        routePreference: ['unknown', 'sky', 'lower'],
        adventurePreference: ['unknown', 'explore', 'speed'],
        racePlan: ['none', 'yes', 'later'],
        hugPreference: ['unknown', 'welcome', 'ask', 'space'],
    };
    const choice = (label, next, remember) => ({ label, next, remember });
    const bye = (label = 'See you in a bit.') => choice(label, null);
    const nodes = {
        arrival: { topic: 'care', text: 'Scar! I was hoping that was you coming over the arches. You made it!', choices: [
            choice('I made it. Are you okay?', 'story'), choice('Tell me about this place.', 'sanctuary'), bye('Glad you are safe. See you soon.'),
        ] },
        returning: { topic: 'care', text: s => s.memory.routePreference === 'sky'
            ? 'Good to see you again! Still thinking about those skyways, or have you changed your mind?'
            : s.memory.routePreference === 'lower'
                ? 'Back already? Are the lower ruins still calling to you, or should we pick another plan?'
                : 'There you are! What is on your mind now?', choices: [
            choice('Let us talk about our plan.', 'plan'), choice('How are you feeling?', 'feelings'), bye(),
        ] },
        low_rings: { topic: 'rings', text: s => s.context.rings === 0
            ? 'You made it here, and that matters. But you are out of rings. Let us find a few before another risky landing.'
            : 'You made it here! You only have a few rings left, though. Let us find a few more before another risky landing.', choices: [
            choice('Where should I look?', 'ring_hint'), choice('I am okay. How are you?', 'feelings'), bye('I will find some. Back soon.'),
        ] },
        hug_greeting: { topic: 'hugs', text: 'I was glad to see you. I hope that hug did not startle you. How did it feel?', choices: [
            choice('I liked it.', 'hug_welcome', { hugPreference: 'welcome' }),
            choice('Some space would be nice.', 'hug_space', { hugPreference: 'space' }),
            choice('Let us talk for a while.', 'hub'),
        ] },
        hub: { topic: 'care', text: 'I am listening. What would you like to talk about?', choices: [
            choice('The way ahead.', 'route'), choice('You and this place.', 'personal'), bye(),
        ] },
        personal: { topic: 'care', text: 'It is nice having a quiet moment between all that running. What are you wondering about?', choices: [
            choice('How did you get here?', 'story'), choice('Are you enjoying the sanctuary?', 'feelings'), bye('Let us catch up again later.'),
        ] },
        route: { topic: 'route', text: 'There are floating temple roads above and marble ruins below. Which way sounds more like us?', choices: [
            choice('Let us take the high road.', 'sky_route', { routePreference: 'sky' }),
            choice('I want to see the lower ruins.', 'lower_route', { routePreference: 'lower' }), bye('I will decide after a look around.'),
        ] },
        sky_route: { topic: 'route', text: 'The upper arches keep us clear of the lava crossings. Follow the ring trails and give yourself room to land after each launch.', choices: [
            choice('How do I reach those arches?', 'updraft'), choice('I like a fast way through.', 'speed', { adventurePreference: 'speed' }), bye('High road it is. See you soon.'),
        ] },
        lower_route: { topic: 'route', text: s => s.context.lavaActive
            ? 'The lower ruins are interesting, but the lava is awake now. The basalt stepping stones are the safe places to touch down.'
            : 'The lower ruins have wonderful old stonework. Just remember that the lava wakes fifteen seconds after the act begins.', choices: [
            choice('Tell me more about the lava.', 'lava'), choice('Maybe the sky is safer.', 'sky_route', { routePreference: 'sky' }), bye('I will watch my landings.'),
        ] },
        updraft: { topic: 'route', text: 'Look for the turquoise vents. Step onto one and let the updraft lift you into a sky route. Keep an eye on where you will land.', choices: [
            choice('Then I will take the skyway.', 'plan_summary', { routePreference: 'sky' }),
            choice('What about the moving platforms?', 'lifts'), bye('I will try a vent. Back soon.'),
        ] },
        lifts: { topic: 'route', text: 'Watch a stone lift for a moment, then step on as it comes near. There is no prize for rushing the part before a safe landing.', choices: [
            choice('I can be patient with the timing.', 'steady'), choice('I would rather keep running.', 'speed', { adventurePreference: 'speed' }), bye('Let me watch the lifts first.'),
        ] },
        lava: { topic: 'route', text: s => s.context.lavaActive
            ? 'It is already active. Rings and shields help with a mistake, but staying on the sky roads or basalt stones is the better plan.'
            : 'It may look quiet, but it ignites after fifteen seconds of active play. Find a higher road before that countdown runs out.', choices: [
            choice('Show me the safer route.', 'updraft', { routePreference: 'sky' }), choice('Would a shield protect me?', 'shield'), bye('Understood. I will keep clear.'),
        ] },
        ring_hint: { topic: 'rings', text: 'There are ring trails above the basalt stones and along the sky roads. Take a few, find your footing, then think about the next jump.', choices: [
            choice('I will follow those trails.', 'steady'), choice('Can a shield help too?', 'shield'), bye('Off to find some rings!'),
        ] },
        shield: { topic: 'rings', text: 'A shield can take one hit for you. It is a little breathing room, not a reason to linger on hot lava. I would still choose a safe deck.', choices: [
            choice('High road and a shield, then.', 'plan_summary', { routePreference: 'sky' }), choice('What if I have no rings?', 'low_rings'), bye('Thanks. I will be careful.'),
        ] },
        sanctuary: { topic: 'ruins', text: 'I keep looking at the columns and wondering who built them. Imagine making all this stonework up here among the clouds.', choices: [
            choice('Why do you think the islands float?', 'wonder'), choice('Have you spotted any secrets?', 'secrets'), bye('I want to see more of it.'),
        ] },
        wonder: { topic: 'ruins', text: 'I do not know! I like imagining the wind holding them up. Whatever the reason, I am happy the stepping stones are solid under my feet.', choices: [
            choice('Let us take time to explore.', 'explore', { adventurePreference: 'explore' }), choice('A race among the clouds sounds fun.', 'race_offer'), bye('I will enjoy the view for a while.'),
        ] },
        secrets: { topic: 'ruins', text: 'There is a treasure balcony above the cloud road. A good spring launch and those high ring trails are worth following if you want a detour.', choices: [
            choice('A detour sounds perfect.', 'explore', { adventurePreference: 'explore' }), choice('How do I get up there?', 'updraft'), bye('I will look for that balcony.'),
        ] },
        story: { topic: 'care', text: 'I took the rising lifts and watched each landing. Some of those towers shook! I was very happy to reach this temple and see you coming.', choices: [
            choice('That sounds brave.', 'brave'), choice('I was worried about you.', 'care'), bye('I am glad you made it.'),
        ] },
        brave: { topic: 'care', text: 'I was nervous. I kept picking one safe stone at a time. It feels easier now that we can compare notes.', choices: [
            choice('We can take the next part slowly.', 'explore', { adventurePreference: 'explore' }), choice('Next time we go together.', 'together'), bye('You did well. See you soon.'),
        ] },
        care: { topic: 'care', text: 'I was watching the arches for you too. I am glad we both have a moment to catch our breath now.', choices: [
            choice('I am here now.', 'together'), choice('I need a little space after that run.', 'hug_space', { hugPreference: 'space' }), bye('Let us rest a moment.'),
        ] },
        feelings: { topic: 'care', text: s => s.memory.adventurePreference === 'speed'
            ? 'Relieved! You make those fast runs look exciting. I like it best when we still have time to check on each other.'
            : 'Relieved, mostly! The shaking ruins were a little much. The clouds look much nicer with someone here to share the view.', choices: [
            choice('What should we do next?', 'plan'), choice('Let us just enjoy this view.', 'view_pause'), bye('I will check in again soon.'),
        ] },
        view_pause: { topic: 'ruins', text: 'For a moment, let us just watch the clouds. We have earned a small quiet bit between the jumps.', choices: [
            choice('Then we can explore.', 'explore', { adventurePreference: 'explore' }), choice('Ready to make a plan?', 'plan'), bye('I will sit with that thought.'),
        ] },
        plan: { topic: 'plans', text: s => {
            const route = s.memory.routePreference === 'sky' ? 'You picked the sky roads last time.'
                : s.memory.routePreference === 'lower' ? 'You wanted to look through the lower ruins.' : 'We have not picked a route yet.';
            const race = s.memory.racePlan === 'yes' ? ' And you liked the idea of a friendly race!'
                : s.memory.racePlan === 'later' ? ' We saved the race idea for later.' : '';
            return `${route}${race} Do you feel like exploring, or making a fast run? We can change our minds.`;
        }, choices: [
            choice('Explore and look for secrets.', 'explore', { adventurePreference: 'explore' }),
            choice('Go fast and have a friendly race.', 'speed', { adventurePreference: 'speed' }), bye('Let me think about it.'),
        ] },
        explore: { topic: 'plans', text: 'Then let us follow the interesting ring trails rather than the shortest line. Which part would you like to see first?', choices: [
            choice('The floating temples.', 'plan_summary', { routePreference: 'sky' }),
            choice('The old marble ruins below.', 'plan_summary', { routePreference: 'lower' }), bye('I will scout a little first.'),
        ] },
        speed: { topic: 'plans', text: 'Fast can be fun! I would keep the landings safe, though. Do you want a friendly race, or shall we save that idea?', choices: [
            choice('Let us have a friendly race.', 'race_yes', { racePlan: 'yes', adventurePreference: 'speed' }),
            choice('Maybe after we catch our breath.', 'race_later', { racePlan: 'later' }), bye('I will warm up first.'),
        ] },
        race_offer: { topic: 'race', text: 'A friendly race? I like that idea. You can take the lead; I am still choosing safe footing.', choices: [
            choice('Sounds good. I am in.', 'race_yes', { racePlan: 'yes', adventurePreference: 'speed' }),
            choice('Save it for later.', 'race_later', { racePlan: 'later' }), bye('Let me think about it.'),
        ] },
        race_yes: { topic: 'race', text: 'A friendly race sounds fun! You set your pace; I would still choose safe landings. Tell me which route you liked when you get back.', choices: [
            choice('Which route should we choose?', 'route'), choice('I want to know how you feel first.', 'feelings'), bye('I will tell you how the run goes.'),
        ] },
        race_later: { topic: 'race', text: 'Deal. No hurry to turn every path into a race. We can enjoy this part first and bring the idea back later.', choices: [
            choice('Good. Let us explore instead.', 'explore', { adventurePreference: 'explore' }),
            choice('Can we change our route?', 'route'), bye('We will talk about it later.'),
        ] },
        together: { topic: 'care', text: 'That sounds good to me. I will stay nearby, and you can tell me when you want a chat or a little room.', choices: [
            choice('Let us make a plan.', 'plan'), choice('Can we talk about hugs?', 'hug_check'), bye('I am glad you are here.'),
        ] },
        hug_check: { topic: 'hugs', text: 'Of course. Do you like surprise hugs, would you rather I wait, or would some space feel better?', choices: [
            choice('I like your hugs.', 'hug_welcome', { hugPreference: 'welcome' }),
            choice('Wait for me to say yes.', 'hug_ask', { hugPreference: 'ask' }),
            choice('Some space, please.', 'hug_space', { hugPreference: 'space' }),
        ] },
        hug_welcome: { topic: 'hugs', text: 'Okay! I will remember that. You can always tell me if you feel differently later.', choices: [
            choice('Let us make a plan.', 'plan'), choice('Tell me more about your trip.', 'story'), bye('Thanks, Rosie.'),
        ] },
        hug_ask: { topic: 'hugs', text: 'Of course. No surprise hugs. You can tell me when you want one, and I am still happy to talk in the meantime.', choices: [
            choice('Thanks for understanding.', 'together'), choice('What is the safest way ahead?', 'updraft'), bye('See you in a little while.'),
        ] },
        hug_space: { topic: 'hugs', text: 'Of course. I will give you room. We can still trade stories and plans whenever you want.', choices: [
            choice('Thanks. What about the sky road?', 'sky_route', { routePreference: 'sky' }),
            choice('I might feel differently later.', 'hug_check'), bye('Thanks for understanding.'),
        ] },
        steady: { topic: 'plans', text: 'One clear landing at a time. That is how I got through the shaky towers. What would help you feel ready now?', choices: [
            choice('Picking our route.', 'route'), choice('A quiet chat first.', 'feelings'), bye('I am ready. See you soon.'),
        ] },
        plan_summary: { topic: 'plans', text: s => {
            const route = s.memory.routePreference === 'sky' ? 'the floating temple roads' : 'the lower marble ruins';
            const pace = s.memory.adventurePreference === 'speed' ? 'a fast run with careful landings'
                : s.memory.adventurePreference === 'explore' ? 'time to follow the secrets and ring trails' : 'a pace that feels right when we get there';
            return `Then our plan is ${route}, with ${pace}. We can always talk again if you change your mind.`;
        }, choices: [
            choice('That sounds like our plan.', 'together'), choice('Actually, I want another route.', 'route'), bye('Let us go.'),
        ] },
    };
    for (const node of Object.values(nodes)) {
        for (const item of node.choices) { if (item.remember) Object.freeze(item.remember); Object.freeze(item); }
        Object.freeze(node.choices); Object.freeze(node);
    }
    Object.freeze(nodes);

    function count(value, max = 999) { return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : 0; }
    function token(value) { return count(value, MAX_TOKEN); }
    function nextToken(value) { return value >= MAX_TOKEN ? 0 : value + 1; }
    function memory(source = {}) {
        const value = source && typeof source === 'object' ? source : {};
        const result = { visits: count(value.visits), lastTopic: TOPICS.includes(value.lastTopic) ? value.lastTopic : '', topicVisits: {} };
        for (const key of Object.keys(ENUMS)) result[key] = ENUMS[key].includes(value[key]) ? value[key] : ENUMS[key][0];
        for (const topic of TOPICS) result.topicVisits[topic] = count(value.topicVisits && value.topicVisits[topic]);
        return result;
    }
    function context(source = {}) {
        const value = source && typeof source === 'object' ? source : {};
        return { rings: Number.isFinite(value.rings) ? Math.max(0, Math.min(999999, Math.floor(value.rings))) : null,
            lavaActive: value.lavaActive === true, huggedRecently: value.huggedRecently === true };
    }
    function create(previous) {
        return { version: 1, active: false, nodeId: null, revision: 0, session: 0,
            memory: memory(previous && (previous.memory || previous)), context: context(), lastChoice: null };
    }
    function normalize(state) {
        if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
        state.version = 1; state.revision = token(state.revision); state.session = token(state.session);
        state.memory = memory(state.memory); state.context = context(state.context);
        if (state.active !== true || !Object.prototype.hasOwnProperty.call(nodes, state.nodeId)) {
            state.active = false; state.nodeId = null;
        }
        if (!state.lastChoice || typeof state.lastChoice !== 'object'
            || !Object.prototype.hasOwnProperty.call(nodes, state.lastChoice.nodeId)) state.lastChoice = null;
        else state.lastChoice = { nodeId: state.lastChoice.nodeId, index: count(state.lastChoice.index, 2),
            revision: token(state.lastChoice.revision), session: token(state.lastChoice.session) };
        return true;
    }
    function visit(state, nodeId) {
        const topic = nodes[nodeId].topic;
        state.nodeId = nodeId; state.active = true; state.memory.lastTopic = topic;
        state.memory.topicVisits[topic] = Math.min(999, state.memory.topicVisits[topic] + 1);
    }
    function view(state) {
        if (!normalize(state) || !state.active) return { open: false, nodeId: null, revision: state && token(state.revision) || 0,
            session: state && token(state.session) || 0, speaker: 'Rosie', text: '', choices: [] };
        const node = nodes[state.nodeId];
        return { open: true, nodeId: state.nodeId, revision: state.revision, session: state.session, speaker: 'Rosie',
            text: typeof node.text === 'function' ? node.text(state) : node.text,
            choices: node.choices.map((item, index) => ({ label: item.label, index })),
            memory: memory(state.memory) };
    }
    function start(state, source = {}) {
        if (!normalize(state)) return view(null);
        if (state.active) return view(state);
        state.context = context(source); state.session = nextToken(state.session); state.revision = nextToken(state.revision);
        state.memory.visits = Math.min(999, state.memory.visits + 1); state.lastChoice = null;
        const entry = state.context.huggedRecently ? 'hug_greeting' : state.context.rings !== null && state.context.rings <= 5 ? 'low_rings'
            : state.memory.visits > 1 ? 'returning' : 'arrival';
        visit(state, entry);
        return view(state);
    }
    function choose(state, index, expectedRevision) {
        if (!normalize(state) || !state.active || !Number.isSafeInteger(index)) return false;
        if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision !== state.revision)) return false;
        const item = nodes[state.nodeId].choices[index];
        if (!item) return false;
        const previous = { nodeId: state.nodeId, index, revision: state.revision, session: state.session };
        if (item.remember) for (const [key, value] of Object.entries(item.remember)) {
            if (ENUMS[key] && ENUMS[key].includes(value)) state.memory[key] = value;
        }
        state.revision = nextToken(state.revision); state.lastChoice = previous;
        if (item.next === null) { state.active = false; state.nodeId = null; }
        else visit(state, item.next);
        return true;
    }
    function close(state) {
        if (!normalize(state) || !state.active) return false;
        state.active = false; state.nodeId = null; state.revision = nextToken(state.revision);
        return true;
    }
    return Object.freeze({ create, start, choose, close, view, nodes, MAX_TOKEN });
});
