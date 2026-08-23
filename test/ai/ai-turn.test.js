import { test } from "node:test";
import assert from "node:assert/strict";
import { aiTurnActions } from "../../src/ai/ai-turn.js";
import { TerrainGrid } from "../../src/map/grid.js";
import { UNIT_TYPES } from "../../src/state/unit-types.js";
import { offsetKey, offsetDistance } from "../../src/map/hex-coords.js";
import { planesOwingMovement, isValidAttackTarget } from "../../src/state/commands.js";

const MAP_SIZE = 20;

/** AI player 1 vs. human player 0. Fog defaults off, so a rule test isn't also implicitly a
 * visibility test — the one test that cares turns it on explicitly. */
function aiState({ strategy = "aggressive", fogOfWar = false, turnNumber = 1, difficulty = "easy" } = {}) {
  return {
    options: { fogOfWar },
    map: { width: MAP_SIZE, height: MAP_SIZE },
    players: [
      { id: 0, slot: 0, isHuman: true, difficulty: null, strategy: null, exploredCells: [], stats: { unitsBuilt: 0, unitsLost: 0 } },
      { id: 1, slot: 1, isHuman: false, difficulty, strategy, exploredCells: [], stats: { unitsBuilt: 0, unitsLost: 0 } },
    ],
    bases: [],
    units: [],
    nextUnitId: 100,
    turnOrder: [0, 1],
    turnIndex: 1,
    turnNumber,
    terminated: false,
  };
}

function allLandGrid() {
  const grid = new TerrainGrid(MAP_SIZE, MAP_SIZE, () => true);
  for (const { col, row } of grid.cells()) grid.set(col, row, "gras");
  return grid;
}

function unit(overrides = {}) {
  const unitType = overrides.unitType ?? "tank";
  const stats = UNIT_TYPES[unitType];
  return {
    id: 1,
    ownerId: 1,
    unitType,
    col: 5,
    row: 5,
    sp: stats.strength,
    maxSp: stats.strength,
    remainingActions: stats.actionsPerTurn,
    remainingAttacks: stats.attacksPerTurn,
    ...overrides,
  };
}

function base(overrides = {}) {
  return {
    id: 0,
    ownerId: 1,
    lastOwnerId: null,
    type: "land",
    adjacentToDeepWater: false,
    col: 10,
    row: 10,
    sp: 20,
    maxSp: 20,
    garrison: [],
    queue: [],
    inProgress: null,
    ...overrides,
  };
}

/** Drains a whole AI turn into an array of action descriptors. */
function runTurn(state, grid, playerId = 1) {
  return [...aiTurnActions(state, grid, playerId)];
}

test("aggressive attacks an adjacent enemy unit rather than moving", () => {
  const s = aiState({ strategy: "aggressive" });
  const grid = allLandGrid();
  const attacker = unit({ id: 1, col: 5, row: 5 });
  const defender = unit({ id: 2, ownerId: 0, col: 6, row: 5 });
  s.units.push(attacker, defender);

  const actions = runTurn(s, grid);

  assert.deepEqual(actions, [{ type: "attackUnit", unitId: 1, targetId: 2 }]);
  assert.equal(defender.sp, UNIT_TYPES.tank.strength - UNIT_TYPES.tank.groundAtk);
});

test("aggressive advances toward the nearest enemy when nothing is in range", () => {
  const s = aiState({ strategy: "aggressive" });
  const grid = allLandGrid();
  const mover = unit({ id: 1, col: 5, row: 5 });
  const faraway = unit({ id: 2, ownerId: 0, col: 12, row: 5 });
  s.units.push(mover, faraway);

  const actions = runTurn(s, grid);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "move");
  assert.ok(mover.col > 5, "stepped east, toward the enemy");
});

test("aggressive attacks an enemy base in range when no enemy unit is", () => {
  const s = aiState({ strategy: "aggressive" });
  const grid = allLandGrid();
  const attacker = unit({ id: 1, col: 5, row: 5 });
  const enemyBase = base({ id: 7, ownerId: 0, col: 6, row: 5 });
  s.units.push(attacker);
  s.bases.push(enemyBase);

  const actions = runTurn(s, grid);

  assert.equal(actions[0].type, "attackBase");
  assert.equal(actions[0].baseId, 7);
});

