
import * as THREE from "three";
import "./style.css";

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="game">
    <header class="topbar">
      <div>
        <p class="eyebrow">START.NG ARCADE</p>
        <h1>Coin Quest</h1>
      </div>
      <div class="player-info">
        <div id="avatar" class="avatar">★</div>
        <div><strong id="playerName">Guest Player</strong><small id="connection">Local play</small></div>
      </div>
    </header>
    <section class="hud">
      <div><small>COINS</small><strong id="score">0</strong></div>
      <div><small>TIME LEFT</small><strong id="timer">60</strong></div>
      <div><small>PLAYER STYLE</small><strong id="styleName">Default</strong></div>
    </section>
    <div id="scene" class="scene">
      <div class="loading" id="loading">Preparing your world…</div>
    </div>
    <footer class="instructions">
      <p><strong>How to play</strong> — Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys. Collect the golden coins before time runs out.</p>
      <button id="restart" type="button">Restart game</button>
    </footer>
    <p id="message" class="message" role="status">Collect as many coins as you can!</p>
  </div>
  <iframe id="startngConnect" title="Start.ng player connection" hidden></iframe>
`;

const sceneElement = document.querySelector("#scene");
const scoreElement = document.querySelector("#score");
const timerElement = document.querySelector("#timer");
const playerNameElement = document.querySelector("#playerName");
const connectionElement = document.querySelector("#connection");
const styleNameElement = document.querySelector("#styleName");
const messageElement = document.querySelector("#message");

const DEFAULT_STYLE = {
  body: "female",
  primaryColor: "#a55eea",
  secondaryColor: "#2b2f4a",
  skinColor: "#c68642",
  hairColor: "#17120f",
  hair: "braids",
  hat: "none",
  accessory: "none",
};

let playerStyle = { ...DEFAULT_STYLE };
let playerName = "Guest Player";
let playerId = null;
let score = 0;
let secondsLeft = 60;
let playing = true;
let coins = [];
let lastTime = 0;
let elapsed = 0;
let roundEnded = false;
let player;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#bfe8ff");
scene.fog = new THREE.Fog("#bfe8ff", 22, 48);

const camera = new THREE.PerspectiveCamera(
  48,
  sceneElement.clientWidth / sceneElement.clientHeight || 1,
  0.1,
  100
);
camera.position.set(0, 17, 15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(sceneElement.clientWidth, sceneElement.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
sceneElement.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight("#ffffff", "#58705d", 2));

const sunlight = new THREE.DirectionalLight("#ffffff", 3);
sunlight.position.set(-6, 12, 8);
sunlight.castShadow = true;
scene.add(sunlight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(26, 20),
  new THREE.MeshStandardMaterial({ color: "#77c878", roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// A subtle grid helps the player judge movement and distance.
const grid = new THREE.GridHelper(26, 26, "#4d9e68", "#6ab875");
grid.position.y = 0.015;
scene.add(grid);

// Decorative trees around the edges of the play area.
function addTree(x, z) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 0.9, 7),
    new THREE.MeshStandardMaterial({ color: "#87512f" })
  );
  trunk.position.y = 0.45;
  trunk.castShadow = true;
  tree.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.SphereGeometry(0.58, 9, 7),
    new THREE.MeshStandardMaterial({ color: "#23834c", roughness: 1 })
  );
  leaves.position.y = 1.15;
  leaves.castShadow = true;
  tree.add(leaves);
  tree.position.set(x, 0, z);
  scene.add(tree);
}

[[-11, -8], [-8, -8], [-4, -8], [0, -8], [4, -8], [8, -8], [11, -8],
 [-11, 8], [-7, 8], [-3, 8], [2, 8], [7, 8], [11, 8]].forEach(
  ([x, z]) => addTree(x, z)
);

function material(color, roughness = 0.75) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function addPart(group, geometry, color, position, scale = null) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// Build the 3D avatar directly from the player's Start.ng character style.
function buildCharacter(style) {
  const avatar = new THREE.Group();
  const female = style.body === "female";

  const skin = style.skinColor || DEFAULT_STYLE.skinColor;
  const hair = style.hairColor || DEFAULT_STYLE.hairColor;
  const top = style.primaryColor || DEFAULT_STYLE.primaryColor;
  const bottoms = style.secondaryColor || DEFAULT_STYLE.secondaryColor;

  // Legs and shoes.
  for (const side of [-1, 1]) {
    addPart(avatar, new THREE.CylinderGeometry(0.12, 0.13, 0.65, 9),
      bottoms, [side * 0.16, 0.48, 0]);
    addPart(avatar, new THREE.BoxGeometry(0.22, 0.13, 0.34),
      "#343747", [side * 0.16, 0.12, 0.07]);
  }

  // Torso and arms.
  addPart(avatar,
    new THREE.CylinderGeometry(female ? 0.28 : 0.31, 0.34, 0.72, 12),
    top, [0, 1.18, 0]);

  for (const side of [-1, 1]) {
    const arm = addPart(avatar,
      new THREE.CylinderGeometry(0.085, 0.1, 0.57, 8),
      top, [side * 0.39, 1.19, 0]);
    arm.rotation.z = side * -0.18;
    addPart(avatar, new THREE.SphereGeometry(0.11, 10, 8),
      skin, [side * 0.44, 0.88, 0.02]);
  }

  // Head and face.
  addPart(avatar, new THREE.SphereGeometry(0.28, 16, 12),
    skin, [0, 1.88, 0.02], [0.9, 1.08, 0.9]);

  // Eyes.
  for (const side of [-1, 1]) {
    addPart(avatar, new THREE.SphereGeometry(0.035, 8, 6),
      "#252525", [side * 0.085, 1.91, 0.265]);
  }

  // Hairstyle variations.
  if (style.hair !== "bald") {
    if (style.hair === "afro") {
      addPart(avatar, new THREE.SphereGeometry(0.34, 12, 9),
        hair, [0, 2.12, -0.015], [1.05, 0.86, 1]);
    } else {
      addPart(avatar, new THREE.SphereGeometry(0.285, 12, 9),
        hair, [0, 2.07, -0.015], [1.02, 0.48, 0.96]);

      if (style.hair === "bun") {
        addPart(avatar, new THREE.SphereGeometry(0.13, 9, 7),
          hair, [0, 2.28, -0.2]);
      }
      if (style.hair === "ponytail") {
        addPart(avatar, new THREE.SphereGeometry(0.12, 9, 7),
          hair, [0, 1.99, -0.31], [0.8, 1.5, 0.8]);
      }
      if (style.hair === "braids" || style.hair === "dreads") {
        for (const side of [-1, 1]) {
          addPart(avatar, new THREE.CylinderGeometry(0.045, 0.055, 0.42, 7),
            hair, [side * 0.23, 1.86, -0.02]);
        }
      }
    }
  }

  // Hats.
  if (style.hat === "cap") {
    addPart(avatar, new THREE.SphereGeometry(0.29, 12, 8),
      top, [0, 2.16, 0], [1, 0.35, 1]);
    addPart(avatar, new THREE.BoxGeometry(0.34, 0.04, 0.22),
      top, [0, 2.13, 0.23]);
  } else if (style.hat === "beanie") {
    addPart(avatar, new THREE.SphereGeometry(0.29, 12, 8),
      top, [0, 2.18, 0], [1, 0.55, 1]);
  } else if (style.hat === "tophat") {
    addPart(avatar, new THREE.CylinderGeometry(0.17, 0.17, 0.36, 12),
      "#242424", [0, 2.32, 0]);
    addPart(avatar, new THREE.CylinderGeometry(0.29, 0.29, 0.05, 12),
      "#242424", [0, 2.12, 0]);
  } else if (style.hat === "crown") {
    addPart(avatar, new THREE.CylinderGeometry(0.22, 0.25, 0.17, 8),
      "#f7c948", [0, 2.24, 0]);
    for (let i = 0; i < 5; i++) {
      addPart(avatar, new THREE.SphereGeometry(0.045, 7, 6),
        "#fff0a6", [-0.17 + i * 0.085, 2.35, 0]);
    }
  }

  // Accessories.
  if (style.accessory === "glasses") {
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.016, 6, 12),
        material("#20232a")
      );
      lens.position.set(side * 0.085, 1.91, 0.278);
      avatar.add(lens);
    }
  } else if (style.accessory === "earrings") {
    for (const side of [-1, 1]) {
      addPart(avatar, new THREE.TorusGeometry(0.045, 0.012, 6, 12),
        "#f7c948", [side * 0.25, 1.78, 0.04]);
    }
  } else if (style.accessory === "beard") {
    addPart(avatar, new THREE.SphereGeometry(0.17, 10, 8),
      hair, [0, 1.75, 0.13], [0.9, 0.55, 0.55]);
  } else if (style.accessory === "scarf") {
    addPart(avatar, new THREE.TorusGeometry(0.24, 0.065, 7, 12),
      "#e74c3c", [0, 1.52, 0]);
  } else if (style.accessory === "backpack") {
    addPart(avatar, new THREE.BoxGeometry(0.35, 0.4, 0.17),
      "#e67e22", [0, 1.25, -0.28]);
  }

  return avatar;
}

function setCharacterStyle(style) {
  if (!style) return;
  playerStyle = { ...DEFAULT_STYLE, ...style };

  if (player) {
    scene.remove(player);
    player.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
        if (object.material) object.material.dispose();
      }
    });
  }

  player = buildCharacter(playerStyle);
  player.position.set(0, 0, 0);
  scene.add(player);

  const shortStyle = [
    playerStyle.body,
    playerStyle.hair,
    playerStyle.hat !== "none" ? playerStyle.hat : "",
    playerStyle.accessory !== "none" ? playerStyle.accessory : "",
  ].filter(Boolean).join(" · ");

  styleNameElement.textContent = shortStyle || "Default";
  document.querySelector("#avatar").style.background = playerStyle.primaryColor;
}

function randomPosition() {
  return {
    x: THREE.MathUtils.randFloat(-9.5, 9.5),
    z: THREE.MathUtils.randFloat(-6.5, 6.5),
  };
}

function createCoin() {
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.09, 20),
    new THREE.MeshStandardMaterial({
      color: "#ffd447",
      metalness: 0.65,
      roughness: 0.25,
      emissive: "#684600",
      emissiveIntensity: 0.25,
    })
  );
  const position = randomPosition();
  coin.position.set(position.x, 0.55, position.z);
  coin.rotation.x = Math.PI / 2;
  coin.castShadow = true;
  scene.add(coin);
  coins.push(coin);
}

function clearCoins() {
  for (const coin of coins) {
    scene.remove(coin);
    coin.geometry.dispose();
    coin.material.dispose();
  }
  coins = [];
}

function updateScore() {
  scoreElement.textContent = String(score);
}

function resetGame() {
  clearCoins();
  score = 0;
  secondsLeft = 60;
  elapsed = 0;
  playing = true;
  roundEnded = false;
  lastTime = performance.now();
  player.position.set(0, 0, 0);
  updateScore();
  timerElement.textContent = "60";
  messageElement.textContent = "Collect as many coins as you can!";
  for (let i = 0; i < 10; i++) createCoin();
}

function finishGame() {
  if (roundEnded) return;
  roundEnded = true;
  playing = false;
  messageElement.textContent = `Time's up! You collected ${score} coins. Saving your score…`;
  sendStartngMessage({ type: "startng:score", score }, (reply) => {
    if (reply?.ok) {
      messageElement.textContent = `Round complete! ${score} coins collected. Your score was sent to Start.ng.`;
    } else {
      messageElement.textContent = `Round complete! ${score} coins collected. ${reply?.error || "Sign in on Start.ng to save your score."}`;
    }
  });
}

