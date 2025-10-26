================================================
FILE: README.md
================================================
This is a template for a whop app built in NextJS. Fork it and keep the parts you need for your app.

# Whop NextJS App Template

To run this project:

1. Install dependencies with: `pnpm i`

2. Create a Whop App on your [whop developer dashboard](https://whop.com/dashboard/developer/), then go to the "Hosting" section and:
	- Ensure the "Base URL" is set to the domain you intend to deploy the site on.
	- Ensure the "App path" is set to `/experiences/[experienceId]`
	- Ensure the "Dashboard path" is set to `/dashboard/[companyId]`
	- Ensure the "Discover path" is set to `/discover`

3. Copy the environment variables from the `.env.development` into a `.env.local`. Ensure to use real values from the whop dashboard.

4. Go to a whop created in the same org as the app you created. Navigate to the tools section and add your app.

5. Run `pnpm dev` to start the dev server. Then in the top right of the window find a translucent settings icon. Select "localhost". The default port 3000 should work.

## Deploying

1. Upload your fork / copy of this template to github.

2. Go to [Vercel](https://vercel.com/new) and link the repository. Deploy your application with the environment variables from your `.env.local`

3. If necessary update you "Base Domain" and webhook callback urls on the app settings page on the whop dashboard.

## Troubleshooting

**App not loading properly?** Make sure to set the "App path" in your Whop developer dashboard. The placeholder text in the UI does not mean it's set - you must explicitly enter `/experiences/[experienceId]` (or your chosen path name)
a

**Make sure to add env.local** Make sure to get the real app environment vairables from your whop dashboard and set them in .env.local


For more info, see our docs at https://dev.whop.com/introduction



================================================
FILE: biome.json
================================================
{
	"$schema": "https://biomejs.dev/schemas/2.2.6/schema.json",
	"vcs": {
		"enabled": false,
		"clientKind": "git",
		"useIgnoreFile": false
	},
	"files": {
		"ignoreUnknown": true,
		"includes": ["*", "!.next"]
	},
	"formatter": {
		"enabled": true,
		"indentStyle": "tab"
	},
	"linter": {
		"enabled": true,
		"rules": {
			"recommended": true
		}
	},
	"javascript": {
		"formatter": {
			"quoteStyle": "double"
		}
	},
	"assist": {
		"actions": {
			"source": {
				"organizeImports": "on"
			}
		}
	}
}



================================================
FILE: next.config.ts
================================================
import { withWhopAppConfig } from "@whop/react/next.config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [{ hostname: "**" }],
  },
};

export default withWhopAppConfig(nextConfig);



================================================
FILE: package.json
================================================
{
	"name": "whop-nextjs-app-template",
	"version": "0.2.0",
	"private": true,
	"scripts": {
		"dev": "whop-proxy --command 'next dev --turbopack'",
		"build": "next build",
		"start": "next start",
		"lint": "biome lint"
	},
	"dependencies": {
		"@vercel/functions": "^3.1.4",
		"@whop/react": "0.3.0",
		"@whop/sdk": "0.0.2",
		"next": "16.0.0",
		"react": "19.2.0",
		"react-dom": "19.2.0"
	},
	"devDependencies": {
		"@biomejs/biome": "2.2.6",
		"@tailwindcss/postcss": "^4.1.14",
		"@types/node": "^20.19.21",
		"@types/react": "19.2.2",
		"@types/react-dom": "19.2.2",
		"@whop-apps/dev-proxy": "0.0.1-canary.117",
		"dotenv-cli": "^10.0.0",
		"tailwindcss": "^4.1.14",
		"typescript": "^5.9.3"
	},
	"packageManager": "pnpm@9.15.9+sha512.68046141893c66fad01c079231128e9afb89ef87e2691d69e4d40eee228988295fd4682181bae55b58418c3a253bde65a505ec7c5f9403ece5cc3cd37dcf2531",
	"pnpm": {
		"overrides": {
			"@types/react": "19.2.2",
			"@types/react-dom": "19.2.2"
		}
	}
}



================================================
FILE: postcss.config.mjs
================================================
const config = {
	plugins: ["@tailwindcss/postcss"],
};

export default config;



