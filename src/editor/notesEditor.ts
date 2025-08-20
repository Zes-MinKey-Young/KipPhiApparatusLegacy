const DRAWS_NN = true
const COLOR_1 = "#66ccff"
const COLOR_2 ="#ffcc66"


const HEAD = 1;
const BODY = 2;
const TAIL = 3;
/**
 * 用于Note编辑器记录其中的音符贴图位置
 */
type NotePosition = {
    note: Note,
    x: number,
    y: number,
    height: number,
    type: 1 | 2 | 3
}


enum NotesEditorState {
    select,
    selecting,
    edit,
    selectScope,
    selectingScope,
    flowing
}

class HoldTail {
    constructor(public note: Note) {}
}

const timeToString = (time: TimeT) => {
    return `${time[0]}:${time[1]}/${time[2]}`
}

enum SelectState {
    none,
    extend,
    replace,
    exclude
}

class NotesEditor extends Z<"div"> {
    editor: Editor
    $statusBar: Z<"div">;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    _target: JudgeLine;
    targetNNList?: NNList;
    positionBasis: number
    positionRatio: number;
    positionGridSpan: number;
    positionSpan: number;
    timeRatio: number;
    timeGridSpan: number;
    timeSpan: number;
    padding: number;

    timeGridColor: RGB;
    positionGridColor: RGB;

    selectionManager: SelectionManager<Note | HoldTail>;
    startingPoint: Coordinate;
    startingCanvasPoint: Coordinate;
    canvasPoint: Coordinate;
    notesSelection: Set<Note>;
    clipboard: Set<Note>;
    selectingTail: boolean;
    state: NotesEditorState;
    selectState: SelectState;
    wasEditing: boolean;
    pointedPositionX: number;
    pointedBeats: number;
    beatFraction: number
    noteType: NoteType
    noteAbove: boolean


    drawn: boolean;

    lastBeats: number;

    $optionBox: ZEditableDropdownOptionBox;
    $typeOption: ZDropdownOptionBox;
    $noteAboveOption: ZDropdownOptionBox;
    $selectOption: ZDropdownOptionBox;
    $copyButton: ZButton;
    $pasteButton: ZButton;
    $editButton: ZSwitch;
    allOption: EditableBoxOption
    mouseIn: boolean;

    defaultConfig = {
        alpha: 255,
        isFake: 0,
        size: 1.0,
        speed: 1.0,
        absoluteYOffset: 0,
        visibleBeats: undefined as number
    }
    
    get target() {
        return this._target
    }

    set target(line) {
        if (this._target === line) {
            return 
        }
        this._target = line;
        // update the OptionBox options
        const options = [this.allOption]
        for (let lists of [line.nnLists, line.hnLists]) {
            for (let [name, list] of lists) {
                const option = new EditableBoxOption(
                    name,
                    (_, t) => {
                        lists[name] = null;
                        name = t
                        lists[name] = list
                    },
                    () => this.targetNNList = list
                    )
                options.push(option)
            }

        }
        this.$optionBox.replaceWithOptions(options)
        if (this.targetNNList) {
            const name = this.targetNNList.id || "#1"
            options.forEach((option) => {
                if (option.text === name) {
                    this.$optionBox.value = option
                }
            })
            if (this.targetNNList instanceof HNList) {
                if (line.hnLists.has(name)) {
                    this.targetNNList = line.hnLists.get(name)
                } else {
                    this.targetNNList = null;
                    this.$optionBox.value = this.allOption
                }
            } else {
                if (line.nnLists.has(name)) {
                    this.targetNNList = line.nnLists.get(name);
                } else {
                    this.targetNNList = null;
                    this.$optionBox.value = this.allOption
                }
            }

        }
    }

