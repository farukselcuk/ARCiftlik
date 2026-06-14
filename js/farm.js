(function () {
  const FARM_SAVE_KEY = "ar-farm:plots";
  const plots = [];
  let particleRoot = null;

  window.ARFarm = {
    init,
    plantOrHarvest,
    update,
    save,
    plots
  };

  function init() {
    particleRoot = document.querySelector("#farm-root");
    document.querySelectorAll(".plot").forEach((plotEl, index) => {
      const plot = {
        index,
        el: plotEl,
        cropId: null,
        plantedAt: 0,
        cropEl: null,
        stage: 0
      };

      plotEl.addEventListener("click", function (event) {
        event.stopPropagation();
        window.ARFarm.plantOrHarvest(index);
      });

      plots[index] = plot;
    });

    load();
    window.setInterval(update, 500);
    update();
  }

  function plantOrHarvest(index) {
    const plot = plots[index];
    if (!plot) return;

    if (!plot.cropId) {
      const crop = window.CROP_TYPES[window.ARFarmUI.selectedCrop];
      if (!crop) return;

      if (!window.ARFarmUI.spend(crop.cost)) {
        window.ARFarmUI.showMessage("Need more coins");
        return;
      }

      plot.cropId = crop.id;
      plot.plantedAt = Date.now();
      plot.stage = 0;
      refreshCrop(plot);
      save();
      window.ARFarmUI.showMessage(`${crop.name} planted`);
      return;
    }

    const progress = getProgress(plot);
    const crop = window.CROP_TYPES[plot.cropId];
    if (progress < 1) {
      window.ARFarmUI.showMessage(`${crop.name} ${Math.round(progress * 100)}% grown`);
      return;
    }

    window.ARFarmUI.addCoins(crop.reward);
    window.ARFarmUI.showMessage(`+${crop.reward} coins`);
    burstParticles(plot.el.getAttribute("position"));
    clearPlot(plot);
    save();
  }

  function update() {
    const now = Date.now();
    plots.forEach((plot) => {
      if (!plot.cropId) return;

      const progress = getProgress(plot, now);
      const stage = window.getCropStage(progress);
      if (stage !== plot.stage) refreshCrop(plot);

      if (plot.cropEl && progress >= 1) {
        const bob = Math.sin(now * 0.006 + plot.index) * 0.035;
        const position = plot.cropEl.dataset.basePosition || "0 0.22 0";
        const parts = position.split(" ").map(Number);
        plot.cropEl.setAttribute("position", `${parts[0]} ${parts[1] + bob} ${parts[2]}`);
      }
    });
  }

  function getProgress(plot, now) {
    const crop = window.CROP_TYPES[plot.cropId];
    if (!crop) return 0;
    return Math.min(1, ((now || Date.now()) - plot.plantedAt) / crop.growTime);
  }

  function refreshCrop(plot) {
    const progress = getProgress(plot);
    const stage = window.getCropStage(progress);
    if (stage === plot.stage && plot.cropEl) return;

    removeCrop(plot);
    plot.stage = stage;
    plot.cropEl = createCropEntity(plot.cropId, stage);
    plot.el.appendChild(plot.cropEl);
  }

  function createCropEntity(cropId, stage) {
    if (stage === 1) return makeEntity("a-sphere", {
      radius: "0.09",
      color: "#7A4A26",
      position: "0 0.17 0"
    });

    if (stage === 2) return makeEntity("a-cone", {
      "radius-bottom": "0.1",
      "radius-top": "0",
      height: "0.28",
      color: "#47A85F",
      position: "0 0.25 0"
    });

    if (cropId === "corn") return makeCorn();
    if (cropId === "strawberry") return makeStrawberry();
    if (cropId === "sunflower") return makeSunflower();
    return makeWheat();
  }

  function makeWheat() {
    const group = makeEntity("a-entity", { position: "0 0.14 0" });
    group.dataset.basePosition = "0 0.14 0";
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      group.appendChild(makeEntity("a-cylinder", {
        radius: "0.025",
        height: "0.38",
        color: "#F3CE3D",
        position: `${Math.cos(angle) * 0.09} 0.18 ${Math.sin(angle) * 0.09}`,
        rotation: `${Math.sin(angle) * 8} 0 ${Math.cos(angle) * 8}`
      }));
    }
    return group;
  }

  function makeCorn() {
    const group = makeEntity("a-entity", { position: "0 0.15 0" });
    group.dataset.basePosition = "0 0.15 0";
    group.appendChild(makeEntity("a-cylinder", {
      radius: "0.055",
      height: "0.38",
      color: "#31985B",
      position: "0 0.2 0"
    }));
    group.appendChild(makeEntity("a-cylinder", {
      radius: "0.06",
      height: "0.24",
      color: "#FFD84D",
      position: "0.09 0.26 0",
      rotation: "0 0 18"
    }));
    return group;
  }

  function makeStrawberry() {
    const group = makeEntity("a-entity", { position: "0 0.18 0" });
    group.dataset.basePosition = "0 0.18 0";
    group.appendChild(makeEntity("a-sphere", {
      radius: "0.14",
      color: "#E94042",
      scale: "1 0.8 0.9",
      position: "0 0.1 0"
    }));
    group.appendChild(makeEntity("a-cone", {
      "radius-bottom": "0.09",
      height: "0.09",
      color: "#47A85F",
      position: "0 0.22 0",
      rotation: "180 0 0"
    }));
    return group;
  }

  function makeSunflower() {
    const group = makeEntity("a-entity", { position: "0 0.15 0" });
    group.dataset.basePosition = "0 0.15 0";
    group.appendChild(makeEntity("a-cylinder", {
      radius: "0.035",
      height: "0.55",
      color: "#2F8F51",
      position: "0 0.28 0"
    }));
    group.appendChild(makeEntity("a-sphere", {
      radius: "0.16",
      color: "#FFD33F",
      scale: "1 1 0.35",
      position: "0 0.6 0"
    }));
    group.appendChild(makeEntity("a-sphere", {
      radius: "0.08",
      color: "#6B4220",
      scale: "1 1 0.45",
      position: "0 0.6 0.04"
    }));
    return group;
  }

  function burstParticles(position) {
    if (!particleRoot || !position) return;

    for (let i = 0; i < 8; i += 1) {
      const particle = makeEntity("a-sphere", {
        radius: "0.035",
        color: "#FFDD55",
        position: `${position.x} ${position.y + 0.25} ${position.z}`
      });
      particleRoot.appendChild(particle);

      const angle = (i / 8) * Math.PI * 2;
      particle.setAttribute("animation__move", {
        property: "position",
        to: `${position.x + Math.cos(angle) * 0.35} ${position.y + 0.65} ${position.z + Math.sin(angle) * 0.35}`,
        dur: 650,
        easing: "easeOutQuad"
      });
      particle.setAttribute("animation__fade", {
        property: "scale",
        to: "0.01 0.01 0.01",
        dur: 650,
        easing: "easeInQuad"
      });
      window.setTimeout(() => particle.remove(), 700);
    }
  }

  function makeEntity(tagName, attributes) {
    const entity = document.createElement(tagName);
    Object.entries(attributes || {}).forEach(([key, value]) => entity.setAttribute(key, value));
    return entity;
  }

  function removeCrop(plot) {
    if (plot.cropEl) plot.cropEl.remove();
    plot.cropEl = null;
  }

  function clearPlot(plot) {
    removeCrop(plot);
    plot.cropId = null;
    plot.plantedAt = 0;
    plot.stage = 0;
  }

  function save() {
    localStorage.setItem(FARM_SAVE_KEY, JSON.stringify(plots.map((plot) => ({
      cropId: plot.cropId,
      plantedAt: plot.plantedAt
    }))));
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(FARM_SAVE_KEY) || "[]");
      saved.forEach((item, index) => {
        if (!item || !window.CROP_TYPES[item.cropId] || !plots[index]) return;
        plots[index].cropId = item.cropId;
        plots[index].plantedAt = Number(item.plantedAt) || Date.now();
        refreshCrop(plots[index]);
      });
    } catch {
      localStorage.removeItem(FARM_SAVE_KEY);
    }
  }
})();
