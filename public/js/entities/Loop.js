// A loop-de-loop.
//
// The loop is a parametric curve ("the track"). The path the player's FEET follow is:
//
//      x(t) = x0 + R * sin(t) + k * t
//      y(t) = floorY - R * (1 - cos(t))          t = 0 .. 2*PI
//
// i.e. a circle of radius R that starts and ends on the floor, with a small sideways drift (k * t)
// so the exit is `offset` pixels past the entrance, like the classic teardrop shaped loops.
//
// The loop does NOT use collision bodies. When the player runs across the entrance at speed,
// Player.enterTrack() takes over and Player.updateOnTrack() moves the player along `sample(t)`
// with Sonic style ground-speed physics (slope factor, fall-off speed, etc). That is why speed
// matters: gravity along the curve slows you down on the way up, and if you're too slow when you
// reach the top you fall off.
class Loop {
    constructor(scene, x, floorY, radius = 100, offset = 40) {
        this.scene = scene;
        this.x = x;                 // x of the entrance (where the curve touches the floor)
        this.floorY = floorY;       // y of the top of the floor the loop sits on
        this.radius = radius;
        this.offset = offset;       // how far past the entrance the exit is
        this.exitX = x + offset;
        this.k = offset / (Math.PI * 2);

        this.draw();
    }

    // Point on the track (where the player's feet are) plus the unit tangent for increasing t.
    //   x, y   - surface point
    //   tx, ty - unit tangent (direction of travel for increasing t, screen coordinates)
    //   speed  - |d(point)/dt|, used to turn a distance along the curve into a change in t
    //   angle  - tangent angle in radians; this is also the sprite rotation that keeps its feet on the track
    sample(t) {
        const R = this.radius;
        const c = Math.cos(t);
        const s = Math.sin(t);
        const dx = R * c + this.k;
        const dy = -R * s;
        const speed = Math.hypot(dx, dy);
        return {
            x: this.x + R * s + this.k * t,
            y: this.floorY - R * (1 - c),
            tx: dx / speed,
            ty: dy / speed,
            speed,
            angle: Math.atan2(dy, dx)
        };
    }

    // Called every frame for a grounded player. If the player just ran across the entrance (or the
    // exit, going the other way) fast enough, put them on the track. Returns true if captured.
    tryCapture(player, prevX) {
        const sprite = player.sprite;
        const body = sprite.body;

        // Must be running along the floor this loop sits on (not hopping past on a hill)
        if (Math.abs(body.bottom - this.floorY) > 8) return false;

        const vx = body.velocity.x;
        const minSpeed = Player.TUNING.MIN_ENTER_SPEED;

        if (vx > minSpeed && prevX < this.x && sprite.x >= this.x) {
            player.enterTrack(this, 0, vx);
            return true;
        }
        if (vx < -minSpeed && prevX > this.exitX && sprite.x <= this.exitX) {
            player.enterTrack(this, Math.PI * 2, vx);
            return true;
        }
        return false;
    }

    // Points inside the loop where rings can go (n evenly spaced rings around the circle)
    ringSpots(n, inset = 36) {
        const spots = [];
        for (let i = 0; i < n; i++) {
            const t = Math.PI * (0.3 + 1.4 * (i / (n - 1)));
            const s = this.sample(t);
            spots.push({ x: s.x + s.ty * inset, y: s.y - s.tx * inset });
        }
        return spots;
    }

    // Draw the track as a checkered ribbon with a grassy top so it lines up exactly with the physics path
    draw() {
        const width = 28;           // thickness of the ribbon (drawn on the outside of the path)
        const segments = 72;
        const g = this.scene.add.graphics();
        g.setDepth(-1);             // in front of the background, behind the player

        // Offset a sample point away from the middle of the loop by d pixels
        const away = (s, d) => ({ x: s.x - s.ty * d, y: s.y + s.tx * d });

        const quad = (color, a, b, c, d) => {
            g.fillStyle(color, 1);
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.lineTo(b.x, b.y);
            g.lineTo(c.x, c.y);
            g.lineTo(d.x, d.y);
            g.closePath();
            g.fillPath();
        };

        // Dark underside
        g.lineStyle(width + 6, 0x4a2a0c, 1);
        g.beginPath();
        for (let i = 0; i <= segments; i++) {
            const p = away(this.sample((i / segments) * Math.PI * 2), width / 2);
            if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
        }
        g.strokePath();

        // Two lanes of checkers
        for (let i = 0; i < segments; i++) {
            const s0 = this.sample((i / segments) * Math.PI * 2);
            const s1 = this.sample(((i + 1) / segments) * Math.PI * 2);
            for (let lane = 0; lane < 2; lane++) {
                const d0 = (lane * width) / 2 + 3;
                const d1 = ((lane + 1) * width) / 2;
                const color = (i + lane) % 2 === 0 ? 0xd9822b : 0x8a4a14;
                quad(color, away(s0, d0), away(s1, d0), away(s1, d1), away(s0, d1));
            }
        }

        // Grass along the surface the player runs on
        g.lineStyle(5, 0x3fbf2a, 1);
        g.beginPath();
        for (let i = 0; i <= segments; i++) {
            const p = away(this.sample((i / segments) * Math.PI * 2), 2.5);
            if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
        }
        g.strokePath();

        this.graphics = g;
    }
}
