/**
 * @author Zes M Young
 */


const NNLIST_Y_OFFSET_HALF_SPAN = 100


const node2string = (node: AnyNN) => {
    if (!node) {
        return "" + node
    }
    if (node.type === NodeType.HEAD || node.type === NodeType.TAIL) {
        return node.type === NodeType.HEAD ? "H" : node.type === NodeType.TAIL ? "T" : "???"
    }
    if (!node.notes) {
        return "EventNode"
    }
    return `NN(${node.notes.length}) at ${node.startTime}`
}


const rgb2hex = (rgb: RGB) => {
    return rgb[0] << 16 | rgb[1] << 8 | rgb[2];
}

const hex2rgb = (hex: number): RGB => {
    return [hex >> 16, hex >> 8 & 0xFF, hex & 0xFF]
}

const notePropTypes = {
    above: "boolean",
    alpha: "number",
    endTime: ["number", "number", "number"],
    isFake: "boolean",
    positionX: "number",
    size: "number",
    speed: "number",
    startTime: ["number", "number", "number"],
    type: "number",
    visibleTime: "number",
    visibleBeats: "number",
    yOffset: "number",
    tint: ["number", "number", "number"],
    tintHitEffects: ["number", "number", "number"],
    judgeSize: "number"
}

/**
 * 音符
 * Basic element in music game.
 * Has 4 types: tap, drag, flick and hold.
 * Only hold has endTime; others' endTime is equal to startTime.
 * For this reason, holds are store in a special list (HNList),
 * which is sorted by both startTime and endTime,
 * so that they are accessed correctly and rapidly in the renderer.
 * Note that Hold and HoldNode are not individually-declared classes.
 * Hold is a note with type being NoteType.hold,
 * while HoldNode is a node that contains holds.
 */
class Note {
    above: boolean;
    alpha: number;
    endTime: [number, number, number]
    isFake: boolean;
    /** x coordinate in the judge line */
    positionX: number;
    size: number;
    speed: number;
    startTime: [number, number, number];
    type: NoteType;
    visibleTime: number;
    visibleBeats: number;
    yOffset: number;
    /*
     * 和打击位置的距离，与yOffset和上下无关，为负不可见
    positionY: number;
    endPositionY?: number;
     */
    /*
    next: NNOrTail;
    previousSibling?: Note;
    nextSibling: Note;
    */

    parentNode: NoteNode;
    tint: HEX;
    tintHitEffects: HEX;
    judgeSize: number;

