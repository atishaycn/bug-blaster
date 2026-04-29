const DEBUG = false;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const muteButton = document.getElementById("muteButton");
const restartButton = document.getElementById("restartButton");

const W = 960;
const H = 360;
const GROUND_Y = 306;
const MAX_HEALTH = 3;
const STORAGE_KEY = "bugBlasterRunnerHighScore";
const LEADERBOARD_KEY = "bugBlasterRunnerLeaderboard";
const BULLET_LANE_Y = GROUND_Y - 36;
const SCORE_API = "/api/scores";
const LEADERBOARD_LIMIT = 10;

const ASSETS = {
  player: "assets/player.svg",
  groundBug: "assets/bug-ground.svg",
  flyingBug: "assets/bug-flying.svg",
  fastBug: "assets/bug-fast.svg",
  rock: "assets/hurdle-rock.svg",
  log: "assets/hurdle-log.svg",
  spikes: "assets/hurdle-spikes.svg",
  rapid: "assets/power-rapid.svg",
  shield: "assets/power-shield.svg",
  spread: "assets/power-spread.svg",
  health: "assets/power-health.svg",
  score: "assets/power-score.svg",
  collector: "assets/collector.svg",
  tree: "assets/tree.svg",
  cloud: "assets/cloud.svg",
  hill: "assets/hill.svg",
  badge: "assets/ui-badge.svg"
};

const images = {};
for (const [key, src] of Object.entries(ASSETS)) {
  const img = new Image();
  img.src = src;
  images[key] = img;
}

class Sound {
  constructor() {
    this.context = null;
    this.muted = false;
  }

  ensure() {
    if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === "suspended") this.context.resume();
  }

  play(type) {
    if (this.muted) return;
    this.ensure();
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const settings = {
      shoot: [620, 0.045, "square", 0.035],
      collect: [880, 0.12, "sine", 0.06],
      damage: [130, 0.18, "sawtooth", 0.08],
      over: [72, 0.45, "triangle", 0.09]
    }[type];
    osc.type = settings[2];
    osc.frequency.setValueAtTime(settings[0], now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, settings[0] * 0.45), now + settings[1]);
    gain.gain.setValueAtTime(settings[3], now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings[1]);
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.start(now);
    osc.stop(now + settings[1]);
  }
}

class Player {
  constructor() {
    this.x = 92;
    this.w = 56;
    this.h = 72;
    this.y = GROUND_Y - this.h;
    this.vy = 0;
    this.grounded = true;
    this.invincible = 0;
    this.recoil = 0;
  }

  jump() {
    if (!this.grounded) return;
    this.vy = -760;
    this.grounded = false;
  }

