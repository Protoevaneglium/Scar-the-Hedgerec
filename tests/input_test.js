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
const context = {window,navigator:{maxTouchPoints:2},audio:{unlock(){}}, document:{
    getElementById:()=>bar,querySelectorAll:()=>buttons,elementFromPoint:x=>buttons[x],
}};
bar.style = {};
vm.createContext(context);
vm.runInContext(source+'\nwindow.input = new InputHandler();',context);
const input = window.input;
function key(code, down=true) {window.dispatch(down?'keydown':'keyup',{code});}
console.log('\nKeyboard, pointer and touch input');
key('ArrowRight'); key('KeyD'); key('ArrowRight',false);
assert(input.right,'releasing one movement key must not release another held key');
key('KeyD',false); assert(!input.right);
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
key('Space'); key('KeyR'); key('KeyG'); window.dispatch('blur');
assert(!input.right && !input.jumpHeld && !input.jumpPressed && !input.debugToggle && input.actions.length===0,
    'leaving the game must clear held controls and queued reset/jump events');
key('ArrowRight'); assert(input.right); key('ArrowRight',false); assert(!input.right);
console.log('  ✓ overlapping keyboard keys, mixed touch/pointer input and focus loss keep correct control state');
