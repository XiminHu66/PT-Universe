const glossary: [RegExp, string][] = [
  [/men'?s or women'?s/gi, "男女款"], [/women'?s/gi, "女款"], [/men'?s/gi, "男款"], [/kids'?/gi, "儿童款"],
  [/hooded puffer jacket/gi, "连帽棉服"], [/full[- ]zip knit jacket/gi, "全拉链针织夹克"], [/fleece sweatshirt/gi, "抓绒卫衣"],
  [/pullover hoodie/gi, "套头连帽衫"], [/running shoes/gi, "跑鞋"], [/workout shoes|training shoes/gi, "训练鞋"],
  [/holiday graphic or classic confetti clog/gi, "节日印花或彩点洞洞鞋"], [/clogs?/gi, "洞洞鞋"], [/shoes/gi, "鞋"],
  [/rechargeable batter(?:ies|y)/gi, "充电电池"], [/c size adapters?/gi, "C 型电池转换套"], [/multi-color led lighting/gi, "多色 LED 灯效"],
  [/bluetooth/gi, "蓝牙"], [/soundbar/gi, "条形音箱"], [/vertical mobile gaming controller/gi, "竖屏手游手柄"],
  [/gaming controller/gi, "游戏手柄"], [/game-key card/gi, "游戏钥匙卡"], [/game controller/gi, "游戏手柄"],
  [/potato chips?(?: bags?)?/gi, "薯片"], [/barbecue flavored/gi, "烧烤味"], [/sugar[- ]free gum/gi, "无糖口香糖"], [/cinnamon/gi, "肉桂味"],
  [/playing cards/gi, "扑克牌"], [/card game/gi, "卡牌游戏"], [/add[- ]on packs?/gi, "扩展包"], [/storage tin/gi, "收纳铁盒"],
  [/adjustable brightness/gi, "亮度可调"], [/floor lamp/gi, "落地灯"], [/goose[- ]neck/gi, "鹅颈"], [/magnifying/gi, "放大镜"], [/with clamp/gi, "带夹具"],
  [/faux shearling lining/gi, "仿羊羔绒内衬"], [/relaxed(?: fit)?/gi, "宽松款"], [/zippered pockets/gi, "拉链口袋"],
  [/seersucker/gi, "泡泡纱"], [/comforter set/gi, "被套组合"], [/unlocked smartphone/gi, "无锁手机"], [/smartphone/gi, "智能手机"],
  [/espresso machine/gi, "意式咖啡机"], [/portable (?:solid.state drive|ssd)/gi, "移动固态硬盘"], [/solid.state drive|\bssd\b/gi, "固态硬盘"],
  [/electric razors?/gi, "电动剃须刀"], [/palm-sized/gi, "掌心大小"], [/(\d+)[- ]blade/gi, "$1 刀头"], [/\bpuzzles?\b/gi, "拼图"],
  [/self[- ]cleaning cat litter box/gi, "自动清洁猫砂盆"], [/self[- ]cleaning/gi, "自动清洁"], [/cat litter/gi, "猫砂"],
  [/mattress topper/gi, "床垫加厚垫"], [/gel memory foam/gi, "凝胶记忆棉"], [/diamond stud earrings/gi, "钻石耳钉"],
  [/diamond eternity band/gi, "钻石排戒"], [/diamond.{0,16}pendant/gi, "钻石吊坠"], [/laboratory grown diamonds?/gi, "培育钻石"],
  [/noise[- ]cancell?ing/gi, "降噪"], [/over[- ]the[- ]ear/gi, "头戴式"], [/earbuds?/gi, "入耳式耳机"], [/headphones?/gi, "耳机"],
  [/mini\s+pc/gi, "迷你电脑"], [/laptop/gi, "笔记本电脑"], [/desktop/gi, "台式机"], [/smart\s+tv/gi, "智能电视"],
  [/\bmonitors?\b/gi, "显示器"], [/wireless/gi, "无线"], [/mechanical keyboard/gi, "机械键盘"], [/keyboards?/gi, "键盘"],
  [/\bmice\b|\bmouse\b/gi, "鼠标"], [/air fryers?/gi, "空气炸锅"], [/robot vacuum/gi, "扫地机器人"], [/vacuum cleaner/gi, "吸尘器"],
  [/protein powder/gi, "蛋白粉"], [/coffee beans?/gi, "咖啡豆"], [/toilet paper/gi, "卫生纸"], [/paper towels?/gi, "厨房纸巾"],
  [/electric toothbrush/gi, "电动牙刷"], [/nic(e|ely) packaged/gi, "礼盒装"], [/washing machines?/gi, "洗衣机"], [/dishwashers?/gi, "洗碗机"],
  [/water filter/gi, "滤水器"], [/air purifier/gi, "空气净化器"], [/pressure washer/gi, "高压清洗机"],
  [/space heater/gi, "取暖器"], [/security cameras?/gi, "监控摄像头"], [/smart watches?|smartwatches?/gi, "智能手表"],
  [/power banks?/gi, "移动电源"], [/chargers?/gi, "充电器"], [/\bdocking stations?\b/gi, "扩展坞"], [/\bdocks?\b/gi, "扩展坞"],
  [/e[- ]readers?/gi, "电子书阅读器"], [/paperback/gi, "平装"], [/graphic novels?/gi, "图像小说"], [/box sets?/gi, "套装"],
  [/\bautomatic\b/gi, "自动"], [/channel/gi, "声道"], [/colors may vary/gi, "颜色随机"], [/\bmatte\b/gi, "哑光"],
  [/\bqueen(?: size)?\b/gi, "大号"], [/\bking(?: size)?\b/gi, "特大号"], [/\bclassic\b/gi, "经典款"],
  [/\bbundle\b|\bsets?\b/gi, "套装"], [/\brefurbished\b/gi, "翻新"], [/\bopen[- ]box\b/gi, "开箱品"],
  [/(\d+)[- ](?:pk|pack|pcs?|piece|ct|count)\b/gi, "$1 件装"], [/(\d+)\s*oz\b/gi, "$1 盎司"],
  [/\bblack\b/gi, "黑色"], [/\bnavy\b/gi, "藏青色"], [/\bwhite\b/gi, "白色"], [/\bgrey\b|\bgray\b/gi, "灰色"],
  [/\bred\b/gi, "红色"], [/\bblue\b/gi, "蓝色"], [/\bgreen\b/gi, "绿色"], [/\band\b/gi, "及"], [/\bor\b/gi, "或"],
];

export function productTitle(title: string) {
  return title
    .replace(/^[^:：]{0,34}(?:members?|accounts?|open box unit)\s*:\s*/i, "")
    .replace(/^[^–—]{0,85}\b(?:save|up to)\s*\$[\d,.]+\s+(?:on|off)\s+/i, "")
    .replace(/\s*(?:—|–|\+)?\s*(?:(?:only|now|from|was|原价|到手价|现价|低至)\s*)?\$\s*\d[\d,.]*.*$/i, "")
    .trim() || title;
}

export function chineseTitle(title: string) {
  const name = productTitle(title);
  if (/\p{Script=Han}/u.test(name)) return name;
  const localized = glossary.reduce((text, [pattern, chinese]) => text.replace(pattern, chinese), name)
    .replace(/\bw\/\s*/gi, "，附 ")
    .replace(/\bwith\b/gi, "附")
    .replace(/\s+([，）])/g, "$1")
    .replace(/\s+/g, " ").trim();
  return localized;
}
