// =========================
// Squig Run - game.js (fixed)
// =========================

// ---- DOM refs ----
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const titleScreen = document.getElementById('title-screen');
const retryScreen = document.getElementById('death-screen');
const distanceDisplay = document.getElementById('distance-display'); // shows final distance
const retryBtn = document.getElementById('retryBtn');

const settingsScreen = document.getElementById('settings-screen');
const settingsBtn = document.getElementById('settingsBtn');
const backBtn = document.getElementById('backBtn');
const difficultySlider = document.getElementById('difficultySlider');
const difficultyValue = document.getElementById('difficultyValue');

const hud = document.getElementById('hud');       // wrapper (we toggle visibility)
const hudScore = document.getElementById('hudScore');  // "Score: Xm"
const hudBest = document.getElementById('hudBest');   // "Best: Ym"

const pauseScreen = document.getElementById('pause-screen');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');    // optional
const pauseSpeed = document.getElementById('pause-speed');   // optional
const pauseTraps = document.getElementById('pause-traps');   // optional
const tipDisplay = document.getElementById('tip-display');   // optional

// initials / leaderboard overlay (optional)
const scoreEntry = document.getElementById('score-entry');
const finalScoreEl = document.getElementById('finalScore');
const initialsForm = document.getElementById('initialsForm');
const initialsInput = document.getElementById('initials');
const skipSaveBtn = document.getElementById('skipSave');

const leaderList = document.getElementById('leaderList');  // optional title list

// ---- game state ----
let gameStarted = false;
let gameOver = false;
let isPaused = false;

const gravity = 0.25;
const jumpForce = -10;

let speed = parseFloat(difficultySlider.value);
let distance = 0;                 // <-- score (meters)
let lastChunk = 0;                 // for deterministic speed ramp (every 1000m)

let keys = { jump: false };

// ---- assets ----
const squigImg = new Image(); squigImg.src = 'img/squig.png';
const bgImg = new Image(); bgImg.src = 'img/bg.png';
const mineImg = new Image(); mineImg.src = 'img/mine.png';

let bgX = 0;

const squig = { x: 100, y: 325, radius: 25, dy: 0, onGround: true };
const floorY = 350;

let traps = [];
let trapCooldown = 0;
let safeStartFrames = 150; // grace period before first trap

// ---- tips (optional) ----
const tips = [
    "Tip: Press Space to jump over mines!",
    "Watch out! Speed increases every 1000m.",
    "Pause with ESC anytime.",
    "Try slower speeds if new!"
];

// ---- leaderboard helpers ----
const LB_KEY = 'squigrun.leaderboard';
const LB_SIZE = 5;

function loadLB() {
    try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
    catch { return []; }
}
function saveLB(lb) { localStorage.setItem(LB_KEY, JSON.stringify(lb.slice(0, LB_SIZE))); }
function bestFromLB(lb) { return lb.length ? lb[0].score : 0; }
function addScoreToLB(name, score) {
    const lb = loadLB();
    lb.push({ name, score });
    lb.sort((a, b) => b.score - a.score);
    saveLB(lb);
    renderLB();
    return lb;
}
function qualifies(score) {
    const lb = loadLB();
    if (lb.length < LB_SIZE) return true;
    return score > lb[lb.length - 1].score;
}
function renderLB() {
    if (!leaderList) return;
    const lb = loadLB();
    leaderList.innerHTML = '';
    lb.slice(0, LB_SIZE).forEach(e => {
        const li = document.createElement('li');
        li.textContent = `${e.name.padEnd(3, ' ')} – ${e.score}m`;
        leaderList.appendChild(li);
    });
}
renderLB();

// ---- utils ----
function getMaxTrapCount() {
    if (speed < 3) return 1;
    if (speed < 6) return 2;
    return 3;
}
function showRandomTip() {
    if (!tipDisplay) return;
    tipDisplay.textContent = tips[Math.floor(Math.random() * tips.length)];
}

// ---- traps ----
function spawnTrap() {
    const trapSize = 40;
    const spawnX = canvas.width + 100;
    const pattern = Math.floor(Math.random() * getMaxTrapCount()) + 1;
    for (let i = 0; i < pattern; i++) {
        traps.push({
            x: spawnX + i * (trapSize + 10),
            y: floorY - trapSize,
            width: trapSize,
            height: trapSize
        });
    }
}