const keys = new Set();
window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }
  keys.add(event.key.toLowerCase());
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

function movePlayer(delta) {
  if (!playing || !player) return;

  const direction = new THREE.Vector3(
    Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft")),
    0,
    Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup"))
  );

  if (direction.lengthSq() > 0) {
    direction.normalize();
    player.position.x += direction.x * delta * 5.3;
    player.position.z += direction.z * delta * 5.3;
    player.position.x = THREE.MathUtils.clamp(player.position.x, -11.5, 11.5);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -7.2, 7.2);
    player.rotation.y = Math.atan2(direction.x, direction.z);
  }
}

function checkCoins() {
  if (!player || !playing) return;

  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    coin.rotation.z += 0.035;
    coin.position.y = 0.55 + Math.sin(elapsed * 3 + i) * 0.08;

    if (coin.position.distanceTo(player.position) < 0.85) {
      scene.remove(coin);
      coin.geometry.dispose();
      coin.material.dispose();
      coins.splice(i, 1);
      score++;
      updateScore();
      createCoin();
      messageElement.textContent = "Coin collected! Keep going!";
    }
  }
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - lastTime) / 1000 || 0, 0.05);
  lastTime = now;
  elapsed += delta;

  movePlayer(delta);
  checkCoins();

  if (playing) {
    secondsLeft = Math.max(0, secondsLeft - delta);
    timerElement.textContent = String(Math.ceil(secondsLeft));
    if (secondsLeft <= 0) finishGame();
  }

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  const width = sceneElement.clientWidth;
  const height = sceneElement.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

