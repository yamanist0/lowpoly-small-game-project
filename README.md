# Sonsuz şehirler

Three.js, TypeScript ve Rapier ile oluşturulan, dağlarla çevrili sonlu prosedürel dünya. Ticari, sanayi ve banliyö şehirleri farklı bölgelerde oluşur; şehirleri yollar, akarsular, göller ve dağlık araziler birbirine bağlar veya ayırır. Dağ dokuları ve tüm modeller proje assetlerinden yüklenir. Ekranda oyuncu durumu ve yakın çevre haritası gösterilir.

## Çalıştırma

```sh
npm install
npm run dev
```

Sol tıkla hedef seçerek yürüyün; rota yolları tercih eder, gerektiğinde yol dışından geçer. Space ile baktığınız veya hareket ettiğiniz yöne atılın. Fare tekerleğiyle yakınlaştırın ve orta fare tuşunu sürükleyerek kamerayı döndürün. 14.700 benzersiz mahalle adı gömülü renk ve bölge listelerinden oluşturulur; dünya kamera hareket ettikçe parça parça üretilir. Bina çarpışmaları Rapier tarafından hesaplanır.

Araç çarpmaları canı azaltır; can bittiğinde oyuncu başlangıç noktasına döner. Atılma çubuğu dolduğunda yeniden kullanılabilir. Oyuncu 500 dolar ile başlar. Suçlar polis aranmasını başlatır; polisler oyuncuyu gördüklerinde saldırır, izini kaybettiklerinde arama yapar.

Minimap üzerindeki mağaza simgeleri, girilebilen dükkânları gösterir. Mağazaya tıklayın veya girişine yaklaşıp E tuşuna basın; içerideki EXIT işaretine tıklayarak ya da çıkışın yakınında E ile dışarı dönün. Her mağazanın boyutu, yerleşimi ve duvar/zemin dokuları konumuna göre belirlenir.

Markette kasaya yaklaşarak E ile silah menüsünü açın. Silahlar 500–5.000 dolar arasındadır; satın alınan silah otomatik seçilir. Tab tuşunu basılı tutup fareyi veya yön tuşlarını kullanarak envanter çarkından seçim yapın ve kuşanmak için Tab tuşunu bırakın. Sağ fare tuşunu basılı tutarak nişan alın, sol tuşla ateş edin. Yayalar, polisler ve araçlar vurulabilir; bazuka ve bomba atar alan etkili patlamalara yol açar. Ödüller yayalar için 25–50, polisler için 50–75, araçlar için 50–75 ve polis araçları için 150–250 dolardır.


Banka simgeleri minimapta mavi renktedir. Bankaya tıklayarak veya girişine yaklaşıp E tuşuna basarak girin. Her bankanın planı, eşyaları ve yüzeyleri konumuna göre belirlenir. Bankalarda 3–5 ATM, bir kasa, siper alınabilecek bankolar, bölmeler ve aralıklı yanan lazerler bulunur. Polisler siper seçer, sırayla köşeden çıkarak ateş eder. ATM veya kasaya yaklaşarak E tuşuyla bulmacayı açın: ATM için eşleşen kabloları bağlayın; kasa için işaretçi yeşil alandayken Space veya SET PIN ile üç pimi ayarlayın.

Her ATM 500–1.000 dolar, kasa 2.000–5.000 dolar kazandırır. Bankada ateş açmak anında beş yıldız, lazeri tetiklemek veya soyguna başlamak alarm oluşturur. Banka içindeki soygun ve polis ödülleri çıkışa kadar güvenceye alınmaz; içeride ölürseniz bu paraya polis el koyar. Soygun başladığında bankadaki tüm polisler etkisiz hâle getirilene kadar çıkış kilitlenir. Kasa açılırsa dört yörüngesel silahlı dev polis ortaya çıkar; sipere girip çıktığında yalnızca oyuncuyu gören silahlarıyla ateş eder, kalkan ve kaçış hareketleri kullanır. Yenildiğinde iki polis ve toplanabilir 500 dolar bırakır. Banka için beş dakikalık yenilenme süresi alarmda başlar ve aktif soygun bitene kadar yenilenme ertelenir. Durum oyun oturumu boyunca korunur.

Markette $250 karşılığında tekrar kullanılabilir maymuncuk satın alın. En fazla beş maymuncuk taşıyabilirsiniz. Tab ile maymuncuğu seçin, sağ tıkla nişan alıp eve sol tıklayın; karakter eve yaklaşınca dört pini zamanında ayarlayarak kilidi açın. Hatalı zamanlama bir maymuncuğu kırar; Esc ile vazgeçmek kırmaz. Her evin oda planı, eşyaları ve çerçeveli tabloları konumuna göre değişir. Yanıp sönen işaretlere yaklaşıp E ile 250–700 dolar değerindeki tabloları alın; küçük kasanın zamanlama bulmacası zorluğa göre 700–1.300 dolar verir. Aynı evin alınan eşyaları oyun oturumu boyunca geri gelmez.

Evden çıkınca beş yıldız aranma başlar. Aranma sürerken ölürseniz bu takip sırasında biriktirdiğiniz ev soygunu gelirlerinin yarısı, mevcut paranızla sınırlı olarak polis tarafından alınır ve sonuç ekranda gösterilir. Aranmadan kurtulursanız bu takipteki soygun gelirini korursunuz.

M ile büyük haritayı açın; gezdiğiniz alanlar ortaya çıkar. Haritayı sürükleyebilir ve tekerlekle yakınlaştırabilirsiniz. N ile bulunduğunuz şehirde yönetimi açın; 20.000 $ karşılığında şehri himayenize alıp her şehre ayrı ekip kurabilirsiniz. Her alım, o şehirde sonraki elemanların fiyatını 1.000 $ artırır. Soyguncular oyun sürerken düzenli gelir getirir; korumalar yakındaki polislere ateş eder, kapkaççılar sivilleri yere düşürür, kâşifler zamanla haritayı açar. Harita ve ekipler oyun oturumu boyunca saklanır.

## Çevrimiçi oyun

Oyun artık Worker ve D1 sunucusuna ihtiyaç duyar. Yerel çalıştırma ve Cloudflare kurulumu için [sunucu yönergelerine](server/README.md) bakın. Oyuncu kimliği bu tarayıcıda saklanan bir misafir anahtarına bağlıdır. Para ve envanter henüz istemcide hesaplanır; bu sürüm hileye karşı güvenli değildir.
