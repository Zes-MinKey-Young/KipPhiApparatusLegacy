

abstract class SideEditor extends Z<"div"> {
    element: HTMLDivElement;
    $title: Z<"div">
    $body: Z<"div">
    constructor() {
        super("div");
        this.addClass("side-editor");
        this.$title = $("div").addClass("side-editor-title");
        this.$body = $("div").addClass("side-editor-body");
        this.append(this.$title, this.$body)
    }
    abstract update(): void
}




abstract class SideEntityEditor<T extends object> extends SideEditor {
    
    _target: WeakRef<T>;
    get target() {
        return this._target?.deref();
    }
    set target(val) {
        this._target = new WeakRef(val);
        this.update();
    }
    abstract update(): void
    constructor() {
        super();
    }
}


class NoteEditor extends SideEntityEditor<Note> {
    noteTypeOptions: BoxOption[] = ["tap", "hold", "flick", "drag"]
        .map((v) => new BoxOption(v, () => {
            editor.operationList.do(new NoteTypeChangeOperation(this.target, NoteType[v]))
        }));

    $time          = new ZFractionInput();;
    $endTime       = new ZFractionInput();;
    $type          = new ZDropdownOptionBox(this.noteTypeOptions);
    $position      = new ZInputBox();;
    $dir           = new ZSwitch("above", "below"); // 不用RPE的那种下拉框形式，少一个操作
    $speed         = new ZInputBox();
    $real          = new ZSwitch("fake", "real");
    $alpha         = new ZInputBox();
    $size          = new ZInputBox();
    $yOffset       = new ZInputBox();
    $visibleBeats  = new ZInputBox();
    $tint          = new ZInputBox();
    $tintHitEffect = new ZInputBox();
    $judgeSize     = new ZInputBox();
    $setAsDefault  = new ZButton("Set as default");
    $delete        = new ZButton("Delete").addClass("destructive");
    constructor() {
        super()
        this.$title.text("Note")
        this.$body.append(
            $("span").text("speed"), this.$speed,
            $("span").text("time"),
            $("div").addClass("flex-row").append(this.$time, $("span").text(" ~ "), this.$endTime),
            $("span").text("type"), this.$type,
            $("span").text("pos"), this.$position,
            $("span").text("dir"), this.$dir,
            $("span").text("real"), this.$real,
            $("span").text("alpha"), this.$alpha,
            $("span").text("size"), this.$size,
            $("span").text("AbsYOffset"), this.$yOffset,
            $("span").text("visibleBeats"), this.$visibleBeats,
            $("span").text("tint"), this.$tint,
            $("span").text("tintHitEffects"), this.$tintHitEffect,
            $("span").text("judgeSize"), this.$judgeSize,
            this.$setAsDefault, this.$delete,
        )
        this.$time.onChange((t) => {
            editor.operationList.do(new NoteTimeChangeOperation(this.target, this.target.parentNode.parentSeq.getNodeOf(t)))
            if (this.target.type !== NoteType.hold) {
                this.$endTime.setValue(t)
            }
        })
        this.$endTime.onChange((t) => {
            editor.operationList.do(new HoldEndTimeChangeOperation(this.target, t));
        })
        this.$dir.whenClickChange((checked) => {
            editor.operationList.do(new NoteValueChangeOperation(this.target, "above", checked));
        })
        this.$real.whenClickChange((checked) => {
            editor.operationList.do(new NoteValueChangeOperation(this.target, "isFake", !checked));
        })
        // 这里缺保卫函数
        this.$position.whenValueChange(() => {
            editor.operationList.do(new NoteValueChangeOperation(this.target, "positionX", this.$position.getNum()))
        })
        this.$speed.whenValueChange(() => {
            editor.operationList.do(new NoteSpeedChangeOperation(this.target, this.$speed.getNum(), this.target.parentNode.parentSeq.parentLine))
        })
        this.$alpha.whenValueChange(() => {
            editor.operationList.do(new NoteValueChangeOperation(this.target, "alpha", this.$alpha.getNum()))
        })
        this.$size.whenValueChange(() => {
            editor.operationList.do(new NoteValueChangeOperation(this.target, "size", this.$size.getNum()))
        })
        this.$yOffset.whenValueChange(() => {
            editor.operationList.do(new NoteYOffsetChangeOperation(this.target, this.$yOffset.getNum(), this.target.parentNode.parentSeq.parentLine));

        })
        this.$visibleBeats.whenValueChange(() => {
            editor.operationList.do(new NoteValueChangeOperation(this.target, "visibleBeats", this.$visibleBeats.getNum()));
        });
        this.$delete.onClick(() => {
            editor.operationList.do(new NoteDeleteOperation(this.target));
        });
        this.$tint.whenValueChange((str) => {
            editor.operationList.do(new NoteValueChangeOperation(this.target, "tint", str === "" ? undefined : parseInt(str, 16)));
        });
        this.$tintHitEffect.whenValueChange((str) => {
            editor.operationList.do(new NoteValueChangeOperation(this.target, "tintHitEffects", str === "" ? undefined : parseInt(str, 16)));
        });
        this.$judgeSize.whenValueChange(() => {
            editor.operationList.do(new NoteValueChangeOperation(this.target, "judgeSize", this.$judgeSize.getNum()))
        });
        this.$setAsDefault.onClick(() => {
            const note = this.target;
            if (!note) {
                return;
            }
            editor.notesEditor.defaultConfig = {
                alpha: note.alpha,
                size: note.size,
                speed: note.speed,
                isFake: note.isFake ? 1 : 0,
                absoluteYOffset: note.yOffset,
                visibleBeats: note.visibleBeats
            }
        });
    }
    update() {
        const note = this.target
        if (!note) {
            return;
        }
        this.$time.setValue(note.startTime);
        if (note.type === NoteType.hold) {
            this.$endTime.setValue(note.endTime);
            this.$endTime.disabled = false;
        } else {
            this.$endTime.setValue(note.startTime);
            this.$endTime.disabled = true;
        }
        this.$type.value = this.noteTypeOptions[note.type - 1];
        this.$position.setValue(note.positionX + "")
        this.$dir.checked = note.above;
        this.$real.checked = !note.isFake;
        this.$speed.setValue(note.speed + "")
        this.$alpha.setValue(note.alpha + "")
        this.$yOffset.setValue(note.yOffset + "")
        this.$visibleBeats.setValue(note.visibleBeats + "")
        this.$size.setValue(note.size + "");
        this.$tint.setValue(note.tint ? note.tint.toString(16).padStart(6, "0") : "");
        this.$tintHitEffect.setValue(note.tintHitEffects ? note.tintHitEffects.toString(16).padStart(6, "0") : "");
        this.$judgeSize.setValue(note.judgeSize + "")
    }
}

