
const eventTypeMap = [
    { // moveX
        valueGridSpan: 135,
        valueRange: [-675, 675]
    },
    { // moveY
        valueGridSpan: 180,
        valueRange: [-450, 450]
    },
    { // rotate
        valueGridSpan: 90,
        valueRange: [-360, 360]
    },
    { // alpha
        valueGridSpan: 17,
        valueRange: [0, 255]
    },
    { // speed
        valueGridSpan: 2,
        valueRange: [-5, 15]
    },
    { // easing
        valueGridSpan: 270,
        valueRange: [-675, 675]
    },
    { // bpm
        valueGridSpan: 40,
        valueRange: [0, 400]
    }
] satisfies {valueGridSpan: number, valueRange: [number, number]}[];

type EventTypeName = "moveX" | "moveY" | "alpha" | "rotate" | "speed" | "easing" | "bpm";

enum NewNodeState {
    controlsStart,
    controlsEnd,
    controlsBoth
}

class EventCurveEditors extends Z<"div"> {
    element: HTMLDivElement;
    $bar: Z<"div"> = $("div").addClass("event-curve-editors-bar");
    $typeSelect = new ZDropdownOptionBox([
            "moveX",
            "moveY",
            "alpha",
            "rotate",
            "speed",
            "easing",
            "bpm"
        ].map((s) => new BoxOption(s)), true);;
    $layerSelect = new ZDropdownOptionBox(["0", "1", "2", "3", "ex"].map((s) => new BoxOption(s)), true);
    $timeSpanInput = new ZInputBox("4").attr("size", "3");
    $editSwitch = new ZSwitch("Edit");
    $easingBox = new ZEasingBox(true);
    $newNodeStateSelect: ZDropdownOptionBox;
    $encapsuleBtn: ZButton;
    $templateNameInput: ZInputBox;
    $rangeInput = new ZInputBox().attr("size", "6");
    $selectOption: ZDropdownOptionBox;
    selectState: SelectState;
    $copyButton: ZButton;
    $pasteButton: ZButton;


    moveX: EventCurveEditor;
    moveY: EventCurveEditor;
    alpha: EventCurveEditor;
    rotate: EventCurveEditor;
    speed: EventCurveEditor;
    easing: EventCurveEditor;
    bpm: EventCurveEditor;

    lastBeats: number;
    easingBeats: number = 0;

    clipboard: Set<EventStartNode>;
    nodesSelection: Set<EventStartNode>;

