import type { Config } from "tailwindcss";

const config: Config = {
	theme: {
		extend: {
			colors: {
				// Neutral gray scale (clean, minimal)
				gray: {
					50: "#fafafa",
					100: "#f4f4f5",
					200: "#e4e4e7",
					300: "#d4d4d8",
					400: "#a1a1aa",
					500: "#71717a",
					600: "#52525b",
					700: "#3f3f46",
					800: "#27272a",
					900: "#18181b",
					950: "#09090b",
				},
				// Red-orange accent (shifted from orange)
				accent: {
					50: "#fff4ed",
					100: "#ffe4d4",
					200: "#fec9a9",
					300: "#fdab77",
					400: "#fa8744",
					500: "#ea580c", // Primary red-orange
					600: "#cb4509",
					700: "#a3350a",
					800: "#832b0d",
					900: "#6b260f",
				},
				// Semantic colors
				success: {
					50: "#f0fdf4",
					100: "#dcfce7",
					200: "#bbf7d0",
					300: "#86efac",
					400: "#4ade80",
					500: "#22c55e",
					600: "#16a34a",
					700: "#15803d",
					800: "#166534",
					900: "#14532d",
				},
				warning: {
					50: "#fffbeb",
					100: "#fef3c7",
					200: "#fde68a",
					300: "#fcd34d",
					400: "#fbbf24",
					500: "#f59e0b",
					600: "#d97706",
					700: "#b45309",
					800: "#92400e",
					900: "#78350f",
				},
				danger: {
					50: "#fef2f2",
					100: "#fee2e2",
					200: "#fecaca",
					300: "#fca5a5",
					400: "#f87171",
					500: "#ef4444",
					600: "#dc2626",
					700: "#b91c1c",
					800: "#991b1b",
					900: "#7f1d1d",
				},
			},
			fontFamily: {
				sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
				heading: ["var(--font-space-grotesk)", "system-ui", "-apple-system", "sans-serif"],
				mono: ["ui-monospace", "monospace"],
			},
			borderRadius: {
				lg: "0.5rem",
				md: "0.375rem",
				sm: "0.25rem",
			},
		},
	},
};

export default config;
