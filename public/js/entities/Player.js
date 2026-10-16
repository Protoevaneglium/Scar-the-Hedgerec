class Player {
    constructor(scene, x, y) {
        this.scene = scene;
        
        // Create the physics sprite
        this.sprite = scene.physics.add.sprite(x, y, 'scar_idle');
        
        // The generated AI images are likely large (e.g. 1024x1024). We need to scale them down for the game.
        // Assuming a 64x64 or similar size is good for the player
        this.sprite.setDisplaySize(64, 64);
        this.sprite.setCollideWorldBounds(true);
        
        // Adjust the physics body size to match the scaled sprite
        this.syncBody();
        
        // Physics properties
        this.sprite.setBounce(0.0); // Sonic doesn't really bounce on landing
        this.sprite.setMaxVelocity(Player.TUNING.MAX_SPEED, 800); // Max speed (spin dash / slopes can exceed normal run speed)
        this.sprite.setDrag(Player.TUNING.GROUND_FRICTION, 0); // Friction
        
        // Controls
        this.cursors = scene.input.keyboard.createCursorKeys();
        this.spacebar = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        
        // State variables
        this.isJumping = false;
        this.canDoubleJump = false;
        this.isDead = false;
        this.isInvulnerable = false;
        this.rings = 0;
        
        // Spin Dash states
        this.isCrouching = false;
        this.isChargingSpin = false;
        this.spinCharge = 0;
        this.isRolling = false;
        
        // Loop State
        // While on a loop the player stops using Arcade physics and instead follows the track
        // with Sonic-style "ground speed" physics: { loop, theta, gsp } (see Loop.js)
        this.track = null;
        this.trackCooldown = 0; // ms before we can be captured by a loop again
        this.controlLock = 0;   // ms during which left/right input is ignored (after falling off a loop)
        this.prevX = x;         // x at the previous frame, used to detect crossing a loop entrance
        
        // Store current texture key to avoid unnecessary texture swapping
        this.currentTexture = 'scar_idle';
    }

    // True while the player is riding a loop
    get isLooping() {
        return this.track !== null;
    }

    // Keep the on-screen size (64x64) and the physics body in sync.
    // The body size is expressed in *unscaled* texture pixels, so every texture with a different
    // source size (e.g. the 48x48 pixel-art idle sprite vs the 1024x1024 others) needs it re-applied,
    // otherwise the hitbox ends up wildly too big or too small.
    syncBody() {
        this.sprite.setDisplaySize(64, 64);
        this.sprite.body.setSize(this.sprite.width, this.sprite.height);
    }

    setTexture(key) {
        if (this.currentTexture !== key) {
            this.sprite.setTexture(key);
            this.currentTexture = key;
            // Re-apply scale when texture changes because setTexture resets dimensions
            this.syncBody();
        }
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this.canDoubleJump = false;
        
        // Drop off a loop if we were on one
        this.leaveTrack(0, 0);
        this.sprite.setAngle(0);
        
        // Disable collisions so he falls through the floor
        this.sprite.body.checkCollision.none = true;
        
        // Pop up like Sonic
        this.sprite.setVelocity(0, -500); // jump up
        this.sprite.setAccelerationX(0);  // stop accelerating sideways
        
        // Play death sound (descending tone)
        if (typeof zzfx !== 'undefined') zzfx(...[,,150,.05,.1,.3,1,1.5,,,-200,.05,,,,,,.4,.05]);

        this.setTexture('scar_death');
    }

    makeInvulnerable() {
        if (this.isInvulnerable) return;
        this.isInvulnerable = true;
        
        // Flash animation
        this.scene.tweens.add({
            targets: this.sprite,
            alpha: 0.2,
            duration: 100,
            yoyo: true,
            repeat: 15,
            onComplete: () => {
                this.sprite.alpha = 1;
                this.isInvulnerable = false;
            }
        });
    }

    // Get knocked back (leaves a loop first if we were on one)
    knockback(vx, vy) {
        this.leaveTrack(vx, vy);
        this.sprite.setVelocity(vx, vy);
        this.canDoubleJump = true;
    }

    // ----- Loop / curved track support -----

    // Called by Loop.tryCapture when we run onto the entrance of a loop
    enterTrack(loop, theta, gsp) {
        this.track = { loop, theta, gsp };
        this.isJumping = false;
        this.isCrouching = false;
        this.isChargingSpin = false;
        this.spinCharge = 0;
        this.sprite.setAccelerationX(0);
        // Arcade physics must not move us while we follow the track
        this.sprite.body.moves = false;
        this.sprite.body.setVelocity(0, 0);
        
        // Swoosh as we hit the ramp
        if (typeof zzfx !== 'undefined') zzfx(...[,,150,.05,.2,.5,1,1.5,,,,,,,,.4,.05]);
    }

    // Hand control back to Arcade physics with the given velocity
    leaveTrack(vx, vy) {
        if (!this.track) return;
        this.track = null;
        this.sprite.body.moves = true;
        this.sprite.body.setVelocity(vx, vy);
        this.trackCooldown = Player.TUNING.TRACK_COOLDOWN;
        this.prevX = this.sprite.x;
    }

    // Put the sprite on the track so its feet touch the surface point and it is rotated to match the slope
    placeOnTrack(s) {
        const half = this.sprite.displayHeight / 2;
        // (ty, -tx) is the surface normal pointing towards the middle of the loop ("up" for the player)
        this.sprite.x = s.x + s.ty * half;
        this.sprite.y = s.y - s.tx * half;
        this.sprite.rotation = s.angle;
    }

    // Sonic-style ground physics on a curve:
    //  - "gsp" is the speed along the surface (positive = in the direction the track is drawn)
    //  - the slope pulls you down it (slope factor * sin(angle)) so you slow going up and speed up going down
    //  - input only pushes weakly, so momentum (not holding right) is what gets you around the loop
    //  - too slow on the wall/ceiling and you fall off with a short control lock
    updateOnTrack(dt) {
        const T = Player.TUNING;
        const trk = this.track;
        const loop = trk.loop;
        const body = this.sprite.body;
        const locked = this.controlLock > 0;

        // Jump off the track, perpendicular to the surface (like Sonic)
        if (Phaser.Input.Keyboard.JustDown(this.spacebar)) {
            const s = loop.sample(trk.theta);
            this.leaveTrack(
                trk.gsp * s.tx + T.JUMP_SPEED * s.ty,
                trk.gsp * s.ty - T.JUMP_SPEED * s.tx
            );
            this.isJumping = true;
            this.canDoubleJump = true;
            this.isRolling = false;
            if (typeof zzfx !== 'undefined') zzfx(...[,,215,.03,,.1,1,.3,,,,,,,,.6,,.5]);
            return;
        }

        // Input: right always means "increase ground speed", left "decrease" (same as the classic games)
        let input = 0;
        if (!locked && !this.isRolling) {
            if (this.cursors.right.isDown) input = 1;
            else if (this.cursors.left.isDown) input = -1;
        }

        if (input !== 0) {
            if (Math.sign(trk.gsp) === -input) {
                trk.gsp += input * T.TRACK_BRAKE * dt; // braking against our motion
            } else if (Math.abs(trk.gsp) < T.RUN_TOP) {
                trk.gsp = Phaser.Math.Clamp(trk.gsp + input * T.TRACK_ACCEL * dt, -T.RUN_TOP, T.RUN_TOP);
            }
        } else {
            // Friction (half as much while rolled into a ball)
            const friction = T.TRACK_FRICTION * (this.isRolling ? 0.5 : 1) * dt;
            if (Math.abs(trk.gsp) <= friction) trk.gsp = 0;
            else trk.gsp -= Math.sign(trk.gsp) * friction;
        }

        // Slope factor: ty is the downward component of the surface direction
        const here = loop.sample(trk.theta);
        trk.gsp += T.SLOPE_FACTOR * here.ty * dt;
        trk.gsp = Phaser.Math.Clamp(trk.gsp, -T.MAX_SPEED, T.MAX_SPEED);

        // Too slow on the wall/ceiling (upper half, tx < 0) -> detach and fall
        if (here.tx < 0 && Math.abs(trk.gsp) < T.FALL_SPEED) {
            this.leaveTrack(trk.gsp * here.tx, trk.gsp * here.ty);
            this.controlLock = T.CONTROL_LOCK_MS;
            this.isRolling = false;
            if (typeof zzfx !== 'undefined') zzfx(...[,,150,.05,.1,.3,1,1.5,,,-200,.05,,,,,,.4,.05]);
            return;
        }

        // Move along the track. Sub-step so a fast player can't skip over parts of the curve
        const dist = trk.gsp * dt;
        const steps = Math.min(16, Math.max(1, Math.ceil(Math.abs(dist) / 4)));
        for (let i = 0; i < steps; i++) {
            const s = loop.sample(trk.theta);
            trk.theta += (dist / steps) / s.speed;
            if (trk.theta >= Math.PI * 2 || trk.theta <= 0) {
                // Reached either end of the loop: back onto the flat floor at full speed
                trk.theta = Phaser.Math.Clamp(trk.theta, 0, Math.PI * 2);
                const end = loop.sample(trk.theta);
                this.placeOnTrack(end);
                this.sprite.setAngle(0);
                this.leaveTrack(trk.gsp, 0);
                return;
            }
        }

        // Position, facing and animation
        const s = loop.sample(trk.theta);
        this.placeOnTrack(s);
        body.velocity.set(trk.gsp * s.tx, trk.gsp * s.ty); // purely informational while moves = false
        if (Math.abs(trk.gsp) > 10) this.sprite.setFlipX(trk.gsp < 0);

        if (this.isRolling) this.setTexture('scar_spindash');
        else this.setTexture(Math.abs(trk.gsp) > 10 ? 'scar_run' : 'scar_idle');
    }

    update(time, delta = 1000 / 60) {
        if (this.isDead) return;

        const T = Player.TUNING;
        const dt = Math.min(delta, 50) / 1000;
        this.controlLock = Math.max(0, this.controlLock - delta);
        this.trackCooldown = Math.max(0, this.trackCooldown - delta);
        
        // If on a loop, physics and rotation are handled by the track physics above
        if (this.track) {
            this.updateOnTrack(dt);
            return;
        }

        // Did we just run across the entrance of a loop?
        const prevX = this.prevX;
        this.prevX = this.sprite.x;
        if (this.trackCooldown <= 0 && this.scene.loops) {
            const grounded = this.sprite.body.blocked.down || this.sprite.body.touching.down;
            if (grounded) {
                for (const loop of this.scene.loops) {
                    if (loop.tryCapture(this, prevX)) return;
                }
            }
        }

        // Ease back to upright after leaving a loop / wall
        if (this.sprite.angle !== 0) {
            const a = Phaser.Math.Angle.WrapDegrees(this.sprite.angle);
            const step = T.UPRIGHT_RATE * dt;
            this.sprite.angle = Math.abs(a) <= step ? 0 : a - Math.sign(a) * step;
        }

        const acceleration = 1200;
        const maxCharge = 800; // Max speed from spin dash
        const locked = this.controlLock > 0;
        const velocityXNow = this.sprite.body.velocity.x;

        // ----- Spin Dash Logic -----
        const touchingGround = this.sprite.body.touching.down;

        // Crouch when holding down on ground
        if (this.cursors.down.isDown && touchingGround && Math.abs(this.sprite.body.velocity.x) < 50 && !this.isRolling) {
            this.isCrouching = true;
            this.sprite.setAccelerationX(0); // Stop moving
            this.sprite.setVelocityX(0);
        } else {
            this.isCrouching = false;
        }

        // Charge Spin Dash
        if (this.isCrouching && Phaser.Input.Keyboard.JustDown(this.spacebar)) {
            this.isChargingSpin = true;
            this.spinCharge += 200;
            if (this.spinCharge > maxCharge) this.spinCharge = maxCharge;
            
            // Charging sound
            if (typeof zzfx !== 'undefined') zzfx(...[,,200 + this.spinCharge/2,.05,.1,.1,1,1.5,,,,,,,,.4,.05]);
        }

        // Release Spin Dash
        if (this.isChargingSpin && !this.cursors.down.isDown) {
            this.isChargingSpin = false;
            this.isRolling = true;
            
            // Apply burst of speed based on facing direction
            const dir = this.sprite.flipX ? -1 : 1;
            this.sprite.setVelocityX(this.spinCharge * dir);
            this.spinCharge = 0;
            
            // Release sound
            if (typeof zzfx !== 'undefined') zzfx(...[,,150,.1,.2,.5,1,1.5,,,,,,,,.4,.05]);
        }

        // ----- Normal Movement (only if not charging spin dash) -----
        if (!this.isChargingSpin) {
            // Horizontal movement
            // Like the classic games, input only accelerates us up to the running top speed. It never
            // slows us down when we're already faster (spin dash, coming off a loop, etc.)
            if (this.cursors.left.isDown && !locked) {
                this.sprite.setAccelerationX(velocityXNow > -T.RUN_TOP ? -acceleration : 0);
                if (!this.isRolling) this.sprite.setFlipX(true); // Face left
            } else if (this.cursors.right.isDown && !locked) {
                this.sprite.setAccelerationX(velocityXNow < T.RUN_TOP ? acceleration : 0);
                if (!this.isRolling) this.sprite.setFlipX(false); // Face right
            } else {
                this.sprite.setAccelerationX(0); // Stop accelerating
            }

            // Jumping & Double Jumping
            if (Phaser.Input.Keyboard.JustDown(this.spacebar) && !this.isCrouching) {
                if (touchingGround) {
                    this.sprite.setVelocityY(-550);
                    this.isJumping = true;
                    this.canDoubleJump = true;
                    this.isRolling = false;
                    
                    // Play ZzFX Jump Sound (classic sweep)
                    if (typeof zzfx !== 'undefined') zzfx(...[,,215,.03,,.1,1,.3,,,,,,,,.6,,.5]); 
                } else if (this.canDoubleJump) {
                    this.sprite.setVelocityY(-520);
                    this.canDoubleJump = false;
                    this.isJumping = true;
                    this.isRolling = false;
                    
                    // Play ZzFX Double Jump Sound (higher sweep chime)
                    if (typeof zzfx !== 'undefined') zzfx(...[,,420,.03,,.12,1,1.8,,,,,,,,.5,,.4]);
                    
                    // Visual feedback
                    this.setTexture('scar_jump');
                }
            }
        }

        // Friction: strong on the ground, weak while rolling (so a spin dash carries you a long way)
        // and very light in the air so momentum (e.g. from a loop) isn't thrown away mid-jump.
        // No friction at all while pushing in the direction we're already moving faster than run speed.
        const pushingWithMotion = (this.cursors.left.isDown && velocityXNow < 0) || (this.cursors.right.isDown && velocityXNow > 0);
        let drag = !touchingGround ? T.AIR_FRICTION : (this.isRolling ? T.ROLL_FRICTION : T.GROUND_FRICTION);
        if (!this.isRolling && pushingWithMotion && !locked && Math.abs(velocityXNow) >= T.RUN_TOP) drag = 0;
        this.sprite.setDragX(drag);
        
        // Stop rolling if we slow down enough
        if (this.isRolling && Math.abs(this.sprite.body.velocity.x) < 50) {
            this.isRolling = false;
        }

        if (touchingGround) {
            this.isJumping = false;
            this.canDoubleJump = true;
        }

        // ----- Animation / State logic based on velocity -----
        const velocityX = Math.abs(this.sprite.body.velocity.x);
        const velocityY = this.sprite.body.velocity.y;

        if (this.isChargingSpin || this.isRolling) {
            this.setTexture('scar_spindash');
        } else if (!touchingGround) {
            if (velocityY < 0) {
                // Going up
                this.setTexture('scar_jump');
            } else {
                // Falling down
                this.setTexture('scar_fall');
            }
        } else {
            // On ground
            if (this.isCrouching) {
                // We don't have a crouch sprite yet, use fall or idle
                this.setTexture('scar_fall');
            } else if (velocityX > 10) {
                this.setTexture('scar_run');
            } else {
                this.setTexture('scar_idle');
            }
        }
    }
}

