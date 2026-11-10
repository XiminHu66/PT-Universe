import type { Category } from "./types";

function isLowRelevance(title: string): boolean {
  return (
    /抽奖|开奖|抽取|求购|收购|求助|闲聊|讨论|新闻|资讯|公告|更新|评测|测评|避雷|吐槽|预测/.test(title) ||
    /(?:^|[\s【\[])(?:收|求)(?:购|助|一个|一下|个)?(?:[A-Za-z0-9._-]{0,16}|团队|管理员|家庭|企业|共享|朋友|个人|学生|开发者|机场)?[\s:：]*(?:优惠码|会员|账号|主机|路由器|套餐|商品|上车|自建)/.test(title) ||
    /[?？]/.test(title) ||
    /有没有|有无|是否|请问|是真的吗|能不能|可不可以/.test(title)
  );
}

/** Drop expired claims and high-noise offers before they reach the board. */
export function isExcludedLead(title: string, sourceId: string): boolean {
  if (sourceId === "epic") return false;
  if (sourceId === "slickdeals") return /\b(?:expired|sweepstakes|giveaway)\b/i.test(title);
  return /^\s*[【\[]?(?:已无|已领完|已过期|已结束|已送完|已失效)(?:[】\]：:\s]|$)/.test(title) ||
    /抽奖|开奖|博彩|赌博|赌场|代充|代开会员|号池|接码|破解(?:版|补丁)|注册码共享|(?:API|模型|Claude|GPT)\s*中转|中转站/i.test(title);
}

/** Keep implicit mentions of games, membership and free software out of the deal feed. */
export function classify(title: string, sourceId: string): Category {
  if (sourceId === "epic") return "游戏";
  if (sourceId === "slickdeals") return /\$\s*\d|\bfree\b(?!\s*(?:s\s*\/\s*[hH]|s\s*&\s*[hH]|shipping))/i.test(title) ? "低价优惠" : "其他";
  if (isLowRelevance(title)) return "其他";
  if (/限免|免费领取|免费试用|免费\s*(?:[一二三四五六七八九十两0-9]+\s*(?:天|个月|月|年))/.test(title)) return "限免";
  if (/永久免费|永免|免费(?:送|领|下载)|白嫖/.test(title)) return "免费白嫖";
  const offer = /优惠码|促销|大促|降价|打折|折扣|爆降|立减|积分翻倍|(?:\d{1,2}(?:\.\d+)?)\s*折|(?:送|获赠|领)\s*(?:[¥￥$]?\s*\d+(?:\.\d+)?\s*(?:元|积分|点数|\$)|[¥￥$]\s*\d+)/.test(title);
  if (offer) return /会员|订阅|年卡/.test(title) ? "会员订阅" : "低价优惠";
  if (/喜加一/.test(title)) return "游戏";
  return "其他";
}
