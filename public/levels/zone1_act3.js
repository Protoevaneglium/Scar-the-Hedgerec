/** Zone 1 Act 3 — Bazooka Citadel: branching canyon expressways and Kitt's missile fortress. */
(function (root) {
    'use strict';
    let SonicEngine = root.SonicEngine || null;
    if (!SonicEngine && typeof require === 'function') {
        try { SonicEngine = require('../sonic-engine.js'); } catch (_) {}
    }
    if (!SonicEngine || !SonicEngine.Terrain) return;
    const TAU = Math.PI * 2;
    const panorama = typeof Image !== 'undefined' ? new Image() : null;
    if (panorama) panorama.src = 'assets/kitt_fortress_panorama.png';
    const ARENA = { left: 8000, right: 9400, floorY: 560, triggerX: 8000, spawnX: 9030 };
    const SHAFTS = [
        { x0: 3260, x1: 3500, top: 190, bottom: 710, floor: 760, steps: [640, 520, 410, 300, 190] },
        { x0: 5410, x1: 5650, top: -240, bottom: 650, floor: 730, steps: [590, 450, 310, 170, 30, -110, -240] },
    ];
    function rise(p, width, dy) {
        const slope = 2 * dy / width;
        return p.ease(width / 2, 0, slope).ease(width / 2, slope, 0);
    }
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
    function poly(ctx, pts, fill) {
        ctx.fillStyle = fill; ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.closePath(); ctx.fill();
    }
    function line(ctx, pts, color, width) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
    }
    function mix(a, b, f) {
        const aa = parseInt(a.slice(1), 16), bb = parseInt(b.slice(1), 16);
        const c = s => Math.round(((aa >> s) & 255) * (1-f) + ((bb >> s) & 255) * f);
        return `rgb(${c(16)},${c(8)},${c(0)})`;
    }
    function crest(ctx, x, y, scale) {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        poly(ctx, [[-24,-15],[-22,-34],[-8,-24],[8,-24],[22,-34],[24,-15],[18,10],[0,22],[-18,10]], '#211730');
        poly(ctx, [[-19,-8],[-3,-2],[-8,7],[-18,3]], '#ffdb53');
        poly(ctx, [[19,-8],[3,-2],[8,7],[18,3]], '#ffdb53');
        poly(ctx, [[-5,12],[5,12],[0,17]], '#ffdb53'); ctx.restore();
    }
    function road(ctx, surf, view, main) {
        const x0 = Math.max(surf.x0, view.x0 - 20), x1 = Math.min(surf.x1, view.x1 + 20);
        if (!(x1 > x0)) return;
        const pts = [];
        for (let x = x0; x < x1; x += 10) pts.push([x, surf.f(x)]);
        pts.push([x1, surf.f(x1)]);
        const thickness = main ? Math.max(460, view.y1 - Math.min(...pts.map(p => p[1]))) : (surf.thickness || 48);
        const body = ctx.createLinearGradient(0, pts[0][1], 0, pts[0][1] + thickness);
        body.addColorStop(0, main ? '#e99a58' : '#a67bc0');
        body.addColorStop(.4, main ? '#c57755' : '#73508e');
        body.addColorStop(1, main ? '#75414f' : '#3c2b57');
        const boundary = pts.concat(pts.slice().reverse().map(p => [p[0],p[1]+thickness]));
        poly(ctx, boundary, body);
        ctx.save(); ctx.beginPath(); boundary.forEach((p,i) => i ? ctx.lineTo(p[0],p[1]) : ctx.moveTo(p[0],p[1])); ctx.closePath(); ctx.clip();
        for (let x = Math.floor(x0 / 96)*96; x < x1+96; x += 96) {
            const y = surf.f(clamp(x+32, surf.x0, surf.x1));
            if (main) {
                const cell=Math.floor(x/96),sway=Math.sin(cell*12.39)*19,height=142+((cell*41)%73+73)%73;
                poly(ctx, [[x-4,y+14],[x+74,y+28+sway],[x+26+sway,y+height],[x-42,y+height+53]], cell%3===0?'#dc905e':'#cb8057');
                poly(ctx, [[x+74,y+28+sway],[x+112,y+86],[x+26+sway,y+height]], cell%2===0?'#a9604c':'#b66c50');
                line(ctx, [[x+7,y+26],[x-14+sway,y+height-36]], '#f5b879', 3);
                line(ctx, [[x+7,y+26],[x+41,y+31]], '#ffd299', 2);
                for (let j=0; j<5; j++) {
                    const sy=y+55+j*57+Math.sin(cell*1.7+j)*13;
                    line(ctx, [[x-10,sy+5],[x+18,sy],[x+87,sy+4]],j%2===0?'#ab604a':'#df9767',j%2===0?2:1);
                    if(j%2===0)poly(ctx,[[x+51,sy+11],[x+64,sy+8],[x+59,sy+16]],'#f1b47b');
                }
                line(ctx,[[x+49,y+36],[x+40,y+56],[x+46,y+66],[x+32,y+89]],'#945246',1.5);
            } else {
                line(ctx, [[x,y+6],[x-13,y+thickness]], '#4c355d', 3);
                ctx.fillStyle='#3f2c59';ctx.fillRect(x+12,y+13,59,Math.min(27,thickness-18));
                line(ctx,[[x+12,y+13],[x+71,y+13],[x+71,y+36]],'#bd8ed0',1);
                for(let vent=0;vent<5;vent++)line(ctx,[[x+21+vent*9,y+20],[x+17+vent*9,y+31]],vent%2?'#9c7eb4':'#e5b875',2);
                for(const bx of [x+8,x+75]){ctx.fillStyle='#e6c4df';ctx.beginPath();ctx.arc(bx,y+16,2,0,TAU);ctx.fill();ctx.fillStyle='#4a335c';ctx.fillRect(bx-1,y+15,2,1);}
            }
        }
        ctx.restore();
        poly(ctx, pts.map(p=>[p[0]+17,p[1]-12]).concat(pts.slice().reverse()), main?'#f2bb79':'#b18ac5');
        line(ctx, pts.map(p=>[p[0]+17,p[1]-12]), main?'#ffe1a4':'#e9caeb', 2);
        line(ctx, pts, main?'#99573f':'#60406e', 8);
        line(ctx, pts.map(p=>[p[0],p[1]+2]), '#ffd785', 3);
        if (!main) for (let x = Math.ceil(x0/72)*72; x<x1; x+=72) {
            const y=surf.f(x); line(ctx, [[x,y+14],[x+26,y+14]], '#ebce87', 3);
        }
    }
    function fortress(ctx, x, baseline, scale, t, night) {
        ctx.save(); ctx.translate(x, baseline); ctx.scale(scale,scale);
        const tower=(tx,w,h)=>{
            poly(ctx,[[tx-w/2,0],[tx-w*.34,-h],[tx+w*.28,-h],[tx+w/2,0]],'#79549b');
            poly(ctx,[[tx+w*.28,-h],[tx+w*.46,-h-14],[tx+w*.68,-14],[tx+w/2,0]],'#493b6a');
            line(ctx,[[tx-w*.34,-h],[tx+w*.28,-h]],'#c595cc',4);
            for(let y=-h+24;y<-16;y+=25) for(let i=0;i<3;i++) {
                ctx.fillStyle=night>.45?'#f8b866':'#49355e'; ctx.fillRect(tx-w*.22+i*w*.2,y,6,12);
            }
        };
        tower(-158,80,156); tower(146,90,185); tower(0,240,245);
        poly(ctx,[[-98,-228],[-68,-279],[62,-279],[90,-228]],'#a17ab8');
        for(let x=-70;x<70;x+=34) {ctx.fillStyle='#ba92ca';ctx.fillRect(x,-291,20,14);}
        ctx.fillStyle='#392b52';ctx.fillRect(-56,-218,112,73);crest(ctx,0,-181,.95);
        line(ctx,[[-118,-126],[123,-126]],'#c99bd2',5);
        ctx.fillStyle='#352a4c';ctx.fillRect(-21,-91,42,91);
        line(ctx,[[130,-185],[130,-343]],'#705084',5);
        ctx.fillStyle=Math.sin(t*.07)>0?'#ff956a':'#fcda96';ctx.beginPath();ctx.arc(130,-343,4,0,TAU);ctx.fill();
        line(ctx,[[-18,-279],[-18,-320],[10,-343]],'#493651',7);
        ctx.save();ctx.translate(-7,-339);ctx.rotate(-.62+Math.sin(t*.006)*.08);
        ctx.fillStyle='#c1a4d4';ctx.beginPath();ctx.ellipse(0,0,42,12,0,0,TAU);ctx.fill();ctx.strokeStyle='#564166';ctx.lineWidth=3;ctx.stroke();
        line(ctx,[[-33,0],[30,0]],'#78608e',2);line(ctx,[[0,7],[0,-18]],'#45364f',3);ctx.restore();
        ctx.strokeStyle='#8a6b9e';ctx.lineWidth=16;ctx.beginPath();ctx.ellipse(-158,-37,195,30,-.09,Math.PI,TAU);ctx.stroke();
        for(let i=0;i<6;i++)line(ctx,[[-330+i*45,-42],[-337+i*45,42]],'#5c486f',10);
        ctx.restore();
    }
    function sign(ctx,x,y,text) {
        line(ctx,[[x,y],[x,y-53]],'#49384f',5);
        ctx.fillStyle='#44324f';ctx.fillRect(x-58,y-79,116,30);
        ctx.strokeStyle='#edc963';ctx.lineWidth=2;ctx.strokeRect(x-58,y-79,116,30);
        ctx.fillStyle='#ffe28b';ctx.textAlign='center';ctx.font='bold 10px monospace';ctx.fillText(text,x,y-60);
    }

    SonicEngine.Terrain.registerLevel('z1_act3', {
        title: 'Bazooka Citadel Act 3', zone: 1, zoneName: 'BAZOOKA CITADEL', act: 3,
        isBossAct: true, bgm: 'assets/level1.mp3', startX: 0, endX: 9600, deathY: 1320,
        cameraMinY: -650, cameraMaxY: 580, wallJump: true, smoothPresentation: true,
        theme: {skyTop:'#2868e7',skyMid:'#79c0ff',skyBottom:'#ffe2bb',groundA:'#d38b7c',groundB:'#69456d',loopA:'#ffd45c',loopB:'#785092',trimColor:'#b88ec1',trimHighlight:'#ffe1ba'},
        buildTerrain(b, terrain) {
            // Lower catch route: broad rolling terrain, two linked loops, a pinball underpass,
            // and the third loop. Upper routes continually reconnect to this road.
            const lower=b.path(0,600).flat(500).bump(500,25,1).flat(600);
            rise(lower,550,160);lower.flat(1050).bump(520,24,-1).flat(380);
            rise(lower,500,-60);lower.flat(750);rise(lower,450,80);
            lower.flat(500).bump(500,26,1);rise(lower,1000,-220);lower.flat(1800);
            const floor=b.addFloor(lower,{name:'citadel canyon catch road'});
            const arenaFloor=floor;
            b.addLoop(1150,480,120,'Canyon Launch Loop');
            b.addLoop(2750,628,132,'Canyon Spiral Loop');
            b.addLoop(4920,578,122,'Fortress Approach Loop');
            const a=b.path(780,345).flat(460);rise(a,320,-80);a.flat(880);rise(a,600,140);a.flat(180);
            const sunDeck=b.addShelf(a,{name:'sunlit canyon upper viaduct',tier:'high'});sunDeck.thickness=65;
            b.addLoop(2010,155,110,'Sunlit Overlook Loop');
            const ledges=[];
            for(const [i,s] of SHAFTS.entries()) {
                b.addWall(s.x0,s.top-34,s.x0,s.bottom,1,0,`wall kick shaft ${i+1} left`,{wallJump:true});
                b.addWall(s.x1,s.top,s.x1,s.bottom,-1,0,`wall kick shaft ${i+1} right`,{wallJump:true});
                s.steps.forEach((y,j)=>{
                    const x=j%2===0?s.x0:s.x1-76;
                    const shelf=b.addShelf(b.path(x,y).flat(76),{name:`wall kick rest ${i+1}.${j+1}`,tier:'high'});
                    shelf.thickness=29;ledges.push(shelf);
                });
            }
            const c=b.path(3500,190).flat(1040);rise(c,400,120);c.flat(170);
            const upperA=b.addShelf(c,{name:'citadel wall kick loop deck',tier:'high'});upperA.thickness=62;
            b.addLoop(4030,85,105,'Wall Kick Sky Loop');
            const d=b.path(5650,-240).flat(370);rise(d,300,200);d.flat(650).bump(500,22,-1);rise(d,430,160);d.flat(120);
            const summit=b.addShelf(d,{name:'summit upper loop highway',tier:'high'});summit.thickness=66;
            b.addLoop(6620,-152,112,'Citadel Summit Loop');
            const e=b.path(5800,375).flat(390);rise(e,300,-50);e.flat(870);rise(e,320,80);e.flat(160);
            const mid=b.addShelf(e,{name:'crossfire middle loop viaduct',tier:'mid'});mid.thickness=56;
            b.addLoop(6910,220,105,'Crossfire Loop');
            const reward=b.addShelf(b.path(6680,-300).flat(280),{name:'summit special ring balcony',tier:'high'});reward.thickness=42;
            for(const [x,y,w] of [[3040,675,112],[3175,550,90],[3820,620,120],[3990,525,100],[4540,520,120],[5210,600,130],[5290,470,110],[7440,460,160]]) {
                const f=b.addShelf(b.path(x,y).flat(w),{name:'citadel inter-route stair',tier:'mid'});f.thickness=38;
            }
            const ceiling=b.addCeiling(b.path(3730,430).flat(820),{name:'pinball chamber vault'});ceiling.thickness=110;
            const vaultRoof=b.addShelf(b.path(3730,320).flat(820),{name:'pinball chamber roof passage',tier:'mid'});vaultRoof.thickness=110;
            for(const shaft of SHAFTS)shaft.floor=floor.f((shaft.x0+shaft.x1)/2);
            terrain.z3={mainSurf:floor,arenaFloor,sunDeck,upperA,summit,upperB:summit,mid,reward,ledges,shafts:SHAFTS,ceilings:[ceiling],arena:ARENA};
        },
        checkpoints:[
            {name:'1. Canyon Launch',x:120,y:600},{name:'2. Linked Canyon Loops',x:2360,y:760},
            {name:'3. Wall Kick Ascent',x:3170,y:760},{name:'4. Sky Fortress Loop',x:3600,y:190},
            {name:'5. Summit Ascent',x:5330,y:700},{name:'6. Kitt Approach',x:7900,y:560},
            {name:'7. Kitt Bazooka Boss',x:8150,y:560},
        ],
        objects(terrain) {
            const z=terrain.z3,f=z.mainSurf;
            return {
                monitors:[{x:290,y:600,item:'shield'},{x:980,y:z.sunDeck.f(980),item:'shoes'},{x:2250,y:760,item:'rings'},{x:3300,y:640,item:'rings'},{x:3610,y:190,item:'shoes'},{x:5200,y:f.f(5200),item:'rings'},{x:5790,y:-240,item:'shield'},{x:6880,y:-300,item:'1up'},{x:7810,y:560,item:'rings'}],
                starPosts:[{x:2170,y:f.f(2170)},{x:3150,y:f.f(3150)},{x:5270,y:f.f(5270)},{x:7900,y:560}],
                springs:[
                    {x:720,y:f.f(720),color:'red',power:-14.5},{x:1660,y:600,color:'yellow',power:-10.8},
                    {x:3060,y:675,color:'yellow',power:-10.8},{x:3300,y:640,color:'red',power:-13.6},
                    {x:3300,y:410,color:'yellow',power:-10.6},{x:3850,y:620,color:'red',power:-12.2},
                    {x:4570,y:520,color:'yellow',power:-11.8},{x:5330,y:600,color:'yellow',power:-10.5},
                    {x:5450,y:590,color:'red',power:-14.2},{x:5450,y:310,color:'red',power:-12.4},
                    {x:5450,y:30,color:'red',power:-12.4},{x:6860,y:z.summit.f(6860),color:'red',power:-12.4},
                    {x:7440,y:z.mid.f(7440),color:'yellow',power:-10.8},
                    {x:8170,y:560,color:'yellow',power:-9.2},{x:9280,y:560,color:'yellow',power:-9.2},
                ],
                speedBoosters:[{x:520,y:f.f(520),boost:12},{x:2320,y:760,boost:12.6},{x:1600,y:z.sunDeck.f(1600),boost:12},{x:3650,y:190,boost:12.2},{x:4620,y:f.f(4620),boost:12.5},{x:6380,y:-40,boost:12.5},{x:6480,y:325,boost:12.3},{x:6100,y:f.f(6100),boost:12},{x:7420,y:f.f(7420),boost:11.6}],
                dashRings:[{x:810,y:350,angleDeg:-10,boost:11.4},{x:3190,y:480,angleDeg:-26,boost:10.2},{x:4610,y:260,angleDeg:-10,boost:12.6},{x:5730,y:90,angleDeg:-25,boost:11.8},{x:7040,y:-250,angleDeg:0,boost:10.6}],
                bouncePoles:[{x:3740,y:f.f(3740)-28,dir:1,power:-12.5},{x:4310,y:f.f(4310)-27,dir:1,power:-11.7}],
                spinners:[{x:3920,y:540,variant:'silver'},{x:4040,y:490,variant:'dark'},{x:4170,y:540,variant:'silver'},{x:6010,y:170,variant:'silver'},{x:6130,y:110,variant:'dark'}],
                platforms:[{x:5180,y:400,w:88,ampX:35,ampY:55,speed:.024},{x:7330,y:150,w:96,ampX:65,ampY:35,speed:.02}],
                timePosts:[{x:1800,y:f.f(1800),kind:'PAST'},{x:6990,y:f.f(6990),kind:'FUTURE'}],
                spikeClusters:[],bigRing:{x:6820,y:-348},goalPost:null,
                capsule:{x:9310,y:560,lockedUntilBoss:true},
            };
        },
        setupObjects(rings,terrain) {
            const z=terrain.z3;
            for(const [x,n] of [[390,6],[1770,6],[2940,5],[4430,5],[5130,4],[5870,7],[7240,7],[7720,4]]) rings.addSurfaceRings(z.mainSurf,x,30,n,25);
            for(const loop of terrain.loops) rings.addLoopRings(loop,12);
            for(const [surf,x,n] of [[z.sunDeck,850,6],[z.sunDeck,2330,6],[z.upperA,3600,6],[z.upperA,4550,6],[z.summit,5740,6],[z.summit,6400,6],[z.mid,5900,6],[z.mid,7180,5]]) rings.addSurfaceRings(surf,x,30,n,25);
            for(const s of SHAFTS) s.steps.forEach((y,i)=>rings.addRingLine(i%2===0?s.x0+100:s.x1-100,y-55,0,-24,2));
        },
        createBoss(terrain) {return root.KittBoss?root.KittBoss.create(terrain,ARENA):null;},
        onUpdate(terrain,player,h) {if(root.KittBoss)root.KittBoss.update(terrain,player,h);},
        drawBoss(ctx,boss,game) {if(root.KittBoss)root.KittBoss.draw(ctx,boss,game);},
        drawHUD(ctx,game) {if(root.KittBoss&&game.terrain.boss)root.KittBoss.drawHUD(ctx,game.terrain.boss,game);},
        drawPlatform(ctx,p,game) {
            if(p.x+p.w<game.view.x0||p.x-p.w>game.view.x1)return;
            const x=p.x-p.w/2,y=p.y,w=p.w;
            ctx.save();
            poly(ctx,[[x,y],[x+14,y-9],[x+w+14,y-9],[x+w,y]],'#c29bce');
            const g=ctx.createLinearGradient(0,y,0,y+22);g.addColorStop(0,'#a178b8');g.addColorStop(1,'#45305e');
            poly(ctx,[[x,y],[x+w,y],[x+w-5,y+21],[x+5,y+21]],g);
            poly(ctx,[[x+w,y],[x+w+14,y-9],[x+w+9,y+11],[x+w-5,y+21]],'#342648');
            line(ctx,[[x,y],[x+w,y]],'#ffdd80',3);
            ctx.fillStyle='#2f253f';ctx.fillRect(x+8,y+6,w-16,8);
            for(let px=x+12;px<x+w-12;px+=16)poly(ctx,[[px,y+6],[px+7,y+6],[px+1,y+14],[px-6,y+14]],'#ffd35d');
            for(const px of [x+5,x+w-5]){ctx.fillStyle='#e9c6eb';ctx.beginPath();ctx.arc(px,y+5,2,0,TAU);ctx.fill();}
            ctx.fillStyle='rgba(255,199,71,.25)';ctx.beginPath();ctx.ellipse(p.x,y+26,w*.26,5,0,0,TAU);ctx.fill();
            ctx.restore();
        },
        drawBackground(ctx,game) {
            const W=game.W,H=game.H,t=game.terrain.clock;
            const p=clamp(((game.player?game.player.x:game.camX)-1800)/6200,0,1),smooth=p*p*(3-2*p);
            const era=game.terrain.timeEra,mood=era==='past'?1:era==='present'?.4+smooth*.6:smooth;
            const sky=ctx.createLinearGradient(0,0,0,H);
            sky.addColorStop(0,mix('#2d6deb','#21143f',mood));sky.addColorStop(.53,mix('#80c8ff','#a44c91',mood));sky.addColorStop(1,mix('#ffe5bd','#ffc18c',mood));
            ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
            const sunX=W*.76-game.camX*.014,sunY=H*(.21+mood*.14);
            const glow=ctx.createRadialGradient(sunX,sunY,12,sunX,sunY,150);glow.addColorStop(0,'rgba(255,232,165,.65)');glow.addColorStop(1,'rgba(255,211,151,0)');ctx.fillStyle=glow;ctx.fillRect(sunX-150,sunY-150,300,300);
            ctx.fillStyle=mix('#fff1ce','#ffd187',mood);ctx.beginPath();ctx.arc(sunX,sunY,38,0,TAU);ctx.fill();
            if(mood>.4){ctx.save();ctx.globalAlpha=(mood-.4)/.6;for(let i=0;i<45;i++){const x=((i*173-game.camX*.02)%W+W)%W,y=18+(i*47)%(H*.48);ctx.fillStyle=i%5===0?'#ffe5b8':'#f4e2ff';ctx.fillRect(x,y,1.4+.7*Math.sin(t*.04+i),1.8);}ctx.restore();}
            for(let i=0;i<7;i++){
                const x=((i*243-game.camX*.055+t*.1)%(W+260)+W+260)%(W+260)-130,y=H*.14+(i%3)*48;
                ctx.fillStyle=mood>.5?'rgba(255,199,189,.45)':'rgba(255,248,233,.8)';ctx.beginPath();ctx.ellipse(x,y+12,66,15,-.08,0,TAU);ctx.ellipse(x-23,y,29,24,-.1,0,TAU);ctx.ellipse(x+16,y-3,34,28,.1,0,TAU);ctx.fill();
            }
            for(let layer=0;layer<3;layer++){
                const base=H*(.69+layer*.09)-(game.camY-170)*.05,par=[.065,.12,.19][layer];
                const colors=[mix('#ad9ac5','#684579',mood),mix('#d99daf','#975f80',mood),mix('#f1a67f','#c87c85',mood)];
                for(let i=-1;i<Math.ceil(W/240)+2;i++){
                    const x=i*240-((game.camX*par)%240),peak=48+(i*i*19+layer*37)%100;
                    poly(ctx,[[x-60,H+30],[x+12,base-peak*.3],[x+66,base-peak],[x+158,base-peak+8],[x+250,H+30]],colors[layer]);
                    poly(ctx,[[x+66,base-peak],[x+94,base-peak+5],[x+51,H+30],[x-60,H+30],[x+12,base-peak*.3]],layer===2?'#d98e84':colors[layer]);
                    line(ctx,[[x+66,base-peak],[x+158,base-peak+8]],layer===2?'#ffd2a3':'#cfa8ca',3);
                }
                if(layer===0 && !(panorama && panorama.complete && panorama.naturalWidth))fortress(ctx,W*.83-game.camX*.022,H*.82,.64+p*.2,t,mood);
            }
            if(panorama && panorama.complete && panorama.naturalWidth) {
                const width=Math.max(2172,W*2.12),height=width*724/2172;
                const px=W*.04-game.camX*.13,py=H-15-game.camY*.10-height;
                ctx.save();ctx.imageSmoothingEnabled=true;ctx.drawImage(panorama,px,py,width,height);ctx.restore();
            }
            if(mood>.35){ctx.save();ctx.globalAlpha=(mood-.35)*.16;for(let i=0;i<3;i++){const x=W*.7+i*52-game.camX*.01,lean=Math.sin(t*.008+i*1.4)*W*.3;poly(ctx,[[x,H*.69],[x+lean-44,0],[x+lean+44,0]],'#ffe8bb');}ctx.restore();}
        },
        drawBack(ctx,game) {
            const z=game.terrain.z3,v=game.view,t=game.terrain.clock;
            for(const s of SHAFTS) {
                if(s.x1<v.x0||s.x0>v.x1)continue;
                for(const x of [s.x0,s.x1]) {
                    const grad=ctx.createLinearGradient(x-24,0,x+18,0);grad.addColorStop(0,'#3d2d56');grad.addColorStop(.3,'#a17caf');grad.addColorStop(.63,'#caa4cd');grad.addColorStop(1,'#574067');ctx.fillStyle=grad;ctx.fillRect(x-15,s.top,30,s.bottom-s.top);
                    for(let y=s.top+10;y<s.bottom-18;y+=45){ctx.fillStyle='#5d466e';ctx.fillRect(x-15,y,30,7);ctx.fillStyle='#e4bfdf';ctx.fillRect(x-15,y+7,30,2);}
                    ctx.fillStyle='#ffd65e';ctx.fillRect(x-18,s.top+8,36,6);
                }
                for(let i=0;i<s.steps.length;i++) {const x=(s.x0+s.x1)/2,y=s.steps[i]-40;ctx.save();ctx.globalAlpha=.3+.25*(1+Math.sin(t*.07-i))/2;line(ctx,[[x-18,y+7],[x,y-7],[x+18,y+7]],'#fff2b5',5);ctx.restore();}
            }
            for(const surf of [z.sunDeck,z.upperA,z.summit,z.mid]) for(let x=surf.x0+115;x<surf.x1;x+=270) {
                if(x<v.x0-50||x>v.x1+50)continue;
                const top=surf.f(x)+38,bottom=z.mainSurf.f(x)+26;
                poly(ctx,[[x-13,top],[x+13,top-7],[x+13,bottom],[x-13,bottom]],'#745485');poly(ctx,[[x+13,top-7],[x+28,top-15],[x+28,bottom-8],[x+13,bottom]],'#403054');
                line(ctx,[[x-11,top+5],[x-11,bottom]],'#c898be',3);
                // Arched buttresses stitch the road volumes into a recognizable fortress.
                if(top<bottom-80){ctx.strokeStyle='#694879';ctx.lineWidth=10;ctx.beginPath();ctx.arc(x+130,top+96,110,Math.PI,TAU);ctx.stroke();}
                if(bottom-top>180&&Math.floor(x/270)%2===0){ctx.fillStyle='#342641';ctx.fillRect(x-25,top+47,48,59);crest(ctx,x,top+79,.61);}
            }
            if(v.x1>7800){
                ctx.fillStyle='#5a416b';ctx.fillRect(8000,490,1600,10);
                for(let x=8000;x<9600;x+=100){ctx.fillStyle='#78588c';ctx.fillRect(x,437,10,80);ctx.fillStyle='#d7a4c9';ctx.fillRect(x,432,12,5);}
                fortress(ctx,8860,560,.92,t,1);
            }
        },
        drawLoops(ctx,game) {
            for(const L of game.terrain.loops){
                if(L.cx+L.r+50<game.view.x0||L.cx-L.r-50>game.view.x1)continue;
                ctx.save();ctx.strokeStyle='#3d2e50';ctx.lineWidth=24;ctx.beginPath();ctx.arc(L.cx+17,L.cy-12,L.r+13,0,TAU);ctx.stroke();ctx.strokeStyle='#be93cf';ctx.lineWidth=3;ctx.stroke();
                for(let i=0;i<20;i++){const a=TAU*i/20,c=Math.cos(a),s=Math.sin(a);line(ctx,[[L.cx+c*(L.r+14),L.cy+s*(L.r+14)],[L.cx+17+c*(L.r+14),L.cy-12+s*(L.r+14)]],'#e9c38b',3);}
                const g=ctx.createLinearGradient(L.cx-L.r,L.cy-L.r,L.cx+L.r,L.cy+L.r);g.addColorStop(0,'#e2c0e1');g.addColorStop(.34,'#946ba8');g.addColorStop(.7,'#5f4175');g.addColorStop(1,'#bb90c1');ctx.strokeStyle='#34263f';ctx.lineWidth=28;ctx.beginPath();ctx.arc(L.cx,L.cy,L.r+13,0,TAU);ctx.stroke();ctx.strokeStyle=g;ctx.lineWidth=22;ctx.stroke();
                ctx.strokeStyle='#ffd966';ctx.lineWidth=5;ctx.beginPath();ctx.arc(L.cx,L.cy,L.r+1.5,0,TAU);ctx.stroke();ctx.strokeStyle='#fff2c1';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(L.cx,L.cy,L.r-.3,0,TAU);ctx.stroke();
                for(let i=0;i<12;i++){const a=TAU*i/12-game.terrain.clock*.025;ctx.save();ctx.translate(L.cx+Math.cos(a)*(L.r+13),L.cy+Math.sin(a)*(L.r+13));ctx.rotate(a+Math.PI/2);poly(ctx,[[-3,-5],[3,0],[-3,5]],'#ffeab0');ctx.restore();}ctx.restore();
            }
        },
        drawTerrain(ctx,game) {
            const z=game.terrain.z3;road(ctx,z.mainSurf,game.view,true);
            for(const f of game.terrain.floors)if(f!==z.mainSurf)road(ctx,f,game.view,false);
            for(const c of z.ceilings){
                const x0=Math.max(c.x0,game.view.x0),x1=Math.min(c.x1,game.view.x1);if(x1<=x0)continue;
                line(ctx,[[x0,c.f(x0)],[x1,c.f(x1)]],'#d6a6c8',5);
                for(let x=Math.ceil(x0/62)*62;x<x1;x+=62)poly(ctx,[[x,c.f(x)-16],[x+23,c.f(x)-16],[x+12,c.f(x)-7]],'#dfbd70');
            }
        },
        drawFront(ctx,game) {
            const v=game.view,z=game.terrain.z3;
            ctx.save();
            // Grounded hazard plates mark the spring rhythm without obscuring their animated coils.
            for(const sp of game.terrain.springs){
                if(sp.x+30<v.x0||sp.x-30>v.x1)continue;
                const x=sp.x,y=sp.y;
                poly(ctx,[[x-25,y+3],[x+25,y+3],[x+31,y+11],[x-19,y+11]],'#40304d');
                for(let px=x-22;px<x+21;px+=12)poly(ctx,[[px,y+3],[px+6,y+3],[px+12,y+11],[px+6,y+11]],'#f9cc58');
                line(ctx,[[x-25,y+3],[x+25,y+3]],'#ffe4a6',1);
            }
            for(const L of game.terrain.loops){
                const y=L.cy+L.r;
                for(const dir of [-1,1]){
                    const x=L.cx+dir*(L.r+52);
                    if(x<v.x0-24||x>v.x1+24)continue;
                    poly(ctx,[[x-21,y+9],[x+21,y+9],[x+21,y+18],[x-21,y+18]],'#46314e');
                    for(let i=0;i<3;i++)poly(ctx,[[x-18+i*13,y+9],[x-11+i*13,y+9],[x-6+i*13,y+18],[x-13+i*13,y+18]],'#efbf4d');
                }
            }
            for(const [x,label] of [[3060,'WALL KICK'],[5270,'SUMMIT ASCENT'],[7730,'KITT BAZOOKA']])if(x>v.x0-80&&x<v.x1+80)sign(ctx,x,z.mainSurf.f(x),label);
            for(const s of SHAFTS)if(s.x1>v.x0&&s.x0<v.x1)sign(ctx,(s.x0+s.x1)/2,s.floor,'JUMP + STEER');
            if(v.x1>7960)for(const x of [8000,9400]){
                ctx.fillStyle='#4d354f';ctx.fillRect(x-11,390,22,170);ctx.fillStyle='#dfbc70';ctx.fillRect(x-15,384,30,10);ctx.fillStyle=Math.sin(game.terrain.clock*.15)>0?'#ffb946':'#ac505c';ctx.beginPath();ctx.arc(x,379,7,0,TAU);ctx.fill();
                for(let y=410;y<550;y+=22)poly(ctx,[[x-11,y],[x+11,y+12],[x+11,y+20],[x-11,y+8]],'#e9c360');
            }
            ctx.restore();
        },
        drawForeground(ctx,game) {
            if(game.camX<5400)return;const t=game.terrain.clock,v=game.view,span=v.x1-v.x0;
            ctx.save();for(let i=0;i<9;i++){const x=v.x0+((i*167+t*.42)%span),y=v.y0+55+((i*83-t*.3)%420+420)%420;ctx.globalAlpha=.18+.15*Math.sin(t*.05+i);ctx.fillStyle='#ffdc9b';ctx.beginPath();ctx.arc(x,y,1.5,0,TAU);ctx.fill();}ctx.restore();
        },
    });
})(typeof window !== 'undefined' ? window : globalThis);
