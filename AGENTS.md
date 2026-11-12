# Geliştirme kuralları

Bu kurallar deponun tamamında yapılan geliştirmeler için geçerlidir.

1. **Tek ana kaynak GitHub'dır.** Depo: https://github.com/oklukk/haftalik-gorevler, ana dal: `main`. Her geliştirme görevine başlamadan önce GitHub'daki güncel `main` dalını alın, dosyaları inceleyin ve yeni çalışma dalını bu sürümden oluşturun. Güncel sürüme erişilemiyorsa eski dosyaları güncel kabul etmeyin; engeli bildirin.
2. **Eski çalışma klasörlerini kaynak olarak kullanmayın.** `/workspace/work/haftalik-gorevler` gibi eski klasörlere veya önceki görevlerden kalan dosyalara dayanmayın. Kullanıcının mevcut çalışmalarını silmeden, GitHub'daki güncel `main` temelinde çalışın.
3. **Yalnızca istenen değişiklikleri uygulayın.** Güncel dosyaları ve ilgili yönergeleri inceleyin; kapsam dışı düzenleme, yeniden biçimlendirme veya silme yapmayın. Mevcut `main` kodunu gereksiz yere değiştirmeyin.
4. **Codex'in geçici bulut ortamında çalışın.** Kullanıcının bilgisayarına yerel kurulum, dosya indirme veya localhost kullanımı önermeyin.
5. **Değişiklikleri doğrulayın.** Farkları kontrol edin ve mümkün olan ilgili otomatik testleri çalıştırın. Mevcut test komutu depo kökünde `npm test` komutudur; Node.js 20 veya üzerini kullanır ve `npm install` gerektirmez. Başarılı, başarısız ve çalıştırılamayan kontrolleri açıkça ayırın.
6. **Yeni dal ve Pull Request kullanın.** Tamamlanan değişiklikleri GitHub'a ayrı bir dal üzerinden gönderip hedefi `main` olan PR açın. Doğrudan `main` dalına göndermeyin. Kullanıcı ayrıca istemedikçe PR'ı birleştirmeyin.
7. **GitHub Pages ve PWA uyumluluğunu koruyun.** Göreli dosya yollarını, depo alt dizininde çalışmayı, manifesti, ikonları, service worker kapsamını ve çevrimdışı kullanımı koruyun. Etkilenen davranışları doğrulayın.
8. **Telefonlarda saklanan görev verilerini koruyun.** Mevcut `localStorage` anahtarını (`haftalik-gorevler:v1:${basePath}`) veya görev veri yapısını (`{ id, date, text, completed }`) gerekli ve doğrulanmış bir geçiş mekanizması olmadan değiştirmeyin. Eski görevleri silmeyin veya boş verilerle üzerlerine yazmayın. Service worker önbellek sürümü ile görev depolama sürümünü birbirine karıştırmayın.
9. **PWA güncellemelerinin kullanıcılara ulaşmasını sağlayın.** Önbelleğe alınan uygulama dosyaları değiştiğinde `sw.js` içindeki `VERSION` değerini gerektiği şekilde artırın; yeni önbelleğin hazırlanmasını ve güncellemenin devreye girişini doğrulayın. Güncelleme akışı görev verilerini korumalıdır. Yalnızca belge değişiklikleri için gereksiz önbellek sürümü değişikliği yapmayın.
10. **Her görev sonunda sonucu bildirin.** Değişen dosyaları, test sonuçlarını ve oluşturulan PR bağlantısını paylaşın. PR açılamadıysa bunu açıkça belirtin ve somut engeli açıklayın; oluşturulmamış PR için bağlantı vermeyin.
