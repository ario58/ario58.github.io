// Points a download link at the newest SecretSanta APK.
// Anonymous, tokenless, no storage: one in-memory lookup per page load.
(function (global) {
  var FALLBACK = 'https://github.com/ario58/ArioSecretSantaReleases/releases/latest';
  var pending = null;   // in-memory only, shared by every link on the page

  function latestApkUrl() {
    if (!pending) {
      pending = fetch('https://api.github.com/repos/ario58/ArioSecretSantaReleases/releases/latest', {
        referrerPolicy: 'no-referrer'
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (rel) {
          var apks = (rel.assets || []).filter(function (a) {
            return typeof a.browser_download_url === 'string' && /\.apk$/i.test(a.name || '');
          });
          var best = apks.find(function (a) { return /^SecretSanta-v/i.test(a.name); }) || apks[0];
          return best ? best.browser_download_url : FALLBACK;
        })
        .catch(function () { return FALLBACK; });
    }
    return pending;
  }

  // The link keeps its releases-page href until the lookup lands, so it works
  // without JS; a tap before then waits for the same request instead of following it.
  global.setApkHref = function setApkHref(el) {
    var url = null, label = el.textContent, busy = false;

    latestApkUrl().then(function (u) { url = u; el.href = u; });

    el.addEventListener('click', function (ev) {
      if (url) return;            // already resolved: let the browser handle it
      ev.preventDefault();
      if (busy) return;           // repeated taps ride the one request
      busy = true;
      el.textContent = 'Preparing download…';
      el.setAttribute('aria-disabled', 'true');
      latestApkUrl().then(function (u) {
        busy = false;
        el.textContent = label;
        el.removeAttribute('aria-disabled');
        location.href = u;        // same window, no popup
      });
    });
  };
})(this);
