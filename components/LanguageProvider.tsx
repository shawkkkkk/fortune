"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Language = "en" | "zh";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const ZH: Record<string, string> = {
  "Overview": "概览",
  "Public Testnet": "公开测试网",
  "API": "开发接口",
  "Public Alpha": "公开 Alpha",
  "Switch testnet": "切换测试网",
  "Report a bug ↗": "报告问题 ↗",
  "Connect wallet": "连接钱包",
  "Connecting…": "连接中…",
  "BSC Testnet wallet connected": "BSC 测试网钱包已连接",
  "Wallet connected · switch to BSC Testnet": "钱包已连接 · 请切换到 BSC 测试网",
  "Fortune · public BSC Testnet alpha": "Fortune · BSC 公开测试版",
  "Test assets only · no real funds": "仅限测试资产 · 请勿使用真实资金",

  "FORTUNE PUBLIC BSC TESTNET ALPHA": "FORTUNE BSC 公开测试版",
  "Launch against anything. Test it for real.": "万物皆可发行。现在真实测试。",
  "Fortune is now running an onchain public alpha on BNB Smart Chain Testnet. Create a real Fortune test token, trade its curve with valueless mock fUSD, and graduate it into a real Pancake V3 testnet pool.": "Fortune 现已在 BNB Smart Chain 测试网上开放公开测试。你可以创建真实的 Fortune 测试代币，用无价值的模拟 fUSD 在曲线上交易，并将代币毕业到真实的 Pancake V3 测试网池。",
  "Open public testnet →": "进入公开测试网 →",
  "Developer API": "开发者 API",
  "Public alpha only. The contracts are pre-audit and mainnet remains disabled. Do not use real funds.": "仅限公开测试版。合约尚未完成独立审计，主网仍未开放。请勿使用真实资金。",
  "RELEASE GATE · PASSED": "发布测试 · 已通过",
  "39/39 tests": "39/39 项测试",
  "1,000 fuzz runs": "1,000 次模糊测试",
  "7,500/7,500 requests": "7,500/7,500 次请求",
  "3 real graduations": "3 次真实毕业",
  "Peak measured throughput": "实测峰值吞吐量",
  "500-concurrent p95": "500 并发 p95",
  "Release p95 limit": "发布 p95 上限",
  "Post-storm invariants": "压力测试后不变量",
  "16/16 passed": "16/16 通过",
  "WHAT IS LIVE": "当前已上线",
  "One narrow, real alpha path.": "一条精简但真实的测试路径。",
  "Create": "创建",
  "Create an actual Fortune token through the deployed BSC Testnet factory. Every Fortune token is CREATE2-deployed with the required 0xfe suffix.": "通过已部署的 BSC 测试网工厂创建真实的 Fortune 测试代币。每个 Fortune 代币都通过 CREATE2 部署，并带有规定的 0xfe 地址后缀。",
  "Wallet-signed": "钱包签名",
  "Trade": "交易",
  "Mint valueless mock fUSD, approve the new curve, and make an onchain test purchase against Fortune's canonical curve.": "铸造无价值的模拟 fUSD，授权新曲线，然后在 Fortune 的标准曲线上进行链上测试买入。",
  "Real testnet txs": "真实测试网交易",
  "Graduate": "毕业",
  "Permissionlessly finalize the launch into Pancake V3 testnet and permanently custody the resulting LP-position NFT in the Fortune locker.": "无需许可即可将发行毕业到 Pancake V3 测试网，并把生成的 LP 仓位 NFT 永久锁入 Fortune 锁仓合约。",
  "Pancake V3": "Pancake V3",
  "PUBLIC ALPHA DEPLOYMENT": "公开测试版部署",
  "Verify the contracts yourself.": "你可以自行验证所有合约。",
  "Factory on BscScan ↗": "在 BscScan 查看工厂 ↗",
  "Fortune Factory": "Fortune 工厂",
  "Asset Registry": "资产注册表",
  "Graduation adapter": "毕业适配器",
  "Permanent LP locker": "永久 LP 锁仓",
  "Mock fUSD": "模拟 fUSD",
  "Reference Pancake pool": "参考 Pancake 池",
  "ALPHA SCOPE": "测试版范围",
  "No fake markets or fake volume.": "不展示虚假市场或虚假交易量。",
  "Real testnet contracts": "真实测试网合约",
  "Real wallet signatures": "真实钱包签名",
  "Real Pancake V3 testnet": "真实 Pancake V3 测试网",
  "Valueless test assets": "无价值测试资产",
  "Indexer/social features coming later": "索引器和社交功能稍后上线",

  "Try Fortune onchain.": "在链上体验 Fortune。",
  "Create a real Fortune testnet launch, trade its Basket Curve with free mock fUSD, and graduate it into a real Pancake V3 testnet pool. Test assets have no financial value.": "创建真实的 Fortune 测试网发行，用免费的模拟 fUSD 在篮子曲线上交易，并毕业到真实的 Pancake V3 测试网池。测试资产没有金融价值。",
  "Get tBNB gas ↗": "获取 tBNB Gas ↗",
  "TESTNET ONLY": "仅限测试网",
  "Chain 97 · never use real BNB or a wallet holding valuable assets. The fUSD faucet below mints a Fortune-owned mock token solely for testing.": "链 ID 97 · 不要使用真实 BNB，也不要使用持有有价值资产的钱包。下面的 fUSD 水龙头只会铸造 Fortune 的测试代币。",
  "Wallet + test funds": "钱包 + 测试资金",
  "tBNB pays gas. fUSD is the free quote asset used by this alpha deployment.": "tBNB 用于支付 Gas。fUSD 是此测试版使用的免费计价资产。",
  "Network": "网络",
  "BSC Testnet · 97": "BSC 测试网 · 97",
  "Wallet": "钱包",
  "Not connected": "未连接",
  "fUSD balance": "fUSD 余额",
  "Connect / switch testnet": "连接 / 切换测试网",
  "Faucet 250 fUSD": "领取 250 fUSD",
  "Minting…": "铸造中…",
  "Create a launch": "创建发行",
  "The public alpha uses the proven single-asset fUSD path and the live Fortune factory.": "公开测试版使用已验证的单资产 fUSD 路径和真实 Fortune 工厂。",
  "Token name": "代币名称",
  "Ticker": "代码",
  "Description": "简介",
  "Create testnet launch →": "创建测试网发行 →",
  "Creating launch…": "创建中…",
  "03 · CURVE → PANCAKE": "03 · 曲线 → PANCAKE",
  "Complete the testnet lifecycle": "完成完整测试网流程",
  "Launch transaction ↗": "发行交易 ↗",
  "Token": "代币",
  "Curve": "曲线",
  "Graduation target": "毕业目标",
  "$1 mock USD": "1 美元模拟价值",
  "Pancake fee tier": "Pancake 费率档",
  "Approve + buy 250 fUSD": "授权并买入 250 fUSD",
  "Buying…": "买入中…",
  "Finalize Pancake graduation": "完成 Pancake 毕业",
  "Graduating…": "毕业中…",
  "Create a launch to unlock the lifecycle test.": "先创建发行，才能进行完整流程测试。",
  "You will receive the real testnet token and curve addresses after the LaunchCreated event confirms.": "LaunchCreated 事件确认后，你会获得真实的测试网代币地址和曲线地址。",
  "TRANSACTION STATUS": "交易状态",
  "PUBLIC ALPHA CONTRACTS": "公开测试版合约",
  "Verify everything yourself": "自行验证全部内容",
  "Pancake graduation adapter": "Pancake 毕业适配器",

  "Connect a testnet wallet to begin.": "连接测试网钱包以开始。",
  "Wallet connected to BSC Testnet. Get tBNB for gas, then use the free fUSD test faucet below.": "钱包已连接到 BSC 测试网。先获取 tBNB 支付 Gas，再使用下方免费的 fUSD 测试水龙头。",
  "Wallet connection failed.": "钱包连接失败。",
  "250 fUSD test tokens minted to your wallet.": "已向你的钱包铸造 250 fUSD 测试代币。",
  "fUSD faucet transaction failed.": "fUSD 水龙头交易失败。",
  "Token name must be 1–64 characters.": "代币名称必须为 1–64 个字符。",
  "Ticker must be 1–16 characters.": "代币代码必须为 1–16 个字符。",
  "Finding your deterministic 0xfe token address…": "正在寻找确定性的 0xfe 代币地址…",
  "Confirm the Fortune launch transaction in your wallet.": "请在钱包中确认 Fortune 发行交易。",
  "Launch transaction confirmed, but the LaunchCreated event could not be decoded. Check the transaction in BscScan.": "发行交易已确认，但无法解析 LaunchCreated 事件。请在 BscScan 中查看交易。",
  "Launch created. Faucet fUSD if needed, then buy on the curve to drive it to graduation.": "发行已创建。如有需要先领取 fUSD，然后在曲线上买入以推动毕业。",
  "Approve 250 fUSD for this curve in your wallet.": "请在钱包中为此曲线授权 250 fUSD。",
  "Approval confirmed. Confirm the curve buy.": "授权已确认。请确认曲线买入交易。",
  "Curve reached GraduationReady. You can now finalize its Pancake V3 graduation.": "曲线已达到 GraduationReady。现在可以完成 Pancake V3 毕业。",
  "Buy confirmed. This curve has not reached GraduationReady yet.": "买入已确认。此曲线尚未达到 GraduationReady。",
  "Curve buy failed.": "曲线买入失败。",
  "Graduation preflight is not ready yet. The launch remains retryable.": "毕业预检查尚未通过。发行仍可稍后重试。",
  "Confirm the permissionless graduation transaction.": "请确认无需许可的毕业交易。",
  "Transaction confirmed but the curve did not reach PoolCreated. It can be retried.": "交易已确认，但曲线未达到 PoolCreated。可以重试。",
  "Graduation complete: Pancake V3 pool created and the LP-position NFT is permanently locked.": "毕业完成：Pancake V3 池已创建，LP 仓位 NFT 已永久锁定。",
  "Graduation failed.": "毕业失败。",
  "No injected EVM wallet found. Install MetaMask or another BSC-compatible wallet.": "未检测到 EVM 钱包。请安装 MetaMask 或其他兼容 BSC 的钱包。",
  "Wallet did not return an account.": "钱包未返回账户。",

  "VERIFIED RELEASE EVIDENCE": "已验证的发布证据",
  "Testnet performance": "测试网性能",
  "These are release-test results, not invented live market metrics. A public onchain indexer is not enabled yet.": "这些是发布测试的真实结果，不是虚构的实时市场数据。公开链上索引器尚未启用。",
  "HTTP requests": "HTTP 请求",
  "7,500 successful": "7,500 次全部成功",
  "Peak concurrency": "峰值并发",
  "5,000-request stage": "5,000 请求阶段",
  "Peak throughput": "峰值吞吐量",
  "Measured in release storm": "来自发布压力测试",
  "Real graduations": "真实毕业",
  "While web load was active": "与网页压力测试同时进行",
  "CONTRACT VERIFICATION": "合约验证",
  "Foundry suite": "Foundry 测试套件",
  "Fuzz runs": "模糊测试次数",
  "Pre-storm graduation checks": "压力测试前毕业检查",
  "Post-storm graduation checks": "压力测试后毕业检查",
  "LOAD STAGES": "负载阶段",
  "Success floor": "成功率",
  "100% observed": "实测 100%",
  "Live volume, market cap, creator counts, rewards and revenue are intentionally not displayed until Fortune has an onchain indexer that can reproduce them from public events.": "在 Fortune 上线可从公开事件复现数据的链上索引器之前，我们不会显示实时交易量、市值、创建者数量、奖励或收入。",

  "FORTUNE FORUM": "FORTUNE 社区",
  "Not live yet.": "尚未上线。",
  "The earlier forum feed was a product mockup. It has been removed from the public alpha so nobody mistakes generated posts, votes, or activity for real users.": "之前的社区内容只是产品模型，现已从公开测试版移除，避免任何人把生成的帖子、投票或活动误认为真实用户数据。",
  "Test Fortune onchain →": "链上测试 Fortune →",
  "Community features come after the onchain alpha.": "社区功能将在链上测试版之后上线。",
  "The first public release is intentionally focused on real wallet, curve, graduation, Pancake V3, and LP-lock behavior.": "首个公开版本专注于真实的钱包、曲线、毕业、Pancake V3 和 LP 锁仓功能。",

  "PROTOCOL OPERATIONS": "协议运行状态",
  "Automation state": "自动化状态",
  "Only behavior that exists in deployed contracts is shown here.": "这里仅展示已部署合约中真实存在的行为。",
  "PUBLIC ALPHA": "公开测试版",
  "What actually runs today": "当前真实运行的功能",
  "No fake dollar totals": "不展示虚假金额",
  "Permanent LP custody": "永久 LP 托管",
  "Permissionless graduation": "无需许可的毕业",
  "Retryable failure path": "可重试失败路径",
  "Seven-day reserve rescue": "七天储备救援",
  "Public automation activity index": "公开自动化活动索引",
  "Live": "已上线",
  "Pending": "待上线",

  "PORTFOLIO": "资产组合",
  "Indexer pending.": "索引器待上线。",
  "Fortune does not yet have a public portfolio indexer, so the alpha does not pretend to know your holdings, rewards, or creator earnings.": "Fortune 目前还没有公开资产组合索引器，因此测试版不会假装知道你的持仓、奖励或创建者收入。",
  "Your wallet remains the source of truth.": "你的钱包仍是最终数据来源。",
  "For now, use the public testnet page and BscScan links to inspect the test tokens and transactions you create. Portfolio aggregation will return when it is backed by real indexed chain data.": "目前请通过公开测试网页面和 BscScan 链接查看你创建的测试代币与交易。等真实链上索引数据就绪后，资产组合功能会重新上线。",

  "FORTUNE PUBLIC TESTNET REGISTRY": "FORTUNE 公开测试网资产注册表",
  "One approved alpha quote asset.": "当前只有一个已批准的测试计价资产。",
  "The public alpha does not expose the old mainnet asset catalog as if it were launchable on testnet. Only Fortune's valueless mock fUSD is enabled in the current alpha path.": "公开测试版不会把旧的主网资产目录伪装成可在测试网上使用。当前测试路径只启用 Fortune 的无价值模拟 fUSD。",
  "Use fUSD on testnet →": "在测试网使用 fUSD →",
  "TESTNET REGISTRY": "测试网注册表",
  "Real-value BSC assets are not enabled for this public alpha.": "此公开测试版未启用具有真实价值的 BSC 资产。",
  "Asset": "资产",
  "Capabilities": "功能",
  "Status": "状态",
  "quote": "计价",
  "reward": "奖励",
  "graduation": "毕业",
  "Live test contract ↗": "查看真实测试合约 ↗",

  "TOKEN MARKET PAGE": "代币市场页面",
  "Onchain indexer pending.": "链上索引器待上线。",
  "The old token page used demo market data and has been removed from the public alpha. Tokens created through the alpha are real BSC Testnet contracts and are linked directly to BscScan from the testnet flow.": "旧代币页面使用演示市场数据，现已从公开测试版移除。通过测试版创建的代币是真实 BSC 测试网合约，可从测试流程直接打开 BscScan。",
  "Create a real test launch →": "创建真实测试发行 →",
  "No synthetic chart or market-cap data.": "不展示模拟图表或市值数据。",
  "Token pages will return once curve events, graduation events and Pancake V3 swaps are indexed into a reproducible canonical chart.": "当曲线事件、毕业事件和 Pancake V3 交易被索引为可复现的标准图表后，代币页面会重新上线。",

  "FORTUNE PUBLIC API · ALPHA": "FORTUNE 公共 API · 测试版",
  "Real data or no data.": "只展示真实数据，否则不展示。",
  "Readiness and protocol configuration come from the deployed BSC Testnet stack. Indexed market endpoints deliberately return no synthetic activity until the event indexer is live.": "就绪状态和协议配置来自已部署的 BSC 测试网。市场索引接口在事件索引器上线前不会返回任何模拟活动数据。",
  "NON-CUSTODIAL": "非托管",
  "Wallets authorize writes.": "写入操作由钱包授权。",
  "The dedicated testnet UI signs transactions in the user's wallet. Private keys never touch Fortune servers.": "专用测试网界面会在用户钱包中签署交易。私钥绝不会进入 Fortune 服务器。",
  "Preview": "预览",
  "Wallet signs": "钱包签名",
  "Chain confirms": "链上确认",
  "HONEST ALPHA ENDPOINTS": "真实测试版接口",
  "Public API": "公共 API",
  "OpenAPI JSON": "OpenAPI JSON",
  "QUICKSTART": "快速开始",
  "Check the live deployment.": "检查实时部署。",
  "INDEXER BOUNDARY": "索引器边界",
  "No fake market feed.": "不提供虚假市场数据。",
  "Token discovery, charts, volume, revenue, portfolio aggregation and social activity remain unavailable until they are reproducible from public onchain events. This is intentional.": "代币发现、图表、交易量、收入、资产组合聚合和社交活动会保持关闭，直到它们能从公开链上事件中可靠复现。这是有意的设计。",
  "Markets": "市场",
  "Launch": "发行",
  "Dark mode": "深色模式",
  "Light mode": "浅色模式",
  "BNB Smart Chain wallet connected": "BNB Smart Chain 钱包已连接",
  "Wallet connected · switch network": "钱包已连接 · 请切换网络",
  "Fortune · BNB Smart Chain": "Fortune · BNB Smart Chain",
  "Real-value network · review every transaction": "真实资产网络 · 请检查每笔交易",
  "Switch network": "切换网络",
  "LIVE ONCHAIN MARKETS": "实时链上市场",
  "Fortune launches": "Fortune 发行市场",
  "Every market below is read directly from the configured Fortune factory, token, and curve contracts. No demo listings.": "下方每个市场都直接读取 Fortune 工厂、代币和曲线合约。没有演示数据。",
  "Refreshing…": "刷新中…",
  "Refresh": "刷新",
  "Launch token →": "发行代币 →",
  "Create test launch →": "创建测试发行 →",
  "BNB CHAIN MAINNET": "BNB CHAIN 主网",
  "BSC TESTNET": "BSC 测试网",
  "MARKET READ FAILED": "市场读取失败",
  "No launches on this deployment yet.": "当前部署还没有发行。",
  "The first confirmed Fortune launch will appear here directly from the factory.": "首个确认的 Fortune 发行会直接从工厂合约显示在这里。",
  "Curve price": "曲线价格",
  "Reserve": "储备",
  "Quote markets": "计价市场",
  "Graduation": "毕业",
  "Ready to graduate": "准备毕业",
  "PRODUCTION LAUNCH": "正式版发行",
  "Mainnet is not active on this deployment.": "此部署尚未启用主网。",
  "This site is currently configured for BSC Testnet. Use the public alpha flow while the audited production deployment is being prepared.": "此网站目前配置为 BSC 测试网。正式版部署完成审查前，请使用公开 Alpha 测试流程。",
  "Mainnet contracts are not fully configured.": "主网合约尚未完整配置。",
  "Fortune will not construct real-value launch transactions until the factory, registry, graduation adapter, LP locker, and approved primary quote asset are all configured.": "在工厂、资产注册表、毕业适配器、LP 锁仓和已批准的主要计价资产全部配置完成前，Fortune 不会生成真实资产发行交易。",
  "View readiness": "查看就绪状态",
  "BNB CHAIN · PRODUCTION": "BNB CHAIN · 正式版",
  "Launch a real Fortune token.": "发行真实的 Fortune 代币。",
  "Every field below becomes part of the onchain launch economics. Fortune runs a final onchain preflight before your wallet is asked to sign.": "下方每个字段都会成为链上发行参数。钱包签名前，Fortune 会进行最终链上预检查。",
  "REAL-VALUE NETWORK": "真实资产网络",
  "You are on BNB Smart Chain mainnet. Transactions spend real BNB and quote assets. Review all economics before signing.": "你正在使用 BNB Smart Chain 主网。交易会消耗真实 BNB 和计价资产。签名前请检查所有参数。",
  "Token identity": "代币信息",
  "Immutable ERC-20 name, ticker, and fixed supply.": "不可更改的 ERC-20 名称、代码和固定供应量。",
  "Total supply": "总供应量",
  "Curve economics": "曲线参数",
  "Values are USD-denominated and enforced by the deployed oracle configuration.": "数值以美元计价，并由已部署的预言机配置执行。",
  "Opening price · USD": "起始价格 · 美元",
  "Linear slope · USD per token": "线性斜率 · 每代币美元",
  "Graduation target · USD": "毕业目标 · 美元",
  "Primary quote asset": "主要计价资产",
  "Creator fee": "创建者费用",
  "Holder route": "持有人分配",
  "Buyback route": "回购分配",
  "Liquidity route": "流动性分配",
  "Protocol route": "协议分配",
  "Total trading fee": "总交易费",
  "Preflight + launch on BNB Chain →": "预检查并在 BNB Chain 发行 →",
  "Preparing launch…": "准备发行中…",
  "No transaction submitted yet.": "尚未提交交易。",
  "Transaction ↗": "交易 ↗",
  "Token ↗": "代币 ↗",
  "Open market →": "打开市场 →",
  "FORTUNE MARKET": "FORTUNE 市场",
  "Loading onchain market…": "正在加载链上市场…",
  "Market unavailable.": "市场不可用。",
  "Onchain USD oracle model": "链上美元预言机模型",
  "Graduation reserve": "毕业储备",
  "of target": "目标进度",
  "Phase": "阶段",
  "Read directly from the curve": "直接读取曲线合约",
  "Launch Shield": "Launch Shield",
  "Current buy-only opening tax": "当前仅买入的开盘税",
  "Graduation progress": "毕业进度",
  "PANCAKE V3 LIVE": "PANCAKE V3 已上线",
  "This launch has graduated. Curve buys and sells are closed; the graduation transaction created and permanently locked the Pancake V3 LP position.": "此发行已毕业。曲线买卖已关闭；毕业交易已创建并永久锁定 Pancake V3 LP 仓位。",
  "GRADUATION READY": "已准备毕业",
  "Move liquidity to Pancake V3": "将流动性转入 Pancake V3",
  "Finalization is permissionless. The adapter preflight checks the pool configuration before any reserve transfer can complete.": "任何人都可以执行毕业。适配器会先检查池配置，检查通过后才会完成储备转移。",
  "Finalize Pancake graduation →": "完成 Pancake 毕业 →",
  "Finalizing…": "毕业处理中…",
  "BUY": "买入",
  "Buy on the Fortune curve": "在 Fortune 曲线上买入",
  "Quote asset": "计价资产",
  "Amount": "数量",
  "Wallet balance": "钱包余额",
  "LAUNCH SHIELD ACTIVE": "LAUNCH SHIELD 生效中",
  "Buy UI is temporarily disabled while the opening tax is non-zero. It automatically reaches zero after the five-second launch window.": "开盘税不为零时买入暂时关闭。发行后的五秒窗口结束后会自动降为零。",
  "Approve + buy →": "授权并买入 →",
  "SELL": "卖出",
  "Sell back to the curve": "卖回曲线",
  "Approve + sell →": "授权并卖出 →",
  "Ready.": "就绪。",
  "Launch confirmed on BNB Smart Chain.": "发行已在 BNB Smart Chain 确认。",
  "Running onchain launch preflight…": "正在执行链上发行预检查…",
  "Preparing deterministic Fortune token address…": "正在准备确定性的 Fortune 代币地址…",
  "Confirm the launch transaction in your wallet.": "请在钱包中确认发行交易。",
  "Approve the quote asset in your wallet.": "请在钱包中授权计价资产。",
  "Confirm the Fortune curve buy.": "请确认 Fortune 曲线买入。",
  "Buy confirmed.": "买入已确认。",
  "Approve the Fortune token in your wallet.": "请在钱包中授权 Fortune 代币。",
  "Confirm the Fortune curve sell.": "请确认 Fortune 曲线卖出。",
  "Sell confirmed.": "卖出已确认。",
  "Confirm the Pancake V3 graduation transaction.": "请确认 Pancake V3 毕业交易。",
  "Graduation confirmed. Curve trading is closed and Pancake V3 liquidity is live.": "毕业已确认。曲线交易已关闭，Pancake V3 流动性已上线。",
  "FORTUNE · BNB SMART CHAIN": "FORTUNE · BNB SMART CHAIN",
  "Launch tokens with transparent onchain mechanics.": "用透明的链上机制发行代币。",
  "Fortune is a non-custodial BNB Chain launch framework with deterministic fixed-supply tokens, onchain curve trading, transparent fee routing, Launch Shield protection, and atomic Pancake V3 graduation.": "Fortune 是 BNB Chain 上的非托管发行框架，提供确定性固定供应代币、链上曲线交易、透明费用分配、Launch Shield 保护和原子化 Pancake V3 毕业。",
  "Launch on BNB Chain →": "在 BNB Chain 发行 →",
  "Live markets": "实时市场",
  "Real-value network. Fortune is non-custodial; always review token economics, contract addresses, and wallet prompts before signing.": "真实资产网络。Fortune 为非托管协议；签名前请检查代币参数、合约地址和钱包提示。",
  "PROTOCOL GUARANTEES": "协议保证",
  "Fixed supply": "固定供应量",
  "Atomic graduation": "原子化毕业",
  "Permanent LP lock": "永久 LP 锁仓",
  "Custody": "托管方式",
  "Non-custodial": "非托管",
  "Token supply": "代币供应量",
  "Immutable": "不可更改",
  "Deployment": "部署",
  "Configured": "已配置",
  "Incomplete": "未完成",
  "The full launch lifecycle is onchain.": "完整发行流程都在链上。",
  "Create a fixed-supply Fortune token through the production factory after an onchain launch preflight.": "通过正式版工厂，在链上预检查通过后创建固定供应量的 Fortune 代币。",
  "Buy and sell through the canonical Fortune curve using registry-approved quote assets and live oracle checks.": "使用注册表批准的计价资产和实时预言机检查，在 Fortune 标准曲线上买卖。",
  "Real BNB Chain txs": "真实 BNB Chain 交易",
  "Permissionlessly finalize eligible launches into Pancake V3 and permanently lock the resulting LP-position NFT.": "无需许可即可把符合条件的发行毕业到 Pancake V3，并永久锁定生成的 LP 仓位 NFT。",
  "PRODUCTION DEPLOYMENT": "正式版部署",
  "FORTUNE PRINCIPLES": "FORTUNE 原则",
  "Real onchain contracts": "真实链上合约",
  "Live market reads": "实时市场读取",
  "Pancake V3 graduation": "Pancake V3 毕业",
  "Transparent readiness": "透明就绪状态",
  "Mainnet release approval": "主网发布批准",
  "Governance ownership": "治理所有权",
  "Primary production quote asset": "正式版主要计价资产",
  "Mainnet launch activation": "主网发行激活",
  "Assets": "资产",
  "FORTUNE ASSET UNIVERSE": "FORTUNE 资产宇宙",
  "Launch against the BNB economy.": "面向整个 BNB 经济发行。",
  "Crypto assets, stablecoins, wrapped real-world assets, tokenized stocks, and discovery catalogs live in one place. Fortune only labels an asset “Launchable now” after the active onchain registry and oracle checks actually pass.": "加密资产、稳定币、封装现实资产、代币化股票和发现目录都集中在一个地方。只有通过当前链上注册表和预言机检查的资产，Fortune 才会标记为“现在可发行”。",
  "Build a launch →": "创建发行 →",
  "UNIVERSE-FIRST, NOT FAKE SUPPORT": "先展示完整资产宇宙，而不是伪造支持",
  "Discovery is broad. Reserve custody is strict. Any asset can be surfaced; only registry-approved, oracle-healthy assets can hold launch reserves.": "发现范围可以很广，但储备托管必须严格。任何资产都可以展示；只有注册表批准且预言机健康的资产才能作为发行储备。",
  "Launchable": "可发行",
  "BNB universe": "BNB 资产宇宙",
  "Tokenized stocks": "代币化股票",
  "Penny stocks": "低价股票",
  "China stocks": "中国股票",
  "Search symbol, name or address": "搜索代码、名称或地址",
  "Onchain source of truth": "链上真实来源",
  "Discovery catalog": "发现目录",
  "Category": "类别",
  "Address": "地址",
  "Launchable now": "现在可发行",
  "Discovery candidate": "发现候选",
  "Pairing candidate": "配对候选",
  "Discovery only": "仅供发现",
  "PANCAKE V2 LIVE": "PANCAKE V2 已上线",
  "This tax launch has graduated. Curve trading is closed; Pancake V2 liquidity is live and its fungible LP tokens are permanently locked.": "此税费代币已毕业。曲线交易已关闭；Pancake V2 流动性已上线，可替代 LP 代币已永久锁定。",
  "Move liquidity to Pancake V2": "将流动性转入 Pancake V2",
  "Finalize Pancake V2 graduation →": "完成 Pancake V2 毕业 →",
  "Finalize Pancake V3 graduation →": "完成 Pancake V3 毕业 →",
  "Confirm the Pancake V2 tax-token graduation transaction.": "请确认 Pancake V2 税费代币毕业交易。",
  "Graduation confirmed. Curve trading is closed, Pancake V2 liquidity is live, and the fungible LP position is permanently locked.": "毕业已确认。曲线交易已关闭，Pancake V2 流动性已上线，可替代 LP 仓位已永久锁定。",
  "Build the launch you actually want.": "创建你真正想要的发行。",
  "Standard tokens graduate into permanently locked Pancake V3 liquidity. Tax tokens add immutable buy/sell tax, holder rewards, buyback/burn routing and bounded anti-farmer protection before graduating into permanently locked Pancake V2 liquidity.": "标准代币毕业到永久锁定的 Pancake V3 流动性。税费代币增加不可更改的买卖税、持有人奖励、回购销毁分配和有上限的防抢池保护，然后毕业到永久锁定的 Pancake V2 流动性。",
  "Chain 97 · fUSD is valueless · use a test-only wallet. Every setting below is exercised through real testnet contracts.": "链 97 · fUSD 没有实际价值 · 请使用仅测试钱包。下方每项设置都会通过真实测试网合约执行。",
  "Launch type": "发行类型",
  "Choose the token architecture before entering economics.": "先选择代币架构，再设置经济参数。",
  "Standard": "标准",
  "0% transfer tax · Pancake V3": "0% 转账税 · Pancake V3",
  "Tax Token": "税费代币",
  "Immutable tax · dividends · anti-farmer · Pancake V2": "不可变税费 · 分红 · 防抢池 · Pancake V2",
  "Tax stack awaits one-time public deployment": "税费系统等待一次性公开部署",
  "tBNB pays gas. fUSD is the valueless launch quote.": "tBNB 用于支付 Gas。fUSD 是无价值的测试计价资产。",
  "Faucet 1,000 fUSD": "领取 1,000 fUSD",
  "Fixed supply. No post-launch mint or blacklist.": "固定供应量。发行后不能增发，也没有黑名单。",
  "Creator first purchase": "创建者首次买入",
  "Optional. Approve fUSD once, then Fortune deploys the token and executes your first curve buy inside the same transaction.": "可选。先授权一次 fUSD，然后 Fortune 会在同一笔交易中部署代币并执行你的首次曲线买入。",
  "Initial creator purchase · fUSD": "创建者首次买入 · fUSD",
  "Tax + anti-farmer protection": "税费 + 防抢池保护",
  "Immutable at launch. Tax cannot later be increased and the protection window cannot be extended.": "发行时即永久确定。税率之后不能提高，保护期也不能延长。",
  "Buy tax · %": "买入税 · %",
  "Sell tax · %": "卖出税 · %",
  "Anti-farmer protection · days": "防抢池保护 · 天",
  "0 disables it. During the window, recognized competing pools from approved AMM factories cannot be used.": "设为 0 即关闭。在保护期内，来自已批准 AMM 工厂的已识别竞争池不能使用。",
  "Minimum dividend balance · tokens": "最低分红持仓 · 代币",
  "Tax allocation": "税费分配",
  "Every percent is committed onchain. Total must equal 100%.": "每一个百分比都会写入链上。总计必须等于 100%。",
  "Creator": "创建者",
  "Direct burn": "直接销毁",
  "Holder dividends": "持有人分红",
  "Buyback + burn": "回购 + 销毁",
  "Liquidity": "流动性",
  "Community treasury": "社区金库",
  "Protocol": "协议",
  "Community treasury recipient · optional": "社区金库接收地址 · 可选",
  "Defaults to connected creator wallet": "默认使用已连接的创建者钱包",
  "Links": "链接",
  "Optional public metadata for the token profile.": "代币资料页的可选公开信息。",
  "Website": "网站",
  "X / Twitter": "X / Twitter",
  "Telegram": "Telegram",
  "GitHub": "GitHub",
  "YouTube": "YouTube",
  "DeBox": "DeBox",
  "Immutable launch preview": "不可变发行预览",
  "Review before signing.": "签名前请确认。",
  "Architecture": "架构",
  "Supply": "供应量",
  "Quote": "计价资产",
  "Buy / sell tax": "买入 / 卖出税",
  "Anti-farmer": "防抢池",
  "CURVE → PANCAKE": "曲线 → PANCAKE",
  "Complete the lifecycle": "完成完整生命周期",
  "Graduation DEX": "毕业 DEX",
  "LP custody": "LP 托管",
  "Permanently locked": "永久锁定",
  "The confirmed token and curve addresses appear here.": "确认后的代币和曲线地址会显示在这里。",
  "Standard factory": "标准工厂",
  "Tax factory": "税费代币工厂",
  "Pool registry": "池注册表",
  "V3 graduation adapter": "V3 毕业适配器",
  "V3 LP locker": "V3 LP 锁仓",
  "V2 tax adapter": "V2 税费适配器",
  "V2 LP locker": "V2 LP 锁仓",
  "Launch architecture": "发行架构",
  "Choose the immutable token model.": "选择不可变的代币模型。",
  "0% transfer tax · Pancake V3 · permanent NFT LP lock": "0% 转账税 · Pancake V3 · 永久 NFT LP 锁仓",
  "Tax + dividends + anti-farmer · Pancake V2": "税费 + 分红 + 防抢池 · Pancake V2",
  "Available after the production tax stack passes release gates": "正式版税费系统通过发布检查后开放",
  "Payment asset": "支付资产",
  "The picker is sourced from the live Fortune registry, not a hard-coded token list.": "选择器直接来自 Fortune 实时注册表，而不是写死的代币列表。",
  "Search the launchable asset universe": "搜索可发行资产宇宙",
  "Browse full universe": "浏览完整资产宇宙",
  "ASSET READ FAILED": "资产读取失败",
  "Creator first purchase · quote": "创建者首次买入 · 计价资产",
  "USD-denominated values enforced by Fortune's live oracle.": "以美元计价的参数由 Fortune 实时预言机执行。",
  "Selected quote": "已选计价资产",
  "Choose an asset above": "请在上方选择资产",
  "Tax + anti-farmer": "税费 + 防抢池",
  "Immutable at launch. Rates cannot later be raised.": "发行时永久确定。税率之后不能提高。",
  "Anti-farmer · days": "防抢池 · 天",
  "Minimum dividend balance": "最低分红持仓",
  "Total must equal exactly 100%.": "总计必须严格等于 100%。",
  "Optional public token profile links.": "可选的公开代币资料链接。",
  "Running tax-token launch preflight…": "正在执行税费代币发行预检查…",
  "The production tax-token stack is not activated.": "正式版税费代币系统尚未激活。",
  "Choose a launchable payment asset.": "请选择可发行的支付资产。",
  "Tax allocation must total exactly 100%.": "税费分配必须严格合计为 100%。",
  "Buy and sell tax must each be between 0% and 10%, with at least one non-zero.": "买入税和卖出税都必须在 0% 到 10% 之间，并且至少一个不为 0。",
  "Anti-farmer duration must be 0–365 days.": "防抢池期限必须为 0–365 天。",
  "Approve the creator purchase, then confirm the atomic launch + first buy.": "请先授权创建者买入，然后确认原子化发行 + 首次买入。",
  "Approve the creator purchase, then confirm the atomic tax launch + first buy.": "请先授权创建者买入，然后确认原子化税费代币发行 + 首次买入。",
  "Confirm the tax-token launch transaction.": "请确认税费代币发行交易。",

  // Redesigned shell, home and launch surfaces.
  "Home": "首页",
  "Explore": "探索",
  "Burns": "销毁",
  "Rewards": "奖励",
  "Stats": "数据",
  "Docs": "文档",
  "Search": "搜索",
  "Profile": "个人主页",
  "Primary": "主导航",
  "Mobile": "移动导航",
  "Open menu": "打开菜单",
  "Close menu": "关闭菜单",
  "Language": "语言",
  "Public BSC Testnet alpha": "BSC 公开测试版",
  "Launches open": "发行已开放",
  "Launches paused": "发行已暂停",
  "LET'S MAKE SOMETHING FUN.": "一起做点有趣的事。",
  "Meme coins,": "Meme 币，",
  "paired with the BNB economy.": "与整个 BNB 经济配对。",
  "Launch against BNB, stablecoins, BNB-native assets, tokenized stocks, or eventually any compatible BEP-20 that passes Fortune's checks.": "可与 BNB、稳定币、BNB 原生资产、代币化股票配对发行，未来还将支持任何通过 Fortune 检查的兼容 BEP-20。",
  "Launch a token": "发行代币",
  "Explore tokens": "探索代币",
  "Every Standard launch": "每个 Standard 发行",
  "No mint or blacklist": "无增发、无黑名单",
  "0x…fe address": "0x…fe 地址",
  "CREATE2 vanity suffix": "CREATE2 靓号后缀",
  "Locked liquidity": "锁定流动性",
  "Pancake V3 LP, forever": "Pancake V3 LP 永久锁定",
  "Public BSC Testnet alpha. Mainnet remains fail-closed until the production release gates are complete.": "BSC 公开测试版。在正式发布闸门全部完成前，主网保持关闭。",
  "Real-value BNB Chain deployment. Availability is constrained by the reviewed onchain registry and release gates.": "真实资产的 BNB Chain 部署。可用范围受已审核的链上注册表和发布闸门限制。",
  "FORTUNE ON BNB": "BNB 上的 FORTUNE",
  "Make your own luck.": "好运，自己创造。",
  "THREE RULES": "三条规则",
  "The whole product should fit in your head.": "整个产品，一目了然。",
  "V2 IN REVIEW": "V2 审核中",
  "BNB NATIVE": "BNB 原生",
  "No dumping": "不砸盘",
  "Burn + Rewards v2 is being built so Fortune never sells the launch-token fee stream to fund rewards. Token-side fees burn. Pair-asset fees stay pair assets.": "Burn + Rewards v2 的设计确保 Fortune 永远不会出售发行代币的手续费来支付奖励。代币侧手续费直接销毁，配对资产侧手续费保持为配对资产。",
  "No reward-funded sell pressure.": "没有为支付奖励而产生的抛压。",
  "Holders get paid": "持有人获得回报",
  "The target Burn + Rewards market pays holder rewards in the pair asset itself — BNB, a stablecoin, a stock representation, or another reviewed BNB asset — without selling the meme coin first.": "目标中的 Burn + Rewards 市场直接以配对资产向持有人发放奖励——BNB、稳定币、股票代币或其他经审核的 BNB 资产——无需先卖出 Meme 币。",
  "Rewards in what the token trades against.": "奖励就是代币的配对资产。",
  "Pair with anything": "万物皆可配对",
  "Start with BNB. Expand into USDT/USDC, BTCB, ETH, CAKE, tokenized stocks/RWAs and eventually compatibility-checked BEP-20s.": "从 BNB 开始，逐步扩展到 USDT/USDC、BTCB、ETH、CAKE、代币化股票/RWA，最终支持通过兼容性检查的 BEP-20。",
  "The BNB economy becomes the pair menu.": "整个 BNB 经济都是你的配对菜单。",
  "HOW A LAUNCH WORKS": "发行流程",
  "Five short steps, checked onchain before you sign.": "五个简短步骤，签名前全部经过链上检查。",
  "Start a launch →": "开始发行 →",
  "Name it": "命名",
  "Name, ticker and a square image. These details are visible to everyone.": "名称、代码和一张方形图片。这些信息对所有人可见。",
  "Pick Standard": "选择 Standard",
  "Fixed supply with Pancake V3 graduation. Burn + Rewards stays in research.": "固定供应量，毕业至 Pancake V3。Burn + Rewards 仍在研究中。",
  "Choose a pair": "选择配对资产",
  "Only live registry-approved assets are selectable.": "只能选择链上注册表已批准的资产。",
  "Optional first buy": "可选首次买入",
  "Simulated with a minimum token output before it is submitted.": "提交前会模拟交易并设置最低代币输出。",
  "Review + launch": "检查并发行",
  "Fortune repeats the onchain preflight before your wallet signs.": "钱包签名前，Fortune 会再次执行链上预检查。",
  "FORTUNE LAUNCH SHIELD": "FORTUNE 发行护盾",
  "Snipers meet a shield in the first seconds.": "开盘最初几秒，狙击者会撞上护盾。",
  "Every Fortune curve opens with protocol-level anti-sniper protection. Shield proceeds reinforce liquidity instead of paying the creator.": "每条 Fortune 曲线开盘时都带有协议级防狙击保护。护盾收入用于加强流动性，而不是支付给创建者。",
  "How launches work →": "了解发行机制 →",
  "Opening buy tax": "开盘买入税",
  "Decays over the first five seconds": "在最初五秒内递减",
  "Per-wallet cap": "单钱包上限",
  "Cumulative buys in the first 15 seconds": "前 15 秒内的累计买入",
  "Exemptions": "豁免",
  "None": "无",
  "Creator wallets pay the shield too": "创建者钱包同样适用护盾",
  "Stuck launch rescue": "卡住发行的救援",
  "7 days": "7 天",
  "Then holders can trigger a pro-rata reserve rescue": "之后持有人可触发按比例的储备救援",
  "WHY BNB IS DIFFERENT": "为什么 BNB 与众不同",
  "A much larger pair universe than a meme-only launchpad.": "比纯 Meme 发行平台大得多的配对宇宙。",
  "Listing a category is not approval to launch against every asset in it. Fortune requires an exact BSC contract, compatible token behavior, oracle policy and graduation readiness before a pair becomes launchable.": "列出某个类别并不代表其中每个资产都可用于发行。配对资产可发行之前，Fortune 要求确切的 BSC 合约、兼容的代币行为、预言机策略以及毕业就绪。",
  "Pair registry →": "配对注册表 →",
  "BNB + majors": "BNB + 主流币",
  "WBNB first · BTCB / ETH expansion": "WBNB 优先 · 扩展至 BTCB / ETH",
  "Stablecoins": "稳定币",
  "USDT · USDC · FDUSD candidates": "USDT · USDC · FDUSD 候选",
  "CAKE and reviewed BEP-20 assets": "CAKE 及经审核的 BEP-20 资产",
  "xStocks · bStocks · eligibility-gated": "xStocks · bStocks · 需资格审核",
  "Any BEP-20": "任意 BEP-20",
  "Compatibility + oracle + liquidity review": "兼容性 + 预言机 + 流动性审核",
  "PUBLIC PROOF": "公开证明",
  "Burns, rewards and protocol stats belong in public ledgers.": "销毁、奖励和协议数据都应记录在公开账本中。",
  "Burn routes backed by public transaction evidence.": "由公开交易证据支撑的销毁路径。",
  "Pair-asset holder claims with a public ledger.": "以配对资产领取的持有人奖励，配有公开账本。",
  "Exact launch counts read from the factories.": "直接从工厂合约读取的精确发行数量。",
  "System status": "系统状态",
  "Live RPC, contract and release-gate checks.": "实时 RPC、合约和发布闸门检查。",
  "The same public data Fortune uses.": "与 Fortune 使用的相同公开数据。",
  "Try the full launch flow with valueless test assets first.": "先用无价值的测试资产体验完整发行流程。",
  "Every launch is checked onchain before your wallet signs.": "每次发行在钱包签名前都会经过链上检查。",
  "Testnet lab": "测试网实验室",
  "BNB CHAIN · CREATE": "BNB CHAIN · 创建",
  "Name it, choose a reviewed pair, then inspect the exact launch before your wallet signs.": "命名代币，选择经审核的配对资产，并在钱包签名前检查完整的发行参数。",
  "Launch steps": "发行步骤",
  "Name + ticker + image": "名称 + 代码 + 图片",
  "Pair asset": "配对资产",
  "First buy": "首次买入",
  "LIVE PREVIEW": "实时预览",
  "Your token": "你的代币",
  "Launch preview": "发行预览",
  "Pair": "配对",
  "Fee route": "手续费分配",
  "0.5% creator · 0.5% protocol": "0.5% 创建者 · 0.5% 协议",
  "Pancake V3 · locked LP": "Pancake V3 · 锁定 LP",
  "Token address": "代币地址",
  "Ends in fe": "以 fe 结尾",
  "Edit details": "编辑信息",
  "CONTENTS": "目录",
  "Contents": "目录",

  // Launch flow and page states.
  "PUBLIC BSC TESTNET ALPHA": "BSC 公开测试版",
  "MAINNET RELEASE GATED": "主网发布受闸门限制",
  "Create a valueless testnet Standard launch here. Use the testnet lab for the mock-asset faucet and detailed research controls.": "在这里创建无价值的测试网 Standard 发行。模拟资产水龙头和详细研究控制请前往测试网实验室。",
  "The Standard launch button unlocks only after all onchain and release checks pass.": "只有所有链上检查和发布检查通过后，Standard 发行按钮才会解锁。",
  "These details are visible to everyone.": "这些信息对所有人可见。",
  "Your token name": "你的代币名称",
  "Image URL or IPFS URI": "图片 URL 或 IPFS URI",
  "Host a square image publicly first. Fortune records this link immutably at launch; image upload hosting is still being prepared.": "请先公开托管一张方形图片。Fortune 会在发行时永久记录此链接；图片上传托管功能仍在准备中。",
  "Standard is the only mainnet candidate.": "Standard 是唯一的主网候选。",
  "Fixed supply · Pancake V3 · permanently locked LP position": "固定供应量 · Pancake V3 · 永久锁定 LP 仓位",
  "Pair-asset holder claims via Infinity hook · v2 in research": "通过 Infinity hook 以配对资产领取持有人奖励 · v2 研究中",
  "Separate testnet research and audit required": "需要单独的测试网研究和审计",
  "Pair policy →": "配对政策 →",
  "Search approved BNB assets": "搜索已批准的 BNB 资产",
  "Search approved pair assets": "搜索已批准的配对资产",
  "No approved pair found.": "未找到已批准的配对资产。",
  "Asset discovery alone does not mean an asset is safe to pair.": "被发现并不代表该资产可以安全配对。",
  "Zero means launch without a creator purchase.": "填 0 表示发行时不进行创建者买入。",
  "Amount in": "金额 ·",
  "pair asset": "配对资产",
  "The Launch Shield charges up to 99% on buys in the first five seconds, including a creator first buy. Fortune simulates the atomic transaction and sets a minimum token output before submitting it.": "Launch Shield 会在开盘前五秒内对买入收取最高 99% 的税，创建者首次买入也不例外。Fortune 会先模拟原子交易，并在提交前设置最低代币输出。",
  "Advanced · curve economics and profile links": "高级 · 曲线参数和资料链接",
  "These research defaults mirror the mainnet fork rehearsal. They remain subject to independent economic review and onchain preflight.": "这些研究默认值与主网分叉演练一致，仍需经过独立经济审查和链上预检查。",
  "Total token supply": "代币总供应量",
  "Slope · USD per token": "斜率 · 每代币美元",
  "Community treasury · optional": "社区金库 · 可选",
  "Defaults to creator wallet": "默认使用创建者钱包",
  "Website · optional": "网站 · 可选",
  "X · optional": "X · 可选",
  "Telegram · optional": "Telegram · 可选",
  "GitHub · optional": "GitHub · 可选",
  "YouTube · optional": "YouTube · 可选",
  "DeBox · optional": "DeBox · 可选",
  "Description · optional": "简介 · 可选",
  "Review and launch": "检查并发行",
  "Confirm the immutable details before signing.": "签名前请确认这些不可更改的信息。",
  "Review launch →": "检查发行 →",
  "STATUS": "状态",
  "Supply / target": "供应量 / 目标",
  "Creator first buy": "创建者首次买入",
  "Liquidity / mode": "流动性 / 模式",
  "Pancake V3 · Standard · fixed metadata": "Pancake V3 · Standard · 固定元数据",
  "Image URI": "图片 URI",
  "An approved pair and wallet transaction are required. Fortune checks the current chain, release state and onchain preflight again before any submission.": "需要已批准的配对资产和钱包交易。每次提交前，Fortune 都会再次检查当前链、发布状态和链上预检查。",
  "Checking launch…": "正在检查发行…",
  "Confirm in wallet →": "在钱包中确认 →",
  "Launch on BSC Testnet →": "在 BSC 测试网发行 →",
  "Launch paused": "发行已暂停",
  "The release manifest and live contract checks must pass before mainnet transactions unlock.": "主网交易解锁前，发布清单和实时合约检查必须通过。",
  "Need valueless fUSD or tBNB gas?": "需要无价值的 fUSD 或 tBNB Gas？",
  "Open the testnet lab and faucet →": "打开测试网实验室和水龙头 →",
  "That Fortune market was not found.": "未找到该 Fortune 市场。",
  "It may not be indexed yet, or the address/link may be incorrect.": "它可能尚未被索引，或者地址/链接有误。",
  "Back to Explore": "返回探索",
  "DEGRADED MODE": "降级模式",
  "This part of Fortune hit an error.": "Fortune 的这一部分出现了错误。",
  "The rest of the app can remain available. Retry this view without reconnecting your wallet or resubmitting a transaction.": "应用的其余部分仍可使用。无需重新连接钱包或重新提交交易，直接重试此视图即可。",
  "Retry": "重试",
  "Loading market data…": "正在加载市场数据…",
  "Core pages render independently from optional market-data providers.": "核心页面独立渲染，不依赖可选的市场数据提供方。",

  // Cinematic home: hero kicker, Q&A and closing quote.
  "BNB Smart Chain launchpad": "BNB Smart Chain 发行平台",
  "BEFORE YOU LAUNCH": "发行之前",
  "System": "系统",
  "Make your own luck,": "好运，自己创造，",
  "then let the chain prove it.": "再交给链上来证明。",
  "What is Fortune?": "Fortune 是什么？",
  "A BNB Smart Chain launchpad for meme coins. Name a token, choose a reviewed pair asset, optionally make the first buy, and launch a fixed-supply token on Fortune's curve.": "一个面向 Meme 币的 BNB Smart Chain 发行平台。为代币命名，选择经审核的配对资产，可选首次买入，然后在 Fortune 曲线上发行固定供应量的代币。",
  "Can I use real money yet?": "现在可以使用真实资金吗？",
  "No. Fortune is a public alpha on BSC Testnet with valueless test assets. The contracts are pre-audit, and mainnet stays disabled until independent review and every release gate pass.": "不可以。Fortune 目前是 BSC 测试网上的公开测试版，只使用无价值的测试资产。合约尚未完成审计，在独立审查和所有发布闸门通过之前，主网保持关闭。",
  "What does the Launch Shield do?": "Launch Shield 有什么作用？",
  "Every curve opens with a 99% buy tax that decays to zero within five seconds, plus a 2% per-wallet cap for the first 15 seconds. Creators are not exempt, and shield proceeds reinforce liquidity.": "每条曲线开盘时的买入税为 99%，并在五秒内递减至零；前 15 秒内每个钱包最多买入 2%。创建者不享有豁免，护盾收入用于加强流动性。",
  "What happens at graduation?": "毕业时会发生什么？",
  "Anyone can finalize graduation once a curve reaches its target. Standard launches move into Pancake V3 and the LP position is locked in Fortune's locker for good. Failed graduations stay retryable, and after seven days holders can trigger a pro-rata reserve rescue.": "曲线达到目标后，任何人都可以完成毕业。Standard 发行会迁移到 Pancake V3，LP 仓位被永久锁定在 Fortune 锁仓合约中。毕业失败可以重试；七天后，持有人可以触发按比例的储备救援。",
  "Which assets can I pair with?": "可以与哪些资产配对？",
  "Only assets approved in the onchain registry. The Standard mainnet candidate is pinned to WBNB; stablecoins, BNB majors, DeFi tokens and tokenized stocks arrive in separate, reviewed releases.": "只能使用链上注册表批准的资产。Standard 主网候选固定为 WBNB；稳定币、BNB 主流币、DeFi 代币和代币化股票会在单独审核的版本中陆续加入。",
  "Is Burn + Rewards live?": "Burn + Rewards 上线了吗？",
  "Not yet. Burn + Rewards v2 is research: token-side fees would burn and holders would be paid in the pair asset without selling the meme coin. It has its own audit boundary and no real-value deployment.": "还没有。Burn + Rewards v2 仍在研究中：代币侧手续费将被销毁，持有人将以配对资产获得奖励，而无需卖出 Meme 币。它有独立的审计边界，目前没有真实资产部署。",

  // Entry disclaimer and the full disclaimer in Docs.
  "Network status": "网络状态",
  "Before you enter Fortune": "进入 Fortune 之前",
  "Please read and confirm before continuing.": "请阅读并确认后再继续。",
  "Trading risk": "交易风险",
  "Meme coins are speculative. Prices can swing sharply, liquidity can disappear and you can lose everything you trade.": "Meme 币具有投机性。价格可能剧烈波动，流动性可能消失，你可能损失全部交易资金。",
  "Not financial advice": "非投资建议",
  "Fortune provides software and onchain data, not investment advice. Listings, rankings and charts are not endorsements, and no return is promised.": "Fortune 提供软件和链上数据，而非投资建议。上架、排名和图表均不构成背书，也不承诺任何回报。",
  "Your responsibility": "你的责任",
  "Check every token, approval and transaction in your wallet. Contracts can fail, scams exist and confirmed transactions cannot be reversed. Network fees apply.": "请在钱包中核对每个代币、每次授权和每笔交易。合约可能出错，骗局确实存在，已确认的交易无法撤销。交易需支付网络费用。",
  "Public testnet alpha": "公开测试网 Alpha",
  "Fortune currently runs on BSC Testnet with valueless test assets. The contracts are pre-audit and mainnet is disabled.": "Fortune 目前运行在 BSC 测试网上，使用无价值的测试资产。合约尚未审计，主网处于停用状态。",
  "I understand these risks and take responsibility for my own transactions.": "我了解上述风险，并对自己的交易负责。",
  "Continue to Fortune →": "继续进入 Fortune →",
  "Read the full disclaimer ↗": "阅读完整免责声明 ↗",
  "Risk disclaimer": "风险免责声明",
  "RISK DISCLAIMER": "风险免责声明",
  "Read this before you trade": "交易前请先阅读",
  "Eligibility": "使用资格",
  "Eligibility and jurisdiction terms will come from Fortune's legal review, which is still an open mainnet release gate. Confirming this disclaimer does not replace that review.": "使用资格和适用司法辖区条款将由 Fortune 的法律审查确定，该审查仍是尚未完成的主网发布关卡。确认本免责声明并不能替代该审查。",
  "Data can lag": "数据可能延迟",
  "Prices, charts, volume and rankings come from public BNB Chain RPC endpoints and can be delayed, incomplete or briefly unavailable. Confirm amounts and addresses in your wallet before you sign.": "价格、图表、交易量和排名来自公共 BNB Chain RPC 节点，可能延迟、不完整或短暂不可用。签名前请在钱包中确认金额和地址。",
};

