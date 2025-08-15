// interface TemplateEasingLib {[name: string]: TemplateEasing}

/**
 * To compare two arrays
 * @param arr1 
 * @param arr2 
 * @returns 
 */
function arrEq<T>(arr1: Array<T>, arr2: Array<T>) {
    let length: number;
    if ((length = arr1.length) !== arr2.length) {
        return false;
    }
    for (let i = 0; i < length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }
    return true;
}

class EventNodeLike<T extends NodeType> {
    type: T;
    /** 后一个事件节点 */
    next: [EventStartNode, null, ENOrTail][T] | null = null;
    /** 前一个事件节点 */
    previous: [null, EventStartNode, ENOrHead][T] | null = null;
    parentSeq: EventNodeSequence;
    constructor(type: T) {
        this.type = type;
    }
}
type ENOrTail = EventNode | EventNodeLike<NodeType.TAIL>;
type ENOrHead = EventNode | EventNodeLike<NodeType.HEAD>;
type AnyEN = EventNode | EventNodeLike<NodeType.HEAD> | EventNodeLike<NodeType.TAIL>;

/**
 * 事件节点基类
 * event node.
 * 用于代表事件的开始和结束。（EventStartNode表开始，EventEndNode表结束）
 * Used to represent the starts (EventStartNode) and ends (EventEndNode) of events.
 * 事件指的是判定线在某个时间段上的状态变化。
 * Events is the changing of judge line's state in a certain time.
 * 五种事件类型：移动X，移动Y，旋转，透明度，速度。
 * 5 basic types of events: moveX, moveY, rotate, alpha, speed.
 * 事件节点没有类型，类型由它所属的序列决定。
 * Type is not event nodes' property; it is the property of EventNodeSequence.
 * Events' type is determined by which sequence it belongs to.
 * 与RPE不同的是，KPA使用两个节点来表示一个事件，而不是一个对象。
 * Different from that in RPE, KPA uses two nodes rather than one object to represent an event.
 */
