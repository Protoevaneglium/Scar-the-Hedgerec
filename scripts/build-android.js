#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const root = path.resolve(__dirname, '..'), win = process.platform === 'win32';
function first(paths) { return paths.find(p => p && fs.existsSync(p)); }
const javaHome = first([process.env.JAVA_HOME, win && 'C:/Program Files/Android/Android Studio/jbr']);
const sdk = first([process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    win && path.join(process.env.USERPROFILE || '', 'Documents/SDK'), win && path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk')]);
if (!javaHome || !sdk) throw new Error('Set JAVA_HOME (JDK 17+) and ANDROID_HOME to the installed Android SDK.');
const signingDir = path.join(root, 'output/android-signing'), credentialsFile = path.join(signingDir, 'credentials.json');
fs.mkdirSync(signingDir, { recursive: true });
let signing;
if (process.env.SCAR_KEYSTORE_PATH) signing = { path: process.env.SCAR_KEYSTORE_PATH,
    password: process.env.SCAR_KEYSTORE_PASSWORD, alias: process.env.SCAR_KEY_ALIAS, keyPassword: process.env.SCAR_KEY_PASSWORD };
else if (fs.existsSync(credentialsFile)) signing = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
else {
    const password = crypto.randomBytes(32).toString('base64url');
    signing = { path: path.join(signingDir, 'scar-release.jks'), password, alias: 'scar-release', keyPassword: password };
    if (fs.existsSync(signing.path)) throw new Error('A signing key exists without its credentials; recover its credentials before building.');
    const result = cp.spawnSync(path.join(javaHome, 'bin', win ? 'keytool.exe' : 'keytool'), [
        '-genkeypair', '-keystore', signing.path, '-alias', signing.alias, '-keyalg', 'RSA', '-keysize', '3072',
        '-validity', '10000', '-dname', 'CN=Scar the Hedgerec, OU=Game Releases, O=Protoevaneglium',
        '-storepass:env', 'SCAR_KEYSTORE_PASSWORD', '-keypass:env', 'SCAR_KEYSTORE_PASSWORD', '-storetype', 'JKS',
    ], { env: { ...process.env, SCAR_KEYSTORE_PASSWORD: password }, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error('Signing key generation failed: ' + result.stderr);
    fs.writeFileSync(credentialsFile, JSON.stringify(signing, null, 2) + '\n', { mode: 0o600 });
    console.log('Created private release signing material in ignored output/android-signing. Keep it for future APK updates.');
}
if (!signing.path || !signing.password || !signing.alias || !signing.keyPassword) throw new Error('Release signing credentials are incomplete.');
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
    SCAR_KEYSTORE_PATH: signing.path, SCAR_KEYSTORE_PASSWORD: signing.password,
    SCAR_KEY_ALIAS: signing.alias, SCAR_KEY_PASSWORD: signing.keyPassword };
const args = process.argv.slice(2), tasks = args.length ? args : ['assembleRelease', 'lintRelease'];
const executable = path.join(javaHome, 'bin', win ? 'java.exe' : 'java');
const wrapper = path.join(root, 'android/gradle/wrapper/gradle-wrapper.jar');
const result = cp.spawnSync(executable, ['-classpath', wrapper, 'org.gradle.wrapper.GradleWrapperMain', '--no-daemon', ...tasks],
    { cwd: path.join(root, 'android'), env, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status === 0 ? 0 : 1;
