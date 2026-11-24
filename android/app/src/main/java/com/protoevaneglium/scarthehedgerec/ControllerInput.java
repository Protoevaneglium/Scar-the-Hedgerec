package com.protoevaneglium.scarthehedgerec;

import android.hardware.input.InputManager;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;

/** Normalizes native Xbox/Android events to the shared browser-standard layout. */
final class ControllerInput implements InputManager.InputDeviceListener {
    private static final class Pad {
        final int deviceId; final String id;
        final boolean[] keys = new boolean[17];
        float x, y, hatX, hatY;
        boolean ready=true;
        Pad(int deviceId, String name) { this.deviceId=deviceId; id="Android " + deviceId + ": " + name; }
    }
    private final Map<Integer,Pad> pads = new LinkedHashMap<>();
    private final InputManager manager;
    private final Consumer<String> publish;
    ControllerInput(InputManager manager, Consumer<String> publish) {
        this.manager=manager; this.publish=publish;
        manager.registerInputDeviceListener(this, null);
        for (int id : manager.getInputDeviceIds()) add(id);
    }
    private static boolean controller(int source) {
        return (source & InputDevice.SOURCE_GAMEPAD)==InputDevice.SOURCE_GAMEPAD
            || (source & InputDevice.SOURCE_JOYSTICK)==InputDevice.SOURCE_JOYSTICK;
    }
    private void add(int id) {
        InputDevice device=manager.getInputDevice(id);
        if (device!=null && controller(device.getSources())) pad(id,device.getName());
    }
    private Pad pad(int id, String name) {
        Pad p=pads.get(id);
        if (p==null && pads.size()<16) { p=new Pad(id,name); pads.put(id,p); }
        return p;
    }
    private static int button(int key) {
        switch(key) {
            case KeyEvent.KEYCODE_BUTTON_A: case KeyEvent.KEYCODE_DPAD_CENTER: return 0;
            case KeyEvent.KEYCODE_BUTTON_B: case KeyEvent.KEYCODE_BACK: return 1;
            case KeyEvent.KEYCODE_BUTTON_X: return 2;
            case KeyEvent.KEYCODE_BUTTON_START: case KeyEvent.KEYCODE_MENU: return 9;
            case KeyEvent.KEYCODE_DPAD_UP: return 12;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 13;
            case KeyEvent.KEYCODE_DPAD_LEFT: return 14;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 15;
            default: return -1;
        }
    }
    boolean key(KeyEvent event) {
        if (!controller(event.getSource()) && !(event.getDevice()!=null && controller(event.getDevice().getSources()))) return false;
        int b=button(event.getKeyCode());
        if(b<0 || (event.getAction()!=KeyEvent.ACTION_DOWN && event.getAction()!=KeyEvent.ACTION_UP)) return false;
        Pad p=pad(event.getDeviceId(),event.getDevice()!=null?event.getDevice().getName():"Gamepad");
        if(p==null)return false;
        // Repeats cannot resurrect a held key after focus loss or retrigger actions.
        if(event.getRepeatCount()==0 || event.getAction()==KeyEvent.ACTION_UP) {
            p.keys[b]=event.getAction()==KeyEvent.ACTION_DOWN; send();
        }
        return true;
    }
    private static float axis(MotionEvent event,int axis) {
        float value=event.getAxisValue(axis);
        InputDevice device=event.getDevice();
        InputDevice.MotionRange range=device==null?null:device.getMotionRange(axis,event.getSource());
        float flat=range==null?0:range.getFlat();
        return Float.isFinite(value) && Math.abs(value)>flat?Math.max(-1,Math.min(1,value)):0;
    }
    boolean motion(MotionEvent event) {
        if(!event.isFromSource(InputDevice.SOURCE_JOYSTICK) || event.getActionMasked()!=MotionEvent.ACTION_MOVE)return false;
        Pad p=pad(event.getDeviceId(),event.getDevice()!=null?event.getDevice().getName():"Gamepad");
        if(p==null)return false;
        p.x=axis(event,MotionEvent.AXIS_X);p.y=axis(event,MotionEvent.AXIS_Y);
        p.hatX=axis(event,MotionEvent.AXIS_HAT_X);p.hatY=axis(event,MotionEvent.AXIS_HAT_Y);send();return true;
    }
    void send() {
        JSONArray states=new JSONArray();
        try {
            for(Pad p:pads.values()) {
                JSONArray buttons=new JSONArray();
                boolean neutral=Math.abs(p.x)<=.15 && Math.abs(p.y)<=.15 && Math.abs(p.hatX)<=.15 && Math.abs(p.hatY)<=.15;
                for(int b=0;b<17;b++)buttons.put(p.keys[b] || b==12&&p.hatY<-.5 || b==13&&p.hatY>.5
                    || b==14&&p.hatX<-.5 || b==15&&p.hatX>.5 ? 1:0);
                for(boolean held:p.keys)neutral &= !held;
                if(neutral)p.ready=true;
                states.put(new JSONObject().put("index",p.deviceId & 0x7fffffff).put("id",p.id)
                    .put("ready",p.ready).put("axes",new JSONArray().put(p.x).put(p.y)).put("buttons",buttons));
            }
        } catch(JSONException failure) { throw new IllegalStateException(failure); }
        publish.accept(states.toString());
    }
    @Override public void onInputDeviceAdded(int id) { add(id);send(); }
    @Override public void onInputDeviceChanged(int id) { onInputDeviceRemoved(id);add(id);send(); }
    @Override public void onInputDeviceRemoved(int id) { pads.remove(id);send(); }
    void suspend() { for(Pad p:pads.values())p.ready=false;send(); }
    void close() { manager.unregisterInputDeviceListener(this);pads.clear(); }
}