    constructor(editor: Editor) {
        super("div");
        this.addClass("notes-editor")
        this.selectionManager = new SelectionManager()

        this.allOption = new EditableBoxOption("*", (_s, t) => {}, () => this.targetNNList = null, () => undefined, false)

        
        this.$statusBar = $("div").addClass("notes-editor-status-bar");
        this.append(this.$statusBar)
        this.$optionBox = new ZEditableDropdownOptionBox([this.allOption])
        this.$typeOption = new ZDropdownOptionBox(
            arrayForIn([
                "tap", "hold", "flick", "drag"
            ], (v) => new BoxOption(v))
            ).whenValueChange(() => this.noteType = NoteType[this.$typeOption.value.text])
        this.$noteAboveOption = new ZDropdownOptionBox([new BoxOption("above"), new BoxOption("below")])
            .whenValueChange(() => this.noteAbove = this.$noteAboveOption.value.text === "above");
        this.notesSelection = new Set();
        this.$selectOption = new ZDropdownOptionBox(["none", "extend", "replace", "exclude"].map(v => new BoxOption(v)))
                                .whenValueChange((v: string) => {
                                    this.selectState = SelectState[v];
                                    if (this.selectState === SelectState.none) {
                                        this.state = NotesEditorState.select;
                                    } else {
                                        this.state = NotesEditorState.selectScope;
                                    }
                                });
        this.noteAbove = true;
        this.$copyButton = new ZButton("Copy")
            .onClick(() => {
                this.copy()
            });
        this.$pasteButton = new ZButton("Paste")
            .onClick(() => {
                this.paste()
            });
        this.$editButton = new ZSwitch("Edit")
            .whenClickChange((checked) => {
                this.state = checked ? NotesEditorState.edit : NotesEditorState.select;
            });
        this.$statusBar.append(
            this.$optionBox,
            this.$typeOption,
            this.$noteAboveOption,
            this.$editButton,
            this.$copyButton,
            this.$pasteButton,
            this.$selectOption
            )

        

        this.editor = editor;
        this.padding = 10;
        this.targetNNList = null;
        this.state = NotesEditorState.select
        this.wasEditing = false;
        this.positionBasis = 0;
        this.positionGridSpan = 135;
        this.positionSpan = 1350;
        this.timeGridSpan = 1;
        this.timeSpan = 2;
        this.noteType = NoteType.tap;
        this.canvas = document.createElement("canvas");
        this.context = this.canvas.getContext("2d");
        this.append(this.canvas)
        on(["mousedown", "touchstart"], this.canvas, (event) => {this.downHandler(event)})
        on(["mouseup", "touchend"], this.canvas, (event) => this.upHandler(event))
        on(["mousemove", "touchmove"], this.canvas, (event) => {
            const [offsetX, offsetY] = getOffsetCoordFromEvent(event, this.canvas);
            const canvasCoord = this.canvasPoint = new Coordinate(offsetX, offsetY).mul(this.invertedCanvasMatrix);
            const {x, y} = canvasCoord.mul(this.invertedMatrix);
            // const {width, height} = this.canvas
            // const {padding} = this;
            this.pointedPositionX = Math.round((x) / this.positionGridSpan) * this.positionGridSpan;
            const accurateBeats = y + this.lastBeats;
            this.pointedBeats = Math.floor(accurateBeats);
            this.beatFraction = Math.round((accurateBeats - this.pointedBeats) * editor.timeDivisor);
            if (this.beatFraction === editor.timeDivisor) {
                this.pointedBeats += 1;
                this.beatFraction = 0;
            }

            switch (this.state) {
                case NotesEditorState.selecting:
                    console.log("det")
                    console.log(this.selectedNote)
                    if (!this.selectedNote) {
                        console.warn("Unexpected error: selected note does not exist");
                        break;
                    }
                    const timeT: TimeT = [this.pointedBeats, this.beatFraction, editor.timeDivisor]
                    editor.operationList.do(new NoteValueChangeOperation(this.selectedNote, "positionX", this.pointedPositionX))
                    if (this.selectingTail) {
                        editor.operationList.do(new HoldEndTimeChangeOperation(this.selectedNote, timeT))
                    } else {
                        editor.operationList.do(new NoteTimeChangeOperation(this.selectedNote, this.selectedNote.parentNode.parentSeq.getNodeOf(timeT)))
                    }
                    

            }
        });
        on(["mousedown", "mousemove", "touchstart", "touchmove"], this.canvas, (event) => {
            if (this.drawn) {
                return
            }
            this.draw();
        });

        this.canvas.addEventListener("mouseenter", () => {
            this.mouseIn = true;
        })
        this.canvas.addEventListener("mouseleave", () => {
            this.mouseIn = false;
        })
        const map = {q: NoteType.tap, w: NoteType.drag, e: NoteType.flick, r: NoteType.hold}
        window.addEventListener("keydown", (e: KeyboardEvent) => { // 踩坑：Canvas不能获得焦点
            console.log("Key down:", e.key);
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
                case "q":
                case "w":
                case "e":
                case "r":
                    const noteType = map[e.key.toLowerCase()];
                    
                    const {beatFraction, pointedBeats} = this
                    const startTime: TimeT = [pointedBeats, beatFraction, editor.timeDivisor];
                    const endTime: TimeT = this.noteType === NoteType.hold ? [pointedBeats + 1, 0, 1] : [...startTime]
                    
                    const createOptions: NoteDataKPA = {
                        endTime: endTime,
                        startTime: startTime,
                        positionX: this.pointedPositionX,
                        above: this.noteAbove ? 1 : 0,
                        speed: this.targetNNList?.speed || undefined,
                        type: noteType
                    } as NoteDataKPA;
                    extend(createOptions, this.defaultConfig);
                    const note = Note.fromKPAJSON(createOptions, null); // 这里只能用visibleBeats创建，因此不需要tc
                    // this.editor.chart.getComboInfoEntity(startTime).add(note)
                    this.editor.operationList.do(new NoteAddOperation(note, this.target.getNode(note, true)));
                    break;
            }
        });
        
