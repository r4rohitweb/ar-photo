// Kept in an isolated document so MindAR's pinned Three.js version does not affect React.
const status = document.querySelector('#status'), start = document.querySelector('#start'), sound = document.querySelector('#sound');
let engine, video, targetUrl, texture, material, geometry, running = false;
let targetVisible = false;
function cleanup() {
  running = false;
  targetVisible = false;
  video?.pause();
  engine?.renderer?.setAnimationLoop(null);
  try { if (engine?.controller && engine?.video?.srcObject) engine.stop(); } catch { /* Camera may still be starting. */ }
  document.querySelectorAll('video').forEach(v => { v.srcObject?.getTracks().forEach(track => track.stop()); });
  texture?.dispose(); material?.dispose(); geometry?.dispose(); engine?.renderer?.dispose();
  if (targetUrl) URL.revokeObjectURL(targetUrl);
}
window.addEventListener('pagehide', cleanup);
document.addEventListener('visibilitychange', () => { if (document.hidden) video?.pause(); });
sound.onclick = () => { if (!video) return; video.muted = !video.muted; sound.textContent = video.muted ? 'Turn sound on' : 'Mute sound'; };
start.onclick = async () => {
  start.disabled = true;
  document.body.dataset.state = 'preparing';
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Your camera needs HTTPS and a compatible browser. Return to the normal photo experience.');
    const params = new URLSearchParams(location.search), api = new URL(params.get('api') || '', location.href);
    if (api.origin !== location.origin || !/^[a-f0-9]{32}$/.test(params.get('id') || '')) throw new Error('Invalid experience link.');
    status.textContent = 'Preparing image tracking. This may take a minute on your first visit…';
    const result = await fetch(api); const data = await result.json(); if (!result.ok) throw new Error(data.error || 'Could not load this memory.');
    const item = data.experience;
    const media = file => { const url = new URL(api); url.search = new URLSearchParams({ action: 'media', file }); return url.href; };
    video = document.createElement('video'); video.src = media(item.video_path); video.crossOrigin = 'anonymous'; video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
    // Prime muted inline playback from the user action; tracking events resume it later.
    const primed = video.play().then(() => video.pause()).catch(() => {});
    const [{ Compiler }, { MindARThree }, THREE] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js'),
      import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js'),
      import('three'),
    ]);
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = media(item.image_path); await image.decode();
    const canvas = document.createElement('canvas'), scale = Math.min(1, 1024 / Math.max(image.width, image.height)); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const compiler = new Compiler();
    await compiler.compileImageTargets([canvas], progress => { status.textContent = `Learning the details of your photo… ${Math.round(progress)}%`; });
    targetUrl = URL.createObjectURL(new Blob([await compiler.exportData()], { type: 'application/octet-stream' }));
    engine = new MindARThree({ container: document.querySelector('#camera'), imageTargetSrc: targetUrl, uiLoading: 'no', uiScanning: 'no', uiError: 'no', maxTrack: 1 });
    texture = new THREE.VideoTexture(video);
    texture.encoding = THREE.sRGBEncoding;
    // Center-crop the video to the photo's aspect ratio, exactly as the normal viewer does.
    await primed;
    if (!video.videoWidth) await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Video loading timed out. Try the normal experience.')), 30000); video.addEventListener('loadedmetadata', () => { clearTimeout(timeout); resolve(); }, { once: true }); video.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('This video format is not supported by your browser.')); }, { once: true }); });
    const photoRatio = item.image_width / item.image_height, videoRatio = video.videoWidth / video.videoHeight;
    if (videoRatio > photoRatio) { texture.repeat.x = photoRatio / videoRatio; texture.offset.x = (1 - texture.repeat.x) / 2; }
    else { texture.repeat.y = videoRatio / photoRatio; texture.offset.y = (1 - texture.repeat.y) / 2; }
    geometry = new THREE.PlaneGeometry(1, 1 / photoRatio); material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material); mesh.visible = false;
    const anchor = engine.addAnchor(0); anchor.group.add(mesh);
    const playTrackedVideo = async () => {
      if (!targetVisible) return;
      try {
        await video.play();
        if (!targetVisible || document.hidden) { video.pause(); mesh.visible = false; return; }
        mesh.visible = true; start.hidden = true;
      } catch {
        if (!targetVisible) return;
        start.hidden = false; start.disabled = false; start.textContent = 'Tap to play tracked video';
        start.onclick = playTrackedVideo;
      }
    };
    anchor.onTargetFound = () => { targetVisible = true; status.textContent = 'Photo found. A moment, alive.'; playTrackedVideo(); };
    anchor.onTargetLost = () => { targetVisible = false; video.pause(); mesh.visible = false; start.hidden = true; status.textContent = 'Point your camera at the original printed photo.'; };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && running && targetVisible) playTrackedVideo(); });
    status.textContent = 'Opening camera…'; await engine.start(); running = true;
    engine.renderer.setAnimationLoop(() => { if (running) engine.renderer.render(engine.scene, engine.camera); });
    start.hidden = true; sound.style.display = 'block'; status.textContent = 'Point your camera at the original printed photo.';
    document.body.dataset.state = 'running';
  } catch (error) {
    cleanup();
    document.body.dataset.state = 'error';
    const message = error?.message || '';
    status.textContent = /fetch|module|network/i.test(message)
      ? 'Camera tracking could not load. Check your connection, or return to the photo experience.'
      : error?.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow camera access in your browser, or return to the photo experience.'
        : message || 'Camera tracking is unavailable. Return to the normal photo experience.';
    start.hidden = true; sound.style.display = 'none';
  }
};