test("one action per unit per turn -- an attacker with attacks left still stops after acting (easy AI's unspent budget)", () => {
  const s = aiState({ strategy: "aggressive" });
  const grid = allLandGrid();
  const attacker = unit({ id: 1, col: 5, row: 5 }); // tank: 2 attacks/turn, 5 actions
  const defender = unit({ id: 2, ownerId: 0, col: 6, row: 5 });
  s.units.push(attacker, defender);

  const actions = runTurn(s, grid);

  assert.equal(actions.length, 1, "acted once, then stopped");
  assert.equal(attacker.remainingAttacks, UNIT_TYPES.tank.attacksPerTurn - 1, "the second attack goes unused");
});

test("easy difficulty takes the first valid target by id, not the weakest one its strategy would prefer", () => {
  const s = aiState({ strategy: "aggressive" }); // targetPriority: lowestStrength -- deliberately ignored
  const grid = allLandGrid();
  const attacker = unit({ id: 1, col: 5, row: 5 });
  const healthyButFirst = unit({ id: 2, ownerId: 0, col: 6, row: 5, sp: 10 });
  const nearlyDead = unit({ id: 3, ownerId: 0, col: 5, row: 4, sp: 1 });
  s.units.push(attacker, healthyButFirst, nearlyDead);

  const actions = runTurn(s, grid);

  assert.equal(actions[0].targetId, 2, "lowest id wins, not lowest strength");
  assert.equal(nearlyDead.sp, 1, "the weak one is untouched");
});

test("naive pathing gives up rather than routing around an obstacle (game spec §8's easy pathing)", () => {
  // Balanced, not aggressive: aggressive's third rule is explore-or-expand, which would happily
  // wander off toward unexplored ground and mask whether pathing itself gave up. Balanced's last
  // rule is the advance, so a failed step means no action at all.
  const setup = () => {
    const s = aiState({ strategy: "balanced" });
    const mover = unit({ id: 1, col: 5, row: 5 });
    const target = unit({ id: 2, ownerId: 0, col: 12, row: 5 }); // far out of attack range
    s.units.push(mover, target);
    return { s, mover };
  };

  // First find out which single hex the naive step actually picks, rather than assuming one.
  const dryRun = setup();
  const baseline = runTurn(dryRun.s, allLandGrid());
  assert.equal(baseline[0]?.type, "move", "unobstructed, it advances");
  const chosen = baseline[0].to;

  // Now make exactly that hex impassable and leave every other neighbor wide open.
  const blocked = setup();
  const grid = allLandGrid();
  grid.set(chosen.col, chosen.row, "mountain"); // impassable for a tank (game spec §3)

  const actions = runTurn(blocked.s, grid);

  assert.deepEqual(actions, [], "no action at all -- it won't detour around the one blocked hex");
  assert.deepEqual([blocked.mover.col, blocked.mover.row], [5, 5]);
});

test("defensive retreats into a friendly base with room when damaged", () => {
  const s = aiState({ strategy: "defensive" });
  const grid = allLandGrid();
  const hurt = unit({ id: 1, col: 9, row: 10, sp: 3 });
  const home = base({ id: 0, ownerId: 1, col: 10, row: 10 });
  s.units.push(hurt);
  s.bases.push(home);

  const actions = runTurn(s, grid);

  assert.equal(actions[0].type, "retreat");
  assert.equal(home.garrison.length, 1, "it entered the base");
  assert.equal(home.garrison[0].sp, 3, "damage carried in with it");
});

