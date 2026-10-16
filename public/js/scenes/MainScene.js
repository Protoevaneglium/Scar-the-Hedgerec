class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
    }

    preload() {
        // Load the background (expecting the user to have saved it as background.png)
        this.load.image('background', 'assets/background.png');
        
        // Load platforms (reverted to original futuristic tile)
        this.load.image('platform', 'assets/platform.jpg');
        
        // Load player sprites (.png with transparent backgrounds)
        this.load.image('scar_idle', 'assets/scar_idle.png');
        this.load.image('scar_run', 'assets/scar_run.png');
        this.load.image('scar_jump', 'assets/scar_jump.png');
        this.load.image('scar_fall', 'assets/scar_fall.png');
        this.load.image('scar_death', 'assets/scar_death.png');
        this.load.image('scar_spindash', 'assets/scar_spindash.png');
        this.load.image('ring', 'assets/ring.png');
        // (the loop-de-loop is drawn procedurally in Loop.js so it matches its physics path exactly)

        // Load enemy sprites
        this.load.image('enemy_crabbot', 'assets/enemy_crabbot.png');
        this.load.image('enemy_buzzbot', 'assets/enemy_buzzbot.png');
    }

    create() {
        this.gameOver = false;

        // Initialize Background Music Player (stored on game so restarts don't spawn duplicate players)
        if (typeof MusicPlayer !== 'undefined') {
            if (!this.game.musicPlayer) {
                this.game.musicPlayer = new MusicPlayer();
                this.input.once('pointerdown', () => this.game.musicPlayer.start());
                this.input.keyboard.once('keydown', () => this.game.musicPlayer.start());
            }
            this.musicPlayer = this.game.musicPlayer;
        }

        // Level size (8x wider than original 800px)
        const levelWidth = 6400;
        const levelHeight = 600;

        // Set physics bounds and camera bounds
        this.physics.world.setBounds(0, 0, levelWidth, levelHeight);
        this.physics.world.setBoundsCollision(true, true, true, false);
        this.cameras.main.setBounds(0, 0, levelWidth, levelHeight);

        // Add background, repeated to fill level width
        for(let i = 0; i < levelWidth; i += 800) {
            const bg = this.add.image(i + 400, 300, 'background');
            bg.displayWidth = 800;
            bg.displayHeight = 600;
            bg.setScrollFactor(0.5); // Parallax effect
            bg.setDepth(-100); // Always behind everything else (the loop is drawn at depth -1)
        }

        // Create platforms group
        this.platforms = this.physics.add.staticGroup();

        // Create a more complex terrain structure mimicking classic Sonic levels (stairs, walls, multi-tiered floors)
        
        // Base Floor
        for(let i = 0; i < levelWidth; i += 64) {
            if (i > 1500 && i < 1800) continue; // Pit 1
            if (i > 3500 && i < 3900) continue; // Pit 2
            
            let tile = this.platforms.create(i + 32, 568, 'platform');
            tile.setDisplaySize(64, 64);
            tile.refreshBody();
        }

        // Stepped terrain / Hills
        const buildBlock = (x, y, widthBlocks, heightBlocks) => {
            let plat = this.platforms.create(x + (widthBlocks * 64)/2 - 32, y + (heightBlocks * 64)/2 - 32, 'platform');
            plat.setDisplaySize(widthBlocks * 64, heightBlocks * 64);
            plat.refreshBody();
        }

        // Hill 1
        buildBlock(600, 440, 4, 2);
        buildBlock(728, 312, 3, 4);

        // Hill 2
        buildBlock(1200, 440, 2, 2);
        buildBlock(1800, 312, 5, 4);
        
        // Floating platforms over Pit 2
        buildBlock(3600, 400, 1.5, 0.5);
        buildBlock(3750, 300, 1.5, 0.5);

        // High ground section
        buildBlock(2200, 440, 5, 2);
        buildBlock(2400, 250, 8, 2);
        
        // Stepped pyramid
        buildBlock(4200, 504, 8, 1);
        buildBlock(4264, 440, 6, 1);
        buildBlock(4328, 376, 4, 1);
        buildBlock(4392, 312, 2, 1);

        // Create the Loop-de-Loop. It needs flat solid floor and a long runway to build up speed, so it
        // sits on the long flat stretch after the high ground section (it used to sit over a pit).
        // Entrance at x=3100, floor top is y=536 (floor tiles are 64px tall and centred on y=568).
        this.loops = [new Loop(this, 3100, 536, 100, 40)];

        // Create Rings Groups
        this.staticRings = this.physics.add.group({ allowGravity: false });
        this.droppedRings = this.physics.add.group();

        // Spawn some static rings
        const addRing = (x, y) => {
            new Ring(this, x, y, false, this.staticRings);
        };

        // Ring clusters
        for(let i=0; i<5; i++) addRing(400 + i*40, 500); // start
        for(let i=0; i<5; i++) addRing(720 + i*40, 240); // hill 1 (on top of the tall block)
        for(let i=0; i<8; i++) addRing(2400 + i*40, 180); // high ground
        for(let i=0; i<5; i++) addRing(3600 + i*50, 330); // over pit 2
        this.loops.forEach(loop => loop.ringSpots(8).forEach(p => addRing(p.x, p.y))); // inside the loop
        
        // Initialize Player
        this.player = new Player(this, 100, 450);

        // Add Ring UI (fixed to camera)
        this.ringText = this.add.text(16, 16, 'RINGS: 0', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '32px',
            fill: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setScrollFactor(0);
        this.ringText.setDepth(100);

        // Make camera follow player
        this.cameras.main.startFollow(this.player.sprite);

        // Initialize Enemies
        this.enemies = [];
        
        // Add CrabBots
        this.enemies.push(new CrabBot(this, 800, 200));
        this.enemies.push(new CrabBot(this, 1900, 200)); // lands on top of the big block (was spawning inside it)
        this.enemies.push(new CrabBot(this, 2600, 180)); // patrols on top of high ground platform
        
        // Add BuzzBots
        this.enemies.push(new BuzzBot(this, 1000, 200));
        this.enemies.push(new BuzzBot(this, 2400, 150));
        this.enemies.push(new BuzzBot(this, 3200, 100));

        // Collisions
        // (skipped while the player is riding a loop - the loop moves the player along its own track)
        this.physics.add.collider(this.player.sprite, this.platforms, null, () => !this.player.track, this);
        this.physics.add.collider(this.droppedRings, this.platforms);

        // Ring collection overlaps
        this.physics.add.overlap(this.player.sprite, this.staticRings, this.collectRing, null, this);
        this.physics.add.overlap(this.player.sprite, this.droppedRings, this.collectRing, null, this);
        
        this.enemies.forEach(enemy => {
            // CrabBots fall on platforms
            if (enemy instanceof CrabBot) {
                this.physics.add.collider(enemy.sprite, this.platforms);
            }
            
            // Player vs Enemy collision
            this.physics.add.overlap(this.player.sprite, enemy.sprite, this.hitEnemy, null, this);
        });
    }

    collectRing(playerSprite, ringSprite) {
        if (!ringSprite.ringObj) return;
        
        if (ringSprite.ringObj.collect()) {
            this.player.rings += 1;
            this.ringText.setText('RINGS: ' + this.player.rings);
        }
    }

    hitEnemy(playerSprite, enemySprite) {
        if (this.player.isDead) return;
        
        // Simple hit logic: jump on head OR rolling (spin dash) -> destroy enemy
        // "On head" = we're falling and our centre is above the enemy's centre. (We can't rely on
        // body.touching here because this is an overlap, not a collider.)
        const stomp = !this.player.track &&
            playerSprite.body.velocity.y > 0 &&
            playerSprite.body.center.y < enemySprite.body.center.y;
        
        if (stomp || this.player.isRolling) {
            // Bounce off enemy slightly if jumping on them, otherwise maintain roll momentum
            if (!this.player.isRolling) {
                playerSprite.setVelocityY(-400);
                this.player.canDoubleJump = true;
            }
            enemySprite.disableBody(true, true); // Destroy enemy
            
            // Play explosion sound via ZzFX (noisy crash)
            if (typeof zzfx !== 'undefined') zzfx(...[,,400,.04,,.2,4,1.4,,.2,,,,,,,.06,.8,.02,.12]);
        } else {
            if (this.player.isInvulnerable) return;

            // Player gets hurt
            if (this.player.rings > 0) {
                // Drop rings
                let ringsToDrop = Math.min(this.player.rings, 20); // Cap visual rings at 20 for performance
                for (let i = 0; i < ringsToDrop; i++) {
                    new Ring(this, playerSprite.x, playerSprite.y, true, this.droppedRings);
                }
                
                this.player.rings = 0;
                this.ringText.setText('RINGS: 0');
                
                // Play ring loss sound (scatter)
                if (typeof zzfx !== 'undefined') zzfx(...[,,400,.05,.1,.3,1,.5,,,-50,.05,,,,,,.4,.05]);
                
                // Bounce back player (away from the enemy) and make invulnerable
                this.player.knockback(playerSprite.x < enemySprite.x ? -200 : 200, -300);
                this.player.makeInvulnerable();
            } else {
                // Die (Sonic style)
                this.player.die();
            }
        }
    }

    update(time, delta) {
        this.player.update(time, delta);
        this.enemies.forEach(enemy => enemy.update(time, delta));
        
        // Kill player if they fall in a pit
        if (!this.gameOver && this.player.sprite.y > 650) {
            this.gameOver = true;
            this.scene.start('GameOverScene');
        }
    }
}
