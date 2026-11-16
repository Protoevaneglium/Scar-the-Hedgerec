'use strict';
async function removeBackground(filePath, outPath) {
    if (!filePath || !outPath) throw new Error('Usage: node flood_fill_bg.js input-image output.png');
    const sharp = require('sharp');
    const { data, info: { width, height } } = await sharp(filePath).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const target = [data[0], data[1], data[2]];
    const visited = new Uint8Array(width * height), stack = [];
    const enqueue = index => { if (!visited[index]) { visited[index] = 1; stack.push(index); } };
    enqueue(0); enqueue(width - 1); enqueue((height - 1) * width); enqueue(width * height - 1);
    while (stack.length) {
        const index = stack.pop(), x = index % width, y = Math.floor(index / width);
        const offset = index * 4;
        if (!data[offset + 3] || Math.abs(data[offset] - target[0]) >= 50 || Math.abs(data[offset + 1] - target[1]) >= 50 || Math.abs(data[offset + 2] - target[2]) >= 50) continue;
        data[offset + 3] = 0;
        if (x + 1 < width) enqueue(index + 1);
        if (x > 0) enqueue(index - 1);
        if (y + 1 < height) enqueue(index + width);
        if (y > 0) enqueue(index - width);
    }
    await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
    return outPath;
}
module.exports = { removeBackground };
if (require.main === module) {
    removeBackground(process.argv[2], process.argv[3])
        .then(output => console.log(`Processed and saved to: ${output}`))
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}
