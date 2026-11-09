import { Cairo, Inter, Merriweather, Montserrat, Noto_Serif, Nunito, Oswald, Playfair_Display, Poppins, Raleway, Roboto_Slab, Tajawal } from "next/font/google";

/**
 * Poster fonts for the browser preview. Imported only by the poster maker and
 * the brand kit editor, so other pages never download them; preload is off for
 * the same reason. Each sets the CSS variable that BRAND_FONTS[*].stack names.
 * Manrope, Lexend and Noto Sans Arabic come from the root layout.
 */
const poppins = Poppins({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-poster-poppins", display: "swap", preload: false });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-poster-montserrat", display: "swap", preload: false });
const inter = Inter({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-poster-inter", display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-poster-nunito", display: "swap", preload: false });
const raleway = Raleway({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-poster-raleway", display: "swap", preload: false });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-poster-oswald", display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-poster-playfair", display: "swap", preload: false });
const notoSerif = Noto_Serif({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-poster-noto-serif", display: "swap", preload: false });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-poster-merriweather", display: "swap", preload: false });
const robotoSlab = Roboto_Slab({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-poster-roboto-slab", display: "swap", preload: false });
const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["600", "700", "800"], variable: "--font-poster-cairo", display: "swap", preload: false });
const tajawal = Tajawal({ subsets: ["arabic", "latin"], weight: ["500", "700", "800"], variable: "--font-poster-tajawal", display: "swap", preload: false });

/** Put on any element that shows a poster or a font picker (including portalled menus). */
export const POSTER_FONT_VARIABLES = [poppins, montserrat, inter, nunito, raleway, oswald, playfair, notoSerif, merriweather, robotoSlab, cairo, tajawal]
  .map((font) => font.variable)
  .join(" ");