        this.timeGridColor = [120, 255, 170];
        this.positionGridColor = [255, 170, 120];
    }
    downHandler(event: TouchEvent | MouseEvent) {
        const {width, height} = this.canvas;
        // console.log(width, height)
        const [offsetX, offsetY] = getOffsetCoordFromEvent(event, this.canvas);
        const canvasCoord = this.canvasPoint = new Coordinate(offsetX, offsetY).mul(this.invertedCanvasMatrix);
        const coord = canvasCoord.mul(this.invertedMatrix);
        const {x, y} = coord;
        // console.log("offset:", offsetX, offsetY)
        // console.log("Coord:", x, y);
        switch (this.state) {
            case NotesEditorState.select:
            case NotesEditorState.selecting:
                const snote = this.selectionManager.click(canvasCoord);
                this.state = !snote ? NotesEditorState.select : NotesEditorState.selecting
                if (snote) {
                    const tar = snote.target;
                    const isTail = this.selectingTail = tar instanceof HoldTail
                    this.selectedNote = isTail ? tar.note : tar;
                    this.editor.switchSide(editor.noteEditor)
                }
                console.log(NotesEditorState[this.state])
                this.wasEditing = false;
                break;
            case NotesEditorState.edit:
                const {beatFraction, pointedBeats} = this
                const startTime: TimeT = [pointedBeats, beatFraction, editor.timeDivisor];
                const endTime: TimeT = this.noteType === NoteType.hold ? [pointedBeats + 1, 0, 1] : [...startTime]
                const createOptions: NoteDataKPA = {
                    endTime: endTime,
                    startTime: startTime,
                    positionX: this.pointedPositionX,
                    above: this.noteAbove ? 1 : 0,
                    speed: this.targetNNList?.speed || undefined,
                    type: this.noteType
                } as NoteDataKPA;
                extend(createOptions, this.defaultConfig);
                const note = Note.fromKPAJSON(createOptions, null); // 这里只能用visibleBeats创建，因此不需要tc
                // this.editor.chart.getComboInfoEntity(startTime).add(note)
                this.editor.operationList.do(new NoteAddOperation(note, this.target.getNode(note, true)));
                this.selectedNote = note;
                if (note.type === NoteType.hold) {
                    this.selectingTail = true;
                }
                this.state = NotesEditorState.selecting;
                this.editor.switchSide(this.editor.noteEditor)
                this.$editButton.checked = false;
                this.wasEditing = true;
                break;
            case NotesEditorState.selectScope:
                this.startingPoint = coord;
                this.startingCanvasPoint = canvasCoord;
                this.state = NotesEditorState.selectingScope;
                break;
        }
    }
    upHandler(event) {
        const [offsetX, offsetY] = getOffsetCoordFromEvent(event, this.canvas);
        const canvasCoord = new Coordinate(offsetX, offsetY).mul(this.invertedCanvasMatrix);
        const {x, y} = canvasCoord.mul(this.invertedMatrix);
        switch (this.state) {
            case NotesEditorState.selecting:
                this.state = this.wasEditing ? NotesEditorState.edit : NotesEditorState.select
                if (this.wasEditing) {
                    this.$editButton.checked = true;
                }
                break;
            case NotesEditorState.selectingScope:
                const [sx, ex] = [this.startingCanvasPoint.x, canvasCoord.x].sort((a, b) => a - b);
                const [sy, ey] = [this.startingCanvasPoint.y, canvasCoord.y].sort((a, b) => a - b);
                const array = this.selectionManager.selectScope(sy, sx, ey, ex);
                // console.log("Arr", array);
                // console.log(sx, sy, ex, ey)
                const notes = array.map(x => x.target).filter(x => x instanceof Note);
                switch (this.selectState) {
                    case SelectState.extend:
                        this.notesSelection = this.notesSelection.union(new Set(notes));
                        break;
                    case SelectState.replace:
                        this.notesSelection = new Set(notes);
                        break;
                    case SelectState.exclude:
                        this.notesSelection = this.notesSelection.difference(new Set(notes));
                        break;
                }
                this.notesSelection = new Set([...this.notesSelection].filter((note: Note) => !!note.parentNode))
                // console.log("bp")
                if (this.notesSelection.size !== 0) {
                    this.editor.multiNoteEditor.target = this.notesSelection;
                    this.editor.switchSide(editor.multiNoteEditor);
                }
                this.state = NotesEditorState.selectScope;
                break;
        }
    }
    _selectedNote: WeakRef<Note>;
    get selectedNote() {
        if (!this._selectedNote) {
            return undefined;
        }
        return this._selectedNote.deref()
    }
    set selectedNote(val: Note) {
        this._selectedNote = new WeakRef(val);
        this.editor.noteEditor.target = val;
    }
    matrix: Matrix;
    invertedMatrix: Matrix;
    canvasMatrix: Matrix;
    invertedCanvasMatrix: Matrix;
    updateMatrix() {
        this.positionRatio = this.canvas.width / this.positionSpan;
        this.timeRatio = this.canvas.height / this.timeSpan;
        const {
            // timeSpan,
            // positionSpan,
            timeRatio,
            positionRatio
        } = this;
        this.matrix = identity.scale(positionRatio, -timeRatio);
        this.invertedMatrix = this.matrix.invert();
        this.canvasMatrix = Matrix.fromDOMMatrix(this.context.getTransform());
        this.invertedCanvasMatrix = this.canvasMatrix.invert();
    }
    init(width: number, height: number) {
        this.positionRatio = width / 1350;
        this.canvas.width = width;
        this.canvas.height = height - this.$statusBar.clientHeight;
        this.context.translate(this.canvas.width / 2, this.canvas.height - this.padding)
        this.context.strokeStyle = "#EEE"
        this.context.fillStyle = "#333"
        this.context.font = "20px phigros"
        this.context.lineWidth = 2
    }
    drawCoordination(beats: number) {
        const {context, canvas} = this;
        const {width: canvasWidth, height: canvasHeight} = canvas;
        // console.log(canvasWidth, canvasHeight)
        const {
            positionGridSpan,
            positionRatio,
            positionSpan: positionRange,
            positionBasis,
            
            timeGridSpan,
            timeSpan,
            timeRatio,
            
            padding,

            pointedBeats,
            beatFraction
        } = this;
        const width = canvasWidth - padding * 2
        const height = canvasHeight - padding * 2
        context.fillStyle = "#333"

        context.fillRect(-canvasWidth / 2, padding - canvasHeight, canvasWidth, canvasHeight)

        context.save()
        context.lineWidth = 5;
        context.strokeStyle = "#EEE";
        // 基线
        drawLine(context, -canvasWidth / 2, 0, canvasWidth / 2, 0);
        context.fillStyle = "#EEE";
        context.fillText("State:" + NotesEditorState[this.state], 0, -height + 20)
        
        if (pointedBeats)
            context.fillText(`PointedTime: ${pointedBeats}:${beatFraction}/${this.editor.timeDivisor}`, 0, -height + 70)
        if (this.targetNNList && this.targetNNList.timeRanges) {
            context.fillText("Range:" + arrayForIn(this.targetNNList.timeRanges, (range) => range.join("-")).join(","), -100, -height + 50)
        }
        context.restore()

        // 绘制x坐标线
        // 计算上下界
        const upperEnd = Math.ceil((width / 2 - positionBasis) / positionGridSpan / positionRatio) * positionGridSpan
        const lowerEnd = Math.ceil((-width / 2 - positionBasis) / positionGridSpan / positionRatio) * positionGridSpan
        context.strokeStyle = rgb(...this.positionGridColor)
        context.lineWidth = 1;
        console.log(upperEnd, lowerEnd)
        // debugger;
        for (let value = lowerEnd; value < upperEnd; value += positionGridSpan) {
            const positionX = value * positionRatio + positionBasis;
            drawLine(context, positionX, -height + padding, positionX, 0);
            context.fillStyle = rgb(...this.positionGridColor)
            context.fillText(value + "", positionX, -height + padding)
            // debugger
        }
        context.strokeStyle = rgb(...this.timeGridColor)
        // 绘制时间线
        const startBeats = Math.floor(beats);
        const stopBeats = Math.ceil(beats + timeSpan);
        for (let time = startBeats; time < stopBeats; time += timeGridSpan) {
            const positionY = (time - beats)  * timeRatio
            drawLine(context, -width / 2, -positionY, width / 2, -positionY);
            context.save()
            context.fillStyle = rgb(...this.timeGridColor)
            context.fillText(time + "", -width / 2, -positionY)
            
            context.lineWidth = 1
            for (let i = 1; i < editor.timeDivisor; i++) {
                const minorPosY = (time + i / editor.timeDivisor - beats) * timeRatio
                drawLine(context, -width / 2, -minorPosY, width / 2, -minorPosY);
            }
            context.restore()
        }
    }
    draw(beats?: number) {
        beats = beats || this.lastBeats || 0;
        this.updateMatrix();
        this.selectionManager.refresh();
        const {context, canvas} = this;
        const {width: canvasWidth, height: canvasHeight} = canvas;
        const {
            positionGridSpan,
            positionRatio,
            positionSpan: positionRange,
            positionBasis,
            
            timeGridSpan,
            timeSpan: timeRange,
            timeRatio,
            
            padding} = this;
        const width = canvasWidth - padding * 2;
        const height = canvasHeight - padding * 2;
        this.drawCoordination(beats);
        if (this.targetNNList) {
            this.drawNNList(this.targetNNList, beats)
        } else {
            // Hold first, so that drag/flicks can be seen
            for (const lists of [this.target.hnLists, this.target.nnLists]) {
                for (const [_, list] of lists) {
                    this.drawNNList(list, beats)
                }
            }
        }
        // 绘制侧边音符节点标识
        if (DRAWS_NN && this.targetNNList) {
            context.save()
            context.lineWidth = 3;
            const jump = this.targetNNList.jump;
            const averageBeats = jump.averageBeats;
            const start = Math.floor(beats / averageBeats)
            const end = Math.ceil((beats + timeRange) / averageBeats)
            const array = jump.array;
            const array2 = this.targetNNList instanceof HNList ? this.targetNNList.holdTailJump.array : null;
            let lastNode = null;
            let color = COLOR_1;
            const minorAverageBeats = jump.averageBeats / MINOR_PARTS;
            const x = width / 2 - 10;
            const x2 = -width / 2 + 10;
            const switchColor = () => (context.strokeStyle = color = color === COLOR_1 ? COLOR_2 : COLOR_1)
            for (let i = start; i < end; i++) {
                const scale = array[i] as NNOrTail | NNOrTail[];
                if (!scale) {
                    continue;
                }
                const y = -(i * averageBeats - beats) * timeRatio;
                // console.log(i, y)
                if (Array.isArray(scale)) {
                    for (let j = 0; j < MINOR_PARTS; j++) {
                        const node = scale[j];
                        if (node !== lastNode) {
                            switchColor()
                            lastNode = node
                            context.fillText(node.type === NodeType.TAIL ? "Tail" : node.id.toString(), x - 30, y - j * minorAverageBeats * timeRatio)
                        }
                        drawLine(context, x - 4, y - j * minorAverageBeats * timeRatio, x, y - (j + 1) * minorAverageBeats * timeRatio + 5)
                    }
                } else {
                    if (scale !== lastNode) {
                        switchColor()
                        lastNode = scale
                    }
                    context.fillText(scale.type === NodeType.TAIL ? "Tail" : scale.id.toString(), x - 30, y)
                    drawLine(context, x - 10, y, x + 10, y - averageBeats * timeRatio + 5)
                }
            }
            if (array2) for (let i = start; i < end; i++) {
                const scale = array2[i] as NNOrTail | NNOrTail[];
                if (!scale) {
                    continue;
                }
                const y = -(i * averageBeats - beats) * timeRatio;
                // console.log(i, y)
                if (Array.isArray(scale)) {
                    for (let j = 0; j < MINOR_PARTS; j++) {
                        const node = scale[j];
                        if (node !== lastNode) {
                            switchColor()
                            lastNode = node
                            context.fillText(node.type === NodeType.TAIL ? "Tail" : `${node.id} (${timeToString(node.startTime)}-${timeToString(node.endTime)})`, x2 + 10, y - j * minorAverageBeats * timeRatio)
                        }
                        drawLine(context, x2 - 4, y - j * minorAverageBeats * timeRatio, x2, y - (j + 1) * minorAverageBeats * timeRatio + 5)
                    }
                } else {
                    if (scale !== lastNode) {
                        switchColor()
                        lastNode = scale
                    }
                    context.fillText(scale.type === NodeType.TAIL ? "Tail" : `${scale.id} (${timeToString(scale.startTime)}-${timeToString(scale.endTime)})`, x2 + 10, y)
                    drawLine(context, x2 - 10, y, x2 + 10, y - averageBeats * timeRatio + 5)
                }
            }
            context.restore()
        }
        if (this.state === NotesEditorState.selectingScope) {
            const {startingCanvasPoint, canvasPoint} = this;
            context.save()
            context.strokeStyle = "#84F";
            context.strokeRect(startingCanvasPoint.x, startingCanvasPoint.y, canvasPoint.x - startingCanvasPoint.x, canvasPoint.y - startingCanvasPoint.y);
            context.restore()
        }
        
        this.drawn = false;
        this.lastBeats = beats
    }
    drawNNList(tree: NNList, beats: number) {
        const timeRange = this.timeSpan
        let noteNode = tree.getNodeAt(beats, true);
        if (noteNode.type === NodeType.TAIL) {
            return
        }
        while (!(noteNode.type === NodeType.TAIL) && TimeCalculator.toBeats(noteNode.startTime) < beats + timeRange) {
            const notes = noteNode.notes
                , length = notes.length
            const posMap = new Map<number, number>();
            for (let i = 0; i < length; i++) {
                const note = notes[i];
                const posX = note.positionX;
                const count = posMap.get(note.positionX) || 0;
                this.drawNote(beats, note, i === 0, count);
                posMap.set(posX, count + 1)
            }
            noteNode = noteNode.next // 这句之前忘了，卡死了，特此留念（
        }
    }
    drawNote(beats: number, note: Note, isTruck: boolean, nth: number) {
        const context = this.context;
        const {
            //positionGridSpan,
            positionRatio,
            //positionSpan: positionRange,
            //positionBasis,
            
            //timeGridSpan,
            //timeSpan: timeRange,
            timeRatio,
            
            padding,
            matrix
        } = this;
        const start = TimeCalculator.toBeats(note.startTime) - beats
        const end = TimeCalculator.toBeats(note.endTime) - beats
        const {x: posX, y: posY} = new Coordinate(note.positionX, start).mul(matrix);
        const posLeft = posX - NOTE_WIDTH / 2;
        const isHold = note.type === NoteType.hold;
        let rad: number;
        if (nth !== 0){
            rad = Math.PI * (1 - Math.pow(2, -nth));
            context.save();
            context.translate(posX, posY);
            context.rotate(rad);
            context.drawImage(getImageFromType(note.type), -NOTE_WIDTH / 2, -NOTE_HEIGHT / 2, NOTE_WIDTH, NOTE_HEIGHT)
            if (this.notesSelection.has(note)) {
                context.save()
                context.fillStyle = "#DFD9";
                context.fillRect(-NOTE_WIDTH / 2, -NOTE_HEIGHT / 2, NOTE_WIDTH, NOTE_HEIGHT)
                context.restore()
            }
            else if (this.selectedNote === note) {
                context.drawImage(SELECT_NOTE, -NOTE_WIDTH / 2, -NOTE_HEIGHT / 2, NOTE_WIDTH, NOTE_HEIGHT)
            }
            context.restore();
            this.selectionManager.add({
                target: note,
                centerX: posX,
                centerY: posY,
                width: NOTE_WIDTH,
                height: NOTE_HEIGHT,
                rad,
                priority: isHold ? 1 : 2
            })
        } else {
            const posTop = posY - NOTE_HEIGHT / 2
            context.drawImage(getImageFromType(note.type), posLeft, posTop, NOTE_WIDTH, NOTE_HEIGHT)
            if (this.notesSelection.has(note)) {
                context.save();
                context.fillStyle = "#DFD9";
                context.fillRect(posLeft, posTop, NOTE_WIDTH, NOTE_HEIGHT);
                context.restore();
            }
            else if (this.selectedNote === note && !this.selectingTail) {
                context.drawImage(SELECT_NOTE, posLeft, posTop, NOTE_WIDTH, NOTE_HEIGHT)
            }
            this.selectionManager.add({
                target: note,
                centerX: posX,
                centerY: posY,
                height: NOTE_HEIGHT,
                width: NOTE_WIDTH,
                priority: isHold ? 1 : 2
            })
        }
        if (isHold) {
            context.drawImage(HOLD_BODY, posLeft, -end * timeRatio, NOTE_WIDTH, (end - start) * timeRatio);
            this.selectionManager.add({
                target: new HoldTail(note),
                left: posLeft,
                top: -end * timeRatio,
                height: NOTE_HEIGHT,
                width: NOTE_WIDTH,
                priority: 1
                })
            this.selectionManager.add({
                target: note,
                left: posLeft,
                top: -end * timeRatio,
                height: (end - start) * timeRatio,
                width: NOTE_WIDTH,
                priority: 0
            })
        }
    }





    paste() {
        const {clipboard, lastBeats} = this;
        const {timeDivisor} = this.editor;
        if (!clipboard || clipboard.size === 0) {
            return;
        }
        if (!lastBeats) {
            notify("Have not rendered a frame")
        }
        const notes = [...clipboard];
        notes.sort((a: Note, b: Note) => TimeCalculator.gt(a.startTime, b.startTime) ? 1 : -1);
        const startTime: TimeT = notes[0].startTime;
        // const portions: number = Math.round(timeDivisor * lastBeats);
        const dest: TimeT = [this.pointedBeats, this.beatFraction, timeDivisor];
        const offset: TimeT = TimeCalculator.sub(dest, startTime);

        
        const newNotes: Note[] = notes.map(n => n.clone(offset));
        this.editor.operationList.do(new MultiNoteAddOperation(newNotes, this.target));
        this.editor.multiNoteEditor.target = this.notesSelection = new Set<Note>(newNotes);
        this.editor.update();
    }
    copy(): void {
        this.clipboard = this.notesSelection;
        this.notesSelection = new Set<Note>();
        this.editor.update();
    }
}