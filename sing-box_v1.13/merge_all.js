const { name, type = "0", rules: rules_file } = $arguments;

// 1. 读取模板
let config = JSON.parse($files[0]);

// 2. 先追加自定义规则（如果传了 rules_file 且能成功读取）
if (rules_file) {
  try {
    let customRulesRaw = await produceArtifact({
      type: "file",
      name: rules_file,
    });
    if (customRulesRaw) {
      let customRules = JSON.parse(customRulesRaw);
      // 找到 clash_mode === "global" 规则索引（不判断 outbound）
      let idx = config.route.rules.findIndex(r => r.clash_mode === "global");
      if (idx !== -1) {
        const existingRulesStr = new Set(config.route.rules.map(r => JSON.stringify(r)));
        customRules = customRules.filter(r => !existingRulesStr.has(JSON.stringify(r)));
        config.route.rules.splice(idx + 1, 0, ...customRules);
      } else {
        config.route.rules.push(...customRules);
      }
    } else {
      // 文件没找到或为空，什么都不做，安静跳过
    }
  } catch (e) {
    // 解析或其它错误也不抛出，跳过规则插入
  }
}

// 3. 拉取订阅或合集节点
let proxies = await produceArtifact({
  name,
  type: /^1$|col/i.test(type) ? "collection" : "subscription",
  platform: "sing-box",
  produceType: "internal",
});

// 4. 去重已有节点tag
const existingTags = config.outbounds.map(o => o.tag);
proxies = proxies.filter(p => !existingTags.includes(p.tag));

// 5. 注入 keepalive 后再添加节点
const PROXY_TYPES = ['trojan', 'vmess', 'vless', 'shadowsocks',
                     'shadowsocksr', 'hysteria', 'hysteria2', 'tuic', 'wireguard'];
proxies = proxies.map(p => {
  if (!PROXY_TYPES.includes(p.type)) return p;
  return {
    ...p,
    "tcp_keep_alive": "30s",
    "tcp_keep_alive_interval": "15s"
  };
});
config.outbounds.push(...proxies);

// 6. 准备 tag 列表
const allTags = proxies.map(p => p.tag);
const terminalTags = proxies.filter(p => !p.detour).map(p => p.tag);
const sgTags = terminalTags.filter(tag =>
  /新加坡|狮城|SG|Singapore/i.test(tag)
);

const jpTags = terminalTags.filter(tag =>
  /日本|JP|Japan|Tokyo|Osaka/i.test(tag)
);

const hkTags = terminalTags.filter(tag =>
  /香港|HK|Hong Kong/i.test(tag)
);

const usTags = terminalTags.filter(tag =>
  /美国|US|United States|Los Angeles|San Jose/i.test(tag)
);

const twTags = terminalTags.filter(tag =>
  /台湾|TW|Taiwan/i.test(tag)
);
// 7. 遍历分组追加节点
config.outbounds.forEach(group => {
  if (!Array.isArray(group.outbounds) || group.tag === "Direct-Out") return;
  
  switch (group.tag) {
    case "AUTO":
    case "AUTO-SG":
      group.outbounds = [...sgTags];  // = 赋值，不是 push
      break;
    case "AUTO-JP":
      group.outbounds = [...jpTags];
      break;
    case "AUTO-HK":
      group.outbounds = [...hkTags];
      break;
    case "AUTO-US":
      group.outbounds = [...usTags];
      break;
    case "AUTO-TW":
      group.outbounds = [...twTags];
      break;
    case "SG":
      group.outbounds.push(...sgTags);  // 选择器组保持 push
      break;
    // ... 其余保持不变
  }
});

// 8. 分组内去重
config.outbounds.forEach(group => {
  if (Array.isArray(group.outbounds)) {
    group.outbounds = [...new Set(group.outbounds)];
  }
});

// 9. 输出最终配置
$content = JSON.stringify(config, null, 2);
