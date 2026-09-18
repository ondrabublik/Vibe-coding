(function (NS) {
  'use strict';

  class SpatialHash {
    constructor(cellSize) {
      this.cellSize = cellSize;
      this.invCellSize = 1 / cellSize;
      this.buckets = new Map();
    }

    _key(cx, cy) {
      return cx + ',' + cy;
    }

    clear() {
      this.buckets.clear();
    }

    build(particles) {
      this.clear();
      const inv = this.invCellSize;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const cx = Math.floor(p.x[0] * inv);
        const cy = Math.floor(p.x[1] * inv);
        const key = this._key(cx, cy);
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        bucket.push(i);
      }
    }

    forEachNeighbor(particles, i, radius, callback) {
      const p = particles[i];
      const inv = this.invCellSize;
      const cx = Math.floor(p.x[0] * inv);
      const cy = Math.floor(p.x[1] * inv);
      const r2 = radius * radius;

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = this.buckets.get(this._key(cx + ox, cy + oy));
          if (!bucket) continue;

          for (let k = 0; k < bucket.length; k++) {
            const j = bucket[k];
            if (j === i) continue;
            const q = particles[j];
            const dx = q.x[0] - p.x[0];
            const dy = q.x[1] - p.x[1];
            if (dx * dx + dy * dy <= r2) callback(j, dx, dy);
          }
        }
      }
    }
  }

  NS.SpatialHash = SpatialHash;
})(window.SPH);
