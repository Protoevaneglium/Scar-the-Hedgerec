const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
const outPath = process.argv[3];

async function removeBackground() {
    try {
        const image = await Jimp.read(filePath);
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        
        // Assume top-left pixel is the background color
        const bgColor = image.getPixelColor(0, 0);
        const targetColor = Jimp.intToRGBA(bgColor);
        const threshold = 50; // slightly higher tolerance for jpeg artifacts
        
        const isBg = (x, y) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return false;
            const c = Jimp.intToRGBA(image.getPixelColor(x, y));
            return Math.abs(c.r - targetColor.r) < threshold &&
                   Math.abs(c.g - targetColor.g) < threshold &&
                   Math.abs(c.b - targetColor.b) < threshold &&
                   c.a > 0;
        };

        const stack = [[0, 0], [width-1, 0], [0, height-1], [width-1, height-1]]; // start from all 4 corners
        const visited = new Set();
        
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);
            
            if (isBg(x, y)) {
                // Set to transparent
                image.setPixelColor(0x00000000, x, y);
                
                stack.push([x + 1, y]);
                stack.push([x - 1, y]);
                stack.push([x, y + 1]);
                stack.push([x, y - 1]);
            }
        }

        await image.writeAsync(outPath);
        console.log(`Processed and saved to: ${outPath}`);
    } catch (err) {
        console.error(`Error processing:`, err);
    }
}

removeBackground();