    // readonly chart: Chart;
    // readonly judgeLine: JudgeLine
    // posPrevious?: Note;
    // posNext?: Note;
    // posPreviousSibling?: Note;
    // posNextSibling: Note;
    constructor(data: NoteDataRPE) {
        this.above = data.above === 1;
        this.alpha = data.alpha ?? 255;
        this.endTime = data.type === NoteType.hold ? TimeCalculator.validateIp(data.endTime) : TimeCalculator.validateIp([...data.startTime]);
        this.isFake = Boolean(data.isFake);
        this.positionX = data.positionX;
        this.size = data.size ?? 1.0;
        this.speed = data.speed ?? 1.0;
        this.startTime = TimeCalculator.validateIp(data.startTime);
        this.type = data.type;
        this.visibleTime = data.visibleTime;
        // @ts-expect-error
        this.yOffset = data.absoluteYOffset ?? data.yOffset * this.speed;
        // @ts-expect-error 若data是RPE数据，则为undefined，无影响。
        // 当然也有可能是KPA数据但是就是没有给
        this.visibleBeats = data.visibleBeats;

        this.tint = data.tint ? rgb2hex(data.tint) : undefined;
        this.tintHitEffects = data.tintHitEffects ? rgb2hex(data.tintHitEffects) : undefined;
        this.judgeSize = data.judgeSize ?? this.size;
        /*
        this.previous = null;
        this.next = null;
        this.previousSibling = null;
        this.nextSibling = null;
        */
    }
    static fromKPAJSON(data: NoteDataKPA, timeCalculator: TimeCalculator) {
        const note = new Note(data);
        if (!note.visibleBeats) {
            note.computeVisibleBeats(timeCalculator);
        }
        return note;
    }
    computeVisibleBeats(timeCalculator: TimeCalculator) {
        if (!this.visibleTime || this.visibleTime >= 90000) {
            this.visibleBeats = Infinity;
            return;
        }
        const hitBeats = TimeCalculator.toBeats(this.startTime);
        const hitSeconds = timeCalculator.toSeconds(hitBeats);
        const visabilityChangeSeconds = hitSeconds - this.visibleTime;
        const visabilityChangeBeats = timeCalculator.secondsToBeats(visabilityChangeSeconds);
        this.visibleBeats = hitBeats - visabilityChangeBeats;
    }
    /**
     * 
     * @param offset 
     * @returns 
     */
    clone(offset: TimeT) {
        const data = this.dumpKPA();
        data.startTime = TimeCalculator.add(data.startTime, offset);
        data.endTime = TimeCalculator.add(data.endTime, offset); // 踩坑
        return new Note(data);
    }
    /*
    static connectPosSibling(note1: Note, note2: Note) {
        note1.posNextSibling = note2;
        note2.posPreviousSibling = note1;
    }
    static connectPos(note1: Note, note2: Note) {
        note1.posNext = note2;
        note2.posPrevious = note1;
    }
    */
    dumpRPE(timeCalculator: TimeCalculator): NoteDataRPE {
        let visibleTime: number;
        if (this.visibleBeats !== Infinity) {
            const beats = TimeCalculator.toBeats(this.startTime);
            this.visibleBeats = timeCalculator.segmentToSeconds(beats - this.visibleBeats, beats);
        } else {
            visibleTime = 99999.0
        }
        return {
            above: this.above ? 1 : 0,
            alpha: this.alpha,
            endTime: this.endTime,
            isFake: this.isFake ? 1 : 0,
            positionX: this.positionX,
            size: this.size,
            startTime: this.startTime,
            type: this.type,
            visibleTime: visibleTime,
            yOffset: this.yOffset / this.speed,
            speed: this.speed,
            tint: this.tint !== undefined ? hex2rgb(this.tint) : undefined,
            tintHitEffects: this.tint !== undefined ? hex2rgb(this.tintHitEffects) : undefined
        }
    }
    dumpKPA(): NoteDataKPA {
        return {
            
            above: this.above ? 1 : 0,
            alpha: this.alpha,
            endTime: this.endTime,
            isFake: this.isFake ? 1 : 0,
            positionX: this.positionX,
            size: this.size,
            startTime: this.startTime,
            type: this.type,
            visibleBeats: this.visibleBeats,
            yOffset: this.yOffset / this.speed,
            /** 新KPAJSON认为YOffset就应该是个绝对的值，不受速度影响 */
            /** 但是有历史包袱，所以加字段 */
            absoluteYOffset: this.yOffset,
            speed: this.speed,
            tint: this.tint !== undefined ? hex2rgb(this.tint) : undefined,
            tintHitEffects: this.tint !== undefined ? hex2rgb(this.tintHitEffects) : undefined,
            judgeSize: this.judgeSize && this.judgeSize !== 1.0 ? this.judgeSize : undefined,
        }
    }
}
/*
abstract class TwoDirectionTreeNode {
    constructor() {

    }

}
*/

type Connectee = NoteNode | NNNode

const enum NodeType {
    HEAD, TAIL, MIDDLE
}

type NNOrHead = NoteNode | NoteNodeLike<NodeType.HEAD>
type NNOrTail = NoteNode | NoteNodeLike<NodeType.TAIL>
type AnyNN = NoteNode | NoteNodeLike<NodeType.HEAD> | NoteNodeLike<NodeType.TAIL>

class NoteNodeLike<T extends NodeType> {
    type: T;
    next: NNOrTail;
    _previous: WeakRef<NNOrHead> | null = null;
    parentSeq: NNList;
    get previous() {
        if (!this._previous) return null;
        return this._previous.deref()
    }
    set previous(val) {
        if (!val) {
            this._previous = null;
            return;
        }
        this._previous = new WeakRef(val)
    }
    constructor(type: T) {
        this.type = type;
    }
}

