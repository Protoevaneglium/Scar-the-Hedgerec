package com.protoevaneglium.scarthehedgerec;

import android.app.Instrumentation;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleCallback;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.function.Consumer;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Exercises the signed release APK's real WebView, native touch, media and lifecycle. */
@RunWith(AndroidJUnit4.class)
public final class ReleaseSmokeTest {
    private ActivityScenario<MainActivity> scenario;
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final AtomicReference<MainActivity> current = new AtomicReference<>();
    private final AtomicReference<Stage> nativeStage = new AtomicReference<>();
    private boolean mainResponsive = true;
    private final ActivityLifecycleCallback lifecycle = (activity, stage) -> {
        if (!(activity instanceof MainActivity)) return;
        if (stage == Stage.RESUMED) current.set((MainActivity)activity);
        if (current.get() == activity) nativeStage.set(stage);
    };
    private void onMain(Consumer<MainActivity> action) {
        // ActivityScenario.onActivity waits for global UI idle. A continuously
        // rendered game need not become idle; post directly to the main looper.
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<Throwable> error = new AtomicReference<>();
        new Handler(Looper.getMainLooper()).post(() -> {
            try { assertNotNull(current.get()); action.accept(current.get()); }
            catch (Throwable failure) { error.set(failure); }
            finally { done.countDown(); }
        });
        try { mainResponsive = done.await(20, TimeUnit.SECONDS); }
        catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError(failure); }
        assertTrue("Android main looper must respond within 20 seconds", mainResponsive);
        if (error.get() != null) throw new AssertionError("Android main-looper action failed", error.get());
    }
    private void untilStage(Stage wanted) {
        long deadline=SystemClock.uptimeMillis()+20000;
        while (nativeStage.get()!=wanted && SystemClock.uptimeMillis()<deadline) SystemClock.sleep(50);
        assertEquals("Native activity lifecycle", wanted, nativeStage.get());
    }
    private void backgroundAndResume() throws Exception {
        onMain(activity -> assertTrue(activity.moveTaskToBack(true)));
        untilStage(Stage.STOPPED);
        try (InputStream command = new ParcelFileDescriptor.AutoCloseInputStream(instrumentation.getUiAutomation().executeShellCommand(
                "am start -n "+instrumentation.getTargetContext().getPackageName()+"/.MainActivity -f 0x10020000"))) {
            byte[] buffer=new byte[256]; while(command.read(buffer)!=-1) {}
        }
        untilStage(Stage.RESUMED);
    }
    private String js(String expression) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        onMain(activity -> {
            WebView view = activity.getGameView();
            if (view == null) { value.set("null"); latch.countDown(); }
            else view.evaluateJavascript(expression, answer -> { value.set(answer); latch.countDown(); });
        });
        assertTrue("WebView callback must not freeze: " + expression, latch.await(20, TimeUnit.SECONDS));
        return value.get();
    }
    private void until(String expression) throws Exception {
        until(expression, 45000);
    }
    private void until(String expression, long timeout) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeout;
        String result;
        do { result = js("Boolean(" + expression + ")"); if ("true".equals(result)) return; SystemClock.sleep(150); }
        while (SystemClock.uptimeMillis() < deadline);
        fail("Timed out: " + expression + " result=" + result);
    }
    private JSONObject object(String expression) throws Exception {
        String answer = js("JSON.stringify(" + expression + ")");
        Object json = new JSONTokener(answer).nextValue();
        assertTrue("Expected serialized object for "+expression+", received "+answer, json instanceof String);
        return new JSONObject((String)json);
    }
    private float[] button(String selector) throws Exception {
        JSONObject point = object("(()=>{const v=document.querySelector(" + JSONObject.quote(selector) + ").getBoundingClientRect();return{x:v.left+v.width/2,y:v.top+v.height/2,w:innerWidth,h:innerHeight};})()");
        int[] origin = new int[2], dimensions = new int[2];
        onMain(activity -> { WebView view = activity.getGameView(); view.getLocationOnScreen(origin); dimensions[0]=view.getWidth(); dimensions[1]=view.getHeight(); });
        float[] target = { (float)(point.getDouble("x") * dimensions[0] / point.getDouble("w")) + origin[0],
            (float)(point.getDouble("y") * dimensions[1] / point.getDouble("h")) + origin[1] };
        Log.i("ScarQA", "Touch " + selector + " at " + target[0] + "," + target[1] + " view=" + dimensions[0] + "x" + dimensions[1]);
        return target;
    }
    private void tap(float[] point) {
        long down = SystemClock.uptimeMillis();
        MotionEvent event = MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, point[0], point[1], 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN); sendTouch(event); event.recycle();
        event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, point[0], point[1], 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN); sendTouch(event); event.recycle();
    }
    private void sendTouch(MotionEvent event) {
        // Deliver native MotionEvents through the release WebView. UiAutomation's
        // global display synchronization can hang on continuously drawn emulator
        // surfaces; game predicates below acknowledge actual Chromium input.
        onMain(activity -> {
            WebView view=activity.getGameView(); int[] origin=new int[2]; view.getLocationOnScreen(origin);
            event.offsetLocation(-origin[0], -origin[1]);
            assertTrue("WebView accepts native touch", view.dispatchTouchEvent(event));
        });
    }
    private void pairEvent(long down, int action, float[] first, float[] second, int count) {
        MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[count];
        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[count];
        for (int i=0;i<count;i++) {
            properties[i] = new MotionEvent.PointerProperties(); properties[i].id = i; properties[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
            coords[i] = new MotionEvent.PointerCoords(); coords[i].x = i == 0 ? first[0] : second[0]; coords[i].y = i == 0 ? first[1] : second[1]; coords[i].pressure = 1; coords[i].size = 1;
        }
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, count, properties, coords, 0, 0, 1, 1, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
        sendTouch(event); event.recycle();
    }
    private void startGame() throws Exception {
        until("window.ScarHost && document.getElementById('intro-video')");
        js("document.getElementById('intro-video').dispatchEvent(new Event('error'));true");
        until("getComputedStyle(document.getElementById('intro-credit')).display!=='none'");
        assertEquals("\"by Gavin and Travis Stange\"", js("document.getElementById('intro-credit').textContent"));
        until("document.querySelector('.intro-title-fallback').naturalWidth>0");
        js("window.__painted=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__painted=true));true"); until("window.__painted");
        SystemClock.sleep(500);
        capture("v"+BuildConfig.VERSION_NAME+"-android-title.png");
        long startup = SystemClock.uptimeMillis();
        tap(button("#intro"));
        until("window.sonicGame && !window.INTRO_ACTIVE");
        assertTrue("Starting gameplay must not stall the WebView", SystemClock.uptimeMillis()-startup<15000);
        js("window.__qaErrors=[];window.addEventListener('error',e=>window.__qaErrors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));window.sonicGame.titleCard=null;window.sonicGame.fadeAlpha=0;true");
    }
    private void capture(String name) throws Exception {
        CountDownLatch drawn = new CountDownLatch(1);
        onMain(activity -> {
            WebView view=activity.getGameView();
            view.postVisualStateCallback(SystemClock.uptimeMillis(), new WebView.VisualStateCallback() {
                @Override public void onComplete(long requestId) {
                    view.getViewTreeObserver().addOnDrawListener(new android.view.ViewTreeObserver.OnDrawListener() {
                        @Override public void onDraw() { view.post(() -> { view.getViewTreeObserver().removeOnDrawListener(this); drawn.countDown(); }); }
                    });
                    view.invalidate();
                }
            });
        });
        assertTrue("WebView must commit the requested visual state", drawn.await(20, TimeUnit.SECONDS));
        Bitmap shot = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull("Android screenshot", shot);
        if (name.contains("title")) {
            JSONObject rect=object("(()=>{let r=document.getElementById('intro-credit').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};})()");
            int[] viewBox=new int[4];
            onMain(activity -> { WebView view=activity.getGameView(); int[] origin=new int[2]; view.getLocationOnScreen(origin); viewBox[0]=origin[0];viewBox[1]=origin[1];viewBox[2]=view.getWidth();viewBox[3]=view.getHeight(); });
            int x0=Math.max(0,viewBox[0]+(int)(rect.getDouble("x")*viewBox[2]/rect.getDouble("vw")));
            int y0=Math.max(0,viewBox[1]+(int)(rect.getDouble("y")*viewBox[3]/rect.getDouble("vh")));
            int x1=Math.min(shot.getWidth(),viewBox[0]+(int)((rect.getDouble("x")+rect.getDouble("w"))*viewBox[2]/rect.getDouble("vw")));
            int y1=Math.min(shot.getHeight(),viewBox[1]+(int)((rect.getDouble("y")+rect.getDouble("h"))*viewBox[3]/rect.getDouble("vh")));
            Bitmap pixels=shot.copy(Bitmap.Config.ARGB_8888,false); int ink=0;
            for(int y=y0;y<y1;y++) for(int x=x0;x<x1;x++) { int c=pixels.getPixel(x,y); if(Math.abs(android.graphics.Color.red(c)-244)<=3 && Math.abs(android.graphics.Color.green(c)-230)<=3 && Math.abs(android.graphics.Color.blue(c)-201)<=3) ink++; }
            pixels.recycle(); assertTrue("The author credit must paint visible pixels on the title screen", ink>3);
        }
        File target = new File(instrumentation.getTargetContext().getExternalFilesDir(null), name);
        try (FileOutputStream stream = new FileOutputStream(target)) { shot.compress(Bitmap.CompressFormat.PNG, 100, stream); }
        shot.recycle();
    }
    private void mediaRange(String asset, String header, long offset, int length) throws Exception {
        js("window.__mediaCheck=null;fetch("+JSONObject.quote(asset)+",{headers:{Range:"+JSONObject.quote(header)+"}}).then(async r=>window.__mediaCheck={status:r.status,bytes:Array.from(new Uint8Array(await r.arrayBuffer()))}).catch(e=>window.__mediaCheck={error:String(e)});true");
        until("window.__mediaCheck && typeof window.__mediaCheck==='object'");
        JSONObject response = object("window.__mediaCheck"); assertEquals(206, response.getInt("status"));
        JSONArray actual = response.getJSONArray("bytes"); assertEquals(length, actual.length());
        try (InputStream source = instrumentation.getTargetContext().getAssets().open("game/"+asset)) {
            long remaining = offset;
            while (remaining > 0) { long skipped=source.skip(remaining); assertTrue(skipped>0); remaining-=skipped; }
            for (int i=0;i<length;i++) assertEquals("Wrong media byte at "+(offset+i), source.read(), actual.getInt(i));
        }
    }
    @Test public void offlineReleaseSurvivesTouchMediaAllActsAndLifecycleChurn() throws Exception {
        Log.i("ScarQA", "Launching signed release activity");
        instrumentation.runOnMainSync(() -> ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(lifecycle));
        scenario = ActivityScenario.launch(MainActivity.class);
        try {
            Log.i("ScarQA", "Activity resumed; checking offline media");
            until("document.readyState==='complete' && window.ScarHost && document.getElementById('intro-video')");
            mediaRange("assets/sfx/scar_alright.wav", "bytes=4-19", 4, 16);
            mediaRange("assets/sfx/scar_alright.wav", "bytes=0-19", 0, 20);
            long videoSize;
            try (android.content.res.AssetFileDescriptor descriptor = instrumentation.getTargetContext().getAssets().openFd("game/assets/intro.mp4")) { videoSize=descriptor.getLength(); }
            mediaRange("assets/intro.mp4", "bytes=-128", videoSize-128, 128);
            mediaRange("assets/intro.mp4", "bytes="+(videoSize-32)+"-", videoSize-32, 32);
            startGame();
            Log.i("ScarQA", "Intro Start works; checking simultaneous touch controls");
            assertEquals("\"" + BuildConfig.VERSION_NAME + "\"", js("window.sonicGame ? '" + BuildConfig.VERSION_NAME + "' : ''"));
            js("window.sonicGame.loadStage('palmtree',{skipTitleCard:true,skipFade:true});true");
            until("getComputedStyle(document.getElementById('touch')).display==='flex'");
            double beforeX = Double.parseDouble(js("window.sonicGame.player.x"));
            float[] right = button("[data-key=right]"), jump = button("[data-key=jump]");
            long down = SystemClock.uptimeMillis();
            pairEvent(down, MotionEvent.ACTION_DOWN, right, jump, 1);
            pairEvent(down, MotionEvent.ACTION_POINTER_DOWN | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), right, jump, 2);
            until("window.sonicGame.input.right && window.sonicGame.input.jumpHeld");
            until("window.sonicGame.player.x>"+beforeX);
            pairEvent(down, MotionEvent.ACTION_POINTER_UP | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), right, jump, 2);
            pairEvent(down, MotionEvent.ACTION_UP, right, jump, 1);
            until("!window.sonicGame.input.right && !window.sonicGame.input.jumpHeld");
            js("CanvasRenderingContext2D.prototype.roundRect=undefined;true");

            JSONArray stages = new JSONArray((String)new JSONTokener(js("JSON.stringify(window.sonicGame.getCampaignStages())")).nextValue());
            assertEquals(7, stages.length());
            assertEquals("z3_act1", stages.getString(6));
            for (int i=0;i<stages.length();i++) {
                String stage = stages.getString(i);
                Log.i("ScarQA", "Rendering checkpoints and lifecycle test: " + stage);
                js("window.sonicGame.loadStage(" + JSONObject.quote(stage) + ",{skipTitleCard:true,skipFade:true});window.sonicGame.player.invincTimer=10000;true");
                Log.i("ScarQA", "Loaded " + stage);
                until("window.sonicGame.enemySheetLoaded");
                int count = Integer.parseInt(js("window.sonicGame.terrain.checkpoints.length"));
                for (int cp=0;cp<count;cp++) for (String era : new String[] {"good_future", "present", "past"}) {
                    Log.i("ScarQA", "Rendering " + stage + " checkpoint=" + cp + " era=" + era);
                    assertEquals("true", js("(()=>{let g=window.sonicGame;g.gotoCheckpoint("+cp+");g.player.invincTimer=10000;g.terrain.timeEra="+JSONObject.quote(era)+";g.render();return Number.isFinite(g.player.x)&&Number.isFinite(g.camX);})()"));
                }
                Log.i("ScarQA", "Checkpoint renders complete; backgrounding " + stage);
                backgroundAndResume();
                until("window.sonicGame.paused");
                String time = js("window.sonicGame.stageTime"); SystemClock.sleep(300);
                assertEquals(time, js("window.sonicGame.stageTime"));
                tap(button("#btn-resume"));
                until("!window.sonicGame.paused");
                double clock = Double.parseDouble(js("window.sonicGame.terrain.clock"));
                until("window.sonicGame.terrain.clock>" + clock, 10000);
                if (stage.equals("z3_act1")) {
                    until("window.ScarSpriteModels.loaded");
                    capture("v"+BuildConfig.VERSION_NAME+"-android-mirage.png");
                    js("window.sonicGame.loadStage('z3_act1',{skipTitleCard:true,skipFade:true});true");
                    float[] move = button("[data-key=right]");
                    long routeDown = SystemClock.uptimeMillis();
                    pairEvent(routeDown, MotionEvent.ACTION_DOWN, move, move, 1);
                    JSONObject route = null;
                    long routeDeadline=SystemClock.uptimeMillis()+120000, nextLog=0;
                    try {
                        until("window.sonicGame.input.right");
                        do {
                            route=object("(()=>{let g=window.sonicGame;return{x:g.player.x,y:g.player.y,time:g.stageTime,lives:g.player.lives,paused:g.paused,right:g.input.right,done:!!(g.terrain.goalPost.spinning||g.terrain.goalPost.cleared)};})()");
                            if(SystemClock.uptimeMillis()>=nextLog){Log.i("ScarQA","Mirage touch route: "+route);nextLog=SystemClock.uptimeMillis()+10000;}
                            if(route.getBoolean("done"))break;
                            assertFalse("Native route must remain unpaused",route.getBoolean("paused"));
                            SystemClock.sleep(250);
                        } while(SystemClock.uptimeMillis()<routeDeadline);
                        assertTrue("Native route did not reach the signpost: "+route,route!=null&&route.getBoolean("done"));
                    } finally { pairEvent(routeDown, MotionEvent.ACTION_UP, move, move, 1); }
                    assertEquals("true", js("window.sonicGame.player.lives>=3"));
                    Log.i("ScarQA", "Mirage Aqueduct native touch route reached the signpost");
                }
            }
            for (int i=0;i<8;i++) backgroundAndResume();
            Log.i("ScarQA", "Rapid lifecycle churn complete; checking Rosie assist");
            until("window.sonicGame.paused"); tap(button("#btn-resume")); until("!window.sonicGame.paused");
            js("localStorage.setItem('scar_apk_qa','persisted');window.sonicGame.loadStage('z2_act3',{skipTitleCard:true,skipFade:true});window.sonicGame.gotoCheckpoint(1);window.sonicGame.player.invincTimer=10000;true");
            until("window.sonicGame.terrain.boss.active && window.SanctuaryDuetArt.loaded");
            tap(button("#btn-talk"));
            until("window.sonicGame.terrain.boss.ally.assistCount>0", 120000);
            assertEquals("0", js("window.__qaErrors.length"));
            capture("v"+BuildConfig.VERSION_NAME+"-android-arena.png");
            String savedStage=js("window.sonicGame.stageName"), savedCheckpoint=js("window.sonicGame.cpIndex");
            MainActivity previous=current.get(); onMain(activity -> activity.recreate());
            long recreationDeadline=SystemClock.uptimeMillis()+20000;
            while ((current.get()==previous || nativeStage.get()!=Stage.RESUMED) && SystemClock.uptimeMillis()<recreationDeadline) SystemClock.sleep(50);
            assertNotSame("Activity must really be recreated", previous, current.get());
            untilStage(Stage.RESUMED); startGame(); assertEquals("\"persisted\"", js("localStorage.getItem('scar_apk_qa')"));
            assertEquals("Recreation must retain the reached act", savedStage, js("window.sonicGame.stageName"));
            assertEquals("Recreation must retain the checkpoint", savedCheckpoint, js("window.sonicGame.cpIndex"));
            Log.i("ScarQA", "All release smoke checks completed");
        } catch (Throwable failure) { Log.e("ScarQA", "Release check failed", failure); throw failure; }
        finally {
            // Preserve the actual failure if the app main thread is wedged; synchronous
            // teardown would otherwise hide it behind the outer adb timeout.
            if (mainResponsive) {
                if (current.get()!=null && nativeStage.get()!=Stage.DESTROYED) { onMain(activity -> activity.finish()); untilStage(Stage.DESTROYED); }
                if (scenario != null) scenario.close();
                new Handler(Looper.getMainLooper()).post(() -> ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(lifecycle));
            }
        }
    }
}
