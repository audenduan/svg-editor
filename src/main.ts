/**
 * 程序入口（脚手架阶段）。
 *
 * 本阶段只负责打印启动横幅，用来验证 "npm run build → node dist/src/main.js"
 * 这条链路是通的。REPL / 命令分发会在后续提交里替换掉这里的内容。
 */
const BANNER = "svg-editor 0.1 — type 'help' for commands";

process.stdout.write(`${BANNER}\n`);
