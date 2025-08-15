
/**
 * 全生命周期只会编译一次，想多次就再构造一个
 */
class RPEChartCompiler {
    sequenceMap: Map<EventNodeSequence, EventNodeSequence> = new Map();
    constructor(public chart: Chart) {}

    compileChart(): ChartDataRPE {
        console.time("compileChart")
        const chart = this.chart;
        const judgeLineGroups = chart.judgeLineGroups.map(group => group.name);
        const judgeLineList = chart.judgeLines.map(line => this.dumpJudgeLine(line));
        const BPMList = chart.timeCalculator.dump();
        const META: MetaData = {
            RPEVersion: 1,
            background: '',
            charter: '',
            composer: '',
            id: Math.random().toString().slice(2, 10),
            level: chart.level,
            name: chart.name,
            offset: chart.offset,
            song: chart.name
        };
        console.timeEnd("compileChart");
        return {
            BPMList,
            META,
            judgeLineList,
            judgeLineGroup: judgeLineGroups,
            multiLineString: '',
            multiScale: 1.0
        };
    }

    dumpJudgeLine(judgeLine: JudgeLine): JudgeLineDataRPE {
        const chart = this.chart;
        const notes = this.compileNNLists([...judgeLine.nnLists.values()], [...judgeLine.hnLists.values()]);
        
        return {
            notes: notes,
            Group: chart.judgeLineGroups.indexOf(judgeLine.group),
            Name: judgeLine.name,
            Texture: judgeLine.texture,
            bpmfactor: 1.0,
            eventLayers: judgeLine.eventLayers.map((layer): EventLayerDataRPE => ({
                moveXEvents: layer.moveX ? this.dumpEventNodeSequence(layer.moveX) : null,
                moveYEvents: layer.moveY ? this.dumpEventNodeSequence(layer.moveY) : null,
                rotateEvents: layer.rotate ? this.dumpEventNodeSequence(layer.rotate) : null,
                alphaEvents: layer.alpha ? this.dumpEventNodeSequence(layer.alpha) : null,
                speedEvents: layer.speed ? this.dumpEventNodeSequence(layer.speed) : null
            })),
            father: judgeLine.father?.id ?? -1,
            isCover: judgeLine.cover ? 1 : 0,
            numOfNotes: notes.length,

        };
    }

    dumpEventNodeSequence(sequence: EventNodeSequence): EventDataRPE[] {
        const nodes: EventDataRPE[] = [];
        sequence = this.substitute(sequence);
        let node = sequence.head.next;
        while (true) {
            const end = node.next;
            if (end.type === NodeType.TAIL) break;
            nodes.push(node.dump());
            node = end.next;
        }
        nodes.push(node.dumpAsLast());

        return nodes
    }

    compileNNLists(nnLists: NNList[], hnLists: HNList[]): NoteDataRPE[] {
        const noteLists = nnLists.map(list => this.nnListToArray(list));
        const holdLists = hnLists.map(list => this.nnListToArray(list));
        const ret: NoteDataRPE[] = []
        const time = (list: NoteDataRPE[]) => list.length === 0 ? [Infinity, 0, 1] as TimeT : list[list.length - 1].startTime;
        const concatWithOrder = (lists: NoteDataRPE[][]) => {
            if (lists.length === 0) return;
            // 先按最早的时间排序
            lists.sort((a, b) => {
                return TimeCalculator.gt(time(a), time(b)) ? 1 : -1;
            });
            // 每次从lists中第一个list pop一个data加入到结果，然后冒泡调整这个list的位置
            while (lists[0].length > 0) {
                const list = lists[0];
                const node = list.pop();
                ret.push(node);
                let i = 0;
                while (i + 1 < lists.length && TimeCalculator.gt(time(lists[i]), time(lists[i + 1]))) {
                    const temp = lists[i];
                    lists[i] = lists[i + 1];
                    lists[i + 1] = temp;
                    i++;
                }
            }

        };
        concatWithOrder(noteLists);
        concatWithOrder(holdLists);
        return ret;
    }
    /**
     * 倒序转换为数组
     * @param nnList 
     * @returns 
     */
    nnListToArray(nnList: NNList) {
        const notes: NoteDataRPE[] = [];
        let node: TypeOrHeader<NoteNode> = nnList.tail.previous;
        while (!(node.type === NodeType.HEAD)) {
            for (let each of node.notes) {
                notes.push(each.dumpRPE());
            }
            node = node.previous;
        }
        return notes;
    }

    /**
     * 将当前序列中所有通过模板缓动引用了其他序列的事件直接展开为被引用的序列内容
     * transform all events that reference other sequences by template easing
     * into the content of the referenced sequence
     * 有点类似于MediaWiki的{{subst:templateName}}
     * @param map 由TemplateEasingLib提供
     * @returns 
     */
    substitute(seq: EventNodeSequence): EventNodeSequence {
        const map = this.sequenceMap;
        if (map.has(seq)) {
            return map.get(seq);
        }
        let currentNode: EventStartNode = seq.head.next;
        const newSeq = new EventNodeSequence(seq.type, seq.effectiveBeats);
        map.set(seq, newSeq);
        let currentPos: Header<EventStartNode> | EventEndNode = newSeq.head;
        while (true) {
            if (!currentNode || (currentNode.next.type === NodeType.TAIL)) {
                break;
            }
            const endNode = currentNode.next;
            if (currentNode.easing instanceof TemplateEasing) {
                const quoted: EventNodeSequence = this.substitute(currentNode.easing.eventNodeSequence);
                const startTime: TimeT = currentNode.time;
                const endTime: TimeT = endNode.time;
                const start: number = currentNode.value;
                const end: number = endNode.value;
                const delta = end - start;
                const originalStart: number = quoted.head.next.value;
                const originalDelta = quoted.tail.previous.value - quoted.head.next.value 
                const originalTimeSpan: TimeT = TimeCalculator.sub(quoted.tail.previous.time, quoted.head.next.time)
                const timeSpan: TimeT = TimeCalculator.sub(endTime, startTime);
                const ratio: [number, number] = TimeCalculator.div(timeSpan, originalTimeSpan)
                const convert: (v: number) => number
                    = (value: number) => start + (value - originalStart) * delta / originalDelta;
                // 我恨TS没有运算符重载
                const convertTime: (t: TimeT) => TimeT
                    = (time: TimeT) => TC.validateIp(TC.add(startTime, TC.mul(TC.sub(time, quoted.head.next.time), ratio)));
                let node = quoted.head.next;
                while (true) {
                    const end = node.next;
                    if (end.type === NodeType.TAIL) {
                        break;
                    }
                    const newNode = new EventStartNode(convertTime(node.time), convert(node.value));
                    const newEndNode = new EventEndNode(convertTime(end.time), convert(end.value));
                    EventNode.connect(currentPos, newNode);
                    EventNode.connect(newNode, newEndNode);
                    currentPos = newEndNode;
                    node = end.next;
                }
            } else {
                const newStartNode = currentNode.clone();
                const newEndNode = endNode.clone();
                EventNode.connect(currentPos, newStartNode)
                EventNode.connect(newStartNode, newEndNode);
                currentPos = newEndNode;
            }
            currentNode = endNode.next;
        }
        const lastStart = currentNode.clone();
        EventNode.connect(currentPos, lastStart);
        EventNode.connect(lastStart, newSeq.tail)
        return newSeq;
    }
}

