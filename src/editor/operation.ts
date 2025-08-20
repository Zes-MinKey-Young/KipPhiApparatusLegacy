
class NeedsReflowEvent extends Event {
    constructor(public condition: number) {
        super("needsreflow");
    }
}

class OperationEvent extends Event {
    constructor(t: string, public operation: Operation) {
        super(t);
    }
}


class OperationList extends EventTarget {
    operations: Operation[];
    undoneOperations: Operation[];
    constructor(public chart: Chart) {
        super()
        this.operations = [];
        this.undoneOperations = [];
    }
    undo() {
        const op = this.operations.pop()
        if (op) {
            if (!this.chart.modified){
                this.chart.modified = true;
                this.dispatchEvent(new Event("firstmodified"))
            }
            this.undoneOperations.push(op)
            op.undo(this.chart)
            this.dispatchEvent(new OperationEvent("undo", op))
            this.processFlags(op);
        } else {
            this.dispatchEvent(new Event("noundo"))
        }
    }
    redo() {
        const op = this.undoneOperations.pop()
        if (op) {
            if (!this.chart.modified){
                this.chart.modified = true;
                this.dispatchEvent(new Event("firstmodified"))
            }
            this.operations.push(op)
            op.do(this.chart)
            this.dispatchEvent(new OperationEvent("redo", op))
            this.processFlags(op);
        } else {
            this.dispatchEvent(new Event("noredo"))
        }
    }
    do(operation: Operation) {
        if (operation.ineffective) {
            return
        }
        if (!this.chart.modified){
            this.chart.modified = true;
            this.dispatchEvent(new Event("firstmodified"))
        }
        // 如果上一个操作是同一个构造器的，那么修改上一个操作而不是推入新的操作
        if (this.operations.length !== 0) {
                
            const lastOp = this.operations[this.operations.length - 1]
            if (operation.constructor === lastOp.constructor) {
                if (lastOp.rewrite(operation)) {
                    this.processFlags(operation)
                    return;
                }
            }
        }
        operation.do(this.chart);
        this.dispatchEvent(new OperationEvent("do", operation));
        this.processFlags(operation);
        this.operations.push(operation);
    }
    processFlags(operation: Operation) {

        if (operation.updatesEditor) {
            this.dispatchEvent(new Event("needsupdate"));
        }
        if (operation.needsComboRecount) {
            this.dispatchEvent(new Event("maxcombochanged"));
        }
        if (operation.reflows) {
            this.dispatchEvent(new NeedsReflowEvent(operation.reflows))
        }
    }
    clear() {
        this.operations = [];
    }
}



abstract class Operation {
    ineffective: boolean;
    updatesEditor: boolean;
    // 用于判定线编辑区的重排，若操作完成时的布局为这个值就会重排
    reflows: number;
    needsComboRecount: boolean;
    constructor() {

    }
    abstract do(chart: Chart): void
    abstract undo(chart: Chart): void
    rewrite(op: typeof this): boolean {return false;}
    toString(): string {
        return this.constructor.name;
    }
}

class ComplexOperation<T extends Operation[]> extends Operation {
    subOperations: T;
    length: number;
    constructor(...sub: T) {
        super()
        this.subOperations = sub
        this.length = sub.length
        this.reflows = sub.reduce((prev, op) => prev | op.reflows, 0);
        this.updatesEditor = sub.some((op) => op.updatesEditor);
        this.needsComboRecount = sub.some((op) => op.needsComboRecount);
    }
    // 这样子写不够严密，如果要继承这个类，并且子操作需要谱面，就要重写这个方法的签名
    do(chart?: Chart) {
        const length = this.length
        for (let i = 0; i < length; i++) {
            const op = this.subOperations[i]
            if (op.ineffective) { continue; }
            op.do(chart)
        }
    }
    undo(chart?: Chart) {
        const length = this.length
        for (let i = length - 1; i >= 0; i--) {
            const op = this.subOperations[i]
            if (op.ineffective) { continue; }
            op.undo(chart)
        }
    }
}

