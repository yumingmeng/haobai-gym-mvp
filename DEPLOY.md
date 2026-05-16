# 浩柏健身 MVP 部署说明

这个版本支持 Render 免费临时部署：Node 服务 + 演示数据 + 后台口令。

目标是让别人即使在你的电脑关机后，也能通过 Render 提供的公网链接打开 MVP。

## 必填环境变量

- `ADMIN_PASSWORD`: 教练后台访问口令，部署时务必改掉。
- `DATA_DIR`: 可选。免费 Render 部署建议不设置，直接使用项目里的演示数据。
- `PORT`: 平台通常会自动注入；本地默认 `5173`。

默认本地后台口令是 `haobai2026`。正式部署时不要使用默认值。

## Render 免费部署

1. 把项目上传到 GitHub。
2. 在 Render 里选择 Blueprint 或 Web Service。
3. 使用本项目的 `render.yaml`，Render 会读取：
   - Build Command: `npm install`
   - Start Command: `npm start`
4. 在 Render 环境变量里设置：
   - `ADMIN_PASSWORD`: 你自己的后台口令
5. 选择 Free 实例。
6. 部署成功后，Render 会给一个 `https://...onrender.com` 链接。

免费部署的限制：

- 电脑关机后，别人依然可以打开 Render 链接。
- 免费服务空闲一段时间后可能休眠，第一次打开会慢一些。
- 不挂 Persistent Disk，所以后台新增/编辑的数据不保证长期保存；服务重启或重新部署后，可能恢复到项目内置演示数据。
- 适合给别人看 MVP，不适合正式运营。

如果后续要长期保存教练录入的数据，再升级到付费实例 + Persistent Disk，或者接入正式数据库。

## Fly.io 部署

1. 安装并登录 Fly CLI。
2. 修改 `fly.toml` 里的 `app = "haobai-gym-mvp"`，换成一个全网唯一的应用名。
3. 创建应用：
   ```bash
   fly apps create 你的应用名
   ```
4. 创建持久化卷：
   ```bash
   fly volumes create haobai_gym_data --size 1 --region hkg
   ```
5. 设置后台口令：
   ```bash
   fly secrets set ADMIN_PASSWORD=你的后台口令
   ```
6. 部署：
   ```bash
   fly deploy
   ```

部署成功后，Fly 会给一个 `https://你的应用名.fly.dev` 链接。

## 本地运行

```bash
npm start
```

打开：

```text
http://localhost:5173
```

学员端模拟验证码：`123456`

## 当前安全边界

这个版本适合小范围演示和试点，不是完整生产系统。它已经保护后台写操作，但学员数据模型、短信验证码、正式账号体系、操作审计和数据库权限还需要在正式商业使用前继续升级。
