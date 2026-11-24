/** Original 2.5D sandstone / turquoise scenery. Collision paths remain the source of truth. */
(function (root) {
    'use strict';
    const TAU = Math.PI * 2, mod = (n, d) => ((n % d) + d) % d;
    const skies = [['#247fc5', '#62d5df', '#ffe4aa'], ['#6b4fa3', '#f29d87', '#ffdc9b'],
        ['#142d63', '#517ca3', '#9bd1d1'], ['#276f94', '#66d4d0', '#fff0c5']];
    function poly(c, pts, color) {
        c.fillStyle = color; c.beginPath(); c.moveTo(...pts[0]);
        for (let i = 1; i < pts.length; i++) c.lineTo(...pts[i]);
        c.closePath(); c.fill();
    }
    function line(c, pts, color, width = 2) {
        c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(...pts[0]);
        for (let i = 1; i < pts.length; i++) c.lineTo(...pts[i]); c.stroke();
    }
    function skyColors(progress, clock, era) {
        return root.SonicEngine.skyColors(skies, progress, clock, era);
    }
    const masonry = new WeakMap();
    function bricks(c, x0, x1, y0, y1) {
        const shades=['#e8b45e','#d69a4b','#eac67b','#c58b46','#f1c36e'];
        for(let row=Math.floor(y0/20);row*20<y1;row++){
            for(let x=Math.floor(x0/40)*40-mod(row,2)*20;x<x1;x+=40){
                const y=row*20, n=mod(Math.floor(x/40)*11+row*7,5);
                c.fillStyle=shades[n];c.fillRect(x+1,y+1,38,18);
                c.fillStyle='#ffe0a0';c.fillRect(x+2,y+2,36,2);c.fillRect(x+2,y+4,2,12);
                c.fillStyle='#9a693d';c.fillRect(x+3,y+17,35,2);c.fillRect(x+37,y+4,2,14);
                if(mod(row,4)===0&&n===1){
                    c.fillStyle='#398e91';c.fillRect(x+13,y+4,14,12);
                    line(c,[[x+15,y+6],[x+25,y+6],[x+25,y+12],[x+19,y+12],[x+19,y+9]],'#a3e0cc',1);
                }else if(n===3)line(c,[[x+11,y+5],[x+16,y+10],[x+13,y+15]],'#b47b40',1);
            }
        }
    }
    function brickPattern(c) {
        if(masonry.has(c))return masonry.get(c);
        if(!root.document?.createElement||!c.createPattern)return null;
        // Exact 5-column / 20-row period, including staggered joints and inlays.
        // The 80,000-pixel tile avoids thousands of per-frame drawing commands.
        const tile=root.document.createElement('canvas');tile.width=200;tile.height=400;
        const tc=tile.getContext('2d');if(!tc)return null;
        tc.fillStyle='#79523c';tc.fillRect(0,0,200,400);bricks(tc,0,200,0,400);
        const pattern=c.createPattern(tile,'repeat');
        if(pattern)masonry.set(c,pattern);
        return pattern;
    }
    function column(c, x, y, bottom, w = 52) {
        if (bottom <= y) return;
        const grad = c.createLinearGradient(x, 0, x+w, 0);
        [[0,'#165862'],[.18,'#4dabad'],[.38,'#adede1'],[.56,'#75c9c3'],[.83,'#37868e'],[1,'#164f60']]
            .forEach(([p, v]) => grad.addColorStop(p, v));
        c.fillStyle = grad; c.fillRect(x, y, w, bottom-y);
        for (let row = Math.floor(y/24); row*24 < bottom; row++) {
            const yy = Math.max(y, row*24);
            line(c, [[x, yy],[x+w, yy]], '#205663', 2);
            const seam = x + (mod(row, 2) ? w*.32 : w*.66);
            line(c, [[seam, yy],[seam, Math.min(yy+24,bottom)]], '#397d84', 1);
            line(c, [[x+3, yy+2],[x+w-3, yy+2]], '#b1e6d3', 1);
        }
        for (const yy of [y, bottom-20]) {
            c.fillStyle = '#745239'; c.fillRect(x-7, yy, w+14, 20);
            c.fillStyle = '#f5cc76'; c.fillRect(x-7, yy, w+14, 4);
            c.fillStyle = '#db9b4e'; c.fillRect(x-4, yy+5, w+8, 11);
            c.fillStyle = '#ffdf8e'; c.fillRect(x-4, yy+6, w+8, 2);
            for (let dx = 3; dx < w; dx += 9) { c.fillStyle='#98663f'; c.fillRect(x+dx,yy+8,3,7); }
        }
    }
    function arch(c, x, y, w, h) {
        const r = w*.5, springY = y+r;
        column(c, x-18, springY, y+h, 36); column(c, x+w-18, springY, y+h, 36);
        c.beginPath(); c.arc(x+r, springY, r, Math.PI, TAU);
        c.strokeStyle='#77533e'; c.lineWidth=28; c.stroke();
        c.strokeStyle='#f0bd65'; c.lineWidth=21; c.stroke();
        c.strokeStyle='#ffe09b'; c.lineWidth=3; c.stroke();
        for (let i=0;i<=12;i++) {
            const a=Math.PI+i*Math.PI/12;
            line(c, [[x+r+Math.cos(a)*(r-11),springY+Math.sin(a)*(r-11)],
                [x+r+Math.cos(a)*(r+11),springY+Math.sin(a)*(r+11)]], '#97653e', 2);
        }
    }
    function obelisk(c, x, y, scale) {
        c.save(); c.translate(x,y); c.scale(scale,scale);
        poly(c,[[-22,0],[-17,-182],[0,-217],[17,-182],[22,0]],'#b97946');
        poly(c,[[-22,0],[-17,-182],[0,-217],[0,0]],'#f6c575');
        line(c,[[-16,-2],[-13,-180],[0,-210]],'#ffe3a1',3);
        for(let y=-156;y<-20;y+=24) {
            poly(c,[[-7,y],[0,y-7],[7,y],[0,y+7]],'#478b86');
            line(c,[[-8,y+11],[8,y+11]],'#95603b',2);
        }
        c.fillStyle='#95663d';c.fillRect(-32,-8,64,13);c.restore();
    }
    function road(c, s, g, main) {
        const v=g.view, x0=Math.max(s.x0,v.x0-20), x1=Math.min(s.x1,v.x1+20);
        if(x1<=x0)return;
        const pts=[];for(let x=x0;x<x1;x+=10)pts.push([x,s.f(x)]);pts.push([x1,s.f(x1)]);
        const low=Math.min(...pts.map(p=>p[1])), high=Math.max(...pts.map(p=>p[1]));
        const thickness=main?Math.max(380,v.y1-low+20):(s.thickness||80);
        const bottom=pts.slice().reverse().map(p=>[p[0],p[1]+thickness]);
        // Project the deck 18px into the background: collision sits on the front lip.
        poly(c,pts.concat(pts.slice().reverse().map(p=>[p[0]+18,p[1]-14])), '#fcdf9c');
        const face=pts.concat(bottom);poly(c,face,'#79523c');
        c.save();c.beginPath();c.moveTo(...face[0]);for(let i=1;i<face.length;i++)c.lineTo(...face[i]);c.closePath();c.clip();
        const pattern=brickPattern(c), y0=Math.floor(Math.max(v.y0,low)/20)*20,
            y1=Math.min(v.y1+20,high+thickness);
        if(pattern){c.fillStyle=pattern;c.fillRect(x0,y0,x1-x0,y1-y0);}
        else bricks(c,x0,x1,y0,y1);
        // Decorative frieze follows each walkable contour, never resembles a new floor.
        for(let x=Math.ceil(x0/64)*64;x<x1;x+=64){const y=s.f(x)+25;
            poly(c,[[x-9,y],[x,y-9],[x+9,y],[x,y+9]],'#a5763f');
            poly(c,[[x-6,y-1],[x,y-7],[x+6,y-1],[x,y+5]],'#ffe6a2');
        }
        c.restore();
        line(c,pts.map(p=>[p[0],p[1]+11]),'#68573c',7);
        line(c,pts.map(p=>[p[0],p[1]+6]),'#e6b155',6);
        line(c,pts,'#116f7c',7);line(c,pts.map(p=>[p[0],p[1]-2]),'#91e6da',3);
        line(c,pts.map(p=>[p[0]+18,p[1]-14]),'#ffeab6',2);
        if(!main){
            line(c,bottom,'#6c4c3d',5);
            for(const end of [s.x0,s.x1])if(end>=v.x0&&end<=v.x1)
                poly(c,[[end,s.f(end)],[end+18,s.f(end)-14],[end+18,s.f(end)+thickness-14],[end,s.f(end)+thickness]],'#8f693f');
        }
    }
    function fall(c, w, g) {
        if(w.x<g.view.x0-70||w.x>g.view.x1+70)return;
        const grad=c.createLinearGradient(w.x-26,0,w.x+26,0);
        [[0,'#287f93'],[.25,'#53cad5'],[.55,'#b7f9ed'],[.8,'#43b4c5'],[1,'#26768f']]
            .forEach(([p,v])=>grad.addColorStop(p,v));
        c.fillStyle=grad;c.fillRect(w.x-26,w.top,52,w.bottom-w.top);
        c.save();c.beginPath();c.rect(w.x-26,w.top,52,w.bottom-w.top);c.clip();
        for(let i=0;i<7;i++)for(let y=w.top-80+mod(g.terrain.clock*(2+i%3)+i*31,90);y<w.bottom;y+=90){
            c.fillStyle=i%2?'#d5fff0':'#6ae4df';c.fillRect(w.x-22+i*7,y,2,27+(i%3)*8);
        }c.restore();
        c.fillStyle='#e1fff0';for(let i=0;i<6;i++)c.fillRect(w.x-34+i*12,w.bottom-4-Math.sin(g.terrain.clock*.09+i)*4,10,4);
    }
    const Art = {
        skyColors,
        drawBackground(c,g){
            const W=g.W,H=g.H,t=g.terrain.clock, progress=g.player.x/g.terrain.endX;
            const colors=skyColors(progress,t,g.terrain.timeEra), grad=c.createLinearGradient(0,0,0,H);
            colors.forEach((s,i)=>grad.addColorStop([0,.58,1][i],s));c.fillStyle=grad;c.fillRect(0,0,W,H);
            const sunX=W*.75-g.camX*.013,sunY=H*.24;
            const halo=c.createRadialGradient(sunX,sunY,4,sunX,sunY,95);
            halo.addColorStop(0,'#fff6d4');halo.addColorStop(.23,'#ffefb0');halo.addColorStop(1,'rgba(255,223,161,0)');
            c.fillStyle=halo;c.fillRect(sunX-95,sunY-95,190,190);
            c.fillStyle='#fff2c2';c.beginPath();c.arc(sunX,sunY,21,0,TAU);c.fill();
            for(let i=0;i<7;i++){
                const x=mod(i*241-g.camX*.09-t*.05,W+320)-160,y=65+(i%3)*44;
                c.fillStyle='rgba(255,244,221,.34)';c.beginPath();c.ellipse(x,y,100,11,0,0,TAU);c.fill();
            }
            for(let layer=0;layer<3;layer++){
                const base=H*(.61+layer*.10)-g.camY*(.025+layer*.014),points=[[0,H]];
                for(let x=-40;x<W+60;x+=32){const world=x+g.camX*(.06+layer*.07);
                    points.push([x,base+Math.sin(world*.004+layer)*31+Math.sin(world*.009)*13]);}
                points.push([W,H]);poly(c,points,['#b0c6b7','#baae8a','#c6a16c'][layer]);
            }
            for(let i=0;i<6;i++){
                const x=mod(i*367-g.camX*.12,W+460)-200,y=H*.70-g.camY*.04;
                poly(c,[[x-120,y],[x,y-145],[x+145,y]],'#9c9b81');
                poly(c,[[x,y-145],[x+145,y],[x+32,y]],'#747f79');
                line(c,[[x-110,y-2],[x,y-140]],'#d8c39a',2);
            }
            const waterY=H*.84-g.camY*.045;c.fillStyle='#479ca5';c.fillRect(0,waterY,W,H-waterY);
            for(let i=0;i<18;i++){const y=waterY+i*7;c.fillStyle=i%2?'#73c6c4':'#b5ded0';
                const x=mod(i*167+t*.35-g.camX*.2,W);c.fillRect(x,y,30+i%4*24,1);}
        },
        drawBack(c,g){
            const z=g.terrain.z3a1,v=g.view;
            for(const s of z.roads)for(let x=Math.ceil(Math.max(s.x0,v.x0-220)/440)*440;x<Math.min(s.x1,v.x1+220);x+=440){
                const y=s.f(x)+28,bottom=z.main.f(Math.min(x,z.main.x1));
                if(bottom>y+150)arch(c,x-85,y+10,170,bottom-y+25);
            }
            for(const x of [580,3790,8280,13530,14800])if(x>v.x0-100&&x<v.x1+100)obelisk(c,x,z.main.f(x),1);
            for(const w of z.waterfalls)fall(c,w,g);
            for(const shaft of z.shafts){
                if(shaft.x1<v.x0||shaft.x0>v.x1)continue;
                column(c,shaft.x0-28,shaft.top,shaft.bottom,28);column(c,shaft.x1,shaft.top,shaft.bottom,28);
                for(let y=shaft.bottom-35;y>shaft.top;y-=50){
                    line(c,[[shaft.x0+4,y+7],[shaft.x0+11,y],[shaft.x0+18,y+7]],'#aaf3e1',3);
                    line(c,[[shaft.x1-18,y+7],[shaft.x1-11,y],[shaft.x1-4,y+7]],'#aaf3e1',3);
                }
            }
        },
        drawTerrain(c,g){
            const z=g.terrain.z3a1;road(c,z.main,g,true);
            for(const s of g.terrain.floors)if(s!==z.main)road(c,s,g,false);
            for(const ch of z.chutes){
                const pts=[],x0=Math.max(ch.x0,g.view.x0),x1=Math.min(ch.x1,g.view.x1);
                if(x1<=x0)continue;
                for(let x=x0;x<x1;x+=10)pts.push([x,ch.surface.f(x)-3]);pts.push([x1,ch.surface.f(x1)-3]);
                line(c,pts,'#1c9aaf',8);line(c,pts.map(p=>[p[0],p[1]-2]),'#d0fff1',2);
                for(let x=Math.floor(x0/80)*80+mod(g.terrain.clock*3,80);x<x1;x+=80)
                    line(c,[[x,ch.surface.f(x)-4],[x+16,ch.surface.f(x+16)-4]],'#e9ffef',2);
            }
        },
        drawLoops(c,g){
            for(const l of g.terrain.loops){if(l.cx+l.r<g.view.x0||l.cx-l.r>g.view.x1)continue;
                for(const [dx,dy,w,color] of [[14,-12,36,'#f3d191'],[0,0,34,'#8b5d3e'],[0,0,27,'#e7b05c'],[0,0,16,'#235f67'],[0,0,11,'#49bbc2'],[-1,-1,3,'#c4f9e9']]){
                    c.beginPath();c.arc(l.cx+dx,l.cy+dy,l.r,0,TAU);c.lineWidth=w;c.strokeStyle=color;c.stroke();}
                for(let i=0;i<32;i++){const a=i*TAU/32;
                    line(c,[[l.cx+Math.cos(a)*(l.r+10),l.cy+Math.sin(a)*(l.r+10)],
                        [l.cx+Math.cos(a)*(l.r+17),l.cy+Math.sin(a)*(l.r+17)]],'#936c46',2);}
            }
        },
        drawPlatform(c,p){
            poly(c,[[p.x-p.w/2,p.y],[p.x-p.w/2+14,p.y-10],[p.x+p.w/2+14,p.y-10],[p.x+p.w/2,p.y]],'#ffe2a2');
            c.fillStyle='#84603e';c.fillRect(p.x-p.w/2,p.y,p.w,24);
            c.fillStyle='#49b7b9';c.fillRect(p.x-p.w/2+3,p.y+4,p.w-6,12);
            line(c,[[p.x-p.w/2,p.y],[p.x+p.w/2,p.y]],'#b5f5e2',3);
            for(let x=p.x-p.w/2+9;x<p.x+p.w/2;x+=18){c.fillStyle='#1f757e';c.fillRect(x,p.y+6,8,8);}
        },
        drawFront(c,g){
            for(const j of g.terrain.z3a1.jets){if(j.x<g.view.x0-60||j.x>g.view.x1+60)continue;
                const t=g.terrain.clock;column(c,j.x-30,j.y-12,j.y+25,60);
                for(let i=0;i<5;i++){
                    const x=j.x+(i-2)*8,height=65+Math.sin(t*.09+i)*15;
                    line(c,[[x,j.y-14],[x+(i-2)*2,j.y-height]],i%2?'#95f0e7':'#42bfce',4);
                    c.fillStyle='#ddfff1';c.fillRect(x-1,j.y-height-4,3,6);
                }
                line(c,[[j.x-7,j.y-88],[j.x,j.y-98],[j.x+7,j.y-88]],'#eaffdb',3);
            }
        },
        drawForeground(c,g){
            const z=g.terrain.z3a1,t=g.terrain.clock;
            for(const w of z.pools){const x0=Math.max(w.x0,g.view.x0),x1=Math.min(w.x1,g.view.x1);
                if(x1<=x0||w.y>g.view.y1)continue;
                c.fillStyle='rgba(33,169,193,.24)';c.fillRect(x0,w.y,x1-x0,46);
                line(c,[[x0,w.y],[x1,w.y]],'#b9fff0',2);
                for(let x=Math.floor(x0/75)*75+mod(t*.8,75);x<x1;x+=75){
                    c.fillStyle='rgba(202,255,242,.66)';c.fillRect(x,w.y+9+Math.sin(x*.05+t*.07)*3,19,2);}
            }
            // A small ground contact shadow anchors the volumetric Scar to the same 2D surface.
            const p=g.player;
            if(p.grounded&&p.groundSurface?.kind==='height'){
                c.fillStyle='rgba(39,57,59,.22)';c.beginPath();c.ellipse(p.x,p.y+p.radii.height+3,15,3,0,0,TAU);c.fill();}
        },
        drawHUD(c,g){
            if(g.titleCard?.timer>0||g.actClear||g.stageTime>12)return;
            c.save();c.globalAlpha=Math.min(1,Math.max(0,12-g.stageTime));
            c.fillStyle='rgba(14,55,66,.86)';c.fillRect(g.W/2-205,g.H-68,410,26);
            c.fillStyle='#e2fff0';c.font='12px monospace';c.textAlign='center';
            c.fillText('Ride water jets up • Follow the turquoise chutes',g.W/2,g.H-51);c.restore();
        },
    };
    root.MirageAqueductArt=Art;
    if(typeof module!=='undefined'&&module.exports)module.exports=Art;
})(typeof window!=='undefined'?window:globalThis);
