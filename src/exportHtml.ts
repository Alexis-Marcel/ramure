/**
 * Export « page à partager » : un fichier HTML autonome, sans dépendance,
 * contenant l'arbre en SVG avec navigation (molette pour zoomer, glisser pour
 * se déplacer). Se transmet par mail ou se dépose sur n'importe quel hébergeur
 * statique.
 */
export function buildShareHtml(opts: {
  title: string
  svgMarkup: string
  viewBox: { x: number; y: number; w: number; h: number }
}): string {
  const { title, svgMarkup, viewBox } = opts
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Ramure</title>
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    background: #f6f8f6;
    color: #17211b;
    overflow: hidden;
  }
  header {
    position: fixed; inset: 0 0 auto 0; z-index: 2;
    display: flex; align-items: baseline; gap: 12px;
    padding: 14px 20px;
    background: linear-gradient(#f6f8f6ee, #f6f8f600);
    pointer-events: none;
  }
  h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  header span { font-size: 13px; opacity: 0.6; }
  svg { width: 100vw; height: 100vh; display: block; cursor: grab; touch-action: none; }
  svg:active { cursor: grabbing; }
  footer {
    position: fixed; right: 16px; bottom: 12px; z-index: 2;
    font-size: 12px; opacity: 0.55;
  }
  footer a { color: inherit; }
</style>
</head>
<body>
<header><h1>${escapeHtml(title)}</h1><span>molette pour zoomer, glisser pour explorer</span></header>
<svg id="tree" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}" xmlns="http://www.w3.org/2000/svg">
${svgMarkup}
</svg>
<footer>arbre créé avec <a href="https://github.com/Alexis-Marcel/ramure">Ramure</a></footer>
<script>
(function () {
  var svg = document.getElementById('tree')
  var vb = { x: ${viewBox.x}, y: ${viewBox.y}, w: ${viewBox.w}, h: ${viewBox.h} }
  function apply() { svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h) }
  svg.addEventListener('wheel', function (e) {
    e.preventDefault()
    var scale = Math.exp(e.deltaY * 0.002)
    var rect = svg.getBoundingClientRect()
    var px = vb.x + ((e.clientX - rect.left) / rect.width) * vb.w
    var py = vb.y + ((e.clientY - rect.top) / rect.height) * vb.h
    vb.w *= scale; vb.h *= scale
    vb.x = px - (px - vb.x) * scale
    vb.y = py - (py - vb.y) * scale
    apply()
  }, { passive: false })
  var drag = null
  svg.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY }
    svg.setPointerCapture(e.pointerId)
  })
  svg.addEventListener('pointermove', function (e) {
    if (!drag) return
    var rect = svg.getBoundingClientRect()
    vb.x -= ((e.clientX - drag.x) / rect.width) * vb.w
    vb.y -= ((e.clientY - drag.y) / rect.height) * vb.h
    drag = { x: e.clientX, y: e.clientY }
    apply()
  })
  svg.addEventListener('pointerup', function () { drag = null })
})()
</script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
