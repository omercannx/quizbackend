const { Question, ShopItem, QuestTemplate, Season, CosmeticFrame, AchievementReward } = require('../models');

const seedQuestions = [
  // ─── GENERAL EASY ───
  { questionKey: 'ge1', category: 'general', difficulty: 'easy', text: 'Dünyanın en büyük okyanusu hangisidir?', optionA: 'Atlas Okyanusu', optionB: 'Pasifik Okyanusu', optionC: 'Hint Okyanusu', correct: 1, hint: 'En geniş yüzölçümüne sahiptir.' },
  { questionKey: 'ge2', category: 'general', difficulty: 'easy', text: 'Türkiye\'nin başkenti neresidir?', optionA: 'İstanbul', optionB: 'Ankara', optionC: 'İzmir', correct: 1, hint: 'İç Anadolu\'dadır.' },
  { questionKey: 'ge3', category: 'general', difficulty: 'easy', text: 'Bir yılda kaç ay vardır?', optionA: '10', optionB: '11', optionC: '12', correct: 2, hint: 'Ocaktan Aralığa kadar.' },
  { questionKey: 'ge4', category: 'general', difficulty: 'easy', text: 'Mona Lisa tablosunu kim yapmıştır?', optionA: 'Picasso', optionB: 'Leonardo da Vinci', optionC: 'Van Gogh', correct: 1, hint: 'İtalyan bir deha.' },
  { questionKey: 'ge5', category: 'general', difficulty: 'easy', text: 'Hangisi bir kıta değildir?', optionA: 'Avustralya', optionB: 'Antarktika', optionC: 'Arktika', correct: 2, hint: 'Kuzey kutbundadır ama kıta değildir.' },
  { questionKey: 'ge6', category: 'general', difficulty: 'easy', text: 'Gökkuşağında kaç renk vardır?', optionA: '5', optionB: '7', optionC: '9', correct: 1, hint: 'Kırmızıdan mora.' },
  { questionKey: 'ge7', category: 'general', difficulty: 'easy', text: 'Dünyanın en uzun nehri hangisidir?', optionA: 'Amazon', optionB: 'Nil', optionC: 'Mississippi', correct: 1, hint: 'Afrika\'dadır.' },
  { questionKey: 'ge8', category: 'general', difficulty: 'easy', text: 'Pizza hangi ülkenin yemeğidir?', optionA: 'Fransa', optionB: 'İtalya', optionC: 'İspanya', correct: 1, hint: 'Napoli şehri meşhurdur.' },
  { questionKey: 'ge9', category: 'general', difficulty: 'easy', text: 'Olimpiyat oyunları kaç yılda bir yapılır?', optionA: '2', optionB: '3', optionC: '4', correct: 2, hint: 'Son yaz olimpiyatları 2024\'teydi.' },
  { questionKey: 'ge10', category: 'general', difficulty: 'easy', text: 'Hangisi bir gezegen değildir?', optionA: 'Merkür', optionB: 'Plüton', optionC: 'Venüs', correct: 1, hint: '2006\'da statüsü değişti.' },
  // ─── GENERAL MEDIUM ───
  { questionKey: 'gm1', category: 'general', difficulty: 'medium', text: 'Osmanlı İmparatorluğu hangi yılda kurulmuştur?', optionA: '1299', optionB: '1453', optionC: '1071', correct: 0, hint: 'Osman Bey tarafından.' },
  { questionKey: 'gm2', category: 'general', difficulty: 'medium', text: 'İstanbul\'un fetih yılı hangisidir?', optionA: '1453', optionB: '1492', optionC: '1520', correct: 0, hint: 'Fatih Sultan Mehmet.' },
  { questionKey: 'gm3', category: 'general', difficulty: 'medium', text: 'Mars gezegeninin takma adı nedir?', optionA: 'Mavi Gezegen', optionB: 'Kızıl Gezegen', optionC: 'Yeşil Gezegen', correct: 1, hint: 'Yüzeyindeki demir oksit.' },
  { questionKey: 'gm4', category: 'general', difficulty: 'medium', text: 'Hangisi Nobel ödülü kategorilerinden biri değildir?', optionA: 'Matematik', optionB: 'Edebiyat', optionC: 'Fizik', correct: 0, hint: 'Fields madalyası bunun içindir.' },
  { questionKey: 'gm5', category: 'general', difficulty: 'medium', text: 'Hangisi bir Rönesans dönemi sanatçısı değildir?', optionA: 'Michelangelo', optionB: 'Monet', optionC: 'Raphael', correct: 1, hint: 'İzlenimcilik akımındandır.' },
  { questionKey: 'gm6', category: 'general', difficulty: 'medium', text: 'Dünya\'nın çekirdeği ağırlıklı olarak neden oluşur?', optionA: 'Altın', optionB: 'Demir ve Nikel', optionC: 'Bakır', correct: 1, hint: 'Manyetik alanı oluşturur.' },
  { questionKey: 'gm7', category: 'general', difficulty: 'medium', text: 'Hangi ülke hem Avrupa hem Asya kıtasındadır?', optionA: 'Yunanistan', optionB: 'Türkiye', optionC: 'Mısır', correct: 1, hint: 'Boğazlar ikiye ayırır.' },
  { questionKey: 'gm8', category: 'general', difficulty: 'medium', text: 'İnsan vücudundaki en büyük organ hangisidir?', optionA: 'Karaciğer', optionB: 'Deri', optionC: 'Akciğer', correct: 1, hint: 'Vücudun dış kaplaması.' },
  { questionKey: 'gm9', category: 'general', difficulty: 'medium', text: 'Everest Dağı hangi iki ülke sınırındadır?', optionA: 'Çin-Hindistan', optionB: 'Nepal-Çin', optionC: 'Nepal-Hindistan', correct: 1, hint: 'Tibet sınırında.' },
  { questionKey: 'gm10', category: 'general', difficulty: 'medium', text: 'Hangi element periyodik tabloda "Fe" sembolüyle gösterilir?', optionA: 'Flor', optionB: 'Demir', optionC: 'Fosfor', correct: 1, hint: 'Latince "ferrum".' },
  // ─── GENERAL HARD ───
  { questionKey: 'gh1', category: 'general', difficulty: 'hard', text: 'Kuantum mekaniğinde "belirsizlik ilkesi" kime aittir?', optionA: 'Einstein', optionB: 'Heisenberg', optionC: 'Bohr', correct: 1, hint: 'Alman fizikçi, 1927.' },
  { questionKey: 'gh2', category: 'general', difficulty: 'hard', text: 'Fibonacci dizisinde 10. sayı kaçtır?', optionA: '34', optionB: '55', optionC: '89', correct: 1, hint: '1,1,2,3,5,8,13,21...' },
  { questionKey: 'gh3', category: 'general', difficulty: 'hard', text: '"Sapiens" kitabının yazarı kimdir?', optionA: 'Yuval Noah Harari', optionB: 'Stephen Hawking', optionC: 'Richard Dawkins', correct: 0, hint: 'İsrailli tarihçi.' },
  { questionKey: 'gh4', category: 'general', difficulty: 'hard', text: 'Evrenin yaşı yaklaşık kaç milyar yıldır?', optionA: '10.8', optionB: '13.8', optionC: '16.8', correct: 1, hint: 'Büyük Patlama\'dan bu yana.' },
  { questionKey: 'gh5', category: 'general', difficulty: 'hard', text: 'Turing Makinesi kavramını kim ortaya atmıştır?', optionA: 'John von Neumann', optionB: 'Alan Turing', optionC: 'Charles Babbage', correct: 1, hint: 'İngiliz matematikçi, II. Dünya Savaşı.' },
  // ─── SCIENCE EASY ───
  { questionKey: 'se1', category: 'science', difficulty: 'easy', text: 'Suyun kimyasal formülü nedir?', optionA: 'CO2', optionB: 'H2O', optionC: 'O2', correct: 1, hint: 'İki hidrojen, bir oksijen.' },
  { questionKey: 'se2', category: 'science', difficulty: 'easy', text: 'Güneş sistemimizdeki en büyük gezegen hangisidir?', optionA: 'Mars', optionB: 'Satürn', optionC: 'Jüpiter', correct: 2, hint: 'Gaz devi.' },
  { questionKey: 'se3', category: 'science', difficulty: 'easy', text: 'İnsan vücudunda kaç kemik vardır?', optionA: '106', optionB: '206', optionC: '306', correct: 1, hint: 'Yetişkin insan.' },
  { questionKey: 'se4', category: 'science', difficulty: 'easy', text: 'Hangisi bir memeli değildir?', optionA: 'Yunus', optionB: 'Kartal', optionC: 'Yarasa', correct: 1, hint: 'Kuş türüdür.' },
  { questionKey: 'se5', category: 'science', difficulty: 'easy', text: 'Yerçekimini kim keşfetmiştir?', optionA: 'Einstein', optionB: 'Newton', optionC: 'Galileo', correct: 1, hint: 'Elma ağacı hikayesi.' },
  // ─── SCIENCE MEDIUM ───
  { questionKey: 'sm1', category: 'science', difficulty: 'medium', text: 'Işık hızı saniyede yaklaşık kaç km\'dir?', optionA: '150.000', optionB: '300.000', optionC: '450.000', correct: 1, hint: 'c sabiti.' },
  { questionKey: 'sm2', category: 'science', difficulty: 'medium', text: 'Periyodik tabloda "Au" hangi elementin sembolüdür?', optionA: 'Gümüş', optionB: 'Altın', optionC: 'Alüminyum', correct: 1, hint: 'Latince "aurum".' },
  { questionKey: 'sm3', category: 'science', difficulty: 'medium', text: 'DNA\'nın açılımı nedir?', optionA: 'Deoksiribo Nükleik Asit', optionB: 'Dinükleotid Amino Asit', optionC: 'Deoksi Nitrik Asit', correct: 0, hint: 'Genetik bilginin taşıyıcısı.' },
  { questionKey: 'sm4', category: 'science', difficulty: 'medium', text: 'İnsan beyninde yaklaşık kaç nöron bulunur?', optionA: '86 milyon', optionB: '86 milyar', optionC: '860 milyar', correct: 1, hint: 'Galaksideki yıldız sayısına yakın.' },
  { questionKey: 'sm5', category: 'science', difficulty: 'medium', text: 'Hangi element en hafiftir?', optionA: 'Helyum', optionB: 'Hidrojen', optionC: 'Lityum', correct: 1, hint: 'Atom numarası 1.' },
  // ─── SCIENCE HARD ───
  { questionKey: 'sh1', category: 'science', difficulty: 'hard', text: 'Hangi vitamin eksikliği "skorbüt" hastalığına neden olur?', optionA: 'Vitamin A', optionB: 'Vitamin C', optionC: 'Vitamin D', correct: 1, hint: 'Narenciye meyvelerinde bol.' },
  { questionKey: 'sh2', category: 'science', difficulty: 'hard', text: 'E=mc² formülünde c neyi temsil eder?', optionA: 'Kütle', optionB: 'Işık hızı', optionC: 'Enerji sabiti', correct: 1, hint: 'Einstein\'ın özel göreliliği.' },
  { questionKey: 'sh3', category: 'science', difficulty: 'hard', text: 'CRISPR teknolojisi ne için kullanılır?', optionA: 'Yapay zeka', optionB: 'Gen düzenleme', optionC: 'Kuantum hesaplama', correct: 1, hint: 'DNA\'yı keser ve yapıştırır.' },
  { questionKey: 'sh4', category: 'science', difficulty: 'hard', text: 'Higgs bozonu hangi yıl deneysel olarak gözlemlendi?', optionA: '2008', optionB: '2012', optionC: '2016', correct: 1, hint: 'CERN, LHC.' },
  { questionKey: 'sh5', category: 'science', difficulty: 'hard', text: 'Hangi parçacık elektrik yükü taşımaz?', optionA: 'Proton', optionB: 'Elektron', optionC: 'Nötron', correct: 2, hint: 'Adı "nötr"den gelir.' },
  // ─── HISTORY EASY ───
  { questionKey: 'he1', category: 'history', difficulty: 'easy', text: 'İstanbul hangi yılda fethedildi?', optionA: '1453', optionB: '1299', optionC: '1071', correct: 0, hint: 'Fatih Sultan Mehmet.' },
  { questionKey: 'he2', category: 'history', difficulty: 'easy', text: 'Türkiye Cumhuriyeti hangi yılda kuruldu?', optionA: '1920', optionB: '1923', optionC: '1938', correct: 1, hint: 'Atatürk\'ün önderliğinde.' },
  { questionKey: 'he3', category: 'history', difficulty: 'easy', text: 'İkinci Dünya Savaşı hangi yılda bitti?', optionA: '1943', optionB: '1945', optionC: '1947', correct: 1, hint: 'Atom bombası atıldı.' },
  { questionKey: 'he4', category: 'history', difficulty: 'easy', text: 'Piramitleri hangi uygarlık inşa etti?', optionA: 'Romalılar', optionB: 'Mısırlılar', optionC: 'Yunanlılar', correct: 1, hint: 'Firavunlar dönemi.' },
  { questionKey: 'he5', category: 'history', difficulty: 'easy', text: 'Amerika kıtasını kim keşfetti?', optionA: 'Magellan', optionB: 'Kristof Kolomb', optionC: 'Vasco da Gama', correct: 1, hint: '1492.' },
  // ─── HISTORY MEDIUM ───
  { questionKey: 'hm1', category: 'history', difficulty: 'medium', text: 'Malazgirt Savaşı hangi yılda yapıldı?', optionA: '1071', optionB: '1176', optionC: '1243', correct: 0, hint: 'Anadolu\'nun kapıları açıldı.' },
  { questionKey: 'hm2', category: 'history', difficulty: 'medium', text: 'Çanakkale Savaşı hangi yılda yapıldı?', optionA: '1914', optionB: '1915', optionC: '1916', correct: 1, hint: 'Çanakkale geçilmez!' },
  { questionKey: 'hm3', category: 'history', difficulty: 'medium', text: 'Sanayi Devrimi ilk hangi ülkede başladı?', optionA: 'Fransa', optionB: 'Almanya', optionC: 'İngiltere', correct: 2, hint: 'Buhar makinesi.' },
  { questionKey: 'hm4', category: 'history', difficulty: 'medium', text: 'Lozan Antlaşması hangi yıl imzalandı?', optionA: '1920', optionB: '1923', optionC: '1924', correct: 1, hint: 'Türkiye\'nin uluslararası tanınması.' },
  { questionKey: 'hm5', category: 'history', difficulty: 'medium', text: 'Hangi uygarlık yazıyı icat etmiştir?', optionA: 'Mısırlılar', optionB: 'Sümerler', optionC: 'Fenikeliler', correct: 1, hint: 'Çivi yazısı, Mezopotamya.' },
  // ─── HISTORY HARD ───
  { questionKey: 'hh1', category: 'history', difficulty: 'hard', text: 'Türkiye Cumhuriyeti\'nin ilk anayasası hangi yıl kabul edilmiştir?', optionA: '1921', optionB: '1924', optionC: '1923', correct: 1, hint: 'Teşkilat-ı Esasiye\'den sonra.' },
  { questionKey: 'hh2', category: 'history', difficulty: 'hard', text: 'Vestfalya Barışı neyin sonunu getirdi?', optionA: 'Yüzyıl Savaşları', optionB: 'Otuz Yıl Savaşları', optionC: 'Haçlı Seferleri', correct: 1, hint: '1648, modern devlet sistemi.' },
  { questionKey: 'hh3', category: 'history', difficulty: 'hard', text: 'Tanzimat Fermanı hangi padişah döneminde ilan edildi?', optionA: 'Abdülmecid', optionB: 'Abdülhamid II', optionC: 'Mahmud II', correct: 0, hint: '1839, Gülhane Hatt-ı Hümayunu.' },
  { questionKey: 'hh4', category: 'history', difficulty: 'hard', text: 'Rönesans hangi şehirde başlamıştır?', optionA: 'Roma', optionB: 'Floransa', optionC: 'Venedik', correct: 1, hint: 'Medici ailesi.' },
  { questionKey: 'hh5', category: 'history', difficulty: 'hard', text: 'Marshall Planı hangi yılda başladı?', optionA: '1945', optionB: '1948', optionC: '1950', correct: 1, hint: 'ABD\'nin Avrupa\'ya ekonomik yardımı.' },
  // ─── SPORTS EASY ───
  { questionKey: 'spe1', category: 'sports', difficulty: 'easy', text: 'Futbolda bir takımda kaç oyuncu sahada olur?', optionA: '9', optionB: '10', optionC: '11', correct: 2, hint: 'Kaleci dahil.' },
  { questionKey: 'spe2', category: 'sports', difficulty: 'easy', text: 'Olimpiyat halkaları kaç tanedir?', optionA: '4', optionB: '5', optionC: '6', correct: 1, hint: 'Kıtaları temsil eder.' },
  { questionKey: 'spe3', category: 'sports', difficulty: 'easy', text: 'FIFA Dünya Kupası kaç yılda bir yapılır?', optionA: '2', optionB: '3', optionC: '4', correct: 2, hint: 'Olimpiyatlar gibi.' },
  { questionKey: 'spe4', category: 'sports', difficulty: 'easy', text: 'Maratonda kaç km koşulur?', optionA: '21', optionB: '42', optionC: '50', correct: 1, hint: '42.195 km tam olarak.' },
  { questionKey: 'spe5', category: 'sports', difficulty: 'easy', text: 'Voleybolda bir takımda kaç oyuncu sahada olur?', optionA: '5', optionB: '6', optionC: '7', correct: 1, hint: 'Rotasyonla dönerler.' },
  // ─── SPORTS MEDIUM ───
  { questionKey: 'spm1', category: 'sports', difficulty: 'medium', text: 'En çok Ballon d\'Or kazanan futbolcu kimdir?', optionA: 'Ronaldo', optionB: 'Messi', optionC: 'Cruyff', correct: 1, hint: 'Arjantinli yıldız.' },
  { questionKey: 'spm2', category: 'sports', difficulty: 'medium', text: 'Hangi ülke en çok Dünya Kupası kazanmıştır?', optionA: 'Almanya', optionB: 'Brezilya', optionC: 'İtalya', correct: 1, hint: '5 kez şampiyon.' },
  { questionKey: 'spm3', category: 'sports', difficulty: 'medium', text: 'Usain Bolt\'un 100m dünya rekoru kaç saniyedir?', optionA: '9.58', optionB: '9.69', optionC: '9.72', correct: 0, hint: '2009 Berlin.' },
  { questionKey: 'spm4', category: 'sports', difficulty: 'medium', text: 'El Clasico hangi iki takım arasındadır?', optionA: 'Milan-Inter', optionB: 'Real Madrid-Barcelona', optionC: 'Liverpool-Man Utd', correct: 1, hint: 'İspanya derbisi.' },
  { questionKey: 'spm5', category: 'sports', difficulty: 'medium', text: 'Olimpiyat oyunlarında en çok altın madalya alan sporcu kimdir?', optionA: 'Usain Bolt', optionB: 'Michael Phelps', optionC: 'Carl Lewis', correct: 1, hint: 'Yüzücü, 23 altın.' },
  // ─── SPORTS HARD ───
  { questionKey: 'sph1', category: 'sports', difficulty: 'hard', text: 'İlk modern olimpiyat oyunları hangi yılda yapıldı?', optionA: '1892', optionB: '1896', optionC: '1900', correct: 1, hint: 'Atina, Yunanistan.' },
  { questionKey: 'sph2', category: 'sports', difficulty: 'hard', text: 'Hangi boksör "The Greatest" lakabıyla tanınır?', optionA: 'Mike Tyson', optionB: 'Muhammad Ali', optionC: 'Floyd Mayweather', correct: 1, hint: 'Cassius Clay.' },
  { questionKey: 'sph3', category: 'sports', difficulty: 'hard', text: 'Tour de France kaç etaptan oluşur?', optionA: '15', optionB: '21', optionC: '25', correct: 1, hint: '3 haftalık yarış.' },
  { questionKey: 'sph4', category: 'sports', difficulty: 'hard', text: 'Hangi takım UEFA Şampiyonlar Ligi\'ni en çok kazanmıştır?', optionA: 'AC Milan', optionB: 'Real Madrid', optionC: 'Barcelona', correct: 1, hint: '15 kez şampiyon.' },
  { questionKey: 'sph5', category: 'sports', difficulty: 'hard', text: 'F1\'de en çok şampiyonluk kazanan pilot kimdir?', optionA: 'Schumacher', optionB: 'Hamilton', optionC: 'Verstappen', correct: 1, hint: 'İngiliz pilot, 7+ şampiyonluk.' },
  // ─── GEOGRAPHY EASY ───
  { questionKey: 'goe1', category: 'geography', difficulty: 'easy', text: 'Dünyanın en büyük ülkesi hangisidir?', optionA: 'Çin', optionB: 'Kanada', optionC: 'Rusya', correct: 2, hint: 'Avrupa ve Asya\'ya yayılır.' },
  { questionKey: 'goe2', category: 'geography', difficulty: 'easy', text: 'Türkiye\'nin en büyük gölü hangisidir?', optionA: 'Tuz Gölü', optionB: 'Van Gölü', optionC: 'Beyşehir Gölü', correct: 1, hint: 'Doğu Anadolu.' },
  { questionKey: 'goe3', category: 'geography', difficulty: 'easy', text: 'Japonya\'nın başkenti neresidir?', optionA: 'Osaka', optionB: 'Kyoto', optionC: 'Tokyo', correct: 2, hint: 'Doğu Asya ada ülkesi.' },
  { questionKey: 'goe4', category: 'geography', difficulty: 'easy', text: 'Dünyanın en yüksek dağı hangisidir?', optionA: 'K2', optionB: 'Everest', optionC: 'Kilimanjaro', correct: 1, hint: 'Himalayalar.' },
  { questionKey: 'goe5', category: 'geography', difficulty: 'easy', text: 'Kaç tane okyanus vardır?', optionA: '3', optionB: '5', optionC: '7', correct: 1, hint: 'Pasifik, Atlas, Hint, Arktik, Güney.' },
  // ─── GEOGRAPHY MEDIUM ───
  { questionKey: 'gom1', category: 'geography', difficulty: 'medium', text: 'Dünya\'daki en derin okyanus çukuru hangisidir?', optionA: 'Mariana', optionB: 'Tonga', optionC: 'Porto Riko', correct: 0, hint: 'Pasifik Okyanusu, ~11 km.' },
  { questionKey: 'gom2', category: 'geography', difficulty: 'medium', text: 'Hangi boğaz Avrupa ile Asya\'yı ayırır?', optionA: 'Cebelitarık', optionB: 'İstanbul', optionC: 'Hürmüz', correct: 1, hint: 'Türkiye\'de.' },
  { questionKey: 'gom3', category: 'geography', difficulty: 'medium', text: 'Türkiye\'nin en uzun nehri hangisidir?', optionA: 'Fırat', optionB: 'Kızılırmak', optionC: 'Sakarya', correct: 1, hint: 'Kırmızı nehir.' },
  { questionKey: 'gom4', category: 'geography', difficulty: 'medium', text: 'Dünya\'daki en büyük ada hangisidir?', optionA: 'Borneo', optionB: 'Grönland', optionC: 'Madagaskar', correct: 1, hint: 'Avustralya kıta sayılır.' },
  { questionKey: 'gom5', category: 'geography', difficulty: 'medium', text: 'Kapadokya hangi bölgemizdedir?', optionA: 'Ege', optionB: 'İç Anadolu', optionC: 'Akdeniz', correct: 1, hint: 'Nevşehir, Göreme.' },
  // ─── GEOGRAPHY HARD ───
  { questionKey: 'goh1', category: 'geography', difficulty: 'hard', text: 'Dünyanın en kurak çölü hangisidir?', optionA: 'Sahara', optionB: 'Atacama', optionC: 'Gobi', correct: 1, hint: 'Güney Amerika, Şili.' },
  { questionKey: 'goh2', category: 'geography', difficulty: 'hard', text: 'Dünyanın en derin gölü hangisidir?', optionA: 'Baykal', optionB: 'Tanganyika', optionC: 'Hazar', correct: 0, hint: 'Sibirya, Rusya, 1642m.' },
  { questionKey: 'goh3', category: 'geography', difficulty: 'hard', text: 'Ring of Fire (Ateş Çemberi) hangi okyanustadır?', optionA: 'Atlas', optionB: 'Hint', optionC: 'Pasifik', correct: 2, hint: 'Deprem ve volkan kuşağı.' },
  { questionKey: 'goh4', category: 'geography', difficulty: 'hard', text: 'Türkiye\'nin en yüksek dağı hangisidir?', optionA: 'Kaçkar', optionB: 'Ağrı', optionC: 'Erciyes', correct: 1, hint: '5137 metre, Doğu Anadolu.' },
  { questionKey: 'goh5', category: 'geography', difficulty: 'hard', text: 'Hangi ülke en çok zaman dilimine sahiptir?', optionA: 'Rusya', optionB: 'ABD', optionC: 'Fransa', correct: 2, hint: 'Denizaşırı topraklar sayesinde, 12 dilim.' },
  // ─── TECHNOLOGY EASY ───
  { questionKey: 'te1', category: 'technology', difficulty: 'easy', text: 'WWW\'nin açılımı nedir?', optionA: 'Wide Web World', optionB: 'World Wide Web', optionC: 'Web World Wide', correct: 1, hint: 'İnternet tarayıcısı.' },
  { questionKey: 'te2', category: 'technology', difficulty: 'easy', text: 'Apple\'ın kurucusu kimdir?', optionA: 'Bill Gates', optionB: 'Steve Jobs', optionC: 'Elon Musk', correct: 1, hint: 'iPhone\'un yaratıcısı.' },
  { questionKey: 'te3', category: 'technology', difficulty: 'easy', text: 'Hangisi bir programlama dili değildir?', optionA: 'Python', optionB: 'HTML', optionC: 'Java', correct: 1, hint: 'İşaretleme dili.' },
  { questionKey: 'te4', category: 'technology', difficulty: 'easy', text: 'Google hangi yılda kuruldu?', optionA: '1996', optionB: '1998', optionC: '2000', correct: 1, hint: 'Larry Page ve Sergey Brin.' },
  { questionKey: 'te5', category: 'technology', difficulty: 'easy', text: 'Hangi şirket Android\'i geliştirmiştir?', optionA: 'Apple', optionB: 'Google', optionC: 'Microsoft', correct: 1, hint: 'Açık kaynak işletim sistemi.' },
  // ─── TECHNOLOGY MEDIUM ───
  { questionKey: 'tm1', category: 'technology', difficulty: 'medium', text: 'Moore Yasası neyi öngörür?', optionA: 'İnternet hızı 2 katına çıkar', optionB: 'Transistör sayısı 2 yılda ikiye katlanır', optionC: 'Batarya ömrü her yıl artar', correct: 1, hint: 'Gordon Moore, Intel.' },
  { questionKey: 'tm2', category: 'technology', difficulty: 'medium', text: 'Linux\'un yaratıcısı kimdir?', optionA: 'Richard Stallman', optionB: 'Linus Torvalds', optionC: 'Dennis Ritchie', correct: 1, hint: 'Finlandiyalı yazılımcı.' },
  { questionKey: 'tm3', category: 'technology', difficulty: 'medium', text: 'RAM ne tür bir bellektir?', optionA: 'Kalıcı', optionB: 'Geçici', optionC: 'Optik', correct: 1, hint: 'Bilgisayar kapanınca silinir.' },
  { questionKey: 'tm4', category: 'technology', difficulty: 'medium', text: 'DNS ne işe yarar?', optionA: 'Dosya aktarımı', optionB: 'Alan adını IP adresine çevirir', optionC: 'E-posta gönderir', correct: 1, hint: 'Domain Name System.' },
  { questionKey: 'tm5', category: 'technology', difficulty: 'medium', text: 'GitHub ne tür bir platformdur?', optionA: 'Sosyal medya', optionB: 'Kod barındırma', optionC: 'Bulut depolama', correct: 1, hint: 'Git tabanlı.' },
  // ─── TECHNOLOGY HARD ───
  { questionKey: 'th1', category: 'technology', difficulty: 'hard', text: 'Hangi algoritma asimetrik şifreleme kullanır?', optionA: 'AES', optionB: 'RSA', optionC: 'DES', correct: 1, hint: 'Açık/özel anahtar çifti.' },
  { questionKey: 'th2', category: 'technology', difficulty: 'hard', text: 'Hangi veri yapısı LIFO prensibine göre çalışır?', optionA: 'Queue', optionB: 'Stack', optionC: 'Linked List', correct: 1, hint: 'Last In First Out.' },
  { questionKey: 'th3', category: 'technology', difficulty: 'hard', text: 'Docker ne tür bir teknolojidir?', optionA: 'Sanal makine', optionB: 'Konteynerizasyon', optionC: 'Orkestrasyon', correct: 1, hint: 'Hafif izolasyon.' },
  { questionKey: 'th4', category: 'technology', difficulty: 'hard', text: 'Transformer mimarisi hangi alanda devrim yapmıştır?', optionA: 'Bilgisayar görüşü', optionB: 'Doğal dil işleme', optionC: 'Robotik', correct: 1, hint: 'Attention is All You Need, 2017.' },
  { questionKey: 'th5', category: 'technology', difficulty: 'hard', text: 'Kubernetes ne için kullanılır?', optionA: 'Frontend geliştirme', optionB: 'Konteyner orkestrasyonu', optionC: 'Veritabanı yönetimi', correct: 1, hint: 'Google tarafından geliştirildi, K8s.' },
];

