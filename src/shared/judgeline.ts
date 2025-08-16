

/**
 * 奇谱发生器使用中心来表示一个NNList的y值偏移范围，这个函数根据yOffset算出对应中心值
 * @param yOffset 
 * @returns 
 */
const getRangeMedian = (yOffset: number) => {
    return (Math.floor((Math.abs(yOffset) - NNLIST_Y_OFFSET_HALF_SPAN) / NNLIST_Y_OFFSET_HALF_SPAN / 2) * (NNLIST_Y_OFFSET_HALF_SPAN * 2) + NNLIST_Y_OFFSET_HALF_SPAN * 2) * Math.sign(yOffset);
}
class JudgeLine {
    texture: string;
    group: JudgeLineGroup;
    cover: boolean;
    hnLists = new Map<string, HNList>();
    nnLists = new Map<string, NNList>();
    eventLayers: EventLayer[] = [];
    // notePosition: Float64Array;
    // noteSpeeds: NoteSpeeds;
    father: JudgeLine;
    children: Set<JudgeLine> = new Set();

    moveX: number;
    moveY: number;
    rotate: number;
    alpha: number;

    rotatesWithFather: boolean = false;

    id: number;
    name: string = "Untitled";
    readonly chart: Chart;
    constructor(chart: Chart) {
        //this.notes = [];
        this.chart = chart;
        this.texture = "line.png";
        this.cover = true;
        // this.noteSpeeds = {};
    }
    static fromRPEJSON(chart: Chart, id: number, data: JudgeLineDataRPE, templates: TemplateEasingLib, timeCalculator: TimeCalculator) {
        let line = new JudgeLine(chart)
        line.id = id;
        line.name = data.Name;
        chart.judgeLineGroups[data.Group].add(line);
        line.cover = Boolean(data.isCover);
        line.rotatesWithFather = data.rotate_with_father;

        const noteNodeTree = chart.nnnList;
        if (data.notes) {
            const holdLists = line.hnLists;
            const noteLists = line.nnLists;
            let notes = data.notes;
            notes.sort((n1: NoteDataRPE, n2: NoteDataRPE) => {
                if (TimeCalculator.ne(n1.startTime, n2.startTime)) {
                    return TimeCalculator.gt(n1.startTime, n2.startTime) ? 1 : -1
                }
                return TimeCalculator.gt(n1.endTime, n2.endTime) ? -1 : 1 // 这里曾经排反了（
            })
            const len = notes.length;
            let lastTime: TimeT = [-1, 0, 1];
            // let comboInfoEntity: ComboInfoEntity;
                    
            for (let i = 0; i < len; i++) {
                const note: Note = new Note(notes[i]);
                note.computeVisibleBeats(timeCalculator);
                if (note.speed === 0) {
                    debugger;
                }
                const tree = line.getNNList(note.speed, note.yOffset, note.type === NoteType.hold, false)
                const cur = tree.currentPoint
                const lastHoldTime: TimeT = cur.type === NodeType.HEAD ? [-1, 0, 1] : cur.startTime
                if (TimeCalculator.eq(lastHoldTime, note.startTime)) {
                    (<NoteNode>tree.currentPoint).add(note)
                } else {
                    const node = new NoteNode(note.startTime)
                    node.add(note); // 这里之前没写，特此留念！
                    NoteNode.connect(tree.currentPoint, node)
                    tree.currentPoint = node;
                    noteNodeTree.addNoteNode(node);
                }
                tree.timesWithNotes++
            }
            for (let trees of [holdLists, noteLists]) {
                for (const [_, list] of trees) {
                    NoteNode.connect(list.currentPoint, list.tail)
                    list.initJump();
                    // tree.initPointers()
                }
            }
        }
        const eventLayers = data.eventLayers;
        const length = eventLayers.length;
        const createSequence = (type: EventType, events: EventDataRPE[], index: number) =>  {
            if (events) {
                const sequence = EventNodeSequence.fromRPEJSON(type, events, chart);
                sequence.id = `#${id}.${index}.${EventType[type]}`;
                chart.sequenceMap.set(sequence.id, sequence);
                return sequence;
            }
        }
        for (let index = 0; index < length; index++) {
            const layerData = eventLayers[index];
            if (!layerData) {
                continue;
            }
            const layer: EventLayer = {
                moveX: createSequence(EventType.moveX, layerData.moveXEvents, index),
                moveY: createSequence(EventType.moveY, layerData.moveYEvents, index),
                rotate: createSequence(EventType.rotate, layerData.rotateEvents, index),
                alpha: createSequence(EventType.alpha, layerData.alphaEvents, index),
                speed: createSequence(EventType.speed, layerData.speedEvents, index)
            };
            line.eventLayers[index] = layer;
        }
        // line.updateNoteSpeeds();
        // line.computeNotePositionY(timeCalculator);
        return line;
    }
    static fromKPAJSON(isOld: boolean, chart: Chart, id: number, data: JudgeLineDataKPA, templates: TemplateEasingLib, timeCalculator: TimeCalculator) {
        let line = new JudgeLine(chart)
        line.id = id;
        line.name = data.Name;
        line.rotatesWithFather = data.rotatesWithFather;
        chart.judgeLineGroups[data.group].add(line);
        const nnnList = chart.nnnList;
        for (let isHold of [false, true]) {
            const key: "hnLists" | "nnLists" = `${isHold ? "hn" : "nn"}Lists`
            const lists: Plain<NNListDataKPA> = data[key];
            for (let name in lists) {
                const listData = lists[name];
                if (!isOld) {
                        
                    const list: NNList = NNList.fromKPAJSON(isHold, chart.effectiveBeats, listData, nnnList, timeCalculator);
                    list.parentLine = line;
                    list.id = name
                    line[key].set(name, list);
                } else {
                    line.getNNListFromOldKPAJSON(line[key], name, isHold, chart.effectiveBeats, listData, nnnList, timeCalculator);
                }
            }
        }
        for (let child of data.children) {
            line.children.add(JudgeLine.fromKPAJSON(isOld, chart, child.id, child, templates, timeCalculator));
        }
        for (let eventLayerData of data.eventLayers) {
            let eventLayer: EventLayer = {} as EventLayer;
            for (let key in eventLayerData) {
                // use "fromRPEJSON" for they have the same logic
                eventLayer[key] = chart.sequenceMap.get(eventLayerData[key]);
            }
            line.eventLayers.push(eventLayer);
        }
        chart.judgeLines.push(line);
        return line;
    }
    getNNListFromOldKPAJSON(lists: Map<string, NNList>, namePrefix: string, isHold: boolean, effectiveBeats: number, listData: NNListDataKPA, nnnList: NNNList, timeCalculator: TimeCalculator) {
        const speed = listData.speed;
        const constructor = isHold ? HNList : NNList;
        const createdLists = new Set<NNList>();
        const getOrCreateNNList = (median: number, name: string) => {
            if (lists.has(name)) {
                return lists.get(name);
            }
            const list: NNList = new constructor(speed, median, effectiveBeats);
            list.id = name;
            list.parentLine = this;
            lists.set(name, list);
            createdLists.add(list);
            return list;
        };
        const nns = listData.noteNodes;
        const len = nns.length;
        for (let i = 0; i < len; i++) {
            const nodeData = nns[i];
            const l = nodeData.notes.length;
            for (let j = 0; j < l; j++) {
                const noteData = nodeData.notes[j];
                const note = new Note(noteData);
                const median = getRangeMedian(note.yOffset)
                const list = getOrCreateNNList(median, namePrefix + "o" + median);
                const cur = list.currentPoint;
                if (!note.visibleBeats) {
                    note.computeVisibleBeats(timeCalculator)
                }
                if (!(cur.type === NodeType.HEAD) && TC.eq(noteData.startTime, cur.startTime)) {
                    cur.add(note);
                } else {
                    const node = new NoteNode(noteData.startTime);
                    node.add(note);
                    nnnList.addNoteNode(node);
                    NoteNode.connect(cur, node);
                    list.currentPoint = node;
                }
            }
        }
        for (const list of createdLists) {
            NoteNode.connect(list.currentPoint, list.tail);
            list.initJump();
        }
    }
    updateSpeedIntegralFrom(beats: number, timeCalculator: TimeCalculator) {
        for (let eventLayer of this.eventLayers) {
            eventLayer?.speed?.updateNodesIntegralFrom(beats, timeCalculator);
        }
    }
    /**
     * startY and endY must not be negative
     * @param beats 
     * @param timeCalculator 
     * @param startY 
     * @param endY 
     * @returns 
     */
    computeTimeRange(beats: number, timeCalculator: TimeCalculator , startY: number, endY: number): [number, number][] {
        console.log("invoked")
        //return [[0, Infinity]]
        //*
        // 提取所有有变化的时间点
        let times: number[] = [];
        let result: [number, number][] = [];
        for (let eventLayer of this.eventLayers) {
            const sequence = eventLayer?.speed;
            if (!sequence) {
                continue;
            }
            let node: EventStartNode = sequence.getNodeAt(beats);
            let endNode: EventEndNode | EventNodeLike<NodeType.TAIL>
            while (true) {
                times.push(TimeCalculator.toBeats(node.time))
                if ((endNode = node.next).type === NodeType.TAIL) {
                    break;
                }

                node = endNode.next
            }
        }
        times = [...new Set(times)].sort((a, b) => a - b)
        const len = times.length;
        let nextTime = times[0]
        let nextPosY = this.getStackedIntegral(nextTime, timeCalculator)
        let nextSpeed = this.getStackedValue("speed", nextTime, true)
        let range: [number, number] = [undefined, undefined];
        // console.log(times)
        const computeTime = (speed: number, currentPos: number, fore: number) => timeCalculator.secondsToBeats(currentPos / (speed * 120) + timeCalculator.toSeconds(fore));
        for (let i = 0; i < len - 1;) {
            const thisTime = nextTime;
            const thisPosY = nextPosY;
            let thisSpeed = this.getStackedValue("speed", thisTime);
            if (Math.abs(thisSpeed) < 1e-8) {
                thisSpeed = 0; // 不这样做可能导致下面异号判断为真从而死循环
            }
            nextTime = times[i + 1]
            nextPosY = this.getStackedIntegral(nextTime, timeCalculator);
            nextSpeed = this.getStackedValue("speed", nextTime, true)
            // console.log(thisSpeed, nextSpeed, thisSpeed * nextSpeed < 0, i, [...result])
            if (thisSpeed * nextSpeed < 0) { // 有变号零点，再次切断，保证处理的每个区间单调性
                //debugger;
                nextTime = (nextTime - thisTime) * (0 - thisSpeed) / (nextSpeed - thisSpeed) + thisTime;
                nextSpeed = 0
                nextPosY = this.getStackedIntegral(nextTime, timeCalculator)
                //debugger
            } else {
                // console.log("i++")
                i++
            }
            if (range[0] === undefined) {
                // 变速区间直接全部囊括，匀速要算一下，因为好算
                /*
                设两个时间点的位置为a,b
                开始结束点为s,e
                选中小段一部分在区间内：
                a < s <= b
                或a > e >= b
                全部在区间内
                s <= a <= b
                */
                if (thisPosY < startY && startY <= nextPosY
                || thisPosY > endY && endY >= nextPosY) {
                    range[0] = thisSpeed !== nextSpeed ? thisTime : computeTime(
                        thisSpeed,
                        (thisPosY < nextPosY ? startY : endY) - thisPosY, thisTime)
                } else if (startY <= thisPosY && thisPosY <= endY) {
                    range[0] = thisTime;
                }
            }
            // 要注意这里不能合成双分支if因为想要的Y片段可能在一个区间内
            if (range[0] !== undefined) {
                if (thisPosY < endY && endY <= nextPosY || thisPosY > startY && startY >= nextPosY) {
                    range[1] = thisSpeed !== nextSpeed ? nextTime : computeTime(
                        thisSpeed,
                        (thisPosY > nextPosY ? startY : endY) - thisPosY, thisTime)
                    if (range[0] > range[1]){
                        console.error("range start should be smaller than range end.")
                        console.log("\nRange is:", range, "thisTime:", thisTime, "thisSpeed:", thisSpeed, "thisPosY:", thisPosY,
                                "\nstartY:", startY, "endY:", endY, "nextTime:", nextTime, "nextPosY:", nextPosY, "nextSpeed:", nextSpeed,
                                "\njudgeLine:", this)
                    }
                    result.push(range)
                    range = [undefined, undefined];
                }
            }
        }
        const thisPosY = nextPosY;
        const thisTime = nextTime;
        const thisSpeed = this.getStackedValue("speed", thisTime);
        const inf = thisSpeed > 0 ? Infinity : (thisSpeed < 0 ? -Infinity : thisPosY)
        if (range[0] === undefined) {
            // 变速区间直接全部囊括，匀速要算一下，因为好算
            if (thisPosY < startY && startY <= inf || thisPosY >= endY && endY > inf) {
                range[0] = computeTime(
                    thisSpeed,
                    (thisPosY < inf ? startY : endY) - thisPosY,
                    thisTime)
            } else if (thisSpeed === 0) {
                range[0] = 0;
            }
        }
        // 要注意这里不能合成双分支if因为想要的Y片段可能在一个区间内
        if (range[0] !== undefined) {
            if (thisPosY < endY && endY <= inf || thisPosY >= startY && startY > inf) {
                range[1] = computeTime(
                    thisSpeed,
                    (thisPosY > inf ? startY : endY) - thisPosY,
                    thisTime)
                result.push(range)
            } else if (thisSpeed === 0) {
                range[1] = Infinity;
                result.push(range)
            }
        }
        return result;
        //*/
    }
    /*
    computeLinePositionY(beats: number, timeCalculator: TimeCalculator)  {
        return this.getStackedIntegral(beats, timeCalculator)
    }
    */
    /**
     * 
     * @param beats 
     * @param usePrev 如果取到节点，将使用EndNode的值。默认为FALSE
     * @returns 
     */
    getValues(beats: number, usePrev: boolean=false): [x: number, y: number, theta: number, alpha: number] {
        return [
            this.getStackedValue("moveX", beats, usePrev),
            this.getStackedValue("moveY", beats, usePrev),
            this.getStackedValue("rotate", beats, usePrev) / 180 * Math.PI, // 转换为弧度制
            this.getStackedValue("alpha", beats, usePrev),
        ]
    }
    getMatrix(beats: number, usePrev = false) {
        const base = this.father.getMatrix(beats, usePrev);
        const x = this
    }
    getStackedValue(type: keyof EventLayer, beats: number, usePrev: boolean = false) {
        const length = this.eventLayers.length;
        let current = 0;
        for (let index = 0; index < length; index++) {
            const layer = this.eventLayers[index];
            if (!layer || !layer[type]) {
                break;
            }
            current += layer[type].getValueAt(beats, usePrev);
        }
        return current
    }
    getStackedIntegral(beats: number, timeCalculator: TimeCalculator) {
        
        const length = this.eventLayers.length;
        let current = 0;
        for (let index = 0; index < length; index++) {
            const layer = this.eventLayers[index];
            if (!layer || !layer.speed) {
                break;
            }
            current += layer.speed.getIntegral(beats, timeCalculator);
        }
        // console.log("integral", current)
        return current;
    }
    /**
     * 获取对应速度和类型的Note树,没有则创建
     */
    getNNList(speed: number, yOffset: number, isHold: boolean, initsJump: boolean) {
        const lists = isHold ? this.hnLists : this.nnLists;
        const medianYOffset = getRangeMedian(yOffset);
        for (const [_, list] of lists) {
            if (list.speed === speed && list.medianYOffset === medianYOffset) {
                return list;
            }
        }
        const list = isHold ? new HNList(speed, medianYOffset, this.chart.timeCalculator.secondsToBeats(editor.player.audio.duration)) : new NNList(speed, medianYOffset, this.chart.timeCalculator.secondsToBeats(editor.player.audio.duration))
        list.parentLine = this;
        NoteNode.connect(list.head, list.tail)
        if (initsJump) list.initJump();
        const id = (isHold ? "$" : "#") + speed + "o" + medianYOffset;
        lists.set(id, list);
        list.id = id;
        return list;
    }
    getNode(note: Note, initsJump: boolean) {
        const speed = note.speed;
        const yOffset = note.yOffset;
        const isHold = note.type === NoteType.hold;
        const tree = this.getNNList(speed, yOffset, isHold, initsJump);
        return tree.getNodeOf(note.startTime);
    }
    /**
     * 
     * @param eventNodeSequences To Collect the sequences used in this line
     * @returns 
     */
    dumpKPA(eventNodeSequences: Set<EventNodeSequence>, judgeLineGroups: JudgeLineGroup[]): JudgeLineDataKPA {
        const children: JudgeLineDataKPA[] = [];
        for (let line of this.children) {
            children.push(line.dumpKPA(eventNodeSequences, judgeLineGroups))
        }
        const eventLayers: EventLayerDataKPA[] = [];
        for (let i = 0; i < this.eventLayers.length; i++) {
            const layer = this.eventLayers[i];
            if (!layer) continue;
            let layerData = {}
            for (let type in layer) {
                const sequence = layer[type as keyof EventLayer];
                if (!sequence) continue;
                eventNodeSequences.add(sequence);
                layerData[type] = sequence.id;
            }
            eventLayers.push(layerData as EventLayerDataKPA);
        }
        const hnListsData = {};
        const nnListsData = {};
        for (let [id, list] of this.hnLists) {
            hnListsData[id] = list.dumpKPA();
        }
        for (let [id, list] of this.nnLists) {
            nnListsData[id] = list.dumpKPA();
        }
        return {
            group: judgeLineGroups.indexOf(this.group),
            id: this.id,
            Name: this.name,
            Texture: "line.png",
            children: children,
            eventLayers: eventLayers,
            hnLists: hnListsData,
            nnLists: nnListsData
        }
    }

    
    updateEffectiveBeats(EB: number) {
        for (let i = 0; i < this.eventLayers.length; i++) {
            const layer = this.eventLayers[i];
            for (let type in layer) {
                const sequence = layer[type as keyof EventLayer];
                sequence.effectiveBeats = EB;
            }
        }
        for (let lists of [this.nnLists, this.hnLists]) {
            for (let [_, list] of lists) {
                list.effectiveBeats = EB;
            }
        }
    }
    static checkinterdependency(judgeLine: JudgeLine, toBeFather: JudgeLine) { 
        let descendantsAndSelf = new Set<JudgeLine>();
        const add = (line: JudgeLine) => {
            descendantsAndSelf.add(line);
            for (let child of line.children) {
                add(child);
            }
        }
        add(judgeLine);
        return descendantsAndSelf.has(toBeFather);
    }
}