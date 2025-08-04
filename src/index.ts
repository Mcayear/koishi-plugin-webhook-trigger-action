import { Bot, Context, Schema } from "koishi";
import type {} from "@koishijs/plugin-server"
import { OneBot } from "@koishijs/plugin-adapter-onebot";

export const name = "webhook-trigger-action";
export const inject = ["server"];
export interface responseType {
	platform: string;
	selfId: string;
	private: boolean;
	seeisonIds: string[];
	msg: string;
}

export enum WebhookMethodType {
	GET = "get",
	POST = "post",
}

export interface Webhook {
	method: WebhookMethodType;
	headers: { [key: string]: string };
	response?: responseType[];
}

export interface Config {
	[key: string]: Webhook;
}

export const Config = Schema.dict(
	Schema.object({
		method: Schema.union(Object.values(WebhookMethodType))
			.default(WebhookMethodType.GET)
			.description("监听方式"),
		headers: Schema.dict(Schema.string())
			.role("table")
			.description("检查头 如果填写则需要在请求头中包含"),
		response: Schema.array(
			Schema.object({
				platform: Schema.union([
					"onebot",
					"qq",
					"kook",
					"telegram",
					"discord",
					"lark",
					"red",
				])
					.default("onebot")
					.description("平台"),
				username: Schema.string()
					.required()
					.description("机器人selfId，用于获取Bot对象"),
				private: Schema.boolean().default(false).description("是否私聊"),
				seeisonIds: Schema.array(Schema.string().required())
					.role("table")
					.description("群聊/私聊对象Id"),
				msg: Schema.string()
					.default("hello {name}")
					.role("textarea", { rows: [2, 4] })
					.description(
						"需要发送的信息，换行符请使用【\\n】或【\\<br \\/\\>】 <br>接收的body会按照JSON解析，并将key以{key}形式全替换字符串内容"
					),
			})
		).description("响应"),
	})
).description("监听指定路径<br/>修改配置后需要 **重启插件** 使更改生效");

export interface varDict {
	[key: string]: string;
}

function sendResponseMsg(bot: Bot<any>, platform: string, rep: responseType, dict: varDict) {
	let msg = rep.msg;
	for (const key in dict) {
		msg = msg.replace(new RegExp("\\{" + key + "\\}", "g"), dict[key]);
	}
	if (rep.private) {
		rep.seeisonIds.forEach((sessionId) => {
			bot.sendPrivateMessage(sessionId, msg.replace("\\n", "\n"));
		});
		return;
	}
	if (platform === "onebot") {
		const internal: OneBot.Internal = bot.internal;
		rep.seeisonIds.forEach((sessionId) => {
			internal.sendGroupMsg(<number>(<unknown>sessionId), msg);
		});
		return;
	}
	rep.seeisonIds.forEach((sessionId) => {
		bot.sendMessage(sessionId, msg.replace("\\n", "\n"));
	});
}

export function apply(ctx: Context, config: Config) {
	const logger = ctx.logger(name);


	for (let path in config) {
		let item = config[path];

		if (item.method === WebhookMethodType.GET)
			ctx.server.get(
				path,
				(c, next) => {
					logger.info("接收到get请求：" + path);
					for (let httpheader in config[path].headers) {
						// 检查头，如果不相等则返回400
						if (c.header[httpheader.toLowerCase()] != config[path].headers[httpheader])
							return (c.status = 400);
					}
					next();
				},
				(c) => {
					let body = JSON.parse(JSON.stringify(c.request.query));

					ctx.bots.forEach((bot) => {
						logger.info("get请求 bot.selfId：" + bot.selfId);
						for (let rep of item.response) {
							if (bot.platform != rep.platform && bot.selfId != rep.selfId) {
								// 过滤机器人平台，用户ID
								continue;
							}
							sendResponseMsg(bot, rep.platform, rep, body ? body : {});
							return (c.status = 200);
						}
					});

					return (c.status = 405);
				}
			);

		if (item.method === WebhookMethodType.POST)
			ctx.server.post(
				path,
				(c, next) => {
					logger.info("接收到post请求：" + path);
					for (let httpheader in config[path].headers) {
						// 检查头，如果不相等则返回400
						if (c.header[httpheader.toLowerCase()] != config[path].headers[httpheader])
							return (c.status = 400);
					}
					next();
				},
				(c) => {
					for (let bot of ctx.bots) {
						logger.info("post请求 bot.selfId：" + bot.selfId);
						for (let rep of item.response) {
							if (bot.platform != rep.platform && bot.selfId != rep.selfId) {
								// 过滤机器人平台，用户ID
								continue;
							}
							sendResponseMsg(
								bot,
								rep.platform,
								rep,
								c.request.body ? c.request.body : {}
							);
							return (c.status = 200);
						}
					}
					return (c.status = 405);
				}
			);
	}
}
