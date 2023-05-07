import { Cell, Solver } from '$lib/puzzle/solver';

/**
 * @typedef {'unique'|'multiple'|'whatever'} SolutionsNumber
 */

/**
 * Returns a random element from an array
 * @param {Array<any>} array
 */
function getRandomElement(array) {
	const index = Math.floor(Math.random() * array.length);
	return array[index];
}

/**
 * Randomize tile rotations
 * @param {Number[]} tiles
 * @param {import('$lib/puzzle/grids/grids').Grid} grid
 * @returns {Number[]}
 */
function randomRotate(tiles, grid) {
	return tiles.map((tile, index) => {
		if (tile === 0) {
			return 0;
		}
		const polygon = grid.polygon_at(index);
		const numDirections = polygon.directions.length;
		let rotated = polygon.rotate(tile, Math.floor(Math.random() * numDirections));
		return rotated;
	});
}

export class Generator {
	/**
	 * @constructor
	 * @param {import('$lib/puzzle/grids/grids').Grid} grid
	 * @param {Number} [reuseTilesMinCount = 4] minimum count of connected tiles to leave when erasing ambiguities.
	 * @param {Number} [uniquenessPatience = 5] abandon generation attempt if the count of ambiguous tiles did not decrease in this many iterations
	 */
	constructor(
		grid,
		reuseTilesMinCount = 3,
		uniquenessPatience = 5,
		maxUniquenessIterations = 100,
		maxAttempts = 100
	) {
		this.grid = grid;
		this.reuseTilesMinCount = reuseTilesMinCount;
		this.uniquenessPatience = uniquenessPatience;
		this.maxAttempts = maxAttempts;
		this.maxUniquenessIterations = maxUniquenessIterations;
	}

