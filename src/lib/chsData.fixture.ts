/** Testdata voor chsData/chsCatalog (geen app-code). */

/** Kaartregel zoals in PTCG-CHS-Datasets (ptcg_chs_infos.json), alleen de velden die we gebruiken. */
export function chsRow(o: { name: string; number: string; rarity: string; dex?: string; attribute?: string; cardType?: string; image: string; illustrator?: string }): unknown {
  return {
    name: o.name,
    cardType: o.cardType ?? '1',
    image: o.image,
    details: {
      cardName: o.name,
      collectionNumber: o.number,
      rarityText: o.rarity,
      cardType: o.cardType ?? '1',
      attribute: o.attribute ?? '5',
      ...(o.dex ? { pokedexCode: o.dex } : {}),
      illustratorName: [o.illustrator ?? 'Kariya'],
    },
  }
}

/** Kleine nabootsing van de echte dataset (gecontroleerd 20-10-2026): CSV9.5C en Gem Pack Vol. 4. */
export const CHS_FIXTURE = {
  dict: {},
  collections: [
    {
      commodityCode: 'CSV9.5C',
      name: '补充包 太晶盛聚',
      salesDate: '2026-06-12',
      cards: [
        chsRow({ name: '斯魔茶', number: '019/208', rarity: 'C', dex: '1012', attribute: '1', image: 'img/482/50.png' }),
        chsRow({ name: '斯魔茶', number: '019/208', rarity: 'C★', dex: '1012', attribute: '1', image: 'img/482/51.png' }),
        chsRow({ name: '凯西', number: '062/208', rarity: 'C', dex: '0063', image: 'img/482/155.png' }),
        chsRow({ name: '凯西', number: '062/208', rarity: 'C★★', dex: '0063', image: 'img/482/157.png' }),
        chsRow({ name: '太阳伊布', number: '067/208', rarity: 'U', dex: '0196', image: 'img/482/170.png' }),
        chsRow({ name: '太阳伊布ex', number: '068/208', rarity: 'RR', image: 'img/482/173.png' }),
        chsRow({ name: '紧急滑板', number: '173/208', rarity: 'U', cardType: '2', image: 'img/482/448.png' }),
        chsRow({ name: '紧急滑板', number: '173/208', rarity: 'U★', cardType: '2', image: 'img/482/449.png' }),
        chsRow({ name: '能量', number: 'SV-P', rarity: '无标记', cardType: '3', image: 'img/482/999.png' }),
      ],
    },
    {
      commodityCode: 'CBB4C',
      name: '宝石包 Vol.4',
      salesDate: '2025-09-01',
      cards: [
        chsRow({ name: '泡沫栗鼠', number: '15 02/07', rarity: '●', dex: '0572', attribute: '11', image: 'img/339/99.png' }),
        chsRow({ name: '泡沫栗鼠', number: '15 05/07', rarity: '★', dex: '0572', attribute: '11', image: 'img/339/102.png' }),
      ],
    },
    { commodityCode: 'LEEG', name: 'Zonder kaarten', cards: [] },
  ],
}
