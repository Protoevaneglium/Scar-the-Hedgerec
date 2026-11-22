/** Small dependency-free decoder for the noninterlaced RGB/RGBA PNG8 sources.
 * Kept independent of the atlas builder's Sharp decoder and encoder.
 */
'use strict';
const assert = require('assert');
const zlib = require('zlib');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(data) {
    let crc = 0xffffffff;
    for (const value of data) {
        crc ^= value;
        for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function paeth(a, b, c) {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
}
function decodePng(buffer) {
    assert(buffer.subarray(0, 8).equals(signature), 'PNG signature');
    let at = 8, width, height, channels, ended = false;
    const compressed = [];
    while (at + 12 <= buffer.length) {
        const size = buffer.readUInt32BE(at), tag = buffer.toString('ascii', at + 4, at + 8), end = at + 8 + size;
        assert(end + 4 <= buffer.length, 'truncated PNG chunk');
        assert.strictEqual(crc32(buffer.subarray(at + 4, end)), buffer.readUInt32BE(end), `${tag} CRC`);
        if (tag === 'IHDR') {
            assert.strictEqual(size, 13); width = buffer.readUInt32BE(at + 8); height = buffer.readUInt32BE(at + 12);
            assert(width > 0 && height > 0 && width * height <= 16000000, 'bounded PNG dimensions');
            assert.strictEqual(buffer[at + 16], 8, '8-bit PNG');
            const type = buffer[at + 17]; assert(type === 2 || type === 6, 'RGB/RGBA PNG'); channels = type === 2 ? 3 : 4;
            assert(buffer[at + 18] === 0 && buffer[at + 19] === 0 && buffer[at + 20] === 0, 'standard noninterlaced PNG');
        } else if (tag === 'IDAT') compressed.push(buffer.subarray(at + 8, end));
        else if (tag === 'IEND') { ended = true; break; }
        at = end + 4;
    }
    assert(ended && width && channels && compressed.length, 'complete PNG');
    const stride = width * channels, inflated = zlib.inflateSync(Buffer.concat(compressed));
    assert.strictEqual(inflated.length, (stride + 1) * height, 'PNG scanline length');
    const native = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const offset = y * (stride + 1), filter = inflated[offset]; assert(filter <= 4, 'valid PNG row filter');
        for (let x = 0; x < stride; x++) {
            const i = y * stride + x, a = x >= channels ? native[i - channels] : 0;
            const b = y ? native[i - stride] : 0, c = y && x >= channels ? native[i - stride - channels] : 0;
            const predict = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
            native[i] = (inflated[offset + 1 + x] + predict) & 255;
        }
    }
    const data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        native.copy(data, i * 4, i * channels, i * channels + 3);
        data[i * 4 + 3] = channels === 4 ? native[i * channels + 3] : 255;
    }
    return { width, height, data };
}
module.exports = { decodePng };