type NoteValueFieldPhiZone = "judgeSize" | "tint" | "tintHitEffects";

type NoteValueField = "speed" | "type" | "positionX" | "startTime" | "endTime" | "alpha" | "size" | "visibleBeats" | "yOffset" | "above" | "isFake" | NoteValueFieldPhiZone;

class NoteValueChangeOperation<T extends NoteValueField> extends Operation {
    field: T;
    note: Note;
    previousValue: Note[T]
    value: Note[T];
    updatesEditor = true;
    constructor(note: Note, field: T, value: Note[T]) {
        super()
        this.field = field
        this.note = note;
        this.value = value;
        this.previousValue = note[field]
        if (field === "isFake") {
            this.needsComboRecount = true;
        }
        if (value === note[field]) {
            this.ineffective = true
        }
    }
    do() {
        if (this.field === "endTime") {
            console.log("endTime")
        }
        this.note[this.field] = this.value
    }
    undo() {
        this.note[this.field] = this.previousValue
    }
    rewrite(operation: NoteValueChangeOperation<T>): boolean {
        if (operation.note === this.note && this.field === operation.field) {
            this.value = operation.value;
            this.note[this.field] = operation.value
            return true;
        }
        return false;
    }
}



class NoteRemoveOperation extends Operation {
    noteNode: NoteNode;
    note: Note;
    isHold: boolean;
    needsComboRecount = true;
    constructor(note: Note) {
        super()
        this.note = note // In memory of forgettting to add this(
        this.isHold = note.type === NoteType.hold;
        if (!note.parentNode) {
            this.ineffective = true
        } else {
            this.noteNode = note.parentNode
        }
    }
    do() {
        const {note, noteNode} = this;
        noteNode.remove(note);
        const needsUpdate = this.isHold && TimeCalculator.lt(noteNode.endTime, note.endTime)
        if (needsUpdate) {
            const endBeats = TimeCalculator.toBeats(note.endTime);
            const tailJump = (noteNode.parentSeq as HNList).holdTailJump;
            const updateFrom = tailJump.header
            const updateTo = tailJump.tailer;
            // tailJump.getPreviousOf(noteNode, endBeats);
            tailJump.updateRange(updateFrom, noteNode.next);
        }
    }
    undo() {
        const {note, noteNode} = this;
        const needsUpdate = this.isHold && TimeCalculator.lt(noteNode.endTime, note.endTime);
        if (needsUpdate) {
            const endBeats = TimeCalculator.toBeats(note.endTime);
            const tailJump = (noteNode.parentSeq as HNList).holdTailJump;
            const updateFrom = tailJump.getNodeAt(endBeats).previous;
            noteNode.add(note)
            tailJump.updateRange(updateFrom, noteNode.next);
        } else {
            noteNode.add(note);
        }
    }
}

/**
 * 删除一个note
 * 从语义上删除Note要用这个操作
 * 结果上，这个会更新编辑器
 */
class NoteDeleteOperation extends NoteRemoveOperation {
    updatesEditor = true
}

class MultiNoteDeleteOperation extends ComplexOperation<NoteDeleteOperation[]> {
    updatesEditor = true
    constructor(notes: Set<Note> | Note[]) {
        if (notes instanceof Set) {
            notes = [...notes];
        }
        super(...notes.map(note => new NoteDeleteOperation(note)))
        if (notes.length === 0) {
            this.ineffective = true
        }
    }

}

