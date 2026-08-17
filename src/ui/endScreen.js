/**
 * End-of-game screen (design doc §6): "victory/loss result, full map
 * reveal (fog removed, but read-only -- no further actions), all
 * bases/units annotated with details, and a stats dialog (units
 * built/lost per player)." Reads via getEndGameState (the one
 * documented fog-bypass exception, see its module doc), never
 * canonicalState directly.
 */
import { getPlayerColor } from "../render/colorTokens.js";

/**
 * @param {HTMLElement} root
 * @param {{status: {winnerId: number|string|null}, endGameState: object, viewerId: number|string, onBackToMenu: () => void}} opts
 */
export function renderEndScreen(root, { status, endGameState, viewerId, onBackToMenu }) {
  root.innerHTML = "";

  const isVictory = status.winnerId === viewerId;

  const panel = document.createElement("div");
  panel.style.cssText =
    "display: flex; flex-direction: column; gap: 20px; align-items: center; padding: 48px 20px; " +
    "font-family: var(--font-body); color: var(--parchment); max-width: 640px; margin: 0 auto;";

  const title = document.createElement("h1");
  title.textContent = isVictory ? "Victory" : "Defeat";
  title.style.cssText = `font-family: var(--font-display); letter-spacing: 0.06em; color: ${isVictory ? "var(--signal)" : "var(--rust)"}; margin: 0; font-size: 40px;`;

  const statsTitle = document.createElement("h2");
  statsTitle.textContent = "Stats";
  statsTitle.style.cssText = "font-family: var(--font-display); letter-spacing: 0.06em; margin: 0;";

  const table = document.createElement("table");
  table.style.cssText = "border-collapse: collapse; width: 100%;";
  const header = document.createElement("tr");
  for (const text of ["Player", "Bases owned", "Units built", "Units lost"]) {
    const th = document.createElement("th");
    th.textContent = text;
    th.style.cssText = "text-align: left; padding: 6px 12px; border-bottom: 1px solid var(--olive); color: var(--steel);";
    header.append(th);
  }
  table.append(header);

  endGameState.players.forEach((player, index) => {
    const row = document.createElement("tr");
    const basesOwned = endGameState.bases.filter((b) => b.ownerId === player.id).length;
    const cells = [
      player.id === viewerId ? "You" : `Player ${index + 1}`,
      String(basesOwned),
      String(player.stats.unitsBuilt),
      String(player.stats.unitsLost),
    ];
    cells.forEach((text, i) => {
      const td = document.createElement("td");
      td.textContent = text;
      td.style.cssText = "padding: 6px 12px; border-bottom: 1px solid var(--olive);";
      if (i === 0) {
        td.style.color = getPlayerColor(index);
        td.style.fontWeight = "bold";
      }
      row.append(td);
    });
    table.append(row);
  });

  const backBtn = document.createElement("button");
  backBtn.className = "btn-primary";
  backBtn.type = "button";
  backBtn.textContent = "Back to menu";
  backBtn.addEventListener("click", onBackToMenu);

  panel.append(title, statsTitle, table, backBtn);
  root.append(panel);
}
