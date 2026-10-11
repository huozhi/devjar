const scrollKey = '__devjar_hmr_scroll'

export function reloadPreservingScroll() {
  sessionStorage.setItem(scrollKey, JSON.stringify({
    url: location.href,
    x: scrollX,
    y: scrollY,
  }))
  location.reload()
}

export function restoreScroll() {
  const saved = sessionStorage.getItem(scrollKey)
  if (!saved) return
  sessionStorage.removeItem(scrollKey)

  try {
    const position = JSON.parse(saved) as { url: string, x: number, y: number }
    if (position.url !== location.href) return
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scrollTo(position.x, position.y)
    }))
  } catch {
    // Ignore stale or malformed session data.
  }
}