class MultiNoteEditor extends SideEntityEditor<Set<Note>> {
    $reverse: ZButton;
    $delete: ZButton;
    constructor() {
        super()
        this.$title.text("Multi Notes")
        this.$delete = new ZButton("Delete").addClass("destructive");
        this.$reverse = new ZButton("Reverse");
        this.$body.append(
            this.$delete,
            this.$reverse
        );
        this.$reverse.onClick(() => {
            editor.operationList.do(new ComplexOperation(...[...this.target].map(n => new NoteValueChangeOperation(n, "positionX", -n.positionX))))
        })
        this.$delete.onClick(() => {
            editor.operationList.do(new MultiNoteDeleteOperation(this.target))
        })
    }
    update(): void {

    }
}

class MultiNodeEditor extends SideEntityEditor<Set<EventStartNode>> {
    $reverse: ZButton;
    $delete: ZButton;
    constructor() {
        super();
        this.$title.text("Multi Nodes");
        this.$delete = new ZButton("Delete").addClass("destructive");
        this.$reverse = new ZButton("Reverse");
        this.$body.append(
            this.$delete,
            this.$reverse
        );
        
        this.$reverse.onClick(() => {
            editor.operationList.do(new ComplexOperation(...[...this.target].map(n => new EventNodeValueChangeOperation(n, -n.value))))
        })
        this.$delete.onClick(() => {
            editor.operationList.do(new MultiNodeDeleteOperation(Array.from(this.target)));
        })
    }
    update(): void {
        
    }
} 

