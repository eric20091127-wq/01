/**
 * Soul Dodge — 滑鼠控制靈魂閃躲彈幕
 * 靈感參考 Bad Time Simulator
 */
(function () {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const gameoverOverlay = document.getElementById("gameover-overlay");
  const btnStart = document.getElementById("btn-start");
  const btnRestart = document.getElementById("btn-restart");
  const hpFill = document.getElementById("hp-fill");
  const hpText = document.getElementById("hp-text");
  const hpBar = document.getElementById("hp-bar");
  const timerEl = document.getElementById("timer");
  const waveEl = document.getElementById("wave");
  const dialogueName = document.getElementById("dialogue-name");
  const dialogueText = document.getElementById("dialogue-text");
  const finalStats = document.getElementById("final-stats");

  const MAX_HP = 20;
  const PLAYER_RADIUS = 8;
  const INVINCIBLE_MS = 1200;

  let gameState = "idle"; // idle | playing | gameover
  let hp = MAX_HP;
  let elapsed = 0;
  let wave = 0;
  let invincibleUntil = 0;
  let lastTime = 0;
  let mouseInBox = false;

  const player = { x: 0, y: 0 };
  const bullets = [];
  const bones = [];
  const blasters = [];
  let activePattern = null;
  let patternTimer = 0;
  let patternIndex = 0;
  let spawnAcc = 0;

  const WAVE_DIALOGUES = [
    { name: "???", text: "讓我看看你的反應速度。" },
    { name: "???", text: "骨頭從四面八方來了。" },
    { name: "???", text: "藍色彈幕，別被碰到。" },
    { name: "???", text: "螺旋攻擊，保持冷靜。" },
    { name: "???", text: "雷射警告！快躲開！" },
    { name: "???", text: "還撐得住嗎？" },
    { name: "???", text: "越來越熱鬧了呢。" },
    { name: "???", text: "這就是極限了嗎？" },
  ];

  const PATTERNS = [
    { id: "boneGap", duration: 5000, setup: setupBoneGap },
    { id: "boneSweep", duration: 5500, setup: setupBoneSweep },
    { id: "bulletRain", duration: 6000, setup: setupBulletRain },
    { id: "spiral", duration: 5500, setup: setupSpiral },
    { id: "blaster", duration: 4500, setup: setupBlaster },
    { id: "boneRing", duration: 5000, setup: setupBoneRing },
    { id: "crossfire", duration: 5500, setup: setupCrossfire },
    { id: "chaos", duration: 7000, setup: setupChaos },
  ];

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function boxSize() {
    const rect = canvas.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }

  function clampPlayer() {
    const { w, h } = boxSize();
    const pad = PLAYER_RADIUS + 2;
    player.x = Math.max(pad, Math.min(w - pad, player.x));
    player.y = Math.max(pad, Math.min(h - pad, player.y));
  }

  function resetPlayer() {
    const { w, h } = boxSize();
    player.x = w / 2;
    player.y = h / 2;
  }

  function setDialogue(name, text) {
    dialogueName.textContent = name;
    dialogueText.textContent = text;
  }

  function updateHP() {
    const pct = (hp / MAX_HP) * 100;
    hpFill.style.width = pct + "%";
    hpText.textContent = hp + " / " + MAX_HP;
    hpBar.setAttribute("aria-valuenow", String(hp));
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ":" + String(sec).padStart(2, "0");
  }

  function clearEntities() {
    bullets.length = 0;
    bones.length = 0;
    blasters.length = 0;
    activePattern = null;
    patternTimer = 0;
    spawnAcc = 0;
  }

  function startGame() {
    gameState = "playing";
    hp = MAX_HP;
    elapsed = 0;
    wave = 0;
    invincibleUntil = 0;
    lastTime = performance.now();
    clearEntities();
    resetPlayer();
    updateHP();
    overlay.classList.add("overlay--hidden");
    gameoverOverlay.classList.add("overlay--hidden");
    document.body.classList.add("playing");
    waveEl.textContent = "0";
    setDialogue("???", "戰鬥開始！移動滑鼠閃躲。");
    nextWave();
    requestAnimationFrame(loop);
  }

  function endGame() {
    gameState = "gameover";
    document.body.classList.remove("playing");
    finalStats.innerHTML =
      "存活時間：<strong>" +
      formatTime(elapsed) +
      "</strong><br>通過波次：<strong>" +
      wave +
      "</strong>";
    gameoverOverlay.classList.remove("overlay--hidden");
  }

  function nextWave() {
    wave++;
    waveEl.textContent = String(wave);
    const dlg = WAVE_DIALOGUES[(wave - 1) % WAVE_DIALOGUES.length];
    setDialogue(dlg.name, dlg.text);

    const pattern = PATTERNS[(wave - 1) % PATTERNS.length];
    activePattern = pattern;
    patternTimer = 0;
    patternIndex = 0;
    spawnAcc = 0;
    bullets.length = 0;
    bones.length = 0;
    blasters.length = 0;
    pattern.setup();
  }

  /* ── 彈幕模式 ── */

  function setupBoneGap() {
    const { w, h } = boxSize();
    const gapY = h * (0.3 + Math.random() * 0.4);
    const gapH = 70 + Math.random() * 40;
    const boneW = 18;
    bones.push({
      x: 0,
      y: 0,
      w: w,
      h: gapY - gapH / 2,
      vx: 0,
      vy: 0,
      type: "bone",
    });
    bones.push({
      x: 0,
      y: gapY + gapH / 2,
      w: w,
      h: h - (gapY + gapH / 2),
      vx: 0,
      vy: 0,
      type: "bone",
    });
    // 移動的骨頭牆
    for (let i = 0; i < 6; i++) {
      bones.push({
        x: -boneW,
        y: gapY - gapH / 2 - 30,
        w: boneW,
        h: 30,
        vx: 2.5 + wave * 0.15,
        vy: 0,
        type: "bone",
        row: i,
      });
      bones.push({
        x: -boneW,
        y: gapY + gapH / 2,
        w: boneW,
        h: 30,
        vx: 2.5 + wave * 0.15,
        vy: 0,
        type: "bone",
        row: i,
      });
    }
  }

  function setupBoneSweep() {
    const { w, h } = boxSize();
    const fromTop = Math.random() > 0.5;
    for (let i = 0; i < 8; i++) {
      const gap = 55 + Math.random() * 25;
      const startX = i * (w / 8);
      bones.push({
        x: startX,
        y: fromTop ? -60 - i * 20 : h + 10 + i * 20,
        w: w / 8 - 8,
        h: 50,
        vx: 0,
        vy: fromTop ? 2.8 + wave * 0.1 : -(2.8 + wave * 0.1),
        type: "bone",
      });
    }
  }

  function setupBulletRain() {
    spawnAcc = 0;
  }

  function setupSpiral() {
    const { w, h } = boxSize();
    activePattern._cx = w / 2;
    activePattern._cy = h / 2;
    activePattern._angle = 0;
  }

  function setupBlaster() {
    const { w, h } = boxSize();
    const horizontal = Math.random() > 0.5;
    const pos = horizontal ? Math.random() * (h - 80) + 40 : Math.random() * (w - 80) + 40;
    blasters.push({
      horizontal,
      pos,
      warnTime: 900,
      fireTime: 400,
      fired: false,
      elapsed: 0,
      width: horizontal ? w : 28,
      height: horizontal ? 28 : h,
    });
    if (wave > 3) {
      blasters.push({
        horizontal: !horizontal,
        pos: horizontal ? Math.random() * (w - 80) + 40 : Math.random() * (h - 80) + 40,
        warnTime: 1100,
        fireTime: 400,
        fired: false,
        elapsed: 0,
        width: !horizontal ? w : 28,
        height: !horizontal ? 28 : h,
      });
    }
  }

  function setupBoneRing() {
    const { w, h } = boxSize();
    activePattern._cx = w / 2;
    activePattern._cy = h / 2;
    activePattern._ringAngle = 0;
    activePattern._bones = [];
    const count = 12 + wave;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      activePattern._bones.push({ angle: a, dist: 120 });
    }
  }

  function setupCrossfire() {
    spawnAcc = 0;
    activePattern._phase = 0;
  }

  function setupChaos() {
    setupBoneGap();
    setupSpiral();
    spawnAcc = 0;
  }

  /* ── 模式更新 ── */

  function updatePattern(dt) {
    if (!activePattern) return;
    patternTimer += dt;
    const { w, h } = boxSize();

    switch (activePattern.id) {
      case "boneGap":
        bones.forEach((b) => {
          if (b.row !== undefined) {
            b.x += b.vx;
            if (b.x > w + 30) b.x = -30;
          }
        });
        break;

      case "boneSweep":
        for (let i = bones.length - 1; i >= 0; i--) {
          const b = bones[i];
          if (b.y <= -80 || b.y >= h + 80) bones.splice(i, 1);
        }
        if (patternTimer % 800 < dt) {
          const fromLeft = Math.random() > 0.5;
          bones.push({
            x: fromLeft ? -40 : w + 10,
            y: Math.random() * (h - 60),
            w: 35,
            h: 14,
            vx: fromLeft ? 3.5 + wave * 0.1 : -(3.5 + wave * 0.1),
            vy: 0,
            type: "bone",
          });
        }
        break;

      case "bulletRain":
        spawnAcc += dt;
        const interval = Math.max(120, 280 - wave * 12);
        while (spawnAcc >= interval) {
          spawnAcc -= interval;
          bullets.push({
            x: Math.random() * w,
            y: -8,
            r: 5,
            vx: (Math.random() - 0.5) * 0.8,
            vy: 2.5 + Math.random() * 1.5 + wave * 0.08,
            type: "bullet",
          });
        }
        break;

      case "spiral":
        activePattern._angle += 0.04 + wave * 0.002;
        if (patternTimer % 100 < dt) {
          const a = activePattern._angle;
          const speed = 2.2 + wave * 0.1;
          bullets.push({
            x: activePattern._cx,
            y: activePattern._cy,
            r: 5,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            type: "bullet",
          });
        }
        break;

      case "blaster":
        blasters.forEach((b) => {
          b.elapsed += dt;
          if (!b.fired && b.elapsed >= b.warnTime) {
            b.fired = true;
            b.fireElapsed = 0;
          }
          if (b.fired) {
            b.fireElapsed = (b.fireElapsed || 0) + dt;
          }
        });
        for (let i = blasters.length - 1; i >= 0; i--) {
          const b = blasters[i];
          if (b.fired && b.fireElapsed >= b.fireTime + 200) blasters.splice(i, 1);
        }
        if (blasters.length === 0 && patternTimer > 1200) {
          setupBlaster();
          patternTimer = 0;
        }
        break;

      case "boneRing":
        activePattern._ringAngle += 0.025;
        activePattern._bones.forEach((b) => {
          b.dist -= 0.6 + wave * 0.03;
          if (b.dist < 30) b.dist = 120;
        });
        break;

      case "crossfire":
        spawnAcc += dt;
        activePattern._phase += dt * 0.002;
        const rate = Math.max(150, 350 - wave * 15);
        while (spawnAcc >= rate) {
          spawnAcc -= rate;
          const side = Math.floor(Math.random() * 4);
          let bx, by, bvx, bvy;
          if (side === 0) {
            bx = -8; by = Math.random() * h; bvx = 3.5; bvy = 0;
          } else if (side === 1) {
            bx = w + 8; by = Math.random() * h; bvx = -3.5; bvy = 0;
          } else if (side === 2) {
            bx = Math.random() * w; by = -8; bvx = 0; bvy = 3.5;
          } else {
            bx = Math.random() * w; by = h + 8; bvx = 0; bvy = -3.5;
          }
          bullets.push({ x: bx, y: by, r: 5, vx: bvx + wave * 0.05, vy: bvy + wave * 0.05, type: "bullet" });
        }
        break;

      case "chaos":
        spawnAcc += dt;
        if (spawnAcc > 200) {
          spawnAcc = 0;
          bullets.push({
            x: Math.random() * w,
            y: -8,
            r: 4,
            vx: (Math.random() - 0.5) * 1.5,
            vy: 2 + Math.random() * 2,
            type: "bullet",
          });
        }
        activePattern._angle = (activePattern._angle || 0) + 0.03;
        if (patternTimer % 80 < dt) {
          const a = activePattern._angle;
          bullets.push({
            x: w / 2,
            y: h / 2,
            r: 4,
            vx: Math.cos(a) * 2.5,
            vy: Math.sin(a) * 2.5,
            type: "bullet",
          });
        }
        bones.forEach((b) => {
          if (b.vx) b.x += b.vx;
        });
        break;
    }

    if (patternTimer >= activePattern.duration) {
      nextWave();
    }
  }

  /* ── 實體更新 ── */

  function updateBullets(dt) {
    const { w, h } = boxSize();
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < -20 || b.x > w + 20 || b.y < -20 || b.y > h + 20) {
        bullets.splice(i, 1);
      }
    }
  }

  function updateBones(dt) {
    const { w, h } = boxSize();
    for (let i = bones.length - 1; i >= 0; i--) {
      const b = bones[i];
      b.x += b.vx || 0;
      b.y += b.vy || 0;
      if (b.vx && (b.x < -60 || b.x > w + 60)) bones.splice(i, 1);
      if (b.vy && (b.y < -80 || b.y > h + 80)) bones.splice(i, 1);
    }
  }

  /* ── 碰撞 ── */

  function circleRect(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < cr * cr;
  }

  function checkCollisions(now) {
    if (now < invincibleUntil) return;

    for (const b of bullets) {
      const dx = player.x - b.x;
      const dy = player.y - b.y;
      if (dx * dx + dy * dy < (PLAYER_RADIUS + b.r) * (PLAYER_RADIUS + b.r)) {
        takeDamage(now);
        return;
      }
    }

    for (const bone of bones) {
      if (circleRect(player.x, player.y, PLAYER_RADIUS, bone.x, bone.y, bone.w, bone.h)) {
        takeDamage(now);
        return;
      }
    }

    if (activePattern && activePattern.id === "boneRing" && activePattern._bones) {
      const cx = activePattern._cx;
      const cy = activePattern._cy;
      for (const b of activePattern._bones) {
        const bx = cx + Math.cos(b.angle + activePattern._ringAngle) * b.dist;
        const by = cy + Math.sin(b.angle + activePattern._ringAngle) * b.dist;
        const dx = player.x - bx;
        const dy = player.y - by;
        if (dx * dx + dy * dy < (PLAYER_RADIUS + 8) * (PLAYER_RADIUS + 8)) {
          takeDamage(now);
          return;
        }
      }
    }

    for (const bl of blasters) {
      if (!bl.fired) continue;
      let rx, ry, rw, rh;
      if (bl.horizontal) {
        rx = 0;
        ry = bl.pos - 14;
        rw = boxSize().w;
        rh = 28;
      } else {
        rx = bl.pos - 14;
        ry = 0;
        rw = 28;
        rh = boxSize().h;
      }
      if (circleRect(player.x, player.y, PLAYER_RADIUS, rx, ry, rw, rh)) {
        takeDamage(now);
        return;
      }
    }
  }

  function takeDamage(now) {
    hp--;
    updateHP();
    invincibleUntil = now + INVINCIBLE_MS;
    if (hp <= 0) {
      hp = 0;
      updateHP();
      endGame();
    }
  }

  /* ── 繪製 ── */

  function drawHeart(x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const s = size;
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s, y, x - s, y + s * 0.3);
    ctx.bezierCurveTo(x - s, y + s * 0.7, x, y + s * 0.9, x, y + s);
    ctx.bezierCurveTo(x, y + s * 0.9, x + s, y + s * 0.7, x + s, y + s * 0.3);
    ctx.bezierCurveTo(x + s, y, x, y, x, y + s * 0.3);
    ctx.fill();
    ctx.restore();
  }

  function drawBone(x, y, w, h) {
    ctx.fillStyle = "#f0f0f0";
    const r = Math.min(6, h / 2, w / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    // 骨頭圓頭
    ctx.beginPath();
    ctx.arc(x + w / 2, y, r, 0, Math.PI * 2);
    ctx.arc(x + w / 2, y + h, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    const { w, h } = boxSize();
    ctx.clearRect(0, 0, w, h);

    // 骨頭
    bones.forEach((b) => drawBone(b.x, b.y, b.w, b.h));

    // 環形骨頭
    if (activePattern && activePattern.id === "boneRing" && activePattern._bones) {
      const cx = activePattern._cx;
      const cy = activePattern._cy;
      activePattern._bones.forEach((b) => {
        const bx = cx + Math.cos(b.angle + activePattern._ringAngle) * b.dist - 6;
        const by = cy + Math.sin(b.angle + activePattern._ringAngle) * b.dist - 18;
        drawBone(bx, by, 12, 36);
      });
    }

    // 雷射
    blasters.forEach((bl) => {
      if (!bl.fired) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 80) * 0.3;
        ctx.fillStyle = "#ff8800";
        if (bl.horizontal) {
          ctx.fillRect(0, bl.pos - 2, w, 4);
        } else {
          ctx.fillRect(bl.pos - 2, 0, 4, h);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = "#ffffff";
        if (bl.horizontal) {
          ctx.fillRect(0, bl.pos - 14, w, 28);
        } else {
          ctx.fillRect(bl.pos - 14, 0, 28, h);
        }
      }
    });

    // 彈幕
    bullets.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = "#44aaff";
      ctx.fill();
      ctx.strokeStyle = "#88ccff";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 玩家靈魂
    const now = performance.now();
    const invincible = now < invincibleUntil;
    if (!invincible || Math.floor(now / 80) % 2 === 0) {
      drawHeart(player.x, player.y - 6, 10, "#ff0044");
    }
  }

  /* ── 主迴圈 ── */

  function loop(now) {
    if (gameState !== "playing") return;
    const dt = Math.min(now - lastTime, 50);
    lastTime = now;
    elapsed += dt;
    timerEl.textContent = formatTime(elapsed);

    updatePattern(dt);
    updateBullets(dt);
    updateBones(dt);
    checkCollisions(now);
    draw();

    requestAnimationFrame(loop);
  }

  /* ── 滑鼠事件 ── */

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseInBox = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;

    if (gameState === "playing" && mouseInBox) {
      player.x = x;
      player.y = y;
      clampPlayer();
    }
  }

  function onMouseLeave() {
    mouseInBox = false;
  }

  /* ── 初始化 ── */

  btnStart.addEventListener("click", startGame);
  btnRestart.addEventListener("click", startGame);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseleave", onMouseLeave);
  window.addEventListener("resize", () => {
    resizeCanvas();
    if (gameState !== "playing") resetPlayer();
  });

  resizeCanvas();
  resetPlayer();
  updateHP();
})();
