/* Constraint Violation Exceptions */

/**
 * A cell has no more viable orientations
 * @param {Cell} cell
 */
function NoOrientationsPossibleException(cell) {
	this.name = 'NoOrientationsPossible';
	this.message = `No orientations possible for tile ${cell.initial} at index ${cell.index}`;
}

function LoopDetectedException() {
	this.name = 'LoopDetected';
	this.message = 'Loop detected';
}

function IslandDetectedException() {
	this.name = 'IslandDetected';
	this.message = 'Island detected';
}

/**
 * @constructor
 * @param {import('$lib/puzzle/hexagrid').HexaGrid} grid
 * @param {Number} index - tile index in grid
 * @param {Number} initial - initial orientation
 */
export function Cell(grid, index, initial) {
	let self = this;
	self.index = index;
	self.initial = initial;

	self.possible = new Set();
	let rotated = initial;
	while (!self.possible.has(rotated)) {
		self.possible.add(rotated);
		rotated = grid.rotate(rotated, 1, index);
	}
	self.walls = 0;
	self.connections = 0;

	/**
	 * @param {Number} direction
	 */
	self.addWall = function (direction) {
		self.walls += direction;
	};

	/**
	 * @param {Number} direction
	 */
	self.addConnection = function (direction) {
		self.connections += direction;
	};

	/**
	 * Filters out tile orientations that contradict known constraints
	 * @throws {NoOrientationsPossible}
	 * @returns {{addedWalls:Number, addedConnections: Number}}
	 */
	self.applyConstraints = function () {
		const newPossible = new Set();
		for (let orientation of self.possible) {
			if (
				// respects known walls
				(orientation & self.walls) === 0 &&
				// respects known connections if any
				(orientation & self.connections) === self.connections
			) {
				newPossible.add(orientation);
			}
		}
		self.possible = newPossible;
		if (newPossible.size === 0) {
			throw new NoOrientationsPossibleException(self);
		}
		const full = grid.fullyConnected(index);
		let newWalls = full;
		let newConnections = full;
		newPossible.forEach((orientation) => {
			newWalls = newWalls & (full - orientation);
			newConnections = newConnections & orientation;
		});
		const addedWalls = newWalls - self.walls;
		const addedConnections = newConnections - self.connections;
		self.walls = newWalls;
		self.connections = newConnections;
		return { addedWalls, addedConnections };
	};

	/**
	 * Returns a copy of the cell
	 * @returns {Cell}
	 */
	self.clone = function () {
		const clone = new Cell(grid, self.index, 0);
		clone.initial = self.initial;
		clone.possible = new Set(self.possible);
		clone.walls = self.walls;
		clone.connections = self.connections;
		return clone;
	};

	return self;
}

/**
 * @constructor
 * @param {Number[]} tiles - tile index in grid
 * @param {import('$lib/puzzle/hexagrid').HexaGrid} grid
 */