const defaultQuestTemplates = [
  { questKey: 'win_1', questType: 'daily', title: '1 Maç Kazan', description: 'Bir maç kazan', target: 1, xpReward: 30, event: 'win', sortOrder: 1 },
  { questKey: 'win_3', questType: 'daily', title: '3 Maç Kazan', description: 'Üç maç kazan', target: 3, xpReward: 80, event: 'win', sortOrder: 2 },
  { questKey: 'play_3', questType: 'daily', title: '3 Maç Oyna', description: 'Üç maç tamamla', target: 3, xpReward: 40, event: 'match', sortOrder: 3 },
  { questKey: 'play_5', questType: 'daily', title: '5 Maç Oyna', description: 'Beş maç tamamla', target: 5, xpReward: 60, event: 'match', sortOrder: 4 },
  { questKey: 'correct_10', questType: 'daily', title: '10 Doğru Cevap', description: '10 soruyu doğru cevapla', target: 10, xpReward: 50, event: 'correct', sortOrder: 5 },
  { questKey: 'correct_20', questType: 'daily', title: '20 Doğru Cevap', description: '20 soruyu doğru cevapla', target: 20, xpReward: 70, event: 'correct', sortOrder: 6 },
  { questKey: 'streak_2', questType: 'daily', title: '2 Seri Galibiyet', description: 'Üst üste 2 maç kazan', target: 2, xpReward: 60, event: 'streak', sortOrder: 7 },
  { questKey: 'win_10', questType: 'weekly', title: '10 Maç Kazan', description: 'Bu hafta 10 maç kazan', target: 10, xpReward: 200, event: 'win', sortOrder: 1 },
  { questKey: 'play_15', questType: 'weekly', title: '15 Maç Oyna', description: 'Bu hafta 15 maç tamamla', target: 15, xpReward: 150, event: 'match', sortOrder: 2 },
  { questKey: 'correct_50', questType: 'weekly', title: '50 Doğru Cevap', description: 'Bu hafta 50 doğru cevap ver', target: 50, xpReward: 250, event: 'correct', sortOrder: 3 },
  { questKey: 'perfect_1', questType: 'weekly', title: 'Kusursuz Maç', description: 'Bir maçta tüm soruları doğru cevapla', target: 1, xpReward: 150, event: 'perfect', sortOrder: 4 },
  { questKey: 'streak_3', questType: 'weekly', title: '3 Seri Galibiyet', description: 'Üst üste 3 maç kazan', target: 3, xpReward: 180, event: 'streak', sortOrder: 5 },
];

