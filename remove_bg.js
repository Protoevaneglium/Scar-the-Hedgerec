const fs = require('fs');
const path = require('path');

async function removeBackground(assetsDir = path.join(__dirname, 'public', 'assets')) {
    const sharp = require('sharp');
    const files = fs.readdirSync(assetsDir).filter(file => /\.jpe?g$/i.test(file) && (file.startsWith('scar_') || file.startsWith('enemy_')));
    let processed = 0, failed = 0;
    
    for (const file of files) {
        const filePath = path.join(assetsDir, file);
        const outPath = path.join(assetsDir, file.replace(/\.jpe?g$/i, '.png'));
        
        try {
            // Close the source file before decoding. Native filename inputs may
            // retain cached handles and prevent the later unlink on Windows.
            const encoded = fs.readFileSync(filePath);
            const { data, info } = await sharp(encoded).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const target = [data[0], data[1], data[2]], threshold = 30;
            for (let idx = 0; idx < data.length; idx += 4) {
                if (Math.abs(data[idx] - target[0]) < threshold && Math.abs(data[idx + 1] - target[1]) < threshold
                    && Math.abs(data[idx + 2] - target[2]) < threshold) data[idx + 3] = 0;
            }
            await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(outPath);
            console.log(`Processed: ${file} -> ${path.basename(outPath)}`);
            
            // Delete the original jpg to clean up
            fs.unlinkSync(filePath);
            processed++;
        } catch (err) {
            failed++;
            console.error(`Error processing ${file}:`, err);
        }
    }
    return { processed, failed };
}

module.exports = { removeBackground };
if (require.main === module) {
    removeBackground().then(result => { if (result.failed) process.exitCode = 1; })
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}