test("defensive holds still when already inside its base's hold radius (base view + unit view)", () => {
  const s = aiState({ strategy: "defensive" });
  const grid = allLandGrid();
  // Land base view 4 + tank view 3 = hold radius 7; sit at distance 2, well inside it.
  const guard = unit({ id: 1, col: 8, row: 10 });
  const home = base({ id: 0, ownerId: 1, col: 10, row: 10 });
  s.units.push(guard);
  s.bases.push(home);

  const actions = runTurn(s, grid).filter((a) => a.unitId === 1);

  assert.deepEqual(actions, [], "no movement -- it's already holding near base");
  assert.deepEqual([guard.col, guard.row], [8, 10]);
});

test("defensive closes in on its base when farther out than the hold radius", () => {
  const s = aiState({ strategy: "defensive" });
  const grid = allLandGrid();
  const strayed = unit({ id: 1, col: 1, row: 10 }); // distance 9 > 4 + 3
  const home = base({ id: 0, ownerId: 1, col: 10, row: 10 });
  s.units.push(strayed);
  s.bases.push(home);

  const actions = runTurn(s, grid).filter((a) => a.unitId === 1);

  assert.equal(actions[0].type, "move");
  assert.ok(strayed.col > 1, "stepped back toward base");
});

test("balanced claims an adjacent neutral base instead of just walking at it", () => {
  const s = aiState({ strategy: "balanced" });
  const grid = allLandGrid();
  const claimer = unit({ id: 1, col: 9, row: 10 });
  const neutral = base({ id: 3, ownerId: null, lastOwnerId: 0, col: 10, row: 10, sp: 0 });
  s.units.push(claimer);
  s.bases.push(neutral);

  const actions = runTurn(s, grid);

  assert.equal(actions[0].type, "claim");
  assert.equal(neutral.ownerId, 1);
  assert.equal(neutral.garrison[0].id, 1, "the claiming unit garrisons inside");
});

test("balanced won't advance away when it's the last unit holding one of its own bases", () => {
  const s = aiState({ strategy: "balanced" });
  const grid = allLandGrid();
  const lastDefender = unit({ id: 1, col: 11, row: 10 }); // inside the base's own view
  const home = base({ id: 0, ownerId: 1, col: 10, row: 10, garrison: [] });
  const enemy = unit({ id: 2, ownerId: 0, col: 18, row: 10 }); // far away, would otherwise pull it
  s.units.push(lastDefender, enemy);
  s.bases.push(home);

  const actions = runTurn(s, grid).filter((a) => a.unitId === 1);

  assert.deepEqual(actions, [], "stayed put -- the base would be left with nothing");
  assert.deepEqual([lastDefender.col, lastDefender.row], [11, 10]);
});

test("balanced does advance once another unit is left holding the base", () => {
  const s = aiState({ strategy: "balanced" });
  const grid = allLandGrid();
  const goer = unit({ id: 1, col: 11, row: 10 });
  const stayer = unit({ id: 2, col: 10, row: 11 });
  const home = base({ id: 0, ownerId: 1, col: 10, row: 10, garrison: [] });
  const enemy = unit({ id: 3, ownerId: 0, col: 18, row: 10 });
  s.units.push(goer, stayer, enemy);
  s.bases.push(home);

  const moved = runTurn(s, grid).filter((a) => a.type === "move");

  assert.ok(moved.length > 0, "with cover behind it, the advance is allowed");
});

test("a garrisoned unit deploys onto an adjacent hex, so built units actually reach the field", () => {
  const s = aiState({ strategy: "aggressive" });
  const grid = allLandGrid();
  const home = base({ id: 0, ownerId: 1, col: 10, row: 10, garrison: [{ id: 55, unitType: "tank", sp: 10 }] });
  s.bases.push(home);

  const actions = runTurn(s, grid);

  const deploy = actions.find((a) => a.type === "deploy");
  assert.ok(deploy, "deployed");
  assert.equal(deploy.unitId, 55);
  assert.equal(home.garrison.length, 0);
  assert.equal(s.units.length, 1, "it's a field unit now");
  assert.equal(s.units[0].id, 55);
});

