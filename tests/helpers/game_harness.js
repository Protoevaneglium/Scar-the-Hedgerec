/** Execute the shipped browser runtime, with strict drawing checks and a controllable clock. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const noop = () => {};

function eventTarget(extra = {}) {
    const listeners = new Map();
    return Object.assign(extra, {
        listeners,
        addEventListener(type, fn, options = {}) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push({ fn, once: !!options.once });
        },
        removeEventListener(type, fn) {
            listeners.set(type, (listeners.get(type) || []).filter(item => item.fn !== fn));
        },
        dispatch(type, extraEvent = {}) {
            let stopped = false;
            const event = { type, preventDefault() { this.defaultPrevented = true; },
                stopPropagation: noop, stopImmediatePropagation() { stopped = true; }, ...extraEvent };
            for (const item of [...(listeners.get(type) || [])]) {
                if (item.once) this.removeEventListener(type, item.fn);
                item.fn(event);
                if (stopped) break;
            }
            return event;
        },
    });
}

function createGameHarness(options = {}) {
    const canvases = [], scheduledFrames = new Map(), elements = new Map(), imageJobs = [];
    const stats = { draws: 0, invalid: 0, restoreUnderflow: 0 };
    const strict = options.strictCanvas !== false;
    let now = 0, nextFrame = 1, nextTimer = 1;
    const timers = new Map();
    function numbers(method, args) {
        if (strict && args.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
            stats.invalid++; throw new Error(`Nonfinite drawing coordinates: ${method}(${args.join(',')})`);
        }
    }
    function makeCanvas(id) {
        const canvas = eventTarget({ id, width: 300, height: 150, style: {}, clientWidth: 960, clientHeight: 540 });
        let depth = 0, pixels;
        const target = { canvas, save() { depth++; }, restore() { if (depth) depth--; else stats.restoreUnderflow++; },
            get depth() { return depth; },
            measureText: text => ({ width: String(text).length * 6 }),
            createPattern: () => ({}),
            getImageData(_x, _y, width, height) {
                numbers('getImageData', [_x, _y, width, height]);
                if (!pixels || pixels.width !== width || pixels.height !== height) {
                    pixels = { data: new Uint8ClampedArray(width * height * 4), width, height };
                }
                return pixels;
            },
            putImageData(_data, x, y) { numbers('putImageData', [x, y]); },
            drawImage(source, ...args) {
                numbers('drawImage', args); stats.draws++;
                if (strict && (!source || ![2, 4, 8].includes(args.length)
                    || !(source.naturalWidth || source.width) || !(source.naturalHeight || source.height))) {
                    throw new Error('Invalid or unloaded drawImage source');
                }
            },
            arc(...args) {
                numbers('arc', args.slice(0, 5));
                if (strict && args[2] < 0) throw new Error('Negative arc radius');
            },
            ellipse(...args) {
                numbers('ellipse', args.slice(0, 7));
                if (strict && (args[2] < 0 || args[3] < 0)) throw new Error('Negative ellipse radius');
            },
        };
        for (const name of ['translate', 'scale', 'rotate', 'moveTo', 'lineTo', 'rect', 'fillRect', 'strokeRect',
            'clearRect', 'bezierCurveTo', 'quadraticCurveTo', 'setTransform', 'transform', 'arcTo', 'roundRect']) {
            target[name] = (...args) => numbers(name, args);
        }
        for (const name of ['createLinearGradient', 'createRadialGradient']) {
            target[name] = (...args) => {
                numbers(name, args);
                if (strict && name === 'createRadialGradient' && (args[2] < 0 || args[5] < 0)) throw new Error('Negative gradient radius');
                return { addColorStop(offset, color) {
                    if (strict && (!Number.isFinite(offset) || offset < 0 || offset > 1 || typeof color !== 'string')) {
                        throw new Error('Invalid gradient stop');
                    }
                } };
            };
        }
        for (const name of ['fillText', 'strokeText']) target[name] = (_text, ...args) => numbers(name, args);
        const ctx = new Proxy(target, {
            get(object, key) { return key in object ? object[key] : noop; },
            set(object, key, value) {
                if (strict && ['globalAlpha', 'lineWidth', 'miterLimit', 'lineDashOffset'].includes(key) && !Number.isFinite(value)) {
                    throw new Error(`Nonfinite canvas property: ${key}`);
                }
                object[key] = value; return true;
            },
        });
        for (const dimension of ['width', 'height']) {
            let value = canvas[dimension];
            Object.defineProperty(canvas, dimension, { enumerable: true, configurable: true,
                get() { return value; }, set(next) {
                    value = next; depth = 0; pixels = undefined;
                    Object.assign(target, { globalAlpha: 1, globalCompositeOperation: 'source-over',
                        lineWidth: 1, lineDashOffset: 0, imageSmoothingEnabled: true });
                },
            });
        }
        canvas.getContext = () => ctx;
        canvases.push({ canvas, ctx });
        return canvas;
    }
    function makeElement(id, tag = 'div') {
        const attributes = new Map();
        const element = tag === 'canvas' || id === 'game' ? makeCanvas(id) : eventTarget({ id });
        return Object.assign(element, { style: element.style || {}, dataset: {}, clientWidth: 960, clientHeight: 540,
            classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
            getAttribute: name => attributes.get(name) ?? null,
            setAttribute: (name, value) => attributes.set(name, String(value)), removeAttribute: name => attributes.delete(name),
            blur: noop, remove: noop, paused: true, currentTime: 0,
            play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, load: noop,
        });
    }
    function element(id) { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); }
    class ImageStub {
        static instances = [];
        constructor() { this.complete = false; this.naturalWidth = this.naturalHeight = 0; ImageStub.instances.push(this); }
        set src(value) {
            this._src = value;
            const source = path.join(root, 'public', value);
            const job = () => {
                if (this._src !== value) return;
                let data;
                try { data = fs.readFileSync(source); } catch (_) {}
                if (!data || options.failImages?.includes(value)) { this.complete = true; if (this.onerror) this.onerror(new Error('Image failed')); return; }
                this.naturalWidth = data.toString('ascii', 1, 4) === 'PNG' ? data.readUInt32BE(16) : 64;
                this.naturalHeight = data.toString('ascii', 1, 4) === 'PNG' ? data.readUInt32BE(20) : 64;
                this.width = this.naturalWidth; this.height = this.naturalHeight; this.complete = true;
                if (this.onload) this.onload();
            };
            if (options.deferImages) imageJobs.push({ image: this, job }); else job();
        }
        get src() { return this._src; }
    }
    const win = eventTarget(), doc = eventTarget({ hidden: false, visibilityState: 'visible',
        getElementById: element, querySelectorAll: () => [], elementFromPoint: () => null,
        createElement: tag => makeElement(`created-${canvases.length}`, tag),
    });
    const storage = options.storage || { getItem: () => null, setItem: noop };
    const sandbox = Object.assign(win, {
        console, URLSearchParams, Math, Image: ImageStub, ArrayBuffer, Uint8ClampedArray,
        Audio: function (src) { const media = makeElement(`audio-${nextTimer++}`, 'audio'); if (src) media.setAttribute('src', src); return media; },
        AudioContext: options.audioContext, document: doc, navigator: { maxTouchPoints: 0 },
        location: { search: `?nointro&stage=${options.stage || 'palmtree'}` },
        performance: { now: () => now },
        requestAnimationFrame(callback) { const id = nextFrame++; scheduledFrames.set(id, callback); return id; },
        cancelAnimationFrame: id => scheduledFrames.delete(id),
        setTimeout(callback, delay = 0) { const id = nextTimer++; timers.set(id, { callback, at: now + delay }); return id; },
        clearTimeout: id => timers.delete(id), localStorage: storage,
        fetch: () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) }),
    });
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    const evaluate = source => vm.runInContext(source, sandbox, { timeout: 10000 });
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file, timeout: 10000 });
    for (const file of ['sonic-engine.js', 'js/modern-hud.js', 'levels/zone1_act2.js', 'levels/kitt_boss.js',
        'levels/zone1_act3.js', 'levels/zone2_act1.js', 'levels/rosie.js', 'levels/rosie_npc.js',
        'levels/zone2_act2_art.js', 'levels/zone2_act2.js']) load('public/' + file);
    const html = options.htmlSource === undefined ? fs.readFileSync(path.join(root, 'public/index.html'), 'utf8') : options.htmlSource;
    const script = html.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/)[1];
    evaluate("'use strict';" + script + '\nwindow.harnessGame = new Game(); window.harnessAudio = audio; window.harnessClasses = {Game, InputHandler, RetroAudio};');
    function frame(ms = 1000 / 60) {
        now += ms;
        const entry = scheduledFrames.entries().next().value;
        if (!entry) throw new Error('The game has no scheduled animation frame');
        scheduledFrames.delete(entry[0]); entry[1](now);
        for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
    return { game: sandbox.harnessGame, audio: sandbox.harnessAudio, classes: sandbox.harnessClasses,
        sandbox, ctx: element('game').getContext('2d'), elements, scheduledFrames, frame, evaluate,
        windowListeners: win.listeners, documentListeners: doc.listeners, canvases,
        dispatchWindow: (type, event) => win.dispatch(type, event), dispatchDocument: (type, event) => doc.dispatch(type, event),
        flushImages(predicate = () => true) {
            for (let i = imageJobs.length - 1; i >= 0; i--) if (predicate(imageJobs[i].image)) imageJobs.splice(i, 1)[0].job();
        },
        canvasStats: () => ({ ...stats, unbalanced: canvases.filter(item => item.ctx.depth !== 0).map(item => item.canvas.id) }),
        dispose() { scheduledFrames.clear(); timers.clear(); imageJobs.length = 0; },
    };
}
module.exports = { createGameHarness, eventTarget };
