# GitHub Token 获取与使用说明 / GitHub Token Guide

## 中文说明

1. 登录你的 GitHub 账号：https://github.com
2. 点击右上角头像，选择【Settings】（设置）。
3. 在左侧菜单选择【Developer settings】（开发者设置）。
4. 点击【Personal access tokens】（个人访问令牌），再点击【Tokens (classic)】。
5. 点击【Generate new token】，选择【Generate new token (classic)】。
6. 填写名称（Note）、设置有效期（Expiration），勾选 `public_repo` 权限（如只需访问公开仓库）。
7. 滚动到页面底部，点击【Generate token】。
8. 复制生成的 Token，粘贴到本应用的 GitHub Token 输入框并保存。

> ⚠️ 请妥善保管你的 Token，不要泄露给他人。只需 `public_repo` 权限即可访问公开仓库。

---

## English Guide

1. Log in to your GitHub account: https://github.com
2. Click your avatar in the top right corner and select **Settings**.
3. In the left menu, choose **Developer settings**.
4. Click **Personal access tokens**, then **Tokens (classic)**.
5. Click **Generate new token**, then **Generate new token (classic)**.
6. Fill in a name (Note), set an expiration date, and check the `public_repo` permission (for public repo access only).
7. Scroll down and click **Generate token**.
8. Copy the generated token and paste it into the GitHub Token input box in this app, then save.

> ⚠️ Keep your token safe and do not share it with others. For public repo access, only the `public_repo` permission is required.

---

## 常见问题 / FAQ

- **Q: Token 需要哪些权限？/ What permissions are required?**
  - 只需勾选 `public_repo` 即可访问公开仓库。
  - Only `public_repo` is required for public repositories.

- **Q: Token 会不会泄露？/ Is my token safe?**
  - Token 只保存在本地配置，不上传服务器。
  - The token is stored locally and never uploaded to any server.

- **Q: Token 失效怎么办？/ What if my token expires?**
  - 重新生成并替换即可。
  - Just generate a new one and update it in the app. 