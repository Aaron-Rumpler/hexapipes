const EAST = 1;
const NORTHEAST = 2;
const NORTH = 4;
const NORTHWEST = 8;
const WEST = 16;
const SOUTHWEST = 32;
const SOUTH = 64;
const SOUTHEAST = 128;

const Roct = 0.5;
const R0 = 0.49;
const d = Roct * Math.sin(Math.PI / 8);
const d0 = R0 * Math.sin(Math.PI / 8);
const Rsq = ((Roct - d) * Math.SQRT2) / 2;

export class OctaGrid {
	DIRECTIONS = [EAST, NORTHEAST, NORTH, NORTHWEST, WEST, SOUTHWEST, SOUTH, SOUTHEAST];
	EDGEMARK_DIRECTIONS = [NORTHEAST, NORTH, NORTHWEST, WEST];
	OPPOSITE = new Map([
		[NORTH, SOUTH],
		[SOUTH, NORTH],
		[EAST, WEST],
		[WEST, EAST],
		[NORTHEAST, SOUTHWEST],
		[SOUTHWEST, NORTHEAST],
		[NORTHWEST, SOUTHEAST],
		[SOUTHEAST, NORTHWEST]
	]);
	RC_DELTAS = new Map([
		[EAST, [1, 0]],
		[NORTHEAST, [0.5, 0.5]],
		[NORTH, [0, 1]],
		[NORTHWEST, [-0.5, 0.5]],
		[WEST, [-1, 0]],
		[SOUTHWEST, [-0.5, -0.5]],
		[SOUTH, [0, -1]],
		[SOUTHEAST, [0.5, -0.5]]
	]);
	XY_DELTAS = new Map([
		[EAST, [1, 0]],
		[NORTHEAST, [Math.SQRT1_2, Math.SQRT1_2]],
		[NORTH, [0, 1]],
		[NORTHWEST, [-Math.SQRT1_2, Math.SQRT1_2]],
		[WEST, [-1, 0]],
		[SOUTHWEST, [-Math.SQRT1_2, -Math.SQRT1_2]],
		[SOUTH, [0, -1]],
		[SOUTHEAST, [Math.SQRT1_2, -Math.SQRT1_2]]
	]);
	ANGLE_DEG = 45;
	ANGLE_RAD = Math.PI / 4;
	NUM_DIRECTIONS = 8;
	KIND = 'octagonal';
	PIPE_WIDTH = 0.1;
	STROKE_WIDTH = 0.04;
	PIPE_LENGTH = 0.5;
	SINK_RADIUS = 0.13;

	/** @type {Set<Number>} - indices of empty cells */
	emptyCells;
	/** @type {Number} - total number of cells excluding empties */
	total;

	tilePathOctagon = `m ${R0} ${d0} L ${d0} ${R0} L ${-d0} ${R0} L ${-R0} ${d0} L ${-R0} ${-d0} L ${-d0} ${-R0} L ${d0} ${-R0} L ${R0} ${-d0} z`;
	tilePathSquare = `m ${R0 - d0} 0 L 0 ${R0 - d0} L ${-R0 + d0} 0 L 0 ${-R0 + d0} z`;
	/**
	 *
	 * @param {Number} width
	 * @param {Number} height
	 * @param {Boolean} wrap
	 * @param {Number[]} tiles
	 */
	constructor(width, height, wrap, tiles = []) {
		this.width = width;
		this.height = height;
		this.wrap = wrap;

		this.emptyCells = new Set();
		tiles.forEach((tile, index) => {
			if (tile === 0) {
				this.emptyCells.add(index);
			}
		});
		if (tiles.length === 0 && !wrap) {
			const N = 2 * width * height;
			for (let w = 1; w <= width; w++) {
				this.emptyCells.add(N - w);
			}
			for (let h = 1; h < height; h++) {
				this.emptyCells.add(N - 1 - width * h);
			}
		}
		this.total = 2 * width * height;

		this.XMIN = -0.6 - (wrap ? 1 : 0);
		this.XMAX = width + 0.1 + (wrap ? 1 : 0);
		this.YMIN = -(1 + (wrap ? 1 : 0));
		this.YMAX = height + (wrap ? 1 : 0);

		/* Tile types for use in solver */
		this.T0 = 0;
		this.T1 = 1;
		this.T2v = 3;
		this.T2L = 5;
		this.T2C = 9;
		this.T2I = 17;
		this.T3w = 7;
		/** @type {Map<Number,Number>} */
		this.tileTypes = new Map();
		for (let t = 0; t < 256; t++) {
			let rotated = t;
			while (!this.tileTypes.has(rotated)) {
				this.tileTypes.set(rotated, t);
				rotated = this.rotate(rotated, 1);
			}
		}
	}

