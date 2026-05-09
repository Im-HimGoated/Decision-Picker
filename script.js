const canvas = document.getElementById("machineCanvas");
const ctx = canvas.getContext("2d");

const taskInput = document.getElementById("taskInput");
const loadButton = document.getElementById("loadButton");
const shuffleButton = document.getElementById("shuffleButton");
const playButton = document.getElementById("playButton");
const dropButton = document.getElementById("dropButton");
const grabButton = document.getElementById("grabButton");
const doneButton = document.getElementById("doneButton");
const winnerCard = document.getElementById("winnerCard");
const statusDisplay = document.getElementById("statusDisplay");
const inputHint = document.getElementById("inputHint");
const taskCount = document.getElementById("taskCount");

const W = canvas.width;
const H = canvas.height;
const floorY = H - 64;
const chute = { x: W - 250, y: H - 168, w: 210, h: 96 };
const colors = ["#f25c54", "#2a9d8f", "#f4a261", "#457b9d", "#ffd166", "#7b61ff", "#43aa8b", "#ef476f"];

let balls = [];
let particles = [];
let activeTasks = [];
let chosenBall = null;
let heldBall = null;
let pendingRemoval = null;
let lastTime = performance.now();
let gameState = "idle";
let claw = {
  x: W / 2,
  y: 76,
  targetX: W / 2,
  cable: 72,
  targetCable: 72,
  grip: 56,
  targetGrip: 56,
  sway: 0,
  carryX: W / 2,
  carryY: 150
};

function parseTasks() {
  return taskInput.value
    .split(/\n|,/)
    .map((task) => task.trim())
    .filter(Boolean);
}

function setStatus(message) {
  statusDisplay.textContent = message;
}

function updateTaskCount(count = parseTasks().length) {
  taskCount.textContent = count;
}

function randomUint32() {
  if (window.crypto && window.crypto.getRandomValues) {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0];
  }

  return Math.floor(Math.random() * 0x100000000);
}

function randomInt(max) {
  if (max <= 0) return 0;

  const limit = 0x100000000 - (0x100000000 % max);
  let value = randomUint32();
  while (value >= limit) value = randomUint32();
  return value % max;
}

function random(min, max) {
  return min + (randomUint32() / 0x100000000) * (max - min);
}

