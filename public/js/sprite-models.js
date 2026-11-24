/** Shared sprite-derived relief models; pre-rendered once at build time, one draw per frame. */
(function (root) {
    'use strict';
    let sheet = null, loaded = false;
    function draw(ctx, source, sx, sy, w, h, dx, dy, dw, dh) {
        const data = root.ScarSpriteModelData;
        const file = String(source?.src || '').split('assets/').pop();
        const frame = data?.frames[file + ':' + [sx, sy, w, h].join(',')];
        if (!frame || typeof root.Image !== 'function') return false;
        if (!sheet) {
            sheet = new root.Image();
            sheet.onload = () => { loaded = true; };
            sheet.onerror = () => { loaded = false; };
            sheet.src = 'assets/models/sprite_models.png';
        }
        if (!loaded || !sheet.naturalWidth) return false;
        const p = data.padding;
        ctx.drawImage(sheet, frame.x, frame.y, frame.w, frame.h,
            dx-p*dw/w, dy-p*dh/h, dw*(w+2*p)/w, dh*(h+2*p)/h);
        return true;
    }
    root.ScarSpriteModels = { draw, get loaded() { return loaded; } };
})(typeof window !== 'undefined' ? window : globalThis);