class EventEditor extends SideEntityEditor<EventStartNode | EventEndNode> {

    $time           = new ZFractionInput();
    $value          = new ZInputBox();
    $normalOuter    = $("div");
    $normalLeft     = new ZInputBox().attr("placeholder", "left").setValue("0.0");
    $normalRight    = new ZInputBox().attr("placeholder", "right").setValue("1.0");
    $easing         = new ZEasingBox();
    $templateOuter  = $("div");
    $templateEasing = new ZInputBox().addClass("template-easing-box");
    $templateLeft   = new ZInputBox().attr("placeholder", "left").setValue("0.0");
    $templateRight  = new ZInputBox().attr("placeholder", "right").setValue("1.0");
    $parametric     = new ZInputBox();
    $bezierEditor   = new BezierEditor(window.innerWidth * 0.2);
    $delete: ZButton;
    $radioTabs: ZRadioTabs;
    constructor() {
        super()
        this.$title.text("Event")
        this.addClass("event-editor")
        this.$normalOuter.append(
            this.$easing,
            this.$normalLeft,
            this.$normalRight
        );
        this.$radioTabs = new ZRadioTabs("easing-type", {
            "Normal": this.$normalOuter,
            "Template": this.$templateEasing,
            "Bezier": this.$bezierEditor,
            "Parametric": this.$parametric
        });
        this.$delete = new ZButton("delete").addClass("destructive")
            .onClick(() => editor.operationList.do(new EventNodePairRemoveOperation(EventNode.getEndStart(this.target)[1])));
        this.$body.append(
            $("span").text("time"), this.$time,
            $("span").text("value"), this.$value,
            this.$radioTabs,
            $("span").text("del"), this.$delete
        )
        this.$time.onChange((t) => {
            editor.operationList.do(new EventNodeTimeChangeOperation(this.target, t))
        })
        this.$value.whenValueChange(() => {
            editor.operationList.do(new EventNodeValueChangeOperation(this.target, this.$value.getNum()))
        })
        this.$easing.onChange((id) => this.setNormalEasing(id))
        this.$templateEasing.whenValueChange((name) => this.setTemplateEasing(name))
        this.$bezierEditor.whenValueChange(() => {
            this.setBezierEasing(this.$bezierEditor.getValue());
        })
        this.$parametric.whenValueChange(() => {
            this.setParametricEasing(this.$parametric.getValue());
        })
        this.$radioTabs.$radioBox.onChange((id) => {
            if (id === 0) { // Normal
                this.setNormalEasing(this.$easing.value)
            } else if (id === 1) { // Template
                if (!this.$templateEasing.getValue()) { return; }
                this.setTemplateEasing(this.$templateEasing.getValue())
            } else if (id === 2) { // Bezier
                this.setBezierEasing(this.$bezierEditor.getValue());
            } else if (id === 3) { // Parametric
                this.setParametricEasing(this.$parametric.getValue());
            }
        });
        for (const $input of [this.$normalLeft, this.$normalRight, this.$templateLeft, this.$templateRight]) {
            $input.whenValueChange(() => {
                const isNormal = $input === this.$normalLeft || $input === this.$normalRight;
                const left = isNormal ? this.$normalLeft.getNum() : this.$templateLeft.getNum();
                const right = isNormal ? this.$normalRight.getNum() : this.$templateRight.getNum();
                if (left < 0 || right > 1 || left > right) {
                    editor.update();
                    return;
                }
                const isOriginallySegmented = this.target.easing instanceof SegmentedEasing;
                // 如果本来就是被分段的，就不改回纯的了
                // 否则能不分就不分
                const needsSegmentation = isOriginallySegmented || left !== 0 || right !== 1;
                if (needsSegmentation) {
                    if (isOriginallySegmented) {
                        editor.operationList.do(
                            new EventNodeEasingChangeOperation(this.target,
                                new SegmentedEasing((this.target.easing as SegmentedEasing).easing, left, right)
                            )
                        );
                    } else {
                        editor.operationList.do(
                            new EventNodeEasingChangeOperation(this.target,
                                new SegmentedEasing(this.target.easing, left, right)
                            )
                        );
                    }
                }
            });
        }
    }
    setNormalEasing(id: number): void {
        editor.operationList.do(new EventNodeInnerEasingChangeOperation(this.target, easingArray[id]))
        this.target.innerEasing = easingArray[id]
    }
    setTemplateEasing(name: string): void {
        const chart = editor.chart;
        const easing = chart.templateEasingLib.getOrNew(name);
        editor.operationList.do(new EventNodeInnerEasingChangeOperation(this.target, easing))
    }
    setBezierEasing(easing: BezierEasing) {
        editor.operationList.do(new EventNodeInnerEasingChangeOperation(this.target, easing));
    }
    setParametricEasing(expression: string) {
        editor.operationList.do(new EventNodeInnerEasingChangeOperation(this.target, new ParametricEquationEasing(expression)));
    }
    update(): void {
        const eventNode = this.target;
        if (!eventNode) {
            return;
        }
        this.$time.setValue(eventNode.time);
        this.$value.setValue(eventNode.value + "");
        if (eventNode.innerEasing instanceof NormalEasing) {
            this.$radioTabs.switchTo(0)
            this.$easing.setValue(eventNode.innerEasing);
            if (eventNode.easing instanceof SegmentedEasing) {
                this.$normalLeft.setValue(eventNode.easing.left + "");
                this.$normalRight.setValue(eventNode.easing.right + "");
            }
        } else if (eventNode.innerEasing instanceof TemplateEasing) {
            this.$radioTabs.switchTo(1)
            this.$templateEasing.setValue(eventNode.innerEasing.name);
        } else if (eventNode.innerEasing instanceof BezierEasing) { 
            this.$radioTabs.switchTo(2)
            this.$bezierEditor.setValue(eventNode.innerEasing);
        } else if (eventNode.innerEasing instanceof ParametricEquationEasing) { 
            this.$radioTabs.switchTo(3)
            this.$parametric.setValue(eventNode.innerEasing.equation);
        }
        
    }
}

