/**
 * New-game options screen.
 *
 * Stage 3: map size/type selection, loads the matching pre-generated
 * candidates from data/maps/*.json and randomly picks one, per design
 * doc §1 ("one is picked at random based on the chosen game options").
 * AI count/difficulty and the fog toggle are added in Stage 6 -- this
 * screen intentionally does not offer them yet.
 */
import { MAP_SIZES, MAP_TYPES } from "../map-gen/sizes.js";
import { decodeRow } from "../map-gen/terrainCodes.js";
import { createInitialState } from "../state/initialState.js";

const SIZE_LABELS = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  "extra-large": "Extra large",
};

const TYPE_LABELS = {
  islands: "Islands",
  "land-only": "Land-only",
  mixed: "Mixed",
};

/**
 * @param {HTMLElement} root
 * @param {(canonicalState: object) => void} onPlay
 */
export function renderOptionsScreen(root, onPlay) {
  root.innerHTML = "";

  const panel = document.createElement("div");
  panel.style.cssText =
    "display: flex; flex-direction: column; gap: 20px; align-items: center; padding: 40px 20px;";

  const title = document.createElement("h1");
  title.textContent = "New game";
  title.style.cssText = `font-family: var(--font-display); letter-spacing: 0.06em; color: var(--parchment); margin: 0;`;

  const sizeSelect = buildSelect("map-size", Object.keys(MAP_SIZES), SIZE_LABELS);
  const typeSelect = buildSelect("map-type", MAP_TYPES, TYPE_LABELS);

  const status = document.createElement("p");
  status.style.cssText = "color: var(--steel); font-family: var(--font-body); min-height: 1.2em; margin: 0;";

  const playBtn = document.createElement("button");
  playBtn.className = "btn-primary";
  playBtn.type = "button";
  playBtn.textContent = "Play";

  playBtn.addEventListener("click", async () => {
    playBtn.disabled = true;
    status.textContent = "Loading map…";
    try {
      const canonicalState = await loadRandomMap(sizeSelect.value, typeSelect.value);
      onPlay(canonicalState);
    } catch (err) {
      console.error(err);
      status.textContent = `Failed to load map: ${err.message}`;
      playBtn.disabled = false;
    }
  });

  panel.append(
    title,
    labeledField("Map size", sizeSelect),
    labeledField("Map type", typeSelect),
    playBtn,
    status
  );
  root.append(panel);
}

function buildSelect(id, values, labels) {
  const select = document.createElement("select");
  select.id = id;
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labels[value] ?? value;
    select.append(option);
  }
  return select;
}

function labeledField(labelText, control) {
  const wrapper = document.createElement("label");
  wrapper.style.cssText =
    "display: flex; flex-direction: column; gap: 6px; color: var(--parchment); font-family: var(--font-body); font-size: 14px;";
  const span = document.createElement("span");
  span.textContent = labelText;
  wrapper.append(span, control);
  return wrapper;
}

/**
 * @param {string} size
 * @param {string} type
 * @returns {Promise<object>} canonical state built from a random candidate
 */
async function loadRandomMap(size, type) {
  const response = await fetch(`data/maps/${size}-${type}.json`);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  const candidateIndex = Math.floor(Math.random() * payload.candidates.length);
  const candidate = payload.candidates[candidateIndex];
  const terrain = candidate.rows.map(decodeRow);

  return createInitialState({
    size: payload.size,
    type: payload.type,
    width: payload.width,
    height: payload.height,
    terrain,
  });
}
