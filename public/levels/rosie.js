/** Rosie / Rosey, using the original Sonic CD sheet supplied with the project.
 * The source's identifying header and ripping credits remain intact in rosie.png.
 * Runtime color-keying removes only the two navy sheet-background colors.
 */
(function (root, factory) {
    'use strict';
    const art = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = art;
    if (root) root.RosieArt = art;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';
    const neutral = Object.freeze({ x: 251, y: 53, w: 21, h: 37, anchorX: 12, anchorY: 37 });
    const blink = Object.freeze({ x: 419, y: 53, w: 21, h: 37, anchorX: 12, anchorY: 37 });
    const greeting1 = Object.freeze({ x: 283, y: 53, w: 21, h: 37, anchorX: 13, anchorY: 37 });
    const greeting2 = Object.freeze({ x: 315, y: 53, w: 21, h: 37, anchorX: 13, anchorY: 37 });
    const frames = Object.freeze({
        // Hold a planted-foot pose; the other rows are movement or distress.
        idle: Object.freeze([neutral]),
        blink: Object.freeze([blink]),
        walk: Object.freeze([
            Object.freeze({ x: 296, y: 101, w: 26, h: 37, anchorX: 12, anchorY: 37 }),
            Object.freeze({ x: 334, y: 101, w: 21, h: 37, anchorX: 10, anchorY: 37 }),
            Object.freeze({ x: 366, y: 101, w: 30, h: 36, anchorX: 15, anchorY: 36 }),
        ]),
        greet: Object.freeze([greeting1, greeting2, greeting1]),
        hop: Object.freeze([Object.freeze({ x: 251, y: 145, w: 26, h: 34, anchorX: 13, anchorY: 34 })]),
    });
    function getFrame(state = 'idle', clock = 0) {
        const t = Math.max(0, Number.isFinite(clock) ? clock : 0);
        if (state === 'walk') return frames.walk[Math.floor(t / 7) % frames.walk.length];
        if (state === 'greet') return frames.greet[Math.min(frames.greet.length - 1, Math.floor(t / 10))];
        if (state === 'hop') return frames.hop[0];
        return t % 240 >= 234 ? blink : neutral;
    }
    let atlas = null, ready = false, failed = false;
    const source = 'assets/rosie.png';
    if (root && typeof root.Image === 'function') {
        const sheet = new root.Image();
        sheet.onload = function () {
            try {
                const canvas = root.document.createElement('canvas');
                canvas.width = sheet.naturalWidth; canvas.height = sheet.naturalHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(sheet, 0, 0);
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = pixels.data;
                for (let i = 0; i < data.length; i += 4) {
                    if ((data[i] === 4 && data[i + 1] === 20 && data[i + 2] === 83)
                        || (data[i] === 6 && data[i + 1] === 44 && data[i + 2] === 128)) data[i + 3] = 0;
                }
                ctx.putImageData(pixels, 0, 0);
                atlas = canvas; ready = true;
            } catch (_) { failed = true; }
        };
        sheet.onerror = function () { failed = true; };
        sheet.src = source;
    }

    // A small pixel silhouette keeps the endpoint visible if the supplied PNG
    // is unavailable. Once loaded, only the original sheet sprites are drawn.
    function fallback(ctx, x, feetY, pose) {
        ctx.save(); ctx.translate(Math.round(x), Math.round(feetY));
        ctx.scale(pose.facing, 1);
        ctx.fillStyle = '#6d275d'; ctx.fillRect(-10, -38, 20, 22);
        ctx.fillStyle = '#f474bf'; ctx.fillRect(-12, -36, 23, 17);
        ctx.fillRect(-8, -41, 5, 8); ctx.fillRect(4, -41, 5, 8);
        ctx.fillStyle = '#ffdbb0'; ctx.fillRect(-12, -27, 16, 9);
        ctx.fillStyle = '#fff'; ctx.fillRect(-9, -31, 6, 7);
        ctx.fillStyle = '#16334a'; ctx.fillRect(-9, -30, 2, 4);
        ctx.fillStyle = '#50b148'; ctx.fillRect(-7, -18, 15, 13);
        ctx.fillStyle = '#faf4e9';
        ctx.fillRect(-13, -18, 6, 6);
        ctx.fillRect(9, pose.state === 'greet' ? -28 : -18, 6, 6);
        ctx.fillStyle = '#5b3d9c'; ctx.fillRect(-9, -5, 9, 5); ctx.fillRect(4, -5, 9, 5);
        ctx.fillStyle = '#fff'; ctx.fillRect(-9, -2, 9, 2); ctx.fillRect(4, -2, 9, 2);
        ctx.restore();
    }
    function draw(ctx, x, feetY, clock = 0, pose = {}) {
        const options = pose && typeof pose === 'object' ? pose : {};
        const current = { state: options.state || 'idle', facing: options.facing === 1 ? 1 : -1 };
        const animationClock = Number.isFinite(options.animationClock) ? options.animationClock : clock;
        if (!ready || !atlas) { fallback(ctx, x, feetY, current); return false; }
        const frame = getFrame(current.state, animationClock);
        ctx.save(); ctx.imageSmoothingEnabled = false;
        ctx.translate(Math.round(x), Math.round(feetY));
        // Body/sole anchors keep her feet planted across differently sized poses.
        ctx.scale(current.facing * 1.2, 1.2);
        ctx.drawImage(atlas, frame.x, frame.y, frame.w, frame.h,
            -frame.anchorX, -frame.anchorY, frame.w, frame.h);
        ctx.restore();
        return true;
    }
    return {
        source, frames, getFrame, draw,
        sourceName: 'Sega CD - Sonic the Hedgehog CD - Miscellaneous - Amy Rose.png',
        character: 'Rosey (Rosie)',
        get loaded() { return ready; },
        get failed() { return failed; },
    };
});