export function Solver(tiles, grid) {
	let self = this;
	self.grid = grid;

	/** @type {Map<Number, Cell>} */
	self.unsolved = new Map([]);

	/** @type {Map<Number, Set<Number>>} */
	self.components = new Map([]);

	const directions = new Set(grid.DIRECTIONS);

	tiles.forEach((tile, index) => {
		self.unsolved.set(index, new Cell(grid, index, tile));
		// add deadend tiles to components to keep track of loops/islands
		// if (directions.has(tile)) {
		// 	self.components.set(index, new Set([index]));
		// }
	});
	/** @type {Number[]} */
	self.solution = tiles.map(() => -1);

	/** @type {Set<Number>} */
	self.dirty = new Set();

	/** @type {Number[][]} */
	self.progress = [];

	/** Adds walls to border cells
	 * Adds border cells to dirty set
	 * Adds empty/fully-connected cells to dirty set
	 */
	self.applyBorderConditions = function () {
		for (let index = 0; index < self.grid.total; index++) {
			const cell = self.unsolved.get(index);
			if (cell === undefined) {
				continue;
			}
			if (cell.possible.size === 1) {
				self.dirty.add(index);
			} else {
				for (let direction of self.grid.DIRECTIONS) {
					const { neighbour } = self.grid.find_neighbour(index, direction);
					if (neighbour === -1) {
						cell.addWall(direction);
						self.dirty.add(index);
					}
				}
			}
		}
	};

	/**
	 * Merges components between cell at index and its neighbour
	 * @param {Number} index
	 * @param {Number} neighbourIndex
	 */
	self.mergeComponents = function (index, neighbourIndex) {
		const component = self.components.get(index);
		if (component === undefined) {
			throw 'Component to merge is undefined!';
		}
		const neighbourComponent = self.components.get(neighbourIndex);
		if (component === neighbourComponent) {
			throw new LoopDetectedException();
		}
		if (neighbourComponent === undefined) {
			component.add(neighbourIndex);
			self.components.set(neighbourIndex, component);
		} else {
			for (let otherIndex of neighbourComponent) {
				self.components.set(otherIndex, component);
				component.add(otherIndex);
			}
		}
	};

	self.processDirtyCells = function* () {
		while (self.dirty.size > 0) {
			// get a dirty cell
			const index = self.dirty.keys().next().value;
			self.dirty.delete(index);
			const cell = self.unsolved.get(index);
			if (cell === undefined) {
				continue;
			}
			// apply constraints to limit possible orientations
			const { addedWalls, addedConnections } = cell.applyConstraints();
			// create a component for this tile if it got a connection
			if (addedConnections > 0 && !self.components.has(index)) {
				self.components.set(index, new Set([index]));
			}
			// add walls to walled off neighbours
			if (addedWalls > 0) {
				for (let direction of self.grid.DIRECTIONS) {
					if ((direction & addedWalls) > 0) {
						const { neighbour } = self.grid.find_neighbour(index, direction);
						const neighbourCell = self.unsolved.get(neighbour);
						if (neighbourCell === undefined) {
							continue;
						}
						neighbourCell.addWall(self.grid.OPPOSITE.get(direction) || 0);
						self.dirty.add(neighbour);
					}
				}
			}
			// add connections to connected neighbours
			if (addedConnections > 0) {
				for (let direction of self.grid.DIRECTIONS) {
					if ((direction & addedConnections) > 0) {
						const { neighbour } = self.grid.find_neighbour(index, direction);
						const neighbourCell = self.unsolved.get(neighbour);
						if (neighbourCell === undefined) {
							continue;
						}
						neighbourCell.addConnection(self.grid.OPPOSITE.get(direction) || 0);
						self.mergeComponents(index, neighbour);
						self.dirty.add(neighbour);
					}
				}
			}
			// check if cell is solved
			if (cell.possible.size === 1) {
				// remove solved cell from its component
				const component = self.components.get(index);
				if (component !== undefined) {
					component.delete(index);
					if (component.size === 0 && self.unsolved.size > 1) {
						throw new IslandDetectedException();
					}
				}
				const orientation = cell.possible.keys().next().value;
				self.solution[index] = orientation;
				self.unsolved.delete(index);
				self.components.delete(index);
				yield [index, orientation];
			}
		}
	};

	/**
	 * Makes a copy of the solver
	 * @return {Solver}
	 */
	self.clone = function () {
		const clone = new Solver([], self.grid);
		clone.unsolved = new Map([]);
		self.unsolved.forEach((cell, index) => {
			clone.unsolved.set(index, cell.clone());
		});
		clone.components = new Map([]);
		self.components.forEach((component, index) => {
			const newComponent = new Set(component);
			for (let componentCell of newComponent) {
				if (clone.components.has(componentCell)) {
					break;
				}
				clone.components.set(componentCell, newComponent);
			}
		});
		clone.solution = [...self.solution];
		clone.dirty = new Set();
		clone.progress = [];
		return clone;
	};

	self.solve = function* () {
		if (self.dirty.size === 0) {
			self.applyBorderConditions();
		}

		/** @type {{index: Number, guess: Number, solver:Solver}[]} */
		const trials = [{ index: -1, guess: -1, solver: self }];
		let iter = 0;
		while (trials.length > 0) {
			iter += 1;
			// if (iter > 100) {
			// 	break;
			// }
			const lastTrial = trials[trials.length - 1];
			if (lastTrial === undefined) {
				break;
			}
			const { index, guess, solver } = lastTrial;
			try {
				for (let step of solver.processDirtyCells()) {
					yield step;
				}
			} catch (error) {
				// something went wrong, no solution here
				if (trials.length > 1) {
					trials.pop();
					const parent = trials[trials.length - 1].solver;
					const cell = parent.unsolved.get(index);
					cell?.possible.delete(guess);
					parent.dirty.add(index);
					continue;
				}
			}
			if (solver.unsolved.size == 0) {
				// got a solution
				self.solution = solver.solution;
				break;
			} else {
				// we have to make a guess
				const clone = solver.clone();
				const [index, cell] = clone.unsolved.entries().next().value;
				const guess = cell.possible.keys().next().value;
				cell.possible = new Set([guess]);
				clone.dirty.add(index);
				trials.push({
					index,
					guess,
					solver: clone
				});
			}
		}
	};
}