	/**
	 * @param {Number} index
	 */
	index_to_xy(index) {
		const isSquare = index >= this.width * this.height;
		const i = index - (isSquare ? this.width * this.height : 0);
		const x = i % this.width;
		const y = Math.round((i - x) / this.width);
		return [x + (isSquare ? 0.5 : 0), y + (isSquare ? 0.5 : 0)];
	}

	/**
	 * Determines which tile a point at (x, y) belongs to
	 * Returns tile index and tile center coordinates
	 * If the point is over empty space then tileIndex is -1
	 * @param {Number} x
	 * @param {Number} y
	 * @returns {{index: Number, x:Number, y: Number}}
	 */
	which_tile_at(x, y) {
		const x1 = Math.floor(x);
		const x2 = Math.ceil(x);
		const xm = (x1 + x2) * 0.5;
		const x0 = Math.round(x);

		const y1 = Math.floor(y);
		const y2 = Math.ceil(y);
		const ym = (y1 + y2) * 0.5;
		const y0 = Math.round(y);

		const r = 0.5 * (1 - Math.sin(Math.PI / 8));
		if (Math.abs(x - xm) + Math.abs(y - ym) <= r) {
			// square tile
			let index = this.rc_to_index(ym, xm);
			if (this.emptyCells.has(index)) {
				index = -1;
			}
			return { index, x: xm, y: ym };
		}
		// octagon tile
		let index = this.rc_to_index(y0, x0);
		if (this.emptyCells.has(index)) {
			index = -1;
		}
		return { index, x: x0, y: y0 };
	}

	/**
	 * Tells if a point is close to one of tile's edges
	 * @param {import('$lib/puzzle/controls').PointerOrigin} point
	 */
	whichEdge(point) {
		const { x, y, tileX, tileY } = point;
		const dx = x - tileX;
		const dy = tileY - y;
		const deltaRadius = Math.abs(Math.sqrt(dx ** 2 + dy ** 2) - 0.5);
		let angle = Math.atan2(dy, dx);
		angle += angle < 0 ? 2 * Math.PI : 0;
		const directionIndex = Math.round((angle * 2) / Math.PI) % 4;
		const direction = this.DIRECTIONS[directionIndex];
		const directionAngle = (directionIndex * Math.PI) / 2;
		let deltaAngle = Math.abs(angle - directionAngle);
		deltaAngle = Math.min(deltaAngle, 2 * Math.PI - deltaAngle);
		return {
			direction,
			isClose: deltaRadius <= 0.15 && deltaAngle <= 0.35
		};
	}

	/**
	 * @param {Number} index
	 * @param {Number} direction
	 * @returns {{neighbour: Number, empty: boolean}} - neighbour index, is the neighbour an empty cell or outside the board
	 */
	find_neighbour(index, direction) {
		let c = 0;
		let r = 0;
		if (index >= this.width * this.height) {
			// square cell
			if ([NORTH, SOUTH, EAST, WEST].some((d) => d === direction)) {
				return { neighbour: -1, empty: true };
			}
			index -= this.width * this.height;
			c += 0.5;
			r += 0.5;
		}
		c += index % this.width;
		r += (index - (index % this.width)) / this.width;
		let neighbour = -1;

		const [dc, dr] = this.RC_DELTAS.get(direction) || [0, 0];
		r -= dr;
		c += dc;
		neighbour = this.rc_to_index(r, c);
		const empty = neighbour === -1 || this.emptyCells.has(neighbour);
		return { neighbour, empty };
	}