    constructor() {
        super("div")
        this.addClass("event-curve-editors")

        this.$typeSelect.onChange((val) => {
            this.selectedEditor = this[val];
        })
        this.$layerSelect.onChange((val) => {
            if (!(["0", "1", "2", "3", "ex"]).includes(val)) {
                throw new Error("Invalid layer");
            }
            // @ts-expect-error 上面已经排除（我也不知道什么时候会出这种）
            this.selectedLayer = val;
        });
        this.$rangeInput.whenValueChange((content) => {
            if (content === "auto" || content === "") {
                this.selectedEditor.autoRangeEnabled = true;
            }
            const parts = content.split(",");
            if (parts.length !== 2) {
                notify("Invalid range");
                this.updateAdjustmentOptions(this.selectedEditor);
                return;
            }
            this.selectedEditor.valueRange = [parseFloat(parts[0]), parseFloat(parts[1])];
            this.selectedEditor.autoRangeEnabled = false;
        })
        this.$easingBox.onChange(id => {
            for (let type of ["moveX", "moveY", "alpha", "rotate", "speed", "easing", "bpm"] as const) {
                this[type].easing = rpeEasingArray[id];
            }
        });
        this.$easingBox.setValue(easingMap.linear.in);
        this.$newNodeStateSelect = new ZDropdownOptionBox([
            "Both",
            "Start",
            "End"
        ].map((s) => new BoxOption(s)), true)
            .onChange((val) => {
                for (let type of ["moveX", "moveY", "alpha", "rotate", "speed", "easing", "bpm"] as const) {
                    this[type].newNodeState = NewNodeState["controls" + val];
                }
            });
            
        this.$selectOption = new ZDropdownOptionBox(["none", "extend", "replace", "exclude"].map(v => new BoxOption(v)), true)
        
        this.$copyButton = new ZButton("Copy");
        this.$pasteButton = new ZButton("Paste");
        this.$encapsuleBtn = new ZButton("Encapsule");
        this.$templateNameInput = new ZInputBox().attr("size", "4");
        this.$templateNameInput.whenValueChange((name) => {
            const easing = editor.chart.templateEasingLib.get(name)
            if (easing) {
                this.easing.target = easing.eventNodeSequence;
                this.easing.targetEasing = easing;
                this.draw();
            } else {
                this.easing.target = null;
            }
        })
        this.on("wheel", (ev) => {
            const delta = ev.deltaY / 500;
            if (editor.player.playing) {
                editor.pause()
            }
            if (this.selectedEditor === this.easing) {
                this.easingBeats = Math.min(Math.max(this.easingBeats + delta, 0), this.easing.target.effectiveBeats);
                this.easing.draw(this.easingBeats)
            } else {
                changeAudioTime(editor.player.audio, delta);
                editor.update()
            }
        })



        this.$bar.append(
            this.$typeSelect,
            this.$layerSelect,
            this.$timeSpanInput,
            this.$rangeInput,
            this.$selectOption,
            this.$editSwitch,
            this.$copyButton,
            this.$pasteButton,
            this.$easingBox,
            this.$newNodeStateSelect,
            this.$templateNameInput,
            this.$encapsuleBtn
        )
        this.append(this.$bar)


        this.nodesSelection = new Set<EventStartNode>();

    }
    init() {
        const barHeight = this.$bar.clientHeight;
        for (let type of ["moveX", "moveY", "alpha", "rotate", "speed", "easing", "bpm"] as const) {
            this[type] = new EventCurveEditor(EventType[type], this.parent.clientHeight - barHeight, this.parent.clientWidth, this);
            this[type].active = false;
            this.append(this[type].element)
        }
        this.selectedEditor = this.moveX;
    }
    _selectedEditor: EventCurveEditor;
    get selectedEditor() {
        return this._selectedEditor
    }
    set selectedEditor(val) {
        if (val === this._selectedEditor) return;
        if (this._selectedEditor) this._selectedEditor.active = false;
        this._selectedEditor = val;
        val.active = true;
        this.updateAdjustmentOptions(val);
        this.nodesSelection = new Set<EventStartNode>();
        this.draw()
    }
    _selectedLayer: "0" | "1" | "2" | "3" | "ex" = "0";
    get selectedLayer() {
        return this._selectedLayer
    }
    set selectedLayer(val) {
        this._selectedLayer = val;
        ["moveX", "moveY", "alpha", "rotate", "speed"].forEach((type) => {
            this[type].changeTarget(this.target, val)
        })
    }
    draw(beats?: number) {
        beats = beats || this.lastBeats
        this.lastBeats = beats;
        //console.log("draw")
        if (this.selectedEditor === this.easing) {
            this.easing.draw(this.easingBeats);
        } else {
                
            this.selectedEditor.draw(beats)
        }
    }
    target: JudgeLine;
    changeTarget(target: JudgeLine) {
        ["moveX", "moveY", "alpha", "rotate", "speed"].forEach((type) => {
            this[type].changeTarget(target, this.selectedLayer)
        })
        this.target = target;
        this.draw()
    }
    updateAdjustmentOptions(editor: EventCurveEditor) {
        this.$rangeInput.setValue(editor.autoRangeEnabled ? "auto" : editor.valueRange.join("，"))
    }
}

type NodePosition = {
    node: EventNode;
    x: number;
    y: number
}

enum EventCurveEditorState {
    select,
    selecting,
    edit,
    flowing,
    selectScope,
    selectingScope
}

const lengthOf = (range: readonly [number, number]) => range[1] - range[0];
const medianOf = (range: readonly [number, number]) => (range[0] + range[1]) / 2;
const percentileOf = (range: readonly [number, number], percent: number) => range[0] + lengthOf(range) * percent;
/**
 * 对于一个值，在一系列可吸附值上寻找最接近的值
 * @param sortedAttachable 
 * @param value 
 * @returns 
 */
