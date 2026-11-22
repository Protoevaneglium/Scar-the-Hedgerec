/** Native Android lifecycle hooks; the browser build uses the same game core. */
(function (root) {
    'use strict';
    let resumeIntro = false;
    let suspended = false;
    const game = () => root.sonicGame || null;
    const event = name => root.dispatchEvent(new root.Event(name));
    const api = {
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