function translateText(input: string) {
  const leading = input.match(/^\s*/)?.[0] || "";
  const trailing = input.match(/\s*$/)?.[0] || "";
  const normalized = input.trim().replace(/\s+/g, " ");

  if (!normalized) return input;

  const exact = ZH[normalized];
  if (exact) return leading + exact + trailing;

  let output = normalized;
  const replacements = Object.entries(ZH)
    .filter(([key]) => key.length >= 12 && output.includes(key))
    .sort((a, b) => b[0].length - a[0].length);

  for (const [english, chinese] of replacements) {
    output = output.replaceAll(english, chinese);
  }

  return leading + output + trailing;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const originals = useRef(new WeakMap<Text, string>());
  const attributeOriginals = useRef(
    new WeakMap<Element, Map<string, string>>()
  );
  const applying = useRef(false);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem("fortune-language", next);
    } catch {
      // Storage is optional.
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("fortune-language");
      if (stored === "zh" || stored === "en") {
        setLanguageState(stored);
      }
    } catch {
      // English remains the default.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";

    const translateNode = (node: Node) => {
      // User-supplied values (token names, URIs) opt out with translate="no".
      if (node instanceof Element && node.getAttribute("translate") === "no") {
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node as Text;
        if (text.parentElement?.closest('[translate="no"]')) return;
        const current = text.nodeValue || "";

        if (!originals.current.has(text)) {
          originals.current.set(text, current);
        }

        const original = originals.current.get(text) || current;
        const next = language === "zh" ? translateText(original) : original;

        if (text.nodeValue !== next) {
          text.nodeValue = next;
        }
        return;
      }

      if (!(node instanceof Element)) return;

      for (const attr of ["placeholder", "title", "aria-label"]) {
        const current = node.getAttribute(attr);
        if (!current) continue;

        let map = attributeOriginals.current.get(node);
        if (!map) {
          map = new Map<string, string>();
          attributeOriginals.current.set(node, map);
        }
        if (!map.has(attr)) map.set(attr, current);

        const original = map.get(attr) || current;
        const next = language === "zh" ? translateText(original) : original;
        if (current !== next) node.setAttribute(attr, next);
      }

      node.childNodes.forEach(translateNode);
    };

    const apply = () => {
      applying.current = true;
      translateNode(document.body);
      applying.current = false;
    };

    apply();

    const observer = new MutationObserver((mutations) => {
      if (applying.current) return;

      applying.current = true;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const text = mutation.target as Text;
          originals.current.set(text, text.nodeValue || "");
          translateNode(text);
        }

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            originals.current.set(node as Text, node.nodeValue || "");
          }
          translateNode(node);
        });
      }
      applying.current = false;
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage }),
    [language, setLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return value;
}
