package com.protoevaneglium.scarthehedgerec;

import android.hardware.input.InputManager;
import android.content.Context;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class ControllerInputTest {
    private KeyEvent key(int source,int action,int code,int repeats) {
        long now=SystemClock.uptimeMillis();
        return new KeyEvent(now,now,action,code,repeats,0,9011,0,0,source);
    }
    @Test public void repeatsFocusReleaseReconnectAndKeyboardSeparation() throws Exception {
        AtomicReference<ControllerInput> bridge=new AtomicReference<>();
        AtomicReference<String> snapshot=new AtomicReference<>();
        android.app.Instrumentation runner=InstrumentationRegistry.getInstrumentation();
        runner.runOnMainSync(()->bridge.set(new ControllerInput((InputManager)runner.getTargetContext().getSystemService(Context.INPUT_SERVICE),snapshot::set)));
        try {
            ControllerInput input=bridge.get();
            assertFalse(input.key(key(InputDevice.SOURCE_KEYBOARD,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0)));
            assertTrue(input.key(key(InputDevice.SOURCE_GAMEPAD,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_BUTTON_A,0)));
            JSONObject state=new JSONArray(snapshot.get()).getJSONObject(0);assertEquals(1,state.getJSONArray("buttons").getInt(0));
            input.suspend();state=new JSONArray(snapshot.get()).getJSONObject(0);assertFalse(state.getBoolean("ready"));
            input.key(key(InputDevice.SOURCE_GAMEPAD,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_BUTTON_A,3));
            assertFalse(new JSONArray(snapshot.get()).getJSONObject(0).getBoolean("ready"));
            input.key(key(InputDevice.SOURCE_GAMEPAD,KeyEvent.ACTION_UP,KeyEvent.KEYCODE_BUTTON_A,0));
            state=new JSONArray(snapshot.get()).getJSONObject(0);assertTrue(state.getBoolean("ready"));assertEquals(0,state.getJSONArray("buttons").getInt(0));
            input.onInputDeviceRemoved(9011);assertEquals(0,new JSONArray(snapshot.get()).length());
            input.key(key(InputDevice.SOURCE_GAMEPAD,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_BUTTON_B,0));
            state=new JSONArray(snapshot.get()).getJSONObject(0);assertEquals(0,state.getJSONArray("buttons").getInt(0));assertEquals(1,state.getJSONArray("buttons").getInt(1));
        } finally {runner.runOnMainSync(()->bridge.get().close());}
    }
}
