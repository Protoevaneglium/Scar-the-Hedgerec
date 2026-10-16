class BuzzBot {
    constructor(scene, x, y) {
        this.scene = scene;
        this.sprite = scene.physics.add.sprite(x, y, 'enemy_buzzbot');
        this.sprite.setDisplaySize(64, 64);
        this.sprite.setSize(this.sprite.width, this.sprite.height);
        
        // BuzzBot flies, so no gravity
        this.sprite.body.setAllowGravity(false);
        this.sprite.setCollideWorldBounds(true);
        
        // Custom properties for hover logic
        this.startX = x;
        this.startY = y;
        this.hoverTime = 0;
        this.speed = 100;
        this.direction = -1;
    }

    update(time, delta) {
        if (!this.sprite || !this.sprite.active) return;
        
        this.hoverTime += delta;
        
        // Sine wave vertical movement
        const yOffset = Math.sin(this.hoverTime / 300) * 50;
        this.sprite.y = this.startY + yOffset;
        
        // Linear horizontal movement back and forth
        this.sprite.setVelocityX(this.speed * this.direction);
        
        if (this.sprite.x < this.startX - 300) {
            this.direction = 1;
            this.sprite.setFlipX(true);
        } else if (this.sprite.x > this.startX + 300) {
            this.direction = -1;
            this.sprite.setFlipX(false);
        }
    }
}
