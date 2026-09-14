// Marquesina continua.
//
// Con una sola copia del texto hay que esperar a que salga entera por la
// izquierda para reponerla por la derecha, y entre medio queda un hueco: se ve
// como si el titulo se cortara y volviera de golpe al principio. Con una
// segunda copia pisandole los talones, el desplazamiento se puede reiniciar
// justo cuando la primera termina y el salto no se nota.

const SEPARATOR = '     •     ';
const PIXELS_PER_SECOND = 32;

export function createMarquee(containerEl) {
  const track = document.createElement('span');
  track.className = 'marquee-track';

  const primary = document.createElement('span');
  const echo = document.createElement('span');
  track.appendChild(primary);
  track.appendChild(echo);

  containerEl.innerHTML = '';
  containerEl.appendChild(track);

  let text = '';
  let offset = 0;
  let cycleWidth = 0;
  let scrolling = false;
  let rafId = null;
  let lastTs = 0;

  function refresh() {
    // Se mide el texto solo, sin el separador: lo que decide si hace falta
    // desplazarlo es si el titulo entra o no en el ancho disponible.
    primary.textContent = text;
    echo.textContent = '';
    const fits = primary.offsetWidth <= containerEl.clientWidth;

    if (fits) {
      scrolling = false;
      offset = 0;
      cycleWidth = 0;
      track.style.transform = 'translateX(0)';
      return;
    }

    scrolling = true;
    primary.textContent = text + SEPARATOR;
    echo.textContent = text + SEPARATOR;
    cycleWidth = primary.offsetWidth;
    if (cycleWidth <= 0) {
      scrolling = false;
      return;
    }
    // Una vuelta completa equivale a un ciclo; el resto se conserva para que
    // un refresco a mitad de camino no reinicie el movimiento.
    offset = ((offset % cycleWidth) + cycleWidth) % cycleWidth - cycleWidth;
    track.style.transform = `translateX(${offset}px)`;
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const delta = ts - lastTs;
    lastTs = ts;

    if (scrolling && cycleWidth > 0) {
      offset -= (delta * PIXELS_PER_SECOND) / 1000;
      if (offset <= -cycleWidth) offset += cycleWidth;
      track.style.transform = `translateX(${offset}px)`;
    }

    rafId = requestAnimationFrame(tick);
  }

  // El ancho disponible cambia al entrar y salir del mini reproductor o al
  // redimensionar la ventana, y eso puede convertir un titulo que entraba en
  // uno que ya no entra.
  const resizeObserver = new ResizeObserver(() => refresh());
  resizeObserver.observe(containerEl);

  return {
    setText(newText) {
      const next = newText || '';
      if (next === text) return;
      text = next;
      offset = 0;
      refresh();
    },

    start() {
      if (rafId) return;
      lastTs = 0;
      rafId = requestAnimationFrame(tick);
    },

    stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