test("processing order is base-defenders -> field units -> newly completed units (game spec §8)", () => {
  const s = aiState({ strategy: "aggressive", turnNumber: 4 });
  const grid = allLandGrid();
  const home = base({
    id: 0,
    ownerId: 1,
    col: 10,
    row: 10,
    garrison: [
      { id: 10, unitType: "tank", sp: 10 }, // an existing defender
      { id: 30, unitType: "tank", sp: 10, builtOnTurn: 4 }, // completed this very turn
    ],
  });
  s.bases.push(home);
  s.units.push(unit({ id: 20, col: 2, row: 2 })); // a field unit, far from everything
  s.units.push(unit({ id: 99, ownerId: 0, col: 2, row: 4 })); // gives the field unit something to do

  const order = runTurn(s, grid)
    .filter((a) => a.unitId !== undefined)
    .map((a) => a.unitId);

  assert.deepEqual(order, [10, 20, 30]);
});

test("a newly completed unit isn't acted on twice -- deploying doesn't feed it back into the same turn", () => {
  const s = aiState({ strategy: "aggressive", turnNumber: 2 });
  const grid = allLandGrid();
  const home = base({ id: 0, ownerId: 1, col: 10, row: 10, garrison: [{ id: 42, unitType: "tank", sp: 10, builtOnTurn: 2 }] });
  s.bases.push(home);

  const forUnit42 = runTurn(s, grid).filter((a) => a.unitId === 42);

  assert.equal(forUnit42.length, 1, "deployed, and did not then also move/attack this turn");
  assert.equal(forUnit42[0].type, "deploy");
});

test("with nothing owned yet, a base builds the first type in its strategy's build order", () => {
  const grid = allLandGrid();

  const aggressive = aiState({ strategy: "aggressive" });
  aggressive.bases.push(base({ id: 0, ownerId: 1, type: "port", adjacentToDeepWater: true }));
  const aggressiveBuild = runTurn(aggressive, grid).find((a) => a.type === "build");
  assert.equal(aggressiveBuild.unitType, "tank", "tank leads every build order, and all counts tie at zero");

  // A mountain base can't build a tank at all, so each strategy falls to its first *plane*.
  const defensive = aiState({ strategy: "defensive" });
  defensive.bases.push(base({ id: 0, ownerId: 1, type: "mountain" }));
  const defensiveBuild = runTurn(defensive, grid).find((a) => a.type === "build");
  assert.equal(defensiveBuild.unitType, "fighter");
});

test("a base builds the type it owns fewest of, so the build order past the first entry isn't dead", () => {
  const s = aiState({ strategy: "aggressive" }); // tank > fighter > bomber > ...
  const grid = allLandGrid();
  // Already holding tanks, so the top of the order is no longer the scarcest thing.
  s.bases.push(base({
    id: 0,
    ownerId: 1,
    type: "land",
    garrison: [{ id: 90, unitType: "tank", sp: 10 }, { id: 91, unitType: "tank", sp: 10 }],
  }));

  const build = runTurn(s, grid).find((a) => a.type === "build");
  assert.equal(build.unitType, "fighter", "moved down the order rather than making a third tank");
});

test("a mountain base alternates fighter and bomber, which is what makes taking a mountain base possible at all", () => {
  // The reason this matters: only planes reach a mountain base, only a fighter can claim one, and
  // only a bomber's ground attack breaks one in a sane number of hits (game spec §9). Building
  // nothing but fighters left the AI structurally unable to take one.
  const s = aiState({ strategy: "aggressive" });
  const grid = allLandGrid();
  s.bases.push(base({ id: 0, ownerId: 1, type: "mountain" }));

  const queued = [];
  for (let turn = 0; turn < 4; turn++) {
    const build = runTurn(s, grid).find((a) => a.type === "build");
    if (build) queued.push(build.unitType);
  }

  assert.ok(queued.includes("bomber"), `expected a bomber among ${JSON.stringify(queued)}`);
  assert.ok(queued.includes("fighter"), `expected a fighter among ${JSON.stringify(queued)}`);
});