function shuffleTasks(tasks) {
  const shuffled = [...tasks];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function makeBall(task, index, total) {
  const r = Math.max(28, Math.min(45, 48 - total * 0.6));
  return {
    task,
    r,
    x: random(80, W - 310),
    y: random(-360 - index * 22, -60),
    vx: random(-46, 46),
    vy: random(-8, 16),
    angle: random(0, Math.PI * 2),
    spin: random(-1.8, 1.8),
    color: colors[index % colors.length],
    stripe: colors[(index + 3) % colors.length],
    grabbed: false,
    settled: false,
    label: task.length > 18 ? `${task.slice(0, 17)}...` : task
  };
}

function loadBalls({ shuffle = false } = {}) {
  const tasks = parseTasks();
  updateTaskCount(tasks.length);

  if (tasks.length < 5) {
    inputHint.textContent = `Add ${5 - tasks.length} more ${tasks.length === 4 ? "choice" : "choices"} before loading the machine.`;
    setStatus("Need at least 5 choices.");
    return;
  }

  activeTasks = shuffle ? shuffleTasks(tasks) : tasks;
  balls = activeTasks.map((task, index) => makeBall(task, index, activeTasks.length));
  particles = [];
  chosenBall = null;
  heldBall = null;
  pendingRemoval = null;
  gameState = "loaded";
  claw.targetX = W / 2;
  claw.targetCable = 72;
  claw.targetGrip = 56;
  winnerCard.textContent = "Waiting for the claw...";
  dropButton.disabled = true;
  grabButton.disabled = true;
  doneButton.disabled = true;
  playButton.disabled = false;
  inputHint.textContent = `${activeTasks.length} balls loaded. Every ball has equal odds.`;
  setStatus("Balls loaded. Press Play.");
}

function pickTargetBall() {
  return balls[randomInt(balls.length)];
}

function beginPlay() {
  if (balls.length < 5) {
    loadBalls();
    if (balls.length < 5) return;
  }

  chosenBall = pickTargetBall();
  heldBall = null;
  gameState = "aiming";
  claw.targetX = chosenBall.x;
  claw.targetCable = 72;
  claw.targetGrip = 58;
  playButton.disabled = true;
  dropButton.disabled = false;
  grabButton.disabled = true;
  doneButton.disabled = true;
  winnerCard.textContent = "The claw is choosing...";
  setStatus("Random ball selected. The claw is sliding into place.");
}

function dropClaw() {
  if (!chosenBall || gameState !== "aiming") return;
  gameState = "dropping";
  claw.targetCable = Math.max(130, Math.min(chosenBall.y - 34, floorY - 138));
  claw.targetGrip = 66;
  dropButton.disabled = true;
  grabButton.disabled = false;
  setStatus("Dropping. Hit Grab Prize when it reaches the ball.");
}

function grabPrize() {
  if (!chosenBall || !["dropping", "aiming"].includes(gameState)) return;
  gameState = "grabbing";
  claw.targetCable = Math.max(130, Math.min(chosenBall.y - 28, floorY - 138));
  claw.targetGrip = 18;
  grabButton.disabled = true;
  setStatus("The claw is closing around a choice.");

  window.setTimeout(() => {
    heldBall = chosenBall;
    heldBall.grabbed = true;
    heldBall.vx = 0;
    heldBall.vy = 0;
    gameState = "lifting";
    claw.targetCable = 76;
    setStatus("Got one. Lifting it out.");

    window.setTimeout(() => {
      gameState = "carrying";
      claw.targetX = chute.x + chute.w / 2;
      setStatus("Carrying your next thing to the chute.");
    }, 720);
  }, 560);
}

function finishDrop() {
  if (!heldBall) return;
  gameState = "revealing";
  claw.targetGrip = 66;
  heldBall.grabbed = false;
  heldBall.vx = random(-18, 18);
  heldBall.vy = 0;
  pendingRemoval = heldBall.task;
  winnerCard.textContent = heldBall.task;
  setStatus("Decision made. Do this one thing next.");
  doneButton.disabled = false;
  playButton.disabled = false;
  dropButton.disabled = true;
  grabButton.disabled = true;

  for (let i = 0; i < 34; i += 1) {
    particles.push({
      x: chute.x + chute.w / 2,
      y: chute.y + 28,
      vx: random(-145, 145),
      vy: random(-210, -40),
      life: random(0.45, 0.9),
      color: colors[i % colors.length]
    });
  }

  heldBall = null;
  chosenBall = null;
  window.setTimeout(() => {
    if (gameState === "revealing") gameState = "loaded";
  }, 900);
}

function removeDoneTask() {
  if (!pendingRemoval) return;
  const remaining = parseTasks().filter((task) => task !== pendingRemoval);
  taskInput.value = remaining.join("\n");
  pendingRemoval = null;
  loadBalls();
}

function integrateBall(ball, dt) {
  if (ball.grabbed) {
    ball.x += (claw.x - ball.x) * Math.min(1, dt * 10);
    ball.y += (claw.y + claw.cable + 64 - ball.y) * Math.min(1, dt * 10);
    ball.angle += dt * 1.2;
    return;
  }

  ball.vy += 940 * dt;
  ball.vx *= 0.996;
  ball.vy *= 0.999;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.angle += ball.spin * dt;

  const left = 42 + ball.r;
  const right = W - 42 - ball.r;
  if (ball.x < left) {
    ball.x = left;
    ball.vx = Math.abs(ball.vx) * 0.7;
  }
  if (ball.x > right) {
    ball.x = right;
    ball.vx = -Math.abs(ball.vx) * 0.7;
  }
  if (ball.y + ball.r > floorY) {
    ball.y = floorY - ball.r;
    ball.vy = -Math.abs(ball.vy) * 0.42;
    ball.vx *= 0.83;
    ball.spin *= 0.84;
    if (Math.abs(ball.vy) < 28) ball.vy = 0;
  }
}

function resolveCollisions() {
  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i];
      const b = balls[j];
      if (a.grabbed || b.grabbed) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const minDist = a.r + b.r;
      if (dist >= minDist) continue;

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = (minDist - dist) * 0.5;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      const tx = -ny;
      const ty = nx;
      const dpTanA = a.vx * tx + a.vy * ty;
      const dpTanB = b.vx * tx + b.vy * ty;
      const dpNormA = a.vx * nx + a.vy * ny;
      const dpNormB = b.vx * nx + b.vy * ny;
      const bounce = 0.78;

      a.vx = tx * dpTanA + nx * dpNormB * bounce;
      a.vy = ty * dpTanA + ny * dpNormB * bounce;
      b.vx = tx * dpTanB + nx * dpNormA * bounce;
      b.vy = ty * dpTanB + ny * dpNormA * bounce;
      a.spin += random(-0.45, 0.45);
      b.spin += random(-0.45, 0.45);
    }
  }
}

