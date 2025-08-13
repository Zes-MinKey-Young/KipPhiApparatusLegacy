const NODE_WIDTH = 20;
const NODE_HEIGHT = 20;

const NOTE_WIDTH = 54;
const NOTE_HEIGHT = 6



enum JudgeLinesEditorLayoutType {
    ordered = 0b001,
    tree    = 0b010,
    grouped = 0b100
}

class JudgeLinesEditor extends Z<"div"> {
    editor: Editor;
    chart: Chart;
    element: HTMLDivElement;
    // orphans: JudgeLine[]
    editors: Map<JudgeLine, JudgeLineEditor>;
    metaLineAdded = false;
    layoutType: JudgeLinesEditorLayoutType = JudgeLinesEditorLayoutType.ordered;
    constructor(editor: Editor, element: HTMLDivElement) {
        super("div", false);
        this.chart = editor.chart;
        this.editor = editor
        this.element = element;
        this.orderedLayout();
    }
    private _selectedLine: JudgeLine;
    get selectedLine() {
        return this._selectedLine
    }
    set selectedLine(line: JudgeLine) {
        if (this._selectedLine === line) {
            return;
        }
        if (this._selectedLine) {
            const editors = this.editors.get(this._selectedLine);
            editors.removeClass("judge-line-editor-selected");
        }
        this._selectedLine = line;
        this.editor.notesEditor.target = line;
        this.editor.eventCurveEditors.changeTarget(line)
        const editr = this.editors.get(line);
        editr.addClass("judge-line-editor-selected")
        
        this.editor.player.greenLine = line.id;
        this.editor.eventCurveEditors.draw();
        this.editor.notesEditor.draw();
    }
    private orderedLayout() {
        this._selectedLine = null; // Set as null first so that the editor is correctly selected
        // 用这个减少回流（内部实现用了文档碎片）
        this.appendMass(() => {
            this.html("");
            this.editors = new Map();
            for (const line of this.chart.judgeLines) {
                const editor = new JudgeLineEditor(this, line);
                this.registerEditor(editor);
                this.append(editor);
            }
        });
        this.selectedLine = this.chart.judgeLines[0];
    }
    private collapseStack: Array<ZCollapseController>;
    private treeLayout() {
        this._selectedLine = null;
        this.appendMass(() => {
            this.html("");
            this.editors = new Map();
            this.collapseStack = [];
            for (const line of this.chart.orphanLines) {
                this.addIndentedLineEditor(line, 0);
            }
        });
        this.selectedLine = this.chart.judgeLines[0];
    }
    private addIndentedLineEditor(line: JudgeLine, indentLevel: number) {
        const isFather = line.children.size > 0;
        const $collapse = isFather ? new ZCollapseController(false) : $("div");
        const editer = new JudgeLineEditor(this, line, $collapse);
        for (const $col of this.collapseStack) {
            $col.attach(editer);
        }
        if (isFather) {
            editer.addClass("judge-line-editor-father");
            this.collapseStack.push($collapse as ZCollapseController);
        }
        this.registerEditor(editer);
        this.append(editer);
        editer.css("marginLeft", indentLevel * 2 + "em");
        for (const child of [...line.children].sort((a, b) => a.id - b.id)) {
            this.addIndentedLineEditor(child, indentLevel + 1);
        }
        if (isFather) {
            this.collapseStack.pop();
        }
    }
    private groupedLayout() {
        this._selectedLine = null;
        this.appendMass(() => {
            this.html("");
            this.editors = new Map();
            for (const group of this.chart.judgeLineGroups) {
                const groupEditor = new GroupEditor(group);
                this.append(groupEditor);
                for (const line of group.judgeLines) {
                    const editr = new JudgeLineEditor(this, line);
                    this.registerEditor(editr);
                    this.append(editr);
                    groupEditor.$collapse.attach(editr);
                }
            }
        });
        this.selectedLine = this.chart.judgeLineGroups[0].judgeLines[0];
    }
    registerEditor(editor: JudgeLineEditor) {
        const line = editor.judgeLine;
        this.editors.set(line, editor);
    }
    update() {
        for (const [_line, editr] of this.editors) {
                editr.update();
        }
    }
    reflow(type: JudgeLinesEditorLayoutType = this.layoutType) {
        if (type !== this.layoutType) {
            this.layoutType = type;
        }
        switch (type) {
            case JudgeLinesEditorLayoutType.ordered:
                this.orderedLayout();
                break;
            case JudgeLinesEditorLayoutType.grouped:
                this.groupedLayout();
                break;
            case JudgeLinesEditorLayoutType.tree:
                this.treeLayout();
                break;
        }
        this.dispatchEvent(new Event("reflow"));
    }
}

