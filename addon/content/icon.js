// Build a clickable icon element. Returns a span the caller can place anywhere
// in the live document. Styling lives in styles/content.css under the .sffi-
// prefix; this module only owns DOM structure and behavior.

const SVG_NS = "http://www.w3.org/2000/svg";

export function createIcon({ pending = false, title = "Explore formula" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = pending ? "sffi-icon sffi-icon--pending" : "sffi-icon";
  button.setAttribute("data-sffi-icon", "true");
  button.setAttribute("aria-label", title);
  button.title = title;
  button.appendChild(createGlyph());
  return button;
}

function createGlyph() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");

  const lens = document.createElementNS(SVG_NS, "circle");
  lens.setAttribute("cx", "6.5");
  lens.setAttribute("cy", "6.5");
  lens.setAttribute("r", "4");
  lens.setAttribute("stroke", "currentColor");
  lens.setAttribute("stroke-width", "1.5");
  lens.setAttribute("fill", "none");

  const handle = document.createElementNS(SVG_NS, "line");
  handle.setAttribute("x1", "9.5");
  handle.setAttribute("y1", "9.5");
  handle.setAttribute("x2", "13.25");
  handle.setAttribute("y2", "13.25");
  handle.setAttribute("stroke", "currentColor");
  handle.setAttribute("stroke-width", "1.5");
  handle.setAttribute("stroke-linecap", "round");

  svg.append(lens, handle);
  return svg;
}

export function promoteToReady(iconEl, title) {
  if (!iconEl) return;
  iconEl.classList.remove("sffi-icon--pending");
  if (title) {
    iconEl.title = title;
    iconEl.setAttribute("aria-label", title);
  }
  iconEl.replaceChildren(createGlyph());
}

export function removeIcon(iconEl) {
  if (iconEl && iconEl.parentNode) iconEl.parentNode.removeChild(iconEl);
}
