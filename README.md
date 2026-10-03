# Lobi Ligi — Sezon 2

Bu klasör GitHub deposuna yüklenebilecek hazır yayın dosyalarıdır. Kod GitHub'da, şifreli ana site GitHub'a bağlı Cloudflare Pages'de çalışır. GitHub Pages kopyası salt okunur arşiv olarak kullanılabilir; orada şifreli giriş kapalıdır.

`index.html`, `.nojekyll`, `league-config.json` ve bu README dosyasını `Yazganugur/Lobi-ligi` deposunun köküne yükle. ZIP dosyasını site dosyası olarak yükleme. Cloudflare Pages → Import existing Git repository → main → Framework None → Build command `exit 0` → çıktı klasörü `/`. Anahtar bağlantısı yokken istatistikler ve yerel lobi kurucu çalışır; hesaplar ve ortak lobi kurulum bekler.

Hesap ve Steam bağlantısının ayrıntılı kurulumu ayrıca verilen `backend/KURULUM.md` içinde. Veritabanı ve Edge Function dosyalarını bu herkese açık yayın klasörüne koymak gerekmez. Şifreler, service_role, Steam API anahtarı ve kaynak ekran görüntüleri bu klasörde yer almaz. `league-config.json` yalnız kamuya açık Supabase URL/publishable anahtarı içindir.

Normal adres Sezon 2 açar; `?season=s1` eski sezonu açar. 20 eski maç / 200 kayıt korundu. Yeni maçlar `mac/sezon-2` klasörüne konur ve bu sohbette haber verilir. Bilgisayardaki değişiklik kendiliğinden GitHub'a gitmez. Depo bağlantısı kurulunca main commitleri Cloudflare'da otomatik yayına dönüşür.

Supabase veritabanı ve kayıt servisi bağlandı. Şifre alt sınırı 6 karakter; kayıt iki eşleşen şifre ister. Yerel önizlemede gerçek kullanıcı oturumu ve Hesabım profili doğrulandı. Ana site adresi henüz izinli origin listesine eklenmedi. Yönetici/kart onayı, Steam API secret ve iki cihazlı çekiliş kontrolü bekliyor. GitHub veya Cloudflare yayını bu paket hazırlama işlemiyle yapılmaz.
