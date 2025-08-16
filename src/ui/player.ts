const ENABLE_PLAYER = true;
const DRAWS_NOTES = true;

const DEFAULT_ASPECT_RATIO = 3 / 2
const LINE_WIDTH = 10;
const LINE_COLOR = "#CCCC77";
const HIT_EFFECT_SIZE = 200;
const HALF_HIT = HIT_EFFECT_SIZE / 2

// 以原点为中心，渲染的半径
const RENDER_SCOPE = 900;

const getVector = (theta: number): [Vector, Vector] => [[Math.cos(theta), Math.sin(theta)], [-Math.sin(theta), Math.cos(theta)]]
type HEX = number;

class Player {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    hitCanvas: HTMLCanvasElement;
    hitContext: CanvasRenderingContext2D
    chart: Chart;
    audio: HTMLAudioElement;
    audioProcessor: AudioProcessor;
    playing: boolean;
    background: HTMLImageElement;
    aspect: number;
    noteSize: number;
    noteHeight: number;
    // soundQueue: SoundEntity[];
    lastBeats: number

    tintNotesMapping: Map<HEX, OffscreenCanvas | ImageBitmap> = new Map();
    tintEffectMapping: Map<HEX, OffscreenCanvas | ImageBitmap> = new Map();

    greenLine: number = 0;
    
    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas
        this.context = canvas.getContext("2d");
        this.audioProcessor = new AudioProcessor();
        this.hitCanvas = document.createElement("canvas");
        this.hitContext = this.hitCanvas.getContext("2d");
        this.audio = new Audio();
        this.playing = false;
        this.aspect = DEFAULT_ASPECT_RATIO;
        this.noteSize = 175;
        this.noteHeight = 10;
        this.initCoordinate();
        this.audio.addEventListener("ended", () => {
            this.playing = false;
        })
        this.initGreyScreen();
    }
    get time(): number {
        return (this.audio.currentTime || 0) - this.chart.offset / 1000 - 0.017;
    }
    get beats(): number {
        return this.chart.timeCalculator.secondsToBeats(this.time)
    }
    initCoordinate() {
        let {canvas, context, hitCanvas, hitContext} = this;
        
        // console.log(context.getTransform())
        const height = 900;
        const width = 1350;
        canvas.height = height;
        canvas.width = width;
        hitCanvas.height = height;
        hitCanvas.width = width
        
        const RATIO = 1.0
        // 计算最终的变换矩阵
        const tx = width / 2;
        const ty = height / 2;

        // 设置变换矩阵
        context.setTransform(RATIO, 0, 0, RATIO, tx, ty);
        //hitContext.scale(0.5, 0.5)
        context.save()
        hitContext.save()
        // console.log(context.getTransform())
    }
    renderDropScreen() {
        const {canvas, context} = this;
        context.fillStyle = "#6cf"
        context.fillRect(-675, -450, 1350, 900);
        context.fillStyle = "#444"
        context.font = "100px phigros"
        const metrics = context.measureText("松手释放");
        context.fillText("松手释放", -metrics.width/2, 0)
        context.restore();
        context.save();
    }
    renderGreyScreen() {
        const {canvas, context} = this;
        context.fillStyle = "#AAA"
        context.fillRect(-675, -450, 1350, 900);
        context.fillStyle = "#444"
        context.font = "100px phigros"
        const metrics = context.measureText("放入文件");
        context.fillText("放入文件", -metrics.width/2, 0)
        context.restore();
        context.save();
    }
    initGreyScreen() {
        const {canvas, context} = this;
        this.renderGreyScreen()
    }
    render() {
        if (!ENABLE_PLAYER) {
            return;
        }
        // console.time("render")
        const context = this.context;
        const hitContext = this.hitContext;
        hitContext.clearRect(0, 0, 1350, 900);
        context.drawImage(this.background, -675, -450, 1350, 900);
        // 涂灰色（背景变暗）
        context.fillStyle = "#2227";
        context.fillRect(-27000, -18000, 54000, 36000)
        // 画出渲染范围圆
        context.strokeStyle = "#66ccff";
        context.arc(0, 0, RENDER_SCOPE, 0, 2 * Math.PI);
        context.stroke()
        context.restore()
        context.save()

        context.strokeStyle = "#FFFFFF"
        drawLine(context, -1350, 0, 1350, 0)
        drawLine(context, 0, 900, 0, -900);
        
        // console.log("rendering")
        for (let line of this.chart.orphanLines) {
            this.renderLine(identity.translate(675, 450).scale(1, -1), line);
            context.restore()
            context.save()
        }
        hitContext.strokeStyle = "#66ccff";
        hitContext.lineWidth = 5;
        drawLine(hitContext, 0, 900, 1350, 0)
        context.drawImage(this.hitCanvas, -675, -450, 1350, 900)
        context.restore()
        context.save()

        const showInfo = settings.get("playerShowInfo");
        if (showInfo) {
            context.fillStyle = "#ddd"
            context.font = "50px phigros"
            const chart = this.chart;
            const title = chart.name;
            const level = chart.level;
            context.fillText(title, -650, 400);
            context.restore()
            context.save()
        }

        // this.soundQueue = [];
        
        // console.timeEnd("render")
    }
    renderLine(matrix: Matrix, judgeLine: JudgeLine) {
        const context = this.context;
        const timeCalculator = this.chart.timeCalculator
        const beats = this.beats;
        // const timeCalculator = this.chart.timeCalculator
        const alpha = judgeLine.getStackedValue("alpha", beats);
        if (judgeLine.nnLists.size === 0 && judgeLine.hnLists.size === 0 && alpha <= 0 && judgeLine.children.size === 0) {
            return;
        }
        const x = judgeLine.getStackedValue("moveX", beats);
        const y = judgeLine.getStackedValue("moveY", beats);
        const theta = judgeLine.getStackedValue("rotate", beats) * Math.PI / 180;
        judgeLine.moveX = x;
        judgeLine.moveY = y;
        judgeLine.rotate = theta;
        judgeLine.alpha = alpha;
        // console.log(x, y, theta, alpha);
        // console.time("calculate coordinate");
        const {x: transformedX, y: transformedY} = new Coordinate(x, y).mul(matrix);
        const MyMatrix = identity.translate(transformedX, transformedY).rotate(-theta).scale(1, -1);
        // console.timeEnd("calculate coordinate");
        // console.time("transform");
        context.setTransform(MyMatrix);
        // console.timeEnd("transform");

        if (judgeLine.children.size !== 0) {
            for (let line of judgeLine.children) {
                context.save();
                this.renderLine(MyMatrix, line);
                context.restore();
            }
        }

        context.lineWidth = LINE_WIDTH; // 判定线宽度
        // const hexAlpha = alpha < 0 ? "00" : (alpha > 255 ? "FF" : alpha.toString(16))
        const lineColor = settings.get("lineColor")
        context.strokeStyle = rgba(...(this.greenLine === judgeLine.id ? ([100, 255, 100] as RGB) : lineColor), alpha / 255)
        drawLine(context, -2025, 0, 2025, 0) // Fixes #1
        context.drawImage(ANCHOR, -10, -10)

        /** 判定线的法向量 */
        const nVector: Vector = getVector(theta)[1] // 奇变偶不变，符号看象限(
        const toCenter: Vector = [675 - transformedX, 450 - transformedY];
        // 法向量是单位向量，分母是1，不写
        /** the distance between the center and the line */
        const innerProd = innerProduct(toCenter, nVector)
        const getYs = (offset: number) => {
            
            const distance: number = Math.abs(innerProd + offset);
            let startY: number, endY: number;
            if (distance < RENDER_SCOPE) {
                startY = 0;
                endY = distance + RENDER_SCOPE
            } else {
                startY = distance - RENDER_SCOPE
                endY = distance + RENDER_SCOPE
            }
            return [startY, endY]
        }
        /*
        const drawScope = (y: number) => {
            if (y<=1e-6) return
            context.save()
            context.strokeStyle = "#66ccff"
            context.lineWidth = 2
            drawLine(context, -1350, +y, 1350, +y)
            drawLine(context, -1350, -y, 1350, -y)
            context.restore()

        }
        */

        const hitRenderLimit = beats > 0.66 ? beats - 0.66 : 0 // 渲染 0.66秒内的打击特效
        const holdTrees = judgeLine.hnLists;
        const noteTrees = judgeLine.nnLists;
        // console.time("Updating integral");
        if (holdTrees.size || noteTrees.size) {
            judgeLine.updateSpeedIntegralFrom(beats, timeCalculator)
        }
        
        // console.timeEnd("Updating integral");
        
        for (let trees of [holdTrees, noteTrees]) {
            for (const [_, list] of trees) {
                const speedVal: number = list.speed;
                if (DRAWS_NOTES) {
                    // debugger
                    // 渲染音符
                    // console.time("computeTimeRange")
                    const [startY, endY] = getYs(list.medianYOffset)
                    const timeRanges = speedVal !== 0 ? judgeLine.computeTimeRange(beats, timeCalculator, startY / speedVal, endY / speedVal) : [[0, Infinity] as [number, number]];
                    list.timeRanges = timeRanges
                    // console.timeEnd("computeTimeRange");
                    // console.time("Rendering notes");
                    // console.log(timeRanges, startY, endY);
                    for (let range of timeRanges) {
                        const start = range[0];
                        const end = range[1];
                        // drawScope(judgeLine.getStackedIntegral(start, timeCalculator))
                        // drawScope(judgeLine.getStackedIntegral(end, timeCalculator))
                        
                        let noteNode: NNOrTail = list.getNodeAt(start, true);
                        // console.log(noteNode)
                        let startBeats;
                        
                        while (!(noteNode.type === NodeType.TAIL)
                            && (startBeats = TimeCalculator.toBeats(noteNode.startTime)) < end
                        ) {
                            // 判断是否为多押
                            const isChord = noteNode.notes.length > 1
                                || noteNode.totalNode.noteNodes.some(node => node !== noteNode && node.notes.length)
                                || noteNode.totalNode.holdNodes.some(node => node !== noteNode && node.notes.length)
                            this.renderSameTimeNotes(noteNode, isChord, judgeLine, timeCalculator);
                            noteNode = noteNode.next;
                        }
                        
                    }
                    // console.timeEnd("Rendering notes");
                }
                // console.time("Rendering hit effects");
                // 打击特效
                if (beats > 0) {
                    if (list instanceof HNList) {
                        this.renderHoldHitEffects(MyMatrix, list, beats, hitRenderLimit, beats, timeCalculator)
                    } else {
                        this.renderHitEffects(MyMatrix, list, hitRenderLimit, beats, timeCalculator)
                    }
                }
                // console.timeEnd("Rendering hit effects");

            }

        }

        this.playSounds()

        
        
        /*
        for (let eachSpeed in judgeLine.noteSpeeds) {
            const speed = parseFloat(eachSpeed)
            let notes = judgeLine.noteSpeeds[eachSpeed];
            /** 判定线在假想的瀑布中前进距离 /
            let currentPositionY = judgeLine.computeLinePositionY(this.beats, this.chart.timeCalculator) * speed;
            for (let eachNote of notes) {
                /** Note在某一时刻与判定线的距离 /
                const positionY: number = eachNote.positionY - currentPositionY;
                const endPositionY = eachNote.endPositionY - currentPositionY;
                if (!positionY && positionY !== 0 || !endPositionY && endPositionY !== 0) {
                    debugger;
                }
                if (endPositionY >= 0 && TimeCalculator.toBeats(eachNote.endTime) >= this.beats) {
                    // 绑线Note=0不要忘了
                    this.renderNote(eachNote, positionY < 0 ? 0 : positionY, endPositionY)
                    // console.log(eachNote, eachNote.above)
                    // console.log("pos:", eachNote.positionY, notes.indexOf(eachNote))
                }
            }
        }
        */
    }
    lastUnplayedNNNode: NNNode | NNNodeLike<NodeType.TAIL>;
    playSounds() {
        if (!this.playing) {
            return;
        }
        const beats = this.beats;
        const lastNNN: NNNOrTail = this.lastUnplayedNNNode;
        const startingFrom = lastNNN.type === NodeType.TAIL ? Infinity : TimeCalculator.toBeats(lastNNN.startTime);
        if (startingFrom >= beats) {
            this.lastUnplayedNNNode = this.chart.nnnList.getNodeAt(beats)
            return;
        }
        let node: NNNOrTail = lastNNN;
        for (; node.type !== NodeType.TAIL && TimeCalculator.toBeats(node.startTime) < beats; node = node.next) {
            const nns = node.noteNodes;
            const hns = node.holdNodes;
            const nnl = nns.length;
            for (let i = 0; i < nnl; i++) {
                const node: NoteNode = nns[i];
                const nl = node.notes.length;
                for (let j = 0; j < nl; j++) {
                    const note = node.notes[j];
                    if (note.isFake) {
                        continue;
                    }
                    this.audioProcessor.playNoteSound(note.type);
                }
            }
            const hnl = hns.length;
            for (let i = 0; i < hnl; i++) {
                const node: NoteNode = hns[i];
                const nl = node.notes.length;
                for (let j = 0; j < nl; j++) {
                    const note: Note = node.notes[j];
                    if (note.isFake) {
                        continue;
                    }
                    this.audioProcessor.playNoteSound(NoteType.hold);
                }
            }
        }
        this.lastUnplayedNNNode = node;
    }
    renderHitEffects(matrix: Matrix, tree: NNList, startBeats: number, endBeats: number, timeCalculator: TimeCalculator) {
        let noteNode = tree.getNodeAt(startBeats, true);
        const {hitContext} = this;
        // console.log(hitContext.getTransform())
        const end = tree.getNodeAt(endBeats);
        if (noteNode.type === NodeType.TAIL) {
            return;
        }
        while (noteNode !== end) {
            const beats = TimeCalculator.toBeats(noteNode.startTime);
            const notes = noteNode.notes
            , len = notes.length
            for (let i = 0; i < len; i++) {
                const note = notes[i];
                if (note.isFake) {
                    continue;
                }
                const posX = note.positionX;
                const yo = note.yOffset * (note.above ? 1 : -1);
                const {x, y} = new Coordinate(posX, yo).mul(matrix);
                // console.log("he", x, y);
                const he = note.tintHitEffects;
                const nth = Math.floor((this.time - timeCalculator.toSeconds(beats)) * 30);
                drawNthFrame(hitContext, he !== undefined ? this.getTintHitEffect(he) : HIT_FX, nth,x - HALF_HIT, y - HALF_HIT, HIT_EFFECT_SIZE, HIT_EFFECT_SIZE)
            }

            noteNode = <NoteNode>noteNode.next
        } 
    }
    /**
     * 
     * @param judgeLine 
     * @param tree 
     * @param beats 当前拍数
     * @param startBeats 
     * @param endBeats 截止拍数
     * @param timeCalculator 
     * @returns 
     */
    renderHoldHitEffects(matrix: Matrix, tree: HNList, beats: number, startBeats: number, endBeats: number, timeCalculator: TimeCalculator) {
        const start = tree.getNodeAt(startBeats, true);
        const {hitContext} = this;
        let noteNode = start;
        const end = tree.getNodeAt(endBeats);
        if (noteNode.type === NodeType.TAIL) {
            return;
        }
        if (noteNode !== end)
        // console.log("start", start, startBeats, endBeats)
        while (noteNode !== end) {
            const notes = noteNode.notes
            , len = notes.length
            for (let i = 0; i < len; i++) {
                const note = notes[i];
                if (note.isFake) {
                    continue;
                }
                if (startBeats > TimeCalculator.toBeats(note.endTime)) {
                    continue;
                }
                const posX = note.positionX;
                const yo = note.yOffset * (note.above ? 1 : -1);
                const {x, y} = new Coordinate(posX, yo).mul(matrix);
                const nth = Math.floor((this.beats - Math.floor(this.beats)) * 30);
                const he = note.tintHitEffects;
                
                drawNthFrame(hitContext, he !== undefined ? this.getTintHitEffect(he) : HIT_FX, nth,
                x - HALF_HIT, y - HALF_HIT, HIT_EFFECT_SIZE, HIT_EFFECT_SIZE)
            }
            noteNode = <NoteNode>noteNode.next
        }
    }
    renderSameTimeNotes(noteNode: NoteNode, chord: boolean, judgeLine: JudgeLine, timeCalculator: TimeCalculator) {
        if (noteNode.isHold) {
            const startY = judgeLine.getStackedIntegral(TimeCalculator.toBeats(noteNode.startTime), timeCalculator) * noteNode.parentSeq.speed;
            const notes = noteNode.notes
                , len = notes.length
            for (let i = 0; i < len; i++) {
                const note = notes[i]
                this.renderNote(
                    note,
                    chord,
                    startY < 0 ? 0 : startY,
                    judgeLine.getStackedIntegral(TimeCalculator.toBeats(note.endTime), timeCalculator) * note.speed
                    )
            }
        } else {
            // console.log("renderSameTimeNotes", noteNode)
            const notes = noteNode.notes
            , len = notes.length
            for (let i = 0; i < len; i++) {
                const note = notes[i];
                this.renderNote(
                    note,
                    chord,
                    judgeLine.getStackedIntegral(TimeCalculator.toBeats(note.startTime), timeCalculator) * note.speed
                )

            }
        }
    }
    renderNote(note: Note, chord: boolean, positionY: number, endpositionY?: number) {
        // console.log(note, this.beats)
        if (TimeCalculator.toBeats(note.endTime) < this.beats) {
            return;
        }
        if (TimeCalculator.toBeats(note.startTime) - note.visibleBeats > this.beats) {
            return;
        }
        let image: HTMLImageElement | OffscreenCanvas | ImageBitmap = note.tint ? this.getTintNote(note.tint, note.type) : getImageFromType(note.type);
        const context = this.context;
        let zero = 0;
        
        if (note.yOffset) {
            positionY += note.yOffset;
            endpositionY += note.yOffset;
            zero = note.yOffset;
        }
        if (!note.above) {
            positionY = -positionY;
            endpositionY = -endpositionY
        }
        let length = endpositionY - positionY
        const size = this.noteSize * note.size;
        const half = size / 2;
        const height = this.noteHeight;
        // console.log(NoteType[note.type])
        const opac = note.alpha < 255
        if (opac) {
            context.save()
            context.globalAlpha = note.alpha / 255;
        }
        if (note.type === NoteType.hold) {
            const isJudging = TimeCalculator.toBeats(note.startTime) <= this.beats
            positionY = isJudging ? zero : positionY;
            length = isJudging ? (endpositionY - zero) : length;
            context.drawImage(HOLD_BODY, note.positionX - half, positionY - 10, size, length);
        }
            
        context.drawImage(image, note.positionX - half, positionY - 10, size, height)
        
        if (chord) {
            context.drawImage(DOUBLE, note.positionX - half, positionY - 10, size, height);
        }
        if (!note.above) {
            context.drawImage(BELOW, note.positionX - half, positionY - 10, size, height);
        }
        if (opac) {
            context.restore()
        }
    }
    getTintNote(tint: HEX, type: NoteType): OffscreenCanvas | ImageBitmap {
        const map = this.tintNotesMapping;
        const key = tint | type << 24; // 25位整形表示一个类型的Note贴图
        const canBeSource = map.get(key);
        if (canBeSource) {
            return canBeSource;
        }
        const source = new OffscreenCanvas(NOTE_WIDTH, NOTE_HEIGHT);
        const context = source.getContext('2d');
        context.drawImage(getImageFromType(type), 0, 0, NOTE_WIDTH, NOTE_HEIGHT);
        context.globalCompositeOperation = 'multiply';
        context.fillStyle = "#" + tint.toString(16).padStart(6, "0");
        context.fillRect(0, 0, NOTE_WIDTH, NOTE_HEIGHT);
        map.set(key, source); // 在ImageBitmap创建完成之前，先使用Canvas临时代替
        createImageBitmap(source).then((bmp: ImageBitmap) => {
            map.set(key, bmp);
        })
        return source;
    }
    getTintHitEffect(tint: HEX): OffscreenCanvas | ImageBitmap {
        const map = this.tintEffectMapping;
        const key = tint;
        const canBeSource = map.get(key);
        if (canBeSource) {
            return canBeSource;
        }
        const source = new OffscreenCanvas(HIT_FX_SIZE, HIT_FX_SIZE);
        const context = source.getContext('2d');
        context.clearRect(0, 0, HIT_FX_SIZE, HIT_FX_SIZE);
        context.drawImage(HIT_FX, 0, 0, HIT_FX_SIZE, HIT_FX_SIZE);

        context.globalCompositeOperation = 'source-in';
        context.fillStyle = "#" + tint.toString(16);
        context.fillRect(0, 0, HIT_FX_SIZE, HIT_FX_SIZE);

        context.globalCompositeOperation = 'multiply';
        context.drawImage(HIT_FX, 0, 0, HIT_FX_SIZE, HIT_FX_SIZE);
        map.set(key, source);
        createImageBitmap(source).then((bmp: ImageBitmap) => {
            map.set(key, bmp);
        })
        return source;
    }
    private update() {
        if (!this.playing) {
            return;
        }
        // console.log("anifr")
        requestAnimationFrame(() => {
            // console.log("render")
            this.render();
            this.update();
        })
        this.lastBeats = this.beats
    }
    play() {
        this.audio.play()
        this.playing = true;
        this.update();
    }
    pause() {
        this.audio.pause()
        this.playing = false
    }
    receive(chart: Chart) {
        this.chart = chart;
        this.lastUnplayedNNNode = chart.nnnList.head.next;
    }
}