const computeAttach = (sortedAttachable: number[], value: number) => {
    const len = sortedAttachable.length;
    if (len === 0) return value;
    if (value < sortedAttachable[0]) {
        return sortedAttachable[0];
    }
    for (let i = 0; i < len - 1; i++) {
        const cur = sortedAttachable[i];
        if (value === cur) {
            return cur;
        }
        const next = sortedAttachable[i + 1];
        if (value > cur && value < next) {
            return (value - cur) < (next - value) ? cur : next;
        }
    }
    if (value > sortedAttachable[len - 1]) {
        return sortedAttachable[len - 1];
    }
}
/**
 * 生成可吸附值
 * @param linear 一次函数的两个系数
 * @param range 显示范围
 */
function generateAttachable (linear: [k: number, b: number], range: readonly [number, number])  {
    const k = linear[0], b = linear[1];
    const left = range[0], right = range[1];
    if (k <= 1e-6) {
        return [left, b, right];
    }
    const startingX = Math.floor((left - b) / k);
    const attachable: number[] = [];
    for (let i = startingX; ; i++) {
        const val = k * i + b;
        attachable.push(k * i + b);
        if (val > right) break;
    }
    return attachable;
}

function divideOrMul(gridSpan: number, maximum: number)  {
    const m = Math.floor(maximum);
    if (m === 0) {
        const times = Math.floor(1 / maximum);
        return gridSpan * times;
    }
    if (isNaN(gridSpan) || isNaN(m)) { debugger;}
    if (!Number.isInteger(gridSpan)) {
        return gridSpan / m;
    } else {
        // 有的时候maximum莫名其妙整的特大，采取这种方式
        if (gridSpan < maximum) {
            return 1;
        }
        for (let i = m; i >= 1; i--) {
            if (gridSpan % i === 0) {
                return gridSpan / i;
            }
        }
    }
}

class EventCurveEditor {
    target: EventNodeSequence;
    targetEasing?: TemplateEasing;
    parentEditorSet: EventCurveEditors;

    innerHeight: number;
    innerWidth: number;

    $element: Z<"div">;
    element: HTMLDivElement
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    // halfCent: number;
    valueRatio: number;
    timeRatio: number;
    valueRange: readonly [number, number];

    timeSpan: number;
    timeGridSpan: number;
    attachableValues: number[] = [];

    timeGridColor: RGB;
    valueGridColor: RGB;

    padding: number;

    lastBeats: number;

    selectionManager: SelectionManager<EventNode>;
    state: EventCurveEditorState;
    wasEditing: boolean

    _selectedNode: WeakRef<EventStartNode | EventEndNode>;
    pointedValue: number;
    pointedBeats: number;
    beatFraction: number;

    easing: NormalEasing;
    newNodeState: NewNodeState = NewNodeState.controlsBoth;
    selectState: SelectState;
    mouseIn: boolean;
    startingPoint: Coordinate;
    startingCanvasPoint: Coordinate;
    canvasPoint: Coordinate;

    get selectedNode() {
        if (!this._selectedNode) {
            return undefined;
        }
        return this._selectedNode.deref()
    }
    set selectedNode(val: EventStartNode | EventEndNode) {
        this._selectedNode = new WeakRef(val);
        editor.eventEditor.target = val;
    }