	/**
	 * Fills a grid with tiles using GrowingTree algorithm
	 * At branchingAmount = 0 it's like recursive backtracking
	 * At branchingAmount = 1 it's like Prim's algorithm
	 * Intermediate values give some mix of these methods
	 * @param {Number} branchingAmount - a number in range [0, 1], higher values lead to more branching splits
	 * @param {Number} avoidObvious - number in range [0, 1], higher values lead to fewer obvious tiles along borders
	 * @param {Number} avoidStraights - number in range [0, 1], higher values lead to fewer straight tiles
	 * @param {Number[]} startTiles - starting point tiles if we're fixing ambiguities
	 * @returns {Number[]} - unrandomized tiles array
	 */
	pregenerate_growingtree(branchingAmount, avoidObvious = 0, avoidStraights = 0, startTiles = []) {
		const total = this.grid.total;

		/** @type {Set<Number>} A set of unvisited nodes*/
		const unvisited = new Set([...Array(total).keys()]);
		for (let index of this.grid.emptyCells) {
			unvisited.delete(index);
		}
		/** @type {Number[]} A list of tile shapes */
		const tiles = [];
		for (let i = 0; i < total; i++) {
			tiles.push(0);
		}
		/** @type {Number[]} A list of visited nodes */
		const visited = [];
		/** @type {Number[]} - visited tiles that will become obvious if used again */
		const avoiding = [];
		/** @type {Number[]} - visited tiles that will become fully connected if used again */
		const lastResortNodes = [];

		/** @type {Map<Number, Set<Number>>} */
		const startComponents = new Map();
		// reuse non-ambiguous portions of startTiles
		if (startTiles.length === total) {
			const to_check = new Set(unvisited);
			const components = [];
			while (to_check.size > 0) {
				const index = to_check.values().next().value;
				to_check.delete(index);
				if (startTiles[index] < 0) {
					// ambiguous tile, ignore it
					continue;
				}
				const to_visit = new Set([index]);
				const component = new Set();
				while (to_visit.size > 0) {
					const i = to_visit.values().next().value;
					to_visit.delete(i);
					to_check.delete(i);
					component.add(i);
					for (let direction of this.grid.getDirections(startTiles[i], 0, i)) {
						const { neighbour, empty } = this.grid.find_neighbour(i, direction);
						if (empty || startTiles[neighbour] < 0 || component.has(neighbour)) {
							continue;
						}
						to_visit.add(neighbour);
					}
				}
				components.push(component);
			}
			components.sort((a, b) => -(a.size - b.size));
			// components[0] now has the largest region of non-ambiguous connected tiles
			for (let index of components[0] || []) {
				for (let direction of this.grid.getDirections(startTiles[index], 0, index)) {
					const { neighbour } = this.grid.find_neighbour(index, direction);
					if (components[0].has(neighbour)) {
						tiles[index] += direction;
					}
				}
				visited.push(index);
				unvisited.delete(index);
			}
			// reuse good smaller regions too
			for (let component of components.slice(1)) {
				if (component.size < this.reuseTilesMinCount) {
					break;
				}
				for (let index of component) {
					startComponents.set(index, component);
					for (let direction of this.grid.getDirections(startTiles[index], 0, index)) {
						const { neighbour } = this.grid.find_neighbour(index, direction);
						if (component.has(neighbour)) {
							tiles[index] += direction;
						}
					}
				}
			}
		}

		/** @type {Map<Number, Number>} tile index => tile walls */
		const borders = new Map();
		/**
		 * @type {Map<import('$lib/puzzle/grids/polygonutils').RegularPolygonTile, Map<Number, Set<Number>>>}
		 * polygon => (tile walls => set of forbidden types-orientations) */
		const polygonForbidden = new Map();
		/** @type {Map<Number, Set<Number>>} tile index => forbidden orientations */
		const tileForbidden = new Map();
		if (avoidObvious > 0) {
			for (let tileIndex of unvisited) {
				const polygon = this.grid.polygon_at(tileIndex);
				for (let direction of polygon.directions) {
					const { empty } = this.grid.find_neighbour(tileIndex, direction);
					if (empty) {
						borders.set(tileIndex, (borders.get(tileIndex) || 0) + direction);
					}
				}
				const walls = borders.get(tileIndex) || 0;
				if (walls > 0) {
					const forbidden = polygonForbidden.get(polygon) || new Map();
					if (!polygonForbidden.has(polygon)) {
						polygonForbidden.set(polygon, forbidden);
					}
					const wallForbidden = forbidden.get(walls) || new Set();
					if (!forbidden.has(walls)) {
						forbidden.set(walls, wallForbidden);
						const cell = new Cell(polygon, -1);
						cell.addWall(walls);
						cell.applyConstraints();
						/** @type {Map<String, Set<Number>>} */
						const tileTypes = new Map();
						for (let orientation of cell.possible) {
							const tileType = polygon.tileTypes.get(orientation)?.str || '';
							const orientations = tileTypes.get(tileType) || new Set();
							if (!tileTypes.has(tileType)) {
								tileTypes.set(tileType, orientations);
							}
							orientations.add(orientation);
						}
						for (let [tileType, orientations] of tileTypes.entries()) {
							if (orientations.size === 1) {
								wallForbidden.add(orientations.values().next().value);
							}
						}
					}
					if (wallForbidden.size > 0) {
						tileForbidden.set(tileIndex, wallForbidden);
					}
				}
			}
		}

		if (visited.length === 0) {
			/** @type {Number} */
			const startIndex = [...unvisited][Math.floor(Math.random() * unvisited.size)];

			visited.push(startIndex);
			unvisited.delete(startIndex);
		}

		while (unvisited.size > 0) {
			let fromNode = 0;
			const usePrims = Math.random() < branchingAmount;
			for (let nodes of [visited, avoiding, lastResortNodes]) {
				if (nodes.length === 0) {
					continue;
				}
				if (usePrims) {
					// go from a random element
					fromNode = getRandomElement(nodes);
				} else {
					// go from the last element
					fromNode = nodes[nodes.length - 1];
				}
				break;
			}
			if (fromNode === undefined) {
				throw 'Error in pregeneration: fromNode is undefined';
			}
			// tiers of possible moves
			const unvisitedNeighbours = []; // these are the best options
			const straightNeighbours = []; // this move results in a straight tile, might want to avoid
			const obviousNeighbours = []; // these should be avoided with avoidObvious setting
			const fullyConnectedNeighbours = []; // making a fully connected tile is a total last resort
			const connections = tiles[fromNode];
			const polygon = this.grid.polygon_at(fromNode);
			for (let direction of polygon.directions) {
				if ((direction & connections) > 0) {
					continue;
				}
				const { neighbour, empty } = this.grid.find_neighbour(fromNode, direction);
				if (empty || !unvisited.has(neighbour)) {
					continue;
				}
				// classify this neighbour by priority
				if (
					polygon.tileTypes.get(connections + direction)?.isFullyConnected ||
					(tiles[neighbour] > 0 &&
						this.grid
							.polygon_at(neighbour)
							.tileTypes.get(tiles[neighbour] + (this.grid.OPPOSITE.get(direction) || 0))
							?.isFullyConnected)
				) {
					fullyConnectedNeighbours.push({ neighbour, direction });
					continue;
				}
				if (tileForbidden.has(fromNode) && Math.random() < avoidObvious) {
					const nogo = tileForbidden.get(fromNode);
					if (nogo?.has(tiles[fromNode] + direction)) {
						obviousNeighbours.push({ neighbour, direction });
						continue;
					}
				}
				if (polygon.tileTypes.get(connections + direction)?.isStraight) {
					if (Math.random() < avoidStraights) {
						straightNeighbours.push({ neighbour, direction });
						continue;
					}
				}
				unvisitedNeighbours.push({ neighbour, direction });
			}
			let toVisit = null;
			let source = null;
			for (let options of [
				unvisitedNeighbours,
				straightNeighbours,
				obviousNeighbours,
				fullyConnectedNeighbours
			]) {
				if (options.length > 0) {
					source = options;
					toVisit = getRandomElement(options);
					break;
				}
			}

			if (toVisit === null) {
				// all neighbours are already visited
				const array = [visited, avoiding, lastResortNodes].find((x) => x.length > 0) || [];
				if (usePrims) {
					const index = array.indexOf(fromNode);
					array.splice(index, 1);
				} else {
					array.pop();
				}
				continue;
			}
			if (source === fullyConnectedNeighbours) {
				// wants to become fully connected, this is a last resort action
				if (visited.length > 0) {
					const index = visited.indexOf(fromNode);
					visited.splice(index, 1);
					lastResortNodes.push(fromNode);
					continue;
				}
			}
			if (source === obviousNeighbours) {
				// wants to become obvious, try to avoid using it
				if (visited.length > 0) {
					const index = visited.indexOf(fromNode);
					visited.splice(index, 1);
					avoiding.push(fromNode);
					continue;
				}
			}
			tiles[fromNode] += toVisit.direction;
			if (tiles[toVisit.neighbour] > 0) {
				// connected to a reused portion, visit it all
				const component = startComponents.get(toVisit.neighbour);
				component?.delete(toVisit.neighbour);
				for (let i of component || []) {
					unvisited.delete(i);
					visited.push(i);
				}
			}
			tiles[toVisit.neighbour] += this.grid.OPPOSITE.get(toVisit.direction) || 0;
			unvisited.delete(toVisit.neighbour);
			visited.push(toVisit.neighbour);
		}
		return tiles;
	}

