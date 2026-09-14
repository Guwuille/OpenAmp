export function initTitlebar() {
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.api.window.minimize();
  });

  document.getElementById('btn-close').addEventListener('click', () => {
    window.api.window.close();
  });

  const maximizeBtn = document.getElementById('btn-maximize');

  function paintMaximized(isMax) {
    // ❐ para restaurar, □ para maximizar, como en cualquier ventana.
    maximizeBtn.textContent = isMax ? '❐' : '□';
    maximizeBtn.title = isMax ? 'Restaurar' : 'Maximizar';
    maximizeBtn.classList.toggle('active', isMax);
  }

  maximizeBtn.addEventListener('click', async () => {
    paintMaximized(await window.api.window.toggleMaximize());
  });

  window.api.window.isMaximized().then(paintMaximized);
  window.api.window.onMaximizeChange(paintMaximized);

  const pinBtn = document.getElementById('btn-pin');
  window.api.window.isAlwaysOnTop().then((isOnTop) => {
    pinBtn.classList.toggle('active', isOnTop);
  });

  pinBtn.addEventListener('click', async () => {
    const current = pinBtn.classList.contains('active');
    await window.api.window.setAlwaysOnTop(!current);
    pinBtn.classList.toggle('active', !current);
  });

  const dragEl = document.getElementById('titlebar-drag');
  const appBody = document.getElementById('app-body');
  const TITLEBAR_HEIGHT = 26;
  let shaded = false;
  let savedHeight = null;

  dragEl.addEventListener('dblclick', async () => {
    const [width, currentHeight] = await window.api.window.getSize();

    if (!shaded) {
      savedHeight = currentHeight;
      appBody.classList.add('hidden');
      await window.api.window.resizeToFitPanels(width, TITLEBAR_HEIGHT);
      shaded = true;
    } else {
      appBody.classList.remove('hidden');
      await window.api.window.resizeToFitPanels(width, savedHeight || 640);
      shaded = false;
    }
  });
}
