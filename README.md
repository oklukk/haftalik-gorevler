# Bu hafta

Türkçe, mobil öncelikli, tek sayfalı haftalık görev PWA’sı. HTML, CSS ve JavaScript kullanır; derleme, kurulum paketi, sunucu uygulaması veya harici servis gerektirmez. Başlangıçta görev listeleri boştur.

## Yerelde çalıştırma

1. Terminalde `index.html` dosyasının bulunduğu klasöre girin.
2. Python 3 ile `python3 -m http.server 8000` komutunu çalıştırın. Windows’ta gerekirse `py -m http.server 8000` kullanın.
3. Bilgisayarınızda `http://localhost:8000` adresini açın. Dosyaya çift tıklayarak `file://` üzerinden açmayın; JavaScript modülleri ve service worker HTTP(S) gerektirir.
4. İlk açılışı internet açıkken yapın, önbelleğin hazırlanması için birkaç saniye bekleyin. Ardından tarayıcı geliştirici araçlarında ağ bağlantısını çevrimdışı yapıp sayfayı yenileyin.

Uygulamanın üretimde HTTPS üzerinden sunulması gerekir. `localhost` geliştirme için istisnadır. Telefonda bilgisayarın yerel IP adresini HTTP ile açmak PWA/çevrimdışı test için yeterli değildir; aşağıdaki GitHub Pages HTTPS adresini kullanın.

## GitHub Pages üzerinde yayımlama

1. GitHub’da boş bir depo oluşturun; örnek ad: `haftalik-gorevler`.
2. Bu klasörün **içeriğini** deponun köküne yükleyin. `index.html`, `app.js`, `dates.js`, `storage.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icons/` ve `.nojekyll` kökte bulunmalı. `tests/`, `package.json` ve bu belge çalışmak için zorunlu değildir.
3. Deponun **Settings → Pages → Build and deployment** bölümünde **Deploy from a branch**, dal olarak **main**, klasör olarak **/(root)** seçip kaydedin.
4. GitHub’ın verdiği `https://KULLANICI.github.io/haftalik-gorevler/` adresini açın. Yayımlanması birkaç dakika sürebilir. Göreli yollar depo alt dizininde çalışır; özel alan adı gerekmez.

Bu teslim GitHub hesabınıza otomatik yükleme veya yayımlama yapmaz.

## iPhone’da test ve ana ekrana ekleme

1. GitHub Pages HTTPS adresini **Safari** ile açın; ilk açılışta internet açık olsun.
2. Bir güne `+ Madde ekle` ile yazın, klavyenin Tamam/Enter tuşuyla kaydedin. Boş bir girdi de deneyin.
3. Gün adlarına dokunup bağımsız açılıp kapandıklarını kontrol edin. Bir görev ekleyin, tamamlayın ve geri alın. Hafta oklarını ve “Bugüne Dön” kontrolünü deneyin. Geçmiş bir tarihe eklediğiniz görevin bugünün devredenlerinde aynı tarih ile göründüğünü ve tamamlamanın geri alınabildiğini kontrol edin.
4. Safari’de **Paylaş → Ana Ekrana Ekle → Ekle** yolunu izleyin. Seçeneği göremiyorsanız paylaşım listesini aşağı kaydırın.
5. Ana ekran simgesinden uygulamayı internet açıkken bir kez açın; birkaç saniye bekleyin. Görev ekleyin, uygulamayı kapatıp yeniden açın ve kayıtları kontrol edin.
6. Uçak modunu açın ve Wi-Fi’yi kapatın. Uygulamayı ana ekran simgesinden yeniden açıp görev ekleme/tamamlama ve kapatıp açma işlemlerini tekrarlayın.

Android’de aynı HTTPS adresini Chrome ile açın. Menüde **Ana ekrana ekle** veya **Uygulamayı yükle** seçeneğini kullanın; ardından aynı çevrimdışı testi yapın.

## Veri ve kullanım