// ---- input ----
// NOTE: prevent default on Space/ArrowUp to avoid page scroll stealing focus.
document.addEventListener('keydown', (e) => {
    if (["ArrowUp", "Space", "KeyW"].includes(e.code)) {
        e.preventDefault();
        keys.jump = true;
    }

    // Pause toggle
    if (e.code === "Escape" && gameStarted && !gameOver) {
        isPaused = !isPaused;
        pauseScreen.style.display = isPaused ? 'flex' : 'none';
        if (isPaused) showRandomTip();
        if (!isPaused) requestAnimationFrame(update);
    }
});

document.addEventListener('keyup', (e) => {
    if (["ArrowUp", "Space", "KeyW"].includes(e.code)) {
        e.preventDefault();
        keys.jump = false;
    }
});

// ---- menu buttons ----
titleScreen.addEventListener('click', (e) => {
    if (e.target.id === 'startBtn') {
        document.body.classList.remove('main-menu');   // 🔹 remove menu background
        canvas.style.display = 'block';                // 🔹 show canvas now
        resetGame();
        gameStarted = true;
        titleScreen.style.display = 'none';
        retryScreen.style.display = 'none';
        if (hud) hud.style.display = 'block';
        requestAnimationFrame(update);
    }
});

settingsBtn.addEventListener('click', () => {
    titleScreen.style.display = 'none';
    settingsScreen.style.display = 'flex';
    if (hud) hud.style.display = 'none';
});
backBtn.addEventListener('click', () => {
    settingsScreen.style.display = 'none';
    titleScreen.style.display = 'flex';
    if (hud) hud.style.display = 'none';
});

// 🔹 Back to Games button (safe guard)
const backToGamesBtn = document.getElementById('backToGames');
if (backToGamesBtn) {
  backToGamesBtn.addEventListener('click', () => {
    window.location.href = '../index.html'; // adjust if needed
  });
}

difficultySlider.addEventListener('input', () => {
    difficultyValue.textContent = difficultySlider.value;
    speed = parseFloat(difficultySlider.value);
    if (pauseSpeed) pauseSpeed.textContent = speed.toFixed(2);
});

retryBtn.addEventListener('click', () => {
    resetGame();
    retryScreen.style.display = 'none';
    if (hud) hud.style.display = 'block';
    requestAnimationFrame(update);
});

if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
        if (gameStarted && !gameOver) {
            isPaused = false;
            pauseScreen.style.display = 'none';
            requestAnimationFrame(update);
        }
    });
}
if (restartBtn) {
    restartBtn.addEventListener('click', () => {
        resetGame();
        pauseScreen.style.display = 'none';
        if (hud) hud.style.display = 'block';
        requestAnimationFrame(update);
    });
}

// ---- initials / save score (optional) ----
if (initialsForm) {
    initialsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const scoreNow = Math.floor(distance);
        let name = (initialsInput.value || 'YOU').toUpperCase().slice(0, 3);
        addScoreToLB(name, scoreNow);
        scoreEntry.style.display = 'none';
        retryScreen.style.display = 'flex';
    });
}
if (skipSaveBtn) {
    skipSaveBtn.addEventListener('click', () => {
        scoreEntry.style.display = 'none';
        retryScreen.style.display = 'flex';
    });
}