class NoteAddOperation extends Operation {
    noteNode: NoteNode
    note: Note;
    isHold: boolean;
    updatesEditor = true
    needsComboRecount = true;
    constructor(note: Note, node: NoteNode) {
        super()
        this.note = note;
        this.isHold = note.type === NoteType.hold;
        this.noteNode = node
    }
    do() {
        const {note, noteNode} = this;
        const needsUpdate = this.isHold && TimeCalculator.lt(noteNode.endTime, note.endTime);
        if (needsUpdate) {
            const endBeats = TimeCalculator.toBeats(note.endTime);
            const tailJump = (noteNode.parentSeq as HNList).holdTailJump;
            const updateFrom = tailJump.header 
            // tailJump.getNodeAt(endBeats).previous;
            noteNode.add(note)
            tailJump.updateRange(updateFrom, noteNode.next);
        } else {
            noteNode.add(note);
        }
    }
    undo() {
        const {note, noteNode} = this;
        noteNode.remove(note);
        const needsUpdate = this.isHold && TimeCalculator.lt(noteNode.endTime, note.endTime)
        if (needsUpdate) {
            const endBeats = TimeCalculator.toBeats(note.endTime);
            const tailJump = (noteNode.parentSeq as HNList).holdTailJump;
            const updateFrom = tailJump.getPreviousOf(noteNode, endBeats);
            tailJump.updateRange(updateFrom, noteNode.next);
        }
    }
}

class MultiNoteAddOperation extends ComplexOperation<NoteAddOperation[]> {
    updatesEditor = true
    needsComboRecount = true;
    constructor(notes: Set<Note> | Note[], judgeLine: JudgeLine) {
        if (notes instanceof Set) {
            notes = [...notes];
        }
        super(...notes.map(note => {
            const node = judgeLine.getNode(note, true)
            return new NoteAddOperation(note, node);
        }))
        if (notes.length === 0) {
            this.ineffective = true
        }
    }
}

class NoteTimeChangeOperation extends ComplexOperation<[NoteRemoveOperation, NoteValueChangeOperation<"startTime">, NoteAddOperation]> {
    note: Note
    updatesEditor = true
    needsComboRecount = false;
    constructor(note: Note, noteNode: NoteNode) {
        super(
            new NoteRemoveOperation(note),
            new NoteValueChangeOperation(note, "startTime", noteNode.startTime),
            new NoteAddOperation(note, noteNode)
        )
        if (note.type === NoteType.hold && !TimeCalculator.gt(note.endTime, noteNode.startTime)) {
            this.ineffective = true
        }
        this.note = note
        if (note.parentNode === noteNode) {
            this.ineffective = true
        }
    }
    rewrite(operation: NoteTimeChangeOperation): boolean {
        if (operation.note === this.note) {
            this.subOperations[0] = new NoteRemoveOperation(this.note)
            if (!this.subOperations[0].ineffective) {
                this.subOperations[0].do()
            }
            this.subOperations[1].value = operation.subOperations[1].value
            this.subOperations[1].do()
            this.subOperations[2].noteNode = operation.subOperations[2].noteNode
            this.subOperations[2].do()
            return true;
        }
        return false
    }
}

class HoldEndTimeChangeOperation extends NoteValueChangeOperation<"endTime"> {
    
    needsComboRecount = false;
    constructor(note: Note, value: TimeT) {
        super(note, "endTime", value)
        if (!TimeCalculator.gt(value, note.startTime)) {
            this.ineffective = true
        }
    }
    do() {
        super.do()
        const node = this.note.parentNode;
        node.sort(this.note);
        const tailJump = (node.parentSeq as HNList).holdTailJump;
        tailJump.updateRange(tailJump.header, tailJump.tailer);
    }
    undo() {
        super.undo()
        const node = this.note.parentNode;
        node.sort(this.note);
        const tailJump = (node.parentSeq as HNList).holdTailJump;
        tailJump.updateRange(tailJump.header, tailJump.tailer);
    }
    rewrite(operation: HoldEndTimeChangeOperation): boolean { // 看懂了，不重写的话会出问题
        if (operation.note === this.note && this.field === operation.field) {
            if (operation.value === this.value) {
                return true;
            }
            this.value = operation.value;
            this.note[this.field] = operation.value;
            const tailJump = (this.note.parentNode.parentSeq as HNList).holdTailJump;
            tailJump.updateRange(tailJump.header, tailJump.tailer);
            return true;
        }
        return false;
    }
}


