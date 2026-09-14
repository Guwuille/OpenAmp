export function createMarquee(containerEl) {
  const track = document.createElement('span');
  track.className = 'marquee-track';
  containerEl.innerHTML = '';
  containerEl.appendChild(track);

  let text = '';
  let offset = 0;
  let rafId = null;
  let lastTs = 0;

  function measureOverflow() {
    return track.scrollWidth > containerEl.clientWidth;
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;

    if (measureOverflow()) {
      offset -= dt * 0.03;
      const resetPoint = -(track.scrollWidth + 30);
      if (offset < resetPoint) offset = containerEl.clientWidth;
      track.style.transform = `translateX(${offset}px)`;
    } else {
      track.style.transform = 'translateX(0)';
    }
    rafId = requestAnimationFrame(tick);
  }

  return {
    setText(newText) {
      text = newText || '';
      track.textContent = text;
      offset = 0;
      lastTs = 0;
      track.style.transform = 'translateX(0)';
    },
    start() {
      if (rafId) return;
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
