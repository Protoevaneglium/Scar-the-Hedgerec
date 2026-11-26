/** Normal-act template: Neon Labyrinth. Original geometry, inspired by the
 * owner's Hydrocity A1 / Carnival Night A2 underwater maps. Collision Chaos
 * Present and Quartz Quadrant Good Future inform the materials, not the layout. */
(function (root) {
    'use strict';
    const E = root.SonicEngine || (typeof require === 'function' ? require('../sonic-engine.js') : null);
    if (!E) return;
    const rise = (p,w,dy) => p.ease(w/2,0,2*dy/w).ease(w/2,2*dy/w,0);
    const art = (name,...args) => root.NeonLabyrinthArt?.[name]?.(...args);
    E.Terrain.registerLevel('z3_act2', {
        title: 'Neon Labyrinth Act 2', zone: 3, zoneName: 'NEON LABYRINTH', act: 2,
        isBossAct: false, nextStage: null, bgm: 'assets/neon_labyrinth.wav',
        startX: 0, endX: 19200, deathY: 1540, probeY: -650,
        cameraMinY: -400, cameraMaxY: 1050, wallJump: true,
        spritePresentation: 'volume', changingSkies: true,
        companion: 'rosie',
        animalZone: 'lz', animalTypes: ['flicky','pocky'],
        theme: { skyTop:'#11134e', skyMid:'#4b2599', skyBottom:'#f18adc',
            groundA:'#e74eb9', groundB:'#53216e', loopA:'#ffd642', loopB:'#a04b70',
            trimColor:'#29e8e5', trimHighlight:'#ddffff' },
        buildTerrain(b,t) {
            // Four broad bowls, connected by dry promenades. Every missed
            // platform lands on a continuous, gently curved recovery course.
            const p=b.path(0,520).flat(900);
            rise(p,800,400).flat(1800); rise(p,800,-400).flat(1800);
            rise(p,700,540).flat(1900); rise(p,800,-540).flat(1200);
            rise(p,800,440).flat(1700); rise(p,900,-440).flat(700);
            rise(p,700,480).flat(1500); rise(p,900,-480).flat(1300);
            const main=b.addFloor(p,{name:'continuous labyrinth catch course'});
            const roads=[];
            for(const [x,y,w,dy,name] of [
                [1850,420,1900,-120,'Prism canopy'],[6900,380,1700,-100,'Crystal crown'],
                [11550,430,1500,-140,'Rainbow arcade'],[15750,370,1100,-80,'Aurora balcony']]) {
                const a=b.path(x,y).flat(260);rise(a,450,dy).flat(w-710);
                rise(a,520,-dy-30).flat(220);
                const s=b.addShelf(a,{name,tier:'high'});s.thickness=90;roads.push(s);
            }
            const galleries=[];
            for(const [x,y,w,name] of [[2000,760,750,'Flooded colonnade'],[7200,820,830,'Deep crystal gallery'],
                [11750,780,650,'Submerged arcade'],[15800,800,600,'Last reservoir gallery']]) {
                const a=b.path(x,y).flat(120).bump(w-240,16,1).flat(120);
                const s=b.addShelf(a,{name,tier:'mid'});s.thickness=64;galleries.push(s);
            }
            // Roofs create real enclosed passages with open ascent wells at both
            // ends. The crown routes and lower route always reconnect.
            const roofs=[];
            for(const [x,y,w] of [[2410,650,580],[7560,710,600],[12100,660,490]]) {
                const roof=b.addShelf(b.path(x,y).flat(w),{name:'gold panel tunnel roof',tier:'mid'});
                roof.thickness=54;roofs.push(roof);
                b.addCeiling(b.path(x,y+54).flat(w),{name:'labyrinth tunnel underside'});
            }
            b.addLoop(5050,400,120,'Dry prism loop');
            b.addLoop(10100,410,110,'Quartz promenade loop');
            b.addLoop(18400,410,110,'Aurora victory loop');
            const treasury=b.addShelf(b.path(12940,80).flat(320),{name:'spectrum treasury',tier:'high'});
            treasury.thickness=80;
            const bridgeIn=b.addShelf(b.path(14170,340).flat(180),{name:'arcade bridge approach'});
            const bridgeOut=b.addShelf(b.path(14526,340).flat(170),{name:'arcade bridge exit'});
            bridgeIn.thickness=bridgeOut.thickness=60;
            t.z3a2={main,roads,galleries,roofs,treasury,
                pools:[{x0:900,x1:4300,y:620,physics:true,current:.012},
                    {x0:6100,x1:9500,y:590,physics:true,current:-.009},
                    {x0:10700,x1:14100,y:650,physics:true,current:.015},
                    {x0:14800,x1:17900,y:580,physics:true,current:.01}]};
            t.sections=[{name:'Neon Threshold',x:0},{name:'Prism Reservoir',x:1700},
                {name:'Dry Quartz Promenade',x:4300},{name:'Deep Crystal Wells',x:6800},
                {name:'Rainbow Arcade',x:11100},{name:'Aurora Reservoir',x:15300},{name:'Spectrum Exit',x:17900}];
        },
        checkpoints:[{name:'1. Neon Threshold',x:120,y:520},{name:'2. Prism Shore',x:4440,y:520},
            {name:'3. Crystal Wells',x:6050,y:520},{name:'4. Quartz Promenade',x:9600,y:520},
            {name:'5. Rainbow Shore',x:10620,y:520},{name:'6. Aurora Shore',x:14680,y:520},
            {name:'7. Spectrum Exit',x:17960,y:520}],
        objects(t) {
            const z=t.z3a2,m=z.main;
            return {
                waterZones:z.pools,
                airVents:[2100,3150,7100,8400,11800,13050,15850,16900].map(x=>({x,y:m.f(x)-35})),
                monitors:[{x:330,y:520,item:'shield'},{x:1960,y:420,item:'shoes'},
                    {x:4550,y:520,item:'rings'},{x:7030,y:380,item:'shield'},
                    {x:9770,y:520,item:'invinc'},{x:11980,y:z.galleries[2].f(11980),item:'rings'},
                    {x:13000,y:80,item:'1up'},{x:18080,y:520,item:'shoes'}],
                starPosts:[4380,5990,9530,10570,14630,17930].map(x=>({x,y:m.f(x)})),
                // Lifts are an unhurried alternative to swim strokes / crown springs.
                platforms:[{x:1880,y:655,w:112,ampY:240,speed:.015,phase:Math.PI/2},
                    {x:6920,y:710,w:112,ampY:330,speed:.012,phase:Math.PI/2},
                    {x:11580,y:695,w:112,ampY:270,speed:.015,phase:Math.PI/2},
                    {x:15780,y:680,w:112,ampY:310,speed:.014,phase:Math.PI/2}],
                springs:[{x:1930,y:920,color:'red',power:-15.5},{x:6980,y:1060,color:'red',power:-17},
                    {x:11620,y:960,color:'red',power:-16},{x:12980,y:z.roads[2].f(12980),color:'red'},
                    {x:15850,y:1000,color:'red',power:-17},{x:14220,y:520,color:'yellow'}],
                speedBoosters:[650,4490,4800,5460,9690,9900,10380,14300,18050,18260,18700]
                    .map(x=>({x,y:m.f(x),boost:12.5})),
                dashRings:[{x:3810,y:450,angleDeg:8,boost:12.5},{x:13640,y:460,angleDeg:5,boost:12.5}],
                bouncePoles:[{x:5630,y:496,power:-10.8}],
                spinners:[{x:8900,y:740},{x:17320,y:710}],
                swingPlatforms:[{pivotX:5750,pivotY:270,len:150,maxAngle:.5,speed:.024}],
                breakableWalls:[{x:5740,y:520}],rocks:[{x:10470,y:520}],
                breakableFloors:[{x:14350,y:340,w:128,h:40}],
                trapDoors:[{x:14478,y:340,w:48,period:240,openDuration:70}],
                houdiniGroups:[{triggerX:12600,triggerY:920,steps:[{x:12650,y:880},{x:12690,y:846},{x:12730,y:812}]}],
                spikeClusters:[{x:2990,y:920},{x:8120,y:1060},{x:13300,y:m.f(13300)},{x:16800,y:1000}],
                enemies:[{kind:'crab',type:'burrobot',x:2520,y:920,minX:2450,maxX:2600,vx:.65},
                    {kind:'crab',type:'crab',x:4700,y:520,minX:4660,maxX:4740,vx:1},
                    {kind:'crab',type:'burrobot',x:7770,y:1060,minX:7700,maxX:7840,vx:.65},
                    {kind:'crab',type:'caterkiller',x:10400,y:520,minX:10350,maxX:10450,vx:.8},
                    {kind:'crab',type:'burrobot',x:12550,y:960,minX:12500,maxX:12600,vx:.65},
                    {kind:'crab',type:'crab',x:16280,y:1000,minX:16220,maxX:16340,vx:.7},
                    {kind:'buzz',type:'chopper',x:3300,y:850,phase:1},
                    {kind:'buzz',type:'chopper',x:8750,y:990,phase:2},
                    {kind:'buzz',type:'batbrain',x:12250,y:540,phase:1.3},
                    {kind:'buzz',type:'buzz',x:16050,y:220,phase:.8}],
                timePosts:[{x:4600,y:520,kind:'PAST'},{x:18160,y:520,kind:'FUTURE'}],
                bigRing:{x:13170,y:36},goalPost:{x:18860,y:520},capsule:null,
            };
        },
        setupObjects(r,t) {
            const z=t.z3a2;
            for(let x=440;x<18800;x+=360)r.addSurfaceRings(z.main,x,28,6,26);
            for(const s of [...z.roads,...z.galleries])for(let x=s.x0+80;x<s.x1-180;x+=300)r.addSurfaceRings(s,x,27,6,26);
            for(const l of t.loops)r.addLoopRings(l,14);
            // Vertical ring ladders teach repeated jump strokes toward open air.
            for(const [x,y] of [[3500,870],[8700,1010],[13250,910],[17000,950]])r.addRingLine(x,y,0,-40,7);
            r.addRingLine(13020,48,26,0,6);
        },
        onUpdate(t,p,h) {
            if(!p.inWater || p.hurtPose || p.state===E.STATE.DYING || t.goalPost.spinning || t.goalPost.cleared)return;
            const flow=p.waterZone?.current||0;
            if(p.grounded)p.gsp=Math.max(-16,Math.min(16,p.gsp+flow*h));
            else p.xsp=Math.max(-16,Math.min(16,p.xsp+flow*h));
        },
        drawBackground:(c,g)=>art('drawBackground',c,g),drawBack:(c,g)=>art('drawBack',c,g),
        drawTerrain:(c,g)=>art('drawTerrain',c,g),drawLoops:(c,g)=>art('drawLoops',c,g),
        drawPlatform:(c,p,g)=>art('drawPlatform',c,p,g),drawFront:(c,g)=>art('drawFront',c,g),
        drawHUD:(c,g)=>art('drawHUD',c,g),
    });
})(typeof window!=='undefined'?window:globalThis);
