#!/usr/bin/env node

// Test script for valid webhook signature
const crypto = require("crypto");
const http = require("http");

const WEBHOOK_SECRET =
	process.env.WHOP_WEBHOOK_SECRET || "whsec_test_secret_123";
const WEBHOOK_URL = "http://localhost:3000/api/webhooks/whop";

const payload = {
	type: "payment_failed",
	data: {
		membership: {
			id: "mem_test_" + Date.now(),
			user_id: "usr_test_" + Date.now(),
			product_id: "prod_test_123",
		},
		payment: {
			id: "pay_test_" + Date.now(),
			amount: 999,
			currency: "usd",
			status: "failed",
			failure_reason: "card_declined",
		},
	},
	whop_event_id: "evt_test_" + Date.now(),
};

const payloadString = JSON.stringify(payload);
const signature =
	"sha256=" +
	crypto
		.createHmac("sha256", WEBHOOK_SECRET)
		.update(payloadString)
		.digest("hex");

const options = {
	hostname: "localhost",
	port: 3000,
	path: "/api/webhooks/whop",
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		"x-whop-signature": signature,
		"Content-Length": Buffer.byteLength(payloadString),
	},
};

console.log("🧪 Testing Valid Webhook Signature");
console.log("===================================");
console.log(`Webhook URL: ${WEBHOOK_URL}`);
console.log(`Event ID: ${payload.whop_event_id}`);
console.log(`Membership ID: ${payload.data.membership.id}`);

const req = http.request(options, (res) => {
	console.log(`Status: ${res.statusCode}`);
	console.log(`Headers:`, res.headers);

	let data = "";
	res.on("data", (chunk) => {
		data += chunk;
	});

	res.on("end", () => {
		try {
			const response = JSON.parse(data);
			console.log("Response:", response);

			if (res.statusCode === 200 && response.success) {
				console.log("✅ VALID WEBHOOK ACCEPTED");
			} else {
				console.log("❌ WEBHOOK REJECTED");
			}
		} catch (e) {
			console.log("Raw response:", data);
			console.log("❌ INVALID JSON RESPONSE");
		}
	});
});

req.on("error", (e) => {
	console.error("❌ REQUEST ERROR:", e.message);
});

req.write(payloadString);
req.end();
