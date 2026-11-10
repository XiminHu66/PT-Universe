import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classify, couponCondition, isExcludedLead } from "../src/lib/classify";

describe("classify", () => {
  it("keeps AI service promotions out of the default feed and distinguishes explicit coupon conditions", () => {
    assert.equal(classify("【TeamoRouter】双11福利｜回帖送$1体验金", "linuxdo"), "其他");
    assert.equal(classify("【快跑AI】Qwen Audio 72 折 注册送10$", "linuxdo"), "其他");
    assert.equal(couponCondition("$47.45 w/ code", "", "slickdeals"), "coupon");
    assert.equal(couponCondition("$92.30", "when you clip the $15 off coupon", "slickdeals"), "clip-coupon");
    assert.equal(couponCondition("$20 + Free S&H", "", "slickdeals"), undefined);
  });
  it("requires a clear offer signal instead of a game or membership mention", () => {
    assert.equal(classify("会员订阅年卡", "epic"), "游戏");
    assert.equal(classify("Steam Pro 会员", "linuxdo"), "其他");
    assert.equal(classify("ChatGPT Pro 套餐", "appinn"), "其他");
    assert.equal(classify("PRO版限免", "appinn"), "限免");
    assert.equal(classify("永久免费：无广告、无订阅", "appinn"), "免费白嫖");
    assert.equal(classify("复旦学术版 Codex 双十一积分翻倍", "appinn"), "低价优惠");
    assert.equal(classify("硬盘 $45 + Free S&H", "slickdeals"), "低价优惠");
    assert.equal(classify("Free shipping information", "slickdeals"), "其他");
    assert.equal(isExcludedLead("【已无】送个腾讯视频体验 vip", "linuxdo"), true);
    assert.equal(isExcludedLead("抽奖送会员", "linuxdo"), true);
    assert.equal(isExcludedLead("GPT代充优惠", "linuxdo"), true);
  });

  it("filters low-relevance markers before deal keywords for non-Epic sources", () => {
    assert.equal(classify("【抽奖】10个免费账号", "linuxdo"), "其他");
    assert.equal(classify("优惠码新闻汇总", "appinn"), "其他");
    assert.equal(classify("免费领取活动更新公告", "ghxi"), "其他");
    assert.equal(classify("有会员优惠吗？", "v2ex"), "其他");
    assert.equal(classify("收优惠码", "v2ex"), "其他");
    assert.equal(classify("求优惠码", "v2ex"), "其他");
    assert.equal(classify("收team优惠码", "v2ex"), "其他");
    assert.equal(classify("求team会员", "v2ex"), "其他");
    assert.equal(classify("收团队优惠码", "v2ex"), "其他");
    assert.equal(classify("求管理员会员", "v2ex"), "其他");
    assert.equal(classify("求家庭套餐", "v2ex"), "其他");
    assert.equal(classify("收款工具限免", "v2ex"), "限免");
    assert.equal(classify("收款工具优惠码", "v2ex"), "低价优惠");
    assert.equal(classify("收款工具限免优惠码", "v2ex"), "限免");
    assert.equal(classify("Epic 免费游戏新闻", "v2ex"), "其他");
    assert.equal(classify("Epic 免费游戏新闻", "epic"), "游戏");
  });

  it("follows the documented keyword order", () => {
    assert.equal(classify("免费领取会员", "linuxdo"), "限免");
    assert.equal(classify("本周限免", "linuxdo"), "限免");
    assert.equal(classify("免费领取三个月", "linuxdo"), "限免");
    assert.equal(classify("白嫖一年", "linuxdo"), "免费白嫖");
    assert.equal(classify("完全免费", "linuxdo"), "其他");
    assert.equal(classify("大促折扣码", "linuxdo"), "低价优惠");
    assert.equal(classify("优惠码在此", "linuxdo"), "低价优惠");
    assert.equal(classify("年卡打折", "iplaysoft"), "会员订阅");
    assert.equal(classify("降价通知", "ghxi"), "低价优惠");
    assert.equal(classify("正版软件爆降", "iplaysoft"), "低价优惠");
    assert.equal(classify("x10hosting 永免虚拟主机", "linuxdo"), "免费白嫖");
    assert.equal(classify("软件更新公告", "appinn"), "其他");
  });
});
