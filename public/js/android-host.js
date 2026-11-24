/** Native Android lifecycle hooks; the browser build uses the same game core. */
(function (root) {
    'use strict';
    let resumeIntro = false;
    let suspended = false;
    let controllers = [];
    const game = () => root.sonicGame || null;
    const event = name => root.dispatchEvent(new root.Event(name));
    const api = {
        controllerState(states) {
            if (!Array.isArray(states)) return false;
            const previous = controllers;
            controllers = states.slice(0, 16).filter(p => p && Number.isSafeInteger(p.index) && p.index >= 0)
                .map(p => ({ index: p.index, id: String(p.id), connected: true, mapping: 'standard', ready: p.ready !== false,
                    axes: [0, 1].map(i => Number.isFinite(p.axes?.[i]) ? Math.max(-1, Math.min(1, p.axes[i])) : 0),
                    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: p.buttons?.[i] === 1, value: p.buttons?.[i] === 1 ? 1 : 0 })) }));
            for (const old of previous) if (!controllers.some(p => p.index === old.index && p.id === old.id)) {
                const removed = new root.Event('gamepaddisconnected');
                Object.defineProperty(removed, 'gamepad', { value: old, enumerable: true }); root.dispatchEvent(removed);
            }
            return true;
        },
        getGamepads() {
            // Native Android events own the device when available, preventing
            // WebView from processing a second copy of the same A/Menu press.
            if (controllers.length) return controllers;
            try { return typeof root.navigator?.getGamepads === 'function' ? root.navigator.getGamepads() : []; }
            catch (_) { return []; }
        },
        pause() {
            if (suspended) return true;
            suspended = true;
            const g = game(), video = root.document.getElementById('intro-video');
            resumeIntro = !!(root.INTRO_ACTIVE && video && !video.paused);
            event('blur');
            if (g) g.setPaused(true);
            for (const media of root.document.querySelectorAll('audio, video')) { try { media.pause(); } catch (_) {} }
            return true;
        },
        resume() {
            suspended = false;
            event('focus');
            const g = game();
            if (g) { g.last = root.performance.now(); g.input?.resetGamepad?.(); }
            const video = root.document.getElementById('intro-video');
            if (!g && root.INTRO_ACTIVE && resumeIntro && video) { try { const result = video.play(); if (result?.catch) result.catch(() => {}); } catch (_) {} }
            resumeIntro = false;
            return true;
        },
        back() {
            const g = game();
            if (!g) return true;
            if (g.rosieConversationView()?.open) { g.handleRosieConversation('dialogueClose'); return false; }
            event('blur');
            event('focus');
            if (!g.paused) { g.setPaused(true); return false; }
            return true;
        },
    };
    root.ScarHost = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