abstract class EventNode extends EventNodeLike<NodeType.MIDDLE> {
    time: TimeT;
    value: number;
    easing: Easing;
    constructor(time: TimeT, value: number) {
        super(NodeType.MIDDLE);
        this.time = time;
        this.value = value ?? 0;
        this.easing = linearEasing
    }
    clone(offset: TimeT): EventStartNode | EventEndNode {
        const ret = new (this.constructor as (typeof EventStartNode | typeof EventEndNode))
                        (offset ? TimeCalculator.add(this.time, offset) : this.time, this.value);
        ret.easing = this.easing;
        return ret;
    }
    //#region 
    /**
     * gets the easing object from RPEEventData
     * @param data 
     * @param left 
     * @param right 
     * @param templates 
     * @returns 
     */
    static getEasing(data: EventDataRPE, left: number, right: number, templates: TemplateEasingLib): Easing {
        if ((left && right) && (left !== 0.0 || right !== 1.0)) {
            return new SegmentedEasing(EventNode.getEasing(data, 0.0, 1.0, templates), left, right)
        }
        if (data.bezier) {
            let bp = data.bezierPoints
            let easing = new BezierEasing();
            easing.cp1 = new Coordinate(bp[0], bp[1]);
            easing.cp2 = new Coordinate(bp[2], bp[3]);
            return easing
        } else if (typeof data.easingType === "string") {
            return templates.get(data.easingType)
        } else if (typeof data.easingType === "number" && data.easingType !== 0) {
            return rpeEasingArray[data.easingType]
        } else if (data.start === data.end) {
            return fixedEasing
        } else {
            return linearEasing
        }
    }
    /**
     * constructs EventStartNode and EventEndNode from EventDataRPE
     * @param data 
     * @param templates 
     * @returns 
     */
    static fromEvent(data: EventDataRPE, templates: TemplateEasingLib): [EventStartNode, EventEndNode] {
        let start = new EventStartNode(data.startTime, data.start)
        let end = new EventEndNode(data.endTime, data.end);
        start.easing = EventNode.getEasing(data, data.easingLeft, data.easingRight, templates);
        EventNode.connect(start, end)
        if (!start.easing) {
            start.easing = linearEasing;
            console.error("No easing found for event:", data, start, "will use linear by default")
        }
        return [start, end]
    }
    static connect(node1: EventStartNode, node2: EventEndNode | EventNodeLike<NodeType.TAIL>): void
    static connect(node1: EventEndNode | EventNodeLike<NodeType.HEAD>, node2: EventStartNode): void
    static connect(node1: ENOrHead, node2: ENOrTail): void {
        node1.next = node2;
        node2.previous = node1;
        if (node1 && node2) {
            node2.parentSeq = node1.parentSeq
        }
    }
    /*
    static disconnectStart(node: EventStartNode) {
        (node.previous.previous).next = node.next;
        node.previous.previous = null;
        node.next = null;
    }
    */
    static removeNodePair(endNode: EventEndNode, startNode: EventStartNode): [EventStartNode | EventNodeLike<NodeType.HEAD>, EventStartNode | EventNodeLike<NodeType.TAIL>] {
        const prev = endNode.previous;
        const next = startNode.next;
        prev.next = next;
        next.previous = prev;
        endNode.previous = null;
        startNode.next = null;
        return [this.previousStartOfStart(prev), this.nextStartOfEnd(next)]
    }
    static insert(node: EventStartNode, tarPrev: EventStartNode): [EventNodeLike<NodeType.HEAD> | EventStartNode, EventStartNode | EventNodeLike<NodeType.TAIL>] {
        const tarNext = tarPrev.next;
        if (node.previous.type === NodeType.HEAD) {
            throw new Error("Cannot insert a head node before any node");
        }
        this.connect(tarPrev, node.previous);
        node.parentSeq = node.previous.parentSeq;
        this.connect(node, tarNext);
        return [this.previousStartOfStart(tarPrev), this.nextStartOfEnd(tarNext)]
    }
    /**
     * 
     * @param node 
     * @returns the next node if it is a tailer, otherwise the next start node
     */
    static nextStartOfStart(node: EventStartNode) {
        return node.next.type === NodeType.TAIL ? node.next : node.next.next
    }
    /**
     * 
     * @param node 
     * @returns itself if node is a tailer, otherwise the next start node
     */
    static nextStartOfEnd(node: EventEndNode | EventNodeLike<NodeType.TAIL>) {
        return node.type === NodeType.TAIL ? node : node.next
    }
    static previousStartOfStart(node: EventStartNode): EventStartNode | EventNodeLike<NodeType.HEAD> {
        return node.previous.type === NodeType.HEAD ? node.previous : node.previous.previous;
    }
    /**
     * It does not return the start node which form an event with it.
     * @param node 
     * @returns 
     */
    static secondPreviousStartOfEnd(node: EventEndNode): EventStartNode | EventNodeLike<NodeType.HEAD> {
        return this.previousStartOfStart(node.previous);
    }
    static nextStartInJumpArray(node: EventStartNode): EventStartNode | EventNodeLike<NodeType.TAIL> {
        if ((<EventEndNode>node.next).next.isLastStart()) {
            return node.next.next.next;
        } else {
            return node.next.next;
        }
    }
    /**
     * 获得一对背靠背的节点。不适用于第一个StartNode
     * @param node 
     * @returns 
     */
    static getEndStart(node: EventStartNode | EventEndNode): [EventEndNode, EventStartNode] {
        if (node instanceof EventStartNode) {
            if (node.isFirstStart()) {
                throw new Error("Cannot get previous start node of the first start node");
            }
            return [<EventEndNode>node.previous, node]
        } else if (node instanceof EventEndNode) {
            return [node, node.next]
        }
    }
    static getStartEnd(node: EventStartNode | EventEndNode): [EventStartNode, EventEndNode] {
        if (node instanceof EventStartNode) {
            return [node, <EventEndNode>node.next]
        } else if (node instanceof EventEndNode) {
            return [<EventStartNode>node.previous, node]
        } else {
            throw new Error("Invalid node type")
        }
    }
    static setToNewOrderedArray(dest: TimeT, set: Set<EventStartNode>): [EventStartNode[], EventStartNode[]] {
        const nodes = [...set]
        nodes.sort((a, b) => TimeCalculator.gt(a.time, b.time) ? 1 : -1);
        const offset = TimeCalculator.sub(dest, nodes[0].time)
        return [nodes, nodes.map(node => node.clonePair(offset))]
    }
    static belongToSequence(nodes: Set<EventStartNode>, sequence: EventNodeSequence): boolean {
        for (let each of nodes) {
            if (each.parentSeq !== sequence) {
                return false;
            }
        }
        return true;
    }
    /**
     * 检验这些节点对是不是连续的
     * 如果不是不能封装为模板缓动
     * @param nodes 有序开始节点数组，必须都是带结束节点的（背靠背）（第一个除外）
     * @returns 
     */
    static isContinuous(nodes: EventStartNode[]) {
        const l = nodes.length;
        let nextNode = nodes[0]
        for (let i = 0; i < l - 1; i++) {
            const node = nextNode;
            nextNode = nodes[i + 1];
            if (node.next !== nextNode.previous) {
                return false;
            }
        }
        return true;
    }
    get innerEasing(): Easing {
        return this.easing instanceof SegmentedEasing ?
            (this.easing as SegmentedEasing).easing :
            this.easing;
    }
    /**
     * 设置easing，如果easing是分段缓动，则将分段缓动中的easing设置为innerEasing
     * 不可传入分段缓动，否则会出错
     */
    set innerEasing(easing: Exclude<Easing, SegmentedEasing>) {
        if (this.easing instanceof SegmentedEasing) {
            (this.easing as SegmentedEasing).replace(easing);
        } else {
            this.easing = easing;
        }
    }
    // #endregion
}