class NoteNode extends NoteNodeLike<NodeType.MIDDLE> implements TwoDirectionNode {
    totalNode: NNNode;
    readonly startTime: TimeT
    /**
     * The notes it contains.
     * If they are holds, they are ordered by their endTime, from late to early.
     */
    readonly notes: Note[];
    parentSeq: NNList
    chart: Chart;
    private static count = 0;
    id: number;
    constructor(time: TimeT) {
        super(NodeType.MIDDLE);
        this.startTime = TimeCalculator.validateIp([...time]);
        this.notes = [];
        this.id = NoteNode.count++;
    }
    static fromKPAJSON(data: NoteNodeDataKPA, timeCalculator: TimeCalculator) {
        const node = new NoteNode(data.startTime);
        for (let noteData of data.notes) {
            const note = Note.fromKPAJSON(noteData, timeCalculator);
            node.add(note);
        }
        return node
    }
    get isHold() {
        return this.parentSeq instanceof HNList
    }
    get endTime(): TimeT {
        if (this.notes.length === 0) {
            return this.startTime; // 改了半天这个逻辑本来就是对的()
        }
        return (this.notes.length === 0 || this.notes[0].type !== NoteType.hold) ? this.startTime : this.notes[0].endTime
    }
    add(note: Note) {
        if (!TimeCalculator.eq(note.startTime, this.startTime)) {
            console.warn("Wrong addition!")
        }
        this.notes.push(note);
        note.parentNode = this
        this.sort(this.notes.length - 1);
    }
    sort(note: Note): void;
    /**
     * 其他部分均已有序，通过冒泡排序把发生变更的NoteNode移动到正确的位置 
     * @param index 待排序的Note的索引
     */
    sort(index: number): void;
    sort(index: number | Note) {
        if (typeof index !== "number") {
            index = this.notes.indexOf(index);
            if (index === -1) {
                return;
            }
        }
        if (!this.isHold) {
            return;
        }
        const {notes} = this;
        const note = notes[index];
        for (let i = index; i > 0; i--) {
            const prev = notes[i - 1];
            if (TimeCalculator.lt(prev.endTime, note.endTime)) {
                // swap
                notes[i] = prev;
                notes[i - 1] = note;
            } else {
                break;
            }
        }
        for (let i = index; i < notes.length - 1; i++) {
            const next = notes[i + 1];
            if (TimeCalculator.gt(next.endTime, note.endTime)) {
                // swap
                notes[i] = next;
                notes[i + 1] = note;
            } else {
                break;
            }
        }
    }
    remove(note: Note) {
        this.notes.splice(this.notes.indexOf(note), 1)
        note.parentNode = null
    }
    static disconnect<T extends Connectee>(note1: T | Header<T>, note2: T | Tailer<T>) {
        if (note1) {
            note1.next = null;
        }
        if (note2) {
            note2.previous = null;
        }

    }
    static connect(note1: NNOrHead, note2: NNOrTail) {
        if (note1) {
            note1.next = note2;
        }
        if (note2) {
            note2.previous = note1;
        }
        if (note1 && note2) {
            note2.parentSeq = note1.parentSeq
        }
    }
    static insert(note1: NNOrHead, inserted: NoteNode, note2: NNOrTail) {
        this.connect(note1, inserted);
        this.connect(inserted, note2);
    }
    dump(): NoteNodeDataKPA {
        return {
            notes: this.notes.map(note => note.dumpKPA()),
            startTime: this.startTime
        }
    }
}

class NNList {
    /** 格式为#xxoxx或$xxoxx，亦可自命名 */
    id: string;
    head: NoteNodeLike<NodeType.HEAD>;
    tail: NoteNodeLike<NodeType.TAIL>;
    currentPoint: NNOrHead;
    // currentBranchPoint: NoteNode;
    /*
    renderPointer: Pointer<NoteNode>;
    hitPointer: Pointer<NoteNode>;
    editorPointer: Pointer<NoteNode>;
    */
    /** 定位上个Note头已过，本身未到的Note */
    jump: JumpArray<AnyNN>;
    timesWithNotes: number;
    // timesWithHolds: number;
    timeRanges: [number, number][];
    effectiveBeats: number;