================================================
FILE: tailwind.config.ts
================================================
import { frostedThemePlugin } from "@whop/react/tailwind";

export default { plugins: [frostedThemePlugin()] };



================================================
FILE: tsconfig.json
================================================
{
	"compilerOptions": {
		"target": "ES2022",
		"lib": ["dom", "dom.iterable", "esnext"],
		"allowJs": true,
		"skipLibCheck": true,
		"strict": true,
		"noEmit": true,
		"esModuleInterop": true,
		"module": "esnext",
		"moduleResolution": "bundler",
		"resolveJsonModule": true,
		"isolatedModules": true,
		"jsx": "react-jsx",
		"incremental": true,
		"plugins": [
			{
				"name": "next"
			}
		],
		"paths": {
			"@/*": ["./*"]
		}
	},
	"include": [
		"next-env.d.ts",
		"**/*.ts",
		"**/*.tsx",
		".next/types/**/*.ts",
		".next/dev/types/**/*.ts"
	],
	"exclude": ["node_modules"]
}



================================================
FILE: .env.development
================================================
WHOP_API_KEY="get_this_from_the_whop_com_dashboard_under_apps"
WHOP_WEBHOOK_SECRET="get_this_after_creating_a_webhook_in_the_app_settings_screen"
NEXT_PUBLIC_WHOP_APP_ID="use_the_corresponding_app_id_to_the_secret_api_key"



================================================
FILE: app/globals.css
================================================
@layer theme, base, frosted_ui, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css" layer(utilities);
@import "@whop/react/styles.css" layer(frosted_ui);

/* biome-ignore lint/suspicious/noUnknownAtRules: this rule is imported from whop */
@config '../tailwind.config.ts';

body {
	background: var(--background);
	color: var(--foreground);
	font-family: Arial, Helvetica, sans-serif;
}



================================================
FILE: app/layout.tsx
================================================
import { WhopApp } from "@whop/react/components";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Whop App",
	description: "My Whop App",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<WhopApp>{children}</WhopApp>
			</body>
		</html>
	);
}



================================================
FILE: app/page.tsx
================================================
import { Button } from "@whop/react/components";
import Link from "next/link";

export default function Page() {
	return (
		<div className="py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-2xl mx-auto rounded-3xl bg-gray-a2 p-4 border border-gray-a4">
				<div className="text-center mt-8 mb-12">
					<h1 className="text-8 font-bold text-gray-12 mb-4">
						Welcome to Your Whop App
					</h1>
					<p className="text-4 text-gray-10">
						Learn how to build your application on our docs
					</p>
				</div>

				<div className="justify-center flex w-full">
					<Link
						href="https://docs.whop.com/apps"
						className="w-full"
						target="_blank"
					>
						<Button variant="classic" className="w-full" size="4">
							Developer Docs
						</Button>
					</Link>
				</div>
			</div>
		</div>
	);
}



================================================
FILE: app/api/webhooks/route.ts
================================================
import { waitUntil } from "@vercel/functions";
import type { Invoice } from "@whop/sdk/resources.js";
import type { NextRequest } from "next/server";
import { whopsdk } from "@/lib/whop-sdk";

export async function POST(request: NextRequest): Promise<Response> {
	// Validate the webhook to ensure it's from Whop
	const requestBodyText = await request.text();
	const headers = Object.fromEntries(request.headers);
	const webhookData = whopsdk.webhooks.unwrap(requestBodyText, { headers });

	// Handle the webhook event
	if (webhookData.type === "invoice.paid") {
		waitUntil(handleInvoicePaid(webhookData.data));
	}

	if (webhookData.type === "invoice.created") {
		waitUntil(handleInvoiceCreated(webhookData.data));
	}

	// Make sure to return a 2xx status code quickly. Otherwise the webhook will be retried.
	return new Response("OK", { status: 200 });
}

async function handleInvoicePaid(invoice: Invoice) {
	// This is a placeholder for a potentially long running operation
	// In a real scenario, you might need to fetch user data, update a database, etc.
	console.log("[INVOICE PAID]", invoice);
}