	/**
	 * Generate a puzzle according to settings
	 * @param {Number} branchingAmount - value in range [0, 1]
	 * @param {Number} avoidObvious - value in range [0, 1], higher values lead to fewer obvious tiles along borders
	 * @param {Number} avoidStraights - value in range [0, 1], higher values lead to fewer straight tiles
	 * @param {SolutionsNumber} solutionsNumber - unique/multiple solutions or disable this check
	 * @returns {Number[]} - generated tiles
	 */
	generate(
		branchingAmount = 0.6,
		avoidObvious = 0.0,
		avoidStraights = 0.0,
		solutionsNumber = 'unique'
	) {
		if (solutionsNumber === 'unique') {
			/** @type {Number[]} */
			let startTiles = [];
			let attempt = 0;
			while (attempt < this.maxAttempts) {
				attempt += 1;
				let tiles = this.pregenerate_growingtree(
					branchingAmount,
					avoidObvious,
					avoidStraights,
					startTiles
				);
				let uniqueIter = 0;
				let patienceLeft = this.uniquenessPatience;
				let ambiguous = this.grid.total;
				while (uniqueIter < this.maxUniquenessIterations) {
					uniqueIter += 1;
					const solver = new Solver(tiles, this.grid);
					const { marked, unique, numAmbiguous } = solver.markAmbiguousTiles(ambiguous);
					if (unique) {
						console.log('successfully generated unique puzzle', this.grid.width);
						return randomRotate(marked, this.grid);
					}
					if (numAmbiguous >= ambiguous) {
						patienceLeft -= 1;
					} else {
						ambiguous = numAmbiguous;
						patienceLeft = this.uniquenessPatience;
						startTiles = marked;
					}
					console.log({ attempt, uniqueIter, ambiguous: numAmbiguous, patienceLeft });
					if (patienceLeft === 0) {
						break;
					}
					tiles = this.pregenerate_growingtree(
						branchingAmount,
						avoidObvious,
						avoidStraights,
						startTiles
					);
				}
			}
			throw 'Could not generate a puzzle with a unique solution. Maybe try again.';
		} else if (solutionsNumber === 'whatever') {
			const tiles = this.pregenerate_growingtree(branchingAmount, avoidObvious, avoidStraights);
			return randomRotate(tiles, this.grid);
		} else if (solutionsNumber === 'multiple') {
			let attempt = 0;
			while (attempt < this.maxAttempts) {
				attempt += 1;
				let tiles = this.pregenerate_growingtree(branchingAmount, avoidObvious, avoidStraights);
				const solver = new Solver(tiles, this.grid);
				const { unique } = solver.markAmbiguousTiles();
				if (!unique) {
					return randomRotate(tiles, this.grid);
				}
			}
			throw `Could not generate a puzzle with multiple solutions in ${this.maxAttempts} attempts. Maybe try again.`;
		} else {
			throw 'Unknown setting for solutionsNumber';
		}
	}
}