document.querySelector("#restart").addEventListener("click", resetGame);

// Start.ng connection: request the signed-in player's style from the official /connect page.
const connectFrame = document.querySelector("#startngConnect");
const pendingRequests = new Map();
let requestCounter = 0;

function sendStartngMessage(message, callback = () => {}) {
  const target = connectFrame.contentWindow;
  if (!target) {
    callback({ ok: false, error: "Start.ng connection is not ready." });
    return;
  }

  const requestId = `coin-quest-${++requestCounter}`;
  pendingRequests.set(requestId, callback);

  target.postMessage({ ...message, requestId }, "https://start.ng");

  window.setTimeout(() => {
    if (pendingRequests.has(requestId)) {
      const pending = pendingRequests.get(requestId);
      pendingRequests.delete(requestId);
      pending({ ok: false, error: "No response from Start.ng. Sign in and try on your published game." });
    }
  }, 5000);
}

window.addEventListener("message", (event) => {
  if (event.origin !== "https://start.ng") return;

  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "startng:user") {
    const user = data.user;
    const guest = data.guest;

    if (user) {
      playerId = user.id;
      playerName = user.name || "Player";
      playerNameElement.textContent = playerName;
      connectionElement.textContent = "Connected to Start.ng";
      setCharacterStyle(user.style);
      document.querySelector("#avatar").textContent = "★";
      messageElement.textContent = `Welcome, ${playerName}! Collect the coins!`;
    } else if (guest?.style) {
      playerName = guest.name || "Guest";
      playerNameElement.textContent = playerName;
      connectionElement.textContent = "Guest mode";
      setCharacterStyle(guest.style);
    }

    const callback = pendingRequests.get(data.requestId);
    if (callback) {
      pendingRequests.delete(data.requestId);
      callback(data);
    }
    return;
  }

  const callback = pendingRequests.get(data.requestId);
  if (callback) {
    pendingRequests.delete(data.requestId);
    callback(data);
  }
});

connectFrame.addEventListener("load", () => {
  sendStartngMessage({ type: "startng:whoami" }, (reply) => {
    if (reply?.type !== "startng:user") {
      connectionElement.textContent = "Local play";
      messageElement.textContent = "Playing locally. Sign in on Start.ng to use your character and save scores.";
    }
  });
});

connectFrame.src = "https://start.ng/connect";

setCharacterStyle(DEFAULT_STYLE);
resetGame();
document.querySelector("#loading").remove();
animate();
