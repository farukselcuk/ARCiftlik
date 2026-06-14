(function () {
  window.CROP_TYPES = {
    wheat: {
      id: "wheat",
      name: "Wheat",
      growTime: 60_000,
      cost: 10,
      reward: 25,
      readyColor: "#F3CE3D"
    },
    corn: {
      id: "corn",
      name: "Corn",
      growTime: 120_000,
      cost: 15,
      reward: 35,
      readyColor: "#FFD84D"
    },
    strawberry: {
      id: "strawberry",
      name: "Strawberry",
      growTime: 90_000,
      cost: 20,
      reward: 50,
      readyColor: "#E94042"
    },
    sunflower: {
      id: "sunflower",
      name: "Sunflower",
      growTime: 180_000,
      cost: 25,
      reward: 70,
      readyColor: "#FFD33F"
    }
  };

  window.getCropStage = function getCropStage(progress) {
    if (progress >= 1) return 3;
    if (progress >= 0.5) return 2;
    return 1;
  };
})();
