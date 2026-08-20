// App entry point. Stage 1: wires the start screen only — no game room exists yet
// (that lands in Stage 3, per doc/implementation-tracking-v1.md).

function initStartScreen() {
  const startButton = document.querySelector("#start-button");
  if (!startButton) return;

  startButton.addEventListener("click", () => {
    // TODO(stage 3): navigate to the game room (new game / load game) instead of logging.
    console.log("Start clicked — game room not implemented yet (Stage 3).");
  });
}

initStartScreen();
