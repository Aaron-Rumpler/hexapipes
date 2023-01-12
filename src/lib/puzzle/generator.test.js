import { describe, expect, it } from 'vitest';
import { Generator } from './generator';
import { HexaGrid } from './hexagrid';
import { Solver } from './solver';
const fs = require('fs');

describe('Test Prims pregeneration', () => {
	const branchingAmount = 1;

	it('Pregenerates a solvable puzzle 5x5', () => {
		const grid = new HexaGrid(5, 5, false);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});

	it('Pregenerates a solvable puzzle 5x5 wrap', () => {
		const grid = new HexaGrid(5, 5, true);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});

	it('Pregenerates a solvable puzzle 4x6', () => {
		const grid = new HexaGrid(4, 6, false);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});

	it('Pregenerates a solvable puzzle 4x6 wrap', () => {
		const grid = new HexaGrid(4, 6, true);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});
});

describe('Test Recursive Backtracking pregeneration', () => {
	const branchingAmount = 0;

	it('Pregenerates a solvable puzzle 5x5', () => {
		const grid = new HexaGrid(5, 5, false);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});

	it('Pregenerates a solvable puzzle 5x5 wrap', () => {
		const grid = new HexaGrid(5, 5, true);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});

	it('Pregenerates a solvable puzzle 4x6', () => {
		const grid = new HexaGrid(4, 6, false);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});

	it('Pregenerates a solvable puzzle 4x6 wrap', () => {
		const grid = new HexaGrid(4, 6, true);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});
});

describe('Test Growing Tree pregeneration', () => {
	const branchingAmount = 0.5;

	it('Pregenerates a solvable puzzle 5x5', () => {
		const grid = new HexaGrid(5, 5, false);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});

	it('Pregenerates a solvable puzzle 5x5 wrap', () => {
		const grid = new HexaGrid(5, 5, true);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});

	it('Pregenerates a solvable puzzle 4x6', () => {
		const grid = new HexaGrid(4, 6, false);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});

	it('Pregenerates a solvable puzzle 4x6 wrap', () => {
		const grid = new HexaGrid(4, 6, true);
		const gen = new Generator(grid);
		const tiles = gen.pregenerate_growingtree(branchingAmount);
		const solver = new Solver(tiles, grid);
		const { solvable } = solver.markAmbiguousTiles();
		expect(solvable).toBe(true);
	});
});

describe('Test solution uniqueness', () => {
	it('Generates a 20x20 wrap puzzle with a unique solution every time', () => {
		const grid = new HexaGrid(20, 20, true);
		// test with a larger number of attempts to be really sure
		for (let i = 0; i < 100; i++) {
			const gen = new Generator(grid);
			const tiles = gen.generate();
			const solver = new Solver(tiles, grid);
			for (let _ of solver.solve(true)) {
			}
			expect(solver.solutions.length).toBe(1);
		}
	});
});

describe('Test steps distribution', () => {
	it.skip('Checks difficulty distribution in generated 5x5 wraps', () => {
		const grid = new HexaGrid(5, 5, true);
		const counts = new Map();
		const examples = new Map();
		for (let i = 0; i < 1000; i++) {
			const gen = new Generator(grid);
			const tiles = gen.generate();
			const solver = new Solver(tiles, grid);
			let steps = 0;
			for (let _ of solver.solve(true)) {
				steps += 1;
			}
			counts.set(steps, (counts.get(steps) || 0) + 1);
			if (!examples.has(steps)) {
				examples.set(steps, tiles);
			}
		}
		const filename = `generator_stats/${grid.width}x${grid.height}${
			grid.wrap ? 'wrap' : ''
		}_steps.json`;
		const data = {
			steps: [...counts.entries()].sort((a, b) => a[0] - b[0]),
			examples: [...examples.entries()].sort((a, b) => a[0] - b[0])
		};
		fs.writeFile(filename, JSON.stringify(data, undefined, '\t'), function (err) {
			if (err) {
				console.log(err);
			} else {
				console.log('file saved');
			}
		});
	});

	it.skip('Finds median steps per tile for puzzles of different sizes', () => {
		const NUM_TRIALS = 100;
		const results = [];
		for (let width of [3, 4, 5, 6, 7, 8, 9, 10]) {
			for (let height of [3, 4, 5, 6, 7, 8, 9, 10]) {
				let counts = [];
				for (let i = 0; i < NUM_TRIALS; i++) {
					const grid = new HexaGrid(width, height, true);
					const gen = new Generator(grid);
					const tiles = gen.generate();
					const solver = new Solver(tiles, grid);
					let steps = 0;
					for (let _ of solver.solve(true)) {
						steps += 1;
					}
					counts.push(steps);
				}
				counts.sort((a, b) => a - b);
				results.push({
					width,
					height,
					min: counts[0],
					max: counts[counts.length - 1],
					p50: counts[Math.floor(NUM_TRIALS / 2)],
					p25: counts[Math.floor(NUM_TRIALS * 0.25)],
					p75: counts[Math.floor(NUM_TRIALS * 0.75)]
				});
			}
		}
		fs.writeFile(
			'generator_stats/iterations_per_tile.json',
			JSON.stringify(results, undefined, '\t'),
			function (err) {
				if (err) {
					console.log(err);
				} else {
					console.log('file saved');
				}
			}
		);
	});
});