// ---- game loop ----
function update() {
    if (!gameStarted || isPaused) return;

    if (!gameOver) {
        // Background scroll
        bgX -= speed * 0.5;
        if (bgX <= -canvas.width) bgX = 0;

        // Physics
        squig.dy += gravity;
        squig.y += squig.dy;

        // Floor
        if (squig.y + squig.radius >= floorY) {
            squig.y = floorY - squig.radius;
            squig.dy = 0;
            squig.onGround = true;
        } else {
            squig.onGround = false;
        }

        // Jump
        if (keys.jump && squig.onGround) {
            squig.dy = jumpForce;
            squig.onGround = false;
        }

        // Traps move
        for (let trap of traps) trap.x -= speed;

        // Cull off-screen
        traps = traps.filter(trap => trap.x + trap.width > 0);

        // Spawn after safe start
        if (safeStartFrames <= 0) {
            if (trapCooldown <= 0 && Math.random() < 0.02) {
                spawnTrap();
                trapCooldown = 100 + Math.random() * 100;
            } else {
                trapCooldown--;
            }
        } else {
            safeStartFrames--;
        }

        // Collision
        for (let trap of traps) {
            const inX = squig.x + squig.radius > trap.x && squig.x - squig.radius < trap.x + trap.width;
            const inY = squig.y + squig.radius > trap.y && squig.y - squig.radius < trap.y + trap.height;
            if (inX && inY) {
                gameOver = true;

                const scoreNow = Math.floor(distance);
                if (distanceDisplay) distanceDisplay.textContent = `Distance: ${scoreNow}m`;

                // Optional initials entry
                if (qualifies(scoreNow) && scoreEntry && finalScoreEl) {
                    finalScoreEl.textContent = scoreNow;
                    initialsInput.value = '';
                    scoreEntry.style.display = 'flex';
                } else {
                    retryScreen.style.display = 'flex';
                }
            }
        }

        // ---- scoring + deterministic ramp (outside collision loop) ----
        distance += speed;

        const thousandChunks = Math.floor(distance / 1000);
        if (thousandChunks > lastChunk) {
            speed += 0.25;               // increase speed once per 1000m
            lastChunk = thousandChunks;
            if (pauseSpeed) pauseSpeed.textContent = speed.toFixed(2);
        }

        // HUD live update
        if (hudScore) hudScore.textContent = `Score: ${Math.floor(distance)}m`;
        if (hudBest) hudBest.textContent = `Best: ${bestFromLB(loadLB())}m`;
    }

    draw();
    if (!gameOver) requestAnimationFrame(update);
}

// ---- render ----
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;

    // Background tiles
    ctx.drawImage(bgImg, bgX, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImg, bgX + canvas.width, 0, canvas.width, canvas.height);

    // Ground Drawing
    //ctx.fillStyle = '#3a1e0b';
    //ctx.fillRect(0, floorY, canvas.width, canvas.height - floorY);

    // Player
    ctx.drawImage(
        squigImg,
        squig.x - squig.radius,
        squig.y - squig.radius,
        squig.radius * 2,
        squig.radius * 2
    );

    // Traps
    for (let trap of traps) {
        ctx.drawImage(mineImg, trap.x, trap.y, trap.width, trap.height);
    }

    // Fallback pause tint (if overlay hidden)
    if (isPaused) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '24px monospace';
        ctx.fillText('Paused', canvas.width / 2 - 40, canvas.height / 2);
    }
}

// ---- reset ----
function resetGame() {
    // Player
    squig.x = 100;
    squig.y = 325;
    squig.dy = 0;
    squig.onGround = true;

    // World
    safeStartFrames = 150;
    trapCooldown = 0;
    traps = [];
    bgX = 0;

    // State
    gameOver = false;
    isPaused = false;
    distance = 0;
    lastChunk = 0;
    speed = parseFloat(difficultySlider.value);
    difficultyValue.textContent = difficultySlider.value;

    // UI
    if (pauseScreen) pauseScreen.style.display = 'none';
    if (hud) hud.style.display = 'none'; // hidden until Start
    if (hudScore) hudScore.textContent = 'Score: 0m';
    if (hudBest) hudBest.textContent = `Best: ${bestFromLB(loadLB())}m`;
}

// ====== Existing button listeners ======
// startBtn.addEventListener(...);
// settingsBtn.addEventListener(...);
// resumeBtn.addEventListener(...);
// etc...

// ====== Main Menu link behavior ======
document.querySelectorAll('.menu-link').forEach(el => {
  el.addEventListener('click', (ev) => {
    ev.preventDefault();
    // go back to title screen, hide game
    gameStarted = false;
    isPaused = false;
    pauseScreen.style.display = 'none';
    retryScreen.style.display = 'none';
    titleScreen.style.display = 'flex';
    canvas.style.display = 'none';            // 🔹 hide canvas
    if (hud) hud.style.display = 'none';
    document.body.classList.add('main-menu'); // 🔹 bring back menu background
  });
});

// ====== Main Menu link behavior ======
document.querySelectorAll('.menu-link').forEach(el => {
  el.addEventListener('click', (ev) => {
    ev.preventDefault();
    // go back to title screen, hide game
    gameStarted = false;
    isPaused = false;
    pauseScreen.style.display = 'none';
    retryScreen.style.display = 'none';
    titleScreen.style.display = 'flex';
    canvas.style.display = 'none';            // 🔹 hide canvas
    if (hud) hud.style.display = 'none';
    document.body.classList.add('main-menu'); // 🔹 bring back menu background
  });
});

// Prime HUD/State on load
resetGame();
