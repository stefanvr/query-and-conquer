// End screen — full map reveal, read-only, per implementation-spec.md §8 "End screen" and §9
// "Stats display". Reached from game-screen.js's onGameOver, on a natural win/loss
// (state.gameEnded/winnerId) or a surrender (state.terminated, always a defeat for the human).
import { playerLabel } from "../state/game-state.js";
import { createMapCamera } from "../render/map-canvas.js";

/** @param {{ onMainMenu: () => void }} handlers */
export function initEndScreen({ onMainMenu }) {
  const canvas = document.querySelector("#end-map-canvas");
  const resultLabel = document.querySelector("#end-result");
  const statsButton = document.querySelector("#end-stats-button");
  const mainMenuButton = document.querySelector("#end-main-menu-button");
  const zoomInButton = document.querySelector("#end-zoom-in-button");
  const zoomOutButton = document.querySelector("#end-zoom-out-button");
  const statsOverlay = document.querySelector("#end-stats-overlay");
  const statsRows = document.querySelector("#end-stats-rows");
  const statsCloseButton = document.querySelector("#end-stats-close-button");

  let camera = null;

  function openStats(state) {
    statsRows.innerHTML = "";
    for (const player of state.players) {
      const { text, colorVar } = playerLabel(player);
      const row = document.createElement("p");
      row.className = "menu-body-text";
      const name = document.createElement("span");
      name.textContent = text;
      name.style.color = `var(${colorVar})`;
      row.append(name, document.createTextNode(` — Built: ${player.stats.unitsBuilt}, Lost: ${player.stats.unitsLost}`));
      statsRows.appendChild(row);
    }
    statsOverlay.hidden = false;
  }
  function closeStats() {
    statsOverlay.hidden = true;
  }

  statsCloseButton.addEventListener("click", closeStats);
  mainMenuButton.addEventListener("click", () => {
    closeStats();
    onMainMenu();
  });
  zoomInButton.addEventListener("click", () => camera?.zoomIn());
  zoomOutButton.addEventListener("click", () => camera?.zoomOut());

  return {
    start(state) {
      closeStats();
      camera?.destroy();

      const humanId = state.players.find((p) => p.isHuman)?.id;
      const won = !state.terminated && state.gameEnded && state.winnerId === humanId;
      resultLabel.textContent = won ? "Victory" : "Defeat";
      resultLabel.style.color = `var(${won ? "--signal" : "--rust"})`;

      statsButton.onclick = () => openStats(state);

      const myBase = state.bases.find((b) => b.ownerId === humanId);
      const centerCol = myBase?.col ?? Math.floor(state.map.width / 2);
      const centerRow = myBase?.row ?? Math.floor(state.map.height / 2);
      camera = createMapCamera(canvas, state.map, {
        bases: state.bases,
        units: state.units,
        players: state.players,
        viewerId: humanId,
        revealAll: true, // full map reveal (game spec §7) — no fog, every base's own label shown
        centerOnCol: centerCol,
        centerOnRow: centerRow,
      });
    },
  };
}