// Physics tuning (px and px/s). The slope/fall numbers are the classic Sonic physics constants
// (0.125 px/frame^2 slope factor, 2.5 px/frame fall-off speed, 0.046875 px/frame^2 accel/friction)
// converted to px/s at 60fps.
Player.TUNING = Object.freeze({
    RUN_TOP: 480,            // soft cap for running speed (input can't push past this)
    MAX_SPEED: 900,          // hard cap (spin dash, slopes)
    GROUND_FRICTION: 800,    // deceleration with no input on the ground
    ROLL_FRICTION: 300,      // deceleration while rolling
    AIR_FRICTION: 100,       // deceleration with no input in the air
    JUMP_SPEED: 550,         // jump speed (also used to jump off a loop)

    TRACK_ACCEL: 170,        // pushing along a loop (weak, so slopes win)
    TRACK_BRAKE: 1200,       // braking against motion on a loop
    TRACK_FRICTION: 170,     // no-input friction on a loop
    SLOPE_FACTOR: 450,       // gravity along the slope (px/s^2 * sin(angle))
    FALL_SPEED: 120,         // under this speed on the wall/ceiling you detach
    CONTROL_LOCK_MS: 500,    // can't steer for this long after falling off
    TRACK_COOLDOWN: 300,     // ms before a loop can grab us again after leaving it
    MIN_ENTER_SPEED: 60,     // need at least this speed to be picked up by a loop entrance
    UPRIGHT_RATE: 720        // deg/s used to rotate back to upright
});