class JudgeLineInfoEditor extends SideEntityEditor<JudgeLine> {
    readonly $father      = new ZInputBox("-1");
    readonly $group       = new ZDropdownOptionBox([new BoxOption("Default")]);
    readonly $newGroup    = new ZInputBox("");
    readonly $createGroup = new ZButton("Create");
    readonly $createLine  = new ZButton("Create");
    readonly $del         = new ZButton("Delete").addClass("destructive");
    constructor() {
        super();
        this.$title.text("Judge Line");
        this.$body.append(
            $("span").text("Father"), this.$father,
            $("span").text("Group"), this.$group,
            $("span").text("New Group"), $("div").append(this.$newGroup, this.$createGroup),
            $("span").text("New Line"), this.$createLine,
            $("span").text("del"), this.$del
        );
        this.$father.whenValueChange((content) => {
            if (!this.target) {
                notify("GC了");
                return;
            }
            if (content === "-1") {
                editor.operationList.do(new JudgeLineInheritanceChangeOperation(editor.chart, this.target, null));
            }
            if (isAllDigits(content)) {
                const lineId = parseInt(content);
                const father = editor.chart.judgeLines[lineId];
                if (!father) {
                    notify("Line ID out of range");
                    return false;
                }
                editor.operationList.do(new JudgeLineInheritanceChangeOperation(editor.chart, this.target, father));
            } else {
                const father = editor.chart.judgeLines.find(line => line.name === content);
                if (!father) {
                    notify("Line name not found");
                    return false;
                }
                editor.operationList.do(new JudgeLineInheritanceChangeOperation(editor.chart, this.target, father));
            }
        });
        this.$createGroup.onClick(() => {
            if (!this.target) {
                notify("GC了");
                return;
            }
            const name = this.$newGroup.getValue().trim();
            if (name === "") {
                notify("Please input a name");
                return;
            }
            if (editor.chart.judgeLineGroups.some(group => group.name === name)) {
                notify(`'${name}' already exists`);
                return;
            }
            const group = new JudgeLineGroup(name);
            editor.chart.judgeLineGroups.push(group);
            editor.operationList.do(new JudgeLineRegroupOperation(this.target, group))
        });
        this.$createLine.onClick(() => {
            // 等重排了再说，重排之前没有这个线的编辑器，会出错
            editor.judgeLinesEditor.addEventListener("reflow", () => {
                console.log("reflow event")
                editor.judgeLinesEditor.selectedLine = line
            }, {once: true});
            const line = new JudgeLine(editor.chart);
            editor.operationList.do(new JudgeLineCreateOperation(editor.chart, line));
            this.target = line;
        })
        this.$del.onClick(() => {
            if (!this.target) {
                notify("GC了")
                return;
            }
            editor.operationList.do(new JudgeLineDeleteOperation(editor.chart, this.target));
        })
    }
    update(): void {
        const judgeLine = this.target;
        if (!judgeLine) {
            return;
        }
        this.$father.setValue(judgeLine.father ? judgeLine.father.id + "" : "-1");
        this.updateGroups(editor.chart.judgeLineGroups);
    }
    updateGroups(groups: JudgeLineGroup[]) {
        this.$group.replaceWithOptions(groups.map(group => {
            const option = new BoxOption(group.name, () => {
                if (!this.target) return;
                editor.operationList.do(new JudgeLineRegroupOperation(this.target, group))
            });
            return option
        }));
    }
}

