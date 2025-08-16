**此仓库不会接受后续更新，1.7版本将另建仓库发布。（也可能是2.0版本，敬请期待）**

**[Phigros自制谱Wiki](https://pgrfm.miraheze.org/)为本软件的官方网站。**

奇谱发生器（简称KPA），新概念Phigros制谱器，使用TypeScript编写。

Kipphi Apparatus (KPA), A New concept Phigros Chart Editor written in TypeScript.

URL：https://pgrfm.miraheze.org/wiki/%E5%A5%87%E8%B0%B1%E5%8F%91%E7%94%9F%E5%99%A8

查阅Wiki上的“KDP:"页面以了解一些未来规划。

View the "KDP:" pages in the Wiki to learn about future plans.

# 理念

奇谱发生器主张尽可能少地使用键盘而只需鼠标操作谱面，期望对移动平台有良好的兼容性。同时，奇谱发生器尽可能不增加播放器作者的负担，故其谱面格式引入的所有新概念、特性都可以“编译”到更低级的格式，如RPEJSON。

奇谱发生器主张增加复用性，类似于编程中的函数和wikitext中的模板。

奇谱发生器期望编辑事件可以像剪辑视频那样。奇谱发生器中事件通过横向坐标曲线图呈现和编辑，事件不与音符编辑区域对齐。奇谱发生器中编辑的不是事件而是事件节点。事件序列中的所有事件都是连续的（即所有终止节点后都有开始节点，事件序列的最后一个节点是开始节点，以便添加）。

# Concepts

KPA tries to use keyboard less and use mouse more, expecting a good compatibility on mobile platforms. Meanwhile, KPA gives work to player authors as little as possible, so all the new concepts and features introduced to its chart format can be "compiled" to a junior format, such as RPEJSON.

KPA tries to increase reusability, like functions in programming and templates in wikitext.

KPA expects editing events like editing videos. In KPA, Events are presented and edited in a horizontal coordination graph of curves, not adjusted to Notes' Editing Area. What you edit is EventNodes instead of Events. All the Events in Event Node Sequences are continuous, i. e. each End Node has Start Node after them, and the last Node is Start Node, so that it is easy to append Nodes.

# 使用
访问https://zes-minkey-young.github.io/kpa/html

或者下载发布版本（发布版本有服务器）

本软件没有发布NPM包，若需要谱面解析可直接复制谱面部分的文件，这些文件所在的路径需要附上原许可。

# Usage
Visit https://zes-minkey-young.github.io/kpa/html

Or download the releases (with server)

No npm package is released for this software. If you want to parse charts you can copy the files of the chart and attach licenses to their directory.

# 开发
本仓库使用TypeScript编写，使用VSCode开发。由于文件之间的类、接口等引用交错复杂，故采用直接编译到一个文件的方式，而不是使用ESModule的方式。欢迎为本项目做出贡献。

src文件夹内有三个tsconfig，一个为总config，另外两个分别为diff和index的config。

开发此项目时，由于这两个项目之间有交叉，不使用扩展来执行自动编译。scripts文件夹下有监听脚本compilerOnSave.ts（用Bun运行即可），可用于自动编译。由于本仓库上传了`.vscode`文件夹，通常您不需要额外配置。



# Development
This repository is written in TypeScript and developed in VSCode. Due to the complex interrelationship between files, this repository uses a single file to compile all the files, instead of using ESModule. Welcome to contribute to this project.

Inside the src folder, there are three tsconfig files:

- One serves as the main configuration
- The other two are dedicated configurations for diff and index respectively.
During development of this project, automatic compilation via extensions is not used due to interdependencies between these two projects.

Under the scripts folder, there is a watch script compilerOnSave.ts (executable via Bun) that enables automatic compilation.

Since this repository includes the .vscode folder, no additional configuration is typically required.

# 配置
奇谱发生器本地服务端使用Bun编译，至少Windows 10系统方可使用。若遇到BUG或有一些好的建议，请在本仓库创建一个Issue。亦可加入奇谱发生器QQ群：478824121。

后续可能会推出不使用Bun的版本。

# Configuration

KPA uses Bun to compile local server, at least Windows 10 is required. If you encounter a bug or have some good suggestions, please create an issue in this repository. You can also join the KPA QQ group: 478824121.

Versions without Bun may be released in the future.
