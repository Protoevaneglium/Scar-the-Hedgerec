/** Neon Labyrinth: original 136 BPM luminous synth / aquatic house loop. */
'use strict';
const fs = require('fs');
const path = require('path');
const RATE = 32000, BPM = 136, BEAT = 60 / BPM, BARS = 32;
const N = Math.round(BARS * 4 * BEAT * RATE), TAU = Math.PI * 2;
const left = new Float32Array(N), right = new Float32Array(N);
let seed = 0x3a2f86;
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

// Original E-major / C-sharp-minor synth-pop harmony; no reference soundtrack samples.
const chords=[[40,[59,63,66,71]],[45,[57,61,64,68]],[49,[56,61,64,68]],[47,[59,63,66,69]],
 [40,[59,64,68,71]],[42,[57,61,66,69]],[45,[57,61,64,68]],[47,[59,63,66,71]]];
const melody=[
 [[0,76,2],[3,78,1],[4,80,2],[7,83,1],[8,85,3],[12,83,2],[14,80,2]],
 [[0,81,3],[4,80,2],[7,76,1],[8,73,2],[11,76,1],[12,80,3]],
 [[0,80,2],[2,83,2],[5,85,2],[8,87,3],[12,85,2],[14,83,2]],
 [[0,78,2],[3,75,1],[4,78,2],[7,83,1],[8,85,2],[11,83,1],[12,78,3]],
 [[0,88,3],[4,87,2],[7,83,1],[8,80,2],[11,83,1],[12,85,3]],
 [[0,85,2],[3,81,1],[4,78,3],[8,81,2],[11,85,1],[12,90,3]],
 [[0,88,2],[3,85,1],[4,81,2],[7,80,1],[8,76,3],[12,80,2],[14,81,2]],
 [[0,83,3],[4,78,2],[7,75,1],[8,78,2],[11,80,1],[12,83,3]]
];
for(let bar=0;bar<BARS;bar++) {
 const beat=bar*4,local=bar%8,section=Math.floor(bar/8),[root,chord]=chords[local];
 for(const [at,oct] of [[0,0],[.75,12],[1,0],[1.75,7],[2,0],[2.75,12],[3,0],[3.5,7]]) note(beat+at,root+oct,.22,.24,'bass');
 for(let j=0;j<4;j++)note(beat,chord[j],3.7,.035,'pad',(j-1.5)*.3);
 for(let k=0;k<8;k++)note(beat+k*.5+.25,chord[[0,2,1,3,2,0,3,1][k]]+(k%3===0?12:0),.28,.12,'glass',k%2?.6:-.6);
 for(const [at,pitch,len] of melody[local]) {
  const m=pitch+(section===1?-12:0);note(beat+at/4,m,len/4-.03,.21,section%2?'glass':'lead',-.08);
  note(beat+at/4+.75,m,len/4-.03,.04,'glass',.65);
 }
 for(let k=0;k<4;k++)kick(beat+k,k%2?.46:.60);snare(beat+1,.32);snare(beat+3,.36);
 for(let k=0;k<8;k++)hat(beat+k*.5,k%2===1,.065);
 for(const at of [.75,2.75])conga(beat+at,true,.08);
 if(local===0)crash(beat,.12);
 if(local===7)for(let k=0;k<4;k++)conga(beat+3+k*.25,k%2,.20);
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
const destination=path.join(__dirname,'../public/assets/neon_labyrinth.wav');
fs.writeFileSync(destination,bytes);
const seam=Math.max(Math.abs(left[0]-left[N-1]),Math.abs(right[0]-right[N-1]))*gain;
console.log(JSON.stringify({destination,bpm:BPM,bars:BARS,seconds:N/RATE,sampleRate:RATE,channels:2,
    bytes:bytes.length,peak:.93,rms:Math.sqrt(square/(N*2)),loopSeamDelta:seam},null,2));