	/**
	 * Get index of tile located at row r column c
	 * @param {Number} r
	 * @param {Number} c
	 * @returns {Number}
	 */
	rc_to_index(r, c) {
		let squareIndexOffset = 0;
		if (r - Math.floor(r) > 0.2) {
			squareIndexOffset = this.width * this.height;
			r = Math.floor(r);
			c = Math.floor(c);
		}
		if (this.wrap) {
			r = r % this.height;
			if (r < 0) {
				r += this.height;
			}
			c = c % this.width;
			if (c < 0) {
				c += this.width;
			}
		} else {
			if (r < 0 || r >= this.height) {
				return -1;
			} else if (c < 0 || c >= this.width) {
				return -1;
			}
		}
		return this.width * r + c + squareIndexOffset;
	}

	/**
	 * Makes cell at index empty
	 * @param {Number} index
	 */
	makeEmpty(index) {
		this.emptyCells.add(index);
	}

	/**
	 * A number corresponding to fully connected tile
	 * @param {Number} index
	 * @returns {Number}
	 */
	fullyConnected(index) {
		if (index >= this.width * this.height) {
			return 170;
		}
		return 255;
	}

	/**
	 * Compute tile orientation after a number of rotations
	 * @param {Number} tile
	 * @param {Number} rotations
	 * @param {Number} index - index of tile, not used here
	 * @returns
	 */
	rotate(tile, rotations, index = 0) {
		let rotated = tile;
		rotations = rotations % 8;
		if (rotations > 4) {
			rotations -= 8;
		} else if (rotations < -4) {
			rotations += 8;
		}
		while (rotations < 0) {
			rotated = ((rotated * 2) % 256) + Math.floor(rotated / 128);
			rotations += 1;
		}
		while (rotations > 0) {
			rotated = Math.floor(rotated / 2) + 128 * (rotated % 2);
			rotations -= 1;
		}
		return rotated;
	}

	/**
	 *
	 * @param {Number} tile
	 * @param {Number} rotations
	 * @returns {Number[]}
	 */
	getDirections(tile, rotations = 0) {
		const rotated = this.rotate(tile, rotations);
		return this.DIRECTIONS.filter((direction) => (direction & rotated) > 0);
	}

	/**
	 * @param {import('$lib/puzzle/viewbox').ViewBox} box
	 * @returns {import('$lib/puzzle/viewbox').VisibleTile[]}
	 */
	getVisibleTiles(box) {
		let rmin = Math.floor(box.ymin) - 1;
		let rmax = Math.ceil(box.ymin + box.height) + 1;
		if (!this.wrap) {
			rmin = Math.max(0, rmin);
			rmax = Math.min(this.height - 1, rmax);
		}
		let cmin = Math.floor(box.xmin) - 1;
		let cmax = Math.ceil(box.xmin + box.width) + 1;
		if (!this.wrap) {
			cmin = Math.max(0, cmin);
			cmax = Math.min(this.width - 1, cmax);
		}
		const visibleTiles = [];
		for (let r = rmin; r <= rmax; r++) {
			// add octagons row
			for (let c = cmin; c <= cmax; c++) {
				const indexOct = this.rc_to_index(r, c);
				if (indexOct !== -1 && !this.emptyCells.has(indexOct)) {
					const x = c;
					const y = r;
					const key = `${Math.round(2 * x)}_${Math.round(2 * y)}`;
					visibleTiles.push({
						index: indexOct,
						x,
						y,
						key
					});
				}
			}
			// add squares row
			// this ordering ensures edgemarks are visible and not overlapped by other tiles
			const rs = r + 0.5;
			for (let c = cmin; c <= cmax; c++) {
				const cs = c + 0.5;
				const indexSquare = this.rc_to_index(rs, cs);
				if (indexSquare !== -1 && !this.emptyCells.has(indexSquare)) {
					const x = cs;
					const y = rs;
					const key = `${Math.round(2 * x)}_${Math.round(2 * y)}`;
					visibleTiles.push({
						index: indexSquare,
						x,
						y,
						key
					});
				}
			}
		}
		return visibleTiles;
	}

