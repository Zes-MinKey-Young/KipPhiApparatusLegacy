import { resolve } from "path";
import { isccDirectory, outPutDir } from "./constants"

async function runProgramAndPrintToConsole(cmd: string[], cwd?: string) {
    console.log(`运行：${cmd.join(" ")}`);
    const proc = Bun.spawn(cmd, {cwd});
    
    // 同时处理 stdout 和 stderr
    const stdoutPromise = (async () => {
        for await (const chunk of proc.stdout) {
            process.stdout.write(chunk);
        }
    })();
    
    
    // 等待所有输出处理完成和进程退出
    await Promise.all([stdoutPromise]);
    const exitCode = await proc.exited;
    
    if (exitCode !== 0) {
        throw new Error(`命令执行失败，退出码: ${exitCode}`);
    }
    
    console.log(`\n完成：${cmd.join(" ")}\n`);
}


async function compileBun() {
        await runProgramAndPrintToConsole(["bun", "build", "index.ts", "--compile", `--target=bun`, `--outfile=server`], "../server");
    
}
async function main() {


    const versionFile = Bun.file("../VERSION");
    const versionTsFile = Bun.file("../src/version.ts");
    const innoSetupFile = Bun.file("../install.iss");
    const version = await versionFile.text();
    console.log(`当前版本：${version}`);


    const nextVersion: string | null = prompt("输入新版本号");
    if (!nextVersion) {
        console.log("你咋不输入啊？");
        process.exit(1);
    }

    console.log("编译一下server/index.ts");
    await compileBun();


    const versionTsFileText = await versionTsFile.text();
    const versionInTs = /^\s*const VERSION = "([\.\d]+)";\s+$/.exec(versionTsFileText)

    if (!versionInTs || versionInTs[1] !== nextVersion) {
        prompt("version.ts里不是这个呀，我帮你改一下？");

        const target = `const VERSION = "${nextVersion}";\n`
        
        await Bun.write(versionTsFile, target);
        console.log(`已将${versionTsFileText}修改为${target}。`)
    } else {
        console.log("嗯，version.ts里是这个。");
        console.log(`版本号是${nextVersion}。`);
        console.log(`\x1b[32m${versionTsFileText}\x1b[0m`);
    }

    prompt("回车以继续。");

    const innoSetupFileText = await innoSetupFile.text()
    const matchResult = innoSetupFileText.match(/AppVersion=([0-9\.]+)/);
    const versionInIss = matchResult ? matchResult[1] : null;
    console.log("Inno Setup Script里是" + versionInIss)
    if (versionInIss !== nextVersion) {
        prompt("InnoSetup里不是这个呀，我帮你改一下？");
        let lines = innoSetupFileText.split("\r\n");
        lines = lines.map((line) => {
            if (line.startsWith("AppVersion=")) {
                line = `AppVersion=${nextVersion}`;
            } else if (line.startsWith("OutputBaseFilename=")) {
                line = `OutputBaseFilename=KPA_Setup_v${nextVersion}`;
            }
            return line;
        });
        const edited =  lines.join("\r\n")
        await Bun.write(innoSetupFile, edited);
        console.log("改好了，内容如下：");
        console.log(edited);
    } else {
        console.log("嗯，是对的");
        console.log(`\x1b[32m${innoSetupFileText}\x1b[0m`)
    }

    prompt("现在可以运行.iss文件了");
    await runProgramAndPrintToConsole([resolve(isccDirectory, "ISCC.exe"), "/O" + outPutDir, "install.iss"], "..");
    console.log("编译完成，结果在：", outPutDir);

    prompt("最后把VERSION修改");
    await Bun.write(versionFile, nextVersion);

    prompt("现在可以提交了");
    await runProgramAndPrintToConsole(["git", "add", ".."]);
    await runProgramAndPrintToConsole(["git", "commit", "-m", `chore: bump to ${nextVersion}`]);

    prompt("现在可以tag了");
    await runProgramAndPrintToConsole(["git", "tag", "v" + nextVersion]);

}


main()
