import * as THREE from 'three';

export const DECORATION_TYPES = {
  fence: { id: 'fence', name: 'Ahşap Çit', cost: 50, icon: '🚧' },
  lantern: { id: 'lantern', name: 'Bahçe Feneri', cost: 100, icon: '🏮' },
  bench: { id: 'bench', name: 'Ahşap Bank', cost: 150, icon: '🪑' },
  well: { id: 'well', name: 'Taş Kuyu', cost: 500, icon: '🧱' },
  flower_bed: { id: 'flower_bed', name: 'Çiçek Tarhı', cost: 80, icon: '🌸' },
  scarecrow: { id: 'scarecrow', name: 'Korkuluk', cost: 200, icon: '🌾' },
  stone_path: { id: 'stone_path', name: 'Taş Yol', cost: 30, icon: '🛣️' }
};

/**
 * 3D Mesh generator for decorations
 * @param {string} decoId 
 * @returns {THREE.Group}
 */
export function createDecorationMesh(decoId) {
  const group = new THREE.Group();
  group.name = `deco-${decoId}`;

  const defaultMaterial = (color) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.1
  });

  switch (decoId) {
    case 'fence': {
      // Wood fence post
      const woodMat = defaultMaterial(0x8B5A2B);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), woodMat);
      post.position.y = 0.07;
      post.castShadow = true;
      group.add(post);

      // Horizontal rails
      const rail1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.02), woodMat);
      rail1.position.set(0, 0.1, 0);
      rail1.castShadow = true;
      group.add(rail1);

      const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.02), woodMat);
      rail2.position.set(0, 0.05, 0);
      rail2.castShadow = true;
      group.add(rail2);
      break;
    }

    case 'lantern': {
      // Post
      const postMat = defaultMaterial(0x222222);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.02), postMat);
      post.position.y = 0.1;
      post.castShadow = true;
      group.add(post);

      // Lantern glass/glow
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0xFFD700,
        emissive: 0xFFD700,
        emissiveIntensity: 1.5
      });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), glassMat);
      lamp.position.y = 0.22;
      group.add(lamp);

      // Cap
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.03, 4), postMat);
      cap.position.y = 0.265;
      cap.rotation.y = Math.PI / 4;
      group.add(cap);

      // Add a point light to the lantern
      const light = new THREE.PointLight(0xFFD700, 0.3, 1.5);
      light.position.set(0, 0.22, 0);
      group.add(light);
      break;
    }

    case 'bench': {
      const woodMat = defaultMaterial(0xA0522D);
      const metalMat = defaultMaterial(0x333333);

      // Leg structures
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.12), metalMat);
      legL.position.set(-0.08, 0.04, 0);
      legL.castShadow = true;
      group.add(legL);

      const legR = legL.clone();
      legR.position.x = 0.08;
      group.add(legR);

      // Seat slats
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.1), woodMat);
      seat.position.set(0, 0.08, 0);
      seat.castShadow = true;
      group.add(seat);

      // Backrest
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.015), woodMat);
      back.position.set(0, 0.13, -0.05);
      back.rotation.x = -0.15;
      back.castShadow = true;
      group.add(back);
      break;
    }

    case 'well': {
      const stoneMat = defaultMaterial(0x808080);
      const woodMat = defaultMaterial(0x8B5A2B);
      const roofMat = defaultMaterial(0xA52A2A);

      // Cylindrical stone base
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 12), stoneMat);
      base.position.y = 0.04;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Two wooden pillars
      const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.18, 0.015), woodMat);
      pillarL.position.set(-0.06, 0.13, 0);
      pillarL.castShadow = true;
      group.add(pillarL);

      const pillarR = pillarL.clone();
      pillarR.position.x = 0.06;
      group.add(pillarR);

      // Roof
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.06, 4), roofMat);
      roof.position.y = 0.23;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);
      break;
    }

    case 'flower_bed': {
      const soilMat = defaultMaterial(0x5C4033);
      const borderMat = defaultMaterial(0x8B7D6B);

      // Soil area
      const soil = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.18), soilMat);
      soil.position.y = 0.008;
      soil.receiveShadow = true;
      group.add(soil);

      // Borders
      const border1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.02), borderMat);
      border1.position.set(0, 0.015, 0.09);
      group.add(border1);
      const border2 = border1.clone();
      border2.position.z = -0.09;
      group.add(border2);

      const border3 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.2), borderMat);
      border3.position.set(0.09, 0.015, 0);
      group.add(border3);
      const border4 = border3.clone();
      border4.position.x = -0.09;
      group.add(border4);

      // Small flowers
      const flowerColors = [0xFF0000, 0xFFFF00, 0x0000FF, 0xFF00FF];
      for (let i = 0; i < 6; i++) {
        const flowerMat = new THREE.MeshStandardMaterial({
          color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
          roughness: 0.6
        });
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), flowerMat);
        const fx = (Math.random() - 0.5) * 0.12;
        const fz = (Math.random() - 0.5) * 0.12;
        flower.position.set(fx, 0.025, fz);
        group.add(flower);
      }
      break;
    }

    case 'scarecrow': {
      const woodMat = defaultMaterial(0x8B5A2B);
      const shirtMat = defaultMaterial(0xCD5C5C);
      const strawMat = defaultMaterial(0xDAA520);

      // Vertical pole
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.02), woodMat);
      pole.position.y = 0.11;
      group.add(pole);

      // Horizontal arm pole
      const arms = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.015), woodMat);
      arms.position.set(0, 0.16, 0);
      group.add(arms);

      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), strawMat);
      head.position.y = 0.22;
      group.add(head);

      // Hat
      const hatMat = defaultMaterial(0x8B4513);
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.03, 8), hatMat);
      hat.position.y = 0.245;
      group.add(hat);

      // Tattered shirt
      const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), shirtMat);
      shirt.position.set(0, 0.12, 0);
      group.add(shirt);
      break;
    }

    case 'stone_path': {
      const stoneMat = defaultMaterial(0xA9A9A9);
      // Flat stones on the ground
      for (let i = 0; i < 3; i++) {
        const stone = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.005, 0.06), stoneMat);
        stone.position.set(
          (Math.random() - 0.5) * 0.1,
          0.002,
          (i - 1) * 0.07 + (Math.random() - 0.5) * 0.02
        );
        stone.rotation.y = Math.random() * Math.PI;
        stone.receiveShadow = true;
        group.add(stone);
      }
      break;
    }
  }

  // Shadow casting
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return group;
}