async function handleInvoiceCreated(invoice: Invoice) {
	// This is a placeholder for a potentially long running operation
	// In a real scenario, you might need to fetch user data, update a database, etc.
	console.log("[INVOICE CREATED]", invoice);
}



================================================
FILE: app/dashboard/[companyId]/page.tsx
================================================
import { Button } from "@whop/react/components";
import { headers } from "next/headers";
import Link from "next/link";
import { whopsdk } from "@/lib/whop-sdk";

export default async function DashboardPage({
	params,
}: {
	params: Promise<{ companyId: string }>;
}) {
	const { companyId } = await params;
	// Ensure the user is logged in on whop.
	const { userId } = await whopsdk.verifyUserToken(await headers());

	// Fetch the neccessary data we want from whop.
	const [company, user, access] = await Promise.all([
		whopsdk.companies.retrieve(companyId),
		whopsdk.users.retrieve(userId),
		whopsdk.users.checkAccess(companyId, { id: userId }),
	]);

	const displayName = user.name || `@${user.username}`;

	return (
		<div className="flex flex-col p-8 gap-4">
			<div className="flex justify-between items-center gap-4">
				<h1 className="text-9">
					Hi <strong>{displayName}</strong>!
				</h1>
				<Link href="https://docs.whop.com/apps" target="_blank">
					<Button variant="classic" className="w-full" size="3">
						Developer Docs
					</Button>
				</Link>
			</div>

			<p className="text-3 text-gray-10">
				Welcome to you whop app! Replace this template with your own app. To
				get you started, here's some helpful data you can fetch from whop.
			</p>

			<h3 className="text-6 font-bold">Company data</h3>
			<JsonViewer data={company} />

			<h3 className="text-6 font-bold">User data</h3>
			<JsonViewer data={user} />

			<h3 className="text-6 font-bold">Access data</h3>
			<JsonViewer data={access} />
		</div>
	);
}

function JsonViewer({ data }: { data: any }) {
	return (
		<pre className="text-2 border border-gray-a4 rounded-lg p-4 bg-gray-a2 max-h-72 overflow-y-auto">
			<code className="text-gray-10">{JSON.stringify(data, null, 2)}</code>
		</pre>
	);
}



================================================
FILE: app/discover/page.tsx
================================================
export default function DiscoverPage() {
	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
			<div className="max-w-4xl mx-auto px-4 py-16">
				{/* Title */}
				<h1 className="text-5xl font-bold text-gray-900 mb-6 text-center">
					Discover your app
				</h1>
				{/* Main Description Card */}
				<div className="bg-white rounded-xl p-8 shadow-md text-center mb-16">
					<p className="text-xl text-gray-600 max-w-2xl mx-auto mb-4">
						This is your app's discover page—showcase what your app does
						and how it helps creators.
					</p>
					<p className="text-base text-gray-500 max-w-2xl mx-auto mb-2">
						Share real success stories, link to thriving Whop communities
						using your app, and add referral links to earn affiliate fees
						when people install your app.
					</p>
					<p className="text-sm text-gray-400 max-w-2xl mx-auto">
						💡 <strong>Tip:</strong> Clearly explain your app's value
						proposition and how it helps creators make money or grow their
						communities.
					</p>
				</div>

				{/* Pro Tips Section */}
				<div className="grid md:grid-cols-2 gap-6 mb-10">
					<div className="bg-white rounded-xl p-6 shadow-md flex flex-col gap-2">
						<h3 className="font-semibold text-gray-900">
							Showcase Real Success
						</h3>
						<p className="text-sm text-gray-600">
							Link to real Whop communities using your app, with revenue
							and member stats.
						</p>
					</div>
					<div className="bg-white rounded-xl p-6 shadow-md flex flex-col gap-2">
						<h3 className="font-semibold text-gray-900">
							Include Referral Links
						</h3>
						<p className="text-sm text-gray-600">
							Add <code>?a=your_app_id</code> to Whop links to earn
							affiliate commissions.
						</p>
					</div>
				</div>

				<h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
					Examples of Success Stories
				</h2>

				{/* Main Content Cards */}
				<div className="grid md:grid-cols-2 gap-6">
					{/* Success Story Card 1 */}
					<div className="bg-white rounded-xl p-6 shadow-md flex flex-col justify-between">
						<div>
							<h3 className="text-lg font-bold text-gray-900 mb-1">
								CryptoKings
							</h3>
							<p className="text-xs text-gray-500 mb-2">
								Trading Community
							</p>
							<p className="text-gray-700 mb-4 text-sm">
								"Grew to{" "}
								<span className="font-bold text-blue-600">
									2,500+ members
								</span>{" "}
								and{" "}
								<span className="font-bold text-blue-600">
									$18,000+/mo
								</span>{" "}
								with automated signals. Members love the real-time
								alerts!"
							</p>
						</div>
						<a
							href="https://whop.com/cryptokings/?a=your_app_id"
							className="mt-auto block w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-center text-sm"
						>
							Visit CryptoKings
						</a>
					</div>

					{/* Success Story Card 2 */}
					<div className="bg-white rounded-xl p-6 shadow-md flex flex-col justify-between">
						<div>
							<h3 className="text-lg font-bold text-gray-900 mb-1">
								SignalPro
							</h3>
							<p className="text-xs text-gray-500 mb-2">
								Premium Signals
							</p>
							<p className="text-gray-700 mb-4 text-sm">
								"Retention jumped to{" "}
								<span className="font-bold text-blue-600">92%</span>.
								Affiliate program brought in{" "}
								<span className="font-bold text-blue-600">$4,000+</span>{" "}
								last quarter."
							</p>
						</div>
						<a
							href="https://whop.com/signalpro/?app=your_app_id"
							className="mt-auto block w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-center text-sm"
						>
							Visit SignalPro
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}