class NoteSpeedChangeOperation
extends ComplexOperation<[NoteValueChangeOperation<"speed">, NoteRemoveOperation, NoteAddOperation]> {
    updatesEditor = true
    originalTree: NNList;
    judgeLine: JudgeLine;
    targetTree: NNList
    constructor(note: Note, value: number, line: JudgeLine) {
        const valueChange = new NoteValueChangeOperation(note, "speed", value);
        const tree = line.getNNList(value, note.yOffset, note.type === NoteType.hold, true)
        const node = tree.getNodeOf(note.startTime);
        const removal = new NoteRemoveOperation(note);
        const insert = new NoteAddOperation(note, node)
        super(valueChange, removal, insert);
    }
}

class NoteYOffsetChangeOperation extends ComplexOperation<[NoteValueChangeOperation<"yOffset">, NoteRemoveOperation, NoteAddOperation]> {
    updatesEditor = true
    originalTree: NNList;
    judgeLine: JudgeLine;
    targetTree: NNList
    constructor(note: Note, value: number, line: JudgeLine) {
        const valueChange = new NoteValueChangeOperation(note, "yOffset", value);
        const tree = line.getNNList(note.speed, value, note.type === NoteType.hold, true)
        const node = tree.getNodeOf(note.startTime);
        const removal = new NoteRemoveOperation(note);
        const insert = new NoteAddOperation(note, node)
        super(valueChange, removal, insert);
    }
}


class NoteTypeChangeOperation 
extends ComplexOperation</*[NoteValueChangeOperation<"type">, NoteInsertOperation]*/ any> {
    
    updatesEditor = true
    constructor(note: Note, value: number) {
        const isHold = note.type === NoteType.hold
        const valueChange = new NoteValueChangeOperation(note, "type", value);
        if (isHold !== (value === NoteType.hold)) {
            const tree = note.parentNode.parentSeq.parentLine.getNNList(note.speed, note.yOffset, !isHold, true)
            const node = tree.getNodeOf(note.startTime);
            const removal = new NoteRemoveOperation(note);
            const insert = new NoteAddOperation(note, node);
            super(valueChange, removal, insert);
        } else {
            super(valueChange);
        }
    }
}

class NoteTreeChangeOperation extends NoteAddOperation {

}

class EventNodePairRemoveOperation extends Operation {
    updatesEditor = true;
    endNode: EventEndNode;
    startNode: EventStartNode;
    sequence: EventNodeSequence;
    originalPrev: EventStartNode;
    constructor(node: EventStartNode) {
        super();
        if (node.previous === null) {
            this.ineffective = true;
            return;
        }
        if (node.isFirstStart()) {
            this.ineffective = true;
            return;
        }
        [this.endNode, this.startNode] = EventNode.getEndStart(node)
        this.sequence = this.startNode.parentSeq
        this.originalPrev = (<EventEndNode>node.previous).previous
    }
    do() {
        this.sequence.updateJump(...EventNode.removeNodePair(this.endNode, this.startNode))
    }
    undo() {
        this.sequence.updateJump(...EventNode.insert(this.startNode, this.originalPrev))
    }
}

/**
 * 将一对孤立的节点对插入到一个开始节点之后的操作。
 * 如果这个节点对的时刻与节点对的时刻相同，那么该节点对将不会被插入。
 * 而是把原来开始节点的值修改。
 */
