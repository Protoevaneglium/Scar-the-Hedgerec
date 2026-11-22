'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const source = html.slice(html.indexOf('class InputHandler {'), html.indexOf('const SENSOR_COLORS'));
function target(extra = {}) {
    const listeners = new Map();
    return { ...extra, addEventListener(name, fn) { if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn); },
        dispatch(name, event={}) { for(const fn of listeners.get(name)||[]) fn({preventDefault(){},...event}); } };
}
const window = target(), bar = target();
const buttons = ['left','right','up','down','jump'].map(key=>target({dataset:{key}, classList:{add(){},remove(){},toggle(){},contains:name=>name==='tbtn'}}));
const document = target({hidden:false,
    getElementById:()=>bar,querySelectorAll:()=>buttons,elementFromPoint:x=>buttons[x],
});
const context = {window,navigator:{maxTouchPoints:2},audio:{unlock(){}},document};
bar.style = {};
vm.createContext(context);
vm.runInContext(source+'\nwindow.input = new InputHandler();',context);
const input = window.input;
function key(code, down=true) {window.dispatch(down?'keydown':'keyup',{code});}
console.log('\nKeyboard, pointer and touch input');
key('ArrowRight'); key('KeyD'); key('ArrowRight',false);
assert(input.right,'releasing one movement key must not release another held key');
key('KeyD',false); assert(!input.right);
key('ArrowUp'); key('ArrowUp',false);
assert(!input.up && input.snapshot().upPressed, 'a quick talk tap must survive until the next game frame');
input.endFrame(); assert(!input.upPressed);
key('ArrowUp'); input.endFrame(); key('KeyW');
assert(input.up && !input.upPressed, 'overlapping held Up keys must not retrigger dialogue');
key('ArrowUp',false); key('KeyW',false);
key('Space'); input.endFrame(); key('KeyZ'); key('Space',false);
assert(input.jumpHeld && !input.jumpPressed,'overlapping jump keys must not release or retrigger jump');
key('KeyZ',false); assert(!input.jumpHeld);
key('ArrowRight');
bar.dispatch('touchstart',{touches:[{clientX:4,clientY:0}]});
assert(input.right && input.jumpHeld);
bar.dispatch('touchend',{touches:[]});
assert(input.right && !input.jumpHeld,'touch release must not cancel a keyboard direction');
key('ArrowRight',false);
buttons[1].dispatch('pointerdown',{pointerType:'mouse',pointerId:1});
key('KeyD'); buttons[1].dispatch('pointerup',{pointerType:'mouse',pointerId:1});
assert(input.right,'mouse release must not cancel a held keyboard key');
key('Space'); key('ArrowUp'); key('KeyR'); key('KeyG'); window.dispatch('blur');
assert(!input.right && !input.jumpHeld && !input.jumpPressed && !input.upPressed && !input.debugToggle && input.actions.length===0,
    'leaving the game must clear held controls and queued reset/jump events');
key('ArrowRight'); assert(input.right); key('ArrowRight',false); assert(!input.right);
key('KeyD'); key('Space'); key('ArrowUp'); key('KeyR');
document.hidden=true; document.dispatch('visibilitychange');
assert(!input.right && !input.jumpHeld && !input.jumpPressed && !input.upPressed && input.actions.length===0,
    'a hidden page must release controls and queued actions even without a window blur event');
document.hidden=false; document.dispatch('visibilitychange');
key('KeyD'); assert(input.right); key('KeyD',false); assert(!input.right);
console.log('  ✓ overlapping keyboard keys, mixed touch/pointer input and focus loss keep correct control state');

for (const code of ['Space', 'ArrowRight', 'ArrowUp']) {
    key(code); input.endFrame(); window.dispatch('blur'); window.dispatch('focus');
    window.dispatch('keydown', { code, repeat: true });
    assert(!input.jumpHeld && !input.jumpPressed && !input.right && !input.up && !input.upPressed,
        `${code}: OS repeats after focus recovery must wait for release and a fresh press`);
    key(code, false); key(code);
    assert(input.jumpHeld || input.right || input.up, `${code}: a fresh physical press must still work`);
    key(code, false); input.endFrame();
}
console.log('  ✓ held keyboard repeats after blur cannot create a fresh jump, run or Up edge');
