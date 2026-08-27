# Production startup fail-fast assertion

- Date: 2026-08-28 (Asia/Shanghai)
- Build: Next.js 15.5.21 production build
- Test port: 3199
- Input: `NODE_ENV=production` with deliberately short synthetic session and audit secrets
- Expected: process exits non-zero before serving traffic
- Result: **pass**

Observed result:

```text
[startup-config] production startup rejected Error: 生产环境必须配置至少 32 字符的 ERP_SESSION_SECRET
exit code: 1
port 3199 after exit: closed
```

Production secrets were not used or printed. This test also verifies that the
validation remains out of the image build phase, so credentials are not baked
into the image, while the Node runtime refuses to remain online with unsafe
configuration.
