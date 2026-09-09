# 任务协作成长链路截图索引

测试日期：2026-09-09
浏览器：系统 Chrome，1280 × 720 视口
数据环境：隔离 PostgreSQL 数据库 `erp_relationship_e2e`
测试入口：`tests/e2e/warehouse-relationship-growth-flow.spec.ts`

快速总览：[16 步联系表](contact-sheet.png)

| #   | 截图                                                                                       | 验证结果                                        |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1   | [邀请任务负责人](screenshots/01-owner-invites-warehouse-manager.png)                       | 邀请方明确选择任务负责人，并看到关系边界        |
| 2   | [未注册邀请页](screenshots/02-unregistered-invitee-understands-scope.png)                  | 被邀请人知道任务范围、角色、邮箱和“不加入企业”  |
| 3   | [限定邮箱注册](screenshots/03-invite-scoped-personal-registration.png)                     | 邀请邮箱只读，注册的是个人账号                  |
| 4   | [注册后接受](screenshots/04-registered-account-before-acceptance.png)                      | 账号建立后仍需显式接受关系                      |
| 5   | [任务空态](screenshots/05-empty-task-portal-with-navigation.png)                           | 无任务时仍可去合作关系、账号和创建企业          |
| 6   | [个人协作中心](screenshots/06-relationship-home-explains-long-term-options.png)            | 页面解释未来任务入口和两条长期发展路径          |
| 7   | [任务负责人调度视图](screenshots/07-manager-dispatch-view-keeps-recipient-private.png)     | 负责人可见任务类型并可指派，未执行前客户地址隐藏 |
| 8   | [指派任务协作者](screenshots/08-manager-assigned-task-to-operator.png)                     | 指派落库且页面显示等待对方领取                  |
| 9   | [可选创建 ERP](screenshots/09-optional-own-erp-onboarding.png)                             | 创建企业不是强制动作，可返回外部协作            |
| 10  | [进入自己的 ERP](screenshots/10-same-account-enters-own-erp.png)                           | 同一账号进入独立企业/店铺配置，外部协作入口保留 |
| 11  | [升级企业合作请求](screenshots/11-personal-relationship-upgraded-to-company-request.png)   | 从既有任务协作关系向邀请方发起企业连接          |
| 12  | [邀请方收到连接请求](screenshots/12-inviter-receives-company-connection-request.png)       | 邀请方可确认真实经营主体，且无需联系人档案      |
| 13  | [连接建立但未授权数据](screenshots/13-company-connection-confirmed-without-data-grant.png) | 企业连接只确认身份，不自动开放库存/成本/订单    |
| 14  | [明确指定企业可见](screenshots/14-explicit-offer-grant-to-connected-company.png)           | 货主主动选择连接企业和分账说明后发布            |
| 15  | [对端只见授权货盘](screenshots/15-own-erp-sees-only-explicitly-shared-offer.png)           | 对端 ERP 看见指定货盘，但看不到内部成本         |
| 16  | [断开连接立即撤权](screenshots/16-disconnection-revokes-future-offer-access.png)           | 原详情返回不泄露存在性的 404，并提供返回入口    |

## 视觉审计结论

整体健康度：通过。链路从“个人受邀”到“长期企业合作”已形成闭环，空态不再是死胡同，关系和数据边界在关键决策页面均有解释。

主要优势：关系与入口保持通用，任务卡片显示具体类型；创建 ERP 明确可选；个人工作与自己的企业空间并行；企业连接与库存授权分开；撤权结果可见。

剩余风险：邮箱真实性仍依赖邀请发送渠道；任务负责人同时具备亲自执行能力，需要继续依靠“领取后才显示地址”的规则保护隐私；未来新增任务类型时不能绕过底层能力表。

无障碍检查范围：本轮验证了语义化 heading、button、link、label、tab 和状态提示可由浏览器角色定位；没有完成屏幕阅读器真人测试、全链路键盘巡检和对比度仪器测量，这三项应在公网发布前补做。

捕获限制：当前工作区没有可用的应用内 Browser 工具，因此截图由仓库既有 Playwright + 系统 Chrome 生成；每张截图前均有程序化断言，且已逐张人工视觉检查。
