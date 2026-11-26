/** Original neon machinery / gold quartz artwork. All front lips follow the
 * registered collision surfaces; decorative depth projects into the background. */
(function(root){
    'use strict';
    const TAU=Math.PI*2,mod=(n,d)=>((n%d)+d)%d;
    const neon=['#ff63da','#39f6f0','#ffe25a','#91ff5f','#a48aff','#ff9c59'];
    const skies=[['#121448','#503597','#f3a0e1'],['#201957','#8b3895','#ffbca5'],
        ['#080e34','#234f82','#66d7de'],['#27215f','#7a60b6','#ffd2e2']];
    function poly(c,p,color){c.fillStyle=color;c.beginPath();c.moveTo(...p[0]);for(let i=1;i<p.length;i++)c.lineTo(...p[i]);c.closePath();c.fill();}
    function line(c,p,color,w=2){c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(...p[0]);for(let i=1;i<p.length;i++)c.lineTo(...p[i]);c.stroke();}
    const textures=new WeakMap();
    function tile(c,x0,x1,y0,y1){
        for(let y=Math.floor(y0/32)*32;y<y1;y+=32)for(let x=Math.floor(x0/64)*64;x<x1;x+=64){
            const odd=mod(x/64+y/32,3),col=['#a33488','#c4429c','#91387e'][odd];
            c.fillStyle=col;c.fillRect(x+1,y+1,62,30);
            line(c,[[x+2,y+28],[x+23,y+7],[x+59,y+7]],'#f282ca',4);
            line(c,[[x+7,y+30],[x+29,y+12],[x+61,y+12]],'#5c2869',4);
            c.fillStyle='#ffd59b';c.fillRect(x+3,y+2,58,2);c.fillRect(x+4,y+5,2,7);
            if(odd===1){c.fillStyle='#4d2364';c.fillRect(x+39,y+18,17,9);c.fillStyle='#fe6dd5';c.fillRect(x+41,y+20,13,2);}
        }
    }
    function pattern(c){
        if(textures.has(c))return textures.get(c);
        if(!root.document?.createElement||!c.createPattern)return null;
        const a=root.document.createElement('canvas');a.width=192;a.height=192;
        const tc=a.getContext('2d');if(!tc)return null;tile(tc,0,192,0,192);
        const p=c.createPattern(a,'repeat');if(p)textures.set(c,p);return p;
    }
    function crystal(c,x,y,w,h,color='#347bdf'){
        poly(c,[[x,y],[x+w*.65,y-16],[x+w,y],[x+w,y+h],[x,y+h]],'#132c72');
        for(let k=0;k<6;k++){
            const xx=x+k*w/6;
            poly(c,[[xx,y],[xx+w/12,y-7],[xx+w/6,y],[xx+w/6,y+h],[xx,y+h]],k%2?'#2262b7':color);
            line(c,[[xx+2,y+3],[xx+w/12,y+h*.37],[xx+2,y+h*.7],[xx+w/12,y+h-2]],'#6ed5f7',2);
        }
        c.fillStyle='#ffe05b';c.fillRect(x-6,y-6,w+12,8);c.fillRect(x-6,y+h-5,w+12,10);
        c.fillStyle='#ac7529';c.fillRect(x-6,y+h+3,w+12,4);
        for(const xx of [x-7,x+w-1]){
            const grad=c.createLinearGradient(xx,0,xx+10,0);grad.addColorStop(0,'#a16a24');grad.addColorStop(.4,'#fff3a1');grad.addColorStop(1,'#e1a833');
            c.fillStyle=grad;c.fillRect(xx,y,10,h);
            for(let yy=y+12;yy<y+h;yy+=24)line(c,[[xx,yy],[xx+10,yy]],'#8e6533',2);
        }
    }
    function support(c,x,y,bottom,color){
        if(bottom<y+60)return;
        poly(c,[[x-25,y],[x+27,y-12],[x+27,bottom],[x-25,bottom]],'#28346c');
        crystal(c,x-18,y+14,36,Math.max(20,bottom-y-30),'#3568b5');
        line(c,[[x-29,y],[x+30,y]],color,6);
        for(let yy=y+36;yy<bottom-20;yy+=52){c.fillStyle=color;c.fillRect(x-8,yy,14,4);}
    }
    function road(c,s,g,main){
        const v=g.view,x0=Math.max(s.x0,v.x0-24),x1=Math.min(s.x1,v.x1+24);
        if(x1<=x0)return;
        const pts=[];for(let x=x0;x<x1;x+=10)pts.push([x,s.f(x)]);pts.push([x1,s.f(x1)]);
        const low=Math.min(...pts.map(p=>p[1])),high=Math.max(...pts.map(p=>p[1]));
        const depth=main?Math.max(340,v.y1-low+24):(s.thickness||70);
        const bottom=pts.slice().reverse().map(p=>[p[0],p[1]+depth]);
        poly(c,pts.concat(pts.slice().reverse().map(p=>[p[0]+18,p[1]-14])),'#f5c9f4');
        poly(c,pts.concat(bottom),'#692566');
        c.save();c.beginPath();c.moveTo(...pts[0]);for(const p of pts)c.lineTo(...p);for(const p of bottom)c.lineTo(...p);c.closePath();c.clip();
        const tex=pattern(c),y0=Math.max(v.y0,low),y1=Math.min(v.y1+25,high+depth);
        if(y1>y0){if(tex){c.fillStyle=tex;c.fillRect(x0,y0,x1-x0,y1-y0);}else tile(c,x0,x1,y0,y1);}
        // Gold-framed blue crystal machinery insets echo Quartz Good Future.
        for(let x=Math.ceil(x0/240)*240;x<x1;x+=240){
            const y=s.f(x)+48;
            if(y<v.y1&&y+95>v.y0&&depth>130)crystal(c,x+24,y,92,86);
        }
        c.restore();
        const index=mod(Math.floor(s.x0/1000),neon.length),accent=main?'#31eff3':neon[index];
        line(c,pts.map(p=>[p[0],p[1]+14]),'#47215d',7);
        line(c,pts.map(p=>[p[0],p[1]+9]),'#ffd54d',7);
        line(c,pts,'#172659',8);line(c,pts,accent,4);
        line(c,pts.map(p=>[p[0],p[1]-2]),'#f5ffff',1.5);
        line(c,pts.map(p=>[p[0]+18,p[1]-14]),'#ffed9a',2);
        if(!main){line(c,bottom,'#442459',6);line(c,bottom.map(p=>[p[0],p[1]-3]),'#e2a33a',3);}
    }
    function sign(c,x,y,text,color='#86ffea'){
        c.fillStyle='#14264b';c.fillRect(x-64,y-76,128,34);
        c.strokeStyle=color;c.lineWidth=2;c.strokeRect(x-64,y-76,128,34);
        line(c,[[x-45,y-42],[x-45,y]],'#e5b74f',6);
        c.fillStyle=color;c.font='bold 10px monospace';c.textAlign='center';c.fillText(text,x,y-55);
    }
    const Art={
        skyColors:(p,t,e)=>root.SonicEngine.skyColors(skies,p,t,e),
        drawBackground(c,g){
            const colors=Art.skyColors(g.player.x/g.terrain.endX,g.terrain.clock,g.terrain.timeEra),W=g.W,H=g.H;
            const sky=c.createLinearGradient(0,0,0,H);colors.forEach((s,i)=>sky.addColorStop([0,.6,1][i],s));c.fillStyle=sky;c.fillRect(0,0,W,H);
            for(let i=0;i<65;i++){
                const x=mod(i*131-g.camX*.035,W+20)-10,y=mod(i*79,H*.64);
                c.fillStyle=i%4?'rgba(255,255,255,.5)':'#a1ffef';c.fillRect(x,y,i%7?1:2,1);
            }
            const px=W*.78-g.camX*.008,py=H*.23-g.camY*.025;
            const halo=c.createRadialGradient(px,py,10,px,py,88);halo.addColorStop(0,'rgba(192,240,255,.8)');halo.addColorStop(1,'rgba(170,130,255,0)');c.fillStyle=halo;c.fillRect(px-88,py-88,176,176);
            c.fillStyle='#c8e8ff';c.beginPath();c.arc(px,py,28,0,TAU);c.fill();
            c.strokeStyle='#fa9eea';c.lineWidth=5;c.beginPath();c.ellipse(px,py,48,9,-.3,0,TAU);c.stroke();
            // Distant, restrained rainbow skyline and gold crystal conservatories.
            for(let layer=0;layer<2;layer++)for(let i=0;i<12;i++){
                const x=mod(i*159-g.camX*(.08+layer*.07),W+250)-125;
                const base=H*(.85+layer*.10)-g.camY*(.04+layer*.02),h=85+mod(i*71+layer*19,150);
                const w=65+mod(i*13,50);
                poly(c,[[x,base],[x,base-h],[x+w*.5,base-h-27],[x+w,base-h],[x+w,base]],layer?'#34336e':'#524e91');
                line(c,[[x+5,base],[x+5,base-h+4],[x+w*.5,base-h-20]],layer?'#9e74a8':'#a19abf',2);
                for(let yy=base-h+14;yy<base;yy+=25){c.fillStyle=neon[i%6];c.globalAlpha=.25;c.fillRect(x+12,yy,w-24,2);c.globalAlpha=1;}
            }
        },
        drawBack(c,g){
            const z=g.terrain.z3a2,v=g.view;
            for(const pool of z.pools){
                const x0=Math.max(pool.x0,v.x0),x1=Math.min(pool.x1,v.x1);if(x1<x0)continue;
                const grad=c.createLinearGradient(0,pool.y,0,pool.y+600);grad.addColorStop(0,'rgba(18,81,147,.65)');grad.addColorStop(1,'#152957');
                c.fillStyle=grad;c.fillRect(x0,pool.y,x1-x0,Math.max(0,v.y1-pool.y));
                for(let x=Math.ceil(x0/250)*250;x<x1;x+=250){
                    crystal(c,x+45,pool.y+80,78,200,'#295893');
                    line(c,[[x,pool.y+1],[x+90,pool.y+450]],'rgba(108,242,255,.07)',25);
                }
            }
            for(const s of [...z.roads,...z.galleries]){
                for(let x=Math.ceil(Math.max(s.x0+55,v.x0-80)/260)*260;x<Math.min(s.x1-40,v.x1+80);x+=260)
                    support(c,x,s.f(x)+26,z.main.f(x),neon[mod(Math.floor(x/260),6)]);
            }
            // Slender pinball architecture stays behind the collision plane.
            for(let x=Math.ceil(v.x0/560)*560;x<v.x1;x+=560){
                const y=z.main.f(Math.min(z.main.x1,Math.max(0,x)));
                if(y<v.y0-40)continue;
                c.fillStyle='#372956';c.fillRect(x+26,y-115,22,115);
                line(c,[[x+30,y-112],[x+30,y-4]],neon[mod(x/560,6)],3);
                poly(c,[[x+19,y-115],[x+37,y-140],[x+55,y-115]],'#e9bd55');
            }
        },
        drawTerrain(c,g){const z=g.terrain.z3a2;road(c,z.main,g,true);for(const s of g.terrain.floors)if(s!==z.main)road(c,s,g,false);},
        drawLoops(c,g){for(const l of g.terrain.loops){if(l.cx+l.r<g.view.x0||l.cx-l.r>g.view.x1)continue;
            for(const [dx,dy,w,col] of [[18,-14,36,'#e9b947'],[0,0,34,'#46276c'],[0,0,26,'#ff68cf'],[0,0,14,'#193879'],[0,0,8,'#35f2f2']]){
                c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.arc(l.cx+dx,l.cy+dy,l.r,0,TAU);c.stroke();}
            for(let i=0;i<28;i++){const a=i*TAU/28;line(c,[[l.cx+Math.cos(a)*(l.r+12),l.cy+Math.sin(a)*(l.r+12)],
                [l.cx+Math.cos(a)*(l.r+17),l.cy+Math.sin(a)*(l.r+17)]],neon[i%6],4);}
        }},
        drawPlatform(c,p){
            poly(c,[[p.x-p.w/2,p.y],[p.x-p.w/2+16,p.y-12],[p.x+p.w/2+16,p.y-12],[p.x+p.w/2,p.y]],'#fff1a2');
            c.fillStyle='#244985';c.fillRect(p.x-p.w/2,p.y,p.w,22);
            line(c,[[p.x-p.w/2,p.y],[p.x+p.w/2,p.y]],'#7affed',4);
            for(let x=p.x-p.w/2+8;x<p.x+p.w/2-8;x+=16){c.fillStyle=neon[mod(Math.floor(x/16),6)];c.fillRect(x,p.y+6,10,7);}
            c.fillStyle='#d9a739';c.fillRect(p.x-p.w/2,p.y+20,p.w,4);
        },
        drawFront(c,g){
            const z=g.terrain.z3a2,v=g.view;
            for(const vent of g.terrain.airVents){if(vent.x<v.x0-40||vent.x>v.x1+40)continue;
                const y=z.main.f(vent.x);c.fillStyle='#edc954';c.fillRect(vent.x-18,y-15,36,15);
                c.fillStyle='#164f79';c.fillRect(vent.x-13,y-14,26,6);
                c.fillStyle='#92ffff';c.font='9px monospace';c.textAlign='center';c.fillText('AIR',vent.x,y-23);
            }
            for(const [x,y,label] of [[820,520,'S / DOWN: FLOAT'],[3420,920,'JUMP AGAIN ↑'],[6060,520,'DEEP WELLS →'],
                [8660,1060,'JUMP AGAIN ↑'],[10550,520,'RAINBOW ARCADE'],[14680,520,'AURORA POOLS →'],[17950,520,'FINISH →']])
                if(x>v.x0-80&&x<v.x1+80)sign(c,x,y,label);
            // Small warning chevrons mark the real roof undersides.
            for(const s of z.roofs)for(let x=Math.max(s.x0,Math.ceil(v.x0/32)*32);x<Math.min(s.x1,v.x1);x+=32)
                line(c,[[x,s.f(x)+50],[x+8,s.f(x)+44]],'#ffb950',3);
        },
        drawHUD(c,g){
            if(g.titleCard?.timer>0||g.actClear||g.stageTime>13||g.player.inWater)return;
            c.save();c.globalAlpha=Math.min(1,13-g.stageTime);c.fillStyle='rgba(14,19,58,.88)';
            const w=Math.min(g.W-20,550);c.fillRect(g.W/2-w/2,g.H-75,w,37);
            c.fillStyle='#d6ffff';c.font='11px monospace';c.textAlign='center';
            c.fillText('Hold S / Down at the surface to swim on your back',g.W/2,g.H-60);
            c.fillText('Underwater: tap Jump repeatedly to rise • Air bubbles refill breath',g.W/2,g.H-46);c.restore();
        },
    };
    root.NeonLabyrinthArt=Art;
    if(typeof module!=='undefined'&&module.exports)module.exports=Art;
})(typeof window!=='undefined'?window:globalThis);
