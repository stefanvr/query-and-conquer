// Game options menu — per implementation-spec.md §8 "Game options menu".
import { SIZES, TYPES, isComboSupported } from "../map/map-tables.js";

// Hard stays disabled until Stage 12 (implementation-tracking-v1.md).
const DIFFICULTIES = [
  { value: "easy", label: "Easy", disabled: false },
  { value: "hard", label: "Hard", disabled: true },
];

async function pickRandomMap(size, type) {
  const index = await (await fetch("assets/maps/index.json")).json();
  const candidates = index.filter((e) => e.size === size && e.type === type);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return (await fetch(`assets/maps/${chosen.file}`)).json();
}

/** @param {{ onBack: () => void, onStartMatch: (options: object, mapData: object) => void }} handlers */
export function initOptionsMenu({ onBack, onStartMatch }) {
  const form = document.querySelector("#options-form");
  const aiCountSelect = document.querySelector("#opt-ai-count");
  const aiDifficultiesContainer = document.querySelector("#opt-ai-difficulties");
  const mapSizeSelect = document.querySelector("#opt-map-size");
  const mapTypeSelect = document.querySelector("#opt-map-type");
  const fogCheckbox = document.querySelector("#opt-fog");
  const startButton = document.querySelector("#start-match-button");
  const backButton = document.querySelector("#options-back-button");

  for (let n = 1; n <= 5; n++) {
    const opt = document.createElement("option");
    opt.value = String(n);
    opt.textContent = String(n);
    aiCountSelect.appendChild(opt);
  }
  for (const size of Object.keys(SIZES)) {
    const opt = document.createElement("option");
    opt.value = size;
    opt.textContent = size;
    mapSizeSelect.appendChild(opt);
  }

  function renderAiDifficulties() {
    const count = Number(aiCountSelect.value);
    aiDifficultiesContainer.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const label = document.createElement("label");
      label.textContent = `AI ${i + 1} difficulty`;
      const select = document.createElement("select");
      select.dataset.aiIndex = String(i);
      for (const d of DIFFICULTIES) {
        const opt = document.createElement("option");
        opt.value = d.value;
        opt.textContent = d.label;
        opt.disabled = d.disabled;
        select.appendChild(opt);
      }
      label.appendChild(select);
      aiDifficultiesContainer.appendChild(label);
    }
  }

  function renderMapTypes() {
    const size = mapSizeSelect.value;
    const previouslySelected = mapTypeSelect.value;
    mapTypeSelect.innerHTML = "";
    for (const type of Object.keys(TYPES)) {
      if (!isComboSupported(size, type)) continue; // e.g. islands is unsupported at small (§1)
      const opt = document.createElement("option");
      opt.value = type;
      opt.textContent = type;
      mapTypeSelect.appendChild(opt);
    }
    const stillValid = [...mapTypeSelect.options].some((o) => o.value === previouslySelected);
    if (stillValid) mapTypeSelect.value = previouslySelected;
  }

  function resetForm() {
    aiCountSelect.value = "1";
    renderAiDifficulties();
    mapSizeSelect.value = "small";
    renderMapTypes();
    fogCheckbox.checked = true;
  }

  aiCountSelect.addEventListener("change", renderAiDifficulties);
  mapSizeSelect.addEventListener("change", renderMapTypes);
  backButton.addEventListener("click", onBack);
  form.addEventListener("submit", (e) => e.preventDefault());

  startButton.addEventListener("click", async () => {
    const aiDifficulties = [...aiDifficultiesContainer.querySelectorAll("select")].map((s) => s.value);
    const options = {
      aiDifficulties,
      mapSize: mapSizeSelect.value,
      mapType: mapTypeSelect.value,
      fogOfWar: fogCheckbox.checked,
    };
    const mapData = await pickRandomMap(options.mapSize, options.mapType);
    onStartMatch(options, mapData);
  });

  resetForm();
  return { resetForm };
}
