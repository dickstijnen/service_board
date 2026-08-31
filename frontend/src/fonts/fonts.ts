import localFont from "next/font/local";
import { Public_Sans, LINE_Seed_JP } from "next/font/google";

// LINE Seed JP — primair websitefont (BODY). Latin-subset, weights 400/700/800.
export const lineSeed = LINE_Seed_JP({
    weight: ["400", "700", "800"],
    subsets: ["latin"],
    variable: "--font-line-seed",
    display: "optional",
    fallback: ["system-ui", "sans-serif"],
});

// PP Mori — Regular + Italic (HEADINGS, often italic)
export const mori = localFont({
    src: [
        { path: "./PPMori-Regular.woff2", weight: "400", style: "normal" },
        { path: "./PPMori-Regular.woff", weight: "400", style: "normal" },
        { path: "./PPMori-Italic.woff2", weight: "400", style: "italic" },
        { path: "./PPMori-Italic.woff", weight: "400", style: "italic" },
    ],
    variable: "--font-mori",
    display: "optional",
    fallback: ["system-ui", "sans-serif"],
});

// PP Fraktion Mono — Bold (EYEBROWS / side labels)
export const fraktionMono = localFont({
    src: [
        { path: "./PPFraktionMono-Bold.woff2", weight: "700", style: "normal" },
        { path: "./PPFraktionMono-Bold.woff", weight: "700", style: "normal" },
    ],
    variable: "--font-fraktion-mono",
    display: "optional",
    fallback: ["ui-monospace", "monospace"],
});

// Public Sans — variable (BODY copy), self-hosted via next/font/google
export const publicSans = Public_Sans({
    subsets: ["latin"],
    style: ["normal", "italic"],
    variable: "--font-public-sans",
    display: "optional",
});