    parentLine: JudgeLine;
    constructor(public speed: number, public medianYOffset: number = 0, effectiveBeats?: number) {
        this.head = new NoteNodeLike(NodeType.HEAD);
        this.head.parentSeq = this;
        this.currentPoint = this.head;
        // this.currentBranchPoint = <NoteNode>{startTime: [-1, 0, 1]}
        this.tail = new NoteNodeLike(NodeType.TAIL);
        this.tail.parentSeq = this;
        this.timesWithNotes = 0;
        this.effectiveBeats = effectiveBeats
    }
    /** 此方法永远用于最新KPAJSON */
    static fromKPAJSON<T extends boolean>(isHold: T, effectiveBeats: number, data: NNListDataKPA, nnnList: NNNList, timeCalculator: TimeCalculator): T extends true ? HNList : NNList {
        const list: T extends true ? HNList : NNList = isHold ? new HNList(data.speed, data.medianYOffset, effectiveBeats) : new NNList(data.speed, data.medianYOffset, effectiveBeats)
        const nnlength = data.noteNodes.length
        let cur: NNOrHead = list.head;
        for (let i = 0; i < nnlength; i++) {
            const nnData = data.noteNodes[i];
            const nn = NoteNode.fromKPAJSON(nnData, timeCalculator);
            NoteNode.connect(cur, nn);
            cur = nn;
            nnnList.addNoteNode(nn);
        }
        NoteNode.connect(cur, list.tail);
        list.initJump();
        return list
    }
    initJump() {
        const originalListLength = this.timesWithNotes;
        if (!this.effectiveBeats) {
            const prev = this.tail.previous
            if (prev.type === NodeType.HEAD) {
                return;
            }
            this.effectiveBeats = TimeCalculator.toBeats(prev.endTime)
        }
        const effectiveBeats: number = this.effectiveBeats;
        this.jump = new JumpArray<AnyNN>(
            this.head,
            this.tail,
            originalListLength,
            effectiveBeats,
            (node: AnyNN) => {
                if (node.type === NodeType.TAIL) {
                    return [null, null]
                }
                const nextNode = node.next;
                const startTime = (node.type === NodeType.HEAD) ? 0 : TimeCalculator.toBeats(node.startTime)
                return [startTime, nextNode]
            },
            // @ts-ignore
            (note: NoteNode, beats: number) => {
                return TimeCalculator.toBeats(note.startTime) >= beats ? false : <NoteNode>note.next; // getNodeAt有guard
            })
    }
    /**
     * 
     * @param beats 目标位置
     * @param beforeEnd 指定选取该时刻之前还是之后第一个Node，对于非Hold无影响
     * @param pointer 指针，实现查询位置缓存
     * @returns 
     */
    getNodeAt(beats: number, beforeEnd=false): NNOrTail {
        return this.jump.getNodeAt(beats) as NNOrTail;
    }
    /**
     * Get or create a node of given time
     * @param time 
     * @returns 
     */
    getNodeOf(time: TimeT) {
        let node = this.getNodeAt(TimeCalculator.toBeats(time), false)
                    .previous;


        let isEqual = node.type !== NodeType.HEAD && TimeCalculator.eq((node as NoteNode).startTime, time)
        if (node.next.type !== NodeType.TAIL && TimeCalculator.eq((node.next as NoteNode).startTime, time)) {
            isEqual = true;
            node = node.next;
        }

        if (!isEqual) {
            const newNode = new NoteNode(time);
            const next = node.next
            NoteNode.insert(node, newNode, next);
            // console.log("created:", node2string(newNode))
            this.jump.updateRange(node, next);
            // console.log("pl", this.parentLine)

            if (this.parentLine?.chart) {
                this.parentLine.chart.nnnList.getNode(time).add(newNode)
            }

            return newNode
        } else {
            return node;
        }
    }
    dumpKPA(): NNListDataKPA {
        const nodes: NoteNodeDataKPA[] = []
        let node: NNOrTail = this.head.next
        while (node.type !== NodeType.TAIL) {
            nodes.push(node.dump())
            node = node.next
        }
        return {
            speed: this.speed,
            medianYOffset: this.medianYOffset,
            noteNodes: nodes
        }
    }
}


/**
 * HoldNode的链表
 * HN is the abbreviation of HoldNode, which is not individually declared.
 * A NN that contains holds (a type of note) is a HN.
 */
class HNList extends NNList {
    /**
     * 最早的还未结束Hold
     */
    holdTailJump: JumpArray<AnyNN>;
    constructor(speed: number, medianYOffset: number, effectiveBeats?: number) {
        super(speed, medianYOffset, effectiveBeats)
    }
    initJump(): void {
        super.initJump()
        const originalListLength = this.timesWithNotes;
        const effectiveBeats: number = this.effectiveBeats;
        
        this.holdTailJump = new JumpArray<AnyNN>(
            this.head,
            this.tail,
            originalListLength,
            effectiveBeats,
            (node) => {
                if (node.type === NodeType.TAIL) {
                    return [null, null]
                }
                if (!node) debugger
                const nextNode = node.next;
                const endTime = node.type === NodeType.HEAD ? 0 : TimeCalculator.toBeats(node.endTime)
                return [endTime, nextNode]
            },
            // @ts-ignore
            (node: NoteNode, beats: number) => {
                return TimeCalculator.toBeats(node.endTime) >= beats ? false : <NoteNode>node.next; // getNodeAt有guard
            }
        )
    }
    
    getNodeAt(beats: number, beforeEnd=false): NNOrTail {
        return beforeEnd ? this.holdTailJump.getNodeAt(beats) as NNOrTail : this.jump.getNodeAt(beats) as NNOrTail;
    }
    // unused
    insertNoteJumpUpdater(note: NoteNode): () => void {
        const {previous, next} = note
        return () => {
            this.jump.updateRange(previous, next)
            this.holdTailJump.updateRange(previous, next)
        }
    }
}

