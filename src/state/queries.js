// Read side of tech-stack.md's CQRS-lite / state-access rule. Rendering and UI must go through
// this, never touch canonical state directly — a deliberate seam established from Stage 3
// onward even though it's a passthrough today. Stage 9 (Fog of war) fills in real per-viewer
// filtering here; nothing else needs to change when it does.
export function getVisibleState(canonicalState, viewerId) {
  return canonicalState;
}
