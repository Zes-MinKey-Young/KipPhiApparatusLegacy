

/** 尽管JSON中有布尔值字面量，RPEJSON中没有使用它 */
type Bool = 1 | 0
/** 三元组，用带分数表示的时间 */
type TimeT = [number, number, number]
type RGB = [number, number, number]

interface ChartDataRPE {
    /** BPM列表 */
    BPMList: BPMSegmentData[];
    /** 元数据 */
    META: MetaData;
    /** 判定线组 */
    judgeLineGroup: string[];
    /** 判定线列表 */
    judgeLineList: JudgeLineDataRPE[];
    chartTime?: number;
    multiLineString: string;
    multiScale: number;

}

interface BPMSegmentData {
    bpm: number;
    startTime: TimeT;
    // endTime?: TimeT;
}
interface MetaData {
    /** RPE版本（int） */
    RPEVersion: number;
    /** 背景图片路径 */
    background: string;
    /** 谱师名称 */
    charter: string;
    /** 曲师名称 */
    composer: string;
    /** 谱面ID，即Resources文件夹下的文件夹名称 */
    id: string;
    /** 谱面难度 */
    level: string;
    /** 谱面名称 */
    name: string;
    /** 谱面偏移（以毫秒计量） */
    offset: number;
    /** 音乐文件路径 */
    song: string;
    /** 音乐时长（1.6(存疑)新增） */
    duration?: number;
}

interface NoteDataRPE {
    /** 音符是否在判定线上方 （2为下方） */
    above: Bool | 2;
    /** 音符不透明度 */
    alpha: number;
    /** 音符结束时间，无论是否为Hold都有该属性 */
    endTime: TimeT;
    /** 音符是否为假 */
    isFake: Bool;
    /** 音符在判定线上落点位置 */
    positionX: number;
    /** 音符大小（默认1.0） */
    size: number;
    /** 音符速度 */
    speed: number;
    /** 音符开始时间 */
    startTime: TimeT;
    /** 音符类型（1 为 Tap，2 为 Hold，3 为 Flick，4 为 Drag）*/
    type: NoteType;
    /** 音符可视时间（打击前多少秒开始显现，默认99999.0） */
    visibleTime: number;
    /** y值偏移，使音符被打击时的位置偏离判定线 */
    yOffset: number;

    // 下面是PhiZone Player扩展的内容
    /** Sets the Z index for the object. */
    zIndex?: number;
    /**
     * Sets the Z index for the hit effects of the note. Defaults to 7.
     */
    zIndexHitEffects?: number;
    /** Sets the tint for the hit effects of the note. Defaults to null. */
    tint?: RGB;
    tintHitEffects?: RGB;
    
    /** Determines the width of the judgment area of the note. Defaults to size. */
    judgeSize?: number;
}

interface NoteDataKPA extends NoteDataRPE {
    visibleBeats?: number;
    absoluteYOffset: number;
}

/** 事件 */
interface EventDataRPE<T = number> {
    /** 是否使用贝塞尔曲线 */
    bezier: Bool;
    /** 贝塞尔控制点 */
    bezierPoints: [number, number, number, number];
    /** 截取缓动左边界 */
    easingLeft: number;
    /** 截取缓动右边界 */
    easingRight: number;
    /** 缓动类型 */
    easingType: number;
    /** 结束值 */
    end: T;
    /** 结束时间 */
    endTime: TimeT;
    /** 链接组 */
    linkgroup: number;
    /** 开始值 */
    start: T;
    /** 开始时间 */
    startTime: TimeT;
}

/**
 * 五个种类的事件的start/end含义：
 * X/Y方向移动：像素
 * 旋转：角度（以度计）
 * 不透明度改变：不透明度（0-255的整数）
 * 速度改变：RPE速度单位（每个单位代表每秒下降120px）
 */

/** 每条判定线的前四个事件层级。第五个是特殊事件，这里没有列入 */
interface EventLayerDataRPE {
    moveXEvents?: EventDataRPE[];
    moveYEvents?: EventDataRPE[];
    rotateEvents?: EventDataRPE[];
    alphaEvents?: EventDataRPE[];
    speedEvents?: EventDataRPE[];
}



interface Control {
    easing: number;
    x: number;
}

interface AlphaControl extends Control {
    alpha: number;
}
interface PosControl extends Control {
    pos: number;
}
interface SizeControl extends Control {
    size: number;
}
interface SkewControl extends Control {
    skew: number;
}
interface YControl extends Control {
    y: number;
}

