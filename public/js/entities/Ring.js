class Ring {
    constructor(scene, x, y, isDropped = false, group = null) {
        this.scene = scene;
        this.sprite = scene.physics.add.sprite(x, y, 'ring');
        this.sprite.ringObj = this;
        
        // Adding a sprite to a physics group resets its body (velocity, bounce, world bounds...) to the
        // group's defaults, so join the group first and only then configure the body below.
        if (group) group.add(this.sprite);
        
        // Scale down the generated ring image if necessary
        this.sprite.setDisplaySize(32, 32);
        this.sprite.setSize(this.sprite.width, this.sprite.height);
        
        this.isDropped = isDropped;
        this.collectible = true;

        if (isDropped) {
            // Dropped rings bounce and scatter
            this.sprite.setBounce(0.8);
            this.sprite.setCollideWorldBounds(true);
            
            // Random velocity outward
            const vx = Phaser.Math.Between(-300, 300);
            const vy = Phaser.Math.Between(-200, -600);
            this.sprite.setVelocity(vx, vy);
            
            // Cannot collect for first 0.5s
            this.collectible = false;
            this.collectTimer = scene.time.delayedCall(500, () => {
                this.collectible = true;
            });

            // Disappear after 4 seconds (flash before disappearing)
            this.expireTimer = scene.time.delayedCall(3000, () => {
                this.flashTween = scene.tweens.add({
                    targets: this.sprite,
                    alpha: 0,
                    duration: 100,
                    yoyo: true,
                    repeat: 5,
                    onComplete: () => {
                        this.destroy();
                    }
                });
            });
        } else {
            // Static rings stay in place and don't fall
            this.sprite.body.allowGravity = false;
            this.sprite.setImmovable(true);
            
            // Simple hover animation for static rings
            this.hoverTween = scene.tweens.add({
                targets: this.sprite,
                y: y - 5,
                duration: 1000,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    collect() {
        if (!this.collectible) return false;
        
        // Play ring collect sound
        if (typeof zzfx !== 'undefined') zzfx(...[,,400,.01,.01,.05,1,1.5,,,-50,.05,,,,,,.5,.05]);
        
        this.destroy();
        return true;
    }

    destroy() {
        // Stop anything still running against this ring so it doesn't keep updating a dead sprite
        if (this.hoverTween) this.hoverTween.stop();
        if (this.flashTween) this.flashTween.stop();
        if (this.collectTimer) this.collectTimer.remove(false);
        if (this.expireTimer) this.expireTimer.remove(false);
        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = null;
        }
    }
}
