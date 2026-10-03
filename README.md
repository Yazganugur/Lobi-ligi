# Lobi Ligi — Sezon 2

Bu klasör GitHub Pages için hazır yayın dosyalarıdır. Site ücretsiz GitHub Pages üzerinde çalışabilir; Cloudflare Pages zorunlu değildir.

GitHub deposunun kökünde şu dosyalar bulunmalı: `index.html`, `.nojekyll`, `league-config.json` ve bu README.

GitHub Pages kurulumu:
1. GitHub repository → **Settings → Pages**.
2. **Build and deployment → Source: Deploy from a branch**.
3. Branch olarak `main`, klasör olarak `/ (root)` seç.
4. **Save** de.
5. Site adresi genellikle `https://yazganugur.github.io/Lobi-ligi/` olur.

Site, GitHub Pages’te de kullanıcı girişi ve kayıt için Supabase’e bağlanır. Supabase Edge Function secret `LOBI_ALLOWED_ORIGINS` içine ana adresi de ekle:

`http://127.0.0.1:4174,https://lobi-ligi.pages.dev,https://yazganugur.github.io`

GitHub Pages proje adresinde `/Lobi-ligi/` yolu bulunur; Supabase origin listesine yalnızca origin’i, yani `https://yazganugur.github.io` adresini eklemek yeterlidir.

Cloudflare Pages mevcut alternatif yayın olarak kalabilir; iki servis aynı GitHub dosyalarını yayınlayabilir. Şifreler, service role anahtarı, Steam secret ve demo dosyaları bu klasörde bulunmaz.