function updateClaw(dt) {
  if (chosenBall && ["aiming", "dropping", "grabbing"].includes(gameState)) {
    claw.targetX = chosenBall.x;
    if (gameState !== "aiming") {
      claw.targetCable = Math.max(130, Math.min(chosenBall.y - 28, floorY - 138));
    }
  }

  claw.x += (claw.targetX - claw.x) * Math.min(1, dt * 4.4);
  claw.cable += (claw.targetCable - claw.cable) * Math.min(1, dt * 5.8);
  claw.grip += (claw.targetGrip - claw.grip) * Math.min(1, dt * 8);
  claw.sway += dt * (heldBall ? 6 : 4);
  claw.y = 78 + Math.sin(claw.sway) * (heldBall ? 2.8 : 1.6);

  if (gameState === "dropping" && Math.abs(claw.cable - claw.targetCable) < 5) {
    setStatus("Line it up, then press Grab Prize.");
  }

  if (gameState === "carrying" && Math.abs(claw.x - claw.targetX) < 9) {
    finishDrop();
  }
}

function updateParticles(dt) {
  particles = particles.filter((particle) => {
    particle.life -= dt;
    particle.vy += 360 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    return particle.life > 0;
  });
}

function update(dt) {
  updateClaw(dt);
  balls.forEach((ball) => integrateBall(ball, dt));
  for (let n = 0; n < 3; n += 1) resolveCollisions();
  updateParticles(dt);
}

function drawCabinetInterior() {
  ctx.clearRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#e7fcff");
  bg.addColorStop(0.58, "#c1ebee");
  bg.addColorStop(1, "#91c5cc");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.fillRect(70, 30, 44, 520);
  ctx.fillRect(128, 30, 16, 520);
  ctx.fillRect(638, 24, 30, 360);

  ctx.fillStyle = "rgba(36, 36, 44, 0.1)";
  ctx.fillRect(42, 104, W - 84, 4);
  ctx.fillRect(42, 142, W - 84, 2);

  ctx.fillStyle = "#edf2f4";
  ctx.strokeStyle = "#252530";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 128, 22, 256, 54, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#252530";
  ctx.font = "900 17px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("RANDOMIZER RAIL", W / 2, 49);

  ctx.fillStyle = "#4f3c51";
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.fillStyle = "#251e2c";
  ctx.fillRect(32, floorY + 22, W - 64, 18);

  ctx.fillStyle = "#22212a";
  ctx.fillRect(chute.x, chute.y, chute.w, chute.h);
  ctx.fillStyle = "#111016";
  ctx.fillRect(chute.x + 18, chute.y + 24, chute.w - 36, chute.h - 40);
}