test("production counts units the player already has in the field, not just at this base", () => {
  const s = aiState({ strategy: "aggressive" });
  const grid = allLandGrid();
  s.bases.push(base({ id: 0, ownerId: 1, type: "land", garrison: [] })); // empty base...
  s.units.push(unit({ id: 1, col: 2, row: 2 }), unit({ id: 2, col: 3, row: 3 })); // ...but two tanks afield

  const build = runTurn(s, grid).find((a) => a.type === "build");
  assert.equal(build.unitType, "fighter", "an empty base still knows the army is tank-heavy");
});

test("a base skips production when its queue is full or it's at capacity (game spec §8)", () => {
  const grid = allLandGrid();

  const fullQueue = aiState();
  fullQueue.bases.push(base({ id: 0, ownerId: 1, queue: Array.from({ length: 5 }, () => ({ unitType: "tank" })) }));
  assert.equal(runTurn(fullQueue, grid).some((a) => a.type === "build"), false, "queue full");

  // Fregats, not tanks: a garrison of tanks would simply deploy out onto the surrounding land
  // first, freeing capacity and making production legal again. A boat can't step onto gras at
  // all (game spec §3's move-cost table), so the garrison stays put and capacity stays full.
  const atCapacity = aiState();
  atCapacity.bases.push(
    base({ id: 0, ownerId: 1, garrison: Array.from({ length: 15 }, (_, i) => ({ id: 200 + i, unitType: "fregat", sp: 15 })) }),
  );
  const capacityActions = runTurn(atCapacity, grid);
  assert.equal(capacityActions.some((a) => a.type === "deploy"), false, "nothing could deploy out");
  assert.equal(capacityActions.some((a) => a.type === "build"), false, "at capacity");
});

test("easy AI respects fog -- it ignores an enemy it can't currently see, and reacts once it can", () => {
  const grid = allLandGrid();

  const hidden = aiState({ strategy: "aggressive", fogOfWar: true });
  const seeker = unit({ id: 1, col: 5, row: 5 });
  // Far outside the tank's view 3, but marked explored, so only *unit* visibility is in play.
  const lurker = unit({ id: 2, ownerId: 0, col: 17, row: 5 });
  hidden.units.push(seeker, lurker);
  hidden.players[1].exploredCells = [offsetKey(17, 5)];

  const blindActions = runTurn(hidden, grid);
  assert.ok(
    !blindActions.some((a) => a.type === "attackUnit"),
    "can't attack what it can't see",
  );

  const spotted = aiState({ strategy: "aggressive", fogOfWar: true });
  const seeker2 = unit({ id: 1, col: 5, row: 5 });
  const visibleEnemy = unit({ id: 2, ownerId: 0, col: 6, row: 5 }); // adjacent, well inside view
  spotted.units.push(seeker2, visibleEnemy);

  const actions = runTurn(spotted, grid);
  assert.equal(actions[0].type, "attackUnit", "reacts to a threat it can actually see");
});

test("an AI turn only ever acts for its own player", () => {
  const s = aiState({ strategy: "aggressive" });
  const grid = allLandGrid();
  const mine = unit({ id: 1, col: 5, row: 5 });
  const theirs = unit({ id: 2, ownerId: 0, col: 15, row: 15 });
  const theirBase = base({ id: 0, ownerId: 0, col: 16, row: 16 });
  s.units.push(mine, theirs);
  s.bases.push(theirBase);

  const actions = runTurn(s, grid);

  assert.ok(actions.every((a) => a.unitId === undefined || a.unitId === 1), "only unit 1 acted");
  assert.ok(!actions.some((a) => a.type === "build"), "didn't build at the human's base");
  assert.deepEqual([theirs.col, theirs.row], [15, 15], "the human's unit never moved");
});

test("an unknown/missing player yields nothing rather than throwing", () => {
  const s = aiState();
  assert.deepEqual(runTurn(s, allLandGrid(), 99), []);
});