class EventNodePairInsertOperation extends Operation {
    updatesEditor = true
    node: EventStartNode;
    tarPrev: EventStartNode;
    originalSequence: EventNodeSequence;
    overlapped: boolean;
    originalValue: number;
    value: number
    /**
     * 
     * @param node the node to insert
     * @param targetPrevious The node to insert before, accessed through EventNodeSequence.getNodeAt(TC.toBeats(node))
     * If the targetPrevious's time is the same as node's time, the node will not be inserted,
     * and the targetPrevious' value will be replaced with the node's value.
     */
    constructor(node: EventStartNode, targetPrevious: EventStartNode) {
        super()
        this.node = node;
        this.tarPrev = targetPrevious
        this.originalSequence = targetPrevious.parentSeq
        if (TimeCalculator.eq(node.time, targetPrevious.time)) {
            this.overlapped = true;
            this.value = node.value;
            this.originalValue = targetPrevious.value;
        }
    }
    do() {
        if (this.overlapped) {
            this.tarPrev.value = this.value;
            return;
        }
        const [endNode, startNode] = EventNode.insert(this.node, this.tarPrev);
        this.node.parentSeq.updateJump(endNode, startNode)
    }
    undo() {
        if (this.overlapped) {
            this.tarPrev.value = this.originalValue;
            return;
        }
        this.originalSequence?.updateJump(...EventNode.removeNodePair(...EventNode.getEndStart(this.node)))
    }
}


/**
 * Only used for new nodes
 * dynamically compute the targetPrevious
 * /
class EventNodePairAddOperation extends Operation {
    updatesEditor = true
    constructor(public node: EventStartNode, public targetSequence: EventNodeSequence) {
        super();
    }
    do() {
        const tarPrev = this.targetSequence.getNodeAt(this.node.start);
        const [endNode, startNode] = 
    }
}
*/

class MultiNodeAddOperation extends ComplexOperation<EventNodePairInsertOperation[]> {
    updatesEditor = true
    nodes: EventStartNode[];
    constructor(nodes: EventStartNode[], seq: EventNodeSequence) {
        let prev = seq.getNodeAt(TimeCalculator.toBeats(nodes[0].time));
        super(...nodes.map(node => {
            const op = new EventNodePairInsertOperation(node, prev);
            if (!op.overlapped) prev = node; // 有种reduce的感觉
            return op
        }));
        this.nodes = nodes
    }
}

class MultiNodeDeleteOperation extends ComplexOperation<EventNodePairRemoveOperation[]> {
    updatesEditor = true;
    constructor(nodes: EventStartNode[]) {
        super(...nodes.map(node => new EventNodePairRemoveOperation(node)));
    }
}

class EventNodeValueChangeOperation extends Operation {
    updatesEditor = true
    node: EventNode
    value: number;
    originalValue: number
    constructor(node: EventNode, val: number) {
        super()
        this.node = node
        this.value = val;
        this.originalValue = node.value
    }
    do() {
        this.node.value = this.value
    }
    undo() {
        this.node.value = this.originalValue
    }
    rewrite(operation: EventNodeValueChangeOperation): boolean {
        if (operation.node === this.node) {
            this.value = operation.value;
            this.node.value = operation.value
            return true;
        }
        return false;
    }
}

