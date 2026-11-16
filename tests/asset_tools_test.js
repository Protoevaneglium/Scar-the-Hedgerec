'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {spawnSync}=require('child_process');
(async()=>{
    try { require.resolve('sharp'); }
    catch(error) { if(error.code==='MODULE_NOT_FOUND'){console.log('\nAsset utilities: install dev dependencies to exercise image fixtures.');return;}throw error; }
    const sharp=require('sharp');
    console.log('\nAsset utilities');
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'scar-image-test-'));
    try {
        const input=path.join(temp,'input.png'),output=path.join(temp,'output.png');
        const pixels=Buffer.alloc(5*5*4,255);
        for(let y=1;y<4;y++)for(let x=1;x<4;x++)pixels.fill(0,(y*5+x)*4,(y*5+x)*4+3);
        pixels.fill(255,(2*5+2)*4,(2*5+2)*4+4);
        await sharp(pixels,{raw:{width:5,height:5,channels:4}}).png().toFile(input);
        await require('../flood_fill_bg').removeBackground(input,output);
        const result=await sharp(output).ensureAlpha().raw().toBuffer();
        assert.strictEqual(result[3],0,'connected corner background must become transparent');
        assert.strictEqual(result[(2*5+2)*4+3],255,'an enclosed matching color must stay opaque');
        assert.strictEqual(result[(1*5+1)*4],0);
        const jpg=Buffer.alloc(20*20*4,255);
        for(let y=5;y<15;y++)for(let x=5;x<15;x++)jpg.fill(0,(y*20+x)*4,(y*20+x)*4+3);
        await sharp(jpg,{raw:{width:20,height:20,channels:4}}).jpeg({quality:100}).toFile(path.join(temp,'scar_test.jpg'));
        const batch=await require('../remove_bg').removeBackground(temp);
        assert.deepStrictEqual(batch,{processed:1,failed:0});
        const png=await sharp(path.join(temp,'scar_test.png')).ensureAlpha().raw().toBuffer();
        assert.strictEqual(png[3],0);assert.strictEqual(png[(10*20+10)*4+3],255);
        const missing=spawnSync(process.execPath,[path.join(__dirname,'../flood_fill_bg.js')],{encoding:'utf8',windowsHide:true});
        assert.notStrictEqual(missing.status,0);assert(missing.stderr.includes('Usage:'));
        console.log('  ✓ both tools work with the declared library, preserve foreground pixels, and fail correctly on bad CLI arguments');
    } finally {
        const resolved=path.resolve(temp);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('scar-image-test-'));
        fs.rmSync(resolved,{recursive:true,force:true});
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
