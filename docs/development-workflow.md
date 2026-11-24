# 开发流程速查

这份文档回答三个问题：开工前做什么、改完怎么交、发布前检查什么。第一次做开发时看一眼就够。

## 一、开工前

拿到一个新改动，先确认三件事，别急着写代码。

1. 开一个分支，名字说明这次要干什么：`git switch -c fix/settings-tab-switch`。所有改动都留在这个分支上。
2. 确认它在做什么：一句话写下“改之前是什么现象，改完之后应该是什么样”。这句话后面要填进 Pull Request。
3. 跑一遍现有检查，确认起点是干净的：`npm test`。如果这一步就红了，先修好再动手。

主分支 `main` 上不要直接改东西。改坏了想回退时，会分不清哪些是这次的、哪些是原来的。

## 二、改的过程中

一次只做一件事。想把两件事一起改，就开两个分支。这样出问题时能单独撤回，评审时也容易看懂。

改完就验证，别攒到最后：

```powershell
npm test                  # 单测，最快，每次改完都跑
npm run check:generated   # 如果改了 dist/ 或 src/，跑这个确认生成物一致
npm run test:desktop      # 如果改了桌面窗口、菜单、托盘，跑这个
```

改了 `dist/` 里的文件，要先 `npm run build` 再跑 `check:generated`。只改测试或脚本则不用。

## 三、交出去

1. 先看这次到底改了什么：`git status` 和 `git diff --stat`。确认没有夹带私人笔记、附件、密钥或 `release/` 里的安装包。
2. 提交：`git commit -m "修复设置页切换标签不刷新"`。信息写“做了什么、解决什么问题”，不要写“更新一下”“改改”。
3. 推送并开 Pull Request：`git push -u origin fix/settings-tab-switch`，然后在 GitHub 上按模板填。
4. 等 CI 变绿再合并。CI 跑的就是上面那几条命令，本地通过通常就意味着远端通过。

合并方式默认用 squash：一个分支压成一个提交进 `main`，历史干净。代价是分支上的提交 SHA 会变，所以判断“某个分支是否已合并”要看文件内容，不能只比提交号。

## 四、发布前

发布只做一次，做完不要重来。顺序是：

1. 同步改 `package.json` 和 `package-lock.json` 的版本号。
2. 在 `CHANGELOG.md` 顶部加一条，写清楚改了什么。
3. 本地跑 `npm test` 和 `npm run test:release`。
4. 提交版本号改动，合并到 `main`。
5. 打标签并推送：`git tag v1.0.63` 然后 `git push origin v1.0.63`。
6. GitHub Actions 会自动构建、校验、发布到 Releases。

同一版本号不能重复发。构建中途失败时，用 Actions 里的 “Recover existing draft release” 输入原始运行编号恢复，不要重新打标签。

## 五、收尾

分支合并后删掉它，本地和远端都删：`git push origin --delete fix/settings-tab-switch`。多余的分支攒多了，下一步该做什么会看不清。

Dependabot 的升级分支属于正常待办，合并或关掉时说明理由即可，不要随手批量删除。

## 六、环境

本项目要求 Node 24，版本写在 `.nvmrc`。如果本机默认不是 24，在当前终端执行以下命令切换，然后再跑测试：

```powershell
. D:\AI\Codex\Fomo\work\use-node24.ps1
```

按 `work/setup-profile.ps1` 的一次性设置装好自动切换后，进入仓库目录就会自动用 Node 24，这一步可以省略。
