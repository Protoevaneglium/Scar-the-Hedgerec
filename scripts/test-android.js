#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const root = path.resolve(__dirname, '..'), release = require('../release.json');
const serial = process.argv[2] || process.env.ANDROID_SERIAL;
if (!serial || !/^emulator-\d+$/.test(serial)) throw new Error('Pass the isolated test emulator serial, for example: npm run test:android -- emulator-5580');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.USERPROFILE || '', 'Documents/SDK');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
function run(args, allowFailure = false, timeout = 120000) {
    const result = cp.spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    if (!allowFailure && (result.error || result.status !== 0)) throw new Error('Android test command failed: ' + args.join(' ') + '\n' + result.stdout + result.stderr);
    return result;
}
if (run(['shell', 'getprop', 'ro.kernel.qemu']).stdout.trim() !== '1') throw new Error('This test runner only installs on an emulator.');
const apk = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const tests = path.join(root, 'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk');
const apkSha256 = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
run(['install', '-r', apk]); run(['install', '-r', '-t', tests]);
run(['shell', 'wm', 'dismiss-keyguard']);
// Prepare only this disposable emulator: Android's first-use fullscreen coach
// otherwise sits above the game and consumes the test's native touch events.
run(['shell', 'settings', 'put', 'secure', 'immersive_mode_confirmations', 'confirmed']);
run(['shell', 'am', 'force-stop', release.applicationId]);
run(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
const started = new Date();
console.log('Running the signed release APK on ' + serial + ' (native WebView touch, local media, acts and lifecycle).');
const qa = path.join(root, 'output/qa'); fs.mkdirSync(qa, { recursive: true });
const tracePath = path.join(qa, 'android-native.log'), traceFd=fs.openSync(tracePath, 'w');
const trace = cp.spawn(adb, ['-s', serial, 'logcat', '-T', '1', 'ScarQA:I', 'TestRunner:E', 'AndroidRuntime:E', '*:S'],
    { stdio: ['ignore', traceFd, traceFd], windowsHide: true });
trace.on('error', () => {});
let result;
try {
    const timeout = process.env.CI ? 600000 : 900000;
    result = run(['shell', 'am', 'instrument', '-w', release.applicationId + '.test/androidx.test.runner.AndroidJUnitRunner'], true, timeout);
} finally { trace.kill(); fs.closeSync(traceFd); }
const log = (result.stdout || '') + (result.stderr || '') + (result.error ? '\n' + result.error.message : '')
    + '\nNative progress:\n' + fs.readFileSync(tracePath, 'utf8').slice(-45000);
const passed = result.status === 0 && !result.error && /OK \(\d+ tests?\)/.test(log) && !/FAILURES|INSTRUMENTATION_FAILED|Process crashed/.test(log);
const report = { schema: 1, version: release.version, serial, passed, startedAt: started.toISOString(), completedAt: new Date().toISOString(),
    android: run(['shell', 'getprop', 'ro.build.version.release']).stdout.trim(),
    webView: run(['shell', 'dumpsys', 'webviewupdate']).stdout.split(/\r?\n/).find(line => line.includes('Current WebView package'))?.trim(),
    apkSha256,
    checks: ['byte-for-byte offline WAV and MP4 ranges', 'title credit and intro Start', 'simultaneous movement and jump via native WebView MotionEvents',
        'every campaign checkpoint and era', 'pause/resume and rapid lifecycle churn', 'Rosie tag assist', 'activity recreation and persistent storage'],
    limitations: ['Android 15 emulator; physical phones, OS-level touch routing and Bluetooth controller hardware were not certified.'], log };
fs.writeFileSync(path.join(root, 'output/qa/android-device.json'), JSON.stringify(report, null, 2) + '\n');
console.log(log);
if (passed) for (const image of ['title', 'arena']) run(['pull', '/sdcard/Android/data/' + release.applicationId + '/files/v' + release.version + '-android-' + image + '.png', path.join(root, 'output/qa/android-' + image + '.png')]);
process.exitCode = passed ? 0 : 1;