class EventNodeTimeChangeOperation extends Operation {
    updatesEditor = true
    sequence: EventNodeSequence;
    /**
     * 这里两个node不是面对面，而是背靠背
     * i. e. EndNode -> StartNode
     */
    startNode: EventStartNode;
    endNode: EventEndNode;
    value: TimeT;
    originalValue: TimeT;
    originalPrevious: EventStartNode;
    newPrevious: EventStartNode;
    constructor(node: EventStartNode | EventEndNode, val: TimeT) {
        super()
        if (node.previous.type === NodeType.HEAD) {
            this.ineffective = true;
            return;
        }
        if (!TimeCalculator.gt(val, [0, 0, 1])) {
            this.ineffective = true;
            return;
        }
        [this.endNode, this.startNode] = EventNode.getEndStart(node)
        const seq = this.sequence = node.parentSeq
        const mayBeThere = seq.getNodeAt(TimeCalculator.toBeats(val))
        if (mayBeThere && TC.eq(mayBeThere.time, val)) { // 不是arrayEq，这里踩坑
            this.ineffective = true;
            return;
        }
        this.originalPrevious = this.endNode.previous;
        this.newPrevious = mayBeThere === this.startNode ? (<EventEndNode>this.startNode.previous).previous : mayBeThere
        this.value = val;
        this.originalValue = node.time
        console.log("操作：", this)
    }
    do() { // 这里其实还要设计重新选址的问题
        this.startNode.time = this.endNode.time = this.value;
        if (this.newPrevious !== this.originalPrevious) {
            this.sequence.updateJump(...EventNode.removeNodePair(this.endNode, this.startNode))
            EventNode.insert(this.startNode, this.newPrevious)
        }
        this.sequence.updateJump(EventNode.previousStartOfStart(this.endNode.previous), EventNode.nextStartOfStart(this.startNode))
    }
    undo() {
        this.endNode.time = this.startNode.time = this.originalValue;
        if (this.newPrevious !== this.originalPrevious) {
            this.sequence.updateJump(...EventNode.removeNodePair(this.endNode, this.startNode))
            EventNode.insert(this.startNode, this.originalPrevious)
        }
        this.sequence.updateJump(this.endNode.previous, EventNode.nextStartOfStart(this.startNode))
    }

}

class EventNodeInnerEasingChangeOperation extends Operation {
    updatesEditor = true
    startNode: EventStartNode;
    value: Easing;
    originalValue: Easing
    constructor(node: EventStartNode | EventEndNode, val: Easing) {
        super();
        let _;
        [this.startNode, _] = EventNode.getStartEnd(node)
        this.value = val;
        this.originalValue = node.easing
    }
    do() {
        this.startNode.innerEasing = this.value
    }
   undo() {
        this.startNode.innerEasing = this.originalValue
   }
}

class EventNodeEasingChangeOperation extends Operation {
    updatesEditor = true
    startNode: EventStartNode;
    value: Easing;
    originalValue: Easing
    constructor(node: EventStartNode | EventEndNode, val: Easing) {
        super();
        let _;
        [this.startNode, _] = EventNode.getStartEnd(node)
        this.value = val;
        this.originalValue = node.easing
    }
    do() {
        this.startNode.easing = this.value
    }
    undo() {
        this.startNode.easing = this.originalValue
    }
}


/*

class BPMNodeValueChangeOperation extends Operation {
    updatesEditor = true
    node: BPMStartNode;
    value: number;
    originalValue: number
    constructor(node: BPMStartNode | BPMEndNode, val: number) {
        super()
        this.node = EventNode.getStartEnd(node)[0] as BPMStartNode;
        this.value = val;
        this.originalValue = node.value
    }
    do() {
        this.node.value = this.value
        this.node.parentSeq.initJump();
    }
    undo() {
        this.node.value = this.originalValue;
        this.node.parentSeq.initJump();
    }

}

class BPMNodeInsertOperation extends Operation { 
    updatesEditor = true;
    node: BPMStartNode;
    value: number;
    originalValue: number;

}
*/

class EncapsuleOperation extends ComplexOperation<[MultiNodeDeleteOperation, EventNodeEasingChangeOperation, EventNodeValueChangeOperation]> {
    updatesEditor = true;
    constructor(nodes: EventStartNode[], easing: TemplateEasing) {
        const len = nodes.length;
        super(
            new MultiNodeDeleteOperation(nodes.slice(1, -1)),
            new EventNodeEasingChangeOperation(nodes[0], easing),
            // 这里nodes至少都有两个，最后一个node不可能是第一个StartNode
            new EventNodeValueChangeOperation(<EventEndNode>nodes[len - 1].previous, nodes[len - 1].value)
        )
    }
}



