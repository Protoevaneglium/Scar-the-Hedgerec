const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'public', 'assets');

async function removeBackground() {
    const files = fs.readdirSync(assetsDir).filter(file => file.endsWith('.jpg') && (file.startsWith('scar_') || file.startsWith('enemy_')));
    
    for (const file of files) {
        const filePath = path.join(assetsDir, file);
        const outPath = path.join(assetsDir, file.replace('.jpg', '.png'));
        
        try {
            const image = await Jimp.read(filePath);
            
            // Assume top-left pixel is the background color
            const bgColor = image.getPixelColor(0, 0);
            
            // Threshold for color matching
            const threshold = 30; // tolerance
            
            const targetColor = Jimp.intToRGBA(bgColor);

            image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
                const r = this.bitmap.data[idx + 0];
                const g = this.bitmap.data[idx + 1];
                const b = this.bitmap.data[idx + 2];
                const a = this.bitmap.data[idx + 3];
                
                // If it's close to the background color, make it transparent
                if (Math.abs(r - targetColor.r) < threshold &&
                    Math.abs(g - targetColor.g) < threshold &&
                    Math.abs(b - targetColor.b) < threshold) {
                    
                    this.bitmap.data[idx + 3] = 0; // Set alpha to 0
                }
            });

            await image.writeAsync(outPath);
            console.log(`Processed: ${file} -> ${path.basename(outPath)}`);
            
            // Delete the original jpg to clean up
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error(`Error processing ${file}:`, err);
        }
    }
}

removeBackground();