================================================
FILE: app/experiences/[experienceId]/page.tsx
================================================
import { Button } from "@whop/react/components";
import { headers } from "next/headers";
import Link from "next/link";
import { whopsdk } from "@/lib/whop-sdk";

export default async function ExperiencePage({
	params,
}: {
	params: Promise<{ experienceId: string }>;
}) {
	const { experienceId } = await params;
	// Ensure the user is logged in on whop.
	const { userId } = await whopsdk.verifyUserToken(await headers());

	// Fetch the neccessary data we want from whop.
	const [experience, user, access] = await Promise.all([
		whopsdk.experiences.retrieve(experienceId),
		whopsdk.users.retrieve(userId),
		whopsdk.users.checkAccess(experienceId, { id: userId }),
	]);

	const displayName = user.name || `@${user.username}`;

	return (
		<div className="flex flex-col p-8 gap-4">
			<div className="flex justify-between items-center gap-4">
				<h1 className="text-9">
					Hi <strong>{displayName}</strong>!
				</h1>
				<Link href="https://docs.whop.com/apps" target="_blank">
					<Button variant="classic" className="w-full" size="3">
						Developer Docs
					</Button>
				</Link>
			</div>

			<p className="text-3 text-gray-10">
				Welcome to you whop app! Replace this template with your own app. To
				get you started, here's some helpful data you can fetch from whop.
			</p>

			<h3 className="text-6 font-bold">Experience data</h3>
			<JsonViewer data={experience} />

			<h3 className="text-6 font-bold">User data</h3>
			<JsonViewer data={user} />

			<h3 className="text-6 font-bold">Access data</h3>
			<JsonViewer data={access} />
		</div>
	);
}

function JsonViewer({ data }: { data: any }) {
	return (
		<pre className="text-2 border border-gray-a4 rounded-lg p-4 bg-gray-a2 max-h-72 overflow-y-auto">
			<code className="text-gray-10">{JSON.stringify(data, null, 2)}</code>
		</pre>
	);
}



================================================
FILE: lib/whop-sdk.ts
================================================
import { Whop } from "@whop/sdk";

export const whopsdk = new Whop({
	appID: process.env.NEXT_PUBLIC_WHOP_APP_ID,
	apiKey: process.env.WHOP_API_KEY,
	webhookKey: btoa(process.env.WHOP_WEBHOOK_SECRET || ""),
});



================================================
FILE: .zed/settings.json
================================================
{
	"code_actions_on_format": {
		"source.fixAll.biome": true,
		"source.action.useSortedKeys.biome": true
	},
	"tab_size": 3,
	"hard_tabs": true
}


