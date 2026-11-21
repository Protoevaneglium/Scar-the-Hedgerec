'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {spawnSync}=require('child_process');
const vm=require('vm');

// Model native filename decoders that keep source handles open after decoding.
// This fails deterministically on every host if the batch tool gives Sharp a
// filename and later tries to remove that locked source.
async function checkSourceLifetime() {
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'scar-image-lock-test-'));
    const source=path.join(temp,'scar_locked.jpg'),output=path.join(temp,'scar_locked.png');
    const encoded=Buffer.from([255,216,255,0,13,10,128]);
    const locked=new Set(),inputs=[],errors=[];
    let deleted=0,failWrite=false;
    function fakeSharp(input) {
        inputs.push(input);
        if(typeof input==='string')locked.add(path.resolve(input));
        const chain={
            toColourspace(){return this;},ensureAlpha(){return this;},raw(){return this;},png(){return this;},
            async toBuffer(){return {data:Buffer.from([255,255,255,255,0,0,0,255]),info:{width:2,height:1}};},
            async toFile(filename){if(failWrite)throw new Error('fixture output is unwritable');fs.writeFileSync(filename,'encoded PNG fixture');},
        };
        return chain;
    }
    const fixtureFs={...fs,unlinkSync(filename){
        if(locked.has(path.resolve(filename))){const error=new Error('EPERM: decoder retains its filename handle');error.code='EPERM';throw error;}
        assert(fs.existsSync(filename.replace(/\.jpe?g$/i,'.png')),'source deletion must follow successful output writing');
        deleted++;fs.unlinkSync(filename);
    }};
    const fixtureModule={exports:{}};
    const fixtureRequire=name=>name==='sharp'?fakeSharp:name==='fs'?fixtureFs:require(name);
    try {
        fs.writeFileSync(source,encoded);
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../remove_bg.js'),'utf8'),{
            require:fixtureRequire,module:fixtureModule,__dirname:path.join(__dirname,'..'),
            console:{log(){},error(...args){errors.push(args);}},
        },{filename:'remove_bg.js'});
        const result=await fixtureModule.exports.removeBackground(temp);
        assert.strictEqual(result.processed,1,'a decoder retaining filename handles must not prevent deleting a converted source');
        assert.strictEqual(result.failed,0);
        assert(Buffer.isBuffer(inputs[0])&&inputs[0].equals(encoded),'native decoding must receive the complete encoded bytes');
        assert(inputs.every(Buffer.isBuffer),'neither native pipeline should own an input filename');
        assert.strictEqual(deleted,1);assert(!fs.existsSync(source));assert(fs.existsSync(output));
        assert.strictEqual(errors.length,0);
        const preserved=path.join(temp,'enemy_write_failed.jpg');
        fs.writeFileSync(preserved,encoded);failWrite=true;
        const failed=await fixtureModule.exports.removeBackground(temp);
        assert.strictEqual(failed.processed,0);assert.strictEqual(failed.failed,1);
        assert(fs.readFileSync(preserved).equals(encoded),'failed output writing must preserve the original image');
        assert.strictEqual(deleted,1);assert.strictEqual(errors.length,1);
        console.log('\nAsset source lifetime: buffer decoding permits deletion; failed writes preserve originals.');
    } finally {
        const resolved=path.resolve(temp);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('scar-image-lock-test-'));
        fs.rmSync(resolved,{recursive:true,force:true});
    }
}
(async()=>{
    await checkSourceLifetime();
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
        const result=await sharp(fs.readFileSync(output)).ensureAlpha().raw().toBuffer();
        assert.strictEqual(result[3],0,'connected corner background must become transparent');
        assert.strictEqual(result[(2*5+2)*4+3],255,'an enclosed matching color must stay opaque');
        assert.strictEqual(result[(1*5+1)*4],0);
        await require('../flood_fill_bg').removeBackground(input,input);
        const replaced=await sharp(fs.readFileSync(input)).ensureAlpha().raw().toBuffer();
        assert.strictEqual(replaced[3],0,'flood fill may overwrite its input after closing the source file');
        assert.strictEqual(replaced[(2*5+2)*4+3],255,'in-place conversion must preserve enclosed foreground');
        const jpg=Buffer.alloc(20*20*4,255);
        for(let y=5;y<15;y++)for(let x=5;x<15;x++)jpg.fill(0,(y*20+x)*4,(y*20+x)*4+3);
        await sharp(jpg,{raw:{width:20,height:20,channels:4}}).jpeg({quality:100}).toFile(path.join(temp,'scar_test.jpg'));
        const batch=await require('../remove_bg').removeBackground(temp);
        assert.deepStrictEqual(batch,{processed:1,failed:0});
        assert(!fs.existsSync(path.join(temp,'scar_test.jpg')),'successful batch conversion must remove its JPEG source');
        const png=await sharp(fs.readFileSync(path.join(temp,'scar_test.png'))).ensureAlpha().raw().toBuffer();
        assert.strictEqual(png[3],0);assert.strictEqual(png[(10*20+10)*4+3],255);
        const missing=spawnSync(process.execPath,[path.join(__dirname,'../flood_fill_bg.js')],{encoding:'utf8',windowsHide:true});
        assert.notStrictEqual(missing.status,0);assert(missing.stderr.includes('Usage:'));
        console.log('  ✓ both tools work with the declared library, preserve foreground pixels, and fail correctly on bad CLI arguments');
    } finally {
        const resolved=path.resolve(temp);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('scar-image-test-'));
        fs.rmSync(resolved,{recursive:true,force:true});
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