- Hafta cihazın yerel tarihine göre pazartesi–pazar hesaplanır. Uygulama açıkken veya yeniden öne getirildiğinde gün/hafta değişimi kontrol edilir.
- Uygulama tek ekrandır. Gün başlıkları birbirinden bağımsız açılıp kapanır. Mevcut haftaya ilk girişte geçmiş günler kapalı, bugün ve sonraki günler açıktır. Diğer haftalar açık günlerle başlar; elle yapılan seçimler oturum boyunca korunur. Eski `#gun/YYYY-AA-GG` bağlantıları ilgili haftayı ve günü açar.
- `+ Madde ekle` doğrudan boş bir satır açar ve odağı eşzamanlı olarak girişe taşır. Enter/Tamam kaydeder. Satırdan ayrılmak da dolu taslağı kaydeder; boş girdi kaydedilmez. Fiziksel klavyede Escape taslağı iptal eder.
- Görevler `{ id, date, text, completed }` alanlarıyla `localStorage` içinde tutulur. Depolama anahtarı uygulamanın alt dizinini içerir.
- Üstteki oklar pazartesi–pazar haftaları arasında gezinir; geçmiş ve gelecek tarihlere görev eklenebilir. Haftalar değişince kayıtlar silinmez. Sabit başlığın altında seçilen tarih aralığı gösterilir.
- Açılışta bugün görünür. “Bugüne Dön”, başka bir hafta seçiliyken veya bugün ekranda görünmüyorken gösterilir; bugünün bölümü kapalıysa açar. Görev işlemleri ve günleri açıp kapatma bugüne otomatik kaydırmaz.
- Bugünün altında “Devreden Görevler”, tüm geçmiş tarihlerdeki tamamlanmamış görevleri eski tarihten yeniye gösterir. Görevler kopyalanmaz veya bugüne taşınmaz; aynı kayıt güncellenir. Bu görünümden yeni tamamlananlar, geri alınabilmeleri için görünümden ayrılana veya uygulama yeniden açılana kadar kalır. Sayaç yalnızca tamamlanmamış görevleri sayar. “Tamamlananları göster” geçmişte tamamlanan görevleri asıl tarihleriyle açar ve geri almayı sağlar; geçici olarak gösterilen görevler burada tekrarlanmaz.
- Ayrı cihazlar ve tarayıcı profilleri bağımsızdır. Aynı cihaz/tarayıcı/uygulama adresini kullananlar aynı yerel veriyi görür. Senkronizasyon yoktur.
- Tarayıcı/site verilerini silmek görevleri de siler. Safari ve ana ekrana eklenen uygulamada depolama davranışı iOS sürümüne göre farklılaşabilir; düzenli kullanım ve testi ana ekran uygulamasında yapın. Gizli gezinmeyi kalıcı saklama için kullanmayın.
- Service worker yalnızca uygulama dosyalarını önbelleğe alır; görevleri sunucuya göndermez. Sonraki bir sürümde dosyaları değiştirirken `sw.js` içindeki `VERSION` değerini artırın. Yeni önbellek hazır olduktan sonra tüm uygulama sekme/pencerelerini kapatıp açınca güncelleme devreye girer.

## Ayarlar, yedekleme ve güncelleme

Üstteki dişli simgesi, aynı ekran üzerinde Ayarlar panelini açar. Açık görev taslağı ve sayfanın kaydırma konumu korunur. Yazı boyutları merkezi CSS değişkenleriyle yönetilir; günlük sayaçlar yalnızca o tarihin kendi görevlerini sayar.