const defaultSeasons = (() => {
  const base = new Date(2024, 0, 1); // 1 Ocak 2024
  const names = [
    'Sezon 1 - İlk Adım',
    'Sezon 2 - Yükseliş',
    'Sezon 3 - Bilgi Savaşçıları',
    'Sezon 4 - Zirveye Doğru',
    'Sezon 5 - Şampiyonlar Ligi',
    'Sezon 6 - Yaz Mevsimi',
    'Sezon 7 - Altın Çağ',
    'Sezon 8 - Efsaneler',
    'Sezon 9 - Sonbahar Şampiyonası',
    'Sezon 10 - Kış Kupası',
    'Sezon 11 - Yıl Sonu Şöleni',
    'Sezon 12 - Grand Final',
    'Sezon 13 - Yeni Yıl Şampiyonası',
    'Sezon 14 - Bilgi Fırtınası',
    'Sezon 15 - Üstatlar Arenası',
    'Sezon 16 - Bahar Kupası',
    'Sezon 17 - Zeka Oyunları',
    'Sezon 18 - Yaz Şampiyonası',
    'Sezon 19 - Kıran Kırana',
    'Sezon 20 - Efsaneler Zirvesi',
    'Sezon 21 - Sonbahar Arenası',
    'Sezon 22 - Kış Şampiyonası',
    'Sezon 23 - Yılın Şampiyonu',
  ];
  return names.map((name, i) => {
    const start = new Date(base);
    start.setMonth(start.getMonth() + i);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return { seasonNumber: i + 1, name, startDate: start, endDate: end, isActive: i === names.length - 1 };
  });
})();

