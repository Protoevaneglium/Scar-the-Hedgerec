'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const root = path.join(__dirname,'..');
const zip = fs.readFileSync(path.join(root,'public/downloads/scar-level-core-template.zip'));
const entries = new Map();
let cursor = zip.readUInt32LE(zip.length - 6);
const count = zip.readUInt16LE(zip.length - 12);
for(let i=0;i<count;i++) {
    assert.strictEqual(zip.readUInt32LE(cursor),0x02014b50);
    const nameLength=zip.readUInt16LE(cursor+28), extraLength=zip.readUInt16LE(cursor+30), commentLength=zip.readUInt16LE(cursor+32);
    const name=zip.toString('utf8',cursor+46,cursor+46+nameLength).replace('scar-level-core-template/','');
    const offset=zip.readUInt32LE(cursor+42), size=zip.readUInt32LE(cursor+20);
    const dataStart=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28);
    const payload=zip.subarray(dataStart,dataStart+size);
    entries.set(name,{data:zip.readUInt16LE(cursor+10)===8?zlib.inflateRawSync(payload):payload,
        host:zip.readUInt16LE(cursor+4)>>8,mode:zip.readUInt32LE(cursor+38)>>>16});
    cursor+=46+nameLength+extraLength+commentLength;
}
console.log('\nDownloadable starter integrity');
for(const file of ['server.js','public/sonic-engine.js','public/css/game-ui.css','public/js/modern-hud.js',
    'public/assets/palmtree_objects.png','public/assets/animals.png','public/assets/enemies.png']) {
    assert(entries.has(file),`starter must include ${file}`);
    assert(entries.get(file).data.equals(fs.readFileSync(path.join(root,file))),`rebuild the starter after changing ${file}`);
}
for(const name of ['scar.sh','start-termux.sh','start-linux-mac.sh','install-linux.sh','install-termux.sh']) {
    const file=entries.get(name);
    assert(file && file.host===3 && (file.mode & 0o111)===0o111,`${name} must be executable when unzipped on Unix`);
}
const html=entries.get('public/index.html').data.toString();
for(const match of html.matchAll(/<script src="([^"]+)"/g)) assert(entries.has('public/'+match[1]),`missing starter script ${match[1]}`);
assert(!html.includes('<div id="intro">'),'the blank starter must not depend on the campaign cinematic');
assert(html.includes('window.DEFAULT_STAGE = "template"'));
console.log('  ✓ the archive contains current code, shared sprites, all bootstrap scripts, and executable shell launchers');
