# Lobi Ligi — ücretsiz gece maçı deneyi

Site GitHub Pages'te kalır. Bu klasör yalnızca bilgisayar kapalıyken bot hazırlık maçlarını hesaplayan ayrı Node sunucu paketidir. Henüz internette çalıştığı doğrulanmadı; bağlantı kurulana kadar sitedeki kayıt düğmesi kapalıdır.

## Bir defalık kurulum

1. GitHub Desktop'ta hazırlanan değişiklikleri **Commit to main → Push origin** ile gönder.
2. Vercel'e giriş yap. **Hobby / Personal** ücretsiz planını kullan; Pro denemesi, ödeme bilgisi veya ücretli hizmet açma.
3. **Add New → Project → Yazganugur/Lobi-ligi → Import**.
4. **Framework Preset: Other**, **Root Directory: server-match**. Site kökünü seçme. Build Command için boş override kullan; bu paket derleme gerektirmez. Node sürümü **22.x**; Fluid Compute açık olmalı. Output Directory için framework varsayılanını bırak.
5. **Environment Variables** bölümünde, yalnızca sunucu projesinin Production ortamına şu değerleri kendin gir:

| Ad | Değer |
| --- | --- |
| `SUPABASE_URL` | `https://qqvafjrwiqnrxepbbumh.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Lobi Ligi Supabase → Project Settings → API Keys → Legacy API Keys → `service_role` anahtarı |
| `CRON_SECRET` | Şifre yöneticinle ürettiğin, en az 32 karakterli rastgele gizli değer |

Anahtarları sohbete gönderme. `service_role` hesabının sunucu yetkisidir; `index.html`, `league-config.json`, `.env.example` veya GitHub'a yazılmaz. Vercel bu gizli değeri günlük çağrıya Authorization başlığında ekler.

6. **Deploy**. Sonra **Settings → Cron Jobs** içinde `/api/matches` günlük çağrısının göründüğünü kontrol et. İlk bağlantı için oradaki **Run** düğmesini kullan. Gizli anahtarı URL'ye ekleme.
7. Sitede **Oyun Laboratuvarı → Maç Merkezi → Gece maçlarım** aç. “Maç işçisi bağlı” görünmeli. Önce bir bot maçı kaydet; kaydı, kadro kilidini, sunucu sonucunu ve round izlemeyi birlikte doğrulamadan ortak insan ligini açma.

Kurulum ekranı farklıysa durup ilgili ekranı birlikte kontrol edelim. Yeni hesap şartlarını kabul etme ve gizli anahtar girişini hesap sahibi yapar.

## Sınırlar ve dürüst beklenti

- Türkiye saatiyle **21:00** için kayıt alınır. Ücretsiz Vercel cron günde bir kez çalışır; 21:00–21:59 içinde tetiklenebilir. Tam dakikada maç sözü verilmez.
- Gecede toplam **4**, kişi başına en fazla **3 bekleyen** maç. Aylık en fazla **57 hesaplama girişimi** (12.000 saniyelik rezerv, girişim başına 210 saniye); tekrar denemeler de sayılır. Bu sınır başka Vercel projelerinin tüketimini kapsamaz. Kota bitince maç pending kalır; mağlubiyet yazılmaz.
- Tek hesaplamada 200 saniye sınırı; işlevde 300 saniye. Gerçek sunucu performansı yayından sonra ölçülmelidir. Dört eşzamanlı işin ücretsiz CPU'daki performansı henüz doğrulanmadı.
- Kullanıcının kulüp kaydı sunucuda alınır. Aynı maç kodu, kadro ve motor sürümü yeniden denemede korunur. Aynı kayıt iki kez sonuç yazamaz. Tarayıcı sonuç/ödül göndermez.
- Bu ilk sürüm **bot hazırlık maçı**; Elo, XP, kredi veya gerçek sezon puanını değiştirmez. Ortak lig ve insan meydan okuması henüz bağlı değildir.
- Tam round kaydı 14 gün sonra işçi çalıştığında temizlenir. Özet korunur. Tam kaydı indirme düğmesi bulunur. Supabase Free kapasitesi ve duraklama kuralları ayrıca geçerlidir.
- Vercel Hobby kişisel, ticari olmayan deneme içindir. Steam'de satış aşamasında uygun ticari sunucu planı yeniden seçilecek; bu paket satış için hazır sunucu garantisi değildir.

## Güncelleme

Kaynak motor değişince `scripts/stamp-game-engine.mjs` ardından `scripts/package-server-match.mjs` çalışır. Normal `guncelle-site.ps1` bunu yapar ve doğrulanmış paketi GitHub Desktop klasörüne taşır. Sana **Commit → Push** kalır. Vercel Git bağlantısı kuruluysa Production yeniden yayımlanır.

Eski motorla kaydedilmiş, henüz kilitlenmemiş maçta **Güncel kadroyu kaydet** kullanılır. Kilitlenmiş eski sürüm maç otomatik yeni motorla oynanmaz; yönetici incelemesi gerekir.

## Kontroller

`node test/smoke.mjs`: gerçek işçi thread'i, tam maç, iki yöneticinin ayrı planı, sıkıştırılmış kayıt, motor özeti, tekrar deneme, yetkisiz çağrı reddi.

`backend/test-club-scheduled.sql`: doğru Supabase projesinde rollback testi; izin, kayıt tekrarı, kilit, işçi kiralaması, aylık kota ve başkasının kaydını okuyamama. Kullanıcı verisini kalıcı değiştirmez.

Resmî kaynaklar (12 Ekim 2026 kontrolü): [Cron sınırları](https://vercel.com/docs/cron-jobs/usage-and-pricing), [işlev sınırları](https://vercel.com/docs/functions/limitations), [kullanım](https://vercel.com/docs/functions/usage-and-pricing), [Hobby koşulları](https://vercel.com/pricing).