const defaultFrames = [
  { key: 'frame_bronze', name: 'Bronz Çerçeve', unlockLevel: 5, colors: ['#CD7F32', '#8B5E3C'], style: 'gradient', sortOrder: 1 },
  { key: 'frame_silver', name: 'Gümüş Çerçeve', unlockLevel: 10, colors: ['#C0C0C0', '#808080'], style: 'gradient', sortOrder: 2 },
  { key: 'frame_gold', name: 'Altın Çerçeve', unlockLevel: 15, colors: ['#FFD700', '#FFA000'], style: 'gradient', sortOrder: 3 },
  { key: 'frame_diamond', name: 'Elmas Çerçeve', unlockLevel: 20, colors: ['#00E5FF', '#7C4DFF'], style: 'glow', sortOrder: 4 },
  { key: 'frame_legendary', name: 'Efsanevi Çerçeve', unlockLevel: 30, colors: ['#FF6D00', '#FF1744'], style: 'gradient', sortOrder: 5 },
];

const defaultAchievementRewards = [
  { achievementId: 'first_win', rewardType: 'coin', rewardValue: 25 },
  { achievementId: 'win_5', rewardType: 'coin', rewardValue: 20 },
  { achievementId: 'win_10', rewardType: 'coin', rewardValue: 30 },
  { achievementId: 'streak_3', rewardType: 'coin', rewardValue: 15 },
  { achievementId: 'streak_5', rewardType: 'coin', rewardValue: 40 },
  { achievementId: 'perfect', rewardType: 'coin', rewardValue: 50 },
  { achievementId: 'matches_20', rewardType: 'coin', rewardValue: 25 },
  { achievementId: 'matches_50', rewardType: 'coin', rewardValue: 60 },
  { achievementId: 'level_10', rewardType: 'coin', rewardValue: 50 },
  { achievementId: 'level_20', rewardType: 'coin', rewardValue: 75 },
  { achievementId: 'level_30', rewardType: 'coin', rewardValue: 100 },
  { achievementId: 'accuracy_80', rewardType: 'coin', rewardValue: 45 },
  { achievementId: 'streak_10', rewardType: 'fifty_fifty', rewardValue: 1 },
  { achievementId: 'win_25', rewardType: 'coin', rewardValue: 40 },
  { achievementId: 'win_50', rewardType: 'double_points', rewardValue: 1 },
  { achievementId: 'matches_100', rewardType: 'coin', rewardValue: 100 },
  { achievementId: 'no_abandon', rewardType: 'coin', rewardValue: 75 },
];