class GroupEditor extends Z<"div"> {
    $collapse = new ZCollapseController(false);
    constructor(public target: JudgeLineGroup) {
        super("div");
        this.addClass("group-editor")
        this.append(this.$collapse, $("span").text(target.name));
    }
}

class JudgeLineEditor extends Z<"div"> {
    element: HTMLDivElement;
    judgeLine: JudgeLine;
    $id: Z<"div">;
    $name: ZInputBox;
    $xSpan: Z<"span">;
    $ySpan: Z<"span">;
    $thetaSpan: Z<"span">;
    $alphaSpan: Z<"span">;
    constructor(public readonly linesEditor: JudgeLinesEditor, judgeLine: JudgeLine, $collapse: Z<"div"> = $("div")) {
        super("div");
        this.judgeLine = judgeLine;
        this.addClass("judge-line-editor")
        this.$id = $("div").addClass("judgeline-info-id");
        this.$id.text(this.judgeLine.id + "")
        this.$name = new ZInputBox()
        this.$name
            .addClass("judgeline-info-name")
            .setValue(judgeLine.name)
            .whenValueChange((s) => {
                let m = s.match(/^\.(father|group)\s+?\=\s+?(.+)$/);
                if (m) {
                    let [_, type, name] = m;
                    if (type == "father") {
                        if (!name.match(/^[0-9]+$/)) {
                            return false;
                        }
                        const id = parseInt(name);
                        const lines = editor.chart.judgeLines;
                        if (id >= lines.length) {
                            return false;
                        }

                        judgeLine.father = lines[id];
                    } else if (type == "group") {
                        const mayBeGroup = editor.chart.judgeLineGroups.find(group => group.name === name);
                        mayBeGroup.add(judgeLine);
                    }
                    return false;
                }
                judgeLine.name = s
            });
        this.$xSpan = $("span");
        this.$ySpan = $("span");
        this.$thetaSpan = $("span");
        this.$alphaSpan = $("span");
        this.append(
            this.$id,
            this.$name,
            $collapse,
            $("span").text("x: "),
            this.$xSpan,
            $("span").text("y: "),
            this.$ySpan,
            $("span").text("θ: "),
            this.$thetaSpan,
            $("span").text("α: "),
            this.$alphaSpan
        )
        this.onClick(() => {
            this.linesEditor.selectedLine = this.judgeLine;
        });
        this.update();
    }
    update() {
        const line = this.judgeLine
        const {moveX, moveY, rotate, alpha} = line;
        this.$xSpan.text(typeof moveX === "number" ? shortenFloat(moveX, 2) + "" : "N/A")
        this.$ySpan.text(typeof moveY === "number" ? shortenFloat(moveY, 2) + "" : "N/A")
        this.$thetaSpan.text(typeof rotate === "number" ? shortenFloat(rotate / Math.PI * 180, 2) + "" : "N/A")
        this.$alphaSpan.text(typeof alpha === "number" ? Math.round(alpha) + "(" + Math.round(alpha).toString(16) + ")" : "N/A")
    }
}




class SaveDialog extends ZDialog {
    $message: ZInputBox
    chartData: ChartDataKPA;
    $clearsOperationList= new ZSwitch("Clears operation list");
    constructor() {
        super()
        this.append($("span").text("Message"));
        this.$message = new ZInputBox();
        this.$message.attr("placeholder", "Enter Commit Message")
        this.append(this.$message);
        this.append(new ZButton("Save")
            .addClass("progressive")
            .onClick(() => {
            this.close();
            this.dispatchEvent(new CustomEvent("save", { detail: this.$message.getValue()}));
        }));
        this.append(new ZButton("Cancel")
            .addClass("destructive")
            .onClick(() => this.close()));
        this.append(this.$clearsOperationList)
        // @ts-expect-error Here customEvent must be CustomEvent
        this.addEventListener("save", (customEvent: CustomEvent) => {
            console.log("save", customEvent.detail)
            serverApi.uploadChart(this.chartData, customEvent.detail)
                .then((successful) => {
                    this.dispatchEvent(new Event("saved"))
                })
        });
    }
}