class EventStartNode extends EventNode {
    next: EventEndNode | EventNodeLike<NodeType.TAIL>;
    previous: EventEndNode | EventNodeLike<NodeType.HEAD>;
    /** 
     * 对于速度事件，从计算时的时刻到此节点的总积分
     */
    cachedIntegral?: number;
    constructor(time: TimeT, value: number) {
        super(time, value);
    }
    get easingIsSegmented() {
        return this.easing instanceof SegmentedEasing;
    }
    parentSeq: EventNodeSequence;
    /**
     * 因为是RPE和KPA共用的方法所以easingType可以为字符串
     * @returns 
     */
    dump(): EventDataRPE {
        const endNode = this.next as EventEndNode;
        const isSegmented = this.easingIsSegmented
        const easing = isSegmented ? (this.easing as SegmentedEasing).easing : this.easing;
        return {
            bezier: easing instanceof BezierEasing ? 1 : 0,
            bezierPoints: easing instanceof BezierEasing ?
                [easing.cp1.x, easing.cp1.y, easing.cp2.x, easing.cp2.y] : // 修正了这里 cp2.y 的引用
                [0, 0, 0, 0],
            easingLeft: isSegmented ? (this.easing as SegmentedEasing).left : 0.0,
            easingRight: isSegmented ? (this.easing as SegmentedEasing).right : 1.0,
            // @ts-expect-error
            easingType: easing instanceof TemplateEasing ?
                (easing.name) :
                easing instanceof NormalEasing ?
                    easing.rpeId ?? 1 :
                    null,
            end: easing === fixedEasing ? this.value : endNode.value,
            endTime: endNode.time,
            linkgroup: 0, // 假设默认值为 0
            start: this.value,
            startTime: this.time,
        }
    }
    /**
     * 仅用于编译至RPE时解决最后一个StartNode的问题
     * 限最后一个StartNode使用
     * @returns 
     */
    dumpAsLast(): EventDataRPE {
        const isSegmented = this.easingIsSegmented
        const easing = isSegmented ? (this.easing as SegmentedEasing).easing : this.easing;
        return {
            bezier: easing instanceof BezierEasing ? 1 : 0,
            bezierPoints: easing instanceof BezierEasing ?
                [easing.cp1.x, easing.cp1.y, easing.cp2.x, easing.cp2.y] : // 修正了这里 cp2.y 的引用
                [0, 0, 0, 0],
            easingLeft: isSegmented ? (this.easing as SegmentedEasing).left : 0.0,
            easingRight: isSegmented ? (this.easing as SegmentedEasing).right : 1.0,
            // @ts-expect-error
            easingType: easing instanceof TemplateEasing ?
                (easing.name) :
                easing instanceof NormalEasing ?
                    easing.rpeId :
                    null,
            end: this.value,
            endTime: TimeCalculator.add(this.time, [1, 0, 1]),
            linkgroup: 0, // 假设默认值为 0
            start: this.value,
            startTime: this.time,
        }
    }
    getValueAt(beats: number) {
        // 除了尾部的开始节点，其他都有下个节点
        // 钩定型缓动也有
        if (this.next.type === NodeType.TAIL) {
            return this.value;
        }
        let timeDelta = TimeCalculator.getDelta(this.next.time, this.time)
        let current = beats - TimeCalculator.toBeats(this.time)
        if (current > timeDelta || current < 0) {
            console.warn("超过事件时间范围！", this, beats)
        }
        // 参数方程型缓动无需指定首尾数值
        if (this.easing instanceof ParametricEquationEasing) {
            return this.easing.getValue(current / timeDelta);
        }
        let valueDelta = this.next.value - this.value
        if (valueDelta === 0) {
            return this.value
        }
        if (!this.easing) {
            debugger
        }
        // 其他类型，包括普通缓动和非钩定模板缓动
        return this.value + this.easing.getValue(current / timeDelta) * valueDelta
    }
    getSpeedValueAt(beats: number) {
        if (this.next.type === NodeType.TAIL) {
            return this.value
        }
        let timeDelta = TimeCalculator.getDelta(this.next.time, this.time)
        let valueDelta = this.next.value - this.value
        let current = beats - TimeCalculator.toBeats(this.time)
        if (current > timeDelta || current < 0) {
            console.warn("超过事件时间范围！", this, beats)
            // debugger
        }
        return this.value + linearEasing.getValue(current / timeDelta) * valueDelta;
    }
    /**
     * 积分获取位移
     */
    getIntegral(beats: number, timeCalculator: TimeCalculator) {
        return timeCalculator.segmentToSeconds(TimeCalculator.toBeats(this.time), beats) * (this.value + this.getSpeedValueAt(beats)) / 2 * 120 // 每单位120px
    }
    getFullIntegral(timeCalculator: TimeCalculator) {
        if (this.next.type === NodeType.TAIL) {
            console.log(this)
            throw new Error("getFullIntegral不可用于尾部节点")
        }
        let end = this.next;
        let endBeats = TimeCalculator.toBeats(end.time)
        let startBeats = TimeCalculator.toBeats(this.time)
        // 原来这里写反了，气死偶咧！
        return timeCalculator.segmentToSeconds(startBeats, endBeats) * (this.value + end.value) / 2 * 120
    }
    isFirstStart() {
        return this.previous && this.previous.type === NodeType.HEAD
    }
    isLastStart() {
        return this.next && this.next.type === NodeType.TAIL
    }
    clone(offset?: TimeT): EventStartNode {
        return super.clone(offset) as EventStartNode;
    };
    clonePair(offset: TimeT): EventStartNode {
        const endNode = this.previous.type !== NodeType.HEAD ? this.previous.clone(offset) : new EventEndNode(this.time, this.value);
        const startNode = this.clone(offset);
        EventNode.connect(endNode, startNode);
        return startNode;
    };

    
    drawCurve(context: CanvasRenderingContext2D, startX: number, startY: number, endX: number , endY: number, matrix: Matrix): void {
        if (!(this.easing instanceof ParametricEquationEasing)) {
            return this.easing.drawCurve(context, startX, startY, endX, endY);
        }
        const getValue = (ratio: number) => {
            return matrix.ymul(0, this.easing.getValue(ratio))
        }
        const timeDelta = endX - startX;
        let last = startY;
        context.beginPath()
        context.moveTo(startX, last)
        for (let t = 4; t <= timeDelta; t += 4) {
            const ratio = t / timeDelta
            const curPosY = getValue(ratio);
            context.lineTo(startX + t, curPosY);
            last = curPosY;
        }
        context.stroke();
    }
}

