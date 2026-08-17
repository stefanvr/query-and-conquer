/**
 * Start screen (doc/style-guide.md §9 "Start screen").
 *
 * Renders the circular vignette-cropped background, title, and primary
 * CTA button as real DOM built from JS (not a static HTML copy of
 * style-preview.html), so it can be wired to app state/navigation from
 * here on. Layout/token CSS is loaded globally via index.html; this
 * module only owns structure and behavior.
 */

/**
 * @param {HTMLElement} root - container to render into
 * @param {{onStart: () => void, onContinue?: () => void, hasSave?: boolean}} opts
 */
export function renderStartScreen(root, { onStart, onContinue, hasSave = false }) {
  root.innerHTML = "";

  const screen = document.createElement("div");
  screen.className = "screen";

  const title = document.createElement("div");
  title.className = "title";
  title.innerHTML = 'QUERY &amp; <span>CONQUER</span>';

  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = "display: flex; flex-direction: column; gap: 10px; align-items: center;";

  const startBtn = document.createElement("button");
  startBtn.className = "btn-primary";
  startBtn.type = "button";
  startBtn.textContent = hasSave ? "New Game" : "Start";
  startBtn.addEventListener("click", () => onStart());
  buttonRow.append(startBtn);

  if (hasSave && onContinue) {
    const continueBtn = document.createElement("button");
    continueBtn.className = "btn-primary";
    continueBtn.type = "button";
    continueBtn.style.cssText = "font-size: 14px; padding: 8px 32px;";
    continueBtn.textContent = "Continue";
    continueBtn.addEventListener("click", () => onContinue());
    buttonRow.append(continueBtn);
  }

  screen.append(title, buttonRow);
  root.append(screen);
}
