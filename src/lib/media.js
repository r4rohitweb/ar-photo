export const LIMITS = { image: 10 * 1024 * 1024, video: 100 * 1024 * 1024 };
export function validateFile(file, kind) {
  const allowed = kind === 'image' ? ['image/jpeg', 'image/png', 'image/webp'] : ['video/mp4', 'video/webm'];
  if (!allowed.includes(file.type)) return kind === 'image' ? 'Choose a JPG, PNG, or WEBP photo.' : 'Choose an MP4 or WEBM video.';
  if (!file.size) return 'This file is empty. Please choose another.';
  if (file.size > LIMITS[kind]) return `Your ${kind} must be smaller than ${kind === 'image' ? '10' : '100'} MB.`;
  return '';
}
export function download(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
export function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = () => reject(new Error('The photo could not be loaded.')); image.src = src; }); }
export async function printPhoto(experience, imageSrc) {
  const { default: QRCode } = await import('qrcode');
  const image = await loadImage(imageSrc);
  const qr = await QRCode.toCanvas(experience.qr_code_url, { width: 360, margin: 4, errorCorrectionLevel: 'M' });
  const width = 1600, padding = 100, photoHeight = Math.round(1400 * image.height / image.width);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = photoHeight + 700;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, canvas.height);
  ctx.drawImage(image, padding, padding, 1400, photoHeight);
  ctx.drawImage(qr, (width - 360) / 2, photoHeight + 130);
  ctx.fillStyle = '#243b31'; ctx.textAlign = 'center'; ctx.font = '30px sans-serif'; ctx.fillText('Scan to Bring This Photo to Life', width / 2, photoHeight + 555);
  ctx.fillStyle = '#7c857e'; ctx.font = '22px sans-serif'; ctx.fillText('stillmotion', width / 2, photoHeight + 615);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not export this photo.');
  const url = URL.createObjectURL(blob); download(url, `stillmotion-${experience.unique_id}.png`); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
