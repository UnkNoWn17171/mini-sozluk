# Mini Sözlük

Firefox araç çubuğunda duran küçük bir İngilizce ⇄ Türkçe sözlük. İkona tıkla, yazmaya başla;
[Tureng](https://tureng.com) sonuçlarından en fazla 10 satır gösterir.

- Yazarken otomatik arar (250 ms bekleme), Enter ile hemen arar.
- Kelime bulunamazsa Tureng'in önerilerini tıklanabilir olarak gösterir.
- `↗` tüm sonuçları tureng.com'da yeni sekmede açar.
- Açık/koyu temaya uyar.

## Güvenlik

| Önlem | Ayrıntı |
|---|---|
| Tek izin | Yalnızca `https://tureng.com/*`. Content script yok; ziyaret ettiğin sayfalara erişmez. `tabs`, `storage`, `<all_urls>` yok. |
| Sıkı CSP | `default-src 'none'; script-src 'self'; connect-src https://tureng.com` — eklenti başka hiçbir adrese istek atamaz, dışarıdan kod yükleyemez. |
| Güvenli ayrıştırma | Tureng HTML'i `DOMParser` ile ayrıştırılır (script çalışmaz, resim/kaynak yüklenmez). Ekrana yalnızca `textContent` yazılır; `innerHTML`/`eval` yok. |
| Gizlilik | İstekler çerezsiz (`credentials: "omit"`) ve referrer'sız gider. Arama geçmişi kaydedilmez; önbellek sadece popup açıkken bellekte durur. |
| Girdi/çıktı sınırları | Terim en fazla 80 karakter, kontrol karakterleri temizlenir, URL'de kodlanır. Yanıt boyutu, içerik türü, köken ve hücre uzunluğu kontrol edilir; 8 sn zaman aşımı. |
| Bağımlılık yok | Üçüncü taraf kütüphane, analitik, uzak kod yok. |

Not: Tureng'in resmi bir API'si yok; eklenti herkese açık arama sayfasını okur. Tureng sayfa
yapısını değiştirirse sonuçlar gelmeyebilir. Kişisel kullanım için yazılmıştır; Tureng ile resmi
bir bağlantısı yoktur (ikon ve renk Tureng'den esinlenmiştir).

## Kurulum

**Deneme (Firefox kapanınca silinir):**

1. Adres çubuğuna `about:debugging#/runtime/this-firefox` yaz.
2. **Geçici Eklenti Yükle…** → bu klasördeki `manifest.json` dosyasını seç.
3. İkon araç çubuğunda görünmezse: bulmaca (Eklentiler) menüsü → Mini Sözlük → **Araç çubuğuna sabitle**.

**Kalıcı:** Firefox'un normal sürümü yalnızca Mozilla imzalı eklentileri kalıcı kurar.

1. Paketi oluştur: `zip -r -X mini-sozluk-1.0.0.zip manifest.json popup.html popup.css popup.js icons`
2. [addons.mozilla.org/developers/addon/submit/distribution](https://addons.mozilla.org/developers/addon/submit/distribution)
   → **On your own** (listelenmemiş) → zip'i yükle. Kaynak kod sorusu: **Hayır** (derleme/küçültme yok).
3. İmzalanınca `.xpi` dosyasını indir, Firefox penceresine sürükle → **Ekle**.

Yeni sürüm için `manifest.json` içindeki `version` değerini artırıp aynı adımları tekrarla.

Gereksinim: Firefox 140+.
