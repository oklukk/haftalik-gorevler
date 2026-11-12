import { APP_VERSION } from './version.js';
import { dateKey } from './dates.js';
import { createBackup, parseBackup, previewMerge, MAX_BACKUP_BYTES } from './backup.js';
import { setupUpdates } from './updates.js';

export function setupSettings({ getTasks, commitTasks, beforeOpen, afterClose, prepareUpdate }) {
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const action = (className, text, handler) => {
    const node = make('button', className, text);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  };
  const dialog = make('dialog', 'settings-sheet');
  dialog.setAttribute('aria-labelledby', 'settings-title');
  const title = make('h2', '', 'Ayarlar'); title.id = 'settings-title';
  const close = action('sheet-close', '×', () => dialog.close());
  close.setAttribute('aria-label', 'Ayarları kapat');
  const top = make('div', 'sheet-heading'); top.append(title, close);
  const status = make('p', 'settings-status'); status.setAttribute('role', 'status');
  const report = text => { status.textContent = text; };
  let opener, scrollY = 0, incoming = null, snapshot = null, fileSequence = 0;
  const preview = make('section', 'restore-preview'); preview.hidden = true;
  const summary = make('p', 'restore-summary');
  const mode = make('select', 'restore-mode');
  mode.setAttribute('aria-label', 'Geri yükleme yöntemi');
  for (const [value, text] of [['merge', 'Mevcut görevlerle birleştir'], ['replace', 'Mevcut görevlerin yerine yükle (gelişmiş)']]) {
    const option = make('option', '', text); option.value = value; mode.append(option);
  }
  const warning = make('p', 'replace-warning', 'Dikkat: Bu cihazdaki tüm görevler değiştirilecek. Önce ayrıca yedek alın; dosyanın gerçekten kaydedildiğini kendiniz kontrol edin.');
  warning.hidden = true;
  const second = make('div', 'replace-confirmation'); second.hidden = true;
  second.append(make('p', '', 'İkinci onay: Mevcut tüm görevlerin yerine bu yedeği yüklemek istediğinizden emin misiniz?'));
  const final = action('danger-confirm', 'Evet, tüm görevleri değiştir', () => restore(true));
  second.append(final);
  const apply = action('restore-apply', 'Birleştirmeyi Onayla', () => {
    if (mode.value === 'replace') { second.hidden = false; final.focus({ preventScroll: true }); }
    else restore(false);
  });
  mode.addEventListener('change', () => {
    second.hidden = true; warning.hidden = mode.value !== 'replace';
    apply.textContent = mode.value === 'replace' ? 'Değiştirme işlemine devam et' : 'Birleştirmeyi Onayla';
  });
  const cancel = action('restore-cancel', 'Geri yüklemeyi iptal et', resetImport);
  preview.append(summary, mode, warning, apply, second, cancel);
  function resetImport() {
    incoming = null; snapshot = null; preview.hidden = true; second.hidden = true;
    mode.value = 'merge'; warning.hidden = true; apply.textContent = 'Birleştirmeyi Onayla';
  }
  function readPreview() {
    const current = getTasks();
    snapshot = JSON.stringify(current);
    const result = previewMerge(current, incoming);
    summary.textContent = `Yedek: ${result.total} görev · Cihazda: ${result.current} · Yeni: ${result.added} · Aynı: ${result.identical} · Çakışan: ${result.conflicts}. Birleştirmede ${result.added} görev eklenecek; ${result.conflicts} çakışmada mevcut kayıt korunacak.`;
    return result;
  }
  function restore(replace) {
    if (!incoming) return;
    try {
      // Recheck after the preview: another tab must not be silently overwritten.
      const current = getTasks();
      if (JSON.stringify(current) !== snapshot) {
        readPreview(); second.hidden = true;
        report('Cihazdaki görevler değişti. Güncel önizlemeyi kontrol edip yeniden onaylayın.'); return;
      }
      if (!prepareUpdate()) { report('Açık görev taslağı kaydedilemedi. Geri yükleme yapılmadı.'); return; }
      if (JSON.stringify(getTasks()) !== snapshot) {
        readPreview(); second.hidden = true;
        report('Taslak kaydedildi. Güncellenen önizlemeyi yeniden onaylayın.'); return;
      }
      const next = replace ? incoming : previewMerge(current, incoming).tasks;
      if (!commitTasks(next)) { report('Kaydedilemedi. Önceki görevler korundu; yeniden deneyebilirsiniz.'); return; }
      resetImport(); report('Geri yükleme tamamlandı. Görevler bu cihazda kaydedildi.');
    } catch { report('Mevcut görevler okunamadı. Hiçbir kayıt değiştirilmedi.'); }
  }
  const file = make('input', 'backup-file'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
  file.addEventListener('change', async () => {
    const sequence = ++fileSequence;
    resetImport();
    const selected = file.files?.[0];
    if (!selected) return;
    try {
      if (selected.size > MAX_BACKUP_BYTES) throw new Error('Yedek en fazla 5 MB olabilir.');
      const parsed = parseBackup(await selected.text());
      if (sequence !== fileSequence || !dialog.open) return;
      incoming = parsed; readPreview(); preview.hidden = false;
      report('Dosya doğrulandı. Henüz hiçbir kayıt değiştirilmedi.');
    } catch (error) { if (sequence === fileSequence) { resetImport(); report(error.message); } }
    finally { file.value = ''; }
  });
  async function exportData() {
    try {
      const text = createBackup(getTasks());
      const name = `haftalik-gorevler-${dateKey(new Date())}.json`;
      const blob = new File([text], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [blob] }) && navigator.share) {
        await navigator.share({ files: [blob], title: 'Haftalık Görevler yedeği' });
        report('Paylaşım penceresi kapandı. Yedeğin seçtiğiniz konuma kaydedildiğini kontrol edin.');
      } else {
        const url = URL.createObjectURL(blob);
        const link = make('a'); link.href = url; link.download = name;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        report('Yedek dosyası indirmeye sunuldu. Cihazınıza kaydedildiğini kontrol edin.');
      }
    } catch (error) { report(error.name === 'AbortError' ? 'Paylaşım iptal edildi; görevler değişmedi.' : 'Yedek oluşturulamadı. Görevleriniz değişmedi.'); }
  }
  const exportButton = action('export-backup sheet-action', 'Verileri Yedekle', exportData);
  const importButton = action('import-backup sheet-action', 'Yedeği Geri Yükle', () => file.click());
  const check = action('check-updates sheet-action', 'Güncellemeleri Kontrol Et', () => updates.check());
  const activate = action('activate-update sheet-action', 'Şimdi Güncelle', () => updates.apply());
  activate.hidden = true;
  dialog.append(top, make('h3', '', 'Verilerim'), exportButton, importButton, file, preview,
    make('h3', '', 'Uygulama'), check, activate, make('p', 'app-version', `Sürüm ${APP_VERSION}`), status);
  document.body.append(dialog);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientY < rect.top || event.clientY > rect.bottom || event.clientX < rect.left || event.clientX > rect.right) dialog.close();
  });
  dialog.addEventListener('close', () => {
    fileSequence++; resetImport();
    document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = '';
    window.scrollTo({ top: scrollY, behavior: 'instant' });
    afterClose(); opener?.focus({ preventScroll: true });
  });
  function open(source) {
    if (dialog.open) return;
    beforeOpen(); opener = source; scrollY = window.scrollY;
    document.body.style.position = 'fixed'; document.body.style.top = `-${scrollY}px`; document.body.style.width = '100%';
    dialog.showModal(); close.focus({ preventScroll: true });
  }
  const banner = make('aside', 'update-banner'); banner.hidden = true;
  banner.setAttribute('aria-label', 'Güncelleme Hazır');
  banner.setAttribute('aria-live', 'polite');
  banner.append(make('strong', '', 'Güncelleme Hazır'), make('p', '', 'Uygulamanın yeni bir sürümü hazır.'));
  const later = action('update-later', 'Daha Sonra', () => updates.later());
  const now = action('update-now', 'Şimdi Güncelle', () => { open(now); updates.apply(); });
  const preserveDraft = () => {
    beforeOpen();
    setTimeout(() => { if (!dialog.open) afterClose(); }, 0);
  };
  now.addEventListener('pointerdown', preserveDraft);
  banner.append(later, now); document.body.append(banner);
  const updates = setupUpdates({ onStatus: report, onReady: value => { banner.hidden = !value; activate.hidden = !value; }, prepareUpdate });
  return { open, isOpen: () => dialog.open, preserveDraft };
}
