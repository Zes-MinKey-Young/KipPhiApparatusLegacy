// type EndBeats = number;
const MIN_LENGTH = 128
const MAX_LENGTH = 1024
const MINOR_PARTS = 16;

type EndNextFn<T extends TwoDirectionNode> = (node: T) => [endBeats: number, next: T];



interface TwoDirectionNodeLike {
    next: this | null;
    previous: this | null;
    type: NodeType;
}

class JumpArray<T extends TwoDirectionNodeLike> {
    header: T;
    tailer: T;
    array: (T[] | T)[];
    averageBeats: number;
    effectiveBeats: number;
    goPrev: (node: T) => T;

    /**
     * 
     * @param head 链表头
     * @param tail 链表尾
     * @param originalListLength 
     * @param effectiveBeats 有效拍数（等同于音乐拍数）
     * @param endNextFn 接收一个节点，返回该节点分管区段拍数，并给出下个节点。若抵达尾部，返回[null, null]（停止遍历的条件是抵达尾部而不是得到null）
     * @param nextFn 接收一个节点，返回下个节点。如果应当停止，返回false。
     */
    constructor(
        head: T,
        tail: T,
        originalListLength: number,
        effectiveBeats: number,
        public endNextFn: EndNextFn<T>,
        public nextFn: (node: T, beats: number) => T | false,
        public resolveLastNode: (node: T) => T = (node) => node
        // goPrev: (node: T) => T
        ) {
        this.header = head;
        this.tailer = tail;
        // const originalListLength = this.listLength
        const listLength: number = Math.max(MIN_LENGTH, Math.min(originalListLength * 4, MAX_LENGTH));
        const averageBeats: number = Math.pow(2, Math.ceil(Math.log2(effectiveBeats / listLength)));
        const exactLength: number = Math.ceil(effectiveBeats / averageBeats);
        // console.log(exactLength, listLength, averageBeats, exactLength)
        // console.log(originalListLength, effectiveBeats, averageBeats, minorBeats, exactLength)
        const jumpArray: (T | T[])[] = new Array(exactLength);
        this.array = jumpArray;
        this.averageBeats = averageBeats;
        this.effectiveBeats = exactLength * averageBeats;
        this.updateRange(head, tail)
    }
    updateEffectiveBeats(val: number) {
        this.effectiveBeats = val;
        const averageBeats = this.averageBeats;
        const exactLength: number = Math.ceil(val / averageBeats);
        const currentLength = this.array.length
        if (exactLength < currentLength) {
            this.array.splice(exactLength, currentLength - exactLength)
        }
    }
    updateAverageBeats() {
        const length = this.array.length;
        if (length >= 1024) {
            return
        }
        let crowded = 0
        for (let i = 0; i < 50; i++) {
            const index = Math.floor(Math.random() * length);
            if (Array.isArray(this.array[index])) {
                crowded++
            }
        }
        if (crowded > 30) {
            this.averageBeats /= 2
            this.updateRange(this.header, this.tailer)
        }
    }
    /**
     * 
     * @param firstNode 不含
     * @param lastNode 含
     */
    updateRange(firstNode: T, lastNode: T) {
        const {endNextFn, effectiveBeats, resolveLastNode} = this;
        lastNode = resolveLastNode(lastNode);
        // console.log(firstNode, lastNode)
        /**
         * 
         * @param startTime 
         * @param endTime 就是节点管辖范围的终止点，可以超过该刻度的最大值
         */
        const fillMinor = (startTime: number, endTime: number) => {
            const minorArray: TypeOrTailer<T>[] = <T[]>jumpArray[jumpIndex];
            const currentJumpBeats: number = jumpIndex * averageBeats
            const startsFrom: number = startTime < currentJumpBeats ? 0 : Math.ceil((startTime - currentJumpBeats) / minorBeats)
            const endsBefore: number = endTime > currentJumpBeats + averageBeats ? MINOR_PARTS : Math.ceil((endTime - currentJumpBeats) / minorBeats)
            for (let minorIndex = startsFrom; minorIndex < endsBefore; minorIndex++) {
                minorArray[minorIndex] = currentNode;
            }
            // console.log(jumpIndex, arrayForIn(minorArray, (n) => node2string(n)).join("]["))
            // console.log("cur:", currentNode)
        }
        const jumpArray = this.array
        const averageBeats: number = this.averageBeats;
        const minorBeats: number = averageBeats / MINOR_PARTS;
        let [previousEndTime, currentNode] = endNextFn(firstNode);
        let jumpIndex = Math.floor(previousEndTime / averageBeats); // 这里写漏了特此留念
        for (;;) {
            let [endTime, nextNode] = endNextFn(currentNode);
            // console.log("----Node:", currentNode, "next:", nextNode, "endTime:", endTime, "previousEndTime:", previousEndTime )
            if (endTime === null) {
                endTime = effectiveBeats;
            }
            // Hold树可能会不出现这种情况，故需特别考虑
            if (endTime >= previousEndTime) {
                while (endTime >= (jumpIndex + 1) * averageBeats) {
                    if (Array.isArray(jumpArray[jumpIndex])) {
                        fillMinor(previousEndTime, endTime)
                    } else {
                        try {
                            // console.log(jumpIndex, currentNode)
                        jumpArray[jumpIndex] = currentNode;
                        } catch (E) {console.log(jumpIndex, jumpArray);debugger}
                    }
                    jumpIndex++;
                }
                const currentJumpBeats: number = jumpIndex * averageBeats // 放错了
                if (endTime > currentJumpBeats) {
                    let minor = jumpArray[jumpIndex];
                    if (!Array.isArray(minor)) {
                        jumpArray[jumpIndex] = new Array(MINOR_PARTS);
                    }
                    fillMinor(previousEndTime, endTime)
                }
                previousEndTime = endTime;
            }
            if (currentNode === lastNode) {
                currentNode = nextNode; // 为了后续可能的填充，防止刻度不满引发错误
                break
            }
            currentNode = nextNode
        }
        const minor = jumpArray[jumpIndex];
        if (Array.isArray(minor)) {
            // console.log("minor", arrayForIn(minor, (n) => node2string(n)))
            if (!minor[MINOR_PARTS - 1]) {
                if (!currentNode) {
                    currentNode = this.tailer
                    fillMinor(previousEndTime, effectiveBeats)
                    return;
                }
                do {
                    let [endTime, nextNode] = endNextFn(currentNode);
                    if (endTime === null) {
                        endTime = this.effectiveBeats;
                    }
                    if (endTime > previousEndTime) {
                        fillMinor(previousEndTime, endTime)
                        previousEndTime = endTime;
                    }
                    currentNode = nextNode;
                } while (previousEndTime < (jumpIndex + 1) * averageBeats)
            }
        }
    }
    getPreviousOf(node: T, beats: number) {
        const jumpAverageBeats = this.averageBeats;
        const jumpPos = Math.floor(beats / jumpAverageBeats);
        const rest = beats - jumpPos * jumpAverageBeats;
        for (let i = jumpPos; i >= 0; i--) {
            let canBeNodeOrArray: T | T[] = this.array[i];
            if (Array.isArray(canBeNodeOrArray)) {
                const minorIndex = Math.floor(rest / (jumpAverageBeats / MINOR_PARTS)) - 1;
                for (let j = minorIndex; j >= 0; j--) {
                    const minorNode = canBeNodeOrArray[j];
                    if (minorNode !== node) {
                        return minorNode as T;
                    }
                }
            }
        }
        return this.header
    }
    /**
     * 
     * @param beats 拍数
     * @ param usePrev 可选，若设为true，则在取到事件头部时会返回前一个事件（即视为左开右闭）
     * @returns 时间索引链表的节点，一般不是head
     */
    getNodeAt(beats: number): T {
        if (beats < 0) {
            return this.header.next;
        }
        if (beats >= this.effectiveBeats) {
            return this.tailer;
        }
        const jumpAverageBeats = this.averageBeats;
        const jumpPos = Math.floor(beats / jumpAverageBeats);
        const rest = beats - jumpPos * jumpAverageBeats;
        const nextFn = this.nextFn;
        let canBeNodeOrArray: T | T[] = this.array[jumpPos]
        let node: T = Array.isArray(canBeNodeOrArray)
            ? canBeNodeOrArray[Math.floor(rest / (jumpAverageBeats / MINOR_PARTS))]
            : canBeNodeOrArray;
        if (node.type === NodeType.TAIL) {
            return node;
        }
        // console.log(this, node, jumpPos, beats)
        if (!node) {
            console.warn("No node:", node, beats)
            debugger
        }
        let next: T | false;
        // console.log(this)
        while (next = nextFn(node, beats)) {
            node = next;
            if (node.type === NodeType.TAIL) {
                break;
            }
        }
        return node
    }
}

