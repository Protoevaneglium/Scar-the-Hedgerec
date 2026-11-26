/** Real HTTP / Chromium keyboard and multitouch integration, plus visual QA. */
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright'),{startServer}=require('../server');
const output=path.resolve('output/qa/neon-labyrinth');fs.mkdirSync(output,{recursive:true});
const report={passed:false,checks:[],errors:[],screenshots:[]};
async function main(){
    const server=startServer({port:0,host:'127.0.0.1',nativeOnly:true,open:false,log:()=>{}});
    await new Promise(r=>server.once('listening',r));
    const browser=await chromium.launch({headless:true,...(process.env.SCAR_BROWSER_PATH?{executablePath:process.env.SCAR_BROWSER_PATH}:{})});
    try{
        const context=await browser.newContext({viewport:{width:1100,height:720},hasTouch:true});
        const page=await context.newPage();page.setDefaultTimeout(20000);
        page.on('pageerror',e=>report.errors.push(String(e)));
        await page.goto(`http://127.0.0.1:${server.address().port}/?nointro&stage=z3_act1`);
        await page.waitForFunction(()=>window.sonicGame?.scarSheetLoaded);
        await page.evaluate(()=>{
            const g=sonicGame;g.titleCard=null;g.fadeAlpha=0;g.stageTime=75;
            g.player.lives=6;g.player.shield=true;g.player.score=20000;g.player.rings=25;
            const s=g.terrain.goalPost;g.player.place(s.x-5,0,s.y);g.player.gsp=6;
        });
        await page.waitForFunction(()=>sonicGame.terrain.goalPost.spinning);
        await page.evaluate(()=>{const g=sonicGame;g.terrain.goalPost.spinTimer=1;});
        await page.waitForFunction(()=>!!sonicGame.actClear);
        await page.evaluate(()=>{sonicGame.updateActClear(1,true);sonicGame.updateActClear(1,true);});
        await page.waitForFunction(()=>sonicGame.stageName==='z3_act2');
        assert(await page.evaluate(()=>sonicGame.player.lives===6&&sonicGame.player.shield&&sonicGame.player.score>20000&&sonicGame.player.rings===0));
        report.checks.push('Act 1 real sign/tally/fade enters Act 2 with score, lives and shield');
        await page.evaluate(()=>{sonicGame.gotoCheckpoint(0);});
        const partyStart=await page.evaluate(()=>({x:sonicGame.player.x,npc:sonicGame.player.companion.x}));
        await page.keyboard.down('ArrowRight');
        await page.waitForFunction(start=>sonicGame.player.x>start.x+90&&sonicGame.player.companion.x>start.npc+30,partyStart);
        await page.keyboard.up('ArrowRight');
        await page.keyboard.down('KeyE');await page.waitForFunction(()=>sonicGame.player.character==='rosie'&&sonicGame.player.companion.character==='scar');
        await page.waitForTimeout(120);assert(await page.evaluate(()=>sonicGame.player.character==='rosie'),'held E swaps once');
        await page.keyboard.up('KeyE');
        await page.keyboard.press('KeyE');await page.waitForFunction(()=>sonicGame.player.character==='scar');
        await page.locator('#btn-swap').click();await page.waitForFunction(()=>sonicGame.player.character==='rosie');
        await page.evaluate(()=>{sonicGame.gotoCheckpoint(0);sonicGame.render();});
        await page.locator('#game').screenshot({path:path.join(output,'rosie-playable-scar-follows.png')});
        report.screenshots.push('rosie-playable-scar-follows.png');
        report.checks.push('Rosie follows; E swaps both roles once per press; on-screen swap and Rosie HUD work');
        for(let cp=0;cp<7;cp++)for(const era of ['good_future','present','past']){
            await page.evaluate(({cp,era})=>{const g=sonicGame;g.gotoCheckpoint(cp);g.terrain.timeEra=era;g.render();},{cp,era});
            if(era==='good_future'){
                const name=`checkpoint-${cp+1}.png`;await page.locator('#game').screenshot({path:path.join(output,name)});report.screenshots.push(name);
            }
        }
        // Grounded underwater launch plus multiple independent keyboard strokes.
        await page.evaluate(()=>{
            const g=sonicGame;g.gotoCheckpoint(0);g.terrain.enemies=[];g.terrain.spikeClusters=[];g.terrain.airVents=[];
            g.player.place(3200,0,920);g.player.invulnTimer=10000;g.snapCamera();
            window.swimEdges=0;const stroke=g.player.events.swimStroke;
            g.player.events.swimStroke=(...args)=>{window.swimEdges++;stroke(...args);};
        });
        await page.keyboard.down('Space');await page.waitForTimeout(1100);await page.keyboard.up('Space');
        assert(await page.evaluate(()=>sonicGame.player.inWater&&swimEdges===0),'held jump does not repeat strokes');
        for(let i=0;i<5;i++){await page.keyboard.down('Space');await page.waitForTimeout(65);await page.keyboard.up('Space');await page.waitForTimeout(95);}
        assert(await page.evaluate(()=>swimEdges===5),'fresh keyboard edges each produce a stroke');
        report.checks.push('keyboard Jump hold vs five repeat underwater strokes');
        await page.evaluate(()=>{const g=sonicGame;g.player.place(3200,0,920);g.player.airRemaining=5*60;g.snapCamera();g.render();});
        await page.locator('#game').screenshot({path:path.join(output,'deep-water-countdown.png')});
        report.screenshots.push('deep-water-countdown.png');
        await page.keyboard.press('KeyP');await page.waitForFunction(()=>sonicGame.paused);
        const air=await page.evaluate(()=>sonicGame.player.airRemaining);await page.waitForTimeout(200);
        assert.strictEqual(await page.evaluate(()=>sonicGame.player.airRemaining),air);await page.keyboard.press('KeyP');await page.waitForFunction(()=>!sonicGame.paused);
        report.checks.push('pause freezes breath in real animation scheduler');
        await page.evaluate(()=>{const g=sonicGame;g.player.place(3200,0,920);g.player.y=603;g.player.state=SonicEngine.STATE.AIRBORNE;g.player.ysp=1;g.player.inWater=false;g.snapCamera();});
        await page.keyboard.down('KeyS');await page.keyboard.down('ArrowRight');
        await page.waitForFunction(()=>sonicGame.player.surfaceSwimming);
        await page.waitForTimeout(250);assert(await page.evaluate(()=>!sonicGame.player.inWater&&sonicGame.player.airRemaining===SonicEngine.AIR_FRAMES));
        await page.locator('#game').screenshot({path:path.join(output,'surface-back-swim.png')});report.screenshots.push('surface-back-swim.png');
        await page.keyboard.down('Space');await page.waitForFunction(()=>!sonicGame.player.surfaceSwimming&&sonicGame.player.ysp<-3);
        await page.keyboard.up('Space');await page.keyboard.up('KeyS');await page.keyboard.up('ArrowRight');
        report.checks.push('S + Right floats on back; Jump leaves surface with S still held');
        // Browser-native touch events go through elementFromPoint and shared
        // touch ownership, including holding Down and Right simultaneously.
        const client=await context.newCDPSession(page);
        const touch=async(keys)=>{
            const points=await page.evaluate(keys=>keys.map((key,id)=>{const r=document.querySelector(`.tbtn[data-key="${key}"]`).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id};}),keys);
            await client.send('Input.dispatchTouchEvent',{type:keys.length?'touchStart':'touchEnd',touchPoints:points});
        };
        await page.evaluate(()=>{const g=sonicGame;g.player.place(3200,0,920);g.player.y=605;g.player.state=SonicEngine.STATE.AIRBORNE;g.player.ysp=1;g.player.inWater=false;g.snapCamera();});
        await touch(['down','right']);await page.waitForFunction(()=>sonicGame.player.surfaceSwimming&&sonicGame.input.down&&sonicGame.input.right);
        await touch([]);await page.waitForFunction(()=>!sonicGame.input.down&&!sonicGame.input.right);
        await page.evaluate(()=>{const g=sonicGame;g.player.place(3200,0,920);g.player.y-=60;g.player.state=SonicEngine.STATE.AIRBORNE;g.player.ysp=0;});
        const before=await page.evaluate(()=>swimEdges);
        for(let i=0;i<3;i++){await touch(['jump']);await page.waitForTimeout(70);await touch([]);await page.waitForTimeout(90);}
        assert.strictEqual(await page.evaluate(()=>swimEdges),before+3);
        report.checks.push('native browser multitouch: Down + Right surface swim and three Jump strokes');
        for(const [i,x] of [2700,7800,12300,16450].entries()){
            await page.evaluate(x=>{const g=sonicGame;g.player.place(x,0,g.terrain.mainFloor.f(x));g.player.airRemaining=SonicEngine.AIR_FRAMES;g.snapCamera();g.render();},x);
            const name=`reservoir-${i+1}.png`;await page.locator('#game').screenshot({path:path.join(output,name)});report.screenshots.push(name);
        }
        report.checks.push('all seven checkpoints / three eras and four deep chambers render');
        assert.strictEqual(report.errors.length,0,JSON.stringify(report.errors));report.passed=true;
        await context.close();
    }finally{
        await browser.close();await new Promise(r=>server.close(r));
        fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
    }
}
main().then(()=>console.log(JSON.stringify(report,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
