class GameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameOverScene' });
    }

    create() {
        // Black background
        this.cameras.main.setBackgroundColor('#000000');

        // Character appearing fainted
        let fainted = this.add.sprite(400, 200, 'scar_fall');
        fainted.setDisplaySize(128, 128);
        fainted.setAngle(90); // Laying on the side
        fainted.setTint(0x555555); // Darken a bit to look defeated

        // Big red GAME OVER text
        this.add.text(400, 350, 'GAME OVER', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '80px',
            color: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Small "press 'enter' to continue" text
        this.add.text(400, 450, "press 'enter' to continue", {
            fontFamily: 'Arial, sans-serif',
            fontSize: '24px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Listen for enter key
        this.input.keyboard.once('keydown-ENTER', () => {
            this.scene.start('MainScene');
        });
    }
}