enum EncapsuleErrorType {
    NotBelongToSourceSequence = 1,
    NotContinuous = 2,
    ZeroDelta = 3
}

/**
 * 将一些来自sourceSequence的节点打包为一个用于模板缓动的事件序列
 * 然后把sourceSequence中的源节点集合替换为单个使用了该模板的事件
 * @param sourceSequence 
 * @param sourceNodes
 */
function encapsule(templateEasingLib: TemplateEasingLib, sourceSequence: EventNodeSequence, sourceNodes: Set<EventStartNode>, name: string): EncapsuleErrorType | EncapsuleOperation {
    if (!EventNode.belongToSequence(sourceNodes, sourceSequence)) {
        return EncapsuleErrorType.NotBelongToSourceSequence;
    }
    const [oldArray, nodeArray] = EventNode.setToNewOrderedArray([0, 0, 1], sourceNodes);
    if (Math.abs(nodeArray[0].value - nodeArray[nodeArray.length - 1].value) < 1e-10) {
        return EncapsuleErrorType.ZeroDelta;
    }
    if (!EventNode.isContinuous(oldArray)) {
        return EncapsuleErrorType.NotContinuous;
    }
    const easing = templateEasingLib.getOrNew(name);
    const sequence = easing.eventNodeSequence;
    sequence.effectiveBeats = TimeCalculator.toBeats(nodeArray[nodeArray.length - 1].time);
    // 直接do，这个不需要做成可撤销的
    new MultiNodeAddOperation(nodeArray, sequence).do();

    return new EncapsuleOperation(oldArray, easing); 
}


class JudgeLineInheritanceChangeOperation extends Operation {
    originalValue: JudgeLine | null;
    updatesEditor = true;
    reflows = JudgeLinesEditorLayoutType.tree;
    constructor(public chart: Chart, public judgeLine: JudgeLine, public value: JudgeLine | null) {
        super();
        this.originalValue = judgeLine.father;
        // 这里只会让它静默失败，外面调用的时候能够在判断一次并抛错误才是最好的
        if (JudgeLine.checkinterdependency(judgeLine, value)) {
            this.ineffective = true;
        }
    }
    do() {
        const line = this.judgeLine;
        line.father = this.value;
        if (this.originalValue) {
            this.originalValue.children.delete(line);
        } else {
            const index = this.chart.orphanLines.indexOf(line);
            if (index >= 0) // Impossible to be false, theoretically
                this.chart.orphanLines.splice(index, 1)
        }
        if (this.value) {
            this.value.children.add(line);
        } else {
            this.chart.orphanLines.push(line);
        }
    }
    undo() {
        const line = this.judgeLine;
        line.father = this.originalValue;
        if (this.originalValue) {
            this.originalValue.children.add(line);
        } else {
            this.chart.orphanLines.push(line);
        }
        if (this.value) {
            this.value.children.delete(line);
        } else {
            const index = this.chart.orphanLines.indexOf(line);
            if (index >= 0) // Impossible to be false, theoretically
                this.chart.orphanLines.splice(index, 1)
        }
    }
}

class JudgeLineRenameOperation extends Operation { 
    updatesEditor = true;
    originalValue: string;
    constructor(public judgeLine: JudgeLine, public value: string) {
        super();
        this.originalValue = judgeLine.name;
    }
    do() {
        this.judgeLine.name = this.value;
    }
    undo() {
        this.judgeLine.name = this.originalValue;
    }
}

type JudgeLineValueField = "name" | "rotatesWithFather";

class JudgeLinePropChangeOperation<T extends JudgeLineValueField> extends Operation {
    updatesEditor = true;
    originalValue: JudgeLine[T];
    constructor(public judgeLine: JudgeLine, public field: T, public value: JudgeLine[T]) {
        super();
        this.originalValue = judgeLine[field];
    }
    do() {
        this.judgeLine[this.field] = this.value;
    }
    undo() {
        this.judgeLine[this.field] = this.originalValue;
    }
}

