(function () {
  const COIN_SAVE_KEY = "ar-farm:coins";
  const STARTING_COINS = 100;
  const MIN_COST = Math.min(...Object.values(window.CROP_TYPES).map((crop) => crop.cost));

  const state = {
    selectedCrop: "wheat",
    coins: loadCoins()
  };

  window.ARFarmUI = {
    get selectedCrop() {
      return state.selectedCrop;
    },
    spend,
    addCoins,
    showMessage
  };

  window.selectCrop = function selectCrop(cropId) {
    if (!window.CROP_TYPES[cropId]) return;
    state.selectedCrop = cropId;
    document.querySelectorAll(".crop-button").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.crop === cropId);
    });
    showMessage(`${window.CROP_TYPES[cropId].name} selected`);
  };

  document.addEventListener("DOMContentLoaded", () => {
    updateCoins(0);
    const startButton = document.querySelector("#start-ar");
    startButton.addEventListener("click", startAR);

    if (window.location.protocol === "file:") {
      showMessage("Do not open with file://. Use Vercel HTTPS or localhost.");
    }
  });

  function startAR() {
    if (window.location.protocol === "file:") {
      showMessage("file:// blocks AR camera. Open the Vercel URL or http://localhost:8000");
      return;
    }

    if (!window.AFRAME) {
      showMessage("A-Frame did not load. Check internet connection.");
      return;
    }

    if (document.querySelector("a-scene")) return;

    document.body.classList.add("ar-started");
    showMessage("Starting camera...");

    const template = document.querySelector("#scene-template");
    const root = document.querySelector("#ar-root");
    root.appendChild(template.content.cloneNode(true));

    window.ARFarm.init();

    const marker = document.querySelector("#farm-marker");
    marker.addEventListener("markerFound", () => showMessage("Farm marker found"));
    marker.addEventListener("markerLost", () => showMessage("Point camera back at marker"));
    showMessage("Allow camera, then point at Hiro marker");
  }

  function spend(amount) {
    if (state.coins < amount) {
      if (state.coins < MIN_COST) {
        state.coins = STARTING_COINS;
        updateCoins(0);
        showMessage("Coins reset to 100");
      }
      if (state.coins >= amount) {
        updateCoins(-amount);
        return true;
      }
      return false;
    }
    updateCoins(-amount);
    return true;
  }

  function addCoins(amount) {
    updateCoins(amount);
  }

  function updateCoins(delta) {
    state.coins = Math.max(0, state.coins + delta);
    document.querySelector("#coins").textContent = state.coins.toString();
    localStorage.setItem(COIN_SAVE_KEY, state.coins.toString());
  }

  function showMessage(text) {
    document.querySelector("#message").textContent = text;
  }

  function loadCoins() {
    const saved = Number(localStorage.getItem(COIN_SAVE_KEY));
    if (!Number.isFinite(saved) || saved < MIN_COST) return STARTING_COINS;
    return saved;
  }
})();
