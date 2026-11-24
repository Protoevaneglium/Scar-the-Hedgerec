/** Real browser/HTTP integration; injected standard pads exercise the shipped polling loop. */
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const playwright=require('playwright');
const {startServer}=require('../server');
const browserName=process.argv[2]||'chromium';
if(!['chromium','webkit','firefox'].includes(browserName))throw Error('Expected chromium, webkit or firefox');
const report={platform:process.platform,browser:browserName,passed:false,checks:[],errors:[],limitations:['Standard controller states are injected into a real browser; physical USB/Bluetooth hardware and drivers are not certified.']};
async function run(){
    const browser=await playwright[browserName].launch({headless:true,...(process.env.SCAR_BROWSER_PATH?{executablePath:process.env.SCAR_BROWSER_PATH}:{})});
    const output=path.resolve('output/qa');fs.mkdirSync(output,{recursive:true});
    try {
        for(const nativeOnly of [true,false]){
            const server=startServer({port:0,host:'127.0.0.1',nativeOnly,open:false,log:()=>{}});
            await new Promise(resolve=>server.once('listening',resolve));
            const context=await browser.newContext({viewport:{width:960,height:640}});
            try{
                await context.addInitScript(()=>{
                    window.qaPad={index:0,id:'Xbox test controller',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
                    window.qaConnected=true;
                    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.qaConnected?[window.qaPad]:[]});
                    window.qaButton=(i,down)=>{window.qaPad.buttons[i]={pressed:down,value:down?1:0};};
                });
                const page=await context.newPage();page.setDefaultTimeout(25000);
                page.on('pageerror',e=>report.errors.push(String(e)));
                await page.goto('http://127.0.0.1:'+server.address().port+'/');
                assert(await page.evaluate(()=>isSecureContext),'localhost must permit secure browser APIs');
                await page.waitForFunction(()=>!document.getElementById('intro-controller-hint').hidden);
                await page.evaluate(()=>qaButton(9,true));
                await page.waitForFunction(()=>window.sonicGame&&!window.INTRO_ACTIVE);
                await page.waitForTimeout(100);
                assert(await page.evaluate(()=>!sonicGame.paused&&!sonicGame.input.jumpHeld),'held title Menu cannot pause/jump');
                const neutral=async()=>{await page.evaluate(()=>new Promise(resolve=>{qaPad.axes.fill(0);qaPad.buttons.forEach((_,i)=>qaButton(i,false));requestAnimationFrame(()=>requestAnimationFrame(resolve));}));await page.waitForFunction(()=>sonicGame.input.gamepadActive);};
                await neutral();
                for(const stage of await page.evaluate(()=>sonicGame.getCampaignStages())){
                    await page.evaluate(s=>{sonicGame.loadStage(s,{skipTitleCard:true,skipFade:true});sonicGame.player.invincTimer=10000;},stage);await neutral();
                    const x=await page.evaluate(()=>sonicGame.player.x);
                    await page.evaluate(()=>qaPad.axes[0]=1);
                    await page.waitForFunction(start=>sonicGame.player.x>start+10,x);
                    await neutral();
                    await page.evaluate(()=>sonicGame.gotoCheckpoint(0));await neutral();
                    await page.evaluate(()=>qaButton(0,true));await page.waitForFunction(()=>!sonicGame.player.grounded&&sonicGame.player.ysp<0);
                    await neutral();
                }
                report.checks.push(`${nativeOnly?'native HTTP':'Express HTTP'}: title Menu, held-button handoff, stick movement and A jump in all seven acts`);
                await page.evaluate(()=>sonicGame.loadStage('palmtree',{skipTitleCard:true,skipFade:true}));await neutral();
                await page.evaluate(()=>qaButton(9,true));await page.waitForFunction(()=>sonicGame.paused);await neutral();
                const pausedX=await page.evaluate(()=>sonicGame.player.x);await page.waitForTimeout(150);assert.strictEqual(await page.evaluate(()=>sonicGame.player.x),pausedX);
                await page.evaluate(()=>qaButton(0,true));await page.waitForFunction(()=>!sonicGame.paused);assert(await page.evaluate(()=>!sonicGame.input.jumpHeld));await neutral();
                await page.keyboard.down('ArrowLeft');await page.evaluate(()=>{qaPad.axes[0]=1;qaConnected=false;});
                await page.waitForFunction(()=>!sonicGame.input.gamepadConnected);assert(await page.evaluate(()=>sonicGame.input.left&&!sonicGame.input.right));await page.keyboard.up('ArrowLeft');
                await page.evaluate(()=>qaConnected=true);await page.waitForTimeout(100);assert(await page.evaluate(()=>!sonicGame.input.gamepadActive&&!sonicGame.input.right));await neutral();
                await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));qaButton(0,true);window.dispatchEvent(new Event('focus'));});await page.waitForTimeout(100);
                assert(await page.evaluate(()=>!sonicGame.input.gamepadActive&&!sonicGame.input.jumpHeld));await neutral();
                await page.evaluate(()=>{let g=sonicGame;g.loadStage('z2_act2',{skipTitleCard:true,skipFade:true});let n=g.terrain.z2a2.reunion;Object.assign(n,{met:true,noticed:true,actorX:n.x,actorY:n.y,actionTimer:0,reactionTimer:0});g.player.place(n.x+60,0,n.y);g.player.facing=1;g.player.invulnTimer=0;});await neutral();
                await page.waitForFunction(()=>sonicGame.canTalkToRosie());await page.evaluate(()=>qaButton(2,true));await page.waitForFunction(()=>sonicGame.rosieConversationView().open);await neutral();
                await page.evaluate(()=>qaButton(13,true));await page.waitForFunction(()=>sonicGame.dialogueSelection===1);await neutral();
                const revision=await page.evaluate(()=>sonicGame.rosieConversationView().revision);await page.evaluate(()=>qaButton(0,true));await page.waitForFunction(r=>sonicGame.rosieConversationView().revision!==r,revision);await neutral();
                await page.evaluate(()=>qaButton(1,true));await page.waitForFunction(()=>!sonicGame.rosieConversationView().open);await neutral();
                report.checks.push(`${nativeOnly?'native HTTP':'Express HTTP'}: Menu pause, A resume, disconnect, mixed keyboard input, held reconnect, focus recovery, X/dialogue/D-pad/A/B`);
                await page.screenshot({path:path.join(output,`controller-${process.platform}-${browserName}-${nativeOnly?'native':'express'}.png`)});
                assert.strictEqual(report.errors.length,0,JSON.stringify(report.errors));
            }finally{await context.close();await new Promise(resolve=>server.close(resolve));}
        }
        report.passed=true;
    }finally{await browser.close();fs.writeFileSync(path.join(output,`controller-${process.platform}-${browserName}.json`),JSON.stringify(report,null,2)+'\n');}
}
run().then(()=>console.log(report)).catch(error=>{console.error(error);process.exitCode=1;});
