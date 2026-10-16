class CrabBot {
    constructor(scene, x, y) {
        this.scene = scene;
        this.sprite = scene.physics.add.sprite(x, y, 'enemy_crabbot');
        this.sprite.setDisplaySize(64, 64);
        this.sprite.setSize(this.sprite.width, this.sprite.height);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.setBounce(0);
        this.sprite.setMaxVelocity(100, 800);
        
        // Custom properties for patrol logic
        this.startX = x;
        this.patrolDistance = 200;
        this.direction = 1; // 1 for right, -1 for left
        this.speed = 80;
        this.sprite.setFlipX(true); // Sprite faces left originally, so face right to match the starting direction
    }

    turn(direction) {
        this.direction = direction;
        // Assuming sprite faces left originally
        this.sprite.setFlipX(direction > 0);
    }

    update() {
        if (!this.sprite || !this.sprite.active) return;
        
        // Simple patrol logic
        this.sprite.setVelocityX(this.speed * this.direction);
        
        const body = this.sprite.body;
        
        if (this.sprite.x > this.startX + this.patrolDistance) {
            this.turn(-1);
        } else if (this.sprite.x < this.startX - this.patrolDistance) {
            this.turn(1);
        } else if ((this.direction > 0 && body.blocked.right) || (this.direction < 0 && body.blocked.left)) {
            // Walked into a wall / hill
            this.turn(-this.direction);
        } else if (body.blocked.down || body.touching.down) {
            // Turn around at ledges instead of walking off into a pit
            const probeX = body.center.x + this.direction * (body.halfWidth + 4);
            const ground = this.scene.physics.overlapRect(probeX, body.bottom + 2, 2, 6, false, true);
            if (ground.length === 0) this.turn(-this.direction);
        }
    }
}