const tips = [
    "奇谱发生器是Phigros自制谱界最好用的制谱器，每天不写30个奇谱就会有300条判定线在我身上爬",
    "你说得对，但是奇谱发生器是由Zes Minkey Young自主研发的一款制谱器，后面的忘了",
    "本制谱器没有使用lchzh3473的sim-phi制作",
    "制谱器一定要有谱面✍✍✍✍✍✍✍✍",
    "[露出了6号缓动]",
    "本软件是“奇谱发生器”，不是“八股谱发生器”更不是“粪谱发生器”",

    "撤销重做、复制粘贴不需要Ctrl，直接按Z/Y/C/V即可",

    "天苍苍，野茫茫，风吹草低见牛羊",
    "闊靛緥婧愮偣",
    "至此，，，，",
    "国王的船员们说阿门",
    "一觉醒来，全世界制谱水平下降1%，而你不变",
    "我-我-要-要-投-诉-你！",
    "横眉冷对千夫指，俯首甘为孺子牛",

    "比起模板缓动，我更喜欢你！",

    "美食大赛是一款快速高效的JavaScript运行时",
    "新的 可扩展标记语言超文本传输协议请求 括弧",
    "Error: Cannot create an instance of abstract class 'Fruit' at line 3 '我不吃苹果和香蕉，医生让我吃水果'",
    "讲个笑话：睡眠排序的时间复杂度是O(N)",

    "玩诶喝沸诗俺会生辉",
    "半罐水响叮当，一罐水响叮叮当当",
    "十二年寒窗苦读，曾经那个弱不禁风的小男孩已经长成了一个弱不禁风的大男孩",
    "沉默是金，晚的康桥",
    "面包的价格是50万马克，所以你选择钝角，并将答案标在试卷上",
    "化学老师发出了尖锐的爆鸣声",
    "把你故事的参考文献讲出来，看看是不是在出版社里面。你昨天在这里输出日志，只有你猜中考题是二分查找",
    "好的菜会被下架吗？好的老师会被开除吗？好的话会被擦掉吗？会吗？会吗？",
    "20岁吃过砒霜，现在已经18岁了",
    "对手使用了电石，你的启普发生器爆炸了",
    "从今天起，做一个幸福的人，劈马，喂柴，周游世界",
    "不积极阅读乐学学术力作",
    "运动降低人到封建礼教的能量传递效率",
    "Taq酶会解决问题的",

    "你说的对，但是《Air Ticket Extend》是由SWORDNEW...SWORDGAME.EXE自主研发的一款文字剧情冒险游戏，中间的忘了，揭开『科学』『魔法』的真相。",
];

const generateTipsLabel = (): Z<"div"> => {
    const $div = $("div");
    $div.addClass("tips-label")
    let id;
    const changeText = () => {
        $div.text("Tips:" + tips[Math.floor(Math.random() * tips.length)])
    }
    const update = () => id = setTimeout(() => {
        changeText();
        id = null;
        update()
    }, 10_000)
    $div.onClick(() => {
        if (id) clearTimeout(id)
        changeText();
        update()
    })
    changeText();
    update();
    return $div
}



class Editor extends EventTarget {
    initialized: boolean;
    chartInitialized: boolean;
    audioInitialized: boolean;
    imageInitialized: boolean;

    player: Player;
    notesEditor: NotesEditor;
    chart: Chart;
    operationList?: OperationList;
    chartType: "rpejson" | "kpajson";
    chartData: ChartDataRPE | ChartDataKPA;
    progressBar: ZProgressBar;
    eventCurveEditors: EventCurveEditors

    
    readonly $topbar: Z<"div"> = $<"div">(<HTMLDivElement>document.getElementById("topbar"));
    readonly $preview: Z<"div"> = $<"div">(<HTMLDivElement>document.getElementById("preview"));
    readonly $noteInfo: Z<"div"> = $<"div">(<HTMLDivElement>document.getElementById("noteInfo"));
    readonly $eventSequence: Z<"div"> = $<"div">(<HTMLDivElement>document.getElementById("eventSequence"));
    readonly lineInfoEle: HTMLDivElement = <HTMLDivElement>document.getElementById("lineInfo");
    readonly playButton: HTMLButtonElement;
    readonly $timeDivisor: ZArrowInputBox;
    timeDivisor: number
    readonly $saveButton = new ZButton("保存");
    readonly $compileButton = new ZButton("编译");
    readonly $playbackRate: ZDropdownOptionBox;
    readonly $offsetInput = new ZInputBox().attr("size", "3");
    readonly $switchButton = new ZButton("切换");
    readonly $judgeLinesEditorLayoutSelector = new ZDropdownOptionBox([
        new BoxOption("Ordered", () => { this.judgeLinesEditor.reflow(JudgeLinesEditorLayoutType.ordered) }),
        new BoxOption("Grouped", () => { this.judgeLinesEditor.reflow(JudgeLinesEditorLayoutType.grouped) }),
        new BoxOption("Tree", () => { this.judgeLinesEditor.reflow(JudgeLinesEditorLayoutType.tree) })
    ]);
    readonly $tipsLabel: Z<"div">;