class UserScriptEditor extends SideEditor {
    $script = new ZTextArea().addClass("user-script-editor-script").setValue("");
    $runBtn = new ZButton("Run").addClass("user-script-editor-run", "progressive");
    constructor() {
        super();
        this.addClass("user-script-editor");
        this.$body.append(
            this.$script,
            this.$runBtn
        );
        const log = (content: any) => {
            const $d = $("div").addClass("user-script-editor-output").text(content + "");
            this.$script.before($d)
        }
        this.$runBtn.onClick(() => {
            try {
                const script = new Function("log", "return " + this.$script.getValue().trim());
                const result = script(log);
                if (typeof result === "function") {
                    result.isUserScript = true;
                    if (result.name !== "") {
                        if (!globalThis[result.name]?.isUserScript) {
                            notify("Cannot override built-in Global Variable. Please use a different name.")
                        } else {
                            globalThis[result.name] = result;
                            log(result.toString())
                        }
                    }
                    if (result.main && typeof result.main === "function") {
                        if (editor.chart.modified && !result.trusted) {
                            notify("This script is not trusted. Please make sure it is safe to run. You'd better save the chart before running it.")
                            notify("To trust this script, please add a line `trusted = true`.");
                            return;
                        }
                        result.main(editor.operationList, editor.chart);
                    }
                } else {
                    log(result)
                }
            } catch (error) {
                const $d = $("div").addClass("user-script-editor-error").text(error.message);
                this.$script.before($d);
            }
        })
    }
    update() {}
}