export function createVisualizer(canvas, analyserNode) {
  const ctx = canvas.getContext('2d');
  let mode = 'bars';
  let rafId = null;

  const freqData = new Uint8Array(analyserNode.frequencyBinCount);
  const timeData = new Uint8Array(analyserNode.fftSize);

  let barGradient = null;
  let barGradientHeight = 0;

  function getBarGradient(height) {
    if (barGradient && barGradientHeight === height) return barGradient;
    barGradient = ctx.createLinearGradient(0, height, 0, 0);
    barGradient.addColorStop(0, '#00ff00');
    barGradient.addColorStop(0.6, '#aaff00');
    barGradient.addColorStop(0.85, '#ffcc00');
    barGradient.addColorStop(1, '#ff4400');
    barGradientHeight = height;
    return barGradient;
  }

  function drawBars() {
    analyserNode.getByteFrequencyData(freqData);
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getBarGradient(height);

    const barCount = Math.max(16, Math.min(64, Math.floor(width / 6)));
    const step = Math.floor(freqData.length / barCount);
    const barWidth = width / barCount;

    for (let i = 0; i < barCount; i++) {
      const value = freqData[i * step] / 255;
      const barHeight = Math.max(1, value * height);
      ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    }
  }

  function drawScope() {
    analyserNode.getByteTimeDomainData(timeData);
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#aaff00';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const step = width / timeData.length;
    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128 - 1;
      const y = height / 2 + v * (height / 2);
      const x = i * step;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function tick() {
    if (mode === 'bars') drawBars();
    else drawScope();
    rafId = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (rafId) return;
      tick();
    },
    stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    toggleMode() {
      mode = mode === 'bars' ? 'scope' : 'bars';
    },
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
    }
  };
}