const defaultShopItems = [
  { itemKey: 'fifty_fifty', name: '%50 Eleme', description: '2 yanlış şıkkı eler', price: 80, userField: 'ownedFiftyFifty' },
  { itemKey: 'time_freeze', name: 'Ek Süre', description: '+10 saniye ekstra süre', price: 60, userField: 'ownedTimeFreeze' },
  { itemKey: 'double_points', name: 'Çift Puan', description: 'Doğru cevapta 2x skor', price: 100, userField: 'ownedDoublePoints' },
  { itemKey: 'hint', name: 'İpucu', description: 'Soru ipucu gösterir', price: 50, userField: 'ownedHint' },
  { itemKey: 'bundle', name: 'Joker Paketi', description: 'Her birinden 1 adet (4 joker)', price: 250, userField: null },
];

async function seedDatabase() {
  const qCount = await Question.count();
  if (qCount === 0) {
    console.log('Sorular veritabanına yazılıyor...');
    await Question.bulkCreate(seedQuestions);
    console.log(`${seedQuestions.length} soru başarıyla eklendi.`);
  }

  const shopCount = await ShopItem.count();
  if (shopCount === 0) {
    console.log('Mağaza ürünleri yazılıyor...');
    await ShopItem.bulkCreate(defaultShopItems.map((i) => ({ ...i, isActive: true })));
    console.log(`${defaultShopItems.length} mağaza ürünü eklendi.`);
  }

  const questTplCount = await QuestTemplate.count();
  if (questTplCount === 0) {
    console.log('Görev şablonları yazılıyor...');
    await QuestTemplate.bulkCreate(defaultQuestTemplates.map((t) => ({ ...t, isActive: true })));
    console.log(`${defaultQuestTemplates.length} görev şablonu eklendi.`);
  }

  const seasonCount = await Season.count();
  if (seasonCount === 0) {
    console.log('Sezonlar yazılıyor...');
    await Season.bulkCreate(defaultSeasons.map((s) => ({ ...s, isActive: s.isActive })));
    console.log(`${defaultSeasons.length} sezon eklendi.`);
  }

  const frameCount = await CosmeticFrame.count();
  if (frameCount === 0) {
    console.log('Çerçeveler yazılıyor...');
    await CosmeticFrame.bulkCreate(defaultFrames);
    console.log(`${defaultFrames.length} çerçeve eklendi.`);
  }

  const rewardCount = await AchievementReward.count();
  if (rewardCount === 0) {
    console.log('Başarım ödülleri yazılıyor...');
    await AchievementReward.bulkCreate(defaultAchievementRewards);
    console.log(`${defaultAchievementRewards.length} başarım ödülü eklendi.`);
  }
}

module.exports = { seedDatabase, defaultQuestTemplates, defaultShopItems, defaultSeasons, defaultFrames, defaultAchievementRewards };
