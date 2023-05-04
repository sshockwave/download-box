import { faDownload } from '@fortawesome/free-solid-svg-icons';

const download_api = chrome.downloads;

function drawIcon(progress: number | null = null, size = 32) {
  const [w, h, , , paths] = faDownload.icon;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const orig_size = Math.max(w, h);
  const icon = new Path2D();
  if (progress !== null) {
    ctx.lineWidth = size / 4;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, (size - ctx.lineWidth) / 2, - Math.PI / 2, Math.PI * 2 * progress - Math.PI / 2);
    ctx.strokeStyle = '#1ba1e2';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fill();
  } else {
    const scale = size / orig_size;
    for (const path of Array.isArray(paths) ? paths : [paths]) {
      icon.addPath(new Path2D(path), {
        a: scale,
        d: scale,
      });
    }
    ctx.fill(icon);
  }
  return ctx.getImageData(0, 0, size, size);
}

let next_tick: number | null = null;
let last_progress: number | null = null;
async function updateIcon() {
  const items = await chrome.downloads.search({
    state: 'in_progress',
  });
  const [cnt, all] = items.reduce(
    ([cnt, all], { bytesReceived, totalBytes }) => [cnt + bytesReceived, all + totalBytes],
    [0, 0],
  );
  const new_progress = all !== 0 ? cnt / all : null;
  await chrome.action.setIcon({ imageData: drawIcon(new_progress) });
  if (last_progress !== null && new_progress === null) {
    chrome.action.setBadgeBackgroundColor({ color: '#008000' });
    chrome.action.setBadgeTextColor({ color: '#ffffff' });
    chrome.action.setBadgeText({ text: '+' });
  }
  last_progress = new_progress;
  if (all !== 0 && next_tick === null) {
    next_tick = setTimeout(() => {
      next_tick = null;
      updateIcon();
    }, 1000);
  }
}

download_api.setShelfEnabled(false);
download_api.onCreated.addListener(updateIcon);
download_api.onChanged.addListener(updateIcon);
download_api.onErased.addListener(updateIcon);
updateIcon();