test("a whole AI turn is deterministic -- identical action sequences from identical boards", () => {
  const build = () => {
    const s = aiState({ strategy: "balanced" });
    s.units.push(unit({ id: 1, col: 5, row: 5 }), unit({ id: 2, col: 6, row: 6 }), unit({ id: 3, ownerId: 0, col: 12, row: 12 }));
    s.bases.push(base({ id: 0, ownerId: 1, col: 10, row: 10 }));
    return s;
  };
  const grid = allLandGrid();

  assert.deepEqual(runTurn(build(), grid), runTurn(build(), grid));
});

// --- Difficulty: perception (game spec §8's Information and Reaction rows) ---

test("hard AI ignores fog -- it advances on an enemy an easy AI in the same spot can't see", () => {
  const grid = allLandGrid();
  const board = (difficulty) => {
    const s = aiState({ strategy: "aggressive", fogOfWar: true, difficulty });
    // Far outside the tank's view of 3, and unexplored: invisible to anyone respecting fog.
    s.units.push(unit({ id: 1, col: 5, row: 5 }), unit({ id: 2, ownerId: 0, col: 17, row: 5 }));
    return s;
  };

  const blind = board("easy");
  const blindActions = runTurn(blind, grid);
  const seeing = board("hard");
  const seeingActions = runTurn(seeing, grid);

  // Easy can't see the enemy, so aggressive falls through to exploring; hard heads straight at it.
  assert.ok(!blindActions.some((a) => a.type === "move" && a.to.col > 5 && a.to.row === 5));
  assert.ok(seeingActions.some((a) => a.type === "move"));
  // Distance rather than a hand-worked coordinate: stepping east off an odd column legitimately
  // changes the row too (odd-q offset), so "row is still 5" would be asserting the wrong geometry.
  assert.ok(
    offsetDistance(seeing.units[0], seeing.units[1]) < offsetDistance({ col: 5, row: 5 }, seeing.units[1]),
    "closed the distance to the enemy it shouldn't have been able to see",
  );
});

test("hard AI treats the whole map as explored, so it expands rather than exploring", () => {
  const grid = allLandGrid();
  const s = aiState({ strategy: "aggressive", fogOfWar: true, difficulty: "hard" });
  s.units.push(unit({ id: 1, col: 5, row: 5 }));
  s.bases.push(base({ id: 0, ownerId: null, col: 9, row: 5 })); // neutral, unexplored, far off
  s.players[1].exploredCells = [];

  const actions = runTurn(s, grid);

  // With nothing unexplored to walk toward, aggressive rule 3 can only be the expand half. Using
  // its whole budget, it doesn't merely set off toward the base — it gets there and takes it.
  assert.ok(actions.some((a) => a.type === "move"));
  assert.equal(s.bases[0].ownerId, 1, "claimed the neutral base it shouldn't have known about");
});

// --- Difficulty: target priority (game spec §8's Targeting row) ---

test("hard AI applies its strategy's target priority; easy takes whichever it finds first", () => {
  const grid = allLandGrid();
  const board = (difficulty) => {
    // Two enemies both in range of the tank at (5,5). The lower id is the healthy one, so
    // first-valid and lowest-strength genuinely disagree about which to hit.
    const s = aiState({ strategy: "aggressive", difficulty }); // aggressive = lowestStrength
    s.units.push(
      unit({ id: 1, col: 5, row: 5 }),
      unit({ id: 2, ownerId: 0, col: 6, row: 5, sp: 10 }),
      unit({ id: 3, ownerId: 0, col: 5, row: 4, sp: 2 }),
    );
    return s;
  };

  assert.equal(runTurn(board("easy"), grid)[0].targetId, 2, "first valid target, in id order");
  assert.equal(runTurn(board("hard"), grid)[0].targetId, 3, "the weakest one, per the strategy");
});

test("a defensive hard AI goes for the biggest threat rather than the weakest target", () => {
  const grid = allLandGrid();
  const s = aiState({ strategy: "defensive", difficulty: "hard" }); // defensive = highestAttack
  s.bases.push(base({ id: 0, ownerId: 1, col: 5, row: 6 }));
  s.units.push(
    unit({ id: 1, col: 5, row: 5 }),
    unit({ id: 2, ownerId: 0, unitType: "tank", col: 6, row: 5 }),
    unit({ id: 3, ownerId: 0, unitType: "bomber", col: 5, row: 4, actionsSpentMoving: 0, cellsFlown: 0 }),
  );

  const attack = runTurn(s, grid).find((a) => a.type === "attackUnit");
  assert.equal(attack.targetId, 3, "the bomber outguns the tank, so it's the one to neutralize");
});

