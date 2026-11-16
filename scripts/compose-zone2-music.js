/**
 * Marble Canopy Act 1 — an original, seamless 156 BPM jungle / FM adventure loop.
 * Run with `node scripts/compose-zone2-music.js`; no packages or encoder required.
 * 48 bars: canopy theme (16), marble-vault answer (16), soaring reprise (16).
 * All notes, instruments and percussion are synthesized here, with no sampled music.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RATE = 32000, BPM = 156, BEAT = 60 / BPM, BARS = 48;
const N = Math.round(BARS * 4 * BEAT * RATE), TAU = Math.PI * 2;
const left = new Float32Array(N), right = new Float32Array(N);
let seed = 0x1267ab;
function noise() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2147483648 - 1; }
function add(beat, duration, pan, render) {
    const start = Math.round(beat * BEAT * RATE), count = Math.ceil(duration * RATE);
    const l = Math.sqrt((1 - pan) * .5), r = Math.sqrt((1 + pan) * .5);
    for (let i = 0; i < count; i++) {
        const sample = render(i / RATE, i) || 0, at = (start + i) % N;
        left[at] += sample * l; right[at] += sample * r;
    }
}
function note(beat, midi, length, amp, voice, pan = 0) {
    const duration = length * BEAT, hz = 440 * Math.pow(2, (midi - 69) / 12);
    const release = voice === 'pad' ? .18 : voice === 'bass' ? .035 : .09;
    add(beat, duration + release, pan, t => {
        const tail = t > duration ? Math.max(0, 1 - (t - duration) / release) : 1;
        const attack = Math.min(1, t / (voice === 'pad' ? .07 : .003));
        const p = TAU * hz * t;
        let wave, env;
        if (voice === 'lead') {
            const vibrato = Math.sin(TAU * 5.4 * t) * .013 * Math.min(1, t * 8);
            wave = .74 * Math.sin(p + vibrato + 1.25 * Math.exp(-t * 13) * Math.sin(2 * p))
                + .17 * Math.sin(2 * p + .3) + .09 * Math.sin(3 * p);
            env = .63 + .37 * Math.exp(-t * 9);
        } else if (voice === 'bass') {
            wave = .74 * Math.sin(p + .65 * Math.exp(-t * 16) * Math.sin(p * 2))
                + .18 * Math.sin(2 * p) + .08 * Math.sin(3 * p);
            env = .72 + .28 * Math.exp(-t * 14);
        } else if (voice === 'pad') {
            wave = .55 * Math.sin(p) + .2 * Math.sin(p * 1.003) + .15 * Math.sin(p * .997) + .1 * Math.sin(2 * p);
            env = .75;
        } else if (voice === 'marimba') {
            wave = Math.sin(p + 1.8 * Math.exp(-t * 25) * Math.sin(p * 3.99));
            env = Math.exp(-t * 10);
        } else {
            wave = .8 * Math.sin(p + .8 * Math.exp(-t * 19) * Math.sin(2 * p)) + .2 * Math.sin(2 * p);
            env = Math.exp(-t * 7);
        }
        return amp * wave * env * attack * tail;
    });
}
function kick(beat, amp = .8) {
    add(beat, .24, 0, t => amp * (Math.sin(TAU * (47 * t + 4.6 * (1 - Math.exp(-t * 26)))) * Math.exp(-t * 18)
        + noise() * .1 * Math.exp(-t * 200)) * Math.min(1, t * 1800));
}
function snare(beat, amp = .42) {
    let previous = 0;
    add(beat, .18, .09, t => {
        const n = noise(), high = n - previous * .65; previous = n;
        return amp * (high * .63 * Math.exp(-t * 28) + Math.sin(TAU * 183 * t) * .37 * Math.exp(-t * 32)) * Math.min(1, t * 1500);
    });
}
function hat(beat, open = false, amp = .09, pan = .35) {
    let previous = 0;
    add(beat, open ? .15 : .055, pan, t => {
        const n = noise(), high = n - previous; previous = n;
        return amp * high * Math.exp(-t * (open ? 25 : 85)) * Math.min(1, t * 3000);
    });
}
function conga(beat, high, amp = .18) {
    const hz = high ? 320 : 218;
    add(beat, .13, high ? -.48 : .45, t => amp * (Math.sin(TAU * hz * t + .6 * Math.exp(-t * 70))
        * Math.exp(-t * 34) + noise() * .15 * Math.exp(-t * 95)) * Math.min(1, t * 2500));
}
function crash(beat, amp = .15) {
    let previous = 0;
    add(beat, .95, -.35, t => { const n = noise(), high = n - previous * .8; previous = n;
        return amp * high * Math.exp(-t * 5.8) * Math.min(1, t * 1000); });
}

// Em9 – Cmaj7 – Gmaj7 – D6 – Em9 – Am7 – Cmaj7 – B7.
const harmony = [
    [40, [55,59,62,66]], [36,[55,59,64,67]], [43,[55,59,62,66]], [38,[57,59,62,66]],
    [40,[55,59,62,66]], [33,[55,60,64,67]], [36,[55,59,64,67]], [35,[57,63,66,69]],
];
// Independent, newly composed melodic phrases. Entries are [sixteenth, MIDI, sixteenths].
const theme = [
    [[0,76,2],[3,79,1],[4,83,2],[7,81,1],[8,79,2],[11,76,1],[12,74,2],[14,76,2]],
    [[0,79,3],[4,76,2],[7,74,1],[8,72,2],[11,74,1],[12,76,3]],
    [[0,74,2],[2,79,2],[5,83,2],[8,86,3],[12,83,2],[14,81,2]],
    [[0,78,3],[4,81,2],[7,79,1],[8,78,2],[11,74,1],[12,76,3]],
    [[0,76,2],[3,79,1],[4,83,2],[7,86,1],[8,88,3],[12,86,2],[14,83,2]],
    [[0,84,3],[4,83,2],[7,81,1],[8,79,2],[10,76,2],[13,79,2]],
    [[0,79,2],[3,76,1],[4,79,2],[7,83,1],[8,84,3],[12,83,2],[14,79,2]],
    [[0,78,2],[3,75,1],[4,78,2],[7,81,1],[8,83,2],[10,81,2],[12,78,2],[14,75,1]],
];
const answer = [
    [[0,71,3],[4,74,2],[7,76,1],[8,78,2],[11,79,1],[12,78,2],[14,74,2]],
    [[0,72,3],[4,76,2],[6,79,2],[9,83,2],[12,79,3]],
    [[0,71,2],[3,74,1],[4,79,3],[8,81,2],[11,83,1],[12,86,3]],
    [[0,85,2],[3,81,1],[4,78,2],[7,76,1],[8,74,3],[12,69,3]],
    [[0,71,2],[2,74,2],[5,76,2],[8,79,3],[12,78,2],[14,76,2]],
    [[0,72,3],[4,76,2],[7,79,1],[8,81,3],[12,79,2],[14,76,2]],
    [[0,79,3],[4,84,2],[7,83,1],[8,79,2],[11,76,1],[12,74,3]],
    [[0,75,2],[3,78,1],[4,81,2],[7,83,1],[8,87,2],[10,86,2],[12,83,2],[14,78,2]],
];
for (let bar = 0; bar < BARS; bar++) {
    const start = bar * 4, section = Math.floor(bar / 16), local = bar % 8;
    const [root, chord] = harmony[local];
    // Round bass, pitched an octave up on the offbeats for forward motion.
    for (const [sixteenth, octave, length, accent] of [[0,0,2,.3],[3,12,1,.2],[4,0,2,.25],[6,7,1,.19],
        [8,0,2,.3],[11,12,1,.2],[12,0,2,.25],[14,local===7?11:7,1,.2],[15,12,1,.16]])
        note(start + sixteenth/4, root + octave, length/4-.025, accent, 'bass');
    for (let i = 0; i < chord.length; i++) note(start, chord[i], 3.74, .038, 'pad', (i - 1.5) * .38);
    // Alternating, interlocking marimba and glass arpeggios.
    const order = section === 1 ? [0,2,1,3,2,1,3,0] : [0,1,3,2,1,3,2,1];
    for (let step = 0; step < 8; step++) {
        const octave = step % 3 === 0 ? 12 : 0;
        note(start + step*.5 + .25, chord[order[step]] + octave, .32, .125, 'marimba', step%2 ? .55 : -.55);
        if (bar % 8 >= 4) note(start + step*.5, chord[(step+1)%4]+12, .2, .048, 'glass', step%2 ? -.7 : .7);
    }
    const phrase = (section === 1 ? answer : theme)[local];
    for (const [sixteenth, midi, length] of phrase) {
        note(start + sixteenth/4, midi, length/4-.035, section === 1 ? .18 : .225, 'lead', -.08);
        // Crossed short delays preserve articulation and wrap naturally at the loop.
        note(start + sixteenth/4+.75, midi, length/4-.035, .040, 'lead', .65);
        if (section === 2 && local >= 4) note(start + sixteenth/4, midi-12, length/4-.06, .055, 'glass', .2);
    }
    kick(start); kick(start+1.5,.57); kick(start+2,.7);
    if (local % 2) kick(start+3.5,.56);
    snare(start+1); snare(start+3,.46);
    for (let step = 0; step < 8; step++) {
        hat(start+step*.5, step%2===1, step%2 ? .095 : .063);
        if (step%2) hat(start+step*.5+.25,false,.035,-.5);
    }
    for (const [offset, high, volume] of [[.75,true,.14],[1.75,false,.18],[2.5,true,.16],[2.75,false,.14],[3.75,true,.18]])
        conga(start+offset,high,volume);
    if (bar % 8 === 0) crash(start);
    if (bar % 8 === 7) {
        for(let j=0;j<6;j++) conga(start+2.5+j*.25,j%3===0,.21);
        snare(start+3.5,.19); snare(start+3.75,.25);
    }
}

// Gentle feedback-free stereo echo of the whole ensemble. Circular indexing makes
// the arrangement's release tails and delay taps continuous across the exact loop.
const dryL = left.slice(), dryR = right.slice();
const taps = [[Math.round(BEAT*.75*RATE),.11],[Math.round(BEAT*1.5*RATE),.045]];
for (let i=0;i<N;i++) for (const [delay, gain] of taps) {
    const from=(i-delay+N)%N; left[i]+=dryR[from]*gain; right[i]+=dryL[from]*gain;
}
let peak=0, square=0, dcL=0, dcR=0;
for(let i=0;i<N;i++) {
    // A gentle analog-style bus saturator binds the FM and percussion together.
    left[i]=Math.tanh(left[i]*1.22); right[i]=Math.tanh(right[i]*1.22);
    dcL+=left[i];dcR+=right[i];
}
dcL/=N;dcR/=N;
for(let i=0;i<N;i++) {
    left[i]-=dcL;right[i]-=dcR;
    peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
}
const gain=.93/peak, bytes=Buffer.alloc(44+N*4);
bytes.write('RIFF',0);bytes.writeUInt32LE(36+N*4,4);bytes.write('WAVEfmt ',8);
bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);
bytes.writeUInt32LE(RATE,24);bytes.writeUInt32LE(RATE*4,28);
bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(N*4,40);
for(let i=0;i<N;i++) {
    const l=left[i]*gain, r=right[i]*gain; square+=l*l+r*r;
    bytes.writeInt16LE(Math.round(l*32767),44+i*4);bytes.writeInt16LE(Math.round(r*32767),46+i*4);
}
const destination=path.join(__dirname,'../public/assets/marble_canopy_act1.wav');
fs.writeFileSync(destination,bytes);
const seam=Math.max(Math.abs(left[0]-left[N-1]),Math.abs(right[0]-right[N-1]))*gain;
console.log(JSON.stringify({destination,bpm:BPM,bars:BARS,seconds:N/RATE,sampleRate:RATE,channels:2,
    bytes:bytes.length,peak:.93,rms:Math.sqrt(square/(N*2)),loopSeamDelta:seam},null,2));
