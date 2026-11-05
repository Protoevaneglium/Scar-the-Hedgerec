/* Canvas UI built from the supplied Sonic Unleashed / Sonic Colors HUD atlases. */
(function (root) {
    'use strict';
    const BLUE = '#087bdc', CYAN = '#58ddff', GOLD = '#ffdb42', NAVY = '#071b39';
    const FACE = 'Arial, Helvetica, sans-serif';
    const DIGITS = [[1,26],[34,17],[59,25],[88,25],[116,27],[145,26],[174,26],[203,25],[232,25],[260,26]];
    const PRAISE = {
        amazing: [80,6,241,56], outstanding: [75,79,250,48], awesome: [104,149,192,44],
        great: [143,214,113,42], good: [152,281,96,40]
    };
    const clamp = n => Math.max(0, Math.min(1, n));

    class ScarUI {
        constructor(game) {
            this.game = game;
            this.images = {};
            const paths = {
                digits: 'unleashed/mat_comon_num_001.PNG', labels: 'unleashed/mat_playscreen_en_001.PNG',
                icons: 'colors/HUD Icons/1.png', praise: 'colors/ui-text.png'
            };
            for (const [key, path] of Object.entries(paths)) {
                const img = new Image();
                this.images[key] = img;
                img.src = 'assets/ui/' + path;
            }
        }

        sprite(ctx, key, crop, x, y, w, h) {
            const img = this.images[key];
            if (!img || !img.complete || !img.naturalWidth) return false;
            ctx.drawImage(img, ...crop, x, y, w, h);
            return true;
        }

        plate(ctx, x, y, w, h, color = NAVY, cut = 9) {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y);
            ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
        }

        text(ctx, text, x, y, size = 16, color = '#fff', align = 'left', maxWidth) {
            ctx.font = `italic 900 ${size}px ${FACE}`;
            ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(2, size / 7); ctx.strokeStyle = '#031329';
            if (maxWidth) ctx.strokeText(text, x + 1, y + 2, maxWidth);
            else ctx.strokeText(text, x + 1, y + 2);
            ctx.fillStyle = color;
            if (maxWidth) ctx.fillText(text, x, y, maxWidth);
            else ctx.fillText(text, x, y);
        }

        number(ctx, value, x, y, height = 28, align = 'left') {
            const str = String(value), scale = height / 28;
            const advance = c => /\d/.test(c) ? 27 * scale : 12 * scale;
            const width = [...str].reduce((sum, c) => sum + advance(c), 0);
            let dx = x - (align === 'right' ? width : 0);
            for (const c of str) {
                if (/\d/.test(c)) {
                    const [sx, sw] = DIGITS[Number(c)];
                    if (!this.sprite(ctx, 'digits', [sx,0,sw,28], dx, y, sw * scale, height)) {
                        this.text(ctx, c, dx, y + height - 2, height);
                    }
                } else {
                    this.text(ctx, c, dx, y + height - 3, height * .85);
                }
                dx += advance(c);
            }
            return width;
        }

        label(ctx, name, x, y) {
            const crops = { TIME: [1,60,42,10], SCORE: [1,73,59,9], RINGS: [1,49,54,9] };
            this.plate(ctx, x, y, 71, 19, BLUE, 5);
            const crop = crops[name];
            if (!this.sprite(ctx, 'labels', crop, x + 10, y + 4, crop[2] * .8, crop[3] * 1.1)) {
                this.text(ctx, name, x + 10, y + 14, 11);
            }
        }

        drawHUD(ctx) {
            const g = this.game, p = g.player, t = g.terrain, meta = g.getStageMeta();
            const time = Math.max(0, g.stageTime || 0);
            const mins = String(Math.floor(time / 60)).padStart(2, '0');
            const secs = String(Math.floor(time % 60)).padStart(2, '0');
            const cs = String(Math.floor(time * 100) % 100).padStart(2, '0');
            ctx.save(); ctx.imageSmoothingEnabled = true;
            // A subtle shadow keeps the open counters readable against every sky era.
            const shade = ctx.createLinearGradient(0, 0, 0, 180);
            shade.addColorStop(0, 'rgba(3,12,31,.60)'); shade.addColorStop(1, 'rgba(3,12,31,0)');
            ctx.fillStyle = shade; ctx.fillRect(0, 0, 330, 180);
            this.label(ctx, 'TIME', 27, 28);
            this.number(ctx, `${mins}:${secs}.${cs}`, 109, 20, 31);
            this.label(ctx, 'SCORE', 27, 64);
            this.number(ctx, String(Math.max(0, p.score || 0)).padStart(6, '0'), 109, 62, 24);

            this.plate(ctx, 26, 99, 126, 44, 'rgba(4,23,51,.8)', 8);
            if (!this.sprite(ctx, 'icons', [6,68,19,23], 35, 105, 25, 30)) {
                ctx.strokeStyle = GOLD; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(47,120,9,12,0,0,Math.PI*2); ctx.stroke();
            }
            this.number(ctx, String(Math.max(0, p.rings || 0)).padStart(3, '0'), 68, 103, 29);
            if (!p.rings && Math.floor(performance.now() / 350) % 2 === 0) {
                ctx.fillStyle = '#ff6678'; ctx.fillRect(34, 139, 107, 3);
            } else { ctx.fillStyle = GOLD; ctx.fillRect(34,139,107,3); }

            this.plate(ctx, 164, 104, 101, 37, 'rgba(4,23,51,.8)', 7);
            ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(186,122,17,0,Math.PI*2); ctx.fill();
            g.drawScarMiniIcon(ctx, 171, 108, 29, 27, true);
            this.text(ctx, '×', 204, 128, 17, CYAN);
            this.number(ctx, String(Math.max(0, p.lives === undefined ? 3 : p.lives)).padStart(2, '0'), 223, 112, 21);

            const sx = g.W - 313;
            this.plate(ctx, sx, 24, 286, 43, 'rgba(4,23,51,.84)', 10);
            this.plate(ctx, sx, 24, 7, 43, BLUE, 2);
            this.text(ctx, meta.zoneName, sx + 20, 50, 20, '#fff', 'left', 207);
            this.plate(ctx, sx + 229, 24, 57, 43, GOLD, 5);
            this.text(ctx, 'ACT', sx + 257, 37, 9, NAVY, 'center');
            this.text(ctx, String(meta.act), sx + 255, 60, 26, NAVY, 'center');
            const era = String(t.timeEra || 'good_future').replace(/_/g, ' ').toUpperCase();
            this.text(ctx, `ZONE ${String(meta.zone).padStart(2, '0')}  /  ${era}`, g.W - 34, 84, 10, CYAN, 'right');

            const badges = [];
            if (p.shoesTimer > 0) badges.push([`SPEED UP  ${Math.ceil(p.shoesTimer / 60)}s`, '#ff7dac']);
            if (p.invincTimer > 0) badges.push([`INVINCIBLE  ${Math.ceil(p.invincTimer / 60)}s`, GOLD]);
            if (p.shield) badges.push(['SHIELD', CYAN]);
            if (p.dropDashReady) badges.push(['DROP DASH READY', CYAN]);
            else if (p.state === 'PEELOUT') badges.push(['PEEL-OUT', GOLD]);
            else if (p.onCoasterRail) badges.push(['RAIL SURGE', GOLD]);
            let by = 158;
            for (const [label, color] of badges) {
                this.plate(ctx, 27, by - 13, 156, 22, 'rgba(4,23,51,.85)', 6);
                this.text(ctx, label, 38, by + 2, 11, color); by += 25;
            }
            if (t.timeWarpTarget) {
                const charge = clamp((t.timeWarpCharge || 0) / 90);
                this.plate(ctx, 350, 27, 260, 38, NAVY);
                this.text(ctx, `TIME WARP → ${t.timeWarpTarget.toUpperCase()}`, 480, 43, 12, CYAN, 'center');
                ctx.fillStyle = '#173c62'; ctx.fillRect(370,51,220,5);
                ctx.fillStyle = CYAN; ctx.fillRect(370,51,220 * charge,5);
            }
            ctx.restore();
        }

        drawRadar(ctx) {
            const g = this.game;
            if (!g.mapImgLoaded) return;
            const x = g.W - 224, y = g.H - 68;
            ctx.save();
            this.plate(ctx, x - 9, y - 14, 209, 48, 'rgba(4,23,51,.84)', 7);
            this.text(ctx, 'STAGE ROUTE', x, y - 2, 9, CYAN);
            ctx.globalAlpha = .8; ctx.drawImage(g.mapImg, x, y + 5, 186, 20); ctx.globalAlpha = 1;
            const px = x + clamp(g.player.x / g.terrain.endX) * 186;
            ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(px,y+15,4,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.restore();
        }

        drawHints(ctx) {
            const g = this.game;
            if (g.actClear || g.player.gameOver || (root.matchMedia && root.matchMedia('(pointer: coarse)').matches)) return;
            const items = [['← →', 'MOVE'], ['SPACE', 'JUMP'], ['↓ + JUMP', 'SPIN DASH'],
                [g.terrain.levelDef && g.terrain.levelDef.wallJump ? 'WALL + JUMP' : '↑ + JUMP',
                    g.terrain.levelDef && g.terrain.levelDef.wallJump ? 'WALL KICK' : 'PEEL-OUT']];
            ctx.save();
            this.plate(ctx, 204, g.H - 27, 552, 23, 'rgba(4,18,41,.82)', 6);
            let x = 218;
            for (const [key, action] of items) {
                this.text(ctx, key, x, g.H - 12, 9, CYAN);
                const keyWidth = ctx.measureText(key).width;
                ctx.font = `700 8px ${FACE}`;
                ctx.fillStyle = '#d5e9ff'; ctx.fillText(action, x + keyWidth + 10, g.H - 12);
                x += keyWidth + ctx.measureText(action).width + 28;
            }
            ctx.restore();
        }

        drawTitle(ctx) {
            const g = this.game, tc = g.titleCard;
            if (!tc) return;
            const elapsed = tc.max - tc.timer;
            const prog = elapsed < 22 ? 1 - Math.pow(1 - clamp(elapsed / 22),3)
                : tc.timer < 26 ? Math.pow(clamp(tc.timer / 26),3) : 1;
            const off = (1 - prog) * 1000;
            ctx.save(); ctx.translate(off, 0);
            this.plate(ctx, 146, 188, 665, 134, 'rgba(3,19,47,.96)', 29);
            this.plate(ctx, 140, 178, 670, 10, CYAN, 7);
            this.plate(ctx, 146, 312, 665, 7, GOLD, 5);
            this.plate(ctx, 681, 188, 130, 124, BLUE, 23);
            this.text(ctx, tc.isBossAct ? `ZONE ${tc.zone}  /  BOSS ENCOUNTER` : `ZONE ${tc.zone}  /  LET'S GO!`, 185, 222, 13, CYAN);
            this.text(ctx, tc.zoneName, 180, 271, 42, '#fff', 'left', 475);
            this.text(ctx, 'SCAR THE HEDGEREC', 184, 297, 10, '#a8c8ed');
            this.text(ctx, 'ACT', 749, 223, 15, '#fff', 'center');
            this.text(ctx, String(tc.act), 741, 289, 67, GOLD, 'center');
            ctx.restore();
        }

        drawResults(ctx) {
            const g = this.game, ac = g.actClear;
            if (!ac) return;
            const prog = ac.phase === 'intro' ? 1 - Math.pow(1 - clamp(1 - ac.timer / 42), 3) : 1;
            ctx.save();
            ctx.fillStyle = `rgba(2,10,26,${.62 * prog})`; ctx.fillRect(0,0,g.W,g.H);
            ctx.translate((1 - prog) * 1000, 0);
            this.plate(ctx, 167, 101, 626, 345, 'rgba(5,23,52,.97)', 23);
            this.plate(ctx, 167, 101, 626, 9, CYAN, 6);
            this.plate(ctx, 167, 110, 626, 60, BLUE, 14);
            this.text(ctx, ac.meta.isBossAct ? 'ZONE CLEAR!' : 'ACT CLEAR!', 204, 152, 35);
            this.text(ctx, `ACT ${ac.meta.act}`, 750, 147, 19, GOLD, 'right');
            this.text(ctx, ac.meta.zoneName, 206, 193, 17, CYAN, 'left', 540);
            const completed = ac.phase !== 'intro' && ac.phase !== 'tally';
            const praise = g.stageTime < 60 ? 'amazing' : g.stageTime < 120 ? 'outstanding' : g.stageTime < 180 ? 'awesome' : 'great';
            // Praise is a completion flourish, not a new score/rank system.
            if (completed) {
                const crop = PRAISE[praise], width = crop[2] * .7, height = crop[3] * .7;
                if (!this.sprite(ctx, 'praise', crop, 480 - width / 2, 204, width, height)) {
                    this.text(ctx, praise.toUpperCase() + '!', 480, 235, 28, GOLD, 'center');
                }
            } else this.text(ctx, 'SCAR GOT THROUGH!', 480, 232, 23, GOLD, 'center');
            const row = (label, value, y, color, total) => {
                this.plate(ctx, 200, y - 26, 558, total ? 43 : 35, total ? '#124b87' : '#0d2b50', 6);
                ctx.fillStyle = color; ctx.fillRect(207,y-20,4,total ? 31 : 23);
                this.text(ctx, label, 225, y - 2, total ? 18 : 15, color);
                this.number(ctx, String(Math.max(0,value)).padStart(6,'0'), 738, y - 23, total ? 29 : 23, 'right');
            };
            row('TIME BONUS', ac.timeBonus, 285, CYAN);
            row('RING BONUS', ac.ringBonus, 326, GOLD);
            row('TOTAL SCORE', g.player.score || 0, 374, '#fff', true);
            const hint = !completed ? 'JUMP  /  FAST-FORWARD TALLY' : ac.nextStage
                ? 'NEXT ACT  /  GET READY!' : 'ZONE COMPLETE  /  JUMP TO CONTINUE  ·  R TO REPLAY';
            this.text(ctx, hint, 480, 419, 11, completed ? GOLD : '#b6cfea', 'center');
            ctx.restore();
        }

        drawGameOver(ctx, continueDelay = 130) {
            const g = this.game, p = g.player;
            if (!p.gameOver) return;
            const ease = 1 - Math.pow(1 - clamp((g.gameOverTimer || 0) / 34),3);
            ctx.save();
            ctx.fillStyle = `rgba(3,9,23,${.97 * ease})`; ctx.fillRect(0,0,g.W,g.H);
            ctx.globalAlpha = ease;
            this.plate(ctx, 179, 81, 602, 99, '#092952', 20);
            this.plate(ctx, 179, 174, 602, 6, '#ff547a', 5);
            this.text(ctx, p.gameOverReason === 'TIME OVER' ? 'TIME OVER' : 'GAME OVER', 480, 151, 63, '#fff', 'center');
            this.text(ctx, 'TAKE A BREATHER. THEN GO AGAIN.', 480, 210, 13, CYAN, 'center');
            g.drawFaintingScar(ctx, g.gameOverTimer || 0, ease);
            if (g.gameOverTimer > continueDelay) {
                this.plate(ctx, 325, g.H - 54, 310, 30, BLUE);
                this.text(ctx, 'JUMP  /  CONTINUE     R  /  RESTART', 480, g.H - 34, 12, '#fff', 'center');
            }
            ctx.restore();
        }
    }
    root.ScarUI = ScarUI;
})(typeof window !== 'undefined' ? window : globalThis);
