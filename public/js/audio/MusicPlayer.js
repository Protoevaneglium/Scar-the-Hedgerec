class MusicPlayer {
    constructor() {
        this.audio = new Audio('assets/level1.mp3');
        this.audio.loop = true;
        this.audio.volume = 0.5;
        this.isPlaying = false;

        // Guarantee continuous looping across all browsers
        this.audio.addEventListener('ended', () => {
            this.audio.currentTime = 0;
            if (this.isPlaying) {
                this.audio.play().catch(() => {});
            }
        });
    }

    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.audio.play().catch(() => {});
    }

    stop() {
        this.isPlaying = false;
        this.audio.pause();
    }
}
