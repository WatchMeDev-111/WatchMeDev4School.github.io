const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const titleScreen = document.getElementById('title-screen');
const retryScreen = document.getElementById('death-screen');
const retryBtn = document.getElementById('retryBtn');
const distanceDisplay = document.getElementById('distance-display');

let gameStarted = false;
let gameOver = false;

let speed = 6; // Faster 
const gravity = 0.25;
const jumpForce = -10;
let distance = 0;

let keys = {
    jump: false
};

const squigImg = new Image();
squigImg.src = 'squig.png';

const bgImg = new Image();
bgImg.src = 'bg.png';
let bgX = 0;

const mineImg = new Image();
mineImg.src = 'mine.png';

const squig = {
    x: 100,
    y: 325,
    radius: 25,
    dy: 0,
    onGround: true
};

const floorY = 350;

let traps = [];
let trapTimer = 0;
let trapCooldown = 80;

function spawnTrap() {
    const trapSize = 40;
    const spawnX = canvas.width + 10;
    traps.push({
        x: spawnX,
        y: floorY - trapSize,
        width: trapSize,
        height: trapSize
    });
}

document.addEventListener('keydown', (e) => {
    if (["ArrowUp", "Space", "KeyW"].includes(e.code)) {
        keys.jump = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (["ArrowUp", "Space", "KeyW"].includes(e.code)) {
        keys.jump = false;
    }
});

titleScreen.addEventListener('click', () => {
    resetGame();
    gameStarted = true;
    titleScreen.style.display = 'none';
    retryScreen.style.display = 'none';
    requestAnimationFrame(update);
});

retryBtn.addEventListener('click', () => {
    resetGame();
    retryScreen.style.display = 'none';
    requestAnimationFrame(update);
});

function update() {
    if (!gameStarted) return;

    if (!gameOver) {
        // Scroll background
        bgX -= speed * 0.5;
        if (bgX <= -canvas.width) bgX = 0;

        // Apply gravity
        squig.dy += gravity;
        squig.y += squig.dy;

        // Floor collision
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

        // Move traps
        for (let trap of traps) {
            trap.x -= speed;
        }
        traps = traps.filter(trap => trap.x + trap.width > 0);

        // Controlled spawn rate
        trapTimer++;
        if (trapTimer >= trapCooldown) {
            trapTimer = 0;
            spawnTrap();
        }

        // Check collisions
        for (let trap of traps) {
            const inX = squig.x + squig.radius > trap.x && squig.x - squig.radius < trap.x + trap.width;
            const inY = squig.y + squig.radius > trap.y && squig.y - squig.radius < trap.y + trap.height;
            if (inX && inY) {
                gameOver = true;
                retryScreen.style.display = 'flex';
            }
        }

        // Update distance and speed
        distance += speed;
        if (distance % 1500 === 0) speed += 0.5;
        distanceDisplay.textContent = `Distance: ${Math.floor(distance)}m`;
    }

    draw();
    if (!gameOver) requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Background
    ctx.drawImage(bgImg, bgX, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImg, bgX + canvas.width, 0, canvas.width, canvas.height);

    // Ground
    ctx.fillStyle = '#3a1e0b';
    ctx.fillRect(0, floorY, canvas.width, canvas.height - floorY);

    // Squig
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
}

function resetGame() {
    squig.x = 100;
    squig.y = 325;
    squig.dy = 0;
    traps = [];
    bgX = 0;
    gameOver = false;
    distance = 0;
    speed = 6;
    distanceDisplay.textContent = 'Distance: 0m';
}