class EventEndNode extends EventNode {
    next: EventStartNode;
    previous: EventStartNode;
    get parentSeq() {return this.previous?.parentSeq || null}
    set parentSeq(_parent: EventNodeSequence) {}
    constructor(time: TimeT, value: number) {
        super(time, value);
    }
    getValueAt(beats: number) {
        return this.previous.getValueAt(beats);
    }
    clone(offset?: TimeT): EventEndNode {
        return super.clone(offset) as EventEndNode;
    }
}


/**
 * 为一个链表结构。会有一个数组进行快跳。
 * is the list of event nodes, but not purely start nodes.
 * 结构如下：Header -> (StartNode -> [EndNode) -> (StartNode] -> [EndNode) -> ... -> StartNode] -> Tailer.
 * The structure is like this: Header -> (StartNode -> [EndNode) -> (StartNode] -> [EndNode) -> ... -> StartNode] -> Tailer.
 * 用括号标出的两个节点是一个事件，用方括号标出的两个节点是同一时间点的节点。
 * The each 2 nodes marked by parentheses is an event; the each 2 nodes marked by brackets have the same time.
 * 注意尾节点之前的节点不是一个结束节点，而是一个开始节点，其缓动无效。
 * Note that the node before the tailer is not an end node, but a start node whose easing is meaningless.
 * 就是说最后一个节点后取值，显然会取得这个节点的值，与缓动无关。
 * (i. e. the value after the last event node is its value, not subject to easing, obviously.)
 * 如果尾之前的节点是一个结束节点，那么取值会返回undefined，这是不期望的。
 * If so, the value after that will be undefined, which is not expected.
 * ("so" refers to the assumption that the node before the tailer is an end node)
 * 和NNList和NNNList一样，有跳数组以加速随机读取。
 * Like NNList and NNNList, it has a jump array to speed up random reading.
 * 插入或删除节点时，需要更新跳数组。
 * Remember to update the jump array when inserting or deleting nodes.
 */
