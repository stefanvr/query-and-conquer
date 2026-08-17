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
 * @param {() => void} onStart - called when the player presses Start
 */
export function renderStartScreen(root, onStart) {
  root.innerHTML = "";

  const screen = document.createElement("div");
  screen.className = "screen";

  const title = document.createElement("div");
  title.className = "title";
  title.innerHTML = 'QUERY &amp; <span>CONQUER</span>';

  const startBtn = document.createElement("button");
  startBtn.className = "btn-primary";
  startBtn.type = "button";
  startBtn.textContent = "Start";
  startBtn.addEventListener("click", () => onStart());

  screen.append(title, startBtn);
  root.append(screen);
}