	/**
	 * Tile contour path for svg drawing
	 * @param {Number} index
	 * @returns
	 */
	getTilePath(index) {
		if (index >= this.width * this.height) {
			return this.tilePathSquare;
		} else {
			return this.tilePathOctagon;
		}
	}

	/**
	 * Pipes lines path
	 * @param {Number} tile
	 * @param {Number} index
	 */
	getPipesPath(tile, index) {
		const radius = index >= this.width * this.height ? Rsq : Roct;
		let path = `M 0 0`;
		this.DIRECTIONS.forEach((direction, index) => {
			if ((direction & tile) > 0) {
				const angle = this.ANGLE_RAD * index;
				const dx = radius * Math.cos(angle);
				const dy = radius * Math.sin(angle);
				path += ` l ${dx} ${-dy} L 0 0`;
			}
		});
		return path;
	}

	/**
	 * Computes position for drawing the tile guiding dot
	 * @param {Number} tile
	 * @param {Number} index
	 * * @returns {Number[]}
	 */
	getGuideDotPosition(tile, index = 0) {
		const tileDirections = this.getDirections(tile);
		const deltas = tileDirections.map((direction) => this.XY_DELTAS.get(direction) || [0, 0]);

		let dx = 0,
			dy = 0;
		for (let [deltax, deltay] of deltas) {
			dx += deltax;
			dy += deltay;
		}
		dx /= tileDirections.length;
		dy /= tileDirections.length;
		if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
			// a symmetric tile - I, X, Y or fully connected
			if (
				tileDirections.length <= this.DIRECTIONS.length / 2 ||
				tileDirections.length === this.DIRECTIONS.length
			) {
				// I or Y or fully connected tile
				// grab any leg
				dx = deltas[0][0];
				dy = deltas[0][1];
			} else {
				// X - treat as "not I" - grab I direction and rotate 90deg
				const direction = this.DIRECTIONS.find((d) => !tileDirections.includes(d)) || 1;
				const [deltaX, deltaY] = this.RC_DELTAS.get(direction) || [0, 0];
				dx = -deltaY;
				dy = deltaX;
			}
		}
		const l = Math.sqrt(dx * dx + dy * dy);
		const r = index >= this.width * this.height ? Rsq : Roct;
		return [(0.7 * r * dx) / l, (0.7 * r * dy) / l];
	}

	/**
	 * Returns coordinates of endpoints of edgemark line
	 * @param {Number} direction
	 * @param {Number} index
	 * @returns
	 */
	getEdgemarkLine(direction, index = 0) {
		// offset from center of tile
		let [offsetX, offsetY] = this.RC_DELTAS.get(direction) || [0, 0];
		let l = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
		offsetX /= l;
		offsetY /= l;
		// drawn line deltas
		let [dx, dy] = this.RC_DELTAS.get(this.OPPOSITE.get(direction) || 1) || [0, 0];
		l = Math.sqrt(dx * dx + dy * dy);
		dx /= l;
		dy /= l;
		const radius = index >= this.width * this.height ? Rsq : Roct;
		const lineLength = 0.12;
		const line = {
			x1: +radius * offsetX - dx * lineLength,
			y1: -radius * offsetY + dy * lineLength,
			x2: +radius * offsetX + dx * lineLength,
			y2: -radius * offsetY - dy * lineLength
		};
		return line;
	}
}