    private _active: boolean
    /** @deprecated use active instead */
    get displayed() {return this.active}
    set displayed(val) {this.active = val}
    get active() {
        return this._active
    }
    set active(val) {
        if (val === this._active) {
            return
        }
        this._active = val;
        if (val) {
            this.element.style.display = ""
        } else {
            this.element.style.display = "none";
        }
    }
    constructor(public type: EventType, height: number, width: number, parent: EventCurveEditors) {
        const config = eventTypeMap[type]
        if (type === EventType.alpha) {
            this.autoRangeEnabled = false;
        }
        this.parentEditorSet = parent
        this._active = true;
        this.$element = $("div")
        this.element = this.$element.element;
        this.active = false;
        this.state = EventCurveEditorState.select


        this.selectionManager = new SelectionManager()


        this.canvas = document.createElement("canvas")
        this.element.append(this.canvas)
        this.canvas.width = width
        this.canvas.height = height;
        this.padding = 14;
        this.innerHeight = this.canvas.height - this.padding * 2;
        this.innerWidth = this.canvas.width - this.padding * 2;
        this.context = this.canvas.getContext("2d");


        this.timeSpan = 4
        // this.halfCent = this.halfRange * 100;
        this.valueRange = config.valueRange;
        this.valueRatio = this.innerHeight / lengthOf(this.valueRange);
        this.attachableValues = generateAttachable([config.valueGridSpan, 0], this.valueRange);
        this.timeRatio = this.innerWidth / this.timeSpan;
        this.timeGridSpan = 1;
        this.timeGridColor = [120, 255, 170];
        this.valueGridColor = [255, 170, 120];
        this.initContext()

        this.easing = easingMap.linear.in;
        
        // 下面有一堆监听器
        // #region
        parent.$editSwitch.whenClickChange((checked) => {
            this.state = checked ? EventCurveEditorState.edit : EventCurveEditorState.select;
        })
        parent.$timeSpanInput.whenValueChange((val) => {
            this.timeSpan = parent.$timeSpanInput.getNum();
            this.draw();
        })
        

        on(["mousemove", "touchmove"], this.canvas, (event) => {
            const [offsetX, offsetY] = getOffsetCoordFromEvent(event, this.canvas);
            const coord = this.canvasPoint = new Coordinate(offsetX, offsetY).mul(this.invertedCanvasMatrix);
            
            const {x, y} = coord;
            const {padding} = this;
            const {x: beats, y: value} = coord.mul(this.invertedMatrix);
            this.pointedValue = computeAttach(this.attachableValues, value);
            const accurateBeats = beats + this.lastBeats
            this.pointedBeats = Math.floor(accurateBeats)
            this.beatFraction = Math.round((accurateBeats - this.pointedBeats) * editor.timeDivisor)
            if (this.beatFraction === editor.timeDivisor) {
                this.pointedBeats += 1
                this.beatFraction = 0
            }

            switch (this.state) {
                case EventCurveEditorState.selecting:
                    // console.log("det")
                    editor.operationList.do(new EventNodeValueChangeOperation(this.selectedNode, this.pointedValue))
                    editor.operationList.do(new EventNodeTimeChangeOperation(this.selectedNode, [this.pointedBeats, this.beatFraction, editor.timeDivisor]))

            }
            this.draw()
        })
        on(["mousedown", "touchstart"], this.canvas, (event) => {
            this.downHandler(event)
            this.draw()
        })
        on(["mouseup", "touchend"], this.canvas, (event) => {
            this.upHandler(event)
            this.draw()
        })

        parent.$selectOption.onChange((v: string) => {
            this.selectState = SelectState[v];
            if (this.selectState === SelectState.none) {
                this.state = EventCurveEditorState.select;
            } else {
                this.state = EventCurveEditorState.selectScope;
            }
        });

        this.mouseIn = false;
        this.canvas.addEventListener("mouseenter", () => {
            this.mouseIn = true;
        });
        this.canvas.addEventListener("mouseleave", () => {
            this.mouseIn = false;
        });
        parent.$copyButton.onClick(() => {
            this.copy();
        });
        parent.$pasteButton.onClick(() => {
            this.paste();
        });
        parent.$encapsuleBtn.onClick(() => {
            if (!this.active) {
                return;
            }
            const $input = this.parentEditorSet.$templateNameInput
            const name = $input.getValue();
            if (name === "") {
                notify("Please input template name")
                return;
            }
            const lib = editor.chart.templateEasingLib;
            if (name in lib.easings) {
                notify("Template name already exists")
                return;
            }
            const op = encapsule(lib, this.target, this.parentEditorSet.nodesSelection, name);
            if (op === EncapsuleErrorType.NotBelongToSourceSequence) {
                notify("Not belong to source sequence")
            } else if (op === EncapsuleErrorType.NotContinuous) {
                notify("Not continuous")
            } else if (op === EncapsuleErrorType.ZeroDelta) {
                notify("Selected first and last eventStartNode has zero delta");
            } else {
                editor.operationList.do(op);
                parent.$templateNameInput.dispatchEvent(new ZValueChangeEvent());
            }
        })
        
        window.addEventListener("keydown", (e: KeyboardEvent) => { // 踩坑：Canvas不能获得焦点
            if (!this.mouseIn) {
                return;
            }
            if (document.activeElement !== document.body) {
                return;
            }
            e.preventDefault();
            switch (e.key.toLowerCase()) {
                case "v":
                    this.paste();
                    break;
                case "c":
                    this.copy();
                    break;
            }
        })
        // #endregion
    }