  update(dt) {
    this.vy += 2050 * dt;
    this.y += this.vy * dt;
    if (this.y + this.h >= GROUND_Y) {
      this.y = GROUND_Y - this.h;
      this.vy = 0;
      this.grounded = true;
    }
    this.invincible = Math.max(0, this.invincible - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
  }

  draw(ctx, shield) {
    const blink = this.invincible > 0 && Math.floor(performance.now() / 80) % 2 === 0;
    if (shield) {
      ctx.save();
      ctx.globalAlpha = 0.32 + Math.sin(performance.now() / 120) * 0.08;
      ctx.fillStyle = "#58c7ff";
      ctx.beginPath();
      ctx.ellipse(this.x + this.w / 2, this.y + this.h / 2, 42, 52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (!blink) ctx.drawImage(images.player, this.x - this.recoil * 5, this.y, this.w, this.h);
    if (DEBUG) drawHitbox(this.hitbox(), "#1457ff");
  }

  hitbox() {
    return { x: this.x + 10, y: this.y + 8, w: this.w - 16, h: this.h - 8 };
  }

  muzzle() {
    return { x: this.x + 55, y: this.y + 36 };
  }
}

class Bullet {
  constructor(x, y, vy = 0) {
    this.x = x;
    this.y = y;
    this.vx = 680;
    this.vy = vy;
    this.r = 5;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx) {
    ctx.fillStyle = "#fff4a3";
    ctx.strokeStyle = "#d9731f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 10, this.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (DEBUG) drawHitbox(this.hitbox(), "#ff9d00");
  }

  hitbox() {
    return { x: this.x - 8, y: this.y - 8, w: 18, h: 16 };
  }
}

class Bug {
  constructor(type, speed, level = 1) {
    this.type = type;
    this.x = W + 30;
    this.health = 1;
    this.maxHealth = 1;
    this.score = type === "fast" ? 45 : 30;
    this.level = level;
    this.phase = Math.random() * Math.PI * 2;
    if (type === "ground") {
      this.w = 58; this.h = 40; this.y = GROUND_Y - this.h + 2; this.vx = speed + 42; this.img = images.groundBug;
    } else if (type === "flying") {
      this.w = 62; this.h = 44; this.y = BULLET_LANE_Y - 32 + Math.random() * 7; this.vx = speed + 30; this.img = images.flyingBug;
    } else if (type === "collector") {
      this.w = 86 + Math.min(24, level * 3);
      this.h = 60 + Math.min(14, level * 2);
      this.y = 194 + Math.random() * 14;
      this.vx = speed * 0.54 + level * 10;
      this.health = 3 + level;
      this.maxHealth = this.health;
      this.score = 120 + level * 35;
      this.img = images.collector;
    } else {
      this.w = 46; this.h = 30; this.y = GROUND_Y - this.h + 3; this.vx = speed + 118; this.img = images.fastBug;
      this.score = 55;
    }
  }

  update(dt, worldSpeed) {
    this.phase += dt * 10;
    const collectorDrag = this.type === "collector" ? 0.12 : 0.34;
    this.x -= (this.vx + worldSpeed * collectorDrag) * dt;
    if (this.type === "flying") this.y += Math.sin(this.phase) * 8 * dt;
    if (this.type === "collector") this.y += Math.sin(this.phase * 0.55) * 16 * dt;
  }

  draw(ctx) {
    const flap = this.type === "flying" ? Math.sin(this.phase) * 4 : Math.sin(this.phase) * 1.5;
    if (this.type === "collector") {
      ctx.save();
      ctx.shadowColor = "rgba(255, 114, 72, 0.5)";
      ctx.shadowBlur = 16;
      ctx.drawImage(this.img, this.x, this.y + Math.sin(this.phase) * 2, this.w, this.h);
      const barW = this.w * 0.74;
      const pct = this.health / this.maxHealth;
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(17, 24, 39, 0.72)";
      roundRect(ctx, this.x + this.w * 0.13, this.y - 10, barW, 6, 3);
      ctx.fill();
      ctx.fillStyle = "#ffcf5a";
      roundRect(ctx, this.x + this.w * 0.13, this.y - 10, barW * pct, 6, 3);
      ctx.fill();
      ctx.restore();
      if (DEBUG) drawHitbox(this.hitbox(), "#d81b60");
      return;
    }
    ctx.drawImage(this.img, this.x, this.y + flap, this.w, this.h);
    if (DEBUG) drawHitbox(this.hitbox(), "#d81b60");
  }

  hitbox() {
    if (this.type === "collector") return { x: this.x + 10, y: this.y + 8, w: this.w - 20, h: this.h - 14 };
    if (this.type === "flying") return { x: this.x + 6, y: this.y + 2, w: this.w - 10, h: this.h };
    return { x: this.x + 7, y: this.y + 3, w: this.w - 12, h: this.h - 7 };
  }
}

class Hurdle {
  constructor(type, speed) {
    this.type = type;
    this.x = W + 35;
    this.img = images[type];
    const sizes = { rock: [56, 36], log: [64, 32], spikes: [66, 36] };
    [this.w, this.h] = sizes[type];
    this.y = GROUND_Y - this.h + 4;
    this.vx = speed;
  }

  update(dt, worldSpeed) {
    this.x -= (this.vx + worldSpeed * 0.2) * dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.shadowColor = "rgba(25, 50, 60, 0.42)";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
    ctx.restore();
    if (DEBUG) drawHitbox(this.hitbox(), "#111");
  }

  hitbox() {
    return { x: this.x + 6, y: this.y + 6, w: this.w - 12, h: this.h - 8 };
  }
}

class PowerUp {
  constructor(type, speed) {
    this.type = type;
    this.x = W + 40;
    this.baseY = Math.random() < 0.48 ? GROUND_Y - 50 : 166 + Math.random() * 42;
    this.y = this.baseY;
    this.w = 34;
    this.h = 34;
    this.phase = Math.random() * Math.PI * 2;
    this.vx = speed * 0.86;
    this.img = images[type];
  }

  update(dt, worldSpeed) {
    this.phase += dt * 5;
    this.x -= (this.vx + worldSpeed * 0.08) * dt;
    this.y = this.baseY + Math.sin(this.phase) * 10;
  }

  draw(ctx) {
    ctx.save();
    ctx.shadowColor = "rgba(25, 50, 60, 0.25)";
    ctx.shadowBlur = 10;
    ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
    ctx.restore();
    if (DEBUG) drawHitbox(this.hitbox(), "#35b779");
  }

  hitbox() {
    return { x: this.x + 3, y: this.y + 3, w: this.w - 6, h: this.h - 6 };
  }
}

class BackgroundItem {
  constructor(kind, x, y, scale, speedFactor) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.scale = scale;
    this.speedFactor = speedFactor;
    this.img = images[kind];
    this.w = (kind === "cloud" ? 130 : kind === "hill" ? 180 : 76) * scale;
    this.h = (kind === "cloud" ? 54 : kind === "hill" ? 70 : 108) * scale;
  }

  update(dt, speed) {
    this.x -= speed * this.speedFactor * dt;
    if (this.x + this.w < -20) this.x = W + Math.random() * 220;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.kind === "tree" ? 0.58 : this.kind === "hill" ? 0.7 : 0.92;
    ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
    ctx.restore();
  }
}

class Game {
  constructor() {
    this.sound = new Sound();
    this.leaderboard = loadLeaderboard();
    this.highScore = Math.max(Number(localStorage.getItem(STORAGE_KEY) || 0), this.leaderboard[0]?.score || 0);
    this.bg = [
      new BackgroundItem("hill", 10, 230, 1.08, 0.11),
      new BackgroundItem("hill", 330, 238, 0.84, 0.11),
      new BackgroundItem("hill", 700, 232, 0.98, 0.11),
      new BackgroundItem("cloud", 120, 54, 0.8, 0.08),
      new BackgroundItem("cloud", 500, 82, 0.6, 0.08),
      new BackgroundItem("cloud", 790, 44, 0.75, 0.08),
      new BackgroundItem("tree", 250, 184, 0.38, 0.2),
      new BackgroundItem("tree", 610, 178, 0.42, 0.2),
      new BackgroundItem("tree", 890, 190, 0.34, 0.2)
    ];
    this.reset();
    this.state = "start";
    this.syncScores();
  }

  reset() {
    this.player = new Player();
    this.bullets = [];
    this.bugs = [];
    this.hurdles = [];
    this.powerups = [];
    this.health = MAX_HEALTH;
    this.score = 0;
    this.elapsed = 0;
    this.worldSpeed = 230;
    this.fireTimer = 0;
    this.bugTimer = 1.1;
    this.hurdleTimer = 2.1;
    this.powerTimer = 5.8;
    this.collectorTimer = 3 + Math.random() * 1.5;
    this.effects = { rapid: 0, spread: 0, boost: 0, shield: 0 };
    this.groundSpawnCooldown = 0;
    this.hurdleSpawnCooldown = 0;
    this.graceTimer = 0.55;
    this.pendingEntry = null;
    this.initials = "";
    restartButton.classList.remove("is-visible");
  }

  start() {
    this.reset();
    this.state = "playing";
    this.sound.ensure();
  }

  restart() {
    if (this.pendingEntry) return;
    this.start();
  }

  togglePause() {
    if (this.state === "playing") this.state = "paused";
    else if (this.state === "paused") this.state = "playing";
  }

  jumpOrStart() {
    if (this.state === "start") this.start();
    else if (this.state === "gameover" && !this.pendingEntry) this.restart();
    else if (this.state === "playing") this.player.jump();
  }

  update(dt) {
    if (this.state !== "playing") return;
    dt = Math.min(dt, 0.033);
    this.elapsed += dt;
    this.graceTimer = Math.max(0, this.graceTimer - dt);
    this.groundSpawnCooldown = Math.max(0, this.groundSpawnCooldown - dt);
    this.hurdleSpawnCooldown = Math.max(0, this.hurdleSpawnCooldown - dt);
    const boost = this.effects.boost > 0 ? 2 : 1;
    this.score += dt * 11 * boost;
    this.worldSpeed = Math.min(520, 230 + this.elapsed * 7.5);

    for (const key of Object.keys(this.effects)) this.effects[key] = Math.max(0, this.effects[key] - dt);

    this.player.update(dt);
    this.updateSpawns(dt);
    this.updateShooting(dt);
    for (const item of this.bg) item.update(dt, this.worldSpeed);
    for (const arr of [this.bullets, this.bugs, this.hurdles, this.powerups]) {
      for (const obj of arr) obj.update(dt, this.worldSpeed);
    }
    this.resolveCollisions();
    this.cleanup();
    this.saveHighScore();
  }

  updateShooting(dt) {
    this.fireTimer -= dt;
    const interval = this.effects.rapid > 0 ? 0.18 : 0.45;
    if (this.fireTimer <= 0) {
      const muzzle = this.player.muzzle();
      this.bullets.push(new Bullet(muzzle.x, muzzle.y));
      if (this.effects.spread > 0) {
        this.bullets.push(new Bullet(muzzle.x, muzzle.y - 4, -112));
        this.bullets.push(new Bullet(muzzle.x, muzzle.y + 4, 112));
      }
      this.player.recoil = 1;
      this.fireTimer = interval;
      this.sound.play("shoot");
    }
  }

  updateSpawns(dt) {
    const difficulty = Math.min(1, this.elapsed / 55);
    this.bugTimer -= dt;
    this.hurdleTimer -= dt;
    this.powerTimer -= dt;
    this.collectorTimer -= dt;
    const collectorActive = this.bugs.some((bug) => bug.type === "collector");
    if (this.collectorTimer <= 0 && !collectorActive) {
      const level = 1 + Math.floor(this.elapsed / 22);
      this.bugs.push(new Bug("collector", this.worldSpeed, level));
      this.collectorTimer = 12 + Math.random() * 8 - Math.min(4, level * 0.5);
      this.groundSpawnCooldown = Math.max(this.groundSpawnCooldown, 1.35);
      this.hurdleSpawnCooldown = Math.max(this.hurdleSpawnCooldown, 1.6);
    }
    if (this.bugTimer <= 0) {
      const types = Math.random() < 0.5 ? ["ground", "flying"] : ["ground", "fast", "flying"];
      const type = types[Math.floor(Math.random() * types.length)];
      const isGroundThreat = type === "ground" || type === "fast";
      const hasNearHurdle = this.hurdles.some((hurdle) => hurdle.x > W - 260 && hurdle.x < W + 100);
      const canSpawnFlying = type !== "flying" || !hasNearHurdle;
      if (canSpawnFlying && (!isGroundThreat || this.groundSpawnCooldown <= 0)) {
        this.bugs.push(new Bug(type, this.worldSpeed));
        if (isGroundThreat) this.groundSpawnCooldown = 1.08;
      }
      this.bugTimer = 0.98 - difficulty * 0.46 + Math.random() * 0.62;
    }
    if (this.hurdleTimer <= 0) {
      const canSpawn = this.hurdleSpawnCooldown <= 0 && this.bugs.every((bug) => bug.x < W - 260 || bug.x > W + 100);
      if (canSpawn) {
        this.hurdles.push(new Hurdle(["rock", "log", "spikes"][Math.floor(Math.random() * 3)], this.worldSpeed));
        this.hurdleSpawnCooldown = 1.2;
        this.groundSpawnCooldown = Math.max(this.groundSpawnCooldown, 0.85);
      }
      this.hurdleTimer = 1.62 - difficulty * 0.72 + Math.random() * 0.82;
    }
    if (this.powerTimer <= 0) {
      const list = ["rapid", "shield", "spread", "health", "score"];
      this.powerups.push(new PowerUp(list[Math.floor(Math.random() * list.length)], this.worldSpeed));
      this.powerTimer = 7.2 + Math.random() * 4.5;
    }
  }

  resolveCollisions() {
    for (const bullet of this.bullets) {
      if (bullet.dead) continue;
      for (const bug of this.bugs) {
        if (!bug.dead && rectsOverlap(bullet.hitbox(), bug.hitbox())) {
          bullet.dead = true;
          bug.health -= 1;
          if (bug.health <= 0) {
            bug.dead = true;
            this.score += bug.score * (this.effects.boost > 0 ? 2 : 1);
          }
          break;
        }
      }
    }
    const playerBox = this.player.hitbox();
    for (const thing of [...this.bugs, ...this.hurdles]) {
      if (!thing.dead && rectsOverlap(playerBox, thing.hitbox())) this.damage(thing);
    }
    for (const power of this.powerups) {
      if (!power.dead && rectsOverlap(playerBox, power.hitbox())) {
        power.dead = true;
        this.applyPower(power.type);
      }
    }
  }

  damage(source) {
    if (this.graceTimer > 0) return;
    if (this.player.invincible > 0) return;
    source.dead = source instanceof Bug && source.type !== "collector";
    if (this.effects.shield > 0) {
      this.effects.shield = 0;
      this.player.invincible = 0.65;
      this.sound.play("collect");
      return;
    }
    this.health -= 1;
    this.player.invincible = 1.05;
    this.sound.play("damage");
    if (this.health <= 0) {
      this.state = "gameover";
      this.sound.play("over");
      this.beginGameOver();
    }
  }

  beginGameOver() {
    const finalScore = Math.floor(this.score);
    this.saveHighScore();
    if (qualifiesForLeaderboard(this.leaderboard, finalScore)) {
      this.pendingEntry = { score: finalScore };
      this.initials = "";
      restartButton.classList.remove("is-visible");
    } else {
      restartButton.classList.add("is-visible");
    }
  }

  addInitial(letter) {
    if (!this.pendingEntry || this.initials.length >= 3) return;
    this.initials += letter;
  }

  removeInitial() {
    if (!this.pendingEntry) return;
    this.initials = this.initials.slice(0, -1);
  }

  submitInitials() {
    if (!this.pendingEntry || this.initials.length !== 3) return;
    const entry = { initials: this.initials, score: this.pendingEntry.score };
    this.leaderboard = normalizeScores([...this.leaderboard, entry]);
    saveLocalLeaderboard(this.leaderboard);
    postScore(entry).then((scores) => {
      if (scores) this.setLeaderboard(scores);
    });
    this.highScore = Math.max(this.highScore, this.leaderboard[0]?.score || 0);
    this.pendingEntry = null;
    restartButton.classList.add("is-visible");
  }

  async syncScores() {
    const scores = await fetchScores();
    if (scores) this.setLeaderboard(scores);
  }

  setLeaderboard(scores) {
    this.leaderboard = normalizeScores(scores);
    saveLocalLeaderboard(this.leaderboard);
    this.highScore = Math.max(this.highScore, this.leaderboard[0]?.score || 0);
  }

  applyPower(type) {
    if (type === "rapid") this.effects.rapid = 8;
    if (type === "shield") this.effects.shield = 999;
    if (type === "spread") this.effects.spread = 8;
    if (type === "health") this.health = Math.min(MAX_HEALTH, this.health + 1);
    if (type === "score") this.effects.boost = 8;
    this.sound.play("collect");
  }

  cleanup() {
    this.bullets = this.bullets.filter((b) => !b.dead && b.x < W + 50 && b.y > -20 && b.y < H + 20);
    this.bugs = this.bugs.filter((b) => !b.dead && b.x + b.w > -60);
    this.hurdles = this.hurdles.filter((h) => h.x + h.w > -60);
    this.powerups = this.powerups.filter((p) => !p.dead && p.x + p.w > -60);
  }

  saveHighScore() {
    if (Math.floor(this.score) > this.highScore) {
      this.highScore = Math.floor(this.score);
      localStorage.setItem(STORAGE_KEY, String(this.highScore));
    }
  }

  draw() {
    drawBackground(this.worldSpeed);
    for (const item of this.bg) item.draw(ctx);
    drawGround(this.elapsed, this.worldSpeed);
    for (const hurdle of this.hurdles) hurdle.draw(ctx);
    for (const power of this.powerups) power.draw(ctx);
    for (const bug of this.bugs) bug.draw(ctx);
    for (const bullet of this.bullets) bullet.draw(ctx);
    this.player.draw(ctx, this.effects.shield > 0);
    drawUI(this);
    if (this.state === "start") drawStartOverlay(this);
    if (this.state === "paused") drawOverlay("Paused", "Take a breath.", "Press P to Resume");
    if (this.state === "gameover") drawGameOverOverlay(this);
  }
}

function loadLeaderboard() {
  try {
    const rows = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]");
    return normalizeScores(rows);
  } catch {
    return [];
  }
}

function saveLocalLeaderboard(rows) {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(rows.slice(0, LEADERBOARD_LIMIT)));
  localStorage.setItem(STORAGE_KEY, String(rows[0]?.score || 0));
}