type NNNOrHead = NNNode | NNNodeLike<NodeType.HEAD>;
type NNNOrTail = NNNode | NNNodeLike<NodeType.TAIL>;
type AnyNNN = NNNode | NNNodeLike<NodeType.HEAD> | NNNodeLike<NodeType.TAIL>;

class NNNodeLike<T extends NodeType> {
    previous: NNNOrHead;
    next: NNNOrTail;
    startTime: TimeT;
    constructor(public type: T) {
        if (type === NodeType.HEAD) {
            this.startTime = [0, 0, 1];
        } else if (type === NodeType.TAIL) {
            this.startTime = [Infinity, 0, 1];
        }
    }
}

class NNNode extends NNNodeLike<NodeType.MIDDLE> implements TwoDirectionNode {
    readonly noteNodes: NoteNode[];
    readonly holdNodes: NoteNode[];
    readonly startTime: TimeT;
    noteOfType: [number, number, number, number]
    constructor(time: TimeT) {
        super(NodeType.MIDDLE);
        this.noteNodes = []
        this.holdNodes = [];
        this.startTime = TimeCalculator.validateIp([...time])
    }
    get endTime() {
        let latest: TimeT = this.startTime;
        for (let index = 0; index < this.holdNodes.length; index++) {
            const element = this.holdNodes[index];
            if (TC.gt(element.endTime, latest)) {
                latest = element.endTime
            }
        }
        return latest
    }
    add(node: NoteNode) {
        if (node.isHold) {
            this.holdNodes.push(node)
        } else {
            
            this.noteNodes.push(node)
        }
        node.totalNode = this;
    }
    
    static connect(note1: NNNOrHead, note2: NNNOrTail) {
        if (note1) {
            note1.next = note2;
        }
        if (note2) {
            note2.previous = note1;
        }
    }
    static insert(note1: NNNOrHead, inserted: NNNode, note2: NNNOrTail) {
        this.connect(note1, inserted);
        this.connect(inserted, note2);
    }
}


/**
 * 二级音符节点链表
 * contains NNNs
 * NNN is the abbreviation of NoteNodeNode, which store note (an element in music game) nodes with same startTime
 * NN is the abbreviation of NoteNode, which stores the notes with the same startTime.
 */
class NNNList {
    jump: JumpArray<AnyNNN>
    parentChart: Chart;
    head: NNNodeLike<NodeType.HEAD>;
    tail: NNNodeLike<NodeType.TAIL>;
    

    effectiveBeats: number;
    timesWithNotes: number;
    constructor(effectiveBeats: number) {
        this.effectiveBeats = effectiveBeats;
        this.head = new NNNodeLike(NodeType.HEAD);
        this.tail = new NNNodeLike(NodeType.TAIL);
        NNNode.connect(this.head, this.tail)
        this.initJump()
    }
    initJump() {
        const originalListLength = this.timesWithNotes || 512;
        /*
        if (!this.effectiveBeats) {
            this.effectiveBeats = TimeCalculator.toBeats(this.tail.previous.endTime)
        }
        */
        const effectiveBeats: number = this.effectiveBeats;
        this.jump = new JumpArray<AnyNNN>(
            this.head,
            this.tail,
            originalListLength,
            effectiveBeats,
            (node: NNNOrHead | NNNodeLike<NodeType.TAIL>) => {
                if (node.type === NodeType.TAIL) {
                    return [null, null]
                }
                const nextNode = node.next;
                const startTime = node.type === NodeType.HEAD ? 0 : TimeCalculator.toBeats((node as NNNode).startTime)
                return [startTime, nextNode]
            },
            // @ts-ignore
            (note: NNNode, beats: number) => {
                return TimeCalculator.toBeats(note.startTime) >= beats ? false : <NNNode>note.next; // getNodeAt有guard
            }
            /*,
            (note: Note) => {
                const prev = note.previous;
                return prev.type === NodeType.HEAD ? note : prev
            })*/)
    }
    getNodeAt(beats: number, beforeEnd=false): NNNode | NNNodeLike<NodeType.TAIL> {
        return this.jump.getNodeAt(beats) as NNNode | NNNodeLike<NodeType.TAIL>;
    }
    getNode(time: TimeT): NNNode {
        const node = this.getNodeAt(TimeCalculator.toBeats(time), false).previous;
        if (node.type === NodeType.HEAD || TimeCalculator.ne((node as NNNode).startTime, time)) {
            const newNode = new NNNode(time);
            const next = node.next
            NNNode.insert(node, newNode, next);
            this.jump.updateRange(node, next)
            return newNode
        } else {
            return node as NNNode;
        }
    }
    addNoteNode(noteNode: NoteNode): void {
        this.getNode(noteNode.startTime).add(noteNode);
    }
}
