class MusicPlayer {
    constructor() {
        this.ctx = typeof zzfxX !== 'undefined' ? zzfxX : new (window.AudioContext || window.webkitAudioContext)();
        this.isPlaying = false;
        this.tempo = 140; // BPM
        this.noteLength = 60 / this.tempo / 4; // 16th note duration
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.current16thNote = 0;
        this.timerID = null;

        // Simple bassline sequence (C minor scale degrees)
        // 0=C2, 3=Eb2, 7=G2, 10=Bb2, etc.
        this.bassSequence = [
            0, 0, 12, 0,  3, 0, 10, 0, 
            0, 0, 12, 0,  7, 0, 10, 0,
            -2, -2, 10, -2, 1, -2, 8, -2,
            -4, -4, 8, -4, 3, -4, 5, -4
        ];
        
        // Lead arpeggio sequence
        this.leadSequence = [
            24, 27, 31, 36, 31, 27,
            22, 26, 29, 34, 29, 26,
            20, 24, 27, 32, 27, 24,
            19, 23, 26, 31, 26, 23
        ];
    }

    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.current16thNote = 0;
        
        // Ensure audio context is running (browsers require user interaction)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        this.schedule();
    }

    stop() {
        this.isPlaying = false;
        if (this.timerID) {
            clearTimeout(this.timerID);
        }
    }

    playNote(freq, type, duration, time, vol=0.1) {
        const t = time || this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(t);
        osc.stop(t + duration);
    }

    getFreq(note, octaveOffset) {
        // C2 is ~65.41 Hz
        return 65.41 * Math.pow(2, (note + (octaveOffset * 12)) / 12);
    }

    scheduleNextNote() {
        const t = this.nextNoteTime;

        // Play bass
        let bassNote = this.bassSequence[this.current16thNote % this.bassSequence.length];
        if (bassNote !== null) {
            this.playNote(this.getFreq(bassNote, 0), 'sawtooth', 0.2, t, 0.15);
        }

        // Play Lead (only on some beats for syncopation)
        if (this.current16thNote % 2 === 0) {
            let leadNoteIndex = Math.floor(this.current16thNote / 2) % this.leadSequence.length;
            let leadNote = this.leadSequence[leadNoteIndex];
            this.playNote(this.getFreq(leadNote, 1), 'square', 0.1, t, 0.05);
        }

        // Drum (noise burst) on every 4th 16th note (beats 2 and 4)
        if (this.current16thNote % 8 === 4) {
            this.playSnare();
        }
        
        // Kick on beats 1 and 3
        if (this.current16thNote % 8 === 0) {
            this.playKick(t);
        }

        this.nextNoteTime += this.noteLength;
        this.current16thNote++;
    }

    playKick(time) {
        const t = time || this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.1);
        
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        
        osc.start(t);
        osc.stop(t + 0.1);
    }

    playSnare() {
        // Using ZzFX for a quick noise hit if available
        if (typeof zzfx !== 'undefined') {
            zzfx(...[,,217,.01,,.04,4,1.3,,,,,,.8,,.4,,.6,.06]);
        }
    }

    schedule() {
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.scheduleNextNote();
        }
        if (this.isPlaying) {
            this.timerID = setTimeout(() => this.schedule(), 25);
        }
    }
}
