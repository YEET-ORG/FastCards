/** Branded logos for known merchants — bundled PNGs shown in the icon
 * circle. Unknown merchants keep the category icon. */
export type MerchantBrand = { logo: number };

export const MERCHANT_BRANDS: Record<string, MerchantBrand> = {
  Swiggy: { logo: require('../../../assets/merchants/swiggy.png') },
  Zomato: { logo: require('../../../assets/merchants/zomato.png') },
  Amazon: { logo: require('../../../assets/merchants/amazon.png') },
  Netflix: { logo: require('../../../assets/merchants/netflix.png') },
  'BMTC Transit': { logo: require('../../../assets/merchants/bmtc.png') },
  Blinkit: { logo: require('../../../assets/blinkit.png') },
  Steam: { logo: require('../../../assets/merchants/steam.png') },
  Zara: { logo: require('../../../assets/merchants/zara.png') },
  Nike: { logo: require('../../../assets/merchants/nike.png') },
};