class EventNodeSequence {
    chart: Chart;
    /** id follows the format `#${lineid}.${layerid}.${typename}` by default */
    id: string;
    /** has no time or value */
    head: EventNodeLike<NodeType.HEAD>;
    /** has no time or value */
    tail: EventNodeLike<NodeType.TAIL>;
    jump?: JumpArray<AnyEN>;
    listLength: number;
    /** 一定是二的幂，避免浮点误差 */
    jumpAverageBeats: number;
    // nodes: EventNode[];
    // startNodes: EventStartNode[];
    // endNodes: EventEndNode[];
    // eventTime: Float64Array;
    constructor(public type: EventType, public effectiveBeats: number) {
        this.head = new EventNodeLike(NodeType.HEAD);
        this.tail = new EventNodeLike(NodeType.TAIL);
        this.head.parentSeq = this.tail.parentSeq = this;
        this.listLength = 1;
        // this.head = this.tail = new EventStartNode([0, 0, 0], 0)
        // this.nodes = [];
        // this.startNodes = [];
        // this.endNodes = [];
    }
    static fromRPEJSON<T extends EventType>(type: T, data: EventDataRPE[], chart: Chart, endValue?: number) {
        const {templateEasingLib: templates, timeCalculator} = chart
        const length = data.length;
        // const isSpeed = type === EventType.Speed;
        // console.log(isSpeed)
        const seq = new EventNodeSequence(type, type === EventType.easing ? TimeCalculator.toBeats(data[length - 1].endTime) : chart.effectiveBeats);
        let listLength = length;
        let lastEnd: EventEndNode | EventNodeLike<NodeType.HEAD> = seq.head

        let lastIntegral: number = 0;
        for (let index = 0; index < length; index++) {
            const event = data[index];
            let [start, end] = EventNode.fromEvent(event, templates);
            if (lastEnd.type === NodeType.HEAD) {
                EventNode.connect(lastEnd, start)
            } else if (lastEnd.value === lastEnd.previous.value && lastEnd.previous.easing instanceof NormalEasing) {
                lastEnd.time = start.time
                EventNode.connect(lastEnd, start)
            } else if (TimeCalculator.toBeats(lastEnd.time) !== TimeCalculator.toBeats(start.time)) {
                let val = lastEnd.value;
                let midStart = new EventStartNode(lastEnd.time, val);
                let midEnd = new EventEndNode(start.time, val);
                midStart.easing = lastEnd.previous.easing;
                EventNode.connect(lastEnd, midStart);
                EventNode.connect(midStart, midEnd);
                EventNode.connect(midEnd, start)
                // seq.startNodes.push(midStart);
                // seq.endNodes.push(midEnd);
                listLength++;
            } else {
                
                EventNode.connect(lastEnd, start)
            }
            
            // seq.startNodes.push(start);
            // seq.endNodes.push(end);
            lastEnd = end;
            // seq.nodes.push(start, end);
        }
        const last = lastEnd;
        const tail = new EventStartNode(last.time ?? [0, 0, 1], endValue ?? last.value);
        EventNode.connect(last, tail);
        // last can be a header, in which case easing is undefined.
        // then we use the easing that initialized in the EventStartNode constructor.
        tail.easing = last.previous?.easing ?? tail.easing;
        tail.cachedIntegral = lastIntegral
        EventNode.connect(tail, seq.tail)
        seq.listLength = listLength;
        seq.initJump();
        return seq;
    }
    /**
     * 生成一个新的事件节点序列，仅拥有一个节点。
     * 需要分配ID！！！！！！
     * @param type 
     * @param effectiveBeats 
     * @returns 
     */
    static newSeq(type: EventType, effectiveBeats: number): EventNodeSequence {
        const sequence = new EventNodeSequence(type, effectiveBeats);
        const node = new EventStartNode([0, 0, 1], type === EventType.speed ? 10 : 0);
        EventNode.connect(sequence.head, node)
        EventNode.connect(node, sequence.tail)
        sequence.initJump();
        return sequence;
    }