class JudgeLineRegroupOperation extends Operation {
    updatesEditor = true;
    reflows = JudgeLinesEditorLayoutType.grouped;
    originalValue: JudgeLineGroup;
    constructor(public judgeLine: JudgeLine, public value: JudgeLineGroup) {
        super();
        this.originalValue = judgeLine.group;
    }
    do() {
        this.judgeLine.group = this.value;
        this.value.add(this.judgeLine);
        this.originalValue.remove(this.judgeLine);
    }
    undo() {
        this.judgeLine.group = this.originalValue;
        this.originalValue.add(this.judgeLine);
        this.value.remove(this.judgeLine);
    }
}

class JudgeLineCreateOperation extends Operation {
    reflows = JudgeLinesEditorLayoutType.grouped | JudgeLinesEditorLayoutType.tree | JudgeLinesEditorLayoutType.ordered;
    // 之前把=写成了:半天不知道咋错了
    constructor(public chart: Chart, public judgeLine: JudgeLine) {
        super();
    }
    do() {
        const id = this.chart.judgeLines.length;
        this.judgeLine.id = id;
        this.chart.judgeLines.push(this.judgeLine);
        this.chart.orphanLines.push(this.judgeLine);
        this.chart.judgeLineGroups[0].add(this.judgeLine);
    }
    undo() {
        this.chart.judgeLineGroups[0].remove(this.judgeLine);
        this.chart.judgeLines.splice(this.chart.judgeLines.indexOf(this.judgeLine), 1);
        this.chart.orphanLines.splice(this.chart.orphanLines.indexOf(this.judgeLine), 1);
    }
}

class JudgeLineDeleteOperation extends Operation {
    readonly originalGroup: JudgeLineGroup;
    constructor(public chart: Chart, public judgeLine: JudgeLine) {
        super();
        if (!this.chart.judgeLines.includes(this.judgeLine)) {
            this.ineffective = true;
        }
        this.originalGroup = judgeLine.group;
    }
    do() {
        this.chart.judgeLines.splice(this.chart.judgeLines.indexOf(this.judgeLine), 1);
        if (this.chart.orphanLines.includes(this.judgeLine)) {
            this.chart.orphanLines.splice(this.chart.orphanLines.indexOf(this.judgeLine), 1);
        }
        this.originalGroup.remove(this.judgeLine);
    }
    undo() {
        this.chart.judgeLines.push(this.judgeLine);
        this.chart.orphanLines.push(this.judgeLine);
        this.originalGroup.add(this.judgeLine);
    }
}

class JudgeLineENSChangeOperation extends Operation {
    originalValue: EventNodeSequence;
    constructor(public judgeLine: JudgeLine, public layerId: number, public typeStr: BasicEventName, public value: EventNodeSequence) {
        super();
        this.originalValue = judgeLine.eventLayers[layerId][typeStr];
    }
    do() {
        this.judgeLine.eventLayers[this.layerId][this.typeStr] = this.value;
    }
    undo() {
        this.judgeLine.eventLayers[this.layerId][this.typeStr] = this.originalValue;
    }
}

class EventNodeSequenceRenameOperation extends Operation { 
    updatesEditor: boolean = true;
    originalName: string;
    constructor(public sequence: EventNodeSequence, public newName: string) {
        super();
        this.originalName = sequence.id;
        if (this.originalName === newName) {
            this.ineffective = true;
        }
    }
    do(chart: Chart) {
        chart.sequenceMap.set(this.newName, this.sequence)
        chart.sequenceMap.delete(this.originalName);
        this.sequence.id = this.newName;
    }
    undo(chart: Chart) {
        chart.sequenceMap.set(this.originalName, this.sequence)
        chart.sequenceMap.delete(this.newName);
        this.sequence.id = this.originalName;
    }
}