function fitText(text, maxWidth, maxSize, minSize) {
  let size = maxSize;
  ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 1;
    ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
  }
  return size;
}

function drawBall(ball) {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.angle);

  const grad = ctx.createRadialGradient(-ball.r * 0.35, -ball.r * 0.45, ball.r * 0.1, 0, 0, ball.r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.18, ball.color);
  grad.addColorStop(1, "#25212b");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.82;
  ctx.fillStyle = ball.stripe;
  ctx.beginPath();
  ctx.ellipse(0, 0, ball.r * 0.92, ball.r * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.rotate(-ball.angle);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = fitText(ball.label, ball.r * 1.42, 12, 7);
  ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = 3;
  ctx.fillText(ball.label, 0, 1, ball.r * 1.42);
  ctx.restore();
}

function drawClaw() {
  const hookX = claw.x + Math.sin(claw.sway) * (heldBall ? 5 : 2);
  const hookY = claw.y + claw.cable;

  ctx.save();
  ctx.strokeStyle = "#2d3142";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(claw.x, 0);
  ctx.lineTo(hookX, hookY - 26);
  ctx.stroke();

  ctx.fillStyle = "#edf2f4";
  ctx.strokeStyle = "#24242c";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(hookX - 40, hookY - 44, 80, 38, 7);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f7c948";
  ctx.fillRect(hookX - 24, hookY - 58, 48, 16);
  ctx.strokeRect(hookX - 24, hookY - 58, 48, 16);

  const spread = claw.grip;
  drawArm(hookX - 24, hookY - 10, -spread, 62, -1);
  drawArm(hookX + 24, hookY - 10, spread, 62, 1);
  drawArm(hookX, hookY - 8, 0, 72, 0);
  ctx.restore();
}

function drawArm(x, y, spread, length, side) {
  const endX = x + spread * 0.58;
  const endY = y + length;
  ctx.strokeStyle = "#dce4ea";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + spread * 0.25, y + length * 0.45, endX, endY);
  ctx.stroke();

  ctx.strokeStyle = "#24242c";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.strokeStyle = "#dce4ea";
  ctx.lineWidth = 10;
  ctx.beginPath();
  if (side === 0) {
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX, endY + 24);
  } else {
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - side * 20, endY + 18);
  }
  ctx.stroke();
}

function drawParticles() {
  particles.forEach((particle) => {
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, 8, 8);
  });
  ctx.globalAlpha = 1;
}

function draw() {
  drawCabinetInterior();
  [...balls].sort((a, b) => a.y - b.y).forEach(drawBall);
  drawClaw();
  drawParticles();
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

loadButton.addEventListener("click", () => loadBalls());
shuffleButton.addEventListener("click", () => loadBalls({ shuffle: true }));
playButton.addEventListener("click", beginPlay);
dropButton.addEventListener("click", dropClaw);
grabButton.addEventListener("click", grabPrize);
doneButton.addEventListener("click", removeDoneTask);

taskInput.addEventListener("input", () => {
  const count = parseTasks().length;
  updateTaskCount(count);
  inputHint.textContent = count >= 5 ? `${count} choices ready to load.` : `Add ${5 - count} more ${count === 4 ? "choice" : "choices"} before loading.`;
});

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    this.beginPath();
    this.moveTo(x + radius, y);
    this.arcTo(x + w, y, x + w, y + h, radius);
    this.arcTo(x + w, y + h, x, y + h, radius);
    this.arcTo(x, y + h, x, y, radius);
    this.arcTo(x, y, x + w, y, radius);
    this.closePath();
    return this;
  };
}

loadBalls();
updateTaskCount();
requestAnimationFrame(frame);
