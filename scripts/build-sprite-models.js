/** Deterministic 3D relief from the existing sprite silhouettes and colors; no replacement designs. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..'), SCALE = 3, PAD = 6, WIDTH = 1536;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function tables() {
    const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
    const get = name => vm.runInNewContext('(' + html.match(new RegExp('const '+name+' = ([\\s\\S]*?\\n[\\]}]);'))[1] + ')');
    return { scar: get('SCAR_FRAMES'), enemies: get('ENEMY_FRAMES'), common: get('COMMON_SPRITES'),
        objects: require('../public/sonic-engine').PALMTREE_SPRITES };
}
function renderRelief(pixels, w, h) {
    const W=(w+2*PAD)*SCALE,H=(h+2*PAD)*SCALE,out=Buffer.alloc(W*H*4);
    const distances=new Float32Array(w*h), heights=new Float32Array(w*h);
    const opaque=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&pixels[(y*w+x)*4+3]>100;
    // Distance-to-silhouette produces a rounded volume rather than a flat offset copy.
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=y*w+x;if(!opaque(x,y))continue;
        let d=7;
        for(let yy=-6;yy<=6;yy++)for(let xx=-6;xx<=6;xx++)
            if(!opaque(x+xx,y+yy))d=Math.min(d,Math.hypot(xx,yy));
        distances[i]=d;heights[i]=1.1+Math.sqrt(Math.min(6,d)) * 1.65;
    }
    function paint(x,y,z,r,g,b,a,light){
        const px=Math.round((PAD+x+z*.62)*SCALE),py=Math.round((PAD+y-z*.46)*SCALE);
        for(let yy=0;yy<SCALE;yy++)for(let xx=0;xx<SCALE;xx++){
            const X=px+xx,Y=py+yy;if(X<0||Y<0||X>=W||Y>=H)continue;
            const n=(Y*W+X)*4;
            out[n]=Math.max(0,Math.min(255,Math.round(r*light)));
            out[n+1]=Math.max(0,Math.min(255,Math.round(g*light)));
            out[n+2]=Math.max(0,Math.min(255,Math.round(b*light)));
            out[n+3]=a;
        }
    }
    // Back-to-front slices project actual (x,y,z) volume using a fixed oblique camera.
    for(let z=5.2;z>=0;z-=.25)for(let y=0;y<h;y++)for(let x=w-1;x>=0;x--){
        const i=y*w+x,k=i*4;if(!opaque(x,y)||z>heights[i])continue;
        paint(x,y,z,pixels[k],pixels[k+1],pixels[k+2],pixels[k+3],.48+.055*z);
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=y*w+x,k=i*4;if(!opaque(x,y))continue;
        const height=(xx,yy)=>opaque(xx,yy)?heights[yy*w+xx]:0;
        const nx=(height(x-1,y)-height(x+1,y))*.34,ny=(height(x,y-1)-height(x,y+1))*.34;
        const diffuse=(-nx*.45-ny*.65+1)/Math.sqrt(nx*nx+ny*ny+1);
        const light=Math.max(.64,Math.min(1.22,.70+diffuse*.38));
        paint(x,y,0,pixels[k],pixels[k+1],pixels[k+2],pixels[k+3],light);
    }
    return { data:out,width:W,height:H,volumePixels:heights.reduce((n,z)=>n+(z>0?1:0),0),maxDepth:Math.max(...heights) };
}
async function build() {
    const t=tables(), rects=new Map(), sources={};
    function collect(file,value){
        if(!value||typeof value!=='object')return;
        if(Number.isFinite(value.w)&&Number.isFinite(value.h)&&Number.isFinite(value.x??value.sx)){
            const r={x:value.x??value.sx,y:value.y??value.sy??0,w:value.w,h:value.h};
            rects.set(file+':'+[r.x,r.y,r.w,r.h].join(','),{file,...r});return;
        }
        for(const item of Object.values(value))collect(file,item);
    }
    collect('scar_sheet.png',t.scar.map(f=>({x:f.sx,y:0,w:48,h:48})));
    collect('enemies.png',t.enemies);
    for(const name of ['rings','bigRings','spikesUp','monitorBox','monitorBroken','checkpointBase','checkpointBlue','checkpointRed',
        'checkpointSpin','springs','goalRobotnik','goalDiag1','goalEdge','goalDiag2','goalSonicTop','goalPostStub',
        'capsuleIdle','capsuleOpen','capsuleBroken'])collect('common_objects.png',t.common[name]);
    collect('palmtree_objects.png',t.objects);
    collect('animals.png',Array.from({length:36},(_,i)=>({x:i%3*32,y:Math.floor(i/3)*32,w:32,h:32})));
    for(const file of new Set([...rects.values()].map(r=>r.file))){
        const bytes=fs.readFileSync(path.join(ROOT,'public/assets',file));
        const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        sources[file]={data,info,sha256:sha(bytes)};
    }
    let x=0,y=0,row=0;const frames={},layers=[];
    for(const [key,r] of rects){
        const source=sources[r.file], pixels=Buffer.alloc(r.w*r.h*4);
        for(let yy=0;yy<r.h;yy++)source.data.copy(pixels,yy*r.w*4,((r.y+yy)*source.info.width+r.x)*4,((r.y+yy)*source.info.width+r.x+r.w)*4);
        const model=renderRelief(pixels,r.w,r.h);
        if(x+model.width>WIDTH){x=0;y+=row+3;row=0;}
        frames[key]={x,y,w:model.width,h:model.height,volumePixels:model.volumePixels,maxDepth:model.maxDepth};
        layers.push({input:model.data,raw:{width:model.width,height:model.height,channels:4},left:x,top:y});
        x+=model.width+3;row=Math.max(row,model.height);
    }
    const dir=path.join(ROOT,'public/assets/models');fs.mkdirSync(dir,{recursive:true});
    const png=await sharp({create:{width:WIDTH,height:y+row,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
    fs.writeFileSync(path.join(dir,'sprite_models.png'),png);
    const data={version:1,projection:'orthographic sprite relief; x + 0.62z, y - 0.46z',scale:SCALE,padding:PAD,
        sourceHashes:Object.fromEntries(Object.entries(sources).map(([f,s])=>[f,s.sha256])),atlasSha256:sha(png),frames};
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(data,null,2)+'\n');
    fs.writeFileSync(path.join(ROOT,'public/js/sprite-model-data.js'),'/* Generated by scripts/build-sprite-models.js. */\n'+
        '(function(root){root.ScarSpriteModelData='+JSON.stringify(data)+';})(typeof window!=="undefined"?window:globalThis);\n');
    console.log(`Built ${rects.size} source-derived relief models (${WIDTH}x${y+row}, ${png.length} bytes)`);
}
if(require.main===module)build().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={renderRelief,build};
