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
3. Gün adına dokunun; tam sayfa detayda bir görev daha ekleyin. Göreve dokunup tamamlayın, tekrar dokunup geri alın. Uygulamadaki geri butonunu ve Safari’nin geri hareketini deneyin.
4. Safari’de **Paylaş → Ana Ekrana Ekle → Ekle** yolunu izleyin. Seçeneği göremiyorsanız paylaşım listesini aşağı kaydırın.
5. Ana ekran simgesinden uygulamayı internet açıkken bir kez açın; birkaç saniye bekleyin. Görev ekleyin, uygulamayı kapatıp yeniden açın ve kayıtları kontrol edin.
6. Uçak modunu açın ve Wi-Fi’yi kapatın. Uygulamayı ana ekran simgesinden yeniden açıp görev ekleme/tamamlama ve kapatıp açma işlemlerini tekrarlayın.

Android’de aynı HTTPS adresini Chrome ile açın. Menüde **Ana ekrana ekle** veya **Uygulamayı yükle** seçeneğini kullanın; ardından aynı çevrimdışı testi yapın.

## Veri ve kullanım

- Hafta cihazın yerel tarihine göre pazartesi–pazar hesaplanır. Uygulama açıkken veya yeniden öne getirildiğinde gün/hafta değişimi kontrol edilir.
- Gün adına dokunmak uygulama içinde `#gun/YYYY-AA-GG` adresini açar. Bu yaklaşım GitHub Pages için yönlendirme yapılandırması gerektirmez; tarayıcı geri/ileri geçmişini destekler.
- `+ Madde ekle` doğrudan boş bir satır açar ve odağı eşzamanlı olarak girişe taşır. Enter/Tamam kaydeder. Satırdan ayrılmak da dolu taslağı kaydeder; boş girdi kaydedilmez. Fiziksel klavyede Escape taslağı iptal eder.
- Görevler `{ id, date, text, completed }` alanlarıyla `localStorage` içinde tutulur. Depolama anahtarı uygulamanın alt dizinini içerir.
- Haftalar değişince kayıtlar silinmez; ana sayfa yalnızca geçerli haftayı gösterir. Geçmiş hafta gezinmesi bu sürüme dahil değildir.
- Ayrı cihazlar ve tarayıcı profilleri bağımsızdır. Aynı cihaz/tarayıcı/uygulama adresini kullananlar aynı yerel veriyi görür. Senkronizasyon yoktur.
- Tarayıcı/site verilerini silmek görevleri de siler. Safari ve ana ekrana eklenen uygulamada depolama davranışı iOS sürümüne göre farklılaşabilir; düzenli kullanım ve testi ana ekran uygulamasında yapın. Gizli gezinmeyi kalıcı saklama için kullanmayın.
- Service worker yalnızca uygulama dosyalarını önbelleğe alır; görevleri sunucuya göndermez. Sonraki bir sürümde dosyaları değiştirirken `sw.js` içindeki `VERSION` değerini artırın. Yeni önbellek hazır olduktan sonra tüm uygulama sekme/pencerelerini kapatıp açınca güncelleme devreye girer.

## Testler ve doğrulama sınırları

Node.js 20 veya üzeri varsa `npm test` çalıştırın. `npm install` gerekmez; testler yalnızca Node’un yerleşik araçlarını kullanır. Node, uygulamayı çalıştırmak için zorunlu değildir.

Teslim hazırlanırken **8 otomatik test geçti**:

| Kontrol | Sonuç / yöntem |
| --- | --- |
| Yedi gün, pazartesi–pazar sırası, Türkçe tarihler | Geçti; ay, yıl, artık gün ve farklı saat dilimleri dahil |
| Ana sayfadan görev ekleme, boş girdi | Geçti; gerçek uygulama işleyicileri, DOM test dublörü |
| Gün detayına geçiş, uygulama/tarayıcı geri işlemi | Geçti; DOM ve History test dublörü |
| Detaydan görev ekleme | Geçti; DOM test dublörü |
| Tamamlama ve geri alma | Geçti; görev listede kalıyor |
| Yeniden açılışta kalıcılık | Geçti; aynı depodan yeni uygulama örneği; gerçek tarayıcı yenilemesi ayrıca denenmeli |
| Çevrimdışı uygulama kabuğu | Geçti; service worker olayları ve Cache API test dublörü, ağ kapalı senaryo |
| Alt dizin, manifest, ikonlar | Geçti; göreli dosyalar ve kapsam kontrol edildi |
| Depolama hatası, metnin HTML olarak çalıştırılmaması | Geçti |
| Gerçek mobil yerleşim, dokunma, iOS klavyesi ve çevrimdışı açılış | **Doğrulanamadı**; ortamda tarayıcı kontrol aracı sunulmadı |

DOM/Cache testleri gerçek tarayıcı testlerinin yerini tutmaz. Fiziksel iPhone veya Android üzerinde test yapılmadı. Mobil CSS’de en az 44 px dokunma alanları, 16 px giriş yazısı (iOS yakınlaştırmasını önlemek için), uzun görevlerde satır kaydırma ve güvenli ekran boşlukları tanımlıdır; taşma ve klavye davranışı cihazda doğrulanmalıdır.

Gerçek cihazda yukarıdaki adımlara ek olarak 320, 375, 390 ve 412 px genişliklerde uzun bir Türkçe görev ve boşluksuz uzun metin deneyin; yatay kaydırma olmamasını ve klavye açıkken satıra erişilebildiğini kontrol edin.

## Dosyalar

`index.html` kabuk ve PWA meta bilgileri; `styles.css` mobil tasarım; `app.js` görünüm ve etkileşimler; `dates.js` yerel tarih işlemleri; `storage.js` veri kaydı; `sw.js` çevrimdışı önbellek; `manifest.webmanifest` yükleme bilgileri; `icons/` ana ekran simgeleri; `tests/` bağımlılıksız mantık testleri.
