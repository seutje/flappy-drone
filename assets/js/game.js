(function() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  const DEBUG = true; // set to false to hide FPS counter
  let fps = 0;

  const PIPE_SPACING = 600; // fixed horizontal distance between pipes in pixels
  const CROSS_TIME = 5000; // ms for a pipe to travel across the screen
  let PIPE_SPEED = canvas.width / CROSS_TIME; // px per ms
  let PIPE_INTERVAL = PIPE_SPACING / PIPE_SPEED; // ms

  const CLOUD_COUNT = isMobile ? 4 : 8;
  let clouds = [];
  function initClouds() {
    clouds = [];
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const scale = 0.5 + Math.random() * 0.5;
      clouds.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.5,
        width: 60 * scale,
        height: 40 * scale,
        speed: 0.02 + Math.random() * 0.05
      });
    }
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    PIPE_SPEED = canvas.width / CROSS_TIME;
    PIPE_INTERVAL = PIPE_SPACING / PIPE_SPEED;
    initClouds();
  }
  window.addEventListener('resize', resize);
  resize();

  const droneImg = new Image();
  droneImg.src = 'assets/images/sprite-drone.png';
  const FRAME_WIDTH = 350;
  const FRAME_HEIGHT = 240;
  const FRAME_GAP_X = 50;
  const FRAME_GAP_Y = 30;
  const FRAME_MARGIN_LEFT = 15;
  const FRAME_MARGIN_TOP = 28;
  const FRAMES = 3;
  const ANIM_SPEED = 120; // ms between frames

  const GRAVITY = 0.5;
  const JUMP = -8; // reduced jump power
  const FAST_TAP_INTERVAL = 200; // ms
  const FAST_TAP_MULTIPLIER = 1.5;
  const BASE_GAP = 140; // smallest gap after difficulty ramps
  const INITIAL_GAP_MULTIPLIER = 2;
  const GAP_DURATION = 60000; // ms for gap to shrink to BASE_GAP
  let gameStartTime = performance.now();

  function getCurrentGap() {
    const progress = Math.min((performance.now() - gameStartTime) / GAP_DURATION, 1);
    return BASE_GAP * INITIAL_GAP_MULTIPLIER - (BASE_GAP * (INITIAL_GAP_MULTIPLIER - 1) * progress);
  }
  const PIPE_WIDTH = 60;

  // --- Audio Setup ---
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let audioCtx;
  let masterGain;
  let audioStarted = false;
  let musicStartTimeout;

  const melodyNotes = [
    261.63, 293.66, 329.63, 392.00, 349.23, 329.63, 293.66, 261.63,
    329.63, 349.23, 392.00, 440.00, 493.88, 440.00, 392.00, 349.23,
    523.25, 493.88, 440.00, 392.00, 349.23, 329.63, 293.66, 261.63,
    392.00, 440.00, 493.88, 523.25, 587.33, 523.25, 493.88, 440.00,
    329.63, 392.00, 523.25, 659.25, 587.33, 493.88, 392.00, 329.63,
    349.23, 440.00, 587.33, 523.25, 493.88, 440.00, 392.00, 349.23,
    329.63, 261.63, 293.66, 349.23, 329.63, 392.00, 349.23, 440.00,
    392.00, 349.23, 293.66, 246.94, 261.63, 329.63, 349.23, 392.00
  ]; // 64-note melody with varied phrases
  const NOTE_DURATION = 0.3; // seconds
  const SETS = 1;
  const MEASURE_LEN = 8; // kick/snare pattern length
  let snareBuffer = null;

  function scheduleNote(freq, time, duration) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain).connect(masterGain);
    osc.start(time);
    osc.stop(time + duration);
  }

  function scheduleKick(time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.3);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(gain).connect(masterGain);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  function scheduleSnare(time) {
    if (!snareBuffer) {
      snareBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
      const data = snareBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    const noise = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    noise.buffer = snareBuffer;
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    noise.connect(gain).connect(masterGain);
    noise.start(time);
    noise.stop(time + 0.2);
  }

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);
    }
    audioCtx.resume();
  }

  function playTapSound() {
    ensureAudio();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  function playDeathSound() {
    ensureAudio();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.6);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain).connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  function playMelody() {
    const start = audioCtx.currentTime + 0.05;
    const totalNotes = melodyNotes.length * SETS;
    for (let i = 0; i < totalNotes; i++) {
      const t = start + i * NOTE_DURATION;
      scheduleNote(melodyNotes[i % melodyNotes.length], t, NOTE_DURATION * 0.9);
      if (i % MEASURE_LEN === 0) scheduleKick(t);
      if (i % MEASURE_LEN === 4) scheduleSnare(t);
    }
    setTimeout(playMelody, totalNotes * NOTE_DURATION * 1000);
  }

  function startMusic() {
    ensureAudio();
    if (!audioStarted) {
      playMelody();
      audioStarted = true;
    }
  }

  let lastPipeTime = 0;
  let pipes = [];
  let drone = { x: canvas.width * 0.25, y: canvas.height/2, vy: 0, width: 80, height: 64, hitbox: { x: 0, y: 0, width: 0, height: 0 } };
  function updateHitbox() {
    const scaleX = drone.width / FRAME_WIDTH;
    const scaleY = drone.height / FRAME_HEIGHT;
    const padX = 10 * scaleX;
    const padY = 5 * scaleY;
    drone.hitbox.x = drone.x + padX;
    drone.hitbox.y = drone.y + padY;
    drone.hitbox.width = drone.width - padX * 2;
    drone.hitbox.height = drone.height - padY * 2;
  }
  let score = 0;
  let state = 'intro'; // intro, playing, dead
  let frame = 0;
  let frameTime = 0;
  let lastTapTime = 0;
  let paused = false;

  function loadScores() {
    try {
      const data = JSON.parse(localStorage.getItem('flappyDronehighScores') || '[]');
      if (!Array.isArray(data)) return [];
      return data
        .map(item => {
          if (typeof item === 'number') {
            return { name: 'FlappyDrone', score: item };
          }
          if (typeof item === 'object' && item !== null) {
            const s = Number(item.score);
            if (isNaN(s)) return null;
            return { name: String(item.name || 'FlappyDrone'), score: s };
          }
          const s = Number(item);
          return isNaN(s) ? null : { name: 'FlappyDrone', score: s };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } catch (e) {
      return [];
    }
  }

  function recordHighScore(newScore) {
    const scoreNum = Number(newScore) || 0;
    const qualifies =
      highScores.length < 5 || scoreNum > highScores[highScores.length - 1].score;
    if (!qualifies) return;
    let name = 'FlappyDrone';
    if (typeof prompt === 'function') {
      const entered = prompt('New High Score! Enter your name:', 'FlappyDrone');
      if (entered !== null && entered.trim()) name = entered.trim();
    }
    highScores.push({ name, score: scoreNum });
    highScores.sort((a, b) => b.score - a.score);
    highScores = highScores.slice(0, 5);
    try {
      localStorage.setItem('flappyDronehighScores', JSON.stringify(highScores));
    } catch (e) {}
  }

  let highScores = loadScores();

  let startedOnce = false;

  function start() {
    if (startedOnce) {
      pipes = [];
      // Repopulate pipes on restart so the first is within 400px of the drone
      populatePipes();
    }
    startedOnce = true;
    drone.y = canvas.height/2;
    gameStartTime = performance.now();
    drone.vy = 0;
    lastPipeTime = performance.now();
    score = 0;
    state = 'playing';
    frame = 0;
    frameTime = 0;
    if (musicStartTimeout) clearTimeout(musicStartTimeout);
    musicStartTimeout = setTimeout(startMusic, 1000);
  }

  function drawGameOver() {
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('Game Over', canvas.width/2, canvas.height/2 - 40);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Tap to Restart', canvas.width/2, canvas.height/2 - 5);
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('High Scores', canvas.width/2, canvas.height/2 + 30);
    highScores.forEach((entry, i) => {
      ctx.fillText(`${i + 1}. ${entry.name} - ${entry.score}`,
                  canvas.width/2,
                  canvas.height/2 + 60 + i * 22);
    });
  }

  function drawIntro() {
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('FLAPPY DRONE', canvas.width/2, canvas.height/2 - 40);
    ctx.font = '24px sans-serif';
    ctx.fillText('Tap to Start', canvas.width/2, canvas.height/2);
    ctx.font = '16px sans-serif';
    ctx.fillText('Tap or click to fly. Avoid obstacles.',
                canvas.width/2,
                canvas.height/2 + 30);
  }

  function reset() {
    playDeathSound();
    recordHighScore(score);
    state = 'dead';
    frame = 0;
    frameTime = 0;
  }

  function handleInput() {
    playTapSound();
    const now = performance.now();
    if (state !== 'playing') { lastTapTime = now; start(); return; }
    if (now - lastTapTime < FAST_TAP_INTERVAL) {
      drone.vy = JUMP * FAST_TAP_MULTIPLIER;
    } else {
      drone.vy = JUMP;
    }
    lastTapTime = now;
  }

  canvas.addEventListener('pointerdown', handleInput);

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (!paused) {
      last = performance.now();
    }
  });

  function addPipe(x = canvas.width) {
    const gap = getCurrentGap();
    const topHeight = 50 + Math.random() * (canvas.height - gap - 100);
    pipes.push({ x, top: topHeight, gap, scored: false });
  }

  function populatePipes() {
    const spacing = PIPE_SPACING;
    let x = Math.min(drone.x + 400, canvas.width);
    for (; x < canvas.width; x += spacing) {
      addPipe(x);
    }
  }

  // Populate pipes on page load so obstacles appear immediately
  populatePipes();

  function update(delta) {
    clouds.forEach(c => {
      c.x -= c.speed * delta;
      if (c.x + c.width < 0) {
        c.x = canvas.width;
        c.y = Math.random() * canvas.height * 0.5;
      }
    });
    if (state === 'intro') return;

    if (state === 'playing') {
      if (performance.now() - lastPipeTime > PIPE_INTERVAL) {
        addPipe();
        lastPipeTime = performance.now();
      }
      frameTime += delta;
      if (frameTime > ANIM_SPEED) {
        frame = (frame + 1) % FRAMES;
        frameTime = 0;
      }
      drone.vy += GRAVITY;
      drone.y += drone.vy;
      updateHitbox();

      if (drone.hitbox.y + drone.hitbox.height > canvas.height || drone.hitbox.y < 0) {
        reset();
        return;
      }

        for (let i = pipes.length - 1; i >= 0; i--) {
          const p = pipes[i];
          p.x -= delta * PIPE_SPEED; // pipe speed
          if (p.x < drone.hitbox.x + drone.hitbox.width && p.x + PIPE_WIDTH > drone.hitbox.x) {
            if (drone.hitbox.y < p.top || drone.hitbox.y + drone.hitbox.height > p.top + p.gap) {
              reset();
              return;
            }
          }
          if (!p.scored && p.x + PIPE_WIDTH < drone.hitbox.x) {
            score++;
            p.scored = true;
          }
          if (p.x + PIPE_WIDTH < 0) {
            pipes.splice(i, 1);
          }
        }
    } else if (state === 'dead') {
      frameTime += delta;
      if (frameTime > ANIM_SPEED && frame < FRAMES - 1) {
        frame++;
        frameTime = 0;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw clouds
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    clouds.forEach(c => {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.width / 2, c.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // Draw drone
    if (droneImg.complete) {
      const row = state === 'dead' ? 1 : 0;
      const sx = (row > 0 ? FRAME_MARGIN_LEFT : 0) +
                 frame * (FRAME_WIDTH + FRAME_GAP_X);
      const sy = row * (FRAME_HEIGHT + FRAME_GAP_Y) +
                 (row === 1 ? FRAME_MARGIN_TOP : 0);
      ctx.drawImage(droneImg, sx, sy, FRAME_WIDTH, FRAME_HEIGHT,
                   drone.x, drone.y, drone.width, drone.height);
    }
    ctx.fillStyle = '#3a5f0b';
    ctx.beginPath();
    pipes.forEach(p => {
      ctx.rect(p.x, 0, PIPE_WIDTH, p.top);
      ctx.rect(p.x, p.top + p.gap, PIPE_WIDTH, canvas.height - p.top - p.gap);
    });
    ctx.fill();
    // Score
    if (DEBUG) {
      ctx.fillStyle = '#000';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(fps)} FPS`, canvas.width / 2, 20);
    }
    ctx.fillStyle = '#000';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 10, 30);
  }

  const MAX_FPS = isMobile ? 45 : 60;
  const FRAME_MIN = 1000 / MAX_FPS;

  let last = performance.now();
  function loop(now) {
    if (paused) {
      last = now;
      window.requestAnimationFrame(loop);
      return;
    }

    const delta = now - last;
    if (delta < FRAME_MIN) {
      window.requestAnimationFrame(loop);
      return;
    }
    fps = 1000 / delta;
    last = now;
    update(delta);
    draw();
    if (state === 'dead') {
      drawGameOver();
    } else if (state === 'intro') {
      drawIntro();
    }
    window.requestAnimationFrame(loop);
  }

  // Start the main loop
  window.requestAnimationFrame(loop);
})();
