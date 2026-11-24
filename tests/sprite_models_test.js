/** Check source lineage, genuine volume outside the silhouette, bounded rendering and graceful fallback. */
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {decodePng}=require('./helpers/png_pixels');
const {createGameHarness}=require('./helpers/game_harness');
const root=path.resolve(__dirname,'../public'),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/models/manifest.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function test(name,fn){fn();console.log('  PASS '+name);}
console.log('\nShared sprite-derived 2.5D models');
test('all model sources retain their exact source hashes and every projection fits its packed rectangle',()=>{
    const raw=fs.readFileSync(path.join(root,'assets/models/sprite_models.png')),atlas=decodePng(raw);
    assert.strictEqual(hash(raw),manifest.atlasSha256);
    const sources={};for(const [file,expected] of Object.entries(manifest.sourceHashes)){
        const bytes=fs.readFileSync(path.join(root,'assets',file));assert.strictEqual(hash(bytes),expected);sources[file]=decodePng(bytes);
    }
    const frames=Object.entries(manifest.frames);assert(frames.length>=120);
    for(const [key,f] of frames){
        const [file,crop]=key.split(':'),[x,y,w,h]=crop.split(',').map(Number),source=sources[file];
        assert(x>=0&&y>=0&&x+w<=source.width&&y+h<=source.height,key);
        assert(f.x>=0&&f.y>=0&&f.x+f.w<=atlas.width&&f.y+f.h<=atlas.height,key);
        assert.strictEqual(f.w,(w+2*manifest.padding)*manifest.scale);assert.strictEqual(f.h,(h+2*manifest.padding)*manifest.scale);
        assert(f.volumePixels>0&&f.maxDepth>1&&f.maxDepth<6,key);
        for(const [other,g] of frames)if(key!==other)assert(f.x+f.w<=g.x||g.x+g.w<=f.x||f.y+f.h<=g.y||g.y+g.h<=f.y,'models overlap');
    }
    // A real side surface must extend past an opaque front silhouette, not just recolor it.
    const f=manifest.frames['scar_sheet.png:0,0,48,48'],source=sources['scar_sheet.png'];
    let extended=0;
    for(let y=0;y<48;y++)for(let x=0;x<48;x++){
        const at=((f.y+(y+manifest.padding)*manifest.scale+1)*atlas.width+f.x+(x+manifest.padding)*manifest.scale+1)*4;
        if(source.data[(y*source.width+x)*4+3]===0&&atlas.data[at+3]>100)extended++;
    }
    assert(extended>20,'Scar model must contain projected side geometry');
});
test('each Scar animation and the common objects render through one shared model draw with fixed anchors',()=>{
    const h=createGameHarness({stage:'z3_act1'}),g=h.game,calls=[];
    const ctx=new Proxy(h.ctx,{get(t,k){if(k==='drawImage')return(...a)=>calls.push(a);return typeof t[k]==='function'?t[k].bind(t):t[k];}});
    try{
        for(let sx=0;sx<336;sx+=48){calls.length=0;g.drawModelSprite(ctx,g.scarSheet,sx,0,48,48,-23,-28,48,48);
            assert.strictEqual(calls.length,1);assert.strictEqual(calls[0][0].src,'assets/models/sprite_models.png');
            assert.deepStrictEqual(calls[0].slice(5),[-29,-34,60,60]);}
        for(const draw of [()=>g.drawRing(ctx,20,30,0),()=>g.drawMonitorObj(ctx,g.terrain.monitors[0]),()=>g.drawEnemy(ctx,g.terrain.enemies[0])]){
            calls.length=0;draw();assert(calls.some(a=>a[0].src==='assets/models/sprite_models.png'));}
        for(let i=0;i<60;i++)h.frame();assert.strictEqual(h.canvasStats().invalid,0);
        assert(h.canvases.length<15,'models cannot allocate per-frame canvases');
    }finally{h.dispose();}
});
test('missing or delayed models retain the real source sprites, then recover without reloads or a draw error',()=>{
    for(const mode of ['missing','delayed']){
        const h=createGameHarness({stage:'z3_act1',deferImages:mode==='delayed',failImages:mode==='missing'?['assets/models/sprite_models.png']:[]}),g=h.game;
        try{
            h.flushImages(im=>!im.src.includes('/models/'));const calls=[];
            const ctx=new Proxy(h.ctx,{get(t,k){if(k==='drawImage')return(...a)=>calls.push(a);return typeof t[k]==='function'?t[k].bind(t):t[k];}});
            g.drawModelSprite(ctx,g.scarSheet,0,0,48,48,-23,-28,48,48);
            assert.strictEqual(calls[0][0].src,'assets/scar_sheet.png');
            h.flushImages();calls.length=0;g.drawModelSprite(ctx,g.scarSheet,0,0,48,48,-23,-28,48,48);
            assert.strictEqual(calls[0][0].src,mode==='missing'?'assets/scar_sheet.png':'assets/models/sprite_models.png');
            h.frame();assert.strictEqual(h.canvasStats().invalid,0);
        }finally{h.dispose();}
    }
});