class ZProgressBar extends Z<"progress"> {
    target: HTMLAudioElement;
    constructor(target: HTMLAudioElement) {
        super("progress");
        this.target = target;
        const element = this.element;
        if (target.duration) {
            this.element.max = target.duration;
        }
        target.addEventListener("loadeddata", () => {
            this.element.max = target.duration;
        });
        target.addEventListener("play", () => {
            this.update();
        });
        let controlling = false;
        on(["mousedown", "touchstart"], element, (event: MouseEvent | TouchEvent) => {
            controlling = true;
            this.dispatchEvent(new Event("pause"));
        });
        on(["mousemove", "touchmove"], element, (event: MouseEvent | TouchEvent) => {
            let posX: number;
            if (!controlling) {
                return;
            }
            if (event instanceof MouseEvent) {
                posX = event.clientX
            } else {
                posX = event.changedTouches[0].clientX
            }
            const value = element.max * ((posX - element.offsetLeft) / element.clientWidth);
            element.value = value;
            target.currentTime = value;
            this.dispatchEvent(new CustomEvent("change", {detail: value}))
        })
        on(["mouseup", "touchend"], element, (event: MouseEvent | TouchEvent) => {
            let posX: number;
            if (!controlling) {
                return;
            }
            controlling = false;
            if (event instanceof MouseEvent) {
                posX = event.clientX
            } else {
                posX = event.changedTouches[0].clientX
            }
            const value = element.max * ((posX - element.offsetLeft) / element.clientWidth);
            element.value = value;
            target.currentTime = value;
            
            this.dispatchEvent(new CustomEvent("change", {detail: value}))
        })
        on(["mouseleave", "touchend"], element, () => {
            controlling = false;
        })
    }
    update() {
        if (this.target.paused) {
            return;
        }
        requestAnimationFrame(() => {
            this.element.value = this.target.currentTime;
            this.update();
        })
    }
}



class SoundEntity {
    type: NoteType;
    // playsSound: boolean;
    // posX: number;
    // posY: number;
    beats: number;
    seconds: number;
    // playingSound: boolean;
    constructor(type: NoteType, beats: number, timeCalculator: TimeCalculator) {
        this.type = type;
        // this.playsSound = playsSound;
        // this.posX = posX;
        // this.posY = posY;
        this.beats = beats;
        this.seconds = timeCalculator.toSeconds(beats)
        // this.playingSound = false;
    }
}

