# 接码服务商扩展设计

## 目标

给当前分支的接码配置补上 `5sim` 和 `NexSMS`，同时保留当前分支已经存在的 `GPT-only`、默认展开、默认打开等行为。

## 范围

- `sidepanel/sidepanel.html`
  - 增加接码服务商选择。
  - 增加 `5sim` / `NexSMS` 的配置项展示区域。
- `sidepanel/sidepanel.js`
  - 保存并回填新增配置。
  - 根据选中的接码服务商切换显示对应配置项。
- `background.js`
  - 增加新增配置的默认值和持久化归一化逻辑。
  - 把新增常量注入接码 helper。
- `background/phone-verification-flow.js`
  - 在现有 HeroSMS 逻辑基础上，增量增加 `5sim` / `NexSMS` 的取号、轮询验证码、国家配置解析。

## 设计原则

- 不整体覆盖 `master` 文件，只参考其实现并拆成当前分支可接受的最小增量。
- 不改动当前分支已完成的流程控制逻辑，尤其是 `gptOnlyModeEnabled` 相关步骤裁剪。
- 优先补齐“能配置 + 能实际使用”所需最小能力，不顺带引入无关重构。

## 数据模型

新增持久化字段：

- `phoneSmsProvider`
- `phoneSmsProviderOrder`
- `fiveSimApiKey`
- `fiveSimBaseUrl`
- `fiveSimCountryOrder`
- `fiveSimOperator`
- `fiveSimProduct`
- `nexSmsApiKey`
- `nexSmsBaseUrl`
- `nexSmsCountryOrder`
- `nexSmsServiceCode`

## 行为约束

- HeroSMS 仍然保持默认服务商。
- 5sim / NexSMS 只在被选为当前服务商时参与当前轮取号与轮询。
- `submitPhoneNumber` 需要按激活记录里的 provider / country 信息回填国家参数，不能再假定只有 HeroSMS 国家 ID。

## 测试策略

- 先补失败测试：
  - 面板 HTML/设置收集与显示切换。
  - 5sim 取号。
  - NexSMS 取号或验证码轮询。
- 再做最小实现直至测试转绿。