describe('Check difficulty', () => {
	it.skip('Check difficulty of static instances', () => {
		const results = [];
		const deadends = new Set(new HexaGrid(2, 2).DIRECTIONS);
		for (let wrap of [false, true]) {
			for (let size of [5, 7, 10, 15, 20, 30, 40]) {
				for (let i = 1; i <= 1000; i++) {
					const path = `static/_instances/hexagonal${
						wrap ? '-wrap' : ''
					}/${size}x${size}/${Math.floor((i - 1) / 100)}/${i}.json`;
					const data = fs.readFileSync(path, { encoding: 'utf-8' });
					const instance = JSON.parse(data);
					const grid = new HexaGrid(size, size, wrap);
					const solver = new Solver(instance.tiles, grid);
					let steps = 0;
					for (let _ of solver.solve(true)) {
						steps += 1;
					}
					results.push({
						width: size,
						height: size,
						wrap,
						numDeadends: instance.tiles.reduce((prev, x) => prev + (deadends.has(x) ? 1 : 0), 0),
						id: i,
						steps,
						stepsPerTile: steps / grid.total
					});
				}
			}
		}
		fs.writeFileSync(
			'generator_stats/static_difficulty.json',
			JSON.stringify(results, undefined, '\t')
		);
	});

	it.skip('Check difficulty of generated instances', () => {
		const results = [];
		const deadends = new Set(new HexaGrid(2, 2).DIRECTIONS);
		for (let branchingAmount of [0, 0.25, 0.5, 0.75, 1]) {
			for (let wrap of [false, true]) {
				for (let size of [5, 7, 10, 15, 20, 30, 40]) {
					for (let i = 1; i <= 1000; i++) {
						const grid = new HexaGrid(size, size, wrap);
						const gen = new Generator(grid);
						const tiles = gen.generate(branchingAmount);
						const solver = new Solver(tiles, grid);
						let steps = 0;
						for (let _ of solver.solve(true)) {
							steps += 1;
						}
						results.push({
							width: size,
							height: size,
							wrap,
							branchingAmount,
							numDeadends: tiles.reduce((prev, x) => prev + (deadends.has(x) ? 1 : 0), 0),
							id: i,
							steps,
							stepsPerTile: steps / grid.total
						});
					}
				}
			}
		}
		fs.writeFileSync(
			'generator_stats/generated_difficulty.json',
			JSON.stringify(results, undefined, '\t')
		);
	});
});

describe('Generate dailies', () => {
	it.skip('Creates evil puzzles', () => {
		// setup params
		const width = 7;
		const height = 8;
		const wrap = true;
		// add grid features
		const grid = new HexaGrid(width, height, wrap);
		[0, 1, 2, 3, 4, 5, 6].forEach((i) => grid.makeEmpty(i));
		// target difficulty in steps per tile
		const writeFileIfMoreThan = 3.7;
		let bestSteps = 0;
		const files = fs.readdirSync('generator_stats/dailies');
		let fileNumber = files.reduce((n, file) => Math.max(n, Number(file.split('.')[0])), 0) + 1;
		console.log(fileNumber);
		for (let i = 0; i < 100000; i++) {
			const gen = new Generator(grid);
			const tiles = gen.generate();
			const solver = new Solver(tiles, grid);
			let steps = 0;
			for (let _ of solver.solve(true)) {
				steps += 1;
			}
			steps /= grid.total;
			if (steps > bestSteps) {
				bestSteps = steps;
				const filename = `generator_stats/dailies/${fileNumber < 10 ? '0' : ''}${fileNumber}.json`;
				console.log({ steps: steps * grid.total, bestSteps, filename });
				if (bestSteps > writeFileIfMoreThan) {
					fs.writeFileSync(
						filename,
						JSON.stringify(
							{
								width,
								height,
								wrap,
								tiles,
								comment: `Hard 7x7 horizontal wrap`
							},
							undefined,
							'\t'
						)
					);
					fileNumber += 1;
				}
			}
		}
	});
});