/**
 * Handles decoration zone coordinates logic
 */
export const DECORATION_ZONES = {
  /**
   * Returns all valid outer border positions for a given grid size
   * @param {number} gridRows 
   * @param {number} gridCols 
   * @returns {Array<{col: number, row: number}>}
   */
  getValidPositions(gridRows, gridCols) {
    const list = [];
    
    // We can place decorations in a ring around the plot grid:
    // col = -1 or col = gridCols, or row = -1 or row = gridRows
    for (let col = -1; col <= gridCols; col++) {
      for (let row = -1; row <= gridRows; row++) {
        const isBorder = (col === -1 || col === gridCols || row === -1 || row === gridRows);
        if (isBorder) {
          list.push({ col, row });
        }
      }
    }
    return list;
  },

  /**
   * Recalculates decoration coordinates when the farm expands
   * Moves decorations on the old outer border outward to the new outer border.
   * @param {Array<{decoId: string, col: number, row: number}>} decorations 
   * @param {number} oldRows 
   * @param {number} oldCols 
   * @param {number} newRows 
   * @param {number} newCols 
   * @returns {Array<{decoId: string, col: number, row: number}>}
   */
  recalculateAfterExpansion(decorations, oldRows, oldCols, newRows, newCols) {
    return decorations.map(deco => {
      let col = deco.col;
      let row = deco.row;

      // If it was on the right border (oldCols), move it to newCols
      if (col === oldCols) {
        col = newCols;
      } else if (col > 0 && col < oldCols && oldCols !== newCols) {
        // Scaling position relative to size
      }

      // If it was on the bottom border (oldRows), move it to newRows
      if (row === oldRows) {
        row = newRows;
      }

      return {
        ...deco,
        col,
        row
      };
    });
  }
};
