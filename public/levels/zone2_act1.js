/** Zone 2 Act 1 — Marble Canopy.
 * Marble ruins meet a floating jungle: a fast catch road, four wall-kick towers,
 * and interwoven canopy highways. The earlier Emerald Hill / Carnival Night
 * map references inform the route splits and reconnections, not copied geometry.
 */
(function (root) {
    'use strict';
    const E = root.SonicEngine || (typeof require === 'function' ? require('../sonic-engine.js') : null);
    if (!E) return;
    const TAU = Math.PI * 2;
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    function rise(p, width, dy) { const slope = 2 * dy / width; return p.ease(width / 2, 0, slope).ease(width / 2, slope, 0); }
    function poly(c, pts, fill) {
        c.fillStyle = fill; c.beginPath();
        pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill();
    }
    function line(c, pts, color, width = 2) {
        c.strokeStyle = color; c.lineWidth = width; c.beginPath();
        pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    }
    function mix(a, b, f) {
        const aa = parseInt(a.slice(1), 16), bb = parseInt(b.slice(1), 16);
        const n = s => Math.round(((aa >> s) & 255) * (1 - f) + ((bb >> s) & 255) * f);
        return `rgb(${n(16)},${n(8)},${n(0)})`;
    }
    // Position and elapsed play time both move the sky, including while exploring.
    const SKIES = [
        ['#1758bb', '#46c8de', '#d8f9bf'], ['#573285', '#ef7d8b', '#ffdb8b'],
        ['#131c50', '#644593', '#e397b1'], ['#123e73', '#299db2', '#b6f3cb'],
    ];
    function skyColors(progress, clock, era) {
        const offset = era === 'past' ? .22 : era === 'present' ? .1 : 0;
        const phase = ((clamp(progress, 0, 1) * .72 + clock / 18000 + offset) % 1) * 4;
        const a = Math.floor(phase), f = phase - a, s = f * f * (3 - 2 * f);
        return SKIES[a].map((color, i) => mix(color, SKIES[(a + 1) % 4][i], s));
    }
    function leaf(c, x, y, angle, length, color) {
        c.save(); c.translate(x, y); c.rotate(angle);
        poly(c, [[0,0],[length*.35,-length*.22],[length,0],[length*.43,length*.13]], color);
        line(c, [[0,0],[length*.86,0]], '#95de77', 1); c.restore();
    }
    function tree(c, x, y, scale, t) {
        c.save(); c.translate(x, y); c.scale(scale, scale);
        poly(c, [[-18,0],[-10,-90],[8,-164],[27,-169],[7,-78],[19,0]], '#563e50');
        line(c, [[-9,-3],[-2,-85],[18,-161]], '#b99672', 5);
        for (let j = 0; j < 3; j++) {
            const px = 15 + (j - 1) * 53, py = -145 + Math.abs(j - 1) * 20;
            line(c, [[0,-96],[px,py]], '#604954', 12);
            for (let i = 0; i < 7; i++) leaf(c, px, py, -Math.PI + i * .5 + Math.sin(t*.009+j)*.025, 78 + (i%3)*13, i%2 ? '#348e57' : '#23684e');
            leaf(c, px, py-9, -.45, 80, '#61bc66');
        }
        for (const dx of [-14, 0, 14]) line(c, [[dx,0],[dx*2,9]], '#654659', 6);
        c.restore();
    }
    function pillar(c, x, top, bottom, width = 38) {
        const g = c.createLinearGradient(x, 0, x + width, 0);
        g.addColorStop(0, '#51416c'); g.addColorStop(.25, '#ac8caf'); g.addColorStop(.65, '#806587'); g.addColorStop(1, '#3d3459');
        c.fillStyle = g; c.fillRect(x, top, width, bottom - top);
        for (let y = top + 12; y < bottom - 8; y += 40) {
            c.fillStyle = '#423750'; c.fillRect(x, y, width, 3);
            c.fillStyle = '#c2a2b7'; c.fillRect(x, y + 3, width, 2);
            line(c, [[x+9,y+11],[x+9,y+28],[x+width-9,y+28]], '#604d70', 2);
        }
        c.fillStyle = '#dcc187'; c.fillRect(x-5, top, width+10, 9);
        c.fillStyle = '#3a8c65'; c.fillRect(x-6, top-5, width+12, 5);
        c.fillStyle = '#c6b18a'; c.fillRect(x-4, bottom-9, width+8, 9);
    }
    function temple(c, x, y, scale, color) {
        c.save(); c.translate(x,y); c.scale(scale,scale);
        c.fillStyle=color; c.fillRect(-150,-118,300,118);
        poly(c,[[-177,-118],[-114,-150],[-84,-186],[87,-186],[116,-150],[178,-118]],color);
        c.fillStyle='#354455'; c.fillRect(-35,-89,70,89);
        for (const dx of [-124,-74,60,110]) pillar(c,dx,-111,0,18);
        line(c,[[-164,-119],[164,-119]],'#b9b29f',6);
        poly(c,[[-35,-163],[0,-179],[35,-163],[22,-137],[-22,-137]],'#62677c');
        line(c,[[-19,-160],[-7,-155],[0,-161],[7,-155],[19,-160]],'#dbbe81',4);
        c.restore();
    }
    function road(c, surf, view, main, t) {
        const x0 = Math.max(surf.x0, view.x0-12), x1 = Math.min(surf.x1, view.x1+12);
        if (x1 <= x0) return;
        const pts = [];
        for (let x=x0; x<x1; x+=10) pts.push([x,surf.f(x)]);
        pts.push([x1,surf.f(x1)]);
        const thickness = main ? Math.max(480,view.y1-Math.min(...pts.map(p=>p[1]))) : (surf.thickness || 46);
        const boundary = pts.concat(pts.slice().reverse().map(p=>[p[0],p[1]+thickness]));
        poly(c,boundary,main?'#67516d':'#795e82');
        c.save(); c.beginPath(); boundary.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p)); c.closePath(); c.clip();
        const minY=Math.max(view.y0,Math.min(...pts.map(p=>p[1])));
        for(let row=Math.floor(minY/42);row*42<view.y1+42;row++) {
            if(!main && row*42>Math.max(...pts.map(p=>p[1]))+thickness)break;
            for(let x=Math.floor(x0/76)*76-(row%2)*38;x<x1;x+=76) {
                const y=row*42, n=((Math.floor(x/76)*13+row*7)%5+5)%5;
                const face=c.createLinearGradient(x,y,x+72,y+40);
                face.addColorStop(0,['#99829f','#a18aab','#887394','#ac8cac','#8a7192'][n]);
                face.addColorStop(.22,['#745c7c','#816985','#6d5875','#8b708e','#66516e'][n]);
                face.addColorStop(1,'#51435f');c.fillStyle=face;c.fillRect(x+2,y+2,72,38);
                line(c,[[x+3,y+37],[x+3,y+3],[x+72,y+3]],'#af8f9f',1);
                line(c,[[x+73,y+4],[x+73,y+39],[x+3,y+39]],'#433a55',2);
                if(n===1)line(c,[[x+18,y+10],[x+53,y+10],[x+53,y+28],[x+30,y+28],[x+30,y+18],[x+43,y+18]],'#c5a4bc',2);
                if(n===3)line(c,[[x+43,y+4],[x+36,y+13],[x+41,y+19],[x+30,y+34]],'#4e405d',1);
            }
        }
        // Molten light through deep masonry vents, safely below the running deck.
        if(main) for(let x=Math.ceil(x0/410)*410;x<x1;x+=410) {
            const y=surf.f(x)+98;
            c.fillStyle='#362a4c';c.fillRect(x-36,y,72,112);
            const glow=c.createLinearGradient(0,y,0,y+112);glow.addColorStop(0,'#b73f69');glow.addColorStop(1,'#ffb64f');c.fillStyle=glow;c.fillRect(x-28,y+8,56,104);
            for(let j=0;j<3;j++)line(c,[[x-28,y+65+j*15+Math.sin(t*.04+j)*3],[x+28,y+63+j*15]],'#ffdb7c',3);
            for(const dx of [-17,0,17])line(c,[[x+dx,y+9],[x+dx,y+112]],'#52405d',5);
            line(c,[[x-40,y],[x-40,y+114],[x+40,y+114],[x+40,y]],'#ad8190',5);
        }
        c.restore();
        poly(c,pts.map(p=>[p[0]+12,p[1]-9]).concat(pts.slice().reverse()),'#a1bc7c');
        line(c,pts.map(p=>[p[0]+12,p[1]-9]),'#d5e6ac',2);
        line(c,pts,'#285e4d',9);line(c,pts.map(p=>[p[0],p[1]-2]),'#74d075',4);
        line(c,pts.map(p=>[p[0],p[1]+10]),'#d2ad74',3);
        if(!main && thickness>35)for(let x=Math.ceil(x0/93)*93;x<x1;x+=93) {
            const y=surf.f(x)+thickness;
            line(c,[[x,y-8],[x+5,y+18],[x-1,y+37]],'#3a7456',3);
            leaf(c,x+3,y+9,.4,17,'#58a661');leaf(c,x+3,y+22,2.5,16,'#387d54');
        }
    }
    function sign(c,x,y,label) {
        line(c,[[x,y],[x,y-57]],'#55425b',5);
        c.fillStyle='#293e49';c.fillRect(x-61,y-82,122,28);c.strokeStyle='#cfb379';c.lineWidth=2;c.strokeRect(x-61,y-82,122,28);
        c.fillStyle='#e9e6b5';c.font='bold 10px monospace';c.textAlign='center';c.fillText(label,x,y-64);
    }
    E.Terrain.registerLevel('z2_act1', {
        title:'Marble Canopy Act 1',zone:2,zoneName:'MARBLE CANOPY',act:1,isBossAct:false,
        bgm:'assets/marble_canopy_act1.wav',startX:0,endX:12000,deathY:1380,
        cameraMinY:-700,cameraMaxY:620,probeY:-800,wallJump:true,smoothPresentation:true,animalZone:'ehz',
        theme:{skyTop:'#1758bb',skyMid:'#46c8de',skyBottom:'#d8f9bf',groundA:'#816985',groundB:'#51416c',trimColor:'#398858',trimHighlight:'#b8e891'},
        skyColors,
        buildTerrain(b,terrain) {
            const p=b.path(0,600).flat(700).bump(500,22,1);rise(p,400,100);p.flat(1800);rise(p,400,80);p.flat(1800);rise(p,600,-120);p.flat(1300);rise(p,500,100);p.flat(1400);rise(p,800,-200);p.flat(1800);
            const mainSurf=b.addFloor(p,{name:'marble jungle speed road'});
            b.addLoop(1960,580,120,'Emerald Gate Loop');b.addLoop(5360,652,128,'Molten Gallery Loop');b.addLoop(8830,630,130,'Sunset Ruin Loop');
            const shafts=[
                {x0:2780,x1:3000,top:160,bottom:650,steps:[580,440,300,160]},
                {x0:4740,x1:4960,top:-180,bottom:730,steps:[660,520,380,240,100,-40,-180]},
                {x0:7280,x1:7500,top:-340,bottom:610,steps:[540,400,260,120,-20,-160,-300,-340]},
                {x0:9680,x1:9900,top:-80,bottom:0,steps:[580,440,300,160,20,-80]},
            ];
            const ledges=[];
            shafts.forEach((s,i)=>{
                s.floor=mainSurf.f((s.x0+s.x1)/2);
                // A sloping underpass needs clearance at BOTH ends of a tower.
                s.bottom=Math.min(mainSurf.f(s.x0),mainSurf.f(s.x1))-62;
                b.addWall(s.x0,s.top-34,s.x0,s.bottom,1,0,`canopy climb ${i+1} left`,{wallJump:true});
                b.addWall(s.x1,s.top,s.x1,s.bottom,-1,0,`canopy climb ${i+1} right`,{wallJump:true});
                s.steps.forEach((y,j)=>{const f=b.addShelf(b.path(j%2===0?s.x0:s.x1-70,y).flat(70),{name:`canopy rest ${i+1}.${j+1}`,tier:'high'});f.thickness=26;ledges.push(f);});
            });
            const a=b.path(3000,160).flat(700);rise(a,360,160);a.flat(340);
            const upperA=b.addShelf(a,{name:'hanging garden loopway',tier:'high'});upperA.thickness=56;b.addLoop(3510,55,105,'Hanging Garden Loop');
            const d=b.path(4960,-180).flat(900);rise(d,500,220);d.flat(920);
            const upperB=b.addShelf(d,{name:'marble aqueduct skyway',tier:'high'});upperB.thickness=58;b.addLoop(5480,-285,105,'Aqueduct Sky Loop');
            // Settle the final wall kick and shoe-monitor bounce before the loop.
            const e=b.path(7500,-340).flat(1050);rise(e,600,280);e.flat(250);
            const upperC=b.addShelf(e,{name:'floating sanctuary highway',tier:'high'});upperC.thickness=60;b.addLoop(8330,-440,100,'Floating Sanctuary Loop');
            const f=b.path(9900,-80).flat(500);rise(f,720,360);f.flat(400);
            const finale=b.addShelf(f,{name:'sun temple home stretch',tier:'high'});finale.thickness=55;
            const mid=b.addShelf(b.path(7740,300).flat(1320),{name:'waterfall garden middle route',tier:'mid'});mid.thickness=48;
            const reward=b.addShelf(b.path(8550,-430).flat(280),{name:'sanctuary treasure balcony',tier:'high'});reward.thickness=45;
            const entry=b.addShelf(b.path(900,360).flat(480),{name:'opening jungle spring overlook',tier:'mid'});entry.thickness=50;
            const stepGarden=b.addShelf(b.path(2300,542).flat(260),{name:'sparkling step garden shortcut',tier:'mid'});stepGarden.thickness=44;
            const galleryExit=b.addShelf(b.path(4576,500).flat(150),{name:'collapsing gallery bridge landing',tier:'mid'});galleryExit.thickness=44;
            const vault=b.addCeiling(b.path(3900,570).flat(500),{name:'molten gallery ceiling'});vault.thickness=70;
            const roof=b.addShelf(b.path(3900,500).flat(500),{name:'molten gallery roof',tier:'mid'});roof.thickness=70;
            terrain.z2={mainSurf,upperA,upperB,upperC,finale,mid,reward,entry,stepGarden,galleryExit,roof,ledges,shafts,ceilings:[vault]};
            terrain.sections=[{name:'Jungle Rush',x:0},{name:'Hanging Gardens',x:2780},{name:'Molten Aqueduct',x:4740},{name:'Floating Sanctuary',x:7280},{name:'Sun Temple',x:9680}];
        },
        checkpoints:[{name:'1. Jungle Rush',x:120,y:600},{name:'2. Hanging Garden Climb',x:2660,y:700},{name:'3. Aqueduct Climb',x:4620,y:780},{name:'4. Floating Sanctuary Climb',x:7160,y:660},{name:'5. Sun Temple Climb',x:9550,y:746},{name:'6. Sanctuary Skyway',x:7570,y:-340},{name:'7. Temple Finish',x:11280,y:560}],
        objects(terrain) {
            const z=terrain.z2,m=z.mainSurf;
            const monitors=[{x:330,y:600,item:'shield'},{x:1080,y:360,item:'shoes'},{x:3200,y:160,item:'shoes'},{x:5120,y:-180,item:'shoes'},{x:7620,y:-340,item:'shoes'},{x:8780,y:-430,item:'1up'},{x:10030,y:-80,item:'invinc'}];
            const springs=[{x:800,y:m.f(800),color:'red',power:-12.3},{x:8650,y:z.upperC.f(8650),color:'red',power:-12.5}];
            for(const s of z.shafts) {
                // Entrance springs are above the underpass, so the speed road stays clear.
                springs.push({x:s.x0+30,y:s.steps[0],color:'yellow',power:-10.2});
                monitors.push({x:(s.x0+s.x1)/2,y:m.f((s.x0+s.x1)/2),item:'rings'});
            }
            const groundBots=[2420,3330,4470,5810,6720,8150,9320,10770].map(x=>({kind:'crab',x,y:m.f(x),minX:x-65,maxX:x+65,vx:1.2}));
            return {
                monitors,springs,starPosts:[2660,4620,7160,9550,11080].map(x=>({x,y:m.f(x)})),
                speedBoosters:[620,1630,3100,4940,5970,8270,10260].map(x=>({x,y:m.f(x),boost:12.6})).concat([{x:3090,y:160,boost:12.5},{x:3290,y:160,boost:12.5},{x:5030,y:-180,boost:12.6},{x:5210,y:-180,boost:12.6},{x:7560,y:-340,boost:12.5},{x:7750,y:-340,boost:12.6},{x:8170,y:-340,boost:12.6},{x:10080,y:-80,boost:12.4}]),
                dashRings:[{x:4270,y:230,angleDeg:-20,boost:12.3},{x:6830,y:-20,angleDeg:-12,boost:12.6},{x:9180,y:-130,angleDeg:-12,boost:12},{x:11200,y:210,angleDeg:9,boost:12.5}],
                platforms:[{x:4520,y:210,w:90,ampY:65,speed:.025},{x:9480,y:80,w:96,ampX:70,ampY:60,speed:.02}],
                bouncePoles:[{x:6460,y:m.f(6460)-25,dir:1,power:-10.6}],
                spinners:[{x:4000,y:680,variant:'silver'},{x:4220,y:660,variant:'dark'},{x:8000,y:220,variant:'silver'}],
                swingPlatforms:[{pivotX:1430,pivotY:220,len:134,maxAngle:.5,speed:.025},{pivotX:4495,pivotY:330,len:110,maxAngle:.6,speed:.03}],
                breakableWalls:[{x:4040,y:m.f(4040)},{x:6960,y:z.upperB.f(6960)},{x:10710,y:m.f(10710)}],
                breakableFloors:[{x:1355,y:360,w:128,h:40,kind:'thin'},{x:4448,y:500,w:128,h:56,kind:'thick'}],
                trapDoors:[{x:4400,y:500,w:48,period:210,openDuration:75}],
                rocks:[{x:2220,y:m.f(2220)},{x:9070,y:m.f(9070)}],
                houdiniGroups:[{triggerX:2140,triggerY:678,steps:[{x:2180,y:650},{x:2220,y:618},{x:2260,y:586},{x:2300,y:554}]}],
                enemies:groundBots.concat([{kind:'buzz',x:3700,y:70,phase:.2},{kind:'buzz',x:6200,y:-80,phase:2},{kind:'buzz',x:8260,y:-180,phase:1}]),
                spikeClusters:[{x:4180,y:500}],bigRing:{x:8690,y:-478},goalPost:{x:11640,y:560},capsule:null,
                timePosts:[{x:2290,y:700,kind:'PAST'},{x:10120,y:m.f(10120),kind:'FUTURE'}],
            };
        },
        setupObjects(r,terrain) {
            const z=terrain.z2;
            for(const x of [390,1260,2200,3120,3610,4470,5700,6120,6850,7660,8120,9220,10000,10880,11320])r.addSurfaceRings(z.mainSurf,x,30,6,26);
            for(const loop of terrain.loops)r.addLoopRings(loop,14);
            for(const [f,x,n] of [[z.entry,960,8],[z.stepGarden,2330,6],[z.galleryExit,4610,3],[z.upperA,3040,7],[z.upperA,3850,7],[z.upperB,5010,7],[z.upperB,6130,8],[z.upperB,6900,8],[z.upperC,7550,6],[z.upperC,8550,7],[z.mid,7880,9],[z.finale,9980,7],[z.finale,10810,7]])r.addSurfaceRings(f,x,30,n,26);
            for(const s of z.shafts)s.steps.forEach((y,j)=>r.addRingLine(j%2===0?s.x0+94:s.x1-94,y-55,0,-26,2));
        },
        drawBackground(c,g) {
            const W=g.W,H=g.H,t=g.terrain.clock,progress=g.player.x/g.terrain.endX;
            const colors=skyColors(progress,t,g.terrain.timeEra),sky=c.createLinearGradient(0,0,0,H);
            colors.forEach((color,i)=>sky.addColorStop([0,.57,1][i],color));c.fillStyle=sky;c.fillRect(0,0,W,H);
            const sunX=W*.77-g.camX*.009,sunY=H*.22;
            const halo=c.createRadialGradient(sunX,sunY,15,sunX,sunY,130);halo.addColorStop(0,'rgba(255,236,168,.6)');halo.addColorStop(1,'rgba(255,226,168,0)');c.fillStyle=halo;c.fillRect(sunX-130,sunY-130,260,260);
            c.fillStyle='#fff0ba';c.beginPath();c.arc(sunX,sunY,30,0,TAU);c.fill();
            const night=Math.max(0,Math.sin((progress*.72+t/18000)*TAU-Math.PI*.35));
            c.save();c.globalAlpha=night*.7;
            for(let i=0;i<45;i++){c.fillStyle='#e0f8f0';c.fillRect(((i*173-g.camX*.018)%W+W)%W,18+(i*43)%(H*.46),i%7===0?3:1.5,1.5);}c.restore();
            for(let i=0;i<7;i++) {
                const x=((i*243-g.camX*.045+t*.075)%(W+260)+W+260)%(W+260)-130,y=H*.16+(i%3)*38;
                c.fillStyle='rgba(235,255,225,.3)';c.beginPath();c.ellipse(x,y,70,13,0,0,TAU);c.ellipse(x+20,y-9,35,20,0,0,TAU);c.fill();
            }
            for(let layer=0;layer<3;layer++) {
                const par=[.045,.095,.17][layer],base=H*(.64+layer*.12)-g.camY*.045;
                const tileOffset=Math.floor(g.camX*par/260);
                for(let i=-1;i<W/260+2;i++) {
                    const worldI=i+tileOffset;
                    const x=i*260-((g.camX*par)%260),h=70+(Math.abs(worldI*37+layer*79)%95);
                    poly(c,[[x-70,H+50],[x-8,base-h*.2],[x+32,base-h],[x+143,base-h+9],[x+186,base-h*.4],[x+285,H+50]],['#678c9a','#387c80','#205d64'][layer]);
                    poly(c,[[x+32,base-h],[x+143,base-h+9],[x+120,base-h+28],[x+22,base-h+20]],['#9ebcaa','#6da78a','#56a67e'][layer]);
                    if(layer===1 && worldI%2===0){c.fillStyle='rgba(139,234,215,.5)';c.fillRect(x+82,base-h+25,12,H-base+h);line(c,[[x+86,base-h+28],[x+86,H]],'#a1e6d5',2);}
                    if(layer===0 && worldI%2===0)temple(c,x+87,base-h+10,.4,'#81989c');
                }
            }
            // Suspended islands make the sanctuary visible even from the lower road.
            for(let i=0;i<3;i++) {
                const x=((i*491+120-g.camX*.085)%(W+500)+W+500)%(W+500)-180,y=H*.3+i*27-g.camY*.025;
                poly(c,[[x-75,y],[x+75,y],[x+28,y+69],[x-12,y+92]],'#777384');
                poly(c,[[x-75,y],[x+75,y],[x+58,y-10],[x-48,y-14]],'#639e7c');
                temple(c,x,y-8,.34,'#8d8da0');line(c,[[x+43,y+4],[x+43,y+123]],'rgba(125,230,218,.5)',5);
            }
            c.fillStyle='rgba(116,220,185,.09)';c.fillRect(0,H*.78,W,H*.22);
        },
        drawBack(c,g) {
            const z=g.terrain.z2,v=g.view,t=g.terrain.clock;
            for(const x of [1130,2470,4400,6220,7910,10620]) {
                if(x<v.x0-90||x>v.x1+90)continue;
                const y=z.mainSurf.f(x)-200;
                const w=c.createLinearGradient(x-30,0,x+30,0);w.addColorStop(0,'rgba(26,125,135,.5)');w.addColorStop(.5,'rgba(148,245,218,.85)');w.addColorStop(1,'rgba(33,137,149,.6)');c.fillStyle=w;c.fillRect(x-30,y,60,620);
                for(let j=0;j<13;j++){const yy=y+((j*51+t*3)%600);line(c,[[x-24,yy],[x+20,yy]],'rgba(219,255,224,.5)',2);}
            }
            for(const s of z.shafts) {
                if(s.x1<v.x0||s.x0>v.x1)continue;
                pillar(c,s.x0-38,s.top-34,s.bottom);pillar(c,s.x1,s.top,s.bottom);
                for(let j=0;j<s.steps.length;j++) {
                    const y=s.steps[j]-35,x=(s.x0+s.x1)/2;c.save();c.globalAlpha=.45+.2*Math.sin(t*.06-j);
                    line(c,[[x-15,y+5],[x,y-8],[x+15,y+5]],'#f4e4a8',4);c.restore();
                }
            }
            for(const f of [z.entry,z.upperA,z.upperB,z.upperC,z.finale,z.mid])for(let x=f.x0+150;x<f.x1;x+=350) {
                if(x<v.x0-70||x>v.x1+70)continue;
                const y=f.f(x)+f.thickness,bottom=Math.min(z.mainSurf.f(x)+50,y+330);
                pillar(c,x-15,y,bottom,30);
                if(bottom-y>140){c.strokeStyle='#6e647e';c.lineWidth=15;c.beginPath();c.arc(x+155,y+125,145,Math.PI,TAU);c.stroke();line(c,[[x+15,y+26],[x+63,y+26]],'#b0a38c',3);}
            }
            for(let x=460;x<11800;x+=690) {
                if(x<v.x0-180||x>v.x1+180||z.shafts.some(s=>x>s.x0-150&&x<s.x1+150))continue;
                if(g.terrain.loops.some(l=>Math.abs(x-l.cx)<l.r+80))continue;
                tree(c,x,z.mainSurf.f(x),.9+(Math.floor(x/690)%3)*.13,t);
            }
            for(const deck of [z.upperA,z.upperB,z.upperC,z.finale,z.mid])for(let x=deck.x0+140;x<deck.x1-70;x+=630) {
                if(x<v.x0-160||x>v.x1+160||g.terrain.loops.some(l=>Math.abs(x-l.cx)<l.r+140))continue;
                tree(c,x,deck.f(x),.72,t);
            }
            if(v.x1>10900)temple(c,11480,560,1.1,'#8d7491');
        },
        drawLoops(c,g) {
            for(const L of g.terrain.loops) {
                if(L.cx+L.r+45<g.view.x0||L.cx-L.r-45>g.view.x1)continue;
                c.strokeStyle='#423b57';c.lineWidth=30;c.beginPath();c.arc(L.cx+10,L.cy-8,L.r+15,0,TAU);c.stroke();
                const stone=c.createLinearGradient(L.cx-L.r,L.cy-L.r,L.cx+L.r,L.cy+L.r);stone.addColorStop(0,'#d0b3bb');stone.addColorStop(.45,'#8f7398');stone.addColorStop(1,'#514362');
                c.strokeStyle=stone;c.lineWidth=26;c.beginPath();c.arc(L.cx,L.cy,L.r+14,0,TAU);c.stroke();
                for(let i=0;i<22;i++){const a=TAU*i/22;line(c,[[L.cx+Math.cos(a)*(L.r+4),L.cy+Math.sin(a)*(L.r+4)],[L.cx+Math.cos(a)*(L.r+26),L.cy+Math.sin(a)*(L.r+26)]],'#4e435e',2);}
                c.strokeStyle='#3c875b';c.lineWidth=8;c.beginPath();c.arc(L.cx,L.cy,L.r+2,0,TAU);c.stroke();c.strokeStyle='#b9e88c';c.lineWidth=2;c.stroke();
                c.strokeStyle='#dbb97c';c.lineWidth=2;c.beginPath();c.arc(L.cx,L.cy,L.r+24,0,TAU);c.stroke();
            }
        },
        drawTerrain(c,g) {
            const z=g.terrain.z2;road(c,z.mainSurf,g.view,true,g.terrain.clock);
            for(const f of g.terrain.floors)if(f!==z.mainSurf)road(c,f,g.view,false,g.terrain.clock);
            for(const vault of z.ceilings){const x0=Math.max(vault.x0,g.view.x0),x1=Math.min(vault.x1,g.view.x1);if(x1>x0)line(c,[[x0,vault.f(x0)],[x1,vault.f(x1)]],'#d6b48d',4);}
        },
        drawEnemy(c,en,info) {
            const x=en.x,y=en.kind==='crab'?en.y-13:en.y,t=info.clock;
            c.save();c.translate(x,y);
            if(en.kind==='crab')for(const dir of [-1,1])for(let i=0;i<3;i++)line(c,[[dir*8,0],[dir*(17+i*2),4+Math.sin(t*.2+i)*3],[dir*(21+i*2),12]],'#d6ac80',3);
            else for(const dir of [-1,1])poly(c,[[dir*8,0],[dir*32,-11-Math.sin(t*.35)*9],[dir*25,8],[dir*11,5]],'#a48aa8');
            c.fillStyle='#473954';c.beginPath();c.ellipse(0,0,16,11,0,0,TAU);c.fill();c.fillStyle='#9a769f';c.beginPath();c.ellipse(-2,-3,12,7,0,0,TAU);c.fill();line(c,[[0,-9],[0,7]],'#d6b284',2);
            c.fillStyle='#f4dc82';c.fillRect(-11,-2,6,3);c.fillRect(5,-2,6,3);c.restore();
        },
        drawPlatform(c,p) {pillar(c,p.x-p.w/2,p.y,p.y+23,p.w);},
        drawFront(c,g) {
            const z=g.terrain.z2,v=g.view;
            for(const s of z.shafts)if(s.x1>v.x0&&s.x0<v.x1)sign(c,(s.x0+s.x1)/2,s.floor,'JUMP + STEER');
            for(const [x,label] of [[240,'MARBLE CANOPY'],[2600,'CANOPY CLIMB'],[4550,'SKY AQUEDUCT'],[7090,'SANCTUARY'],[9490,'SUN TEMPLE']])if(x>v.x0-80&&x<v.x1+80)sign(c,x,z.mainSurf.f(x),label);
            // Small foreground ferns sit below the collision edge.
            for(let x=Math.ceil(v.x0/195)*195;x<v.x1;x+=195){if(x<0||x>12000)continue;const y=z.mainSurf.f(x)+22;for(let i=0;i<5;i++)leaf(c,x,y,-Math.PI+i*.7,20+(i%2)*7,i%2?'#3a8b5d':'#28684f');}
        },
        drawForeground(c,g) {
            const v=g.view,t=g.terrain.clock;
            c.save();for(let i=0;i<14;i++) {
                const x=v.x0+((i*173+t*.55)%(v.x1-v.x0)),y=v.y0+((i*83-t*.27)%650+650)%650;
                c.globalAlpha=.25+.2*Math.sin(t*.03+i);c.fillStyle=i%3===0?'#ffd48a':'#d0f9a7';c.beginPath();c.ellipse(x,y,2.5,1.2,t*.02+i,0,TAU);c.fill();
            }c.restore();
        },
    });
})(typeof window !== 'undefined' ? window : globalThis);
