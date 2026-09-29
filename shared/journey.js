// "Journey across Kazakhstan": 10 cities from Astana to the Caspian.
// Each city has its own arena (landmark) — none of them overlap with the Pro arenas.
export const CITIES = [
  { id: 'astana', lon: 71.43, lat: 51.13, name: { ru: 'Астана', kk: 'Астана', en: 'Astana' },
    sight: { ru: 'Хан Шатыр — гигантский шатёр-торговый центр', kk: 'Хан Шатыр — алып шатыр-сауда орталығы', en: 'Khan Shatyr — a giant tent-shaped mall' } },
  { id: 'karaganda', lon: 73.1, lat: 49.8, name: { ru: 'Караганда', kk: 'Қарағанды', en: 'Karaganda' },
    sight: { ru: 'Терриконы и шахтные копры — город угля', kk: 'Террикондар мен шахта копрлары — көмір қаласы', en: 'Spoil heaps and mine headframes — the coal city' } },
  { id: 'balkhash', lon: 74.99, lat: 46.85, name: { ru: 'Балхаш', kk: 'Балқаш', en: 'Balkhash' },
    sight: { ru: 'Озеро: одна половина пресная, другая — солёная', kk: 'Көл: бір жартысы тұщы, екіншісі — тұзды', en: 'A lake that is half fresh, half salty' } },
  { id: 'almaty', lon: 76.9, lat: 43.24, name: { ru: 'Алматы', kk: 'Алматы', en: 'Almaty' },
    sight: { ru: 'Телебашня Кок-Тобе и яблоневые сады апорта', kk: 'Көктөбе телемұнарасы және апорт алма бақтары', en: 'Kok-Tobe TV tower and aport apple orchards' } },
  { id: 'taraz', lon: 71.37, lat: 42.9, name: { ru: 'Тараз', kk: 'Тараз', en: 'Taraz' },
    sight: { ru: 'Мавзолей Айша-Биби — кружево из обожжённого кирпича', kk: 'Айша бибі кесенесі — күйдірілген кірпіштен өрілген өрнек', en: 'Aisha Bibi mausoleum — lace of fired brick' } },
  { id: 'turkestan', lon: 68.25, lat: 43.3, name: { ru: 'Туркестан', kk: 'Түркістан', en: 'Turkistan' },
    sight: { ru: 'Мавзолей Ходжи Ахмеда Ясави с бирюзовым куполом', kk: 'Көгілдір күмбезді Қожа Ахмет Ясауи кесенесі', en: 'Khoja Ahmed Yasawi mausoleum with its turquoise dome' } },
  { id: 'baikonur', lon: 63.3, lat: 45.62, name: { ru: 'Байконур', kk: 'Байқоңыр', en: 'Baikonur' },
    sight: { ru: 'Космодром: отсюда стартовал Гагарин', kk: 'Ғарыш айлағы: Гагарин осы жерден ұшқан', en: 'The cosmodrome Gagarin launched from' } },
  { id: 'aralsk', lon: 61.67, lat: 46.8, name: { ru: 'Аральск', kk: 'Арал', en: 'Aralsk' },
    sight: { ru: 'Кладбище кораблей на дне ушедшего моря', kk: 'Тартылған теңіз түбіндегі кемелер зираты', en: 'A ship graveyard on the bed of a vanished sea' } },
  { id: 'atyrau', lon: 51.92, lat: 47.1, name: { ru: 'Атырау', kk: 'Атырау', en: 'Atyrau' },
    sight: { ru: 'Мост через Урал: один берег в Европе, другой в Азии', kk: 'Жайық көпірі: бір жағалауы Еуропада, екіншісі Азияда', en: 'A bridge over the Ural: one bank in Europe, one in Asia' } },
  { id: 'aktau', lon: 51.2, lat: 43.65, name: { ru: 'Актау', kk: 'Ақтау', en: 'Aktau' },
    sight: { ru: 'Белые скалы над Каспийским морем', kk: 'Каспий теңізі үстіндегі ақ жартастар', en: 'White cliffs above the Caspian Sea' } }
];

export const JOURNEY_LEVEL = 'normal';
export const cityTheme = (i) => 'city-' + CITIES[i].id;
