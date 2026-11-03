import { dateStops } from './filters.js';

export function mountDateRange(root, filters, now = new Date()) {
  const stops = dateStops(now), last = stops.length - 1;
  let start = filters.date === 'timeline' ? Math.max(0, stops.findIndex(s => s.key === filters.start)) : 0;
  let end = filters.date === 'timeline' ? stops.findIndex(s => s.key === filters.end) : last;
  if (end <= start) { start = 0; end = last; }
  root.innerHTML = `<div class="time-slider"><div class="time-rail"><div class="time-selection"></div></div>
    <input class="time-input" type="range" min="0" max="${last}" step="1" aria-label="Added since" value="${start}">
    <input class="time-input" type="range" min="0" max="${last}" step="1" aria-label="Added until" value="${end}"></div>
    <div class="time-ticks" aria-hidden="true">${[...stops].reverse().map(stop => `<span><span class="time-tick-full">${stop.label}</span><span class="time-tick-short">${stop.short}</span></span>`).join('')}</div>`;
  const [from, until] = root.querySelectorAll('input'), slider = root.querySelector('.time-slider');
  const value = () => ({ date: start === 0 && end === last ? 'any' : 'timeline', start: stops[start].key, end: stops[end].key });
  const describe = index => {
    const stop = stops[index];
    return stop.date ? `${stop.label}, ${stop.date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'All time, no earlier limit';
  };
  const ticks = [...root.querySelectorAll('.time-ticks > span')];
  ticks.forEach((tick, i) => { tick.style.left = `${i / last * 100}%`; tick.title = describe(last - i); });
  function render() {
    from.value = start; until.value = end;
    from.setAttribute('aria-valuemax', end - 1); until.setAttribute('aria-valuemin', start + 1);
    from.setAttribute('aria-valuetext', describe(start)); until.setAttribute('aria-valuetext', describe(end));
    from.title = describe(start); until.title = describe(end);
    slider.style.setProperty('--range-from', `${(last - end) / last * 100}%`);
    slider.style.setProperty('--range-to', `${(last - start) / last * 100}%`);
    ticks.forEach((tick, i) => tick.classList.toggle('is-selected', last - i === start || last - i === end));
  }
  from.addEventListener('input', () => { start = Math.min(Number(from.value), end - 1); render(); });
  until.addEventListener('input', () => { end = Math.max(Number(until.value), start + 1); render(); });
  // Track clicks/drags move the nearer endpoint; native thumbs handle their own
  // pointer dragging and keyboard controls, including touch and screen readers.
  let dragging = null;
  function move(event) {
    const rect = slider.getBoundingClientRect(), fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - 12) / (rect.width - 24)));
    const index = Math.round((1 - fraction) * last);
    if (!dragging) dragging = Math.abs(index - start) <= Math.abs(index - end) ? from : until;
    dragging.value = index;
    dragging.dispatchEvent(new Event('input', { bubbles: true }));
  }
  slider.addEventListener('pointerdown', event => {
    if (event.target instanceof HTMLInputElement || event.button !== 0) return;
    event.preventDefault(); slider.setPointerCapture(event.pointerId); move(event); dragging.focus({ preventScroll: true });
  });
  slider.addEventListener('pointermove', event => { if (dragging) move(event); });
  const release = () => { dragging = null; };
  slider.addEventListener('pointerup', release); slider.addEventListener('pointercancel', release); slider.addEventListener('lostpointercapture', release);
  render();
  return { value, reset() { start = 0; end = last; render(); } };
}