    matrix: Matrix;
    invertedMatrix: Matrix;
    canvasMatrix: Matrix;
    invertedCanvasMatrix: Matrix;
    updateMatrix() {
        this.valueRatio = this.innerHeight / lengthOf(this.valueRange);
        this.timeRatio = this.innerWidth / this.timeSpan;
        const {
            timeSpan: timeRange,
            valueRange,
            timeRatio,
            valueRatio
        } = this;
        this.matrix = identity.scale(timeRatio, -valueRatio).translate(0, -medianOf(valueRange));
        this.invertedMatrix = this.matrix.invert();
        // console.log(this.matrix);
        // console.log(identity.translate(0, -valueBasis * valueRange))
        this.canvasMatrix = Matrix.fromDOMMatrix(this.context.getTransform());
        this.invertedCanvasMatrix = this.canvasMatrix.invert();
    }
    appendTo(parent: HTMLElement) {
        parent.append(this.element);
    }

    downHandler(event: MouseEvent | TouchEvent) {
        const {width, height} = this.canvas;
        const {padding} = this;
        const [offsetX, offsetY] = getOffsetCoordFromEvent(event, this.canvas);
        const canvasCoord = this.canvasPoint = new Coordinate(offsetX, offsetY).mul(this.invertedCanvasMatrix);
        const coord = canvasCoord.mul(this.invertedMatrix);
        this.canvasPoint = canvasCoord;
        // console.log("ECECoord:" , [x, y])
        switch (this.state) {
            case EventCurveEditorState.select:
            case EventCurveEditorState.selecting:
                const snode = this.selectionManager.click(canvasCoord)
                this.state = !snode ? EventCurveEditorState.select : EventCurveEditorState.selecting;
                if (snode) {
                    this.selectedNode = snode.target
                    editor.switchSide(editor.eventEditor)
                }
                // console.log(EventCurveEditorState[this.state])
                this.wasEditing = false;
                break;
            case EventCurveEditorState.edit:
                const timeDivisor = editor.timeDivisor
                const {beatFraction, pointedBeats} = this
                const time: TimeT = [pointedBeats, beatFraction, timeDivisor];
                const prev = this.target.getNodeAt(TimeCalculator.toBeats(time))
                if (TimeCalculator.eq(prev.time, time)) {
                    break;
                }
                let node, endNode;
                if (this.type === EventType.bpm) {
                    node = new BPMStartNode(time, this.pointedValue);
                    endNode = new BPMEndNode(time);
                } else {
                    endNode = new EventEndNode(time, this.newNodeState === NewNodeState.controlsStart ? prev.value : this.pointedValue)
                    node = new EventStartNode(time, this.newNodeState === NewNodeState.controlsEnd ? prev.value : this.pointedValue);
                }
                node.easing = this.parentEditorSet.easing.targetEasing ?? this.easing;
                EventNode.connect(endNode, node)
                // this.editor.chart.getComboInfoEntity(startTime).add(note)
                editor.operationList.do(new EventNodePairInsertOperation(node, prev));
                if (this.type === EventType.bpm) {
                    editor.player.audio.currentTime = editor.chart.timeCalculator.toSeconds(this.lastBeats);
                }
                this.selectedNode = node;
                this.state = EventCurveEditorState.selecting;
                this.parentEditorSet.$editSwitch.checked = false;
                this.wasEditing = true;
                break;
            case EventCurveEditorState.selectScope:
                this.startingPoint = coord;
                this.startingCanvasPoint = canvasCoord;
                this.state = EventCurveEditorState.selectingScope;
                break;
        }
    }
    upHandler(event: MouseEvent | TouchEvent) {
        const [offsetX, offsetY] = getOffsetCoordFromEvent(event, this.canvas);
        const canvasCoord = new Coordinate(offsetX, offsetY).mul(this.invertedCanvasMatrix);
        const {x, y} = canvasCoord.mul(this.invertedMatrix);
        switch (this.state) {
            case EventCurveEditorState.selecting:
                if (!this.wasEditing) {
                    this.state = EventCurveEditorState.select;
                } else {
                    this.state = EventCurveEditorState.edit;
                    this.parentEditorSet.$editSwitch.checked = true;
                }
                break;
            case EventCurveEditorState.selectingScope:
                const [sx, ex] = [this.startingCanvasPoint.x, canvasCoord.x].sort((a, b) => a - b);
                const [sy, ey] = [this.startingCanvasPoint.y, canvasCoord.y].sort((a, b) => a - b);
                const array = this.selectionManager.selectScope(sy, sx, ey, ex);
                // console.log("Arr", array);
                // console.log(sx, sy, ex, ey)
                const nodes = array.map(x => x.target).filter(x => x instanceof EventStartNode);
                // console.log(nodes);
                switch (this.selectState) {
                    case SelectState.extend:
                        this.parentEditorSet.nodesSelection = this.parentEditorSet.nodesSelection.union(new Set(nodes));
                        break;
                    case SelectState.replace:
                        this.parentEditorSet.nodesSelection = new Set(nodes);
                        break;
                    case SelectState.exclude:
                        this.parentEditorSet.nodesSelection = this.parentEditorSet.nodesSelection.difference(new Set(nodes));
                        break;
                }
                this.parentEditorSet.nodesSelection = new Set([...this.parentEditorSet.nodesSelection].filter((note: EventStartNode) => !!note.parentSeq))
                // console.log("bp")
                if (this.parentEditorSet.nodesSelection.size !== 0) {
                    editor.multiNodeEditor.target = this.parentEditorSet.nodesSelection;
                    editor.switchSide(editor.multiNodeEditor);
                }
                this.state = EventCurveEditorState.selectScope;
                break;
            default:
                this.state = EventCurveEditorState.select;
        }
    }

