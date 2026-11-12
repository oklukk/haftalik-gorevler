// UI state follows the actual service worker lifecycle; it never guesses a version.
export function setupUpdates({ onStatus, onReady, prepareUpdate, reload = () => location.reload() }) {
  let registration, checking = false, requested = false, deferred = false;
  let activating = false, activationAttempt = 0;
  const sw = navigator.serviceWorker;
  const hadController = Boolean(sw?.controller);
  const status = message => onStatus(message);
  const inspect = () => {
    if (registration?.waiting && sw.controller) {
      status('Güncelleme Hazır');
      if (!deferred) onReady(true);
      return true;
    }
    return false;
  };
  function watch(worker) {
    if (!worker) return;
    const changed = () => {
      if (worker.state === 'installed') inspect();
      else if (worker.state === 'redundant') status('Güncelleme indirilemedi. Daha sonra yeniden deneyin.');
    };
    worker.addEventListener('statechange', changed);
    if (sw.controller) status('Yeni sürüm indiriliyor…');
    changed();
  }
  const ready = sw ? sw.register('./sw.js').then(value => {
    registration = value;
    value.addEventListener('updatefound', () => watch(value.installing));
    watch(value.installing);
    inspect();
    return value;
  }).catch(() => { status('Çevrimdışı kullanım veya güncelleme kontrolü hazırlanamadı. Bağlantınızı kontrol edin.'); return null; }) : Promise.resolve(null);
  sw?.addEventListener('controllerchange', () => {
    if (requested) { requested = false; reload(); }
    else if (registration && hadController) status('Yeni sürümü kullanmak için uygulamayı tamamen kapatıp yeniden açın.');
  });
  return {
    async check() {
      if (checking) return;
      checking = true;
      deferred = false;
      status('Güncellemeler kontrol ediliyor…');
      try {
        if (navigator.onLine === false) throw new Error('offline');
        const value = await ready;
        if (!value) throw new Error('unsupported');
        await value.update();
        if (!inspect()) {
          if (value.installing) { status('Yeni sürüm indiriliyor…'); watch(value.installing); }
          else status('Kontrol tamamlandı; yeni sürüm bulunamadı.');
        }
      } catch {
        status('Güncelleme kontrol edilemedi. İnternet bağlantınızı kontrol edip yeniden deneyin.');
      } finally { checking = false; }
    },
    later() { deferred = true; onReady(false); },
    async apply() {
      if (activating) return;
      const value = await ready;
      if (!value?.waiting) { status('Hazır bir güncelleme yok. Önce güncellemeleri kontrol edin.'); return; }
      if (!prepareUpdate()) { status('Taslak kaydedilemedi. Güncellemeden önce taslağı koruyup yeniden deneyin.'); return; }
      activating = true;
      const attempt = ++activationAttempt;
      status('Güncelleme etkinleştiriliyor…');
      // Keep editing behind the modal while controller ownership is changing.
      requested = true;
      const channel = new MessageChannel();
      channel.port1.onmessage = event => {
        if (attempt !== activationAttempt) return;
        if (event.data?.type === 'UPDATE_BLOCKED') {
          channel.port1.close();
          requested = false;
          activating = false;
          status('Diğer uygulama sekme ve pencerelerini kapatın, sonra yeniden deneyin. Olmazsa uygulamayı tamamen kapatıp açın.');
        }
      };
      try {
        value.waiting.postMessage({ type: 'ACTIVATE_UPDATE' }, [channel.port2]);
      } catch {
        channel.port1.close();
        requested = false; activating = false;
        status('Güncelleme etkinleştirilemedi. Yeniden kontrol edin veya uygulamayı tamamen kapatıp açın.');
        return;
      }
      setTimeout(() => {
        channel.port1.close();
        if (attempt === activationAttempt && requested) {
          requested = false;
          activating = false;
          status('Tarayıcı güncellemeyi henüz etkinleştiremedi. Uygulamayı tamamen kapatıp yeniden açın.');
        }
      }, 8000);
    }
  };
}