function normalizeScores(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row.initials === "string" && Number.isFinite(Number(row.score)))
    .map((row) => ({
      initials: row.initials.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "A"),
      score: Math.max(0, Math.floor(Number(row.score)))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_LIMIT);
}

async function fetchScores() {
  try {
    const response = await fetch(SCORE_API, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return normalizeScores(data.scores);
  } catch {
    return null;
  }
}

async function postScore(entry) {
  try {
    const response = await fetch(SCORE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
    if (!response.ok) return null;
    const data = await response.json();
    return normalizeScores(data.scores);
  } catch {
    return null;
  }
}

function qualifiesForLeaderboard(rows, score) {
  return score > 0 && (rows.length < 10 || score > rows[rows.length - 1].score);
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#bcefff");
  sky.addColorStop(0.68, "#f6fdff");
  sky.addColorStop(1, "#fff5d8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  for (let i = 0; i < 5; i++) ctx.fillRect(i * 210 - 30, 112 + i % 2 * 18, 120, 2);
}

function drawGround(t, speed) {
  ctx.fillStyle = "#d7f0cf";
  ctx.fillRect(0, GROUND_Y - 14, W, 14);
  ctx.fillStyle = "#88d094";
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = "#2f7b54";
  ctx.fillRect(0, GROUND_Y - 2, W, 7);
  ctx.fillStyle = "rgba(255, 255, 255, 0.44)";
  ctx.fillRect(0, GROUND_Y - 11, W, 2);
  ctx.fillStyle = "rgba(50, 92, 48, 0.24)";
  const offset = (t * speed) % 42;
  for (let x = -42; x < W + 42; x += 42) ctx.fillRect(x - offset, GROUND_Y + 21, 18, 3);
}

function drawUI(game) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 250, 240, 0.88)";
  roundRect(ctx, 16, 14, 328, 56, 8);
  ctx.fill();
  ctx.fillStyle = "#19323c";
  ctx.font = "800 18px Avenir, sans-serif";
  ctx.fillText(`Health ${"♥".repeat(game.health)}${"♡".repeat(MAX_HEALTH - game.health)}`, 30, 38);
  ctx.font = "800 16px Avenir, sans-serif";
  ctx.fillText(`Score ${Math.floor(game.score)}   High ${game.highScore}`, 30, 60);
  const active = activeEffectText(game.effects);
  if (active) {
    const textW = ctx.measureText(active).width + 34;
    ctx.fillStyle = "rgba(25, 50, 60, 0.9)";
    roundRect(ctx, W - textW - 16, 14, textW, 42, 8);
    ctx.fill();
    ctx.fillStyle = "#fff4d8";
    ctx.font = "800 15px Avenir, sans-serif";
    ctx.fillText(active, W - textW, 40);
  }
  ctx.restore();
}

function activeEffectText(effects) {
  const names = [];
  if (effects.rapid > 0) names.push(`Rapid ${effects.rapid.toFixed(1)}s`);
  if (effects.spread > 0) names.push(`Spread ${effects.spread.toFixed(1)}s`);
  if (effects.boost > 0) names.push(`Boost ${effects.boost.toFixed(1)}s`);
  if (effects.shield > 0) names.push("Shield");
  return names.slice(0, 2).join("  ");
}

function drawOverlay(title, subtitle, prompt) {
  ctx.save();
  ctx.fillStyle = "rgba(18, 32, 38, 0.62)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255, 250, 240, 0.94)";
  roundRect(ctx, 222, 86, 516, 178, 8);
  ctx.fill();
  ctx.drawImage(images.badge, 390, 102, 180, 64);
  ctx.textAlign = "center";
  ctx.fillStyle = "#19323c";
  ctx.font = "900 44px Avenir, sans-serif";
  ctx.fillText(title, W / 2, 188);
  ctx.font = "700 17px Avenir, sans-serif";
  ctx.fillStyle = "#5f7480";
  ctx.fillText(subtitle, W / 2, 218);
  ctx.font = "900 18px Avenir, sans-serif";
  ctx.fillStyle = "#c94b25";
  ctx.fillText(prompt, W / 2, 246);
  ctx.restore();
}

function drawStartOverlay(game) {
  ctx.save();
  ctx.fillStyle = "rgba(18, 32, 38, 0.64)";
  ctx.fillRect(0, 0, W, H);
  drawLeaderboardPanel(game.leaderboard, 226, 34, 508, 302, {
    title: "BUG BLASTER",
    subtitle: "TOP 10 SCORES",
    prompt: "PRESS ENTER OR TAP TO START",
    score: null
  });
  ctx.restore();
}

function drawGameOverOverlay(game) {
  ctx.save();
  ctx.fillStyle = "rgba(18, 32, 38, 0.68)";
  ctx.fillRect(0, 0, W, H);
  drawLeaderboardPanel(game.leaderboard, 202, 18, 556, 326, {
    title: game.pendingEntry ? "NEW HIGH SCORE" : "GAME OVER",
    subtitle: `FINAL ${Math.floor(game.score)}  HIGH ${game.highScore}`,
    prompt: game.pendingEntry ? "TYPE 3 INITIALS  ENTER TO SAVE" : "PRESS ENTER OR TAP TO RESTART",
    score: game.pendingEntry?.score || null,
    initials: game.initials
  });
  ctx.restore();
}

function drawLeaderboardPanel(rows, x, y, w, h, options) {
  ctx.save();
  const glow = performance.now() / 400;
  ctx.fillStyle = "rgba(8, 14, 28, 0.94)";
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  drawLedGrid(x + 8, y + 8, w - 16, h - 16);
  ctx.strokeStyle = "#ff7148";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ff7148";
  ctx.shadowBlur = 10;
  roundRect(ctx, x + 10, y + 10, w - 20, h - 20, 8);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.textAlign = "center";
  ctx.font = "900 28px 'Courier New', monospace";
  drawGlowText(options.title, x + w / 2, y + 42, "#ffe866", "#ff3d2e");
  ctx.font = "800 15px 'Courier New', monospace";
  drawGlowText(options.subtitle, x + w / 2, y + 66, "#dfeeff", "#80bdff");

  const topY = y + 90;
  ctx.textAlign = "left";
  ctx.font = "800 17px 'Courier New', monospace";
  const displayRows = rows.slice(0, 10);
  for (let i = 0; i < 10; i++) {
    const row = displayRows[i] || { initials: "---", score: 0 };
    const rowY = topY + i * 16;
    const hue = i === 0 ? ["#ff6548", "#ffe866"] : i < 3 ? ["#7cff9a", "#cfff6e"] : ["#5bc7ff", "#87a8ff"];
    ctx.fillStyle = hue[0];
    ctx.shadowColor = hue[0];
    ctx.shadowBlur = 8;
    ctx.fillText(`${ordinal(i + 1)} ${row.initials.padEnd(3, " ")}`, x + 54, rowY);
    ctx.textAlign = "right";
    ctx.fillStyle = hue[1];
    ctx.shadowColor = hue[1];
    ctx.fillText(row.score ? String(row.score).padStart(5, " ") : "-----", x + w - 54, rowY);
    ctx.textAlign = "left";
  }

  if (options.score) {
    const entryY = y + h - 58;
    ctx.textAlign = "center";
    ctx.font = "900 18px 'Courier New', monospace";
    drawGlowText(`YOUR SCORE ${options.score}`, x + w / 2, entryY - 22, "#ffffff", "#9bd8ff");
    const slots = (options.initials || "").padEnd(3, "_").split("").join(" ");
    const pulse = Math.sin(glow * 5) > 0 ? "#ffffff" : "#ffed68";
    ctx.font = "900 34px 'Courier New', monospace";
    drawGlowText(slots, x + w / 2, entryY + 12, pulse, "#ff7148");
  }

  ctx.textAlign = "center";
  ctx.font = "900 13px 'Courier New', monospace";
  drawGlowText(options.prompt, x + w / 2, y + h - 18, "#ffffff", "#66d7ff");
  ctx.restore();
}

function drawLedGrid(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  for (let yy = y; yy < y + h; yy += 6) {
    for (let xx = x; xx < x + w; xx += 6) {
      ctx.fillRect(xx, yy, 1.5, 1.5);
    }
  }
  const wash = ctx.createLinearGradient(x, y, x, y + h);
  wash.addColorStop(0, "rgba(16, 42, 75, 0)");
  wash.addColorStop(1, "rgba(18, 34, 120, 0.55)");
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawGlowText(text, x, y, fill, glow) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 9;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function ordinal(rank) {
  if (rank === 1) return "1ST";
  if (rank === 2) return "2ND";
  if (rank === 3) return "3RD";
  return `${rank}TH`;
}

function drawHitbox(box, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const game = new Game();
let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  game.update(dt);
  game.draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener("keydown", (event) => {
  if (game.pendingEntry) {
    if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      game.addInitial(event.key.toUpperCase());
    } else if (event.key === "Backspace") {
      event.preventDefault();
      game.removeInitial();
    } else if (event.key === "Enter") {
      event.preventDefault();
      game.submitInitials();
    }
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    game.jumpOrStart();
  }
  if (event.key === "Enter") game.jumpOrStart();
  if (event.key.toLowerCase() === "p") game.togglePause();
  if (event.key.toLowerCase() === "m") toggleMute();
});

canvas.addEventListener("pointerdown", () => {
  if (!game.pendingEntry) game.jumpOrStart();
});
restartButton.addEventListener("click", (event) => {
  event.stopPropagation();
  game.restart();
});
muteButton.addEventListener("click", toggleMute);

function toggleMute() {
  game.sound.muted = !game.sound.muted;
  muteButton.textContent = game.sound.muted ? "Sound Off" : "Sound On";
}