    initContext() {
        this.context.translate(this.canvas.width / 2, this.canvas.height / 2)
        this.context.strokeStyle = "#EEE"
        this.context.fillStyle = "#333"
        this.context.lineWidth = 2
    }
    drawCoordination(beats: number) {
        const {height: canvasHeight, width: canvasWidth} = this.canvas;
        const {innerHeight, innerWidth} = this;
        const {
            attachableValues,
            timeGridSpan, valueRange,
            valueRatio, timeRatio, context} = this;
        const timeDivisor = editor.timeDivisor
        context.fillRect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight)
        // const beatCents = beats * 100
        // const middleValue = Math.round(-this.basis / this.valueRatio)
        const basis = -medianOf(valueRange) / lengthOf(valueRange) * this.innerHeight;
        // 计算上下界
        context.save()
        context.fillStyle = "#EEE";
        context.strokeStyle = rgb(...this.valueGridColor)
        context.lineWidth = 1;

        const len = attachableValues.length;
        for (let i = 0; i < len; i++) {
            const value = attachableValues[i];
            const positionY = this.matrix.ymul(0, value);
            drawLine(context, -canvasWidth / 2, positionY, canvasWidth, positionY);
            context.fillText(value + "", -innerWidth / 2, positionY)
        }
        context.strokeStyle = rgb(...this.timeGridColor)
        