    judgeLinesEditor: JudgeLinesEditor;
    selectedLine: JudgeLine;
    noteEditor: NoteEditor;
    eventEditor: EventEditor;
    judgeLineInfoEditor: JudgeLineInfoEditor;
    userScriptEditor: UserScriptEditor;
    multiNoteEditor: MultiNoteEditor;
    multiNodeEditor: MultiNodeEditor;

    renderingTime: number;
    lastRenderingTime: number;
    $saveDialog: SaveDialog;


    constructor() {
        super()
        this.initialized = false;
        this.imageInitialized = false;
        this.audioInitialized = false;
        this.chartInitialized = false

        // load player
        this.player = new Player(<HTMLCanvasElement>document.getElementById("player"));

        this.notesEditor = new NotesEditor(this);
        this.notesEditor.appendTo(this.$preview)
        const notesEditorWidth = this.$preview.clientWidth - this.player.canvas.clientWidth;
        if (notesEditorWidth < 400) {
            this.notesEditor.addClass("mobile");
            this.notesEditor.init(this.$preview.clientWidth, this.$preview.clientHeight)
        } else {
            this.notesEditor.init(notesEditorWidth, this.$preview.clientHeight)
        }
        this.progressBar = new ZProgressBar(
            this.player.audio);
        this.progressBar.addEventListener("pause", () => this.pause());
        this.progressBar.addEventListener("change", () => {
            this.update();
            this.player.render();
        })
        this.progressBar.appendTo(this.$topbar)

        
        this.eventCurveEditors = new EventCurveEditors();
        this.eventCurveEditors.appendTo(this.$eventSequence)
        this.eventCurveEditors.init();

        
        this.playButton = <HTMLButtonElement>document.getElementById("playButton")
        this.playButton.addEventListener("click", (event) => {
            if (!this.playing) {
                this.play();
            } else {
                this.pause();
            }
        })

        this.$preview.on("wheel", (event: WheelEvent) => {
            if (!this.initialized) {
                return;
            }
            if (this.playing) {
                this.pause();
            }
            const audio = this.player.audio;
            // console.log(event.deltaY)
            changeAudioTime(audio, event.deltaY / 500)
            this.progressBar.update()
            this.update()
            this.player.render()
            // event.preventDefault()
        });
        // Time Divisor (the third number in TimeTuple)
        this.$timeDivisor = new ZArrowInputBox()
        this.$timeDivisor.onChange((n) => {
            this.timeDivisor = n;
            this.update()
        })
        this.$timeDivisor.setValue(4)
        this.timeDivisor = 4
        // PlaybackRate
        this.$playbackRate = new ZDropdownOptionBox(["1.0x", "1.5x", "2.0x", "0.5x", "0.25x", "0.75x"].map((n) => new BoxOption(n)))
            .onChange((rateStr: string) => {
                this.player.audio.playbackRate = parseFloat(rateStr)
            })
        // Save Button
        this.$saveButton.disabled = true;
        this.$saveButton.onClick(() => {
            const json = this.chart.dumpKPA()
            if (serverApi.supportsServer && serverApi.chartId) {
                this.$saveDialog.show();
                this.$saveDialog.chartData = json;
                this.$saveDialog.addEventListener("saved", () => {
                    if (this.$saveDialog.$clearsOperationList.checked) {
                        this.operationList.clear();
                    }
                    this.chart.modified = false;
                    this.$saveButton.disabled = true;
                }, {once: true});
                return;
            }
            saveTextToFile(JSON.stringify(json), this.chart.name + ".kpa.json")
            this.chart.modified = false;
        });
        this.$saveDialog = new SaveDialog();
        this.$compileButton.onClick(() => {
            const compiler = new RPEChartCompiler(this.chart);
            const json = compiler.compileChart();
            saveTextToFile(JSON.stringify(json), this.chart.name + ".rpe.json")
        })
        this.$offsetInput.whenValueChange(() => {
                this.chart.offset = this.$offsetInput.getInt();
            });

        this.$switchButton.onClick(() => {
            switch (this.shownSideEditor) {
                case this.eventEditor:
                case this.noteEditor:
                case this.multiNodeEditor:
                case this.multiNoteEditor:
                    editor.switchSide(this.judgeLineInfoEditor);
                    break;
                case this.judgeLineInfoEditor:
                    editor.switchSide(this.userScriptEditor)
            }
        })

        this.$tipsLabel = generateTipsLabel();
        this.$topbar.append(
            this.$timeDivisor,
            this.$playbackRate,
            this.$offsetInput,
            this.$saveButton,
            this.$saveDialog,
            this.$compileButton,
            this.$switchButton,
            this.$judgeLinesEditorLayoutSelector,
            this.$tipsLabel
        )

        this.addEventListener("chartloaded", (e) => { 
            this.eventCurveEditors.bpm.target = this.chart.timeCalculator.bpmSequence
            this.$offsetInput.setValue(this.chart.offset.toString());
            this.operationList.addEventListener("firstmodified", () => {
                this.$saveButton.disabled = false;
            })
            this.operationList.addEventListener("noundo", () => {
                notify("Nothing to undo");
            });
            this.operationList.addEventListener("noredo", () => {
                notify("Nothing to redo");
            });
            this.operationList.addEventListener("needsupdate", () => {
                this.update();
            });
            // @ts-expect-error
            this.operationList.addEventListener("needsreflow", (ev: NeedsReflowEvent) => {
                if (this.judgeLinesEditor.layoutType & ev.condition) {
                    notify("Reflow")
                    this.judgeLinesEditor.reflow()
                }
            })
        });
        window.addEventListener("beforeunload", (e) => {
            if (this.chart.modified) {
                e.preventDefault();
                e.returnValue = "Unsaved Changes";
            }
        })
        window.addEventListener("keydown", (e: KeyboardEvent) => {
            if ((e.key ==="z" || e.key === "y") && document.activeElement === document.body) {
                e.preventDefault();
            } else {
                return;
            }
            if (e.key === "z") {
                this.operationList?.undo();
            } else if (e.key === "y") {
                this.operationList?.redo();
            }
        })
        /*
        window.addEventListener("resize", () => {
            this.player.initCoordinate();
            if (!this.initialized) {
                this.player.initGreyScreen()
            } else {
                this.update()
            }
        })
            */
    }
    shownSideEditor: SideEditor;
    switchSide(editr: SideEditor) {
        if (editr === this.shownSideEditor) {
            return;
        }
        this.shownSideEditor.hide()
        editr.show()
        this.shownSideEditor = editr
    }
    checkAndInit() {
        if (this.initialized) {
            return
        }
        this.initialized = this.chartInitialized && this.imageInitialized && this.audioInitialized
        if (this.initialized) {
            this.addEventListener("chartloaded", (e) => {
                this.initFirstFrame()
            })
            this.loadChart();
        }
    }
    addListenerForPlayer() {
        const player = this.player;
        const canvas = player.canvas;
        
        canvas.addEventListener("dragover", (e) => {
            e.preventDefault();
            player.renderDropScreen()
        })
        canvas.addEventListener("dragleave", (e) => {
            e.preventDefault();
            player.renderGreyScreen()
        })
        canvas.addEventListener("drop", (e) => {
            const files = e.dataTransfer.files;
            const len = files.length;
            for (let i = 0; i < len; i++) {
                const file = files[i];
                const arr = file.name.split(".")
                const extension = arr[arr.length - 1];
                if (["jpeg", "jpg", "png", "gif", "svg", "webp", "bmp", "ico"].includes(extension)) {
                    this.readImage(file);
                } else if (["json"].includes(extension)) {
                    this.readChart(file)
                } else {
                    this.readAudio(file)
                }
            }
            e.preventDefault()
        })
    }
    readChart(file: Blob) {
        const reader = new FileReader()
        reader.readAsText(file);
        reader.addEventListener("load", () => {
            if (typeof reader.result !== "string") {
                return;
            }
            let data = JSON.parse(reader.result)
            this.chartData = data
            if ("META" in this.chartData) {
                this.chartType = "rpejson"
            } else {
                this.chartType = "kpajson"
            }
            this.chartInitialized = true;
            this.checkAndInit()
            /**
            player.background = new Image();
            player.background.src = "../cmdysjtest.jpg";
            player.audio.src = "../cmdysjtest.mp3"; */
        })
    }
    loadChart() {
        const assignChart = (chart: Chart) => {
            this.player.receive(chart);
            this.chart = chart;
            this.operationList = new OperationList(chart);
            this.judgeLinesEditor = new JudgeLinesEditor(this, this.lineInfoEle)
            this.dispatchEvent(new Event("chartloaded"))
            this.chartData = null; // 这个内存量其实挺恐怖的
        }
        if (this.chartType === "rpejson") {
            // 若为1.6.0版本以后，元数据中有时长信息，直接使用以建立谱面
            // 否则等待<audio>加载完
            // @ts-expect-error
            if (this.chartData.META.duration) {
                assignChart(Chart.fromRPEJSON(this.chartData as ChartDataRPE, this.chartData.META.duration))
            } else {
                assignChart(Chart.fromRPEJSON(this.chartData as ChartDataRPE, this.player.audio.duration))
                
            }
            return
        }
        assignChart(Chart.fromKPAJSON(this.chartData as ChartDataKPA))
    }
    initFirstFrame() {
        const chart = this.chart;

        this.notesEditor.target = chart.orphanLines[0]


        this.player.render()
        this.notesEditor.draw(this.player.beats)
        const eventLayer = chart.judgeLines[0].eventLayers[0]
        const height = this.$eventSequence.clientHeight;
        const width = this.$eventSequence.clientWidth

        this.eventEditor = new EventEditor();
        this.noteEditor = new NoteEditor();
        this.judgeLineInfoEditor = new JudgeLineInfoEditor();
        this.userScriptEditor = new UserScriptEditor();
        this.multiNoteEditor = new MultiNoteEditor();
        this.multiNodeEditor = new MultiNodeEditor();
        this.$noteInfo.append(
            this.eventEditor,
            this.noteEditor,
            this.judgeLineInfoEditor,
            this.userScriptEditor,
            this.multiNoteEditor,
            this.multiNodeEditor
            );
        this.eventEditor.target = chart.judgeLines[0].eventLayers[0].moveX.head.next
        this.judgeLineInfoEditor.target = chart.judgeLines[0]
        this.eventEditor.update()
        this.eventEditor.hide()
        this.judgeLineInfoEditor.hide();
        this.userScriptEditor.hide()
        this.multiNoteEditor.hide()
        this.multiNodeEditor.hide()
        this.shownSideEditor = this.noteEditor
        // this.noteEditor.target = chart.judgeLines[0].noteTrees["#1"].head.next.notes[0]
    }
    readAudio(file: Blob) {
        const url = URL.createObjectURL(file)
        this.player.audio.src = url;
         this.player.audio.addEventListener("canplaythrough", () => {
            this.audioInitialized = true;
            this.checkAndInit()
        })
    }
    readImage(file: Blob) {
        const url = URL.createObjectURL(file)
    
        this.player.background = new Image();
        this.player.background.src = url;
        this.imageInitialized = true;
        this.checkAndInit()
    }
    update() {
        requestAnimationFrame(() => {
            if (this.playing) {
                this.update()
            } else {
                this.player.render()
            }
            this.updateEventSequences()
            this.judgeLinesEditor.update()
            this.updateNotesEditor()
            this.updateShownEditor()
            const now = performance.now();
            this.renderingTime = this.lastRenderingTime ? (now - this.lastRenderingTime) : 0;
            this.lastRenderingTime = now;
            console.log("updated")
        })
    }
    updateEventSequences() {
        this.eventCurveEditors.draw(this.player.beats)
    }
    updateNotesEditor() {
        this.notesEditor.draw(this.player.beats)
    }
    updateShownEditor() {
        this.shownSideEditor.update()
    }
    get playing(): boolean {
        return this.player.playing
    }
    play() {
        if (this.playing) {
            return;
        }
        this.playButton.innerHTML = "暂停"
        this.player.play()
        this.update()
    }
    pause() {
        this.player.pause()
        this.update()
        this.playButton.innerHTML = "继续"
    }
}