    /** validate() {
        /*
         * 奇谱发生器中事件都是首尾相连的
         //
        const length = this.endNodes.length;
        for (let index = 0; index < length; index++) {
            let end = this.endNodes[index];
            let start = this.startNodes[index + 1]
            if (!arrEq(end.time, start.time)) {
                start.time = end.time
            }
            start.previous = end;
            end.next = start;
            // 这个就是真的该这么写了（
        }
    }
    **/
    /*update() {
        let {startNodes, endNodes} = this;
        startNodes.sort((a, b) => TimeCalculator.getDelta(a.time, b.time))
        endNodes.sort((a, b) => TimeCalculator.getDelta(a.time, b.time))
        const length = this.endNodes.length;
        // this.nodes = new Array(length * 2 + 1);
        let eventTime: Float64Array;
        this.eventTime = eventTime = new Float64Array(length);
        for (let i = 0; i < length; i++) {
            eventTime[i] = TimeCalculator.getDelta(endNodes[i].time, startNodes[i].time);
        }
    }*/
    initJump() {
        const originalListLength = this.listLength;
        const effectiveBeats: number = this.effectiveBeats;
        if (this.head.next === this.tail.previous) {
            return;
        }
        this.jump = new JumpArray<AnyEN>(
            this.head,
            this.tail,
            originalListLength,
            effectiveBeats,
            (node) => {
                // console.log(node)
                if (node.type === NodeType.TAIL) {
                    return [null, null]
                }
                if (node.type === NodeType.HEAD) {
                    if (node.next.next.type === NodeType.TAIL) {
                        return [0, node.next.next]
                    }
                    return [0, node.next]
                }
                const endNode =  <EventEndNode>(<EventStartNode>node).next;
                const time = TimeCalculator.toBeats(endNode.time);
                const nextNode = endNode.next;
                if (nextNode.next.type === NodeType.TAIL) {
                    return [time, nextNode.next] // Tailer代替最后一个StartNode去占位
                } else {
                    return [time, nextNode]
                }
            },
            (node: EventStartNode, beats: number) => {
                return TimeCalculator.toBeats((<EventEndNode>node.next).time) > beats ? false : EventNode.nextStartInJumpArray(node)
            },
            (node: EventStartNode) => {
                return node.next && node.next.type === NodeType.TAIL ? node.next : node;
            }
            /*(node: EventStartNode) => {
                const prev = node.previous;
                return prev.type === NodeType.HEAD ? node : prev.previous;
            }*/
            )
    }
    updateJump(from: ENOrHead, to: ENOrTail) {
        if (!this.jump || this.effectiveBeats !== this.jump.effectiveBeats) {
            this.initJump();

        }
        this.jump.updateRange(from, to);
    }
    insert() {

    }
    getNodeAt(beats: number, usePrev: boolean = false): EventStartNode {
        let node = this.jump?.getNodeAt(beats) as (EventStartNode | EventNodeLike<NodeType.TAIL>) || this.head.next as (EventStartNode | EventNodeLike<NodeType.TAIL>);
        if (node.type === NodeType.TAIL) {
            if (usePrev) {
                return node.previous.previous.previous;
            }
            // 最后一个事件节点本身具有无限延伸的特性
            return node.previous;
        }
        if (usePrev && TimeCalculator.toBeats(node.time) === beats) {
            const prev = node.previous;
            if (!(prev.type === NodeType.HEAD)) {
                node = prev.previous;
            }
        }
        if (TimeCalculator.toBeats(node.time) > beats && beats >= 0) {
            console.warn("Got a node after the given beats. This would only happen when the given beats is negative. Beats and Node:", beats, node)
        }
        return node;
    }
    getValueAt(beats: number, usePrev: boolean = false) {
        return this.getNodeAt(beats, usePrev).getValueAt(beats);
    }
    getIntegral(beats: number, timeCalculator: TimeCalculator) {
        const node: EventStartNode = this.getNodeAt(beats)
        return node.getIntegral(beats, timeCalculator) + node.cachedIntegral
    }
    updateNodesIntegralFrom(beats: number, timeCalculator: TimeCalculator) {
        let previousStartNode = this.getNodeAt(beats);
        previousStartNode.cachedIntegral = -previousStartNode.getIntegral(beats, timeCalculator);
        let totalIntegral: number = previousStartNode.cachedIntegral
        let endNode: EventEndNode | EventNodeLike<NodeType.TAIL>;
        while ((endNode = previousStartNode.next).type !== NodeType.TAIL) {
            const currentStartNode = endNode.next
            totalIntegral += previousStartNode.getFullIntegral(timeCalculator);
            currentStartNode.cachedIntegral = totalIntegral;
            previousStartNode = currentStartNode;
        }
    }
    dump(): EventNodeSequenceDataKPA {
        const nodes: EventDataRPE[] = [];
        let currentNode: EventStartNode = this.head.next;

        while (currentNode && !(currentNode.next.type === NodeType.TAIL)) {

            const eventData: EventDataRPE = currentNode.dump();

            nodes.push(eventData);

            currentNode = currentNode.next.next;
        }

        return {
            type: this.type,
            events: nodes,
            id: this.id,
            endValue: currentNode.value
        };
    }
}