// --- Difficulty: pathing (game spec §8's Pathing row) ---

test("hard AI routes around a wall that stops an easy AI dead", () => {
  // A wall of deep water immediately east of the unit, with one gap at the far bottom. Naive
  // stepping only ever tries the neighbor that most reduces distance -- which is wall -- so easy
  // gives up; hard finds the way round.
  const walledGrid = () => {
    const grid = allLandGrid();
    for (let row = 0; row < MAP_SIZE - 1; row++) grid.set(6, row, "deep");
    return grid;
  };
  const board = (difficulty) => {
    const s = aiState({ strategy: "aggressive", difficulty });
    s.units.push(unit({ id: 1, col: 5, row: 5 }), unit({ id: 2, ownerId: 0, col: 10, row: 5 }));
    // Everything already explored, so aggressive's explore fallback can't mask the difference.
    s.players[1].exploredCells = [...walledGrid().cells()].map((c) => offsetKey(c.col, c.row));
    return s;
  };

  const stuck = board("easy");
  const routing = board("hard");
  const stuckMoves = runTurn(stuck, walledGrid()).filter((a) => a.type === "move");
  const routingMoves = runTurn(routing, walledGrid()).filter((a) => a.type === "move");

  assert.deepEqual(stuckMoves, [], "easy walked into the wall and stopped");
  assert.ok(routingMoves.length > 0, "hard set off around it");
  assert.notDeepEqual([routing.units[0].col, routing.units[0].row], [5, 5]);
});

test("hard AI takes a hex it can actually shoot from, not merely one near the target", () => {
  // The Fregat is the only unit where this can matter: range 2 *and* needing line of sight, so
  // there are hexes in range of a target that still can't fire on it.
  const grid = new TerrainGrid(MAP_SIZE, MAP_SIZE, () => true);
  for (const { col, row } of grid.cells()) grid.set(col, row, "shallow");
  grid.set(5, 7, "mountain"); // sits on the straight line between the two

  const s = aiState({ strategy: "aggressive", difficulty: "hard" });
  const shooter = unit({ id: 1, unitType: "fregat", col: 5, row: 5 });
  const prey = unit({ id: 2, ownerId: 0, unitType: "fregat", col: 5, row: 8 });
  s.units.push(shooter, prey);
  s.players[1].exploredCells = [...grid.cells()].map((c) => offsetKey(c.col, c.row));

  runTurn(s, grid);

  // Judged from where it ended up, with a fresh turn's budget: the question is whether it chose a
  // hex with a clear line, not whether it had an action left over after walking there.
  const rested = { ...shooter, remainingActions: UNIT_TYPES.fregat.actionsPerTurn, remainingAttacks: 1 };
  assert.ok(isValidAttackTarget(s, grid, rested, prey), "ended the turn with a clear shot lined up");
});

// --- Difficulty: action efficiency (game spec §8's Action efficiency row) ---

test("hard AI spends a unit's whole budget; easy stops after a single action", () => {
  const grid = allLandGrid();
  const board = (difficulty) => {
    const s = aiState({ strategy: "aggressive", difficulty });
    s.units.push(unit({ id: 1, col: 5, row: 5 }), unit({ id: 2, ownerId: 0, col: 14, row: 5 }));
    s.players[1].exploredCells = [...grid.cells()].map((c) => offsetKey(c.col, c.row));
    return s;
  };

  const lazy = board("easy");
  const thorough = board("hard");
  const lazyMoves = runTurn(lazy, grid).filter((a) => a.type === "move");
  const thoroughMoves = runTurn(thorough, grid).filter((a) => a.type === "move");

  assert.equal(lazyMoves.length, 1, "one action per unit, the rest of the budget left unspent");
  assert.equal(thoroughMoves.length, UNIT_TYPES.tank.actionsPerTurn, "walked out its whole budget");
  assert.equal(thorough.units[0].remainingActions, 0);
});

