var express = require("express");
var router = express.Router();

// dotenvから環境変数を取得するためのインスタンスを作成
const env = require("dotenv").config({ path: "./.env" });

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const logger = require("../logger");

/* GET home page. */
router.get("/", function (req, res, next) {
	res.render("index", { title: "stripe-test" });
});

router.post("/api/payment", async function (req, res, next) {
	logger.info("ルータメソッドの処理を開始します. リクエスト : ", req.body);

	const { paymentMethodId, paymentIntentId, items, currency, useStripeSdk } =
		req.body;

	const total = calculateAmount(req.body.items);

	try {
		let intent;
		// 全てのリクエスト内容にpaymentMethodIdが含まれる場合を想定している
		if (paymentMethodId) {
			// amountをtotalに設定してstripeへのリクエストを再作成する
			const request = {
				amount: total,
				currency: currency,
				payment_method: paymentMethodId,
				confirmation_method: "manual",
				confirm: true,
				use_stripe_sdk: useStripeSdk,
			};

			logger.info("Stripe APIを呼び出します. リクエスト : ", request);

			// stripe APIにpaymentIntentsインスタンス作成のリクエストを送る
			// PaymentIntentはstripeAPI側で支払いに関する情報を管理
			// また作成されたPaymentIntentをレスポンスとして受け取る
			intent = await stripe.paymentIntents.create(request);
			logger.info("Stripe APIを呼び出しました. レスポンス : ", intent);
		} else if (paymentIntentId) {
			intent = await stripe.paymentIntents.confirm(paymentIntentId);
		}

		// フロントに返す内容
		// 決済情報を登録した際の処理結果
		const response = generateResponse(intent);

		logger.info("ルータメソッドの処理を終了します. レスポンス : ", response);

		// resはミドルウェア関数,sendメソッドでおそらくフロントへレスポンスを返す
		res.send(response);
	} catch (e) {
		logger.error("ルータメソッドの処理中にエラーが発生しました : ", e);
		const response = generateErrorResponse(e.message);

		res.status(500);
		res.send(response);
	}
});

function calculateAmount(items) {
	let total = 0;
	for (let i = 0; i < items.length; i++) {
		const current = items[i].amount * items[i].quantity;
		total += current;
	}

	return total;
}

// intentとして受け取ったPaymentIntentインスタンスのstatusから決済情報を登録した際の処理結果を参照する
function generateResponse(paymentIntent) {
	let response = {
		requiresAction: false,
		clientSecret: "",
		paymentIntentStatus: "",
	};

	switch (paymentIntent.status) {
		case "requires_action":
			response.paymentIntentStatus = "requires_action";
			break;
		case "requires_source_action":
			response.paymentIntentStatus = "requires_source_action";
			response.requiresAction = true;
			response.clientSecret = paymentIntent.client_secret;
			break;
		case "requires_payment_method":
			response.paymentIntentStatus = "requires_payment_method";
			break;
		case "requires_source":
			response.paymentIntentStatus = "requires_source";
			response.error = {
				messages: ["カードが拒否されました。別の決済手段をお試しください"],
			};
			break;
		case "succeeded":
			response.paymentIntentStatus = "succeeded";
			response.clientSecret = paymentIntent.client_secret;
			break;
		default:
			response.error = {
				messages: ["システムエラーが発生しました"],
			};
			break;
	}

	return response;
}

function generateErrorResponse(error) {
	return {
		error: {
			messages: [error],
		},
	};
}

module.exports = router;