/** 判定线 */
interface JudgeLineDataRPE {
    _id?: number;
    /** 音符数据
     * 对音符的顺序没有要求，但RPE生成的标准RPEJSON中应当按照时间升序排列，
     * 且非Hold类型与Hold分开排列，非Hold在前
     */
    notes: NoteDataRPE[];
    /** 所在的判定线组，对应judgeLineGroup数组中的字符串的下标 */
    Group: number;
    /** 线名 */
    Name: string;
    /** 纹理图片的路径 */
    Texture: string;
    alphaControl: AlphaControl[];
    /** BPM因数 */
    bpmfactor: 1.0;
    /** 事件层级，这里没有介绍第五个 */
    eventLayers: (EventLayerDataRPE | null)[];
    /** 扩展事件 */
    extended: {
        colorEvents: EventDataRPE<RGB>[];
        inclineEvents: EventDataRPE[];
        scaleXEvents: EventDataRPE[];
        scaleYEvents: EventDataRPE[];
        textEvents: EventDataRPE<string>[];
    };
    /** 父线线号，没有父线则为-1 */
    father: number;
    /** 有无遮罩 */
    isCover: Bool;
    /** 音符数量 */
    numOfNotes: number;

    posControl: PosControl[];
    sizeControl: SizeControl[];
    skewControl: SkewControl[];
    yControl: YControl[];
    /** z轴顺序，决定重叠的顺序 */
    zOrder: number;

    /** 背景是否为GIF */
    isGif: Bool;

    rotate_with_father?: boolean;
    attachUI?: "pause" | "combonumber" | "combo" | "score" | "bar" | "name" | "level";

    /** Decides how scaleX events affect notes. Defaults to 0.
     * 0: none; 1: scale; 2: clip
    */
    scaleOnNotes?: 0 | 1 | 2;
    /** Decides how the line will be displayed when a UI component or any video is attached to it.
     * Color events will override the color defined by these options. Defaults to 0.
     * 0: hidden; 1: white colored; 2: FC/AP colored
     */
    appearanceOnAttach?: 0 | 1 | 2;
    /** Sets the Z index for the object.
     * For a judgeline, this property, if set, overrides the zOrder property,
     * allowing for more control over on which layer the line should be displayed. */
    zIndex?: number;
}

interface JudgeLineDataRPEExtended extends JudgeLineDataRPE {
    _id?: number;
    children: number[]
}

interface CustomEasingData {
    content: string;
    name: string;
    usedBy: string[];
    dependencies: string[];
}


// 使用对应标识符来标记事件节点序列

interface EventLayerDataKPA {
    moveX: string;
    moveY: string;
    rotate: string;
    alpha: string;
    speed: string;
}


interface NoteNodeDataKPA {
    notes: NoteDataKPA[];
    startTime: TimeT;
}

interface NNListDataKPA {
    speed: number;
    medianYOffset: number;
    noteNodes: NoteNodeDataKPA[];
}

interface JudgeLineDataKPA {
    id: number;
    group: number;
    nnLists: {[k: string]: NNListDataKPA};
    hnLists: {[k: string]: NNListDataKPA};
    // Group: number;
    Name: string;
    Texture: string;
    // alphaControl: Array<any>; // ?
    // bpmfactor: 1.0;
    eventLayers: EventLayerDataKPA[];
    children: JudgeLineDataKPA[];
    rotatesWithFather: boolean;
    // extended: {inclineEvents: EventDataRPE[]};
    // father: number;
    // children: number[];
    // isCover: Bool;
    // numOfNotes: number;
    // posControl: any[];
    // sizeControl: any[];
    // skewControl: any[];
    // yControl: any[];
    // zOrder: number;
}



interface EventNodeSequenceDataKPA {
    events: EventDataRPE[];
    id: string;
    type: EventType;
    endValue: number;
}

interface ChartDataKPA {
    version: number;
    offset: number;
    duration: number;
    info: {
        level: string;
        name: string
    };
    ui: {
        pause: number;
        combonumber: number;
        combo: number;
        score: number;
        bar: number;
        name: number;
        level: number;
    }
    envEasings: CustomEasingData[]; // New!
    eventNodeSequences: EventNodeSequenceDataKPA[];
    orphanLines: JudgeLineDataKPA[];
    bpmList: BPMSegmentData[];
    judgeLineGroups: string[];
    chartTime?: number;
    rpeChartTime?: number;
}


