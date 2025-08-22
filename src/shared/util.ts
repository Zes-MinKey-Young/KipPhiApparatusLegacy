
interface ListNode<T> {
    next: ListNode<T> | null;
    value: T;
}

interface TwoDirectionNode {
    previous: TwoDirectionNode | Header<TwoDirectionNode>;
    next: TwoDirectionNode | Tailer<TwoDirectionNode>;
}

interface List<TN extends TwoDirectionNode> {
    head: Header<TN>
    tail: Tailer<TN>
}

interface Header<TN extends TwoDirectionNode> {
    next: TN;
    heading: true;
    parentSeq: List<TN>;
}



interface Tailer<TN extends TwoDirectionNode> {
    previous: TN;
    tailing: true;
    parentSeq: List<TN>;
}
type TypeOrHeader<T extends TwoDirectionNode> = Header<T> | T
type TypeOrTailer<T extends TwoDirectionNode> = Tailer<T> | T

const connect = <T>(foreNode: ListNode<T>, lateNode: ListNode<T>) => {
    foreNode.next = lateNode;
}


const rgba = (r: number, g: number, b: number, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`
const rgb = (r: number, g: number, b: number) => `rgba(${r}, ${g}, ${b})`

/** @deprecated */
const toTimeString = (beaT: TimeT) /*`${number}:${number}/${number}`*/ =>  `${beaT[0]}:${beaT[1]}/${beaT[2]}`

function drawLine(context: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number) {
    context.beginPath()
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke()
}
// ParameterListSoLoooongException()
/**
 * 
 * @param context 
 * @param startX 
 * @param startY 
 * @param endX 
 * @param endY 
 * @param cp1x control point 1
 * @param cp1y 
 * @param cp2x 
 * @param cp2y 
 */
function drawBezierCurve(context: CanvasRenderingContext2D,startX: number, startY: number, endX: number, endY: number, cp1x: number, cp1y: number, cp2x: number, cp2y: number) {
    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    context.stroke();
}
/**
 * To assign the same handler for different event types on an element
 * @param eventTypes array of strings representing the types
 * @param element 
 * @param handler 
 */
function on<K extends keyof HTMLElementEventMap>(
    eventTypes: K[],
    element: HTMLElement,
    handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any
) {
    for (let type of eventTypes) {
        element.addEventListener(type, handler);
    }
}
/**
 * to print a two-directional node list
 * @param list 
 */
function printList<T extends TwoDirectionNode>(list: List<T>) {
    let cur: Header<T> | Tailer<T> | T = list.head;
    while(1) {
        console.log(cur)
        if ("tailing" in cur) {
            break;
        }
        cur = <T>cur.next
    }
}



type Vector = [x: number, y: number]
/**
 * to compute the length of a vector
 * @param v 
 * @returns length
 */
const absVector = (v: Vector) => {
    return Math.sqrt(Math.pow(v[0], 2) + Math.pow(v[1], 2));
}
/**
 * 
 * @param v1 
 * @param v2 
 * @returns 
 */
const innerProduct = (v1: Vector, v2: Vector) => {
    return v1[0] * v2[0] + v1[1] * v2[1];
}



const getOffset = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return [rect.left, rect.top];
}

/**
 * To get offset coordinates from mouse or touch
 * @param event 
 * @param element 
 * @returns 
 */
const getOffsetCoordFromEvent: (event: MouseEvent | TouchEvent, element: HTMLElement) => [number, number] = 
(event: MouseEvent | TouchEvent, element: HTMLElement) =>  {
    if (event instanceof MouseEvent) {
        return [event.offsetX, event.offsetY];
    } else {
        const [left, top] = getOffset(element); // 不是简单的offsetLeft，因为offsetLeft是相对于offsetParent的
        return [event.changedTouches[0].clientX - left, event.changedTouches[0].clientY - top];
    }
}

function saveTextToFile(text: string, filename: string) {
    // 创建一个 Blob 对象
    const blob = new Blob([text], { type: 'text/plain' });

    // 创建一个 URL 对象
    const url = URL.createObjectURL(blob);

    // 创建一个 <a> 元素
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;

    // 将 <a> 元素添加到文档中
    document.body.appendChild(a);

    // 触发点击事件
    a.click();

    // 移除 <a> 元素
    document.body.removeChild(a);

    // 释放 URL 对象
    URL.revokeObjectURL(url);
}

function shortenFloat(num: number, decimalPlaces: number) {
    const multiplier = Math.pow(10, decimalPlaces);
    return Math.round(num * multiplier) / multiplier;
}


function changeAudioTime(audio: HTMLAudioElement, delta: number) {
    const time = audio.currentTime + delta;
    if (time < 0) {
        audio.currentTime = 0;
    } else if (time > audio.duration) {
        audio.currentTime = audio.duration;
    } else {
        audio.currentTime = time;
    }
}


/**
 * 获取一串数字的第？分位数
 */
function getPercentile(sorted: number[], percentile: number): number {
    return sorted[Math.floor(sorted.length * percentile)]
}

const isAllDigits = (str: string) => /^\d+$/.test(str);

const extend = <T>(target: Partial<T>, source: Partial<T>): void => {
    Object.keys(source).forEach(key => {
        if (source[key] !== undefined) {
            target[key] = source[key];
        }
    });
}


/**
 * 检查值的类型
 * @param value 
 * @param type 为字符串时，用typeof检测，为构造函数时，用instanceof检测，为数组时，识别为元组类型。
 */
const checkType = (value: any, type: string | (string | Function)[] | Function) => {
    if (Array.isArray(type)) {
        return Array.isArray(value)
        && value.length === type.length
        && type.every((t, i) => checkType(value[i], t))
    } else if (typeof type === "string") {
        return typeof value === type
    } else {
        return value instanceof type
    }
}

const numNoun = (num: number, singular: string, plural: string = singular + "s") => {
    if (num <= 1) {
        return `${num} ${singular}`
    } else {
        return `${num} ${plural}`
    }
}
