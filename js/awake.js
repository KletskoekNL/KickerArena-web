// Keeps the screen on while the table is shown full screen. The Android app
// does it natively; a browser uses the Wake Lock API where it has one (only
// over https or on localhost), and otherwise plays a tiny invisible looping
// video, which keeps most mobile browsers awake too.

let want = false;
let lock = null;
let video = null;

async function wakeLock() {
  if (!want || lock || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch { lock = null; }
}

function startVideo() {
  if (!video) {
    video = document.createElement('video');
    video.src = 'img/awake.webm';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1';
  }
  if (!video.isConnected) document.body.appendChild(video);
  video.play().catch(() => {});
}

function stopVideo() {
  if (!video) return;
  video.pause();
  video.remove();
}

/** keepAwake(true) while table mode is on, keepAwake(false) when it ends. */
export function keepAwake(on) {
  on = !!on;
  if (on === want) return;
  want = on;
  if (window.KAndroid?.keepAwake) { window.KAndroid.keepAwake(on); return; }
  if ('wakeLock' in navigator && window.isSecureContext) {
    if (on) wakeLock();
    else if (lock) { lock.release().catch(() => {}); lock = null; }
    return;
  }
  if (on) startVideo(); else stopVideo();
}

// The Android app keeps its setting when the page is loaded again (after
// pairing or a reconnect), while this page starts without table mode.
window.KAndroid?.keepAwake?.(false);

// The Android app calls this when it is back in front.
window.kaAwake = () => { if (want) window.KAndroid?.keepAwake?.(true); };

// A wake lock ends when the page is hidden; take it again on return. A
// paused video (the browser may stop it in the background) is restarted.
document.addEventListener('visibilitychange', () => {
  if (!want || document.visibilityState !== 'visible') return;
  // The Android app lets the screen sleep again whenever it is left.
  if (window.KAndroid?.keepAwake) { window.KAndroid.keepAwake(true); return; }
  if ('wakeLock' in navigator && window.isSecureContext) wakeLock();
  else startVideo();
});