- **Verileri Yedekle:** Tüm geçmiş, mevcut ve gelecek görevler kimlik, tarih, metin ve tamamlanma durumlarıyla cihaz üzerinde JSON dosyasına dönüştürülür. Destekleniyorsa dosya paylaşımı, diğer tarayıcılarda indirme kullanılır. Dosyanın gerçekten kaydedildiği tarayıcı tarafından garanti edilemez; seçilen dosya konumunu kontrol edin. Açık, henüz kaydedilmemiş taslak yedeğe dahil değildir. Hiçbir görev dış sunucuya gönderilmez.
- **Yedeği Geri Yükle:** Dosya seçmek kayıtları değiştirmez. Biçim sürümü, alanlar, gerçek takvim tarihleri ve kimliklerin benzersizliği doğrulanır. En fazla 5 MiB, 20.000 görev, kimlik başına 200 ve metin başına 20.000 karakter kabul edilir. Önizleme toplam/mevcut/yeni/aynı/çakışan görev sayılarını gösterir.
- **Birleştir (varsayılan):** Yeni kimlikler eklenir, aynı kayıtlar çoğaltılmaz; çakışmalarda cihazdaki kayıt korunur. Açık onaydan sonra tek `localStorage.setItem` işlemiyle kaydedilir. Önizlemeden sonra cihazdaki kayıtlar değişirse yeniden onay istenir. Kaydetme başarısızsa eski görevler korunur.
- **Yerine yükle (gelişmiş):** Cihazdaki tüm görevleri değiştirir. Önce ayrıca yedek alınması önerilir; bu işlem ilk uyarı/onaydan sonra ikinci bir açık onay gerektirir. İptal veya geçersiz dosya hiçbir kaydı değiştirmez.
- **Güncellemeleri Kontrol Et:** Gerçek service worker kontrolünü çalıştırır. Çevrimdışı/hatalı kontroller yeni sürüm olmadığı şeklinde bildirilmez. Hazır sürüm için “Daha Sonra” veya “Şimdi Güncelle” seçilebilir. Taslak kaydedilemiyorsa güncelleme başlatılmaz. Birden fazla uygulama penceresi açıksa bunları kapatmanız istenir; açık oturumlar izinsiz yenilenmez. Tarayıcı etkinleştiremezse uygulamayı tamamen kapatıp açın.

Uygulama sürümü `version.js` içinde, yedek biçim sürümü `backup.js` içinde, service worker önbellek sürümü `sw.js` içinde yönetilir. Bunların hiçbiri mevcut `haftalik-gorevler:v1:${basePath}` veri anahtarını değiştirmez. Güncel uygulama dosyaları HTTP önbelleği yeniden doğrulanarak alınır. Eski uygulama sürümünden bu sürüme ilk geçiş, bütün eski pencereler kapatılıp açıldığında tamamlanır; sonraki sürümler Ayarlar üzerinden kontrol edilebilir.

## Testler ve doğrulama sınırları

Node.js 20 veya üzeri varsa `npm test` çalıştırın. `npm install` gerekmez; testler yalnızca Node’un yerleşik araçlarını kullanır. Node, uygulamayı çalıştırmak için zorunlu değildir.

`npm test` tarih/hafta hesaplarını, tek ekranda bağımsız günleri, hafta gezinmesini, bugüne dönüş ve görünürlük mantığını, devreden görevleri, tamamlama/geri almayı, eski kayıtları, depolama hatalarını, güvenli metin gösterimini ve service worker davranışını kontrol eder. DOM/Cache test dublörleri gerçek tarayıcının yerini tutmaz.

Bulut test ortamında Python Playwright ve `/usr/bin/chromium` mevcutsa `python3 tests/browser_smoke.py` ile tarayıcı kontrolleri çalıştırılabilir. Test kendi geçici HTTP sunucusunu ve izole tarayıcı depolamasını kullanır; kullanıcı verilerine dokunmaz. Mobil genişlikleri (320, 375, 390 ve 412 px), görev akışlarını, kaydırmayı, eski bağlantıları, GitHub Pages alt dizinini, çevrimdışı kaydı ve GitHub’daki ilk sürümün sabitlenmiş commit’inden yeni PWA önbelleğine geçiş sırasında mevcut verilerin korunmasını kontrol eder.

Gerçek iPhone/Safari ve Android cihazında test yapılmadı. Chromium mobil ekran kontrolleri fiziksel iOS klavyesi, güvenli ekran boşlukları ve ana ekrana yüklenen PWA davranışını doğrulamaz. Gerçek cihazda uzun Türkçe görevleri, klavye açıkken giriş satırına erişimi, görevlerin uygulama kapatılıp açıldığında korunmasını ve çevrimdışı kullanımı ayrıca kontrol edin.

## Dosyalar

`index.html` kabuk ve PWA meta bilgileri; `styles.css` mobil tasarım; `app.js` görünüm ve etkileşimler; `dates.js` yerel tarih işlemleri; `storage.js` veri kaydı; `sw.js` çevrimdışı önbellek; `manifest.webmanifest` yükleme bilgileri; `icons/` ana ekran simgeleri; `backup.js` yerel yedek doğrulama ve birleştirme; `settings.js` ayarlar ve dosya işlemleri; `updates.js` service worker güncelleme akışı; `version.js` uygulama sürümü; `tests/` mantık ve tarayıcı testleri.
