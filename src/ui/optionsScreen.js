/**
 * New-game options screen (design doc §8 "Options"): map size/type,
 * AI count (1-5) with per-AI difficulty, and the fog-of-war toggle.
 * Loads the matching pre-generated candidates from data/maps/*.json
 * and randomly picks one, per §1 ("one is picked at random based on
 * the chosen game options").
 *
 * Only "Easy" is offered per-AI for now -- "Hard" arrives in Stage 7
 * (src/ai/difficulty/hard.js doesn't exist yet, so offering it here
 * would be a selectable option that silently does nothing different).
 */
import { MAP_SIZES, MAP_TYPES } from "../map-gen/sizes.js";
import { decodeRow } from "../map-gen/terrainCodes.js";
import { createInitialState } from "../state/initialState.js";
import { DIFFICULTY_NAMES } from "../ai/difficulty/index.js";

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

const DIFFICULTY_LABELS = { easy: "Easy", hard: "Hard" };
const MIN_AI = 1;
const MAX_AI = 5;

/**
 * @param {HTMLElement} root
 * @param {(canonicalState: object, opts: {aiDifficulties: string[]}) => void} onPlay
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
  const aiCountSelect = buildSelect(
    "ai-count",
    Array.from({ length: MAX_AI - MIN_AI + 1 }, (_, i) => String(MIN_AI + i)),
    {}
  );

  const fogCheckbox = document.createElement("input");
  fogCheckbox.type = "checkbox";
  fogCheckbox.id = "fog-toggle";
  fogCheckbox.checked = true;

  const aiDifficultyContainer = document.createElement("div");
  aiDifficultyContainer.style.cssText = "display: flex; flex-direction: column; gap: 10px; width: 100%;";

  function renderAiDifficultySelectors() {
    aiDifficultyContainer.innerHTML = "";
    const count = Number(aiCountSelect.value);
    for (let i = 0; i < count; i++) {
      const select = buildSelect(`ai-difficulty-${i}`, DIFFICULTY_NAMES, DIFFICULTY_LABELS);
      aiDifficultyContainer.append(labeledField(`AI ${i + 1} difficulty`, select));
    }
  }
  aiCountSelect.addEventListener("change", renderAiDifficultySelectors);
  renderAiDifficultySelectors();

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
      const aiDifficulties = Array.from(aiDifficultyContainer.querySelectorAll("select")).map((s) => s.value);
      const canonicalState = await loadRandomMap(sizeSelect.value, typeSelect.value, fogCheckbox.checked);
      onPlay(canonicalState, { aiDifficulties });
    } catch (err) {
      console.error(err);
      status.textContent = `Failed to load map: ${err.message}`;
      playBtn.disabled = false;
    }
  });

  const fogField = document.createElement("label");
  fogField.style.cssText = "display: flex; align-items: center; gap: 8px; color: var(--parchment); font-family: var(--font-body); font-size: 14px;";
  fogField.append(fogCheckbox, document.createTextNode("Fog of war"));

  panel.append(
    title,
    labeledField("Map size", sizeSelect),
    labeledField("Map type", typeSelect),
    labeledField("Number of AI opponents", aiCountSelect),
    aiDifficultyContainer,
    fogField,
    playBtn,
    status
  );
  root.append(panel);
}

function buildSelect(id, values, labels) {
  const select = document.createElement("select");
  select.id = id;
  select.className = "select";
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
    "display: flex; flex-direction: column; gap: 6px; color: var(--parchment); font-family: var(--font-body); font-size: 14px; width: 100%;";
  const span = document.createElement("span");
  span.textContent = labelText;
  wrapper.append(span, control);
  return wrapper;
}

/**
 * @param {string} size
 * @param {string} type
 * @param {boolean} fogEnabled
 * @returns {Promise<object>} canonical state built from a random candidate
 */
async function loadRandomMap(size, type, fogEnabled) {
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
    fogEnabled,
  });
}