test("a unit whose rules stop applying doesn't burn the rest of its budget", () => {
  // Defensive, at full strength, sitting inside its own hold radius with no enemies: every rule
  // falls through. An unbounded budget must not turn that into an infinite loop or a pointless
  // walk -- "no rule applied" ends the unit's turn just as running out of actions does.
  const s = aiState({ strategy: "defensive", difficulty: "hard" });
  const grid = allLandGrid();
  const idler = unit({ id: 1, col: 10, row: 11 });
  s.units.push(idler);
  s.bases.push(base({ id: 0, ownerId: 1, col: 10, row: 10 }));

  assert.deepEqual(runTurn(s, grid).filter((a) => a.type === "move"), []);
  assert.equal(idler.remainingActions, UNIT_TYPES.tank.actionsPerTurn, "budget untouched");
});

// --- Mandatory plane movement (game spec §3) applied to the AI, not just the human ---
// A defensive AI sitting next to its own base with no enemies about is the cleanest way to get a
// unit its strategy leaves completely idle: every rule falls through. A tank in that spot simply
// does nothing; a plane must still fly.

/** A plane fixture with the fuel counters moveUnit maintains (§3's Plane rearm & fuel). */
function plane(overrides = {}) {
  return unit({ unitType: "fighter", actionsSpentMoving: 0, cellsFlown: 0, ...overrides });
}

test("an idle AI plane is still made to fly its mandatory 50% -- the rule binds the AI, not just the human", () => {
  const s = aiState({ strategy: "defensive" });
  const grid = allLandGrid();
  const idle = plane({ id: 1, col: 10, row: 11 });
  s.units.push(idle);
  s.bases.push(base({ id: 0, ownerId: 1, col: 10, row: 10 }));

  // Base production runs every turn regardless, so these tests look at the movement actions only.
  const moves = runTurn(s, grid).filter((a) => a.type === "move");

  assert.ok(moves.length > 0, "the plane was made to move despite its strategy having no use for it");
  // Half of the fighter's 8 actions per turn.
  assert.ok(idle.actionsSpentMoving >= UNIT_TYPES.fighter.actionsPerTurn / 2);
  assert.deepEqual(planesOwingMovement(s, 1), [], "no plane still owes movement when the turn ends");
});

test("an idle AI tank is left alone -- mandatory movement is a plane rule", () => {
  const s = aiState({ strategy: "defensive" });
  const grid = allLandGrid();
  const idle = unit({ id: 1, col: 10, row: 11 });
  s.units.push(idle);
  s.bases.push(base({ id: 0, ownerId: 1, col: 10, row: 10 }));

  assert.deepEqual(runTurn(s, grid).filter((a) => a.type === "move"), []);
  assert.deepEqual([idle.col, idle.row], [10, 11]);
});

test("a plane that already flew its share isn't forced to fly further", () => {
  const s = aiState({ strategy: "defensive" });
  const grid = allLandGrid();
  const flown = plane({ id: 1, col: 10, row: 11, actionsSpentMoving: UNIT_TYPES.fighter.actionsPerTurn / 2 });
  s.units.push(flown);
  s.bases.push(base({ id: 0, ownerId: 1, col: 10, row: 10 }));

  assert.deepEqual(runTurn(s, grid).filter((a) => a.type === "move"), []);
  assert.deepEqual([flown.col, flown.row], [10, 11]);
});

test("a plane with no base to head for still satisfies the rule", () => {
  const s = aiState({ strategy: "defensive" });
  const grid = allLandGrid();
  const stranded = plane({ id: 1, col: 10, row: 11 });
  s.units.push(stranded); // no bases at all -- nowhere to rearm, but the rule still applies
  const actions = runTurn(s, grid);

  assert.ok(actions.length > 0);
  assert.deepEqual(planesOwingMovement(s, 1), []);
});