        const stopBeats = Math.ceil((beats + this.timeSpan / 2) / timeGridSpan) * timeGridSpan;
        const startBeats = Math.ceil((beats - this.timeSpan / 2) / timeGridSpan - 1) * timeGridSpan;
        for (let time = startBeats; time < stopBeats; time += timeGridSpan) {
            const positionX = (time - beats)  * timeRatio
            drawLine(context, positionX, innerHeight / 2, positionX, -innerHeight / 2);
            context.fillText(time + "", positionX, innerHeight / 2)

            
            context.save()
            context.lineWidth = 1
            for (let i = 1; i < timeDivisor; i++) {
                const minorPosX = (time + i / timeDivisor - beats) * timeRatio
                drawLine(context, minorPosX, innerHeight / 2, minorPosX, -innerHeight / 2);
            }
            context.restore()
        }
        context.restore()
        context.lineWidth = 3;
        drawLine(context, 0, innerHeight / 2, 0, -innerHeight / 2)
        context.strokeStyle = "#EEE";
    }
    draw(beats?: number) {
        if (!this.target) {
            return
        }
        beats = beats || this.lastBeats || 0;
        this.updateMatrix()
        const {height, width} = this.canvas;
        const {
            timeRatio, valueRatio,
            context,
            selectionManager,
            matrix
        }= this
        selectionManager.refresh()
        this.drawCoordination(beats)
        context.save()
        context.fillStyle = "#EEE"
        context.font = "16px phigros"
        context.fillText("State: " + EventCurveEditorState[this.state], 10, -30)
        context.fillText("Beats: " + shortenFloat(beats, 4).toString(), 10, -10)
        context.fillText("Sequence: " + this.target.id, 10, -50)
        context.fillText(`fps: ${shortenFloat(editor.frameRate, 2)}`, 10, -70);
        context.fillText(`Time: ${shortenFloat(editor.player.time, 4)}s`, 10, 40)
        if (this.pointedBeats) {
            context.fillText(`pointedTime: ${this.pointedBeats}:${this.beatFraction}:${editor.timeDivisor}`, 10, 10);
        }

        if (this.canvasPoint) {
            this.context.fillText(`Cursor: ${this.canvasPoint.x}, ${this.canvasPoint.y}`, 10, -90)
        }
        context.restore()
        const startBeats = beats - this.timeSpan / 2;
        const endBeats = beats + this.timeSpan / 2;
        let previousEndNode: EventEndNode | EventNodeLike<NodeType.HEAD> = this.target.getNodeAt(startBeats < 0 ? 0 : startBeats).previous || this.target.head; // 有点奇怪的操作
        let previousTime = previousEndNode.type === NodeType.HEAD ? 0: TimeCalculator.toBeats(previousEndNode.time);
        // 该数组用于自动调整网格
        const valueArray = [];
        while (previousTime < endBeats) {
            const startNode = previousEndNode.next;
            const endNode = startNode.next;
            if (endNode.type === NodeType.TAIL) {
                break;
            }
            const startTime = TimeCalculator.toBeats(startNode.time);
            const endTime = TimeCalculator.toBeats(endNode.time);
            const startValue = startNode.value;
            const endValue   = endNode.value;
            valueArray.push(startValue, endValue);
            const {x: startX, y: startY} = new Coordinate(startTime - beats, startValue).mul(matrix);
            // console.log("startXY", startX, startY);
            // console.log(Matrix.fromDOMMatrix(context.getTransform()))
            const {x: endX, y: endY} = new Coordinate(endTime - beats, endValue).mul(matrix);
            const topY = startY - NODE_HEIGHT / 2
            const topEndY = endY - NODE_HEIGHT / 2

            selectionManager.add({
                target: startNode,
                left: startX,
                top: topY,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                priority: 1
            }).annotate(context, startX, topY)
            selectionManager.add({
                target: endNode,
                left: endX - NODE_WIDTH,
                top: topEndY,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                priority: 1
            }).annotate(context, endX - NODE_WIDTH, topEndY + NODE_HEIGHT + 20)

            const selected = this.parentEditorSet.nodesSelection.has(startNode)

            if (selected) {
                context.save()
                context.strokeStyle = 'cyan';
            }


            startNode.drawCurve(context, startX, startY, endX, endY, matrix);
            if (selected) {
                context.restore()
            }
            context.drawImage(NODE_START, startX, topY, NODE_WIDTH, NODE_HEIGHT)
            context.drawImage(NODE_END, endX - NODE_WIDTH, topEndY, NODE_WIDTH, NODE_HEIGHT)
            // console.log(this.type, EventType.speed)
            if (this.type === EventType.speed) {
                // console.log(startNode)
                // console.log(startNode.easing)
                context.lineWidth = 1;
                context.fillText(("" + startNode.cachedIntegral).slice(0, 6), startX, 0)
                context.lineWidth = 3
            }
            previousEndNode = endNode;
            previousTime = endTime;
        }
        if (previousEndNode.next.next.type === NodeType.TAIL) {
            const lastStart = previousEndNode.next;
            const startTime = TimeCalculator.toBeats(lastStart.time);
            const startValue = lastStart.value;
            const {x: startX, y: startY} = new Coordinate(startTime - beats, startValue).mul(matrix);
            const topY = startY - NODE_HEIGHT / 2;
            const selected = this.parentEditorSet.nodesSelection.has(lastStart)
            if (selected) {
                context.save()
                context.strokeStyle = 'cyan';
            }
            drawLine(context, startX, startY, width / 2, startY);
            if (selected) {
                context.restore()
            }
            context.drawImage(NODE_START, startX, startY - NODE_HEIGHT / 2, NODE_WIDTH, NODE_HEIGHT)
            selectionManager.add({
                target: lastStart,
                left: startX,
                top: topY,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                priority: 1
            }).annotate(context, startX, topY);

        }
        this.adjust(valueArray);
        
        if (this.state === EventCurveEditorState.selectingScope) {
            const {startingCanvasPoint, canvasPoint} = this;
            context.save()
            context.strokeStyle = "#84F";
            context.strokeRect(startingCanvasPoint.x, startingCanvasPoint.y, canvasPoint.x - startingCanvasPoint.x, canvasPoint.y - startingCanvasPoint.y);
            context.restore()
        }
        this.lastBeats = beats;
    }

    autoRangeEnabled: boolean = true;
    adjust(values: number[]): void {
        if (this.state !== EventCurveEditorState.select) {
            return;
        }
        const valueRange = this.valueRange;
        const distinctValueCount = new Set(values).size;
        if (distinctValueCount < 2 && valueRange[0] < values[0] && values[0] < valueRange[1]) {
            return;
        }
        if (this.autoRangeEnabled) {
            
            const sorted = values.sort((a, b) => a - b);
            const lengthOfValue = lengthOf(valueRange);
            // 如果上四分位数超出了valueRange，则扩大valueRange右边界valueRange长度的一半。
            // 如果上四分位数不及valueRange的2/3处位置，则缩小valueRange右边界valueRange长度的一半。
            // 下四分位数同理
            const upper = getPercentile(sorted, 0.95);
            const lower = getPercentile(sorted, 0.05);
            const pos1Third = percentileOf(valueRange, 0.34);
            const pos2Third = percentileOf(valueRange, 0.66);
            const range: [number, number] = [...this.valueRange];
            if (upper > valueRange[1]) {
                range[1] = valueRange[1] + lengthOfValue / 2;
            } else if (upper < pos2Third) {
                range[1] = valueRange[1] - lengthOfValue / 3;
            }
            if (lower < valueRange[0]) {
                range[0] = valueRange[0] - lengthOfValue / 2;
            } else if (lower > pos1Third) {
                range[0] = valueRange[0] + lengthOfValue / 3;
            }
            this.valueRange = range;
        }

        // 计算合适的valueGridSpan
        // 根据这个值能够整除多少个值。
        let priority = 0;
        let valueGridSpan = eventTypeMap[this.type].valueGridSpan;
        const len = values.length;
        for (let i = 0; i < len; i++) {
            const v = values[i];
            if (v === 0) {
                continue;
            }
            const p = values.reduce((acc, cur) => {
                return cur % v === 0 ? acc + 1 : acc
            });
            if (p > priority * 1.2) {
                priority = p;
                valueGridSpan = v;
            }
        }
        valueGridSpan = divideOrMul(valueGridSpan, 10 / (lengthOf(this.valueRange) / valueGridSpan));
        if (distinctValueCount > 10) {
            this.attachableValues = generateAttachable([valueGridSpan, 0], this.valueRange);
        } else {
                
            this.attachableValues = Array.from(new Set([...generateAttachable([valueGridSpan, 0], this.valueRange), ...values])).sort((a, b) => a - b);
        }
    }
    changeTarget(line: JudgeLine, index: number) {
        if (this.type === EventType.easing) {
            console.error("Easing does not use changeTarget. Assign directly instead.")
            return;
        }
        line.eventLayers[index] = line.eventLayers[index] || {};
        const seq = line.eventLayers[index][EventType[this.type]];
        if (seq) {
            this.target = seq;

        } else {
            this.target = EventNodeSequence.newSeq(this.type, editor.chart.getEffectiveBeats());
            this.target.id = `#${line.id}.${index}.${EventType[this.type]}`;
        }
    }

    

    paste() {
        if (!this.active) {
            return;
        }
        const {lastBeats} = this;
        const {clipboard} = this.parentEditorSet;
        const {timeDivisor} = editor;
        if (!clipboard || clipboard.size === 0) {
            return;
        }
        if (!lastBeats) {
            notify("Have not rendered a frame")
        }
        const dest: TimeT = [this.pointedBeats, this.beatFraction, timeDivisor];

        
        const [_, newNodes] = EventNode.setToNewOrderedArray(dest, clipboard);
        editor.operationList.do(new MultiNodeAddOperation(newNodes, this.target));
        editor.multiNodeEditor.target = this.parentEditorSet.nodesSelection = new Set<EventStartNode>(newNodes);
        editor.update();
    }
    copy(): void {
        if (!this.active) {
            return;
        }
        console.log(this.parentEditorSet.nodesSelection);
        this.parentEditorSet.clipboard = this.parentEditorSet.nodesSelection;
        this.parentEditorSet.nodesSelection = new Set<EventStartNode>();
        editor.update();
    }
}